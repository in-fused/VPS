#!/usr/bin/env bash
###############################################################################
# deploy-oracle.sh — Deploy full AI Hub stack to Oracle ARM (all-in-one)
###############################################################################
# Syncs repo files to Oracle ARM and starts all services on a single host.
# Run from the VPS repo root on EC2 or any machine with the SSH key:
#
#   bash scripts/deploy-oracle.sh
#
# Prerequisites:
#   - Oracle ARM instance with Docker installed (run once: setup-oracle-host.sh)
#   - SSH key at ./oracle-instance-key (or set ORACLE_SSH_KEY env var)
#   - ORACLE_ARM_IP set in .env
#   - DOMAIN set in .env (e.g. in-fused.org)
#   - Ollama running natively on Oracle ARM (systemd)
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

# Load .env
if [ ! -f .env ]; then
    log_error ".env not found — copy .env.example and fill in values"
    exit 1
fi
set -a; source .env; set +a

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
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=15 -o ServerAliveInterval=30"
SCP_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no"

echo ""
echo "============================================================"
echo "  Oracle ARM — Full Stack Deploy"
echo "============================================================"
echo "  Target: $SSH_USER@$ORACLE_IP:$REMOTE_DIR"
echo ""

###############################################################################
# 1. Test SSH
###############################################################################
log_info "Testing SSH connection..."
if ! ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "echo ok" >/dev/null 2>&1; then
    log_error "Cannot SSH to $ORACLE_IP — check key and VCN security list (port 22)"
    exit 1
fi
log_ok "SSH verified"

###############################################################################
# 2. Ensure Docker is installed
###############################################################################
log_info "Checking Docker..."
if ! ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "command -v docker" >/dev/null 2>&1; then
    log_info "Installing Docker..."
    ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $SSH_USER && sudo systemctl enable --now docker"
    log_ok "Docker installed"
else
    log_ok "Docker ready"
fi

###############################################################################
# 3. Open ports 80 and 443 (close internal service ports)
###############################################################################
log_info "Configuring firewall..."
ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "
    # Open HTTP and HTTPS for the world
    for PORT in 80 443; do
        if ! sudo iptables -C INPUT -p tcp --dport \$PORT -j ACCEPT 2>/dev/null; then
            sudo iptables -I INPUT -p tcp --dport \$PORT -j ACCEPT
            echo \"  Opened port \$PORT\"
        fi
    done

    # Block direct external access to internal service ports
    for PORT in 4000 8000 8080 3100 9090 18789; do
        # Remove any broad ACCEPT rule first
        sudo iptables -D INPUT -p tcp --dport \$PORT -j ACCEPT 2>/dev/null || true
        # Add DROP if not already present
        if ! sudo iptables -C INPUT -p tcp --dport \$PORT -j DROP 2>/dev/null; then
            sudo iptables -A INPUT -p tcp --dport \$PORT -j DROP
        fi
    done

    # Persist
    if command -v netfilter-persistent >/dev/null 2>&1; then
        sudo netfilter-persistent save 2>/dev/null || true
    elif command -v iptables-save >/dev/null 2>&1; then
        sudo iptables-save | sudo tee /etc/iptables/rules.v4 >/dev/null 2>/dev/null || true
    fi
    echo '  Firewall updated'
"
log_ok "Firewall: 80+443 open, internal ports locked down"

###############################################################################
# 4. Create remote directory and sync repo files
###############################################################################
log_info "Creating remote directory..."
ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "sudo mkdir -p $REMOTE_DIR && sudo chown -R $SSH_USER:$SSH_USER $REMOTE_DIR"

log_info "Syncing repo files to Oracle ARM..."

# Use rsync if available (much faster for large workspace/), fall back to scp
DIRS="caddy scripts scrapling searxng webhook paperclip workspace ttyd"

if command -v rsync >/dev/null 2>&1; then
    RSYNC_OPTS="-az --delete --exclude='.git' --exclude='*.log' --exclude='node_modules'"
    scp $SCP_OPTS Caddyfile litellm_config.yaml "$SSH_USER@$ORACLE_IP:$REMOTE_DIR/"
    for dir in $DIRS; do
        rsync $RSYNC_OPTS -e "ssh $SSH_OPTS" "$dir/" "$SSH_USER@$ORACLE_IP:$REMOTE_DIR/$dir/"
    done
else
    # scp fallback
    ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "mkdir -p $(echo $DIRS | sed "s|[^ ]*|$REMOTE_DIR/&|g")"
    scp $SCP_OPTS Caddyfile litellm_config.yaml "$SSH_USER@$ORACLE_IP:$REMOTE_DIR/"
    for dir in $DIRS; do
        scp -r $SCP_OPTS $dir/ "$SSH_USER@$ORACLE_IP:$REMOTE_DIR/$dir/"
    done
fi

# Copy oracle/docker-compose.yml as the main compose file
scp $SCP_OPTS oracle/docker-compose.yml "$SSH_USER@$ORACLE_IP:$REMOTE_DIR/docker-compose.yml"

log_ok "Files synced"

###############################################################################
# 5. Generate .env on Oracle ARM
###############################################################################
log_info "Generating .env on Oracle ARM..."

# Read existing immutable secrets from remote (DB_PASSWORD, LITELLM_SALT_KEY,
# PAPERCLIP_DB_PASSWORD, BETTER_AUTH_SECRET) — never regenerate after first run
_remote_get() { ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "grep \"^$1=\" $REMOTE_DIR/.env 2>/dev/null | cut -d= -f2-" || true; }

EXISTING_DB_PASS=$(_remote_get DB_PASSWORD)
EXISTING_SALT=$(_remote_get LITELLM_SALT_KEY)
EXISTING_PCDB_PASS=$(_remote_get PAPERCLIP_DB_PASSWORD)
EXISTING_AUTH_SEC=$(_remote_get BETTER_AUTH_SECRET)
EXISTING_OC_PASS=$(_remote_get OPENCLAW_PASSWORD)
EXISTING_MASTER=$(_remote_get LITELLM_MASTER_KEY)

# Use existing or generate new (first run)
ORACLE_DB_PASS="${EXISTING_DB_PASS:-$(openssl rand -hex 16)}"
ORACLE_SALT="${EXISTING_SALT:-sk-$(openssl rand -hex 32)}"
ORACLE_PCDB_PASS="${EXISTING_PCDB_PASS:-$(openssl rand -hex 16)}"
ORACLE_AUTH_SEC="${EXISTING_AUTH_SEC:-$(openssl rand -hex 32)}"
# Use same OPENCLAW_PASSWORD as EC2 (same site auth)
ORACLE_OC_PASS="${OPENCLAW_PASSWORD:-${EXISTING_OC_PASS:-$(openssl rand -hex 8)}}"
# Use same LITELLM_MASTER_KEY as EC2 (agents carry this key)
ORACLE_MASTER="${LITELLM_MASTER_KEY:-${EXISTING_MASTER:-sk-$(openssl rand -hex 16)}}"

cat > /tmp/oracle-env <<ENVEOF
# Auto-generated by deploy-oracle.sh — $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Do NOT edit ORACLE_DB_PASS, LITELLM_SALT_KEY, PAPERCLIP_DB_PASSWORD,
# or BETTER_AUTH_SECRET after first deploy — they encrypt stored data.

DOMAIN=${DOMAIN:-}
ORACLE_ARM_IP=${ORACLE_IP}

# Application secrets (generated once, preserved on redeploy)
LITELLM_MASTER_KEY=${ORACLE_MASTER}
LITELLM_SALT_KEY=${ORACLE_SALT}
DB_PASSWORD=${ORACLE_DB_PASS}
OPENCLAW_PASSWORD=${ORACLE_OC_PASS}
PAPERCLIP_DB_PASSWORD=${ORACLE_PCDB_PASS}
BETTER_AUTH_SECRET=${ORACLE_AUTH_SEC}

# LLM API keys (synced from local .env)
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

# Optional integrations
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-}
WEBHOOK_ARCHIVE_URL=${WEBHOOK_ARCHIVE_URL:-}
WEBHOOK_ARCHIVE_TOKEN=${WEBHOOK_ARCHIVE_TOKEN:-}

# Auto-deploy webhook (GitHub push → git pull + docker compose up -d)
GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET:-}
DEPLOY_BRANCH=${DEPLOY_BRANCH:-claude/fix-critical-failures-4RPWm}

# Auto-kickoff (send startup message to agents on restart)
OPENCLAW_AUTO_KICKOFF=${OPENCLAW_AUTO_KICKOFF:-1}

# Docker Compose project name
COMPOSE_PROJECT_NAME=ai-hub
ENVEOF

scp $SCP_OPTS /tmp/oracle-env "$SSH_USER@$ORACLE_IP:$REMOTE_DIR/.env"
rm -f /tmp/oracle-env
log_ok ".env generated"

###############################################################################
# 6. Build custom images + pull standard images + start stack
###############################################################################
log_info "Building and starting all services on Oracle ARM..."
ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "
    set -e
    cd $REMOTE_DIR

    echo '[deploy] Pulling standard images...'
    docker compose pull litellm litellm-db searxng openclaw watchtower paperclip-db

    echo '[deploy] Building custom images...'
    docker compose build caddy scrapling webhook paperclip ttyd

    echo '[deploy] Stopping old stack (if any)...'
    docker compose down --remove-orphans 2>/dev/null || true

    echo '[deploy] Starting full stack...'
    docker compose up -d

    echo '[deploy] Stack started'
"
log_ok "Stack started on Oracle ARM"

###############################################################################
# 7. Wait for health checks
###############################################################################
log_info "Waiting for LiteLLM to become healthy (~2 min)..."
for i in $(seq 1 40); do
    if ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "curl -sf http://localhost:4000/health/liveliness" >/dev/null 2>&1; then
        log_ok "LiteLLM is healthy"
        break
    fi
    if [ "$i" -eq 40 ]; then
        log_warn "LiteLLM health check timed out — check: ssh $SSH_USER@$ORACLE_IP 'cd $REMOTE_DIR && docker compose logs litellm'"
    fi
    sleep 5
done

log_info "Waiting for OpenClaw to become healthy (~90s)..."
for i in $(seq 1 30); do
    if ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "curl -sf http://localhost:18789/healthz" >/dev/null 2>&1; then
        log_ok "OpenClaw is healthy"
        break
    fi
    if [ "$i" -eq 30 ]; then
        log_warn "OpenClaw health check timed out — may still be starting (check logs)"
    fi
    sleep 5
done

###############################################################################
# 8. Status report
###############################################################################
echo ""
echo "============================================================"
echo -e "  ${GREEN}Oracle ARM — Full Stack Running!${NC}"
echo "============================================================"
echo ""
ssh $SSH_OPTS "$SSH_USER@$ORACLE_IP" "cd $REMOTE_DIR && docker compose ps --format 'table {{.Name}}\t{{.Status}}' 2>/dev/null || docker compose ps"
echo ""

DOMAIN_VAL="${DOMAIN:-}"
if [ -n "$DOMAIN_VAL" ]; then
    echo "  Site:            https://$DOMAIN_VAL"
    echo "  Mission Control: https://$DOMAIN_VAL/workspace/"
    echo "  OpenClaw:        https://$DOMAIN_VAL/openclaw/"
    echo "  Paperclip:       https://$DOMAIN_VAL/paperclip/"
else
    echo "  Site:            http://$ORACLE_IP  (set DOMAIN in .env for HTTPS)"
fi
echo ""
echo "  Next step: update DNS A record → $ORACLE_IP"
echo ""
echo "  Logs:    ssh $SSH_USER@$ORACLE_IP 'cd $REMOTE_DIR && docker compose logs -f'"
echo "  Restart: ssh $SSH_USER@$ORACLE_IP 'cd $REMOTE_DIR && docker compose restart'"
echo ""
echo "  Once DNS is updated and site is verified, terminate EC2:"
echo "    AWS Console → EC2 → Terminate instance"
echo "    AWS Console → Elastic IPs → Release (avoids ~\$3.60/mo charge)"
echo ""
echo "============================================================"
