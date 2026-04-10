#!/usr/bin/env bash
###############################################################################
# provision-oracle-ollama.sh — Fully Automated Oracle Cloud ARM + Ollama Setup
###############################################################################
# Run this from your DESKTOP (not mobile). It will:
#   1. Install OCI CLI if missing
#   2. Configure OCI auth (one-time interactive setup)
#   3. Create VCN, subnet, security rules
#   4. Provision an ARM A1.Flex instance (retries on capacity errors)
#   5. SSH in and run setup-ollama-server.sh
#   6. Output the OLLAMA_BASE_URL for your EC2 .env
#
# Usage:
#   bash scripts/provision-oracle-ollama.sh --ec2-ip YOUR_EC2_ELASTIC_IP
#
# First-time setup (one-time, ~5 minutes):
#   bash scripts/provision-oracle-ollama.sh --setup
#
# Resume after capacity retry:
#   bash scripts/provision-oracle-ollama.sh --ec2-ip YOUR_EC2_ELASTIC_IP --resume
#
# Requirements:
#   - macOS or Linux desktop with SSH and curl
#   - Oracle Cloud account (free tier is fine)
#   - Your EC2 elastic IP (for Ollama firewall rules)
###############################################################################

set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "\n${CYAN}━━━ $1 ━━━${NC}\n"; }

# ── State file (tracks progress across retries) ─────────────────────────────
STATE_DIR="$HOME/.oci-ollama-provision"
STATE_FILE="$STATE_DIR/state.json"
SSH_KEY_FILE="$STATE_DIR/ollama-ssh-key"

mkdir -p "$STATE_DIR"

save_state() {
    cat > "$STATE_FILE" << STATEEOF
{
  "compartment_id": "${COMPARTMENT_ID:-}",
  "vcn_id": "${VCN_ID:-}",
  "subnet_id": "${SUBNET_ID:-}",
  "internet_gw_id": "${INTERNET_GW_ID:-}",
  "route_table_id": "${ROUTE_TABLE_ID:-}",
  "security_list_id": "${SECURITY_LIST_ID:-}",
  "instance_id": "${INSTANCE_ID:-}",
  "instance_ip": "${INSTANCE_IP:-}",
  "ec2_ip": "${EC2_IP:-}",
  "region": "${OCI_REGION:-}",
  "ad": "${AD_NAME:-}",
  "image_id": "${IMAGE_ID:-}"
}
STATEEOF
}

load_state() {
    if [ -f "$STATE_FILE" ]; then
        COMPARTMENT_ID=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('compartment_id',''))" 2>/dev/null || true)
        VCN_ID=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('vcn_id',''))" 2>/dev/null || true)
        SUBNET_ID=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('subnet_id',''))" 2>/dev/null || true)
        INTERNET_GW_ID=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('internet_gw_id',''))" 2>/dev/null || true)
        ROUTE_TABLE_ID=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('route_table_id',''))" 2>/dev/null || true)
        SECURITY_LIST_ID=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('security_list_id',''))" 2>/dev/null || true)
        INSTANCE_ID=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('instance_id',''))" 2>/dev/null || true)
        INSTANCE_IP=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('instance_ip',''))" 2>/dev/null || true)
        EC2_IP=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('ec2_ip',''))" 2>/dev/null || true)
        OCI_REGION=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('region',''))" 2>/dev/null || true)
        AD_NAME=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('ad',''))" 2>/dev/null || true)
        IMAGE_ID=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('image_id',''))" 2>/dev/null || true)
        log_ok "Loaded state from previous run"
    fi
}

# ── Parse arguments ──────────────────────────────────────────────────────────
MODE="provision"
EC2_IP=""
RESUME=false
RETRY_MINUTES=120  # how long to retry capacity errors

while [[ $# -gt 0 ]]; do
    case $1 in
        --setup) MODE="setup"; shift ;;
        --ec2-ip) EC2_IP="$2"; shift 2 ;;
        --resume) RESUME=true; shift ;;
        --retry-minutes) RETRY_MINUTES="$2"; shift 2 ;;
        --cleanup) MODE="cleanup"; shift ;;
        --status) MODE="status"; shift ;;
        -h|--help)
            echo "Usage:"
            echo "  First time:  bash $0 --setup"
            echo "  Provision:   bash $0 --ec2-ip YOUR_EC2_IP"
            echo "  Resume:      bash $0 --ec2-ip YOUR_EC2_IP --resume"
            echo "  Status:      bash $0 --status"
            echo "  Cleanup:     bash $0 --cleanup"
            echo ""
            echo "Options:"
            echo "  --retry-minutes N   Max minutes to retry capacity errors (default: 120)"
            exit 0 ;;
        *) log_error "Unknown option: $1"; exit 1 ;;
    esac
done

###############################################################################
# MODE: --setup  (one-time OCI CLI installation + auth config)
###############################################################################
if [ "$MODE" = "setup" ]; then
    log_step "Step 1: Install OCI CLI"

    if command -v oci &>/dev/null; then
        log_ok "OCI CLI already installed: $(oci --version 2>&1 | head -1)"
    else
        log_info "Installing OCI CLI..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            if command -v brew &>/dev/null; then
                brew install oci-cli
            else
                bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)" -- --accept-all-defaults
            fi
        else
            # Linux
            bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)" -- --accept-all-defaults
        fi

        # Add to PATH for this session
        export PATH="$HOME/bin:$PATH"

        if command -v oci &>/dev/null; then
            log_ok "OCI CLI installed: $(oci --version 2>&1 | head -1)"
        else
            log_error "OCI CLI installation failed. Try manually: https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/cliinstall.htm"
            exit 1
        fi
    fi

    log_step "Step 2: Configure OCI Auth"
    echo ""
    echo "This will open an interactive setup wizard. You'll need:"
    echo ""
    echo "  1. Your Oracle Cloud tenancy OCID"
    echo "     → Log in to https://cloud.oracle.com"
    echo "     → Click your profile icon (top right) → Tenancy"
    echo "     → Copy the OCID (starts with ocid1.tenancy...)"
    echo ""
    echo "  2. Your user OCID"
    echo "     → Profile icon → My profile"
    echo "     → Copy the OCID (starts with ocid1.user...)"
    echo ""
    echo "  3. Your region"
    echo "     → It's in the URL, e.g. us-ashburn-1, eu-frankfurt-1"
    echo "     → For best ARM availability, try these regions:"
    echo "       • ca-toronto-1     (Canada)"
    echo "       • eu-amsterdam-1   (Netherlands)"
    echo "       • uk-london-1      (UK)"
    echo "       • ap-sydney-1      (Australia)"
    echo "       • sa-saopaulo-1    (Brazil)"
    echo "       • eu-zurich-1      (Switzerland)"
    echo ""
    echo "  Press Enter to start the OCI setup wizard..."
    read -r

    oci setup config

    # Verify it works
    echo ""
    log_info "Verifying OCI connection..."
    if oci iam region list --output table 2>/dev/null | head -5; then
        log_ok "OCI CLI configured and working!"
    else
        log_error "OCI CLI verification failed. Check your config at ~/.oci/config"
        exit 1
    fi

    # Upload the API key
    echo ""
    log_info "IMPORTANT: You need to upload your API public key to Oracle Cloud."
    echo ""
    echo "  1. Go to: https://cloud.oracle.com → Profile → My profile → API Keys"
    echo "  2. Click 'Add API Key' → 'Paste a public key'"
    echo "  3. Paste the contents of this file:"
    echo ""
    echo "     ~/.oci/oci_api_key_public.pem"
    echo ""
    cat ~/.oci/oci_api_key_public.pem 2>/dev/null || echo "(file not found — check OCI setup output)"
    echo ""
    echo "  4. Click 'Add'"
    echo ""
    echo "Once done, run:"
    echo "  bash scripts/provision-oracle-ollama.sh --ec2-ip YOUR_EC2_IP"
    exit 0
fi

###############################################################################
# MODE: --status  (check current state)
###############################################################################
if [ "$MODE" = "status" ]; then
    if [ -f "$STATE_FILE" ]; then
        echo "Provisioning state:"
        cat "$STATE_FILE" | python3 -m json.tool 2>/dev/null || cat "$STATE_FILE"
    else
        echo "No provisioning state found. Run --setup first, then --ec2-ip."
    fi
    exit 0
fi

###############################################################################
# MODE: --cleanup  (tear down all Oracle Cloud resources)
###############################################################################
if [ "$MODE" = "cleanup" ]; then
    load_state
    log_step "Cleaning up Oracle Cloud resources"

    if [ -n "${INSTANCE_ID:-}" ]; then
        log_info "Terminating instance $INSTANCE_ID..."
        oci compute instance terminate --instance-id "$INSTANCE_ID" --force 2>/dev/null && log_ok "Instance terminated" || log_warn "Instance already gone"
        sleep 10
    fi
    if [ -n "${SUBNET_ID:-}" ]; then
        log_info "Deleting subnet..."
        oci network subnet delete --subnet-id "$SUBNET_ID" --force 2>/dev/null && log_ok "Subnet deleted" || log_warn "Subnet already gone"
        sleep 5
    fi
    if [ -n "${INTERNET_GW_ID:-}" ]; then
        # Clear route table first
        if [ -n "${ROUTE_TABLE_ID:-}" ]; then
            oci network route-table update --rt-id "$ROUTE_TABLE_ID" --route-rules '[]' --force 2>/dev/null || true
            sleep 2
        fi
        log_info "Deleting internet gateway..."
        oci network internet-gateway delete --ig-id "$INTERNET_GW_ID" --force 2>/dev/null && log_ok "Internet gateway deleted" || log_warn "IGW already gone"
        sleep 5
    fi
    if [ -n "${VCN_ID:-}" ]; then
        log_info "Deleting VCN..."
        oci network vcn delete --vcn-id "$VCN_ID" --force 2>/dev/null && log_ok "VCN deleted" || log_warn "VCN already gone"
    fi

    rm -f "$STATE_FILE"
    log_ok "Cleanup complete"
    exit 0
fi

###############################################################################
# MODE: provision  (create everything)
###############################################################################
if [ -z "$EC2_IP" ]; then
    log_error "Usage: bash $0 --ec2-ip YOUR_EC2_ELASTIC_IP"
    log_error "First time? Run: bash $0 --setup"
    exit 1
fi

# Ensure OCI CLI is available
if ! command -v oci &>/dev/null; then
    log_error "OCI CLI not found. Run: bash $0 --setup"
    exit 1
fi

# Verify OCI auth works
if ! oci iam region list > /dev/null 2>&1; then
    log_error "OCI CLI auth failed. Run: bash $0 --setup"
    exit 1
fi

# Load previous state if resuming
if [ "$RESUME" = true ]; then
    load_state
fi
EC2_IP="$EC2_IP"  # override from args

# Get tenancy and region from OCI config
OCI_TENANCY=$(oci iam compartment list --query 'data[0]."compartment-id"' --raw-output 2>/dev/null || true)
if [ -z "$OCI_TENANCY" ]; then
    OCI_TENANCY=$(grep '^tenancy' ~/.oci/config | head -1 | cut -d= -f2 | tr -d ' ')
fi

if [ -z "${OCI_REGION:-}" ]; then
    OCI_REGION=$(grep '^region' ~/.oci/config | head -1 | cut -d= -f2 | tr -d ' ')
fi

log_info "Tenancy: $OCI_TENANCY"
log_info "Region:  $OCI_REGION"
log_info "EC2 IP:  $EC2_IP"

# ── Generate SSH key for the instance ────────────────────────────────────────
if [ ! -f "$SSH_KEY_FILE" ]; then
    log_info "Generating SSH key pair..."
    ssh-keygen -t ed25519 -f "$SSH_KEY_FILE" -N "" -q
    log_ok "SSH key created: $SSH_KEY_FILE"
fi
SSH_PUB_KEY=$(cat "$SSH_KEY_FILE.pub")

# ── Compartment ──────────────────────────────────────────────────────────────
if [ -z "${COMPARTMENT_ID:-}" ]; then
    # Use root compartment (tenancy)
    COMPARTMENT_ID="$OCI_TENANCY"
    log_info "Using root compartment: $COMPARTMENT_ID"
fi

# ── Availability Domain ──────────────────────────────────────────────────────
if [ -z "${AD_NAME:-}" ]; then
    log_step "Finding availability domains"
    AD_NAME=$(oci iam availability-domain list --compartment-id "$COMPARTMENT_ID" --query 'data[0].name' --raw-output)
    log_ok "Using AD: $AD_NAME"
fi

# ── Find Ubuntu 22.04 ARM image ─────────────────────────────────────────────
if [ -z "${IMAGE_ID:-}" ]; then
    log_step "Finding Ubuntu 22.04 ARM image"
    IMAGE_ID=$(oci compute image list \
        --compartment-id "$COMPARTMENT_ID" \
        --operating-system "Canonical Ubuntu" \
        --operating-system-version "22.04" \
        --shape "VM.Standard.A1.Flex" \
        --sort-by TIMECREATED \
        --sort-order DESC \
        --query 'data[0].id' \
        --raw-output 2>/dev/null)

    if [ -z "$IMAGE_ID" ] || [ "$IMAGE_ID" = "null" ]; then
        log_error "Could not find Ubuntu 22.04 ARM image in $OCI_REGION"
        log_error "Try a different region with: oci setup config"
        exit 1
    fi
    log_ok "Image: $IMAGE_ID"
fi
save_state

# ── VCN (Virtual Cloud Network) ─────────────────────────────────────────────
if [ -z "${VCN_ID:-}" ]; then
    log_step "Creating VCN"
    VCN_ID=$(oci network vcn create \
        --compartment-id "$COMPARTMENT_ID" \
        --cidr-block "10.0.0.0/16" \
        --display-name "ollama-vcn" \
        --dns-label "ollamavcn" \
        --query 'data.id' \
        --raw-output)
    log_ok "VCN created: $VCN_ID"
fi
save_state

# ── Internet Gateway ────────────────────────────────────────────────────────
if [ -z "${INTERNET_GW_ID:-}" ]; then
    log_step "Creating Internet Gateway"
    INTERNET_GW_ID=$(oci network internet-gateway create \
        --compartment-id "$COMPARTMENT_ID" \
        --vcn-id "$VCN_ID" \
        --is-enabled true \
        --display-name "ollama-igw" \
        --query 'data.id' \
        --raw-output)
    log_ok "Internet Gateway: $INTERNET_GW_ID"
fi
save_state

# ── Route Table (add default route to internet) ─────────────────────────────
if [ -z "${ROUTE_TABLE_ID:-}" ]; then
    log_step "Configuring route table"
    ROUTE_TABLE_ID=$(oci network vcn get --vcn-id "$VCN_ID" --query 'data."default-route-table-id"' --raw-output)
    oci network route-table update \
        --rt-id "$ROUTE_TABLE_ID" \
        --route-rules "[{\"destination\":\"0.0.0.0/0\",\"destinationType\":\"CIDR_BLOCK\",\"networkEntityId\":\"$INTERNET_GW_ID\"}]" \
        --force > /dev/null
    log_ok "Route table updated with internet route"
fi
save_state

# ── Security List (SSH + Ollama from EC2 only) ──────────────────────────────
if [ -z "${SECURITY_LIST_ID:-}" ]; then
    log_step "Creating security list"
    SECURITY_LIST_ID=$(oci network security-list create \
        --compartment-id "$COMPARTMENT_ID" \
        --vcn-id "$VCN_ID" \
        --display-name "ollama-seclist" \
        --ingress-security-rules "[
            {\"source\":\"0.0.0.0/0\",\"protocol\":\"6\",\"isStateless\":false,\"tcpOptions\":{\"destinationPortRange\":{\"min\":2222,\"max\":2222}},\"description\":\"SSH\"},
            {\"source\":\"$EC2_IP/32\",\"protocol\":\"6\",\"isStateless\":false,\"tcpOptions\":{\"destinationPortRange\":{\"min\":11434,\"max\":11434}},\"description\":\"Ollama from EC2\"}
        ]" \
        --egress-security-rules "[{\"destination\":\"0.0.0.0/0\",\"protocol\":\"all\",\"isStateless\":false}]" \
        --query 'data.id' \
        --raw-output)
    log_ok "Security list created (SSH:2222 + Ollama:11434 from $EC2_IP)"
fi
save_state

# ── Subnet ───────────────────────────────────────────────────────────────────
if [ -z "${SUBNET_ID:-}" ]; then
    log_step "Creating subnet"
    SUBNET_ID=$(oci network subnet create \
        --compartment-id "$COMPARTMENT_ID" \
        --vcn-id "$VCN_ID" \
        --cidr-block "10.0.1.0/24" \
        --display-name "ollama-subnet" \
        --dns-label "ollamasub" \
        --security-list-ids "[\"$SECURITY_LIST_ID\"]" \
        --route-table-id "$ROUTE_TABLE_ID" \
        --query 'data.id' \
        --raw-output)
    log_ok "Subnet created: $SUBNET_ID"
    sleep 5  # wait for subnet to be ready
fi
save_state

# ── Launch ARM Instance (with retry for capacity) ───────────────────────────
if [ -z "${INSTANCE_ID:-}" ]; then
    log_step "Launching ARM A1.Flex instance (4 OCPU, 24GB RAM)"
    log_info "If capacity is unavailable, will retry every 60s for ${RETRY_MINUTES} minutes..."
    echo ""

    RETRY_END=$(($(date +%s) + RETRY_MINUTES * 60))
    ATTEMPT=0

    while true; do
        ATTEMPT=$((ATTEMPT + 1))
        TIMESTAMP=$(date '+%H:%M:%S')

        LAUNCH_RESULT=$(oci compute instance launch \
            --compartment-id "$COMPARTMENT_ID" \
            --availability-domain "$AD_NAME" \
            --shape "VM.Standard.A1.Flex" \
            --shape-config '{"ocpus": 4, "memoryInGBs": 24}' \
            --image-id "$IMAGE_ID" \
            --subnet-id "$SUBNET_ID" \
            --display-name "ollama-server" \
            --assign-public-ip true \
            --metadata "{\"ssh_authorized_keys\": \"$SSH_PUB_KEY\"}" \
            --query 'data.id' \
            --raw-output 2>&1) || true

        if [[ "$LAUNCH_RESULT" == ocid1.instance.* ]]; then
            INSTANCE_ID="$LAUNCH_RESULT"
            log_ok "Instance launched! ID: $INSTANCE_ID"
            break
        fi

        if echo "$LAUNCH_RESULT" | grep -qi "out of.*capacity\|host capacity\|InternalError"; then
            NOW=$(date +%s)
            if [ "$NOW" -ge "$RETRY_END" ]; then
                log_error "Timed out after $RETRY_MINUTES minutes. Capacity unavailable."
                log_info "Resources created so far are saved. Resume with:"
                log_info "  bash $0 --ec2-ip $EC2_IP --resume"
                save_state
                exit 1
            fi
            REMAINING=$(( (RETRY_END - NOW) / 60 ))
            echo -e "  ${YELLOW}[$TIMESTAMP]${NC} Attempt $ATTEMPT — Out of capacity. Retrying in 60s... ($REMAINING min left)"
            sleep 60
        else
            log_error "Launch failed: $LAUNCH_RESULT"
            save_state
            exit 1
        fi
    done
fi
save_state

# ── Wait for instance to be running ─────────────────────────────────────────
log_step "Waiting for instance to start"
for i in $(seq 1 60); do
    STATE=$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output 2>/dev/null || echo "UNKNOWN")
    if [ "$STATE" = "RUNNING" ]; then
        log_ok "Instance is RUNNING"
        break
    fi
    echo "  Waiting... ($STATE)"
    sleep 10
done

# ── Get public IP ────────────────────────────────────────────────────────────
if [ -z "${INSTANCE_IP:-}" ]; then
    log_step "Getting public IP"
    # Get the VNIC attachment
    VNIC_ID=$(oci compute instance list-vnics --instance-id "$INSTANCE_ID" --query 'data[0]."vnic-id"' --raw-output)
    INSTANCE_IP=$(oci network vnic get --vnic-id "$VNIC_ID" --query 'data."public-ip"' --raw-output)
    log_ok "Public IP: $INSTANCE_IP"
fi
save_state

# ── Wait for SSH to be available ─────────────────────────────────────────────
log_step "Waiting for SSH to be available"
for i in $(seq 1 30); do
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "$SSH_KEY_FILE" ubuntu@"$INSTANCE_IP" "echo ok" 2>/dev/null; then
        log_ok "SSH is ready"
        break
    fi
    echo "  Waiting for SSH... (attempt $i/30)"
    sleep 10
done

# ── Copy and run setup-ollama-server.sh ──────────────────────────────────────
log_step "Installing Ollama on the instance"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP_SCRIPT="$SCRIPT_DIR/setup-ollama-server.sh"

if [ ! -f "$SETUP_SCRIPT" ]; then
    log_error "Cannot find setup-ollama-server.sh at $SETUP_SCRIPT"
    log_info "You can SSH in manually and run it:"
    log_info "  ssh -i $SSH_KEY_FILE ubuntu@$INSTANCE_IP"
    save_state
    exit 1
fi

log_info "Copying setup script to instance..."
scp -o StrictHostKeyChecking=no -i "$SSH_KEY_FILE" "$SETUP_SCRIPT" ubuntu@"$INSTANCE_IP":/tmp/setup-ollama-server.sh

log_info "Running setup (this takes 5-15 minutes — pulling 3 models)..."
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY_FILE" ubuntu@"$INSTANCE_IP" "sudo bash /tmp/setup-ollama-server.sh $EC2_IP"

# ── Done! ────────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo -e "  ${GREEN}Oracle Cloud Ollama — Provisioning Complete!${NC}"
echo "============================================================"
echo ""
echo "  Instance IP:    $INSTANCE_IP"
echo "  Ollama URL:     http://$INSTANCE_IP:11434"
echo "  SSH (post-setup): ssh -i $SSH_KEY_FILE -p 2222 deploy@$INSTANCE_IP"
echo ""
echo "  ── Add to your EC2 .env ─────────────────────────────────"
echo ""
echo "  Copy-paste this on EC2 via SSM:"
echo ""
echo "  cd /home/VPS && echo 'OLLAMA_BASE_URL=http://$INSTANCE_IP:11434' | sudo tee -a .env && sudo docker compose restart litellm"
echo ""
echo "  ── Verify from EC2 ──────────────────────────────────────"
echo ""
echo "  curl http://$INSTANCE_IP:11434/api/tags"
echo ""
echo "  ── Manage ───────────────────────────────────────────────"
echo ""
echo "  Status:   bash $0 --status"
echo "  Cleanup:  bash $0 --cleanup    (deletes everything)"
echo "  SSH key:  $SSH_KEY_FILE"
echo ""
echo "============================================================"
save_state
