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
| `channels` | object | External messaging channels (Telegram, Discord, etc.) |
| `hooks` | object | Event-driven automation hooks |
| `cron` | object | Scheduled job configuration |
| `models` | object | Model providers and routing |
| `tools` | object | Tool access profiles and permissions |
| `session` | object | Session behavior defaults |
| `update` | object | Auto-update configuration |
| `telemetry` | object | OTEL tracing configuration |

---

## agents

### agents.defaults

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `agents.defaults.model` | object | `{ primary: '...' }` | Default model for all agents |
| `agents.defaults.models` | object | `{}` | Provider allowlist (e.g., `{ litellm: {} }`) |
| `agents.defaults.tools` | object | `{}` | Default tool profile/restrictions |
| `agents.defaults.compaction` | object | `{}` | Memory compaction settings |
| `agents.defaults.bootstrapMaxChars` | number | `20000` | Max chars per workspace file |
| `agents.defaults.bootstrapTotalMaxChars` | number | `150000` | Max total chars across all workspace files |

### agents.defaults.compaction

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `compaction.mode` | string | `"safeguard"` | Compaction mode |
| `compaction.memoryFlush.enabled` | boolean | `true` | Enable memory flush on compaction |
| `compaction.memoryFlush.softThresholdTokens` | number | `30000` | Token threshold before compaction triggers |
| `compaction.reserveTokensFloor` | number | `20000` | Minimum tokens to reserve after compaction |
| `compaction.identifierPolicy` | string | `"by-agent"` | How compaction identifies memory chunks |

### agents.list[]

Each agent in the `agents.list` array supports:

| Key | Type | Description |
|-----|------|-------------|
| `id` | string | Unique agent identifier (lowercase, no spaces) |
| `name` | string | Display name |
| `emoji` | string | Agent emoji icon |
| `model` | object | `{ primary: 'model-id' }` — per-agent model override |
| `tools` | object | Per-agent tool restrictions (see Tools section) |
| `workspace` | string | Workspace directory name (e.g., `"Lead"`) |
| `delegationTargets` | string[] | Agent IDs this agent can delegate to |
| `subagents` | object | Sub-agent spawn configuration |
| `routing` | object | Message routing rules |

**Invalid agent keys (cause crash loops):**
- `instructions` — NOT valid (prompts live in workspace files)
- `identity.description` — only `name`, `emoji` are valid identity keys
- `supportsDeveloperRole` — not a valid key
- `supportsReasoningEffort` — not a valid key

---

## gateway

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `gateway.port` | number | `18789` | HTTP/WS port |
| `gateway.bind` | string | `"lan"` | Bind address (`"lan"`, `"localhost"`, `"0.0.0.0"`) |
| `gateway.basePath` | string | `"/"` | URL base path (e.g., `"/openclaw/"`) |
| `gateway.password` | string | — | Gateway password (env: `OPENCLAW_GATEWAY_PASSWORD`) |
| `gateway.trustedProxies` | string[] | `[]` | Trusted reverse proxy CIDRs |
| `gateway.allowedOrigins` | string[] | `[]` | CORS allowed origins |

### gateway.controlUi

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `controlUi.dangerouslyDisableDeviceAuth` | boolean | `false` | Skip device identity verification |
| `controlUi.allowInsecureAuth` | boolean | `false` | Allow auth without device challenge |

---

## models

### models.providers

Provider configuration follows this schema:

```json
{
  "models": {
    "providers": {
      "<provider-name>": {
        "baseUrl": "http://litellm:4000/v1",
        "apiKey": "...",
        "wireFormat": "openai",
        "models": ["model-1", "model-2"]
      }
    }
  }
}
```

| Key | Type | Description |
|-----|------|-------------|
| `baseUrl` | string | Provider API endpoint |
| `apiKey` | string | API key (can reference env vars) |
| `wireFormat` | string | API format: `"openai"`, `"anthropic"`, `"google"` |
| `models` | string[] | Available model IDs |

**Invalid provider keys (cause crash):**
- `supportsDeveloperRole`
- `supportsReasoningEffort`

---

## cron

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `cron.enabled` | boolean | `false` | Enable server-side cron jobs |
| `cron.maxConcurrentRuns` | number | `1` | Max concurrent cron executions |

---

## tools

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `tools.profile` | string | `"messaging"` | Default tool profile |
| `tools.sessions.visibility` | string | `"own"` | Session visibility (`"own"`, `"all"`) |
| `tools.web.search.apiKey` | string | — | Web search API key |

---

## session

| Key | Type | Description |
|-----|------|-------------|
| `session.defaultTimeout` | number | Default session timeout (ms) |
| `session.maxConcurrentSessions` | number | Max concurrent active sessions |

---

## hooks

| Key | Type | Description |
|-----|------|-------------|
| `hooks.events` | object | Map of event names to hook configurations |
| `hooks.bundled` | object | Built-in hook enable/disable |

See `hooks.md` for full hook event reference.

---

## update

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `update.channel` | string | `"stable"` | Update channel (`"stable"`, `"beta"`) |
| `update.auto.enabled` | boolean | `false` | Enable auto-updates |

---

## telemetry

| Key | Type | Description |
|-----|------|-------------|
| `telemetry.otel.enabled` | boolean | Enable OpenTelemetry export |
| `telemetry.otel.endpoint` | string | OTEL collector endpoint |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENCLAW_GATEWAY_PASSWORD` | Gateway password (alternative to config) |
| `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS` | Allow plaintext WS on non-loopback (v2026.3.2+) |
| `OPENCLAW_NO_RESPAWN` | Disable process respawning |
| `OPENCLAW_NODE_OPTIONS_READY` | Skip entry.js V8 flag injection |
| `OPENCLAW_AUTO_KICKOFF` | Enable auto-bootstrap on restart |

---

## Invalid Top-Level Keys (cause crash loops)

These keys are NOT valid in `openclaw.json` and will cause "unexpected property" errors:
- `contextPruning`
- `memorySearch`
- `experimental`
- `subagents.maxDepth` / `maxConcurrent` / `maxChildrenPerAgent` / `runTimeoutSeconds`
- `tools.agentToAgent.maxPingPongTurns`
