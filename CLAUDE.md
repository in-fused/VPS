# CLAUDE.md — in-fused.org Project Memory

> **Updated:** Mar 8, 2026 | **Commits:** 97+ | **Status:** Full stack operational, Oracle ARM Ollama integrated, all workflow features verified working

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
- ACTIVE (1): 200 MB — default starting tier, standard tools, cron jobs, background execution
- PROVEN (2): 500 MB — semi-autonomous, score≥70+15tasks+3streak
- ELITE (3): Full autonomy, weekly champion recognition, Manager candidacy

**All agents have access to:** Oracle Cloud ARM (shared, 4 OCPU / 24GB), Ollama models (zero rate limits), persistent cron jobs, dedicated background execution slots. No resources are Elite-gated — every agent can build out the workspace like a real workplace.

**No paid API:** Premium models (Claude, GPT-4o, etc.) are NOT available for agent use. Only free providers. If OAuth subscription billing (ChatGPT Plus, Claude Pro) is configured in the future, that would change.

**Team competition:** Both teams are scored on governance metrics (success rate, quality, efficiency, streaks). Per-team lead promotion is automatic when an agent outperforms the current lead by 15+ points after 10+ tasks. Weekly champion earns Elite recognition. The owner can manually promote a sustained Elite performer to Manager (above both teams).

**Oracle Cloud ARM — Shared by All Agents (updated 2026-03-08):**
- **1 instance:** 4 OCPU / 24 GB RAM (Oracle Cloud Always Free tier) at `150.136.153.194:11434`
- **3 Ollama models loaded:** `qwen3.5:9b` (6.6 GB), `qwen3:14b` (9.3 GB), `qwen3-coder:30b` (18.6 GB)
- **Both teams share full resources** — models need the full 24 GB RAM; partitioning would prevent loading the 30B model
- **Zero rate limits** — unlike cloud providers, Ollama has no RPD/TPD caps
- **LiteLLM routes via `OLLAMA_BASE_URL`** — agents don't call Ollama directly; LiteLLM handles load balancing + fallback

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

## Workflow System — Current State (verified 2026-03-08)

### Node Types (workflow.js)

**8 custom node types** under `mission/*` namespace:

| Node | Inputs → Outputs | `runAsync()` behavior |
|------|-------------------|----------------------|
| **Trigger** | — → prompt, trigger | Returns `this.properties.prompt`. Scheduled trigger wired to OpenClaw cron RPC. |
| **Agent** | prompt, context → response, done | Tries OpenClaw WS → LiteLLM `chat()` → demo fallback. Refreshes agent dropdown dynamically on draw. |
| **Task** | input, execute → result, done | Formats goal/constraints/priority around input |
| **Tool** | input, execute → result, done | 8 real tools: Web Search, Web Scrape (Scrapling), Code Exec, File Read/Write, Shell, API Call, Browser. Routes through OpenClaw agent's tool system. |
| **Condition** | input → true, false | Evaluates Contains/Equals/Regex/Length/IsEmpty, returns `{ true: input or null, false: input or null }` |
| **Output** | result, done → — | Routes to: Log, Chat Response (injects into session), File (writes to staging), Webhook |
| **Loop** | items → item, index, done, results | Splits input, returns `_loop` marker. Executor re-runs downstream subgraph per item, accumulates and joins results. |
| **Merge** | input_1, input_2 → merged | Concatenate, JSON Merge, Pick Best (AI via LiteLLM), Summary (AI via LiteLLM) |

**WorkflowExecutor:**
- Topological sort via BFS from trigger nodes
- Sequential execution via `runAsync()`
- Branch gating: skips nodes when all connected inputs are null (inactive condition branches)
- Loop iteration: detects `_loop` marker, re-executes downstream subgraph per item, collects results
- Visual feedback: amber=running, green=success, red=error, gray=skipped
- Governance tracking: records Agent node tasks during execution (including inside loops)

### Workflow Persistence (working)
- **Auto-save** every 5 seconds via polling (`setupAutoSave()` in app.js). Compares serialized graph to detect changes.
- **localStorage** stores graph data (`mc-workflow-<id>`) and metadata list (`workflows`).
- **Canvas restore** on navigation: `graph.configure()` + `canvas.setDirty()` + `canvas.draw()`.
- **Agent sync**: `workflowBridge.syncWorkflow()` auto-exports to Lead/Ops Lead workspaces on manual save.

### Agent↔Workflow Bridge (workflow-bridge.js, working)
- **Import (Agents → MC):** Polls `/workspace/agent-workflows/index.json` every 15s + polls agent workspaces via RPC every 60s. Auto-imports agent-created workflows.
- **Export (MC → Agents):** `syncWorkflow()` writes to Lead/Ops Lead workspace via `agents.files.set` RPC. Debounced 10s.
- **Full CRUD via file protocol:** Agents write to index.json with `action` field:
  - `action: "create"` (default) — write graph JSON + add index entry → MC imports
  - `action: "update"` — overwrite graph JSON + bump `updatedAt` → MC re-imports
  - `action: "delete"` — MC removes workflow from store, cleans index entry
  - `action: "execute"` — MC triggers workflow execution, clears action after
- **Background Execution:** Sends `EXECUTE_WORKFLOW:{id}\n{json}` to team lead. Auto-routes to correct team. Results written to `/workspace/agent-workflows/results/{id}.json`.
- **Governance Sync:** Writes agent scores to `GOVERNANCE.md` in agent workspaces.
- **Activity Log:** Reads `/workspace/agent-activity/log.json` for "While You Were Away" report.

### Scheduled Triggers (partially wired)
- `cron.enabled=true` in entrypoint. Agents can create server-side cron jobs via the `cron` tool.
- Trigger node has "Scheduled" option with cron expression widget wired to `cron.add`/`cron.remove` RPC.
- **Gap:** Webhook triggers are still UI-only (no backend endpoint).

---

## PRIMARY GOAL: Autonomous Agent Operation

### The Vision

The owner manages this project from a phone. They should be able to open Mission Control, give agents a task, close the browser, and **come back later to find the work done.** OpenClaw runs 24/7 on EC2 — it doesn't stop when the browser closes. The agents (Lead, CodeCraft, Scout, Scribe, and any sub-agents they spawn) must be able to:

- **Operate autonomously in the background** — continue executing workflows, completing tasks, and delegating work after the user leaves the session
- **Utilize all Mission Control features** — chat, workflows, tools, agent-to-agent messaging, governance tracking
- **Self-organize** — Lead delegates to specialists, specialists delegate to sub-agents, results flow back up the chain
- **Be transparent** — all agent activity should be visible in Mission Control when the owner returns (logs, workflow execution history, chat transcripts, governance scores)

This is not a chatbot. This is an autonomous agent system that happens to have a chat interface.

### Implementation Status (verified 2026-03-08)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Reliable Chat Pipeline | ✅ Complete | 3-tier fallback (OpenClaw WS → LiteLLM SSE → demo). Rate-limit recovery: wait 8s → retry Route 1 → Route 2 model rotation. 120s timeout with history recovery. Reconnection with exponential backoff + iOS visibility handlers. |
| 2 | Workflow Persistence | ✅ Complete | Auto-save every 5s. Dynamic workflow list from localStorage. Canvas restore on navigation. Agent sync via bridge. |
| 3 | End-to-End Workflow Execution | ✅ Complete | Trigger → Agent → Condition → Output works with real OpenClaw/LiteLLM calls. Branch gating, model resolution, output routing all functional. |
| 4 | Agent↔Workflow Bridge | ✅ Complete | Full CRUD via file-based `action` field (create/update/delete/execute). Bidirectional sync via file polling + RPC. Background execution routes to team leads. Activity log import. |
| 5 | Real Tool Execution | ✅ Complete | 8 tools mapped to OpenClaw: Web Search, Web Scrape (Scrapling), Code Exec, File Read/Write, Shell, API Call, Browser. |
| 6 | Loop Node Iteration | ✅ Complete | Executor detects `_loop` marker, re-runs downstream subgraph per item, accumulates and joins results. |
| 7 | Background Autonomy | ✅ Mostly Complete | OpenClaw runs 24/7. Cron jobs work server-side. Results sync on next visit. Gap: webhook triggers still UI-only. |

### Remaining Work

1. **Webhook triggers** — No backend endpoint for incoming webhooks to trigger workflows

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
- **Oracle ARM networking blocked by second instance**: Creating a second Oracle Cloud instance (even within free tier) triggered networking restrictions on both instances. Fixed by terminating the smaller instance — only need one instance (4 OCPU / 24 GB) for all 3 Ollama models.
- **Ollama end-to-end routing verified (2026-03-08)**: LiteLLM → Ollama (Oracle ARM at 150.136.153.194:11434) → qwen3.5:9b confirmed working. All 3 models loaded: qwen3-coder:30b (18.6 GB), qwen3:14b (9.3 GB), qwen3.5:9b (6.6 GB).
- **Workflow system fully operational (2026-03-08)**: All features previously listed as "broken" confirmed working — auto-save persistence, loop iteration, real tool execution (8 tools), AI-powered merge modes, bidirectional agent-workflow bridge, scheduled trigger wiring to cron RPC.

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
