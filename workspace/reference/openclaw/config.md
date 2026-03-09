# OpenClaw Configuration Reference
> Auto-generated from docs.openclaw.ai. Do not edit manually.
> Last updated: 2026-03-09

## Config File Location
`~/.openclaw/openclaw.json` (inside container: `/home/node/.openclaw/openclaw.json`)

---

## Root-Level Keys

| Key | Type | Description |
|-----|------|-------------|
| `agents` | object | Agent configuration (defaults + list) |
| `gateway` | object | HTTP/WS gateway settings |
| `channels` | object | External messaging channels (30+ providers) |
| `hooks` | object | Event-driven automation hooks |
| `cron` | object | Scheduled job configuration |
| `models` | object | Model providers and routing |
| `tools` | object | Tool access profiles and permissions |
| `session` | object | Session behavior defaults |
| `messages` | object | Message handling, queue, TTS |
| `talk` | object | Voice mode defaults |
| `skills` | object | Skill management |
| `plugins` | object | Plugin system |
| `browser` | object | Browser automation |
| `ui` | object | UI customization |
| `canvasHost` | object | Canvas hosting |
| `discovery` | object | Service discovery (mDNS) |
| `env` | object | Environment variables |
| `logging` | object | Log configuration |
| `update` | object | Auto-update configuration |
| `telemetry` | object | OTEL tracing configuration |

---

## agents

### agents.defaults

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `workspace` | string | `~/.openclaw/workspace` | Working directory |
| `repoRoot` | string | auto-detected | Repository root |
| `skipBootstrap` | boolean | `false` | Disable bootstrap file creation |
| `bootstrapMaxChars` | number | `20000` | Per-file truncation limit |
| `bootstrapTotalMaxChars` | number | `150000` | Total bootstrap cap |
| `bootstrapPromptTruncationWarning` | string | `"once"` | `"off"`, `"once"`, `"always"` |
| `imageMaxDimensionPx` | number | `1200` | Vision image scaling |
| `userTimezone` | string | host tz | Timezone |
| `timeFormat` | string | `"auto"` | `"auto"`, `"12"`, `"24"` |
| `model.primary` | string | `"anthropic/claude-opus-4-6"` | Primary model |
| `model.fallbacks` | array | — | Fallback model chain |
| `imageModel` | string/object | — | Image-specific model |
| `pdfModel` | string/object | — | PDF-specific model |
| `pdfMaxBytesMb` | number | `10` | PDF size limit |
| `pdfMaxPages` | number | `20` | PDF page limit |
| `thinkingDefault` | string | — | `"low"`, `"high"`, `"off"` |
| `verboseDefault` | string | `"off"` | Verbose mode |
| `elevatedDefault` | string | — | `"on"`, `"off"` |
| `timeoutSeconds` | number | `600` | Agent turn timeout |
| `mediaMaxMb` | number | `5` | Media upload limit |
| `contextTokens` | number | `200000` | Context window size |
| `maxConcurrent` | number | `3` | Max concurrent turns |
| `blockStreamingDefault` | string | `"off"` | `"off"`, `"on"` |
| `blockStreamingBreak` | string | `"text_end"` | `"text_end"`, `"message_end"` |
| `blockStreamingChunk` | object | — | `{ minChars, maxChars }` |
| `blockStreamingCoalesce` | object | — | `{ idleMs }` |
| `humanDelay` | string/object | `"off"` | `"off"`, `"natural"`, `{ minMs, maxMs }` |
| `typingMode` | string | — | `"never"`, `"instant"`, `"thinking"`, `"message"` |
| `typingIntervalSeconds` | number | `6` | Typing indicator interval |
| `models` | object | `{}` | Provider allowlist (e.g., `{ litellm: {} }`) |
| `tools` | object | `{}` | Default tool profile/restrictions |
| `compaction` | object | `{}` | Memory compaction settings |
| `subagents` | object | `{}` | Sub-agent defaults |
| `sandbox` | object | `{}` | Sandbox configuration |
| `heartbeat` | object | `{}` | Heartbeat settings |

### agents.defaults.compaction

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `model` | string | agent's primary | Compaction summarization model |
| `identifierPolicy` | string | `"strict"` | `"strict"`, `"off"`, `"custom"` |
| `identifierInstructions` | string | — | Custom identifier instructions |
| `reserveTokens` | number | `16384` | Tokens reserved for compaction output |
| `reserveTokensFloor` | number | `20000` | Minimum tokens to reserve after compaction |
| `keepRecentTokens` | number | `20000` | Recent tokens to keep uncompacted |
| `memoryFlush.enabled` | boolean | `true` | Enable memory flush on compaction |
| `memoryFlush.softThresholdTokens` | number | `4000` | Token threshold before compaction triggers |
| `memoryFlush.systemPrompt` | string | — | Custom system prompt for flush |
| `memoryFlush.prompt` | string | — | Custom prompt for flush |

### agents.defaults.subagents

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `model` | string | inherits caller | Sub-agent model |
| `thinking` | string | inherits caller | Thinking mode |
| `runTimeoutSeconds` | number | `0` (no timeout) | Execution timeout |
| `archiveAfterMinutes` | number | `60` | Archive sub-agent session after |
| `maxSpawnDepth` | number | `1` (range 1-5) | Max nesting depth |
| `maxChildrenPerAgent` | number | `5` (range 1-20) | Max children per parent |
| `maxConcurrent` | number | `8` | Max concurrent sub-agents |

### agents.defaults.sandbox

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `mode` | string | `"non-main"` | `"off"`, `"non-main"`, `"all"` |
| `scope` | string | `"session"` | `"session"`, `"agent"`, `"shared"` |
| `workspaceAccess` | string | `"none"` | `"none"`, `"ro"`, `"rw"` |
| `docker.image` | string | `openclaw-sandbox:bookworm-slim` | Sandbox Docker image |
| `docker.network` | string | `"none"` | Docker network |
| `docker.binds` | array | — | Volume binds |
| `docker.setupCommand` | string | — | Init command |
| `docker.env` | object | — | Environment variables |
| `docker.readOnlyRoot` | boolean | — | Read-only root filesystem |
| `docker.user` | string | — | Container user |

### agents.defaults.heartbeat

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `every` | duration | `"30m"` | Heartbeat interval |
| `model` | string | agent default | Model for heartbeat |
| `prompt` | string | — | Custom heartbeat prompt |
| `target` | string | `"none"` | `"last"`, `"none"`, channel ID |
| `session` | string | `"main"` | Target session |
| `lightContext` | boolean | `false` | Reduce context for heartbeat |
| `includeReasoning` | boolean | `false` | Include reasoning in output |
| `activeHours.start` | string | — | Active hours start |
| `activeHours.end` | string | — | Active hours end |
| `activeHours.timezone` | string | — | Active hours timezone |

### agents.list[]

Each agent in the `agents.list` array supports:

| Key | Type | Description |
|-----|------|-------------|
| `id` | string | Required, stable unique ID |
| `default` | boolean | Default agent flag |
| `name` | string | Display name |
| `workspace` | string | Agent-specific workspace directory |
| `agentDir` | string | Agent state directory |
| `model` | string/object | `{ primary: 'model-id' }` — per-agent model override |
| `params` | object | Per-agent LLM parameters |
| `identity.name` | string | Agent name |
| `identity.theme` | string | Theme/personality |
| `identity.emoji` | string | Emoji identifier |
| `identity.avatar` | string | Avatar path/URL |
| `tools` | object | Per-agent tool restrictions (see tools.md) |
| `subagents` | object | Sub-agent configuration |
| `sandbox` | object | Per-agent sandbox settings |
| `runtime` | object | `{ type: "acp", acp: {...} }` |
| `groupChat.mentionPatterns` | array | Mention triggers |
| `routing` | object | Message routing rules |

**Invalid agent keys (cause crash loops):**
- `instructions` — NOT valid (prompts live in workspace files)
- `identity.description` — only `name`, `emoji`, `theme`, `avatar` are valid identity keys
- `supportsDeveloperRole` — not a valid key
- `supportsReasoningEffort` — not a valid key

---

## gateway

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `gateway.mode` | string | `"local"` | Gateway mode |
| `gateway.port` | number | `18789` | HTTP/WS port |
| `gateway.bind` | string | `"loopback"` | `"loopback"`, `"auto"`, `"lan"`, `"tailnet"`, `"custom"` |
| `gateway.customBindHost` | string | — | Custom bind address |
| `gateway.trustedProxies` | string[] | `[]` | Trusted reverse proxy CIDRs |
| `gateway.allowRealIpFallback` | boolean | `false` | Allow X-Real-IP fallback |
| `gateway.reload.mode` | string | `"hybrid"` | `"hybrid"`, `"hot"`, `"restart"`, `"off"` |
| `gateway.reload.debounceMs` | number | — | Reload debounce |

### gateway.auth

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `auth.mode` | string | `"token"` | `"token"`, `"none"`, `"password"`, `"trusted-proxy"` |
| `auth.token` | string | — | Auth token |
| `auth.password` | string | — | Auth password (env: `OPENCLAW_GATEWAY_PASSWORD`) |
| `auth.allowTailscale` | boolean | `true` | Allow Tailscale auth |
| `auth.rateLimit.maxAttempts` | number | `10` | Max auth attempts |
| `auth.rateLimit.windowMs` | number | `60000` | Rate limit window |
| `auth.rateLimit.lockoutMs` | number | `300000` | Lockout duration |
| `auth.rateLimit.exemptLoopback` | boolean | `true` | Exempt loopback from rate limit |

### gateway.controlUi

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `controlUi.enabled` | boolean | `true` | Enable Control UI |
| `controlUi.basePath` | string | `"/openclaw"` | UI base path |
| `controlUi.allowedOrigins` | array | — | CORS allowed origins |
| `controlUi.allowInsecureAuth` | boolean | `false` | Allow auth without device challenge |
| `controlUi.dangerouslyDisableDeviceAuth` | boolean | `false` | Skip device identity verification |
| `controlUi.dangerouslyAllowHostHeaderOriginFallback` | boolean | `false` | Allow host header as origin |

### gateway.tailscale

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `tailscale.mode` | string | `"off"` | `"off"`, `"serve"`, `"funnel"` |

### gateway.http

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `http.endpoints.chatCompletions.enabled` | boolean | `false` | Enable OpenAI-compatible endpoint |

---

## models

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `models.mode` | string | `"merge"` | `"merge"`, `"replace"` |
| `models.bedrockDiscovery.enabled` | boolean | `false` | Enable Bedrock auto-discovery |

### models.providers.\<id\>

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `baseUrl` | string | — | Provider API endpoint |
| `apiKey` | string | — | API key |
| `auth` | string | `"api-key"` | `"api-key"`, `"token"`, `"oauth"`, `"aws-sdk"` |
| `api` | string | — | `"openai-completions"`, `"openai-responses"`, `"anthropic-messages"` |
| `headers` | object | — | Custom headers |
| `injectNumCtxForOpenAICompat` | boolean | `true` | Inject num_ctx for Ollama compat |
| `models[].id` | string | — | Model ID |
| `models[].name` | string | — | Model display name |
| `models[].reasoning` | boolean | `false` | Reasoning model flag |
| `models[].input` | array | `["text"]` | Input types |
| `models[].cost.input` | number | `0` | Input cost per token |
| `models[].cost.output` | number | `0` | Output cost per token |
| `models[].cost.cacheRead` | number | `0` | Cache read cost |
| `models[].cost.cacheWrite` | number | `0` | Cache write cost |
| `models[].contextWindow` | number | `200000` | Context window size |
| `models[].maxTokens` | number | `8192` | Max output tokens |

**API key rotation priority:** `OPENCLAW_LIVE_<PROVIDER>_KEY` > `<PROVIDER>_API_KEYS` (comma-separated) > `<PROVIDER>_API_KEY` > `<PROVIDER>_API_KEY_*` (numbered)

**Auth failover:** Profile rotation within provider first, then model fallback chain. Exponential cooldown: 1m, 5m, 25m, 1h max.

**Invalid provider keys (cause crash):**
- `supportsDeveloperRole`
- `supportsReasoningEffort`

---

## cron

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `cron.enabled` | boolean | `true` | Enable server-side cron jobs |
| `cron.store` | string | `~/.openclaw/cron/jobs.json` | Job storage path |
| `cron.maxConcurrentRuns` | number | `1` | Max concurrent cron executions |
| `cron.sessionRetention` | duration/false | `"24h"` | Cron session retention |
| `cron.runLog.maxBytes` | number | `2000000` | Max run log size |
| `cron.runLog.keepLines` | number | `2000` | Max run log lines |
| `cron.retry.maxAttempts` | number | `3` | Max retry attempts |
| `cron.retry.backoffMs` | array | `[30000, 60000, 300000, 900000, 3600000]` | Retry backoff |
| `cron.retry.retryOn` | array | `["rate_limit", "overloaded", "network", "server_error"]` | Retryable errors |
| `cron.webhook` | string | — | Webhook URL for notifications |
| `cron.webhookToken` | string | — | Webhook auth token |

---

## tools

See `tools.md` for full tool reference. Key config keys:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `tools.profile` | string | `"full"` | Default tool profile |
| `tools.allow` | array | — | Global allow list |
| `tools.deny` | array | — | Global deny list |
| `tools.byProvider.<model>.profile` | string | — | Per-model tool profile |
| `tools.byProvider.<model>.allow` | array | — | Per-model allow |
| `tools.byProvider.<model>.deny` | array | — | Per-model deny |
| `tools.elevated.enabled` | boolean | `true` | Enable elevated tools |
| `tools.sessions.visibility` | string | `"tree"` | Session visibility |
| `tools.agentToAgent.enabled` | boolean | `false` | Enable A2A tool |
| `tools.loopDetection.enabled` | boolean | `false` | Enable loop detection |

### tools.exec

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `exec.backgroundMs` | number | `10000` | Background timeout |
| `exec.timeoutSec` | number | `1800` | Exec timeout |
| `exec.cleanupMs` | number | `1800000` | Cleanup timeout |
| `exec.notifyOnExit` | boolean | `true` | Notify on exit |
| `exec.host` | string | `"sandbox"` | Execution host |
| `exec.security` | string | allowlist | Security mode |
| `exec.ask` | string | `"on-miss"` | Ask mode |
| `exec.safeBins` | array | — | Safe binary list |
| `exec.safeBinTrustedDirs` | array | `/bin`, `/usr/bin` | Trusted dirs |
| `exec.applyPatch.enabled` | boolean | `false` | Enable apply_patch |
| `exec.applyPatch.workspaceOnly` | boolean | `true` | Restrict to workspace |

### tools.web

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `web.search.enabled` | boolean | `true` | Enable web search |
| `web.search.provider` | string | auto-detect | Search provider |
| `web.search.apiKey` | string | — | Search API key |
| `web.search.maxResults` | number | `5` | Max search results |
| `web.search.timeoutSeconds` | number | `30` | Search timeout |
| `web.fetch.enabled` | boolean | `true` | Enable web fetch |
| `web.fetch.maxChars` | number | `50000` | Max fetch chars |
| `web.fetch.maxResponseBytes` | number | `2000000` | Max response size |
| `web.fetch.timeoutSeconds` | number | `30` | Fetch timeout |
| `web.fetch.readability` | boolean | `true` | Enable readability parsing |

### tools.loopDetection

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `loopDetection.enabled` | boolean | `false` | Enable loop detection |
| `loopDetection.historySize` | number | `30` | History size |
| `loopDetection.warningThreshold` | number | `10` | Warning threshold |
| `loopDetection.criticalThreshold` | number | `20` | Critical threshold |
| `loopDetection.globalCircuitBreakerThreshold` | number | `30` | Circuit breaker |
| `loopDetection.detectors.genericRepeat` | boolean | `true` | Generic repeat detection |
| `loopDetection.detectors.knownPollNoProgress` | boolean | `true` | Poll no-progress detection |
| `loopDetection.detectors.pingPong` | boolean | `true` | Ping-pong detection |

---

## session

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `session.scope` | string | `"per-sender"` | Session scope |
| `session.dmScope` | string | `"main"` | `"main"`, `"per-peer"`, `"per-channel-peer"`, `"per-account-channel-peer"` |
| `session.mainKey` | string | `"main"` | Main session key name |
| `session.reset.mode` | string | `"daily"` | `"daily"`, `"idle"` |
| `session.reset.atHour` | number | `4` | Daily reset hour |
| `session.reset.idleMinutes` | number | `60` | Idle reset minutes |
| `session.resetTriggers` | array | `["/new", "/reset"]` | Session reset commands |
| `session.parentForkMaxTokens` | number | `100000` | Max tokens for session fork |
| `session.maintenance.mode` | string | `"warn"` | `"warn"`, `"enforce"` |
| `session.maintenance.pruneAfter` | string | `"30d"` | Prune sessions after |
| `session.maintenance.maxEntries` | number | `500` | Max session entries |
| `session.maintenance.rotateBytes` | string | `"10mb"` | Log rotation size |
| `session.threadBindings.enabled` | boolean | `true` | Enable thread bindings |
| `session.threadBindings.idleHours` | number | `24` | Idle expiry |
| `session.agentToAgent.maxPingPongTurns` | number | `5` | Max A2A ping-pong |
| `session.sendPolicy.default` | string | `"allow"` | Default send policy |

---

## messages

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `messages.responsePrefix` | string | emoji/auto/"" | Response prefix |
| `messages.ackReaction` | string | emoji/"" | Acknowledgment reaction |
| `messages.ackReactionScope` | string | `"group-mentions"` | Ack scope |
| `messages.queue.mode` | string | `"collect"` | `"collect"`, `"steer"`, `"followup"`, `"summarize"` |
| `messages.queue.debounceMs` | number | `1000` | Queue debounce |
| `messages.queue.cap` | number | `20` | Queue capacity |
| `messages.queue.drop` | string | `"summarize"` | `"summarize"`, `"old"`, `"new"` |
| `messages.inbound.debounceMs` | number | `2000` | Inbound debounce |

---

## memorySearch

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `memorySearch.enabled` | boolean | auto | Enable memory search |
| `memorySearch.provider` | string | auto-select | `"local"`, `"openai"`, `"gemini"`, `"voyage"`, `"mistral"`, `"ollama"`, `"none"` |
| `memorySearch.model` | string | provider-specific | Embedding model |
| `memorySearch.store.path` | string | `~/.openclaw/memory/<agentId>.sqlite` | Store path |
| `memorySearch.store.vector.enabled` | boolean | `true` | Enable vector store |
| `memorySearch.sync.watch` | boolean | `true` | Watch for file changes |
| `memorySearch.sync.onBoot` | boolean | `true` | Sync on boot |
| `memorySearch.query.hybrid.enabled` | boolean | `false` | Enable hybrid search |
| `memorySearch.query.hybrid.vectorWeight` | number | `0.7` | Vector weight |
| `memorySearch.query.hybrid.textWeight` | number | `0.3` | Text weight |
| `memorySearch.sources` | array | `["memory"]` | Search sources |
| `memory.citations` | string | `"auto"` | `"auto"`, `"on"`, `"off"` |
| `memory.backend` | string | `"sqlite"` | `"sqlite"`, `"qmd"` |

---

## discovery

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `discovery.mdns.mode` | string | `"minimal"` | `"off"`, `"minimal"`, `"full"` |
| `discovery.wideArea.enabled` | boolean | `false` | Wide area discovery |

---

## logging

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `logging.redactSensitive` | string | `"tools"` | `"none"`, `"tools"`, `"all"` |
| `logging.redactPatterns` | array | — | Custom redaction patterns |
| `logging.file` | string | `/tmp/openclaw/openclaw-*.log` | Log file path |

---

## update

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `update.channel` | string | `"stable"` | `"stable"`, `"beta"` |
| `update.auto.enabled` | boolean | `false` | Enable auto-updates |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENCLAW_HOME` | Override home directory |
| `OPENCLAW_STATE_DIR` | Override state directory (`~/.openclaw`) |
| `OPENCLAW_CONFIG_PATH` | Override config file path |
| `OPENCLAW_LOG_LEVEL` | Override log level |
| `OPENCLAW_LOAD_SHELL_ENV` | Enable login shell env import |
| `OPENCLAW_SHELL_ENV_TIMEOUT_MS` | Shell env timeout (default 15000) |
| `OPENCLAW_SHELL` | Runtime marker (`exec`, `acp`, `tui-local`) |
| `OPENCLAW_THEME` | Force TUI palette (`light`, `dark`) |
| `OPENCLAW_PROFILE` | Profile name (changes workspace path) |
| `OPENCLAW_DISABLE_BONJOUR` | Disable mDNS |
| `OPENCLAW_GATEWAY_PASSWORD` | Password auth |
| `OPENCLAW_GATEWAY_TOKEN` | Token auth |
| `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS` | Allow plaintext WS on Docker bridge |
| `OPENCLAW_SKIP_CANVAS_HOST` | Disable canvas hosting |
| `OPENCLAW_AUTO_KICKOFF` | Auto-kickoff on restart |
| `OPENCLAW_NODE_OPTIONS_READY` | Skip entry.js V8 flag injection |
| `OPENCLAW_NO_RESPAWN` | Disable process respawning |

**Loading precedence:** Process env > `.env` (cwd) > `~/.openclaw/.env` > config `env` block > shell import

---

## Invalid Top-Level Keys (cause crash loops)

These keys are NOT valid in `openclaw.json` and will cause "unexpected property" errors:
- `contextPruning`
- `experimental`
- `subagents` at top level (use `agents.defaults.subagents`)
