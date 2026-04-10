# CLAUDE.md — in-fused.org Project Memory

> **Updated:** Apr 10, 2026 | **Commits:** 130+ | **Milestone commit:** `98dee2d` | **Status:** Full autonomous operation — all systems verified working, production-ready

## Project Overview

**in-fused.org** is a self-hosted multi-agent AI hub on AWS EC2 t3.small (~$25/month). It unifies multiple LLM providers behind a single interface with autonomous agent capabilities.

**Domain:** `in-fused.org` | **Repo:** https://github.com/in-fused/VPS

**Core services:**
- **Mission Control** (`/workspace/`) — custom SPA for agent management, chat, and visual workflow builder
- **OpenClaw** (`/openclaw/`) — autonomous agent runtime (24/7), exposes WebSocket RPC for Mission Control
- **LiteLLM** (`/api/litellm/`) — unified gateway routing to 20+ models across 6 providers
- **Scrapling** (internal only) — web scraping API for agents at `http://scrapling:8000`
- **Caddy** — reverse proxy, auto-HTTPS, site-wide cookie auth

---

## Development Rules

**Do not modify working code as a side effect.** When fixing a bug or adding a feature, change only what is necessary for that task. Do not rename variables, restructure objects, "clean up" adjacent code, or remove fields that look unnecessary. If existing code is working in production, assume every part of it is load-bearing until proven otherwise. The owner deploys from a phone — every broken push costs hours of mobile debugging.

**Scope discipline:** If a function works, don't touch it while working on something else. If you need to change a working function, that's a separate commit with a separate justification — not a drive-by edit bundled into an unrelated fix.

**Root-cause first, no debugging noise.** When fixing a bug, identify and resolve the root cause before producing output. Do not layer workarounds, redundant null-checks, or defensive patches on top of each other — find the one thing that's actually wrong and fix that. If a first attempt doesn't work, remove it before trying the next approach. The final commit should contain only the real fix, not a stack of abandoned debugging attempts. Every line in the diff should be justified by the root cause, not by "just in case."

---

## Protected Fixes — DO NOT REMOVE OR MODIFY

> **These fixes were verified working in production on Mar 9, 2026 (commit `98dee2d`). Each one resolves a bug that was painful to diagnose. Future sessions MUST NOT remove, refactor, or "clean up" any of these without explicit owner approval. If you think one is unnecessary, you're wrong — it was added because the system broke without it.**

### 1. OpenClaw Auth Handshake (`openclaw-client.js` → `_sendHandshake()`)
- **Broken 3 times** by "cleanup" attempts. Every field is load-bearing.
- `auth: { token: pw, password: pw }` — both fields required, NO `mode` field
- `client: { id: 'webchat', version: '1.0.0', platform: 'web', mode: 'webchat' }` — exact values
- NO `device` block — causes "device identity mismatch" (1008)
- Entrypoint sets BOTH `dangerouslyDisableDeviceAuth=true` AND `allowInsecureAuth=true`

### 2. Caddy Streaming (`Caddyfile`)
- `flush_interval -1` on every proxy handler — disables response buffering
- Without it: SSE streaming hangs, WebSocket upgrades fail, chat is dead
- TWO separate WebSocket matchers required: `/ws/openclaw` + `/` root (legacy)

### 3. OpenClaw Entrypoint Config Guards (`scripts/openclaw-entrypoint.sh` + `patch-openclaw-config.js`)
- `tools.profile = 'full'` — v2026.3.2 changed default to "messaging" (removes exec/read/write/edit)
- `agents.defaults.models = { litellm: {} }` — provider allowlist prevents anthropic fallback
- `compaction.memoryFlush.softThresholdTokens = 50000` — prevents aggressive compaction loop
- `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1` — allows plaintext WS on Docker bridge
- Invalid key scrubbing — `identity.description`, `agent.instructions`, `supportsDeveloperRole`, etc. cause crash loops
- `cron.enabled = true` — agents need server-side cron for inbox-check and background autonomy

### 4. Agent Delegation Chain (`scripts/seed-agent-workspaces.js` + BOOTSTRAP.md)
- Every agent creates `0 */2 * * *` inbox-check cron on bootstrap (every 2 hours)
- Without this: `sessions_send` messages sit unread forever, delegation is dead
- Auto-kickoff (`scripts/auto-kickoff.js`) runs on every restart, NO lock file
- `OPENCLAW_AUTO_KICKOFF=1` is default (opt-out, not opt-in)

### 5. Heartbeat/System Message Filtering (`openclaw-client.js` + `app.js`)
- 11 regex patterns + label filter in both `_parseHistoryMessages` and `on('chat')`
- Heartbeat/cron sessions filtered from `_syncSessionsFromOpenClaw()`
- Without this: chat UI floods with system noise, unusable

### 6. LiteLLM Rate Limit Fallbacks (`litellm_config.yaml`)
- Multi-provider chains: Groq → Cerebras → DeepSeek, Cerebras → Groq → DeepSeek
- 6 free providers exhausted before any paid API is hit
- `routing_strategy: latency-based-routing` — fastest available deployment
- `allowed_fails: 2` + `cooldown_time: 60` — exhausted providers temporarily removed
- `drop_params: true` — silently drops unsupported params for cross-provider compat

### 7. Docker Service Dependencies (`docker-compose.yml`)
- OpenClaw `depends_on` LiteLLM with `condition: service_healthy`
- `workspace-init` copies repo files into volume on every deploy (overwrites manual edits)
- `openclaw-init` + `openclaw` both reference `openclaw-data` volume — must remove both to reset
- OpenClaw container has NO `curl` — agents must use `wget` or `node -e "fetch(...)"`

### 8. Workspace File Seeding (`scripts/seed-agent-workspaces.js`)
- ALL 7 files force-overwritten on every restart (SOUL, USER, AGENTS, MEMORY, TOOLS, HEARTBEAT, BOOTSTRAP)
- Runs TWICE: once before OpenClaw starts, once 30s after (overwrites OpenClaw's defaults)
- `instructions` agent config key is scrubbed — prompts live in workspace files only
- Agent `memory/*.md` files are NEVER touched (persistent daily logs)

### 9. Oracle Cloud ARM / Ollama (`litellm_config.yaml`)
- Single instance: 4 OCPU / 24 GB at `150.136.153.194:11434`
- Creating a second instance triggers networking restrictions on BOTH — do not create another
- All 3 models need full 24 GB RAM — do not partition
- LiteLLM routes via `OLLAMA_BASE_URL` — agents don't call Ollama directly

### Rollback Deployment — Known-Good State

If anything breaks, roll back to this verified commit:

📱 iOS/SSM:
```
cd /home/VPS && sudo git config --global --add safe.directory /home/VPS && sudo git fetch origin claude/post-deployment-multi-agent-A8VKl && sudo git reset --hard 98dee2d && sudo bash scripts/deploy.sh
```

🖥️ Desktop/SSH:
```bash
cd /home/VPS
sudo git config --global --add safe.directory /home/VPS
sudo git fetch origin claude/post-deployment-multi-agent-A8VKl
sudo git reset --hard 98dee2d
sudo bash scripts/deploy.sh
```

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
- Workflows and orchestration are managed via Paperclip at `/paperclip/`

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
  └── / (everything else)    → Cookie-gated → Landing page (landing.html)

OpenClaw → LiteLLM → Anthropic, OpenAI, DeepSeek, Groq, Cerebras, MiniMax, Gemini, Mistral, Ollama(Oracle ARM)
OpenClaw agents → Scrapling :8000 (internal web scraping API)
OpenClaw agents → SearXNG :8080 (internal meta-search: Google, Bing, DDG, Wikipedia)
Paperclip :3100 → OpenClaw (orchestration, task queues, goals)
Watchtower → monitors OpenClaw for image updates (daily 4 AM UTC)
Docker network: ai-net (bridge)
```

### Docker Services

| Service | Image | Memory | Port |
|---------|-------|--------|------|
| caddy | in-fused/caddy:latest (custom build) | 64M | 80, 443 |
| litellm | ghcr.io/berriai/litellm:v1.82.3-stable.patch.2 | 512M | 4000 |
| litellm-db | postgres:16-alpine | 128M | 5432 |
| openclaw | ghcr.io/openclaw/openclaw:v2026.4.1 | 1536M | 18789 |
| scrapling | in-fused/scrapling:latest (custom build) | 512M | 8000 (internal) |
| searxng | searxng/searxng:latest | 256M | 8080 (internal) |
| webhook | in-fused/webhook:latest (custom build) | 64M | 9090 (internal) |
| paperclip | in-fused/paperclip:latest (custom build) | 256M | 3100 |
| paperclip-db | postgres:17-alpine | 128M | — |
| watchtower | nickfedor/watchtower:latest | 64M | — |
| ollama | ollama/ollama:latest (profile: local-models) | 4G | — |
| openclaw-init | alpine:3 | — | — |
| workspace-init | alpine:3 | — | — |

Total ~3.5GB (2GB RAM + 4GB swap). Custom images (caddy, scrapling, paperclip) use `build:` in docker-compose — `deploy.sh` builds each then `docker compose up -d`. LiteLLM and OpenClaw are pinned to specific versions. Watchtower auto-updates OpenClaw daily at 4 AM UTC (label-filtered).

---

## Auth Flow (Working)

Single password protects the entire site. Flow:
1. `caddy-entrypoint.sh` computes base64 token + SHA-256 hash from `OPENCLAW_PASSWORD`
2. Login pages call `GET /auth/verify` with `Authorization: Basic <token>`
3. On success, set cookie `mc_oc=<sha256hash>` (24h, SameSite=Lax)
4. All Caddy routes check `Cookie *mc_oc={$WORKSPACE_PASS_SHA256}*`
5. Unauthenticated → rewrite to login page from workspace volume

---

## LiteLLM Models (45+ deployments, 8 tiers, 6 free providers)

| Tier | Models | Cost |
|------|--------|------|
| FREE | qwen3.5:9b, qwen3:14b, qwen3-coder:30b (Ollama, Oracle ARM, zero rate limits) | $0 |
| FREE | groq-llama-3.3-70b, groq-qwen3-32b, groq-gpt-oss-120b, groq-gpt-oss-20b (Groq, 4 accounts, load-balanced) | $0 |
| FREE | cerebras-gpt-oss-120b, cerebras-llama-3.1-8b, cerebras-qwen3-235b, cerebras-zai-glm (Cerebras, 1M TPD) | $0 |
| FREE | gemini-flash, gemini-flash-lite, gemini-pro, gemini-embedding (Google Gemini, 3 accounts, 250-1000 RPD) | $0 |
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
- Default model: `cerebras-gpt-oss-120b` (object format `{ primary: '...' }`, free 1M TPD)
- 45+ model deployments exposed across 6 free providers + paid, agent-to-agent messaging enabled, subagents enabled

### Agent Hierarchy — 2 Teams (seeded on first run, preserved after)

**Core Team** — General tasks and feature development:

| Agent | Model | Role | Delegates To |
|-------|-------|------|--------------|
| Lead | cerebras-gpt-oss-120b (free) | Orchestrator | CodeCraft, Scout, Scribe |
| CodeCraft | cerebras-gpt-oss-120b (free) | Full-stack developer | Scout, Scribe |
| Scout | groq-gpt-oss-120b (free) | Research specialist | Scribe |
| Scribe | gemini-flash-lite (free) | Documentation writer | (none) |

**Platform Team** — Infrastructure, deployments, monitoring:

| Agent | Model | Role | Delegates To |
|-------|-------|------|--------------|
| Ops Lead | cerebras-gpt-oss-120b (free) | Platform orchestrator | Builder, Sentinel, Chronicler |
| Builder | cerebras-gpt-oss-120b (free) | Infrastructure developer | Sentinel, Chronicler |
| Sentinel | groq-gpt-oss-120b (free) | Security & monitoring | Chronicler |
| Chronicler | gemini-flash-lite (free) | Platform documentation | (none) |

**Model budget strategy (FREE-FIRST):**
- **ALL 8 agents run on FREE models** — $0/month base cost
- **Cerebras GPT-OSS 120B (free, 1M TPD, ~3000 t/s)** for leads + developers (Lead, CodeCraft, Ops Lead, Builder)
- **Groq GPT-OSS 120B (free, ~500 t/s)** for research + security (Scout, Sentinel)
- **Gemini Flash-Lite (free, 1000 RPD)** for documentation writers (Scribe, Chronicler)
- Subagents inherit their parent's model — prevents capability mismatches during parallel execution
- **DeepSeek ($0.28/1M) is fallback-only** — only triggers when free providers return 429 rate limits
- Fallback chain: cerebras-gpt-oss → groq-gpt-oss → gemini → ollama → deepseek-chat (paid, last resort)
- LiteLLM `allowed_fails: 2` + `cooldown_time: 60` — exhausted providers are temporarily removed from the pool

**Tier storage (EC2 t3.small, 50GB gp3 volume):**
- PROBATION (0): 50 MB — supervised, must prove competence
- ACTIVE (1): 200 MB — default starting tier, standard tools, cron jobs, background execution
- PROVEN (2): 500 MB — semi-autonomous, score≥70+15tasks+3streak
- ELITE (3): Full autonomy, weekly champion recognition, Manager candidacy

**Per-agent tool restrictions (enforced via `patch-openclaw-config.js` TOOL_RESTRICTIONS):**

| Agent | Denied Tools | Rationale |
|-------|-------------|-----------|
| Lead | `browser` | Orchestrator — delegates browser tasks to CodeCraft |
| CodeCraft | (none) | Full access — developer |
| Scout | `exec` | Research only — uses web_fetch, delegates shell tasks |
| Scribe | `exec`, `browser` | Documentation writer — uses read/write/edit only |
| Ops Lead | `browser` | Platform orchestrator — delegates browser tasks to Builder |
| Builder | (none) | Full access — infra developer |
| Sentinel | (none) | Full access — security auditing requires exec |
| Chronicler | `exec`, `browser` | Documentation writer — uses read/write/edit only |

**All agents have access to:** Oracle Cloud ARM (shared, 4 OCPU / 24GB), Ollama models (zero rate limits), persistent cron jobs, dedicated background execution slots. No resources are Elite-gated — every agent can build out the workspace like a real workplace.

**Cost model:** ALL agents run on free providers (Cerebras, Groq, Gemini). DeepSeek V3.2 (`deepseek-chat`, $0.28/1M) is fallback-only — triggers on 429 rate limit failures. Premium models (Claude, GPT-4o) are NOT available for agent use.

**Team competition:** Both teams are scored on governance metrics (success rate, quality, efficiency, streaks). Per-team lead promotion is automatic when an agent outperforms the current lead by 15+ points after 10+ tasks. Weekly champion earns Elite recognition. The owner can manually promote a sustained Elite performer to Manager (above both teams).

**Oracle Cloud ARM — Shared by All Agents (updated 2026-03-08):**
- **1 instance:** 4 OCPU / 24 GB RAM (Oracle Cloud Always Free tier) at `150.136.153.194:11434`
- **3 Ollama models loaded:** `qwen3.5:9b` (6.6 GB), `qwen3:14b` (9.3 GB), `qwen3-coder:30b` (18.6 GB)
- **Both teams share full resources** — models need the full 24 GB RAM; partitioning would prevent loading the 30B model
- **Zero rate limits** — unlike cloud providers, Ollama has no RPD/TPD caps
- **LiteLLM routes via `OLLAMA_BASE_URL`** — agents don't call Ollama directly; LiteLLM handles load balancing + fallback

Each agent has a comprehensive system prompt delivered via server-side workspace files (SOUL.md, USER.md, AGENTS.md, MEMORY.md, TOOLS.md, HEARTBEAT.md, BOOTSTRAP.md). These are seeded by `seed-agent-workspaces.js` on every container restart. Client-side fallback prompts in `workspace/js/app.js` use shared constants:
These constants were removed — governance and orchestration moved to Paperclip. DEMO_AGENTS now has minimal 1-line fallback prompts for LiteLLM SSE route only. The entrypoint (`scripts/openclaw-entrypoint.sh`) runs `scripts/patch-openclaw-config.js` (config patching) then `scripts/seed-agent-workspaces.js` (workspace file seeding). The `instructions` agent config key is scrubbed on every restart.

**Manager Promotion:** A consistently Elite-performing agent can be manually promoted by the owner to "Manager" — a role above both teams, reporting directly to the owner. A replacement agent fills the vacated spot. All agents are aware of this possibility.

### Agent Communication Protocols

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

**Inbox-Check Cron** — Every agent creates a `0 */2 * * *` cron job on bootstrap (every 2 hours):
- Uses `cron()` tool with `schedule: { cron: "0 */2 * * *" }`, `payload: { kind: "agentTurn", ... }`
- On trigger: agent checks session history for delegated tasks from other agents
- Reads new messages, executes delegated tasks, replies with results
- **This is the critical link** that makes delegation work — without it, `sessions_send` messages sit unread forever
- Agents MUST dedup before creating — `cron(action: "list")` first, skip if one already exists

**Collaboration Protocol** — Agents can co-author work across teams:
- Any agent can pull in any other agent via `sessions_send(sessionKey: "agent:<id>:main", message: "...")`
- Cross-team collaboration is explicitly encouraged (e.g., CodeCraft + Builder on a full-stack task)
- Co-authoring rules: initiator stages final deliverable, always reply with results (never silence)

**Auto-Kickoff** — On every container restart, `auto-kickoff.js` sends a directive to both leads:
- Enabled by default via `OPENCLAW_AUTO_KICKOFF=1` in docker-compose.yml (opt-out, not opt-in)
- Runs after 30s delay (allows OpenClaw to fully initialize)
- Sends a 5-step directive: run BOOTSTRAP.md, set up cron, check staging/activity, execute or create work, message team members
- No lock file — runs fresh on every restart to ensure agents always bootstrap

### Bridge Directories (auto-created by workspace-init)
```
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
| `SOUL.md` | Agent identity, role, rules, protocols, co-authoring examples | No (agent-specific) |
| `USER.md` | Owner profile, mobile workflow, preferences | Yes (all agents) |
| `AGENTS.md` | Team structure, competition rules | Yes (all agents) |
| `MEMORY.md` | Project context, infrastructure, file paths, reference doc pointers | Yes (all agents, initial seed) |
| `TOOLS.md` | Available tools, inbox-check cron, staging protocol, collaboration protocol | Yes (all agents) |
| `HEARTBEAT.md` | Periodic check-in behavior (leads get extended version) | Yes (role-specific) |
| `BOOTSTRAP.md` | Startup sequence: verify tools, set up cron, assign/find work | No (role-specific: lead vs specialist) |

**Tool profile:** `tools.profile = 'full'` is explicitly set in the entrypoint. v2026.3.2 changed the default to "messaging" which excludes coding tools (exec, read, write, edit). Without this, agents lose their core capabilities.

---

## Mission Control — Core Functionality Map

### Tech Stack
- Alpine.js 3.14.8 (reactive stores) + Tailwind CSS (CDN)
- Vanilla JS, no build step, served as static files from Caddy
- Workflows and orchestration handled by Paperclip (separate service at `/paperclip/`)

### File Map
| File | Lines | Purpose |
|------|-------|---------|
| `workspace/index.html` | 2360 | Main SPA shell (Alpine.js templates, all views) |
| `workspace/js/app.js` | ~3600 | Alpine stores, health checks, chat, agent sync (governance/workflows moved to Paperclip) |
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
| `cron` | Per-agent cron job management, fetched from OpenClaw | `fetch()`, `countForAgent()` |
| `activity` | Server + live event feed, filtered | `events[]`, `filtered` |
| `settings` | Sidebar visibility preferences | `toggle()`, `isVisible()` |

### Dashboard (overhauled 2026-03-08)
The Dashboard view shows autonomy-focused metrics:
- **Stats row:** Staging (pending count, amber highlight), Activity (new event count), Cron Jobs (total active)
- **Autonomy Status grid:** 8-agent grid with green pulse dots for agents with active cron jobs, "idle" label for inactive
- **Staging Queue:** Inline preview of pending staging items with approve/reject buttons
- **Batch Approve:** "Approve All" button when 2+ pending staging items exist

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

## Workflow System — Moved to Paperclip

The custom LiteGraph workflow system (workflow.js, workflow-bridge.js) has been **removed**. Workflows, task queues, and orchestration are now handled by **Paperclip** at `/paperclip/`. The old workflow files were deleted and their Alpine.js stores replaced with no-op stubs.

Agents can still create server-side cron jobs via the `cron` tool (`cron.enabled=true` in entrypoint).

---

## PRIMARY GOAL: Autonomous Agent Operation

### The Vision

The owner manages this project from a phone. They should be able to open Mission Control, give agents a task, close the browser, and **come back later to find the work done.** OpenClaw runs 24/7 on EC2 — it doesn't stop when the browser closes. The agents (Lead, CodeCraft, Scout, Scribe, and any sub-agents they spawn) must be able to:

- **Operate autonomously in the background** — continue executing workflows, completing tasks, and delegating work after the user leaves the session
- **Utilize all Mission Control features** — chat, tools, agent-to-agent messaging, Paperclip orchestration
- **Self-organize** — Lead delegates to specialists, specialists delegate to sub-agents, results flow back up the chain
- **Be transparent** — all agent activity should be visible in Mission Control when the owner returns (logs, chat transcripts, Paperclip dashboard)

This is not a chatbot. This is an autonomous agent system that happens to have a chat interface.

### Implementation Status (verified 2026-04-10)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Reliable Chat Pipeline | ✅ Complete | 3-tier fallback (OpenClaw WS → LiteLLM SSE → demo). Rate-limit recovery: wait 8s → retry Route 1 → Route 2 model rotation. 120s timeout with history recovery. Reconnection with exponential backoff + iOS visibility handlers. |
| 2 | Workflow System | ⬆️ Replaced | Custom LiteGraph workflows removed — replaced by Paperclip task queues + goal hierarchy. |
| 3 | Governance System | ⬆️ Replaced | Custom governance scoring removed — replaced by Paperclip audit trail + agent scores. |
| 5 | Real Tool Execution | ✅ Complete | 8 tools mapped to OpenClaw: Web Search, Web Scrape (Scrapling), Code Exec, File Read/Write, Shell, API Call, Browser. |
| 6 | Loop Node Iteration | ✅ Complete | Executor detects `_loop` marker, re-runs downstream subgraph per item, accumulates and joins results. |
| 7 | Background Autonomy | ✅ Complete | OpenClaw runs 24/7. Auto-kickoff on restart. Inbox-check cron every 2h. Agent-to-agent delegation works end-to-end. Results sync on next visit. |
| 8 | Auto-Kickoff System | ✅ Complete | `auto-kickoff.js` sends bootstrap directive to both leads on every container restart. No lock file — fresh bootstrap every time. |
| 9 | Inbox-Check Cron | ✅ Complete | All agents set up `0 */2 * * *` cron on bootstrap (every 2h, with dedup). Checks for delegated tasks, executes them, replies with results. |
| 10 | Collaboration Protocol | ✅ Complete | Any agent can co-author with any other agent via `sessions_send`. Cross-team collaboration encouraged. |
| 11 | Split Reference Docs | ✅ Complete | 6 focused reference files under `/workspace/reference/` replace 607KB monolithic project-bundle.md. Agents read on-demand for deep context. |
| 12 | Dashboard Overhaul | ✅ Complete | Staging queue, activity count, cron job stats, 8-agent autonomy status grid with live cron indicators, batch approve. |
| 13 | Webhook Triggers | ✅ Complete | Full webhook handler service (`webhook/handler.js`). External POST → token-validated trigger → OpenClaw notification + MC polling. Trigger node UI: register/copy/revoke webhook URLs. Output node: POST results to external webhooks. Oracle ARM archival for payload storage offload. |
| 14 | Paperclip Integration | ✅ Complete | Paperclip orchestration layer replaces custom governance/workflow code. Docker service + Postgres. Setup script registers agents with openclaw_gateway adapter. Mission Control links to Paperclip UI. ~660 lines removed from app.js, ~170 lines removed from index.html. |

### Remaining Work

1. **Reference doc auto-refresh** — Currently generated only at deploy time; could be regenerated on config changes
2. **Paperclip initial onboarding** — Visit `/paperclip/` on first deploy to complete the Paperclip onboarding wizard. The setup script will auto-register agents after that.
3. **Verify Paperclip heartbeats** — Once Paperclip is onboarded, verify that heartbeats wake OpenClaw agents correctly. After verified, auto-kickoff.js and inbox-check cron can be removed.
4. **Oracle ARM migration** — Move everything to Oracle Cloud ARM after EC2 promo ends.

---

## Startup Chain — Deploy to Autonomous Operation

Understanding the full chain from `deploy.sh` to agents producing output autonomously. This is the single most important sequence in the system.

### The 6-Layer Chain

```
deploy.sh → docker compose up -d
  └─→ OpenClaw container starts → openclaw-entrypoint.sh
        ├─ [L1] patch-openclaw-config.js  (patches openclaw.json: gateway, auth, tools, cron, providers)
        ├─ [L2] seed-agent-workspaces.js  (filesystem: 7 files × 8 agents, force-overwrite)
        ├─ [L3] exec openclaw.mjs gateway (OpenClaw starts, ~50s to healthy)
        └─ [L4] background (45s delay):
              seed-via-rpc.js  → pushes files via agents.files.set (operator-managed, won't be overwritten)
              auto-kickoff.js  → sends KICKOFF_MSG to lead + ops-lead via chat.send
                └─ [L5] Leads execute BOOTSTRAP.md:
                      Phase -1: Load context (AGENTS.md, TOOLS.md, MEMORY.md)
                      Phase 0:  Verify tools, log online, set up cron, message team with tasks
                      Phase 1:  Produce initial deliverable
                        └─ [L6] Autonomy loop (24/7, self-sustaining):
                              0 */2 * * * inbox-check cron → pick up tasks → execute → stage → confirm
                              0 */4 * * * heartbeat cron (leads) → check staging, poke silent agents
```

### Timing

| Event | Approx. Time |
|-------|-------------|
| Config patched + files seeded | +5s |
| OpenClaw healthy | +50-60s |
| RPC seed + kickoff sent | +60-70s |
| Leads bootstrapping | +65-75s |
| Team gets first tasks | +70-80s |
| First inbox-check fires | +5min |
| First deliverables staged | +10-15min |

### Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Agents never wake | Kickoff failed | Check logs for `[kickoff]`. Manual: message lead in MC chat. |
| Agents can't use tools | `tools.profile` not "full" | Check `[config-patch]` in logs |
| Stale workspace files | RPC seed failed | Check `[rpc-seed]` in logs. Restart OpenClaw. |
| Delegation dead | Inbox-check cron missing | Tell agent to run BOOTSTRAP.md |
| Compaction loop | threshold not set | Verify entrypoint sets softThresholdTokens=50000 |

### Why "Just Redeploy" Works

The entire chain is **idempotent**: config patching overwrites (not appends), workspace files force-overwrite, RPC seed marks files as operator-managed, kickoff runs fresh (no lock file), cron jobs persist across restarts. A redeploy = full re-initialization of the swarm.

**Full reference:** `/workspace/reference/startup-chain.md` (agents read this for deep context)

---

## File Structure

```
VPS/
├── CLAUDE.md                     ← This file
├── .env                          ← Secrets (NOT in git)
├── .env.example                  ← Template
├── Caddyfile                     ← Reverse proxy config
├── docker-compose.yml            ← 12 services (+ ollama optional profile)
├── litellm_config.yaml           ← 45+ model deployments, 8 tiers
├── scrapling/                    ← Web scraping sidecar
│   ├── Dockerfile                ← Python 3.12 + Scrapling + FastAPI
│   ├── api.py                    ← Scraping API endpoints
│   └── requirements.txt          ← scrapling[fetchers], fastapi, uvicorn
├── searxng/                      ← Meta-search engine for agents
│   └── settings.yml              ← SearXNG config (Google, Bing, DuckDuckGo, Wikipedia)
├── webhook/                      ← External workflow trigger handler
│   ├── Dockerfile                ← Node.js 20 Alpine + ws
│   ├── handler.js                ← HTTP server: trigger, register, revoke, list
│   ├── package.json              ← Dependencies (ws)
│   └── archive-server.js         ← Oracle ARM archive receiver (deploy separately)
├── workspace/                    ← Mission Control SPA
│   ├── index.html                ← Main SPA (2360+ lines, dashboard overhaul)
│   ├── auth.html                 ← Site login page
│   ├── openclaw-auth.html        ← OpenClaw login page
│   ├── prompts.html              ← Prompt library (starter prompts + archive)
│   ├── deployment-guide.html     ← Deployment guide (mobile-friendly)
│   ├── manifest.json             ← PWA manifest
│   ├── css/styles.css            ← Custom styles
│   ├── js/
│   │   ├── app.js                ← Alpine stores + chat (governance/workflows moved to Paperclip)
│   │   └── openclaw-client.js    ← OpenClaw WS RPC client
│   └── reference/                ← Split reference docs (generated by deploy)
│       ├── index.md              ← Reference doc index
│       ├── infrastructure.md     ← docker-compose, Caddyfile, deploy.sh
│       ├── models.md             ← litellm_config.yaml
│       ├── agents.md             ← Entrypoint, config patcher, workspace seeder, kickoff
│       ├── frontend.md           ← Mission Control architecture summary
│       ├── scraping.md           ← Scrapling API source
│       └── project-overview.md   ← Full CLAUDE.md
└── scripts/
    ├── deploy.sh                 ← Stack deployment (runs generate-reference-docs.sh)
    ├── setup-server.sh           ← Server hardening
    ├── setup-ollama-server.sh    ← Oracle Ollama setup
    ├── openclaw-entrypoint.sh    ← OpenClaw container startup (runs patch + seed)
    ├── patch-openclaw-config.js  ← Patches openclaw.json (gateway, models, tools, cron)
    ├── seed-agent-workspaces.js  ← Seeds 7 workspace files per agent (SOUL, TOOLS, etc.)
    ├── auto-kickoff.js           ← Sends bootstrap directive to leads on restart
    ├── seed-via-rpc.js           ← Pushes workspace files via RPC (operator-managed)
    ├── generate-reference-docs.sh ← Generates split reference docs for agents
    ├── generate-openclaw-reference.sh ← Generates OpenClaw-specific reference
    ├── caddy-entrypoint.sh       ← Auth token generation
    ├── setup-webhook-archive.sh  ← Oracle ARM archive server setup
    ├── setup-paperclip.js        ← Registers agents in Paperclip on startup
    ├── agent-test-harness.js     ← Agent testing framework
    ├── evolve-prompts.js         ← Prompt evolution/optimization
    ├── oracle-bridge.sh          ← Oracle Cloud bridge utilities
    ├── provision-oracle-arm.sh   ← Oracle ARM provisioning
    ├── provision-oracle-arm-2.sh ← Oracle ARM provisioning (alt)
    ├── provision-oracle-ollama.sh ← Oracle Ollama provisioning
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
| `DB_PASSWORD` | PostgreSQL for LiteLLM |
| `WEBHOOK_ARCHIVE_URL` | Oracle ARM archive endpoint (optional, e.g. `http://150.136.153.194:9091`) |
| `WEBHOOK_ARCHIVE_TOKEN` | Bearer token for archive auth |
| `COMPOSE_PROJECT_NAME` | ai-hub |
| `OPENCLAW_AUTO_KICKOFF` | `1` (default) — sends bootstrap directive to leads on restart. Set `0` to disable. |
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

## Webhook Handler — External Workflow Triggers (added 2026-03-14)

**Purpose:** Receives POST requests from external services (GitHub, Stripe, Discord, etc.) and triggers workflow execution. Runs as a separate Docker service proxied through Caddy.

**Endpoints (via Caddy at `/api/webhook/*`):**
- `POST /api/webhook/trigger/{workflowId}?token=xxx` — Public, per-webhook token auth
- `POST /api/webhook/register` — Register webhook, returns secret URL (site-auth)
- `DELETE /api/webhook/revoke/{workflowId}` — Revoke webhook (site-auth)
- `GET /api/webhook/list` — List registered webhooks (site-auth)
- `GET /api/webhook/health` — Health check

**Trigger flow:**
1. External service POSTs to `/api/webhook/trigger/{wfId}?token={secret}`
2. Handler validates token against `webhook-registry.json`
3. Writes trigger file to `/workspace/webhook-triggers/{triggerId}.json`
4. Updates index (polled by Mission Control's workflow bridge every 15s)
5. Best-effort: connects to OpenClaw WS, sends `WEBHOOK_TRIGGER:{wfId}` to Lead agent
6. MC executes workflow client-side OR Lead executes server-side — whichever fires first

**Oracle ARM Payload Archive (optional):**
- Set `WEBHOOK_ARCHIVE_URL` + `WEBHOOK_ARCHIVE_TOKEN` in `.env` to offload processed triggers
- Handler archives triggers older than 30 min to Oracle ARM, deletes local files
- Without archive URL: local trigger files are cleaned up after 30 min (index entries preserved)
- Archive server setup: `bash scripts/setup-webhook-archive.sh` on Oracle ARM
- Archive stores up to 5 GB organized by date, auto-cleans oldest when full

**Docker:** `webhook` service, 64M memory, port 9090 (internal), healthcheck via wget.

**Files:** `webhook/handler.js`, `webhook/Dockerfile`, `webhook/package.json`, `webhook/archive-server.js`, `scripts/setup-webhook-archive.sh`

---

## SearXNG — Meta-Search Engine for Agents (added 2026-04)

**Purpose:** Privacy-respecting meta-search engine aggregating Google, Bing, DuckDuckGo, and Wikipedia. Provides JSON API for agent web searches without requiring external API keys.

**Internal only** — no external ports, only accessible on Docker network at `http://searxng:8080`.

**Agent usage:** `exec wget -qO- 'http://searxng:8080/search?q=your+query&format=json'`

**Docker:** `searxng` service, 256M memory, healthcheck via `/healthz`.

**Files:** `searxng/settings.yml`

---

## Paperclip — Agent Orchestration Layer (added 2026-03-16)

**Purpose:** Replaces custom governance, workflow, and orchestration code with Paperclip as the management layer. OpenClaw remains the agent runtime, Paperclip manages the org chart, budgets, goals, task queues, and audit trails.

**Access:** `https://in-fused.org/paperclip/` (cookie-gated via Caddy)

**Architecture:**
```
Owner → Paperclip (orchestration, goals, budgets) → OpenClaw (agent runtime, tools, memory)
                                                   → LiteLLM (model routing)
                                                   → Scrapling (web scraping)
```

**Docker:** `paperclip` service (built from source, v0.3.1, port 3100, 256M) + `paperclip-db` (Postgres 17, 128M)

**Integration with OpenClaw:**
- Each agent registered in Paperclip with `openclaw_gateway` adapter
- Adapter connects via WebSocket to `ws://openclaw:18789`
- Paperclip sends heartbeats → OpenClaw agents wake, check task queue, execute, report back
- Session key strategy: `issue` (one session per task)
- Auth via `OPENCLAW_PASSWORD` as gateway token

**Setup script:** `scripts/setup-paperclip.js` runs on every restart (60s delay, non-blocking):
1. Waits for Paperclip health
2. Creates "in-fused.org" company if missing
3. Registers all 8 agents with openclaw_gateway adapter
4. Creates initial goals
- Idempotent — skips existing resources

**Known issues:**
- `openclaw_gateway` adapter token bug ([#44493](https://github.com/openclaw/openclaw/issues/44493)): `x-openclaw-token` header may not auto-populate during "Hire Agent" flow. Workaround: patch via SQL after agent creation.
- Paperclip needs initial onboarding via the web UI before the API accepts requests. If setup-paperclip.js logs "needs initial onboarding", visit `/paperclip/` to complete setup.

**What Paperclip replaces:**
| Old (custom code) | New (Paperclip) |
|---|---|
| `AGENT_ORG`, `AGENT_GOVERNANCE` constants in app.js | Paperclip org chart + budget controls |
| Governance Alpine.js store (~540 lines) | Paperclip audit trail + agent scores |
| LiteGraph workflow engine (workflow.js, 1274 lines) | Paperclip task queues + goal hierarchy |
| Workflow bridge (workflow-bridge.js, 530 lines) | Paperclip agent heartbeats |
| Custom auto-kickoff (auto-kickoff.js) | Paperclip heartbeat wakeups (kept as fallback) |
| Custom inbox-check cron | Paperclip periodic heartbeats (kept as fallback) |
| DEMO_AGENTS systemPrompts (~180 lines each) | Minimal fallback prompts (1 line each) |

**What was kept:**
- OpenClaw as agent runtime (tools, memory, sessions, cron)
- LiteLLM for multi-provider model routing
- Caddy for auth/proxy/HTTPS
- Scrapling for web scraping
- Webhook handler for external triggers
- Chat system (3-tier fallback: OpenClaw WS → LiteLLM SSE → demo)
- All protected fixes (auth handshake, streaming, config guards, message filtering)
- `seed-agent-workspaces.js` (still needed for OpenClaw workspace files)
- `seed-via-rpc.js` (still needed for RPC file push)
- `auto-kickoff.js` (kept as fallback until Paperclip heartbeats verified)
- `patch-openclaw-config.js` (still needed for gateway/auth/tools/cron config)

**Env vars:** `PAPERCLIP_DB_PASSWORD` (auto-generated), `BETTER_AUTH_SECRET` (auto-generated)

**Files:** `paperclip/Dockerfile`, `scripts/setup-paperclip.js`

---

## OpenClaw V3 Compatibility (verified 2026-04-10, pinned to v2026.4.1)

**Key changes in v2026.3.1 / v2026.3.2 and how we handle them (protections still active in v2026.4.1):**

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
- OpenClaw is now pinned to `v2026.4.1` (no longer floating on `:main`). Watchtower auto-updates daily at 4 AM UTC (label-filtered to OpenClaw only).

---

## Resolved Issues (Brief Reference)

These are solved — do not re-investigate or re-fix. Critical fixes are also listed in **"Protected Fixes"** (above) with explicit DO NOT REMOVE warnings:

- **OpenClaw OOM crashes**: Fixed via `--max-old-space-size=1024` + `OPENCLAW_NODE_OPTIONS_READY=1` + 1536M container limit + t3.small upgrade
- **OpenClaw networking**: Bind "lan" not "localhost", basePath `/openclaw/`, trustedProxies for Docker subnets, device auth disabled, separate WS matchers in Caddy
- **Provider fallback to anthropic**: Fixed by setting `agents.defaults.models = { litellm: {} }` (allowlist)
- **Auth popup in browser**: Fixed by using direct header comparison instead of Caddy `basicauth` directive
- **iOS touch/mobile**: Fixed with custom touch-to-mouse bridge, visibility change handler, PWA manifest, viewport-fit
- **deploy.sh pull failures**: Explicitly lists pullable services (`caddy litellm litellm-db openclaw`)
- **OpenClaw config crash loops**: Entrypoint cleans all invalid keys (see "Config Validation" section above)
- **Duplicate WebSocket events on re-login**: `disconnect()` clears all handlers, `_mcEventsRegistered` guard
- **WebSocket handshake (device identity mismatch / client.id / password missing / auth.mode)**: Fixed by removing dummy device block, using valid `client.id: 'webchat'`, sending password in both `auth.token` + `auth.password`, omitting `auth.mode`. See "Auth Handshake" section above.
- **Heartbeat/system messages leaking into chat**: Fixed with 11 regex patterns + label filter in both `_parseHistoryMessages` (history load) and `on('chat')` (live events). Heartbeat/cron sessions filtered from `_syncSessionsFromOpenClaw()`. Patterns match `# HEARTBEAT.md`, `# Heartbeat Checklist`, `HEARTBEAT_OK`, `# Bootstrap`, `Current time:`, all bridge/workflow/staging injections, and any message with heartbeat/cron/system/bridge/staging label.
- **Oracle ARM networking blocked by second instance**: Creating a second Oracle Cloud instance (even within free tier) triggered networking restrictions on both instances. Fixed by terminating the smaller instance — only need one instance (4 OCPU / 24 GB) for all 3 Ollama models.
- **Ollama end-to-end routing verified (2026-03-08)**: LiteLLM → Ollama (Oracle ARM at 150.136.153.194:11434) → qwen3.5:9b confirmed working. All 3 models loaded: qwen3-coder:30b (18.6 GB), qwen3:14b (9.3 GB), qwen3.5:9b (6.6 GB).
- **Workflow system replaced by Paperclip (2026-03-16)**: Custom LiteGraph workflow system (workflow.js, workflow-bridge.js) removed. Workflows, governance, and orchestration now handled by Paperclip.
- **Agent delegation chain broken (2026-03-08)**: Messages sent via `sessions_send` sat unread because agents had no wake trigger. Fixed by adding inbox-check cron (`0 */2 * * *`) to every agent's BOOTSTRAP.md. All agents now check for and process delegated tasks every 2 hours. Cron dedup guards prevent stacking on restart.
- **Auto-kickoff one-shot (2026-03-08)**: Lock file prevented re-kickoff after first container run. Removed lock file entirely — now runs fresh bootstrap directive on every restart. Changed from opt-in (`OPENCLAW_AUTO_KICKOFF=0`) to opt-out (`=1` default).
- **Agents saying "I cannot" (2026-03-08)**: Systematic prompt overhaul — added "NEVER say I cannot" rules to every SOUL.md with explicit forbidden phrases list. TOOLS.md has "RULE #1: ACT, DON'T ASK" section. Agents now default to action instead of asking for permission.
- **607KB project bundle too large (2026-03-08)**: Replaced monolithic project-bundle.md with `generate-reference-docs.sh` that creates 6 focused files (3KB–53KB each) under `/workspace/reference/`. Old script and bundle file deleted.

---

## Reference Documentation (for agents)

`scripts/generate-reference-docs.sh` runs during deploy and creates focused reference files under `/workspace/reference/`. Agents read these on-demand for deep context instead of loading a 607KB monolith.

| File | Source | Size | When to Read |
|------|--------|------|--------------|
| `infrastructure.md` | docker-compose.yml, Caddyfile, deploy.sh | ~35KB | Modifying services, routing, deploys |
| `models.md` | litellm_config.yaml | ~17KB | Understanding model tiers, rate limits |
| `agents.md` | Entrypoint, config patcher, workspace seeder, kickoff | ~79KB | Agent config, startup sequence |
| `frontend.md` | Hand-written summary | ~3KB | Understanding the UI, stores, views |
| `scraping.md` | scrapling/api.py | ~7KB | Web scraping capabilities |
| `project-overview.md` | CLAUDE.md | ~53KB | High-level architecture, resolved issues |
| `index.md` | — | ~1KB | Index of all reference files |

**Agent access:** `read(path: "/workspace/reference/infrastructure.md")`
**URL access:** `https://in-fused.org/workspace/reference/infrastructure.md` (requires auth)

**Note:** The old monolithic `workspace/project-bundle.md` (607KB) and `scripts/generate-project-bundle.sh` have been removed. Reference docs are now the sole source.

---

## OpenClaw Deep Reference (researched 2026-03-02)

### Version Info
OpenClaw is pinned to `v2026.4.1` in docker-compose.yml. LiteLLM is pinned to `v1.82.3-stable.patch.2`. Watchtower monitors for OpenClaw updates daily at 4 AM UTC (label-filtered). The v2026.2.26 `device-required` issue ([#30092](https://github.com/openclaw/openclaw/issues/30092)) is resolved in v2026.4.1 — our `allowInsecureAuth` + `dangerouslyDisableDeviceAuth` protections remain active.

### Entrypoint Config Additions (2026-03-03)
- `cron.enabled = true` + `cron.maxConcurrentRuns = 1` — agents can create server-side scheduled jobs via the `cron` tool
- `tools.sessions.visibility = 'all'` — agents can see each other's sessions for team coordination
- `tools.profile = 'full'` — ensures coding tools (exec, read, write, edit) are available. v2026.3.2 changed default to "messaging" which excludes these
- `compaction.memoryFlush.softThresholdTokens = 50000` — prevents aggressive compaction loop (v2026.3.1 regression #32106)
- `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1` — env var in docker-compose, allows plaintext `ws://` on Docker bridge (v2026.3.2 restricted to loopback)
- Ollama models updated: `qwen3.5:9b`, `qwen3:14b`, `qwen3-coder:30b` (replaced outdated qwen2.5-coder, deepseek-coder-v2, llama3.2)
- `update.channel = 'stable'` + `update.auto.enabled = true` — in-app auto-updater on stable channel (separate from Docker image tags, available since v2026.2.22)
- **Server-side workspace files** — `seed-agent-workspaces.js` creates SOUL.md, USER.md, AGENTS.md, MEMORY.md, TOOLS.md, HEARTBEAT.md, BOOTSTRAP.md per agent (force-overwritten on every restart)
- **Auto-kickoff** — `auto-kickoff.js` sends bootstrap directive to Lead and Ops Lead after 30s delay. Enabled by default (`OPENCLAW_AUTO_KICKOFF=1`). No lock file — runs fresh on every restart.
- **Inbox-check cron** — All agents create `0 */2 * * *` cron job on bootstrap (every 2h) to check for delegated tasks. Dedup guards prevent stacking. Critical for agent-to-agent delegation.
- **Collaboration protocol** — All agents can co-author via `sessions_send`. Cross-team collaboration encouraged.
- **Split reference docs** — `generate-reference-docs.sh` creates 6 focused files under `/workspace/reference/` for on-demand agent context

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

**Seeded files (force-overwritten on every restart):** `SOUL.md`, `USER.md`, `AGENTS.md`, `MEMORY.md`, `TOOLS.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`
**Also valid but not seeded:** `IDENTITY.md` (agents can create this themselves)
**Never touched:** `memory/*.md` — agents write persistent daily logs here

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
rm -f /home/node/.openclaw/workspace-Lead/{SOUL,USER,AGENTS,MEMORY,TOOLS,HEARTBEAT,BOOTSTRAP}.md
# Then restart OpenClaw — entrypoint will re-seed all 7 files
```
