# OpenClaw RPC & Protocol Reference
> Auto-generated from docs.openclaw.ai. Do not edit manually.
> Last updated: 2026-03-09

---

## WebSocket Protocol

### Connection
- **URL:** `ws://openclaw:18789/` (internal) or `wss://domain/ws/openclaw` (via Caddy)
- **Protocol version:** 3 (`minProtocol: 3, maxProtocol: 3`)

### Frame Types

| Type | Direction | Description |
|------|-----------|-------------|
| `hello` | Server → Client | Initial handshake, may include nonce |
| `challenge` | Server → Client | Auth challenge (alternative to hello) |
| `req` | Client → Server | RPC request |
| `res` | Server → Client | RPC response |
| `event` | Server → Client | Async event (chat, session updates) |

### Request Frame
```json
{
  "type": "req",
  "id": "1",
  "method": "chat.send",
  "params": { ... }
}
```

### Response Frame
```json
{
  "type": "res",
  "id": "1",
  "payload": { ... }
}
```
Or on error:
```json
{
  "type": "res",
  "id": "1",
  "error": { "code": 1008, "message": "..." }
}
```

### Event Frame
```json
{
  "type": "event",
  "name": "chat",
  "payload": { ... }
}
```

---

## Handshake Flow

1. Server sends `hello` or `challenge` (may include nonce)
2. Client sends `connect` request:
```json
{
  "type": "req",
  "id": "1",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "auth": {
      "token": "<password>",
      "password": "<password>"
    },
    "role": "operator",
    "scopes": ["operator.read", "operator.write", "operator.admin", "operator.approvals", "operator.pairing"],
    "client": {
      "id": "webchat",
      "version": "1.0.0",
      "platform": "web",
      "mode": "webchat"
    }
  }
}
```
3. Server responds with `res` — authenticated

### Auth Object (additionalProperties: false)
| Key | Type | Description |
|-----|------|-------------|
| `token` | string | Authentication token |
| `password` | string | Password (both token and password required) |
| `deviceToken` | string | Device token (optional) |

**NO other fields allowed.** Adding `mode` or any other key → "unexpected property" (1008).

### Client ID Values (enum)
`webchat`, `cli`, `webchat-ui`, `openclaw-control-ui`, `gateway-client`, `openclaw-macos`, `openclaw-ios`, `openclaw-android`, `node-host`, `test`, `fingerprint`, `openclaw-probe`

### Client Mode Values (enum)
`webchat`, `cli`, `ui`, `backend`, `node`, `probe`, `test`

### Roles
`operator`, `user`, `agent`

---

## RPC Methods

### Chat

| Method | Params | Description |
|--------|--------|-------------|
| `chat.send` | `sessionKey`, `message`, `idempotencyKey`, `deliver?`, `thinking?`, `attachments?`, `timeoutMs?` | Send a chat message |
| `chat.history` | `sessionKey` | Get session message history |
| `chat.abort` | `sessionKey`, `runId?` | Abort a running chat |
| `chat.inject` | `sessionKey`, `message`, `label?` | Inject context without triggering a turn |

#### chat.send Schema (additionalProperties: false)
- `sessionKey` — required, NonEmptyString
- `message` — required, String
- `idempotencyKey` — required, NonEmptyString (unique per request)
- `deliver` — optional Boolean (set `false` for webchat to prevent forwarding to Telegram/Discord)
- `thinking` — optional String
- `attachments` — optional Array
- `timeoutMs` — optional Integer (min: 0)
- **NO other fields** — `agentId`, `sessionId`, `model` cause validation errors

#### Chat Event Payload
```json
{
  "runId": "...",
  "sessionKey": "agent:lead:main",
  "seq": 1,
  "state": "delta",
  "message": "...",
  "usage": { ... },
  "stopReason": "...",
  "errorMessage": "..."
}
```

| State | Description |
|-------|-------------|
| `delta` | Streaming token chunk |
| `final` | Generation complete |
| `aborted` | User or system aborted |
| `error` | Error occurred |

### Sessions

| Method | Params | Description |
|--------|--------|-------------|
| `sessions.list` | `agentId?`, `includeDerivedTitles?`, `includeLastMessage?` | List sessions |
| `sessions.preview` | `key` | Preview session content |
| `sessions.resolve` | `key` | Resolve session details |
| `sessions.patch` | `key`, `...patch` | Update session metadata |
| `sessions.reset` | `key`, `reason?` | Reset session (fresh conversation) |
| `sessions.delete` | `key` | Delete session |
| `sessions.compact` | `key` | Force session compaction |

#### Session Key Format
`agent:<agentId>:main` — webchat DM (e.g., `agent:lead:main`)
Sessions auto-create on first `chat.send`.

### Agents

| Method | Params | Description |
|--------|--------|-------------|
| `agents.list` | — | List all configured agents |
| `agents.create` | `...config` | Create a new agent |
| `agents.update` | `id`, `...config` | Update agent config |
| `agents.delete` | `id` | Delete an agent |
| `agents.files.list` | `agentId` | List agent workspace files |
| `agents.files.get` | `agentId`, `path` | Read agent workspace file |
| `agents.files.set` | `agentId`, `path`, `content` | Write agent workspace file |

### Config

| Method | Params | Description |
|--------|--------|-------------|
| `config.get` | — | Get current configuration |
| `config.set` | `...config` | Set full configuration |
| `config.apply` | `...partial` | Apply partial config update |
| `config.patch` | `path`, `value` | Patch specific config path |
| `config.schema` | — | Get config JSON schema |

### Cron

| Method | Params | Description |
|--------|--------|-------------|
| `cron.list` | — | List all cron jobs |
| `cron.status` | — | Get cron system status |
| `cron.add` | `...jobConfig` | Add a new cron job |
| `cron.update` | `id`, `...jobConfig` | Update a cron job |
| `cron.remove` | `id` | Remove a cron job |
| `cron.run` | `id` | Manually trigger a cron job |
| `cron.runs` | `id?` | List cron run history |
| `cron.runs.read` | `runId` | Read a specific cron run |

### System

| Method | Params | Description |
|--------|--------|-------------|
| `health` | — | System health check |
| `status` | — | System status |
| `usage.status` | — | Token usage status |
| `usage.cost` | — | Cost tracking |
| `models.list` | — | List available models |
| `tools.catalog` | — | List available tools |
| `skills.status` | — | Skill system status |

### Other

| Method | Params | Description |
|--------|--------|-------------|
| `agent` | — | Run agent turn |
| `send` | — | Send message |
| `wake` | `agentId` | Wake an agent |
| `channels.status` | — | Channel connection status |
| `push.test` | — | Test push notifications |
| `browser.request` | — | Browser automation request |

---

## Error Codes

| Code | Description |
|------|-------------|
| 1008 | Policy violation / unexpected property / auth failure |
| 4001 | Session not found |
| 4002 | Agent not found |
| 4003 | Rate limited |
| 4004 | Timeout |
