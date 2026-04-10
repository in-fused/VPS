# OpenClaw Config Schema Glossary
> Quick-reference for valid vs invalid config keys.
> Read this BEFORE proposing any config change.
> Last updated: 2026-03-12

---

## How to Use This Document

This glossary maps every config domain to its **valid keys** and lists **common hallucinations** — keys that sound plausible but DO NOT EXIST in the OpenClaw schema. Writing an invalid key to `openclaw.json` crashes OpenClaw instantly, killing every agent, cron job, and session.

**You cannot modify config directly** (the `gateway` tool is blocked). If you believe a config change would help, write a proposal to `/workspace/staging/` for owner review.

For the full schema with types and defaults, see [config.md](config.md).

---

## Domain Index

| Domain | Section | What It Controls |
|--------|---------|-----------------|
| `agents.defaults` | [agents.defaults](#agentsdefaults) | Default agent settings (model, compaction, tools, sandbox) |
| `agents.defaults.compaction` | [compaction](#agentsdefaultscompaction) | Memory compaction behavior |
| `agents.defaults.subagents` | [subagents](#agentsdefaultssubagents) | Sub-agent limits and behavior |
| `agents.defaults.memorySearch` | [memorySearch](#agentsdefaultsmemorySearch) | Embedding and memory search |
| `agents.list[]` | [per-agent](#agentslist-per-agent) | Individual agent identity, model, tools |
| `gateway` | [gateway](#gateway) | HTTP/WS server, auth, proxy, Control UI |
| `session` | [session](#session) | Session scope, reset, maintenance |
| `session.maintenance` | [maintenance](#sessionmaintenance) | Session pruning, disk limits |
| `tools` | [tools](#tools) | Tool profiles, permissions, exec, web |
| `cron` | [cron](#cron) | Scheduled job settings |
| `models.providers` | [providers](#modelsproviders) | LLM provider config |

---

## agents.defaults

| Key | Valid? | Notes |
|-----|--------|-------|
| `workspace` | YES | Working directory |
| `model.primary` | YES | Primary model ID |
| `model.fallbacks` | YES | Fallback model chain |
| `models` | YES | Provider allowlist (e.g. `{ litellm: {} }`) |
| `compaction` | YES | See [compaction section](#agentsdefaultscompaction) |
| `subagents` | YES | See [subagents section](#agentsdefaultssubagents) |
| `memorySearch` | YES | See [memorySearch section](#agentsdefaultsmemorySearch) |
| `tools` | YES | Default tool profile/restrictions |
| `sandbox` | YES | Sandbox mode/scope |
| `heartbeat` | YES | Heartbeat interval/prompt |
| `bootstrapMaxChars` | YES | Per-file truncation limit |
| `contextTokens` | YES | Context window size |
| `maxConcurrent` | YES | Max concurrent turns |
| `timeoutSeconds` | YES | Agent turn timeout |
| ~~`instructions`~~ | **NO** | Prompts live in workspace files (SOUL.md etc), NOT in config |
| ~~`systemPrompt`~~ | **NO** | Same — use workspace files |

---

## agents.defaults.compaction

| Key | Valid? | Notes |
|-----|--------|-------|
| `model` | YES | Model for compaction summarization |
| `reserveTokens` | YES | Tokens reserved for compaction output |
| `reserveTokensFloor` | YES | Min tokens after compaction (safety min: 20000) |
| `keepRecentTokens` | YES | Recent tokens to keep uncompacted |
| `memoryFlush.enabled` | YES | Enable memory flush on compaction |
| `memoryFlush.softThresholdTokens` | YES | Token count before flush triggers (we set 50000) |
| `memoryFlush.systemPrompt` | YES | Custom system prompt for flush |
| `memoryFlush.prompt` | YES | Custom prompt for flush |
| `identifierPolicy` | YES | `"strict"`, `"off"`, `"custom"` |
| `postCompactionSections` | YES | Sections re-injected after compaction |
| ~~`compactInterval`~~ | **NO** | Does not exist anywhere in the schema |
| ~~`autoCompact`~~ | **NO** | Does not exist — compaction is triggered by context overflow |
| ~~`autoCompactThreshold`~~ | **NO** | Feature request (#30411), not yet implemented |

**Where compaction lives:** `agents.defaults.compaction` — NOT at the top level, NOT under `session.maintenance`.

---

## agents.defaults.subagents

| Key | Valid? | Notes |
|-----|--------|-------|
| `model` | YES | Sub-agent model (inherits caller by default) |
| `thinking` | YES | Thinking mode |
| `maxConcurrent` | YES | Max concurrent sub-agents per agent |
| `runTimeoutSeconds` | YES | Execution timeout |
| `archiveAfterMinutes` | YES | Archive sub-agent session after N min |
| `allowAgents` | YES | Which agents can be spawned as sub-agents |
| `maxChildrenPerAgent` | YES | Max children per parent (range 1-20) |
| ~~`maxDepth`~~ | **NO** | Not valid under `tools.subagents` (only valid here) |

---

## agents.defaults.memorySearch

**IMPORTANT:** This MUST be nested under `agents.defaults`, NOT at the top level. A top-level `memorySearch` key is invalid.

| Key | Valid? | Notes |
|-----|--------|-------|
| `enabled` | YES | Enable memory search |
| `provider` | YES | `"local"`, `"openai"`, `"gemini"`, etc. |
| `model` | YES | Embedding model name |
| `remote.baseUrl` | YES | Custom endpoint URL |
| `remote.apiKey` | YES | API key |
| `sources` | YES | Search sources |
| `query.hybrid.enabled` | YES | Enable hybrid search |

---

## agents.list[] (per-agent)

| Key | Valid? | Notes |
|-----|--------|-------|
| `id` | YES | Stable unique ID |
| `name` | YES | Display name |
| `workspace` | YES | Agent-specific workspace dir |
| `model` | YES | `{ primary: 'model-id' }` format |
| `identity.name` | YES | Agent name |
| `identity.emoji` | YES | Emoji identifier |
| `identity.theme` | YES | Theme/personality |
| `identity.avatar` | YES | Avatar path/URL |
| `tools` | YES | Per-agent tool restrictions |
| `subagents` | YES | Sub-agent config |
| `params` | YES | `{ temperature, maxTokens, cacheRetention }` |
| ~~`instructions`~~ | **NO** | Prompts live in workspace files |
| ~~`identity.description`~~ | **NO** | Only name, emoji, theme, avatar are valid |
| ~~`identity.bio`~~ | **NO** | Not a valid identity key |
| ~~`identity.role`~~ | **NO** | Not a valid identity key |
| ~~`supportsDeveloperRole`~~ | **NO** | Not a valid key (causes crash) |
| ~~`supportsReasoningEffort`~~ | **NO** | Not a valid key (causes crash) |

---

## gateway

| Key | Valid? | Notes |
|-----|--------|-------|
| `gateway.port` | YES | HTTP/WS port |
| `gateway.bind` | YES | `"loopback"`, `"lan"`, `"auto"`, etc. |
| `gateway.basePath` | YES | URL base path |
| `gateway.trustedProxies` | YES | Array of CIDR strings |
| `gateway.auth.mode` | YES | `"token"`, `"password"`, `"none"` |
| `gateway.auth.password` | YES | Auth password |
| `gateway.auth.rateLimit.maxAttempts` | YES | Max auth attempts |
| `gateway.controlUi.enabled` | YES | Enable Control UI |
| `gateway.controlUi.dangerouslyDisableDeviceAuth` | YES | Skip device identity |
| `gateway.controlUi.allowInsecureAuth` | YES | Allow auth without challenge |
| ~~`gateway.trustProxy`~~ | **NO** | Use `gateway.trustedProxies` (plural, array) |
| ~~`gateway.rateLimit`~~ | **NO** | Rate limiting is under `gateway.auth.rateLimit` |

---

## session

| Key | Valid? | Notes |
|-----|--------|-------|
| `session.scope` | YES | `"per-sender"` etc. |
| `session.dmScope` | YES | `"main"`, `"per-peer"` etc. |
| `session.reset.mode` | YES | `"daily"`, `"idle"` |
| `session.agentToAgent.maxPingPongTurns` | YES | Max A2A ping-pong turns |

### session.maintenance

| Key | Valid? | Notes |
|-----|--------|-------|
| `mode` | YES | `"warn"` or `"enforce"` |
| `pruneAfter` | YES | Duration string (e.g. `"14d"`) |
| `maxEntries` | YES | Cap on session entries |
| `rotateBytes` | YES | Log rotation threshold |
| `resetArchiveRetention` | YES | How long to keep reset archives |
| `maxDiskBytes` | YES | Total disk budget for sessions dir |
| `highWaterBytes` | YES | Target after cleanup runs |
| ~~`compactInterval`~~ | **NO** | Compaction is under `agents.defaults.compaction`, not here |
| ~~`autoCompact`~~ | **NO** | Auto-compaction is runtime behavior, not configurable |
| ~~`orphanCleanup`~~ | **NO** | Does not exist in the schema |

---

## tools

| Key | Valid? | Notes |
|-----|--------|-------|
| `tools.profile` | YES | `"full"`, `"messaging"`, `"basic"`, `"minimal"` |
| `tools.allow` | YES | Global allow list |
| `tools.deny` | YES | Global deny list |
| `tools.elevated.enabled` | YES | Enable elevated tools |
| `tools.sessions.visibility` | YES | `"self"`, `"tree"`, `"agent"`, `"all"` |
| `tools.agentToAgent.enabled` | YES | Enable A2A messaging |
| `tools.agentToAgent.allow` | YES | Agent ID allowlist |
| `tools.exec.*` | YES | Exec timeout, security, safe bins |
| `tools.web.*` | YES | Web search/fetch config |
| `tools.loopDetection.*` | YES | Loop detection thresholds |
| ~~`tools.approval`~~ | **NO** | Not a valid key |
| ~~`tools.filesystem`~~ | **NO** | Not a valid key |
| ~~`tools.subagents.maxDepth`~~ | **NO** | Use `agents.defaults.subagents` |
| ~~`tools.agentToAgent.maxPingPongTurns`~~ | **NO** | Use `session.agentToAgent.maxPingPongTurns` |

---

## cron

| Key | Valid? | Notes |
|-----|--------|-------|
| `cron.enabled` | YES | Enable cron system |
| `cron.maxConcurrentRuns` | YES | Max concurrent executions |
| `cron.sessionRetention` | YES | Duration or `false` |
| `cron.retry.maxAttempts` | YES | Max retry attempts |
| `cron.webhook` | YES | Webhook URL for notifications |
| `cron.webhookToken` | YES | Webhook auth token |

---

## models.providers

| Key | Valid? | Notes |
|-----|--------|-------|
| `baseUrl` | YES | Provider API endpoint |
| `apiKey` | YES | API key |
| `auth` | YES | `"api-key"`, `"token"`, `"oauth"`, `"aws-sdk"` |
| `api` | YES | `"openai-completions"`, `"anthropic-messages"` |
| `headers` | YES | Custom headers |
| `models[]` | YES | Array of model definitions |
| ~~`supportsDeveloperRole`~~ | **NO** | Causes "unexpected property" crash |
| ~~`supportsReasoningEffort`~~ | **NO** | Causes "unexpected property" crash |

---

## Invalid Top-Level Keys (crash on startup)

These keys DO NOT belong at the root of `openclaw.json`:

| Key | Where It Actually Lives |
|-----|------------------------|
| ~~`compaction`~~ | `agents.defaults.compaction` |
| ~~`contextPruning`~~ | `agents.defaults.contextPruning` |
| ~~`memorySearch`~~ | `agents.defaults.memorySearch` |
| ~~`subagents`~~ | `agents.defaults.subagents` |
| ~~`experimental`~~ | Does not exist |

The config patcher (`patch-openclaw-config.js`) explicitly deletes these stray keys on every startup.

---

## What Happens When You Write an Invalid Key

```
1. Agent uses gateway config.patch to write { session: { maintenance: { compactInterval: 300 } } }
2. OpenClaw validates config → "unexpected property: compactInterval"
3. OpenClaw crashes immediately
4. ALL agents die (no graceful shutdown)
5. ALL cron jobs stop
6. ALL active chat sessions are lost
7. Owner must manually redeploy from phone (10-30 min recovery)
```

This is why the `gateway` tool is blocked for all agents and config changes go through Staging for owner review.
