#!/usr/bin/env bash
###############################################################################
# deploy-oracle.sh — Deploy LiteLLM + Scrapling + SearXNG to Oracle ARM
###############################################################################
# Syncs configuration files and starts Docker services on Oracle ARM.
# Run from the VPS repo directory on EC2 or locally:
#
#   bash scripts/deploy-oracle.sh
#
# Prerequisites:
#   - Oracle ARM instance with Docker installed
#   - SSH key at ./oracle-instance-key (or ORACLE_SSH_KEY env var)
#   - ORACLE_ARM_IP set in .env
#   - Ollama running natively on Oracle ARM (systemd)
#
# What this does:
#   1. Reads EC2 .env to get API keys + Oracle ARM IP
#   2. SSHes to Oracle ARM
#   3. Syncs docker-compose, litellm_config, scrapling, searxng files
#   4. Generates Oracle .env (same API keys, local DB password)
#   5. Opens firewall ports for EC2 IP only
#   6. Starts Docker services
###############################################################################

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
cd "$REPO_DIR"

# Source .env
if [ ! -f .env ]; then
    log_error ".env not found. Run deploy.sh first to generate it."
    exit 1
fi
set -a; source .env; set +a

# Validate required vars
ORACLE_IP="${ORACLE_ARM_IP:-}"
if [ -z "$ORACLE_IP" ]; then
    log_error "ORACLE_ARM_IP not set in .env"
    exit 1
fi

SSH_KEY="${ORACLE_SSH_KEY:-./oracle-instance-key}"
if [ ! -f "$SSH_KEY" ] || [ ! -s "$SSH_KEY" ]; then
    log_error "SSH key not found or empty: $SSH_KEY"
    exit 1
fi

SSH_USER="${ORACLE_SSH_USER:-ubuntu}"
REMOTE_DIR="/opt/ai-hub"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"

echo ""
echo "============================================================"
echo "  Oracle ARM — Deploy LiteLLM + Scrapling + SearXNG"
echo "============================================================"
echo "  Target: $SSH_USER@$ORACLE_IP:$REMOTE_DIR"
echo ""

###############################################################################
# 1. Test SSH connectivity
###############################################################################
log_info "Testing SSH connection to $ORACLE_IP..."
if ! ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "echo ok" >/dev/null 2>&1; then
    log_error "Cannot SSH to $ORACLE_IP. Check SSH key and security lists."
    exit 1
fi
log_ok "SSH connection verified"

###############################################################################
# 2. Ensure Docker is installed on Oracle ARM
###############################################################################
log_info "Checking Docker on Oracle ARM..."
if ! ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "command -v docker" >/dev/null 2>&1; then
    log_info "Installing Docker on Oracle ARM..."
    ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $SSH_USER"
    log_ok "Docker installed"
else
    log_ok "Docker already installed"
fi

###############################################################################
# 3. Create remote directory structure
###############################################################################
log_info "Creating remote directory structure..."
ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "sudo mkdir -p $REMOTE_DIR/scrapling $REMOTE_DIR/searxng && sudo chown -R $SSH_USER:$SSH_USER $REMOTE_DIR"
log_ok "Directory structure ready"

###############################################################################
# 4. Sync files to Oracle ARM
###############################################################################
log_info "Syncing configuration files..."

SCP_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no"

# Docker compose
scp $SCP_OPTS "$REPO_DIR/oracle/docker-compose.yml" "$SSH_USER@$ORACLE_IP:$REMOTE_DIR/docker-compose.yml"

# LiteLLM config
scp $SCP_OPTS "$REPO_DIR/litellm_config.yaml" "$SSH_USER@$ORACLE_IP:$REMOTE_DIR/litellm_config.yaml"

# Scrapling files
scp $SCP_OPTS "$REPO_DIR/scrapling/Dockerfile" "$SSH_USER@$ORACLE_IP:$REMOTE_DIR/scrapling/Dockerfile"
scp $SCP_OPTS "$REPO_DIR/scrapling/api.py" "$SSH_USER@$ORACLE_IP:$REMOTE_DIR/scrapling/api.py"
scp $SCP_OPTS "$REPO_DIR/scrapling/requirements.txt" "$SSH_USER@$ORACLE_IP:$REMOTE_DIR/scrapling/requirements.txt"

# SearXNG settings
scp $SCP_OPTS "$REPO_DIR/searxng/settings.yml" "$SSH_USER@$ORACLE_IP:$REMOTE_DIR/searxng/settings.yml"

log_ok "Files synced"

###############################################################################
# 5. Generate Oracle .env (same API keys, local secrets)
###############################################################################
log_info "Generating Oracle .env..."

# Read existing Oracle DB_PASSWORD if it exists (don't regenerate — immutable after first run)
EXISTING_DB_PASS=$(ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "grep '^DB_PASSWORD=' $REMOTE_DIR/.env 2>/dev/null | cut -d= -f2" || true)
EXISTING_SALT=$(ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "grep '^LITELLM_SALT_KEY=' $REMOTE_DIR/.env 2>/dev/null | cut -d= -f2" || true)

ORACLE_DB_PASS="${EXISTING_DB_PASS:-$(openssl rand -hex 16)}"
ORACLE_SALT="${EXISTING_SALT:-sk-$(openssl rand -hex 32)}"

cat > /tmp/oracle-env <<ENVEOF
# Auto-generated by deploy-oracle.sh — $(date -u +%Y-%m-%dT%H:%M:%SZ)
# API keys synced from EC2 .env

LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY:-}
GROQ_API_KEY=${GROQ_API_KEY:-}
GROQ_API_KEY_2=${GROQ_API_KEY_2:-}
GROQ_API_KEY_3=${GROQ_API_KEY_3:-}
GROQ_API_KEY_4=${GROQ_API_KEY_4:-}
MINIMAX_API_KEY=${MINIMAX_API_KEY:-}
CEREBRAS_API_KEY=${CEREBRAS_API_KEY:-}
GEMINI_API_KEY=${GEMINI_API_KEY:-}
GEMINI_API_KEY_2=${GEMINI_API_KEY_2:-}
GEMINI_API_KEY_3=${GEMINI_API_KEY_3:-}
MISTRAL_API_KEY=${MISTRAL_API_KEY:-}

DB_PASSWORD=${ORACLE_DB_PASS}
LITELLM_SALT_KEY=${ORACLE_SALT}
ENVEOF

scp $SCP_OPTS /tmp/oracle-env "$SSH_USER@$ORACLE_IP:$REMOTE_DIR/.env"
rm -f /tmp/oracle-env
log_ok "Oracle .env generated"

###############################################################################
# 6. Open firewall ports for EC2 IP only
###############################################################################
log_info "Configuring firewall (iptables)..."

# Get EC2 public IP
EC2_IP=$(curl -sf http://checkip.amazonaws.com 2>/dev/null || echo "")
if [ -z "$EC2_IP" ]; then
    log_warn "Could not detect EC2 public IP. Skipping firewall setup."
    log_warn "Manually allow ports 4000, 8000, 8080 from your EC2 IP."
else
    log_info "EC2 public IP: $EC2_IP"
    # Add iptables rules (idempotent — check before adding)
    ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "
        for PORT in 4000 8000 8080; do
            if ! sudo iptables -C INPUT -p tcp --dport \$PORT -s $EC2_IP -j ACCEPT 2>/dev/null; then
                sudo iptables -I INPUT -p tcp --dport \$PORT -s $EC2_IP -j ACCEPT
                echo \"  Opened port \$PORT for $EC2_IP\"
            else
                echo \"  Port \$PORT already open for $EC2_IP\"
            fi
        done
        # Drop all other traffic to these ports
        for PORT in 4000 8000 8080; do
            if ! sudo iptables -C INPUT -p tcp --dport \$PORT -j DROP 2>/dev/null; then
                sudo iptables -A INPUT -p tcp --dport \$PORT -j DROP
            fi
        done
        # Persist rules
        if command -v netfilter-persistent >/dev/null 2>&1; then
            sudo netfilter-persistent save 2>/dev/null || true
        elif command -v iptables-save >/dev/null 2>&1; then
            sudo iptables-save | sudo tee /etc/iptables/rules.v4 >/dev/null 2>/dev/null || true
        fi
    "
    log_ok "Firewall configured: ports 4000/8000/8080 open for EC2 ($EC2_IP) only"
fi

###############################################################################
# 7. Pull images and start services
###############################################################################
log_info "Starting Docker services on Oracle ARM..."
ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "
    cd $REMOTE_DIR
    docker compose pull litellm litellm-db searxng
    docker compose build scrapling
    docker compose up -d
"
log_ok "Services started"

###############################################################################
# 8. Wait for health checks
###############################################################################
log_info "Waiting for LiteLLM to become healthy..."
for i in $(seq 1 30); do
    if ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "curl -sf http://localhost:4000/health/liveliness" >/dev/null 2>&1; then
        log_ok "LiteLLM is healthy on Oracle ARM"
        break
    fi
    if [ "$i" -eq 30 ]; then
        log_warn "LiteLLM health check timed out (may still be starting)"
    fi
    sleep 3
done

###############################################################################
# 9. Status report
###############################################################################
echo ""
echo "============================================================"
echo -e "  ${GREEN}Oracle ARM services running!${NC}"
echo "============================================================"
echo ""
ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "cd $REMOTE_DIR && docker compose ps"
echo ""
echo "  LiteLLM:   http://$ORACLE_IP:4000"
echo "  Scrapling:  http://$ORACLE_IP:8000"
echo "  SearXNG:    http://$ORACLE_IP:8080"
echo "  Ollama:     http://$ORACLE_IP:11434 (native)"
echo ""
echo "  EC2 .env should have:"
echo "    ORACLE_LITELLM_URL=http://$ORACLE_IP:4000"
echo "    ORACLE_SCRAPLING_URL=http://$ORACLE_IP:8000"
echo "    ORACLE_SEARXNG_URL=http://$ORACLE_IP:8080"
echo ""
echo "============================================================"
