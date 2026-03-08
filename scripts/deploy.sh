#!/usr/bin/env bash
###############################################################################
# deploy.sh — Deploy / Update the AI Hub Stack
###############################################################################
# Run from the VPS repo directory:
#   bash scripts/deploy.sh
#
# What this does:
#   1. Validates .env configuration
#   2. Auto-generates secrets if empty
#   3. Pulls latest container images
#   4. Starts the stack
#   5. Waits for health checks
#   6. Prints status and access URL
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

# Must be in repo directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
cd "$REPO_DIR"

echo ""
echo "============================================================"
echo "  VPS AI Hub — Deployment"
echo "============================================================"
echo ""

###############################################################################
# 1. Check .env exists
###############################################################################
if [ ! -f ".env" ]; then
    log_warn ".env file not found. Creating from template..."
    cp .env.example .env
    log_info "Please edit .env with your API keys:"
    echo ""
    echo "    nano .env"
    echo ""
    echo "  Required:"
    echo "    - ANTHROPIC_API_KEY (your Claude API key)"
    echo "    - OPENAI_API_KEY (your ChatGPT API key)"
    echo ""
    echo "  Optional but recommended:"
    echo "    - GROQ_API_KEY (free tier — 1K requests/day)"
    echo "    - DEEPSEEK_API_KEY (very cheap — \$0.14/1M tokens)"
    echo ""
    echo "  After editing, run this script again:"
    echo "    bash scripts/deploy.sh"
    echo ""
    exit 0
fi

# Source .env
set -a
source .env
set +a

###############################################################################
# 2. Validate required keys
###############################################################################
MISSING=0

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    log_warn "ANTHROPIC_API_KEY is empty (Claude won't be available)"
fi

if [ -z "${OPENAI_API_KEY:-}" ]; then
    log_warn "OPENAI_API_KEY is empty (ChatGPT won't be available)"
fi

# At least one API key must be set
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${OPENAI_API_KEY:-}" ] && [ -z "${GROQ_API_KEY:-}" ] && [ -z "${DEEPSEEK_API_KEY:-}" ]; then
    log_error "No API keys configured! At least one provider is required."
    log_error "Edit .env and add at least one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GROQ_API_KEY, DEEPSEEK_API_KEY"
    exit 1
fi

###############################################################################
# 3. Auto-generate secrets if empty
###############################################################################
UPDATED_ENV=false

if [ -z "${LITELLM_MASTER_KEY:-}" ]; then
    MASTER=$(openssl rand -hex 16)
    sed -i "s|^LITELLM_MASTER_KEY=.*|LITELLM_MASTER_KEY=sk-$MASTER|" .env
    log_info "Generated LITELLM_MASTER_KEY"
    UPDATED_ENV=true
elif [[ "${LITELLM_MASTER_KEY}" != sk-* ]]; then
    sed -i "s|^LITELLM_MASTER_KEY=.*|LITELLM_MASTER_KEY=sk-${LITELLM_MASTER_KEY}|" .env
    log_info "Added required sk- prefix to LITELLM_MASTER_KEY"
    UPDATED_ENV=true
fi

if [ -z "${LITELLM_SALT_KEY:-}" ]; then
    SALT=$(openssl rand -hex 32)
    # Add LITELLM_SALT_KEY if not present in .env
    if grep -q "^LITELLM_SALT_KEY=" .env; then
        sed -i "s|^LITELLM_SALT_KEY=.*|LITELLM_SALT_KEY=sk-$SALT|" .env
    else
        echo "LITELLM_SALT_KEY=sk-$SALT" >> .env
    fi
    log_info "Generated LITELLM_SALT_KEY"
    UPDATED_ENV=true
fi

if [ -z "${DB_PASSWORD:-}" ]; then
    # Check if litellm-db-data volume already exists with data.
    # If it does, Postgres already has a bootstrapped password — generating
    # a new one would break the LiteLLM→DB connection on upgrade.
    DB_VOLUME="${COMPOSE_PROJECT_NAME:-ai-hub}_litellm-db-data"
    if docker volume inspect "$DB_VOLUME" > /dev/null 2>&1; then
        log_error "DB_PASSWORD is empty but the database volume '$DB_VOLUME' already exists."
        log_error "Postgres was bootstrapped with a previous password that is no longer in .env."
        log_error "Either:"
        log_error "  1. Set DB_PASSWORD in .env to the original password, OR"
        log_error "  2. Remove the volume to reset: docker volume rm $DB_VOLUME"
        exit 1
    fi

    DBPASS=$(openssl rand -hex 16)
    if grep -q "^DB_PASSWORD=" .env; then
        sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$DBPASS|" .env
    else
        echo "DB_PASSWORD=$DBPASS" >> .env
    fi
    log_info "Generated DB_PASSWORD (first-time setup)"
    UPDATED_ENV=true
fi

if [ -z "${OPENCLAW_PASSWORD:-}" ]; then
    CLAWPASS=$(openssl rand -hex 8)
    if grep -q "^OPENCLAW_PASSWORD=" .env; then
        sed -i "s|^OPENCLAW_PASSWORD=.*|OPENCLAW_PASSWORD=$CLAWPASS|" .env
    else
        echo "OPENCLAW_PASSWORD=$CLAWPASS" >> .env
    fi
    log_info "Generated OPENCLAW_PASSWORD"
    UPDATED_ENV=true
fi

if [ "$UPDATED_ENV" = true ]; then
    # Re-source after updates
    set -a
    source .env
    set +a
fi

###############################################################################
# 4. Generate reference docs (agents read at /workspace/reference/*.md)
###############################################################################
log_info "Generating reference docs for agents..."
if bash scripts/generate-reference-docs.sh; then
    log_ok "Reference docs generated"
else
    log_warn "Reference doc generation failed (non-fatal)"
fi

###############################################################################
# 4b. Oracle ARM bridge — SSH key + auto-derive IP from OLLAMA_BASE_URL
###############################################################################
if [ ! -f oracle-instance-key ]; then
    log_info "Creating placeholder oracle-instance-key (no Oracle provisioned yet)"
    touch oracle-instance-key
    chmod 600 oracle-instance-key
fi
# Auto-populate ORACLE_ARM_IP from OLLAMA_BASE_URL if not already set
if [ -z "${ORACLE_ARM_IP:-}" ] && [ -n "${OLLAMA_BASE_URL:-}" ]; then
    DERIVED_IP=$(echo "$OLLAMA_BASE_URL" | sed -E 's|https?://([^:/]+).*|\1|')
    if [ -n "$DERIVED_IP" ] && [ "$DERIVED_IP" != "localhost" ] && [ "$DERIVED_IP" != "127.0.0.1" ]; then
        echo "ORACLE_ARM_IP=$DERIVED_IP" >> .env
        export ORACLE_ARM_IP="$DERIVED_IP"
        log_ok "Auto-derived ORACLE_ARM_IP=$DERIVED_IP from OLLAMA_BASE_URL"
    fi
fi
if [ -z "${ORACLE_ARM_IP_2:-}" ] && [ -n "${OLLAMA_BASE_URL_2:-}" ]; then
    DERIVED_IP_2=$(echo "$OLLAMA_BASE_URL_2" | sed -E 's|https?://([^:/]+).*|\1|')
    if [ -n "$DERIVED_IP_2" ] && [ "$DERIVED_IP_2" != "localhost" ] && [ "$DERIVED_IP_2" != "127.0.0.1" ]; then
        echo "ORACLE_ARM_IP_2=$DERIVED_IP_2" >> .env
        export ORACLE_ARM_IP_2="$DERIVED_IP_2"
        log_ok "Auto-derived ORACLE_ARM_IP_2=$DERIVED_IP_2 from OLLAMA_BASE_URL_2"
    fi
fi

###############################################################################
# 5. Clean up old Docker images to prevent disk-full failures
###############################################################################
log_info "Cleaning up unused Docker images..."
docker image prune -f > /dev/null 2>&1
log_ok "Cleanup complete"

###############################################################################
# 5. Pull latest images
###############################################################################
log_info "Pulling latest container images (excluding locally-built services)..."
PULL_ATTEMPTS=3
# Explicitly list services that use pre-built images (not caddy/scrapling which have build:)
PULL_SERVICES="litellm litellm-db openclaw"
for i in $(seq 1 $PULL_ATTEMPTS); do
    if docker compose pull $PULL_SERVICES; then
        break
    fi
    if [ "$i" -lt "$PULL_ATTEMPTS" ]; then
        log_warn "Pull failed (attempt $i/$PULL_ATTEMPTS), retrying in 10s..."
        sleep 10
    else
        log_error "Pull failed after $PULL_ATTEMPTS attempts"
        exit 1
    fi
done
log_ok "Images pulled"

###############################################################################
# 5b. Build custom images (caddy with rate-limit, scrapling)
###############################################################################
log_info "Building caddy with rate-limit module..."
if docker compose build caddy; then
    log_ok "Custom caddy image built (with brute force protection)"
else
    log_error "Caddy build failed — check caddy/Dockerfile"
    exit 1
fi

log_info "Building scrapling API service..."
if docker compose build scrapling; then
    log_ok "Scrapling API image built"
else
    log_error "Scrapling build failed — check scrapling/Dockerfile"
    exit 1
fi

###############################################################################
# 6. Start the stack
###############################################################################
log_info "Starting AI Hub stack..."
docker compose up -d
log_ok "Stack started"

###############################################################################
# 7. Wait for health checks
###############################################################################
log_info "Waiting for services to become healthy..."

# Wait for LiteLLM
for i in $(seq 1 30); do
    if docker compose exec -T litellm curl -sf http://localhost:4000/health/liveliness > /dev/null 2>&1; then
        log_ok "LiteLLM is healthy"
        break
    fi
    if [ "$i" -eq 30 ]; then
        log_warn "LiteLLM health check timed out (may still be starting)"
    fi
    sleep 3
done

# Wait for OpenClaw
for i in $(seq 1 30); do
    if docker compose exec -T openclaw wget -qO- http://localhost:18789/openclaw/ > /dev/null 2>&1; then
        log_ok "OpenClaw is healthy"
        break
    fi
    if [ "$i" -eq 30 ]; then
        log_warn "OpenClaw health check timed out (may still be starting)"
    fi
    sleep 3
done

###############################################################################
# 8. Status Report
###############################################################################
echo ""
echo "============================================================"
echo -e "  ${GREEN}AI Hub is running!${NC}"
echo "============================================================"
echo ""

# Show container status
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker compose ps

echo ""

# Determine access URL
DOMAIN="${DOMAIN:-}"
if [ -n "$DOMAIN" ]; then
    echo "  Access URL:  https://$DOMAIN"
else
    # Try to get public IP
    PUBLIC_IP=$(curl -sf http://checkip.amazonaws.com 2>/dev/null || echo "YOUR_IP")
    echo "  Access URL:  http://$PUBLIC_IP"
fi

echo ""
echo "  ── First Time Setup ───────────────────────────────────"
echo "  1. Open the URL above in your browser"
echo "  2. Log in with your site password"
echo "  3. Start chatting or open Mission Control!"
echo ""

# Show configured providers
echo "  ── Configured Providers ───────────────────────────────"
[ -n "${ANTHROPIC_API_KEY:-}" ] && echo "  ✓ Anthropic (Claude)" || echo "  ✗ Anthropic (not configured)"
[ -n "${OPENAI_API_KEY:-}" ]    && echo "  ✓ OpenAI (ChatGPT)"   || echo "  ✗ OpenAI (not configured)"
[ -n "${DEEPSEEK_API_KEY:-}" ]  && echo "  ✓ DeepSeek"           || echo "  ✗ DeepSeek (not configured)"
[ -n "${GROQ_API_KEY:-}" ]      && echo "  ✓ Groq (free tier)"   || echo "  ✗ Groq (not configured)"
[ -n "${OLLAMA_BASE_URL:-}" ]   && echo "  ✓ Ollama ($OLLAMA_BASE_URL)" || echo "  ✗ Ollama (not connected — see README Part 2)"

echo ""
echo "  ── Services ───────────────────────────────────────────"
if [ -n "$DOMAIN" ]; then
    BASE="https://$DOMAIN"
else
    BASE="http://${PUBLIC_IP:-YOUR_IP}"
fi
echo "  Landing Page:    $BASE/"
echo "  Mission Control: $BASE/workspace/"
echo "  OpenClaw Agent:  $BASE/openclaw/"
echo "  LiteLLM API:     $BASE/api/litellm/"
if [ -n "${OPENCLAW_PASSWORD:-}" ]; then
    echo ""
    echo "  OpenClaw password: (saved in .env — run 'grep OPENCLAW_PASSWORD .env' to view)"
fi

echo ""
echo "  ── Useful Commands ────────────────────────────────────"
echo "  View logs:       docker compose logs -f"
echo "  Restart:         docker compose restart"
echo "  Stop:            docker compose down"
echo "  Update images:   docker compose pull && docker compose up -d"
echo ""
echo "============================================================"
