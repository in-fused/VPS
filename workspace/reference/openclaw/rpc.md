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
`operator` (scopes: `read`, `write`, `admin`, `approvals`, `pairing`), `node` (declares capabilities)

### Server hello-ok Response
Contains: `presence`, `health`, `stateVersion`, `uptimeMs`, limits/policy

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

#### Session Tool Schemas (Agent-Side)

**sessions_list** params: `kinds?` (main|group|cron|hook|node|other), `limit?`, `activeMinutes?`, `messageLimit?`
Returns: `key`, `kind`, `channel`, `displayName`, `updatedAt`, `sessionId`, `model`, `contextTokens`, `totalTokens`, `thinkingLevel`, `messages?`

**sessions_history** params: `sessionKey` (required), `limit?`, `includeTools?` (default false)
Returns: messages array

**sessions_send** params: `sessionKey` (required), `message` (required), `timeoutSeconds?` (0=fire-and-forget)
Returns: `{runId, status: "accepted"|"ok"|"timeout"|"error", reply?, error?}`
Max 5 ping-pong turns by default. Reply `REPLY_SKIP` to stop.

**sessions_spawn** params: `task` (required), `label?`, `agentId?`, `model?`, `thinking?`, `runTimeoutSeconds?`, `thread?`, `mode?` (run|session), `cleanup?` (delete|keep), `sandbox?` (inherit|require)
Returns: `{status:"accepted", runId, childSessionKey}`
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
| `config.apply` | `...partial` | Apply partial config update (rate limit: 3/60s) |
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
| `agent` | — | Run agent turn (default timeout 600s) |
| `agent.wait` | — | Run agent turn and wait (default 30s) |
| `send` | — | Send message |
| `wake` | `agentId` | Wake an agent |
| `channels.status` | — | Channel connection status |
| `push.test` | — | Test push notifications |
| `browser.request` | — | Browser automation request |
| `device.token.rotate` | — | Rotate device token |
| `device.token.revoke` | — | Revoke device token |
| `system-presence` | — | System presence |
| `exec.approval.resolve` | — | Resolve exec approval |
| `skills.bins` | — | List skill binaries |

---

## Error Codes

| Code | Description |
|------|-------------|
| 1008 | Policy violation / unexpected property / auth failure |
| 4001 | Session not found |
| 4002 | Agent not found |
| 4003 | Rate limited |
| 4004 | Timeout |

### Device Auth Error Codes

| Code | Description |
|------|-------------|
| `DEVICE_AUTH_NONCE_REQUIRED` | Nonce required for device auth |
| `DEVICE_AUTH_NONCE_MISMATCH` | Nonce doesn't match |
| `DEVICE_AUTH_SIGNATURE_INVALID` | Invalid signature |
| `DEVICE_AUTH_SIGNATURE_EXPIRED` | Signature expired |
| `DEVICE_AUTH_DEVICE_ID_MISMATCH` | Device ID mismatch |
| `DEVICE_AUTH_PUBLIC_KEY_INVALID` | Invalid public key |

### Other Error Signatures

| Error | Cause |
|-------|-------|
| `device identity required` | Missing device auth |
| `unauthorized` | Token/password mismatch |
| `gateway connect failed` | Invalid host/port |
| `EADDRINUSE` | Port conflict |
| `refusing to bind gateway without auth` | Non-loopback needs auth |
| `SYSTEM_RUN_DENIED: approval required` | Exec approval pending |

---

## Event Types (Server → Client)

| Event | Description |
|-------|-------------|
| `connect.challenge` | Auth challenge with nonce |
| `agent` | Agent state change |
| `chat` | Chat message (delta/final/error/aborted) |
| `presence` | User/agent presence update |
| `tick` | Periodic tick |
| `health` | Health status update |
| `heartbeat` | Heartbeat event |
| `shutdown` | Server shutting down |
| `exec.approval.requested` | Exec tool needs approval |

---

## Session Key Patterns

| Pattern | Example | Description |
|---------|---------|-------------|
| DM main | `agent:<id>:main` | Primary webchat session |
| DM per-peer | `agent:<id>:dm:<peerId>` | Per-peer DM |
| Group | `agent:<id>:<channel>:group:<id>` | Group chat |
| Cron | `cron:<jobId>` | Cron job session |
| Webhook | `hook:<uuid>` | Webhook session |
| Node | `node-<nodeId>` | Node session |
| Sub-agent | `agent:<id>:subagent:<uuid>` | Sub-agent session |

---

## Queue & Concurrency

Lane-based FIFO queue. Session lanes serialize per-session. Global lanes cap parallelism.

| Lane | Default Concurrency |
|------|-------------------|
| `main` | 4 |
| `subagent` | 8 |
| others | 1 |

**Queue modes:** `collect` (coalesce, default), `steer` (inject into current run), `followup` (next turn), `steer-backlog` (steer + preserve), `interrupt` (abort + process newest)

**Defaults:** `debounceMs: 1000`, `cap: 20`, `drop: "summarize"`

---

## OpenAI-Compatible HTTP API

Disabled by default. Enable via `gateway.http.endpoints.chatCompletions.enabled = true`.

**Endpoint:** `POST /v1/chat/completions`
**Auth:** Bearer token matching gateway password
**Model field:** `openclaw:<agentId>` or `agent:<agentId>`
**Headers:** `x-openclaw-agent-id`, `x-openclaw-session-key`
**Streaming:** `stream: true` → SSE with `data: [DONE]` termination
