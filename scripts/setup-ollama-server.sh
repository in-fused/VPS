#!/usr/bin/env bash
###############################################################################
# setup-ollama-server.sh — Oracle Cloud ARM Ollama Server Setup
###############################################################################
# Run this on your Oracle Cloud ARM A1.Flex instance (Ubuntu):
#   sudo bash scripts/setup-ollama-server.sh EC2_ELASTIC_IP
#
# Example:
#   sudo bash scripts/setup-ollama-server.sh 54.123.45.67
#
# What this does:
#   1. System update & security hardening (same as EC2)
#   2. Installs Ollama natively (better ARM performance than Docker)
#   3. Configures Ollama to accept remote connections
#   4. Sets up firewall: Ollama port ONLY from EC2 IP
#   5. Creates systemd service for auto-start
#   6. Pulls recommended models
#
# ── Oracle Cloud Capacity Issue ──────────────────────────────────────────────
# If you're getting "Out of capacity for shape VM.Standard.A1.Flex":
#
#   1. Try Frankfurt region (eu-frankfurt-1) — usually has better availability
#   2. Try different Availability Domains (AD-2 or AD-3)
#   3. Use automated retry script:
#      https://github.com/hitrov/oci-arm-host-capacity
#      This script retries instance creation until capacity opens up.
#   4. Try a smaller config (2 OCPU, 12GB RAM) — may have more availability
#   5. Try off-peak hours (early morning UTC)
#
# Instance Configuration for Oracle Cloud:
#   Shape:    VM.Standard.A1.Flex (ARM)
#   OCPU:     4 (maximum free tier)
#   RAM:      24 GB (maximum free tier)
#   Storage:  200 GB boot volume
#   Image:    Canonical Ubuntu 22.04 (aarch64)
#   Network:  Allow SSH (22) from your IP, custom TCP 11434 from EC2 IP
# ─────────────────────────────────────────────────────────────────────────────
###############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Must run as root
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root (use sudo)"
    exit 1
fi

# Require EC2 IP argument
EC2_IP="${1:-}"
if [ -z "$EC2_IP" ]; then
    log_error "Usage: sudo bash setup-ollama-server.sh <EC2_ELASTIC_IP>"
    log_error "Example: sudo bash setup-ollama-server.sh 54.123.45.67"
    exit 1
fi

SSH_PORT="2222"
DEPLOY_USER="deploy"
OLLAMA_PORT="11434"

echo ""
echo "============================================================"
echo "  Oracle Cloud — Ollama Server Setup"
echo "============================================================"
echo "  EC2 IP (allowed):  $EC2_IP"
echo "  Ollama Port:       $OLLAMA_PORT"
echo "  SSH Port:          $SSH_PORT"
echo "============================================================"
echo ""

###############################################################################
# 1. System Update & Essential Packages
###############################################################################
log_info "Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
    curl \
    wget \
    git \
    ufw \
    fail2ban \
    unattended-upgrades \
    apt-listchanges \
    htop \
    nano
log_ok "System updated"

###############################################################################
# 2. Create Deploy User
###############################################################################
if id "$DEPLOY_USER" &>/dev/null; then
    log_warn "User '$DEPLOY_USER' already exists"
else
    log_info "Creating user '$DEPLOY_USER'..."
    adduser --disabled-password --gecos "" "$DEPLOY_USER"
    usermod -aG sudo "$DEPLOY_USER"
    echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$DEPLOY_USER
    chmod 440 /etc/sudoers.d/$DEPLOY_USER

    # Copy SSH keys from default user (ubuntu or opc on Oracle Cloud)
    for u in ubuntu opc; do
        if id "$u" &>/dev/null && [ -f "/home/$u/.ssh/authorized_keys" ]; then
            mkdir -p /home/$DEPLOY_USER/.ssh
            cp /home/$u/.ssh/authorized_keys /home/$DEPLOY_USER/.ssh/
            chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh
            chmod 700 /home/$DEPLOY_USER/.ssh
            chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys
            log_ok "SSH keys copied from '$u' to '$DEPLOY_USER'"
            break
        fi
    done
fi

###############################################################################
# 3. SSH Hardening
###############################################################################
log_info "Hardening SSH..."
cp /etc/ssh/sshd_config "/etc/ssh/sshd_config.backup.$(date +%Y%m%d)"

cat > /etc/ssh/sshd_config.d/hardening.conf << 'SSHEOF'
PasswordAuthentication no
PermitEmptyPasswords no
PermitRootLogin no
MaxAuthTries 3
MaxSessions 3
ChallengeResponseAuthentication no
KexAlgorithms curve25519-sha256@libssh.org,curve25519-sha256
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
ClientAliveInterval 300
ClientAliveCountMax 2
LogLevel VERBOSE
SSHEOF

# Set SSH port
sed -i "s/^#Port 22/Port $SSH_PORT/" /etc/ssh/sshd_config
sed -i "s/^Port 22/Port $SSH_PORT/" /etc/ssh/sshd_config
if ! grep -q "^Port " /etc/ssh/sshd_config; then
    echo "Port $SSH_PORT" >> /etc/ssh/sshd_config
fi

systemctl restart sshd
log_ok "SSH hardened (port $SSH_PORT)"

###############################################################################
# 4. UFW Firewall
###############################################################################
log_info "Configuring UFW firewall..."

ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# SSH
ufw allow "$SSH_PORT/tcp" comment "SSH"

# Ollama — ONLY from EC2
ufw allow from "$EC2_IP" to any port "$OLLAMA_PORT" proto tcp comment "Ollama from EC2"

ufw --force enable
log_ok "UFW configured (SSH: $SSH_PORT, Ollama: $OLLAMA_PORT from $EC2_IP only)"

###############################################################################
# 5. Fail2Ban
###############################################################################
log_info "Configuring Fail2Ban..."

cat > /etc/fail2ban/jail.local << JAILEOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3
backend = systemd

[sshd]
enabled = true
port = $SSH_PORT
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
JAILEOF

systemctl enable fail2ban
systemctl restart fail2ban
log_ok "Fail2Ban configured"

###############################################################################
# 6. Swap Space (helpful even with 24GB for model loading)
###############################################################################
if swapon --show | grep -q "/swapfile"; then
    log_warn "Swap already configured"
else
    log_info "Creating 4GB swap space..."
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    if ! grep -q "/swapfile" /etc/fstab; then
        echo "/swapfile none swap sw 0 0" >> /etc/fstab
    fi
    sysctl vm.swappiness=10
    echo "vm.swappiness=10" >> /etc/sysctl.conf
    log_ok "4GB swap configured"
fi

###############################################################################
# 7. Install Ollama
###############################################################################
if command -v ollama &>/dev/null; then
    log_warn "Ollama already installed"
else
    log_info "Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
    log_ok "Ollama installed"
fi

###############################################################################
# 8. Configure Ollama for Remote Access
###############################################################################
log_info "Configuring Ollama for remote access..."

# Create/update systemd override to listen on all interfaces
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/override.conf << 'OLLAMAEOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_NUM_PARALLEL=2"
Environment="OLLAMA_KEEP_ALIVE=10m"
OLLAMAEOF

systemctl daemon-reload
systemctl enable ollama
systemctl restart ollama
log_ok "Ollama configured (listening on 0.0.0.0:$OLLAMA_PORT)"

# Wait for Ollama to be ready
log_info "Waiting for Ollama to start..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:$OLLAMA_PORT/api/tags > /dev/null 2>&1; then
        log_ok "Ollama is running"
        break
    fi
    sleep 2
done

###############################################################################
# 9. Pull Recommended Models
###############################################################################
echo ""
log_info "Pulling recommended models (this may take a while)..."
echo ""

# Qwen 3.5 9B — best small model, beats GPT-OSS-120B, excellent tool calling
log_info "Pulling qwen3.5:9b (primary general-purpose + agent tasks)..."
ollama pull qwen3.5:9b || log_warn "Failed to pull qwen3.5:9b — try manually later"

# Qwen 3 14B — dense model, strong reasoning, reliable on ARM CPU
log_info "Pulling qwen3:14b (reasoning + general purpose)..."
ollama pull qwen3:14b || log_warn "Failed to pull qwen3:14b — try manually later"

# Qwen 3 Coder 30B-A3B — MoE (3.3B active), best open-source coding model
log_info "Pulling qwen3-coder:30b-a3b (MoE coding model, ~18GB Q4)..."
ollama pull qwen3-coder:30b-a3b || log_warn "Failed to pull qwen3-coder:30b-a3b — try manually later"

###############################################################################
# 10. Unattended Security Upgrades
###############################################################################
log_info "Enabling unattended security upgrades..."
cat > /etc/apt/apt.conf.d/20auto-upgrades << 'AUTOEOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
AUTOEOF
systemctl enable unattended-upgrades
log_ok "Unattended upgrades enabled"

###############################################################################
# Done!
###############################################################################
echo ""
echo "============================================================"
echo -e "  ${GREEN}Oracle Cloud Ollama Server — Setup Complete!${NC}"
echo "============================================================"
echo ""
echo "  Ollama URL:   http://$(hostname -I | awk '{print $1}'):$OLLAMA_PORT"
echo "  SSH port:     $SSH_PORT"
echo "  Firewall:     Ollama accessible only from $EC2_IP"
echo ""
echo "  Models installed:"
ollama list 2>/dev/null || echo "  (run 'ollama list' to check)"
echo ""
echo "  ── Next Steps ─────────────────────────────────────────"
echo ""
echo "  1. On your EC2 server, update .env:"
echo "     OLLAMA_BASE_URL=http://$(hostname -I | awk '{print $1}'):$OLLAMA_PORT"
echo ""
echo "  2. Restart the stack on EC2:"
echo "     docker compose down && docker compose up -d"
echo ""
echo "  3. Open https://in-fused.org and select a local model!"
echo ""
echo "  ── SSH Reconnect ──────────────────────────────────────"
echo ""
echo "  ssh -i your-key.pem -p $SSH_PORT $DEPLOY_USER@$(hostname -I | awk '{print $1}')"
echo ""
echo "  ── Manage Models ──────────────────────────────────────"
echo ""
echo "  Pull new model:    ollama pull <model-name>"
echo "  List models:       ollama list"
echo "  Remove model:      ollama rm <model-name>"
echo "  Test model:        ollama run qwen3.5:9b 'Hello!'"
echo ""
echo "============================================================"
