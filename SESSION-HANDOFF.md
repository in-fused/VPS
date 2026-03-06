# Session Handoff: Debugging to Deployment (2026-03-01 to 2026-03-06)

> **Purpose:** Complete record of every issue found, root cause identified, and fix applied — so the next session can skip straight to post-deployment multi-agent streamlining without re-discovering any of this.

---

## TL;DR — What Made It All Work

The system is now **fully deployed and functional**. Here is the exact combination of fixes that got everything working end-to-end:

1. **WebSocket auth handshake** — No `auth.mode`, no `device` block, `client.id: 'webchat'`, password in both `auth.token` AND `auth.password`
2. **OpenClaw provider format** — `api: 'openai-completions'` (not `'openai'`)
3. **Model strategy** — Cerebras Llama 3.3 70B (Lead/CodeCraft/OpsLead), Gemini (Scout/Builder/Scribe/Chronicler), Cerebras Llama 4 Scout (Sentinel/subagents)
4. **Force-overwrite SOUL.md/BOOTSTRAP.md** on every restart (OpenClaw replaces them with generic defaults)
5. **`tools.profile = 'full'`** explicitly set (v2026.3.2 changed default to 'messaging')
6. **`OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1`** for Docker bridge WebSocket
7. **`chown -R 1000:1000`** on all workspace bridge directories (agents run as UID 1000)
8. **Rate limit cascade**: Route 1 retry (8s) -> Route 1 re-send -> Route 2 (direct LiteLLM, tools stripped from prompt)
9. **Tool-only turns**: `_parseHistoryMessages` on full server history instead of `extractMessageText` on streaming deltas
10. **`write` tool, never `exec echo`** — shell quoting breaks on apostrophes in agent-generated content

---

## Issue-by-Issue Log (Chronological)

### Phase 1: Initial Deployment & Auth (Mar 1-2)

#### Issue: OpenClaw WebSocket 1008 "device identity mismatch"
- **Symptom:** WebSocket connects TCP but immediately closes with code 1008
- **Root cause:** Sending a `device` block with dummy crypto values. OpenClaw validates device identity against stored keys — random values always fail.
- **Fix:** Remove the entire `device` block from the handshake. Set `dangerouslyDisableDeviceAuth=true` AND `allowInsecureAuth=true` in the entrypoint. Both are required — `allowInsecureAuth` handles Docker/reverse-proxy connections from trustedProxies.
- **File:** `workspace/js/openclaw-client.js` `_sendHandshake()` (line ~430)

#### Issue: OpenClaw WebSocket 1008 "unexpected property: mode"
- **Symptom:** After removing device block, still getting 1008
- **Root cause:** `auth.mode` field. OpenClaw's `ConnectParamsSchema` has `additionalProperties: false` on the `auth` object — only `token`, `password`, and `deviceToken` are accepted.
- **Fix:** Remove `auth.mode` entirely. Keep `auth.token` and `auth.password` both set to the raw password.
- **File:** `workspace/js/openclaw-client.js` `_sendHandshake()`

#### Issue: OpenClaw WebSocket 1008 "invalid client id"
- **Symptom:** After auth fix, still 1008 on a different field
- **Root cause:** `client.id` was set to an arbitrary string. Must be one of the schema-allowed values.
- **Fix:** `client.id = 'webchat'`, `client.mode = 'webchat'`
- **Verified working schema (DO NOT CHANGE):**
```javascript
{
  type: 'req', method: 'connect',
  params: {
    minProtocol: 3, maxProtocol: 3,
    auth: { token: pw, password: pw },
    role: 'operator',
    scopes: ['operator.read', 'operator.write', 'operator.admin', 'operator.approvals', 'operator.pairing'],
    client: { id: 'webchat', version: '1.0.0', platform: 'web', mode: 'webchat' },
  }
}
```

#### Issue: OpenClaw config crash loops
- **Symptom:** OpenClaw container restart loops, exits with config validation error
- **Root cause:** Invalid config keys that strict schema validation rejects: `identity.description`, `subagents.maxDepth`, `subagents.maxConcurrent`, `tools.agentToAgent.maxPingPongTurns`, `contextPruning`, `memorySearch`, `experimental`, `gateway.trustProxy`, provider `supportsDeveloperRole`/`supportsReasoningEffort`
- **Fix:** Entrypoint deletes all invalid keys on every startup. Clean list in `openclaw-entrypoint.sh` lines 304-314.

#### Issue: Provider fallback to Anthropic
- **Symptom:** Agents making direct Anthropic API calls instead of going through LiteLLM
- **Root cause:** OpenClaw has a hardcoded DEFAULT_PROVIDER of 'anthropic'. Without an explicit allowlist, subagents fall back to it.
- **Fix:** `config.agents.defaults.models = { litellm: {} }` — allowlist restricts to our custom provider only.
- **File:** `scripts/openclaw-entrypoint.sh` line 110

### Phase 2: Chat Pipeline & Rate Limits (Mar 2-4)

#### Issue: Chat messages appearing as raw JSON / tool payloads in UI
- **Symptom:** User sees `{"type":"tool_use","id":"...","name":"exec",...}` instead of agent's text response
- **Root cause:** OpenClaw v3 event format wraps content in complex structures. `extractMessageText()` wasn't handling `content_block` arrays with `tool_use`/`tool_result` types.
- **Fix:** `extractMessageText()` now filters out `tool_use` and `tool_result` content blocks, only extracting `text` type blocks. Also skips `tool` role messages in `_parseHistoryMessages`.
- **File:** `workspace/js/app.js` `extractMessageText()` (line ~491)

#### Issue: Rate limit errors killing chat stream
- **Symptom:** Agent hits 429 from Groq/Cerebras, entire chat shows error, no recovery
- **Root cause:** First-hit rate limit errors were treated as terminal. LiteLLM's server-side fallback chain needs time to cascade (Groq -> Cerebras -> DeepSeek).
- **Fix:** Multi-stage recovery:
  1. First rate limit: wait 8s (give LiteLLM time to cascade to next provider)
  2. Second rate limit: Route 1 retry (re-send via OpenClaw WS — fresh LiteLLM request hits different provider)
  3. Third+ rate limit: Route 2 fallback (direct LiteLLM POST, no tools, model rotation)
- **File:** `workspace/js/app.js` error handler in sessions store (line ~1481+), `_retryRoute1()` (line ~1850), `_fallbackRoute2()` (line ~1891)

#### Issue: LiteLLM fallback chain not triggering on 429
- **Symptom:** Rate limit hits but LiteLLM doesn't cascade to next provider
- **Root cause:** `router_settings.num_retries: 0` and `RateLimitErrorRetries: 0` prevented any retry, so fallbacks never activated.
- **Fix:** `num_retries: 1`, `RateLimitErrorRetries: 2`, `retry_after: 1`
- **File:** `litellm_config.yaml` router_settings (line ~423-433)

#### Issue: Rate-limit retry response silently lost
- **Symptom:** After recovery wait, agent's response from the fallback provider never appears
- **Root cause:** The competing run bug — rate limit retry creates a new `chat.send` which gets a new `runId`. The event handler was filtering by the original `runId` and dropping the retry's response.
- **Fix:** Track `_activeRunId` and update it when a retry succeeds. Event handler accepts events matching ANY active run.
- **File:** `workspace/js/app.js` sessions store

#### Issue: Duplicate WebSocket events after re-login
- **Symptom:** Messages appear twice, phantom events fire
- **Root cause:** `disconnect()` wasn't clearing event handlers. Each login added new handlers on top of old ones.
- **Fix:** `this._eventHandlers.clear()` in `disconnect()`. Added `_mcEventsRegistered` guard.
- **File:** `workspace/js/openclaw-client.js` `disconnect()` (line ~240)

#### Issue: Double boot / orphaned WebSocket connections
- **Symptom:** Two WebSocket connections competing, messages going to wrong one
- **Root cause:** `boot()` could be called multiple times (Alpine init + visibility change), each creating a new WebSocket without closing the previous one.
- **Fix:** `connect()` now explicitly closes any existing WebSocket before opening a new one. Cancels pending reconnect timers.
- **File:** `workspace/js/openclaw-client.js` `connect()` (line ~91)

### Phase 3: Model Strategy Evolution (Mar 3-6)

This was the most iterative debugging area. Models kept breaking (providers dropping support, rate limits, 404s). Here's the final state and why:

#### Timeline of model changes:
1. **Initial:** All agents on `groq-llama-3.3-70b` (started with 2 accounts, now 4)
2. **Mar 3:** Cerebras dropped `qwen3-32b` -> migrated to `groq-qwen3-32b`
3. **Mar 3:** Added Cerebras, Gemini (3 keys), Mistral providers
4. **Mar 4:** Switched to "free-first" strategy spreading across providers
5. **Mar 4:** Tried deepseek-chat for tool calling (paid, abandoned)
6. **Mar 5:** Cerebras `llama-3.3-70b` returned 404 -> emergency switch to Groq (4 accounts)
7. **Mar 5:** Groq giving continuous API errors -> switched to Gemini-first
8. **Mar 5:** Rebalanced to Cerebras-primary (Scout research confirmed Cerebras most reliable)
9. **Mar 5:** cerebras-zai-glm rate-limits on first request -> demoted to fallback
10. **Mar 6:** cerebras-gpt-oss-120b and cerebras-llama-3.1-8b have 8192 context (below OpenClaw 16K min) -> replaced

#### Final working model assignments (2026-03-06):
| Agent | Model | Provider | Why |
|-------|-------|----------|-----|
| Lead | cerebras-llama-3.3-70b | Cerebras | Proven reliable, 128K context, strong reasoning |
| CodeCraft | cerebras-llama-3.3-70b | Cerebras | Same — needs reliable tool calling |
| Scout | gemini-pro | Gemini (3 keys) | 1M context for research, 300 RPD |
| Scribe | gemini-flash-lite | Gemini (3 keys) | High volume docs, 3000 RPD |
| Ops Lead | cerebras-llama-3.3-70b | Cerebras | Same reliability needs as Lead |
| Builder | gemini-flash | Gemini (3 keys) | Good infra reasoning, 750 RPD |
| Sentinel | cerebras-llama-4-scout | Cerebras | Lighter tasks, sufficient |
| Chronicler | gemini-flash-lite | Gemini (3 keys) | High volume docs |
| Subagents (all) | cerebras-llama-4-scout | Cerebras | Fastest free for burst spawns |
| Default | cerebras-llama-4-scout | Cerebras | Fallback for new agents |

#### Key constraint: OpenClaw minimum 16K context window
Models with < 16K context (cerebras-llama-3.1-8b at 8192, cerebras-gpt-oss-120b at 8192) cause errors when OpenClaw tries to build the agent prompt. These models are still in LiteLLM for direct use but cannot be assigned as agent primaries.

### Phase 4: Agent Identity & Workspace Files (Mar 4-6)

#### Issue: Agents losing identity on restart
- **Symptom:** Lead goes through generic "who am I?" onboarding instead of knowing its role
- **Root cause:** OpenClaw creates its own default `SOUL.md` and `BOOTSTRAP.md` during agent initialization. Our seeder runs first, but OpenClaw overwrites the files 10-20s later.
- **Fix:** Two-part:
  1. `SOUL.md` and `BOOTSTRAP.md` are now in the `FORCE_OVERWRITE` set — always written, not just if missing
  2. Seeder runs twice: once before OpenClaw starts, once 30s after (background `sleep 30 && node seed...`)
- **File:** `scripts/seed-agent-workspaces.js` (line ~624-626), `scripts/openclaw-entrypoint.sh` (line ~370)

#### Issue: Agents can't write to bridge directories (EACCES)
- **Symptom:** Agents try to write to `/workspace/agent-activity/log.json` and get permission denied
- **Root cause:** `workspace-init` runs as root, creating directories owned by root. OpenClaw agents run as `node` (UID 1000).
- **Fix:** Added `chown -R 1000:1000` on all bridge directories in the `workspace-init` command.
- **File:** `docker-compose.yml` workspace-init command (line ~298)

#### Issue: Agents using `exec echo` for file creation -> shell quoting errors
- **Symptom:** "Syntax error: Unterminated quoted string" when agents create files containing apostrophes
- **Root cause:** Agents defaulting to `exec echo '...'` or `exec cat <<EOF` patterns instead of using the `write` tool. Any content with `'` breaks shell quoting.
- **Fix:** Added CRITICAL guidance to `TOOLS.md` and `BOOTSTRAP.md`: "ALWAYS use the `write` tool for file creation, NEVER `exec echo`/`exec cat`"
- **File:** `scripts/seed-agent-workspaces.js` SHARED_TOOLS (line ~122-127), BOOTSTRAP templates

#### Issue: "No text response" for tool-only agent turns
- **Symptom:** Agent uses exec/write tools without producing text. Chat shows empty response, user must refresh.
- **Root cause:** Streaming deltas contain only `tool_use`/`tool_result` blocks which `extractMessageText` filters out. The fallback that checked the last assistant message in history used the same filter — still empty.
- **Fix:** Use full `_parseHistoryMessages()` (same parser as refresh/reconnect) which processes the complete server history where tool outputs appear as separate plain-text messages.
- **File:** `workspace/js/app.js` final-state handler (line ~1363-1377)

### Phase 5: Workflow & Bridge System (Mar 2-3)

#### Workflow persistence (Phase 1)
- Auto-save workflow graph state to localStorage on every change
- Linked workflow list items to actual saved graphs (no more hardcoded placeholders)
- Restore canvas state on navigation

#### Agent-Workflow Bridge (Phases 2-4)
- **Phase 2:** File-based sync via `/workspace/agent-workflows/`. Fixed chat pollution from WRITE_FILES commands.
- **Phase 3:** Real tool execution in Tool nodes. Loop node iteration with result accumulation.
- **Phase 4:** RPC-based bidirectional sync via `agents.files.set/get` — no chat pollution, cleaner than file injection.

### Phase 6: OpenClaw v3 Compatibility (Mar 3)

#### Issue: Agents lose exec/read/write/edit tools
- **Root cause:** v2026.3.2 changed `tools.profile` default from 'full' to 'messaging'
- **Fix:** Entrypoint explicitly sets `config.tools.profile = 'full'`

#### Issue: Docker bridge WebSocket connections refused
- **Root cause:** v2026.3.2 restricted plaintext `ws://` to loopback only. Docker bridge is private, not loopback.
- **Fix:** `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1` in docker-compose environment

#### Issue: Compaction loop (agents compact every 2-3 minutes)
- **Root cause:** v2026.3.1 regression (#32106) — `softThresholdTokens` defaults to 4000
- **Fix:** `config.agents.defaults.compaction.memoryFlush.softThresholdTokens = 50000`

---

## Current Working Architecture

```
Internet -> https://in-fused.org -> Caddy (auto-HTTPS + rate limiting)
  /auth/verify       -> Password check (header comparison, no popup)
  /api/mc/*          -> Cookie-gated -> LiteLLM :4000 (injects master key)
  /api/litellm/*     -> Cookie-gated -> LiteLLM :4000
  /openclaw/*        -> Cookie-gated -> OpenClaw :18789
  /ws/openclaw       -> WebSocket -> OpenClaw :18789 (Mission Control)
  / + WS upgrade     -> WebSocket -> OpenClaw :18789 (legacy Control UI)
  /workspace/*       -> Cookie-gated -> Static files (agent-workspace volume)
  / (everything else)-> Cookie-gated -> Open WebUI :8080

OpenClaw -> LiteLLM -> 6 free providers (Groq x4, Cerebras, Gemini x3, Mistral, Ollama) + paid fallbacks
```

### Chat Pipeline — 3-Tier Fallback (VERIFIED WORKING)
1. **Route 1: OpenClaw WebSocket** — Full agent execution with tools, memory, sub-agents
2. **Route 1 Retry** — Re-send via OpenClaw after rate limit (8s wait, then re-send for fresh LiteLLM provider selection)
3. **Route 2: Direct LiteLLM SSE** — `POST /api/mc/v1/chat/completions` with stream:true, tool instructions stripped from prompt, model rotation across free providers
4. **Demo mode** — Static placeholder (no backend)

### Rate Limit Recovery Sequence
```
Agent hits 429 -> wait 8s (LiteLLM cascades: Groq->Cerebras->DeepSeek)
  -> still 429? -> Route 1 retry (new chat.send, fresh provider selection)
  -> still 429? -> Route 2 (direct LiteLLM, rotate through: gemini-flash, groq-llama-3.3-70b, deepseek-chat, cerebras-llama-3.3-70b)
  -> all fail? -> Terminal error shown to user
```

---

## File-by-File Change Summary

### `workspace/js/openclaw-client.js` (423 lines)
- Verified working WebSocket handshake (DO NOT CHANGE `_sendHandshake`)
- Auto-reconnect with exponential backoff (2s->30s)
- iOS visibility/pageshow/focus handlers for background recovery
- Keep-alive ping every 45s
- `disconnect()` clears all handlers (prevents duplication)
- Workflow bridge API: `syncWorkflowToAgent`, `syncWorkflowIndex`, `readAgentWorkflow`
- Cron job API: `listCronJobs`, `addCronJob`, `removeCronJob`, `runCronJob`

### `workspace/js/app.js` (~2811 lines)
- `extractMessageText()` — recursive content extractor, filters tool_use/tool_result blocks
- `_parseHistoryMessages()` — full server history parser, skips tool/system role messages
- Sessions store: streaming handler with delta accumulation, rate limit recovery (3-stage), Route 2 fallback
- Agent store: syncs to OpenClaw via WebSocket, localStorage fallback
- Governance store: per-agent scoring, team competition, lead promotion
- Staging store: polls `/workspace/staging/` for agent-produced content

### `scripts/openclaw-entrypoint.sh` (372 lines)
- Config patching: gateway, auth, provider, models, tools, cron, compaction, cleanup
- MODEL_MAP: forced model assignment on every restart (migrates from dead providers)
- Agent seeding: 8 agents across 2 teams
- Runs `seed-agent-workspaces.js` twice (before start + 30s delayed)

### `scripts/seed-agent-workspaces.js` (677 lines)
- SOUL.md per agent (identity, role, rules, protocols)
- Shared files: USER.md, AGENTS.md, MEMORY.md, TOOLS.md, HEARTBEAT.md, BOOTSTRAP.md
- WORKFLOWS.md for leads + codecraft (full LiteGraph JSON reference)
- FORCE_OVERWRITE set: SOUL.md, BOOTSTRAP.md always overwritten

### `litellm_config.yaml` (434 lines)
- 25+ models across 8 tiers
- Load balancing: Groq (4 keys), Gemini (3 keys)
- Fallback chains: every free model cascades through other free providers -> DeepSeek (paid last resort)
- `num_retries: 1`, `RateLimitErrorRetries: 2`, `cooldown_time: 60`

### `docker-compose.yml` (343 lines)
- 8 services + optional Ollama
- Key env vars: `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1`, `OPENCLAW_NODE_OPTIONS_READY=1`
- workspace-init: `chown -R 1000:1000` on bridge directories
- Memory limits: Caddy 64M, WebUI 768M, LiteLLM 512M, OpenClaw 1536M, Postgres 128M, Scrapling 512M

### `Caddyfile` (307 lines)
- Rate limiting on /auth/verify (5/min per IP)
- Security headers (HSTS, CSP, X-Frame-Options)
- WebSocket: `/ws/openclaw` (dedicated, no cookie — iOS Safari fix) + `/` root (legacy)
- `flush_interval -1` on ALL proxy handlers (critical for SSE/WS)

---

## What's Ready for Post-Deployment Multi-Agent Streamlining

### Working Now
- 8 agents across 2 teams, all with custom SOUL.md identities
- Agent-to-agent messaging via `sessions_send`
- Sub-agent spawning
- Server-side cron jobs (`cron.enabled = true`)
- Workspace file system (read/write/edit/exec tools)
- Activity logging protocol (agents know to write to log.json)
- Staging protocol (agents know to write deliverables for owner review)
- Workflow creation and bridge (agents can create LiteGraph JSON)
- 6 free LLM providers with automatic fallback chains
- Mission Control SPA (chat, workflows, teams, staging views)

### Needs Attention
1. **Agents don't consistently log activity** — despite MANDATORY directives in SOUL.md/BOOTSTRAP.md, agents sometimes skip the logging step. May need reinforcement in the first-message system prompt injection or a cron-based audit.
2. **Workflow execution results** — background workflow execution writes results but Mission Control doesn't have a polished results viewer yet.
3. **Cron jobs UI** — cron jobs can be created by agents but there's no UI in Mission Control to view/manage them (only via OpenClaw's native Control UI).
4. **Governance scoring** — the scoring system in app.js tracks metrics but isn't fully wired to OpenClaw's actual task completion data (uses manual `recordTask()` calls).
5. **Scheduled triggers** — cron is enabled server-side but Mission Control's workflow Trigger node doesn't wire to the cron RPC yet.
6. **Tool node** — sends natural language prompts, not real tool invocations. Functional but not optimal.
7. **Loop node** — splits input but doesn't iterate downstream subgraph per-item.

### Key Constraint: t3.small (2GB RAM + 4GB swap)
Total container allocation is ~3.3GB. Adding services or increasing memory limits requires the t3.medium upgrade ($37/month) or offloading to Oracle Cloud ARM.

---

## Quick Reference: Common Operations

### Deploy from current branch
```
cd /home/VPS && sudo git config --global --add safe.directory /home/VPS && sudo git pull origin claude/autonomous-agents-ios-uToqU && sudo bash scripts/deploy.sh
```

### Restart single service
```
cd /home/VPS && sudo docker compose restart openclaw
```

### View logs
```
cd /home/VPS && sudo docker compose logs --tail=50 openclaw
```

### Reset agent prompts (re-seed)
```
cd /home/VPS && sudo docker compose exec openclaw rm -f /home/node/.openclaw/workspace-Lead/SOUL.md /home/node/.openclaw/workspace-Lead/BOOTSTRAP.md && sudo docker compose restart openclaw
```

### Reset all OpenClaw data (nuclear)
```
cd /home/VPS && sudo docker compose rm -sf openclaw openclaw-init && sudo docker volume rm ai-hub_openclaw-data && sudo docker compose up -d openclaw
```

---

## Non-Obvious Gotchas (Save Future Sessions From These)

1. **Caddy `flush_interval -1`** — on EVERY proxy handler. Remove it and SSE/WS hangs indefinitely.
2. **WebSocket path stripping** — `/ws/openclaw` is stripped by Caddy, OpenClaw sees connection at `/`.
3. **Model aliases** — LiteLLM's `model_name` is the alias (e.g., `groq-llama-3.3-70b`), not the upstream ID (`groq/llama-3.3-70b-versatile`). All agent configs use aliases.
4. **`instructions` is NOT a valid OpenClaw agent key** — system prompts live in workspace files only.
5. **OpenClaw container has no curl** — use `wget` or `node -e "fetch(...)"`.
6. **workspace-init overwrites on every deploy** — edit files in the repo, not on the volume.
7. **DB_PASSWORD and LITELLM_SALT_KEY are immutable** after first run.
8. **OpenClaw depends on LiteLLM healthy** — if LiteLLM is down, OpenClaw won't start.
9. **iOS Safari doesn't send cookies with WebSocket upgrade** — that's why `/ws/openclaw` has no cookie check.
10. **`drop_params: true`** in LiteLLM silently swallows invalid params — can hide bugs.
