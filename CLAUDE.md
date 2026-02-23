# CLAUDE.md — in-fused.org VPS Project Context

## What This Project Is

**in-fused.org** is a self-hosted, multi-agent AI hub running on a low-cost AWS EC2 t3.small (~$25/month total). It aggregates multiple LLM providers (Claude, GPT, DeepSeek, Groq, local Ollama) behind a single web interface with an autonomous AI agent running 24/7. Domain: `in-fused.org`.

## Architecture Overview

```
Internet → https://in-fused.org
              │
              ▼
  AWS EC2 t3.small (2 vCPU, 2GB RAM, 4GB swap, 30GB gp3)
    │
    ├── Caddy (reverse proxy, auto-HTTPS via Let's Encrypt)
    │     ├── /                    → portal/index.html (3D miniverse landing page)
    │     ├── /chat, /auth, etc.   → Open WebUI :8080 (ChatGPT-like SPA)
    │     ├── /api/litellm/*       → LiteLLM :4000 (multi-provider API gateway)
    │     ├── /openclaw/*          → OpenClaw :18789 (agent UI + API)
    │     ├── / (WebSocket upgrade)→ OpenClaw :18789 (root WebSocket)
    │     └── /workspace/*         → Static files from agent-workspace volume
    │
    ├── Open WebUI → LiteLLM (http://litellm:4000/v1)
    ├── LiteLLM → Anthropic, OpenAI, DeepSeek, Groq, MiniMax, Ollama
    │     └── PostgreSQL (litellm-db:5432)
    ├── OpenClaw → LiteLLM (NOT direct to providers)
    │     └── Default model: litellm/gpt-4o-mini
    └── Docker network: ai-hub-network (bridge)

Oracle Cloud ARM (FREE FOREVER, separate server)
    └── Ollama (24GB RAM) — qwen2.5-coder:14b, deepseek-coder-v2:16b, llama3.2:8b
        └── Firewall: only accepts connections from EC2 IP on port 11434
```

## File Structure

```
VPS/
├── CLAUDE.md                        ← This file
├── .env                             ← Live secrets (API keys, passwords)
├── .env.example                     ← Template for .env
├── .gitignore
├── Caddyfile                        ← Reverse proxy routing config
├── docker-compose.yml               ← 8 services (7 core + 1 optional)
├── litellm_config.yaml              ← 15 models in 5 cost tiers
├── README.md                        ← 651-line setup guide (Windows/PowerShell focused)
├── portal/
│   └── index.html                   ← 3D miniverse landing page (796 lines, served at /)
├── workspace/
│   └── index.html                   ← "Neural Fusion" agent workspace page (563 lines)
└── scripts/
    ├── deploy.sh                    ← Stack deployment (pulls images, generates secrets, health checks)
    ├── setup-server.sh              ← Server hardening (SSH, UFW, fail2ban, Docker, swap)
    ├── setup-ollama-server.sh       ← Oracle Cloud Ollama server setup
    ├── openclaw-entrypoint.sh       ← OpenClaw container entrypoint (config patching)
    └── patch-openclaw-config.js     ← Standalone OpenClaw config patcher
```

## Docker Services (docker-compose.yml)

| Service | Image | Memory Limit | Port | Purpose |
|---------|-------|-------------|------|---------|
| `caddy` | caddy:2-alpine | 64M | 80, 443 | Reverse proxy + auto-HTTPS |
| `open-webui` | ghcr.io/open-webui/open-webui:main | 768M | 8080 | ChatGPT-like frontend |
| `litellm` | ghcr.io/berriai/litellm:main-stable | 512M | 4000 | Multi-provider API gateway |
| `litellm-db` | postgres:16-alpine | 128M | 5432 | PostgreSQL for LiteLLM |
| `openclaw-init` | alpine:3 | — | — | One-shot: fix openclaw-data volume ownership |
| `openclaw` | ghcr.io/openclaw/openclaw:main | 1536M | 18789 | Autonomous AI agent (24/7) |
| `workspace-init` | alpine:3 | — | — | One-shot: seeds workspace volume |
| `ollama` (optional) | ollama/ollama:latest | 4G | — | Local LLM (profile: local-models) |

**Total memory budget: ~3GB** (exceeds 2GB RAM, relies on 4GB swap).

## Caddy Routing (Caddyfile)

Routes are evaluated top-to-bottom with first-match:

1. `/api/litellm/*` → `handle_path` strips prefix → litellm:4000
2. `/openclaw` bare → 301 redirect to `/openclaw/`
3. `/openclaw/*` → `handle` preserves prefix → openclaw:18789 (strips X-Frame-Options and CSP headers for iframe embedding)
4. `/ + Upgrade: websocket` → `@openclawws` matcher → openclaw:18789 (OpenClaw WebSocket; Open WebUI uses `/socket.io/`)
5. `/workspace/*` → `handle_path` strips prefix → static files from /srv/workspace
6. `/` exact, non-WebSocket → `@portal` matcher → static file /srv/portal/index.html (miniverse landing page)
7. Everything else (fallthrough `handle`) → open-webui:8080 (SPA routes: /chat, /auth, /_app/*, etc.)

## LiteLLM Model Tiers (litellm_config.yaml)

| Tier | Models | Cost |
|------|--------|------|
| FREE (Tier 1) | qwen2.5-coder:14b, deepseek-coder-v2:16b, llama3.2:8b (Ollama) | $0 |
| FREE (Tier 2) | groq/llama-3.3-70b, groq/mixtral-8x7b | $0 (1K/day) |
| CHEAP (Tier 3) | deepseek-chat, deepseek-coder, gpt-4o-mini | $0.14-0.15/1M in |
| MID (Tier 4) | claude-haiku (claude-haiku-4-5-20251001) | $1.00/1M in |
| PREMIUM (Tier 5) | claude-sonnet (claude-sonnet-4-6), claude-opus (claude-opus-4-6), gpt-4o, o1 | $2.50-15/1M in |

## OpenClaw Configuration (openclaw-entrypoint.sh)

The entrypoint script patches `/home/node/.openclaw/openclaw.json` on every container start:
- Gateway: port 18789, bind "lan", basePath "/openclaw/"
- Auth: password mode (via `OPENCLAW_GATEWAY_PASSWORD` env var)
- Device auth: disabled (`dangerouslyDisableDeviceAuth: true`)
- Trusted proxies: Docker bridge subnets (172.16.0.0/12, 10.0.0.0/8, 192.168.0.0/16)
- Custom "litellm" provider: points at http://litellm:4000/v1 using openai-completions wire format
- Default model: `litellm/gpt-4o-mini`
- Provider allowlist: only "litellm" (prevents anthropic fallback)

## Frontend Pages

### 1. Miniverse Portal (portal/index.html) — served at `/`
- 796-line single-file HTML/CSS/JS page
- 3D CSS terrarium with isometric perspective (rotateX 55deg, rotateZ -45deg)
- Three clickable zone platforms: **Chat** (blue, navigates to /chat), **Agents** (amber, opens OpenClaw iframe overlay), **Status** (green, opens health dashboard overlay)
- Neural network canvas background (60 nodes desktop, 30 mobile) with mouse-tracking particle attraction
- Color transitions: blue → amber (agents), blue → green (status)
- Status dashboard: checks Open WebUI, LiteLLM, OpenClaw health + fetches model list from `/api/litellm/v1/models`
- Responsive breakpoints at 768px and 480px
- Nav links below terrarium: Open WebUI, OpenClaw Direct, LiteLLM API

### 2. Agent Workspace (workspace/index.html) — served at `/workspace/`
- 563-line single-file page titled "Neural Fusion"
- Same neural canvas animation
- Status indicators for all three services (30s refresh)
- "Enter the Grid" button opens OpenClaw in full-screen iframe overlay with animated amber glow border
- Blue-to-amber color transition on activation
- Escape key exits overlay

## Key Technical Decisions & Lessons Learned

### OpenClaw Memory Battle (10+ commits)
OpenClaw (Node.js) was crashing with OOM on the 2GB instance. Solution chain:
- Container limit: 1536M (uses swap heavily)
- Node heap: `--max-old-space-size=1024`
- `OPENCLAW_NODE_OPTIONS_READY=1` to skip internal respawn that was overriding heap flags
- Instance upgrade from t2.micro (1GB) → t3.small (2GB)

### OpenClaw Networking Issues (8+ commits)
Getting OpenClaw accessible through Caddy required fixing:
- Bind address: must be "lan" not "localhost" inside Docker
- BasePath: `/openclaw/` must match Caddy's `handle /openclaw/*`
- Root WebSocket: OpenClaw Control UI connects WebSocket to `wss://host/` (root path, ignoring basePath). Requires separate `@openclawws` matcher in Caddy.
- Trusted proxies: Without Docker bridge subnets in trustedProxies, OpenClaw rejects all WebSocket connections as untrusted (1008 pairing required)
- Device auth: Must be disabled for web access behind reverse proxy
- Provider fallback: OpenClaw defaults to "anthropic" provider if not explicitly constrained to "litellm" only

### Iframe Embedding
OpenClaw sends its own `X-Frame-Options` and `Content-Security-Policy` headers. Caddy's `header_down -X-Frame-Options` and `header_down -Content-Security-Policy` in the `/openclaw/*` handler strip these so the global `SAMEORIGIN` applies, allowing the portal's iframe embed.

## Git Info

- **Branch**: `claude/setup-ec2-vps-nN6Gj`
- **Remote**: origin (GitHub: in-fused/VPS)
- **41 commits** from Feb 20-22, 2026
- Progression: initial setup → SSH hardening fixes → LiteLLM fixes → OpenClaw memory battle → OpenClaw networking → auth/WebSocket fixes → frontend pages → miniverse portal

## Current State (as of latest commit f717f9d)

**Everything is implemented and committed.** The working tree is clean. The miniverse portal exists and the Caddyfile/docker-compose are configured for it. The stack is:
- Portal landing page at `/` ✓
- Open WebUI at `/chat` ✓
- OpenClaw at `/openclaw/` (with iframe embed in portal) ✓
- LiteLLM at `/api/litellm/` ✓
- Workspace at `/workspace/` ✓
- Health checks in status dashboard ✓
- All routing configured in Caddyfile ✓
- All volumes configured in docker-compose.yml ✓

## What Was Planned But May Need Refinement

A detailed architectural plan was produced for enhancing the miniverse portal. The plan proposed:
- True CSS 3D platforms with depth (face-top, face-front, face-right) instead of flat zones
- Floating idle animation on zone platforms
- Atmospheric CSS particles
- More sophisticated zone-entry transitions (world zooms/tilts, panel slides in)
- Mobile layout that flattens 3D to vertical card stack
- Cache-Control headers for the portal page

The current portal (portal/index.html) already implements the core concept but uses simpler flat zone platforms rather than the full 3D extruded platforms from the plan. The plan's enhancements could be applied as polish.

## Environment Variables (.env)

Key variables (see .env.example for full list):
- `DOMAIN` — in-fused.org (enables auto-HTTPS)
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `GROQ_API_KEY`, `MINIMAX_API_KEY` — LLM provider keys
- `OLLAMA_BASE_URL` — remote Ollama server (Oracle Cloud)
- `WEBUI_SECRET_KEY` — Open WebUI session secret
- `LITELLM_MASTER_KEY` — LiteLLM API auth key (also used by Open WebUI and OpenClaw to authenticate)
- `LITELLM_SALT_KEY` — LiteLLM encryption salt
- `OPENCLAW_PASSWORD` — OpenClaw web UI password
- `SSH_PORT` — 2222
- `COMPOSE_PROJECT_NAME` — ai-hub

## Server Hardening (scripts/setup-server.sh)

- SSH: key-only auth, port 2222, strong ciphers, 10-min idle timeout
- UFW firewall: only 2222, 80, 443 open
- Fail2Ban: 3 failures → 1 hour ban
- Docker CE with log rotation (10MB, 3 files)
- 4GB swap, swappiness=10
- Unattended security upgrades
- UTC timezone
