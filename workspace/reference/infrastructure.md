# Infrastructure Reference
> Auto-generated. Source files: docker-compose.yml, Caddyfile, deploy.sh
> Read this when you need to understand how services are configured,
> how routing works, or how deployments happen.

## docker-compose.yml
```yaml
###############################################################################
# Docker Compose — VPS Unified AI Hub
###############################################################################
# Core services (always running):
#   - caddy:      Reverse proxy + auto-HTTPS + landing page
#   - litellm:    Multi-provider API gateway
#   - openclaw:   Autonomous AI agent (24/7 background tasks)
#
# Optional profiles:
#   - ollama (profile: local-models): Only if running Ollama on THIS server (GPU instance recommended)
#     Enable with: docker compose --profile local-models up -d
#
# Start core stack:  docker compose up -d
# View logs:         docker compose logs -f
# Stop:              docker compose down
###############################################################################

services:

  # ===========================================================================
  # Caddy — Reverse Proxy + Auto-HTTPS
  # ===========================================================================
  caddy:
    build:
      context: ./caddy
      dockerfile: Dockerfile
    image: in-fused/caddy:latest
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"  # HTTP/3
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./scripts:/opt/scripts:ro
      - caddy-data:/data
      - caddy-config:/config
      - agent-workspace:/srv/workspace:ro
    command: ["/bin/sh", "/opt/scripts/caddy-entrypoint.sh"]
    environment:
      - DOMAIN=${DOMAIN:-}
      - WORKSPACE_PASSWORD=${OPENCLAW_PASSWORD}
      - LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}
    networks:
      - ai-net
    depends_on:
      - litellm
    deploy:
      resources:
        limits:
          memory: 64M

  # ===========================================================================
  # LiteLLM Database — PostgreSQL
  # ===========================================================================
  # Required by LiteLLM for Prisma migrations, virtual keys, and spend tracking.
  litellm-db:
    image: postgres:16-alpine
    container_name: litellm-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: litellm
      POSTGRES_USER: llmproxy
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - litellm-db-data:/var/lib/postgresql/data
    networks:
      - ai-net
    deploy:
      resources:
        limits:
          memory: 128M
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U llmproxy -d litellm"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  # ===========================================================================
  # LiteLLM — Multi-Provider API Gateway
  # ===========================================================================
  # Routes requests to the cheapest adequate model.
  # Supports Claude, ChatGPT, DeepSeek, Groq, Ollama, and more.
  litellm:
    image: ghcr.io/berriai/litellm:main-stable
    container_name: litellm
    restart: unless-stopped
    volumes:
      - ./litellm_config.yaml:/app/config.yaml:ro
    command: ["--config", "/app/config.yaml", "--port", "4000"]
    environment:
      - DATABASE_URL=postgresql://llmproxy:${DB_PASSWORD}@litellm-db:5432/litellm
      - STORE_MODEL_IN_DB=True
      - LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}
      - LITELLM_SALT_KEY=${LITELLM_SALT_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY:-}
      - GROQ_API_KEY=${GROQ_API_KEY:-}
      - GROQ_API_KEY_2=${GROQ_API_KEY_2:-}
      - GROQ_API_KEY_3=${GROQ_API_KEY_3:-}
      - GROQ_API_KEY_4=${GROQ_API_KEY_4:-}
      - MINIMAX_API_KEY=${MINIMAX_API_KEY:-}
      - CEREBRAS_API_KEY=${CEREBRAS_API_KEY:-}
      - GEMINI_API_KEY=${GEMINI_API_KEY:-}
      - GEMINI_API_KEY_2=${GEMINI_API_KEY_2:-}
      - GEMINI_API_KEY_3=${GEMINI_API_KEY_3:-}
      - MISTRAL_API_KEY=${MISTRAL_API_KEY:-}
      - OLLAMA_BASE_URL=${OLLAMA_BASE_URL:-}
    networks:
      - ai-net
    depends_on:
      litellm-db:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 512M
    healthcheck:
      test:
        - CMD-SHELL
        - "python3 -c \"import urllib.request; urllib.request.urlopen('http://localhost:4000/health/liveliness')\""
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # ===========================================================================
  # OpenClaw Init — Fix volume ownership on fresh deploys
  # ===========================================================================
  # Named volumes are root-owned when first created. OpenClaw runs as the
  # 'node' user (UID 1000) and needs write access to its data directory.
  # This one-shot container ensures correct ownership before OpenClaw starts.
  openclaw-init:
    image: alpine:3
    container_name: openclaw-init
    volumes:
      - openclaw-data:/data
    command: chown -R 1000:1000 /data
    restart: "no"

  # ===========================================================================
  # OpenClaw — Autonomous AI Agent (24/7)
  # ===========================================================================
  # Open-source autonomous AI agent (Node.js). Connects to LLM providers
  # and messaging platforms (Telegram, Discord, WhatsApp, Signal, etc.)
  #
  # FIRST RUN: After 'docker compose up -d', run the onboarding wizard:
  #   docker compose exec -it openclaw node openclaw.mjs onboard
  #
  # Web interface available at /openclaw/ via Caddy reverse proxy.
  # Agent workspace served at /workspace/ — agents can create pages and features here.
  # Config persisted in openclaw-data volume (~/.openclaw/).
  # See README Part 4 for full setup guide.
  openclaw:
    image: ghcr.io/openclaw/openclaw:main
    container_name: openclaw
    restart: unless-stopped
    volumes:
      - openclaw-data:/home/node/.openclaw
      - agent-workspace:/workspace
      - ./scripts:/opt/scripts:ro
      # Oracle ARM SSH key — agents use exec ssh to access Oracle for builds/deploys
      - ./oracle-instance-key:/opt/oracle/ssh-key:ro
    command: ["/bin/sh", "/opt/scripts/openclaw-entrypoint.sh"]
    environment:
      # Skip entry.js respawn — we supply the V8 flags and warning suppression directly
      - OPENCLAW_NODE_OPTIONS_READY=1
      - NODE_OPTIONS=--max-old-space-size=1024 --disable-warning=ExperimentalWarning
      # Gateway auth — password required to access the /openclaw/ web UI
      - OPENCLAW_GATEWAY_PASSWORD=${OPENCLAW_PASSWORD}
      # Domain for OpenClaw allowedOrigins (v2026.2.24+ requirement)
      - DOMAIN=${DOMAIN:-}
      # Route everything through LiteLLM — no direct provider keys needed
      - OPENAI_API_KEY=${LITELLM_MASTER_KEY}
      - OPENAI_API_BASE_URL=http://litellm:4000/v1
      # v2026.3.2: plaintext ws:// restricted to loopback by default.
      # Docker bridge network is private (not loopback) — Caddy proxies
      # to openclaw:18789 via ws:// on the bridge. Without this, internal
      # WebSocket connections fail with connection refused.
      - OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1
      # Reduce overhead on low-power VMs (t3.small) — skip process respawning
      - OPENCLAW_NO_RESPAWN=1
      # Auto-kickoff: send startup messages to leads on restart (opt-in)
      - OPENCLAW_AUTO_KICKOFF=${OPENCLAW_AUTO_KICKOFF:-1}
      - OPENCLAW_PASSWORD=${OPENCLAW_PASSWORD}
      # Oracle Cloud ARM — agents SSH here for builds, deploys, background compute
      - ORACLE_ARM_IP=${ORACLE_ARM_IP:-}
      - ORACLE_ARM_IP_2=${ORACLE_ARM_IP_2:-}
      # Telegram bot integration (optional — set in .env)
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-}
    networks:
      - ai-net
    depends_on:
      openclaw-init:
        condition: service_completed_successfully
      litellm:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 1536M
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:18789/healthz || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 90s

  # ===========================================================================
  # Scrapling — Web Scraping API for Agents
  # ===========================================================================
  # Lightweight HTTP API wrapping the Scrapling library.
  # Agents call: exec wget -qO- 'http://scrapling:8000/scrape?url=...'
  # Modes: "fast" (curl_cffi, ~50MB), "stealth" (Patchright, ~300MB), "browser" (Playwright, ~300MB).
  scrapling:
    build:
      context: ./scrapling
      dockerfile: Dockerfile
    image: in-fused/scrapling:latest
    container_name: scrapling
    restart: unless-stopped
    networks:
      - ai-net
    deploy:
      resources:
        limits:
          memory: 512M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s

  # ===========================================================================
  # Workspace Init — Seeds the agent workspace volume with placeholder content
  # ===========================================================================
  # Runs once on deploy to sync workspace/ seed files into the shared volume.
  # Always copies seed files (so Mission Control updates are deployed).
  # Agent-created files in other paths are preserved.
  workspace-init:
    image: alpine:3
    container_name: workspace-init
    volumes:
      - ./workspace:/seed:ro
      - agent-workspace:/workspace
    command: >
      sh -c "cp -r /seed/. /workspace/ &&
        mkdir -p /workspace/agent-workflows /workspace/agent-workflows/results /workspace/staging /workspace/agent-activity /workspace/mc-state /workspace/prompts &&
        [ -f /workspace/agent-workflows/index.json ] || echo '{\"workflows\":[]}' > /workspace/agent-workflows/index.json &&
        [ -f /workspace/agent-workflows/results/index.json ] || echo '{\"results\":[]}' > /workspace/agent-workflows/results/index.json &&
        [ -f /workspace/staging/index.json ] || echo '{\"items\":[]}' > /workspace/staging/index.json &&
        [ -f /workspace/agent-activity/log.json ] || echo '{\"events\":[]}' > /workspace/agent-activity/log.json &&
        [ -f /workspace/mc-state/governance.json ] || echo '{\"agents\":{},\"teams\":[],\"updatedAt\":0}' > /workspace/mc-state/governance.json &&
        chown -R 1000:1000 /workspace/agent-workflows /workspace/agent-workflows/results /workspace/staging /workspace/agent-activity /workspace/mc-state /workspace/prompts &&
        echo 'Workspace synced + bridge dirs ready (owned by node:1000)'"
    restart: "no"

  # ===========================================================================
  # Ollama — Local LLM Server (OPTIONAL — for same-box deployment)
  # ===========================================================================
  # Only enable if running Ollama on THIS server (GPU instance recommended).
  # For Oracle Cloud deployment, use scripts/setup-ollama-server.sh instead.
  #
  # Enable with: docker compose --profile local-models up -d
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    restart: unless-stopped
    profiles:
      - local-models
    volumes:
      - ollama-data:/root/.ollama
    networks:
      - ai-net
    deploy:
      resources:
        limits:
          memory: 4G

# =============================================================================
# Networks
# =============================================================================
networks:
  ai-net:
    driver: bridge
    name: ai-hub-network

# =============================================================================
# Volumes
# =============================================================================
volumes:
  caddy-data:
  caddy-config:
  litellm-db-data:
  openclaw-data:
  agent-workspace:
  ollama-data:
```

## Caddyfile (reverse proxy)
```
# =============================================================================
# Caddyfile — Reverse Proxy for AI Hub
# =============================================================================
# When DOMAIN is set in .env: automatic HTTPS via Let's Encrypt
# When DOMAIN is empty: HTTP on port 80 (access via IP address)
# =============================================================================

{
	# Rate limit must execute before authentication checks
	order rate_limit before basic_auth
}

{$DOMAIN::80} {

	# =========================================================================
	# Brute Force Protection — Rate Limiting
	# =========================================================================
	# Requires custom Caddy build with github.com/mholt/caddy-ratelimit.
	# Limits /auth/verify to 5 attempts per minute per IP — enough for
	# legitimate use (typos, password managers) but blocks automated attacks.
	# Also applies a general site-wide limit as secondary defense.
	rate_limit {
		zone auth_bruteforce {
			match {
				path /auth/verify
			}
			key    {remote_host}
			events 5
			window 1m
		}
		zone site_general {
			key    {remote_host}
			events 100
			window 1m
		}
		log_key
	}

	# Custom 429 response for rate-limited requests
	handle_errors {
		@ratelimited expression `{err.status_code} == 429`
		handle @ratelimited {
			header Content-Type "text/plain"
			respond "Too many requests. Please wait and try again." 429
		}
	}

	# =========================================================================
	# Security Headers
	# =========================================================================
	header {
		# HSTS — force HTTPS for 2 years, prevent SSL stripping attacks
		Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
		# Prevent clickjacking
		X-Frame-Options "SAMEORIGIN"
		# Prevent MIME type sniffing
		X-Content-Type-Options "nosniff"
		# Referrer policy
		Referrer-Policy "strict-origin-when-cross-origin"
		# Content Security Policy — allow self, CDN assets, Google Fonts, inline for Alpine/Tailwind
		Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' wss://{host} ws://{host}; frame-ancestors 'self'"
		# Restrict browser features — deny access to hardware APIs not needed by Mission Control
		Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()"
		# Remove server identification
		-Server
	}

	# =========================================================================
	# Auth Verification Endpoint — /auth/verify
	# =========================================================================
	# Server-side password verification via direct header comparison.
	# No basicauth directive = no WWW-Authenticate header = no browser popup.
	# Auth pages send credentials via fetch() with Authorization: Basic header.
	# caddy-entrypoint.sh pre-computes the expected base64 token.
	# When WORKSPACE_PASSWORD is unset, always returns OK (no auth).
	handle /auth/verify {
		@noauth expression `"{$WORKSPACE_AUTH_ENABLED}" == "false"`
		respond @noauth "OK" 200

		@valid header Authorization "Basic {$WORKSPACE_AUTH_B64}"
		respond @valid "OK" 200
		respond "Unauthorized" 401
	}

	# =========================================================================
	# Mission Control API — /api/mc/* (cookie-gated LiteLLM proxy)
	# =========================================================================
	# Authenticated proxy for Mission Control to call LiteLLM's chat API.
	# Requires the mc_oc auth cookie. Injects the LiteLLM master key so
	# the browser never needs to know it. Supports streaming (SSE).
	handle_path /api/mc/* {
		# When auth is disabled, proxy unconditionally
		@mc_noauth expression `"{$WORKSPACE_AUTH_ENABLED}" == "false"`
		handle @mc_noauth {
			reverse_proxy litellm:4000 {
				header_up Authorization "Bearer {$LITELLM_MASTER_KEY}"
				flush_interval -1
			}
		}

		@mc_authed header Cookie *mc_oc={$WORKSPACE_PASS_SHA256}*
		handle @mc_authed {
			reverse_proxy litellm:4000 {
				header_up Authorization "Bearer {$LITELLM_MASTER_KEY}"
				flush_interval -1
			}
		}
		handle {
			respond "Unauthorized" 401
		}
	}

	# =========================================================================
	# LiteLLM API Gateway — /api/litellm/* (cookie-gated)
	# =========================================================================
	# Previously unprotected — now requires the same mc_oc cookie as all
	# other authenticated routes. Without this, anyone could hit LiteLLM
	# directly and potentially enumerate models or make API calls.
	handle_path /api/litellm/* {
		@litellm_noauth expression `"{$WORKSPACE_AUTH_ENABLED}" == "false"`
		handle @litellm_noauth {
			reverse_proxy litellm:4000 {
				flush_interval -1
			}
		}

		@litellm_authed header Cookie *mc_oc={$WORKSPACE_PASS_SHA256}*
		handle @litellm_authed {
			reverse_proxy litellm:4000 {
				flush_interval -1
			}
		}
		handle {
			respond "Unauthorized" 401
		}
	}

	# =========================================================================
	# OpenClaw Web UI + WebSocket Gateway — /openclaw/*
	# =========================================================================
	# Cookie-based auth gate: caddy-entrypoint.sh exports WORKSPACE_PASS_SHA256,
	# unauthenticated requests get a login page, authenticated get proxied.
	# flush_interval -1 disables response buffering (required for WebSocket/SSE).
	# header_down strips upstream frame-blocking headers for iframe embedding.
	@openclawbare path /openclaw
	redir @openclawbare /openclaw/ 301
	handle /openclaw/* {
		# When auth is disabled, proxy unconditionally
		@oc_noauth expression `"{$WORKSPACE_AUTH_ENABLED}" == "false"`
		handle @oc_noauth {
			reverse_proxy openclaw:18789 {
				header_up X-Real-IP {remote_host}
				header_up X-Forwarded-For {remote_host}
				header_up X-Forwarded-Proto {scheme}
				header_down -X-Frame-Options
				header_down -Content-Security-Policy
				flush_interval -1
			}
		}

		@oc_authed header Cookie *mc_oc={$WORKSPACE_PASS_SHA256}*
		handle @oc_authed {
			reverse_proxy openclaw:18789 {
				header_up X-Real-IP {remote_host}
				header_up X-Forwarded-For {remote_host}
				header_up X-Forwarded-Proto {scheme}
				header_down -X-Frame-Options
				header_down -Content-Security-Policy
				flush_interval -1
			}
		}

		handle {
			rewrite * /openclaw-auth.html
			templates
			header Cache-Control "no-store, no-cache, must-revalidate"
			root * /srv/workspace
			file_server
		}
	}

	# =========================================================================
	# Mission Control WebSocket — /ws/openclaw (dedicated, conflict-free)
	# =========================================================================
	# Dedicated WebSocket path for Mission Control → OpenClaw gateway.
	# handle_path strips /ws/openclaw so OpenClaw receives connections at /
	# (which is what its gateway expects). This avoids conflicts with
	# Open WebUI's root path and the @openclawws legacy matcher below.
	#
	# NOTE: No cookie check here. iOS Safari does not reliably send
	# SameSite=Lax cookies with WebSocket upgrade requests, causing the
	# connection to be rejected at the Caddy level. OpenClaw has its own
	# password authentication via the WebSocket handshake, so the cookie
	# check is redundant — removing it fixes iOS while maintaining security.
	handle_path /ws/openclaw {
		@wsmc_upgrade header Upgrade websocket
		handle @wsmc_upgrade {
			reverse_proxy openclaw:18789 {
				header_up X-Real-IP {remote_host}
				header_up X-Forwarded-For {remote_host}
				header_up X-Forwarded-Proto {scheme}
				flush_interval -1
			}
		}

		handle {
			respond "Unauthorized" 403
		}
	}

	# =========================================================================
	# OpenClaw WebSocket — root path upgrade (legacy / native Control UI)
	# =========================================================================
	# The native OpenClaw Control UI connects its WebSocket to wss://host/
	# (root path, ignoring basePath). Kept for backward compatibility when
	# accessing /openclaw/ directly. Mission Control uses /ws/openclaw above.
	#
	# No cookie check — same iOS Safari fix as /ws/openclaw above.
	# OpenClaw handles its own password auth via WebSocket handshake.
	@openclawws {
		path /
		header Upgrade websocket
	}
	handle @openclawws {
		reverse_proxy openclaw:18789 {
			header_up X-Real-IP {remote_host}
			header_up X-Forwarded-For {remote_host}
			header_up X-Forwarded-Proto {scheme}
			flush_interval -1
		}
	}

	# =========================================================================
	# Agent Workspace (Mission Control) — /workspace/*
	# =========================================================================
	# Cookie-gated like all other protected paths. Unauthenticated requests
	# get the login page. This prevents direct access to app.js (agent
	# configs/prompts), agent-workflows/, staging/, and activity logs.
	# Bare /workspace redirects to /workspace/ for direct URL access.
	@workspacebare path /workspace
	redir @workspacebare /workspace/ 301
	handle_path /workspace/* {
		# No `templates` directive — workspace serves arbitrary agent-generated
		# files that may contain {{ }} syntax (Vue, Handlebars, Alpine, etc.)
		# which Caddy would misinterpret as Go template expressions.

		# When auth is disabled, serve unconditionally
		@ws_noauth expression `"{$WORKSPACE_AUTH_ENABLED}" == "false"`
		handle @ws_noauth {
			header Cache-Control "no-store, no-cache, must-revalidate"
			root * /srv/workspace
			file_server
		}

		@ws_authed header Cookie *mc_oc={$WORKSPACE_PASS_SHA256}*
		handle @ws_authed {
			header Cache-Control "no-store, no-cache, must-revalidate"
			root * /srv/workspace
			file_server
		}

		handle {
			rewrite * /auth.html
			header Cache-Control "no-store, no-cache, must-revalidate"
			root * /srv/workspace
			file_server
		}
	}

	# =========================================================================
	# Landing Page — Chat + Hub Directory (replaces Open WebUI)
	# =========================================================================
	# Gated behind the same mc_oc cookie as /openclaw/ and /workspace/.
	# Unauthenticated visitors see the login page (auth.html).
	# Authenticated visitors see landing.html (quick chat + site directory).
	handle {
		@root_noauth expression `"{$WORKSPACE_AUTH_ENABLED}" == "false"`
		handle @root_noauth {
			rewrite * /landing.html
			header Cache-Control "no-store, no-cache, must-revalidate"
			root * /srv/workspace
			file_server
		}

		@root_authed header Cookie *mc_oc={$WORKSPACE_PASS_SHA256}*
		handle @root_authed {
			rewrite * /landing.html
			header Cache-Control "no-store, no-cache, must-revalidate"
			root * /srv/workspace
			file_server
		}

		handle {
			rewrite * /auth.html
			header Cache-Control "no-store, no-cache, must-revalidate"
			root * /srv/workspace
			file_server
		}
	}

	# =========================================================================
	# Logging
	# =========================================================================
	log {
		output file /data/access.log {
			roll_size 10mb
			roll_keep 3
		}
	}
}
```

## deploy.sh (deployment script)
```bash
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
```
