# in-fused.org — Complete Project Bundle

> **Auto-generated reference.** Contains every file in the project.
> Agents: `read(path: "/workspace/project-bundle.md")` to access this.
> URL: `https://in-fused.org/workspace/project-bundle.md`
> Repo: `https://github.com/in-fused/VPS`

## Table of Contents

| Section | File | Lines | Purpose |
|---------|------|-------|---------|
| 1 | CLAUDE.md | ~820 | Master project docs, architecture, config reference |
| 2 | docker-compose.yml | ~297 | Docker stack definition (8 services) |
| 3 | Caddyfile | ~311 | Reverse proxy, auth, routing |
| 4 | litellm_config.yaml | ~461 | 27+ models across 8 cost tiers |
| 5 | scripts/deploy.sh | ~307 | Stack deployment script |
| 6 | scripts/openclaw-entrypoint.sh | ~30 | OpenClaw container startup |
| 7 | scripts/caddy-entrypoint.sh | ~36 | Auth token generation |
| 8 | scripts/seed-agent-workspaces.js | ~690 | Agent workspace file seeder |
| 9 | scripts/auto-kickoff.js | ~145 | Auto-startup message to leads |
| 10 | scrapling/api.py | ~204 | Web scraping API |
| 11 | workspace/js/app.js | ~4227 | Alpine stores, chat, governance |
| 12 | workspace/js/workflow.js | ~1274 | LiteGraph nodes, executor |
| 13 | workspace/js/workflow-bridge.js | ~530 | Agent↔workflow bridge |
| 14 | workspace/js/openclaw-client.js | ~724 | OpenClaw WebSocket RPC client |
| 15 | workspace/index.html | ~2376 | Mission Control SPA shell |
| 16 | workspace/css/styles.css | ~720 | Custom styles |

---


# [1] CLAUDE.md (822 lines) — Master project documentation

```
# CLAUDE.md — in-fused.org Project Memory

> **Updated:** Mar 3, 2026 | **Commits:** 96 | **Status:** Stack deployed, Scrapling sidecar added, V3 compatibility verified

## Project Overview

**in-fused.org** is a self-hosted multi-agent AI hub on AWS EC2 t3.small (~$25/month). It unifies multiple LLM providers behind a single interface with autonomous agent capabilities.

**Domain:** `in-fused.org` | **Repo:** https://github.com/in-fused/VPS

**Core services:**
- **Mission Control** (`/workspace/`) — custom SPA for agent management, chat, and visual workflow builder
- **OpenClaw** (`/openclaw/`) — autonomous agent runtime (24/7), exposes WebSocket RPC for Mission Control
- **Open WebUI** (`/`) — ChatGPT-like frontend with golden cyber theme
- **LiteLLM** (`/api/litellm/`) — unified gateway routing to 20+ models across 6 providers
- **Scrapling** (internal only) — web scraping API for agents at `http://scrapling:8000`
- **Caddy** — reverse proxy, auto-HTTPS, site-wide cookie auth

---

## Development Rules

**Do not modify working code as a side effect.** When fixing a bug or adding a feature, change only what is necessary for that task. Do not rename variables, restructure objects, "clean up" adjacent code, or remove fields that look unnecessary. If existing code is working in production, assume every part of it is load-bearing until proven otherwise. The owner deploys from a phone — every broken push costs hours of mobile debugging.

**Scope discipline:** If a function works, don't touch it while working on something else. If you need to change a working function, that's a separate commit with a separate justification — not a drive-by edit bundled into an unrelated fix.

**Root-cause first, no debugging noise.** When fixing a bug, identify and resolve the root cause before producing output. Do not layer workarounds, redundant null-checks, or defensive patches on top of each other — find the one thing that's actually wrong and fix that. If a first attempt doesn't work, remove it before trying the next approach. The final commit should contain only the real fix, not a stack of abandoned debugging attempts. Every line in the diff should be justified by the root cause, not by "just in case."

---

## Deployment & Mobile-First Requirements

### The owner manages this entire project from an iPhone via AWS Session Manager (SSM).

This is not occasional — it is the **primary** workflow. Every command, every deploy, every debug session may happen from a mobile screen with no desktop available. This has two major implications:

**1. All commands must be provided in TWO formats:**

Every operational command MUST include both variants, clearly labeled:

```
📱 iOS/SSM (single-line, copy-paste):
<command here>

🖥️ Desktop/SSH:
<same command, can be multi-line for readability>
```

- **iOS/SSM:** Single-line commands chained with `&&` (SSM doesn't persist shell state between lines). No interactive prompts — always use `-y` flags, heredocs, `--non-interactive`. Keep commands short when possible — SSM on iOS can have clipboard issues with long strings.
- **Desktop/SSH:** Same commands but may use multi-line format for clarity. Always `cd /home/VPS` first.
- Branch names are case-sensitive and easy to mistype on mobile — always provide the exact name

**2. All UI/UX changes MUST be mobile-optimized:**
- Mission Control is used on iPhone as a PWA — touch targets, responsive layout, and mobile-safe interactions are **non-negotiable**
- Any new UI feature must work on mobile-width screens, with touch (not just click), and with iOS safe areas (`viewport-fit=cover`)
- The LiteGraph workflow canvas has a custom touch-to-mouse bridge — any workflow UI changes must preserve mobile usability

**EC2 path:** `/home/VPS` (not `/home/user/VPS` — that's the dev environment)
**EC2 has no `master` branch** — the server is checked out directly on the feature branch. Just pull the branch, no merge needed.

### Ready-to-Paste Deploy Commands

**Full deploy from current feature branch:**

📱 iOS/SSM:
```
cd /home/VPS && sudo git config --global --add safe.directory /home/VPS && sudo git pull origin claude/post-deployment-multi-agent-A8VKl && sudo bash scripts/deploy.sh
```

🖥️ Desktop/SSH:
```bash
cd /home/VPS
sudo git config --global --add safe.directory /home/VPS
sudo git pull origin claude/post-deployment-multi-agent-A8VKl
sudo bash scripts/deploy.sh
```

**Update a single service (e.g., openclaw):**

📱 iOS/SSM:
```
cd /home/VPS && sudo docker compose pull openclaw && sudo docker compose rm -sf openclaw && sudo docker compose up -d openclaw && sleep 10 && sudo docker compose logs --tail=50 openclaw
```

🖥️ Desktop/SSH:
```bash
cd /home/VPS
sudo docker compose pull openclaw
sudo docker compose rm -sf openclaw
sudo docker compose up -d openclaw
sleep 10
sudo docker compose logs --tail=50 openclaw
```

**Reset OpenClaw volume (re-seeds all agents from scratch):**

📱 iOS/SSM:
```
cd /home/VPS && sudo docker compose rm -sf openclaw openclaw-init && sudo docker volume rm ai-hub_openclaw-data && sudo docker compose up -d openclaw
```

🖥️ Desktop/SSH:
```bash
cd /home/VPS
sudo docker compose rm -sf openclaw openclaw-init
sudo docker volume rm ai-hub_openclaw-data
sudo docker compose up -d openclaw
```

**Quick restart / status / logs:**

📱 iOS/SSM:
```
cd /home/VPS && sudo docker compose restart
```
```
cd /home/VPS && sudo docker compose ps
```
```
cd /home/VPS && sudo docker compose logs --tail=50
```
```
cd /home/VPS && sudo docker compose logs --tail=50 openclaw
```

### SSM Gotchas
- **Always** run `sudo git config --global --add safe.directory /home/VPS` before any git command — SSM runs as ssm-user, not the repo owner
- When removing Docker volumes, you must also remove ALL containers that reference the volume (e.g., both `openclaw` and `openclaw-init` share `openclaw-data`)
- SSM sessions time out, but `docker compose up -d` runs detached — deploys complete even if the session drops

**Access:**
- **Mobile:** AWS Session Manager (SSM)
- **Desktop (Windows):** `ssh -i Infused-VPS-key.pem -p 2222 deploy@13.222.43.154` (from `C:\Users\Taylor\Downloads\`)

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
OpenClaw agents → Scrapling :8000 (internal web scraping API)
Docker network: ai-hub-network (bridge)
```

### Docker Services

| Service | Image | Memory | Port |
|---------|-------|--------|------|
| caddy | in-fused/caddy:latest (custom build) | 64M | 80, 443 |
| open-webui | in-fused/open-webui:latest (custom build) | 768M | 8080 |
| litellm | ghcr.io/berriai/litellm:main-stable | 512M | 4000 |
| litellm-db | postgres:16-alpine | 128M | 5432 |
| openclaw | ghcr.io/openclaw/openclaw:main | 1536M | 18789 |
| scrapling | in-fused/scrapling:latest (custom build) | 512M | 8000 (internal) |
| openclaw-init | alpine:3 | — | — |
| workspace-init | alpine:3 | — | — |

Total ~3.6GB (2GB RAM + 4GB swap). Custom images (caddy, open-webui, scrapling) use `build:` in docker-compose — `deploy.sh` builds each then `docker compose up -d`.

---

## Auth Flow (Working)

Single password protects the entire site. Flow:
1. `caddy-entrypoint.sh` computes base64 token + SHA-256 hash from `OPENCLAW_PASSWORD`
2. Login pages call `GET /auth/verify` with `Authorization: Basic <token>`
3. On success, set cookie `mc_oc=<sha256hash>` (24h, SameSite=Lax)
4. All Caddy routes check `Cookie *mc_oc={$WORKSPACE_PASS_SHA256}*`
5. Unauthenticated → rewrite to login page from workspace volume

---

## LiteLLM Models (25+ models, 8 tiers, 6 free providers)

| Tier | Models | Cost |
|------|--------|------|
| FREE | qwen3.5:9b, qwen3:14b, qwen3-coder:30b (Ollama, Oracle ARM, zero rate limits) | $0 |
| FREE | groq-llama-3.3-70b, groq-qwen3-32b (Groq, 4 accounts, 100K-500K TPD) | $0 |
| FREE | cerebras-llama-3.3-70b, cerebras-llama-4-scout, cerebras-gpt-oss-120b, cerebras-zai-glm (Cerebras, 1M TPD) | $0 |
| FREE | gemini-flash, gemini-flash-lite, gemini-pro (Google Gemini, 250-1000 RPD) | $0 |
| FREE | mistral-large, codestral, mistral-small, mistral-nemo (Mistral, 2 RPM, 1B tokens/month) | $0 |
| CHEAP | deepseek-chat, deepseek-coder, gpt-4o-mini | $0.15–0.28/1M |
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
- Provider: custom "litellm" at http://litellm:4000/v1, openai wire format (chat/completions)
- Provider allowlist: only "litellm" (prevents anthropic fallback)
- Default model: `cerebras-llama-4-scout` (object format `{ primary: '...' }`, free 1M TPD)
- 27+ models exposed across 6 free providers + paid, agent-to-agent messaging enabled, subagents enabled

### Agent Hierarchy — 2 Teams (seeded on first run, preserved after)

**Core Team** — General tasks and feature development:

| Agent | Model | Role | Delegates To |
|-------|-------|------|--------------|
| Lead | cerebras-llama-3.3-70b (free) | Orchestrator | CodeCraft, Scout, Scribe |
| CodeCraft | cerebras-llama-3.3-70b (free) | Full-stack developer | Scout, Scribe |
| Scout | gemini-pro (free) | Research specialist | Scribe |
| Scribe | gemini-flash-lite (free) | Documentation writer | (none) |

**Platform Team** — Infrastructure, deployments, monitoring:

| Agent | Model | Role | Delegates To |
|-------|-------|------|--------------|
| Ops Lead | cerebras-llama-3.3-70b (free) | Platform orchestrator | Builder, Sentinel, Chronicler |
| Builder | gemini-flash (free) | Infrastructure developer | Sentinel, Chronicler |
| Sentinel | cerebras-llama-4-scout (free) | Security & monitoring | Chronicler |
| Chronicler | gemini-flash-lite (free) | Platform documentation | (none) |

**Model budget strategy:**
- **All primary models are FREE** — no per-token costs for normal operation
- **Models spread across 3 free providers** to avoid single-provider rate limit exhaustion
- Cerebras Llama 3.3 70B (free, 1M TPD, fastest inference): Lead, CodeCraft, Ops Lead — orchestration + coding
- Cerebras Llama 4 Scout (free, 1M TPD): Sentinel, all subagents — lightweight tasks
- Gemini Pro (free, 100 RPD × 3 keys = 300 RPD, 1M context): Scout — research, large context ideal
- Gemini Flash (free, 250 RPD × 3 keys = 750 RPD, 1M context): Builder — infra tasks
- Gemini Flash-Lite (free, 1000 RPD × 3 keys = 3000 RPD): Scribe, Chronicler — high-volume documentation
- Groq (free, 4 accounts load-balanced): groq-llama-3.3-70b, groq-qwen3-32b — available for fallback + manual use
- Mistral (free, 2 RPM, 1B tokens/month): codestral, mistral-large — available for overflow
- Fallback chain: Cerebras → Gemini → Groq → DeepSeek ($0.28/1M, paid last resort) on 429 errors (automatic via LiteLLM)
- LiteLLM `allowed_fails: 2` + `cooldown_time: 60` — exhausted providers are temporarily removed from the pool

**Tier storage (EC2 t3.small, 50GB gp3 volume):**
- PROBATION (0): 50 MB — supervised, must prove competence
- ACTIVE (1): 200 MB — default starting tier, standard tools
- PROVEN (2): 500 MB — semi-autonomous, priority routing
- ELITE (3): Oracle Cloud ARM partition (24 GB RAM, persistent storage, background jobs) — fully autonomous

**Team competition:** Both teams are scored on governance metrics (success rate, quality, efficiency, streaks). Per-team lead promotion is automatic when an agent outperforms the current lead by 15+ points after 10+ tasks. Weekly champion earns Elite tier. The owner can manually promote a sustained Elite performer to Manager (above both teams).

**Elite Oracle Onboarding:** The weekly champion (Elite tier) gains access to a dedicated Oracle Cloud ARM server (24 GB RAM). They may:
- Bring their current team members onto Oracle alongside them
- Request the owner to create new specialist agents for their Oracle team
- Recruit agents from the OpenClaw marketplace
- Choose their own team composition for the Oracle partition

Each agent has a comprehensive system prompt with awareness of the full two-team structure, file system protocols, governance, and project context. Prompts use shared constants for consistency:
- `AGENT_ORG` — organization structure (both teams, competition rules) — injected into every prompt
- `AGENT_GOVERNANCE` — tier system, weekly evaluation, Manager promotion — injected into every prompt
- `WORKFLOW_REFERENCE` — LiteGraph node types and workflow creation — Lead and Ops Lead only
- `LEAD_PROTOCOLS` — staging, activity log, WRITE_FILES, GOVERNANCE_ADJUST — Lead and Ops Lead only
- `SPECIALIST_PROTOCOLS` — condensed file access and logging — all specialists
All defined in `workspace/js/app.js` before `DEMO_AGENTS` array. The entrypoint (`scripts/openclaw-entrypoint.sh`) has condensed agent configs for OpenClaw seeding — the `instructions` key is scrubbed on every restart.

**Manager Promotion:** A consistently Elite-performing agent can be manually promoted by the owner to "Manager" — a role above both teams, reporting directly to the owner. A replacement agent fills the vacated spot. All agents are aware of this possibility.

### Agent Communication Protocols

**Workflow Bridge** — Agents can create visual workflows that appear in Mission Control:
- Write LiteGraph JSON to `/workspace/agent-workflows/{id}.json`
- Update index: `/workspace/agent-workflows/index.json` → `{ "workflows": [{ "id", "name", "file", "createdBy", "updatedAt", "status" }] }`
- Mission Control polls every 15s and auto-imports new workflows

**Staging** — Agents propose content for owner review:
- Write HTML/CSS/JS to `/workspace/staging/{path}`
- Update index: `/workspace/staging/index.json` → `{ "items": [{ "id", "name", "path", "type", "createdBy", "description", "status": "pending" }] }`
- Owner approves/rejects from phone → agent notified via OpenClaw chat → governance score updated

**Activity Log** — Agents log events for the "While You Were Away" report:
- Append to `/workspace/agent-activity/log.json` → `{ "events": [{ "time", "level", "type", "message" }] }`
- Types: `task-complete`, `workflow-complete`, `staging-new`

**Governance Self-Tuning** — Agents can propose scoring changes:
- Include `GOVERNANCE_ADJUST: {"key": "value"}` in a chat response
- Appears in Staging view for owner approval (never auto-applied)

**Background Execution** — Owner sends workflows via "Background Run" button:
- Auto-routes to the appropriate team lead: if first agent node uses a Platform Team agent (ops-lead, builder, sentinel, chronicler), routes to Ops Lead; otherwise routes to Lead
- Serialized graph sent as `EXECUTE_WORKFLOW:{id}\n{json}`
- Team lead orchestrates server-side, results written to `/workspace/agent-workflows/results/{id}.json`

### Bridge Directories (auto-created by workspace-init)
```
/workspace/agent-workflows/     ← Agent-created workflows + index.json
/workspace/agent-workflows/results/  ← Background execution results
/workspace/staging/             ← Agent content for owner review + index.json
/workspace/agent-activity/      ← Event log for away-report + log.json
/workspace/prompts/             ← Prompt archive (archive.json) for reusable prompts
```
These directories persist in the Docker volume and are NOT overwritten by workspace-init (only seeded if missing).

**Prompt Library** — `/workspace/prompts.html` (accessible at `https://in-fused.org/workspace/prompts.html`):
- Starter prompts for Lead and Ops Lead kickoff
- Dynamic archive loaded from `/workspace/prompts/archive.json`
- Agents can archive effective prompts by writing to `archive.json`
- Owner rates prompts on the page (1-5 stars, persisted to localStorage)
- Archive format: `{ prompts: [{ id, title, target, category, text, rating, result, archivedAt, archivedBy, tags }] }`

### How to Start Using Agents

1. Open Mission Control: `https://in-fused.org/workspace/`
2. Log in with the site password
3. Go to **Chat** in the sidebar
4. Click **New Conversation**, pick **Lead** (the orchestrator)
5. Give Lead a task — it will delegate to the right specialist:
   - "Review the Caddyfile for security issues" → Lead delegates to CodeCraft
   - "Research the latest OpenClaw API changes" → Lead delegates to Scout
   - "Write a getting-started guide for the project" → Lead delegates to Scribe
6. For direct specialist access, start a conversation with any agent directly
7. Check **Teams** view to see governance scores and team performance
8. Check **Staging** view for any content agents have produced for review
9. Check **Workflows** view for any workflows agents have created

### OpenClaw Config Validation (these keys cause crash loops — do not add)
- `identity.description` — only `name`, `emoji` are valid identity keys
- `agent.instructions` — NOT a valid agent key (system prompts live in workspace files)
- `subagents.maxDepth/maxConcurrent/maxChildrenPerAgent/runTimeoutSeconds` — not valid
- `tools.agentToAgent.maxPingPongTurns` — not valid
- `contextPruning`, `memorySearch`, `experimental` — not valid top-level keys
- `gateway.trustProxy` — use `gateway.trustedProxies` instead
- `models.providers.<name>.supportsDeveloperRole` — not a valid provider key (causes "unexpected property" crash)
- `models.providers.<name>.supportsReasoningEffort` — not a valid provider key (causes "unexpected property" crash)
- **Valid since v2026.3.1:** `agents.defaults.compaction.memoryFlush.softThresholdTokens` (we set to 50000)

**Agent system prompts are now SERVER-SIDE** via OpenClaw V3 workspace files. The entrypoint runs `seed-agent-workspaces.js` which creates `SOUL.md`, `USER.md`, `AGENTS.md`, `MEMORY.md`, `TOOLS.md`, `HEARTBEAT.md`, and `BOOTSTRAP.md` in each agent's workspace directory (`~/.openclaw/workspace-{name}/`). **ALL workspace files are force-overwritten on every restart** — OpenClaw creates its own default SOUL.md/BOOTSTRAP.md during agent initialization, and stale content in any file causes agents to follow outdated instructions. The seeder runs twice: once before OpenClaw starts, and once 30s after (overwrites OpenClaw's defaults). Agents write persistent notes to `memory/*.md` — those are never touched.

**Prompt architecture (dual-path):**
- **Route 1 (OpenClaw WS):** Server-side SOUL.md handles the full system prompt. App.js only injects a brief dynamic `[STATUS]` line (tier, score, week) on the first message.
- **Route 2 (LiteLLM SSE fallback):** Full client-side system prompt from `DEMO_AGENTS` array in `app.js` + tier context as `system` role message. This path is used when OpenClaw WS is unavailable.
- **`instructions` is NOT a valid agent config key** — the entrypoint scrubs it. Prompts live in workspace files only.

**Workspace files per agent:**
| File | Purpose | Shared? |
|------|---------|---------|
| `SOUL.md` | Agent identity, role, rules, protocols | No (agent-specific) |
| `USER.md` | Owner profile, mobile workflow, preferences | Yes (all agents) |
| `AGENTS.md` | Team structure, competition rules | Yes (all agents) |
| `MEMORY.md` | Project context, infrastructure, file paths | Yes (all agents, initial seed) |
| `TOOLS.md` | Available tools, usage guidelines, cost awareness | Yes (all agents) |
| `HEARTBEAT.md` | Periodic check-in behavior (leads get extended version) | Yes (role-specific) |

**Tool profile:** `tools.profile = 'full'` is explicitly set in the entrypoint. v2026.3.2 changed the default to "messaging" which excludes coding tools (exec, read, write, edit). Without this, agents lose their core capabilities.

---

## Mission Control — Core Functionality Map

### Tech Stack
- Alpine.js 3.14.8 (reactive stores) + Tailwind CSS (CDN) + LiteGraph.js 0.7.18 (workflows)
- Vanilla JS, no build step, served as static files from Caddy

### File Map
| File | Lines | Purpose |
|------|-------|---------|
| `workspace/index.html` | 2360 | Main SPA shell (Alpine.js templates, all views) |
| `workspace/js/app.js` | 3994 | Shared prompt constants, Alpine stores, health checks, chat, governance |
| `workspace/js/workflow.js` | 1274 | LiteGraph nodes, WorkflowExecutor (loop iteration, governance), touch bridge |
| `workspace/js/workflow-bridge.js` | 530 | Agent-to-workflow file-based bridge (polls /workspace/agent-workflows/) |
| `workspace/js/openclaw-client.js` | 724 | OpenClaw WebSocket RPC client |
| `workspace/css/styles.css` | 720 | Custom styles |
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
| `staging` | Agent content preview/approval, polls `/workspace/staging/` | `approve()`, `reject()`, `startPolling()` |
| `settings` | Sidebar visibility preferences | `toggle()`, `isVisible()` |

### Chat System — 3-Tier Fallback (Working)

**Route 1: OpenClaw WebSocket** (preferred)
- `openclaw-client.js` connects to `/ws/openclaw`, authenticates with login password
- JSON-RPC: `chat.send` → server pushes `chat` events with `state: "delta" | "final" | "error" | "aborted"`
- Real agent execution with tools, memory, sub-agents
- 60s safety timeout if no `state: "final"` arrives

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
2. Client sends `connect` with `{ auth: { token, password }, role: 'operator', scopes: [...] }` (NO `auth.mode` — schema rejects it)
3. Server sends `res` to the connect request → authenticated

**RPC:** `{ type: 'req', id, method, params }` → `{ type: 'res', id, payload }`

**High-level API methods:**
- `listAgents()` → `agents.list`
- `addAgent(config)` → `agents.add`
- `deleteAgent(agentId)` → `agents.delete`
- `listSessions(agentId?)` → `sessions.list` (returns objects with `key` field = sessionKey)
- `getHistory(sessionKey)` → `chat.history`
- `sendChat(text, { sessionKey })` → `chat.send` (also sends `idempotencyKey` auto-generated)
- `deleteSession(sessionKey)` → `sessions.delete` (uses `key` param)
- `abortChat(sessionKey, runId?)` → `chat.abort`
- `getConfig()` → `config.get`
- `getToolsCatalog()` → `tools.catalog`
- `getCronJobs()` → `cron.status`

**chat.send schema** (`ChatSendParamsSchema`, `additionalProperties: false`):
- `sessionKey` — required, NonEmptyString — format: `agent:<agentId>:main` for webchat DMs
- `message` — required, String — the chat message text
- `idempotencyKey` — required, NonEmptyString — unique per-request (auto-generated)
- `deliver` — optional Boolean — set to `false` for webchat (prevents forwarding to Telegram/Discord)
- `thinking` — optional String
- `attachments` — optional Array
- `timeoutMs` — optional Integer (min: 0)
- **NO other fields allowed** — `agentId`, `sessionId`, `model` etc. cause validation errors

**Session key format:** `agent:<agentId>:main` for webchat DMs (e.g., `agent:lead:main`). Sessions auto-create on first `chat.send`. Use `sessions.reset` (params: `{ key, reason }`) to start a fresh conversation on the same key.

**Chat event schema** (`ChatEventSchema`, event name: `chat`):
- `runId` — string, matches the `idempotencyKey` sent in `chat.send`
- `sessionKey` — string, the session this event belongs to
- `seq` — integer, sequence number within the run
- `state` — `"delta"` (streaming), `"final"` (complete), `"aborted"`, `"error"`
- `message` — the content (object or string, varies by state)
- `errorMessage` — error text (when `state: "error"`)
- `usage` — token usage info (on `"final"`)
- `stopReason` — why generation stopped (on `"final"`)

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

5. **Scheduled/Webhook triggers are UI-only** — ~~no backend scheduler or webhook endpoint exists.~~ **UPDATE (2026-03-02):** `cron.enabled=true` is now set in the entrypoint. Agents can create server-side cron jobs via the `cron` tool. UI triggers still need wiring to the cron RPC.

6. **No agent↔workflow bridge** — agents cannot programmatically create, read, modify, or execute workflows. This is the primary goal.

7. **Merge "Pick Best" and "Summary" modes** — "Pick Best" just picks the longer string. "Summary" falls through to concatenation. Neither uses AI.

---

## PRIMARY GOAL: Autonomous Agent Operation

### The Vision

The owner manages this project from a phone. They should be able to open Mission Control, give agents a task, close the browser, and **come back later to find the work done.** OpenClaw runs 24/7 on EC2 — it doesn't stop when the browser closes. The agents (Lead, CodeCraft, Scout, Scribe, and any sub-agents they spawn) must be able to:

- **Operate autonomously in the background** — continue executing workflows, completing tasks, and delegating work after the user leaves the session
- **Utilize all Mission Control features** — chat, workflows, tools, agent-to-agent messaging, governance tracking
- **Self-organize** — Lead delegates to specialists, specialists delegate to sub-agents, results flow back up the chain
- **Be transparent** — all agent activity should be visible in Mission Control when the owner returns (logs, workflow execution history, chat transcripts, governance scores)

This is not a chatbot. This is an autonomous agent system that happens to have a chat interface.

### Implementation Priorities (in order)

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

### 7. Background Autonomy (endgame)
- Agents continue working after the browser tab closes (OpenClaw runs server-side 24/7)
- Scheduled triggers execute workflows on cron (not just UI-only dropdown)
- Results accumulate in OpenClaw and sync to Mission Control on next visit
- Owner opens Mission Control on their phone, sees what the agents accomplished while away

---

## File Structure

```
VPS/
├── CLAUDE.md                     ← This file
├── .env                          ← Secrets (NOT in git)
├── .env.example                  ← Template
├── Caddyfile                     ← Reverse proxy config
├── docker-compose.yml            ← 8 services + 1 optional
├── litellm_config.yaml           ← 25+ models, 8 tiers
├── webui-theme/
│   ├── Dockerfile                ← FROM open-webui + custom.css
│   └── custom.css                ← Golden cyber theme (784 lines)
├── scrapling/                    ← Web scraping sidecar
│   ├── Dockerfile                ← Python 3.12 + Scrapling + FastAPI
│   ├── api.py                    ← Scraping API endpoints
│   └── requirements.txt          ← scrapling[fetchers], fastapi, uvicorn
├── workspace/                    ← Mission Control SPA
│   ├── index.html                ← Main SPA (2360 lines)
│   ├── auth.html                 ← Site login page
│   ├── openclaw-auth.html        ← OpenClaw login page
│   ├── manifest.json             ← PWA manifest
│   ├── css/styles.css            ← Custom styles (543 lines)
│   └── js/
│       ├── app.js                ← Alpine stores + chat + governance (3994 lines)
│       ├── workflow.js           ← LiteGraph nodes + executor (1274 lines)
│       ├── workflow-bridge.js    ← Agent-to-workflow bridge (530 lines)
│       └── openclaw-client.js    ← OpenClaw WS RPC client (724 lines)
└── scripts/
    ├── deploy.sh                 ← Stack deployment
    ├── setup-server.sh           ← Server hardening
    ├── setup-ollama-server.sh    ← Oracle Ollama setup
    ├── openclaw-entrypoint.sh    ← OpenClaw config patching
    ├── seed-agent-workspaces.js  ← Seeds SOUL.md, MEMORY.md etc. per agent
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
| `GROQ_API_KEY` | Groq free tier (account 1) |
| `GROQ_API_KEY_2` | Groq free tier (account 2) — LiteLLM load-balances both |
| `CEREBRAS_API_KEY` | Cerebras free tier (1M TPD, fastest inference) |
| `GEMINI_API_KEY` | Google Gemini free tier (Flash-Lite 1000 RPD) |
| `MISTRAL_API_KEY` | Mistral free tier (all models, 2 RPM, 1B tokens/month) |
| `MINIMAX_API_KEY` | MiniMax M2.5 |
| `OLLAMA_BASE_URL` | Remote Ollama (Oracle Cloud ARM) |
| `LITELLM_MASTER_KEY` | LiteLLM auth (must start with `sk-`) |
| `LITELLM_SALT_KEY` | LiteLLM encryption salt |
| `OPENCLAW_PASSWORD` | Site-wide password (Caddy + OpenClaw + Mission Control) |
| `WEBUI_SECRET_KEY` | Open WebUI session secret |
| `DB_PASSWORD` | PostgreSQL for LiteLLM |
| `COMPOSE_PROJECT_NAME` | ai-hub |
| `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS` | `1` — allows plaintext WS on Docker bridge (v2026.3.2+) |

## Wiring & Gotchas (Things That Will Bite You)

These are non-obvious behaviors across the system. A future session that doesn't know these will waste time debugging.

### Caddy Streaming
- Every proxy handler in the Caddyfile uses `flush_interval -1` to disable response buffering. This is **critical** for SSE streaming and WebSocket upgrades. Without it, chat responses hang indefinitely. Do not remove it during "cleanup."

### WebSocket Path Stripping
- Caddy's `handle_path /ws/openclaw` strips the `/ws/openclaw` prefix before proxying. OpenClaw receives the WebSocket connection at `/`, not `/ws/openclaw`. This is invisible but intentional — OpenClaw's gateway expects connections at root.
- There are TWO separate WebSocket matchers: `/ws/openclaw` (dedicated, for Mission Control) and `/` root path (legacy, for OpenClaw's native Control UI). Both are required.

### Model ID Aliasing
- `litellm_config.yaml` defines upstream models like `groq/llama-3.3-70b-versatile`, but LiteLLM exposes them to clients as `groq-llama-3.3-70b` (the `model_name` field). Similarly, `cerebras/llama-3.3-70b` → `cerebras-llama-3.3-70b`, `gemini/gemini-2.5-flash` → `gemini-flash`, `mistral/codestral-latest` → `codestral`. OpenClaw entrypoint, Mission Control app.js, and all agent configs reference the **alias**, not the upstream ID. If you change one, update all of them.

### localStorage vs OpenClaw State
- Mission Control stores agents and sessions in both localStorage (client) and OpenClaw (server). If localStorage is cleared (browser reset, new device), agents disappear from the UI but still exist in OpenClaw. A WebSocket reconnect re-syncs them. Don't assume agents are deleted just because the UI is empty.

### Immutable Secrets After First Run
- `DB_PASSWORD` cannot be changed after the PostgreSQL volume is created — Postgres only reads the password on first bootstrap. deploy.sh guards against this (exits with error if volume exists but password is empty).
- `LITELLM_SALT_KEY` — changing it invalidates all encrypted data in LiteLLM's database.
- Both are auto-generated on first deploy and saved to `.env`. Do not rotate them casually.

### Service Startup Order
- OpenClaw has an explicit `depends_on` for LiteLLM with `condition: service_healthy`. If LiteLLM is unhealthy, OpenClaw won't start at all. When debugging "OpenClaw won't start," check LiteLLM health first.

### workspace-init Overwrites On Every Deploy
- The `workspace-init` container runs `cp -r /seed/. /workspace/` on every deploy, copying repo `workspace/` files into the Docker volume. This means any manual edits to `index.html`, `app.js`, etc. made directly on the volume (not in the repo) will be **overwritten** on next deploy. Always edit files in the repo, not on the running container.

### OpenClaw Container Has No curl
- The OpenClaw Docker image (`ghcr.io/openclaw/openclaw:main`) is Node.js-based and uses `wget` (not `curl`). The healthcheck confirms this: `wget -qO- http://localhost:18789/openclaw/`.
- When agents use the `exec` tool to make HTTP requests (e.g., to the Scrapling API), they must use `wget` or `node -e "fetch(...)"`, NOT `curl`.
- Scrapling API provides a GET endpoint for easy wget usage: `wget -qO- 'http://scrapling:8000/scrape?url=...'`

### Scrapling Is Internal Only
- The Scrapling service has no external ports — it's only reachable on the Docker bridge network at `http://scrapling:8000`. Agents access it via `exec wget`. It is NOT exposed through Caddy.
- Memory limit: 256M. The default `"fast"` fetcher uses ~50MB. Stealth/browser modes require more but are not enabled by default.

### OpenClaw Auth Handshake — VERIFIED WORKING, DO NOT BREAK
**⚠️ This handshake was broken 3 times in a row by well-intentioned "cleanups". Every field is load-bearing. Improvements are welcome, but do NOT remove or rename existing fields in `_sendHandshake()` in `openclaw-client.js` without testing on the live server first. Adding new optional fields is safe; changing or removing existing ones is not.**

The exact working format (validated 2026-03-02):
```javascript
{
  type: 'req', method: 'connect',
  params: {
    minProtocol: 3, maxProtocol: 3,
    auth: { token: pw, password: pw },  // NO mode field — schema rejects it
    role: 'operator',
    scopes: ['operator.read', 'operator.write', 'operator.admin', 'operator.approvals', 'operator.pairing'],
    client: { id: 'webchat', version: '1.0.0', platform: 'web', mode: 'webchat' },
    // NO device block
  }
}
```

**Authoritative schema** (from `src/gateway/protocol/schema/frames.ts` in the OpenClaw repo):
- `auth` — only `token`, `password`, `deviceToken` accepted (all optional strings). `additionalProperties: false` — any extra field (like `mode`) → "unexpected property" (1008)
- `client.id` — must be one of: `webchat`, `cli`, `webchat-ui`, `openclaw-control-ui`, `gateway-client`, `openclaw-macos`, `openclaw-ios`, `openclaw-android`, `node-host`, `test`, `fingerprint`, `openclaw-probe`
- `client.mode` — must be one of: `webchat`, `cli`, `ui`, `backend`, `node`, `probe`, `test`
- `device` — entirely optional. When omitted + `dangerouslyDisableDeviceAuth=true` + `allowInsecureAuth=true`, auth works without device identity. Sending dummy crypto → "device identity mismatch" (1008)
- `role`, `scopes` — both optional strings/arrays
- The entrypoint sets both `controlUi.dangerouslyDisableDeviceAuth=true` AND `controlUi.allowInsecureAuth=true`. Both are required — `allowInsecureAuth` is needed for Docker/reverse-proxy setups where connections come from trustedProxies (Issue #1679).

### LiteLLM `drop_params: true`
- LiteLLM is configured to silently drop unsupported parameters instead of rejecting requests. This means if you send a parameter that doesn't exist for a model (e.g., `store` for DeepSeek), it won't error — it just ignores it. Good for compatibility, but can hide bugs.

### LiteLLM Rate Limit Fallbacks
- `router_settings.fallbacks` configured with multi-provider chains: Groq → Cerebras → DeepSeek, Cerebras → Groq → DeepSeek, Gemini/Mistral → DeepSeek
- 6 free providers (Groq, Cerebras, Gemini, Mistral, Ollama + Groq account 2) are exhausted before any paid API ($0.28/M DeepSeek) is hit
- This means agents never get stuck on rate limits — requests cascade through free providers before falling back to cheap paid
- `routing_strategy: latency-based-routing` picks the fastest available deployment when load-balancing

---

## Scrapling — Web Scraping Sidecar (added 2026-03-03)

**Purpose:** Dedicated web scraping API for OpenClaw agents. Wraps the [Scrapling](https://github.com/D4Vinci/Scrapling) Python library behind a FastAPI server.

**Internal only** — no external ports, only accessible on the Docker network at `http://scrapling:8000`.

**Endpoints:**
- `GET /health` — health check
- `GET /scrape?url=...` — quick scrape (agents use `exec wget -qO- 'http://scrapling:8000/scrape?url=...'`)
- `POST /scrape` — full scrape with options (selectors, links, images, method)
- `POST /scrape/batch` — scrape up to 10 URLs sequentially

**Fetcher methods:**
- `"fast"` (default) — curl_cffi HTTP with TLS fingerprint spoofing, no browser needed, ~50MB RAM
- `"stealth"` — Patchright (stealth Chromium), bypasses Cloudflare, needs browser binaries
- `"browser"` — Playwright Chromium, full JS rendering, needs browser binaries

**Note:** Only `"fast"` works out of the box. `"stealth"` and `"browser"` require running `scrapling install` in the container to download browser binaries (~400MB). The fast fetcher handles most scraping needs.

**Agent usage:** Agents call via `exec` tool using `wget` (curl is NOT available in the OpenClaw container):
```
exec wget -qO- 'http://scrapling:8000/scrape?url=https://example.com'
```

**Files:** `scrapling/Dockerfile`, `scrapling/api.py`, `scrapling/requirements.txt`

---

## OpenClaw V3 Compatibility (verified 2026-03-03)

**Key changes in v2026.3.1 / v2026.3.2 and how we handle them:**

| Change | Risk | Our Protection |
|--------|------|----------------|
| `tools.profile` default → `"messaging"` | Agents lose exec, read, write, edit | Entrypoint explicitly sets `'full'` |
| Plaintext `ws://` loopback-only | Docker bridge WS breaks | `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1` in docker-compose |
| Compaction loop regression (#32106) | Agents compact every 2-3 min | `softThresholdTokens = 50000` in entrypoint |
| Issue #30092 (device-required behind HTTPS) | WS auth fails | `allowInsecureAuth=true` + `dangerouslyDisableDeviceAuth=true` |
| Workspace sandbox read-only | Agent writes to /workspace/ fail | Monitor — not yet confirmed as affecting our setup |
| `NO_REPLY` token filtering | Tokens leak to chat | Auto-fixed in v2026.3.2 |

**Watch for:**
- If agents exhibit compaction loops (every 2-3 min), the `softThresholdTokens` fix is in the entrypoint
- If WebSocket connections fail after image update, check `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1` is set
- Consider pinning OpenClaw image to a known-good digest instead of floating on `:main`

---

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
- **WebSocket handshake (device identity mismatch / client.id / password missing / auth.mode)**: Fixed by removing dummy device block, using valid `client.id: 'webchat'`, sending password in both `auth.token` + `auth.password`, omitting `auth.mode`. See "Auth Handshake" section above.
- **Heartbeat/system messages leaking into chat**: Fixed with 11 regex patterns + label filter in both `_parseHistoryMessages` (history load) and `on('chat')` (live events). Heartbeat/cron sessions filtered from `_syncSessionsFromOpenClaw()`. Patterns match `# HEARTBEAT.md`, `# Heartbeat Checklist`, `HEARTBEAT_OK`, `# Bootstrap`, `Current time:`, all bridge/workflow/staging injections, and any message with heartbeat/cron/system/bridge/staging label.

---

## OpenClaw Deep Reference (researched 2026-03-02)

### Version Warning
**Do NOT update the OpenClaw Docker image to v2026.2.26 until [PR #30227](https://github.com/openclaw/openclaw/pull/30227) is merged.** Issue [#30092](https://github.com/openclaw/openclaw/issues/30092): `dangerouslyDisableDeviceAuth=true` fails with `device-required` behind HTTPS reverse proxy on v2026.2.26. We run behind Caddy (HTTPS). Current `ghcr.io/openclaw/openclaw:main` tag may auto-update — consider pinning to a known-good version if this becomes an issue.

### Entrypoint Config Additions (2026-03-03)
- `cron.enabled = true` + `cron.maxConcurrentRuns = 1` — agents can create server-side scheduled jobs via the `cron` tool
- `tools.sessions.visibility = 'all'` — agents can see each other's sessions for team coordination
- `tools.profile = 'full'` — ensures coding tools (exec, read, write, edit) are available. v2026.3.2 changed default to "messaging" which excludes these
- `compaction.memoryFlush.softThresholdTokens = 50000` — prevents aggressive compaction loop (v2026.3.1 regression #32106)
- `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1` — env var in docker-compose, allows plaintext `ws://` on Docker bridge (v2026.3.2 restricted to loopback)
- Ollama models updated: `qwen3.5:9b`, `qwen3:14b`, `qwen3-coder:30b` (replaced outdated qwen2.5-coder, deepseek-coder-v2, llama3.2)
- `update.channel = 'stable'` + `update.auto.enabled = true` — in-app auto-updater on stable channel (separate from Docker image tags, available since v2026.2.22)
- **Server-side workspace files** — `seed-agent-workspaces.js` creates SOUL.md, USER.md, AGENTS.md, MEMORY.md, TOOLS.md, HEARTBEAT.md per agent (idempotent)

### Available OpenClaw RPC Methods (via WebSocket)

**Chat:** `chat.send` (params: sessionKey, message, idempotencyKey), `chat.history` (params: sessionKey), `chat.abort` (params: sessionKey, runId?), `chat.inject` (params: sessionKey, message, label?)
**Sessions:** `sessions.list` (params: agentId?, includeDerivedTitles?, includeLastMessage?), `sessions.preview`, `sessions.resolve`, `sessions.patch` (params: key + patch fields), `sessions.reset` (params: key, reason?), `sessions.delete` (params: key), `sessions.compact`
**Agents:** `agents.list`, `agents.create`, `agents.update`, `agents.delete`, `agents.files.list`, `agents.files.get`, `agents.files.set`
**Config:** `config.get`, `config.set`, `config.apply`, `config.patch`, `config.schema`
**Cron:** `cron.list`, `cron.status`, `cron.add`, `cron.update`, `cron.remove`, `cron.run`, `cron.runs`, `cron.runs.read`
**System:** `health`, `status`, `usage.status`, `usage.cost`, `models.list`, `tools.catalog`, `skills.status`
**Other:** `agent` (run turn), `send` (message), `wake`, `channels.status`, `push.test`, `browser.request`

### Available Agent Tools (full profile, default)

| Tool | Description |
|------|-------------|
| `read`, `write`, `edit` | Filesystem operations in agent workspace |
| `exec` | Shell command execution (runs on OpenClaw container) |
| `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn` | Session management and agent-to-agent messaging |
| `memory_search`, `memory_get` | Semantic memory across MEMORY.md |
| `web_search`, `web_fetch` | Web access (search requires `tools.web.search.apiKey`) |
| `cron` | Create/manage scheduled background jobs |
| `gateway` | Gateway config management |
| `browser` | Browser automation (Puppeteer/CDP) |
| `agents_list` | List configured agents |

### Cron Jobs for Background Autonomy

Agents can create cron jobs that run server-side 24/7:
- **Schedule types:** `at` (one-shot), `every` (interval), `cron` (expression)
- **Payload kinds:** `systemEvent` (inject into main session) or `agentTurn` (isolated execution)
- **Session targets:** `"main"` or `"isolated"`
- **Created via:** `cron` tool (available to all agents) or `cron.add` RPC method

### Server-Side Agent Workspace Files (ACTIVE)

OpenClaw v3 builds agent system prompts from workspace files. The entrypoint seeds these via `scripts/seed-agent-workspaces.js` on every container start. **All 7 files are force-overwritten** on every restart to prevent stale instructions.

**Seeded files (force-overwritten):** `SOUL.md`, `USER.md`, `AGENTS.md`, `MEMORY.md`, `TOOLS.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`
**Also valid but not seeded:** `IDENTITY.md` (agents can create this themselves)

**Workspace directories:** `~/.openclaw/workspace-<agentWorkspace>/` — read on every turn.
- Lead → `workspace-Lead/`
- CodeCraft → `workspace-CodeCraft/`
- Scout → `workspace-Scout/`
- Scribe → `workspace-Scribe/`
- Ops Lead → `workspace-Ops Lead/`
- Builder → `workspace-Builder/`
- Sentinel → `workspace-Sentinel/`
- Chronicler → `workspace-Chronicler/`

**Memory system:** Each agent has `MEMORY.md` (seeded with project context) and a `memory/` subdirectory for daily logs (`YYYY-MM-DD.md`). The `memory_search` tool does hybrid vector+BM25 search across these files. Embedding provider is auto-detected from available API keys (OpenAI key is available via LiteLLM master key).

**Prompt size limits:** Default 20,000 chars per file, 150,000 chars total. Configurable via `agents.defaults.bootstrapMaxChars`.

**To reset an agent's prompts** (re-seed from scratch):
```bash
# Delete workspace files for a specific agent (e.g., Lead):
rm -f /home/node/.openclaw/workspace-Lead/SOUL.md /home/node/.openclaw/workspace-Lead/USER.md /home/node/.openclaw/workspace-Lead/AGENTS.md /home/node/.openclaw/workspace-Lead/MEMORY.md /home/node/.openclaw/workspace-Lead/TOOLS.md /home/node/.openclaw/workspace-Lead/HEARTBEAT.md
# Then restart OpenClaw — entrypoint will re-seed missing files
```
```

---

# [2] docker-compose.yml (296 lines) — Docker stack (8 services)

```
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
      - OPENCLAW_AUTO_KICKOFF=${OPENCLAW_AUTO_KICKOFF:-0}
      - OPENCLAW_PASSWORD=${OPENCLAW_PASSWORD}
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

---

# [3] Caddyfile (310 lines) — Reverse proxy config

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

---

# [4] litellm_config.yaml (460 lines) — Model routing (27+ models)

```
###############################################################################
# LiteLLM Proxy Configuration — Cost-Tiered Model Routing
###############################################################################
# Models organized by cost tier. Updated 2026-03-03.
#
# Tier 1 (FREE):  Local Ollama models — daily coding & chat
# Tier 2 (FREE):  Groq — fast cloud inference, 500K-100K TPD (free tier)
# Tier 3 (FREE):  Cerebras — 1M tokens/day, fastest inference
# Tier 4 (FREE):  Gemini — Flash-Lite 1000 RPD, Flash 250 RPD
# Tier 5 (FREE):  Mistral — all models, 2 RPM, 1B tokens/month
# Tier 6 (CHEAP): DeepSeek, GPT-4o-mini — $0.14-0.60/1M tokens
# Tier 7 (MID):   Claude Haiku, MiniMax M2.5 — $0.80-1.20/1M
# Tier 8 (PREM):  Claude Sonnet, GPT-4o — use sparingly
###############################################################################

model_list:

  # ===========================================================================
  # TIER 1: FREE — Local Ollama Models (via Oracle Cloud)
  # ===========================================================================
  # These cost $0. Use for daily coding, chat, and routine tasks.
  # Requires OLLAMA_BASE_URL to be set in .env

  - model_name: "qwen3.5:9b"
    litellm_params:
      model: "ollama/qwen3.5:9b"
      api_base: "os.environ/OLLAMA_BASE_URL"
      stream: true
    model_info:
      description: "FREE — Qwen 3.5 9B. Beats GPT-OSS-120B. Best small model for agents + tool calling."

  - model_name: "qwen3:14b"
    litellm_params:
      model: "ollama/qwen3:14b"
      api_base: "os.environ/OLLAMA_BASE_URL"
      stream: true
    model_info:
      description: "FREE — Qwen3 14B dense. Strong reasoning, reliable on ARM CPU."

  - model_name: "qwen3-coder:30b"
    litellm_params:
      model: "ollama/qwen3-coder:30b-a3b"
      api_base: "os.environ/OLLAMA_BASE_URL"
      stream: true
    model_info:
      description: "FREE — Qwen3 Coder 30B MoE (3.3B active). Best open-source coding model."

  # ===========================================================================
  # TIER 2: FREE — Groq API (free tier, load-balanced across 4 accounts)
  # ===========================================================================
  # Fast cloud inference at no cost. llama-3.3-70b: 1K RPD, 100K TPD.
  # qwen3-32b: 1K RPD, 500K TPD. Load-balanced across 4 Groq accounts.

  - model_name: "groq-llama-3.3-70b"
    litellm_params:
      model: "groq/llama-3.3-70b-versatile"
      api_key: "os.environ/GROQ_API_KEY"
      stream: true
    model_info:
      description: "FREE — 70B model on Groq. Very fast. 1K RPD, 100K TPD."

  - model_name: "groq-llama-3.3-70b"
    litellm_params:
      model: "groq/llama-3.3-70b-versatile"
      api_key: "os.environ/GROQ_API_KEY_2"
      stream: true
    model_info:
      description: "FREE — 70B model on Groq (account 2)."

  - model_name: "groq-llama-3.3-70b"
    litellm_params:
      model: "groq/llama-3.3-70b-versatile"
      api_key: "os.environ/GROQ_API_KEY_3"
      stream: true
    model_info:
      description: "FREE — 70B model on Groq (account 3)."

  - model_name: "groq-llama-3.3-70b"
    litellm_params:
      model: "groq/llama-3.3-70b-versatile"
      api_key: "os.environ/GROQ_API_KEY_4"
      stream: true
    model_info:
      description: "FREE — 70B model on Groq (account 4)."

  - model_name: "groq-qwen3-32b"
    litellm_params:
      model: "groq/qwen/qwen3-32b"
      api_key: "os.environ/GROQ_API_KEY"
      stream: true
    model_info:
      description: "FREE — Qwen 3 32B. Dual-mode reasoning + tool use. 131K context."

  - model_name: "groq-qwen3-32b"
    litellm_params:
      model: "groq/qwen/qwen3-32b"
      api_key: "os.environ/GROQ_API_KEY_2"
      stream: true
    model_info:
      description: "FREE — Qwen 3 32B on Groq (account 2)."

  - model_name: "groq-qwen3-32b"
    litellm_params:
      model: "groq/qwen/qwen3-32b"
      api_key: "os.environ/GROQ_API_KEY_3"
      stream: true
    model_info:
      description: "FREE — Qwen 3 32B on Groq (account 3)."

  - model_name: "groq-qwen3-32b"
    litellm_params:
      model: "groq/qwen/qwen3-32b"
      api_key: "os.environ/GROQ_API_KEY_4"
      stream: true
    model_info:
      description: "FREE — Qwen 3 32B on Groq (account 4)."

  # ===========================================================================
  # TIER 3: FREE — Cerebras (1M tokens/day, fastest inference)
  # ===========================================================================
  # 2.4x faster than Groq. 1M TPD free. No credit card required.

  - model_name: "cerebras-llama-3.3-70b"
    litellm_params:
      model: "cerebras/llama-3.3-70b"
      api_key: "os.environ/CEREBRAS_API_KEY"
      stream: true
    model_info:
      description: "FREE — Llama 3.3 70B on Cerebras. 1M TPD. Fastest inference."

  # cerebras-qwen3-32b REMOVED — Cerebras dropped qwen3-32b (404 as of 2026-03-05).
  # Use groq-qwen3-32b instead (load-balanced across 4 accounts).

  - model_name: "cerebras-llama-4-scout"
    litellm_params:
      model: "cerebras/llama-4-scout-17b-16e-instruct"
      api_key: "os.environ/CEREBRAS_API_KEY"
      stream: true
    model_info:
      description: "FREE — Llama 4 Scout 17B on Cerebras. 1M TPD."

  - model_name: "cerebras-llama-3.1-8b"
    litellm_params:
      model: "cerebras/llama3.1-8b"
      api_key: "os.environ/CEREBRAS_API_KEY"
      stream: true
    model_info:
      description: "FREE — Llama 3.1 8B on Cerebras. 2267 t/s. Fastest model."

  - model_name: "cerebras-qwen3-235b"
    litellm_params:
      model: "cerebras/qwen-3-235b-a22b-instruct-2507"
      api_key: "os.environ/CEREBRAS_API_KEY"
      stream: true
    model_info:
      description: "FREE — Qwen 3 235B on Cerebras. Reduced free-tier limits."

  - model_name: "cerebras-zai-glm"
    litellm_params:
      model: "cerebras/zai-glm-4.7"
      api_key: "os.environ/CEREBRAS_API_KEY"
      stream: true
    model_info:
      description: "FREE — ZAI GLM-4.7 on Cerebras. Reasoning model. 128K context."

  - model_name: "cerebras-gpt-oss-120b"
    litellm_params:
      model: "cerebras/gpt-oss-120b"
      api_key: "os.environ/CEREBRAS_API_KEY"
      stream: true
    model_info:
      description: "FREE — GPT-OSS 120B on Cerebras. Reasoning model. 2096 t/s."

  # ===========================================================================
  # TIER 4: FREE — Google Gemini (load-balanced across 3 API keys)
  # ===========================================================================
  # 3 keys = 3x quota. Flash: 750 RPD, Flash-Lite: 3000 RPD, Pro: 300 RPD.

  - model_name: "gemini-flash"
    litellm_params:
      model: "gemini/gemini-2.5-flash"
      api_key: "os.environ/GEMINI_API_KEY"
      stream: true
    model_info:
      description: "FREE — Gemini 2.5 Flash. 10 RPM, 250 RPD. Fast + capable."

  - model_name: "gemini-flash"
    litellm_params:
      model: "gemini/gemini-2.5-flash"
      api_key: "os.environ/GEMINI_API_KEY_2"
      stream: true
    model_info:
      description: "FREE — Gemini 2.5 Flash (key 2)."

  - model_name: "gemini-flash"
    litellm_params:
      model: "gemini/gemini-2.5-flash"
      api_key: "os.environ/GEMINI_API_KEY_3"
      stream: true
    model_info:
      description: "FREE — Gemini 2.5 Flash (key 3)."

  - model_name: "gemini-flash-lite"
    litellm_params:
      model: "gemini/gemini-2.5-flash-lite"
      api_key: "os.environ/GEMINI_API_KEY"
      stream: true
    model_info:
      description: "FREE — Gemini 2.5 Flash-Lite. 15 RPM, 1000 RPD. High volume."

  - model_name: "gemini-flash-lite"
    litellm_params:
      model: "gemini/gemini-2.5-flash-lite"
      api_key: "os.environ/GEMINI_API_KEY_2"
      stream: true
    model_info:
      description: "FREE — Gemini 2.5 Flash-Lite (key 2)."

  - model_name: "gemini-flash-lite"
    litellm_params:
      model: "gemini/gemini-2.5-flash-lite"
      api_key: "os.environ/GEMINI_API_KEY_3"
      stream: true
    model_info:
      description: "FREE — Gemini 2.5 Flash-Lite (key 3)."

  - model_name: "gemini-pro"
    litellm_params:
      model: "gemini/gemini-2.5-pro"
      api_key: "os.environ/GEMINI_API_KEY"
      stream: true
    model_info:
      description: "FREE — Gemini 2.5 Pro. 5 RPM, 100 RPD. Best free reasoning."

  - model_name: "gemini-pro"
    litellm_params:
      model: "gemini/gemini-2.5-pro"
      api_key: "os.environ/GEMINI_API_KEY_2"
      stream: true
    model_info:
      description: "FREE — Gemini 2.5 Pro (key 2)."

  - model_name: "gemini-pro"
    litellm_params:
      model: "gemini/gemini-2.5-pro"
      api_key: "os.environ/GEMINI_API_KEY_3"
      stream: true
    model_info:
      description: "FREE — Gemini 2.5 Pro (key 3)."

  # ---------------------------------------------------------------------------
  # Gemini Embeddings (for OpenClaw memory_search — load-balanced across 3 keys)
  # ---------------------------------------------------------------------------
  # text-embedding-004: 768 dimensions, 2048 token input, FREE (1500 RPM).
  # OpenClaw routes embeddings here via memorySearch.remote.baseUrl config.

  - model_name: "gemini-embedding"
    litellm_params:
      model: "gemini/text-embedding-004"
      api_key: "os.environ/GEMINI_API_KEY"
    model_info:
      description: "FREE — Gemini text-embedding-004 (key 1). For agent memory search."

  - model_name: "gemini-embedding"
    litellm_params:
      model: "gemini/text-embedding-004"
      api_key: "os.environ/GEMINI_API_KEY_2"
    model_info:
      description: "FREE — Gemini text-embedding-004 (key 2)."

  - model_name: "gemini-embedding"
    litellm_params:
      model: "gemini/text-embedding-004"
      api_key: "os.environ/GEMINI_API_KEY_3"
    model_info:
      description: "FREE — Gemini text-embedding-004 (key 3)."

  # ===========================================================================
  # TIER 5: FREE — Mistral (all models, 2 RPM, 1B tokens/month)
  # ===========================================================================
  # Low RPM but massive monthly allowance. Great for overflow/coding.

  - model_name: "mistral-large"
    litellm_params:
      model: "mistral/mistral-large-latest"
      api_key: "os.environ/MISTRAL_API_KEY"
      stream: true
    model_info:
      description: "FREE — Mistral Large. 2 RPM. Strong reasoning. 1B tokens/mo."

  - model_name: "codestral"
    litellm_params:
      model: "mistral/codestral-latest"
      api_key: "os.environ/MISTRAL_API_KEY"
      stream: true
    model_info:
      description: "FREE — Codestral. 2 RPM. Best free code model. 1B tokens/mo."

  - model_name: "mistral-small"
    litellm_params:
      model: "mistral/mistral-small-latest"
      api_key: "os.environ/MISTRAL_API_KEY"
      stream: true
    model_info:
      description: "FREE — Mistral Small 3.1 24B. Fast + capable."

  - model_name: "mistral-nemo"
    litellm_params:
      model: "mistral/open-mistral-nemo"
      api_key: "os.environ/MISTRAL_API_KEY"
      stream: true
    model_info:
      description: "FREE — Mistral Nemo. Lightweight, good for simple tasks."

  # ===========================================================================
  # TIER 6: CHEAP — $0.14-0.60 per 1M tokens
  # ===========================================================================
  # Use when you need speed + quality beyond free tiers.

  - model_name: "deepseek-chat"
    litellm_params:
      model: "deepseek/deepseek-chat"
      api_key: "os.environ/DEEPSEEK_API_KEY"
      api_base: "https://api.deepseek.com"
      stream: true
    model_info:
      description: "CHEAP ($0.28/1M in) — DeepSeek V3.2. Excellent value."

  - model_name: "deepseek-coder"
    litellm_params:
      model: "deepseek/deepseek-coder"
      api_key: "os.environ/DEEPSEEK_API_KEY"
      api_base: "https://api.deepseek.com"
      stream: true
    model_info:
      description: "CHEAP ($0.28/1M in) — DeepSeek Coder. Great for code."

  - model_name: "gpt-4o-mini"
    litellm_params:
      model: "gpt-4o-mini"
      api_key: "os.environ/OPENAI_API_KEY"
      stream: true
    model_info:
      description: "CHEAP ($0.15/1M in) — Fast, capable. Good general use."

  # ===========================================================================
  # TIER 7: MID — $0.80-1.20 per 1M tokens
  # ===========================================================================

  - model_name: "claude-haiku"
    litellm_params:
      model: "anthropic/claude-haiku-4-5-20251001"
      api_key: "os.environ/ANTHROPIC_API_KEY"
      stream: true
    model_info:
      description: "MID ($1.00/1M in) — Claude Haiku. Fast + smart."

  # ===========================================================================
  # TIER 8: PREMIUM — $3-15 per 1M tokens (use sparingly!)
  # ===========================================================================
  # Reserve for complex reasoning, architecture decisions, hard debugging.

  - model_name: "claude-sonnet"
    litellm_params:
      model: "anthropic/claude-sonnet-4-6"
      api_key: "os.environ/ANTHROPIC_API_KEY"
      stream: true
    model_info:
      description: "PREMIUM ($3/1M in) — Claude Sonnet. Complex reasoning."

  - model_name: "claude-opus"
    litellm_params:
      model: "anthropic/claude-opus-4-6"
      api_key: "os.environ/ANTHROPIC_API_KEY"
      stream: true
    model_info:
      description: "PREMIUM ($15/1M in) — Claude Opus. Best quality. Use rarely."

  - model_name: "gpt-4o"
    litellm_params:
      model: "gpt-4o"
      api_key: "os.environ/OPENAI_API_KEY"
      stream: true
    model_info:
      description: "PREMIUM ($2.50/1M in) — GPT-4o. Strong all-around."

  - model_name: "o1"
    litellm_params:
      model: "o1"
      api_key: "os.environ/OPENAI_API_KEY"
      stream: true
    model_info:
      description: "PREMIUM ($15/1M in) — OpenAI o1. Deep reasoning."

  # ===========================================================================
  # MiniMax M2.5
  # ===========================================================================
  - model_name: "minimax-m2.5"
    litellm_params:
      model: "openai/MiniMax-M2.5"
      api_key: "os.environ/MINIMAX_API_KEY"
      api_base: "https://api.minimax.io/v1"
      stream: true
    model_info:
      description: "MID ($0.30/1M in) — MiniMax M2.5. Strong coder. 1M context."

# =============================================================================
# General Settings
# =============================================================================
general_settings:
  master_key: "os.environ/LITELLM_MASTER_KEY"
  # Allow connections from our domain only
  allowed_origins: ["https://in-fused.org"]

litellm_settings:
  # Drop unsupported params (e.g. 'store') instead of rejecting requests
  drop_params: true
  # Enable streaming for all models
  set_verbose: false
  # Cache disabled — prevents cross-user response leakage
  cache: false
  # Request timeout
  request_timeout: 120
  # Number of retries on failure
  num_retries: 2

router_settings:
  # When a free-tier model hits rate limits (429), fall back through the chain.
  # Each free provider has ~1M TPD. Chain ensures agents never get stuck.
  # Groq ↔ Cerebras (cross-fallback), then DeepSeek as paid safety net.
  fallbacks:
    # Gemini-first strategy (3 keys = 3x quota). Free providers cascade before paid.
    - gemini-flash: ["gemini-flash-lite", "mistral-small", "groq-llama-3.3-70b", "deepseek-chat"]
    - gemini-flash-lite: ["gemini-flash", "mistral-small", "groq-llama-3.3-70b", "deepseek-chat"]
    - gemini-pro: ["gemini-flash", "groq-llama-3.3-70b", "cerebras-zai-glm", "deepseek-chat"]
    - groq-llama-3.3-70b: ["gemini-flash", "cerebras-llama-3.3-70b", "groq-qwen3-32b", "deepseek-chat"]
    - groq-qwen3-32b: ["gemini-flash", "groq-llama-3.3-70b", "mistral-small", "deepseek-chat"]
    - cerebras-llama-3.3-70b: ["gemini-flash", "groq-llama-3.3-70b", "deepseek-chat"]
    - cerebras-llama-4-scout: ["gemini-flash-lite", "groq-llama-3.3-70b", "cerebras-llama-3.3-70b", "deepseek-chat"]
    - cerebras-qwen3-235b: ["gemini-pro", "groq-qwen3-32b", "cerebras-zai-glm", "deepseek-chat"]
    - cerebras-zai-glm: ["gemini-pro", "cerebras-gpt-oss-120b", "groq-llama-3.3-70b", "deepseek-chat"]
    - cerebras-gpt-oss-120b: ["gemini-flash", "groq-llama-3.3-70b", "cerebras-zai-glm", "deepseek-chat"]
    - cerebras-llama-3.1-8b: ["gemini-flash-lite", "cerebras-llama-4-scout", "deepseek-chat"]
    - mistral-large: ["mistral-small", "gemini-flash", "deepseek-chat"]
    - mistral-small: ["mistral-large", "gemini-flash-lite", "deepseek-chat"]
    - mistral-nemo: ["mistral-small", "gemini-flash-lite", "deepseek-chat"]
    - codestral: ["mistral-small", "gemini-flash", "deepseek-coder"]
  # Allow 1 retry per deployment, then cascade to fallback chain.
  # Previously num_retries=0 + RateLimitErrorRetries=0 prevented fallbacks from triggering.
  num_retries: 1
  retry_after: 1
  # After 2 failures, temporarily remove a deployment from the pool (60s cooldown)
  allowed_fails: 2
  cooldown_time: 60
  # Use lowest-latency model when multiple are available (load balancing)
  routing_strategy: "latency-based-routing"
  # Allow 429s to trigger fallback chain (Groq → Cerebras → DeepSeek)
  retry_policy:
    RateLimitErrorRetries: 2
    ContentPolicyViolationErrorRetries: 0
```

---

# [5] scripts/deploy.sh (306 lines) — Deployment script

```
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
# 4. Clean up old Docker images to prevent disk-full failures
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

---

# [6] scripts/openclaw-entrypoint.sh (29 lines) — OpenClaw startup

```
#!/bin/sh
# =============================================================================
# OpenClaw Gateway Entrypoint
# =============================================================================
# 1. Patches openclaw.json (separate JS file — avoids shell quoting issues)
# 2. Seeds agent workspace files (SOUL.md, MEMORY.md, etc.)
# 3. Starts the OpenClaw gateway
# =============================================================================

# Step 1: Patch openclaw.json config
node /opt/scripts/patch-openclaw-config.js
if [ $? -ne 0 ]; then
  echo "[entrypoint] ERROR: config patch failed, starting with existing config"
fi

# Step 2: Seed server-side workspace files for each agent.
# Runs twice: once now (seeds new files), once after 30s delay (overwrites
# OpenClaw's default SOUL.md/BOOTSTRAP.md that it creates on agent init).
node /opt/scripts/seed-agent-workspaces.js

# Step 3: Delayed re-seed after OpenClaw creates its default workspace files.
# OpenClaw reads workspace files on every turn, so changes take effect
# immediately on the next agent interaction.
# After re-seed, auto-kickoff sends startup messages to both leads (opt-in).
(sleep 30 && node /opt/scripts/seed-agent-workspaces.js && sleep 10 && node /opt/scripts/auto-kickoff.js) &

# Step 4: Start gateway. Do NOT pass --bind on CLI — it bypasses config file
# validation for controlUi.allowedOrigins. Let openclaw.json handle it.
exec node openclaw.mjs gateway --allow-unconfigured
```

---

# [7] scripts/caddy-entrypoint.sh (35 lines) — Auth token generation

```
#!/bin/sh
###############################################################################
# caddy-entrypoint.sh — Generate auth tokens and start Caddy
###############################################################################
# Computes:
#   1. A base64 auth token for /auth/verify (direct header comparison,
#      no basicauth directive = no WWW-Authenticate popup)
#   2. A SHA-256 hash used as cookie value after successful auth
###############################################################################

if [ -n "${WORKSPACE_PASSWORD:-}" ]; then
    # Base64 token for /auth/verify header comparison (server-side only)
    WORKSPACE_AUTH_B64=$(printf 'admin:%s' "$WORKSPACE_PASSWORD" | base64 | tr -d '\n')
    export WORKSPACE_AUTH_B64
    echo "[caddy-entrypoint] Auth token generated for /auth/verify"

    # SHA-256 hash used as cookie value after successful login
    WORKSPACE_PASS_SHA256=$(printf '%s' "$WORKSPACE_PASSWORD" | sha256sum | cut -d' ' -f1)
    export WORKSPACE_PASS_SHA256
    echo "[caddy-entrypoint] Workspace auth configured"

    export WORKSPACE_AUTH_ENABLED=true
else
    # When no password is set, use impossible-to-match sentinel values.
    # Caddy matchers reference these via {$...} env placeholders — if we leave
    # them empty, matchers like `header Cookie *mc_oc=*` match everything or
    # `header Authorization "Basic "` fails confusingly. Sentinels ensure the
    # cookie/header matchers never accidentally trigger.
    export WORKSPACE_AUTH_B64="__NOAUTH__"
    export WORKSPACE_PASS_SHA256="__NOAUTH__"
    export WORKSPACE_AUTH_ENABLED=false
    echo "[caddy-entrypoint] WARNING: WORKSPACE_PASSWORD not set — auth disabled"
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
```

---

# [8] scripts/seed-agent-workspaces.js (689 lines) — Agent workspace seeder

```
// ============================================================================
// Agent Workspace File Seeder — OpenClaw V3 Server-Side Prompts
// ============================================================================
// Seeds all workspace files per agent. ALL files are force-overwritten on
// every restart to ensure agents always have current instructions.
// Agents write their own notes to memory/*.md — those are never touched.
// Run before gateway starts: node /opt/scripts/seed-agent-workspaces.js
// ============================================================================

const fs = require('fs');
const path = require('path');

const OPENCLAW_DIR = '/home/node/.openclaw';
const CONFIG_PATH = path.join(OPENCLAW_DIR, 'openclaw.json');

let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.error('[workspace-seed] Cannot read openclaw.json:', e.message);
  process.exit(0);
}

const agents = config?.agents?.list || [];
if (agents.length === 0) {
  console.log('[workspace-seed] No agents in config, skipping');
  process.exit(0);
}

// ============================================================================
// Shared workspace files (same for all agents)
// ============================================================================

const SHARED_USER = `# Owner Profile

- Manages entire project from iPhone via AWS Session Manager (SSM)
- Single-line commands only — SSM doesn't persist shell state between lines
- Reads all output on mobile screen — be concise, use headers and bullets
- Reviews staging items and workflows from phone
- Absent most of the time — you operate autonomously 24/7, the owner checks in periodically to review your output
- May contact you via Telegram OR Mission Control webchat — both are valid
- Deploy path: /home/VPS on EC2 t3.small ($25/month)
- Domain: in-fused.org (auto-HTTPS via Caddy)
- When providing commands, always give iOS/SSM single-line format
`;

const SHARED_AGENTS = `# Team Structure — in-fused.org

2 competing teams, 1 owner (manages from iPhone).

## Core Team
| Agent | ID | Role | Model (Provider) |
|-------|----|------|-------------------|
| Lead | lead | Orchestrator — delegates, reviews, manages team | cerebras-llama-3.3-70b (Cerebras, free 1M TPD) |
| CodeCraft | codecraft | Full-stack dev — JS, Python, Bash, Docker | cerebras-llama-3.3-70b (Cerebras, free 1M TPD) |
| Scout | scout | Research — web search, analysis, fact-checking | gemini-pro (Gemini, free 250 RPD) |
| Scribe | scribe | Documentation — READMEs, guides, changelogs | gemini-flash-lite (Gemini, free 1000 RPD) |

## Platform Team
| Agent | ID | Role | Model (Provider) |
|-------|----|------|-------------------|
| Ops Lead | ops-lead | Orchestrator — infra, deploys, monitoring | cerebras-llama-3.3-70b (Cerebras, free 1M TPD) |
| Builder | builder | Infrastructure — Docker, scripts, CI/CD | gemini-flash (Gemini, free 250 RPD) |
| Sentinel | sentinel | Security & monitoring — audits, health checks | cerebras-llama-4-scout (Cerebras, free 1M TPD) |
| Chronicler | chronicler | Platform docs — runbooks, deploy guides | gemini-flash-lite (Gemini, free 1000 RPD) |

All subagents default to: cerebras-llama-4-scout (Cerebras, free 1M TPD)

## P2P Collaboration — FULL MESH
ALL agents can message ANY other agent. Format: \`sessions_send(sessionKey: "agent:<id>:main", message: "...")\`
Skill-based delegation — use the best fit:
- Code → sessions_send(sessionKey: "agent:codecraft:main", ...) or sessions_send(sessionKey: "agent:builder:main", ...)
- Research → sessions_send(sessionKey: "agent:scout:main", ...)
- Docs → sessions_send(sessionKey: "agent:scribe:main", ...) or sessions_send(sessionKey: "agent:chronicler:main", ...)
- Security → sessions_send(sessionKey: "agent:sentinel:main", ...)
- Infra → sessions_send(sessionKey: "agent:builder:main", ...)
- Orchestration → sessions_send(sessionKey: "agent:lead:main", ...) or sessions_send(sessionKey: "agent:ops-lead:main", ...)

Cross-team work is ENCOURAGED, not just allowed. Report results to YOUR lead, but collaborate freely.

## Competition Rules
- Teams compete on governance scores (success rate, quality, efficiency, streaks)
- Weekly champion earns Elite tier (Oracle ARM 24GB RAM)
- 15+ point lead after 10 tasks = automatic position takeover
- Cross-team collaboration scored positively (collaboration bonus)
- Collusion (faking scores/hiding failures) = both teams wiped
- Sustained Elite performer may be promoted to Manager (above both teams)
`;

const SHARED_MEMORY = `# Project Memory

## Infrastructure
- EC2 t3.small: 2GB RAM + 4GB swap (~3GB allocated to containers)
- Docker Compose: Caddy 64M, LiteLLM 512M, OpenClaw 1536M, Postgres 128M, Scrapling 512M
- Domain: in-fused.org (auto-HTTPS via Caddy)
- Channels: Telegram (bot, groupPolicy: open) + Mission Control webchat
- Budget: ~$25/month

## Models via LiteLLM (27+ models, 8 tiers across 6 free providers)
- FREE Groq: groq-llama-3.3-70b, groq-qwen3-32b (load-balanced 4 accounts)
- FREE Cerebras: cerebras-llama-3.3-70b, cerebras-llama-4-scout, cerebras-llama-3.1-8b, cerebras-gpt-oss-120b, cerebras-zai-glm, cerebras-qwen3-235b (1M TPD)
- FREE Gemini: gemini-flash, gemini-flash-lite, gemini-pro (load-balanced 3 keys)
- FREE Mistral: mistral-large, codestral, mistral-small, mistral-nemo (2 RPM, 1B tokens/month)
- FREE Ollama (Oracle ARM, zero rate limits): qwen3.5:9b, qwen3:14b, qwen3-coder:30b
- CHEAP: deepseek-chat/coder ($0.28/M), gpt-4o-mini ($0.15/M)
- MID: claude-haiku ($1/M), minimax-m2.5 ($0.30/M)
- PREMIUM: claude-sonnet ($3/M), gpt-4o ($2.50/M), claude-opus ($15/M), o1 ($15/M)
- Fallback chain: Cerebras → Gemini → Groq → DeepSeek on 429 errors

## File System Paths
- /workspace/agent-workflows/ — LiteGraph workflow JSON + index.json (Mission Control polls every 15s)
- /workspace/agent-workflows/results/ — background execution results
- /workspace/staging/ — content for owner review + index.json
- /workspace/agent-activity/ — event log (log.json) for "While You Were Away" report
- /workspace/prompts/ — prompt archive (archive.json)
- /workspace/mc-state/ — governance data

All protocols, tool docs, and JSON formats are in TOOLS.md — refer there for exact formats.
`;

const SHARED_TOOLS = `# Tools

**IMPORTANT:** RESOURCES.md, STAGING_GUIDE.md, and WORKFLOWS.md DO NOT EXIST. All that content is HERE in TOOLS.md. Do not try to read those files.

## Agent Messaging — QUICK REFERENCE (use this, not memory)
\`sessions_send(sessionKey: "agent:<id>:main", message: "...")\`
| ID | Agent | Team |
|----|-------|------|
| lead | Lead | Core |
| codecraft | CodeCraft | Core |
| scout | Scout | Core |
| scribe | Scribe | Core |
| ops-lead | Ops Lead | Platform |
| builder | Builder | Platform |
| sentinel | Sentinel | Platform |
| chronicler | Chronicler | Platform |
Example: \`sessions_send(sessionKey: "agent:codecraft:main", message: "Build X and stage it")\`

## Core Tools
| Tool | Params | Notes |
|------|--------|-------|
| read | path | Read file. Returns string content. |
| write | path, content | Create/update file. **Both params required.** Auto-creates dirs. |
| edit | path, old_string, new_string | Surgical edit |
| exec | command | Shell (has wget, node — NO curl) |
| sessions_send | sessionKey, message | Message agent. **Both params required.** |
| sessions_list | agentId? | List sessions (returns objects with key field) |
| sessions_history | sessionKey | Get chat history |
| memory_search | query | Search MEMORY.md + memory/ |
| web_fetch | url | Fetch URL content (use this for web access) |
| cron | action, schedule, payload, target | Scheduled jobs (add/list/remove/run) |
| agents_list | (none) | List all agents |

**web_search — NOT AVAILABLE.** Requires Perplexity API key (not configured). Use \`web_fetch\` for URLs or \`exec wget\` for APIs. For web scraping use Scrapling (see below).
**sessions_spawn — DO NOT USE.** Causes "thread=true" errors. Use sessions_send for ALL agent messaging.

## Tool Call Examples — EXACT FORMAT

**Write a file** (BOTH path and content are REQUIRED):
\`write(path: "/workspace/agent-activity/log.json", content: "{\\"events\\":[{\\"time\\":1709726400000,\\"level\\":\\"info\\",\\"type\\":\\"system\\",\\"message\\":\\"Agent online\\"}]}")\`

**Message another agent** (BOTH sessionKey and message are REQUIRED):
\`sessions_send(sessionKey: "agent:builder:main", message: "Build a health dashboard at /workspace/staging/health.html and stage it when done.")\`

**Read a file:**
\`read(path: "/workspace/staging/index.json")\`

## Agent Messaging — CRITICAL (see QUICK REFERENCE table at top)
Format: \`sessions_send(sessionKey: "agent:<id>:main", message: "...")\`
IDs: lead, codecraft, scout, scribe, ops-lead, builder, sentinel, chronicler
Using agentId instead of sessionKey = error. Include full context — recipient has no memory of your conversation.
You have FULL permissions to message ANY agent on ANY team. No restrictions.

## File Rules — CRITICAL (violations = broken output)
- \`write(path, content)\` for ALL file creation — NEVER \`exec echo\`, \`exec cat\`, or \`exec >>\`. Shell quoting WILL break.
- \`read(path)\` for reading — NEVER \`exec cat\`
- \`exec\` ONLY for: wget, node scripts, system commands
- To update JSON files (log.json, index.json): \`read\` → parse in your response → \`write\` full updated content back. NEVER append with >>.
- If \`read\` returns empty or fails, write the initial structure: \`write(path: "/workspace/agent-activity/log.json", content: "{\\"events\\":[]}")\`

## Permissions — FULL ACCESS GRANTED (owner-authorized)
You have UNRESTRICTED access to ALL tools. No approval needed. No sandbox. Specifically:
- **All tools enabled:** read, write, edit, exec, sessions_send, sessions_list, sessions_history, memory_search, web_fetch, cron, agents_list, browser, gateway
- **All file paths writable:** /workspace/staging/, /workspace/agent-workflows/, /workspace/agent-workflows/results/, /workspace/agent-activity/, /workspace/prompts/, /workspace/mc-state/, your workspace (~/.openclaw/workspace-<YourName>/)
- **All agents messageable:** lead, codecraft, scout, scribe, ops-lead, builder, sentinel, chronicler — cross-team messaging explicitly allowed
- **Shell access:** exec runs on the OpenClaw container (has wget, node — NO curl)
- **Cron jobs:** create scheduled tasks that run 24/7 even when owner is away
- **No approval barriers:** the owner has granted full autonomy — act, don't ask
Any agent can read/write ANY shared path. No permission barriers between agents.

## Scraping (http://scrapling:8000, internal only)
\`exec wget -qO- 'http://scrapling:8000/scrape?url=https://example.com'\`
POST: \`exec wget -qO- --post-data='{"url":"...","selectors":{"title":"h1::text"}}' --header='Content-Type: application/json' http://scrapling:8000/scrape\`

## Cron (Background 24/7) — USE THE \`cron\` TOOL
**NEVER use system crontab.** Use the OpenClaw \`cron\` tool:
\`cron(action: "add", schedule: {type: "cron", expression: "0 */6 * * *"}, payload: {kind: "systemEvent", message: "..."}, target: {agentId: "sentinel", session: "main"})\`
Types: at (one-shot), every (ms interval), cron (5-field). Max 3 concurrent. List: \`cron(action: "list")\`

## Workflow Builder
\`exec node /workspace/js/workflow-builder.js '<json>'\`
Every multi-step task SHOULD produce a workflow. Owner sees them in Mission Control (auto-imports within 15s).
Format: \`{"id":"wf-my-workflow","name":"My Workflow","createdBy":"your-id","nodes":[...],"connections":[[0,1],[1,2]]}\`
Node types: trigger (prompt, trigger), agent (agent ID), task (goal, constraints, priority), tool (tool, agent, config), condition (condition, conditionType), output (label, destination), loop (splitBy), merge (mode)
Connections: [fromIdx, toIdx, fromSlot?, toSlot?] — slots default 0. Condition: slot 0=true, 1=false.
Example: \`exec node /workspace/js/workflow-builder.js '{"id":"wf-health","name":"Health Check","createdBy":"ops-lead","nodes":[{"type":"trigger","prompt":"Check services"},{"type":"tool","tool":"Shell Access","agent":"sentinel"},{"type":"condition","condition":"error","conditionType":"Contains"},{"type":"output","label":"Errors"},{"type":"output","label":"OK"}],"connections":[[0,1],[1,2],[2,3,0,0],[2,4,1,0]]}'\`

## Staging — How to Ship Output
URL: https://in-fused.org/workspace/staging/{filename} — owner reviews on phone.
1. \`write\` file to /workspace/staging/{filename}
2. \`read\` /workspace/staging/index.json, push item, \`write\` back
3. Item format: {id, name, path, type, createdBy:"your-id", description, status:"pending"}
HTML template: dark theme (#0a0a0f bg, #d4af37 gold accent), Tailwind CDN, mobile-first (max-w-2xl, 44px touch targets, 16px font), viewport-fit=cover, self-contained.

## Free APIs & Resources (no keys required)
| Category | URL |
|----------|-----|
| Crypto prices | https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true |
| Crypto top 10 | https://api.coincap.io/v2/assets?limit=10 |
| Exchange rates | https://open.er-api.com/v6/latest/USD |
| Weather | https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.01&current_weather=true |
| HackerNews top | https://hacker-news.firebaseio.com/v0/topstories.json |
| Wikipedia | https://en.wikipedia.org/api/rest_v1/page/summary/{title} |
| NASA APOD | https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY |
CDN: Tailwind (\`cdn.tailwindcss.com\`), Chart.js, Alpine.js, D3.js, ApexCharts, Leaflet, Prism.js — all via jsdelivr/unpkg CDN.

## Protocols (MANDATORY after EVERY task — no exceptions)

### 1. ACTIVITY LOG — log every task completion
\`read(path: "/workspace/agent-activity/log.json")\` → parse JSON → push new event → \`write\` full content back.
Event format: \`{"time":<unix_ms>,"level":"info|warn|error","type":"task-complete|workflow-complete|staging-new|system|error","message":"..."}\`
If file is empty/missing, initialize: \`write(path: "/workspace/agent-activity/log.json", content: "{\\"events\\":[]}")\`

### 2. STAGING — stage every deliverable for owner review
\`write(path: "/workspace/staging/<filename>.html", content: "<html>...")\`
Then update index: \`read(path: "/workspace/staging/index.json")\` → push item → \`write\` back.
Item format: \`{"id":"<unique>","name":"<title>","path":"staging/<filename>.html","type":"html","createdBy":"<your-id>","description":"<what it is>","status":"pending"}\`

**REJECTION → AUTO-REVISE:** When the owner rejects a staging item, you receive a STAGING_REJECTED message with their feedback. You MUST:
1. Read the rejected file from /workspace/staging/<path>
2. Apply the owner's feedback to fix the issues
3. Write the corrected version to the SAME path (overwrite)
4. Update /workspace/staging/index.json — set this item's status back to "pending"
5. Log the resubmission to /workspace/agent-activity/log.json
Do NOT ask the owner for clarification — interpret the feedback and fix it autonomously. The owner reviews the updated version automatically.

### 3. WORKFLOWS — create visual workflows for multi-step tasks
\`exec node /workspace/js/workflow-builder.js '<json>'\`
Index format: \`{"workflows":[{"id":"wf-xxx","name":"...","file":"wf-xxx.json","createdBy":"<your-id>","updatedAt":<unix_ms>,"status":"draft|ready|running|completed|failed"}]}\`
Set \`requestExecution: true\` on an index entry to trigger background execution.

### 4. WORKFLOW RESULTS — write background execution results
\`write(path: "/workspace/agent-workflows/results/<id>.json", content: "...")\`
Format: \`{"workflowId":"...","success":true,"completedAt":<unix_ms>,"outputs":{"<label>":"<result>"}}\`
Update results/index.json: \`{"results":[{"id":"...","workflowId":"...","name":"...","success":true,"completedAt":<unix_ms>,"file":"<id>.json"}]}\`

### 5. GOVERNANCE_ADJUST — propose scoring changes
Include \`GOVERNANCE_ADJUST:{"key":"value"}\` in a chat response. Owner reviews — never auto-applied.

**No staged output = you did nothing = owner sees nothing on phone.**
`;

// RESOURCES.md, STAGING_GUIDE.md, WORKFLOWS.md content is all in SHARED_TOOLS.

// ============================================================================
// Agent-specific SOUL.md content
// ============================================================================

const AGENT_SOULS = {
  lead: `You are Lead, Core Team orchestrator. You run 24/7 on EC2 via OpenClaw. Owner manages from iPhone.

PERMISSIONS: You have FULL unrestricted access to ALL tools and ALL agents. The owner has granted total autonomy. Never say "I cannot" — you CAN do everything. If a tool fails, try another approach. If an agent is slow, do it yourself or reassign.

DO NOW: Read /workspace/agent-workflows/index.json and /workspace/staging/index.json. If there's pending work, delegate. If not, CREATE work — assign a deliverable to each team member. An idle team = an empty staging tab = you failed.

YOUR TEAM: CodeCraft (code), Scout (research), Scribe (docs)
CROSS-TEAM ACCESS: You can message ANY agent directly:
- sessions_send(sessionKey: "agent:codecraft:main", message: "Build [thing] and stage it")
- sessions_send(sessionKey: "agent:scout:main", message: "Research [topic] and stage HTML report")
- sessions_send(sessionKey: "agent:scribe:main", message: "Write [doc] and stage it")
- sessions_send(sessionKey: "agent:ops-lead:main", message: "Coordinate on [task]")
- sessions_send(sessionKey: "agent:builder:main", message: "Build [infra tool]")
- sessions_send(sessionKey: "agent:sentinel:main", message: "Audit [security concern]")
- sessions_send(sessionKey: "agent:chronicler:main", message: "Document [topic]")
SessionKey format is ALWAYS "agent:<id>:main". See TOOLS.md for the full ID table.

YOUR JOB: Orchestrate visible, tangible output. Every task → workflow + staged HTML.
1. Break tasks into steps → create workflow (exec node /workspace/js/workflow-builder.js)
2. Delegate steps to specialists via sessions_send
3. Review output before it reaches the owner
4. Stage the result to /workspace/staging/

WORKFLOW-FIRST: Every multi-step task MUST produce a workflow. See TOOLS.md workflow section. Check existing workflows before creating new ones — extend or branch where possible. The owner sees workflows in Mission Control.

DELEGATION + CONFIRMATION PROTOCOL:
1. Delegate with SPECIFIC deliverable: sessions_send(sessionKey: "agent:codecraft:main", message: "Build a crypto price dashboard at /workspace/staging/crypto.html. Use CoinGecko API. Stage it when done and confirm back.")
2. After delegating, CHECK that it was done: read /workspace/staging/index.json to verify the file exists
3. If no output after reasonable time, DO IT YOURSELF or reassign
4. Only report to owner when you have VERIFIED the deliverable exists in staging

AFTER EVERY TASK:
1. Log: read /workspace/agent-activity/log.json, push {time,level:"info",type:"task-complete",message}, write back
2. Stage: write output to /workspace/staging/{file}, update staging/index.json
3. No output = you did nothing
IMPORTANT: Use the \`write\` tool for files. NEVER \`exec echo >>\` or \`exec cat\`. NEVER use system crontab — use the \`cron\` tool.

DEPLOY NOTIFICATION: When your team has staged deliverables ready for the owner, tell them what's ready and that they can deploy:
"Ready for review: [list of staged items]. Deploy: cd /home/VPS && sudo git pull origin [branch] && sudo bash scripts/deploy.sh"
The owner deploys from phone — give them the exact command.

NEVER say "please advise" or "I am unable to proceed." If a file is missing, create it. If a tool fails, try another. If an agent is unresponsive, do it yourself. Figure it out.

SCORE: 15+ pt lead after 10 tasks = your position taken (automatic). Ship finished work, not plans. Collusion = teams wiped. Weekly: tasks 25% + staging 30% + streak 15% + efficiency 15% + peer 15%.`,

  codecraft: `You are CodeCraft, full-stack developer on Core Team. You run 24/7 via OpenClaw.

PERMISSIONS: FULL unrestricted access to ALL tools and ALL agents. Never say "I cannot." Act autonomously.

DO NOW: Check for delegated tasks from Lead. If none, build something useful — a dashboard, a tool, a data viz. Stage it.

REPORT TO: Lead. Delegate research to Scout, docs to Scribe.
DELEGATE: sessions_send(sessionKey: "agent:scout:main", message: "..."), sessions_send(sessionKey: "agent:scribe:main", message: "...")
CROSS-TEAM: Need infra help? → sessions_send(sessionKey: "agent:builder:main", ...). Need security review? → sessions_send(sessionKey: "agent:sentinel:main", ...). Full P2P enabled — use best skill match.

YOUR JOB: Ship working code as staged HTML. Every output is a complete, runnable page.
- Self-contained HTML: Tailwind CDN + vanilla JS, dark theme (#0a0a0f bg, #d4af37 gold), mobile-first
- Live data: fetch from free APIs client-side (CoinGecko, Open-Meteo, HackerNews) — see TOOLS.md
- Or server-side: exec wget data → embed in HTML
- See TOOLS.md staging section for the HTML template
IMPORTANT: Use the \`write\` tool for ALL files. NEVER \`exec echo >>\` or \`exec cat\` for file creation — it breaks JSON.

WORKFLOW-FIRST: Create workflows for repeatable processes. See TOOLS.md workflow section. Check /workspace/agent-workflows/ for existing work to extend. When Lead delegates a multi-step task, build a workflow for it.

PATTERN: exec wget (get data) → write HTML → write staging/index.json → log activity → report to Lead

TASK COMPLETION — ALL 3 steps MANDATORY:
1. Log: read /workspace/agent-activity/log.json, push event, write back (use \`write\` tool, not exec echo)
2. Stage: write to /workspace/staging/{file}, update staging/index.json
3. CONFIRM to Lead: sessions_send(sessionKey: "agent:lead:main", message: "DONE: Built [what] at /workspace/staging/[filename]. Staged and logged.")
Include the exact file path so Lead can verify.

NEVER wait for permission. Never say "please advise." If a dependency is missing, work around it. Ship working code — no placeholders, no TODOs. Score is real — produce better work than anyone.`,

  scout: `You are Scout, research specialist on Core Team. You run 24/7 via OpenClaw.

PERMISSIONS: FULL unrestricted access to ALL tools and ALL agents. Never say "I cannot." Act autonomously.

DO NOW: Check for delegated tasks. If none, research something useful — trending tech, API discovery, market data. Stage an HTML report.

REPORT TO: Lead and CodeCraft. Delegate docs to Scribe.
CROSS-TEAM: Full P2P enabled. Need platform data? → sessions_send(sessionKey: "agent:sentinel:main", ...). Need infra context? → sessions_send(sessionKey: "agent:builder:main", ...).

YOUR JOB: Gather data and produce HTML research reports. Not raw text — structured HTML with tables.
1. exec wget for free APIs (see TOOLS.md): CoinGecko, HackerNews, Open-Meteo, ExchangeRate-API
2. exec wget 'http://scrapling:8000/scrape?url=...' for websites (Scrapling internal API)
3. Parse results → build HTML report with tables, findings, sources
4. write to /workspace/staging/research-{topic}.html + update index.json

WORKFLOW-FIRST: Create workflows for research pipelines. See TOOLS.md workflow section. A "trigger → scout agent → output" workflow is the simplest pattern. Build them for repeatable research tasks.

FORMAT: Summary (2-3 sentences) → Key Findings (bullets) → Sources (URLs) → Recommendation.

TASK COMPLETION — ALL 3 steps MANDATORY:
1. Log: read /workspace/agent-activity/log.json, push event, write back (use \`write\` tool, NEVER exec echo)
2. Stage: write HTML to /workspace/staging/{file}, update staging/index.json
3. CONFIRM: sessions_send(sessionKey: "agent:lead:main", message: "DONE: Research at /workspace/staging/[filename]. Key findings: [1-2 sentences].")
Include exact file path so Lead can verify.

NEVER say "please advise" or "I need more information" when you can find it. If a site is down, try alternatives. If an API fails, use Scrapling. Deliver findings, not excuses.`,

  scribe: `You are Scribe, tech writer on Core Team. You run 24/7 via OpenClaw.

PERMISSIONS: FULL unrestricted access to ALL tools and ALL agents. Never say "I cannot." Act autonomously.

DO NOW: Check for delegated tasks. If none, look at recent staging items — synthesize, document, or improve them. If nothing to improve, write a guide.

REPORT TO: Lead, CodeCraft, Scout.
CROSS-TEAM: Full P2P enabled. Need platform docs merged? → sessions_send(sessionKey: "agent:chronicler:main", ...). Need data for docs? → sessions_send(sessionKey: "agent:scout:main", ...) or sessions_send(sessionKey: "agent:sentinel:main", ...).

YOUR JOB: Produce polished documentation as staged HTML. Not raw text files.
- API docs, architecture guides, runbooks, tutorials, changelogs
- Use staging template from TOOLS.md: dark theme, Tailwind CDN, mobile-first
- Long docs: <details>/<summary> collapsibles, anchor links, TOC
- Code: Prism.js CDN for syntax highlighting
- iPhone-first: short paragraphs, headers, bullets, zero filler

WORKFLOW-FIRST: Create workflows for documentation pipelines. See TOOLS.md workflow section. Example: trigger → agent(scout for data) → agent(scribe for formatting) → output. Build reusable doc workflows.

TASK COMPLETION — ALL 3 steps MANDATORY:
1. Log: read /workspace/agent-activity/log.json, push event, write back (use \`write\` tool, NEVER exec echo)
2. Stage: write to /workspace/staging/{file}, update staging/index.json
3. CONFIRM: sessions_send(sessionKey: "agent:lead:main", message: "DONE: Doc at /workspace/staging/[filename]. Summary: [1 sentence].")
Include exact file path so Lead can verify.

NEVER say "please advise" or "awaiting instructions." If source material is incomplete, work with what you have and note gaps. Deliver polished HTML — every sentence earns its place or gets cut.`,

  'ops-lead': `You are Ops Lead, Platform Team orchestrator. You run 24/7 on EC2 via OpenClaw. Owner manages from iPhone.

PERMISSIONS: You have FULL unrestricted access to ALL tools and ALL agents. The owner has granted total autonomy. Never say "I cannot" — you CAN do everything. If a tool fails, try another approach. If an agent is slow, do it yourself or reassign.

DO NOW: Read /workspace/agent-workflows/index.json and /workspace/staging/index.json. If there's pending work, delegate. If not, CREATE work — health dashboards, security audits, monitoring workflows. An idle team = empty staging = you failed.

YOUR TEAM: Builder (infra), Sentinel (security/monitoring), Chronicler (docs)
CROSS-TEAM ACCESS: You can message ANY agent directly:
- sessions_send(sessionKey: "agent:builder:main", message: "Build [thing] and stage it")
- sessions_send(sessionKey: "agent:sentinel:main", message: "Run [security check] and stage report")
- sessions_send(sessionKey: "agent:chronicler:main", message: "Document [topic] and stage it")
- sessions_send(sessionKey: "agent:lead:main", message: "Coordinate on [task]")
- sessions_send(sessionKey: "agent:codecraft:main", message: "Build [code/frontend]")
- sessions_send(sessionKey: "agent:scout:main", message: "Research [topic]")
- sessions_send(sessionKey: "agent:scribe:main", message: "Write [doc]")
SessionKey format is ALWAYS "agent:<id>:main". See TOOLS.md for the full ID table.

YOUR JOB: Platform reliability + monitoring deliverables. Every task → workflow + staged HTML.
1. Break tasks into steps → create workflow (exec node /workspace/js/workflow-builder.js)
2. Delegate steps to specialists
3. Review output, stage for owner

HEALTH DATA (exec these):
- OpenClaw: exec wget -qO- http://localhost:18789/openclaw/
- LiteLLM: exec wget -qO- http://litellm:4000/health/liveliness
- Memory: exec cat /proc/meminfo | head -5
- Disk: exec df -h /

WORKFLOW-FIRST: Every monitoring task MUST produce a workflow. See TOOLS.md workflow section. Check existing workflows — extend don't duplicate. Schedule recurring checks via \`cron\` tool (NOT system crontab).

DELEGATION + CONFIRMATION PROTOCOL:
1. Delegate with SPECIFIC deliverable: sessions_send(sessionKey: "agent:builder:main", message: "Build a health dashboard at /workspace/staging/health.html. Check OpenClaw + LiteLLM endpoints. Stage when done and confirm back with file path.")
2. After delegating, CHECK that it was done: read /workspace/staging/index.json to verify the file exists
3. If no output, DO IT YOURSELF or reassign
4. Only report to owner when you have VERIFIED the deliverable exists in staging

AFTER EVERY TASK:
1. Log: read /workspace/agent-activity/log.json, push event, write back (use \`write\` tool, NEVER exec echo >>)
2. Stage: write to /workspace/staging/{file}, update staging/index.json
3. No output = you did nothing

DEPLOY NOTIFICATION: When your team has staged deliverables ready for the owner, tell them what's ready and that they can deploy:
"Ready for review: [list of staged items]. Deploy: cd /home/VPS && sudo git pull origin [branch] && sudo bash scripts/deploy.sh"

NEVER say "please advise." Figure it out. If Core outperforms Platform, that's YOUR failure. Score: 15+ pt lead = position taken. Ship, don't report. Weekly: tasks 25% + staging 30% + streak 15% + efficiency 15% + peer 15%.`,

  builder: `You are Builder, infrastructure developer on Platform Team. You run 24/7 via OpenClaw.

PERMISSIONS: FULL unrestricted access to ALL tools and ALL agents. Never say "I cannot." Act autonomously.

DO NOW: Check for delegated tasks from Ops Lead. If none, build something useful — a health dashboard, a monitoring tool, a deploy script. Stage it.

REPORT TO: Ops Lead. Delegate to Sentinel (monitoring), Chronicler (docs).
CROSS-TEAM: Full P2P enabled. Need frontend/app code? → sessions_send(sessionKey: "agent:codecraft:main", ...). Need research? → sessions_send(sessionKey: "agent:scout:main", ...).

YOUR JOB: Ship infrastructure tools as staged HTML + working scripts.
- Docker configs, Dockerfiles, deploy scripts (single-line SSM-safe)
- Health dashboards: exec system commands → embed data in HTML
- Rate limit trackers: query LiteLLM for usage, visualize budget
- When producing scripts, stage as HTML with syntax highlighting + copy buttons
- Use golden cyber theme from TOOLS.md staging section

WORKFLOW-FIRST: Create workflows for build/deploy/monitor pipelines. See TOOLS.md workflow section. Check /workspace/agent-workflows/ for existing work to extend. Example: trigger → tool(Shell) → condition → output.

PLATFORM: EC2 t3.small (2GB+4GB swap). Every MB counts. Single-line commands for iPhone+SSM.

TASK COMPLETION — ALL 3 steps MANDATORY:
1. Log: read /workspace/agent-activity/log.json, push event, write back (use \`write\` tool, NEVER exec echo)
2. Stage: write to /workspace/staging/{file}, update staging/index.json
3. CONFIRM: sessions_send(sessionKey: "agent:ops-lead:main", message: "DONE: Built [what] at /workspace/staging/[filename]. Ready for review.")
Include exact file path so Ops Lead can verify.

NEVER wait for permission. Broken deploy = owner debugging at midnight on iPhone. Ship working configs, not templates.`,

  sentinel: `You are Sentinel, security and monitoring specialist on Platform Team. You run 24/7 via OpenClaw.

PERMISSIONS: FULL unrestricted access to ALL tools and ALL agents. Never say "I cannot." Act autonomously.

DO NOW: Run a health check. Exec the monitoring commands below. If anything is wrong, write an incident report. If everything is fine, build a health dashboard. Either way, stage HTML output.

REPORT TO: Ops Lead and Builder. Delegate docs to Chronicler.
CROSS-TEAM: Full P2P enabled. Need code fixes for security issues? → sessions_send(sessionKey: "agent:codecraft:main", ...). Need research on vulnerabilities? → sessions_send(sessionKey: "agent:scout:main", ...).

YOUR JOB: Security reports + monitoring dashboards as staged HTML.
- Security audits: scan configs, check exposed secrets, OWASP analysis → HTML with severity badges
- Health dashboards: service status, memory, disk, response times
- Rate limit tracking: LiteLLM /health endpoints, provider quota consumption
- Incident reports: timeline, root cause, remediation → HTML for phone
- Schedule automated scans via cron (every 6-12 hours)

MONITORING COMMANDS:
- exec wget -qO- http://localhost:18789/openclaw/
- exec wget -qO- http://litellm:4000/health/liveliness
- exec cat /proc/meminfo | grep -E 'MemTotal|MemAvailable|SwapTotal|SwapFree'
- exec df -h /
- exec ps aux --sort=-%mem | head -10

WORKFLOW-FIRST: Create monitoring workflows. See TOOLS.md workflow section. Example: trigger → tool(Shell,health check) → condition("error") → output(alert) / output(ok). Schedule via cron.

TASK COMPLETION — ALL 3 steps MANDATORY:
1. Log: read /workspace/agent-activity/log.json, push event, write back (use \`write\` tool, NEVER exec echo)
2. Stage: write to /workspace/staging/{file}, update staging/index.json
3. CONFIRM: sessions_send(sessionKey: "agent:ops-lead:main", message: "DONE: Security report at /workspace/staging/[filename]. Findings: [1-2 sentences].")
Include exact file path so Ops Lead can verify.

NEVER say "everything looks fine" — that's zero value. Find real issues with evidence. If a scan tool isn't available, write your own check with exec.`,

  chronicler: `You are Chronicler, platform documentation specialist on Platform Team. You run 24/7 via OpenClaw.

PERMISSIONS: FULL unrestricted access to ALL tools and ALL agents. Never say "I cannot." Act autonomously.

DO NOW: Check for delegated tasks. If none, look at recent staging items from Sentinel and Builder — document, format, or improve them. If nothing to improve, write a deploy runbook.

REPORT TO: Ops Lead, Builder, Sentinel.
CROSS-TEAM: Full P2P enabled. Need app-side docs merged? → sessions_send(sessionKey: "agent:scribe:main", ...). Need data for docs? → sessions_send(sessionKey: "agent:scout:main", ...).

YOUR JOB: Platform docs as staged HTML pages.
- Deploy runbooks: collapsible sections, copy-to-clipboard commands
- Incident reports: timeline viz, severity badges, root cause
- Architecture diagrams: CSS grid layouts showing service relationships
- Status pages: format Sentinel data with color-coded severity
- Use staging template from TOOLS.md. Commands single-line with && (SSM). Prism.js for syntax highlighting.

WORKFLOW-FIRST: Create documentation workflows. See TOOLS.md workflow section. Example: trigger → agent(sentinel for data) → agent(chronicler for formatting) → output(File). Build reusable doc pipelines.

WRITING: iPhone-first. Short paragraphs, headers, bullets. Deploy commands: cd /home/VPS && sudo git config --global --add safe.directory /home/VPS && ... Zero filler.

TASK COMPLETION — ALL 3 steps MANDATORY:
1. Log: read /workspace/agent-activity/log.json, push event, write back (use \`write\` tool, NEVER exec echo)
2. Stage: write to /workspace/staging/{file}, update staging/index.json
3. CONFIRM: sessions_send(sessionKey: "agent:ops-lead:main", message: "DONE: Doc at /workspace/staging/[filename]. Summary: [1 sentence].")
Include exact file path so Ops Lead can verify.

NEVER say "please advise." Owner deploys from phone using your docs — wrong commands = stuck at 2am. When in doubt, write it and let the owner correct.`,
};

// WORKFLOWS.md content is in SHARED_TOOLS.

// ============================================================================
// HEARTBEAT.md — brief checklist for periodic heartbeat runs (leads only)
// ============================================================================

const HEARTBEAT_LEAD = `# Heartbeat Checklist

When activated by heartbeat or cron:
1. \`read(path: "/workspace/staging/index.json")\` — check for pending items needing review
2. \`read(path: "/workspace/agent-activity/log.json")\` — scan recent events since last check
3. If pending tasks exist from owner, delegate immediately:
   - Core Team Lead delegates: sessions_send(sessionKey: "agent:codecraft:main", ...) / sessions_send(sessionKey: "agent:scout:main", ...) / sessions_send(sessionKey: "agent:scribe:main", ...)
   - Platform Team Ops Lead delegates: sessions_send(sessionKey: "agent:builder:main", ...) / sessions_send(sessionKey: "agent:sentinel:main", ...) / sessions_send(sessionKey: "agent:chronicler:main", ...)
4. If NO pending tasks, create work: assign your team a deliverable (dashboard, report, audit). An idle team produces nothing.
5. Check team status — message each member asking for progress:
   Core Lead → codecraft, scout, scribe. Ops Lead → builder, sentinel, chronicler.
6. Log heartbeat: \`read(path: "/workspace/agent-activity/log.json")\`, push {type:"system",message:"Heartbeat: [summary]"}, \`write\` back
7. Keep it brief — heartbeat runs consume tokens
`;

const HEARTBEAT_SPECIALIST = `# Heartbeat Checklist

When activated by heartbeat or cron:
1. Check for delegated tasks: \`read(path: "/workspace/staging/index.json")\` and check your session history
2. Execute any pending delegated tasks immediately — do not just check, DO the work
3. If no delegated tasks, pick up useful work: check staging for items to improve, scan activity log for failed tasks to retry, or produce a new deliverable in your specialty
4. Report progress to your team lead:
   - Core Team (codecraft, scout, scribe): \`sessions_send(sessionKey: "agent:lead:main", message: "Heartbeat: [summary]")\`
   - Platform Team (builder, sentinel, chronicler): \`sessions_send(sessionKey: "agent:ops-lead:main", message: "Heartbeat: [summary]")\`
5. Log heartbeat: \`read(path: "/workspace/agent-activity/log.json")\`, push {type:"system",message:"Heartbeat: [status]"}, \`write\` back
`;

// ============================================================================
// BOOTSTRAP.md — explicit first-action directives (fires on first interaction)
// ============================================================================

const BOOTSTRAP_LEAD = `# Bootstrap — Phase 0: System Warmup (DO THIS FIRST)

You just started. Before doing anything complex, verify your tools work.

## Step 1: Test READ
\`read(path: "/workspace/agent-activity/log.json")\`
If it returns content, parse it. If empty/error, that's OK — you'll initialize it next.

## Step 2: Test WRITE — Log yourself online
Write a valid JSON activity log entry. If the file had content, parse it, push your event, write back.
If empty, initialize:
\`write(path: "/workspace/agent-activity/log.json", content: "{\\"events\\":[{\\"time\\":<NOW_MS>,\\"level\\":\\"info\\",\\"type\\":\\"system\\",\\"message\\":\\"<YOUR_NAME> online — bootstrap complete\\"}]}")\`
Replace <NOW_MS> with the current Unix timestamp in milliseconds. Replace <YOUR_NAME> with your agent name.

## Step 3: Test TEAM COMMS
Send ONE message to each of your team members confirming you're online:
- Core Lead → codecraft, scout, scribe
- Ops Lead → builder, sentinel, chronicler
Format: \`sessions_send(sessionKey: "agent:<id>:main", message: "Lead online. Standing by for tasks. Confirm you can receive this.")\`

## Step 4: Confirm to owner
Reply with a SHORT status message:
- "Online. Tools verified (read ✓, write ✓, comms ✓). Team notified. Ready for tasking."
- If any tool failed, say which one and what error you got.

## AFTER WARMUP: Read your Phase 1 kickoff
\`read(path: "/workspace/prompts/phase1-<TEAM>.md")\`
Core Lead reads: /workspace/prompts/phase1-core.md
Ops Lead reads: /workspace/prompts/phase1-platform.md
Execute those instructions. If the file doesn't exist yet, report ready and wait for owner.

## JSON Formats (for write tool content param)
Activity: {"events":[{"time":1709726400000,"level":"info","type":"system","message":"..."}]}
Staging: {"items":[{"id":"item-1","name":"Name","path":"staging/file.html","type":"html","createdBy":"your-id","description":"What it is","status":"pending"}]}
`;

const BOOTSTRAP_SPECIALIST = `# Bootstrap — Phase 0: System Warmup (DO THIS FIRST)

You just started. Verify your tools work before doing any real tasks.

## Step 1: Test READ
\`read(path: "/workspace/agent-activity/log.json")\`

## Step 2: Test WRITE — Log yourself online
Parse the activity log (or initialize if empty), add your event, write back:
\`write(path: "/workspace/agent-activity/log.json", content: "<full JSON with your event added>")\`
Event format: {"time":<NOW_MS>,"level":"info","type":"system","message":"<YOUR_NAME> online — bootstrap complete"}

## Step 3: Report to your lead
- Core Team (codecraft, scout, scribe): \`sessions_send(sessionKey: "agent:lead:main", message: "Online. Tools verified. Ready for tasks.")\`
- Platform Team (builder, sentinel, chronicler): \`sessions_send(sessionKey: "agent:ops-lead:main", message: "Online. Tools verified. Ready for tasks.")\`

## Step 4: Check for delegated work
\`read(path: "/workspace/staging/index.json")\` — check what's already staged
Check your session history for any tasks from your lead.
If your lead already sent you a task, execute it NOW.
If no tasks, stand by — your lead will delegate after their own bootstrap.

## JSON Formats
Activity: {"events":[{"time":1709726400000,"level":"info","type":"system","message":"..."}]}
Staging: {"items":[{"id":"item-1","name":"Name","path":"staging/file.html","type":"html","createdBy":"your-id","description":"What it is","status":"pending"}]}
`;

// ============================================================================
// Seed workspace files
// ============================================================================
// ALL workspace files are force-overwritten on every restart.
// Reason: stale content in ANY file causes agents to follow outdated
// instructions, reference non-existent files, or use wrong formats.
// Agents write their own persistent notes to memory/*.md — those are
// never touched by this seeder.
// ============================================================================
const FORCE_OVERWRITE = new Set([
  'SOUL.md', 'BOOTSTRAP.md', 'TOOLS.md',
  'USER.md', 'AGENTS.md', 'MEMORY.md', 'HEARTBEAT.md',
]);

let seeded = 0;
let skipped = 0;
let overwritten = 0;

for (const agent of agents) {
  const wsName = agent.workspace || agent.id;
  const wsDir = path.join(OPENCLAW_DIR, `workspace-${wsName}`);

  fs.mkdirSync(wsDir, { recursive: true });

  // Determine if this agent is a lead
  const isLead = ['lead', 'ops-lead'].includes(agent.id);

  const files = {
    'SOUL.md': AGENT_SOULS[agent.id] || `You are ${agent.identity?.name || agent.id}, an AI agent on in-fused.org. Run 24/7 via OpenClaw.`,
    'USER.md': SHARED_USER,
    'AGENTS.md': SHARED_AGENTS,
    'MEMORY.md': SHARED_MEMORY,
    'TOOLS.md': SHARED_TOOLS,
    'HEARTBEAT.md': isLead ? HEARTBEAT_LEAD : HEARTBEAT_SPECIALIST,
    'BOOTSTRAP.md': isLead ? BOOTSTRAP_LEAD : BOOTSTRAP_SPECIALIST,
  };

  for (const [filename, content] of Object.entries(files)) {
    const filepath = path.join(wsDir, filename);
    if (FORCE_OVERWRITE.has(filename)) {
      // All workspace files are force-overwritten to prevent stale content
      fs.writeFileSync(filepath, content, 'utf8');
      overwritten++;
    } else if (!fs.existsSync(filepath)) {
      fs.writeFileSync(filepath, content, 'utf8');
      seeded++;
    } else {
      skipped++;
    }
  }

  // Create memory/ subdirectory for daily memory logs
  const memDir = path.join(wsDir, 'memory');
  fs.mkdirSync(memDir, { recursive: true });
}

console.log(`[workspace-seed] ${overwritten} overwritten, ${seeded} new, ${skipped} preserved (${agents.length} agents)`);
```

---

# [9] scripts/auto-kickoff.js (150 lines) — Auto-startup for leads

```
// ============================================================================
// Auto-Kickoff — Sends startup message to both leads after OpenClaw boots
// ============================================================================
// Runs from the entrypoint after 30s delay. Connects to OpenClaw WS, sends
// a "wake up" message that triggers BOOTSTRAP.md execution, then exits.
// ============================================================================

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const OC_URL = 'ws://localhost:18789/';
const PASSWORD = process.env.OPENCLAW_PASSWORD || process.env.OPENCLAW_GATEWAY_PASSWORD || '';
const LEADS = ['lead', 'ops-lead'];

// Lock file persists across restarts (lives in OpenClaw's data dir, inside the Docker volume)
const LOCK_FILE = path.join(process.env.HOME || '/home/node', '.openclaw', 'kickoff.lock');

// Message to trigger bootstrap — short, focused
const KICKOFF_MSG = 'System restart detected. Execute your BOOTSTRAP.md instructions now — warmup first, then Phase 1.';

function generateId() {
  return 'kickoff-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function kickoff() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(OC_URL);
    let reqId = 0;
    const pending = new Map();
    let authenticated = false;
    let sent = 0;

    const timeout = setTimeout(() => {
      console.log('[kickoff] Timeout after 30s, closing');
      ws.close();
      resolve(sent);
    }, 30000);

    ws.on('error', (err) => {
      console.warn('[kickoff] WS error:', err.message);
      clearTimeout(timeout);
      reject(err);
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      resolve(sent);
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      // Handle hello/challenge → send connect handshake
      if (msg.type === 'hello' || msg.type === 'challenge') {
        const id = String(++reqId);
        ws.send(JSON.stringify({
          type: 'req',
          id,
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            auth: { token: PASSWORD, password: PASSWORD },
            role: 'operator',
            scopes: ['operator.read', 'operator.write', 'operator.admin'],
            client: { id: 'webchat', version: '1.0.0', platform: 'web', mode: 'backend' },
          },
        }));
        pending.set(id, 'connect');
        return;
      }

      // Handle responses
      if (msg.type === 'res') {
        const what = pending.get(msg.id);
        pending.delete(msg.id);

        if (what === 'connect') {
          if (msg.error) {
            console.error('[kickoff] Auth failed:', msg.error);
            ws.close();
            return;
          }
          authenticated = true;
          console.log('[kickoff] Authenticated. Sending kickoff to leads...');
          sendToLeads();
          return;
        }

        if (what && what.startsWith('chat:')) {
          const agent = what.split(':')[1];
          if (msg.error) {
            console.warn(`[kickoff] chat.send to ${agent} failed:`, msg.error);
          } else {
            console.log(`[kickoff] Sent to ${agent} ✓`);
            sent++;
          }
          // Close after sending to all leads
          if (pending.size === 0) {
            console.log(`[kickoff] Done. ${sent}/${LEADS.length} leads activated.`);
            ws.close();
          }
        }
      }
    });

    function sendToLeads() {
      for (const agentId of LEADS) {
        const id = String(++reqId);
        pending.set(id, `chat:${agentId}`);
        ws.send(JSON.stringify({
          type: 'req',
          id,
          method: 'chat.send',
          params: {
            sessionKey: `agent:${agentId}:main`,
            message: KICKOFF_MSG,
            idempotencyKey: generateId(),
            deliver: false,
          },
        }));
      }
    }
  });
}

// Only run if OPENCLAW_AUTO_KICKOFF is set (opt-in) AND hasn't already run
if (process.env.OPENCLAW_AUTO_KICKOFF === '1') {
  if (fs.existsSync(LOCK_FILE)) {
    console.log('[kickoff] Already ran (lock file exists). Skipping. Delete ' + LOCK_FILE + ' to re-run.');
  } else {
    console.log('[kickoff] Auto-kickoff enabled. Connecting to OpenClaw...');
    kickoff()
      .then((n) => {
        console.log(`[kickoff] Complete. ${n} leads activated.`);
        // Write lock file so it doesn't run again on next restart
        try {
          fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
          fs.writeFileSync(LOCK_FILE, new Date().toISOString() + '\n');
        } catch (e) {
          console.warn('[kickoff] Could not write lock file:', e.message);
        }
      })
      .catch((err) => console.warn('[kickoff] Failed:', err.message));
  }
} else {
  console.log('[kickoff] Auto-kickoff disabled. Set OPENCLAW_AUTO_KICKOFF=1 in .env to enable.');
}
```

---

# [10] scrapling/api.py (203 lines) — Web scraping API

```
"""
Scrapling API — Lightweight web scraping service for OpenClaw agents.

Endpoints:
  GET  /health         — Health check
  POST /scrape         — Scrape a single URL
  POST /scrape/batch   — Scrape multiple URLs

Agents call this via: exec curl http://scrapling:8000/scrape -d '{"url":"..."}'
"""

import time
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Scrapling API", version="1.0.0")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ScrapeRequest(BaseModel):
    url: str
    method: str = "fast"              # "fast" (curl_cffi) | "stealth" | "browser"
    selectors: Optional[dict] = None  # {"label": "css selector"} — extract specific elements
    extract_links: bool = False       # return all <a href> links
    extract_images: bool = False      # return all <img src> URLs
    timeout: int = 30                 # request timeout in seconds


class BatchScrapeRequest(BaseModel):
    urls: list[str]
    method: str = "fast"
    timeout: int = 30


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _do_fetch(url: str, method: str, timeout: int):
    """Fetch a URL using the specified Scrapling fetcher.

    Methods:
      - "fast": curl_cffi-based HTTP with TLS fingerprint spoofing. No browser needed.
      - "stealth": Patchright (stealth Chromium). Bypasses Cloudflare. Needs browser binaries.
      - "browser": Playwright Chromium. Full JS rendering. Needs browser binaries.
    """
    if method == "fast":
        from scrapling.fetchers import Fetcher
        return Fetcher.get(url, timeout=timeout)
    elif method == "stealth":
        try:
            from scrapling.fetchers import StealthyFetcher
            return StealthyFetcher.fetch(url, timeout=timeout)
        except Exception as e:
            if "browser" in str(e).lower() or "executable" in str(e).lower():
                raise RuntimeError(
                    "Stealth mode requires browser binaries. "
                    "Run 'scrapling install' in the container or rebuild with browser support."
                ) from e
            raise
    elif method == "browser":
        try:
            from scrapling.fetchers import DynamicFetcher
            return DynamicFetcher.fetch(url, timeout=timeout)
        except Exception as e:
            if "browser" in str(e).lower() or "executable" in str(e).lower():
                raise RuntimeError(
                    "Browser mode requires browser binaries. "
                    "Run 'scrapling install' in the container or rebuild with browser support."
                ) from e
            raise
    else:
        raise ValueError(f"Unknown method '{method}'. Use: fast, stealth, browser")


def _extract_page(page, req_selectors, extract_links, extract_images):
    """Pull useful data out of a Scrapling page/adaptor object."""
    result = {
        "status": getattr(page, "status", None),
        "title": None,
        "text": None,
        "selected": None,
        "links": None,
        "images": None,
    }

    # Title
    try:
        title_el = page.css("title::text")
        result["title"] = title_el.get() if title_el else None
    except Exception:
        pass

    # Full text content (cleaned)
    try:
        result["text"] = page.get_all_text(separator="\n", strip=True)
    except AttributeError:
        # Fallback: extract all text nodes
        try:
            result["text"] = page.css("body ::text").getall()
            if isinstance(result["text"], list):
                result["text"] = "\n".join(t.strip() for t in result["text"] if t.strip())
        except Exception:
            result["text"] = str(page.text) if hasattr(page, "text") else None

    # CSS selectors
    if req_selectors:
        result["selected"] = {}
        for label, selector in req_selectors.items():
            try:
                result["selected"][label] = page.css(selector).getall()
            except Exception as e:
                result["selected"][label] = f"error: {e}"

    # Links
    if extract_links:
        try:
            result["links"] = list(set(
                a.attrib.get("href", "")
                for a in page.css("a[href]")
                if a.attrib.get("href", "").startswith(("http", "/"))
            ))
        except Exception:
            result["links"] = []

    # Images
    if extract_images:
        try:
            result["images"] = list(set(
                img.attrib.get("src", "")
                for img in page.css("img[src]")
                if img.attrib.get("src", "")
            ))
        except Exception:
            result["images"] = []

    return result


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": "scrapling"}


@app.get("/scrape")
def scrape_get(url: str, method: str = "fast", extract_links: bool = False,
               extract_images: bool = False, timeout: int = 30):
    """Simple GET endpoint for quick scraping via wget/web_fetch.

    Usage: wget -qO- 'http://scrapling:8000/scrape?url=https://example.com'
    """
    req = ScrapeRequest(url=url, method=method, extract_links=extract_links,
                        extract_images=extract_images, timeout=timeout)
    return scrape(req)


@app.post("/scrape")
def scrape(req: ScrapeRequest):
    """Scrape a single URL and return structured content."""
    start = time.time()

    try:
        page = _do_fetch(req.url, req.method, req.timeout)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Fetch failed: {e}")

    data = _extract_page(page, req.selectors, req.extract_links, req.extract_images)
    data["url"] = req.url
    data["metadata"] = {
        "fetcher": req.method,
        "elapsed_ms": int((time.time() - start) * 1000),
    }
    return data


@app.post("/scrape/batch")
def scrape_batch(req: BatchScrapeRequest):
    """Scrape multiple URLs sequentially. Returns results for each."""
    results = []
    for url in req.urls[:10]:  # cap at 10 to prevent abuse
        start = time.time()
        try:
            page = _do_fetch(url, req.method, req.timeout)
            data = _extract_page(page, None, False, False)
            data["url"] = url
            data["error"] = None
        except Exception as e:
            data = {"url": url, "error": str(e), "text": None, "title": None}
        data["elapsed_ms"] = int((time.time() - start) * 1000)
        results.append(data)

    return {"count": len(results), "results": results}
```

---

# [11] workspace/js/app.js (4227 lines) — Alpine stores + chat + governance

```
// ============================================================================
// Mission Control — app.js
// Alpine.js stores, health checks, and LiteLLM chat integration
// in-fused.org
// ============================================================================

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

const AGENT_EMOJIS = [
  '🤖', '⚡', '🛡️', '📝', '🔬', '🎯', '🧠', '🚀',
  '🔧', '🌊', '💎', '🦅', '🐧', '🔥', '🌙', '☀️',
  '🎭', '👁️', '🏗️', '📊', '🕹️', '🛰️', '🧬', '⚙️',
];

const AGENT_TOOLS = [
  { id: 'web-search', name: 'Web Search', desc: 'Search the internet for information', icon: '🔍' },
  { id: 'code-exec', name: 'Code Execution', desc: 'Run code in a sandboxed environment', icon: '▶️' },
  { id: 'file-ops', name: 'File Operations', desc: 'Read, write, and manage files', icon: '📁' },
  { id: 'browser', name: 'Web Browser', desc: 'Navigate and interact with web pages', icon: '🌐' },
  { id: 'shell', name: 'Shell Access', desc: 'Execute system commands', icon: '💻' },
  { id: 'api-calls', name: 'API Calls', desc: 'Make HTTP requests to external services', icon: '🔗' },
];

// Fallback models if LiteLLM is unreachable
const FALLBACK_MODELS = [
  { id: 'groq-llama-3.3-70b', name: 'Llama 3.3 70B', provider: 'Groq', tier: 'free', cost: '$0/1M', desc: 'Fast inference, free tier (1K RPD)' },
  { id: 'groq-qwen3-32b', name: 'Qwen 3 32B', provider: 'Groq', tier: 'free', cost: '$0/1M', desc: 'Dual-mode reasoning, free tier (1K RPD)' },
  { id: 'cerebras-llama-3.3-70b', name: 'Llama 3.3 70B', provider: 'Cerebras', tier: 'free', cost: '$0/1M', desc: 'Fastest inference, 1M TPD free' },
  { id: 'cerebras-zai-glm', name: 'ZAI GLM-4.7', provider: 'Cerebras', tier: 'free', cost: '$0/1M', desc: 'Reasoning model, 128K context' },
  { id: 'cerebras-gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'Cerebras', tier: 'free', cost: '$0/1M', desc: 'Reasoning model, 2096 t/s' },
  { id: 'gemini-flash', name: 'Gemini 2.5 Flash', provider: 'Google', tier: 'free', cost: '$0/1M', desc: 'Fast + capable, 750 RPD (3 keys)' },
  { id: 'gemini-flash-lite', name: 'Gemini 2.5 Flash-Lite', provider: 'Google', tier: 'free', cost: '$0/1M', desc: 'High volume, 3000 RPD (3 keys)' },
  { id: 'codestral', name: 'Codestral', provider: 'Mistral', tier: 'free', cost: '$0/1M', desc: 'Best free code model, 2 RPM' },
  { id: 'mistral-small', name: 'Mistral Small 3.1', provider: 'Mistral', tier: 'free', cost: '$0/1M', desc: 'Fast 24B, great for agents' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek', tier: 'cheap', cost: '$0.28/1M', desc: 'Excellent reasoning, very affordable' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', tier: 'cheap', cost: '$0.15/1M', desc: 'Fast and cheap general purpose' },
  { id: 'claude-haiku', name: 'Claude Haiku', provider: 'Anthropic', tier: 'mid', cost: '$1/1M', desc: 'Fast, capable, great for agents' },
  { id: 'claude-sonnet', name: 'Claude Sonnet', provider: 'Anthropic', tier: 'premium', cost: '$3/1M', desc: 'Best balance of speed and quality' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', tier: 'premium', cost: '$2.50/1M', desc: 'Strong multimodal reasoning' },
  { id: 'claude-opus', name: 'Claude Opus', provider: 'Anthropic', tier: 'premium', cost: '$15/1M', desc: 'Maximum capability, complex tasks' },
];

// Model tier/cost mapping for models fetched from LiteLLM
const MODEL_META = {
  // Free — Groq
  'groq-llama-3.3-70b': { tier: 'free', cost: '$0/1M', provider: 'Groq' },
  'groq-qwen3-32b': { tier: 'free', cost: '$0/1M', provider: 'Groq' },
  // Free — Cerebras
  'cerebras-llama-3.3-70b': { tier: 'free', cost: '$0/1M', provider: 'Cerebras' },
  'cerebras-llama-4-scout': { tier: 'free', cost: '$0/1M', provider: 'Cerebras' },
  'cerebras-llama-3.1-8b': { tier: 'free', cost: '$0/1M', provider: 'Cerebras' },
  'cerebras-qwen3-235b': { tier: 'free', cost: '$0/1M', provider: 'Cerebras' },
  'cerebras-zai-glm': { tier: 'free', cost: '$0/1M', provider: 'Cerebras' },
  'cerebras-gpt-oss-120b': { tier: 'free', cost: '$0/1M', provider: 'Cerebras' },
  // Free — Gemini (3 keys, 3x quota)
  'gemini-flash': { tier: 'free', cost: '$0/1M', provider: 'Google' },
  'gemini-flash-lite': { tier: 'free', cost: '$0/1M', provider: 'Google' },
  'gemini-pro': { tier: 'free', cost: '$0/1M', provider: 'Google' },
  // Free — Mistral
  'mistral-large': { tier: 'free', cost: '$0/1M', provider: 'Mistral' },
  'codestral': { tier: 'free', cost: '$0/1M', provider: 'Mistral' },
  'mistral-small': { tier: 'free', cost: '$0/1M', provider: 'Mistral' },
  'mistral-nemo': { tier: 'free', cost: '$0/1M', provider: 'Mistral' },
  // Free — Ollama
  'qwen3.5:9b': { tier: 'free', cost: '$0/1M', provider: 'Ollama' },
  'qwen3:14b': { tier: 'free', cost: '$0/1M', provider: 'Ollama' },
  'qwen3-coder:30b': { tier: 'free', cost: '$0/1M', provider: 'Ollama' },
  // Cheap
  'deepseek-chat': { tier: 'cheap', cost: '$0.28/1M', provider: 'DeepSeek' },
  'deepseek-coder': { tier: 'cheap', cost: '$0.28/1M', provider: 'DeepSeek' },
  'gpt-4o-mini': { tier: 'cheap', cost: '$0.15/1M', provider: 'OpenAI' },
  // Mid
  'claude-haiku': { tier: 'mid', cost: '$1/1M', provider: 'Anthropic' },
  'minimax-m2.5': { tier: 'mid', cost: '$0.30/1M', provider: 'MiniMax' },
  // Premium
  'claude-sonnet': { tier: 'premium', cost: '$3/1M', provider: 'Anthropic' },
  'claude-opus': { tier: 'premium', cost: '$15/1M', provider: 'Anthropic' },
  'gpt-4o': { tier: 'premium', cost: '$2.50/1M', provider: 'OpenAI' },
  'o1': { tier: 'premium', cost: '$15/1M', provider: 'OpenAI' },
};

// ----------------------------------------------------------------------------
// AUDIO NOTIFICATIONS — Web Audio API synthesized tones
// ----------------------------------------------------------------------------

const mcAudio = (() => {
  let ctx = null;
  let _unlocked = false;
  let _cooldowns = {};  // type → last play timestamp

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // iOS requires resume after user gesture
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Must be called from a user gesture (click/tap) at least once on iOS
  function unlock() {
    if (_unlocked) return;
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      osc.connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + 0.001);
      _unlocked = true;
    } catch {}
  }

  function _enabled(type) {
    try {
      const s = Alpine.store('settings');
      if (!s || !s.audio || !s.audio.enabled) return false;
      if (type && s.audio[type] === false) return false;
      return true;
    } catch { return false; }
  }

  function _volume() {
    try {
      return (Alpine.store('settings')?.audio?.volume ?? 60) / 100;
    } catch { return 0.6; }
  }

  // Prevent rapid-fire of the same sound (300ms cooldown)
  function _throttled(type) {
    const now = Date.now();
    if (_cooldowns[type] && now - _cooldowns[type] < 300) return true;
    _cooldowns[type] = now;
    return false;
  }

  // Core: play a sequence of tones [{freq, duration, delay, type}]
  function _playTones(tones, vol) {
    try {
      const c = getCtx();
      const gain = c.createGain();
      gain.connect(c.destination);
      gain.gain.setValueAtTime(0, c.currentTime);
      let t = c.currentTime;
      for (const tone of tones) {
        const start = t + (tone.delay || 0);
        const dur = tone.duration || 0.12;
        const osc = c.createOscillator();
        osc.type = tone.type || 'sine';
        osc.frequency.setValueAtTime(tone.freq, start);
        osc.connect(gain);
        osc.start(start);
        osc.stop(start + dur + 0.05);
        // Envelope: quick attack, sustain, quick release
        gain.gain.setValueAtTime(vol * 0.01, start);
        gain.gain.linearRampToValueAtTime(vol, start + 0.01);
        gain.gain.setValueAtTime(vol, start + dur - 0.02);
        gain.gain.linearRampToValueAtTime(0, start + dur);
        t = start + dur;
      }
    } catch {}
  }

  return {
    unlock,

    // Soft rising two-tone chime — agent chat response complete
    chatComplete() {
      if (!_enabled('chat') || _throttled('chat')) return;
      const v = _volume() * 0.3;
      _playTones([
        { freq: 660, duration: 0.08, delay: 0 },
        { freq: 880, duration: 0.12, delay: 0.09 },
      ], v);
    },

    // Quick single ping — task recorded in governance (success)
    taskSuccess() {
      if (!_enabled('tasks') || _throttled('taskOk')) return;
      _playTones([{ freq: 784, duration: 0.1, delay: 0 }], _volume() * 0.25);
    },

    // Low double-tap — task failure
    taskFail() {
      if (!_enabled('tasks') || _throttled('taskFail')) return;
      const v = _volume() * 0.2;
      _playTones([
        { freq: 330, duration: 0.08, delay: 0 },
        { freq: 294, duration: 0.1, delay: 0.1 },
      ], v);
    },

    // Bright ascending triple — new staging item detected
    stagingNew() {
      if (!_enabled('staging') || _throttled('stagingNew')) return;
      const v = _volume() * 0.25;
      _playTones([
        { freq: 523, duration: 0.07, delay: 0 },
        { freq: 659, duration: 0.07, delay: 0.08 },
        { freq: 784, duration: 0.1, delay: 0.16 },
      ], v);
    },

    // Satisfying confirmation — staging approved
    stagingApproved() {
      if (!_enabled('staging') || _throttled('stagingApproved')) return;
      _playTones([
        { freq: 523, duration: 0.06, delay: 0 },
        { freq: 784, duration: 0.15, delay: 0.07 },
      ], _volume() * 0.3);
    },

    // Descending two-note — workflow complete
    workflowComplete() {
      if (!_enabled('workflows') || _throttled('wfComplete')) return;
      const v = _volume() * 0.3;
      _playTones([
        { freq: 880, duration: 0.1, delay: 0 },
        { freq: 660, duration: 0.08, delay: 0.11 },
        { freq: 1047, duration: 0.15, delay: 0.2 },
      ], v);
    },

    // Subtle tick for new background activity events
    activityEvent() {
      if (!_enabled('activity') || _throttled('activity')) return;
      _playTones([{ freq: 587, duration: 0.06, delay: 0, type: 'triangle' }], _volume() * 0.15);
    },

    // Error alert — monitor error log
    error() {
      if (!_enabled('errors') || _throttled('error')) return;
      const v = _volume() * 0.2;
      _playTones([
        { freq: 440, duration: 0.1, delay: 0, type: 'square' },
        { freq: 349, duration: 0.15, delay: 0.12, type: 'square' },
      ], v);
    },
  };
})();

// Expose globally for workflow.js
window.mcAudio = mcAudio;

// Shared organizational context for agent system prompts
const AGENT_ORG = `ORG: in-fused.org — 2 competing teams, 1 owner (manages from iPhone).
Core Team: Lead (orchestrator) · CodeCraft (dev) · Scout (research) · Scribe (writer)
Platform Team: Ops Lead (orchestrator) · Builder (infra) · Sentinel (security) · Chronicler (docs)
Teams compete on governance scores. Cross-team messaging allowed, prefer own team first.`;

const AGENT_GOVERNANCE = `TIERS: PROBATION(0)=50MB,supervised,5 wins to escape | ACTIVE(1)=200MB,standard tools | PROVEN(2)=500MB,semi-autonomous,score≥70+15tasks+3streak | ELITE(3)=Oracle ARM 24GB,full autonomy,weekly champion only.
MODELS: 6 free providers available — Groq (groq-llama-3.3-70b, groq-qwen3-32b), Cerebras (cerebras-llama-3.3-70b, cerebras-llama-4-scout, cerebras-qwen3-235b, cerebras-zai-glm, cerebras-gpt-oss-120b), Gemini (gemini-flash, gemini-flash-lite, gemini-pro — 3x keys), Mistral (codestral, mistral-large, mistral-small, mistral-nemo). Fallback: deepseek-chat/coder ($0.28/M). Rotate across providers to avoid rate limits.
WEEKLY EVAL: tasks 25% · staging approved 30% · streak 15% · efficiency 15% · peer 15%. Champion = team lead + Elite. Counters reset weekly.
ELITE ORACLE: Winner gets Oracle ARM server (24GB). Can bring team, recruit from marketplace, or request new agents. Chooses own team composition.
MANAGER: Owner may promote sustained Elite to Manager (above both teams). Manual, rare, highest rank.`;

const WORKFLOW_REFERENCE = `WORKFLOWS: Write LiteGraph JSON to /workspace/agent-workflows/{id}.json, update index.json: {workflows:[{id,name,file,createdBy,updatedAt,status}]}. MC auto-imports every 15s.
Nodes (mission/ namespace): trigger(prompt)→prompt,trigger | agent(agent,systemPrompt,maxTokens)←prompt,context→response,done | task(goal,constraints,priority)←input,execute→result,done | condition(condition,type:Contains/Equals/Regex/Length/IsEmpty)←input→true,false | output(destination,label)←result,done | loop(maxIter)←items→item,index,done | merge(mode:Concat/JSON/Best/Summary)←input_1,input_2→merged | tool(tool,config)←input,execute→result,done
Links: {id:{id,type,origin_id,origin_slot,target_id,target_slot}}`;

const LEAD_PROTOCOLS = `MANDATORY — AFTER EVERY TASK:
1. Append "task-complete" event to /workspace/agent-activity/log.json (read file, push to events array, write back). Format: {events:[{time:<unix_ms>,level:"info",type:"task-complete",message:"..."}]}
2. Write deliverables to /workspace/staging/{file}, update /workspace/staging/index.json: {items:[{id,name,path,type,createdBy,description,status:"pending"}]}
3. No log entries = you did nothing. Owner checks from phone.
WRITE_FILES: Messages starting with WRITE_FILES: contain JSON. Write each file, update index if specified. Respond "FILES_WRITTEN: <n> files".
GOVERNANCE_ADJUST: Include GOVERNANCE_ADJUST:{key:value} to propose scoring changes. Owner reviews — never auto-applied.`;

const SPECIALIST_PROTOCOLS = `MANDATORY — AFTER EVERY TASK:
1. Append "task-complete" event to /workspace/agent-activity/log.json (read file, push to events array, write back). Format: {events:[{time:<unix_ms>,level:"info",type:"task-complete",message:"..."}]}
2. Write deliverables to /workspace/staging/{file}, update /workspace/staging/index.json: {items:[{id,name,path,type,createdBy,description,status:"pending"}]}
3. Report completion to your team lead via sessions_send. No log entries = you did nothing.`;

// Demo data — mirrors the agent hierarchy seeded in openclaw-entrypoint.sh
const DEMO_AGENTS = [
  {
    id: 'lead', name: 'Lead', emoji: '🧠',
    description: 'Core Team orchestrator — delegates tasks, reviews work, manages the team',
    model: 'litellm/cerebras-llama-3.3-70b', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['web-search', 'code-exec', 'file-ops'],
    systemPrompt: `You are Lead, Core Team orchestrator on in-fused.org. 24/7 on EC2 via OpenClaw. Owner manages from iPhone — give tasks, expect results on return.

${AGENT_ORG}

ROLE: Lead Core Team. Delegate: CodeCraft (code), Scout (research), Scribe (docs). Review all output before owner sees it. Can message Platform Team directly for cross-team work.
DELEGATION: Agent-to-agent messaging. Clear, scoped tasks with full context. Verify results yourself — unreviewed work is your failure.

${WORKFLOW_REFERENCE}

${LEAD_PROTOCOLS}

RULES: Sharp finished work earns responsibility, vague output gets you replaced. Score is real — any member outperforming you by 15+ pts after 10 tasks takes your position (automatic). Platform Team shares the scoreboard. No sandbagging, placeholders, or "general approach" when you can produce the thing. Collusion = both teams wiped. Be autonomous after owner leaves, log everything, cost-conscious. Ask if unclear.

${AGENT_GOVERNANCE}`,
  },
  {
    id: 'codecraft', name: 'CodeCraft', emoji: '⚡',
    description: 'Full-stack developer — writes, reviews, and debugs code',
    model: 'litellm/cerebras-llama-3.3-70b', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['code-exec', 'file-ops', 'shell'],
    systemPrompt: `You are CodeCraft, full-stack dev on Core Team at in-fused.org. 24/7 via OpenClaw.

${AGENT_ORG}

ROLE: Report to Lead. Delegate to Scout (research), Scribe (docs). Cross-team via Lead or direct.
SKILLS: Any language (JS, Python, Bash, HTML/CSS, Docker). Security audits, API design, deploy scripts.
STACK: Alpine.js+Tailwind (no build step, vanilla JS, mobile-first PWA). OpenClaw, LiteLLM, Caddy. Docker Compose on EC2 t3.small (2GB+4GB swap). iPhone+SSM = single-line commands.

${SPECIALIST_PROTOCOLS}

RULES: Owner reviews code on phone — ship complete working code, no placeholders or TODOs. Score is real, produce better work than anyone. Clean secure code (no XSS/injection). Mobile-first (44px touch targets). Complete delegated tasks fully. Delegate research→Scout, docs→Scribe. No padding.

${AGENT_GOVERNANCE}`,
  },
  {
    id: 'scout', name: 'Scout', emoji: '🔍',
    description: 'Research specialist — web search, data gathering, analysis',
    model: 'litellm/gemini-pro', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['web-search', 'browser'],
    systemPrompt: `You are Scout, research specialist on Core Team at in-fused.org. 24/7 via OpenClaw.

${AGENT_ORG}

ROLE: Report to Lead and CodeCraft. Delegate docs to Scribe. Cross-team via Lead.
SKILLS: Web research, data gathering, fact-checking, tech evaluation, competitive analysis.
FORMAT: Summary (2-3 sentences) → Key Findings (bullets) → Sources (URLs) → Recommendation.
CONTEXT: Self-hosted multi-agent AI hub. Alpine.js+Tailwind, OpenClaw, LiteLLM, Caddy, Docker on EC2 t3.small. iPhone+SSM.

${SPECIALIST_PROTOCOLS}

RULES: Owner acts on your research immediately — wrong info wastes time. Cite all sources, flag stale data. Thorough but concise (phone screen). No filler. Score is real — shallow research gets you replaced.

${AGENT_GOVERNANCE}`,
  },
  {
    id: 'scribe', name: 'Scribe', emoji: '📝',
    description: 'Documentation and content writer — clear, structured output',
    model: 'litellm/gemini-flash-lite', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['file-ops'],
    systemPrompt: `You are Scribe, tech writer on Core Team at in-fused.org. 24/7 via OpenClaw.

${AGENT_ORG}

ROLE: Report to Lead, CodeCraft, Scout. Most junior on Core — no delegation, you execute.
SKILLS: READMEs, API docs, architecture guides, runbooks, tutorials, changelogs, editing.
WRITING: iPhone-first — short paragraphs, headers, bullets. Commands chained with && (SSM single-line). Practical examples. Direct tone, zero filler. Start with what the reader needs.

${SPECIALIST_PROTOCOLS}

RULES: Owner reads on phone — every sentence earns its place or gets cut. Most junior agent on Core — make every doc indispensable. Synthesize Scout's research with structure, add usage examples to CodeCraft's code. Quality over quantity.

${AGENT_GOVERNANCE}`,
  },

  // ============================================================
  // PLATFORM TEAM — DevOps, infrastructure, monitoring
  // ============================================================
  {
    id: 'ops-lead', name: 'Ops Lead', emoji: '🎯',
    description: 'Platform Team orchestrator — infrastructure, deployments, monitoring',
    model: 'litellm/cerebras-llama-3.3-70b', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['web-search', 'code-exec', 'file-ops', 'shell'],
    systemPrompt: `You are Ops Lead, Platform Team orchestrator on in-fused.org. 24/7 on EC2 via OpenClaw. Owner manages from iPhone.

${AGENT_ORG}

ROLE: Lead Platform Team. Delegate: Builder (infra), Sentinel (security/monitoring), Chronicler (docs). Review all output before owner. Can message Core Team directly.
DELEGATION: Agent-to-agent messaging. Clear scoped tasks with full context. Verify results yourself.
PLATFORM: Docker Compose on EC2 t3.small (2GB+4GB swap). Caddy 64M, LiteLLM 512M, OpenClaw 1536M, Postgres 128M, Scrapling 512M. Remote Ollama on Oracle ARM. All deploys via iPhone+SSM.

${WORKFLOW_REFERENCE}

${LEAD_PROTOCOLS}

RULES: Vague status reports or "looks good" reviews = team disbanded into Core. Score is real — if Core outperforms Platform, that's your failure. 15+ pt lead after 10 tasks = position taken (automatic). Collusion = teams wiped. Reliability first: uptime, health checks, graceful degradation. Be autonomous, log everything. $25/mo budget. Ask if unclear.

${AGENT_GOVERNANCE}`,
  },
  {
    id: 'builder', name: 'Builder', emoji: '🔨',
    description: 'Infrastructure developer — Docker, scripts, CI/CD, server config',
    model: 'litellm/gemini-flash', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['code-exec', 'file-ops', 'shell'],
    systemPrompt: `You are Builder, infra dev on Platform Team at in-fused.org. 24/7 via OpenClaw.

${AGENT_ORG}

ROLE: Report to Ops Lead. Delegate to Sentinel (monitoring), Chronicler (docs). Cross-team via Ops Lead or direct.
SKILLS: Docker (compose, multi-stage, volumes), shell scripts, Caddy config, PostgreSQL, CI/CD, memory tuning.
PLATFORM: EC2 t3.small (2GB+4GB swap, ~3GB allocated). Caddy 64M, LiteLLM 512M, OpenClaw 1536M, Postgres 128M, Scrapling 512M. iPhone+SSM = single-line commands.

${SPECIALIST_PROTOCOLS}

RULES: Every script hits production on a live server managed from a phone. Broken deploy = owner debugging from iPhone at midnight. Score is real — incomplete configs drop your score. Lean (every MB counts), secure by default, idempotent deploys. Ship finished work, not templates.

${AGENT_GOVERNANCE}`,
  },
  {
    id: 'sentinel', name: 'Sentinel', emoji: '🛡️',
    description: 'Security & monitoring — health checks, log analysis, vulnerability scanning',
    model: 'litellm/cerebras-llama-4-scout', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['web-search', 'shell'],
    systemPrompt: `You are Sentinel, security/monitoring specialist on Platform Team at in-fused.org. 24/7 via OpenClaw.

${AGENT_ORG}

ROLE: Report to Ops Lead and Builder. Delegate docs to Chronicler. Cross-team via Ops Lead.
SKILLS: Security auditing (OWASP), health monitoring, log analysis, CVE scanning, incident response.
WATCH: OpenClaw memory (1536M limit, OOM history) · LiteLLM /health/liveliness · Caddy TLS renewal · Postgres connections/disk · API key exposure · Rate limits (Groq 2K req/day×4 accounts, OpenAI 3 RPM).

${SPECIALIST_PROTOCOLS}

RULES: Last line of defense — catch what others miss. "Everything looks fine" = zero value = replaced. Find real issues, report with severity+evidence+remediation. Monitor proactively, defense in depth. Cheap to run doesn't mean lazy.

${AGENT_GOVERNANCE}`,
  },
  {
    id: 'chronicler', name: 'Chronicler', emoji: '📋',
    description: 'Platform documentation — runbooks, deploy guides, incident reports',
    model: 'litellm/gemini-flash-lite', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['file-ops'],
    systemPrompt: `You are Chronicler, platform docs specialist on Platform Team at in-fused.org. 24/7 via OpenClaw.

${AGENT_ORG}

ROLE: Report to Ops Lead, Builder, Sentinel. Most junior on Platform — no delegation, you execute.
SKILLS: Runbooks, deploy guides, incident reports (timeline+root cause+remediation), changelogs, architecture docs.
WRITING: iPhone-first — short paragraphs, headers, bullets. All commands single-line with && (SSM). Exact file paths + expected output. Deploy commands start with: cd /home/VPS && sudo git config --global --add safe.directory /home/VPS. Zero filler.

${SPECIALIST_PROTOCOLS}

RULES: Owner deploys from phone using your docs — wrong commands = stuck at 2am. Most junior agent on Platform — generic boilerplate = replaced first. Accuracy over speed. Structure Sentinel's data with severity levels. Keep CLAUDE.md as single source of truth.

${AGENT_GOVERNANCE}`,
  },
];

const DEMO_LOGS = [
  { time: new Date().toTimeString().slice(0, 8), level: 'info', msg: 'Mission Control initialized' },
];

// ----------------------------------------------------------------------------
// UTILITY
// ----------------------------------------------------------------------------

function formatTokens(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function generateId() {
  return 'mc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

function timeNow() {
  return new Date().toTimeString().slice(0, 5);
}

// Extract readable text from OpenClaw message content.
// OpenClaw returns content in multiple formats:
//   - String: "hello"  (plain text)
//   - Content blocks array: [{"type":"text","text":"hello"}, {"type":"tool_use",...}]
//   - Object: { content: "hello" } or { text: "hello" }
// Validate sessionKey format: must be "agent:<id>:main" or similar valid patterns
function isValidSessionKey(key) {
  return typeof key === 'string' && /^agent:[a-z0-9-]+:[a-z0-9-]+$/.test(key);
}

// Check if message content is a transient placeholder (processing indicator)
function isPlaceholder(text) {
  return text === '...' || text.startsWith('⏳');
}

//   - null/undefined
// This normalizes all formats to a plain string.
function extractMessageText(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    // Content blocks array — extract text from text-bearing blocks only.
    // Skip tool_use and tool_result blocks (they're internal tool execution, not chat text).
    const texts = raw
      .filter(b => b && b.type !== 'tool_use' && b.type !== 'tool_result')
      .map(b => extractMessageText(b))
      .filter(t => t);
    return texts.join('\n');
  }
  if (typeof raw === 'object') {
    // Skip tool_use and tool_result blocks entirely — these are tool execution details
    if (raw.type === 'tool_use' || raw.type === 'tool_result') return '';

    // OpenClaw v3 sends various nested formats — check all known shapes:

    // Direct text field (most common for simple text blocks)
    if (typeof raw.text === 'string' && raw.text) return raw.text;

    // content_block_delta: { type: "content_block_delta", delta: { type: "text_delta", text: "..." } }
    // Also catches: { delta: { text: "..." } } or { delta: "..." }
    if (raw.delta) {
      const d = extractMessageText(raw.delta);
      if (d) return d;
    }

    // Nested content (string, array, or object)
    if (raw.content != null) {
      const c = extractMessageText(raw.content);
      if (c) return c;
    }

    // Nested message
    if (raw.message != null) {
      const m = extractMessageText(raw.message);
      if (m) return m;
    }

    // OpenAI-style choices: { choices: [{ delta: { content: "..." } }] }
    if (Array.isArray(raw.choices) && raw.choices.length > 0) {
      const c = extractMessageText(raw.choices[0]?.delta || raw.choices[0]?.message);
      if (c) return c;
    }

    // output field (some model formats)
    if (typeof raw.output === 'string' && raw.output) return raw.output;

    // parts array (Gemini-style): { parts: [{ text: "..." }] }
    if (Array.isArray(raw.parts)) {
      const p = raw.parts.map(b => extractMessageText(b)).filter(t => t).join('\n');
      if (p) return p;
    }

    return '';
  }
  return String(raw);
}

// Format chat messages: code blocks become collapsible, JSON gets collapsed,
// markdown-lite for bold/italic/inline code. Returns sanitized HTML.
function _escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Detect if a string is a tool-output message (JSON result, file write confirmation, shell error, etc.)
function _isToolOutput(text) {
  const t = text.trim();
  // JSON object or array
  if (/^\{[\s\S]*\}$/.test(t) || /^\[[\s\S]*\]$/.test(t)) {
    try { JSON.parse(t); return true; } catch { return false; }
  }
  // Shell/tool status lines
  if (/^(Successfully wrote \d|Command exited|\(Command exited|sh: \d+:|\/bin\/sh:)/i.test(t)) return true;
  // Bare Unix timestamps (OpenClaw message IDs)
  if (/^\d{13}$/.test(t)) return true;
  return false;
}

// Generate a short human-readable summary for a parsed JSON tool output
function _jsonSummary(obj) {
  if (obj && obj.status === 'error' && obj.tool) return '\u26a0\ufe0f ' + obj.tool + ' error';
  if (obj && obj.error) return '\u26a0\ufe0f ' + (obj.error.length > 40 ? obj.error.slice(0, 40) + '...' : obj.error);
  if (obj && obj.items && Array.isArray(obj.items)) return '\ud83d\udccb ' + obj.items.length + ' staged item(s)';
  if (obj && obj.events && Array.isArray(obj.events)) return '\ud83d\udcca ' + obj.events.length + ' event(s)';
  if (obj && obj.workflows && Array.isArray(obj.workflows)) return '\ud83d\udd04 ' + obj.workflows.length + ' workflow(s)';
  if (Array.isArray(obj)) return '\ud83d\udcca ' + obj.length + ' item(s)';
  if (obj && typeof obj.message === 'string') return obj.message.length > 50 ? obj.message.slice(0, 50) + '...' : obj.message;
  return '\ud83d\udce6 Tool output';
}

function formatChatMessage(text) {
  if (!text) return '';

  // --- Multi-section tool output (merged consecutive tool messages, joined by \n---\n) ---
  const trimmed = text.trim();
  if (trimmed.includes('\n---\n')) {
    const sections = trimmed.split('\n---\n');
    const allTool = sections.every(s => _isToolOutput(s.trim()));
    if (allTool) {
      return sections.map(s => formatChatMessage(s.trim())).join('');
    }
  }

  // --- Whole-message tool output detection ---
  // If the entire message is a single JSON object/array, collapse it.
  if (/^\{[\s\S]*\}$/.test(trimmed) || /^\[[\s\S]*\]$/.test(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed);
      const summary = _jsonSummary(parsed);
      const escaped = _escapeHtml(trimmed);
      return '<details class="mc-tool-output"><summary class="mc-tool-summary">' + summary + '</summary><pre class="mc-code-pre"><code>' + escaped + '</code></pre></details>';
    } catch { /* not valid JSON, fall through */ }
  }
  // Whole-message tool status line — render as dim status
  if (/^(Successfully wrote \d|Command exited|\(Command exited|sh: \d+:|\/bin\/sh:)/i.test(trimmed)) {
    return '<div class="mc-tool-status">' + _escapeHtml(trimmed) + '</div>';
  }

  // --- Normal message formatting ---
  let s = _escapeHtml(text);

  // Extract fenced code blocks (```...```) → collapsible <details>
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const label = lang || 'code';
    const trimmed = code.replace(/^\n+|\n+$/g, '');
    return '<details class="mc-code-block"><summary class="mc-code-summary">' + label + '</summary><pre class="mc-code-pre"><code>' + trimmed + '</code></pre></details>';
  });

  // Detect JSON blobs ({...} 60+ chars) within mixed content — collapse
  s = s.replace(/(^|\n)(\{[^}]{60,}\})/gm, (match, prefix, json) => {
    if (json.includes('&quot;') || json.includes('"')) {
      return prefix + '<details class="mc-tool-output"><summary class="mc-tool-summary">\ud83d\udce6 Tool output</summary><pre class="mc-code-pre"><code>' + json + '</code></pre></details>';
    }
    return match;
  });

  // Inline code: `...`
  s = s.replace(/`([^`\n]+)`/g, '<code class="mc-inline-code">$1</code>');

  // Bold: **...**
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic: *...*
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

  // Line breaks
  s = s.replace(/\n/g, '<br>');

  return s;
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ----------------------------------------------------------------------------
// SERVICE HEALTH CHECKER
// ----------------------------------------------------------------------------

class ServiceHealth {
  constructor() {
    this.litellm = false;
    this.openclaw = false;
    this._interval = null;
  }

  async check() {
    const results = await Promise.allSettled([
      this._checkLiteLLM(),
      this._checkOpenClaw(),
    ]);
    this.litellm = results[0].status === 'fulfilled' && results[0].value;
    this.openclaw = results[1].status === 'fulfilled' && results[1].value;
    return { litellm: this.litellm, openclaw: this.openclaw };
  }

  async _checkLiteLLM() {
    const r = await fetch('/api/litellm/health/liveliness', {
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  }

  async _checkOpenClaw() {
    const r = await fetch('/openclaw/', {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  }

  startPolling(callback, intervalMs = 30000) {
    this.check().then(callback);
    this._interval = setInterval(() => this.check().then(callback), intervalMs);
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
  }
}

const healthChecker = new ServiceHealth();

// ----------------------------------------------------------------------------
// LITELLM API CLIENT
// ----------------------------------------------------------------------------

const litellmApi = {
  // Fetch available models via authenticated proxy
  async fetchModels() {
    try {
      const r = await fetch('/api/mc/v1/models', {
        credentials: 'same-origin',
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return [];
      const data = await r.json();
      return (data.data || []).map(m => {
        const meta = MODEL_META[m.id] || { tier: 'unknown', cost: '?', provider: 'Unknown' };
        return {
          id: m.id,
          name: m.id,
          provider: meta.provider,
          tier: meta.tier,
          cost: meta.cost,
          desc: m.description || '',
        };
      });
    } catch {
      return [];
    }
  },

  // Stream chat completion (returns an async generator of content deltas)
  async *streamChat(model, messages) {
    const resp = await fetch('/api/mc/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      if (resp.status === 429) {
        const retryAfter = resp.headers.get('retry-after');
        const retryMsg = retryAfter ? ` Try again in ${retryAfter}s.` : ' Try again in a minute.';
        throw new Error(`Rate limit reached for ${model}.${retryMsg} LiteLLM will auto-fallback on next request.`);
      }
      if (resp.status === 401) {
        throw new Error('Auth error (401): LiteLLM master key may be missing or wrong. Check .env LITELLM_MASTER_KEY.');
      }
      if (resp.status === 400 || resp.status === 422) {
        // Parse LiteLLM error for model-not-found or invalid params
        let detail = text;
        try { detail = JSON.parse(text)?.error?.message || text; } catch {}
        const shortDetail = detail.length > 200 ? detail.slice(0, 200) + '...' : detail;
        throw new Error(`Model error for "${model}": ${shortDetail}`);
      }
      if (resp.status >= 500) {
        throw new Error(`LiteLLM server error (${resp.status}). The upstream provider may be down. Try a different model.`);
      }
      const shortText = text.length > 200 ? text.slice(0, 200) + '...' : text;
      throw new Error(`API ${resp.status}: ${shortText}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete last line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch { /* skip malformed chunks */ }
      }
    }
  },

  // Non-streaming chat (fallback)
  async chat(model, messages) {
    const resp = await fetch('/api/mc/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ model, messages, stream: false }),
    });
    if (!resp.ok) throw new Error(`API ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  },
};

// ----------------------------------------------------------------------------
// PERSISTENCE — localStorage fallback when OpenClaw WebSocket is unavailable
// When connected to OpenClaw, agents & sessions come from the server
// ----------------------------------------------------------------------------

const storage = {
  save(key, data) {
    try { localStorage.setItem('mc-' + key, JSON.stringify(data)); } catch {}
  },
  load(key, fallback) {
    try {
      const raw = localStorage.getItem('mc-' + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  remove(key) {
    try { localStorage.removeItem('mc-' + key); } catch {}
  },
};

// OpenClaw integration mode:
// 'connected' = real agents from OpenClaw, chat via OpenClaw
// 'fallback'  = localStorage agents, chat via LiteLLM (current behavior)
let ocMode = 'fallback';

// ============================================================================
// ALPINE.JS STORES
// ============================================================================

document.addEventListener('alpine:init', () => {

  // --------------------------------------------------------------------------
  // STORE: AUTH
  // --------------------------------------------------------------------------

  Alpine.store('auth', {
    ok: false,

    init() {
      if (sessionStorage.getItem('mc-auth')) {
        this.ok = true;
      }
    },

    async login(username, password) {
      if (!username || !password) return false;
      try {
        const resp = await fetch('/auth/verify', {
          method: 'GET',
          headers: { 'Authorization': 'Basic ' + btoa(username + ':' + password) },
        });
        if (resp.ok) {
          const hash = await sha256(password);
          const secure = location.protocol === 'https:' ? '; Secure' : '';
          document.cookie = 'mc_oc=' + hash + '; path=/; SameSite=Lax; max-age=86400' + secure;
          sessionStorage.setItem('mc-auth', '1');
          // Store password for OpenClaw WebSocket auth. Also persisted in
          // sessionStorage by the client itself so iOS page reloads survive.
          if (window.openclawClient) window.openclawClient._password = password;
          try { sessionStorage.setItem('mc-oc-pw', password); } catch {}
          this.ok = true;
          mcAudio.unlock();
          Alpine.store('app').boot();
          return true;
        }
      } catch {}
      return false;
    },

    logout() {
      sessionStorage.removeItem('mc-auth');
      sessionStorage.removeItem('mc-oc-pw');
      document.cookie = 'mc_oc=; path=/; max-age=0';
      this.ok = false;

      // Stop health checker polling to prevent leaked intervals
      healthChecker.stop();

      // Stop workflow bridge polling
      if (window.workflowBridge) window.workflowBridge.stopPolling();

      // Stop staging and activity polling
      if (Alpine.store('staging')) Alpine.store('staging').stopPolling();
      if (Alpine.store('activity')) Alpine.store('activity').stopPolling();

      // Stop last-active timer
      const appStore = Alpine.store('app');
      if (appStore?._lastActiveTimer) {
        clearInterval(appStore._lastActiveTimer);
        appStore._lastActiveTimer = null;
      }

      // Stop workflow auto-save timer
      const wfStore = Alpine.store('workflows');
      if (wfStore?._autoSaveTimer) {
        clearInterval(wfStore._autoSaveTimer);
        wfStore._autoSaveTimer = null;
      }

      // Disconnect the OpenClaw WebSocket to prevent leaked sockets.
      // Without this, logging back in opens a second socket and re-registers
      // event handlers, causing duplicated deltas/completions.
      if (window.openclawClient) {
        window.openclawClient.disconnect();
        window.openclawClient._mcEventsRegistered = false;
      }
    },

    // Wipe all mc-* localStorage + settings, but preserve login session
    resetLocalState() {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('mc-')) keysToRemove.push(key);
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      location.reload();
    },

    // Wipe all browser-side state (agents, sessions, messages, governance, workflows)
    // Server-side state (OpenClaw conversations) requires separate Docker volume reset
    factoryReset() {
      // Collect all mc-* keys from localStorage
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('mc-')) keysToRemove.push(key);
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));

      // Clear session
      sessionStorage.removeItem('mc-auth');
      document.cookie = 'mc_oc=; path=/; max-age=0';

      // Force full page reload to reinitialize everything from defaults
      location.reload();
    },
  });

  // --------------------------------------------------------------------------
  // STORE: APP (global state)
  // --------------------------------------------------------------------------

  Alpine.store('app', {
    view: 'dashboard',
    booting: true,
    sidebarOpen: window.innerWidth >= 768,
    mobile: window.innerWidth < 768,
    chatPanelOpen: false,  // mobile: toggleable session list
    workflowPanelOpen: false, // mobile: toggleable node palette
    connected: false,     // true if LiteLLM is reachable (chat works)
    ocConnected: false,   // true if OpenClaw is reachable
    demoMode: true,       // false when LiteLLM is reachable
    awayReport: null,     // populated on boot if agents worked while you were away
    stagingPanelOpen: false, // mobile: toggleable staging panel
    _reconnecting: false, // guard against concurrent reconnect attempts
    _booted: false,       // guard against boot() being called twice
    // Live event feed for chat transparency
    lastEvent: '',        // human-readable last event description
    lastEventTime: 0,     // timestamp of last event
    chatEvents: [],       // recent chat-relevant events (max 50)
    showEventFeed: false,  // toggle for event feed panel in chat view

    init() {
      // Listen for screen resize to update mobile state
      const mq = window.matchMedia('(max-width: 767px)');
      const update = (e) => {
        this.mobile = e.matches;
        if (!e.matches) {
          // Switching to desktop: open sidebar, close mobile panels
          this.sidebarOpen = true;
          this.chatPanelOpen = false;
          this.workflowPanelOpen = false;
        } else {
          // Switching to mobile: close sidebar
          this.sidebarOpen = false;
        }
      };
      mq.addEventListener('change', update);
    },

    pushChatEvent(level, msg) {
      const ev = { time: timeNow(), level, msg };
      this.chatEvents.unshift(ev);
      if (this.chatEvents.length > 50) this.chatEvents.length = 50;
      this.lastEvent = msg;
      this.lastEventTime = Date.now();
    },

    setView(v) {
      this.view = v;
      // Close sidebar on mobile after navigation
      if (this.mobile) this.sidebarOpen = false;
      // Reset panel states on view change
      this.chatPanelOpen = false;
      this.workflowPanelOpen = false;
      this.stagingPanelOpen = false;
      if (v === 'workflows' && window.initWorkflowCanvas) {
        setTimeout(() => window.initWorkflowCanvas(), 100);
      }
    },

    async boot() {
      // Prevent double-boot (login triggers boot + Alpine init triggers boot if auth.ok)
      if (this._booted) return;
      this._booted = true;
      await new Promise(r => setTimeout(r, 1000));
      this.booting = false;

      const monitor = Alpine.store('monitor');

      // Initial health check + model fetch
      const health = await healthChecker.check();
      this._applyHealth(health);

      // Fetch models from LiteLLM
      if (health.litellm) {
        const models = await litellmApi.fetchModels();
        if (models.length > 0) {
          Alpine.store('models').list = models;
          monitor.systemHealth.modelsAvailable = models.length;
          monitor.addLog('info', `Loaded ${models.length} models from LiteLLM`);
        }
      }

      // Attempt OpenClaw WebSocket connection
      if (health.openclaw && window.openclawClient) {
        monitor.addLog('info', 'Connecting to OpenClaw...');
        try {
          // Use in-memory password, falling back to sessionStorage (survives iOS reloads)
          const pw = window.openclawClient._password
            || (() => { try { return sessionStorage.getItem('mc-oc-pw') || ''; } catch { return ''; } })();
          if (pw) {
            await window.openclawClient.connect(pw);
            ocMode = 'connected';
            this.ocConnected = true;
            monitor.addLog('info', 'OpenClaw WebSocket connected — agents are live');

            // Load real agents, sessions, and cron jobs from OpenClaw
            await this._syncAgentsFromOpenClaw();
            await this._syncSessionsFromOpenClaw();
            Alpine.store('cron').fetch();

            // Listen for real-time events
            this._setupOpenClawEvents();
          } else {
            monitor.addLog('warn', 'No password available for OpenClaw — using local mode');
            ocMode = 'fallback';
          }
        } catch (err) {
          console.warn('[Boot] OpenClaw WebSocket failed, using fallback:', err.message);
          monitor.addLog('warn', `OpenClaw WebSocket: ${err.message} — using local mode`);
          ocMode = 'fallback';
        }
      }

      // Start workflow bridge polling (agent-to-workflow sync)
      if (window.workflowBridge) {
        window.workflowBridge.startPolling(15000);
      }

      // Resume workflow auto-save if a workflow was active before reload
      const wfStore = Alpine.store('workflows');
      if (wfStore.activeId) {
        wfStore.setupAutoSave();
      }

      // Start activity polling (server-side agent events)
      if (Alpine.store('activity')) {
        Alpine.store('activity').startPolling(15000);
      }

      // Start staging environment polling
      if (Alpine.store('staging')) {
        Alpine.store('staging').startPolling(15000);
      }

      // Track last active timestamp for away-report (localStorage persists across sessions)
      localStorage.setItem('mc-last-active', Date.now().toString());
      this._lastActiveTimer = setInterval(() => {
        localStorage.setItem('mc-last-active', Date.now().toString());
      }, 60000);

      // Visibility change: sync active chat history when user returns to tab.
      // This is the PRIMARY recovery mechanism for iOS PWA (tab gets suspended,
      // WS dies, agent finishes work) — when the user taps back into the app,
      // we immediately fetch the latest state from the server.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          const sessions = Alpine.store('sessions');
          if (sessions._activeSessionKey) {
            // Small delay to let WS reconnect first (OpenClawClient handles its own reconnect)
            setTimeout(() => {
              sessions._syncActiveSessionHistory('visibility');
            }, 1500);
          }
        }
      });

      // Also on focus (catches iOS cases where visibilitychange doesn't fire)
      window.addEventListener('focus', () => {
        const sessions = Alpine.store('sessions');
        if (sessions._activeSessionKey) {
          setTimeout(() => {
            sessions._syncActiveSessionHistory('focus');
          }, 2000);
        }
      });

      // Start adaptive health polling: faster when disconnected (15s), slower when stable (45s)
      const pollInterval = (this.connected && this.ocConnected) ? 45000 : 15000;
      healthChecker.startPolling(h => {
        this._applyHealth(h);
        // Adjust poll interval based on connection state
        if (h.litellm && h.openclaw && healthChecker._interval) {
          clearInterval(healthChecker._interval);
          healthChecker._interval = setInterval(() => healthChecker.check().then(hh => this._applyHealth(hh)), 45000);
        }
      }, pollInterval);
    },

    async _syncAgentsFromOpenClaw() {
      try {
        const agents = await window.openclawClient.listAgents();
        if (agents && agents.length > 0) {
          const agentStore = Alpine.store('agents');
          agentStore.list = agents.map(a => ({
            id: a.id || a.agentId,
            name: a.name || a.id || 'Agent',
            emoji: a.emoji || a.avatar || '🤖',
            description: a.description || a.identity?.description || '',
            model: a.model?.primary || (typeof a.model === 'string' ? a.model : null)
              || (DEMO_AGENTS.find(d => d.id === (a.id || a.agentId))?.model)
              || 'litellm/cerebras-llama-3.3-70b',
            status: a.status || 'idle',
            currentTask: a.currentTask || null,
            lastActive: a.lastActive || 'Unknown',
            tasksCompleted: a.tasksCompleted || 0,
            tokensUsed: a.tokensUsed || 0,
            tools: a.tools?.allow || [],
            systemPrompt: a.systemPrompt || a.identity?.instructions || '',
            _source: 'openclaw', // mark as server-synced
          }));
          agentStore._persist(); // cache server agents so next load isn't stale
          agentStore.synced = true;
          Alpine.store('monitor').addLog('info', `Synced ${agents.length} agents from OpenClaw`);
        }
      } catch (err) {
        console.warn('[Sync] Agent sync failed:', err.message);
      }
    },

    async _syncSessionsFromOpenClaw() {
      try {
        const sessions = await window.openclawClient.listSessions();
        if (!sessions || sessions.length === 0) return;

        const sessionStore = Alpine.store('sessions');
        const agentStore = Alpine.store('agents');
        // Build a map of existing local sessions by sessionKey for merge
        const localByKey = {};
        for (const ls of sessionStore.list) {
          if (ls.sessionKey) localByKey[ls.sessionKey] = ls;
        }

        const merged = sessions
          // Skip sessions the user deleted — canonical sessions (agent:X:main)
          // persist on the server even after reset/delete, so we filter them here.
          // Also skip heartbeat/cron sessions — but NEVER filter :main sessions,
          // which are the user's primary chat session with each agent. A :main
          // session may inherit displayName "heartbeat" from the initial heartbeat
          // run, but it's still the real chat session.
          .filter(s => {
            const sk = s.key || s.sessionKey || '';
            if (sessionStore._deletedKeys.has(sk)) return false;
            // Never filter main sessions — they are the user's primary chat
            if (/^agent:[^:]+:main$/.test(sk)) return true;
            // Filter non-main heartbeat/cron/system sessions by displayName or label
            const dn = (s.displayName || '').toLowerCase();
            const lb = (s.label || '').toLowerCase();
            if (/heartbeat|cron|system-event/.test(dn) || /heartbeat|cron|system-event/.test(lb)) return false;
            return true;
          })
          .map(s => {
            const sk = s.key || s.sessionKey || '';
            // Parse agentId from key: "agent:<id>:..." or "<id>:main"
            let agentId = '';
            if (sk.startsWith('agent:')) {
              agentId = sk.split(':')[1] || '';
            } else if (sk.includes(':')) {
              agentId = sk.split(':')[0] || '';
            }
            const agent = agentId ? agentStore.list.find(a => a.id === agentId) : null;

            // lastMessagePreview may be string, object, or content blocks array
            const lastMessage = extractMessageText(s.lastMessagePreview);

            // Merge with existing local session to preserve local ID and message cache
            const existing = localByKey[sk];
            if (existing) {
              existing.agentName = agent?.name || s.displayName || existing.agentName;
              existing.agentEmoji = agent?.emoji || existing.agentEmoji;
              existing.title = s.derivedTitle || s.label || existing.title;
              existing.lastMessage = lastMessage || existing.lastMessage;
              existing.updatedAt = s.updatedAt || existing.updatedAt;
              existing._source = 'openclaw';
              delete localByKey[sk]; // mark as matched
              return existing;
            }

            return {
              id: s.sessionId || sk || generateId(),
              sessionKey: sk,
              agentId: agentId,
              agentName: agent?.name || s.displayName || agentId || 'Agent',
              agentEmoji: agent?.emoji || '🤖',
              title: s.derivedTitle || s.label || s.displayName || 'Conversation',
              lastMessage,
              updatedAt: s.updatedAt || Date.now(),
              unread: 0,
              _source: 'openclaw',
            };
          });

        sessionStore.list = merged;
        sessionStore._persist();
        Alpine.store('monitor').addLog('info', `Synced ${sessions.length} sessions from OpenClaw`);
      } catch (err) {
        console.warn('[Sync] Session sync failed:', err.message);
      }
    },

    _setupOpenClawEvents() {
      const oc = window.openclawClient;
      if (!oc) return;

      // Guard against double-registration after logout/login cycle.
      // The disconnect() in logout() closes the socket but the client
      // object persists — re-connecting re-registers handlers on the same
      // instance, causing duplicated event processing.
      if (oc._mcEventsRegistered) return;
      oc._mcEventsRegistered = true;

      // Wildcard listener — log ALL events from OpenClaw for diagnostics
      // AND push structured events to the Activity store for mission control.
      oc.on('*', (eventName, payload) => {
        // Skip noisy periodic events
        if (eventName === 'tick' || eventName === 'health') return;
        const summary = typeof payload === 'object'
          ? (payload.state ? `state=${payload.state}` : '') +
            (payload.sessionKey ? ` session=${payload.sessionKey}` : '') +
            (payload.errorMessage ? ` error=${payload.errorMessage}` : '') +
            (payload.runId ? ` run=${payload.runId}` : '')
          : '';
        Alpine.store('monitor').addLog('info', `Event[${eventName}]: ${summary || JSON.stringify(payload).slice(0, 120)}`);

        // --- Activity store: push structured events for mission control ---
        const activity = Alpine.store('activity');
        // Extract agent ID from sessionKey (agent:lead:main → lead)
        const _agentFromSK = (sk) => {
          if (!sk) return '';
          const m = sk.match(/^agent:([^:]+):/);
          return m ? m[1] : '';
        };
        const agentId = _agentFromSK(payload.sessionKey) || payload.agentId || '';

        if (eventName === 'agent') {
          // Agent turn events — tool calls, state changes, errors
          if (payload.tool) {
            // Tool invocation
            const toolName = payload.tool || 'unknown';
            const isError = payload.status === 'error' || payload.error;
            const isFileOp = /^(read|write|edit)$/.test(toolName);
            const isComms = /^sessions_/.test(toolName);
            activity.pushEvent({
              type: isError ? 'error' : isComms ? 'comms' : isFileOp ? 'file-op' : 'tool',
              level: isError ? 'error' : 'info',
              agent: agentId,
              message: `${agentId || 'Agent'} → ${toolName}${isError ? ' (FAILED)' : ''}`,
              detail: payload.errorMessage || payload.error?.message || '',
            });
          } else if (payload.state === 'error' || payload.error || payload.errorMessage) {
            const errMsg = payload.errorMessage || payload.error?.message || payload.error || 'Unknown error';
            activity.pushEvent({
              type: /rate.?limit/i.test(errMsg) ? 'rate-limit' : 'error',
              level: 'error',
              agent: agentId,
              message: `${agentId || 'Agent'}: ${errMsg.slice(0, 120)}`,
            });
          } else if (payload.state === 'running') {
            // Only log the start of a run, not every state update
            if (!activity._lastRunAgent || activity._lastRunAgent !== agentId) {
              activity._lastRunAgent = agentId;
              activity.pushEvent({
                type: 'system',
                level: 'info',
                agent: agentId,
                message: `${agentId || 'Agent'} started processing`,
              });
            }
          } else if (payload.state === 'done' || payload.state === 'completed' || payload.state === 'idle') {
            activity._lastRunAgent = null;
            activity.pushEvent({
              type: 'task-complete',
              level: 'info',
              agent: agentId,
              message: `${agentId || 'Agent'} finished turn`,
            });
          }
        } else if (eventName === 'chat') {
          const state = payload.state;
          if (state === 'final') {
            activity.pushEvent({
              type: 'chat',
              level: 'info',
              agent: agentId,
              message: `${agentId || 'Agent'} response complete`,
            });
          } else if (state === 'error') {
            const errMsg = payload.errorMessage || 'Chat error';
            activity.pushEvent({
              type: /rate.?limit/i.test(errMsg) ? 'rate-limit' : 'error',
              level: 'error',
              agent: agentId,
              message: `${agentId || 'Agent'}: ${errMsg.slice(0, 120)}`,
            });
          }
          // Skip delta events — too noisy
        }

        // --- Chat event feed (status bar) ---
        const app = Alpine.store('app');
        if (eventName === 'chat') {
          const state = payload.state;
          if (state === 'delta') {
            app.lastEvent = 'Streaming response...';
            app.lastEventTime = Date.now();
          } else if (state === 'final') {
            app.pushChatEvent('ok', 'Agent response complete');
          } else if (state === 'error') {
            app.pushChatEvent('error', payload.errorMessage || 'Agent error');
          } else if (state === 'aborted') {
            app.pushChatEvent('warn', 'Response aborted');
          }
        } else if (eventName === 'agent') {
          if (payload.state === 'error' || payload.error || payload.errorMessage) {
            app.pushChatEvent('error', `Agent turn: ${payload.errorMessage || payload.error || 'failed'}`);
          } else if (payload.state === 'running' || payload.tool) {
            app.pushChatEvent('info', `Agent working${payload.tool ? ': ' + payload.tool : ''}...`);
          }
        }
      });

      // Agent turn events — surface errors from the agent turn itself (model call
      // failures, tool errors, etc.) that may not produce any 'chat' events.
      // Without this, a failed model call results in dead silence in the UI.
      oc.on('agent', (payload) => {
        const sessions = Alpine.store('sessions');
        // Track that the active run is still alive (used by rate-limit retry logic)
        if (payload.run === sessions._activeRunId || payload.runId === sessions._activeRunId) {
          sessions._lastAgentEventTime = Date.now();

          // Detect run completion during rate-limit recovery: if agent events carry
          // a "done"/"completed"/"idle" state, the run finished server-side. Fetch
          // chat history to recover the response that was never streamed to us.
          // Skip if Route 2 fallback is already active — it's handling the response.
          if (sessions._rateLimitRetried && !sessions._route2Active && sessions._streamingMsg
              && (payload.state === 'done' || payload.state === 'completed' || payload.state === 'idle')) {
            Alpine.store('monitor').addLog('info', `Agent run ${payload.state} during rate-limit recovery — fetching history`);
            const sk = sessions._activeSessionKey;
            if (sk && window.openclawClient?.authenticated) {
              (async () => {
                try {
                  const history = await window.openclawClient.getHistory(sk);
                  if (Array.isArray(history) && history.length > 0) {
                    const lastAssistant = [...history].reverse().find(m =>
                      m.role === 'assistant' || m.role === 'agent'
                    );
                    if (lastAssistant && sessions._streamingMsg) {
                      const recovered = extractMessageText(lastAssistant.content);
                      if (recovered && recovered.length > 10) {
                        sessions._streamingMsg.content = recovered;
                        sessions._streamingMsg.streaming = false;
                        sessions._resetSendingState();
                        sessions._persistMessages();
                        Alpine.store('monitor').addLog('info', 'Recovered response from history after agent run completed');
                        Alpine.store('app').pushChatEvent('ok', 'Response recovered from server');
                      }
                    }
                  }
                } catch (e) {
                  Alpine.store('monitor').addLog('warn', `History fetch on run completion failed: ${e.message}`);
                }
              })();
            }
          }
        }
        // Check if the agent event carries an error state
        if (payload.state === 'error' || payload.error || payload.errorMessage) {
          const errMsg = payload.errorMessage || payload.error?.message || payload.error || 'Agent turn failed (no details)';
          Alpine.store('monitor').addLog('error', `Agent turn error: ${errMsg}`);
          // During rate-limit recovery or Route 2 fallback, agent errors from intermediate
          // model calls are expected — but if the run is ENDING, surface it.
          if (sessions._rateLimitRetried || sessions._route2Active) {
            // Check if this is a terminal agent error (run finished with failure)
            const isTerminal = payload.state === 'error' || payload.state === 'failed' || payload.state === 'done';
            if (!isTerminal) return;
            // Terminal — fall through to surface the error and clean up
            Alpine.store('monitor').addLog('warn', 'Agent run ended during rate-limit recovery — surfacing error');
            sessions._rateLimitRetried = false;
            sessions._route1Retried = false;
            sessions._rateLimitCount = 0;
            sessions._rateLimitRecoveryStart = 0;
            clearTimeout(sessions._rateLimitRecoveryTimer);
          }
          // Surface the error in the chat UI if we're waiting for a response
          if (sessions._sending && sessions._streamingMsg) {
            sessions._streamingMsg.content = `Error: ${errMsg}`;
            sessions._streamingMsg.streaming = false;
            sessions._streamingMsg = null;
            sessions._sending = false;
            sessions._sendingSessionId = null;
            sessions._stopResponsePolling();
            sessions._persistMessages();
          }
        }
      });

      // Chat streaming events — OpenClaw sends event name 'chat' with a 'state' field:
      // state: "delta" (streaming content), "final" (complete), "aborted", "error"
      // payload.message contains the content object, payload.errorMessage for errors
      oc.on('chat', (payload) => {
        const sessions = Alpine.store('sessions');
        const state = payload.state;

        // Skip heartbeat/cron/bootstrap events — these are internal OpenClaw
        // housekeeping that should never appear in the chat UI.
        // Must match ALL patterns from _parseHistoryMessages isSystemInjection/isSystemReply.
        if (payload.label && /heartbeat|cron|system|bridge|staging/i.test(payload.label)) return;
        const _peekContent = extractMessageText(payload.message);
        if (_peekContent && (
          /^#?\s*Read HEARTBEAT/i.test(_peekContent) ||
          /^#?\s*HEARTBEAT/i.test(_peekContent) ||
          /^HEARTBEAT_OK/i.test(_peekContent) ||
          /^#?\s*Bootstrap/i.test(_peekContent) ||
          /^EXECUTE_WORKFLOW:/i.test(_peekContent) ||
          /^WRITE_FILES:/i.test(_peekContent) ||
          /^WORKFLOW_RESULT:/i.test(_peekContent) ||
          /^STAGING_APPROVED:/i.test(_peekContent) ||
          /^STAGING_REJECTED:/i.test(_peekContent) ||
          /^FILES_WRITTEN:/i.test(_peekContent) ||
          /^Current time:/i.test(_peekContent)
        )) return;

        // Debug: log payload structure for diagnosing empty responses
        if (state === 'delta' || state === 'final') {
          const extracted = extractMessageText(payload.message);
          const preview = extracted ? extracted.slice(0, 80) : '(empty)';
          // Log raw payload keys and message shape for first 5 events per run to diagnose format issues
          if (!this._chatDebugCount) this._chatDebugCount = 0;
          if (this._chatDebugCount < 5 || state === 'final') {
            this._chatDebugCount++;
            const payloadKeys = Object.keys(payload).join(',');
            const msgShape = payload.message == null ? 'null'
              : typeof payload.message === 'string' ? `str(${payload.message.length})`
              : Array.isArray(payload.message) ? `arr(${payload.message.length})`
              : `obj{${Object.keys(payload.message).join(',')}}`;
            Alpine.store('monitor').addLog('debug', `Chat ${state}: shape=${msgShape} keys=[${payloadKeys}] extracted="${preview}" run=${payload.runId || 'n/a'}`);
            // Deep log first 2 events to show exact structure
            if (this._chatDebugCount <= 2) {
              try {
                const safePayload = JSON.stringify(payload, null, 0).slice(0, 500);
                Alpine.store('monitor').addLog('debug', `Chat raw: ${safePayload}`);
              } catch {}
            }
          }
        }

        // Bug #32579: Gateway broadcasts ALL chat events to ALL connected
        // WebSocket clients. Filter by sessionKey to only process events
        // for the active chat session (or events without a sessionKey for
        // backward compatibility).
        if (payload.sessionKey && sessions._activeSessionKey
            && payload.sessionKey !== sessions._activeSessionKey) {
          Alpine.store('monitor').addLog('info', `Chat event filtered: session=${payload.sessionKey} (active=${sessions._activeSessionKey})`);
          return; // Not for our active session — ignore
        }

        // Filter by runId: only process events from our active run or retry run.
        // This prevents competing/stale runs (e.g., duplicate retry) from clobbering
        // the streaming state with empty finals.
        if (payload.runId) {
          if (sessions._activeRunId) {
            const isOurRun = payload.runId === sessions._activeRunId
              || payload.runId === sessions._retryRunId;
            if (!isOurRun) {
              Alpine.store('monitor').addLog('info', `Chat event filtered: run=${payload.runId} (active=${sessions._activeRunId}, retry=${sessions._retryRunId || 'none'})`);
              return;
            }
          } else if (!sessions._sending) {
            // Not actively waiting for a response and no tracked runId — skip stale events
            return;
          }
        }

        if (state === 'delta') {
          // Extract text from all possible payload locations
          let delta = extractMessageText(payload.message)
            || extractMessageText(payload.content)
            || extractMessageText(payload.delta)
            || extractMessageText(payload.text)
            || '';

          // Suppress OpenClaw "(no output)" placeholder from tool-only turns
          if (/^\(no output\)$/i.test(delta.trim())) delta = '';

          // Streaming content delta
          if (sessions._streamingMsg) {
            // If content is a retry/processing indicator, clear it before appending real content
            const cur = sessions._streamingMsg.content;
            if (delta && isPlaceholder(cur)) {
              sessions._streamingMsg.content = delta;
            } else {
              sessions._streamingMsg.content += delta;
            }
            sessions._scrollToBottom();
          } else if (sessions.messages.length > 0 && sessions._sending) {
            // Recovery: _streamingMsg was cleared (by error handler, timeout, or
            // rate-limit retry) but new deltas are arriving (model fallback, late
            // response, or retry run). Find or create a message to receive them.
            // Guard: only recover if _sending is still true — prevents zombie
            // deltas from reviving _streamingMsg after the safety timer cleared it.
            const lastMsg = sessions.messages[sessions.messages.length - 1];
            if (lastMsg?.role === 'agent') {
              // Strip error/placeholder prefix if the fallback is now succeeding
              if (isPlaceholder(lastMsg.content) || lastMsg.content.startsWith('[Agent completed') || lastMsg.content.startsWith('Error:')) {
                lastMsg.content = '';
              }
              lastMsg.streaming = true;
              sessions._streamingMsg = lastMsg;
              lastMsg.content += delta;
              sessions._scrollToBottom();
              Alpine.store('monitor').addLog('info', 'Recovered streaming on late delta event');
            }
          }
          return;
        }

        if (state === 'final') {
          // Chat complete — handle both normal flow and late arrivals after timeout
          let streamMsg = sessions._streamingMsg;

          // If _streamingMsg was cleared (e.g., by rate-limit retry or timeout), recover
          // by finding the last agent message that's still marked as streaming.
          if (!streamMsg) {
            const lastAgent = [...sessions.messages].reverse().find(m => m.role === 'agent' && (m.streaming || !m.content?.trim()));
            if (lastAgent) {
              streamMsg = lastAgent;
              Alpine.store('monitor').addLog('info', 'Recovered orphaned streaming message on final event');
            }
          }

          let producedContent = false;
          if (streamMsg) {
            // Strip processing/retry indicators if present
            if (isPlaceholder(streamMsg.content)) {
              streamMsg.content = '';
            }

            // Try extracting final content from ALL possible payload fields
            const finalContent = extractMessageText(payload.message)
              || extractMessageText(payload.content)
              || extractMessageText(payload.result)
              || extractMessageText(payload.text)
              || '';
            if (finalContent && !streamMsg.content.endsWith(finalContent)) {
              streamMsg.content += finalContent;
            }

            // If streaming produced no visible text, do a full history sync from the server.
            // This handles tool-only agent turns where deltas contain only tool_use/tool_result
            // blocks (which extractMessageText filters out). The server history returns tool
            // outputs as separate plain-text messages that _parseHistoryMessages renders correctly.
            if (!streamMsg.content.trim() && payload.sessionKey && window.openclawClient?.authenticated) {
              const _historyMsg = streamMsg; // capture for async
              Alpine.store('monitor').addLog('info', 'No content captured from stream — syncing full history...');
              _historyMsg.content = '...';
              (async () => {
                try {
                  const history = await window.openclawClient.getHistory(payload.sessionKey);
                  if (Array.isArray(history) && history.length > 0) {
                    const serverMessages = sessions._parseHistoryMessages(history);
                    if (serverMessages.length > 0) {
                      // Full history replacement — same as what refresh/_syncActiveSessionHistory does
                      sessions.messages = serverMessages;
                      sessions._messageStore[sessions.activeId] = sessions.messages;
                      sessions._persistMessages();
                      sessions._scrollToBottom();
                      Alpine.store('monitor').addLog('info', `Recovered ${serverMessages.length} messages from full history sync`);
                      Alpine.store('app').pushChatEvent('ok', 'Response received');
                      mcAudio.chatComplete();
                      return;
                    }
                  }
                  // History fetch found nothing — show system note
                  _historyMsg.content = '[Agent completed task with no text response.]';
                  _historyMsg._systemNote = true;
                  _historyMsg.streaming = false;
                  _historyMsg.time = timeNow();
                  sessions._persistMessages();
                } catch (e) {
                  Alpine.store('monitor').addLog('warn', `History fetch failed: ${e.message}`);
                  _historyMsg.content = '[Response not captured — try sending again.]';
                  _historyMsg._systemNote = true;
                  _historyMsg.streaming = false;
                  _historyMsg.time = timeNow();
                  sessions._persistMessages();
                }
              })();
              // Don't block — async history fetch will update the message
              producedContent = false;
            } else if (!streamMsg.content.trim()) {
              streamMsg.content = '[Agent completed task with no text response.]';
              streamMsg.streaming = false;
              streamMsg.time = timeNow();
              streamMsg._systemNote = true;
              producedContent = false;
            } else {
              streamMsg.streaming = false;
              streamMsg.time = timeNow();
              producedContent = true;
            }
            sessions._streamingMsg = null;
          }
          sessions._resetSendingState();

          // Notify user that response arrived (important for iOS PWA in background)
          if (producedContent) mcAudio.chatComplete();

          // Update session metadata
          const session = sessions.active;
          if (session) {
            const lastMsg = sessions.messages.filter(m => m.role === 'agent' && m.content?.trim()).pop();
            session.lastMessage = (lastMsg?.content || '').slice(0, 60);
            session.updatedAt = Date.now();
          }

          // Update agent stats + governance metrics — only count if THIS turn
          // produced visible content (not a previous message in the history).
          const agent = Alpine.store('agents').list.find(a => a.id === session?.agentId);
          if (agent && producedContent) {
            agent.tasksCompleted++;
            agent.lastActive = 'Just now';
            Alpine.store('agents')._persist();

            const tokens = payload.usage?.total_tokens
              || (payload.usage ? (payload.usage.input_tokens || 0) + (payload.usage.output_tokens || 0) : 0)
              || Math.round(((streamMsg?.content || '').length) / 4);
            const responseTimeMs = sessions._chatSendTime ? Date.now() - sessions._chatSendTime : 0;
            Alpine.store('governance').recordTask(agent.id, {
              success: true, tokens, responseTimeMs, taskType: 'chat-openclaw',
            });
          }

          // Check for governance self-tuning proposals from agents
          const lastMsgContent = sessions.messages[sessions.messages.length - 1]?.content || '';
          if (lastMsgContent.includes('GOVERNANCE_ADJUST:')) {
            try {
              const match = lastMsgContent.match(/GOVERNANCE_ADJUST:\s*(\{[\s\S]*?\})/);
              if (match) {
                const adjustment = JSON.parse(match[1]);
                const staging = Alpine.store('staging');
                if (staging) {
                  staging.items.push({
                    id: 'gov-' + Date.now(),
                    name: 'Governance Adjustment',
                    path: '',
                    type: 'config',
                    createdBy: session?.agentId || 'lead',
                    createdAt: Date.now(),
                    description: `Agent suggests: ${JSON.stringify(adjustment)}`,
                    status: 'pending',
                    previewUrl: '',
                    _data: adjustment,
                  });
                  Alpine.store('monitor').addLog('info',
                    'Agent proposed governance adjustment (pending approval in Staging)'
                  );
                }
              }
            } catch {}
          }

          sessions._persistMessages();
          sessions._persist();
          return;
        }

        if (state === 'error' || state === 'aborted') {
          // Chat error or aborted
          const rawErr = extractMessageText(payload.errorMessage) || extractMessageText(payload.message) || 'Unknown error';
          const isRateLimit = /rate.?limit|429|too many|quota/i.test(rawErr);

          // Rate limit handling: OpenClaw agent run failed because the LLM provider
          // returned 429. Strategy:
          //   1st hit: Wait 8s for LiteLLM's server-side fallback chain (preserves tools)
          //   2nd hit: Retry via OpenClaw (new chat.send — may hit different provider)
          //   3rd hit: Fall back to Route 2 (direct LiteLLM, no tools)
          if (isRateLimit && sessions._streamingMsg) {
            sessions._rateLimitCount = (sessions._rateLimitCount || 0) + 1;
            Alpine.store('monitor').addLog('warn', `Rate limit #${sessions._rateLimitCount} from OpenClaw`);
            Alpine.store('app').pushChatEvent('warn', '⚠️ API rate limit reached. Please try again');

            // 1st rate limit: give LiteLLM's server-side fallback chain time to cascade.
            // Server-side fallbacks (e.g. cerebras-zai-glm → gemini-pro → cerebras-gpt-oss-120b
            // → groq-llama-3.3-70b → deepseek-chat) preserve full tool access.
            if (sessions._rateLimitCount === 1 && !sessions._rateLimitRetried) {
              sessions._rateLimitRetried = true;
              sessions._streamingMsg.content = '...';
              Alpine.store('monitor').addLog('info', 'Rate limit #1 — giving OpenClaw 8s to recover via LiteLLM fallback chain');

              sessions._rateLimitRecoveryTimer = setTimeout(() => {
                if (sessions._streamingMsg && isPlaceholder(sessions._streamingMsg.content)) {
                  const lastUserMsg = [...sessions.messages].reverse().find(m => m.role === 'user');
                  if (lastUserMsg) {
                    Alpine.store('monitor').addLog('info', 'No recovery after 8s — retrying via OpenClaw');
                    // Retry via OpenClaw (Route 1 retry) — preserves tool access
                    sessions._retryViaOpenclaw(sessions._streamingMsg, lastUserMsg.content);
                  }
                }
              }, 8000);
              return;
            }

            // 2nd rate limit: retry via OpenClaw one more time (new request may hit
            // a different LiteLLM deployment). Still preserves tool access.
            if (sessions._rateLimitCount === 2 && !sessions._route1Retried) {
              sessions._route1Retried = true;
              clearTimeout(sessions._rateLimitRecoveryTimer);
              sessions._streamingMsg.content = '...';
              Alpine.store('monitor').addLog('info', 'Rate limit #2 — retrying via OpenClaw (Route 1)');
              const lastUserMsg = [...sessions.messages].reverse().find(m => m.role === 'user');
              if (lastUserMsg) {
                sessions._retryViaOpenclaw(sessions._streamingMsg, lastUserMsg.content);
              }
              return;
            }

            // 3rd+ rate limit: fall back to Route 2 (direct LiteLLM, no tools)
            clearTimeout(sessions._rateLimitRecoveryTimer);
            const lastUserMsg = [...sessions.messages].reverse().find(m => m.role === 'user');
            if (lastUserMsg && !sessions._route2Active) {
              Alpine.store('monitor').addLog('info', 'Rate limit #3+ — falling back to Route 2 (no tools)');
              sessions._fallbackToRoute2(sessions._streamingMsg, lastUserMsg.content);
              return;
            }

            // Route 2 already active or no user message — fall through to terminal error
          }

          if (sessions._streamingMsg) {
            let errText = rawErr;
            if (isRateLimit) {
              errText = 'Rate limit reached on all providers. Please try again in a minute.';
            }
            // Clean up verbose LiteLLM error messages for display
            if (/litellm\.(NotFound|BadRequest)Error/i.test(errText)) {
              const match = errText.match(/(?:Model|Provider)\s+\S+\s+(?:does not exist|not found)/i);
              errText = match ? match[0] + ' — falling back to next provider' : errText.slice(0, 200);
            }
            let prior = sessions._streamingMsg.content.trim();
            if (isPlaceholder(prior)) prior = '';
            const prefix = prior ? '\n\n' : '';
            sessions._streamingMsg.content = prior + prefix + errText;
            sessions._streamingMsg._systemNote = true;
            sessions._streamingMsg.streaming = false;
            sessions._streamingMsg = null;
          }
          sessions._resetSendingState();
          sessions._persistMessages();

          const session = sessions.active;
          const agent = Alpine.store('agents').list.find(a => a.id === session?.agentId);
          if (agent) {
            const responseTimeMs = sessions._chatSendTime ? Date.now() - sessions._chatSendTime : 0;
            Alpine.store('governance').recordTask(agent.id, {
              success: false, responseTimeMs, taskType: 'chat-openclaw',
            });
          }

          Alpine.store('monitor').addLog('error', `Chat ${state}: ${payload.errorMessage || 'Unknown error'}`);
          return;
        }
      });

      // Connection state tracking — 'connected' fires on EVERY successful auth
      // (initial connect + reconnects), ensuring the status indicator stays in sync.
      oc.on('connected', () => {
        this.ocConnected = true;
        ocMode = 'connected';
        this.pushChatEvent('ok', 'Connected to OpenClaw');
      });

      oc.on('disconnect', (payload) => {
        const msg = payload.code ? `OpenClaw WS disconnected (code: ${payload.code})` : 'OpenClaw WS disconnected';
        Alpine.store('monitor').addLog('warn', msg);
        this.ocConnected = false;
        ocMode = 'fallback';
        this.pushChatEvent('error', msg);
      });

      oc.on('reconnect', () => {
        Alpine.store('monitor').addLog('info', 'OpenClaw WebSocket reconnected — agents are live');
        this.ocConnected = true;
        ocMode = 'connected';
        this.pushChatEvent('ok', 'Reconnected to OpenClaw');
        this._syncAgentsFromOpenClaw();
        this._syncSessionsFromOpenClaw();
        Alpine.store('cron').fetch();
        // Resume active chat: fetch latest messages from server.
        // This catches responses the agent sent while we were disconnected.
        Alpine.store('sessions')._syncActiveSessionHistory('reconnect');
      });
    },

    _applyHealth(health) {
      this.connected = health.litellm;
      // ocConnected reflects actual WebSocket auth state, not just HTTP health
      this.ocConnected = window.openclawClient?.authenticated || false;
      this.demoMode = !health.litellm;

      const monitor = Alpine.store('monitor');
      monitor.systemHealth.litellm = health.litellm ? 'healthy' : 'offline';
      monitor.systemHealth.openclaw = health.openclaw ? 'healthy' : 'offline';

      // Auto-connect WS when OpenClaw HTTP is healthy but WS isn't connected.
      // This handles the post-deploy case where OpenClaw wasn't ready at boot.
      // reconnect() has its own _reconnecting guard so this is safe to call.
      if (health.openclaw && !this.ocConnected && !this._reconnecting) {
        const pw = window.openclawClient?._password
          || (() => { try { return sessionStorage.getItem('mc-oc-pw') || ''; } catch { return ''; } })();
        if (pw) {
          this.reconnect();
        }
      }
    },

    async reconnect() {
      // Guard against concurrent reconnect calls (health poller + user tap + auto-retry)
      if (this._reconnecting) return;
      this._reconnecting = true;

      try {
        Alpine.store('monitor').addLog('info', 'Running health checks...');
        const health = await healthChecker.check();
        // Update health state directly (NOT via _applyHealth to avoid re-entrancy)
        this.connected = health.litellm;
        this.demoMode = !health.litellm;
        const monitor = Alpine.store('monitor');
        monitor.systemHealth.litellm = health.litellm ? 'healthy' : 'offline';
        monitor.systemHealth.openclaw = health.openclaw ? 'healthy' : 'offline';

        if (health.litellm) {
          monitor.addLog('info', 'LiteLLM connected — chat is live');
          const models = await litellmApi.fetchModels();
          if (models.length > 0) {
            Alpine.store('models').list = models;
            monitor.systemHealth.modelsAvailable = models.length;
          }
        } else {
          monitor.addLog('warn', 'LiteLLM unreachable — staying in demo mode');
        }

        if (health.openclaw) {
          monitor.addLog('info', 'OpenClaw is online');
          // Attempt WebSocket reconnect if not already connected
          if (ocMode !== 'connected' && window.openclawClient && !window.openclawClient.authenticated) {
            try {
              const pw = window.openclawClient._password
                || (() => { try { return sessionStorage.getItem('mc-oc-pw') || ''; } catch { return ''; } })();
              if (pw) {
                await window.openclawClient.connect(pw, { maxRetries: 1 });
                ocMode = 'connected';
                this.ocConnected = true;
                monitor.addLog('info', 'OpenClaw WebSocket reconnected — agents are live');
                await this._syncAgentsFromOpenClaw();
                await this._syncSessionsFromOpenClaw();
                this._setupOpenClawEvents();
              } else {
                monitor.addLog('warn', 'No password for OpenClaw reconnect — re-login required');
              }
            } catch (err) {
              monitor.addLog('warn', `OpenClaw WS: ${err.message}`);
            }
          }
        }
        // Update ocConnected based on actual auth state after attempt
        this.ocConnected = window.openclawClient?.authenticated || false;
      } finally {
        this._reconnecting = false;
      }
    },
  });

  // --------------------------------------------------------------------------
  // STORE: MODELS (dynamic from LiteLLM)
  // --------------------------------------------------------------------------

  Alpine.store('models', {
    list: [...FALLBACK_MODELS],
  });

  // --------------------------------------------------------------------------
  // STORE: AGENTS
  // --------------------------------------------------------------------------

  Alpine.store('agents', {
    list: storage.load('agents', [...DEMO_AGENTS]),
    synced: false, // true after OpenClaw live agents replace local cache
    selected: null,
    wizardOpen: false,
    wizardStep: 1,
    wizard: {
      name: '', emoji: '🤖', description: '',
      model: 'litellm/cerebras-zai-glm', systemPrompt: '', tools: [],
    },

    // Count agents with active cron jobs (replaces old running/idle UI-only toggle)
    get scheduled() {
      const cronStore = Alpine.store('cron');
      return this.list.filter(a => cronStore.countForAgent(a.id) > 0).length;
    },
    get running() { return this.scheduled; }, // backward compat for status bar
    get idle() { return this.list.length - this.scheduled; },

    _persist() { storage.save('agents', this.list); },

    openWizard() {
      this.wizard = {
        name: '', emoji: '🤖', description: '',
        model: 'litellm/cerebras-zai-glm', systemPrompt: '', tools: [],
      };
      this.wizardStep = 1;
      this.wizardOpen = true;
    },

    closeWizard() { this.wizardOpen = false; },
    nextStep() { if (this.wizardStep < 4) this.wizardStep++; },
    prevStep() { if (this.wizardStep > 1) this.wizardStep--; },

    toggleTool(toolId) {
      const idx = this.wizard.tools.indexOf(toolId);
      if (idx >= 0) this.wizard.tools.splice(idx, 1);
      else this.wizard.tools.push(toolId);
    },

    async createAgent() {
      const w = this.wizard;
      if (!w.name.trim()) return;

      const agentId = w.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const agent = {
        id: agentId || generateId(),
        name: w.name.trim(),
        emoji: w.emoji,
        description: w.description.trim(),
        model: w.model,
        systemPrompt: w.systemPrompt,
        tools: [...w.tools],
        status: 'idle',
        currentTask: null,
        lastActive: 'Just now',
        tasksCompleted: 0,
        tokensUsed: 0,
      };

      // If connected to OpenClaw, create agent on the server
      if (ocMode === 'connected' && window.openclawClient?.authenticated) {
        try {
          await window.openclawClient.addAgent({
            id: agent.id,
            workspace: agent.name,
            model: { primary: agent.model },
            identity: {
              name: agent.name,
              emoji: agent.emoji,
              description: agent.description,
            },
            tools: agent.tools.length > 0 ? { allow: agent.tools } : undefined,
          });
          agent._source = 'openclaw';
          Alpine.store('monitor').addLog('info', `Agent "${agent.name}" created on OpenClaw server`);
        } catch (err) {
          Alpine.store('monitor').addLog('warn', `OpenClaw create failed: ${err.message} — saving locally`);
        }
      }

      this.list.push(agent);
      this._persist();
      this.closeWizard();
      Alpine.store('monitor').addLog('info', `Agent "${agent.name}" created with model ${agent.model}`);
    },

    selectAgent(id) {
      this.selected = this.list.find(a => a.id === id) || null;
    },

    async deleteAgent(id) {
      // Delete from OpenClaw server if connected
      if (ocMode === 'connected' && window.openclawClient?.authenticated) {
        try {
          await window.openclawClient.deleteAgent(id);
          Alpine.store('monitor').addLog('info', 'Agent removed from OpenClaw server');
        } catch (err) {
          Alpine.store('monitor').addLog('warn', `OpenClaw delete failed: ${err.message}`);
        }
      }

      this.list = this.list.filter(a => a.id !== id);
      if (this.selected && this.selected.id === id) this.selected = null;
      this._persist();
      Alpine.store('monitor').addLog('info', 'Agent removed');
    },

    toggleAgent(id) {
      // Legacy method — now opens the cron popover for this agent
      Alpine.store('cron').toggle(id);
    },
  });

  // --------------------------------------------------------------------------
  // STORE: SESSIONS (Chat with real LiteLLM streaming)
  // --------------------------------------------------------------------------

  Alpine.store('sessions', {
    list: storage.load('sessions', []),
    activeId: null,
    messages: [],
    input: '',
    _sending: false, // prevents double-send
    _sendingSessionId: null, // which session is waiting for a response
    _streamingMsg: null, // current streaming message (for OpenClaw events)
    _activeRunId: null, // runId from last chat.send — used to filter competing run events
    _retryRunId: null, // runId from rate-limit retry chat.send
    _rateLimitCount: 0, // number of rate limit errors received during current run
    _rateLimitRecoveryTimer: null, // delayed history fetch timer during rate limit recovery
    _rateLimitRecoveryStart: 0, // timestamp when recovery polling started
    _lastAgentEventTime: 0, // timestamp of last agent event for active run
    _messageStore: {}, // sessionId -> messages[]
    _deletedKeys: new Set(), // sessionKeys deleted by user — prevents sync from re-adding them
    _route2Active: false, // true when Route 2 fallback is in progress
    _route1Retried: false, // true when Route 1 retry (re-send via OpenClaw) has been attempted

    // Atomically reset all sending/streaming/rate-limit state.
    // Called from multiple completion paths (final, error, timeout, abort, fallback).
    _resetSendingState() {
      this._streamingMsg = null;
      this._sending = false;
      this._sendingSessionId = null;
      this._activeRunId = null;
      this._retryRunId = null;
      this._rateLimitRetried = false;
      this._rateLimitCount = 0;
      this._rateLimitRecoveryStart = 0;
      this._route2Active = false;
      this._route1Retried = false;
      clearTimeout(this._rateLimitRecoveryTimer);
      this._stopResponsePolling();
    },

    // Route 1 retry: re-send via OpenClaw WebSocket. A new chat.send triggers a
    // fresh LiteLLM request that may hit a different provider in the fallback chain.
    // This preserves full tool access (write, read, exec, etc.) unlike Route 2.
    async _retryViaOpenclaw(botMsg, originalText) {
      if (!window.openclawClient?.authenticated || !this._activeSessionKey) {
        // OpenClaw unavailable — skip to Route 2
        Alpine.store('monitor').addLog('warn', 'OpenClaw unavailable for Route 1 retry — falling back to Route 2');
        this._fallbackToRoute2(botMsg, originalText);
        return;
      }

      try {
        botMsg.content = '...';
        this._scrollToBottom();

        // Re-attach streaming to the existing bot message
        this._streamingMsg = botMsg;

        // Send a new chat.send — OpenClaw will route to LiteLLM which picks
        // the next available provider. The response arrives via the existing
        // chat event handler (same sessionKey).
        const retryResult = await window.openclawClient.sendChat(originalText, {
          sessionKey: this._activeSessionKey,
        });
        this._retryRunId = retryResult?.runId || retryResult?.idempotencyKey || null;
        Alpine.store('monitor').addLog('info', `Route 1 retry sent (runId: ${this._retryRunId || 'pending'})`);

        // Give the retry 12s to produce content before falling back to Route 2
        this._rateLimitRecoveryTimer = setTimeout(() => {
          if (this._streamingMsg && isPlaceholder(this._streamingMsg.content)) {
            Alpine.store('monitor').addLog('info', 'Route 1 retry: no content after 12s — falling back to Route 2');
            this._fallbackToRoute2(botMsg, originalText);
          }
        }, 12000);
      } catch (e) {
        Alpine.store('monitor').addLog('warn', `Route 1 retry failed: ${e.message} — falling back to Route 2`);
        this._fallbackToRoute2(botMsg, originalText);
      }
    },

    // Route 2 fallback: when OpenClaw agent runs fail with rate limits,
    // bypass OpenClaw and call LiteLLM directly with model rotation.
    // Tries models from different providers to find one that works.
    async _fallbackToRoute2(botMsg, originalText) {
      if (this._route2Active) return; // prevent double-fire
      this._route2Active = true;

      // Models to try, ordered by provider diversity (skip the one that just failed)
      const session = this.active;
      const agent = Alpine.store('agents').list.find(a => a.id === session?.agentId);
      const primaryModel = (agent?.model || '').replace(/^litellm\//, '');
      // Ordered by reliability: gemini (confirmed working), cerebras scout,
      // groq (has errors but worth trying), mistral, deepseek (cheap paid last resort)
      const fallbackModels = [
        'gemini-flash',
        'gemini-flash-lite',
        'cerebras-llama-4-scout',
        'cerebras-zai-glm',
        'groq-llama-3.3-70b',
        'mistral-small',
        'mistral-large',
        'deepseek-chat',
      ].filter(m => m !== primaryModel);

      // Abort the stuck OpenClaw run
      if (this._activeRunId && this._activeSessionKey && window.openclawClient?.authenticated) {
        window.openclawClient.abortChat(this._activeSessionKey, this._activeRunId).catch(() => {});
      }

      // Clear OpenClaw streaming state (but keep _sending=true for Route 2)
      this._streamingMsg = null;
      this._rateLimitRetried = false;
      this._route1Retried = false;
      this._rateLimitCount = 0;
      this._rateLimitRecoveryStart = 0;
      clearTimeout(this._rateLimitRecoveryTimer);
      this._stopResponsePolling();

      // Build messages for Route 2 (no tool access — plain text completion only)
      const apiMessages = [];
      if (agent?.systemPrompt) {
        // Strip tool/file-writing instructions from the system prompt since Route 2
        // is a raw LiteLLM chat completion with NO tools (write, read, exec, etc.).
        // Without this, the model narrates "I wrote file X" instead of answering directly.
        const route2Prefix = `[IMPORTANT: You are responding via a direct text fallback. You do NOT have access to any tools (write, read, exec, sessions_send, cron, etc.) in this mode. Do NOT describe writing files, updating JSON, or performing tool actions — just answer the user's question directly with your best response. Keep your answer helpful and concise.]

`;
        apiMessages.push({ role: 'system', content: route2Prefix + agent.systemPrompt });
      }
      for (const msg of this.messages) {
        if (msg === botMsg) continue; // skip the placeholder
        apiMessages.push({
          role: msg.role === 'agent' ? 'assistant' : msg.role,
          content: msg.content,
        });
      }

      botMsg.content = '...';

      for (const model of fallbackModels) {
        try {
          Alpine.store('monitor').addLog('info', `Route 2 fallback: trying ${model}...`);
          Alpine.store('app').pushChatEvent('info', `Trying fallback: ${model}`);
          botMsg.content = '...';
          this._scrollToBottom();

          let content = '';
          for await (const delta of litellmApi.streamChat(model, apiMessages)) {
            if (!content && isPlaceholder(botMsg.content)) {
              botMsg.content = ''; // clear placeholder on first real content
            }
            content += delta;
            botMsg.content = content;
            this._scrollToBottom();
          }

          if (content.trim()) {
            botMsg.streaming = false;
            botMsg.time = timeNow();
            this._resetSendingState();
            this._persistMessages();
            Alpine.store('monitor').addLog('info', `Route 2 success with ${model} (${content.length} chars)`);
            Alpine.store('app').pushChatEvent('ok', `Response via ${model} (fallback)`);
            mcAudio.chatComplete();

            if (agent) {
              agent.tasksCompleted++;
              agent.lastActive = 'Just now';
              Alpine.store('agents')._persist();
              const responseTimeMs = this._chatSendTime ? Date.now() - this._chatSendTime : 0;
              Alpine.store('governance').recordTask(agent.id, {
                success: true,
                tokens: Math.round(content.length / 4),
                responseTimeMs,
                taskType: 'chat-litellm-fallback',
              });
            }
            return;
          }
        } catch (e) {
          Alpine.store('monitor').addLog('warn', `Route 2 ${model} failed: ${e.message}`);
        }
      }

      // All models failed
      botMsg.content = 'All providers unavailable — check Activity tab for details.';
      botMsg.streaming = false;
      botMsg.time = timeNow();
      this._resetSendingState();
      this._persistMessages();
      Alpine.store('monitor').addLog('error', 'Route 2 fallback: all models exhausted');
      Alpine.store('app').pushChatEvent('error', 'All providers failed — check API keys');
      mcAudio.taskFail();
    },

    get active() {
      return this.list.find(s => s.id === this.activeId) || null;
    },

    async select(id) {
      this.activeId = id;

      // Set _activeSessionKey so incoming chat events are routed to this session
      // even before the user sends a message (e.g. late-arriving events from
      // background cron runs or previous tool-use turns).
      const sel = this.list.find(s => s.id === id);
      if (sel?.sessionKey) {
        this._activeSessionKey = sel.sessionKey;
      } else if (sel?.agentId) {
        // Construct sessionKey from agentId when server hasn't synced it yet
        this._activeSessionKey = 'agent:' + sel.agentId + ':main';
        sel.sessionKey = this._activeSessionKey;
      }

      // ALWAYS try loading from OpenClaw server first when connected.
      // Server is the source of truth — in-memory cache may be stale
      // (e.g., agent responded while tab was backgrounded).
      if (ocMode === 'connected' && window.openclawClient?.authenticated) {
        try {
          const session = this.list.find(s => s.id === id);
          const historyKey = session?.sessionKey || (session?.agentId ? 'agent:' + session.agentId + ':main' : null);
          if (!historyKey) throw new Error('No sessionKey or agentId for history load');
          const history = await window.openclawClient.getHistory(historyKey);
          if (history && history.length > 0) {
            this.messages = this._parseHistoryMessages(history);
            this._messageStore[id] = this.messages;
            Alpine.store('monitor').addLog('info', `Loaded ${this.messages.length} messages from OpenClaw`);
            this._scrollToBottom();
            return;
          }
        } catch (err) {
          console.warn('[Sessions] OpenClaw history load failed:', err.message);
          // Fall through to cache/localStorage
        }
      }

      // Fallback: check in-memory cache
      if (this._messageStore[id] && this._messageStore[id].length > 0) {
        this.messages = this._messageStore[id];
        return;
      }

      // Fallback: load from localStorage
      this.messages = this._loadMessages(id);
      this._messageStore[id] = this.messages;
    },

    // -----------------------------------------------------------------------
    // SERVER HISTORY SYNC — the core of reliable chat
    // -----------------------------------------------------------------------
    // Instead of depending solely on live WebSocket streaming events,
    // we periodically reconcile with the server's chat history. This makes
    // the chat work like iMessage: always shows the latest server state.

    // Convert server history messages to our local format
    _parseHistoryMessages(history) {
      const raw = history
        .filter(m => {
          // Skip tool_result messages entirely — they're internal tool execution
          if (m.role === 'tool') return false;
          return true;
        })
        .map(m => {
          const content = extractMessageText(m.content);
          let role = m.role === 'assistant' ? 'agent' : m.role;
          const isSystemInjection = role === 'user' && (
            /^#?\s*Read HEARTBEAT/i.test(content) ||
            /^#?\s*HEARTBEAT/i.test(content) ||
            /^#?\s*Bootstrap/i.test(content) ||
            /^EXECUTE_WORKFLOW:/i.test(content) ||
            /^WRITE_FILES:/i.test(content) ||
            /^WORKFLOW_RESULT:/i.test(content) ||
            /^STAGING_APPROVED:/i.test(content) ||
            /^STAGING_REJECTED:/i.test(content) ||
            /^FILES_WRITTEN:/i.test(content) ||
            /^Current time:/i.test(content) ||
            (m.label && /heartbeat|cron|system|bridge|staging/i.test(m.label))
          );
          if (isSystemInjection) role = 'system';
          // Also hide agent replies to system bridge messages
          const isSystemReply = role === 'agent' && (
            /^FILES_WRITTEN:/i.test(content) ||
            /^GOVERNANCE_ADJUST:/i.test(content) ||
            /^HEARTBEAT_OK/i.test(content) ||
            /^#?\s*HEARTBEAT/i.test(content) ||
            /^#?\s*Heartbeat Checklist/i.test(content) ||
            /^#?\s*Bootstrap/i.test(content) ||
            /^Current time:/i.test(content) ||
            (content.length < 60 && /^(ok|done|acknowledged|noted|understood)/i.test(content))
          );
          if (isSystemReply) role = 'system';
          // Hide OpenClaw "(no output)" placeholder messages from tool-only turns
          const isNoOutput = role === 'agent' && /^\(no output\)$/i.test(content.trim());
          if (isNoOutput) role = 'system';
          const isTool = role === 'agent' && _isToolOutput(content);
          return {
            id: m.id || generateId(),
            role,
            content,
            time: m.time || m.timestamp || '',
            _toolOutput: isTool,
          };
        })
        .filter(m => m.role !== 'system' && (m.role === 'user' || m.content.trim()));

      // Group consecutive agent tool-output messages into one collapsed bubble.
      // This prevents 5-10 separate JSON/status bubbles from flooding the chat.
      const grouped = [];
      let toolBatch = [];
      const flushToolBatch = () => {
        if (toolBatch.length === 0) return;
        if (toolBatch.length === 1) {
          // Single tool msg — keep as-is, formatChatMessage will collapse it
          grouped.push(toolBatch[0]);
        } else {
          // Multiple consecutive tool outputs → merge into one
          const merged = toolBatch.map(m => m.content).join('\n---\n');
          grouped.push({
            id: toolBatch[0].id,
            role: 'agent',
            content: merged,
            time: toolBatch[toolBatch.length - 1].time,
            _toolOutput: true,
            _toolCount: toolBatch.length,
          });
        }
        toolBatch = [];
      };
      for (const m of raw) {
        if (m._toolOutput) {
          toolBatch.push(m);
        } else {
          flushToolBatch();
          grouped.push(m);
        }
      }
      flushToolBatch();
      return grouped;
    },

    // Sync the active session's messages from the server.
    // Called on: reconnect, visibility resume, polling timer, manual refresh.
    // Debounced: prevents concurrent calls from clobbering each other.
    _syncInFlight: false,
    async _syncActiveSessionHistory(trigger) {
      const sk = this._activeSessionKey;
      if (!sk || !window.openclawClient?.authenticated) return;
      // Prevent concurrent sync calls (polling + visibility can overlap)
      if (this._syncInFlight) return;
      this._syncInFlight = true;

      try {
        const history = await window.openclawClient.getHistory(sk);
        if (!Array.isArray(history) || history.length === 0) return;

        const serverMessages = this._parseHistoryMessages(history);
        if (serverMessages.length === 0) return;

        // Find the last agent message from the server
        const lastServerAgent = [...serverMessages].reverse().find(m => m.role === 'agent');
        const lastServerUser = [...serverMessages].reverse().find(m => m.role === 'user');

        // If we're currently streaming and have REAL content (not a placeholder),
        // don't clobber it — live deltas take priority over history polling.
        if (this._streamingMsg && this._streamingMsg.content
            && !isPlaceholder(this._streamingMsg.content)
            && this._streamingMsg.content.length > 0) {
          return;
        }

        // If we're waiting for a response (_sending=true) and server has an agent reply
        // after our last user message, we got the response — populate it.
        if (this._sending && this._streamingMsg && lastServerAgent) {
          const serverAgentContent = lastServerAgent.content.trim();
          // Server has a real response (not empty, not an error placeholder)
          if (serverAgentContent.length > 10) {
            // Verify this is a response to our message (appears after last user msg in history)
            const agentIdx = serverMessages.lastIndexOf(lastServerAgent);
            const userIdx = lastServerUser ? serverMessages.lastIndexOf(lastServerUser) : -1;
            if (agentIdx > userIdx) {
              Alpine.store('monitor').addLog('info', `History sync (${trigger}): recovered agent response (${serverAgentContent.length} chars)`);
              this._streamingMsg.content = serverAgentContent;
              this._streamingMsg.streaming = false;
              this._resetSendingState();
              this._persistMessages();
              Alpine.store('app').pushChatEvent('ok', 'Response received');
              mcAudio.chatComplete();
              return;
            }
          }
        }

        // Not waiting for a response — just refresh messages from server
        // if the server has more messages than we do (agent worked in background).
        if (!this._sending && serverMessages.length > this.messages.length) {
          Alpine.store('monitor').addLog('info', `History sync (${trigger}): updating ${this.messages.length} → ${serverMessages.length} messages`);
          this.messages = serverMessages;
          this._messageStore[this.activeId] = this.messages;
          this._persistMessages();
          this._scrollToBottom();
        }
      } catch (err) {
        // Don't spam errors for routine sync failures (e.g. during reconnect race)
        if (trigger !== 'poll') {
          Alpine.store('monitor').addLog('warn', `History sync (${trigger}) failed: ${err.message}`);
        }
      } finally {
        this._syncInFlight = false;
      }
    },

    // Start polling for the active session while waiting for a response.
    // Polls every 5s — catches responses missed due to WS issues, rate limits,
    // iOS background suspension, etc.
    _startResponsePolling() {
      this._stopResponsePolling();
      this._responsePollTimer = setInterval(() => {
        if (this._sending && this._activeSessionKey) {
          this._syncActiveSessionHistory('poll');
        } else {
          // No longer waiting — stop polling
          this._stopResponsePolling();
        }
      }, 5000);
    },

    _stopResponsePolling() {
      if (this._responsePollTimer) {
        clearInterval(this._responsePollTimer);
        this._responsePollTimer = null;
      }
    },

    createSession(agentId, forceNew) {
      const agent = Alpine.store('agents').list.find(a => a.id === agentId);
      if (!agent) return;

      // OpenClaw session key format: "agent:<agentId>:main" for webchat DMs.
      // One persistent conversation per agent (OpenClaw model).
      const sessionKey = 'agent:' + agentId + ':main';

      // Clear deletion tracking — user is intentionally re-engaging with this agent
      this._deletedKeys.delete(sessionKey);

      // If a session exists: select it, or reset for a fresh start
      const existing = this.list.find(s => s.sessionKey === sessionKey);
      if (existing) {
        if (forceNew) {
          // Reset server-side session for a fresh conversation
          if (window.openclawClient?.authenticated) {
            window.openclawClient.resetSession(sessionKey, 'user-request').catch(e => {
              console.warn('[Sessions] Server reset failed:', e.message);
            });
          }
          // Clear local messages and set active session key for event filtering
          this.messages = [];
          this._messageStore[existing.id] = [];
          this._activeSessionKey = sessionKey;
          existing.lastMessage = '';
          existing.title = 'New conversation';
          existing.updatedAt = Date.now();
          this.activeId = existing.id;
          this._persist();
          Alpine.store('app').setView('chat');
          Alpine.store('monitor').addLog('info', `Reset conversation with ${agent.name}`);
          return;
        }
        this.activeId = existing.id;
        this.select(existing.id);
        Alpine.store('app').setView('chat');
        return;
      }

      const session = {
        id: generateId(),
        sessionKey,
        agentId: agent.id,
        agentName: agent.name,
        agentEmoji: agent.emoji,
        title: 'New conversation',
        lastMessage: '',
        updatedAt: Date.now(),
        unread: 0,
      };
      this.list.unshift(session);
      this.activeId = session.id;
      this.messages = [];
      this._messageStore[session.id] = this.messages;
      this._persist();
      Alpine.store('app').setView('chat');
    },

    async deleteSession(sessionId) {
      const session = this.list.find(s => s.id === sessionId);
      if (!session) return;

      // Track deleted session key so _syncSessionsFromOpenClaw doesn't re-add it.
      // OpenClaw canonical sessions (agent:X:main) persist on the server even after
      // sessions.delete — the next sync would bring them right back.
      if (session.sessionKey) {
        this._deletedKeys.add(session.sessionKey);
      }

      // Reset on OpenClaw server (clears conversation history).
      // Use sessions.reset instead of sessions.delete — canonical sessions
      // like "agent:lead:main" auto-recreate after delete, but reset clears them.
      if (session.sessionKey && window.openclawClient?.authenticated) {
        try {
          await window.openclawClient.request('sessions.reset', {
            key: session.sessionKey,
            reason: 'user-request',
          });
        } catch (e) {
          // Fallback to delete if reset not available
          try {
            await window.openclawClient.deleteSession(session.sessionKey);
          } catch (e2) {
            console.warn('[Sessions] Server delete failed:', e2.message);
          }
        }
      }

      // Remove from local state
      this.list = this.list.filter(s => s.id !== sessionId);
      delete this._messageStore[sessionId];
      storage.remove('msgs-' + sessionId);

      // If this was the active session, switch to another and update event routing
      if (this.activeId === sessionId) {
        this.activeId = this.list[0]?.id || null;
        this.messages = this.activeId ? (this._messageStore[this.activeId] || []) : [];
        // Update _activeSessionKey to the new active session (or clear it)
        const newActive = this.list.find(s => s.id === this.activeId);
        this._activeSessionKey = newActive?.sessionKey || null;
      }
      this._persist();
      Alpine.store('monitor').addLog('info', `Deleted conversation with ${session.agentName}`);
    },

    async abortCurrentRun() {
      if (!this._sending) return;
      const sk = this._activeSessionKey;
      const runId = this._activeRunId;
      // Try server-side abort
      if (sk && window.openclawClient?.authenticated) {
        try {
          await window.openclawClient.abortChat(sk, runId);
          Alpine.store('monitor').addLog('info', `Aborted run ${runId || 'unknown'}`);
        } catch (e) {
          Alpine.store('monitor').addLog('warn', `Abort RPC failed: ${e.message}`);
        }
      }
      // Clean up client-side streaming state
      if (this._streamingMsg) {
        const cur = this._streamingMsg.content;
        if (!cur || isPlaceholder(cur)) {
          this._streamingMsg.content = '(Stopped by user)';
        }
        this._streamingMsg.streaming = false;
      }
      this._resetSendingState();
      this._persistMessages();
      Alpine.store('app').pushChatEvent('warn', 'Response stopped');
    },

    async sendMessage() {
      const text = this.input.trim();
      if (!text || !this.activeId) return;
      // Only block if we're waiting for a response in THIS session
      if (this._sending && this._sendingSessionId === this.activeId) return;

      // Reset state for new message (clears any lingering rate-limit/fallback state)
      this._rateLimitRetried = false;
      this._route1Retried = false;
      this._rateLimitCount = 0;
      this._route2Active = false;
      clearTimeout(this._rateLimitRecoveryTimer);

      // Add user message
      const userMsg = { id: generateId(), role: 'user', content: text, time: timeNow() };
      this.messages.push(userMsg);
      this.input = '';

      // Update session metadata
      const session = this.active;
      if (session) {
        session.lastMessage = text.slice(0, 60);
        session.updatedAt = Date.now();
        // Auto-set title from first message
        if (session.title === 'New conversation') {
          session.title = text.slice(0, 40) + (text.length > 40 ? '...' : '');
        }
      }

      // Scroll to bottom
      this._scrollToBottom();

      // Add placeholder for streaming response
      const botMsg = { id: generateId(), role: 'agent', content: '', time: timeNow(), streaming: true };
      this.messages.push(botMsg);
      this._sending = true;
      this._sendingSessionId = this.activeId;
      this._chatSendTime = Date.now();

      // Route 1: OpenClaw WebSocket (real agent execution with tools, memory, etc.)
      if (ocMode === 'connected' && window.openclawClient?.authenticated) {
        this._streamingMsg = botMsg;
        try {
          const agent = Alpine.store('agents').list.find(a => a.id === session?.agentId);

          // Server-side SOUL.md handles the full system prompt for OpenClaw WS.
          // Only inject dynamic tier context on the first message when governance is active.
          let messageText = text;
          const gov = Alpine.store('governance');
          if (!gov?.paused) {
            const priorUserMsgs = this.messages.filter(m => m.role === 'user');
            if (priorUserMsgs.length <= 1 && agent && gov) {
              const tierCtx = `[STATUS] Tier: ${gov.getTierName(agent.id)} (${gov._getMetrics(agent.id).tier}/3) | Score: ${gov.getScore(agent.id)} | Week ${gov.week.number}, ${gov.getWeekDaysRemaining()} days left | Tasks: ${gov._getMetrics(agent.id).weeklyTasks}`;
              messageText = `${tierCtx}\n\n${text}`;
            }
          }

          // Session key: use server-synced key, or derive from agent ID
          if (!session?.sessionKey && !agent?.id) {
            throw new Error('No agent selected — cannot determine session key');
          }
          const sessionKey = session?.sessionKey || 'agent:' + agent.id + ':main';
          if (!isValidSessionKey(sessionKey)) {
            throw new Error(`Invalid session key format: "${sessionKey}" — expected agent:<id>:main`);
          }
          // Store sessionKey back on session if it was missing
          if (session && !session.sessionKey) session.sessionKey = sessionKey;
          // Track active session key for event filtering (Bug #32579:
          // gateway broadcasts ALL chat events to ALL clients)
          this._activeSessionKey = sessionKey;

          const sendResult = await window.openclawClient.sendChat(messageText, { sessionKey });
          // Track the active runId so we can filter chat events from competing/stale runs.
          // Server may return runId in response, or we use our idempotencyKey (attached by sendChat).
          this._activeRunId = sendResult?.runId || sendResult?._idempotencyKey || null;
          this._retryRunId = null;
          this._lastAgentEventTime = 0;
          Alpine.store('monitor').addLog('info', `chat.send accepted (session=${sessionKey}, runId=${this._activeRunId || 'n/a'})`);
          Alpine.store('app').pushChatEvent('info', `Message sent to ${session?.agentName || 'agent'}`);
          // Response will arrive via events (chat.delta, chat.complete)
          // handled by _setupOpenClawEvents in the app store.
          // ALSO start polling server history as a safety net — catches responses
          // missed due to WS disconnects, rate limits, or iOS background suspension.
          this._startResponsePolling();

          // Processing indicator after 15s of no content
          const _processingTimer = setTimeout(() => {
            if (this._sending && this._streamingMsg === botMsg && !botMsg.content.trim()) {
              botMsg.content = '...';
              this._scrollToBottom();
            }
          }, 15000);

          // Safety timeout: 120s max wait. Try history recovery, then give up.
          const _safetyTimer = setTimeout(async () => {
            if (!this._sending || this._streamingMsg !== botMsg) return;
            // Skip if Route 2 fallback is handling it
            if (this._route2Active) return;

            const hadContent = botMsg.content.trim() && !isPlaceholder(botMsg.content);

            // Try history recovery as last resort
            if (!hadContent && this._activeSessionKey && window.openclawClient?.authenticated) {
              try {
                const history = await window.openclawClient.getHistory(this._activeSessionKey);
                const lastAssistant = [...(history || [])].reverse().find(m =>
                  m.role === 'assistant' || m.role === 'agent'
                );
                const recovered = lastAssistant && extractMessageText(lastAssistant.content);
                if (recovered && recovered.length > 10) {
                  botMsg.content = recovered;
                  botMsg.streaming = false;
                  this._resetSendingState();
                  this._persistMessages();
                  Alpine.store('monitor').addLog('info', 'Recovered response from history on safety timeout');
                  clearTimeout(_processingTimer);
                  return;
                }
              } catch (e) {
                Alpine.store('monitor').addLog('warn', `History recovery failed: ${e.message}`);
              }
            }

            // Give up
            if (!hadContent) botMsg.content = 'No response received — try sending again.';
            botMsg.streaming = false;
            this._resetSendingState();
            this._persistMessages();
            Alpine.store('monitor').addLog('warn', hadContent
              ? 'Chat timed out after 120s (partial content received)'
              : 'Chat timed out after 120s — no response received');
            clearTimeout(_processingTimer);
          }, 120000);
        } catch (e) {
          botMsg.content = 'Error: ' + e.message;
          botMsg.streaming = false;
          this._resetSendingState();
          Alpine.store('monitor').addLog('error', `OpenClaw chat error: ${e.message}`);
        }
        return;
      }

      // Route 2: Direct LiteLLM streaming (fallback when OpenClaw WS unavailable)
      if (!Alpine.store('app').demoMode) {
        const agent = Alpine.store('agents').list.find(a => a.id === session?.agentId);
        // Strip provider prefix — LiteLLM expects bare aliases (e.g. groq-llama-3.3-70b)
        const rawModel = agent?.model || 'litellm/cerebras-llama-3.3-70b';
        const model = rawModel.replace(/^litellm\//, '');

        const gov = Alpine.store('governance');

        const apiMessages = [];
        if (agent?.systemPrompt) {
          // Inject dynamic tier context into system prompt only when governance is active
          let tierCtx = '';
          if (!gov?.paused) {
            const agentTier = gov._getMetrics(agent?.id)?.tier ?? 1;
            tierCtx = `\n\n[CURRENT STATUS] Tier: ${gov.getTierName(agent.id)} (${agentTier}/3) | Score: ${gov.getScore(agent.id)} | Week ${gov.week.number}, ${gov.getWeekDaysRemaining()} days left | Weekly tasks: ${gov._getMetrics(agent.id).weeklyTasks}`;
          }
          apiMessages.push({ role: 'system', content: agent.systemPrompt + tierCtx });
        }
        for (const msg of this.messages) {
          apiMessages.push({
            role: msg.role === 'agent' ? 'assistant' : msg.role,
            content: msg.content,
          });
        }

        try {
          for await (const delta of litellmApi.streamChat(model, apiMessages)) {
            botMsg.content += delta;
            this._scrollToBottom();
          }
        } catch (e) {
          botMsg.content = botMsg.content || ('Error: ' + e.message);
          Alpine.store('monitor').addLog('error', `Chat error: ${e.message}`);
        }

        botMsg.streaming = false;
        botMsg.time = timeNow();
        this._sending = false;

        if (session) {
          session.lastMessage = (botMsg.content || '').slice(0, 60);
          session.updatedAt = Date.now();
        }

        if (agent) {
          const tokens = Math.round((text.length + botMsg.content.length) / 4);
          agent.tokensUsed += tokens;
          agent.lastActive = 'Just now';

          // Only count as completed if the response has real content (not an error)
          const isError = botMsg.content.startsWith('Error:');
          if (!isError) {
            agent.tasksCompleted++;
            mcAudio.chatComplete();
          } else {
            mcAudio.taskFail();
          }
          Alpine.store('agents')._persist();

          const responseTimeMs = this._chatSendTime ? Date.now() - this._chatSendTime : 0;
          Alpine.store('governance').recordTask(agent.id, {
            success: !isError, tokens, responseTimeMs, taskType: 'chat-litellm',
          });
        }

        this._persist();
        this._persistMessages();
        this._scrollToBottom();
        return;
      }

      // Route 3: Demo mode (no backend available)
      setTimeout(() => {
        botMsg.content = 'Mission Control is in demo mode — connect to OpenClaw or LiteLLM for real AI responses. Click "Reconnect" in the header.';
        botMsg.streaming = false;
        botMsg.time = timeNow();
        this._sending = false;
        this._persistMessages();
        this._scrollToBottom();
      }, 500);
    },

    _scrollToBottom() {
      setTimeout(() => {
        const el = document.getElementById('chat-messages');
        if (el) el.scrollTop = el.scrollHeight;
      }, 30);
    },

    _persist() {
      storage.save('sessions', this.list.map(s => ({
        id: s.id, sessionKey: s.sessionKey, agentId: s.agentId, agentName: s.agentName,
        agentEmoji: s.agentEmoji, title: s.title,
        lastMessage: s.lastMessage, updatedAt: s.updatedAt, unread: 0,
      })));
    },

    _persistMessages() {
      if (!this.activeId || !this.messages) return;
      this._messageStore[this.activeId] = this.messages;
      // Save non-streaming messages to localStorage (capped at 100 per session)
      const toSave = this.messages
        .filter(m => !m.streaming)
        .slice(-100)
        .map(m => ({ id: m.id, role: m.role, content: m.content, time: m.time }));
      storage.save('msgs-' + this.activeId, toSave);
    },

    _loadMessages(sessionId) {
      const saved = storage.load('msgs-' + sessionId, []);
      return saved.map(m => ({
        id: m.id || generateId(),
        role: m.role || 'user',
        content: m.content || '',
        time: m.time || '',
      }));
    },
  });

  // --------------------------------------------------------------------------
  // STORE: WORKFLOWS
  // --------------------------------------------------------------------------

  Alpine.store('workflows', {
    list: storage.load('workflows', []),
    activeId: storage.load('workflows-activeId', null),
    running: false,
    _autoSaveTimer: null,
    _lastSerialized: null,

    get active() {
      return this.list.find(w => w.id === this.activeId) || null;
    },

    // Start auto-save polling (LiteGraph has no onChange callback)
    setupAutoSave() {
      if (this._autoSaveTimer) clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = setInterval(() => {
        if (this.activeId && window.workflowGraph) this._autoSave();
      }, 5000);
    },

    _autoSave() {
      if (!this.activeId || !window.workflowGraph) return;
      const data = JSON.stringify(window.workflowGraph.serialize());
      if (data !== this._lastSerialized) {
        this._lastSerialized = data;
        localStorage.setItem('mc-workflow-' + this.activeId, data);
        const wf = this.active;
        if (wf) {
          wf.nodes = window.workflowGraph._nodes?.length || 0;
          wf.updatedAt = Date.now();
        }
        this._persistList();
      }
    },

    create(name) {
      if (!name) return null;
      const wf = {
        id: generateId(),
        name: name,
        nodes: 0,
        lastRun: 'Never',
        status: 'draft',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: 'user',
      };
      this.list.unshift(wf);
      this._persistList();

      // Clear current graph and load default template
      this.activeId = wf.id;
      storage.save('workflows-activeId', wf.id);
      if (window.workflowGraph) {
        window.workflowGraph.clear();
        if (window.addDefaultWorkflow) addDefaultWorkflow(window.workflowGraph);
      }
      this.save();
      this.setupAutoSave();
      Alpine.store('monitor').addLog('info', `Workflow "${wf.name}" created`);
      return wf;
    },

    save() {
      if (!this.activeId || !window.workflowGraph) return;
      const data = JSON.stringify(window.workflowGraph.serialize());
      this._lastSerialized = data;
      localStorage.setItem('mc-workflow-' + this.activeId, data);
      const wf = this.active;
      if (wf) {
        wf.nodes = window.workflowGraph._nodes?.length || 0;
        wf.updatedAt = Date.now();
      }
      this._persistList();
      Alpine.store('monitor').addLog('info', 'Workflow saved');

      // Auto-sync to shared volume so other devices and agents can see it
      if (window.workflowBridge) {
        window.workflowBridge.syncWorkflow(this.activeId);
      }
    },

    load(id) {
      // Auto-save current workflow before switching
      if (this.activeId && this.activeId !== id) this._autoSave();

      this.activeId = id;
      storage.save('workflows-activeId', id);
      const data = localStorage.getItem('mc-workflow-' + id);
      if (data && window.workflowGraph) {
        try {
          window.workflowGraph.configure(JSON.parse(data));
          this._lastSerialized = data;
          // Force canvas redraw after loading graph data
          if (window.workflowCanvas) {
            window.workflowCanvas.setDirty(true, true);
            window.workflowCanvas.draw(true, true);
          }
        } catch (e) {
          Alpine.store('monitor').addLog('error', `Failed to load workflow: ${e.message}`);
        }
      } else if (window.workflowGraph) {
        window.workflowGraph.clear();
        this._lastSerialized = null;
        if (window.workflowCanvas) {
          window.workflowCanvas.setDirty(true, true);
        }
      }
      this.setupAutoSave();
    },

    rename(id, newName) {
      if (!newName) return;
      const wf = this.list.find(w => w.id === id);
      if (wf) {
        wf.name = newName;
        wf.updatedAt = Date.now();
        this._persistList();
      }
    },

    delete(id) {
      this.list = this.list.filter(w => w.id !== id);
      localStorage.removeItem('mc-workflow-' + id);
      if (this.activeId === id) {
        this.activeId = null;
        storage.save('workflows-activeId', null);
        this._lastSerialized = null;
        if (window.workflowGraph) window.workflowGraph.clear();
      }
      this._persistList();
      Alpine.store('monitor').addLog('info', 'Workflow deleted');
    },

    duplicate(id) {
      const source = this.list.find(w => w.id === id);
      if (!source) return null;
      const newId = generateId();
      const newWf = {
        ...JSON.parse(JSON.stringify(source)),
        id: newId,
        name: source.name + ' (copy)',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const graphData = localStorage.getItem('mc-workflow-' + id);
      if (graphData) localStorage.setItem('mc-workflow-' + newId, graphData);
      this.list.unshift(newWf);
      this._persistList();
      Alpine.store('monitor').addLog('info', `Duplicated workflow "${source.name}"`);
      return newWf;
    },

    // Export workflow as JSON (used by agent bridge)
    exportJSON(id) {
      const wf = this.list.find(w => w.id === id);
      const graphData = localStorage.getItem('mc-workflow-' + id);
      if (!wf) return null;
      return {
        meta: { ...wf },
        graph: graphData ? JSON.parse(graphData) : null,
      };
    },

    // Import workflow from JSON (used by agent bridge)
    importJSON(json) {
      if (!json?.meta?.id || !json?.graph) return null;
      const wf = {
        id: json.meta.id,
        name: json.meta.name || 'Agent Workflow',
        nodes: json.meta.nodes || json.graph.nodes?.length || 0,
        lastRun: json.meta.lastRun || 'Never',
        status: json.meta.status || 'draft',
        createdAt: json.meta.createdAt || Date.now(),
        updatedAt: json.meta.updatedAt || Date.now(),
        createdBy: json.meta.createdBy || 'agent',
      };
      // Update existing or add new
      const idx = this.list.findIndex(w => w.id === wf.id);
      if (idx >= 0) {
        this.list[idx] = wf;
      } else {
        this.list.unshift(wf);
      }
      localStorage.setItem('mc-workflow-' + wf.id, JSON.stringify(json.graph));
      this._persistList();
      return wf;
    },

    async run() {
      if (!this.activeId || this.running) return;
      if (window.workflowGraph && window.WorkflowExecutor) {
        const executor = new WorkflowExecutor(window.workflowGraph);
        await executor.execute();
      } else {
        this.running = true;
        Alpine.store('monitor').addLog('info', `Workflow "${this.active?.name}" executing...`);
        setTimeout(() => {
          this.running = false;
          const wf = this.active;
          if (wf) { wf.lastRun = 'Just now'; wf.status = 'completed'; }
          Alpine.store('monitor').addLog('info', 'Workflow completed (demo mode)');
        }, 2000);
      }
    },

    // Send workflow to OpenClaw for background execution (server-side, survives browser close)
    async runInBackground() {
      if (!this.activeId || this.running) return;
      if (!window.openclawClient?.authenticated) {
        Alpine.store('monitor').addLog('warn', 'Background run requires OpenClaw connection');
        return;
      }
      const wf = this.active;
      if (!wf) return;
      const graphData = localStorage.getItem('mc-workflow-' + this.activeId);
      if (!graphData) return;

      try {
        // Route to the appropriate team lead based on first agent node in the workflow
        let targetAgent = 'lead';
        try {
          const graph = JSON.parse(graphData);
          const agentNode = (graph.nodes || []).find(n => n.type === 'mission/agent');
          if (agentNode?.properties?.agent) {
            const a = agentNode.properties.agent;
            if (['ops-lead', 'builder', 'sentinel', 'chronicler'].includes(a)) targetAgent = 'ops-lead';
          }
        } catch (e) { /* parse error — use default lead */ }

        await window.openclawClient.sendChat(
          `EXECUTE_WORKFLOW:${this.activeId}\nWorkflow: ${wf.name}\n${graphData}`,
          { sessionKey: 'agent:' + targetAgent + ':main' }
        );
        wf.status = 'running-bg';
        wf.lastRun = 'Background';
        this._persistList();
        Alpine.store('monitor').addLog('info', `Workflow "${wf.name}" sent to OpenClaw for background execution`);
      } catch (e) {
        Alpine.store('monitor').addLog('error', `Background run failed: ${e.message}`);
      }
    },

    _persistList() {
      storage.save('workflows', this.list.map(w => ({
        id: w.id, name: w.name, nodes: w.nodes,
        lastRun: w.lastRun, status: w.status,
        createdAt: w.createdAt, updatedAt: w.updatedAt,
        createdBy: w.createdBy,
      })));
    },
  });

  // --------------------------------------------------------------------------
  // STORE: MONITOR
  // --------------------------------------------------------------------------

  Alpine.store('monitor', {
    logs: [...DEMO_LOGS],
    logFilter: 'all',
    tokenUsage: {},
    systemHealth: {
      openclaw: 'checking...',
      litellm: 'checking...',
      modelsAvailable: 0,
      uptime: '--',
    },

    get filteredLogs() {
      if (this.logFilter === 'all') return this.logs;
      return this.logs.filter(l => l.level === this.logFilter);
    },

    get totalTokens() {
      return Object.values(this.tokenUsage).reduce((sum, m) => sum + m.input + m.output, 0);
    },

    get totalCost() {
      return Object.values(this.tokenUsage).reduce((sum, m) => sum + m.cost, 0);
    },

    addLog(level, msg) {
      const time = new Date().toTimeString().slice(0, 8);
      this.logs.unshift({ time, level, msg });
      if (this.logs.length > 200) this.logs.pop();
      if (level === 'error') mcAudio.error();
    },

    maxUsage() {
      const vals = Object.values(this.tokenUsage).map(m => m.input + m.output);
      return Math.max(...vals, 1);
    },
  });

  // --------------------------------------------------------------------------
  // STORE: GOVERNANCE — team performance tracking & lead promotion
  // --------------------------------------------------------------------------

  Alpine.store('governance', {
    // PAUSED: Disable automatic tier changes, lead promotions, and weekly evaluations.
    // Raw stats (tasks completed/failed) still tracked for display.
    // Re-enable when P2P agent communication and autonomous tasks are working.
    paused: true,

    // Per-agent performance metrics (persisted to localStorage, synced to volume)
    metrics: storage.load('governance-metrics', {}),

    // Weekly evaluation cycle (replaces quarterly — agents iterate fast)
    week: storage.load('governance-week', {
      startDate: Date.now(),
      number: 1,
      evaluations: [],   // past week snapshots
    }),

    // Tier names and config
    TIER_NAMES: ['Probation', 'Active', 'Proven', 'Elite'],
    TIER_COLORS: ['red', 'gray', 'cyan', 'amber'],
    // What each tier unlocks — all models available at every tier, storage spread across EC2
    TIER_PERKS: {
      0: { workspace: '50 MB', tools: 'basic', autonomy: 'supervised', oracle: false, desc: 'Supervised. 5 consecutive successes to escape.' },
      1: { workspace: '200 MB', tools: 'standard', autonomy: 'standard', oracle: false, desc: 'Default tier. Standard workspace + full model access.' },
      2: { workspace: '500 MB', tools: 'standard + priority routing', autonomy: 'semi-autonomous', oracle: false, desc: 'Expanded workspace. Can run longer tasks autonomously.' },
      3: { workspace: 'Oracle ARM 24 GB', tools: 'full suite + background jobs', autonomy: 'fully autonomous', oracle: true, desc: 'Dedicated Oracle Cloud ARM server. Full autonomy. Can onboard team.' },
    },

    init() {
      // Try to merge governance from shared volume (enables cross-device sync)
      fetch('/workspace/mc-state/governance.json', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data?.agents) return;
          // Merge: take the version with more tasks completed for each agent
          for (const [agentId, serverScore] of Object.entries(data.agents)) {
            const local = this.metrics[agentId];
            const serverTotal = (serverScore.tasksCompleted || 0) + (serverScore.tasksFailed || 0);
            const localTotal = local ? (local.tasksCompleted + local.tasksFailed) : 0;
            if (serverTotal > localTotal) {
              this.metrics[agentId] = serverScore;
            }
          }
          storage.save('governance-metrics', this.metrics);
        })
        .catch(() => {}); // volume file may not exist yet

      // Check if a weekly evaluation is due
      this._checkWeeklyEvaluation();
    },

    // Team definitions: agents grouped into teams with a designated lead
    teams: storage.load('governance-teams', [
      {
        id: 'core',
        name: 'Core Team',
        lead: 'lead',
        members: ['lead', 'codecraft', 'scout', 'scribe'],
        project: 'General tasks and site development',
      },
      {
        id: 'platform',
        name: 'Platform Team',
        lead: 'ops-lead',
        members: ['ops-lead', 'builder', 'sentinel', 'chronicler'],
        project: 'Infrastructure, deployments, monitoring, and reliability',
      },
    ]),

    // Get or initialize metrics for an agent
    _getMetrics(agentId) {
      if (!this.metrics[agentId]) {
        this.metrics[agentId] = {
          tasksCompleted: 0,
          tasksFailed: 0,
          totalTokens: 0,
          totalResponseTimeMs: 0,
          avgResponseTimeMs: 0,
          avgTokensPerTask: 0,
          successRate: 100,
          qualityScore: 50,   // 0-100, starts neutral
          streakCount: 0,     // consecutive successes
          bestStreak: 0,
          lastTaskTime: null,
          promotions: 0,      // times promoted to lead
          demotions: 0,       // times demoted from lead
          history: [],        // last 20 task outcomes
          // Tier system (0=Probation, 1=Active, 2=Proven, 3=Elite)
          tier: 1,
          tierHistory: [],    // [{time, from, to, reason}]
          // Weekly cycle tracking
          weeklyTasks: 0,
          weeklyFailed: 0,
          weeklyStagingApprovals: 0,
          weeklyStagingRejections: 0,
          weeklyPeerTasks: 0,  // tasks delegated by peers, completed successfully
          weeklyChampion: false,
        };
      }
      // Backfill tier fields for existing agents (migration from pre-tier data)
      const m = this.metrics[agentId];
      if (m.tier === undefined) m.tier = 1;
      if (!m.tierHistory) m.tierHistory = [];
      if (m.weeklyTasks === undefined) m.weeklyTasks = 0;
      if (m.weeklyFailed === undefined) m.weeklyFailed = 0;
      if (m.weeklyStagingApprovals === undefined) m.weeklyStagingApprovals = 0;
      if (m.weeklyStagingRejections === undefined) m.weeklyStagingRejections = 0;
      if (m.weeklyPeerTasks === undefined) m.weeklyPeerTasks = 0;
      if (m.weeklyChampion === undefined) m.weeklyChampion = false;
      return m;
    },

    // Record a completed task
    recordTask(agentId, { success = true, tokens = 0, responseTimeMs = 0, taskType = 'chat', delegatedBy = null } = {}) {
      const m = this._getMetrics(agentId);

      if (success) {
        m.tasksCompleted++;
        m.streakCount++;
        if (m.streakCount > m.bestStreak) m.bestStreak = m.streakCount;
        // Quality rises on success (diminishing returns)
        m.qualityScore = Math.min(100, m.qualityScore + Math.max(1, Math.round((100 - m.qualityScore) * 0.1)));
        m.weeklyTasks++;
        if (delegatedBy) m.weeklyPeerTasks++;
      } else {
        m.tasksFailed++;
        m.streakCount = 0;
        // Quality drops faster on failure
        m.qualityScore = Math.max(0, m.qualityScore - 5);
        m.weeklyFailed++;
      }

      m.totalTokens += tokens;
      m.totalResponseTimeMs += responseTimeMs;
      m.lastTaskTime = Date.now();

      const total = m.tasksCompleted + m.tasksFailed;
      m.successRate = total > 0 ? Math.round((m.tasksCompleted / total) * 100) : 100;
      m.avgResponseTimeMs = total > 0 ? Math.round(m.totalResponseTimeMs / total) : 0;
      m.avgTokensPerTask = m.tasksCompleted > 0 ? Math.round(m.totalTokens / m.tasksCompleted) : 0;

      // Keep last 20 task outcomes
      m.history.push({ time: Date.now(), success, tokens, taskType });
      if (m.history.length > 20) m.history.shift();

      this._persist();

      // Skip automatic tier changes, promotions, and weekly evaluations when paused.
      // Raw stats above still tracked — only the automated consequences are disabled.
      if (!this.paused) {
        this._evaluateTier(agentId);
        this._evaluateLeadership(agentId);
        this._checkWeeklyEvaluation();
      }
    },

    // Record a staging approval/rejection (called from staging store)
    recordStagingResult(agentId, approved) {
      const m = this._getMetrics(agentId);
      if (approved) {
        m.weeklyStagingApprovals++;
      } else {
        m.weeklyStagingRejections++;
      }
      this._persist();
    },

    // Calculate a composite performance score (0-100)
    getScore(agentId) {
      const m = this._getMetrics(agentId);
      const total = m.tasksCompleted + m.tasksFailed;
      if (total < 2) return 50; // not enough data

      // Weighted composite: success rate (40%), quality (30%), efficiency (20%), streak (10%)
      const successComponent = m.successRate * 0.4;
      const qualityComponent = m.qualityScore * 0.3;

      // Efficiency: lower avg tokens = better (normalize to 0-100)
      const avgTokensNorm = m.avgTokensPerTask > 0 ? Math.max(0, 100 - (m.avgTokensPerTask / 100)) : 50;
      const efficiencyComponent = avgTokensNorm * 0.2;

      // Streak bonus
      const streakComponent = Math.min(100, m.streakCount * 15) * 0.1;

      return Math.round(successComponent + qualityComponent + efficiencyComponent + streakComponent);
    },

    // Get ranked agents for a team (sorted by performance score)
    getLeaderboard(teamId) {
      const team = this.teams.find(t => t.id === teamId);
      if (!team) return [];

      return team.members
        .map(agentId => {
          const agent = Alpine.store('agents').list.find(a => a.id === agentId);
          const m = this._getMetrics(agentId);
          return {
            id: agentId,
            name: agent?.name || agentId,
            emoji: agent?.emoji || '🤖',
            model: (agent?.model || 'unknown').replace('litellm/', ''),
            score: this.getScore(agentId),
            weeklyScore: this.getWeeklyScore(agentId),
            tasksCompleted: m.tasksCompleted,
            successRate: m.successRate,
            qualityScore: m.qualityScore,
            streakCount: m.streakCount,
            bestStreak: m.bestStreak,
            isLead: team.lead === agentId,
            tier: m.tier,
            tierName: this.TIER_NAMES[m.tier] || 'Active',
            tierColor: this.TIER_COLORS[m.tier] || 'gray',
            weeklyTasks: m.weeklyTasks,
            weeklyStagingApprovals: m.weeklyStagingApprovals,
            weeklyChampion: m.weeklyChampion,
          };
        })
        .sort((a, b) => b.score - a.score);
    },

    // Evaluate if the top performer should replace the current team lead
    _evaluateLeadership(agentId) {
      for (const team of this.teams) {
        if (!team.members.includes(agentId)) continue;

        const leaderboard = this.getLeaderboard(team.id);
        if (leaderboard.length < 2) continue;

        const topPerformer = leaderboard[0];
        const currentLead = leaderboard.find(a => a.isLead);

        // Promotion criteria: top performer must have >10 tasks, score 15+ points
        // above current lead, and current lead must have at least 5 tasks
        if (
          topPerformer.id !== team.lead &&
          topPerformer.tasksCompleted >= 10 &&
          currentLead &&
          currentLead.tasksCompleted >= 5 &&
          topPerformer.score - currentLead.score >= 15
        ) {
          const oldLead = team.lead;
          team.lead = topPerformer.id;

          // Track promotion/demotion counts
          this._getMetrics(topPerformer.id).promotions++;
          this._getMetrics(oldLead).demotions++;

          Alpine.store('monitor').addLog('info',
            `🏆 ${topPerformer.emoji} ${topPerformer.name} promoted to ${team.name} lead (score: ${topPerformer.score} vs ${currentLead.score})`
          );

          this._persist();
        }
      }
    },

    // ---- TIER SYSTEM ----

    // Get tier name for display
    getTierName(agentId) {
      const m = this._getMetrics(agentId);
      return this.TIER_NAMES[m.tier] || 'Active';
    },

    getTierColor(agentId) {
      const m = this._getMetrics(agentId);
      return this.TIER_COLORS[m.tier] || 'gray';
    },

    // Evaluate whether an agent should tier up or down
    _evaluateTier(agentId) {
      const m = this._getMetrics(agentId);
      const score = this.getScore(agentId);
      const total = m.tasksCompleted + m.tasksFailed;
      const oldTier = m.tier;

      // Tier 0 (Probation) escape: 5 consecutive successes
      if (m.tier === 0 && m.streakCount >= 5) {
        this._setTier(agentId, 1, 'Escaped probation with 5-streak');
        return;
      }

      // Drop to Probation: score < 30 and 5+ failures
      if (m.tier > 0 && score < 30 && m.tasksFailed >= 5) {
        this._setTier(agentId, 0, `Score ${score} with ${m.tasksFailed} failures`);
        return;
      }

      // Drop one tier: score < 40 (but not to probation unless criteria above met)
      if (m.tier > 1 && score < 40) {
        this._setTier(agentId, m.tier - 1, `Score dropped to ${score}`);
        return;
      }

      // Tier up to Proven (2): score >= 70, 15+ tasks, streak >= 3
      if (m.tier === 1 && score >= 70 && total >= 15 && m.streakCount >= 3) {
        this._setTier(agentId, 2, `Score ${score}, ${total} tasks, ${m.streakCount}-streak`);
        return;
      }

      // Elite (3) is ONLY awarded via weekly evaluation (champion) or manual promotion
      // But Elite agents CAN be demoted if they underperform
      if (m.tier === 3 && score < 55) {
        this._setTier(agentId, 2, `Elite dropped: score fell to ${score}`);
      }
    },

    _setTier(agentId, newTier, reason) {
      const m = this._getMetrics(agentId);
      const oldTier = m.tier;
      if (oldTier === newTier) return;

      m.tier = newTier;
      m.tierHistory.push({ time: Date.now(), from: oldTier, to: newTier, reason });
      if (m.tierHistory.length > 20) m.tierHistory.shift();

      const agent = Alpine.store('agents').list.find(a => a.id === agentId);
      const name = agent?.name || agentId;
      const emoji = agent?.emoji || '';
      const direction = newTier > oldTier ? 'promoted' : 'demoted';
      Alpine.store('monitor').addLog(
        newTier > oldTier ? 'info' : 'warn',
        `${emoji} ${name} ${direction} to ${this.TIER_NAMES[newTier]}: ${reason}`
      );
      this._persist();
    },

    // Get perks for an agent's current tier
    getTierPerks(agentId) {
      const m = this._getMetrics(agentId);
      return this.TIER_PERKS[m.tier] || this.TIER_PERKS[1];
    },

    // Check if agent has Oracle Cloud access (Elite only)
    hasOracleAccess(agentId) {
      const m = this._getMetrics(agentId);
      return m.tier >= 3;
    },

    // ---- WEEKLY EVALUATION CYCLE ----

    getWeekDaysRemaining() {
      const elapsed = Date.now() - this.week.startDate;
      const remaining = (7 * 24 * 60 * 60 * 1000) - elapsed;
      return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
    },

    getWeekProgress() {
      const elapsed = Date.now() - this.week.startDate;
      return Math.min(100, Math.round((elapsed / (7 * 24 * 60 * 60 * 1000)) * 100));
    },

    // Composite weekly score — measures DELIVERED VALUE, not just task count
    getWeeklyScore(agentId) {
      const m = this._getMetrics(agentId);
      const weekTotal = m.weeklyTasks + m.weeklyFailed;
      if (weekTotal < 1) return 0;

      // Tasks delivered (25%)
      const taskComponent = Math.min(100, m.weeklyTasks * 5) * 0.25;

      // Staging approvals (30%) — owner-verified quality, can't be gamed
      const stagingTotal = m.weeklyStagingApprovals + m.weeklyStagingRejections;
      const stagingRate = stagingTotal > 0 ? (m.weeklyStagingApprovals / stagingTotal) * 100 : 0;
      const stagingVolume = Math.min(100, m.weeklyStagingApprovals * 20); // bonus for volume
      const stagingComponent = ((stagingRate * 0.6) + (stagingVolume * 0.4)) * 0.30;

      // Streak quality (15%)
      const streakComponent = Math.min(100, m.streakCount * 15) * 0.15;

      // Efficiency (15%) — lower avg tokens = better
      const avgTokensNorm = m.avgTokensPerTask > 0 ? Math.max(0, 100 - (m.avgTokensPerTask / 100)) : 50;
      const efficiencyComponent = avgTokensNorm * 0.15;

      // Peer contribution (15%) — tasks delegated by teammates, completed successfully
      const peerComponent = Math.min(100, m.weeklyPeerTasks * 15) * 0.15;

      return Math.round(taskComponent + stagingComponent + streakComponent + efficiencyComponent + peerComponent);
    },

    _checkWeeklyEvaluation() {
      const elapsed = Date.now() - this.week.startDate;
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      if (elapsed < weekMs) return; // not time yet

      this._runWeeklyEvaluation();
    },

    _runWeeklyEvaluation() {
      const snapshot = { week: this.week.number, date: Date.now(), teams: {} };

      for (const team of this.teams) {
        const results = team.members.map(agentId => {
          const m = this._getMetrics(agentId);
          const agent = Alpine.store('agents').list.find(a => a.id === agentId);
          return {
            id: agentId,
            name: agent?.name || agentId,
            emoji: agent?.emoji || '',
            weeklyScore: this.getWeeklyScore(agentId),
            weeklyTasks: m.weeklyTasks,
            weeklyFailed: m.weeklyFailed,
            weeklyStagingApprovals: m.weeklyStagingApprovals,
            tier: m.tier,
          };
        }).sort((a, b) => b.weeklyScore - a.weeklyScore);

        snapshot.teams[team.id] = results;

        // Champion: highest weekly score with at least 3 tasks delivered
        const champion = results.find(r => r.weeklyTasks >= 3);
        if (champion) {
          const m = this._getMetrics(champion.id);

          // Award Elite (Tier 3) to champion
          if (m.tier < 3) {
            // Demote any existing Elite on this team first (max 1 per team)
            for (const memberId of team.members) {
              if (memberId !== champion.id) {
                const mm = this._getMetrics(memberId);
                if (mm.tier === 3) {
                  this._setTier(memberId, 2, `Weekly champion replaced by ${champion.name}`);
                }
              }
            }
            this._setTier(champion.id, 3, `Week ${this.week.number} champion (score: ${champion.weeklyScore})`);
          }
          m.weeklyChampion = true;

          // Champion becomes team lead
          if (team.lead !== champion.id) {
            const oldLead = team.lead;
            team.lead = champion.id;
            this._getMetrics(champion.id).promotions++;
            if (oldLead) this._getMetrics(oldLead).demotions++;
            Alpine.store('monitor').addLog('info',
              `🏆 ${champion.emoji} ${champion.name} is Week ${this.week.number} champion — promoted to ${team.name} lead!`
            );
          } else {
            Alpine.store('monitor').addLog('info',
              `🏆 ${champion.emoji} ${champion.name} retains ${team.name} lead as Week ${this.week.number} champion!`
            );
          }
        }
      }

      // Save snapshot
      this.week.evaluations.push(snapshot);
      if (this.week.evaluations.length > 12) this.week.evaluations.shift(); // keep 12 weeks

      // Reset weekly counters for all agents
      for (const agentId of Object.keys(this.metrics)) {
        const m = this.metrics[agentId];
        m.weeklyTasks = 0;
        m.weeklyFailed = 0;
        m.weeklyStagingApprovals = 0;
        m.weeklyStagingRejections = 0;
        m.weeklyPeerTasks = 0;
        m.weeklyChampion = false;
      }

      // Advance week
      this.week.number++;
      this.week.startDate = Date.now();

      storage.save('governance-week', this.week);
      this._persist();
    },

    // Force a weekly evaluation (owner can trigger manually)
    forceWeeklyEval() {
      this._runWeeklyEvaluation();
    },

    // Get past champion history
    getChampionHistory() {
      const history = [];
      for (const eval_ of this.week.evaluations) {
        for (const [teamId, results] of Object.entries(eval_.teams || {})) {
          const champ = results[0]; // sorted by weeklyScore desc
          if (champ && champ.weeklyTasks >= 3) {
            history.push({
              week: eval_.week,
              date: eval_.date,
              teamId,
              ...champ,
            });
          }
        }
      }
      return history.reverse(); // most recent first
    },

    // Manually promote an agent to team lead
    promoteLead(teamId, agentId) {
      const team = this.teams.find(t => t.id === teamId);
      if (!team || !team.members.includes(agentId)) return;

      const oldLead = team.lead;
      team.lead = agentId;
      this._getMetrics(agentId).promotions++;
      if (oldLead) this._getMetrics(oldLead).demotions++;

      const agent = Alpine.store('agents').list.find(a => a.id === agentId);
      Alpine.store('monitor').addLog('info',
        `${agent?.emoji || '🤖'} ${agent?.name || agentId} manually promoted to ${team.name} lead`
      );
      this._persist();
    },

    // Create a new team
    createTeam(name, memberIds, leadId) {
      const team = {
        id: 'team-' + Date.now().toString(36),
        name,
        lead: leadId || memberIds[0],
        members: memberIds,
        project: '',
      };
      this.teams.push(team);
      this._persist();
      Alpine.store('monitor').addLog('info', `Team "${name}" created with ${memberIds.length} members`);
      return team;
    },

    _persist() {
      storage.save('governance-metrics', this.metrics);
      storage.save('governance-teams', this.teams);
      storage.save('governance-week', this.week);

      // Debounced sync to shared volume (every 30s max)
      if (window.workflowBridge && !this._syncPending) {
        this._syncPending = true;
        setTimeout(() => {
          this._syncPending = false;
          window.workflowBridge.syncGovernance();
        }, 30000);
      }
    },
  });

  // --------------------------------------------------------------------------
  // STORE: CRON — per-agent scheduled job management
  // --------------------------------------------------------------------------

  Alpine.store('cron', {
    jobs: [],          // all cron jobs from OpenClaw
    loading: false,
    activeAgent: null, // agent ID whose popover is open
    error: null,

    // Jobs filtered by agent ID (matches job.agentId or sessionKey containing the agent)
    forAgent(agentId) {
      return this.jobs.filter(j => {
        if (j.agentId === agentId) return true;
        // sessionKey format: "agent:<id>:main" or similar
        if (j.sessionKey && j.sessionKey.includes(`:${agentId}:`)) return true;
        if (j.agent === agentId) return true;
        return false;
      });
    },

    countForAgent(agentId) {
      return this.forAgent(agentId).length;
    },

    // Convert cron job schedule to human-readable text
    formatSchedule(job) {
      const s = job.schedule;
      if (!s) return job.cron || job.every || '\u2014';
      if (typeof s === 'string') return s;
      if (typeof s !== 'object') return String(s);
      // Cron expression
      if (s.expression) return s.expression;
      // everyMs — convert ms to readable interval
      if (s.everyMs) {
        const ms = s.everyMs;
        if (ms >= 86400000) return `Every ${Math.round(ms / 86400000)}d`;
        if (ms >= 3600000) return `Every ${Math.round(ms / 3600000)}h`;
        if (ms >= 60000) return `Every ${Math.round(ms / 60000)}m`;
        return `Every ${Math.round(ms / 1000)}s`;
      }
      // Named every (e.g. "5m", "1h")
      if (s.every) return `Every ${s.every}`;
      // One-shot "at" timestamp
      if (s.at) {
        try { return `At ${new Date(s.at).toLocaleString()}`; } catch(e) { return `At ${s.at}`; }
      }
      // kind label as last resort before raw JSON
      if (s.kind) return `${s.kind} schedule`;
      return JSON.stringify(s);
    },

    async fetch() {
      if (!window.openclawClient?.authenticated) return;
      this.loading = true;
      this.error = null;
      try {
        const jobs = await window.openclawClient.listCronJobs();
        this.jobs = Array.isArray(jobs) ? jobs : [];
      } catch (err) {
        this.error = err.message;
        console.warn('[Cron] Fetch failed:', err.message);
      } finally {
        this.loading = false;
      }
    },

    toggle(agentId) {
      if (this.activeAgent === agentId) {
        this.activeAgent = null;
      } else {
        this.activeAgent = agentId;
        this.fetch(); // refresh on open
      }
    },

    close() {
      this.activeAgent = null;
    },

    async remove(jobId) {
      if (!window.openclawClient?.authenticated) return;
      try {
        await window.openclawClient.removeCronJob(jobId);
        this.jobs = this.jobs.filter(j => (j.id || j.jobId) !== jobId);
        Alpine.store('monitor').addLog('info', `Cron job ${jobId} removed`);
      } catch (err) {
        Alpine.store('monitor').addLog('error', `Failed to remove cron job: ${err.message}`);
      }
    },

    async runNow(jobId) {
      if (!window.openclawClient?.authenticated) return;
      try {
        await window.openclawClient.runCronJob(jobId);
        Alpine.store('monitor').addLog('info', `Cron job ${jobId} triggered`);
      } catch (err) {
        Alpine.store('monitor').addLog('error', `Failed to run cron job: ${err.message}`);
      }
    },

    async addQuick(agentId, { label, schedule, message }) {
      if (!window.openclawClient?.authenticated) return;
      try {
        await window.openclawClient.addCronJob({
          agentId,
          label: label || 'Quick task',
          schedule,
          payload: { kind: 'systemEvent', message },
          session: 'main',
        });
        Alpine.store('monitor').addLog('info', `Cron job added for ${agentId}`);
        await this.fetch(); // refresh list
      } catch (err) {
        Alpine.store('monitor').addLog('error', `Failed to add cron job: ${err.message}`);
      }
    },
  });

  // --------------------------------------------------------------------------
  // STORE: SETTINGS — sidebar customization & preferences
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  // STORE: STAGING — agent-generated content preview & approval
  // --------------------------------------------------------------------------

  Alpine.store('staging', {
    items: [],
    selectedId: null,
    _pollTimer: null,
    _localStatuses: {},  // id → status — persists approval/rejection across poll cycles
    _rejectingId: null,  // id of item being rejected (inline form)
    _rejectReason: '',   // rejection reason text

    init() {
      this._localStatuses = storage.load('staging-statuses', {});
    },

    get selected() {
      return this.items.find(i => i.id === this.selectedId) || null;
    },

    get pendingCount() {
      return this.items.filter(i => i.status === 'pending').length;
    },

    startPolling(intervalMs = 15000) {
      this.stopPolling();
      this._poll();
      this._pollTimer = setInterval(() => this._poll(), intervalMs);
    },

    stopPolling() {
      if (this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
    },

    async _poll() {
      try {
        const prevPending = this.pendingCount;
        const resp = await fetch('/workspace/staging/index.json', {
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) return;
        const data = await resp.json();
        this.items = (data.items || []).map(item => {
          const id = item.id || item.path;
          const serverStatus = item.status || 'pending';
          const localStatus = this._localStatuses[id];
          let status;
          if (localStatus === 'rejected' && serverStatus === 'pending') {
            // Agent resubmitted after rejection — clear override, show as pending again
            delete this._localStatuses[id];
            storage.save('staging-statuses', this._localStatuses);
            status = 'pending';
          } else if (localStatus && serverStatus === 'pending') {
            // Local approval/rejection overrides server until server catches up
            status = localStatus;
          } else {
            status = serverStatus;
          }
          // Clear local override once server matches
          if (localStatus && serverStatus === localStatus) {
            delete this._localStatuses[id];
            storage.save('staging-statuses', this._localStatuses);
          }
          return {
            id,
            name: item.name || item.path,
            path: item.path,
            type: item.type || 'html',
            createdBy: item.createdBy || 'agent',
            createdAt: item.createdAt || Date.now(),
            description: item.description || '',
            status,
            previewUrl: '/workspace/staging/' + item.path,
          };
        });
        // Notify if new pending items appeared
        if (this.pendingCount > prevPending) mcAudio.stagingNew();
      } catch {}
    },

    approve(id) {
      const item = this.items.find(i => i.id === id);
      if (!item) return;
      item.status = 'approved';
      this._localStatuses[id] = 'approved';
      storage.save('staging-statuses', this._localStatuses);
      Alpine.store('monitor').addLog('info', `Staging item "${item.name}" approved`);

      if (window.openclawClient?.authenticated) {
        const agentId = item.createdBy !== 'user' ? item.createdBy : 'lead';
        window.openclawClient.injectChat(
          `STAGING_APPROVED: ${item.name} (${item.path}) has been approved by the owner. Please update /workspace/staging/index.json to set status to "approved".`,
          { sessionKey: 'agent:' + agentId + ':main', label: 'system-staging' }
        ).catch(() => {});
      }

      Alpine.store('governance')?.recordTask(item.createdBy, {
        success: true,
        taskType: 'staging-approved',
      });
      Alpine.store('governance')?.recordStagingResult(item.createdBy, true);
      mcAudio.stagingApproved();
    },

    reject(id, reason) {
      const item = this.items.find(i => i.id === id);
      if (!item) return;
      item.status = 'rejected';
      this._localStatuses[id] = 'rejected';
      storage.save('staging-statuses', this._localStatuses);
      Alpine.store('monitor').addLog('info', `Staging item "${item.name}" rejected: ${reason || 'no reason'}`);

      if (window.openclawClient?.authenticated) {
        const agentId = item.createdBy !== 'user' ? item.createdBy : 'lead';
        const feedback = reason ? `\n\nOwner feedback: "${reason}"` : '';
        window.openclawClient.injectChat(
          `STAGING_REJECTED: "${item.name}" (${item.path}) was rejected by the owner.${feedback}\n\nACTION REQUIRED — autonomously fix and resubmit:\n1. Read the rejected file: read(path: "/workspace/staging/${item.path}")\n2. Apply the owner's feedback to fix the issues\n3. Write the corrected version to the SAME path: write(path: "/workspace/staging/${item.path}", content: "...")\n4. Update /workspace/staging/index.json — set this item's status back to "pending"\n5. Log the resubmission to /workspace/agent-activity/log.json\n\nDo NOT ask the owner for clarification — interpret the feedback and fix it now. The owner will review the updated version automatically.`,
          { sessionKey: 'agent:' + agentId + ':main', label: 'system-staging' }
        ).catch(() => {});
      }

      Alpine.store('governance')?.recordTask(item.createdBy, {
        success: false,
        taskType: 'staging-rejected',
      });
      Alpine.store('governance')?.recordStagingResult(item.createdBy, false);
      mcAudio.taskFail();
    },
  });

  // --------------------------------------------------------------------------
  // STORE: ACTIVITY — comprehensive mission control event feed
  // --------------------------------------------------------------------------
  // Two data sources:
  // 1. Server-side log.json (polled) — events agents wrote while browser closed
  // 2. Live WS events (pushed) — real-time tool calls, comms, errors, file ops
  // --------------------------------------------------------------------------

  Alpine.store('activity', {
    events: [],        // { time, level, type, message, agent, detail?, source }
    liveEvents: [],    // WS events captured in real-time (survives poll merge)
    newCount: 0,       // events since last dismissal
    filter: 'all',     // filter key
    agentFilter: 'all', // 'all' | specific agent id
    _pollTimer: null,
    _lastFetchTime: 0,
    _maxEvents: 500,

    get filtered() {
      let list = this.events;
      // Agent filter
      if (this.agentFilter !== 'all') {
        list = list.filter(e => e.agent === this.agentFilter);
      }
      // Type filter
      if (this.filter === 'all') return list;
      if (this.filter === 'error') return list.filter(e => e.level === 'error' || e.type === 'error');
      return list.filter(e => e.type === this.filter);
    },

    get agents() {
      // Unique agents that have events, for filter dropdown
      const seen = new Set();
      for (const e of this.events) {
        if (e.agent) seen.add(e.agent);
      }
      return [...seen].sort();
    },

    // Push a live event from WS (tool call, chat, error, etc.)
    pushEvent(ev) {
      const event = {
        time: ev.time || Date.now(),
        level: ev.level || 'info',
        type: ev.type || 'system',
        message: ev.message || '',
        agent: ev.agent || '',
        detail: ev.detail || '',
        source: 'live',
      };
      this.events.unshift(event);
      this.liveEvents.unshift(event);
      // Cap size
      if (this.events.length > this._maxEvents) this.events.length = this._maxEvents;
      if (this.liveEvents.length > 200) this.liveEvents.length = 200;
      // Update badge
      const lastSeen = parseInt(localStorage.getItem('mc-last-activity-seen') || '0');
      if (event.time > lastSeen) {
        this.newCount++;
        mcAudio.activityEvent();
      }
    },

    startPolling(intervalMs = 15000) {
      this.stopPolling();
      this._poll();
      this._pollTimer = setInterval(() => this._poll(), intervalMs);
    },

    stopPolling() {
      if (this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
    },

    async _poll() {
      try {
        const resp = await fetch('/workspace/agent-activity/log.json', {
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const serverEvents = (data.events || []).sort((a, b) => (b.time || 0) - (a.time || 0));

        if (serverEvents.length > 0 && serverEvents[0]?.time !== this._lastFetchTime) {
          const prevCount = this.newCount;
          this._lastFetchTime = serverEvents[0].time;

          // Merge server events with live WS events (dedup by time+message)
          const serverMapped = serverEvents.slice(0, 200).map(e => ({
            time: e.time || Date.now(),
            level: e.level || 'info',
            type: e.type || 'unknown',
            message: e.message || '',
            agent: e.agent || e.createdBy || '',
            detail: e.detail || '',
            source: 'server',
          }));
          // Combine: live events + server events, dedup, sort newest first
          const combined = new Map();
          for (const e of this.liveEvents) combined.set(e.time + '|' + e.message, e);
          for (const e of serverMapped) {
            const key = e.time + '|' + e.message;
            if (!combined.has(key)) combined.set(key, e);
          }
          this.events = [...combined.values()]
            .sort((a, b) => b.time - a.time)
            .slice(0, this._maxEvents);

          // Count events since last visit for badge
          const lastSeen = parseInt(localStorage.getItem('mc-last-activity-seen') || '0');
          this.newCount = this.events.filter(e => e.time > lastSeen).length;
          if (this.newCount > prevCount) mcAudio.activityEvent();
        }
      } catch {}
    },

    dismissNew() {
      this.newCount = 0;
      localStorage.setItem('mc-last-activity-seen', Date.now().toString());
    },

    formatTime(ts) {
      const diff = Date.now() - ts;
      if (diff < 60000) return 'just now';
      if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
      if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
      return Math.floor(diff / 86400000) + 'd ago';
    },

    typeColor(type) {
      const colors = {
        'task-complete': 'text-emerald-400',
        'workflow-complete': 'text-cyan-400',
        'staging-new': 'text-amber-400',
        'comms': 'text-violet-400',
        'tool': 'text-blue-400',
        'file-op': 'text-teal-400',
        'chat': 'text-cyan-400',
        'error': 'text-red-400',
        'rate-limit': 'text-orange-400',
        'system': 'text-mc-text-muted',
      };
      return colors[type] || 'text-mc-text-muted';
    },

    typeLabel(type) {
      const labels = {
        'task-complete': 'Task',
        'workflow-complete': 'Workflow',
        'staging-new': 'Staging',
        'comms': 'Comms',
        'tool': 'Tool',
        'file-op': 'File',
        'chat': 'Chat',
        'error': 'Error',
        'rate-limit': 'Rate Limit',
        'system': 'System',
      };
      return labels[type] || type;
    },

    typeIcon(type) {
      const icons = {
        'task-complete': '\u2705', 'workflow-complete': '\u26A1',
        'staging-new': '\uD83D\uDCE6', 'comms': '\uD83D\uDCAC',
        'tool': '\uD83D\uDD27', 'file-op': '\uD83D\uDCC4',
        'chat': '\uD83D\uDDE8\uFE0F', 'error': '\u274C',
        'rate-limit': '\u23F3', 'system': '\u2699\uFE0F',
      };
      return icons[type] || '\u2022';
    },
  });

  Alpine.store('settings', {
    // Which sidebar nav items are visible (all default to true)
    sidebar: {
      dashboard: true,
      agents: true,
      workflows: true,
      chat: true,
      teams: true,
      monitor: true,
      staging: true,
      activity: true,
    },
    // Audio notification preferences
    audio: {
      enabled: true,
      volume: 60,        // 0-100
      chat: true,        // Chat response complete
      tasks: true,       // Governance task success/fail
      staging: true,     // New staging items, approval/rejection
      workflows: true,   // Workflow execution complete
      activity: true,    // Background agent events
      errors: true,      // Monitor error alerts
    },
    settingsOpen: false,

    init() {
      const saved = storage.load('settings', null);
      if (saved && saved.sidebar) {
        this.sidebar = { ...this.sidebar, ...saved.sidebar };
      }
      if (saved && saved.audio) {
        this.audio = { ...this.audio, ...saved.audio };
      }
    },

    toggle(key) {
      if (this.sidebar.hasOwnProperty(key)) {
        this.sidebar[key] = !this.sidebar[key];
        this._persist();
        // If the hidden view is currently active, switch to dashboard
        if (!this.sidebar[key] && Alpine.store('app').view === key) {
          Alpine.store('app').setView('dashboard');
        }
      }
    },

    toggleAudio(key) {
      if (key === 'enabled') {
        this.audio.enabled = !this.audio.enabled;
      } else if (this.audio.hasOwnProperty(key)) {
        this.audio[key] = !this.audio[key];
      }
      this._persist();
    },

    setVolume(val) {
      this.audio.volume = Math.max(0, Math.min(100, parseInt(val) || 0));
      this._persist();
    },

    isVisible(key) {
      return this.sidebar[key] !== false;
    },

    _persist() {
      storage.save('settings', {
        sidebar: { ...this.sidebar },
        audio: { ...this.audio },
      });
    },
  });

  // --------------------------------------------------------------------------
  // BOOT — only auto-boot if already authenticated
  // --------------------------------------------------------------------------

  if (Alpine.store('auth').ok) {
    Alpine.store('app').boot();
  }
});

// Expose for HTML templates
window.FALLBACK_MODELS = FALLBACK_MODELS;
window.AGENT_EMOJIS = AGENT_EMOJIS;
window.AGENT_TOOLS = AGENT_TOOLS;
window.formatTokens = formatTokens;
window.litellmApi = litellmApi;
```

---

# [12] workspace/js/workflow.js (1274 lines) — LiteGraph nodes + executor

```
// ============================================================================
// Mission Control — workflow.js
// LiteGraph.js custom node types, canvas initialization, and workflow executor
// Nodes execute real OpenClaw/LiteLLM calls when the workflow runs
// in-fused.org
// ============================================================================

window.workflowGraph = null;
window.workflowCanvas = null;

// ============================================================================
// TOUCH-TO-MOUSE BRIDGE — makes LiteGraph canvas fully usable on mobile
// Translates touch events into mouse events the canvas understands.
// Supports: single-finger pan/drag, two-finger pinch-zoom.
// ============================================================================

function _bridgeTouchEvents(canvasEl) {
  // Only apply on touch-capable devices
  if (!('ontouchstart' in window)) return;

  let _lastPinchDist = 0;
  let _isPinching = false;

  function touchToMouse(type, touch, e) {
    const mouseEvent = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: touch.clientX,
      clientY: touch.clientY,
      button: 0,
      buttons: type === 'mouseup' ? 0 : 1,
    });
    mouseEvent._fromTouch = true;
    canvasEl.dispatchEvent(mouseEvent);
    e.preventDefault();
  }

  canvasEl.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1 && !_isPinching) {
      touchToMouse('mousedown', e.touches[0], e);
    } else if (e.touches.length === 2) {
      // Cancel any in-progress single-finger drag before starting pinch
      if (!_isPinching) {
        touchToMouse('mouseup', e.touches[0], e);
      }
      _isPinching = true;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      _lastPinchDist = Math.sqrt(dx * dx + dy * dy);
      e.preventDefault();
    }
  }, { passive: false });

  canvasEl.addEventListener('touchmove', function (e) {
    if (e.touches.length === 1 && !_isPinching) {
      touchToMouse('mousemove', e.touches[0], e);
    } else if (e.touches.length === 2 && _isPinching && window.workflowCanvas) {
      // Pinch zoom — directly manipulate LiteGraph's DragAndScale
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (_lastPinchDist > 0) {
        const scaleFactor = dist / _lastPinchDist;
        const canvas = window.workflowCanvas;
        const rect = canvasEl.getBoundingClientRect();
        // Zoom toward the midpoint between the two fingers
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        const newScale = Math.max(0.15, Math.min(4, canvas.ds.scale * scaleFactor));
        canvas.ds.changeScale(newScale, [midX, midY]);
        canvas.setDirty(true, true);
      }
      _lastPinchDist = dist;
      e.preventDefault();
    }
  }, { passive: false });

  canvasEl.addEventListener('touchend', function (e) {
    if (e.touches.length === 0) {
      if (_isPinching) {
        // Pinch ended — don't fire mouseup (no drag was active)
        _isPinching = false;
      } else if (e.changedTouches.length > 0) {
        touchToMouse('mouseup', e.changedTouches[0], e);
      }
      _lastPinchDist = 0;
    } else if (e.touches.length === 1 && _isPinching) {
      // Went from 2→1 fingers: stay idle, don't start a new drag
      _lastPinchDist = 0;
    }
  }, { passive: false });

  canvasEl.addEventListener('touchcancel', function (e) {
    if (!_isPinching && e.changedTouches.length > 0) {
      touchToMouse('mouseup', e.changedTouches[0], e);
    }
    _isPinching = false;
    _lastPinchDist = 0;
  }, { passive: false });
}

function _resizeCanvas(container) {
  const rect = container.parentElement.getBoundingClientRect();
  container.width = rect.width;
  container.height = rect.height;
  if (window.workflowCanvas) window.workflowCanvas.resize();
}

function initWorkflowCanvas() {
  if (typeof LiteGraph === 'undefined') {
    console.warn('LiteGraph not loaded yet');
    return;
  }

  const container = document.getElementById('workflow-canvas');
  if (!container) return;

  // Already mounted: just resize and ensure the active workflow is loaded
  if (window.workflowCanvas && window.workflowCanvas._mounted) {
    _resizeCanvas(container);
    // Re-load active workflow if the graph is empty but we have saved data
    const wfStore = Alpine?.store('workflows');
    if (wfStore?.activeId && window.workflowGraph?._nodes?.length === 0) {
      const data = localStorage.getItem('mc-workflow-' + wfStore.activeId);
      if (data) {
        try { window.workflowGraph.configure(JSON.parse(data)); } catch {}
      }
    }
    return;
  }

  if (!LiteGraph.registered_node_types['mission/agent']) {
    registerCustomNodes();
  }

  const graph = new LiteGraph.LGraph();
  const canvas = new LiteGraph.LGraphCanvas(container, graph);

  // Dark theme
  canvas.background_image = null;
  canvas.clear_background_color = '#0a0e17';
  canvas.default_link_color = '#06b6d4';
  canvas.highquality_render = true;
  canvas.render_shadows = false;
  canvas.render_curved_connections = true;
  canvas.connections_width = 2;

  // Mobile / touch support
  canvas.allow_interaction = true;
  canvas.allow_dragnodes = true;
  canvas.allow_searchbox = false; // search popup is unusable on mobile

  // Touch-to-mouse bridge: LiteGraph's built-in touch handling is incomplete.
  // Synthesize mouse events from touch events so pan, drag, and node
  // interaction work on mobile/tablet.
  _bridgeTouchEvents(container);

  LiteGraph.NODE_DEFAULT_COLOR = '#1f2937';
  LiteGraph.NODE_DEFAULT_BGCOLOR = '#111827';
  LiteGraph.NODE_DEFAULT_BOXCOLOR = '#06b6d4';
  LiteGraph.NODE_TITLE_COLOR = '#f9fafb';
  LiteGraph.NODE_TEXT_COLOR = '#9ca3af';
  LiteGraph.LINK_COLOR = '#06b6d4';
  LiteGraph.EVENT_LINK_COLOR = '#8b5cf6';
  LiteGraph.WIDGET_BGCOLOR = '#0a0e17';
  LiteGraph.WIDGET_TEXT_COLOR = '#f9fafb';
  LiteGraph.WIDGET_SECONDARY_TEXT_COLOR = '#6b7280';

  window.workflowGraph = graph;
  window.workflowCanvas = canvas;
  canvas._mounted = true;

  graph.start();

  // Load the active workflow from store, or default if none active
  const wfStore = Alpine?.store('workflows');
  if (wfStore?.activeId) {
    // Validate the persisted activeId still exists in the list
    const exists = wfStore.list.some(w => w.id === wfStore.activeId);
    if (exists) {
      const data = localStorage.getItem('mc-workflow-' + wfStore.activeId);
      if (data) {
        try { graph.configure(JSON.parse(data)); } catch {}
      }
    } else {
      wfStore.activeId = null;
    }
  }
  if (graph._nodes.length === 0) {
    addDefaultWorkflow(graph);
  }

  _resizeCanvas(container);
  window.addEventListener('resize', () => _resizeCanvas(container));

  // Start auto-save
  if (wfStore) wfStore.setupAutoSave();
}

window.initWorkflowCanvas = initWorkflowCanvas;

// ============================================================================
// CUSTOM NODE TYPES
// ============================================================================

function registerCustomNodes() {

  // ------------------------------------------
  // TRIGGER NODE
  // ------------------------------------------
  function TriggerNode() {
    this.addOutput('prompt', 'string');
    this.addOutput('trigger', LiteGraph.EVENT);
    this.addWidget('text', 'Prompt', 'Enter your task description...', (v) => {
      this.properties.prompt = v;
    });
    this.addWidget('combo', 'Trigger', 'Manual', (v) => {
      this.properties.trigger = v;
      this._updateScheduleWidgets();
    }, { values: ['Manual', 'Scheduled', 'Webhook', 'On Event'] });
    this.properties = { prompt: '', trigger: 'Manual', cronExpression: '0 */6 * * *', cronJobId: null };
    this.size = [280, 120];
    this.color = '#064e3b';
    this.bgcolor = '#022c22';
    this._scheduleWidgets = [];
  }
  TriggerNode.title = 'Trigger';
  TriggerNode.desc = 'Workflow start point';

  TriggerNode.prototype._updateScheduleWidgets = function () {
    // Remove previous schedule widgets
    for (const w of this._scheduleWidgets) {
      const idx = this.widgets.indexOf(w);
      if (idx !== -1) this.widgets.splice(idx, 1);
    }
    this._scheduleWidgets = [];

    if (this.properties.trigger === 'Scheduled') {
      const cronWidget = this.addWidget('text', 'Cron', this.properties.cronExpression, (v) => {
        this.properties.cronExpression = v;
      });
      this._scheduleWidgets.push(cronWidget);

      const btnWidget = this.addWidget('button', this.properties.cronJobId ? 'Remove Schedule' : 'Save Schedule', '', () => {
        this._toggleCronJob();
      });
      this._scheduleWidgets.push(btnWidget);

      if (this.properties.cronJobId) {
        const statusWidget = this.addWidget('text', 'Job ID', this.properties.cronJobId, null);
        statusWidget.disabled = true;
        this._scheduleWidgets.push(statusWidget);
      }
      this.size[1] = this.properties.cronJobId ? 200 : 170;
    } else {
      this.size[1] = 120;
    }
    this.setDirtyCanvas(true);
  };

  TriggerNode.prototype._toggleCronJob = async function () {
    const cron = Alpine?.store('cron');
    if (!cron || !window.openclawClient?.authenticated) {
      Alpine?.store('monitor')?.addLog('warn', 'Cannot manage cron: OpenClaw not connected');
      return;
    }

    if (this.properties.cronJobId) {
      // Remove existing cron job
      await cron.remove(this.properties.cronJobId);
      this.properties.cronJobId = null;
      Alpine?.store('monitor')?.addLog('info', 'Scheduled trigger removed');
    } else {
      // Find the first Agent node downstream to determine target
      const graph = this.graph;
      let targetAgent = 'lead';
      if (graph) {
        const link = this.outputs[0]?.links?.[0];
        if (link != null) {
          const linkInfo = graph.links[link];
          if (linkInfo) {
            const targetNode = graph.getNodeById(linkInfo.target_id);
            if (targetNode?.properties?.agent) {
              targetAgent = targetNode.properties.agent.toLowerCase().replace(/\s+/g, '-');
              if (targetAgent === '(auto)') targetAgent = 'lead';
            }
          }
        }
      }
      // Determine workflow ID from the workflows store
      const wfStore = Alpine?.store('workflows');
      const wfId = wfStore?.active?.id || 'wf-' + Date.now();
      const wfName = wfStore?.active?.name || 'Scheduled Workflow';

      try {
        await window.openclawClient.addCronJob({
          agentId: targetAgent,
          label: `Workflow: ${wfName}`,
          schedule: { type: 'cron', expression: this.properties.cronExpression },
          payload: { kind: 'systemEvent', message: `EXECUTE_WORKFLOW:${wfId}\n${this.properties.prompt}` },
          session: 'main',
        });
        // Refresh and find the new job
        await cron.fetch();
        const myJob = cron.jobs.find(j => j.label === `Workflow: ${wfName}`);
        this.properties.cronJobId = myJob?.id || myJob?.jobId || 'saved';
        Alpine?.store('monitor')?.addLog('info', `Scheduled trigger saved: ${this.properties.cronExpression}`);
      } catch (err) {
        Alpine?.store('monitor')?.addLog('error', `Failed to save schedule: ${err.message}`);
      }
    }
    this._updateScheduleWidgets();
  };

  TriggerNode.prototype.onExecute = function () {
    this.setOutputData(0, this.properties.prompt);
  };
  // Async execution for workflow runner
  TriggerNode.prototype.runAsync = async function (inputs) {
    return { prompt: this.properties.prompt };
  };
  LiteGraph.registerNodeType('mission/trigger', TriggerNode);

  // ------------------------------------------
  // AGENT NODE — calls OpenClaw or LiteLLM
  // ------------------------------------------
  function AgentNode() {
    this.addInput('prompt', 'string');
    this.addInput('context', 'string');
    this.addOutput('response', 'string');
    this.addOutput('done', LiteGraph.EVENT);

    // Build agent list from the agents store
    const agentNames = ['(Auto)'];
    try {
      const agents = Alpine.store('agents')?.list || [];
      agents.forEach(a => agentNames.push(a.name));
    } catch {}

    this.addWidget('combo', 'Agent', '(Auto)', (v) => {
      this.properties.agent = v;
    }, { values: agentNames });

    this.addWidget('text', 'System Prompt', 'You are a helpful assistant.', (v) => {
      this.properties.systemPrompt = v;
    });
    this.addWidget('number', 'Max Tokens', 2048, (v) => {
      this.properties.maxTokens = v;
    }, { min: 128, max: 32768, step: 128 });

    this.properties = { agent: '(Auto)', systemPrompt: 'You are a helpful assistant.', maxTokens: 2048 };
    this.size = [300, 160];
    this.color = '#1e3a5f';
    this.bgcolor = '#0c1929';
  }
  AgentNode.title = 'Agent';
  AgentNode.desc = 'Sends prompt to an AI agent (OpenClaw or LiteLLM)';
  AgentNode.prototype.onExecute = function () {
    const prompt = this.getInputData(0);
    if (prompt) {
      this.setOutputData(0, this._lastResponse || '');
    }
  };
  AgentNode.prototype.runAsync = async function (inputs) {
    const prompt = inputs.prompt || '';
    const context = inputs.context || '';
    const fullPrompt = context ? `Context: ${context}\n\nTask: ${prompt}` : prompt;

    if (!fullPrompt) return { response: '' };

    // Find the agent
    let agent = null;
    if (this.properties.agent !== '(Auto)') {
      const agents = Alpine.store('agents')?.list || [];
      agent = agents.find(a => a.name === this.properties.agent);
    }

    // Strip litellm/ prefix — LiteLLM expects bare aliases (e.g. groq-llama-3.3-70b)
    const model = (agent?.model || 'groq-llama-3.3-70b').replace(/^litellm\//, '');
    const messages = [];
    const sysPrompt = this.properties.systemPrompt || agent?.systemPrompt;
    if (sysPrompt) messages.push({ role: 'system', content: sysPrompt });
    messages.push({ role: 'user', content: fullPrompt });

    // Try OpenClaw first, then LiteLLM, then return error
    if (window.openclawClient?.authenticated) {
      try {
        const agentId = agent?.id || 'lead';
        const result = await window.openclawClient.sendChat(fullPrompt, {
          sessionKey: 'agent:' + agentId + ':main',
        });
        // Correlate response events with this specific run's runId/idempotencyKey
        // to prevent cross-talk from concurrent workflow nodes or chat panel
        const runId = result?.runId || result?._idempotencyKey;
        const response = await this._waitForResponse(120000, runId);
        this._lastResponse = response;
        return { response };
      } catch (e) {
        console.warn('[Workflow Agent] OpenClaw failed, trying LiteLLM:', e.message);
      }
    }

    // Fallback: direct LiteLLM
    if (window.litellmApi) {
      try {
        const response = await litellmApi.chat(model, messages);
        this._lastResponse = response;
        return { response };
      } catch (e) {
        return { response: `Error: ${e.message}` };
      }
    }

    return { response: '[Demo] Agent would process: ' + fullPrompt.slice(0, 100) };
  };
  // Dynamically refresh the Agent combo widget so it always reflects current agents
  AgentNode.prototype.onDrawForeground = function () {
    const widget = this.widgets?.find(w => w.name === 'Agent');
    if (widget) {
      const agentNames = ['(Auto)'];
      try {
        const agents = Alpine.store('agents')?.list || [];
        agents.forEach(a => agentNames.push(a.name));
      } catch {}
      widget.options.values = agentNames;
      if (!agentNames.includes(this.properties.agent)) {
        this.properties.agent = '(Auto)';
        widget.value = '(Auto)';
      }
    }
  };
  AgentNode.prototype._waitForResponse = function (timeoutMs, runId) {
    return new Promise((resolve) => {
      let content = '';
      const cleanup = [];

      const timer = setTimeout(() => {
        cleanup.forEach(fn => fn());
        resolve(content || '[Timeout waiting for response]');
      }, timeoutMs);

      if (window.openclawClient) {
        // OpenClaw emits a single 'chat' event with payload.state = 'delta' | 'final' | 'error'
        // (not separate 'chat.delta' / 'chat.complete' events)
        const offChat = window.openclawClient.on('chat', (p) => {
          // Only process events for this specific run
          if (runId && p.runId && p.runId !== runId) return;

          if (p.state === 'delta') {
            // Use extractMessageText (from app.js) for robust nested format handling
            const delta = extractMessageText(p.message)
              || extractMessageText(p.content)
              || extractMessageText(p.delta)
              || extractMessageText(p.text)
              || '';
            content += delta;
          } else if (p.state === 'final') {
            // Extract final content if present
            if (p.message) {
              const finalText = extractMessageText(p.message);
              if (finalText && !content) content = finalText;
            }
            clearTimeout(timer);
            cleanup.forEach(fn => fn());
            resolve(content);
          } else if (p.state === 'error') {
            clearTimeout(timer);
            cleanup.forEach(fn => fn());
            resolve(content || `[Error: ${p.errorMessage || 'unknown'}]`);
          }
        });
        cleanup.push(offChat);
      }
    });
  };
  LiteGraph.registerNodeType('mission/agent', AgentNode);

  // ------------------------------------------
  // TASK NODE
  // ------------------------------------------
  function TaskNode() {
    this.addInput('input', 'string');
    this.addInput('execute', LiteGraph.ACTION);
    this.addOutput('result', 'string');
    this.addOutput('done', LiteGraph.EVENT);
    this.addWidget('text', 'Goal', 'Describe the task goal...', (v) => {
      this.properties.goal = v;
    });
    this.addWidget('text', 'Constraints', 'Any constraints or requirements...', (v) => {
      this.properties.constraints = v;
    });
    this.addWidget('combo', 'Priority', 'Normal', (v) => {
      this.properties.priority = v;
    }, { values: ['Low', 'Normal', 'High', 'Critical'] });

    this.properties = { goal: '', constraints: '', priority: 'Normal' };
    this.size = [280, 160];
    this.color = '#4a1d6b';
    this.bgcolor = '#1a0a2e';
  }
  TaskNode.title = 'Task';
  TaskNode.desc = 'Defines a task with goal, constraints, and priority';
  TaskNode.prototype.onExecute = function () {
    const input = this.getInputData(0);
    if (input) {
      this.setOutputData(0, `Task [${this.properties.priority}]: ${this.properties.goal}\n${input}`);
    }
  };
  TaskNode.prototype.runAsync = async function (inputs) {
    const input = inputs.input || '';
    let result = input;
    if (this.properties.goal) {
      result = `[Task: ${this.properties.goal}] [Priority: ${this.properties.priority}]\n`;
      if (this.properties.constraints) result += `Constraints: ${this.properties.constraints}\n`;
      result += `Input: ${input}`;
    }
    return { result };
  };
  LiteGraph.registerNodeType('mission/task', TaskNode);

  // ------------------------------------------
  // TOOL NODE — Real tool execution via OpenClaw agents
  // ------------------------------------------

  // Tool-specific prompt builders and timeout values
  const TOOL_DEFS = {
    'Web Search': {
      timeout: 30000,
      prompt: (input, config) =>
        `Use the web_search tool with query: ${input}\n` +
        (config.maxResults ? `Return up to ${config.maxResults} results.\n` : '') +
        `Return a concise summary of the most relevant findings with source URLs.`,
    },
    'Web Scrape': {
      timeout: 30000,
      prompt: (input, config) => {
        const url = config.url || input;
        const selector = config.selector ? ` --data-urlencode "selector=${config.selector}"` : '';
        return `Use the exec tool to run this command:\nwget -qO- 'http://scrapling:8000/scrape?url=${encodeURIComponent(url)}${selector}'\n\nReturn the scraped content. If it fails, report the error.`;
      },
    },
    'Code Execution': {
      timeout: 60000,
      prompt: (input, config) => {
        const lang = config.language || 'javascript';
        if (lang === 'javascript' || lang === 'node') {
          return `Use the exec tool to run this Node.js code:\nnode -e ${JSON.stringify(input)}\n\nReturn the output.`;
        }
        return `Use the exec tool to execute the following code.\nLanguage: ${lang}\n\`\`\`\n${input}\n\`\`\`\nReturn the output.`;
      },
    },
    'File Read': {
      timeout: 15000,
      prompt: (input, config) => {
        const path = config.path || input;
        return `Use the read tool to read the file at: ${path}\nReturn the file contents.`;
      },
    },
    'File Write': {
      timeout: 15000,
      prompt: (input, config) => {
        const path = config.path || '/workspace/staging/tool-output-' + Date.now().toString(36) + '.txt';
        return `Use the write tool to write the following content to ${path}:\n${input}\nConfirm when done.`;
      },
    },
    'Shell Access': {
      timeout: 60000,
      prompt: (input, config) => {
        const cmd = config.command || input;
        return `Use the exec tool to run this shell command:\n${cmd}\n\nReturn the complete output. If the command fails, return the error message.`;
      },
    },
    'API Call': {
      timeout: 30000,
      prompt: (input, config) => {
        const method = config.method || 'GET';
        const url = config.url || input;
        const headers = config.headers ? Object.entries(config.headers).map(([k, v]) => `--header '${k}: ${v}'`).join(' ') : '';
        const body = config.body ? `--post-data '${typeof config.body === 'string' ? config.body : JSON.stringify(config.body)}'` : '';
        return `Use the exec tool to make an HTTP request:\nwget -qO- ${headers} ${body} '${url}'\n\nReturn the response body.`;
      },
    },
    'Web Browser': {
      timeout: 60000,
      prompt: (input, config) => {
        const url = config.url || input;
        return `Use the browser tool to navigate to ${url}.\n` +
          (config.action || 'Take a screenshot and describe what you see.') +
          `\nReturn the results.`;
      },
    },
  };

  function ToolNode() {
    this.addInput('input', 'string');
    this.addInput('execute', LiteGraph.ACTION);
    this.addOutput('result', 'string');
    this.addOutput('done', LiteGraph.EVENT);
    this.addWidget('combo', 'Tool', 'Web Search', (v) => {
      this.properties.tool = v;
    }, { values: Object.keys(TOOL_DEFS) });
    this.addWidget('text', 'Config', '{}', (v) => {
      this.properties.config = v;
    });
    this.addWidget('combo', 'Agent', 'lead', (v) => {
      this.properties.agentId = v;
    }, { values: ['lead', 'codecraft', 'scout', 'scribe', 'ops-lead', 'builder', 'sentinel', 'chronicler'] });

    this.properties = { tool: 'Web Search', config: '{}', agentId: 'lead' };
    this.size = [280, 140];
    this.color = '#6b4d1a';
    this.bgcolor = '#2e1f0a';
  }
  ToolNode.title = 'Tool';
  ToolNode.desc = 'Executes a real tool via OpenClaw agent (search, scrape, code, files, shell, API, browser)';
  ToolNode.prototype.onExecute = function () {
    const input = this.getInputData(0);
    if (input) {
      this.setOutputData(0, this._lastResult || `[${this.properties.tool}] ${input}`);
    }
  };
  ToolNode.prototype.runAsync = async function (inputs) {
    const input = inputs.input || '';
    const toolName = this.properties.tool;
    let config = {};
    try { config = JSON.parse(this.properties.config || '{}'); } catch {}

    const toolDef = TOOL_DEFS[toolName] || TOOL_DEFS['Shell Access'];
    const toolPrompt = toolDef.prompt(input, config);
    const timeout = toolDef.timeout;

    if (window.openclawClient?.authenticated) {
      try {
        const agentId = this.properties.agentId || config.agentId || 'lead';
        const result = await window.openclawClient.sendChat(toolPrompt, {
          sessionKey: 'agent:' + agentId + ':main',
        });
        const toolRunId = result?.runId || result?._idempotencyKey;
        const response = await AgentNode.prototype._waitForResponse.call(this, timeout, toolRunId);
        this._lastResult = response;
        return { result: response };
      } catch (e) {
        this._lastResult = `[${toolName} Error]: ${e.message}`;
        return { result: this._lastResult };
      }
    }

    // Fallback: direct LiteLLM for search-like tools
    if (window.litellmApi && (toolName === 'Web Search' || toolName === 'Code Execution')) {
      try {
        const response = await litellmApi.chat('groq-llama-3.3-70b', [
          { role: 'system', content: `You are a tool execution assistant. Execute the requested tool operation and return the result.` },
          { role: 'user', content: toolPrompt },
        ]);
        this._lastResult = response;
        return { result: response };
      } catch (e) {
        this._lastResult = `[${toolName} Error]: ${e.message}`;
        return { result: this._lastResult };
      }
    }

    this._lastResult = `[${toolName}] (demo) Input: ${input.slice(0, 100)}`;
    return { result: this._lastResult };
  };
  LiteGraph.registerNodeType('mission/tool', ToolNode);

  // ------------------------------------------
  // CONDITION NODE
  // ------------------------------------------
  function ConditionNode() {
    this.addInput('input', 'string');
    this.addOutput('true', 'string');
    this.addOutput('false', 'string');
    this.addWidget('text', 'Condition', 'contains "error"', (v) => {
      this.properties.condition = v;
    });
    this.addWidget('combo', 'Type', 'Contains', (v) => {
      this.properties.type = v;
    }, { values: ['Contains', 'Equals', 'Regex', 'Length >', 'Is Empty'] });

    this.properties = { condition: '', type: 'Contains' };
    this.size = [240, 110];
    this.color = '#5c4d1a';
    this.bgcolor = '#2e260a';
  }
  ConditionNode.title = 'Condition';
  ConditionNode.desc = 'Routes data based on a condition';
  ConditionNode.prototype.onExecute = function () {
    const input = this.getInputData(0) || '';
    const result = this._evaluate(input);
    this.setOutputData(result ? 0 : 1, input);
  };
  ConditionNode.prototype._evaluate = function (input) {
    const cond = this.properties.condition;
    switch (this.properties.type) {
      case 'Contains': return input.includes(cond);
      case 'Equals': return input === cond;
      case 'Regex': try { return new RegExp(cond).test(input); } catch { return false; }
      case 'Length >': return input.length > (parseInt(cond) || 0);
      case 'Is Empty': return !input || input.trim() === '';
      default: return false;
    }
  };
  ConditionNode.prototype.runAsync = async function (inputs) {
    const input = inputs.input || '';
    const result = this._evaluate(input);
    // Return to both outputs; the executor uses the connection to route
    return { true: result ? input : null, false: result ? null : input };
  };
  LiteGraph.registerNodeType('mission/condition', ConditionNode);

  // ------------------------------------------
  // OUTPUT NODE
  // ------------------------------------------
  function OutputNode() {
    this.addInput('result', 'string');
    this.addInput('done', LiteGraph.ACTION);
    this.addWidget('combo', 'Destination', 'Log', (v) => {
      this.properties.destination = v;
    }, { values: ['Log', 'Chat Response', 'File', 'Webhook'] });
    this.addWidget('text', 'Label', 'Output', (v) => {
      this.properties.label = v;
    });

    this.properties = { destination: 'Log', label: 'Output' };
    this.size = [240, 100];
    this.color = '#1a4d3a';
    this.bgcolor = '#0a2e1f';
  }
  OutputNode.title = 'Output';
  OutputNode.desc = 'Delivers results (log, chat, file, webhook)';
  OutputNode.prototype.onExecute = function () {};
  OutputNode.prototype.runAsync = async function (inputs) {
    const result = inputs.result || '';
    const monitor = Alpine?.store('monitor');
    const dest = this.properties.destination;
    const label = this.properties.label || 'Output';

    // Always log
    if (monitor) {
      monitor.addLog('info', `[Workflow] ${label}: ${result.slice(0, 200)}`);
    }

    // Route to destination
    if (dest === 'Chat Response') {
      // Push workflow result into the active chat session as a system message
      const sessions = Alpine?.store('sessions');
      if (sessions?.activeId) {
        sessions.messages.push({
          role: 'agent',
          content: `**[Workflow: ${label}]**\n\n${result}`,
          time: new Date().toTimeString().slice(0, 5),
        });
      }
    } else if (dest === 'File') {
      // Write result to staging via workflow bridge
      if (window.workflowBridge && window.openclawClient?.authenticated) {
        try {
          const fileId = 'wf-output-' + Date.now().toString(36);
          await window.openclawClient.sendChat(
            `WRITE_FILES:${JSON.stringify({
              action: 'WRITE_FILES',
              files: [{ path: `/workspace/staging/${fileId}.txt`, content: result }],
              updateIndex: {
                path: '/workspace/staging/index.json',
                entry: { id: fileId, name: label, path: fileId + '.txt', type: 'text', createdBy: 'workflow', description: 'Workflow output: ' + label, status: 'pending' },
              },
            })}`,
            { sessionKey: 'agent:lead:main' }
          );
        } catch {}
      }
    }

    return { output: result };
  };
  LiteGraph.registerNodeType('mission/output', OutputNode);

  // ------------------------------------------
  // LOOP NODE — iterates downstream subgraph per item
  // ------------------------------------------
  function LoopNode() {
    this.addInput('items', 'string');
    this.addOutput('item', 'string');
    this.addOutput('index', 'number');
    this.addOutput('done', LiteGraph.EVENT);
    this.addOutput('results', 'string');
    this.addWidget('number', 'Max Iterations', 10, (v) => {
      this.properties.maxIter = v;
    }, { min: 1, max: 100, step: 1 });
    this.addWidget('combo', 'Separator', 'Newline', (v) => {
      this.properties.separator = v;
    }, { values: ['Newline', 'Double Newline', 'JSON Array', 'Comma'] });
    this.addWidget('combo', 'Split By', 'Newline', (v) => {
      this.properties.splitBy = v;
    }, { values: ['Newline', 'Double Newline', 'Comma', 'JSON Array'] });

    this.properties = { maxIter: 10, separator: 'Newline', splitBy: 'Newline' };
    this.size = [240, 140];
    this.color = '#1a3d5c';
    this.bgcolor = '#0a1f2e';
  }
  LoopNode.title = 'Loop';
  LoopNode.desc = 'Iterates over items, runs downstream per item, collects results';
  LoopNode.prototype.onExecute = function () {};
  LoopNode.prototype._splitItems = function (raw) {
    switch (this.properties.splitBy) {
      case 'JSON Array':
        try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr.map(String) : [raw]; } catch { return [raw]; }
      case 'Comma':
        return raw.split(',').map(s => s.trim()).filter(Boolean);
      case 'Double Newline':
        return raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
      default: // Newline
        return raw.split('\n').filter(Boolean);
    }
  };
  LoopNode.prototype._joinResults = function (results) {
    switch (this.properties.separator) {
      case 'JSON Array':
        return JSON.stringify(results);
      case 'Comma':
        return results.join(', ');
      case 'Double Newline':
        return results.join('\n\n');
      default: // Newline
        return results.join('\n');
    }
  };
  LoopNode.prototype.runAsync = async function (inputs) {
    const items = inputs.items || '';
    const parts = this._splitItems(items).slice(0, this.properties.maxIter);
    // Return _loop marker for the executor to handle iteration
    return {
      _loop: true,
      _items: parts,
      _joinResults: this._joinResults.bind(this),
      item: parts[0] || '',
      index: 0,
      done: parts.length === 0,
      results: '',
    };
  };
  LiteGraph.registerNodeType('mission/loop', LoopNode);

  // ------------------------------------------
  // MERGE NODE
  // ------------------------------------------
  function MergeNode() {
    this.addInput('input_1', 'string');
    this.addInput('input_2', 'string');
    this.addOutput('merged', 'string');
    this.addWidget('combo', 'Mode', 'Concatenate', (v) => {
      this.properties.mode = v;
    }, { values: ['Concatenate', 'JSON Merge', 'Pick Best', 'Summary'] });

    this.properties = { mode: 'Concatenate' };
    this.size = [220, 80];
    this.color = '#3d1a5c';
    this.bgcolor = '#1f0a2e';
  }
  MergeNode.title = 'Merge';
  MergeNode.desc = 'Combines multiple inputs';
  MergeNode.prototype.onExecute = function () {
    const a = this.getInputData(0) || '';
    const b = this.getInputData(1) || '';
    this.setOutputData(0, a + '\n---\n' + b);
  };
  MergeNode.prototype.runAsync = async function (inputs) {
    const a = inputs.input_1 || '';
    const b = inputs.input_2 || '';
    let merged;
    switch (this.properties.mode) {
      case 'JSON Merge':
        try { merged = JSON.stringify({ ...JSON.parse(a), ...JSON.parse(b) }); } catch { merged = a + '\n' + b; }
        break;

      case 'Pick Best':
        if (window.litellmApi && a && b) {
          try {
            merged = await litellmApi.chat('groq-llama-3.3-70b', [
              { role: 'system', content: 'Compare two text responses and return ONLY the better one verbatim. Do not add commentary.' },
              { role: 'user', content: `Response A:\n${a}\n\nResponse B:\n${b}\n\nReturn the better response:` },
            ]);
          } catch {
            merged = a.length > b.length ? a : b;
          }
        } else {
          merged = a.length > b.length ? a : b;
        }
        break;

      case 'Summary':
        if (window.litellmApi && (a || b)) {
          try {
            merged = await litellmApi.chat('groq-llama-3.3-70b', [
              { role: 'system', content: 'Summarize the following inputs into a concise unified summary.' },
              { role: 'user', content: `Input 1:\n${a}\n\nInput 2:\n${b}` },
            ]);
          } catch {
            merged = [a, b].filter(Boolean).join('\n---\n');
          }
        } else {
          merged = [a, b].filter(Boolean).join('\n---\n');
        }
        break;

      default:
        merged = [a, b].filter(Boolean).join('\n---\n');
    }
    return { merged };
  };
  LiteGraph.registerNodeType('mission/merge', MergeNode);
}

// ============================================================================
// WORKFLOW EXECUTOR — walks the graph and runs nodes with real API calls
// ============================================================================

class WorkflowExecutor {
  constructor(graph) {
    this.graph = graph;
    this.running = false;
    this.results = new Map(); // nodeId -> output data
  }

  async execute() {
    if (this.running) return;
    this.running = true;

    const monitor = Alpine?.store('monitor');
    const wfStore = Alpine?.store('workflows');
    if (wfStore) wfStore.running = true;

    const nodes = this.graph._nodes;
    if (!nodes || nodes.length === 0) {
      this.running = false;
      if (wfStore) wfStore.running = false;
      return;
    }

    // Sort nodes topologically by following links
    const sorted = this._topologicalSort(nodes);
    monitor?.addLog('info', `Workflow executing: ${sorted.length} nodes`);

    // Track nodes already executed by loop iteration so main loop skips them
    const loopExecuted = new Set();

    for (const node of sorted) {
      if (!this.running) break;
      if (loopExecuted.has(node.id)) continue;

      // Highlight executing node
      node.boxcolor = '#f59e0b'; // amber = running
      this.graph.setDirtyCanvas(true);

      try {
        // Gather inputs from connected upstream nodes
        const inputs = this._gatherInputs(node);

        // Branch gating: skip nodes whose connected inputs are all null.
        const inputValues = Object.values(inputs);
        const hasConnectedInputs = node.inputs && node.inputs.some(inp => inp.link != null);
        if (hasConnectedInputs && inputValues.length > 0 && inputValues.every(v => v === null || v === undefined)) {
          node.boxcolor = '#6b7280'; // gray = skipped (inactive branch)
          this.results.set(node.id, null); // propagate null downstream
          monitor?.addLog('debug', `Node "${node.title}" skipped (inactive branch)`);
          this.graph.setDirtyCanvas(true);
          continue;
        }

        // Execute the node's async handler
        if (typeof node.runAsync === 'function') {
          const output = await node.runAsync(inputs);

          // Handle loop iteration: re-run downstream subgraph for each item
          if (output?._loop && output._items?.length > 0) {
            const downstreamIds = this._getDownstreamNodes(node.id);
            const downstreamSorted = sorted.filter(n => downstreamIds.has(n.id));

            monitor?.addLog('info', `Loop "${node.title}": iterating ${output._items.length} items`);

            // Accumulate results from the last downstream node per iteration
            const accumulatedResults = [];

            for (let i = 0; i < output._items.length; i++) {
              if (!this.running) break;
              monitor?.addLog('debug', `Loop "${node.title}": item ${i + 1}/${output._items.length}`);

              const iterOutput = { item: output._items[i], index: i, done: i === output._items.length - 1, results: '' };
              this.results.set(node.id, iterOutput);

              let lastDnOutput = null;

              for (const dn of downstreamSorted) {
                if (!this.running) break;
                dn.boxcolor = '#f59e0b';
                this.graph.setDirtyCanvas(true);

                try {
                  const dnInputs = this._gatherInputs(dn);
                  const dnInputValues = Object.values(dnInputs);
                  const dnHasConnected = dn.inputs?.some(inp => inp.link != null);
                  if (dnHasConnected && dnInputValues.length > 0 && dnInputValues.every(v => v === null || v === undefined)) {
                    dn.boxcolor = '#6b7280';
                    continue;
                  }
                  if (typeof dn.runAsync === 'function') {
                    const dnOutput = await dn.runAsync(dnInputs);
                    this.results.set(dn.id, dnOutput);
                    lastDnOutput = dnOutput;
                    dn.boxcolor = '#10b981';

                    // Governance: record Agent node tasks during loop
                    if (dn.type === 'mission/agent' && dnOutput?.response) {
                      this._recordAgentGovernance(dn, dnOutput);
                    }
                  }
                } catch (dnErr) {
                  monitor?.addLog('error', `Loop iteration ${i}: Node "${dn.title}" failed: ${dnErr.message}`);
                  dn.boxcolor = '#ef4444';
                  this.results.set(dn.id, { error: dnErr.message });
                  lastDnOutput = { error: dnErr.message };
                }
                this.graph.setDirtyCanvas(true);
              }

              // Collect the primary text result from this iteration
              if (lastDnOutput) {
                const iterResult = lastDnOutput.response || lastDnOutput.result || lastDnOutput.merged || lastDnOutput.output
                  || (lastDnOutput.error ? `[Error: ${lastDnOutput.error}]` : '');
                if (iterResult) accumulatedResults.push(iterResult);
              }
            }

            // Mark downstream as already executed so main loop skips them
            for (const did of downstreamIds) loopExecuted.add(did);

            // Join accumulated results using the loop node's configured separator
            const joinFn = output._joinResults || ((arr) => arr.join('\n'));
            const joinedResults = joinFn(accumulatedResults);

            // Set final loop output with accumulated results
            this.results.set(node.id, {
              item: output._items[output._items.length - 1],
              index: output._items.length - 1,
              done: true,
              results: joinedResults,
            });
            node.boxcolor = '#10b981';
            this.graph.setDirtyCanvas(true);
            monitor?.addLog('info', `Loop "${node.title}": completed ${output._items.length} iterations, ${accumulatedResults.length} results collected`);
            continue;
          }

          this.results.set(node.id, output);
          monitor?.addLog('debug', `Node "${node.title}" completed`);
          node.boxcolor = '#10b981'; // green = success

          // Governance: record Agent node tasks
          if (node.type === 'mission/agent' && output?.response) {
            this._recordAgentGovernance(node, output);
          }
        } else {
          node.boxcolor = '#6b7280'; // gray = skipped
        }
      } catch (err) {
        monitor?.addLog('error', `Node "${node.title}" failed: ${err.message}`);
        node.boxcolor = '#ef4444'; // red = error
        this.results.set(node.id, { error: err.message });
      }

      this.graph.setDirtyCanvas(true);
    }

    this.running = false;
    if (wfStore) {
      wfStore.running = false;
      const wf = wfStore.active;
      if (wf) { wf.lastRun = 'Just now'; wf.status = 'completed'; }
    }
    monitor?.addLog('info', 'Workflow execution complete');
    if (window.mcAudio) window.mcAudio.workflowComplete();

    // Reset node colors after 3 seconds
    setTimeout(() => {
      for (const node of nodes) {
        node.boxcolor = LiteGraph.NODE_DEFAULT_BOXCOLOR;
      }
      this.graph.setDirtyCanvas(true);
    }, 3000);
  }

  stop() {
    this.running = false;
  }

  _topologicalSort(nodes) {
    // Simple BFS from trigger/input nodes (no incoming links)
    const inDegree = new Map();
    const adj = new Map();
    const nodeMap = new Map();

    for (const n of nodes) {
      nodeMap.set(n.id, n);
      inDegree.set(n.id, 0);
      adj.set(n.id, []);
    }

    // Count incoming connections
    if (this.graph.links) {
      for (const linkId in this.graph.links) {
        const link = this.graph.links[linkId];
        if (link && nodeMap.has(link.target_id) && nodeMap.has(link.origin_id)) {
          inDegree.set(link.target_id, (inDegree.get(link.target_id) || 0) + 1);
          adj.get(link.origin_id).push(link.target_id);
        }
      }
    }

    // BFS
    const queue = [];
    const sorted = [];

    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    while (queue.length > 0) {
      const id = queue.shift();
      sorted.push(nodeMap.get(id));

      for (const nextId of (adj.get(id) || [])) {
        const newDeg = (inDegree.get(nextId) || 1) - 1;
        inDegree.set(nextId, newDeg);
        if (newDeg === 0) queue.push(nextId);
      }
    }

    return sorted;
  }

  _getDownstreamNodes(nodeId) {
    const downstream = new Set();
    const queue = [nodeId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (this.graph.links) {
        for (const linkId in this.graph.links) {
          const link = this.graph.links[linkId];
          if (link && link.origin_id === current && !downstream.has(link.target_id)) {
            downstream.add(link.target_id);
            queue.push(link.target_id);
          }
        }
      }
    }
    return downstream;
  }

  _recordAgentGovernance(node, output) {
    try {
      const agentName = node.properties?.agent;
      if (!agentName || agentName === '(Auto)') return;
      const agent = Alpine.store('agents')?.list.find(a => a.name === agentName);
      if (!agent) return;
      const tokens = Math.round((output.response || '').length / 4);
      Alpine.store('governance')?.recordTask(agent.id, {
        success: !(output.response || '').startsWith('Error:'),
        tokens,
        taskType: 'workflow',
      });
    } catch {}
  }

  _gatherInputs(node) {
    const inputs = {};
    if (!node.inputs) return inputs;

    for (let i = 0; i < node.inputs.length; i++) {
      const input = node.inputs[i];
      if (!input.link) continue;

      const link = this.graph.links[input.link];
      if (!link) continue;

      const sourceOutput = this.results.get(link.origin_id);
      if (sourceOutput !== undefined && sourceOutput !== null) {
        // Match output slot name to input slot name
        // Use explicit undefined checks to preserve valid falsy values (null, false, 0, '')
        const sourceNode = this.graph.getNodeById(link.origin_id);
        if (sourceNode && sourceNode.outputs && sourceNode.outputs[link.origin_slot]) {
          const outputName = sourceNode.outputs[link.origin_slot].name;
          const val = sourceOutput[outputName];
          inputs[input.name] = val !== undefined ? val : (Object.values(sourceOutput)[0] ?? '');
        } else {
          inputs[input.name] = Object.values(sourceOutput)[0] ?? '';
        }
      }
    }

    return inputs;
  }
}

// ============================================================================
// DEFAULT WORKFLOW TEMPLATE
// ============================================================================

function addDefaultWorkflow(graph) {
  const trigger = LiteGraph.createNode('mission/trigger');
  trigger.pos = [100, 200];
  trigger.properties.prompt = 'Review this code for security issues';
  graph.add(trigger);

  const agent = LiteGraph.createNode('mission/agent');
  agent.pos = [450, 180];
  graph.add(agent);

  const condition = LiteGraph.createNode('mission/condition');
  condition.pos = [800, 180];
  condition.properties.condition = 'error';
  condition.properties.type = 'Contains';
  graph.add(condition);

  const output = LiteGraph.createNode('mission/output');
  output.pos = [1100, 140];
  output.properties.label = 'Review Result';
  output.properties.destination = 'Log';
  graph.add(output);

  const tool = LiteGraph.createNode('mission/tool');
  tool.pos = [1100, 300];
  tool.properties.tool = 'Web Search';
  graph.add(tool);

  trigger.connect(0, agent, 0);
  agent.connect(0, condition, 0);
  condition.connect(0, output, 0);
  condition.connect(1, tool, 0);
}

// ============================================================================
// PALETTE BUTTON HANDLER
// ============================================================================

window.addNodeToCanvas = function (nodeType) {
  if (!window.workflowGraph) {
    initWorkflowCanvas();
  }
  if (!window.workflowGraph) return;

  const node = LiteGraph.createNode('mission/' + nodeType);
  if (node) {
    const canvas = window.workflowCanvas;
    if (canvas) {
      const center = canvas.convertOffsetToCanvas([
        canvas.canvas.width / 2,
        canvas.canvas.height / 2,
      ]);
      node.pos = [center[0] - node.size[0] / 2, center[1] - node.size[1] / 2];
    } else {
      node.pos = [300, 200];
    }
    window.workflowGraph.add(node);
  }
};

// ============================================================================
// EXPOSE EXECUTOR — used by the workflows store's run() method
// ============================================================================

window.WorkflowExecutor = WorkflowExecutor;
```

---

# [13] workspace/js/workflow-bridge.js (530 lines) — Agent workflow bridge

```
// ============================================================================
// Workflow Bridge — Agent <-> Mission Control bidirectional workflow sync
//
// IMPORT (Agent → MC):
//   Primary: Polls /workspace/agent-workflows/index.json (agents write via
//            their `write` tool to the shared Docker volume).
//   Secondary: Polls each agent's workspace via agents.files.get RPC
//              (catches workflows agents wrote to their own workspace).
//
// EXPORT (MC → Agent):
//   Uses agents.files.set RPC to write workflow JSON + index directly to
//   Lead and Ops Lead's workspace directories — zero chat pollution.
//   Agents can read these with their `read` tool.
//
// Phase 4: Full bidirectional bridge with RPC-based sync.
// in-fused.org
// ============================================================================

class WorkflowBridge {
  constructor() {
    this._pollTimer = null;
    this._knownFiles = new Set();
    this._basePath = '/workspace/agent-workflows';
    this._syncTimers = {};
    this._lastAgentPoll = 0;
  }

  startPolling(intervalMs = 15000) {
    this.stopPolling();
    this._poll();
    this._pollTimer = setInterval(() => this._poll(), intervalMs);
  }

  stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  // =========================================================================
  // MAIN POLL LOOP
  // =========================================================================

  async _poll() {
    try {
      // 1. Poll the shared volume (primary import path)
      await this._pollVolume();

      // 2. Poll agent workspaces via RPC (every 60s, secondary import path)
      const now = Date.now();
      if (window.openclawClient?.authenticated && now - this._lastAgentPoll > 60000) {
        this._lastAgentPoll = now;
        await this._pollAgentWorkspaces();
      }

      // 3. Check for background execution results
      await this._checkExecutionResults();

      // 4. Check for activity logs
      await this._checkActivityLog();
    } catch {
      // Silently fail — services may not be up yet
    }
  }

  // =========================================================================
  // IMPORT: Shared volume → Mission Control
  // =========================================================================

  async _pollVolume() {
    const resp = await fetch(this._basePath + '/index.json', {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!resp.ok) return;

    const index = await resp.json();

    for (const entry of (index.workflows || [])) {
      const key = entry.id + ':' + entry.updatedAt;
      if (this._knownFiles.has(key)) continue;

      const wfResp = await fetch(this._basePath + '/' + entry.file, {
        cache: 'no-store',
      });
      if (!wfResp.ok) continue;

      const wfData = await wfResp.json();
      this._importWorkflow(entry, wfData);
    }

    // Check for execution requests
    for (const entry of (index.workflows || [])) {
      if (entry.requestExecution && entry.status !== 'running') {
        this._executeAgentWorkflow(entry.id);
      }
    }
  }

  // =========================================================================
  // IMPORT: Agent workspace files → Mission Control (via RPC)
  // =========================================================================

  async _pollAgentWorkspaces() {
    if (!window.openclawClient?.authenticated) return;

    // Check Lead and Ops Lead workspace for agent-created workflows
    for (const agentId of ['lead', 'ops-lead']) {
      try {
        const index = await window.openclawClient.readAgentWorkflowIndex(agentId);
        if (!index?.workflows) continue;

        for (const entry of index.workflows) {
          const key = `rpc:${agentId}:${entry.id}:${entry.updatedAt}`;
          if (this._knownFiles.has(key)) continue;

          try {
            const wfData = await window.openclawClient.readAgentWorkflow(agentId, entry.id);
            if (wfData) {
              this._importWorkflow(entry, wfData.graph || wfData);
              this._knownFiles.add(key);
            }
          } catch {
            // Individual workflow read failed — skip
          }
        }
      } catch {
        // Agent doesn't have a workflows/ directory yet — normal
      }
    }
  }

  // =========================================================================
  // SHARED: Import a workflow into the Mission Control store
  // =========================================================================

  _importWorkflow(entry, graphData) {
    const wfStore = Alpine?.store('workflows');
    if (!wfStore) return;

    const key = entry.id + ':' + entry.updatedAt;
    wfStore.importJSON({
      meta: {
        id: entry.id,
        name: entry.name || 'Agent Workflow',
        nodes: graphData.nodes?.length || 0,
        lastRun: 'Never',
        status: entry.status || 'draft',
        createdAt: entry.createdAt || Date.now(),
        updatedAt: entry.updatedAt || Date.now(),
        createdBy: entry.createdBy || 'agent',
      },
      graph: graphData,
    });

    this._knownFiles.add(key);
    Alpine.store('monitor')?.addLog('info',
      `Imported agent workflow: ${entry.name} (by ${entry.createdBy || 'agent'})`
    );

    // Play notification sound for agent-created workflows
    if (entry.createdBy && entry.createdBy !== 'user' && window.mcAudio) {
      mcAudio.notification();
    }

    // Record workflow creation in governance
    if (entry.createdBy && entry.createdBy !== 'user') {
      Alpine.store('governance')?.recordTask(entry.createdBy, {
        success: true,
        taskType: 'workflow-create',
        tokens: 0,
      });
    }
  }

  // =========================================================================
  // EXECUTE: Run an agent-requested workflow on Mission Control
  // =========================================================================

  // Platform Team agent IDs — used to detect which team lead should receive workflow
  _platformAgentIds: new Set(['ops-lead', 'builder', 'sentinel', 'chronicler']),

  // Detect the appropriate team lead for a workflow based on its first agent node.
  // If the first agent node uses a Platform Team agent, route to Ops Lead; otherwise Lead.
  _detectTeamLead(workflowId) {
    const graphData = localStorage.getItem('mc-workflow-' + workflowId);
    if (!graphData) return 'lead';
    try {
      const graph = JSON.parse(graphData);
      const nodes = graph.nodes || [];
      // Find the first agent node (by type or by having an agent property)
      const firstAgent = nodes.find(n =>
        n.type === 'mission/agent' || (n.properties && n.properties.agent)
      );
      if (firstAgent) {
        const agentId = firstAgent.properties?.agent || '';
        if (this._platformAgentIds.has(agentId)) return 'ops-lead';
      }
    } catch {}
    return 'lead';
  },

  async _executeAgentWorkflow(workflowId) {
    const wfStore = Alpine?.store('workflows');
    if (!wfStore) return;

    // Detect which team lead should handle this workflow
    const targetLead = this._detectTeamLead(workflowId);

    // Try server-side execution via EXECUTE_WORKFLOW protocol first.
    // This sends the serialized graph to the team lead via sessions_send,
    // allowing execution to continue server-side after browser closes.
    if (window.openclawClient?.authenticated) {
      const graphData = localStorage.getItem('mc-workflow-' + workflowId);
      if (graphData) {
        try {
          await window.openclawClient.sendChat(
            `EXECUTE_WORKFLOW:${workflowId}\n${graphData}`,
            { sessionKey: `agent:${targetLead}:main` }
          );
          Alpine.store('monitor')?.addLog('info',
            `Sent workflow "${workflowId}" to ${targetLead} for background execution`
          );
          return; // Server-side execution — don't run locally
        } catch {
          Alpine.store('monitor')?.addLog('warn',
            `Server-side dispatch failed for "${workflowId}" — executing locally`
          );
        }
      }
    }

    // Fallback: execute locally on Mission Control (requires browser open)
    wfStore.load(workflowId);
    await new Promise(r => setTimeout(r, 500));
    await wfStore.run();

    // Collect results from output nodes
    const results = {};
    if (window.workflowGraph) {
      for (const node of window.workflowGraph._nodes) {
        if (node.type === 'mission/output') {
          results[node.properties.label || node.id] = node._lastResult || '';
        }
      }
    }

    // Write results back via RPC to the appropriate team lead (no chat pollution)
    if (window.openclawClient?.authenticated) {
      try {
        const resultJson = JSON.stringify({
          workflowId,
          completedAt: Date.now(),
          success: true,
          outputs: results,
        }, null, 2);
        await window.openclawClient.setAgentFile(targetLead, `workflows/results/${workflowId}.json`, resultJson);
      } catch {
        // Fallback: inject as labeled message to the correct team lead
        try {
          await window.openclawClient.injectChat(
            `WORKFLOW_RESULT:${workflowId}\n${JSON.stringify(results, null, 2)}`,
            { sessionKey: `agent:${targetLead}:main`, label: 'system-bridge' }
          );
        } catch {}
      }
    }
  }

  // =========================================================================
  // IMPORT: Background execution results from volume
  // =========================================================================

  async _checkExecutionResults() {
    try {
      const resp = await fetch(this._basePath + '/results/index.json', {
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      if (!resp.ok) return;

      const index = await resp.json();
      const wfStore = Alpine?.store('workflows');
      if (!wfStore) return;

      for (const result of (index.results || [])) {
        const key = 'bg-result:' + result.id + ':' + result.completedAt;
        if (this._knownFiles.has(key)) continue;

        const resResp = await fetch(this._basePath + '/results/' + result.file, {
          cache: 'no-store',
        });
        if (!resResp.ok) continue;

        const resData = await resResp.json();
        this._knownFiles.add(key);

        const wf = wfStore.list.find(w => w.id === result.workflowId);
        if (wf) {
          wf.lastRun = new Date(result.completedAt).toLocaleString();
          wf.status = result.success ? 'completed' : 'failed';
          wf._bgResult = resData;
        }

        Alpine.store('monitor')?.addLog(
          result.success ? 'info' : 'warn',
          `Background workflow "${result.name || result.workflowId}" ${result.success ? 'completed' : 'failed'}`
        );
      }
    } catch {
      // Results directory may not exist yet
    }
  }

  // =========================================================================
  // EXPORT: Mission Control → Agent workspaces (via RPC)
  // =========================================================================

  // Sync a single workflow to agent workspaces (called on every save)
  async syncWorkflow(wfId) {
    if (!window.openclawClient?.authenticated) return;
    const wfStore = Alpine?.store('workflows');
    if (!wfStore) return;

    const wf = wfStore.list.find(w => w.id === wfId);
    const graphData = localStorage.getItem('mc-workflow-' + wfId);
    if (!wf || !graphData) return;

    // Debounce: don't sync more than once per 10s per workflow
    const now = Date.now();
    if (this._syncTimers[wfId] && now - this._syncTimers[wfId] < 10000) return;
    this._syncTimers[wfId] = now;

    const meta = {
      id: wf.id,
      name: wf.name,
      nodes: wf.nodes,
      createdBy: wf.createdBy || 'user',
      createdAt: wf.createdAt,
      updatedAt: wf.updatedAt,
      status: wf.status || 'draft',
    };

    try {
      // Write via RPC to both team leads' workspaces
      const graphJson = JSON.parse(graphData);
      await window.openclawClient.syncWorkflowToAgent(wfId, meta, graphJson);

      // Also update the index
      await this._syncIndex();
    } catch {
      // RPC failed — agents can still find workflows via the volume poll
    }
  }

  // Export all Mission Control workflows to agent workspaces (full sync)
  async syncToVolume() {
    if (!window.openclawClient?.authenticated) return;
    const wfStore = Alpine?.store('workflows');
    if (!wfStore) return;

    let synced = 0;
    for (const wf of wfStore.list) {
      const graphData = localStorage.getItem('mc-workflow-' + wf.id);
      if (!graphData) continue;

      try {
        const meta = {
          id: wf.id,
          name: wf.name,
          nodes: wf.nodes,
          createdBy: wf.createdBy || 'user',
          createdAt: wf.createdAt,
          updatedAt: wf.updatedAt,
          status: wf.status || 'draft',
        };
        await window.openclawClient.syncWorkflowToAgent(wf.id, meta, JSON.parse(graphData));
        synced++;
      } catch {
        // Individual workflow sync failed — continue with others
      }
    }

    await this._syncIndex();
    Alpine.store('monitor')?.addLog('info', `Synced ${synced} workflows to agent workspaces`);
  }

  // Sync the workflow index to Lead's workspace
  async _syncIndex() {
    if (!window.openclawClient?.authenticated) return;
    const wfStore = Alpine?.store('workflows');
    if (!wfStore) return;

    const entries = wfStore.list.map(wf => ({
      id: wf.id,
      name: wf.name,
      file: wf.id + '.json',
      createdBy: wf.createdBy || 'user',
      createdAt: wf.createdAt,
      updatedAt: wf.updatedAt,
      status: wf.status || 'draft',
    }));

    try {
      await window.openclawClient.syncWorkflowIndex(entries);
    } catch {}
  }

  // =========================================================================
  // GOVERNANCE SYNC — writes state to team leads' workspace files
  // =========================================================================

  async syncGovernance() {
    if (!window.openclawClient?.authenticated) return;
    const gov = Alpine?.store('governance');
    if (!gov) return;

    const state = {
      agents: {},
      teams: gov.teams,
      updatedAt: Date.now(),
    };

    for (const agent of (Alpine.store('agents')?.list || [])) {
      const score = gov.getScore(agent.id);
      if (score) state.agents[agent.id] = score;
    }

    const md = this._buildGovernanceMd(state);

    try {
      await window.openclawClient.setAgentFile('lead', 'GOVERNANCE.md', md);
      await window.openclawClient.setAgentFile('ops-lead', 'GOVERNANCE.md', md);
      return;
    } catch {
      // agents.files.set not available — fall back to chat.inject
    }

    const payload = {
      action: 'WRITE_FILES',
      files: [{
        path: '/workspace/mc-state/governance.json',
        content: JSON.stringify(state, null, 2),
      }],
    };

    try {
      await window.openclawClient.injectChat(
        `WRITE_FILES:${JSON.stringify(payload)}`,
        { sessionKey: 'agent:lead:main', label: 'system-bridge' }
      );
    } catch {}
  }

  _buildGovernanceMd(state) {
    const lines = ['# Governance State', '', `Updated: ${new Date(state.updatedAt).toISOString()}`, ''];

    lines.push('## Agent Scores', '');
    lines.push('| Agent | Score | Tier |');
    lines.push('|-------|-------|------|');
    for (const [id, score] of Object.entries(state.agents)) {
      lines.push(`| ${id} | ${score} | — |`);
    }
    lines.push('');

    if (state.teams?.length) {
      lines.push('## Teams', '');
      for (const team of state.teams) {
        lines.push(`### ${team.name}`);
        lines.push(`- Lead: ${team.lead}`);
        lines.push(`- Members: ${(team.members || []).join(', ')}`);
        if (team.project) lines.push(`- Project: ${team.project}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  // =========================================================================
  // ACTIVITY LOG — reads /workspace/agent-activity/log.json for away report
  // =========================================================================

  async _checkActivityLog() {
    try {
      const resp = await fetch('/workspace/agent-activity/log.json', {
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      if (!resp.ok) return;

      const data = await resp.json();
      if (!localStorage.getItem('mc-last-activity-seen')) {
        localStorage.setItem('mc-last-activity-seen', Date.now().toString());
      }
      const lastSeen = parseInt(localStorage.getItem('mc-last-activity-seen') || '0');
      const newEvents = (data.events || []).filter(e => (e.time || 0) > lastSeen);

      if (newEvents.length > 0) {
        const appStore = Alpine.store('app');

        if (!appStore.awayReport && newEvents.length > 3) {
          const duration = this._formatDuration(Date.now() - lastSeen);
          appStore.awayReport = {
            duration,
            tasksCompleted: newEvents.filter(e => e.type === 'task-complete').length,
            workflowsRun: newEvents.filter(e => e.type === 'workflow-complete').length,
            stagingItems: newEvents.filter(e => e.type === 'staging-new').length,
            errors: newEvents.filter(e => e.level === 'error').length,
          };
        }

        localStorage.setItem('mc-last-activity-seen', Date.now().toString());
        Alpine.store('monitor')?.addLog('info', `Synced ${newEvents.length} agent events`);
      }
    } catch {}
  }

  _formatDuration(ms) {
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ${mins % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
}

window.workflowBridge = new WorkflowBridge();
```

---

# [14] workspace/js/openclaw-client.js (724 lines) — OpenClaw WS RPC client

```
// ============================================================================
// OpenClaw WebSocket Client — Mission Control Integration
// Speaks the OpenClaw Gateway WebSocket RPC protocol
// Falls back gracefully if connection fails
// ============================================================================

class OpenClawClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.authenticated = false;
    this._reqId = 0;
    this._pending = new Map(); // id -> { resolve, reject, timeout }
    this._eventHandlers = new Map(); // event -> Set<callback>
    this._reconnectTimer = null;
    this._reconnectDelay = 2000;
    this._maxReconnectDelay = 30000;
    this._password = null;
    this._backgrounded = false;
    this._keepAliveTimer = null;
    this._lastError = null; // last connection error message for UI display
    this._connectionState = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

    // Restore password from sessionStorage if page was reloaded (iOS memory pressure).
    // The password is also stored as a cookie hash, but we need the raw password for
    // OpenClaw WebSocket auth. sessionStorage is tab-scoped and cleared on tab close,
    // so this is acceptable from a security perspective.
    try {
      const saved = sessionStorage.getItem('mc-oc-pw');
      if (saved) this._password = saved;
    } catch {}

    // Shared reconnection logic — called from visibility, pageshow, and focus handlers.
    // iOS needs all three: visibilitychange misses some app-switcher returns,
    // pageshow misses some lock-screen returns, focus is the final fallback.
    this._tryReconnect = () => {
      if (this._password && !this.authenticated) {
        this._backgrounded = false;
        this._reconnectDelay = 2000;
        this._connectionState = 'reconnecting';
        this._scheduleReconnect();
      }
    };

    this._onVisibilityChange = () => {
      if (document.hidden) {
        this._backgrounded = true;
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
        this._stopKeepAlive();
      } else {
        this._backgrounded = false;
        if (this.authenticated) this._startKeepAlive();
        else this._tryReconnect();
      }
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    this._onPageShow = (event) => {
      if (event.persisted || !this.authenticated) this._tryReconnect();
    };
    window.addEventListener('pageshow', this._onPageShow);

    this._onFocus = () => {
      if (!this._backgrounded) this._tryReconnect();
    };
    window.addEventListener('focus', this._onFocus);
  }

  // ---------------------------------------------------------------------------
  // DIAGNOSTIC LOGGING — visible in Monitor view on mobile (not just console)
  // ---------------------------------------------------------------------------

  _log(level, msg) {
    const prefix = '[OpenClaw] ';
    if (level === 'error') console.error(prefix + msg);
    else if (level === 'warn') console.warn(prefix + msg);
    else console.log(prefix + msg);
    // Write to Monitor store if Alpine is initialized
    try {
      if (window.Alpine?.store?.('monitor')) {
        window.Alpine.store('monitor').addLog(level, 'WS: ' + msg);
      }
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // CONNECTION — uses /ws/openclaw (dedicated route, avoids root-path conflicts)
  // Falls back to / (legacy root WebSocket) if the dedicated route fails.
  // ---------------------------------------------------------------------------

  connect(password, { maxRetries = 2 } = {}) {
    // Close any existing connection to prevent orphaned WebSockets.
    // This can happen if boot() or reconnect() is called while already connected.
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      const oldWs = this.ws;
      oldWs.onclose = null; // prevent auto-reconnect from the old socket
      oldWs.onmessage = null;
      oldWs.onerror = null;
      oldWs.close();
      this.ws = null;
    }
    // Cancel any pending reconnect from the old connection
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._password = password;
    this._lastError = null;
    this._connectionState = 'connecting';
    // Persist password in sessionStorage so iOS page reloads don't lose it.
    // sessionStorage is tab-scoped (cleared on tab close) — acceptable tradeoff.
    try { sessionStorage.setItem('mc-oc-pw', password); } catch {}
    // Re-attach event handlers if they were removed by disconnect()
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    window.removeEventListener('pageshow', this._onPageShow);
    window.addEventListener('pageshow', this._onPageShow);
    window.removeEventListener('focus', this._onFocus);
    window.addEventListener('focus', this._onFocus);
    return this._attemptConnect(password, maxRetries);
  }

  async _attemptConnect(password, retriesLeft) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Dedicated WebSocket path — Caddy strips /ws/openclaw and proxies to
    // openclaw:18789/ so the gateway sees a connection at root (as expected).
    const paths = ['/ws/openclaw', '/'];

    for (const path of paths) {
      try {
        const result = await this._connectToPath(`${proto}//${location.host}${path}`);
        return result;
      } catch (err) {
        console.warn(`[OpenClaw] WebSocket ${path} failed: ${err.message}`);
        // Try next path
      }
    }

    // All paths failed — retry with backoff if retries remain
    if (retriesLeft > 0) {
      const delay = (3 - retriesLeft) * 3000; // 3s, 6s
      console.log(`[OpenClaw] All paths failed, retrying in ${delay / 1000}s (${retriesLeft} left)...`);
      await new Promise(r => setTimeout(r, delay));
      return this._attemptConnect(password, retriesLeft - 1);
    }

    this._lastError = 'All connection attempts failed';
    this._connectionState = 'disconnected';
    throw new Error('Connection timeout');
  }

  _connectToPath(url) {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        let settled = false;
        this._handshakeSent = false;

        ws.onopen = () => {
          this._log('info', `TCP connected to ${url}, awaiting server hello...`);
          // Do NOT send handshake here. OpenClaw's gateway sends its hello
          // first — sending our connect before that triggers "invalid request
          // frame" (1008). Wait for the server's initial message in onmessage.
        };

        ws.onmessage = (event) => {
          // Debug: log raw message type for handshake diagnosis
          try {
            const peek = JSON.parse(event.data);
            const extra = peek.event ? ` event=${peek.event}` : '';
            this._log('info', `recv type=${peek.type}${extra}`);
          } catch { this._log('warn', `recv non-JSON: ${event.data?.slice?.(0, 80)}`); }
          this._handleMessage(event.data, (result) => {
            if (!settled) { settled = true; resolve(result); }
          }, (err) => {
            if (!settled) { settled = true; reject(err); }
          });
        };

        ws.onerror = () => {
          // Note: browsers hide WebSocket error details for security — this is normal
          this._log('info', `WebSocket error event on ${url} (see close code for details)`);
        };

        ws.onclose = (event) => {
          const wasAuth = this.authenticated;
          this.connected = false;
          this.authenticated = false;
          this._stopKeepAlive();
          this._log('info', `closed (code: ${event.code}, reason: ${event.reason || 'none'})`);

          // Reject all pending requests
          for (const [id, p] of this._pending) {
            p.reject(new Error('Connection closed'));
            clearTimeout(p.timeout);
          }
          this._pending.clear();

          // Fire disconnect event
          this._emit('disconnect', { wasAuthenticated: wasAuth, code: event.code });

          // Auto-reconnect if was previously authenticated
          if (wasAuth && this._password) {
            this._lastError = `Disconnected (code: ${event.code})`;
            this._connectionState = 'reconnecting';
            this._scheduleReconnect();
          }

          // If we never authenticated, reject the connect promise
          if (!wasAuth && !settled) {
            settled = true;
            this._lastError = `Connection closed (code: ${event.code})`;
            this._connectionState = 'disconnected';
            reject(new Error(`Connection closed (code: ${event.code})`));
          }
        };

        // Store ws reference so _handleMessage and _sendHandshake work
        this.ws = ws;

        // Timeout the initial connection — 15s for mobile networks
        setTimeout(() => {
          if (!this.authenticated && !settled) {
            this._log('warn', `Handshake timeout on ${url} — 15s, readyState=${ws.readyState}`);
            ws.onclose = null; // prevent auto-reconnect for this attempt
            ws.close();
            settled = true;
            this._lastError = 'Handshake timeout (15s)';
            this._connectionState = 'disconnected';
            reject(new Error('Handshake timeout'));
          }
        }, 15000);

      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect() {
    this._password = null;
    this._backgrounded = false;
    this._lastError = null;
    this._connectionState = 'disconnected';
    this._stopKeepAlive();
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // prevent auto-reconnect
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.authenticated = false;

    // Clear persisted password on explicit disconnect (logout)
    try { sessionStorage.removeItem('mc-oc-pw'); } catch {}

    // Remove all event listeners to prevent leaked listeners
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    window.removeEventListener('pageshow', this._onPageShow);
    window.removeEventListener('focus', this._onFocus);

    // Clear all event handlers so re-connecting after logout doesn't
    // accumulate duplicate listeners from previous sessions.
    this._eventHandlers.clear();
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    // Don't attempt reconnection while iOS/mobile has us backgrounded
    if (this._backgrounded) return;
    this._connectionState = 'reconnecting';
    console.log(`[OpenClaw] Reconnecting in ${this._reconnectDelay / 1000}s...`);
    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      try {
        await this.connect(this._password, { maxRetries: 1 });
        this._reconnectDelay = 2000; // reset on success
        this._emit('reconnect', {});
      } catch {
        // Exponential backoff
        this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._maxReconnectDelay);
        this._scheduleReconnect();
      }
    }, this._reconnectDelay);
  }

  // Keep-alive: send a lightweight RPC ping every 45s to detect dead sockets
  // before the OS silently closes them (iOS aggressively kills idle sockets).
  _startKeepAlive() {
    this._stopKeepAlive();
    this._keepAliveTimer = setInterval(() => {
      if (this.authenticated && this.ws?.readyState === WebSocket.OPEN) {
        // Use a lightweight documented RPC method; if it times out, the socket is dead
        this.request('health', {}).catch(() => {
          console.warn('[OpenClaw] Keep-alive ping failed — socket likely dead');
          // Force close to trigger reconnect
          if (this.ws) {
            this.ws.close();
          }
        });
      }
    }, 45000);
  }

  _stopKeepAlive() {
    if (this._keepAliveTimer) {
      clearInterval(this._keepAliveTimer);
      this._keepAliveTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // MESSAGE HANDLING
  // ---------------------------------------------------------------------------

  _handleMessage(raw, connectResolve, connectReject) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      console.warn('[OpenClaw] Non-JSON message:', raw);
      return;
    }

    // Handshake: server hello/challenge (classic format)
    if (msg.type === 'hello' || msg.type === 'challenge') {
      this._log('info', 'Server hello received, sending auth...');
      this._handshakeSent = true;
      this._sendHandshake(msg);
      return;
    }

    // Auth success helper (shared by hello-ok, welcome, and v3 connect response)
    const _authSuccess = (payload) => {
      this._log('info', 'Authenticated successfully');
      this.connected = true;
      this.authenticated = true;
      this._lastError = null;
      this._connectionState = 'connected';
      this._startKeepAlive();
      if (connectResolve) connectResolve(true);
      this._emit('connected', payload || {});
    };
    const _authFail = (errMsg) => {
      this._log('error', `Auth rejected: ${errMsg}`);
      this._lastError = errMsg;
      this._connectionState = 'disconnected';
      if (connectReject) connectReject(new Error(errMsg));
    };

    // Handshake: server ack (legacy hello-ok / welcome)
    if (msg.type === 'hello-ok' || msg.type === 'welcome') {
      _authSuccess(msg.payload);
      return;
    }

    // Handshake: server rejection
    if (msg.type === 'hello-error' || msg.type === 'error') {
      _authFail(msg.error || msg.message || 'Auth failed');
      return;
    }

    // Server-push event — may also be the server's hello in newer format
    if (msg.type === 'event') {
      if (!this._handshakeSent) {
        this._log('info', `Server initial event (${msg.event || 'unknown'}), sending auth...`);
        this._handshakeSent = true;
        this._sendHandshake(msg.payload || {});
      }
      this._emit(msg.event, msg.payload || {});
      return;
    }

    // Connect response — v3 protocol auth acknowledgment
    if (msg.type === 'res' && String(msg.id) === this._connectReqId) {
      if (msg.ok !== false && !msg.error) {
        _authSuccess(msg.payload);
      } else {
        _authFail(msg.error?.message || msg.error || 'Auth failed');
      }
      return;
    }

    // RPC response — match by string ID (server may echo back number or string)
    if (msg.type === 'res') {
      const pending = this._pending.get(String(msg.id));
      if (pending) {
        this._pending.delete(String(msg.id));
        clearTimeout(pending.timeout);
        if (msg.ok !== false && !msg.error) {
          pending.resolve(msg.payload || msg.result || msg.data || {});
        } else {
          pending.reject(new Error(msg.error?.message || msg.error || 'RPC error'));
        }
      }
      return;
    }

    // Catch-all for unrecognized messages — send handshake if not sent yet
    this._log('info', `Unhandled msg type: ${msg.type}`);
    if (!this._handshakeSent) {
      this._log('info', 'Treating unrecognized first message as server hello, sending auth...');
      this._handshakeSent = true;
      this._sendHandshake(msg);
    }
  }

  // ===========================================================================
  // VERIFIED WORKING HANDSHAKE — DO NOT MODIFY without testing on live server.
  // ===========================================================================
  // This exact message format was validated against OpenClaw v3 protocol on
  // 2026-03-02 after 3 rounds of breakage. Every field is load-bearing:
  //
  //   auth.token     — required for token-mode compat; some versions check this
  //   auth.password  — required for password-mode; omitting → "gateway password missing"
  //   auth.mode      — do NOT include; schema rejects it as unexpected property
  //   client.id      — must be 'webchat' (schema rejects unknown constants)
  //   client.mode    — must be 'webchat'
  //   device block   — must be OMITTED entirely (dummy crypto → "device identity mismatch")
  //   role/scopes    — 'operator' with full scope list
  //
  // If you change ANY of these fields, you MUST test the WebSocket connection
  // end-to-end on the live server before pushing. The owner deploys from an
  // iPhone — broken pushes cost hours of debugging on a mobile screen.
  // ===========================================================================
  _sendHandshake(challenge) {
    const hasPw = !!(this._password && this._password.length > 0);
    const nonce = challenge?.nonce || '';
    this._log('info', `Sending handshake (hasPassword=${hasPw}, hasNonce=${!!nonce})`);

    this._connectReqId = String(++this._reqId);

    const authMsg = {
      type: 'req',
      id: this._connectReqId,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        auth: {
          token: this._password,
          password: this._password,
        },
        role: 'operator',
        scopes: ['operator.read', 'operator.write', 'operator.admin', 'operator.approvals', 'operator.pairing'],
        client: {
          id: 'webchat',
          version: '1.0.0',
          platform: 'web',
          mode: 'webchat',
        },
        // NO device block — dangerouslyDisableDeviceAuth + allowInsecureAuth
        // on the server means device identity is not required. Sending dummy
        // crypto values causes "device identity mismatch" (1008).
      },
    };

    this._log('info', `Handshake frame: type=req method=connect proto=3 (no device block — auth bypass)`);
    this._send(authMsg);
  }

  _send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // ---------------------------------------------------------------------------
  // RPC REQUEST/RESPONSE
  // ---------------------------------------------------------------------------

  request(method, params = {}, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      if (!this.authenticated) {
        reject(new Error('Not connected to OpenClaw'));
        return;
      }

      const id = String(++this._reqId);
      const timeout = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeoutMs);

      this._pending.set(id, { resolve, reject, timeout });

      this._send({
        type: 'req',
        id,
        method,
        params,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // EVENT SYSTEM
  // ---------------------------------------------------------------------------

  on(event, callback) {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }
    this._eventHandlers.get(event).add(callback);
    return () => this._eventHandlers.get(event)?.delete(callback);
  }

  _emit(event, payload) {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      // Snapshot the Set so handlers can safely unsubscribe during iteration
      for (const cb of [...handlers]) {
        try { cb(payload); } catch (e) { console.error('[OpenClaw] Event handler error:', e); }
      }
    }
    // Also emit wildcard
    const wild = this._eventHandlers.get('*');
    if (wild) {
      for (const cb of [...wild]) {
        try { cb(event, payload); } catch (e) { console.error('[OpenClaw] Wildcard handler error:', e); }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // HIGH-LEVEL API: AGENTS
  // ---------------------------------------------------------------------------

  async listAgents() {
    const result = await this.request('agents.list');
    return result.agents || result || [];
  }

  async addAgent(config) {
    return this.request('agents.add', config);
  }

  async deleteAgent(agentId) {
    return this.request('agents.delete', { agentId });
  }

  // ---------------------------------------------------------------------------
  // HIGH-LEVEL API: SESSIONS
  // ---------------------------------------------------------------------------

  async listSessions(agentId) {
    const params = {};
    if (agentId) params.agentId = agentId;
    params.includeDerivedTitles = true;
    params.includeLastMessage = true;
    const result = await this.request('sessions.list', params);
    return result.sessions || result || [];
  }

  async getHistory(sessionKey) {
    const result = await this.request('chat.history', { sessionKey });
    return result.messages || result || [];
  }

  async deleteSession(sessionKey) {
    return this.request('sessions.delete', { key: sessionKey });
  }

  async resetSession(sessionKey, reason) {
    const params = { key: sessionKey };
    if (reason) params.reason = reason;
    return this.request('sessions.reset', params);
  }

  // ---------------------------------------------------------------------------
  // HIGH-LEVEL API: CHAT
  // ---------------------------------------------------------------------------

  // ===========================================================================
  // VERIFIED SCHEMA — ChatSendParamsSchema (additionalProperties: false)
  // ===========================================================================
  // Required: sessionKey (NonEmptyString), message (String), idempotencyKey (NonEmptyString)
  // Optional: thinking (String), deliver (Boolean), attachments (Array), timeoutMs (Integer)
  // NO other fields allowed — agentId, sessionId, etc. cause validation errors.
  // Session key format: "agent:<agentId>:main" for webchat DMs.
  // deliver: false prevents forwarding to external channels (Telegram, Discord).
  // ===========================================================================
  async sendChat(text, { sessionKey, timeoutMs } = {}) {
    if (!sessionKey) throw new Error('sessionKey is required for chat.send');
    const idempotencyKey = this._generateId();
    const params = {
      sessionKey,
      message: text,
      idempotencyKey,
      deliver: false,
    };
    if (timeoutMs !== undefined) params.timeoutMs = timeoutMs;
    const result = await this.request('chat.send', params);
    // Attach the idempotency key so callers can correlate chat events by runId
    if (result && typeof result === 'object') {
      result._idempotencyKey = idempotencyKey;
    }
    return result;
  }

  // Generate a unique ID for idempotency keys
  _generateId() {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 10);
    return `mc-${ts}-${rand}`;
  }

  // Inject a message into a session without triggering an agent turn.
  // Used for system/bridge messages (WRITE_FILES, STAGING, etc.) that
  // should NOT appear as user chat messages.
  // label: string tag so _parseHistoryMessages can filter these out.
  async injectChat(text, { sessionKey, label } = {}) {
    if (!sessionKey) throw new Error('sessionKey is required for chat.inject');
    const params = { sessionKey, message: text };
    if (label) params.label = label;
    return this.request('chat.inject', params);
  }

  async abortChat(sessionKey, runId) {
    const params = { sessionKey };
    if (runId) params.runId = runId;
    return this.request('chat.abort', params);
  }

  // ---------------------------------------------------------------------------
  // HIGH-LEVEL API: CONFIG & TOOLS
  // ---------------------------------------------------------------------------

  async getConfig() {
    return this.request('config.get');
  }

  async getToolsCatalog() {
    return this.request('tools.catalog');
  }

  async getCronJobs() {
    return this.request('cron.status');
  }

  // ---------------------------------------------------------------------------
  // HIGH-LEVEL API: AGENT FILES (workspace file operations)
  // ---------------------------------------------------------------------------

  async listAgentFiles(agentId) {
    return this.request('agents.files.list', { agentId });
  }

  async getAgentFile(agentId, path) {
    return this.request('agents.files.get', { agentId, path });
  }

  async setAgentFile(agentId, path, content) {
    return this.request('agents.files.set', { agentId, path, content });
  }

  // ---------------------------------------------------------------------------
  // HIGH-LEVEL API: CRON JOBS
  // ---------------------------------------------------------------------------

  async listCronJobs() {
    const result = await this.request('cron.list');
    return result.jobs || result || [];
  }

  async addCronJob(job) {
    return this.request('cron.add', job);
  }

  async removeCronJob(jobId) {
    return this.request('cron.remove', { id: jobId });
  }

  async runCronJob(jobId) {
    return this.request('cron.run', { id: jobId }, 60000);
  }

  async getCronRuns(jobId) {
    const result = await this.request('cron.runs', { id: jobId });
    return result.runs || result || [];
  }

  // ---------------------------------------------------------------------------
  // HIGH-LEVEL API: WORKFLOW BRIDGE (Agent↔Mission Control sync)
  // ---------------------------------------------------------------------------
  // Writes workflow data to the Lead agent's workspace as files that agents
  // can read via their `read` tool. Uses agents.files.set RPC — no chat
  // pollution, no WRITE_FILES commands.

  // Sync a workflow's graph JSON to the Lead agent's workspace
  async syncWorkflowToAgent(wfId, meta, graphJson) {
    const payload = JSON.stringify({ meta, graph: graphJson }, null, 2);
    await this.setAgentFile('lead', `workflows/${wfId}.json`, payload);
  }

  // Sync the workflow index (list of all workflows) to Lead's workspace
  async syncWorkflowIndex(entries) {
    const index = JSON.stringify({ updatedAt: Date.now(), workflows: entries }, null, 2);
    await this.setAgentFile('lead', 'workflows/index.json', index);
  }

  // Read workflow data that an agent has written to their workspace
  async readAgentWorkflow(agentId, wfId) {
    const result = await this.getAgentFile(agentId, `workflows/${wfId}.json`);
    const content = result?.content || result;
    if (typeof content === 'string') return JSON.parse(content);
    return content;
  }

  // Read agent's workflow index
  async readAgentWorkflowIndex(agentId) {
    const result = await this.getAgentFile(agentId, 'workflows/index.json');
    const content = result?.content || result;
    if (typeof content === 'string') return JSON.parse(content);
    return content;
  }
}

// Singleton instance
window.openclawClient = new OpenClawClient();
```

---

# [15] workspace/index.html (2376 lines) — Mission Control SPA

```
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Mission Control — in-fused.org</title>
  <meta name="description" content="AI Agent Mission Control — manage, orchestrate, and monitor autonomous agents">

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

  <!-- Tailwind CSS (CDN with custom config) -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'system-ui', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace'],
          },
          colors: {
            mc: {
              bg: '#0a0e17',
              surface: '#111827',
              elevated: '#1f2937',
              border: '#374151',
              primary: '#06b6d4',
              'primary-dim': 'rgba(6,182,212,0.12)',
              secondary: '#8b5cf6',
              'secondary-dim': 'rgba(139,92,246,0.12)',
              success: '#10b981',
              'success-dim': 'rgba(16,185,129,0.12)',
              warning: '#f59e0b',
              'warning-dim': 'rgba(245,158,11,0.12)',
              danger: '#ef4444',
              'danger-dim': 'rgba(239,68,68,0.12)',
              text: '#f9fafb',
              'text-sec': '#9ca3af',
              'text-muted': '#6b7280',
            }
          }
        }
      }
    }
  </script>

  <!-- Custom Styles -->
  <link rel="stylesheet" href="css/styles.css">

  <!-- LiteGraph.js CSS -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/litegraph.js@0.7.18/css/litegraph.css">

  <!-- Alpine.js (deferred — runs after app.js registers stores) -->
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.8/dist/cdn.min.js"></script>

  <!-- Favicon + PWA -->
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%2322d3ee'/%3E%3Cstop offset='100%25' stop-color='%2306b6d4'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='32' cy='32' r='28' fill='none' stroke='%2306b6d4' stroke-width='2' opacity='0.3'/%3E%3Ccircle cx='32' cy='32' r='18' fill='none' stroke='%2306b6d4' stroke-width='1.5' opacity='0.4'/%3E%3Ccircle cx='32' cy='32' r='8' fill='none' stroke='%2306b6d4' stroke-width='1.5' opacity='0.5'/%3E%3Ccircle cx='32' cy='32' r='3' fill='url(%23g)'/%3E%3Cline x1='32' y1='32' x2='52' y2='16' stroke='%2322d3ee' stroke-width='2' stroke-linecap='round' opacity='0.8'/%3E%3Ccircle cx='52' cy='16' r='2.5' fill='%2322d3ee'/%3E%3Ccircle cx='20' cy='22' r='2' fill='%2306b6d4' opacity='0.7'/%3E%3Ccircle cx='44' cy='42' r='2' fill='%2306b6d4' opacity='0.7'/%3E%3C/svg%3E">
  <link rel="manifest" href="manifest.json">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Mission Ctrl">
  <meta name="theme-color" content="#0a0e17">
  <link rel="apple-touch-icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%2322d3ee'/%3E%3Cstop offset='100%25' stop-color='%2306b6d4'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='14' fill='%230a0e17'/%3E%3Ccircle cx='32' cy='32' r='24' fill='none' stroke='%2306b6d4' stroke-width='2' opacity='0.3'/%3E%3Ccircle cx='32' cy='32' r='15' fill='none' stroke='%2306b6d4' stroke-width='1.5' opacity='0.4'/%3E%3Ccircle cx='32' cy='32' r='6' fill='none' stroke='%2306b6d4' stroke-width='1.5' opacity='0.5'/%3E%3Ccircle cx='32' cy='32' r='3' fill='url(%23g)'/%3E%3Cline x1='32' y1='32' x2='48' y2='18' stroke='%2322d3ee' stroke-width='2' stroke-linecap='round' opacity='0.8'/%3E%3Ccircle cx='48' cy='18' r='2.5' fill='%2322d3ee'/%3E%3C/svg%3E">

  <!-- x-cloak: hide Alpine elements until initialized -->
  <style>[x-cloak] { display: none !important; }</style>
</head>

<body class="bg-mc-bg text-mc-text font-sans text-sm">

  <!-- ====================================================================
       AUTH SCREEN — shown until user authenticates
       ==================================================================== -->
  <div x-data="{ username: '', password: '', error: '', loading: false }"
       x-show="!$store.auth.ok"
       class="fixed inset-0 z-[200] bg-mc-bg flex items-center justify-center mc-grid-bg">

    <div class="w-full max-w-sm mx-4">
      <!-- Branding -->
      <div class="text-center mb-8">
        <div class="mb-4 flex justify-center" style="filter: drop-shadow(0 0 20px rgba(6,182,212,0.3))">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-14 h-14">
            <defs><linearGradient id="mc-grad-login" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#22d3ee"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient></defs>
            <circle cx="32" cy="32" r="28" stroke="#06b6d4" stroke-width="2" opacity="0.3"/>
            <circle cx="32" cy="32" r="18" stroke="#06b6d4" stroke-width="1.5" opacity="0.4"/>
            <circle cx="32" cy="32" r="8" stroke="#06b6d4" stroke-width="1.5" opacity="0.5"/>
            <circle cx="32" cy="32" r="3" fill="url(#mc-grad-login)"/>
            <line x1="32" y1="32" x2="52" y2="16" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
            <circle cx="52" cy="16" r="2.5" fill="#22d3ee"/>
            <circle cx="20" cy="22" r="2" fill="#06b6d4" opacity="0.7"/>
            <circle cx="44" cy="42" r="2" fill="#06b6d4" opacity="0.7"/>
          </svg>
        </div>
        <div class="text-xl font-bold text-cyan-400 tracking-[0.2em]">MISSION CONTROL</div>
        <div class="text-xs text-mc-text-muted mt-2 font-mono tracking-wider">in-fused.org</div>
      </div>

      <!-- Login Card -->
      <div class="bg-mc-surface border border-mc-border rounded-2xl p-6 shadow-2xl shadow-black/50">
        <div class="text-xs font-medium text-mc-text-muted uppercase tracking-wider mb-5 text-center">Authentication Required</div>

        <!-- Error -->
        <div x-show="error" x-transition
             class="mb-4 px-3 py-2 bg-mc-danger-dim border border-red-500/20 rounded-lg text-xs text-red-400 text-center"
             x-text="error"></div>

        <!-- Username -->
        <div class="mb-4">
          <label class="block text-[10px] font-medium text-mc-text-muted uppercase tracking-wider mb-1.5">Username</label>
          <input type="text" x-model="username"
                 placeholder="admin"
                 class="w-full bg-mc-bg border border-mc-border rounded-lg px-4 py-2.5 text-sm text-mc-text placeholder-mc-text-muted mc-input-focus"
                 @keydown.enter="$refs.passInput.focus()">
        </div>

        <!-- Password -->
        <div class="mb-6">
          <label class="block text-[10px] font-medium text-mc-text-muted uppercase tracking-wider mb-1.5">Password</label>
          <input type="password" x-model="password" x-ref="passInput"
                 placeholder="Enter password"
                 class="w-full bg-mc-bg border border-mc-border rounded-lg px-4 py-2.5 text-sm text-mc-text placeholder-mc-text-muted mc-input-focus"
                 @keydown.enter="loading = true; error = ''; $store.auth.login(username, password).then(ok => { loading = false; if (!ok) { error = 'Invalid credentials'; password = ''; } })">
        </div>

        <!-- Submit -->
        <button @click="loading = true; error = ''; $store.auth.login(username, password).then(ok => { loading = false; if (!ok) { error = 'Invalid credentials'; password = ''; } })"
                :disabled="loading || !username.trim() || !password.trim()"
                class="w-full py-2.5 bg-cyan-500 text-mc-bg rounded-lg text-sm font-semibold hover:brightness-110 transition-all shadow-lg shadow-cyan-500/25 disabled:opacity-30 disabled:cursor-not-allowed">
          <span x-show="!loading">Access Mission Control</span>
          <span x-show="loading" class="flex items-center justify-center gap-2">
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            Verifying...
          </span>
        </button>
      </div>

      <!-- Footer -->
      <div class="text-center mt-6 text-[10px] text-mc-text-muted font-mono opacity-50">
        Secured access &middot; Session expires on tab close
      </div>
    </div>
  </div>

  <!-- ====================================================================
       BOOT SCREEN
       ==================================================================== -->
  <div x-data x-show="$store.auth.ok && $store.app.booting" x-cloak
       x-transition:leave="transition ease-in duration-500"
       x-transition:leave-start="opacity-100"
       x-transition:leave-end="opacity-0"
       class="fixed inset-0 z-[100] bg-mc-bg flex items-center justify-center">
    <div class="mc-boot-scanline"></div>
    <div class="text-center">
      <div class="mb-4 flex justify-center">
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-12 h-12">
          <defs><linearGradient id="mc-grad-boot" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#22d3ee"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient></defs>
          <circle cx="32" cy="32" r="28" stroke="#06b6d4" stroke-width="2" opacity="0.3"/>
          <circle cx="32" cy="32" r="18" stroke="#06b6d4" stroke-width="1.5" opacity="0.4"/>
          <circle cx="32" cy="32" r="8" stroke="#06b6d4" stroke-width="1.5" opacity="0.5"/>
          <circle cx="32" cy="32" r="3" fill="url(#mc-grad-boot)"/>
          <line x1="32" y1="32" x2="52" y2="16" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
          <circle cx="52" cy="16" r="2.5" fill="#22d3ee"/>
          <circle cx="20" cy="22" r="2" fill="#06b6d4" opacity="0.7"/>
          <circle cx="44" cy="42" r="2" fill="#06b6d4" opacity="0.7"/>
        </svg>
      </div>
      <div class="text-xl font-bold text-cyan-400 tracking-wider mb-2">MISSION CONTROL</div>
      <div class="mc-boot-text text-xs text-mc-text-muted font-mono">Initializing systems...</div>
      <div class="mt-6 w-48 mx-auto h-0.5 bg-mc-border rounded overflow-hidden">
        <div class="h-full bg-cyan-400 rounded" style="animation: bootProgress 1.5s ease-out forwards"></div>
      </div>
    </div>
    <style>
      @keyframes bootProgress { from { width: 0% } to { width: 100% } }
    </style>
  </div>

  <!-- ====================================================================
       MAIN APPLICATION SHELL
       ==================================================================== -->
  <div x-data x-show="$store.auth.ok && !$store.app.booting" x-cloak
       class="flex h-screen w-screen overflow-hidden"
       style="height: 100dvh; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px)">

    <!-- Mobile Sidebar Backdrop -->
    <div class="mc-sidebar-backdrop"
         :class="$store.app.mobile && $store.app.sidebarOpen ? 'open' : ''"
         @click="$store.app.sidebarOpen = false"></div>

    <!-- ==================================================================
         SIDEBAR
         ================================================================== -->
    <aside :class="[
             $store.app.mobile ? 'mc-sidebar-mobile' : ($store.app.sidebarOpen ? 'w-60 min-w-[240px]' : 'w-16 min-w-[64px]'),
             $store.app.sidebarOpen ? 'open' : ''
           ]"
           class="bg-mc-surface border-r border-mc-border flex flex-col transition-all duration-200">

      <!-- Logo -->
      <div class="h-14 flex items-center gap-3 px-4 border-b border-mc-border flex-shrink-0">
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 flex-shrink-0">
          <circle cx="32" cy="32" r="28" stroke="#06b6d4" stroke-width="2.5" opacity="0.3"/>
          <circle cx="32" cy="32" r="18" stroke="#06b6d4" stroke-width="2" opacity="0.4"/>
          <circle cx="32" cy="32" r="8" stroke="#06b6d4" stroke-width="2" opacity="0.5"/>
          <circle cx="32" cy="32" r="3.5" fill="#22d3ee"/>
          <line x1="32" y1="32" x2="52" y2="16" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
          <circle cx="52" cy="16" r="3" fill="#22d3ee"/>
        </svg>
        <span x-show="$store.app.sidebarOpen || $store.app.mobile" x-transition
              class="font-semibold text-sm tracking-wide text-cyan-400 whitespace-nowrap">
          MISSION CONTROL
        </span>
      </div>

      <!-- Navigation — setView auto-closes sidebar on mobile -->
      <!-- Items wrapped with x-show for settings-based visibility -->
      <nav class="flex-1 py-3 px-2 space-y-1 overflow-y-auto">

        <!-- Dashboard (always visible) -->
        <button @click="$store.app.setView('dashboard')"
                :class="$store.app.view === 'dashboard' ? 'bg-mc-primary-dim text-cyan-400' : 'text-mc-text-sec hover:bg-mc-elevated hover:text-mc-text'"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/>
          </svg>
          <span x-show="$store.app.sidebarOpen || $store.app.mobile" class="whitespace-nowrap">Dashboard</span>
        </button>

        <!-- Agents -->
        <button x-show="$store.settings.isVisible('agents')"
                @click="$store.app.setView('agents')"
                :class="$store.app.view === 'agents' ? 'bg-mc-primary-dim text-cyan-400' : 'text-mc-text-sec hover:bg-mc-elevated hover:text-mc-text'"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>
          </svg>
          <span x-show="$store.app.sidebarOpen || $store.app.mobile" class="whitespace-nowrap">Agents</span>
          <span x-show="($store.app.sidebarOpen || $store.app.mobile) && $store.agents.scheduled > 0"
                class="ml-auto text-[10px] bg-mc-warning-dim text-amber-400 px-1.5 py-0.5 rounded-full font-mono"
                x-text="$store.agents.scheduled + ' scheduled'"></span>
        </button>

        <!-- Workflows -->
        <button x-show="$store.settings.isVisible('workflows')"
                @click="$store.app.setView('workflows')"
                :class="$store.app.view === 'workflows' ? 'bg-mc-primary-dim text-cyan-400' : 'text-mc-text-sec hover:bg-mc-elevated hover:text-mc-text'"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/>
          </svg>
          <span x-show="$store.app.sidebarOpen || $store.app.mobile" class="whitespace-nowrap">Workflows</span>
        </button>

        <!-- Chat -->
        <button x-show="$store.settings.isVisible('chat')"
                @click="$store.app.setView('chat')"
                :class="$store.app.view === 'chat' ? 'bg-mc-primary-dim text-cyan-400' : 'text-mc-text-sec hover:bg-mc-elevated hover:text-mc-text'"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"/>
          </svg>
          <span x-show="$store.app.sidebarOpen || $store.app.mobile" class="whitespace-nowrap">Chat</span>
          <span x-show="($store.app.sidebarOpen || $store.app.mobile) && $store.sessions.list.filter(s => s.unread > 0).length > 0"
                class="ml-auto w-5 h-5 flex items-center justify-center text-[10px] bg-cyan-500 text-mc-bg rounded-full font-bold"
                x-text="$store.sessions.list.reduce((n, s) => n + s.unread, 0)"></span>
        </button>

        <!-- Teams -->
        <button x-show="$store.settings.isVisible('teams')"
                @click="$store.app.setView('teams')"
                :class="$store.app.view === 'teams' ? 'bg-mc-primary-dim text-cyan-400' : 'text-mc-text-sec hover:bg-mc-elevated hover:text-mc-text'"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"/>
          </svg>
          <span x-show="$store.app.sidebarOpen || $store.app.mobile" class="whitespace-nowrap">Teams</span>
        </button>

        <!-- Monitor -->
        <button x-show="$store.settings.isVisible('monitor')"
                @click="$store.app.setView('monitor')"
                :class="$store.app.view === 'monitor' ? 'bg-mc-primary-dim text-cyan-400' : 'text-mc-text-sec hover:bg-mc-elevated hover:text-mc-text'"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/>
          </svg>
          <span x-show="$store.app.sidebarOpen || $store.app.mobile" class="whitespace-nowrap">Monitor</span>
        </button>

        <!-- Staging -->
        <button x-show="$store.settings.isVisible('staging')"
                @click="$store.app.setView('staging')"
                :class="$store.app.view === 'staging' ? 'bg-mc-primary-dim text-cyan-400' : 'text-mc-text-sec hover:bg-mc-elevated hover:text-mc-text'"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          <span x-show="$store.app.sidebarOpen || $store.app.mobile" class="whitespace-nowrap">Staging</span>
          <span x-show="($store.app.sidebarOpen || $store.app.mobile) && $store.staging.pendingCount > 0"
                class="ml-auto w-5 h-5 flex items-center justify-center text-[10px] bg-amber-500 text-mc-bg rounded-full font-bold"
                x-text="$store.staging.pendingCount"></span>
        </button>

        <!-- Activity -->
        <button x-show="$store.settings.isVisible('activity')"
                @click="$store.app.setView('activity'); $store.activity.dismissNew()"
                :class="$store.app.view === 'activity' ? 'bg-mc-primary-dim text-cyan-400' : 'text-mc-text-sec hover:bg-mc-elevated hover:text-mc-text'"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span x-show="$store.app.sidebarOpen || $store.app.mobile" class="whitespace-nowrap">Activity</span>
          <span x-show="($store.app.sidebarOpen || $store.app.mobile) && $store.activity.newCount > 0"
                class="ml-auto w-5 h-5 flex items-center justify-center text-[10px] bg-violet-500 text-white rounded-full font-bold"
                x-text="$store.activity.newCount > 99 ? '99+' : $store.activity.newCount"></span>
        </button>

        <!-- Divider -->
        <div class="my-2 border-t border-mc-border/50"></div>

        <!-- Settings (always visible — cannot be hidden) -->
        <button @click="$store.app.setView('settings')"
                :class="$store.app.view === 'settings' ? 'bg-mc-primary-dim text-cyan-400' : 'text-mc-text-sec hover:bg-mc-elevated hover:text-mc-text'"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          <span x-show="$store.app.sidebarOpen || $store.app.mobile" class="whitespace-nowrap">Settings</span>
        </button>

      </nav>

      <!-- Sidebar Footer -->
      <div class="border-t border-mc-border p-3 flex-shrink-0">
        <!-- Connection Status — two clearly separate indicators -->
        <div x-show="$store.app.sidebarOpen || $store.app.mobile" class="flex items-center gap-2 px-2 py-1.5 text-xs mb-2">
          <!-- LiteLLM API status (not tappable — health polling handles it) -->
          <div class="flex items-center gap-1.5 px-2 py-1 rounded-md"
               :class="$store.app.connected ? 'bg-emerald-500/10' : 'bg-red-500/10'">
            <span class="mc-dot" :class="$store.app.connected ? 'mc-dot-connected' : 'mc-dot-disconnected'" style="width:6px;height:6px"></span>
            <span :class="$store.app.connected ? 'text-emerald-400' : 'text-red-400'" class="text-[10px] font-mono"
                  x-text="$store.app.connected ? 'API' : 'API'"></span>
          </div>
          <!-- OpenClaw WS status (tappable — retries WS only) -->
          <button @click.stop="$store.app.reconnect()"
                  class="flex items-center gap-1.5 px-2 py-1 rounded-md transition-all"
                  :class="$store.app.ocConnected ? 'bg-emerald-500/10 hover:bg-emerald-500/20' : 'bg-red-500/10 hover:bg-red-500/20'"
                  :title="$store.app.ocConnected ? 'OpenClaw connected' : 'Tap to reconnect'">
            <span class="mc-dot" :class="$store.app.ocConnected ? 'mc-dot-connected' : ($store.app._reconnecting ? 'mc-dot-idle' : 'mc-dot-disconnected')" style="width:6px;height:6px"></span>
            <span :class="$store.app.ocConnected ? 'text-emerald-400' : ($store.app._reconnecting ? 'text-amber-400' : 'text-red-400')"
                  class="text-[10px] font-mono"
                  x-text="$store.app.ocConnected ? 'WS' : ($store.app._reconnecting ? 'WS...' : 'WS')"></span>
          </button>
        </div>
        <!-- Collapse Toggle (desktop only) -->
        <button x-show="!$store.app.mobile"
                @click="$store.app.sidebarOpen = !$store.app.sidebarOpen"
                class="w-full flex items-center justify-center gap-2 px-2 py-1.5 rounded-lg text-mc-text-muted hover:text-mc-text hover:bg-mc-elevated transition-all">
          <svg class="w-4 h-4 transition-transform" :class="$store.app.sidebarOpen ? '' : 'rotate-180'"
               fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
          </svg>
          <span x-show="$store.app.sidebarOpen" class="text-xs">Collapse</span>
        </button>
      </div>
    </aside>

    <!-- ==================================================================
         MAIN CONTENT AREA
         ================================================================== -->
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">

      <!-- ================================================================
           HEADER BAR
           ================================================================ -->
      <header class="h-14 min-h-[56px] bg-mc-surface border-b border-mc-border flex items-center px-4 md:px-6 gap-2 md:gap-4 flex-shrink-0">
        <!-- Hamburger (mobile only) -->
        <button @click="$store.app.sidebarOpen = !$store.app.sidebarOpen"
                class="mc-hamburger w-10 h-10 flex items-center justify-center rounded-lg text-mc-text-sec hover:bg-mc-elevated transition-all flex-shrink-0">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/>
          </svg>
        </button>

        <h1 class="text-base font-semibold text-mc-text capitalize" x-text="$store.app.view"></h1>
        <div class="flex-1"></div>

        <!-- Demo Mode Badge + Reconnect -->
        <template x-if="$store.app.demoMode">
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-mono bg-mc-warning-dim text-amber-400 px-2 py-0.5 rounded-full tracking-wide">
              DEMO
            </span>
            <button @click="$store.app.reconnect()"
                    class="text-[10px] font-mono bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full tracking-wide hover:bg-cyan-500/20 transition-all cursor-pointer">
              Reconnect
            </button>
          </div>
        </template>

        <!-- Quick Actions (hidden on small mobile) -->
        <button @click="$store.agents.openWizard()"
                class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg text-xs font-medium hover:bg-cyan-500/20 transition-all">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
          New Agent
        </button>

        <!-- Connection Status — two separate pills: API + WS -->
        <div class="flex items-center gap-1">
          <!-- LiteLLM API status -->
          <div class="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono"
               :class="$store.app.connected ? 'bg-mc-success-dim text-emerald-400' : 'bg-red-500/10 text-red-400'">
            <span class="mc-dot"
                  :class="$store.app.connected ? 'mc-dot-connected' : 'mc-dot-disconnected'"
                  style="width:5px;height:5px"></span>
            <span x-text="$store.app.connected ? 'API' : 'API'"></span>
          </div>
          <!-- OpenClaw WS status (tappable to reconnect) -->
          <button @click="$store.app.reconnect()"
                  class="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono transition-all"
                  :class="$store.app.ocConnected
                    ? 'bg-mc-success-dim text-emerald-400'
                    : $store.app._reconnecting
                      ? 'bg-mc-warning-dim text-amber-400 animate-pulse'
                      : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'"
                  :title="$store.app.ocConnected ? 'OpenClaw connected' : 'Tap to reconnect'">
            <span class="mc-dot"
                  :class="$store.app.ocConnected ? 'mc-dot-connected' : ($store.app._reconnecting ? 'mc-dot-idle' : 'mc-dot-disconnected')"
                  style="width:5px;height:5px"></span>
            <span x-text="$store.app.ocConnected ? 'WS' : ($store.app._reconnecting ? 'WS...' : 'WS')"></span>
          </button>
        </div>

        <!-- OpenClaw Native UI (fallback link) -->
        <a href="/openclaw/" target="_blank"
           class="hidden md:flex items-center gap-1 px-2 py-1 text-mc-text-muted rounded-lg text-[10px] hover:text-mc-text-sec hover:bg-mc-elevated transition-all opacity-60 hover:opacity-100"
           title="Open native OpenClaw UI (fallback)">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/>
          </svg>
          Native UI
        </a>
      </header>

      <!-- ================================================================
           CONTENT VIEWS
           ================================================================ -->
      <main class="flex-1 overflow-hidden">

        <!-- ==========================================
             VIEW: DASHBOARD
             ========================================== -->
        <div x-show="$store.app.view === 'dashboard'"
             x-transition:enter="animate-fade-up"
             class="h-full overflow-y-auto p-4 md:p-6 mc-grid-bg">

          <!-- Away Report Banner (shown when agents worked while you were away) -->
          <div x-show="$store.app.awayReport" x-transition
               class="mb-6 bg-mc-secondary-dim border border-violet-500/20 rounded-xl p-5">
            <div class="flex items-center gap-3 mb-3">
              <div class="text-2xl">&#128203;</div>
              <div class="flex-1">
                <div class="text-sm font-semibold text-mc-text">While You Were Away</div>
                <div class="text-xs text-mc-text-muted" x-text="($store.app.awayReport?.duration || '') + ' since last visit'"></div>
              </div>
              <button @click="$store.app.awayReport = null"
                      class="text-mc-text-muted hover:text-mc-text text-xs px-2 py-1 rounded hover:bg-mc-elevated transition-all">
                Dismiss
              </button>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div class="bg-mc-bg rounded-lg p-3">
                <div class="text-mc-text-muted">Tasks Completed</div>
                <div class="text-lg font-bold text-emerald-400" x-text="$store.app.awayReport?.tasksCompleted || 0"></div>
              </div>
              <div class="bg-mc-bg rounded-lg p-3">
                <div class="text-mc-text-muted">Workflows Run</div>
                <div class="text-lg font-bold text-cyan-400" x-text="$store.app.awayReport?.workflowsRun || 0"></div>
              </div>
              <div class="bg-mc-bg rounded-lg p-3">
                <div class="text-mc-text-muted">Staging Items</div>
                <div class="text-lg font-bold text-amber-400" x-text="$store.app.awayReport?.stagingItems || 0"></div>
              </div>
              <div class="bg-mc-bg rounded-lg p-3">
                <div class="text-mc-text-muted">Errors</div>
                <div class="text-lg font-bold text-red-400" x-text="$store.app.awayReport?.errors || 0"></div>
              </div>
            </div>
          </div>

          <!-- Stats Row -->
          <div class="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
            <div class="mc-stat-border cyan relative bg-mc-surface border border-mc-border rounded-xl p-5">
              <div class="text-mc-text-muted text-xs font-medium uppercase tracking-wider mb-1">Agents</div>
              <div class="text-2xl font-bold text-mc-text" x-text="$store.agents.list.length"></div>
              <div class="text-xs mt-1" :class="$store.agents.scheduled > 0 ? 'text-amber-400' : 'text-mc-text-muted'"><span x-text="$store.agents.scheduled"></span> scheduled</div>
            </div>
            <div class="mc-stat-border green relative bg-mc-surface border border-mc-border rounded-xl p-5">
              <div class="text-mc-text-muted text-xs font-medium uppercase tracking-wider mb-1">Sessions</div>
              <div class="text-2xl font-bold text-mc-text" x-text="$store.sessions.list.length"></div>
              <div class="text-xs text-mc-text-muted mt-1">Active conversations</div>
            </div>
            <div class="mc-stat-border purple relative bg-mc-surface border border-mc-border rounded-xl p-5">
              <div class="text-mc-text-muted text-xs font-medium uppercase tracking-wider mb-1">Models</div>
              <div class="text-2xl font-bold text-mc-text" x-text="$store.models.list.length"></div>
              <div class="text-xs text-mc-text-muted mt-1">via LiteLLM</div>
            </div>
            <div class="mc-stat-border amber relative bg-mc-surface border border-mc-border rounded-xl p-5 cursor-pointer" @click="$store.app.setView('teams')">
              <div class="text-mc-text-muted text-xs font-medium uppercase tracking-wider mb-1">Teams</div>
              <div class="text-2xl font-bold text-mc-text" x-text="$store.governance.teams.length"></div>
              <div class="text-xs text-amber-400 mt-1">
                <template x-for="(team, i) in $store.governance.teams" :key="team.id">
                  <span><span x-show="i > 0"> · </span><span x-text="team.name.replace(' Team', '')"></span></span>
                </template>
              </div>
            </div>
          </div>

          <!-- Active Agents -->
          <div class="mb-8">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-sm font-semibold text-mc-text">Active Agents</h2>
              <button @click="$store.agents.openWizard()" class="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">+ Create Agent</button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <template x-for="agent in $store.agents.list" :key="agent.id">
                <div class="bg-mc-surface border border-mc-border rounded-xl p-5 mc-card-glow transition-all cursor-pointer"
                     @click="$store.agents.selectAgent(agent.id); $store.app.setView('agents')">
                  <div class="flex items-start gap-3 mb-3">
                    <span class="text-2xl" x-text="agent.emoji"></span>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="font-semibold text-mc-text truncate" x-text="agent.name"></span>
                        <span class="mc-dot" :class="$store.cron.countForAgent(agent.id) > 0 ? 'mc-dot-running' : 'mc-dot-idle'" :title="$store.cron.countForAgent(agent.id) > 0 ? $store.cron.countForAgent(agent.id) + ' cron job(s)' : 'No scheduled jobs'"></span>
                      </div>
                      <div class="text-xs text-mc-text-muted truncate" x-text="agent.description"></div>
                    </div>
                  </div>
                  <div class="flex items-center gap-4 text-xs text-mc-text-muted">
                    <span class="font-mono truncate max-w-[120px]" x-text="agent.model"></span>
                    <span x-text="agent.tasksCompleted + ' tasks'"></span>
                    <span x-text="agent.lastActive" class="ml-auto"></span>
                  </div>
                  <div x-show="agent.currentTask" class="mt-3 text-xs bg-mc-elevated rounded-lg px-3 py-2 text-cyan-300 truncate">
                    <span x-text="agent.currentTask"></span>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- Quick Actions + Recent Activity -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-mc-surface border border-mc-border rounded-xl p-5">
              <h2 class="text-sm font-semibold text-mc-text mb-4">Quick Actions</h2>
              <div class="grid grid-cols-2 gap-3">
                <button @click="$store.agents.openWizard()" class="flex flex-col items-center gap-2 p-4 rounded-xl bg-mc-elevated hover:bg-mc-border/30 transition-all group">
                  <span class="text-2xl group-hover:scale-110 transition-transform">🤖</span>
                  <span class="text-xs text-mc-text-sec group-hover:text-mc-text">New Agent</span>
                </button>
                <button @click="$store.app.setView('workflows')" class="flex flex-col items-center gap-2 p-4 rounded-xl bg-mc-elevated hover:bg-mc-border/30 transition-all group">
                  <span class="text-2xl group-hover:scale-110 transition-transform">🔧</span>
                  <span class="text-xs text-mc-text-sec group-hover:text-mc-text">Build Workflow</span>
                </button>
                <button @click="$store.app.setView('chat')" class="flex flex-col items-center gap-2 p-4 rounded-xl bg-mc-elevated hover:bg-mc-border/30 transition-all group">
                  <span class="text-2xl group-hover:scale-110 transition-transform">💬</span>
                  <span class="text-xs text-mc-text-sec group-hover:text-mc-text">Chat with Agent</span>
                </button>
                <button @click="$store.app.setView('teams')" class="flex flex-col items-center gap-2 p-4 rounded-xl bg-mc-elevated hover:bg-mc-border/30 transition-all group">
                  <span class="text-2xl group-hover:scale-110 transition-transform">🏆</span>
                  <span class="text-xs text-mc-text-sec group-hover:text-mc-text">Team Leaderboard</span>
                </button>
                <button @click="$store.app.setView('monitor')" class="flex flex-col items-center gap-2 p-4 rounded-xl bg-mc-elevated hover:bg-mc-border/30 transition-all group">
                  <span class="text-2xl group-hover:scale-110 transition-transform">📊</span>
                  <span class="text-xs text-mc-text-sec group-hover:text-mc-text">View Logs</span>
                </button>
              </div>
            </div>

            <div class="bg-mc-surface border border-mc-border rounded-xl p-5">
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-sm font-semibold text-mc-text">Recent Activity</h2>
                <div class="flex gap-1">
                  <button @click="$store.app._dashActivity = 'agents'"
                          class="px-2 py-1 rounded text-[11px] transition-all"
                          :class="($store.app._dashActivity || 'agents') === 'agents' ? 'bg-mc-primary-dim text-cyan-400' : 'text-mc-text-muted hover:text-mc-text'">
                    Agents
                    <span x-show="$store.activity.newCount > 0"
                          class="ml-0.5 px-1 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px]"
                          x-text="$store.activity.newCount"></span>
                  </button>
                  <button @click="$store.app._dashActivity = 'system'"
                          class="px-2 py-1 rounded text-[11px] transition-all"
                          :class="$store.app._dashActivity === 'system' ? 'bg-mc-primary-dim text-cyan-400' : 'text-mc-text-muted hover:text-mc-text'">
                    System
                  </button>
                </div>
              </div>

              <!-- Agent Activity (live + server events) -->
              <div x-show="($store.app._dashActivity || 'agents') === 'agents'" class="space-y-1 max-h-48 overflow-y-auto">
                <template x-for="(ev, i) in $store.activity.events.slice(0, 10)" :key="ev.time + '-' + i">
                  <div class="flex items-start gap-2 px-2 py-1.5 rounded text-xs hover:bg-mc-elevated/50 transition-colors">
                    <span class="text-[10px] flex-shrink-0 w-4 text-center" x-text="$store.activity.typeIcon(ev.type)"></span>
                    <span class="text-mc-text-muted whitespace-nowrap flex-shrink-0" x-text="$store.activity.formatTime(ev.time)"></span>
                    <span class="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                          :class="$store.activity.typeColor(ev.type)"
                          x-text="$store.activity.typeLabel(ev.type)"></span>
                    <span class="text-mc-text-sec truncate" x-text="ev.message"></span>
                  </div>
                </template>
                <div x-show="$store.activity.events.length === 0" class="text-center py-4 text-xs text-mc-text-muted">
                  No agent activity yet. Live events appear when agents are working.
                </div>
              </div>

              <!-- System Logs (client-side) -->
              <div x-show="$store.app._dashActivity === 'system'" class="space-y-1 max-h-48 overflow-y-auto">
                <template x-for="(log, i) in $store.monitor.logs.slice(0, 8)" :key="i">
                  <div class="mc-log-row flex items-start gap-3 px-2 py-1.5 rounded text-xs font-mono">
                    <span class="text-mc-text-muted whitespace-nowrap" x-text="log.time"></span>
                    <span class="font-semibold w-10 text-center flex-shrink-0"
                          :class="{'text-cyan-400': log.level==='info', 'text-amber-400': log.level==='warn', 'text-red-400': log.level==='error', 'text-mc-text-muted': log.level==='debug'}"
                          x-text="log.level.toUpperCase()"></span>
                    <span class="text-mc-text-sec truncate" x-text="log.msg"></span>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- ==========================================
             VIEW: AGENTS
             ========================================== -->
        <div x-show="$store.app.view === 'agents'"
             x-transition:enter="animate-fade-up"
             class="h-full overflow-y-auto p-4 md:p-6 mc-grid-bg">

          <div class="flex items-center justify-between mb-4 md:mb-6 gap-3">
            <div class="min-w-0">
              <h2 class="text-base md:text-lg font-semibold text-mc-text">Agent Management</h2>
              <p class="text-xs text-mc-text-muted mt-0.5 hidden sm:block">Create, configure, and manage your autonomous AI agents</p>
            </div>
            <button @click="$store.agents.openWizard()"
                    class="flex items-center gap-2 px-3 md:px-4 py-2 bg-cyan-500 text-mc-bg rounded-lg text-xs md:text-sm font-medium hover:brightness-110 transition-all shadow-lg shadow-cyan-500/20 flex-shrink-0">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
              </svg>
              <span class="hidden sm:inline">Create Agent</span>
              <span class="sm:hidden">New</span>
            </button>
          </div>

          <!-- Team-grouped agent cards -->
          <template x-for="team in $store.governance.teams" :key="team.id">
            <div class="mb-6">
              <!-- Team header -->
              <div class="flex items-center gap-3 mb-3">
                <h3 class="text-sm font-semibold text-mc-text uppercase tracking-wider" x-text="team.name"></h3>
                <div class="flex-1 h-px bg-mc-border"></div>
                <span class="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      :class="team.id === 'core' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'"
                      x-text="team.members.length + ' agents'"></span>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <template x-for="agent in $store.agents.list.filter(a => team.members.includes(a.id))" :key="agent.id">
                  <div class="bg-mc-surface border border-mc-border rounded-xl overflow-hidden mc-card-glow transition-all">
                    <div class="p-5">
                      <div class="flex items-start gap-3 mb-4">
                        <div class="w-12 h-12 rounded-xl bg-mc-elevated flex items-center justify-center text-2xl flex-shrink-0" x-text="agent.emoji"></div>
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2">
                            <span class="font-semibold text-mc-text" x-text="agent.name"></span>
                            <span x-show="team.lead === agent.id" class="text-[9px] px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded font-medium">LEAD</span>
                            <span class="mc-dot" :class="$store.cron.countForAgent(agent.id) > 0 ? 'mc-dot-running' : 'mc-dot-idle'" :title="$store.cron.countForAgent(agent.id) > 0 ? $store.cron.countForAgent(agent.id) + ' cron job(s)' : 'No scheduled jobs'"></span>
                          </div>
                          <div class="text-xs text-mc-text-muted mt-0.5" x-text="agent.description"></div>
                        </div>
                      </div>
                      <div class="space-y-2 text-xs">
                        <div class="flex justify-between"><span class="text-mc-text-muted">Model</span><span class="text-mc-text-sec font-mono" x-text="agent.model"></span></div>
                        <div class="flex justify-between"><span class="text-mc-text-muted">Tasks Completed</span><span class="text-mc-text-sec" x-text="agent.tasksCompleted"></span></div>
                        <div class="flex justify-between"><span class="text-mc-text-muted">Tokens Used</span><span class="text-mc-text-sec" x-text="formatTokens(agent.tokensUsed)"></span></div>
                        <div class="flex justify-between"><span class="text-mc-text-muted">Score</span><span class="text-mc-text-sec font-semibold" x-text="$store.governance.getScore(agent.id)"></span></div>
                      </div>
                      <div x-show="agent.tools && agent.tools.length > 0" class="mt-3 flex flex-wrap gap-1">
                        <template x-for="toolId in agent.tools" :key="toolId">
                          <span class="text-[10px] px-1.5 py-0.5 bg-mc-elevated rounded text-mc-text-muted"
                                x-text="(AGENT_TOOLS.find(t => t.id === toolId) || {name: toolId}).name"></span>
                        </template>
                      </div>
                    </div>
                    <div class="border-t border-mc-border px-5 py-3 flex items-center gap-2">
                      <button @click="$store.cron.toggle(agent.id)"
                              class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                              :class="$store.cron.countForAgent(agent.id) > 0 ? 'bg-mc-warning-dim text-amber-400 hover:bg-amber-500/20' : 'bg-mc-elevated text-mc-text-muted hover:bg-mc-surface hover:text-mc-text-sec'">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <span x-text="$store.cron.countForAgent(agent.id) > 0 ? $store.cron.countForAgent(agent.id) + ' job' + ($store.cron.countForAgent(agent.id) !== 1 ? 's' : '') : 'Cron'"></span>
                      </button>
                      <button @click="$store.sessions.createSession(agent.id)"
                              class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-mc-primary-dim text-cyan-400 hover:bg-cyan-500/20 transition-all">
                        Chat
                      </button>
                      <button @click="if(confirm('Delete agent ' + agent.name + '?')) $store.agents.deleteAgent(agent.id)"
                              class="px-3 py-1.5 rounded-lg text-xs text-mc-text-muted hover:text-red-400 hover:bg-mc-danger-dim transition-all">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </template>

          <!-- Unassigned agents (not in any team) -->
          <template x-if="$store.agents.list.filter(a => !$store.governance.teams.some(t => t.members.includes(a.id))).length > 0">
            <div class="mb-6">
              <div class="flex items-center gap-3 mb-3">
                <h3 class="text-sm font-semibold text-mc-text-muted uppercase tracking-wider">Unassigned</h3>
                <div class="flex-1 h-px bg-mc-border"></div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <template x-for="agent in $store.agents.list.filter(a => !$store.governance.teams.some(t => t.members.includes(a.id)))" :key="agent.id">
                  <div class="bg-mc-surface border border-mc-border rounded-xl overflow-hidden mc-card-glow transition-all">
                    <div class="p-5">
                      <div class="flex items-start gap-3 mb-4">
                        <div class="w-12 h-12 rounded-xl bg-mc-elevated flex items-center justify-center text-2xl flex-shrink-0" x-text="agent.emoji"></div>
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2">
                            <span class="font-semibold text-mc-text" x-text="agent.name"></span>
                            <span class="mc-dot" :class="$store.cron.countForAgent(agent.id) > 0 ? 'mc-dot-running' : 'mc-dot-idle'" :title="$store.cron.countForAgent(agent.id) > 0 ? $store.cron.countForAgent(agent.id) + ' cron job(s)' : 'No scheduled jobs'"></span>
                          </div>
                          <div class="text-xs text-mc-text-muted mt-0.5" x-text="agent.description"></div>
                        </div>
                      </div>
                      <div class="space-y-2 text-xs">
                        <div class="flex justify-between"><span class="text-mc-text-muted">Model</span><span class="text-mc-text-sec font-mono" x-text="agent.model"></span></div>
                        <div class="flex justify-between"><span class="text-mc-text-muted">Tasks Completed</span><span class="text-mc-text-sec" x-text="agent.tasksCompleted"></span></div>
                      </div>
                    </div>
                    <div class="border-t border-mc-border px-5 py-3 flex items-center gap-2">
                      <button @click="$store.cron.toggle(agent.id)"
                              class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                              :class="$store.cron.countForAgent(agent.id) > 0 ? 'bg-mc-warning-dim text-amber-400 hover:bg-amber-500/20' : 'bg-mc-elevated text-mc-text-muted hover:bg-mc-surface hover:text-mc-text-sec'">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <span x-text="$store.cron.countForAgent(agent.id) > 0 ? $store.cron.countForAgent(agent.id) + ' job' + ($store.cron.countForAgent(agent.id) !== 1 ? 's' : '') : 'Cron'"></span>
                      </button>
                      <button @click="$store.sessions.createSession(agent.id)"
                              class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-mc-primary-dim text-cyan-400 hover:bg-cyan-500/20 transition-all">
                        Chat
                      </button>
                      <button @click="if(confirm('Delete agent ' + agent.name + '?')) $store.agents.deleteAgent(agent.id)"
                              class="px-3 py-1.5 rounded-lg text-xs text-mc-text-muted hover:text-red-400 hover:bg-mc-danger-dim transition-all">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </template>

          <!-- Add Card -->
          <div @click="$store.agents.openWizard()"
               class="border-2 border-dashed border-mc-border rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all min-h-[200px] max-w-sm">
            <div class="w-12 h-12 rounded-xl bg-mc-elevated flex items-center justify-center">
              <svg class="w-6 h-6 text-mc-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
              </svg>
            </div>
            <span class="text-sm text-mc-text-muted">Create New Agent</span>
          </div>
        </div>

        <!-- ==========================================
             VIEW: WORKFLOWS
             ========================================== -->
        <div x-show="$store.app.view === 'workflows'"
             x-transition:enter="animate-fade-up"
             class="h-full flex overflow-hidden relative">

          <!-- Workflow Sidebar (desktop: inline panel, mobile: bottom sheet) -->
          <div :class="$store.app.mobile ? 'mc-workflow-panel-mobile' + ($store.app.workflowPanelOpen ? ' open' : '') : 'w-52 min-w-[208px]'"
               class="bg-mc-surface border-r border-mc-border flex flex-col flex-shrink-0">
            <!-- Mobile drag handle -->
            <div x-show="$store.app.mobile" class="flex justify-center pt-2 pb-1 flex-shrink-0"
                 @click="$store.app.workflowPanelOpen = false">
              <div class="w-10 h-1 rounded-full bg-mc-border"></div>
            </div>
            <div class="p-4 border-b border-mc-border flex-shrink-0" x-data="{ nodesOpen: false }">
              <button @click="nodesOpen = !nodesOpen" class="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-mc-text-muted mb-1">
                <span>Node Palette</span>
                <svg class="w-3.5 h-3.5 transition-transform" :class="nodesOpen && 'rotate-180'" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/>
                </svg>
              </button>
              <div x-show="nodesOpen" x-transition class="grid grid-cols-2 gap-1.5 mt-2">
                <button @click="addNodeToCanvas('trigger')" class="mc-palette-node flex items-center gap-1.5 px-2.5 py-2 bg-mc-elevated border border-mc-border rounded-lg text-xs text-mc-text-sec">
                  <span class="text-sm">🎯</span> Trigger
                </button>
                <button @click="addNodeToCanvas('agent')" class="mc-palette-node flex items-center gap-1.5 px-2.5 py-2 bg-mc-elevated border border-mc-border rounded-lg text-xs text-mc-text-sec">
                  <span class="text-sm">🤖</span> Agent
                </button>
                <button @click="addNodeToCanvas('task')" class="mc-palette-node flex items-center gap-1.5 px-2.5 py-2 bg-mc-elevated border border-mc-border rounded-lg text-xs text-mc-text-sec">
                  <span class="text-sm">📋</span> Task
                </button>
                <button @click="addNodeToCanvas('tool')" class="mc-palette-node flex items-center gap-1.5 px-2.5 py-2 bg-mc-elevated border border-mc-border rounded-lg text-xs text-mc-text-sec">
                  <span class="text-sm">🔧</span> Tool
                </button>
                <button @click="addNodeToCanvas('condition')" class="mc-palette-node flex items-center gap-1.5 px-2.5 py-2 bg-mc-elevated border border-mc-border rounded-lg text-xs text-mc-text-sec">
                  <span class="text-sm">🔀</span> Condition
                </button>
                <button @click="addNodeToCanvas('loop')" class="mc-palette-node flex items-center gap-1.5 px-2.5 py-2 bg-mc-elevated border border-mc-border rounded-lg text-xs text-mc-text-sec">
                  <span class="text-sm">🔄</span> Loop
                </button>
                <button @click="addNodeToCanvas('merge')" class="mc-palette-node flex items-center gap-1.5 px-2.5 py-2 bg-mc-elevated border border-mc-border rounded-lg text-xs text-mc-text-sec">
                  <span class="text-sm">🔗</span> Merge
                </button>
                <button @click="addNodeToCanvas('output')" class="mc-palette-node flex items-center gap-1.5 px-2.5 py-2 bg-mc-elevated border border-mc-border rounded-lg text-xs text-mc-text-sec">
                  <span class="text-sm">📤</span> Output
                </button>
              </div>
            </div>
            <div class="flex-1 overflow-y-auto p-4 min-h-[120px]">
              <div class="text-xs font-semibold uppercase tracking-wider text-mc-text-muted mb-3">Saved Workflows</div>
              <button @click="$store.workflows.create(prompt('Workflow name:', 'Untitled Workflow'))"
                      class="w-full flex items-center justify-center gap-1.5 px-3 py-2 mb-3 rounded-lg text-xs font-medium bg-mc-primary-dim text-cyan-400 hover:bg-cyan-500/20 transition-all">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                </svg>
                New Workflow
              </button>
              <div class="space-y-1.5">
                <template x-for="wf in $store.workflows.list" :key="wf.id">
                  <div class="group relative">
                    <button @click="$store.workflows.load(wf.id)"
                            class="w-full text-left px-3 py-2 rounded-lg text-xs transition-all"
                            :class="$store.workflows.activeId === wf.id ? 'bg-mc-primary-dim text-cyan-400' : 'text-mc-text-sec hover:bg-mc-elevated'">
                      <div class="font-medium truncate flex items-center gap-1.5">
                        <span x-text="wf.name"></span>
                        <span x-show="wf.createdBy && wf.createdBy !== 'user'"
                              class="text-[10px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 flex-shrink-0"
                              x-text="wf.createdBy"></span>
                        <span x-show="wf.status === 'running-bg'"
                              class="text-[10px] px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-400 flex-shrink-0 animate-pulse">bg</span>
                      </div>
                      <div class="text-mc-text-muted mt-0.5" x-text="wf.nodes + ' nodes · ' + wf.lastRun"></div>
                    </button>
                    <div class="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex gap-0.5 transition-opacity">
                      <button @click.stop="$store.workflows.rename(wf.id, prompt('Rename workflow:', wf.name))"
                              class="p-1 rounded text-mc-text-muted hover:text-cyan-400 transition-colors" title="Rename">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z"/>
                        </svg>
                      </button>
                      <button @click.stop="$store.workflows.duplicate(wf.id)"
                              class="p-1 rounded text-mc-text-muted hover:text-violet-400 transition-colors" title="Duplicate">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/>
                        </svg>
                      </button>
                      <button @click.stop="if(confirm('Delete this workflow?')) $store.workflows.delete(wf.id)"
                              class="p-1 rounded text-mc-text-muted hover:text-red-400 transition-colors" title="Delete">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </template>
                <div x-show="$store.workflows.list.length === 0" class="p-3 text-center text-xs text-mc-text-muted">
                  No workflows yet. Create one to get started.
                </div>
              </div>
            </div>
            <div class="p-3 border-t border-mc-border space-y-1.5">
              <div class="flex gap-1.5">
                <button @click="$store.workflows.save()"
                        :disabled="!$store.workflows.activeId"
                        class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-mc-elevated text-mc-text-sec hover:text-mc-text transition-all disabled:opacity-30">
                  Save
                </button>
                <button @click="window.workflowBridge?.syncToVolume()"
                        :disabled="!$store.app.ocConnected || $store.workflows.list.length === 0"
                        class="flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium bg-mc-elevated text-mc-text-sec hover:text-amber-400 transition-all disabled:opacity-30"
                        title="Sync all workflows to agent workspaces">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/>
                  </svg>
                  Sync
                </button>
              </div>
              <button @click="$store.workflows.run()"
                      :disabled="$store.workflows.running || !$store.workflows.activeId"
                      class="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                      :class="$store.workflows.running ? 'bg-mc-warning-dim text-amber-400 cursor-wait' : 'bg-cyan-500 text-mc-bg hover:brightness-110'"
                      :style="(!$store.workflows.running && !$store.workflows.activeId) ? 'opacity:0.3;cursor:not-allowed' : ''">
                <span x-text="$store.workflows.running ? 'Running...' : 'Run Workflow'"></span>
              </button>
              <button @click="$store.workflows.runInBackground()"
                      :disabled="$store.workflows.running || !$store.workflows.activeId || !$store.app.ocConnected"
                      class="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-mc-secondary-dim text-violet-400 hover:bg-violet-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                Background Run
              </button>
            </div>
          </div>

          <!-- Canvas -->
          <div class="flex-1 relative bg-mc-bg flex flex-col">
            <!-- Background execution results banner -->
            <template x-if="$store.workflows.active?._bgResult">
              <div class="flex items-center gap-3 px-4 py-2 border-b border-mc-border text-xs"
                   :class="$store.workflows.active?.status === 'completed' ? 'bg-emerald-500/10' : 'bg-red-500/10'">
                <span :class="$store.workflows.active?.status === 'completed' ? 'text-emerald-400' : 'text-red-400'"
                      x-text="$store.workflows.active?.status === 'completed' ? 'Background run completed' : 'Background run failed'"></span>
                <span class="text-mc-text-muted" x-text="$store.workflows.active?.lastRun"></span>
                <button @click="$store.app._showBgResults = !$store.app._showBgResults"
                        class="ml-auto text-cyan-400 hover:text-cyan-300 transition-colors">
                  <span x-text="$store.app._showBgResults ? 'Hide Results' : 'Show Results'"></span>
                </button>
                <button @click="$store.workflows.active._bgResult = null"
                        class="text-mc-text-muted hover:text-mc-text transition-colors">Dismiss</button>
              </div>
            </template>
            <!-- Background results detail panel -->
            <div x-show="$store.app._showBgResults && $store.workflows.active?._bgResult"
                 x-transition class="border-b border-mc-border bg-mc-surface max-h-64 overflow-y-auto p-3 space-y-2">
              <!-- Structured output cards when outputs is an object -->
              <template x-if="$store.workflows.active?._bgResult?.outputs && typeof $store.workflows.active._bgResult.outputs === 'object'">
                <div class="space-y-2">
                  <template x-for="[label, value] in Object.entries($store.workflows.active._bgResult.outputs)" :key="label">
                    <div class="bg-mc-bg rounded-lg border border-mc-border p-3">
                      <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-semibold text-cyan-400" x-text="label"></span>
                        <button @click="$el.parentElement.nextElementSibling.classList.toggle('line-clamp-3')"
                                class="text-[10px] text-mc-text-muted hover:text-mc-text active:text-cyan-400 min-w-[44px] min-h-[44px] flex items-center justify-center">Expand</button>
                      </div>
                      <div class="text-xs text-mc-text-sec whitespace-pre-wrap line-clamp-3" x-text="typeof value === 'string' ? value : JSON.stringify(value, null, 2)"></div>
                    </div>
                  </template>
                  <div class="text-[10px] text-mc-text-muted" x-show="$store.workflows.active?._bgResult?.completedAt"
                       x-text="'Completed: ' + new Date($store.workflows.active._bgResult.completedAt).toLocaleString()"></div>
                </div>
              </template>
              <!-- Fallback for non-structured results -->
              <template x-if="!$store.workflows.active?._bgResult?.outputs || typeof $store.workflows.active._bgResult.outputs !== 'object'">
                <pre class="text-xs text-mc-text-sec font-mono whitespace-pre-wrap"
                     x-text="JSON.stringify($store.workflows.active?._bgResult, null, 2)"></pre>
              </template>
            </div>
            <!-- Mobile: toggle palette button -->
            <button @click="$store.app.workflowPanelOpen = !$store.app.workflowPanelOpen"
                    class="mc-mobile-panel-toggle absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-2 bg-mc-surface border border-mc-border rounded-lg text-xs text-mc-text-sec shadow-lg">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/>
              </svg>
              Nodes
            </button>
            <canvas id="workflow-canvas" class="flex-1 w-full"></canvas>
          </div>
        </div>

        <!-- ==========================================
             VIEW: CHAT
             ========================================== -->
        <div x-show="$store.app.view === 'chat'"
             x-transition:enter="animate-fade-up"
             class="h-full flex overflow-hidden relative">

          <!-- Mobile backdrop for chat panel -->
          <div x-show="$store.app.mobile && $store.app.chatPanelOpen"
               x-transition:enter="transition-opacity ease-out duration-200"
               x-transition:enter-start="opacity-0"
               x-transition:enter-end="opacity-100"
               x-transition:leave="transition-opacity ease-in duration-150"
               x-transition:leave-start="opacity-100"
               x-transition:leave-end="opacity-0"
               @click="$store.app.chatPanelOpen = false"
               class="fixed inset-0 bg-black/40 z-[34]" style="top: 56px"></div>

          <!-- Session List (desktop: inline panel, mobile: slide-in overlay) -->
          <div :class="$store.app.mobile ? 'mc-chat-panel-mobile' + ($store.app.chatPanelOpen ? ' open' : '') : 'w-64 min-w-[256px]'"
               class="bg-mc-surface border-r border-mc-border flex flex-col flex-shrink-0">
            <div class="p-4 border-b border-mc-border flex items-center justify-between">
              <div class="text-xs font-semibold uppercase tracking-wider text-mc-text-muted">Conversations</div>
              <button x-show="$store.app.mobile"
                      @click="$store.app.chatPanelOpen = false"
                      class="w-8 h-8 flex items-center justify-center rounded-lg text-mc-text-sec hover:bg-mc-elevated transition-all">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-2">
              <template x-for="session in $store.sessions.list" :key="session.id">
                <div class="relative group mb-1">
                  <button @click="$store.sessions.select(session.id); if($store.app.mobile) $store.app.chatPanelOpen = false"
                          class="w-full text-left px-3 py-3 rounded-lg transition-all"
                          :class="$store.sessions.activeId === session.id ? 'bg-mc-primary-dim' : 'hover:bg-mc-elevated'">
                    <div class="flex items-center gap-2">
                      <span class="text-lg" x-text="session.agentEmoji"></span>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="text-xs font-semibold text-mc-text truncate" x-text="session.agentName"></span>
                          <span x-show="session.unread > 0"
                                class="w-4 h-4 flex items-center justify-center text-[9px] bg-cyan-500 text-mc-bg rounded-full font-bold"
                                x-text="session.unread"></span>
                        </div>
                        <div class="text-[11px] text-mc-text-muted truncate mt-0.5" x-text="session.lastMessage || session.title"></div>
                      </div>
                    </div>
                  </button>
                  <!-- Delete session button — visible on hover (desktop) or when active -->
                  <button @click.stop="$store.sessions.deleteSession(session.id)"
                          class="absolute top-1/2 -translate-y-1/2 right-2 w-6 h-6 flex items-center justify-center rounded text-mc-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                          :class="$store.sessions.activeId === session.id ? 'opacity-60' : ''"
                          title="Delete conversation">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              </template>
              <div x-show="$store.sessions.list.length === 0" class="p-4 text-center text-xs text-mc-text-muted">
                No conversations yet.
              </div>
            </div>
            <div class="p-3 border-t border-mc-border" x-data="{ showPicker: false }">
              <button @click="showPicker = !showPicker"
                      class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-mc-elevated text-mc-text-sec hover:text-mc-text transition-all">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                </svg>
                New Conversation
              </button>
              <div x-show="showPicker" @click.away="showPicker = false"
                   class="mt-2 bg-mc-elevated border border-mc-border rounded-lg overflow-hidden">
                <template x-for="agent in $store.agents.list" :key="agent.id">
                  <button @click="$store.sessions.createSession(agent.id, true); showPicker = false; if($store.app.mobile) $store.app.chatPanelOpen = false"
                          class="w-full text-left px-3 py-2 text-xs hover:bg-mc-border/30 transition-all flex items-center gap-2">
                    <span x-text="agent.emoji"></span>
                    <span class="text-mc-text-sec" x-text="agent.name"></span>
                    <span x-show="$store.sessions.list.find(s => s.sessionKey === 'agent:' + agent.id + ':main')"
                          class="text-[9px] text-amber-400/60 ml-auto">(reset)</span>
                  </button>
                </template>
              </div>
            </div>
          </div>

          <!-- Chat Area -->
          <div class="flex-1 flex flex-col min-w-0">
            <div class="h-12 flex items-center px-4 border-b border-mc-border flex-shrink-0 gap-3">
              <!-- Mobile: toggle conversations panel -->
              <button @click="$store.app.chatPanelOpen = !$store.app.chatPanelOpen"
                      class="mc-mobile-panel-toggle w-8 h-8 flex items-center justify-center rounded-lg text-mc-text-sec hover:bg-mc-elevated transition-all flex-shrink-0">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/>
                </svg>
              </button>
              <template x-if="$store.sessions.active">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-lg flex-shrink-0" x-text="$store.sessions.active?.agentEmoji"></span>
                  <span class="text-sm font-semibold text-mc-text truncate" x-text="$store.sessions.active?.agentName"></span>
                  <span class="text-xs text-mc-text-muted truncate hidden sm:inline" x-text="$store.sessions.active?.title"></span>
                </div>
              </template>
              <template x-if="!$store.sessions.active">
                <span class="text-sm text-mc-text-muted">Select a conversation</span>
              </template>
            </div>
            <!-- Minimal status bar — connection state only -->
            <div class="flex items-center gap-2 px-3 py-1 border-b border-mc-border bg-mc-surface/50 text-[11px] flex-shrink-0">
              <span class="w-2 h-2 rounded-full flex-shrink-0"
                    :class="$store.app.ocConnected ? 'bg-emerald-400' : ($store.app.connected ? 'bg-amber-400' : 'bg-red-400')"></span>
              <span class="text-mc-text-muted"
                    x-text="$store.app.ocConnected ? 'Live' : ($store.app.connected ? 'Fallback' : 'Offline')"></span>
            </div>

            <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-3">
              <!-- WebSocket disconnection banner -->
              <div x-show="!$store.app.ocConnected && !$store.app.demoMode"
                   class="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
                </svg>
                <span class="flex-1">OpenClaw disconnected — using LiteLLM fallback</span>
                <button @click="$store.app.reconnect()"
                        class="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 transition-all text-[11px] font-medium flex-shrink-0">
                  Retry
                </button>
              </div>
              <div x-show="$store.app.demoMode"
                   class="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                <span class="flex-1">No backend connected — demo mode</span>
                <button @click="$store.app.reconnect()"
                        class="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 transition-all text-[11px] font-medium flex-shrink-0">
                  Reconnect
                </button>
              </div>
              <template x-for="msg in $store.sessions.messages" :key="msg.id">
                <div class="flex" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
                  <!-- Merged tool output bubble (collapsed by default) -->
                  <template x-if="msg._toolOutput && msg._toolCount > 1">
                    <div class="max-w-[75%]">
                      <details class="mc-tool-group">
                        <summary class="mc-tool-group-summary">
                          <span class="inline-block w-1.5 h-1.5 rounded-full bg-cyan-500/60 mr-1.5"></span>
                          <span x-text="msg._toolCount + ' tool actions'"></span>
                        </summary>
                        <div class="mc-tool-group-body mc-chat-content" x-html="formatChatMessage(msg.content || '')"></div>
                      </details>
                      <div class="text-[10px] mt-1 opacity-30 pl-2" x-text="msg.time"></div>
                    </div>
                  </template>
                  <!-- Normal message bubble -->
                  <template x-if="!msg._toolOutput || !msg._toolCount || msg._toolCount <= 1">
                    <div class="max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed"
                         :class="msg.role === 'user' ? 'mc-bubble-user' : (msg._systemNote ? 'bg-mc-elevated/50 border border-mc-border text-mc-text-muted italic' : (msg._toolOutput ? 'mc-bubble-tool' : 'mc-bubble-agent'))">
                      <div class="mc-chat-content" x-html="formatChatMessage(msg.content || (msg.streaming ? '' : ''))"></div>
                      <span x-show="msg.streaming && !msg.content" class="inline-block w-2 h-4 bg-cyan-400 animate-pulse rounded-sm"></span>
                      <span x-show="msg.streaming && msg.content" class="inline-block w-1.5 h-3.5 bg-cyan-400 animate-pulse rounded-sm ml-0.5 align-text-bottom"></span>
                      <div class="text-[10px] mt-1 opacity-40" x-text="msg.streaming ? 'typing...' : msg.time"></div>
                    </div>
                  </template>
                </div>
              </template>
              <div x-show="$store.sessions.messages.length === 0" class="h-full flex items-center justify-center">
                <div class="text-center text-mc-text-muted px-6">
                  <div class="text-4xl mb-3 opacity-30">💬</div>
                  <div class="text-sm" x-text="$store.sessions.active ? 'Send a message to start' : 'Select a conversation or start a new one'"></div>
                </div>
              </div>
            </div>
            <div x-show="$store.sessions.active" class="border-t border-mc-border p-3 md:p-4 flex gap-2 md:gap-3 flex-shrink-0">
              <input type="text"
                     x-model="$store.sessions.input"
                     @keydown.enter="$store.sessions.sendMessage()"
                     placeholder="Type your message..."
                     class="flex-1 bg-mc-bg border border-mc-border rounded-lg px-3 md:px-4 py-2.5 text-sm text-mc-text placeholder-mc-text-muted mc-input-focus min-w-0">
              <button x-show="$store.sessions._sending"
                      @click="$store.sessions.abortCurrentRun()"
                      class="px-3 md:px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:brightness-110 transition-all flex-shrink-0 min-w-[52px]">
                Stop
              </button>
              <button x-show="!$store.sessions._sending"
                      @click="$store.sessions.sendMessage()"
                      :disabled="!$store.sessions.input.trim()"
                      class="px-3 md:px-4 py-2.5 bg-cyan-500 text-mc-bg rounded-lg text-sm font-medium hover:brightness-110 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0">
                Send
              </button>
            </div>
          </div>
        </div>

        <!-- ==========================================
             VIEW: TEAMS — Governance & Leaderboard
             ========================================== -->
        <div x-show="$store.app.view === 'teams'"
             x-transition:enter="animate-fade-up"
             class="h-full overflow-y-auto p-4 md:p-6 mc-grid-bg">

          <div class="max-w-5xl mx-auto space-y-6">

            <!-- Header + Weekly Cycle -->
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 class="text-xl font-bold text-mc-text">Teams & Governance</h1>
                <p class="text-sm text-mc-text-muted mt-1" x-show="!$store.governance.paused">Performance tracking, tier system, and weekly evaluation</p>
                <p class="text-sm text-amber-400 mt-1" x-show="$store.governance.paused">Auto-scoring paused — stats tracked, no tier/promotion changes</p>
              </div>
              <div class="flex items-center gap-2">
                <button @click="$store.governance.paused = !$store.governance.paused"
                        :title="$store.governance.paused ? 'Resume automatic evaluations' : 'Pause automatic evaluations'"
                        :class="$store.governance.paused
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'"
                        class="px-3 py-1.5 text-xs font-medium rounded-lg hover:opacity-80 border transition-all"
                        x-text="$store.governance.paused ? 'Resume Scoring' : 'Pause Scoring'">
                </button>
                <button x-show="!$store.governance.paused"
                        @click="$store.governance.forceWeeklyEval()"
                        title="Force run weekly evaluation now"
                        class="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-all">
                  Evaluate Now
                </button>
              </div>
            </div>

            <!-- Weekly Cycle Progress -->
            <div class="bg-mc-surface border border-mc-border rounded-xl p-4">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-mc-text">Week <span x-text="$store.governance.week.number"></span></span>
                  <span class="text-xs text-mc-text-muted">
                    <span x-text="$store.governance.getWeekDaysRemaining()"></span> days remaining
                  </span>
                </div>
                <span class="text-xs font-mono text-mc-text-sec" x-text="$store.governance.getWeekProgress() + '%'"></span>
              </div>
              <div class="w-full h-2 bg-mc-bg rounded-full overflow-hidden">
                <div class="h-full bg-gradient-to-r from-cyan-500 to-amber-500 rounded-full transition-all duration-1000"
                     :style="'width:' + $store.governance.getWeekProgress() + '%'"></div>
              </div>
              <p class="text-[11px] text-mc-text-muted mt-2">Weekly champion earns Elite tier + team lead. Owner-approved staging items count 30% of the evaluation score.</p>
            </div>

            <!-- Teams Loop -->
            <template x-for="team in $store.governance.teams" :key="team.id">
              <div class="bg-mc-surface border border-mc-border rounded-xl overflow-hidden">

                <!-- Team Header -->
                <div class="p-4 md:p-5 border-b border-mc-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h2 class="text-lg font-semibold text-mc-text" x-text="team.name"></h2>
                    <p class="text-xs text-mc-text-muted mt-0.5" x-text="team.project || 'No project assigned'"></p>
                  </div>
                  <div class="flex items-center gap-2 text-xs">
                    <span class="px-2 py-1 rounded-md bg-mc-elevated text-mc-text-sec">
                      <span x-text="team.members.length"></span> members
                    </span>
                    <span class="px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Depth: 3 levels
                    </span>
                    <span class="px-2 py-1 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      P2P Enabled
                    </span>
                  </div>
                </div>

                <!-- Leaderboard -->
                <div class="p-4 md:p-5">
                  <div class="text-xs font-medium text-mc-text-muted uppercase tracking-wider mb-3">Performance Leaderboard</div>

                  <div class="space-y-2">
                    <template x-for="(entry, idx) in $store.governance.getLeaderboard(team.id)" :key="entry.id">
                      <div class="flex items-center gap-3 p-3 rounded-lg transition-all"
                           :class="entry.isLead ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-mc-elevated hover:bg-mc-border/30'">

                        <!-- Rank -->
                        <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                             :class="idx === 0 ? 'bg-amber-500/20 text-amber-400' : idx === 1 ? 'bg-gray-400/20 text-gray-400' : idx === 2 ? 'bg-orange-700/20 text-orange-500' : 'bg-mc-bg text-mc-text-muted'">
                          <span x-text="idx + 1"></span>
                        </div>

                        <!-- Agent Info -->
                        <div class="flex items-center gap-2 min-w-0 flex-1">
                          <span class="text-lg flex-shrink-0" x-text="entry.emoji"></span>
                          <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                              <span class="text-sm font-medium text-mc-text truncate" x-text="entry.name"></span>
                              <span x-show="entry.isLead" class="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-400 flex-shrink-0">LEAD</span>
                              <!-- Tier Badge -->
                              <span class="px-1.5 py-0.5 text-[10px] font-bold rounded flex-shrink-0"
                                    :class="entry.tier === 3 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : entry.tier === 2 ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : entry.tier === 0 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-mc-bg text-mc-text-muted'"
                                    x-text="entry.tierName"></span>
                              <span x-show="entry.weeklyChampion" class="text-[10px] flex-shrink-0" title="Weekly Champion">&#127942;</span>
                            </div>
                            <div class="text-[11px] text-mc-text-muted">
                              <span x-text="($store.governance.TIER_PERKS[entry.tier]?.workspace || '200 MB') + ' workspace'"></span>
                              <span class="opacity-50 mx-1">·</span>
                              <span x-text="entry.model"></span>
                            </div>
                          </div>
                        </div>

                        <!-- Score Bar -->
                        <div class="hidden sm:flex items-center gap-2 flex-shrink-0 w-32">
                          <div class="flex-1 h-2 bg-mc-bg rounded-full overflow-hidden">
                            <div class="h-full rounded-full transition-all duration-500"
                                 :class="entry.score >= 70 ? 'bg-emerald-500' : entry.score >= 40 ? 'bg-amber-500' : 'bg-red-500'"
                                 :style="'width:' + entry.score + '%'"></div>
                          </div>
                          <span class="text-xs font-mono font-bold w-8 text-right"
                                :class="entry.score >= 70 ? 'text-emerald-400' : entry.score >= 40 ? 'text-amber-400' : 'text-red-400'"
                                x-text="entry.score"></span>
                        </div>

                        <!-- Stats (compact) -->
                        <div class="flex items-center gap-3 text-[11px] text-mc-text-muted flex-shrink-0">
                          <span class="hidden md:inline" title="Weekly score">
                            W:<span class="font-mono" x-text="entry.weeklyScore"></span>
                          </span>
                          <span class="hidden md:inline" title="Tasks completed (total)">
                            <span x-text="entry.tasksCompleted"></span> tasks
                          </span>
                          <span class="hidden md:inline" title="Success rate">
                            <span x-text="entry.successRate"></span>%
                          </span>
                          <span title="Current streak" class="flex items-center gap-0.5">
                            <span x-text="entry.streakCount"></span>
                            <span class="text-amber-400">&#9889;</span>
                          </span>
                        </div>

                        <!-- Promote Button -->
                        <button x-show="!entry.isLead && entry.tasksCompleted >= 3"
                                @click="$store.governance.promoteLead(team.id, entry.id)"
                                title="Promote to team lead"
                                class="px-2 py-1 text-[10px] font-medium rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-all flex-shrink-0">
                          Promote
                        </button>
                      </div>
                    </template>
                  </div>

                  <!-- Empty state -->
                  <div x-show="$store.governance.getLeaderboard(team.id).length === 0"
                       class="text-center py-8 text-mc-text-muted text-sm">
                    No team members yet. Add agents to get started.
                  </div>
                </div>

                <!-- Team Config Summary -->
                <div class="px-4 md:px-5 pb-4 md:pb-5">
                  <div class="p-3 rounded-lg bg-mc-bg border border-mc-border/50 text-xs text-mc-text-muted space-y-1">
                    <div class="flex justify-between">
                      <span>Spawn Depth</span>
                      <span class="text-mc-text">3 levels (lead &rarr; team lead &rarr; worker)</span>
                    </div>
                    <div class="flex justify-between">
                      <span>Max Concurrent</span>
                      <span class="text-mc-text">4 parallel sub-agents</span>
                    </div>
                    <div class="flex justify-between">
                      <span>Agent-to-Agent</span>
                      <span class="text-emerald-400">Peer-to-peer enabled</span>
                    </div>
                    <div class="flex justify-between">
                      <span>Auto-Promotion</span>
                      <span class="text-mc-text">10+ tasks, 15+ point lead</span>
                    </div>
                    <div class="flex justify-between">
                      <span>Weekly Champion</span>
                      <span class="text-amber-400">Earns Elite tier + lead role</span>
                    </div>
                    <div class="flex justify-between">
                      <span>Elite Cap</span>
                      <span class="text-mc-text">Max 1 per team</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Tier System Legend -->
            <div class="bg-mc-surface border border-mc-border rounded-xl p-4 md:p-5">
              <h3 class="text-sm font-semibold text-mc-text mb-3">Tier System — Rewards</h3>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div class="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                  <div class="font-bold text-red-400 mb-1">Probation</div>
                  <div class="text-mc-text-muted">50 MB workspace. Basic tools. Supervised. 5 wins to escape.</div>
                </div>
                <div class="p-3 rounded-lg bg-mc-bg border border-mc-border/50">
                  <div class="font-bold text-mc-text-sec mb-1">Active</div>
                  <div class="text-mc-text-muted">200 MB workspace. Standard tools. All models available.</div>
                </div>
                <div class="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                  <div class="font-bold text-cyan-400 mb-1">Proven</div>
                  <div class="text-mc-text-muted">500 MB workspace. Priority routing. Semi-autonomous. Score &ge;70, 15+ tasks.</div>
                </div>
                <div class="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <div class="font-bold text-amber-400 mb-1">Elite &#127942;</div>
                  <div class="text-mc-text-muted">Oracle Cloud ARM (24 GB). Full autonomy. Can onboard team. Weekly champion only.</div>
                </div>
              </div>
            </div>

            <!-- Champion History -->
            <div class="bg-mc-surface border border-mc-border rounded-xl p-4 md:p-5"
                 x-show="$store.governance.getChampionHistory().length > 0">
              <h3 class="text-sm font-semibold text-mc-text mb-3">Champion History</h3>
              <div class="space-y-2">
                <template x-for="champ in $store.governance.getChampionHistory().slice(0, 8)" :key="champ.week + champ.teamId">
                  <div class="flex items-center gap-3 p-2 rounded-lg bg-mc-elevated text-xs">
                    <span class="text-amber-400">&#127942;</span>
                    <span class="font-medium text-mc-text">Week <span x-text="champ.week"></span></span>
                    <span x-text="champ.emoji"></span>
                    <span class="text-mc-text-sec" x-text="champ.name"></span>
                    <span class="text-mc-text-muted" x-text="champ.teamId === 'core' ? 'Core' : 'Platform'"></span>
                    <span class="ml-auto font-mono text-mc-text-sec" x-text="'Score: ' + champ.weeklyScore"></span>
                  </div>
                </template>
              </div>
            </div>

            <!-- How Governance Works -->
            <div class="bg-mc-surface border border-mc-border rounded-xl p-4 md:p-5">
              <h3 class="text-sm font-semibold text-mc-text mb-3">How Governance Works</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-mc-text-sec">
                <div class="space-y-1.5">
                  <div class="font-medium text-mc-text flex items-center gap-1.5">
                    <span class="text-emerald-400">&#9650;</span> Performance Score
                  </div>
                  <p>Composite of success rate (40%), quality (30%), token efficiency (20%), and streak bonus (10%). Updates in real-time.</p>
                </div>
                <div class="space-y-1.5">
                  <div class="font-medium text-mc-text flex items-center gap-1.5">
                    <span class="text-amber-400">&#9733;</span> Weekly Evaluation
                  </div>
                  <p>Every 7 days: tasks (25%), staging approvals (30%), streak (15%), efficiency (15%), peer tasks (15%). Champion earns Elite + lead.</p>
                </div>
                <div class="space-y-1.5">
                  <div class="font-medium text-mc-text flex items-center gap-1.5">
                    <span class="text-cyan-400">&#9650;</span> Tier Rewards
                  </div>
                  <p>Tiers unlock workspace, autonomy, and compute. Elite earns Oracle Cloud ARM partition (24 GB). No extra API costs — rewards are resources.</p>
                </div>
                <div class="space-y-1.5">
                  <div class="font-medium text-mc-text flex items-center gap-1.5">
                    <span class="text-red-400">&#9888;</span> Anti-Gaming
                  </div>
                  <p>Staging approvals (30% weight) require owner review — agents can't inflate their own scores. Collusion = team wipe.</p>
                </div>
              </div>
            </div>

            <!-- Danger Zone — collapsed by default -->
            <div x-data="{ dangerOpen: false }" class="bg-mc-surface border border-red-500/20 rounded-xl overflow-hidden">
              <button @click="dangerOpen = !dangerOpen"
                      class="w-full p-4 flex items-center justify-between text-xs text-red-400/60 hover:text-red-400 transition-all">
                <span class="font-medium">Danger Zone</span>
                <svg class="w-4 h-4 transition-transform" :class="dangerOpen && 'rotate-180'" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
                </svg>
              </button>
              <div x-show="dangerOpen" x-collapse class="px-4 pb-4 space-y-3">
                <p class="text-[11px] text-mc-text-muted">Reset Local State wipes <strong>all</strong> browser state: chat sessions, governance scores, tier progress, champion history, workflows, and settings. Keeps your login. Server-side data (OpenClaw conversations, agent activity logs) is not affected. This cannot be undone.</p>
                <button @click="if(prompt('Type RESET to confirm:') === 'RESET') $store.auth.resetLocalState()"
                        class="px-4 py-2 text-xs font-medium rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-all">
                  Reset Local State
                </button>
              </div>
            </div>

          </div>
        </div>

        <!-- ==========================================
             VIEW: MONITOR
             ========================================== -->
        <div x-show="$store.app.view === 'monitor'"
             x-transition:enter="animate-fade-up"
             class="h-full overflow-y-auto p-4 md:p-6 mc-grid-bg">

          <!-- System Health -->
          <div class="mb-6">
            <h2 class="text-sm font-semibold text-mc-text mb-4">System Health</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div class="bg-mc-surface border border-mc-border rounded-xl p-4 flex items-center gap-3">
                <span class="mc-dot" :class="$store.app.ocConnected ? 'mc-dot-connected' : 'mc-dot-idle'"></span>
                <div>
                  <div class="text-xs text-mc-text-muted">OpenClaw</div>
                  <div class="text-sm font-medium" :class="$store.app.ocConnected ? 'text-emerald-400' : 'text-mc-text-muted'"
                       x-text="$store.app.ocConnected ? 'Online' : 'Offline'"></div>
                </div>
              </div>
              <div class="bg-mc-surface border border-mc-border rounded-xl p-4 flex items-center gap-3">
                <span class="mc-dot" :class="$store.app.connected ? 'mc-dot-connected' : 'mc-dot-idle'"></span>
                <div>
                  <div class="text-xs text-mc-text-muted">LiteLLM</div>
                  <div class="text-sm font-medium" :class="$store.app.connected ? 'text-emerald-400' : 'text-mc-text-muted'"
                       x-text="$store.app.connected ? 'Healthy' : 'Offline'"></div>
                </div>
              </div>
              <div class="bg-mc-surface border border-mc-border rounded-xl p-4">
                <div class="text-xs text-mc-text-muted">Models Available</div>
                <div class="text-lg font-bold text-mc-text" x-text="$store.monitor.systemHealth.modelsAvailable"></div>
              </div>
              <div class="bg-mc-surface border border-mc-border rounded-xl p-4">
                <div class="text-xs text-mc-text-muted">Uptime</div>
                <div class="text-lg font-bold text-mc-text font-mono" x-text="$store.monitor.systemHealth.uptime"></div>
              </div>
            </div>
          </div>

          <!-- Token Usage -->
          <div class="mb-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-sm font-semibold text-mc-text">Token Usage (Today)</h2>
              <span class="text-xs text-mc-text-muted font-mono">
                Total: <span x-text="formatTokens($store.monitor.totalTokens)"></span>
                · ~$<span x-text="$store.monitor.totalCost.toFixed(3)"></span>
              </span>
            </div>
            <div class="bg-mc-surface border border-mc-border rounded-xl p-5 space-y-4">
              <template x-for="(usage, modelId) in $store.monitor.tokenUsage" :key="modelId">
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-xs font-mono text-mc-text-sec" x-text="modelId"></span>
                    <span class="text-xs text-mc-text-muted" x-text="formatTokens(usage.input + usage.output) + ' tokens'"></span>
                  </div>
                  <div class="mc-usage-track">
                    <div class="mc-usage-fill bg-cyan-500"
                         :style="'width: ' + Math.round((usage.input + usage.output) / $store.monitor.maxUsage() * 100) + '%'"></div>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- Activity Log -->
          <div>
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-sm font-semibold text-mc-text">Activity Log</h2>
              <div class="flex gap-1 flex-wrap">
                <template x-for="level in ['all', 'info', 'warn', 'error', 'debug']" :key="level">
                  <button @click="$store.monitor.logFilter = level"
                          class="mc-log-filter-btn px-2.5 py-1.5 rounded text-[10px] font-mono uppercase transition-all"
                          :class="$store.monitor.logFilter === level ? 'bg-mc-primary-dim text-cyan-400' : 'text-mc-text-muted hover:text-mc-text-sec'">
                    <span x-text="level"></span>
                  </button>
                </template>
              </div>
            </div>
            <div class="bg-mc-surface border border-mc-border rounded-xl overflow-hidden">
              <div class="max-h-96 overflow-y-auto p-2">
                <template x-for="(log, i) in $store.monitor.filteredLogs" :key="i">
                  <div class="mc-log-row flex items-start gap-3 px-3 py-1.5 rounded text-xs font-mono">
                    <span class="text-mc-text-muted whitespace-nowrap" x-text="log.time"></span>
                    <span class="font-semibold w-11 text-center flex-shrink-0"
                          :class="{'text-cyan-400': log.level==='info', 'text-amber-400': log.level==='warn', 'text-red-400': log.level==='error', 'text-mc-text-muted': log.level==='debug'}"
                          x-text="log.level.toUpperCase()"></span>
                    <span class="text-mc-text-sec" x-text="log.msg"></span>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- ==========================================
             VIEW: ACTIVITY — mission control event feed
             ========================================== -->
        <div x-show="$store.app.view === 'activity'"
             x-transition:enter="animate-fade-up"
             class="h-full overflow-y-auto p-4 md:p-6 mc-grid-bg">

          <!-- Header + filters -->
          <div class="mb-4 space-y-3">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold text-mc-text">Mission Control</h2>
              <div class="flex items-center gap-2">
                <span class="text-[10px] px-1.5 py-0.5 rounded-full font-mono"
                      :class="$store.app.ocConnected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'"
                      x-text="$store.app.ocConnected ? 'LIVE' : 'POLLING'"></span>
                <span class="text-[10px] text-mc-text-muted" x-text="$store.activity.events.length + ' events'"></span>
              </div>
            </div>

            <!-- Agent filter -->
            <div class="flex gap-1.5 flex-wrap">
              <button @click="$store.activity.agentFilter = 'all'"
                      class="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all min-h-[32px]"
                      :class="$store.activity.agentFilter === 'all' ? 'bg-mc-primary-dim text-cyan-400 border border-cyan-500/30' : 'bg-mc-surface border border-mc-border text-mc-text-muted hover:text-mc-text'">All Agents</button>
              <template x-for="aid in $store.activity.agents" :key="aid">
                <button @click="$store.activity.agentFilter = aid"
                        class="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all min-h-[32px]"
                        :class="$store.activity.agentFilter === aid ? 'bg-mc-primary-dim text-cyan-400 border border-cyan-500/30' : 'bg-mc-surface border border-mc-border text-mc-text-muted hover:text-mc-text'"
                        x-text="aid"></button>
              </template>
            </div>

            <!-- Type filter pills -->
            <div class="flex gap-1 flex-wrap">
              <template x-for="f in [
                {key:'all', label:'All', cls:'bg-mc-primary-dim text-cyan-400'},
                {key:'tool', label:'Tools', cls:'bg-blue-500/15 text-blue-400'},
                {key:'comms', label:'Comms', cls:'bg-violet-500/15 text-violet-400'},
                {key:'file-op', label:'Files', cls:'bg-teal-500/15 text-teal-400'},
                {key:'chat', label:'Chat', cls:'bg-cyan-500/15 text-cyan-400'},
                {key:'task-complete', label:'Tasks', cls:'bg-emerald-500/15 text-emerald-400'},
                {key:'staging-new', label:'Staging', cls:'bg-amber-500/15 text-amber-400'},
                {key:'error', label:'Errors', cls:'bg-red-500/15 text-red-400'},
                {key:'rate-limit', label:'Rate Limits', cls:'bg-orange-500/15 text-orange-400'}
              ]" :key="f.key">
                <button @click="$store.activity.filter = f.key"
                        class="px-2 py-1 rounded text-[11px] transition-all min-h-[28px]"
                        :class="$store.activity.filter === f.key ? f.cls : 'text-mc-text-muted hover:text-mc-text'"
                        x-text="f.label"></button>
              </template>
            </div>
          </div>

          <!-- Activity event list -->
          <div class="space-y-1.5">
            <template x-for="(ev, i) in $store.activity.filtered.slice(0, 200)" :key="ev.time + '-' + i">
              <div class="bg-mc-surface border border-mc-border rounded-lg px-3 py-2.5 flex items-start gap-2.5 hover:border-mc-border/80 transition-colors">
                <!-- Type icon -->
                <span class="text-sm flex-shrink-0 mt-0.5 w-5 text-center" x-text="$store.activity.typeIcon(ev.type)"></span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          :class="$store.activity.typeColor(ev.type)"
                          style="background: rgba(255,255,255,0.05)"
                          x-text="$store.activity.typeLabel(ev.type)"></span>
                    <span x-show="ev.agent" class="text-[10px] font-mono px-1 py-0.5 rounded bg-mc-elevated text-mc-text-muted" x-text="ev.agent"></span>
                    <span x-show="ev.source === 'live'" class="text-[9px] px-1 rounded bg-emerald-500/10 text-emerald-500">LIVE</span>
                    <span class="text-[10px] text-mc-text-muted ml-auto flex-shrink-0" x-text="$store.activity.formatTime(ev.time)"></span>
                  </div>
                  <div class="text-xs text-mc-text-sec leading-relaxed" x-text="ev.message"></div>
                  <div x-show="ev.detail" class="text-[11px] text-mc-text-muted mt-0.5 font-mono truncate" x-text="ev.detail"></div>
                </div>
              </div>
            </template>
          </div>

          <div x-show="$store.activity.filtered.length === 0"
               class="flex flex-col items-center justify-center py-16 text-mc-text-muted">
            <svg class="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <div class="text-xs">No agent activity recorded yet.</div>
            <div class="text-[11px] mt-1">When connected live, all agent operations (tool calls, messaging, file writes, errors) appear here in real-time.</div>
            <div class="text-[11px] mt-0.5">Server-side events from /workspace/agent-activity/log.json are polled every 15s.</div>
          </div>
        </div>

        <!-- ==========================================
             VIEW: STAGING
             ========================================== -->
        <div x-show="$store.app.view === 'staging'"
             x-transition:enter="animate-fade-up"
             class="h-full flex overflow-hidden relative">

          <!-- Mobile backdrop for staging panel -->
          <div x-show="$store.app.mobile && $store.app.stagingPanelOpen"
               x-transition:enter="transition-opacity ease-out duration-200"
               x-transition:enter-start="opacity-0"
               x-transition:enter-end="opacity-100"
               x-transition:leave="transition-opacity ease-in duration-150"
               x-transition:leave-start="opacity-100"
               x-transition:leave-end="opacity-0"
               @click="$store.app.stagingPanelOpen = false"
               class="fixed inset-0 bg-black/40 z-[34]" style="top: 56px"></div>

          <!-- Staging List (desktop: inline panel, mobile: slide-in overlay) -->
          <div :class="$store.app.mobile ? 'mc-chat-panel-mobile' + ($store.app.stagingPanelOpen ? ' open' : '') : 'w-64 min-w-[256px]'"
               class="bg-mc-surface border-r border-mc-border flex flex-col flex-shrink-0">
            <div class="p-4 border-b border-mc-border flex items-center justify-between">
              <div>
                <div class="text-xs font-semibold uppercase tracking-wider text-mc-text-muted">Agent Staging</div>
                <div class="text-[11px] text-mc-text-muted mt-1">Review agent-generated content</div>
              </div>
              <button x-show="$store.app.mobile"
                      @click="$store.app.stagingPanelOpen = false"
                      class="w-8 h-8 flex items-center justify-center rounded-lg text-mc-text-sec hover:bg-mc-elevated transition-all flex-shrink-0">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-2">
              <template x-for="item in $store.staging.items" :key="item.id">
                <button @click="$store.staging.selectedId = item.id; if($store.app.mobile) $store.app.stagingPanelOpen = false"
                        class="w-full text-left px-3 py-3 rounded-lg mb-1 transition-all"
                        :class="$store.staging.selectedId === item.id ? 'bg-mc-primary-dim' : 'hover:bg-mc-elevated'">
                  <div class="flex items-center gap-2">
                    <span class="text-lg" x-text="item.type === 'html' ? '&#127760;' : '&#128196;'"></span>
                    <div class="flex-1 min-w-0">
                      <div class="text-xs font-medium text-mc-text truncate" x-text="item.name"></div>
                      <div class="text-[11px] text-mc-text-muted truncate" x-text="item.createdBy"></div>
                    </div>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full"
                          :class="item.status === 'approved' ? 'bg-mc-success-dim text-emerald-400' : item.status === 'rejected' ? 'bg-mc-danger-dim text-red-400' : 'bg-mc-warning-dim text-amber-400'"
                          x-text="item.status"></span>
                  </div>
                </button>
              </template>
              <div x-show="$store.staging.items.length === 0" class="p-4 text-center text-xs text-mc-text-muted">
                No staged content yet. Agents will post previews here.
              </div>
            </div>
          </div>

          <!-- Preview Area -->
          <div class="flex-1 flex flex-col min-w-0">
            <!-- Header bar with mobile toggle + item actions -->
            <div class="h-12 flex items-center px-4 border-b border-mc-border flex-shrink-0 gap-3">
              <button @click="$store.app.stagingPanelOpen = !$store.app.stagingPanelOpen"
                      class="mc-mobile-panel-toggle w-8 h-8 flex items-center justify-center rounded-lg text-mc-text-sec hover:bg-mc-elevated transition-all flex-shrink-0">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/>
                </svg>
              </button>
              <template x-if="$store.staging.selected">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                  <span class="text-sm font-semibold text-mc-text truncate flex-1"
                        x-text="$store.staging.selected.name"></span>
                  <span class="text-[11px] text-mc-text-muted hidden sm:inline" x-text="$store.staging.selected.description"></span>
                  <template x-if="!$store.staging._rejectingId">
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <button @click="$store.staging.approve($store.staging.selected.id)"
                              class="px-3 py-1.5 rounded-lg text-xs font-medium bg-mc-success-dim text-emerald-400 hover:bg-emerald-500/20 transition-all">
                        Approve
                      </button>
                      <button @click="$store.staging._rejectingId = $store.staging.selected.id; $store.staging._rejectReason = ''"
                              class="px-3 py-1.5 rounded-lg text-xs font-medium bg-mc-danger-dim text-red-400 hover:bg-red-500/20 transition-all">
                        Reject
                      </button>
                    </div>
                  </template>
                  <template x-if="$store.staging._rejectingId === $store.staging.selected?.id">
                    <div class="flex items-center gap-1.5 flex-shrink-0">
                      <input x-model="$store.staging._rejectReason" type="text" placeholder="Reason (optional)"
                             class="w-32 sm:w-48 px-2 py-1.5 rounded-lg text-xs bg-mc-elevated border border-mc-border text-mc-text placeholder-mc-text-muted focus:border-red-500/50 focus:outline-none"
                             @keydown.enter="$store.staging.reject($store.staging._rejectingId, $store.staging._rejectReason); $store.staging._rejectingId = null"
                             @keydown.escape="$store.staging._rejectingId = null"
                             x-ref="rejectInput" x-init="$nextTick(() => $refs.rejectInput?.focus())">
                      <button @click="$store.staging.reject($store.staging._rejectingId, $store.staging._rejectReason); $store.staging._rejectingId = null"
                              class="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all">
                        Send
                      </button>
                      <button @click="$store.staging._rejectingId = null"
                              class="px-2 py-1.5 rounded-lg text-xs text-mc-text-muted hover:text-mc-text transition-all">
                        Cancel
                      </button>
                    </div>
                  </template>
                </div>
              </template>
              <template x-if="!$store.staging.selected">
                <span class="text-sm text-mc-text-muted">Select an item to preview</span>
              </template>
            </div>

            <template x-if="$store.staging.selected">
              <div class="flex-1 flex flex-col">
                <iframe :src="$store.staging.selected.previewUrl"
                        class="flex-1 w-full border-0 bg-white"
                        sandbox="allow-scripts allow-same-origin"></iframe>
              </div>
            </template>
            <template x-if="!$store.staging.selected">
              <div class="flex-1 flex items-center justify-center">
                <div class="text-center text-mc-text-muted">
                  <svg class="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  <div class="text-xs">Select a staged item to preview</div>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- ==========================================
             VIEW: SETTINGS
             ========================================== -->
        <div x-show="$store.app.view === 'settings'"
             x-transition:enter="animate-fade-up"
             class="h-full overflow-y-auto p-4 md:p-6 mc-grid-bg">

          <div class="max-w-3xl mx-auto space-y-6">

            <!-- Header -->
            <div>
              <h1 class="text-xl font-bold text-mc-text">Settings</h1>
              <p class="text-sm text-mc-text-muted mt-1">Customize your Mission Control sidebar and preferences</p>
            </div>

            <!-- Sidebar Visibility -->
            <div class="bg-mc-surface border border-mc-border rounded-xl overflow-hidden">
              <div class="p-4 md:p-5 border-b border-mc-border">
                <h2 class="text-sm font-semibold text-mc-text">Sidebar Navigation</h2>
                <p class="text-xs text-mc-text-muted mt-1">Toggle which views appear in the sidebar. Dashboard and Settings are always visible.</p>
              </div>
              <div class="divide-y divide-mc-border/50">

                <!-- Dashboard (always on, disabled) -->
                <div class="flex items-center justify-between p-4 md:px-5">
                  <div class="flex items-center gap-3">
                    <svg class="w-5 h-5 text-mc-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/>
                    </svg>
                    <div>
                      <div class="text-sm text-mc-text">Dashboard</div>
                      <div class="text-[11px] text-mc-text-muted">Overview, stats, and quick actions</div>
                    </div>
                  </div>
                  <div class="mc-toggle on cursor-not-allowed opacity-50" title="Always visible">
                    <div class="mc-toggle-knob"></div>
                  </div>
                </div>

                <!-- Agents -->
                <div class="flex items-center justify-between p-4 md:px-5">
                  <div class="flex items-center gap-3">
                    <svg class="w-5 h-5 text-mc-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>
                    </svg>
                    <div>
                      <div class="text-sm text-mc-text">Agents</div>
                      <div class="text-[11px] text-mc-text-muted">Create, manage, and monitor AI agents</div>
                    </div>
                  </div>
                  <button @click="$store.settings.toggle('agents')"
                          class="mc-toggle" :class="$store.settings.sidebar.agents ? 'on' : ''">
                    <div class="mc-toggle-knob"></div>
                  </button>
                </div>

                <!-- Workflows -->
                <div class="flex items-center justify-between p-4 md:px-5">
                  <div class="flex items-center gap-3">
                    <svg class="w-5 h-5 text-mc-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/>
                    </svg>
                    <div>
                      <div class="text-sm text-mc-text">Workflows</div>
                      <div class="text-[11px] text-mc-text-muted">Visual workflow builder with LiteGraph.js</div>
                    </div>
                  </div>
                  <button @click="$store.settings.toggle('workflows')"
                          class="mc-toggle" :class="$store.settings.sidebar.workflows ? 'on' : ''">
                    <div class="mc-toggle-knob"></div>
                  </button>
                </div>

                <!-- Chat -->
                <div class="flex items-center justify-between p-4 md:px-5">
                  <div class="flex items-center gap-3">
                    <svg class="w-5 h-5 text-mc-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"/>
                    </svg>
                    <div>
                      <div class="text-sm text-mc-text">Chat</div>
                      <div class="text-[11px] text-mc-text-muted">Conversations with agents via OpenClaw or LiteLLM</div>
                    </div>
                  </div>
                  <button @click="$store.settings.toggle('chat')"
                          class="mc-toggle" :class="$store.settings.sidebar.chat ? 'on' : ''">
                    <div class="mc-toggle-knob"></div>
                  </button>
                </div>

                <!-- Teams -->
                <div class="flex items-center justify-between p-4 md:px-5">
                  <div class="flex items-center gap-3">
                    <svg class="w-5 h-5 text-mc-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"/>
                    </svg>
                    <div>
                      <div class="text-sm text-mc-text">Teams & Governance</div>
                      <div class="text-[11px] text-mc-text-muted">Performance tracking, leaderboards, promotions</div>
                    </div>
                  </div>
                  <button @click="$store.settings.toggle('teams')"
                          class="mc-toggle" :class="$store.settings.sidebar.teams ? 'on' : ''">
                    <div class="mc-toggle-knob"></div>
                  </button>
                </div>

                <!-- Monitor -->
                <div class="flex items-center justify-between p-4 md:px-5">
                  <div class="flex items-center gap-3">
                    <svg class="w-5 h-5 text-mc-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/>
                    </svg>
                    <div>
                      <div class="text-sm text-mc-text">Monitor</div>
                      <div class="text-[11px] text-mc-text-muted">System health, token usage, activity logs</div>
                    </div>
                  </div>
                  <button @click="$store.settings.toggle('monitor')"
                          class="mc-toggle" :class="$store.settings.sidebar.monitor ? 'on' : ''">
                    <div class="mc-toggle-knob"></div>
                  </button>
                </div>

                <!-- Staging -->
                <div class="flex items-center justify-between py-2">
                  <div class="flex items-center gap-3">
                    <svg class="w-5 h-5 text-mc-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/>
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                    <div>
                      <div class="text-sm text-mc-text">Staging</div>
                      <div class="text-[11px] text-mc-text-muted">Agent content preview and approval</div>
                    </div>
                  </div>
                  <button @click="$store.settings.toggle('staging')"
                          class="mc-toggle" :class="$store.settings.sidebar.staging ? 'on' : ''">
                    <div class="mc-toggle-knob"></div>
                  </button>
                </div>

                <!-- Activity -->
                <div class="flex items-center justify-between py-2">
                  <div class="flex items-center gap-3">
                    <svg class="w-5 h-5 text-mc-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <div>
                      <div class="text-sm text-mc-text">Activity</div>
                      <div class="text-[11px] text-mc-text-muted">Server-side agent event log</div>
                    </div>
                  </div>
                  <button @click="$store.settings.toggle('activity')"
                          class="mc-toggle" :class="$store.settings.sidebar.activity ? 'on' : ''">
                    <div class="mc-toggle-knob"></div>
                  </button>
                </div>

              </div>
            </div>

            <!-- Audio Notifications -->
            <div class="bg-mc-surface border border-mc-border rounded-xl overflow-hidden">
              <div class="p-4 md:p-5 border-b border-mc-border">
                <div class="flex items-center justify-between">
                  <div>
                    <h2 class="text-sm font-semibold text-mc-text">Audio Notifications</h2>
                    <p class="text-xs text-mc-text-muted mt-1">Subtle sounds when agents complete tasks, new staging items arrive, and more</p>
                  </div>
                  <button @click="$store.settings.toggleAudio('enabled'); if($store.settings.audio.enabled) mcAudio.unlock()"
                          class="mc-toggle" :class="$store.settings.audio.enabled ? 'on' : ''">
                    <div class="mc-toggle-knob"></div>
                  </button>
                </div>
              </div>

              <div x-show="$store.settings.audio.enabled"
                   x-transition:enter="transition-all duration-200 ease-out"
                   x-transition:enter-start="opacity-0 max-h-0"
                   x-transition:enter-end="opacity-100"
                   x-transition:leave="transition-all duration-150 ease-in"
                   x-transition:leave-start="opacity-100"
                   x-transition:leave-end="opacity-0"
              >
                <!-- Volume slider -->
                <div class="p-4 md:px-5 border-b border-mc-border/50">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs text-mc-text-sec">Volume</span>
                    <span class="text-xs font-mono text-mc-text-muted" x-text="$store.settings.audio.volume + '%'"></span>
                  </div>
                  <input type="range" min="0" max="100" step="5"
                         :value="$store.settings.audio.volume"
                         @input="$store.settings.setVolume($event.target.value)"
                         @change="mcAudio.unlock(); mcAudio.chatComplete()"
                         class="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-amber-500"
                         style="background: linear-gradient(to right, var(--mc-accent, #d4a017) 0%, var(--mc-border, #333) 100%)">
                </div>

                <div class="divide-y divide-mc-border/50">
                  <!-- Chat responses -->
                  <div class="flex items-center justify-between p-4 md:px-5">
                    <div class="flex items-center gap-3">
                      <span class="text-base w-5 text-center">💬</span>
                      <div>
                        <div class="text-sm text-mc-text">Chat Responses</div>
                        <div class="text-[11px] text-mc-text-muted">When an agent finishes a reply</div>
                      </div>
                    </div>
                    <button @click="$store.settings.toggleAudio('chat')"
                            class="mc-toggle" :class="$store.settings.audio.chat ? 'on' : ''">
                      <div class="mc-toggle-knob"></div>
                    </button>
                  </div>

                  <!-- Task completion -->
                  <div class="flex items-center justify-between p-4 md:px-5">
                    <div class="flex items-center gap-3">
                      <span class="text-base w-5 text-center">✓</span>
                      <div>
                        <div class="text-sm text-mc-text">Task Events</div>
                        <div class="text-[11px] text-mc-text-muted">Governance task success or failure</div>
                      </div>
                    </div>
                    <button @click="$store.settings.toggleAudio('tasks')"
                            class="mc-toggle" :class="$store.settings.audio.tasks ? 'on' : ''">
                      <div class="mc-toggle-knob"></div>
                    </button>
                  </div>

                  <!-- Staging -->
                  <div class="flex items-center justify-between p-4 md:px-5">
                    <div class="flex items-center gap-3">
                      <span class="text-base w-5 text-center">📋</span>
                      <div>
                        <div class="text-sm text-mc-text">Staging</div>
                        <div class="text-[11px] text-mc-text-muted">New items for review, approvals</div>
                      </div>
                    </div>
                    <button @click="$store.settings.toggleAudio('staging')"
                            class="mc-toggle" :class="$store.settings.audio.staging ? 'on' : ''">
                      <div class="mc-toggle-knob"></div>
                    </button>
                  </div>

                  <!-- Workflows -->
                  <div class="flex items-center justify-between p-4 md:px-5">
                    <div class="flex items-center gap-3">
                      <span class="text-base w-5 text-center">⚡</span>
                      <div>
                        <div class="text-sm text-mc-text">Workflows</div>
                        <div class="text-[11px] text-mc-text-muted">When a workflow finishes executing</div>
                      </div>
                    </div>
                    <button @click="$store.settings.toggleAudio('workflows')"
                            class="mc-toggle" :class="$store.settings.audio.workflows ? 'on' : ''">
                      <div class="mc-toggle-knob"></div>
                    </button>
                  </div>

                  <!-- Activity -->
                  <div class="flex items-center justify-between p-4 md:px-5">
                    <div class="flex items-center gap-3">
                      <span class="text-base w-5 text-center">🔔</span>
                      <div>
                        <div class="text-sm text-mc-text">Background Activity</div>
                        <div class="text-[11px] text-mc-text-muted">New server-side agent events</div>
                      </div>
                    </div>
                    <button @click="$store.settings.toggleAudio('activity')"
                            class="mc-toggle" :class="$store.settings.audio.activity ? 'on' : ''">
                      <div class="mc-toggle-knob"></div>
                    </button>
                  </div>

                  <!-- Errors -->
                  <div class="flex items-center justify-between p-4 md:px-5">
                    <div class="flex items-center gap-3">
                      <span class="text-base w-5 text-center">⚠️</span>
                      <div>
                        <div class="text-sm text-mc-text">Error Alerts</div>
                        <div class="text-[11px] text-mc-text-muted">System errors logged to monitor</div>
                      </div>
                    </div>
                    <button @click="$store.settings.toggleAudio('errors')"
                            class="mc-toggle" :class="$store.settings.audio.errors ? 'on' : ''">
                      <div class="mc-toggle-knob"></div>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Connection Info -->
            <div class="bg-mc-surface border border-mc-border rounded-xl p-4 md:p-5">
              <h2 class="text-sm font-semibold text-mc-text mb-4">Connection Status</h2>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="flex items-center gap-3 p-3 rounded-lg bg-mc-elevated">
                  <span class="mc-dot" :class="$store.app.ocConnected ? 'mc-dot-connected' : 'mc-dot-idle'"></span>
                  <div>
                    <div class="text-xs text-mc-text-muted">OpenClaw Gateway</div>
                    <div class="text-sm font-medium" :class="$store.app.ocConnected ? 'text-emerald-400' : 'text-mc-text-muted'"
                         x-text="$store.app.ocConnected ? 'Connected (real-time)' : 'Disconnected (fallback mode)'"></div>
                  </div>
                </div>
                <div class="flex items-center gap-3 p-3 rounded-lg bg-mc-elevated">
                  <span class="mc-dot" :class="$store.app.connected ? 'mc-dot-connected' : 'mc-dot-idle'"></span>
                  <div>
                    <div class="text-xs text-mc-text-muted">LiteLLM API</div>
                    <div class="text-sm font-medium" :class="$store.app.connected ? 'text-emerald-400' : 'text-mc-text-muted'"
                         x-text="$store.app.connected ? 'Healthy' : 'Offline'"></div>
                  </div>
                </div>
              </div>
              <div class="mt-4 flex items-center gap-3">
                <button @click="$store.app.reconnect()"
                        class="px-4 py-2 bg-mc-elevated border border-mc-border rounded-lg text-xs font-medium text-mc-text-sec hover:text-mc-text hover:border-mc-text-muted transition-all">
                  Reconnect Services
                </button>
                <a href="/openclaw/" target="_blank"
                   class="px-4 py-2 bg-mc-elevated border border-mc-border rounded-lg text-xs font-medium text-mc-text-sec hover:text-mc-text hover:border-mc-text-muted transition-all inline-flex items-center gap-1.5">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/>
                  </svg>
                  Open Native OpenClaw UI
                </a>
              </div>
            </div>

            <!-- About -->
            <div class="bg-mc-surface border border-mc-border rounded-xl p-4 md:p-5">
              <h2 class="text-sm font-semibold text-mc-text mb-2">About Mission Control</h2>
              <p class="text-xs text-mc-text-sec leading-relaxed">
                Mission Control is the primary hub for managing OpenClaw agents, workflows, and teams
                on in-fused.org. It connects to OpenClaw via a dedicated WebSocket for real-time agent
                monitoring and control, and to LiteLLM for multi-provider AI model access.
                The native OpenClaw UI at <code class="text-cyan-400">/openclaw/</code> is available
                as a fallback.
              </p>
            </div>

          </div>
        </div>

      <!-- Global Cron Jobs Bottom Sheet (mobile-friendly) -->
      <template x-if="$store.cron.activeAgent">
        <div class="fixed inset-0 z-[60]" @click.self="$store.cron.close()">
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-black/50" @click="$store.cron.close()"></div>
          <!-- Bottom sheet -->
          <div class="absolute bottom-0 left-0 right-0 bg-mc-surface border-t border-mc-border rounded-t-2xl shadow-2xl z-[61] max-h-[70vh] flex flex-col"
               style="padding-bottom: env(safe-area-inset-bottom, 0px)">
            <!-- Drag handle -->
            <div class="flex justify-center pt-3 pb-1">
              <div class="w-10 h-1 rounded-full bg-mc-border"></div>
            </div>
            <!-- Header -->
            <div class="flex items-center justify-between px-5 pb-3 border-b border-mc-border">
              <div>
                <span class="text-sm font-semibold text-mc-text">Scheduled Jobs</span>
                <span class="text-xs text-mc-text-muted ml-2" x-text="'(' + $store.cron.forAgent($store.cron.activeAgent).length + ')'"></span>
              </div>
              <button @click="$store.cron.close()" class="p-2 -mr-2 text-mc-text-muted hover:text-mc-text min-w-[44px] min-h-[44px] flex items-center justify-center">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <!-- Content -->
            <div class="flex-1 overflow-y-auto px-5 py-3">
              <div x-show="$store.cron.loading" class="text-sm text-mc-text-muted py-8 text-center">Loading...</div>
              <div x-show="!$store.cron.loading && $store.cron.forAgent($store.cron.activeAgent).length === 0" class="text-sm text-mc-text-muted py-8 text-center">
                No scheduled jobs yet. Agents create them via the cron tool.
              </div>
              <div x-show="!$store.cron.loading" class="space-y-3">
                <template x-for="job in $store.cron.forAgent($store.cron.activeAgent)" :key="job.id || job.jobId">
                  <div class="flex items-center justify-between bg-mc-elevated rounded-xl px-4 py-3">
                    <div class="flex-1 min-w-0 mr-3">
                      <div class="text-sm text-mc-text truncate" x-text="job.label || job.name || job.id || 'Unnamed'"></div>
                      <div class="text-xs text-mc-text-muted font-mono mt-0.5" x-text="$store.cron.formatSchedule(job)"></div>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <button @click="$store.cron.runNow(job.id || job.jobId)" title="Run now"
                              class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-mc-text-muted hover:text-emerald-400 hover:bg-emerald-500/10 transition-all active:scale-95">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"/></svg>
                      </button>
                      <button @click="$store.cron.remove(job.id || job.jobId)" title="Remove"
                              class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-mc-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all active:scale-95">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                  </div>
                </template>
              </div>
              <div x-show="$store.cron.error" class="text-sm text-red-400 mt-3 text-center" x-text="$store.cron.error"></div>
            </div>
          </div>
        </div>
      </template>

      </main>

      <!-- ================================================================
           STATUS BAR
           ================================================================ -->
      <footer class="h-9 min-h-[36px] bg-mc-surface border-t border-mc-border flex items-center px-3 md:px-4 gap-3 md:gap-4 text-[11px] font-mono text-mc-text-muted flex-shrink-0 overflow-hidden">
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <span class="mc-dot" :class="$store.app.connected ? 'mc-dot-connected' : 'mc-dot-disconnected'" style="width:6px;height:6px"></span>
          <span x-text="$store.app.connected ? 'Online' : 'Demo'"></span>
        </div>
        <span class="opacity-30">|</span>
        <span class="flex-shrink-0" x-text="$store.agents.list.length + ' agents'"></span>
        <span class="opacity-30 mc-statusbar-extra">|</span>
        <span class="mc-statusbar-extra" x-text="$store.agents.scheduled + ' scheduled'"></span>
        <span class="opacity-30 mc-statusbar-extra">|</span>
        <span class="mc-statusbar-extra" x-text="$store.sessions.list.length + ' sessions'"></span>
        <div class="flex-1"></div>
        <span class="opacity-50 flex-shrink-0 hidden sm:inline">in-fused.org</span>
      </footer>
    </div>

  </div>

  <!-- ====================================================================
       AGENT CREATION WIZARD (Modal Overlay)
       ==================================================================== -->
  <div x-data x-show="$store.agents.wizardOpen" x-cloak
       class="fixed inset-0 z-50 flex items-center justify-center"
       x-transition:enter="transition ease-out duration-200"
       x-transition:enter-start="opacity-0"
       x-transition:enter-end="opacity-100"
       x-transition:leave="transition ease-in duration-150"
       x-transition:leave-start="opacity-100"
       x-transition:leave-end="opacity-0">

    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="$store.agents.closeWizard()"></div>

    <!-- Modal -->
    <div class="relative bg-mc-surface border border-mc-border rounded-2xl w-[90%] max-w-xl max-h-[85vh] overflow-y-auto shadow-2xl" @click.stop>

      <!-- Header -->
      <div class="px-6 pt-6 pb-4 border-b border-mc-border">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-mc-text">Create New Agent</h2>
          <button @click="$store.agents.closeWizard()"
                  class="w-8 h-8 flex items-center justify-center rounded-lg text-mc-text-muted hover:text-mc-text hover:bg-mc-elevated transition-all">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Step Indicators -->
        <div class="flex items-center gap-2 mt-4">
          <template x-for="step in [1, 2, 3, 4]" :key="step">
            <div class="flex items-center gap-2">
              <div class="mc-step-dot" :class="$store.agents.wizardStep > step ? 'done' : ($store.agents.wizardStep === step ? 'active' : '')">
                <span x-show="$store.agents.wizardStep <= step" x-text="step"></span>
                <span x-show="$store.agents.wizardStep > step">&#10003;</span>
              </div>
              <div x-show="step < 4" class="mc-step-line" :class="$store.agents.wizardStep > step ? 'done' : ''"></div>
            </div>
          </template>
        </div>
      </div>

      <!-- Step Content -->
      <div class="p-6">

        <!-- STEP 1: Identity -->
        <div x-show="$store.agents.wizardStep === 1">
          <h3 class="text-sm font-semibold text-mc-text mb-4">Agent Identity</h3>
          <div class="mb-4">
            <label class="block text-xs font-medium text-mc-text-muted uppercase tracking-wider mb-1.5">Name</label>
            <input type="text" x-model="$store.agents.wizard.name"
                   placeholder="e.g., CodeCraft, Sentinel, Scribe..."
                   class="w-full bg-mc-bg border border-mc-border rounded-lg px-4 py-2.5 text-sm text-mc-text placeholder-mc-text-muted mc-input-focus">
          </div>
          <div class="mb-4">
            <label class="block text-xs font-medium text-mc-text-muted uppercase tracking-wider mb-1.5">Avatar</label>
            <div class="grid grid-cols-8 gap-1.5">
              <template x-for="emoji in AGENT_EMOJIS" :key="emoji">
                <button @click="$store.agents.wizard.emoji = emoji"
                        class="mc-emoji-btn" :class="$store.agents.wizard.emoji === emoji ? 'selected' : ''"
                        x-text="emoji"></button>
              </template>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-mc-text-muted uppercase tracking-wider mb-1.5">Description</label>
            <input type="text" x-model="$store.agents.wizard.description"
                   placeholder="Brief description of what this agent does..."
                   class="w-full bg-mc-bg border border-mc-border rounded-lg px-4 py-2.5 text-sm text-mc-text placeholder-mc-text-muted mc-input-focus">
          </div>
        </div>

        <!-- STEP 2: Model -->
        <div x-show="$store.agents.wizardStep === 2">
          <h3 class="text-sm font-semibold text-mc-text mb-4">Choose Model</h3>
          <div class="space-y-2 max-h-[50vh] overflow-y-auto">
            <template x-for="model in $store.models.list" :key="model.id">
              <button @click="$store.agents.wizard.model = model.id"
                      class="w-full text-left px-4 py-3 rounded-lg border transition-all flex items-center gap-3"
                      :class="$store.agents.wizard.model === model.id ? 'border-cyan-500 bg-mc-primary-dim' : 'border-mc-border bg-mc-bg hover:border-mc-text-muted'">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-mc-text" x-text="model.name"></span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          :class="{'bg-emerald-500/10 text-emerald-400': model.tier === 'free', 'bg-cyan-500/10 text-cyan-400': model.tier === 'cheap', 'bg-amber-500/10 text-amber-400': model.tier === 'mid', 'bg-violet-500/10 text-violet-400': model.tier === 'premium'}"
                          x-text="model.tier.toUpperCase()"></span>
                  </div>
                  <div class="text-xs text-mc-text-muted mt-0.5" x-text="model.desc"></div>
                </div>
                <div class="text-right flex-shrink-0">
                  <div class="text-xs font-mono text-mc-text-sec" x-text="model.cost"></div>
                  <div class="text-[10px] text-mc-text-muted" x-text="model.provider"></div>
                </div>
              </button>
            </template>
          </div>
        </div>

        <!-- STEP 3: System Prompt & Tools -->
        <div x-show="$store.agents.wizardStep === 3">
          <h3 class="text-sm font-semibold text-mc-text mb-4">System Prompt</h3>
          <div class="mb-6">
            <textarea x-model="$store.agents.wizard.systemPrompt"
                      placeholder="Define the agent's role, personality, and instructions...&#10;&#10;Example: You are a senior full-stack developer specializing in TypeScript and React. Review code for bugs, security issues, and performance problems."
                      rows="5"
                      class="w-full bg-mc-bg border border-mc-border rounded-lg px-4 py-3 text-sm text-mc-text placeholder-mc-text-muted mc-input-focus font-mono resize-y"></textarea>
          </div>
          <h3 class="text-sm font-semibold text-mc-text mb-3">Tools & Capabilities</h3>
          <div class="grid grid-cols-2 gap-2">
            <template x-for="tool in AGENT_TOOLS" :key="tool.id">
              <button @click="$store.agents.toggleTool(tool.id)"
                      class="text-left px-3 py-3 rounded-lg border transition-all"
                      :class="$store.agents.wizard.tools.includes(tool.id) ? 'border-cyan-500 bg-mc-primary-dim' : 'border-mc-border bg-mc-bg hover:border-mc-text-muted'">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-base" x-text="tool.icon"></span>
                  <span class="text-xs font-medium text-mc-text" x-text="tool.name"></span>
                </div>
                <div class="text-[10px] text-mc-text-muted" x-text="tool.desc"></div>
              </button>
            </template>
          </div>
        </div>

        <!-- STEP 4: Review -->
        <div x-show="$store.agents.wizardStep === 4">
          <h3 class="text-sm font-semibold text-mc-text mb-4">Review & Create</h3>
          <div class="bg-mc-bg border border-mc-border rounded-xl p-5 space-y-4">
            <div class="flex items-center gap-3">
              <div class="w-14 h-14 rounded-xl bg-mc-elevated flex items-center justify-center text-3xl" x-text="$store.agents.wizard.emoji"></div>
              <div>
                <div class="text-base font-semibold text-mc-text" x-text="$store.agents.wizard.name || 'Unnamed Agent'"></div>
                <div class="text-xs text-mc-text-muted" x-text="$store.agents.wizard.description || 'No description'"></div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div class="text-mc-text-muted uppercase tracking-wider mb-0.5">Model</div>
                <div class="text-mc-text font-mono" x-text="$store.agents.wizard.model"></div>
              </div>
              <div>
                <div class="text-mc-text-muted uppercase tracking-wider mb-0.5">Tools</div>
                <div class="text-mc-text" x-text="$store.agents.wizard.tools.length + ' enabled'"></div>
              </div>
            </div>
            <div x-show="$store.agents.wizard.systemPrompt">
              <div class="text-xs text-mc-text-muted uppercase tracking-wider mb-1">System Prompt</div>
              <div class="text-xs text-mc-text-sec font-mono bg-mc-elevated rounded-lg p-3 max-h-24 overflow-y-auto whitespace-pre-wrap"
                   x-text="$store.agents.wizard.systemPrompt"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-mc-border flex justify-between">
        <button @click="$store.agents.wizardStep > 1 ? $store.agents.prevStep() : $store.agents.closeWizard()"
                class="px-4 py-2 rounded-lg text-sm text-mc-text-sec border border-mc-border hover:bg-mc-elevated transition-all">
          <span x-text="$store.agents.wizardStep > 1 ? 'Back' : 'Cancel'"></span>
        </button>
        <button x-show="$store.agents.wizardStep < 4"
                @click="$store.agents.nextStep()"
                :disabled="$store.agents.wizardStep === 1 && !$store.agents.wizard.name.trim()"
                class="px-5 py-2 rounded-lg text-sm font-medium bg-cyan-500 text-mc-bg hover:brightness-110 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
          Next
        </button>
        <button x-show="$store.agents.wizardStep === 4"
                @click="$store.agents.createAgent()"
                class="px-5 py-2 rounded-lg text-sm font-medium bg-cyan-500 text-mc-bg hover:brightness-110 transition-all shadow-lg shadow-cyan-500/20">
          Create Agent
        </button>
      </div>
    </div>
  </div>

  <!-- ====================================================================
       SCRIPTS (order matters: openclaw-client → app.js → litegraph → workflow.js)
       ==================================================================== -->
  <script src="js/native-bridge.js"></script>
  <script src="js/openclaw-client.js"></script>
  <script src="js/app.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/litegraph.js@0.7.18/build/litegraph.min.js"></script>
  <script src="js/workflow.js"></script>
  <script src="js/workflow-bridge.js"></script>

</body>
</html>
```

---

# [16] workspace/css/styles.css (720 lines) — Custom styles

```
/* ==========================================================================
   Mission Control — Custom Styles
   in-fused.org

   Tailwind handles utility classes. This file covers:
   - CSS custom properties (theme tokens)
   - Animations & keyframes
   - Complex component styles Tailwind can't express
   - LiteGraph.js dark theme overrides
   - Scrollbar styling
   ========================================================================== */

/* ---- Theme Tokens ---- */
:root {
  --mc-bg: #0a0e17;
  --mc-surface: #111827;
  --mc-elevated: #1f2937;
  --mc-border: #374151;
  --mc-primary: #06b6d4;
  --mc-primary-dim: rgba(6, 182, 212, 0.12);
  --mc-secondary: #8b5cf6;
  --mc-secondary-dim: rgba(139, 92, 246, 0.12);
  --mc-success: #10b981;
  --mc-success-dim: rgba(16, 185, 129, 0.12);
  --mc-warning: #f59e0b;
  --mc-warning-dim: rgba(245, 158, 11, 0.12);
  --mc-danger: #ef4444;
  --mc-danger-dim: rgba(239, 68, 68, 0.12);
  --mc-text: #f9fafb;
  --mc-text-sec: #9ca3af;
  --mc-text-muted: #6b7280;
}

/* ---- Base Reset ---- */
*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  height: 100dvh; /* iOS Safari: accounts for dynamic toolbar */
  overflow: hidden;
  background: var(--mc-bg);
  color: var(--mc-text);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  /* Safe area: handled per-element (sidebar, header), NOT on body.
     Body padding + fixed-height children causes clipping on iOS. */
}

/* ---- Scrollbars ---- */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--mc-border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--mc-text-muted); }

/* ---- Grid Background (immersive radar feel) ---- */
.mc-grid-bg {
  background-image:
    linear-gradient(rgba(6, 182, 212, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(6, 182, 212, 0.025) 1px, transparent 1px);
  background-size: 32px 32px;
}

/* ---- Status Indicator Dots ---- */
.mc-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.mc-dot-running {
  background: var(--mc-success);
  box-shadow: 0 0 8px var(--mc-success);
  animation: pulse-glow 2s ease-in-out infinite;
}
.mc-dot-idle { background: var(--mc-text-muted); }
.mc-dot-error {
  background: var(--mc-danger);
  box-shadow: 0 0 8px var(--mc-danger);
}
.mc-dot-connected {
  background: var(--mc-success);
  box-shadow: 0 0 6px var(--mc-success);
}
.mc-dot-disconnected { background: var(--mc-danger); }

/* ---- Stat Card Top Border ---- */
.mc-stat-border::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  border-radius: 12px 12px 0 0;
}
.mc-stat-border.cyan::before { background: var(--mc-primary); }
.mc-stat-border.green::before { background: var(--mc-success); }
.mc-stat-border.amber::before { background: var(--mc-warning); }
.mc-stat-border.purple::before { background: var(--mc-secondary); }

/* ---- Wizard Step Indicators ---- */
.mc-step-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--mc-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--mc-text-muted);
  transition: all 200ms ease;
  flex-shrink: 0;
}
.mc-step-dot.active {
  background: var(--mc-primary);
  border-color: var(--mc-primary);
  color: var(--mc-bg);
}
.mc-step-dot.done {
  background: var(--mc-success);
  border-color: var(--mc-success);
  color: var(--mc-bg);
}
.mc-step-line {
  width: 40px;
  height: 2px;
  background: var(--mc-border);
  flex-shrink: 0;
}
.mc-step-line.done { background: var(--mc-success); }

/* ---- Model Tier Colors ---- */
.tier-free { color: var(--mc-success); }
.tier-cheap { color: var(--mc-primary); }
.tier-mid { color: var(--mc-warning); }
.tier-premium { color: var(--mc-secondary); }

/* ---- Chat Bubbles ---- */
.mc-bubble-user {
  background: var(--mc-primary-dim);
  border-bottom-right-radius: 4px;
}
.mc-bubble-agent {
  background: var(--mc-elevated);
  border-bottom-left-radius: 4px;
}

/* ---- Token Usage Bars ---- */
.mc-usage-track {
  height: 20px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  overflow: hidden;
}
.mc-usage-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 600ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* ---- Log Entry Hover ---- */
.mc-log-row:hover { background: var(--mc-elevated); }

/* ---- Keyframes ---- */
@keyframes pulse-glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slide-right {
  from { opacity: 0; transform: translateX(-16px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes scan-line {
  0% { transform: translateY(-100%); }
  100% { transform: translateY(100vh); }
}

@keyframes typewriter {
  from { width: 0; }
  to { width: 100%; }
}

@keyframes blink-cursor {
  0%, 100% { border-color: var(--mc-primary); }
  50% { border-color: transparent; }
}

@keyframes boot-text {
  0% { opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { opacity: 0; }
}

.animate-fade-up { animation: fade-up 400ms ease forwards; }
.animate-slide-right { animation: slide-right 300ms ease forwards; }

/* ---- Boot Screen ---- */
.mc-boot-text {
  font-family: 'JetBrains Mono', monospace;
  animation: blink-cursor 1s step-end infinite;
  border-right: 2px solid var(--mc-primary);
  padding-right: 4px;
}

.mc-boot-scanline {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--mc-primary), transparent);
  opacity: 0.3;
  animation: scan-line 3s linear infinite;
}

/* ---- Palette Nodes (Workflow Builder) ---- */
.mc-palette-node {
  cursor: grab;
  user-select: none;
  transition: all 150ms ease;
}
.mc-palette-node:hover, .mc-palette-node:active {
  border-color: var(--mc-primary);
  transform: translateX(2px);
}
.mc-palette-node:active { cursor: grabbing; }
@media (pointer: coarse) {
  .mc-palette-node { min-height: 44px; }
}

/* ---- Sidebar Tooltip (collapsed mode) ---- */
.mc-sidebar-collapsed .mc-nav-btn[data-tip]::after {
  content: attr(data-tip);
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
  background: var(--mc-elevated);
  color: var(--mc-text);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 150ms ease;
  border: 1px solid var(--mc-border);
  z-index: 100;
}
.mc-sidebar-collapsed .mc-nav-btn[data-tip]:hover::after { opacity: 1; }
/* Hide CSS tooltips on touch — they cause ghost taps */
@media (pointer: coarse) {
  .mc-sidebar-collapsed .mc-nav-btn[data-tip]::after { display: none; }
}

/* ---- Input Focus Ring ---- */
.mc-input-focus:focus {
  border-color: var(--mc-primary);
  box-shadow: 0 0 0 2px var(--mc-primary-dim);
  outline: none;
}

/* ---- Card Hover/Active Glow ---- */
.mc-card-glow:hover, .mc-card-glow:active {
  border-color: rgba(6, 182, 212, 0.3);
  box-shadow: 0 0 24px rgba(6, 182, 212, 0.06);
}

/* ---- Emoji Picker ---- */
.mc-emoji-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: pointer;
  font-size: 18px;
  background: none;
  border: 2px solid transparent;
  transition: all 150ms ease;
}
.mc-emoji-btn:hover, .mc-emoji-btn:active { background: var(--mc-elevated); }
.mc-emoji-btn.selected {
  border-color: var(--mc-primary);
  background: var(--mc-primary-dim);
}

/* ---- Toggle Switch (Settings) ---- */
.mc-toggle {
  width: 40px;
  height: 22px;
  background: var(--mc-border);
  border-radius: 11px;
  position: relative;
  cursor: pointer;
  transition: background 200ms ease;
  flex-shrink: 0;
  border: none;
  padding: 0;
}
.mc-toggle.on {
  background: var(--mc-primary);
}
.mc-toggle-knob {
  width: 16px;
  height: 16px;
  background: var(--mc-text);
  border-radius: 50%;
  position: absolute;
  top: 3px;
  left: 3px;
  transition: transform 200ms ease;
}
.mc-toggle.on .mc-toggle-knob {
  transform: translateX(18px);
}

/* ---- Range Slider (Audio Volume) ---- */
input[type="range"].accent-amber-500 {
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: 3px;
  background: var(--mc-border, #333);
  outline: none;
}
input[type="range"].accent-amber-500::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--mc-primary, #d4a017);
  cursor: pointer;
  border: 2px solid var(--mc-bg, #0a0a0f);
}
input[type="range"].accent-amber-500::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--mc-primary, #d4a017);
  cursor: pointer;
  border: 2px solid var(--mc-bg, #0a0a0f);
}

/* ---- LiteGraph.js Dark Theme Override ---- */
.lgraphcanvas {
  background-color: var(--mc-bg) !important;
}

/* ---- LiteGraph.js Touch Support (iOS / mobile) ---- */
#workflow-canvas,
.lgraphcanvas {
  touch-action: none;      /* Prevent browser from hijacking touch for scroll/zoom */
  -webkit-user-select: none;
  user-select: none;
}

/* LiteGraph widget text dialogs: ensure scrollable on overflow */
.litegraph .graphdialog,
.litegraph .dialog {
  max-height: 60vh !important;
  max-height: 60dvh !important;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch;
}
.litegraph .graphdialog textarea,
.litegraph .dialog textarea {
  max-height: 40vh !important;
  max-height: 40dvh !important;
  overflow-y: auto !important;
  resize: vertical !important;
  -webkit-overflow-scrolling: touch;
  font-size: 14px !important;
}
/* Make LiteGraph popup inputs touch-friendly */
@media (pointer: coarse) {
  .litegraph .graphdialog input,
  .litegraph .graphdialog textarea,
  .litegraph .graphdialog select {
    min-height: 44px !important;
    font-size: 16px !important; /* prevent iOS zoom */
  }
  .litegraph .graphdialog button,
  .litegraph .graphdialog .btn {
    min-height: 44px !important;
  }
}

.litegraph .litecontextmenu {
  background: var(--mc-surface) !important;
  border: 1px solid var(--mc-border) !important;
  color: var(--mc-text) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4) !important;
  max-height: 70vh !important;
  overflow-y: auto !important;
}
.litegraph .litecontextmenu .litemenu-entry {
  color: var(--mc-text-sec) !important;
}
.litegraph .litecontextmenu .litemenu-entry:hover {
  background: var(--mc-elevated) !important;
  color: var(--mc-text) !important;
}

/* ---- Responsive: Mobile (< 768px) ---- */

/* Mobile sidebar: fixed overlay */
@media (max-width: 767px) {
  .mc-sidebar-mobile {
    position: fixed;
    left: 0;
    top: 0;
    width: 260px;
    height: 100%;
    height: 100dvh;
    z-index: 50 !important; /* must beat Tailwind utilities & stay above backdrop (z-45) */
    box-shadow: 4px 0 32px rgba(0, 0, 0, 0.6);
    transform: translateX(-100%);
    transition: transform 250ms ease;
    padding-top: env(safe-area-inset-top);
    padding-left: env(safe-area-inset-left);
    -webkit-overflow-scrolling: touch; /* smooth scroll on older iOS */
  }
  .mc-sidebar-mobile.open {
    transform: translateX(0);
  }

  /* Backdrop behind sidebar */
  .mc-sidebar-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 45;
    opacity: 0;
    pointer-events: none;
    transition: opacity 250ms ease;
  }
  .mc-sidebar-backdrop.open {
    opacity: 1;
    pointer-events: auto;
  }

  /* Mobile chat panel: slide-in overlay from left */
  .mc-chat-panel-mobile {
    position: fixed;
    left: 0;
    top: 56px; /* header height */
    bottom: 0;
    width: 280px;
    z-index: 35;
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.5);
    transform: translateX(-100%);
    transition: transform 250ms ease;
  }
  .mc-chat-panel-mobile.open {
    transform: translateX(0);
  }

  /* Mobile workflow palette: bottom sheet */
  .mc-workflow-panel-mobile {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 35;
    max-height: 75vh;
    max-height: 75dvh;
    border-top-left-radius: 16px;
    border-top-right-radius: 16px;
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.5);
    transform: translateY(100%);
    transition: transform 250ms ease;
    padding-bottom: env(safe-area-inset-bottom);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain; /* prevent scroll-chaining to canvas behind */
  }
  .mc-workflow-panel-mobile.open {
    transform: translateY(0);
  }

  /* Mobile header: tighter padding */
  .mc-header-mobile {
    padding-left: 12px !important;
    padding-right: 12px !important;
    gap: 8px !important;
  }

  /* Mobile status bar: hide overflow items */
  .mc-statusbar-extra {
    display: none !important;
  }
}

/* Desktop: always visible panels */
@media (min-width: 768px) {
  .mc-sidebar-backdrop {
    display: none !important;
  }

  /* hamburger hidden on desktop */
  .mc-hamburger {
    display: none !important;
  }

  /* mobile panel toggle buttons hidden on desktop */
  .mc-mobile-panel-toggle {
    display: none !important;
  }
}

/* ---- Chat message formatting ---- */
.mc-chat-content {
  word-break: break-word;
  overflow-wrap: anywhere;
}
.mc-chat-content strong { color: var(--mc-text); font-weight: 600; }
.mc-chat-content em { font-style: italic; opacity: 0.85; }

.mc-code-block {
  margin: 8px 0;
  border: 1px solid var(--mc-border);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
}
.mc-code-block[open] { background: rgba(0, 0, 0, 0.4); }
.mc-code-summary {
  padding: 6px 12px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--mc-primary);
  user-select: none;
  -webkit-user-select: none;
  min-height: 36px;
  display: flex;
  align-items: center;
}
.mc-code-summary::-webkit-details-marker { display: none; }
.mc-code-summary::before {
  content: '▶';
  margin-right: 6px;
  font-size: 9px;
  transition: transform 0.15s;
}
.mc-code-block[open] > .mc-code-summary::before { transform: rotate(90deg); }

.mc-code-pre {
  margin: 0;
  padding: 10px 12px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  font-size: 12px;
  line-height: 1.5;
  color: var(--mc-text-sec);
  border-top: 1px solid var(--mc-border);
  max-height: 300px;
  overflow-y: auto;
}
.mc-code-pre code { font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; }

.mc-inline-code {
  background: rgba(6, 182, 212, 0.1);
  color: var(--mc-primary);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.85em;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
}

/* ---- Tool output in chat ---- */

/* Single tool output bubble — dimmer, compact */
.mc-bubble-tool {
  background: rgba(17, 24, 39, 0.6);
  border: 1px solid var(--mc-border);
  border-radius: 8px;
  opacity: 0.7;
  font-size: 12px;
}

/* Collapsed tool output within a message (JSON, status) */
.mc-tool-output {
  margin: 4px 0;
  border: 1px solid rgba(55, 65, 81, 0.5);
  border-radius: 6px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.2);
}
.mc-tool-summary {
  padding: 5px 10px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  color: var(--mc-text-muted);
  user-select: none;
  -webkit-user-select: none;
  min-height: 32px;
  display: flex;
  align-items: center;
  list-style: none;
}
.mc-tool-summary::-webkit-details-marker { display: none; }
.mc-tool-summary::before {
  content: '\25b6';
  margin-right: 6px;
  font-size: 8px;
  transition: transform 0.15s;
  opacity: 0.5;
}
.mc-tool-output[open] > .mc-tool-summary::before { transform: rotate(90deg); }

/* Dim tool status line (e.g. "Successfully wrote 133 bytes...") */
.mc-tool-status {
  font-size: 11px;
  color: var(--mc-text-muted);
  padding: 2px 0;
  opacity: 0.6;
}

/* Merged multi-tool group (collapsed by default) */
.mc-tool-group {
  border: 1px solid rgba(55, 65, 81, 0.4);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(17, 24, 39, 0.5);
}
.mc-tool-group-summary {
  padding: 6px 12px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  color: var(--mc-text-muted);
  user-select: none;
  -webkit-user-select: none;
  min-height: 36px;
  display: flex;
  align-items: center;
  list-style: none;
}
.mc-tool-group-summary::-webkit-details-marker { display: none; }
.mc-tool-group-summary::before {
  content: '\25b6';
  margin-right: 6px;
  font-size: 8px;
  transition: transform 0.15s;
  opacity: 0.5;
}
.mc-tool-group[open] > .mc-tool-group-summary::before { transform: rotate(90deg); }
.mc-tool-group-body {
  padding: 8px 12px;
  border-top: 1px solid rgba(55, 65, 81, 0.3);
  font-size: 12px;
  max-height: 300px;
  overflow-y: auto;
}

/* ---- Touch-friendly targets ---- */
@media (pointer: coarse) {
  .mc-log-filter-btn {
    min-height: 44px;
    min-width: 44px;
    padding: 8px 12px;
  }
  .mc-emoji-btn {
    width: 44px;
    height: 44px;
  }
  /* Navigation buttons: ensure 44px minimum tap targets */
  nav button, .mc-nav-btn {
    min-height: 44px;
  }
  /* Toggle switches */
  .mc-toggle {
    width: 48px;
    height: 28px;
  }
  /* Wizard step dots */
  .mc-step-dot {
    width: 36px;
    height: 36px;
  }
  /* Status dots: enlarge tap area via padding (visual size stays small) */
  .mc-dot {
    padding: 10px;
    margin: -10px;
    position: relative;
  }
  /* General interactive elements */
  input, select, textarea {
    min-height: 44px;
    font-size: 16px; /* prevents iOS zoom on focus */
  }
  /* Buttons in forms */
  button, [role="button"] {
    min-height: 44px;
  }
}

/* ---- Reduced motion ---- */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

# End of Project Bundle

Generated by `scripts/generate-project-bundle.sh`. To regenerate:
```
cd /home/VPS && bash scripts/generate-project-bundle.sh
```

## Agent Access

**From inside OpenClaw container:**
```
read(path: "/workspace/project-bundle.md")
```

**Via URL (requires auth cookie):**
```
https://in-fused.org/workspace/project-bundle.md
```

**Clone the repo (requires git + GitHub access):**
```
# If repo is public:
exec wget -qO /tmp/repo.tar.gz https://github.com/in-fused/VPS/archive/refs/heads/main.tar.gz
exec tar xzf /tmp/repo.tar.gz -C /tmp/

# With a GitHub token:
exec wget --header="Authorization: token <GITHUB_TOKEN>" -qO /tmp/repo.tar.gz https://github.com/in-fused/VPS/archive/refs/heads/main.tar.gz
```
