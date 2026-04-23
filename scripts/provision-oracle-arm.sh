#!/usr/bin/env bash
###############################################################################
# provision-oracle-arm.sh — Oracle ARM Auto-Provisioner (4 OCPU / 24GB)
###############################################################################
# Provisions a full Oracle Cloud Always Free ARM instance:
#   - VM.Standard.A1.Flex: 4 OCPUs, 24GB RAM, 200GB boot volume
#   - Ubuntu 22.04 aarch64
#   - VCN + subnet + internet gateway + security list (ports 22, 80, 443, 2222)
#   - Retries every 20s across all ADs until capacity opens (up to 24h)
#
# Run from EC2 or any machine with the OCI API key:
#   bash scripts/provision-oracle-arm.sh
#
# Prerequisites:
#   - OCI API private key at ./oci_api_key.pem
#   - OCI credentials filled in below (user, fingerprint, tenancy, region)
#
# After provisioning completes:
#   1. Update ORACLE_ARM_IP in .env with the printed IP
#   2. Copy oracle-instance-key to your deployment machine
#   3. Run: bash scripts/deploy-oracle.sh
#
# This script runs unattended — start it and walk away.
# Progress is logged to ./oracle-provision.log
###############################################################################

set -euo pipefail

# ── OCI Credentials — fill these in before running ────────────────────────────
# Find these in Oracle Cloud Console → Profile → API keys
OCI_USER="ocid1.user.oc1..aaaaaaaat2mw5f3sxvlwcnqv6gizayboosqkq4ihrc7ukc7np3w5rtj5ky5a"
OCI_FINGERPRINT="18:64:d7:eb:27:cf:7f:2d:f8:cb:93:92:24:cb:a1:c2"
OCI_TENANCY="ocid1.tenancy.oc1..aaaaaaaa7skrn7sa5tbenz745ooy42uq6puv62xjnwen5zg6swhzdnkasgua"
OCI_REGION="us-ashburn-1"
OCI_KEY_FILE="${OCI_KEY_FILE:-./oci_api_key.pem}"

# ── Instance Configuration ─────────────────────────────────────────────────────
# Oracle Always Free: 4 OCPUs + 24GB RAM total — use it all on one instance
SHAPE="VM.Standard.A1.Flex"
OCPUS=4
MEMORY_GB=24
BOOT_VOLUME_GB=200

# Ubuntu 22.04 aarch64 — Ashburn (us-ashburn-1)
# Update this OCID if Oracle releases a newer Ubuntu image in your region:
#   oci compute image list --compartment-id <tenancy> --operating-system "Canonical Ubuntu" --shape VM.Standard.A1.Flex
IMAGE_OCID="ocid1.image.oc1.iad.aaaaaaaa2qup33kak66ll3loslunng52zk5haq4pggre5gg7y3snr5wh55rq"

# ── Local Paths ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$REPO_DIR/oracle-provision.log"
SSH_KEY_FILE="$REPO_DIR/oracle-instance-key"

# ── Retry Settings ─────────────────────────────────────────────────────────────
RETRY_INTERVAL=20   # seconds between full AD rotation cycles
MAX_RETRIES=4320    # 24 hours at 20s intervals

# ── Colors ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()       { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"; }
log_info()  { log "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { log "${GREEN}[OK]${NC}    $1"; }
log_warn()  { log "${YELLOW}[WARN]${NC}  $1"; }
log_error() { log "${RED}[ERROR]${NC} $1"; }

echo "" > "$LOG_FILE"
log_info "Oracle ARM Provisioner — 4 OCPU / 24GB / 200GB"
log_info "Log: $LOG_FILE"

###############################################################################
# 1. Validate prerequisites
###############################################################################
if [ ! -f "$OCI_KEY_FILE" ]; then
    log_error "OCI API key not found: $OCI_KEY_FILE"
    log_error "Download your API key from Oracle Cloud → Profile → API keys"
    exit 1
fi
chmod 600 "$OCI_KEY_FILE"
log_ok "OCI API key found"

###############################################################################
# 2. Install OCI CLI (if needed)
###############################################################################
for p in "$HOME/bin/oci" "/root/bin/oci" "/home/deploy/bin/oci" "/usr/local/bin/oci" \
         "$HOME/lib/oracle-cli/bin/oci" "/root/lib/oracle-cli/bin/oci"; do
    [ -x "$p" ] && export PATH="$(dirname "$p"):$PATH" && break
done

if command -v oci &>/dev/null; then
    log_ok "OCI CLI: $(oci --version 2>&1 | head -1)"
else
    log_info "Installing OCI CLI..."
    for d in "$HOME/lib/oracle-cli" "/root/lib/oracle-cli" "/home/deploy/lib/oracle-cli"; do
        [ -d "$d" ] && rm -rf "$d"
    done
    curl -fsSL https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh | \
        bash -s -- --accept-all-defaults
    export PATH="$HOME/bin:$PATH"
    [ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc" 2>/dev/null || true
    for p in "$HOME/bin/oci" "/root/bin/oci" "/usr/local/bin/oci"; do
        [ -x "$p" ] && export PATH="$(dirname "$p"):$PATH" && break
    done
    command -v oci &>/dev/null || { log_error "OCI CLI install failed"; exit 1; }
    log_ok "OCI CLI installed"
fi

###############################################################################
# 3. Configure OCI CLI
###############################################################################
mkdir -p "$HOME/.oci"
cat > "$HOME/.oci/config" <<OCIEOF
[DEFAULT]
user=$OCI_USER
fingerprint=$OCI_FINGERPRINT
tenancy=$OCI_TENANCY
region=$OCI_REGION
key_file=$OCI_KEY_FILE
OCIEOF
chmod 600 "$HOME/.oci/config"

log_info "Validating OCI credentials..."
if ! oci iam region list --output table 2>/dev/null | grep -q "$OCI_REGION"; then
    log_error "OCI credential validation failed — check your API key and OCIDs"
    exit 1
fi
log_ok "OCI credentials valid"

###############################################################################
# 4. Generate SSH key
###############################################################################
if [ -f "$SSH_KEY_FILE" ] && [ -s "$SSH_KEY_FILE" ]; then
    log_warn "SSH key exists at $SSH_KEY_FILE — reusing"
else
    log_info "Generating SSH keypair..."
    ssh-keygen -t ed25519 -f "$SSH_KEY_FILE" -N "" -C "oracle-arm"
    log_ok "SSH keypair generated: $SSH_KEY_FILE"
fi
SSH_PUBLIC_KEY=$(cat "${SSH_KEY_FILE}.pub")

###############################################################################
# 5. Compartment + Availability Domains
###############################################################################
COMPARTMENT_ID="$OCI_TENANCY"

log_info "Fetching availability domains..."
ALL_ADS=$(oci iam availability-domain list \
    --compartment-id "$COMPARTMENT_ID" \
    --query 'data[*].name' \
    --raw-output 2>/dev/null)
log_info "Available ADs: $ALL_ADS"

###############################################################################
# 6. VCN
###############################################################################
log_info "Checking for existing VCN..."
VCN_ID=$(oci network vcn list \
    --compartment-id "$COMPARTMENT_ID" \
    --query 'data[?contains("display-name", `ollama`) || contains("display-name", `Ollama`) || contains("display-name", `ai-hub`)].id | [0]' \
    --raw-output 2>/dev/null || echo "null")

if [ "$VCN_ID" != "null" ] && [ -n "$VCN_ID" ]; then
    log_ok "Reusing existing VCN: $VCN_ID"
else
    log_info "Creating VCN..."
    VCN_ID=$(oci network vcn create \
        --compartment-id "$COMPARTMENT_ID" \
        --display-name "ollama-vcn" \
        --cidr-blocks '["10.0.0.0/16"]' \
        --dns-label "ollamavcn" \
        --query 'data.id' \
        --raw-output 2>/dev/null)
    [ -z "$VCN_ID" ] || [ "$VCN_ID" = "null" ] && { log_error "VCN create failed"; exit 1; }
    log_ok "VCN created: $VCN_ID"
fi

###############################################################################
# 7. Internet Gateway
###############################################################################
log_info "Checking for internet gateway..."
IGW_ID=$(oci network internet-gateway list \
    --compartment-id "$COMPARTMENT_ID" \
    --vcn-id "$VCN_ID" \
    --query 'data[0].id' \
    --raw-output 2>/dev/null || echo "null")

if [ "$IGW_ID" != "null" ] && [ -n "$IGW_ID" ]; then
    log_ok "Reusing existing internet gateway: $IGW_ID"
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
# 8. Route Table
###############################################################################
log_info "Configuring route table..."
RT_ID=$(oci network route-table list \
    --compartment-id "$COMPARTMENT_ID" \
    --vcn-id "$VCN_ID" \
    --query 'data[0].id' \
    --raw-output 2>/dev/null)
[ -z "$RT_ID" ] || [ "$RT_ID" = "null" ] && { log_error "No route table found"; exit 1; }

oci network route-table update \
    --rt-id "$RT_ID" \
    --route-rules "[{\"destination\": \"0.0.0.0/0\", \"destinationType\": \"CIDR_BLOCK\", \"networkEntityId\": \"$IGW_ID\"}]" \
    --force 2>/dev/null
log_ok "Route table updated"

###############################################################################
# 9. Security List — open 22, 80, 443, 2222 from anywhere
#    (Baked in from the start — avoids manual port opening later)
###############################################################################
log_info "Configuring security list (ports 22, 80, 443, 2222)..."
SL_ID=$(oci network security-list list \
    --compartment-id "$COMPARTMENT_ID" \
    --vcn-id "$VCN_ID" \
    --query 'data[0].id' \
    --raw-output 2>/dev/null)
[ -z "$SL_ID" ] || [ "$SL_ID" = "null" ] && { log_error "No security list found"; exit 1; }

oci network security-list update \
    --security-list-id "$SL_ID" \
    --ingress-security-rules "[
        {\"source\": \"0.0.0.0/0\", \"protocol\": \"6\", \"isStateless\": false,
         \"tcpOptions\": {\"destinationPortRange\": {\"min\": 22, \"max\": 22}}},
        {\"source\": \"0.0.0.0/0\", \"protocol\": \"6\", \"isStateless\": false,
         \"tcpOptions\": {\"destinationPortRange\": {\"min\": 80, \"max\": 80}}},
        {\"source\": \"0.0.0.0/0\", \"protocol\": \"6\", \"isStateless\": false,
         \"tcpOptions\": {\"destinationPortRange\": {\"min\": 443, \"max\": 443}}},
        {\"source\": \"0.0.0.0/0\", \"protocol\": \"6\", \"isStateless\": false,
         \"tcpOptions\": {\"destinationPortRange\": {\"min\": 2222, \"max\": 2222}}},
        {\"source\": \"0.0.0.0/0\", \"protocol\": \"1\", \"isStateless\": false,
         \"icmpOptions\": {\"type\": 3, \"code\": 4}}
    ]" \
    --egress-security-rules "[
        {\"destination\": \"0.0.0.0/0\", \"protocol\": \"all\", \"isStateless\": false}
    ]" \
    --force 2>/dev/null
log_ok "Security list updated: ports 22, 80, 443, 2222 open"

###############################################################################
# 10. Subnet
###############################################################################
log_info "Checking for public subnet..."
SUBNET_ID=$(oci network subnet list \
    --compartment-id "$COMPARTMENT_ID" \
    --vcn-id "$VCN_ID" \
    --query 'data[0].id' \
    --raw-output 2>/dev/null || echo "null")

if [ "$SUBNET_ID" != "null" ] && [ -n "$SUBNET_ID" ]; then
    log_ok "Reusing existing subnet: $SUBNET_ID"
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
    [ -z "$SUBNET_ID" ] || [ "$SUBNET_ID" = "null" ] && { log_error "Subnet create failed"; exit 1; }
    log_ok "Subnet created: $SUBNET_ID"
fi

###############################################################################
# 11. Retry Instance Creation Until Capacity Opens
###############################################################################
echo ""
log_info "============================================================"
log_info "  Launching: $SHAPE — $OCPUS OCPUs / ${MEMORY_GB}GB / ${BOOT_VOLUME_GB}GB"
log_info "  Retrying every ${RETRY_INTERVAL}s across all ADs (max 24h)"
log_info "  Safe to close terminal — tail -f $LOG_FILE to monitor"
log_info "============================================================"
echo ""

INSTANCE_ID=""
ATTEMPT=0

readarray -t AD_ARRAY < <(echo "$ALL_ADS" | tr -d '[]"' | tr ',' '\n' | sed 's/^ *//' | grep -v '^$')
AD_COUNT=${#AD_ARRAY[@]}

while [ -z "$INSTANCE_ID" ] && [ "$ATTEMPT" -lt "$MAX_RETRIES" ]; do
    for CURRENT_AD in "${AD_ARRAY[@]}"; do
        [ -n "$INSTANCE_ID" ] && break
        ATTEMPT=$((ATTEMPT + 1))
        log_info "Attempt $ATTEMPT — AD: $CURRENT_AD"

        RESULT=$(oci compute instance launch \
            --compartment-id "$COMPARTMENT_ID" \
            --availability-domain "$CURRENT_AD" \
            --shape "$SHAPE" \
            --shape-config "{\"ocpus\": $OCPUS, \"memoryInGBs\": $MEMORY_GB}" \
            --image-id "$IMAGE_OCID" \
            --subnet-id "$SUBNET_ID" \
            --display-name "ai-hub-arm" \
            --assign-public-ip true \
            --boot-volume-size-in-gbs "$BOOT_VOLUME_GB" \
            --metadata "{\"ssh_authorized_keys\": \"$SSH_PUBLIC_KEY\"}" \
            --query 'data.id' \
            --raw-output 2>&1) || true

        if [[ "$RESULT" == ocid1.instance* ]]; then
            INSTANCE_ID="$RESULT"
            log_ok "Instance created: $INSTANCE_ID"
        elif echo "$RESULT" | grep -qi "capacity\|InternalError\|LimitExceeded"; then
            log_warn "No capacity in $CURRENT_AD"
        elif echo "$RESULT" | grep -qi "limit\|quota"; then
            log_warn "Limit: $(echo "$RESULT" | head -1)"
        else
            log_warn "Response: $(echo "$RESULT" | head -2)"
        fi
    done

    if [ -z "$INSTANCE_ID" ]; then
        log_info "All $AD_COUNT ADs exhausted — waiting ${RETRY_INTERVAL}s..."
        sleep "$RETRY_INTERVAL"
    fi
done

[ -z "$INSTANCE_ID" ] && { log_error "Failed after $MAX_RETRIES attempts"; exit 1; }

###############################################################################
# 12. Wait for RUNNING state
###############################################################################
log_info "Waiting for instance to reach RUNNING state..."
for i in $(seq 1 60); do
    STATE=$(oci compute instance get \
        --instance-id "$INSTANCE_ID" \
        --query 'data."lifecycle-state"' \
        --raw-output 2>/dev/null || echo "UNKNOWN")
    [ "$STATE" = "RUNNING" ] && { log_ok "Instance RUNNING"; break; }
    log_info "  State: $STATE (waiting 30s...)"
    sleep 30
done

###############################################################################
# 13. Get Public IP
###############################################################################
log_info "Fetching public IP..."
VNIC_ID=""
for i in $(seq 1 10); do
    VNIC_ID=$(oci compute vnic-attachment list \
        --compartment-id "$COMPARTMENT_ID" \
        --instance-id "$INSTANCE_ID" \
        --query 'data[0]."vnic-id"' \
        --raw-output 2>/dev/null || echo "null")
    [ "$VNIC_ID" != "null" ] && [ -n "$VNIC_ID" ] && break
    sleep 10
done
[ "$VNIC_ID" = "null" ] || [ -z "$VNIC_ID" ] && { log_error "No VNIC found"; exit 1; }

ORACLE_IP=$(oci network vnic get \
    --vnic-id "$VNIC_ID" \
    --query 'data."public-ip"' \
    --raw-output 2>/dev/null)
[ -z "$ORACLE_IP" ] || [ "$ORACLE_IP" = "null" ] && { log_error "No public IP assigned"; exit 1; }
log_ok "Public IP: $ORACLE_IP"

###############################################################################
# 14. Wait for SSH
###############################################################################
log_info "Waiting for SSH (up to 10 min)..."
for i in $(seq 1 30); do
    if ssh -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
        ubuntu@"$ORACLE_IP" "echo ok" 2>/dev/null | grep -q "ok"; then
        log_ok "SSH ready"
        break
    fi
    log_info "  Not ready yet ($i/30, waiting 20s...)"
    sleep 20
done

###############################################################################
# 15. Open iptables on the instance (OS-level firewall)
###############################################################################
log_info "Opening iptables for ports 80 and 443 on the instance..."
ssh -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no ubuntu@"$ORACLE_IP" "
    for PORT in 80 443; do
        if ! sudo iptables -C INPUT -p tcp --dport \$PORT -j ACCEPT 2>/dev/null; then
            sudo iptables -I INPUT -p tcp --dport \$PORT -j ACCEPT
        fi
    done
    if command -v netfilter-persistent >/dev/null 2>&1; then
        sudo netfilter-persistent save 2>/dev/null || true
    elif command -v iptables-save >/dev/null 2>&1; then
        sudo iptables-save | sudo tee /etc/iptables/rules.v4 >/dev/null 2>/dev/null || true
    fi
" 2>/dev/null || true
log_ok "iptables updated"

###############################################################################
# Done!
###############################################################################
echo ""
echo "============================================================"
log_ok "ORACLE ARM INSTANCE READY!"
echo "============================================================"
echo ""
echo "  IP:          $ORACLE_IP"
echo "  Instance ID: $INSTANCE_ID"
echo "  SSH key:     $SSH_KEY_FILE"
echo ""
echo "  ── Next steps ───────────────────────────────────────────"
echo ""
echo "  1. Add to .env:"
echo "       ORACLE_ARM_IP=$ORACLE_IP"
echo ""
echo "  2. Deploy the full stack:"
echo "       bash scripts/deploy-oracle.sh"
echo ""
echo "  3. Update DNS A record → $ORACLE_IP"
echo ""
echo "  SSH access:"
echo "    ssh -i $SSH_KEY_FILE -o StrictHostKeyChecking=no ubuntu@$ORACLE_IP"
echo ""
echo "  Full log: $LOG_FILE"
echo "============================================================"
