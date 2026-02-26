# CLAUDE.md — in-fused.org VPS Project Context

> **Last updated:** Feb 26, 2026 | **Branch:** master | **Commits:** 65+

## What This Project Is

**in-fused.org** is a self-hosted, multi-agent AI hub running on a low-cost AWS EC2 t3.small (~$25/month total). It aggregates multiple LLM providers (Claude, GPT, DeepSeek, Groq, local Ollama) behind a single web interface with:
- **Mission Control** — a custom-built agent management dashboard with LiteGraph workflow builder
- **OpenClaw** — autonomous AI agent running 24/7
- **Open WebUI** — ChatGPT-like chat frontend
- **LiteLLM** — unified API gateway routing to 14 models across 5 cost tiers

Domain: `in-fused.org`

---

## Owner Deployment Notes (READ FIRST)

### Mobile-First Deployment Workflow
The project owner frequently deploys from **iOS mobile** using **AWS Session Manager (SSM)** instead of SSH. This means:
- **Always provide full copy-paste commands** — no multi-step instructions that require editing mid-command
- **Chain commands with `&&`** for sequential operations (SSM doesn't persist shell state well)
- **Avoid interactive prompts** — always use `-y` flags, `--non-interactive`, heredocs for git commit messages
- **Keep commands short** when possible — SSM on mobile can have clipboard issues with very long strings
- **SSM sessions time out** — long-running scripts (like deploy.sh) will complete even if the session closes, since Docker runs detached (`docker compose up -d`)

### Quick Deploy Commands (copy-paste ready)
```bash
# Full deploy from GitHub (run from EC2 via SSM):
cd /home/VPS && sudo git config --global --add safe.directory /home/VPS && sudo git pull origin master && sudo bash scripts/deploy.sh

# Deploy from a feature branch (replace <branch-name>):
cd /home/VPS && sudo git config --global --add safe.directory /home/VPS && sudo git fetch origin <branch-name> && sudo git checkout master && sudo git merge origin/<branch-name> && sudo bash scripts/deploy.sh

# Merge a feature branch to master and push (no deploy):
cd /home/VPS && sudo git config --global --add safe.directory /home/VPS && sudo git fetch origin <branch-name> && sudo git checkout master && sudo git merge origin/<branch-name> && sudo git push origin master

# Update a single service (e.g., openclaw) without full redeploy:
cd /home/VPS && sudo docker compose pull openclaw && sudo docker compose rm -sf openclaw && sudo docker compose up -d openclaw && sleep 10 && sudo docker compose logs --tail=50 openclaw

# Quick restart (no image pull):
cd /home/VPS && sudo docker compose restart

# Check status after deploy:
sudo docker compose ps

# View recent logs:
sudo docker compose logs --tail=50

# View logs for a specific service:
sudo docker compose logs --tail=50 openclaw
```

### Current Feature Branch
The active development branch is **`claude/debug-chat-loading-TtNOm`** (note: the `O` before the `m` is a capital letter O, not zero — they look identical on mobile).

### SSM Gotchas
- **Always include** `sudo git config --global --add safe.directory /home/VPS` before any git command — EC2 runs as ssm-user, not the repo owner
- **Branch names are case-sensitive** — copy exact branch names, don't retype them on mobile
- The EC2 repo lives at `/home/VPS` (not `/home/user/VPS` — that's the dev environment)
- **EC2 has no `master` or `main` branch** — the server is checked out directly on the feature branch. To update, just `sudo git pull origin <branch-name>` (no merge needed)
- **Default remote HEAD** points to `origin/claude/setup-ec2-vps-nN6Gj` (the original setup branch)

### Access Methods
- **Mobile**: AWS Console → Systems Manager → Session Manager → Start Session → select EC2 instance
- **Desktop**: SSH via `ssh -i key.pem -p 2222 user@in-fused.org` (key-only auth)
- **GitHub**: https://github.com/in-fused/VPS

---

## Architecture Overview

```
Internet → https://in-fused.org
              │
              ▼
  AWS EC2 t3.small (2 vCPU, 2GB RAM, 4GB swap, 30GB gp3)
    │
    ├── Caddy (reverse proxy, auto-HTTPS via Let's Encrypt)
    │     ├── /auth/verify          → Server-side password check (no browser popup)
    │     ├── /api/mc/*             → Cookie-gated LiteLLM proxy (for Mission Control)
    │     ├── /api/litellm/*        → LiteLLM :4000 (multi-provider API gateway)
    │     ├── /openclaw/*           → OpenClaw :18789 (cookie-gated, agent UI + API)
    │     ├── /ws/openclaw          → OpenClaw :18789 (dedicated WebSocket path)
    │     ├── / (WebSocket upgrade) → OpenClaw :18789 (legacy root WebSocket)
    │     ├── /workspace/*          → Static files from agent-workspace volume
    │     └── / (everything else)   → Open WebUI :8080 (cookie-gated)
    │
    ├── Open WebUI (custom theme) → LiteLLM (http://litellm:4000/v1)
    ├── LiteLLM → Anthropic, OpenAI, DeepSeek, Groq, MiniMax, Ollama
    │     └── PostgreSQL (litellm-db:5432)
    ├── OpenClaw → LiteLLM (NOT direct to providers)
    │     └── Default model: groq-llama-3.3-70b
    ├── Mission Control (workspace/) → LiteLLM via /api/mc/* + OpenClaw via /ws/openclaw
    └── Docker network: ai-hub-network (bridge)

Oracle Cloud ARM (FREE FOREVER, separate server)
    └── Ollama (24GB RAM) — qwen2.5-coder:14b, deepseek-coder-v2:16b, llama3.2:8b
        └── Firewall: only accepts connections from EC2 IP on port 11434
```

## File Structure

```
VPS/
├── CLAUDE.md                        ← This file (project memory for Claude sessions)
├── .env                             ← Live secrets (API keys, passwords) — NOT in git
├── .env.example                     ← Template for .env
├── .gitignore
├── Caddyfile                        ← Reverse proxy: routing, auth, WebSocket, CSP headers
├── docker-compose.yml               ← 8 services (7 core + 1 optional)
├── litellm_config.yaml              ← 14 models in 5 cost tiers
├── README.md                        ← Setup guide (Windows/PowerShell focused)
├── webui-theme/
│   ├── Dockerfile                   ← Extends Open WebUI with custom CSS
│   └── custom.css                   ← Golden cyber theme (784 lines)
├── workspace/                       ← Mission Control SPA + agent workspace
│   ├── index.html                   ← Mission Control dashboard (main SPA, ~1900 lines)
│   ├── auth.html                    ← Site-wide login page (cyber gold theme)
│   ├── openclaw-auth.html           ← OpenClaw-specific auth page
│   ├── manifest.json                ← PWA manifest (installable on iOS/Android)
│   ├── css/
│   │   └── styles.css               ← Mission Control custom styles (543 lines)
│   └── js/
│       ├── app.js                   ← Alpine.js stores, health checks, LiteLLM/OpenClaw chat (1352 lines)
│       ├── workflow.js              ← LiteGraph.js custom nodes + workflow executor (796 lines)
│       └── openclaw-client.js       ← OpenClaw WebSocket RPC client (423 lines)
└── scripts/
    ├── deploy.sh                    ← Stack deployment (pulls images, builds, health checks)
    ├── setup-server.sh              ← Server hardening (SSH, UFW, fail2ban, Docker, swap)
    ├── setup-ollama-server.sh       ← Oracle Cloud Ollama server setup
    ├── openclaw-entrypoint.sh       ← OpenClaw container config patching (agents, models, auth)
    ├── caddy-entrypoint.sh          ← Caddy auth token generation (SHA-256 cookie, base64 header)
    └── test-api-keys.sh             ← API key validation script (335 lines)
```

## Docker Services (docker-compose.yml)

| Service | Image | Memory Limit | Port | Purpose |
|---------|-------|-------------|------|---------|
| `caddy` | caddy:2-alpine | 64M | 80, 443, 443/udp | Reverse proxy + auto-HTTPS + HTTP/3 |
| `open-webui` | **in-fused/open-webui:latest** (custom build) | 768M | 8080 | ChatGPT-like frontend with golden cyber theme |
| `litellm` | ghcr.io/berriai/litellm:main-stable | 512M | 4000 | Multi-provider API gateway |
| `litellm-db` | postgres:16-alpine | 128M | 5432 | PostgreSQL for LiteLLM |
| `openclaw-init` | alpine:3 | — | — | One-shot: fix openclaw-data volume ownership (UID 1000) |
| `openclaw` | ghcr.io/openclaw/openclaw:main | 1536M | 18789 | Autonomous AI agent (24/7) |
| `workspace-init` | alpine:3 | — | — | One-shot: syncs workspace/ seed files to volume |
| `ollama` (optional) | ollama/ollama:latest | 4G | — | Local LLM (profile: local-models) |

**Total memory budget: ~3GB** (exceeds 2GB RAM, relies on 4GB swap).

**Note:** Open WebUI uses a custom `build:` with `webui-theme/Dockerfile` — deploy.sh runs `docker compose build open-webui` before `docker compose up -d`. The image pull step explicitly lists only pullable services (`caddy litellm litellm-db openclaw`).

## Caddy Routing (Caddyfile)

The Caddyfile implements **site-wide cookie-based auth** via `scripts/caddy-entrypoint.sh`:
- On startup, the entrypoint computes `WORKSPACE_AUTH_B64` (base64 of `admin:password`) and `WORKSPACE_PASS_SHA256` (SHA-256 of password)
- Login pages (`auth.html`, `openclaw-auth.html`) POST credentials via `fetch()` to `/auth/verify`
- On success, they set a `mc_oc` cookie containing the SHA-256 hash
- All protected routes check for `Cookie *mc_oc={$WORKSPACE_PASS_SHA256}*`
- When `WORKSPACE_PASSWORD` is unset, auth is disabled (sentinel values prevent accidental matches)

Routes (evaluated top-to-bottom, first-match):

1. `/auth/verify` → Server-side password verification (header comparison, no browser popup)
2. `/api/mc/*` → Cookie-gated LiteLLM proxy (injects `LITELLM_MASTER_KEY`, supports SSE streaming)
3. `/api/litellm/*` → `handle_path` strips prefix → litellm:4000
4. `/openclaw` bare → 301 redirect to `/openclaw/`
5. `/openclaw/*` → Cookie-gated → openclaw:18789 (strips X-Frame-Options/CSP for iframe embedding)
6. `/ws/openclaw` → Cookie-gated dedicated WebSocket → openclaw:18789 (Mission Control uses this)
7. `/ + Upgrade: websocket` → `@openclawws` matchers → openclaw:18789 (legacy root WebSocket for native Control UI)
8. `/workspace/*` → `handle_path` strips prefix → static files from /srv/workspace (no Caddy `templates` — prevents breaking Vue/Alpine `{{ }}` syntax)
9. Everything else → Cookie-gated → open-webui:8080

## LiteLLM Model Tiers (litellm_config.yaml)

| Tier | Models | Cost |
|------|--------|------|
| FREE (Tier 1) | qwen2.5-coder:14b, deepseek-coder-v2:16b, llama3.2:8b (Ollama) | $0 |
| FREE (Tier 2) | groq-llama-3.3-70b | $0 (1K/day) |
| CHEAP (Tier 3) | deepseek-chat, deepseek-coder, gpt-4o-mini | $0.14-0.15/1M in |
| MID (Tier 4) | claude-haiku (claude-haiku-4-5-20251001), minimax-m2.5 | $0.30-1.00/1M in |
| PREMIUM (Tier 5) | claude-sonnet (claude-sonnet-4-6), claude-opus (claude-opus-4-6), gpt-4o, o1 | $2.50-15/1M in |

## OpenClaw Configuration (openclaw-entrypoint.sh)

The entrypoint script patches `/home/node/.openclaw/openclaw.json` on every container start:
- **Gateway:** port 18789, bind "lan", basePath "/openclaw/"
- **Auth:** password mode (via `OPENCLAW_GATEWAY_PASSWORD` env var)
- **Device auth:** disabled (`dangerouslyDisableDeviceAuth: true`)
- **Allowed origins:** `https://in-fused.org` + `dangerouslyAllowHostHeaderOriginFallback` for dev/IP access
- **Trusted proxies:** Docker bridge subnets (172.16.0.0/12, 10.0.0.0/8, 192.168.0.0/16)
- **LiteLLM provider:** custom "litellm" provider at http://litellm:4000/v1 using openai-completions wire format
- **Default model:** `groq-llama-3.3-70b` (object format: `{ primary: 'groq-llama-3.3-70b' }`)
- **Available models:** 10 models (gpt-4o-mini, deepseek-chat/coder, claude-haiku/sonnet, gpt-4o, groq-llama-3.3-70b, minimax-m2.5, qwen2.5-coder:14b, llama3.2:8b)
- **Provider allowlist:** only "litellm" (prevents anthropic fallback)
- **Agent-to-agent messaging:** enabled for all 4 core agents (peer-to-peer)
- **Subagents:** enabled (no depth/concurrency limits — OpenClaw crashes on unrecognized config keys)

### Pre-Seeded Agent Hierarchy
The entrypoint seeds 4 agents on first run (preserved on subsequent restarts):

| Agent | Model | Role | Can Delegate To |
|-------|-------|------|-----------------|
| Lead (🧠) | claude-haiku | Orchestrator — delegates tasks, reviews work | CodeCraft, Scout, Scribe |
| CodeCraft (⚡) | deepseek-coder | Full-stack developer — writes/reviews/debugs code | Scout, Scribe |
| Scout (🔍) | groq-llama-3.3-70b | Research specialist — web search, data gathering | Scribe |
| Scribe (📝) | gpt-4o-mini | Documentation/content writer | (none) |

### Config Validation Gotchas (Critical)
OpenClaw validates config strictly — **any unrecognized key causes a crash loop**. The entrypoint actively cleans these:
- `identity.description` — NOT valid (only `name`, `emoji`)
- `subagents.maxDepth`, `subagents.maxConcurrent`, `subagents.maxChildrenPerAgent`, `subagents.runTimeoutSeconds` — NOT valid
- `tools.agentToAgent.maxPingPongTurns` — NOT valid
- `compaction`, `contextPruning`, `memorySearch`, `experimental` — NOT valid top-level keys
- `gateway.trustProxy` — NOT valid (use `gateway.trustedProxies`)

## Mission Control (workspace/) — The Main Frontend

Mission Control is a **custom-built SPA** at `/workspace/` that serves as the primary agent management interface. It is NOT a placeholder — it is a fully built dashboard.

### Tech Stack
- **Alpine.js** (3.14.8) — reactive stores and UI state
- **Tailwind CSS** (CDN) — utility-first styling with custom `mc-*` color palette
- **LiteGraph.js** (0.7.18) — node-based visual workflow editor
- **Vanilla JS** — no build step, no bundler, served as static files

### Architecture (app.js)
The SPA uses Alpine.js stores for state management:
- **`auth` store** — login via `/auth/verify`, sets `mc_oc` cookie, stores OpenClaw password in sessionStorage
- **`app` store** — view routing (dashboard/agents/chat/workflows/monitor), boot sequence, health polling, OpenClaw WebSocket connection
- **`agents` store** — CRUD for agents (syncs to OpenClaw when connected, falls back to localStorage)
- **`sessions` store** — chat sessions with streaming (OpenClaw WebSocket → LiteLLM SSE → demo mode fallback)
- **`workflows` store** — workflow management (save/load/run via WorkflowExecutor)
- **`models` store** — fetches available models from LiteLLM via `/api/mc/v1/models`
- **`monitor` store** — system logs, health status, governance metrics
- **`governance` store** — task success/failure tracking per agent

### Chat System (3-tier fallback)
1. **OpenClaw WebSocket** (preferred) — real agent execution with tools, memory, sub-agents. Uses `openclaw-client.js` to connect via `/ws/openclaw`, authenticates with the login password, sends/receives via JSON-RPC.
2. **LiteLLM SSE** (fallback) — direct streaming chat via `/api/mc/v1/chat/completions`. Works when OpenClaw WS is down but LiteLLM is healthy.
3. **Demo mode** — placeholder responses when no backend is available.

### OpenClaw WebSocket Client (openclaw-client.js)
- Connects to `/ws/openclaw` (primary) with fallback to `/` (legacy root path)
- JSON-RPC protocol with request/response correlation via `_reqId`
- Event system: `chat.delta`, `chat.complete`, `chat.error`, `disconnect`, `reconnect`
- Auto-reconnect with exponential backoff (2s → 30s max)
- iOS/mobile: pauses reconnection when app is backgrounded, reconnects on visibility change
- Guard against duplicate event registration after logout/login cycle

### Workflow System (workflow.js) — LiteGraph Integration

**THIS IS THE NEXT MAJOR FOCUS AREA.**

The workflow tab uses LiteGraph.js to provide a visual node-based workflow editor. Current state:

#### Custom Node Types (registered under `mission/*` namespace):
| Node | Inputs | Outputs | Purpose |
|------|--------|---------|---------|
| **Trigger** | — | prompt (string), trigger (event) | Workflow start point (Manual/Scheduled/Webhook/On Event) |
| **Agent** | prompt (string), context (string) | response (string), done (event) | Sends prompt to AI agent (OpenClaw or LiteLLM) |
| **Task** | input (string), execute (action) | result (string), done (event) | Defines goal/constraints/priority |
| **Tool** | input (string), execute (action) | result (string), done (event) | Executes tools (Web Search, Code Exec, File Ops, Browser, Shell, API Call) |
| **Condition** | input (string) | true (string), false (string) | Routes data based on Contains/Equals/Regex/Length/IsEmpty |
| **Output** | result (string), done (action) | — | Delivers results to Log/Chat/File/Webhook |
| **Loop** | items (string) | item (string), index (number), done (event) | Iterates over newline-separated items |
| **Merge** | input_1 (string), input_2 (string) | merged (string) | Combines inputs (Concatenate/JSON Merge/Pick Best/Summary) |

#### WorkflowExecutor (class)
- Topological sort (BFS from trigger nodes)
- Executes nodes sequentially via `runAsync()` methods
- Branch gating: skips nodes on inactive condition branches (null propagation)
- Visual feedback: amber=running, green=success, red=error, gray=skipped
- Node colors reset after 3 seconds

#### Default Workflow Template
Trigger → Agent → Condition (contains "error"?) → Output (true branch) / Tool:Web Search (false branch)

#### Touch/Mobile Support
Custom `_bridgeTouchEvents()` bridge translates touch events to mouse events for LiteGraph canvas. Supports single-finger pan/drag and two-finger pinch-zoom.

### Known Issues & What Needs Work

#### Workflow System (Priority: HIGH)
- **Workflows do not persist** — refreshing the page loses the graph. Need save/load to localStorage or OpenClaw.
- **Agent node model selection** is hardcoded at graph creation time — agent list won't update if agents change after node creation.
- **Tool node execution** is placeholder — routes through an agent prompt asking for the tool, not actual tool invocation.
- **Loop node** doesn't actually iterate through connected downstream nodes — it just splits input into an array and returns.
- **Webhook/Scheduled triggers** are UI-only — no backend scheduler exists.
- **Workflow↔OpenClaw integration** — agents should be able to autonomously create, modify, and execute workflows from within Mission Control's workflow tab. This is the primary goal for the next phase.

#### Chat System
- **Chat history loading** — the debug-chat-loading branch addressed issues with chat sessions not loading properly.
- **OpenClaw WebSocket** may fail to reconnect after iOS backgrounding in some edge cases.
- **Session/message sync** from OpenClaw is best-effort — falls back to localStorage.

#### General
- **No build step** — all JS is vanilla, loaded directly. This is intentional (simplicity) but limits minification/tree-shaking.
- **CSP policy** allows `unsafe-inline` and `unsafe-eval` for Alpine.js and Tailwind CDN — acceptable for self-hosted but tighten if exposing to public users.

## Open WebUI Theme (webui-theme/)

Open WebUI uses a **custom Docker build** that injects `custom.css` into the SvelteKit static assets:
- `webui-theme/Dockerfile`: `FROM ghcr.io/open-webui/open-webui:main` + copies `custom.css` to `/app/build/static/`
- Theme: "Golden Cyber Techno" — dark backgrounds with gold/amber accents
- Auth disabled (`WEBUI_AUTH=false`) — Caddy handles all authentication
- Auto-LLM calls disabled (prevents burning credits on page load):
  - `ENABLE_AUTOCOMPLETE_GENERATION=false`
  - `TITLE_GENERATION_PROMPT_TEMPLATE=false`
  - `ENABLE_SEARCH_QUERY_GENERATION=false`
  - `ENABLE_TAGS_GENERATION=false`

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
OpenClaw sends its own `X-Frame-Options` and `Content-Security-Policy` headers. Caddy's `header_down -X-Frame-Options` and `header_down -Content-Security-Policy` in the `/openclaw/*` handler strip these so the global `SAMEORIGIN` applies, allowing same-origin iframe embedding if needed.

### Site-Wide Auth Pattern
A single password protects the entire site. The auth flow:
1. `caddy-entrypoint.sh` computes base64 token and SHA-256 hash from `OPENCLAW_PASSWORD`
2. Login pages (`auth.html`, `openclaw-auth.html`) call `GET /auth/verify` with `Authorization: Basic <token>`
3. On success, they set cookie `mc_oc=<sha256hash>` (24h expiry, SameSite=Lax)
4. All Caddy route handlers check for `header Cookie *mc_oc={$WORKSPACE_PASS_SHA256}*`
5. Unauthenticated requests are served login pages via `rewrite` + `file_server` from workspace volume

### iOS/Mobile Compatibility (3+ commits)
- Viewport: `viewport-fit=cover` for notch devices
- PWA: `manifest.json` with `display: standalone`, apple-mobile-web-app-capable
- Touch: Custom touch-to-mouse bridge for LiteGraph canvas (pinch-zoom, drag)
- WebSocket: Visibility change handler pauses/resumes reconnection
- CSS: Fixed z-index conflicts between Tailwind CDN and native iOS elements

## Git Info

- **Remote**: origin (GitHub: in-fused/VPS)
- **65+ commits** from Feb 20-26, 2026
- **Progression**: initial setup → SSH hardening → LiteLLM fixes → OpenClaw memory battle → OpenClaw networking → auth/WebSocket fixes → OpenClaw chat fixes → full audit → Mission Control build → mobile fixes → iOS touch/workflow → theme legibility → deploy pipeline fixes

## Current State (as of Feb 26, 2026)

The stack is deployed and functional:
- Open WebUI at `/` (golden cyber theme, cookie-gated) ✓
- Mission Control at `/workspace/` (full SPA with agents/chat/workflows/monitor) ✓
- OpenClaw at `/openclaw/` (cookie-gated agent UI) ✓
- LiteLLM at `/api/litellm/` (14 models across 5 cost tiers) ✓
- Authenticated LiteLLM proxy at `/api/mc/*` (for Mission Control chat) ✓
- Dedicated WebSocket at `/ws/openclaw` (for Mission Control ↔ OpenClaw) ✓
- Site-wide cookie auth via Caddy ✓
- Custom Open WebUI theme (Docker build) ✓
- iOS PWA support ✓
- All routing configured in Caddyfile ✓
- All volumes configured in docker-compose.yml ✓
- OpenClaw has access to all LiteLLM models (10 models exposed) ✓
- 4 pre-seeded agents with hierarchy (Lead → CodeCraft/Scout/Scribe) ✓

## Next Phase: Autonomous Workflow Execution

### Primary Goal
**Agents deployed via OpenClaw should be able to autonomously use the Workflow tab within Mission Control to set up, accurately route LiteGraph nodes, and build functional workflows.**

### Why LiteGraph Workflows Are Central
The LiteGraph visual workflow builder was chosen because its **beginner-friendly UI/UX** makes complex agent orchestration understandable at a glance — nodes, connections, and data flow are visual and intuitive. The goal is that **all three layers of OpenClaw agents** (Lead, specialist agents like CodeCraft/Scout/Scribe, and any dynamically spawned sub-agents) should have access to creating and executing workflows via LiteGraph interaction. This means workflows are not just a human tool — they are the primary way agents orchestrate multi-step tasks, making agent behavior transparent and debuggable.

### What This Means Concretely
1. **Workflow Persistence** — Save/load workflows so they survive page refreshes (localStorage + optional OpenClaw sync)
2. **Accurate Node Routing** — Ensure data flows correctly through LiteGraph connections: Trigger → Agent → Condition → Output/Tool chains must work with real API calls, with proper logic at each node
3. **Agent↔Workflow Bridge** — All OpenClaw agents (Lead, CodeCraft, Scout, Scribe, and sub-agents) should be able to programmatically:
   - Create new workflows (add nodes, connect them with accurate routing)
   - Execute existing workflows
   - Read workflow results
   - Modify workflows based on results (self-improving pipelines)
4. **Tool Node Real Execution** — Currently placeholder. Tools should invoke actual capabilities (web search via agent prompt, code execution, file ops via workspace volume)
5. **Scheduled/Webhook Triggers** — Currently UI-only. Need a lightweight scheduler or webhook endpoint that triggers workflow execution
6. **Workflow Templates** — Pre-built workflow patterns (research pipeline, code review, content generation) that agents can instantiate

### Core Functionality Priorities
1. Fix any remaining chat/loading issues (ensure 3-tier fallback works reliably)
2. Workflow persistence (save/load)
3. End-to-end workflow execution with real API calls (Trigger → Agent → Output verified working with accurate logic)
4. Agent autonomy (all 3 layers of agents can create/run workflows via OpenClaw commands or API)

## Environment Variables (.env)

Key variables (see .env.example for full list):
- `DOMAIN` — in-fused.org (enables auto-HTTPS)
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `GROQ_API_KEY`, `MINIMAX_API_KEY` — LLM provider keys
- `OLLAMA_BASE_URL` — remote Ollama server (Oracle Cloud)
- `WEBUI_SECRET_KEY` — Open WebUI session secret
- `LITELLM_MASTER_KEY` — LiteLLM API auth key (also used by Open WebUI and OpenClaw to authenticate)
- `LITELLM_SALT_KEY` — LiteLLM encryption salt
- `OPENCLAW_PASSWORD` — site-wide password (used by Caddy auth, OpenClaw gateway, Mission Control)
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
