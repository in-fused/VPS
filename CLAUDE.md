# CLAUDE.md — in-fused.org Project Memory

> **Updated:** Mar 2, 2026 | **Commits:** 94 | **Status:** Stack deployed, core functionality working — now building agent autonomy

## Project Overview

**in-fused.org** is a self-hosted multi-agent AI hub on AWS EC2 t3.small (~$25/month). It unifies multiple LLM providers behind a single interface with autonomous agent capabilities.

**Domain:** `in-fused.org` | **Repo:** https://github.com/in-fused/VPS

**Core services:**
- **Mission Control** (`/workspace/`) — custom SPA for agent management, chat, and visual workflow builder
- **OpenClaw** (`/openclaw/`) — autonomous agent runtime (24/7), exposes WebSocket RPC for Mission Control
- **Open WebUI** (`/`) — ChatGPT-like frontend with golden cyber theme
- **LiteLLM** (`/api/litellm/`) — unified gateway routing to 20 models across 6 providers
- **Caddy** — reverse proxy, auto-HTTPS, site-wide cookie auth

---

## Development Rules

**Do not modify working code as a side effect.** When fixing a bug or adding a feature, change only what is necessary for that task. Do not rename variables, restructure objects, "clean up" adjacent code, or remove fields that look unnecessary. If existing code is working in production, assume every part of it is load-bearing until proven otherwise. The owner deploys from a phone — every broken push costs hours of mobile debugging.

**Scope discipline:** If a function works, don't touch it while working on something else. If you need to change a working function, that's a separate commit with a separate justification — not a drive-by edit bundled into an unrelated fix.

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
cd /home/VPS && sudo git config --global --add safe.directory /home/VPS && sudo git pull origin claude/autonomous-agents-ios-uToqU && sudo bash scripts/deploy.sh
```

🖥️ Desktop/SSH:
```bash
cd /home/VPS
sudo git config --global --add safe.directory /home/VPS
sudo git pull origin claude/autonomous-agents-ios-uToqU
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
sudo docker compose ps
```
```
sudo docker compose logs --tail=50
```
```
sudo docker compose logs --tail=50 openclaw
```

### SSM Gotchas
- **Always** run `sudo git config --global --add safe.directory /home/VPS` before any git command — SSM runs as ssm-user, not the repo owner
- When removing Docker volumes, you must also remove ALL containers that reference the volume (e.g., both `openclaw` and `openclaw-init` share `openclaw-data`)
- SSM sessions time out, but `docker compose up -d` runs detached — deploys complete even if the session drops

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

## LiteLLM Models (20 models, 5 tiers)

| Tier | Models | Cost |
|------|--------|------|
| FREE | qwen2.5-coder:14b, deepseek-coder-v2:16b, llama3.2:8b (Ollama) | $0 |
| FREE | groq-llama-3.3-70b, groq-qwen3-32b, groq-qwq-32b, groq-qwen-coder-32b (Groq, 2 accounts) | $0 |
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
- 13 models exposed, agent-to-agent messaging enabled, subagents enabled

### Agent Hierarchy — 2 Teams (seeded on first run, preserved after)

**Core Team** — General tasks and feature development:

| Agent | Model | Role | Delegates To |
|-------|-------|------|--------------|
| Lead | groq-llama-3.3-70b | Orchestrator | CodeCraft, Scout, Scribe |
| CodeCraft | groq-qwen-coder-32b | Full-stack developer | Scout, Scribe |
| Scout | groq-llama-3.3-70b | Research specialist | Scribe |
| Scribe | gpt-4o-mini | Documentation writer | (none) |

**Platform Team** — Infrastructure, deployments, monitoring:

| Agent | Model | Role | Delegates To |
|-------|-------|------|--------------|
| Ops Lead | groq-llama-3.3-70b | Platform orchestrator | Builder, Sentinel, Chronicler |
| Builder | deepseek-coder | Infrastructure developer | Sentinel, Chronicler |
| Sentinel | deepseek-chat | Security & monitoring | Chronicler |
| Chronicler | gpt-4o-mini | Platform documentation | (none) |

**Model budget strategy:**
- All free models are available to agents at every tier (no model restrictions by tier level)
- Groq (free, 2K req/day with 2 accounts): Lead, Scout, Ops Lead (groq-llama-3.3-70b), CodeCraft (groq-qwen-coder-32b)
- Groq reasoning models (free): groq-qwen3-32b (dual-mode reasoning, 131K ctx), groq-qwq-32b (advanced reasoning, 128K ctx)
- DeepSeek ($0.14/1M): Builder, Sentinel (code + reasoning, dirt cheap)
- gpt-4o-mini (OpenAI free tier, 3 RPM): Scribe, Chronicler (infrequent documentation only)
- Agents may rotate between free models to avoid rate limits — this is encouraged

**Tier storage (EC2 t3.small, ~2GB total workspace):**
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

### OpenClaw Config Validation (DO NOT ADD THESE KEYS — causes crash loop)
- `identity.description` — only `name`, `emoji` are valid identity keys
- `agent.instructions` — NOT a valid agent key (system prompts live in app.js only)
- `subagents.maxDepth/maxConcurrent/maxChildrenPerAgent/runTimeoutSeconds` — not valid
- `tools.agentToAgent.maxPingPongTurns` — not valid
- `compaction`, `contextPruning`, `memorySearch`, `experimental` — not valid top-level keys
- `gateway.trustProxy` — use `gateway.trustedProxies` instead

**Agent system prompts are CLIENT-SIDE in our setup** — defined in `workspace/js/app.js` DEMO_AGENTS array, injected into the first message of each OpenClaw conversation (app.js line ~1524) and as a `system` role message in the LiteLLM SSE fallback (app.js line ~1576). Note: OpenClaw v3 DOES support server-side prompts via workspace files (`SOUL.md`, `AGENTS.md`, `IDENTITY.md` etc. in each agent's workspace dir), but `instructions` is NOT a valid agent config key — the entrypoint scrubs it.

---

## Mission Control — Core Functionality Map

### Tech Stack
- Alpine.js 3.14.8 (reactive stores) + Tailwind CSS (CDN) + LiteGraph.js 0.7.18 (workflows)
- Vanilla JS, no build step, served as static files from Caddy

### File Map
| File | Lines | Purpose |
|------|-------|---------|
| `workspace/index.html` | 1429 | Main SPA shell (Alpine.js templates, all views) |
| `workspace/js/app.js` | 2811 | Shared prompt constants, Alpine stores, health checks, chat, governance |
| `workspace/js/workflow.js` | ~860 | LiteGraph nodes, WorkflowExecutor (loop iteration, governance), touch bridge |
| `workspace/js/workflow-bridge.js` | ~190 | Agent-to-workflow file-based bridge (polls /workspace/agent-workflows/) |
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
├── docker-compose.yml            ← 7 services + 1 optional
├── litellm_config.yaml           ← 20 models, 5 tiers
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
| `GROQ_API_KEY` | Groq free tier (account 1) |
| `GROQ_API_KEY_2` | Groq free tier (account 2) — LiteLLM load-balances both |
| `MINIMAX_API_KEY` | MiniMax M2.5 |
| `OLLAMA_BASE_URL` | Remote Ollama (Oracle Cloud ARM) |
| `LITELLM_MASTER_KEY` | LiteLLM auth (must start with `sk-`) |
| `LITELLM_SALT_KEY` | LiteLLM encryption salt |
| `OPENCLAW_PASSWORD` | Site-wide password (Caddy + OpenClaw + Mission Control) |
| `WEBUI_SECRET_KEY` | Open WebUI session secret |
| `DB_PASSWORD` | PostgreSQL for LiteLLM |
| `COMPOSE_PROJECT_NAME` | ai-hub |

## Wiring & Gotchas (Things That Will Bite You)

These are non-obvious behaviors across the system. A future session that doesn't know these will waste time debugging.

### Caddy Streaming
- Every proxy handler in the Caddyfile uses `flush_interval -1` to disable response buffering. This is **critical** for SSE streaming and WebSocket upgrades. Without it, chat responses hang indefinitely. Do not remove it during "cleanup."

### WebSocket Path Stripping
- Caddy's `handle_path /ws/openclaw` strips the `/ws/openclaw` prefix before proxying. OpenClaw receives the WebSocket connection at `/`, not `/ws/openclaw`. This is invisible but intentional — OpenClaw's gateway expects connections at root.
- There are TWO separate WebSocket matchers: `/ws/openclaw` (dedicated, for Mission Control) and `/` root path (legacy, for OpenClaw's native Control UI). Both are required.

### Model ID Aliasing
- `litellm_config.yaml` defines upstream models like `groq/llama-3.3-70b-versatile`, but LiteLLM exposes them to clients as `groq-llama-3.3-70b` (the `model_name` field). OpenClaw entrypoint, Mission Control app.js, and all agent configs reference the **alias**, not the upstream ID. If you change one, update all of them.

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

### OpenClaw Auth Handshake — VERIFIED WORKING, DO NOT CHANGE
**⚠️ This handshake was broken 3 times in a row by well-intentioned "cleanups". Every field is load-bearing. Do NOT modify `_sendHandshake()` in `openclaw-client.js` without testing on the live server first.**

The exact working format (validated 2026-03-02):
```javascript
{
  type: 'req', method: 'connect',
  params: {
    minProtocol: 3, maxProtocol: 3,
    auth: { token: pw, password: pw },  // NO mode field — schema rejects it
    role: 'operator',
    scopes: ['operator.read', 'operator.write', 'operator.admin', 'operator.approvals'],
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
- `router_settings.fallbacks` configured so Groq models (6,000 TPM free tier) automatically fall back to DeepSeek ($0.14/M) on 429 errors
- Groq → DeepSeek chat for orchestrators (llama, qwen3, qwq); Groq → DeepSeek coder for code specialists
- This means agents never get stuck on rate limits — the first request uses Groq (free), retries on DeepSeek (cheap)
- `routing_strategy: latency-based-routing` picks the fastest available deployment when load-balancing across Groq accounts

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

---

## OpenClaw Deep Reference (researched 2026-03-02)

### Version Warning
**Do NOT update the OpenClaw Docker image to v2026.2.26 until [PR #30227](https://github.com/openclaw/openclaw/pull/30227) is merged.** Issue [#30092](https://github.com/openclaw/openclaw/issues/30092): `dangerouslyDisableDeviceAuth=true` fails with `device-required` behind HTTPS reverse proxy on v2026.2.26. We run behind Caddy (HTTPS). Current `ghcr.io/openclaw/openclaw:main` tag may auto-update — consider pinning to a known-good version if this becomes an issue.

### Entrypoint Config Additions (2026-03-02)
- `cron.enabled = true` + `cron.maxConcurrentRuns = 1` — agents can create server-side scheduled jobs via the `cron` tool
- `tools.sessions.visibility = 'all'` — agents can see each other's sessions for team coordination
- `update.channel = 'stable'` + `update.auto.enabled = true` — in-app auto-updater on stable channel (separate from Docker image tags, available since v2026.2.22)

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

### Server-Side Agent Workspace Files

OpenClaw v3 builds agent system prompts from workspace files (not config). Valid files:
`AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `MEMORY.md`, `BOOTSTRAP.md`

These are read from `~/.openclaw/workspace-<agentWorkspace>/` on every turn. We currently use client-side prompt injection instead (app.js DEMO_AGENTS), but could migrate to workspace files for true server-side prompts.
