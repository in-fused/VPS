#!/usr/bin/env bash
###############################################################################
# provision-oracle-arm-2.sh — Second Oracle ARM Instance Provisioner
###############################################################################
# Provisions a SECOND ARM instance using remaining free tier capacity.
# Reuses networking from the first instance (VCN, subnet, gateway).
#
# Free tier total: 4 OCPUs / 24GB RAM / 200GB boot volume
# Instance 1 uses: 2 OCPUs / 12GB RAM / 100GB boot volume
# This script:     2 OCPUs / 12GB RAM / 100GB boot volume (remaining)
#
# Usage:
#   sudo -E bash scripts/provision-oracle-arm-2.sh
#
# Prerequisites:
#   - First instance already provisioned (networking exists)
#   - OCI CLI installed and configured (done by first provisioner)
#   - OCI API private key at /home/VPS/oci_api_key.pem
###############################################################################

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────

# OCI credentials (same as instance 1)
OCI_USER="ocid1.user.oc1..aaaaaaaat2mw5f3sxvlwcnqv6gizayboosqkq4ihrc7ukc7np3w5rtj5ky5a"
OCI_FINGERPRINT="18:64:d7:eb:27:cf:7f:2d:f8:cb:93:92:24:cb:a1:c2"
OCI_TENANCY="ocid1.tenancy.oc1..aaaaaaaa7skrn7sa5tbenz745ooy42uq6puv62xjnwen5zg6swhzdnkasgua"
OCI_REGION="us-ashburn-1"
OCI_KEY_FILE="/home/VPS/oci_api_key.pem"

# Instance configuration — remaining free tier allocation
SHAPE="VM.Standard.A1.Flex"
OCPUS=2
MEMORY_GB=12
BOOT_VOLUME_GB=100
IMAGE_OCID="ocid1.image.oc1.iad.aaaaaaaa2qup33kak66ll3loslunng52zk5haq4pggre5gg7y3snr5wh55rq"
# Ubuntu 22.04 aarch64 (2025.07.24)

# EC2 details
EC2_IP="13.222.43.154"
VPS_DIR="/home/VPS"
ENV_FILE="$VPS_DIR/.env"
LOG_FILE="$VPS_DIR/oracle-provision-2.log"
SSH_KEY_FILE="$VPS_DIR/oracle-instance-key"

# Retry settings
RETRY_INTERVAL=20
MAX_RETRIES=4320  # 24 hours

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

echo "" > "$LOG_FILE"
log_info "Oracle ARM Auto-Provisioner (Instance 2) started"
log_info "Log file: $LOG_FILE"

###############################################################################
# 1. Prerequisites — OCI CLI must already be installed by first provisioner
###############################################################################
log_info "Checking prerequisites..."

if [ ! -f "$OCI_KEY_FILE" ]; then
    log_error "OCI API key not found at $OCI_KEY_FILE"
    exit 1
fi
chmod 600 "$OCI_KEY_FILE"

# Find OCI CLI
for p in "$HOME/bin/oci" "/root/bin/oci" "/home/deploy/bin/oci" "/usr/local/bin/oci" \
         "$HOME/lib/oracle-cli/bin/oci" "/root/lib/oracle-cli/bin/oci"; do
    if [ -x "$p" ]; then
        export PATH="$(dirname "$p"):$PATH"
        break
    fi
done

if ! command -v oci &>/dev/null; then
    log_error "OCI CLI not found. Run provision-oracle-arm.sh first to install it."
    exit 1
fi
log_ok "OCI CLI found: $(oci --version 2>&1 | head -1)"

# SSH key must exist from first provisioner
if [ ! -f "$SSH_KEY_FILE" ]; then
    log_error "SSH key not found at $SSH_KEY_FILE. Run provision-oracle-arm.sh first."
    exit 1
fi
SSH_PUBLIC_KEY=$(cat "${SSH_KEY_FILE}.pub")
log_ok "SSH key found"

###############################################################################
# 2. Configure OCI CLI
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

log_info "Validating OCI credentials..."
if oci iam region list --output table 2>/dev/null | grep -q "$OCI_REGION"; then
    log_ok "OCI credentials valid"
else
    log_error "OCI credential validation failed."
    exit 1
fi

###############################################################################
# 3. Find existing networking from instance 1
###############################################################################
COMPARTMENT_ID="$OCI_TENANCY"

log_info "Finding existing VCN..."
VCN_ID=$(oci network vcn list \
    --compartment-id "$COMPARTMENT_ID" \
    --query 'data[?contains("display-name", `ollama`) || contains("display-name", `Ollama`)].id | [0]' \
    --raw-output 2>/dev/null || echo "null")

if [ "$VCN_ID" = "null" ] || [ -z "$VCN_ID" ]; then
    log_error "No VCN found. Run provision-oracle-arm.sh first to create networking."
    exit 1
fi
log_ok "Found VCN: $VCN_ID"

log_info "Finding existing subnet..."
SUBNET_ID=$(oci network subnet list \
    --compartment-id "$COMPARTMENT_ID" \
    --vcn-id "$VCN_ID" \
    --query 'data[0].id' \
    --raw-output 2>/dev/null || echo "null")

if [ "$SUBNET_ID" = "null" ] || [ -z "$SUBNET_ID" ]; then
    log_error "No subnet found in VCN."
    exit 1
fi
log_ok "Found subnet: $SUBNET_ID"

###############################################################################
# 4. Get Availability Domains
###############################################################################
log_info "Fetching availability domains..."
ALL_ADS=$(oci iam availability-domain list \
    --compartment-id "$COMPARTMENT_ID" \
    --query 'data[*].name' \
    --raw-output 2>/dev/null)
log_info "All ADs: $ALL_ADS"

###############################################################################
# 5. Retry Instance Creation
###############################################################################
echo ""
log_info "============================================================"
log_info "  Instance 2: $SHAPE ($OCPUS OCPUs, ${MEMORY_GB}GB RAM)"
log_info "  Retrying every ${RETRY_INTERVAL}s (max ${MAX_RETRIES} attempts = 24h)"
log_info "  Log: $LOG_FILE"
log_info "============================================================"
echo ""

INSTANCE_ID=""
ATTEMPT=0

readarray -t AD_ARRAY < <(echo "$ALL_ADS" | tr -d '[]"' | tr ',' '\n' | sed 's/^ *//')
AD_COUNT=${#AD_ARRAY[@]}

while [ -z "$INSTANCE_ID" ] && [ $ATTEMPT -lt $MAX_RETRIES ]; do
    for CURRENT_AD in "${AD_ARRAY[@]}"; do
        [ -n "$INSTANCE_ID" ] && break
        ATTEMPT=$((ATTEMPT + 1))

        log_info "Attempt $ATTEMPT/$MAX_RETRIES — AD: $CURRENT_AD"

        RESULT=$(oci compute instance launch \
            --compartment-id "$COMPARTMENT_ID" \
            --availability-domain "$CURRENT_AD" \
            --shape "$SHAPE" \
            --shape-config "{\"ocpus\": $OCPUS, \"memoryInGBs\": $MEMORY_GB}" \
            --image-id "$IMAGE_OCID" \
            --subnet-id "$SUBNET_ID" \
            --display-name "ollama-arm-server-2" \
            --assign-public-ip true \
            --boot-volume-size-in-gbs "$BOOT_VOLUME_GB" \
            --metadata "{\"ssh_authorized_keys\": \"$SSH_PUBLIC_KEY\"}" \
            --query 'data.id' \
            --raw-output 2>&1) || true

        if [[ "$RESULT" == ocid1.instance* ]]; then
            INSTANCE_ID="$RESULT"
            log_ok "Instance 2 created! ID: $INSTANCE_ID"
        elif echo "$RESULT" | grep -qi "out of.*capacity\|InternalError\|LimitExceeded\|capacity"; then
            log_warn "Out of capacity in $CURRENT_AD"
        elif echo "$RESULT" | grep -qi "limit\|quota\|exceeded"; then
            log_warn "Limit/quota issue: $(echo "$RESULT" | head -1)"
        else
            log_warn "Unexpected response: $(echo "$RESULT" | head -3)"
        fi
    done

    if [ -z "$INSTANCE_ID" ]; then
        log_info "All $AD_COUNT ADs exhausted — waiting ${RETRY_INTERVAL}s..."
        sleep "$RETRY_INTERVAL"
    fi
done

if [ -z "$INSTANCE_ID" ]; then
    log_error "Failed to create instance 2 after $MAX_RETRIES attempts"
    exit 1
fi

###############################################################################
# 6. Wait for Instance to be Running
###############################################################################
log_info "Waiting for instance 2 to reach RUNNING state..."
for i in $(seq 1 60); do
    STATE=$(oci compute instance get \
        --instance-id "$INSTANCE_ID" \
        --query 'data."lifecycle-state"' \
        --raw-output 2>/dev/null || echo "UNKNOWN")

    if [ "$STATE" = "RUNNING" ]; then
        log_ok "Instance 2 is RUNNING"
        break
    fi
    log_info "  State: $STATE (waiting 30s...)"
    sleep 30
done

###############################################################################
# 7. Get Public IP
###############################################################################
log_info "Fetching public IP..."
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
    log_error "Could not find VNIC for instance 2"
    exit 1
fi

ORACLE_IP_2=$(oci network vnic get \
    --vnic-id "$VNIC_ID" \
    --query 'data."public-ip"' \
    --raw-output 2>/dev/null)

if [ -z "$ORACLE_IP_2" ] || [ "$ORACLE_IP_2" = "null" ]; then
    log_error "Instance 2 has no public IP"
    exit 1
fi

log_ok "Oracle instance 2 public IP: $ORACLE_IP_2"

###############################################################################
# 8. Wait for SSH
###############################################################################
log_info "Waiting for SSH on instance 2..."
for i in $(seq 1 30); do
    if ssh -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
        ubuntu@"$ORACLE_IP_2" "echo ssh-ready" 2>/dev/null | grep -q "ssh-ready"; then
        log_ok "SSH is ready"
        break
    fi
    log_info "  SSH not ready yet (attempt $i/30, waiting 20s...)"
    sleep 20
done

###############################################################################
# 9. Wait for apt lock to clear, then run setup
###############################################################################
log_info "Waiting for apt lock to clear on instance 2..."
ssh -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no \
    ubuntu@"$ORACLE_IP_2" \
    "while sudo fuser /var/lib/apt/lists/lock >/dev/null 2>&1 || sudo fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do echo 'waiting for apt lock...'; sleep 5; done" 2>&1 | tee -a "$LOG_FILE"

log_info "Copying setup script to instance 2..."
scp -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no \
    "$VPS_DIR/scripts/setup-ollama-server.sh" \
    ubuntu@"$ORACLE_IP_2":/tmp/setup-ollama-server.sh

log_info "Running setup-ollama-server.sh on instance 2..."
ssh -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no \
    ubuntu@"$ORACLE_IP_2" \
    "sudo bash /tmp/setup-ollama-server.sh $EC2_IP" 2>&1 | tee -a "$LOG_FILE"

log_ok "Ollama setup complete on instance 2"

###############################################################################
# 10. Verify Ollama is reachable
###############################################################################
log_info "Verifying Ollama on instance 2 is reachable from EC2..."
for i in $(seq 1 10); do
    if curl -sf "http://$ORACLE_IP_2:11434/api/tags" > /dev/null 2>&1; then
        log_ok "Ollama reachable at http://$ORACLE_IP_2:11434"
        break
    fi
    log_warn "  Not reachable yet (attempt $i/10, waiting 15s...)"
    sleep 15
done

###############################################################################
# 11. Update EC2 .env with OLLAMA_BASE_URL_2
###############################################################################
log_info "Updating EC2 .env with OLLAMA_BASE_URL_2..."
if grep -q "^OLLAMA_BASE_URL_2=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^OLLAMA_BASE_URL_2=.*|OLLAMA_BASE_URL_2=http://$ORACLE_IP_2:11434|" "$ENV_FILE"
    log_ok "Updated existing OLLAMA_BASE_URL_2 in .env"
else
    echo "OLLAMA_BASE_URL_2=http://$ORACLE_IP_2:11434" >> "$ENV_FILE"
    log_ok "Added OLLAMA_BASE_URL_2 to .env"
fi

###############################################################################
# Done — no automatic stack restart (instance 1 is already running)
###############################################################################
echo ""
echo "============================================================"
log_ok "ORACLE ARM INSTANCE 2 PROVISIONING COMPLETE!"
echo "============================================================"
echo ""
echo "  Instance 2 IP:       $ORACLE_IP_2"
echo "  Instance 2 ID:       $INSTANCE_ID"
echo "  Ollama URL:          http://$ORACLE_IP_2:11434"
echo "  SSH access:          ssh -i $SSH_KEY_FILE -p 2222 deploy@$ORACLE_IP_2"
echo ""
echo "  .env updated:        OLLAMA_BASE_URL_2=http://$ORACLE_IP_2:11434"
echo ""
echo "  NOTE: Stack NOT auto-restarted. To add instance 2 to LiteLLM,"
echo "  update litellm_config.yaml with the second Ollama base URL,"
echo "  then restart the stack."
echo ""
echo "  Full log:            $LOG_FILE"
echo ""
echo "============================================================"
