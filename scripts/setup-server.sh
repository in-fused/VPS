#!/usr/bin/env bash
###############################################################################
# setup-server.sh — Server Hardening & Docker Installation
###############################################################################
# Run this on a fresh Ubuntu EC2 instance (or Oracle Cloud Ubuntu):
#   sudo bash scripts/setup-server.sh
#
# What this does:
#   1. System update & upgrade
#   2. Creates 'deploy' user with sudo access
#   3. Hardens SSH (key-only, no root, port 2222)
#   4. Installs and configures UFW firewall
#   5. Installs and configures Fail2Ban
#   6. Installs Docker + Docker Compose
#   7. Creates 2GB swap space (critical for t2.micro)
#   8. Enables unattended security upgrades
#   9. Configures log rotation
###############################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Must run as root
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root (use sudo)"
    exit 1
fi

SSH_PORT="${SSH_PORT:-2222}"
DEPLOY_USER="deploy"

echo ""
echo "============================================================"
echo "  VPS AI Hub — Server Setup & Hardening"
echo "============================================================"
echo ""

###############################################################################
# 1. System Update
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
    software-properties-common \
    ca-certificates \
    gnupg \
    lsb-release \
    htop \
    nano \
    jq
log_ok "System updated"

###############################################################################
# 2. Create Deploy User
###############################################################################
if id "$DEPLOY_USER" &>/dev/null; then
    log_warn "User '$DEPLOY_USER' already exists, skipping creation"
else
    log_info "Creating user '$DEPLOY_USER'..."
    adduser --disabled-password --gecos "" "$DEPLOY_USER"
    usermod -aG sudo "$DEPLOY_USER"

    # Allow sudo without password for deploy user
    echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$DEPLOY_USER
    chmod 440 /etc/sudoers.d/$DEPLOY_USER

    # Copy SSH keys from current user (ubuntu/ec2-user)
    ORIGINAL_USER=""
    for u in ubuntu ec2-user opc; do
        if id "$u" &>/dev/null && [ -f "/home/$u/.ssh/authorized_keys" ]; then
            ORIGINAL_USER="$u"
            break
        fi
    done

    if [ -n "$ORIGINAL_USER" ]; then
        mkdir -p /home/$DEPLOY_USER/.ssh
        cp /home/$ORIGINAL_USER/.ssh/authorized_keys /home/$DEPLOY_USER/.ssh/
        chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh
        chmod 700 /home/$DEPLOY_USER/.ssh
        chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys
        log_ok "SSH keys copied from '$ORIGINAL_USER' to '$DEPLOY_USER'"
    else
        log_warn "No default user SSH keys found. You'll need to add SSH keys manually."
        log_warn "Run: sudo -u $DEPLOY_USER mkdir -p /home/$DEPLOY_USER/.ssh"
        log_warn "Then add your public key to /home/$DEPLOY_USER/.ssh/authorized_keys"
    fi
fi
log_ok "Deploy user configured"

###############################################################################
# 3. SSH Hardening
###############################################################################
log_info "Hardening SSH..."
SSHD_CONFIG="/etc/ssh/sshd_config"

# Backup original config
cp "$SSHD_CONFIG" "${SSHD_CONFIG}.backup.$(date +%Y%m%d)"

# Ensure sshd_config.d include exists (some AMIs lack it)
if ! grep -q "^Include /etc/ssh/sshd_config.d/\*.conf" "$SSHD_CONFIG"; then
    sed -i '1s|^|Include /etc/ssh/sshd_config.d/*.conf\n|' "$SSHD_CONFIG"
fi
mkdir -p /etc/ssh/sshd_config.d

# Apply hardening
cat > /etc/ssh/sshd_config.d/hardening.conf << 'SSHEOF'
# VPS AI Hub — SSH Hardening
# Applied by setup-server.sh

# Change default port (reduces automated scans by 99%)
# Port is set dynamically below

# Disable password authentication (key-only)
PasswordAuthentication no
PermitEmptyPasswords no

# Disable root login
PermitRootLogin no

# Limit authentication attempts
MaxAuthTries 3
MaxSessions 3

# Disable unused authentication methods
KbdInteractiveAuthentication no
KerberosAuthentication no
GSSAPIAuthentication no

# Use strong key exchange and ciphers
KexAlgorithms curve25519-sha256@libssh.org,curve25519-sha256
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com

# Disconnect idle sessions after 10 minutes
ClientAliveInterval 300
ClientAliveCountMax 2

# Logging
LogLevel VERBOSE
SSHEOF

# Set the SSH port (remove any existing Port line, then add the correct one)
sed -i '/^#\?Port /d' "$SSHD_CONFIG"
echo "Port $SSH_PORT" >> "$SSHD_CONFIG"

# Validate SSH config before restarting (prevents lockouts)
SSHD_TEST_OUTPUT=$(sshd -t 2>&1) || true
if sshd -t 2>/dev/null; then
    log_ok "SSH config validation passed"
else
    log_error "SSH config validation FAILED — restoring backup to prevent lockout"
    log_error "sshd -t output: $SSHD_TEST_OUTPUT"
    cp "${SSHD_CONFIG}.backup."* "$SSHD_CONFIG" 2>/dev/null
    rm -f /etc/ssh/sshd_config.d/hardening.conf
    systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null
    log_error "Original SSH config restored. Fix the hardening config and re-run."
    exit 1
fi

# Restart SSH (Ubuntu uses 'ssh', other distros use 'sshd')
systemctl restart ssh 2>/dev/null || systemctl restart sshd
log_ok "SSH hardened (port $SSH_PORT, key-only, no root login)"

###############################################################################
# 4. UFW Firewall
###############################################################################
log_info "Configuring UFW firewall..."

# Reset UFW to defaults
ufw --force reset

# Default policies
ufw default deny incoming
ufw default allow outgoing

# Allow SSH on custom port
ufw allow "$SSH_PORT/tcp" comment "SSH"

# Allow HTTP and HTTPS
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS"

# Enable UFW
ufw --force enable
log_ok "UFW configured (ports: $SSH_PORT, 80, 443)"

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
log_ok "Fail2Ban configured (ban after 3 failures for 1 hour)"

###############################################################################
# 6. Docker Installation
###############################################################################
if command -v docker &>/dev/null; then
    log_warn "Docker already installed, skipping"
else
    log_info "Installing Docker..."

    # Add Docker GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    # Add Docker repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update -qq
    apt-get install -y -qq \
        docker-ce \
        docker-ce-cli \
        containerd.io \
        docker-buildx-plugin \
        docker-compose-plugin

    # Add deploy user to docker group
    usermod -aG docker "$DEPLOY_USER"
    log_ok "Docker installed"
fi

# Ensure Docker starts on boot
systemctl enable docker
systemctl start docker
log_ok "Docker running"

###############################################################################
# 7. Swap Space (recommended safety net for small instances)
###############################################################################
if swapon --show | grep -q "/swapfile"; then
    log_warn "Swap already configured, skipping"
else
    log_info "Creating 2GB swap space..."
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile

    # Make permanent
    if ! grep -q "/swapfile" /etc/fstab; then
        echo "/swapfile none swap sw 0 0" >> /etc/fstab
    fi

    # Optimize swap behavior for low-memory systems
    sysctl vm.swappiness=10
    sysctl vm.vfs_cache_pressure=50
    echo "vm.swappiness=10" >> /etc/sysctl.conf
    echo "vm.vfs_cache_pressure=50" >> /etc/sysctl.conf

    log_ok "2GB swap configured"
fi

###############################################################################
# 8. Unattended Security Upgrades
###############################################################################
log_info "Enabling unattended security upgrades..."

cat > /etc/apt/apt.conf.d/20auto-upgrades << 'AUTOEOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
AUTOEOF

cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'UPGRADEEOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
UPGRADEEOF

systemctl enable unattended-upgrades
log_ok "Unattended upgrades enabled"

###############################################################################
# 9. Docker Log Rotation
###############################################################################
log_info "Configuring Docker log rotation..."

mkdir -p /etc/docker
cat > /etc/docker/daemon.json << 'DOCKEREOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
DOCKEREOF

systemctl restart docker
log_ok "Docker log rotation configured"

###############################################################################
# 10. Set Timezone
###############################################################################
timedatectl set-timezone UTC
log_ok "Timezone set to UTC"

###############################################################################
# Done!
###############################################################################
echo ""
echo "============================================================"
echo -e "  ${GREEN}Server setup complete!${NC}"
echo "============================================================"
echo ""
echo "  SSH port:     $SSH_PORT"
echo "  Deploy user:  $DEPLOY_USER"
echo "  Swap:         2GB"
echo "  Firewall:     UFW (ports $SSH_PORT, 80, 443)"
echo "  Fail2Ban:     Active (SSH jail)"
echo "  Docker:       Installed"
echo "  Auto-updates: Enabled"
echo ""
echo "  IMPORTANT: SSH port changed to $SSH_PORT!"
echo "  Reconnect with:"
echo "    ssh -i your-key.pem -p $SSH_PORT $DEPLOY_USER@YOUR_IP"
echo ""
echo "  Next steps:"
echo "    1. Open a NEW terminal and test SSH on port $SSH_PORT"
echo "       (keep this session open as backup!)"
echo "    2. cd /home/$DEPLOY_USER/VPS"
echo "    3. cp .env.example .env && nano .env"
echo "    4. bash scripts/deploy.sh"
echo ""
echo "============================================================"
