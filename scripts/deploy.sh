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
# 0. Auto-fix misplaced files (HTML/CSS/JS at repo root → workspace/)
###############################################################################
MISPLACED=0
for f in "$REPO_DIR"/*.html "$REPO_DIR"/*.css; do
    [ -e "$f" ] || continue
    fname="$(basename "$f")"
    # Skip known root files
    case "$fname" in
        docker-compose*|Caddyfile*|*.yaml|*.yml|*.md|*.sh|*.example) continue ;;
    esac
    log_warn "Misplaced file at repo root: $fname → moving to workspace/"
    mv "$f" "$REPO_DIR/workspace/$fname"
    MISPLACED=$((MISPLACED + 1))
done
if [ "$MISPLACED" -gt 0 ]; then
    log_info "Moved $MISPLACED file(s) from repo root to workspace/"
fi

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

if [ -z "${PAPERCLIP_DB_PASSWORD:-}" ]; then
    PCDBPASS=$(openssl rand -hex 16)
    if grep -q "^PAPERCLIP_DB_PASSWORD=" .env; then
        sed -i "s|^PAPERCLIP_DB_PASSWORD=.*|PAPERCLIP_DB_PASSWORD=$PCDBPASS|" .env
    else
        echo "PAPERCLIP_DB_PASSWORD=$PCDBPASS" >> .env
    fi
    log_info "Generated PAPERCLIP_DB_PASSWORD"
    UPDATED_ENV=true
fi

if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
    AUTHSEC=$(openssl rand -hex 32)
    if grep -q "^BETTER_AUTH_SECRET=" .env; then
        sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$AUTHSEC|" .env
    else
        echo "BETTER_AUTH_SECRET=$AUTHSEC" >> .env
    fi
    log_info "Generated BETTER_AUTH_SECRET"
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

log_info "Generating OpenClaw reference library..."
if bash scripts/generate-openclaw-reference.sh --check-updates; then
    log_ok "OpenClaw reference library updated"
else
    log_warn "OpenClaw reference generation skipped or failed (non-fatal)"
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
# Auto-populate Oracle service URLs from ORACLE_ARM_IP if not already set.
# IMPORTANT: Use the oracle-tunnel Docker service name (not the direct IP) so all
# Oracle traffic flows through the SSH tunnel. Oracle Cloud VCN Security Lists block
# inbound traffic on ports 4000/8000/8080 by default — the tunnel bypasses this
# by routing through SSH port 22 (which is always open).
if [ -n "${ORACLE_ARM_IP:-}" ]; then
    if [ -z "${ORACLE_LITELLM_URL:-}" ]; then
        ORACLE_LITELLM_URL="http://oracle-tunnel:4000"
        if grep -q "^ORACLE_LITELLM_URL=" .env; then
            sed -i "s|^ORACLE_LITELLM_URL=.*|ORACLE_LITELLM_URL=$ORACLE_LITELLM_URL|" .env
        else
            echo "ORACLE_LITELLM_URL=$ORACLE_LITELLM_URL" >> .env
        fi
        export ORACLE_LITELLM_URL
        log_ok "Auto-derived ORACLE_LITELLM_URL=$ORACLE_LITELLM_URL (via SSH tunnel)"
    elif [[ "$ORACLE_LITELLM_URL" == "http://${ORACLE_ARM_IP}:"* ]]; then
        # Migrate from old direct-IP URL to tunnel URL (Oracle VCN blocks direct access)
        log_warn "ORACLE_LITELLM_URL points to Oracle IP directly ($ORACLE_LITELLM_URL)"
        log_warn "Migrating to SSH tunnel URL (Oracle VCN Security Lists block port 4000)"
        ORACLE_LITELLM_URL="http://oracle-tunnel:4000"
        sed -i "s|^ORACLE_LITELLM_URL=.*|ORACLE_LITELLM_URL=$ORACLE_LITELLM_URL|" .env
        export ORACLE_LITELLM_URL
        log_ok "Updated ORACLE_LITELLM_URL=$ORACLE_LITELLM_URL"
    fi
    if [ -z "${ORACLE_SCRAPLING_URL:-}" ]; then
        ORACLE_SCRAPLING_URL="http://oracle-tunnel:8000"
        if grep -q "^ORACLE_SCRAPLING_URL=" .env; then
            sed -i "s|^ORACLE_SCRAPLING_URL=.*|ORACLE_SCRAPLING_URL=$ORACLE_SCRAPLING_URL|" .env
        else
            echo "ORACLE_SCRAPLING_URL=$ORACLE_SCRAPLING_URL" >> .env
        fi
        export ORACLE_SCRAPLING_URL
        log_ok "Auto-derived ORACLE_SCRAPLING_URL=$ORACLE_SCRAPLING_URL (via SSH tunnel)"
    elif [[ "$ORACLE_SCRAPLING_URL" == "http://${ORACLE_ARM_IP}:"* ]]; then
        ORACLE_SCRAPLING_URL="http://oracle-tunnel:8000"
        sed -i "s|^ORACLE_SCRAPLING_URL=.*|ORACLE_SCRAPLING_URL=$ORACLE_SCRAPLING_URL|" .env
        export ORACLE_SCRAPLING_URL
        log_ok "Updated ORACLE_SCRAPLING_URL=$ORACLE_SCRAPLING_URL"
    fi
    if [ -z "${ORACLE_SEARXNG_URL:-}" ]; then
        ORACLE_SEARXNG_URL="http://oracle-tunnel:8080"
        if grep -q "^ORACLE_SEARXNG_URL=" .env; then
            sed -i "s|^ORACLE_SEARXNG_URL=.*|ORACLE_SEARXNG_URL=$ORACLE_SEARXNG_URL|" .env
        else
            echo "ORACLE_SEARXNG_URL=$ORACLE_SEARXNG_URL" >> .env
        fi
        export ORACLE_SEARXNG_URL
        log_ok "Auto-derived ORACLE_SEARXNG_URL=$ORACLE_SEARXNG_URL (via SSH tunnel)"
    elif [[ "$ORACLE_SEARXNG_URL" == "http://${ORACLE_ARM_IP}:"* ]]; then
        ORACLE_SEARXNG_URL="http://oracle-tunnel:8080"
        sed -i "s|^ORACLE_SEARXNG_URL=.*|ORACLE_SEARXNG_URL=$ORACLE_SEARXNG_URL|" .env
        export ORACLE_SEARXNG_URL
        log_ok "Updated ORACLE_SEARXNG_URL=$ORACLE_SEARXNG_URL"
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
# 5. Clean up orphaned containers and old Docker images
###############################################################################
log_info "Stopping orphaned containers from previous runs..."
docker compose down --remove-orphans 2>/dev/null || true
log_ok "Orphan cleanup complete"

log_info "Cleaning up unused Docker images..."
docker image prune -f > /dev/null 2>&1
log_ok "Image cleanup complete"

###############################################################################
# 5. Pull latest images
###############################################################################
log_info "Pulling latest container images..."
PULL_ATTEMPTS=3
# LiteLLM, Scrapling, SearXNG migrated to Oracle ARM — only pull EC2 services
PULL_SERVICES="openclaw watchtower"
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

log_info "Building webhook handler..."
if docker compose build webhook; then
    log_ok "Webhook handler image built"
else
    log_error "Webhook build failed — check webhook/Dockerfile"
    exit 1
fi

log_info "Building Paperclip (from source — this may take a few minutes on first build)..."
if docker compose build paperclip; then
    log_ok "Paperclip image built"
else
    log_warn "Paperclip build failed (non-fatal — core services will still start)"
fi
log_info "Pulling Paperclip database image..."
docker compose pull paperclip-db || true

###############################################################################
# 6. Start the stack
###############################################################################
log_info "Starting AI Hub stack..."
docker compose up -d
log_ok "Stack started"

# Force-recreate Caddy to ensure ORACLE_LITELLM_URL env var is picked up.
# Docker Compose normally detects env changes, but reverse-proxy upstream bugs
# (e.g. stale {$ORACLE_LITELLM_HOST} pointing at localhost:4000) are invisible
# from the outside — MC just shows "API disconnected" with no hint why.
# Recreating Caddy on every deploy is cheap (<5s) and guarantees fresh env.
if [ -n "${ORACLE_LITELLM_URL:-}" ]; then
    log_info "Recreating caddy to apply ORACLE_LITELLM_URL=$ORACLE_LITELLM_URL ..."
    docker compose up -d --force-recreate --no-deps caddy > /dev/null 2>&1 || true
    # Prove the container actually got the var
    CADDY_UPSTREAM=$(docker compose exec -T caddy printenv ORACLE_LITELLM_URL 2>/dev/null || echo "")
    if [ "$CADDY_UPSTREAM" = "$ORACLE_LITELLM_URL" ]; then
        log_ok "Caddy upstream: $CADDY_UPSTREAM"
    else
        log_warn "Caddy ORACLE_LITELLM_URL mismatch (got: '$CADDY_UPSTREAM', expected: '$ORACLE_LITELLM_URL')"
    fi
fi

###############################################################################
# 7. Wait for health checks
###############################################################################
log_info "Waiting for services to become healthy..."

# Check LiteLLM on Oracle ARM (remote health check)
LITELLM_URL="${ORACLE_LITELLM_URL:-}"
if [ -n "$LITELLM_URL" ]; then
    # oracle-tunnel URLs (docker service names) are only resolvable inside Docker,
    # not from the host shell. Test via docker compose exec instead.
    if echo "$LITELLM_URL" | grep -q "oracle-tunnel"; then
        log_info "Checking LiteLLM via oracle-tunnel ($LITELLM_URL)..."
        if docker compose exec -T caddy wget -qO- http://oracle-tunnel:4000/health/liveliness > /dev/null 2>&1; then
            log_ok "LiteLLM is reachable through oracle-tunnel SSH tunnel"
        else
            log_warn "oracle-tunnel not responding yet — check: docker compose logs oracle-tunnel"
            log_warn "If SSH key is valid, tunnel connects within 30s of container start"
        fi
    else
        log_info "Checking LiteLLM on Oracle ARM ($LITELLM_URL)..."
        if curl -sf "$LITELLM_URL/health/liveliness" > /dev/null 2>&1; then
            log_ok "LiteLLM is healthy on Oracle ARM"
        else
            log_warn "LiteLLM on Oracle ARM not responding — run: bash scripts/deploy-oracle.sh"
        fi
    fi
else
    log_warn "ORACLE_LITELLM_URL not set — LiteLLM must be deployed to Oracle ARM"
fi

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
echo "  Paperclip:       $BASE/paperclip/"
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
