#!/usr/bin/env bash
###############################################################################
# provision-oracle-arm.sh — Fully Automated Oracle ARM Instance Provisioner
###############################################################################
# Run this on your EC2 server. It will:
#   1. Install OCI CLI (if needed)
#   2. Configure OCI credentials
#   3. Create networking (VCN, subnet, internet gateway, security rules)
#   4. Retry instance creation every 60s until capacity opens up
#   5. Wait for instance to boot
#   6. SSH in and run setup-ollama-server.sh
#   7. Update EC2 .env with OLLAMA_BASE_URL
#   8. Restart the Docker stack
#
# Usage:
#   sudo bash scripts/provision-oracle-arm.sh
#
# Prerequisites:
#   - OCI API private key at /home/VPS/oci_api_key.pem
#   - Run from /home/VPS directory
#
# This script is designed to run unattended — start it and walk away.
# It will retry instance creation indefinitely until capacity opens up.
# Progress is logged to /home/VPS/oracle-provision.log
###############################################################################

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────

# OCI credentials (from your API key config preview)
OCI_USER="ocid1.user.oc1..aaaaaaaat2mw5f3sxvlwcnqv6gizayboosqkq4ihrc7ukc7np3w5rtj5ky5a"
OCI_FINGERPRINT="18:64:d7:eb:27:cf:7f:2d:f8:cb:93:92:24:cb:a1:c2"
OCI_TENANCY="ocid1.tenancy.oc1..aaaaaaaa7skrn7sa5tbenz745ooy42uq6puv62xjnwen5zg6swhzdnkasgua"
OCI_REGION="us-ashburn-1"
OCI_KEY_FILE="/home/VPS/oci_api_key.pem"

# Instance configuration (free tier maximums)
SHAPE="VM.Standard.A1.Flex"
OCPUS=4
MEMORY_GB=24
BOOT_VOLUME_GB=200
IMAGE_OCID="ocid1.image.oc1.iad.aaaaaaaa2qup33kak66ll3loslunng52zk5haq4pggre5gg7y3snr5wh55rq"
# Ubuntu 22.04 aarch64 (2025.07.24)

# EC2 details
EC2_IP="13.222.43.154"
VPS_DIR="/home/VPS"
ENV_FILE="$VPS_DIR/.env"
LOG_FILE="$VPS_DIR/oracle-provision.log"
SSH_KEY_FILE="$VPS_DIR/oracle-instance-key"

# Retry settings
RETRY_INTERVAL=60  # seconds between instance creation attempts
MAX_RETRIES=1440   # 24 hours of retries at 60s intervals

# ── Logging ───────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo -e "$msg" | tee -a "$LOG_FILE"
}
log_info()  { log "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { log "${GREEN}[OK]${NC}    $1"; }
log_warn()  { log "${YELLOW}[WARN]${NC}  $1"; }
log_error() { log "${RED}[ERROR]${NC} $1"; }

# Initialize log
echo "" > "$LOG_FILE"
log_info "Oracle ARM Auto-Provisioner started"
log_info "Log file: $LOG_FILE"

###############################################################################
# 1. Validate prerequisites
###############################################################################
log_info "Checking prerequisites..."

if [ ! -f "$OCI_KEY_FILE" ]; then
    log_error "OCI API key not found at $OCI_KEY_FILE"
    log_error "Copy your .pem file there first:"
    log_error "  cp /path/to/your-api-key.pem $OCI_KEY_FILE"
    exit 1
fi
chmod 600 "$OCI_KEY_FILE"
log_ok "OCI API key found"

###############################################################################
# 2. Install OCI CLI (if needed)
###############################################################################
# Check known install locations first (sudo may not inherit PATH)
for p in "$HOME/bin/oci" "/root/bin/oci" "/home/deploy/bin/oci" "/usr/local/bin/oci" \
         "$HOME/lib/oracle-cli/bin/oci" "/root/lib/oracle-cli/bin/oci"; do
    if [ -x "$p" ]; then
        export PATH="$(dirname "$p"):$PATH"
        break
    fi
done

if command -v oci &>/dev/null; then
    log_ok "OCI CLI already installed: $(oci --version 2>&1 | head -1)"
else
    log_info "Installing OCI CLI..."
    # Non-interactive install — remove stale dirs first
    for d in "$HOME/lib/oracle-cli" "/root/lib/oracle-cli" "/home/deploy/lib/oracle-cli"; do
        [ -d "$d" ] && rm -rf "$d"
    done

    curl -fsSL https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh | \
        bash -s -- --accept-all-defaults

    # Add to PATH for this session
    export PATH="$HOME/bin:$PATH"
    if [ -f "$HOME/.bashrc" ]; then
        source "$HOME/.bashrc" 2>/dev/null || true
    fi

    if ! command -v oci &>/dev/null; then
        for p in "$HOME/bin/oci" "/root/bin/oci" "/usr/local/bin/oci"; do
            if [ -x "$p" ]; then
                export PATH="$(dirname "$p"):$PATH"
                break
            fi
        done
    fi

    if command -v oci &>/dev/null; then
        log_ok "OCI CLI installed: $(oci --version 2>&1 | head -1)"
    else
        log_error "OCI CLI installation failed. Install manually:"
        log_error "  bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)\" -- --accept-all-defaults"
        exit 1
    fi
fi

###############################################################################
# 3. Configure OCI CLI
###############################################################################
log_info "Configuring OCI CLI..."

mkdir -p "$HOME/.oci"
cat > "$HOME/.oci/config" << OCIEOF
[DEFAULT]
user=$OCI_USER
fingerprint=$OCI_FINGERPRINT
tenancy=$OCI_TENANCY
region=$OCI_REGION
key_file=$OCI_KEY_FILE
OCIEOF
chmod 600 "$HOME/.oci/config"
log_ok "OCI CLI configured"

# Quick validation
log_info "Validating OCI credentials..."
if oci iam region list --output table 2>/dev/null | grep -q "$OCI_REGION"; then
    log_ok "OCI credentials valid"
else
    log_error "OCI credential validation failed. Check your API key and config."
    exit 1
fi

###############################################################################
# 4. Generate SSH key for Oracle instance
###############################################################################
if [ -f "$SSH_KEY_FILE" ]; then
    log_warn "SSH key already exists at $SSH_KEY_FILE — reusing"
else
    log_info "Generating SSH keypair for Oracle instance..."
    ssh-keygen -t ed25519 -f "$SSH_KEY_FILE" -N "" -C "oracle-arm-ollama"
    log_ok "SSH keypair generated: $SSH_KEY_FILE"
fi
SSH_PUBLIC_KEY=$(cat "${SSH_KEY_FILE}.pub")

###############################################################################
# 5. Get compartment (use root compartment = tenancy)
###############################################################################
COMPARTMENT_ID="$OCI_TENANCY"
log_info "Using root compartment: $COMPARTMENT_ID"

###############################################################################
# 6. Get Availability Domain
###############################################################################
log_info "Fetching availability domains..."
AD_NAME=$(oci iam availability-domain list \
    --compartment-id "$COMPARTMENT_ID" \
    --query 'data[0].name' \
    --raw-output 2>/dev/null)

if [ -z "$AD_NAME" ] || [ "$AD_NAME" = "null" ]; then
    log_error "Failed to fetch availability domains"
    exit 1
fi
log_ok "Availability Domain: $AD_NAME"

# Get all ADs for fallback
ALL_ADS=$(oci iam availability-domain list \
    --compartment-id "$COMPARTMENT_ID" \
    --query 'data[*].name' \
    --raw-output 2>/dev/null)
log_info "All ADs available: $ALL_ADS"

###############################################################################
# 7. Create or find VCN
###############################################################################
log_info "Checking for existing VCN..."
EXISTING_VCN=$(oci network vcn list \
    --compartment-id "$COMPARTMENT_ID" \
    --query 'data[?contains("display-name", `ollama`) || contains("display-name", `Ollama`)].id | [0]' \
    --raw-output 2>/dev/null || echo "null")

if [ "$EXISTING_VCN" != "null" ] && [ -n "$EXISTING_VCN" ]; then
    VCN_ID="$EXISTING_VCN"
    log_ok "Found existing VCN: $VCN_ID"
else
    log_info "Creating VCN..."
    VCN_ID=$(oci network vcn create \
        --compartment-id "$COMPARTMENT_ID" \
        --display-name "ollama-vcn" \
        --cidr-blocks '["10.0.0.0/16"]' \
        --dns-label "ollamavcn" \
        --query 'data.id' \
        --raw-output 2>/dev/null)

    if [ -z "$VCN_ID" ] || [ "$VCN_ID" = "null" ]; then
        log_error "Failed to create VCN"
        exit 1
    fi
    log_ok "VCN created: $VCN_ID"
fi

###############################################################################
# 8. Create Internet Gateway (if needed)
###############################################################################
log_info "Checking for internet gateway..."
IGW_ID=$(oci network internet-gateway list \
    --compartment-id "$COMPARTMENT_ID" \
    --vcn-id "$VCN_ID" \
    --query 'data[0].id' \
    --raw-output 2>/dev/null || echo "null")

if [ "$IGW_ID" != "null" ] && [ -n "$IGW_ID" ]; then
    log_ok "Found existing internet gateway: $IGW_ID"
else
    log_info "Creating internet gateway..."
    IGW_ID=$(oci network internet-gateway create \
        --compartment-id "$COMPARTMENT_ID" \
        --vcn-id "$VCN_ID" \
        --display-name "ollama-igw" \
        --is-enabled true \
        --query 'data.id' \
        --raw-output 2>/dev/null)
    log_ok "Internet gateway created: $IGW_ID"
fi

###############################################################################
# 9. Create/Update Route Table
###############################################################################
log_info "Configuring route table..."
RT_ID=$(oci network route-table list \
    --compartment-id "$COMPARTMENT_ID" \
    --vcn-id "$VCN_ID" \
    --query 'data[0].id' \
    --raw-output 2>/dev/null)

if [ -n "$RT_ID" ] && [ "$RT_ID" != "null" ]; then
    oci network route-table update \
        --rt-id "$RT_ID" \
        --route-rules "[{\"destination\": \"0.0.0.0/0\", \"destinationType\": \"CIDR_BLOCK\", \"networkEntityId\": \"$IGW_ID\"}]" \
        --force 2>/dev/null
    log_ok "Route table updated: $RT_ID"
else
    log_error "No route table found in VCN"
    exit 1
fi

###############################################################################
# 10. Create Security List
###############################################################################
log_info "Checking for security list..."
SL_ID=$(oci network security-list list \
    --compartment-id "$COMPARTMENT_ID" \
    --vcn-id "$VCN_ID" \
    --query 'data[0].id' \
    --raw-output 2>/dev/null)

if [ -n "$SL_ID" ] && [ "$SL_ID" != "null" ]; then
    log_info "Updating security list with SSH + Ollama rules..."
    oci network security-list update \
        --security-list-id "$SL_ID" \
        --ingress-security-rules "[
            {\"source\": \"0.0.0.0/0\", \"protocol\": \"6\", \"isStateless\": false, \"tcpOptions\": {\"destinationPortRange\": {\"min\": 22, \"max\": 22}}},
            {\"source\": \"0.0.0.0/0\", \"protocol\": \"6\", \"isStateless\": false, \"tcpOptions\": {\"destinationPortRange\": {\"min\": 2222, \"max\": 2222}}},
            {\"source\": \"$EC2_IP/32\", \"protocol\": \"6\", \"isStateless\": false, \"tcpOptions\": {\"destinationPortRange\": {\"min\": 11434, \"max\": 11434}}}
        ]" \
        --egress-security-rules "[
            {\"destination\": \"0.0.0.0/0\", \"protocol\": \"all\", \"isStateless\": false}
        ]" \
        --force 2>/dev/null
    log_ok "Security list updated: $SL_ID"
else
    log_error "No security list found in VCN"
    exit 1
fi

###############################################################################
# 11. Create Subnet (if needed)
###############################################################################
log_info "Checking for public subnet..."
SUBNET_ID=$(oci network subnet list \
    --compartment-id "$COMPARTMENT_ID" \
    --vcn-id "$VCN_ID" \
    --query 'data[?contains("display-name", `public`) || contains("display-name", `Public`) || contains("display-name", `ollama`)].id | [0]' \
    --raw-output 2>/dev/null || echo "null")

if [ "$SUBNET_ID" != "null" ] && [ -n "$SUBNET_ID" ]; then
    log_ok "Found existing subnet: $SUBNET_ID"
else
    log_info "Creating public subnet..."
    SUBNET_ID=$(oci network subnet create \
        --compartment-id "$COMPARTMENT_ID" \
        --vcn-id "$VCN_ID" \
        --display-name "ollama-public-subnet" \
        --cidr-block "10.0.0.0/24" \
        --dns-label "ollamasub" \
        --route-table-id "$RT_ID" \
        --security-list-ids "[\"$SL_ID\"]" \
        --query 'data.id' \
        --raw-output 2>/dev/null)

    if [ -z "$SUBNET_ID" ] || [ "$SUBNET_ID" = "null" ]; then
        log_error "Failed to create subnet"
        exit 1
    fi
    log_ok "Subnet created: $SUBNET_ID"
fi

###############################################################################
# 12. Retry Instance Creation Until Capacity Opens Up
###############################################################################
echo ""
log_info "============================================================"
log_info "  Starting instance creation retry loop"
log_info "  Shape: $SHAPE ($OCPUS OCPUs, ${MEMORY_GB}GB RAM)"
log_info "  Retrying every ${RETRY_INTERVAL}s (max ${MAX_RETRIES} attempts = 24h)"
log_info "  You can safely close this terminal — check $LOG_FILE for progress"
log_info "============================================================"
echo ""

INSTANCE_ID=""
ATTEMPT=0

# Try each AD in rotation
AD_INDEX=0
readarray -t AD_ARRAY < <(echo "$ALL_ADS" | tr -d '[]"' | tr ',' '\n' | sed 's/^ *//')

while [ -z "$INSTANCE_ID" ] && [ $ATTEMPT -lt $MAX_RETRIES ]; do
    ATTEMPT=$((ATTEMPT + 1))

    # Rotate through availability domains
    CURRENT_AD="${AD_ARRAY[$AD_INDEX]}"
    AD_INDEX=$(( (AD_INDEX + 1) % ${#AD_ARRAY[@]} ))

    log_info "Attempt $ATTEMPT/$MAX_RETRIES — AD: $CURRENT_AD"

    RESULT=$(oci compute instance launch \
        --compartment-id "$COMPARTMENT_ID" \
        --availability-domain "$CURRENT_AD" \
        --shape "$SHAPE" \
        --shape-config "{\"ocpus\": $OCPUS, \"memoryInGBs\": $MEMORY_GB}" \
        --image-id "$IMAGE_OCID" \
        --subnet-id "$SUBNET_ID" \
        --display-name "ollama-arm-server" \
        --assign-public-ip true \
        --boot-volume-size-in-gbs "$BOOT_VOLUME_GB" \
        --metadata "{\"ssh_authorized_keys\": \"$SSH_PUBLIC_KEY\"}" \
        --query 'data.id' \
        --raw-output 2>&1) || true

    if [[ "$RESULT" == ocid1.instance* ]]; then
        INSTANCE_ID="$RESULT"
        log_ok "Instance created! ID: $INSTANCE_ID"
    elif echo "$RESULT" | grep -qi "out of.*capacity\|InternalError\|LimitExceeded\|capacity"; then
        log_warn "Out of capacity in $CURRENT_AD — retrying in ${RETRY_INTERVAL}s..."
        sleep "$RETRY_INTERVAL"
    elif echo "$RESULT" | grep -qi "limit\|quota\|exceeded"; then
        log_warn "Limit/quota issue: $(echo "$RESULT" | head -1) — retrying in ${RETRY_INTERVAL}s..."
        sleep "$RETRY_INTERVAL"
    else
        log_warn "Unexpected response: $(echo "$RESULT" | head -3) — retrying in ${RETRY_INTERVAL}s..."
        sleep "$RETRY_INTERVAL"
    fi
done

if [ -z "$INSTANCE_ID" ]; then
    log_error "Failed to create instance after $MAX_RETRIES attempts"
    exit 1
fi

###############################################################################
# 13. Wait for Instance to be Running
###############################################################################
log_info "Waiting for instance to reach RUNNING state..."
for i in $(seq 1 60); do
    STATE=$(oci compute instance get \
        --instance-id "$INSTANCE_ID" \
        --query 'data."lifecycle-state"' \
        --raw-output 2>/dev/null || echo "UNKNOWN")

    if [ "$STATE" = "RUNNING" ]; then
        log_ok "Instance is RUNNING"
        break
    fi
    log_info "  State: $STATE (waiting 30s...)"
    sleep 30
done

###############################################################################
# 14. Get Public IP
###############################################################################
log_info "Fetching public IP..."

# Get VNIC attachment
VNIC_ID=""
for i in $(seq 1 10); do
    VNIC_ID=$(oci compute vnic-attachment list \
        --compartment-id "$COMPARTMENT_ID" \
        --instance-id "$INSTANCE_ID" \
        --query 'data[0]."vnic-id"' \
        --raw-output 2>/dev/null || echo "null")

    if [ "$VNIC_ID" != "null" ] && [ -n "$VNIC_ID" ]; then
        break
    fi
    sleep 10
done

if [ "$VNIC_ID" = "null" ] || [ -z "$VNIC_ID" ]; then
    log_error "Could not find VNIC for instance"
    exit 1
fi

ORACLE_IP=$(oci network vnic get \
    --vnic-id "$VNIC_ID" \
    --query 'data."public-ip"' \
    --raw-output 2>/dev/null)

if [ -z "$ORACLE_IP" ] || [ "$ORACLE_IP" = "null" ]; then
    log_error "Instance has no public IP"
    exit 1
fi

log_ok "Oracle instance public IP: $ORACLE_IP"

###############################################################################
# 15. Wait for SSH to be ready
###############################################################################
log_info "Waiting for SSH to be available (this can take 2-5 minutes)..."
for i in $(seq 1 30); do
    if ssh -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
        ubuntu@"$ORACLE_IP" "echo ssh-ready" 2>/dev/null | grep -q "ssh-ready"; then
        log_ok "SSH is ready"
        break
    fi
    log_info "  SSH not ready yet (attempt $i/30, waiting 20s...)"
    sleep 20
done

###############################################################################
# 16. Copy and run setup script on Oracle instance
###############################################################################
log_info "Copying setup script to Oracle instance..."
scp -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no \
    "$VPS_DIR/scripts/setup-ollama-server.sh" \
    ubuntu@"$ORACLE_IP":/tmp/setup-ollama-server.sh

log_info "Running setup-ollama-server.sh on Oracle instance (this takes 15-20 min)..."
ssh -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no \
    ubuntu@"$ORACLE_IP" \
    "sudo bash /tmp/setup-ollama-server.sh $EC2_IP" 2>&1 | tee -a "$LOG_FILE"

log_ok "Ollama setup complete on Oracle instance"

###############################################################################
# 17. Verify Ollama is reachable from EC2
###############################################################################
log_info "Verifying Ollama is reachable from EC2..."
for i in $(seq 1 10); do
    if curl -sf "http://$ORACLE_IP:11434/api/tags" > /dev/null 2>&1; then
        log_ok "Ollama is reachable at http://$ORACLE_IP:11434"
        break
    fi
    log_warn "  Ollama not reachable yet (attempt $i/10, waiting 15s...)"
    sleep 15
done

###############################################################################
# 18. Update EC2 .env with OLLAMA_BASE_URL
###############################################################################
log_info "Updating EC2 .env..."
if grep -q "^OLLAMA_BASE_URL=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^OLLAMA_BASE_URL=.*|OLLAMA_BASE_URL=http://$ORACLE_IP:11434|" "$ENV_FILE"
    log_ok "Updated existing OLLAMA_BASE_URL in .env"
else
    echo "OLLAMA_BASE_URL=http://$ORACLE_IP:11434" >> "$ENV_FILE"
    log_ok "Added OLLAMA_BASE_URL to .env"
fi

###############################################################################
# 19. Restart Docker stack
###############################################################################
log_info "Restarting Docker stack to pick up new OLLAMA_BASE_URL..."
cd "$VPS_DIR"
docker compose down 2>&1 | tee -a "$LOG_FILE"
docker compose up -d 2>&1 | tee -a "$LOG_FILE"
log_ok "Docker stack restarted"

###############################################################################
# Done!
###############################################################################
echo ""
echo "============================================================"
log_ok "ORACLE ARM PROVISIONING COMPLETE!"
echo "============================================================"
echo ""
echo "  Oracle Instance IP:  $ORACLE_IP"
echo "  Instance ID:         $INSTANCE_ID"
echo "  Ollama URL:          http://$ORACLE_IP:11434"
echo "  SSH access:          ssh -i $SSH_KEY_FILE -p 2222 deploy@$ORACLE_IP"
echo ""
echo "  EC2 .env updated:    OLLAMA_BASE_URL=http://$ORACLE_IP:11434"
echo "  Docker stack:        Restarted with Ollama models available"
echo ""
echo "  Models available:    qwen3.5:9b, qwen3:14b, qwen3-coder:30b"
echo ""
echo "  Full log:            $LOG_FILE"
echo ""
echo "============================================================"
