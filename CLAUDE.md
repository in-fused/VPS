# CLAUDE.md — in-fused.org Project Memory

> **Updated:** Feb 26, 2026 | **Commits:** 93 | **Status:** Stack deployed, core functionality working — now building agent autonomy

## Project Overview

**in-fused.org** is a self-hosted multi-agent AI hub on AWS EC2 t3.small (~$25/month). It unifies multiple LLM providers behind a single interface with autonomous agent capabilities.

**Domain:** `in-fused.org` | **Repo:** https://github.com/in-fused/VPS

**Core services:**
- **Mission Control** (`/workspace/`) — custom SPA for agent management, chat, and visual workflow builder
- **OpenClaw** (`/openclaw/`) — autonomous agent runtime (24/7), exposes WebSocket RPC for Mission Control
- **Open WebUI** (`/`) — ChatGPT-like frontend with golden cyber theme
- **LiteLLM** (`/api/litellm/`) — unified gateway routing to 14 models across 5 providers
- **Caddy** — reverse proxy, auto-HTTPS, site-wide cookie auth

---

## Deployment (Mobile-First via SSM)

Owner deploys from **iOS mobile via AWS Session Manager**. Always provide:
- Full copy-paste commands (no mid-command editing)
- Chain with `&&` (SSM doesn't persist shell state)
- No interactive prompts (`-y` flags, heredocs)

**EC2 path:** `/home/VPS` (not `/home/user/VPS` — that's the dev environment)

```bash
# Deploy feature branch directly (EC2 has no master — checked out on feature branch):
cd /home/VPS && sudo git config --global --add safe.directory /home/VPS && sudo git pull origin claude/debug-chat-loading-TtNOm && sudo bash scripts/deploy.sh

# Update a single service:
cd /home/VPS && sudo docker compose pull openclaw && sudo docker compose rm -sf openclaw && sudo docker compose up -d openclaw && sleep 10 && sudo docker compose logs --tail=50 openclaw

# Quick restart / status:
cd /home/VPS && sudo docker compose restart
sudo docker compose ps
sudo docker compose logs --tail=50
```

**SSM gotchas:** Always `sudo git config --global --add safe.directory /home/VPS` before git commands. Branch names are case-sensitive (`TtNOm` — the O is capital, not zero).

**Access:** Mobile via SSM | Desktop via `ssh -i key.pem -p 2222 user@in-fused.org`

---

## Architecture

```
Internet → https://in-fused.org → Caddy (auto-HTTPS)
  ├── /auth/verify           → Password check (header comparison, no browser popup)
  ├── /api/mc/*              → Cookie-gated LiteLLM proxy (injects master key, SSE streaming)
  ├── /api/litellm/*         → LiteLLM :4000
  ├── /openclaw/*            → Cookie-gated → OpenClaw :18789
  ├── /ws/openclaw           → Cookie-gated WebSocket → OpenClaw :18789 (Mission Control uses this)
  ├── / + WebSocket upgrade  → OpenClaw :18789 (legacy root WS for native Control UI)
  ├── /workspace/*           → Static files from agent-workspace volume
  └── / (everything else)    → Cookie-gated → Open WebUI :8080

OpenClaw → LiteLLM → Anthropic, OpenAI, DeepSeek, Groq, MiniMax, Ollama(Oracle Cloud ARM)
Docker network: ai-hub-network (bridge)
```

### Docker Services

| Service | Image | Memory | Port |
|---------|-------|--------|------|
| caddy | caddy:2-alpine | 64M | 80, 443 |
| open-webui | in-fused/open-webui:latest (custom build) | 768M | 8080 |
| litellm | ghcr.io/berriai/litellm:main-stable | 512M | 4000 |
| litellm-db | postgres:16-alpine | 128M | 5432 |
| openclaw | ghcr.io/openclaw/openclaw:main | 1536M | 18789 |
| openclaw-init | alpine:3 | — | — |
| workspace-init | alpine:3 | — | — |

Total ~3GB (2GB RAM + 4GB swap). Open WebUI uses `build:` in docker-compose — `deploy.sh` runs `docker compose build open-webui` then `docker compose up -d`.

---

## Auth Flow (Working)

Single password protects the entire site. Flow:
1. `caddy-entrypoint.sh` computes base64 token + SHA-256 hash from `OPENCLAW_PASSWORD`
2. Login pages call `GET /auth/verify` with `Authorization: Basic <token>`
3. On success, set cookie `mc_oc=<sha256hash>` (24h, SameSite=Lax)
4. All Caddy routes check `Cookie *mc_oc={$WORKSPACE_PASS_SHA256}*`
5. Unauthenticated → rewrite to login page from workspace volume

---

## LiteLLM Models (14 models, 5 tiers)

| Tier | Models | Cost |
|------|--------|------|
| FREE | qwen2.5-coder:14b, deepseek-coder-v2:16b, llama3.2:8b (Ollama) | $0 |
| FREE | groq-llama-3.3-70b (1K/day) | $0 |
| CHEAP | deepseek-chat, deepseek-coder, gpt-4o-mini | $0.14–0.15/1M |
| MID | claude-haiku, minimax-m2.5 | $0.30–1.00/1M |
| PREMIUM | claude-sonnet, claude-opus, gpt-4o, o1 | $2.50–15/1M |

---

## OpenClaw Configuration (Working)

Entrypoint (`scripts/openclaw-entrypoint.sh`) patches `openclaw.json` on every container start:
- Gateway: port 18789, bind "lan", basePath "/openclaw/"
- Auth: password mode via `OPENCLAW_GATEWAY_PASSWORD`
- Device auth: disabled (dangerouslyDisableDeviceAuth)
- Allowed origins: `https://in-fused.org` + host-header fallback
- Trusted proxies: Docker bridge subnets (172.16.0.0/12, 10.0.0.0/8, 192.168.0.0/16)
- Provider: custom "litellm" at http://litellm:4000/v1, openai-completions wire format
- Provider allowlist: only "litellm" (prevents anthropic fallback)
- Default model: `groq-llama-3.3-70b` (object format `{ primary: '...' }`)
- 10 models exposed, agent-to-agent messaging enabled, subagents enabled

### Agent Hierarchy (seeded on first run, preserved after)

| Agent | Model | Role | Delegates To |
|-------|-------|------|--------------|
| Lead | claude-haiku | Orchestrator | CodeCraft, Scout, Scribe |
| CodeCraft | deepseek-coder | Full-stack developer | Scout, Scribe |
| Scout | groq-llama-3.3-70b | Research specialist | Scribe |
| Scribe | gpt-4o-mini | Documentation writer | (none) |

### OpenClaw Config Validation (DO NOT ADD THESE KEYS — causes crash loop)
- `identity.description` — only `name`, `emoji` are valid
- `subagents.maxDepth/maxConcurrent/maxChildrenPerAgent/runTimeoutSeconds` — not valid
- `tools.agentToAgent.maxPingPongTurns` — not valid
- `compaction`, `contextPruning`, `memorySearch`, `experimental` — not valid top-level keys
- `gateway.trustProxy` — use `gateway.trustedProxies` instead

---

## Mission Control — Core Functionality Map

### Tech Stack
- Alpine.js 3.14.8 (reactive stores) + Tailwind CSS (CDN) + LiteGraph.js 0.7.18 (workflows)
- Vanilla JS, no build step, served as static files from Caddy

### File Map
| File | Lines | Purpose |
|------|-------|---------|
| `workspace/index.html` | 1429 | Main SPA shell (Alpine.js templates, all views) |
| `workspace/js/app.js` | 1352 | All Alpine stores, health checks, chat, governance |
| `workspace/js/workflow.js` | 796 | LiteGraph nodes, WorkflowExecutor, touch bridge |
| `workspace/js/openclaw-client.js` | 423 | OpenClaw WebSocket RPC client |
| `workspace/css/styles.css` | 543 | Custom styles |
| `workspace/auth.html` | — | Site-wide login page |
| `workspace/openclaw-auth.html` | — | OpenClaw-specific login page |

### Alpine.js Stores (app.js)
| Store | Purpose | Key Methods |
|-------|---------|-------------|
| `auth` | Login/logout, cookie + sessionStorage | `login()`, `logout()` |
| `app` | View routing, boot sequence, health polling, OpenClaw WS | `boot()`, `reconnect()`, `setView()` |
| `agents` | Agent CRUD, syncs to OpenClaw when connected, localStorage fallback | `createAgent()`, `deleteAgent()`, `toggleAgent()` |
| `sessions` | Chat sessions + message streaming | `select()`, `createSession()`, `sendMessage()` |
| `workflows` | Workflow list, save/load/run | `create()`, `save()`, `load()`, `run()` |
| `models` | Fetches models from LiteLLM `/api/mc/v1/models` | auto-populated on boot |
| `monitor` | System logs, health status | `addLog()` |
| `governance` | Per-agent performance tracking, team lead promotion | `recordTask()`, `getScore()`, `getLeaderboard()` |
| `settings` | Sidebar visibility preferences | `toggle()`, `isVisible()` |

### Chat System — 3-Tier Fallback (Working)

**Route 1: OpenClaw WebSocket** (preferred)
- `openclaw-client.js` connects to `/ws/openclaw`, authenticates with login password
- JSON-RPC: `chat.send` → server pushes `chat.delta` / `chat.complete` / `chat.error` events
- Real agent execution with tools, memory, sub-agents
- 60s safety timeout if no `chat.complete` arrives

**Route 2: LiteLLM SSE** (fallback when OpenClaw WS unavailable)
- Direct `POST /api/mc/v1/chat/completions` with `stream: true`
- Uses agent's assigned model + system prompt
- SSE parsing with `data: [DONE]` termination

**Route 3: Demo mode** (no backend)
- Static placeholder message

### OpenClaw WebSocket Client (openclaw-client.js)

Connection: `/ws/openclaw` (primary) → `/` (legacy fallback)

**Handshake protocol:**
1. Server sends `hello`/`challenge` (may include nonce)
2. Client sends `connect` with `{ auth: { mode: 'password', token, password }, role: 'operator', scopes: [...] }`
3. Server sends `hello-ok`/`welcome` → authenticated

**RPC:** `{ type: 'req', id, method, params }` → `{ type: 'res', id, payload }`

**High-level API methods:**
- `listAgents()` → `agents.list`
- `addAgent(config)` → `agents.add`
- `deleteAgent(agentId)` → `agents.delete`
- `listSessions()` → `sessions.list`
- `getHistory(sessionId)` → `chat.history`
- `sendChat(text, { agentId, sessionId })` → `chat.send`
- `getConfig()` → `config.get`
- `getToolsCatalog()` → `tools.catalog`
- `getCronJobs()` → `cron.status`

**Resilience:** Auto-reconnect with exponential backoff (2s→30s). Pauses reconnection when iOS app is backgrounded, resumes on visibility change. `disconnect()` clears all event handlers to prevent duplication on re-login.

---

## Workflow System — Current State & What Needs Work

### What Exists (workflow.js)

**8 custom node types** under `mission/*` namespace:

| Node | Inputs → Outputs | `runAsync()` behavior |
|------|-------------------|----------------------|
| **Trigger** | — → prompt, trigger | Returns `this.properties.prompt` |
| **Agent** | prompt, context → response, done | Tries OpenClaw WS → LiteLLM `chat()` → demo fallback |
| **Task** | input, execute → result, done | Formats goal/constraints/priority around input |
| **Tool** | input, execute → result, done | Sends tool prompt to OpenClaw WS → fallback placeholder |
| **Condition** | input → true, false | Evaluates Contains/Equals/Regex/Length/IsEmpty, returns `{ true: input or null, false: input or null }` |
| **Output** | result, done → — | Logs to monitor store |
| **Loop** | items → item, index, done | Splits by newlines, returns array (does NOT iterate downstream) |
| **Merge** | input_1, input_2 → merged | Concatenate/JSON Merge/Pick Best/Summary |

**WorkflowExecutor:**
- Topological sort via BFS from trigger nodes
- Sequential execution via `runAsync()`
- Branch gating: skips nodes when all connected inputs are null (inactive condition branches)
- Visual feedback: amber=running, green=success, red=error, gray=skipped

### What's Broken or Missing

1. **Workflow persistence is basic** — `workflows.save()` serializes to `localStorage` via `workflowGraph.serialize()`, but workflows aren't auto-saved, and loading doesn't restore the canvas properly on navigation. Workflow list items (`wf-1`, `wf-2`) are hardcoded placeholders unlinked to actual graph state.

2. **Agent node model list stale** — agent combo widget is populated at node registration time. If agents change after the graph is created, the dropdown is outdated.

3. **Tool node is a placeholder** — sends a natural-language prompt asking OpenClaw to "use" the tool, rather than invoking actual tool capabilities. No real web search, code execution, file ops, etc.

4. **Loop node doesn't iterate** — splits input into an array and returns, but doesn't execute downstream nodes per-item. True iteration would require the executor to re-run the subgraph for each item.

5. **Scheduled/Webhook triggers are UI-only** — no backend scheduler or webhook endpoint exists.

6. **No agent↔workflow bridge** — agents cannot programmatically create, read, modify, or execute workflows. This is the primary goal.

7. **Merge "Pick Best" and "Summary" modes** — "Pick Best" just picks the longer string. "Summary" falls through to concatenation. Neither uses AI.

---

## PRIMARY GOAL: Autonomous Agent Operation

**All OpenClaw agents (Lead, CodeCraft, Scout, Scribe, and sub-agents) must be able to operate autonomously and utilize all Mission Control features.** This means:

### 1. Reliable Chat Pipeline (verify working)
- Confirm 3-tier fallback works end-to-end: OpenClaw WS → LiteLLM SSE → demo
- Ensure agent selection in sessions correctly routes to the right model
- Verify OpenClaw WS reconnection after disconnect/backgrounding

### 2. Workflow Persistence (implement)
- Auto-save workflow graph state to localStorage on every change
- Link workflow list items to actual saved graphs (not hardcoded placeholders)
- Restore canvas state on navigation back to workflows tab

### 3. End-to-End Workflow Execution (fix & verify)
- Trigger → Agent → Condition → Output must work with real LiteLLM API calls
- Agent node must correctly resolve model from agent config
- Condition node branching must correctly gate downstream execution
- Output node should deliver results to the appropriate destination

### 4. Agent↔Workflow Bridge (build)
- Expose workflow CRUD API that OpenClaw agents can call via RPC or tool use
- Agents should be able to: create workflows, add/connect nodes, execute workflows, read results
- This makes agent behavior visible and debuggable through the visual workflow graph

### 5. Real Tool Execution (upgrade from placeholder)
- Tool nodes should invoke actual capabilities through OpenClaw's tool system
- Web Search, Code Execution, File Operations, Shell should map to real OpenClaw tools

### 6. Loop Node Iteration (fix)
- Executor should re-run downstream subgraph for each item in the loop
- Track iteration index and pass individual items through connections

---

## File Structure

```
VPS/
├── CLAUDE.md                     ← This file
├── .env                          ← Secrets (NOT in git)
├── .env.example                  ← Template
├── Caddyfile                     ← Reverse proxy config
├── docker-compose.yml            ← 7 services + 1 optional
├── litellm_config.yaml           ← 14 models, 5 tiers
├── webui-theme/
│   ├── Dockerfile                ← FROM open-webui + custom.css
│   └── custom.css                ← Golden cyber theme (784 lines)
├── workspace/                    ← Mission Control SPA
│   ├── index.html                ← Main SPA (1429 lines)
│   ├── auth.html                 ← Site login page
│   ├── openclaw-auth.html        ← OpenClaw login page
│   ├── manifest.json             ← PWA manifest
│   ├── css/styles.css            ← Custom styles (543 lines)
│   └── js/
│       ├── app.js                ← Alpine stores + chat + governance (1352 lines)
│       ├── workflow.js           ← LiteGraph nodes + executor (796 lines)
│       └── openclaw-client.js    ← OpenClaw WS RPC client (423 lines)
└── scripts/
    ├── deploy.sh                 ← Stack deployment
    ├── setup-server.sh           ← Server hardening
    ├── setup-ollama-server.sh    ← Oracle Ollama setup
    ├── openclaw-entrypoint.sh    ← OpenClaw config patching
    ├── caddy-entrypoint.sh       ← Auth token generation
    └── test-api-keys.sh          ← API key validation
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DOMAIN` | in-fused.org (enables auto-HTTPS) |
| `ANTHROPIC_API_KEY` | Claude models |
| `OPENAI_API_KEY` | GPT models |
| `DEEPSEEK_API_KEY` | DeepSeek models |
| `GROQ_API_KEY` | Groq free tier |
| `MINIMAX_API_KEY` | MiniMax M2.5 |
| `OLLAMA_BASE_URL` | Remote Ollama (Oracle Cloud ARM) |
| `LITELLM_MASTER_KEY` | LiteLLM auth (must start with `sk-`) |
| `LITELLM_SALT_KEY` | LiteLLM encryption salt |
| `OPENCLAW_PASSWORD` | Site-wide password (Caddy + OpenClaw + Mission Control) |
| `WEBUI_SECRET_KEY` | Open WebUI session secret |
| `DB_PASSWORD` | PostgreSQL for LiteLLM |
| `COMPOSE_PROJECT_NAME` | ai-hub |

## Resolved Issues (Brief Reference)

These are solved — do not re-investigate or re-fix:

- **OpenClaw OOM crashes**: Fixed via `--max-old-space-size=1024` + `OPENCLAW_NODE_OPTIONS_READY=1` + 1536M container limit + t3.small upgrade
- **OpenClaw networking**: Bind "lan" not "localhost", basePath `/openclaw/`, trustedProxies for Docker subnets, device auth disabled, separate WS matchers in Caddy
- **Provider fallback to anthropic**: Fixed by setting `agents.defaults.models = { litellm: {} }` (allowlist)
- **Auth popup in browser**: Fixed by using direct header comparison instead of Caddy `basicauth` directive
- **iOS touch/mobile**: Fixed with custom touch-to-mouse bridge, visibility change handler, PWA manifest, viewport-fit
- **Open WebUI theme**: Custom Docker build copies CSS to `/app/build/static/`, auto-LLM calls disabled
- **deploy.sh pull failures**: Explicitly lists pullable services (`caddy litellm litellm-db openclaw`), separate `docker compose build open-webui` step
- **OpenClaw config crash loops**: Entrypoint cleans all invalid keys (see "Config Validation" section above)
- **Duplicate WebSocket events on re-login**: `disconnect()` clears all handlers, `_mcEventsRegistered` guard
