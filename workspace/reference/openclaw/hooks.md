# OpenClaw Hooks & Webhooks Reference
> Auto-generated from docs.openclaw.ai. Do not edit manually.
> Last updated: 2026-03-09

---

## Hooks (Event-Driven Automation)

Hooks are event-driven scripts/commands that execute in response to OpenClaw lifecycle events.

### Hook Event Types

| Event | Trigger | Description |
|-------|---------|-------------|
| `command:new` | New command received | Fires when a new chat command is received |
| `session:compact:before` | Before compaction | Fires before session memory is compacted |
| `session:compact:after` | After compaction | Fires after session memory is compacted |
| `agent:bootstrap` | Agent bootstrap | Fires when an agent completes its bootstrap sequence |
| `gateway:startup` | Gateway starts | Fires when the gateway HTTP/WS server starts |
| `message:received` | Message received | Fires when a message is received from any channel |
| `message:sent` | Message sent | Fires when a message is sent to any channel |

### Hook Configuration

```json
{
  "hooks": {
    "events": {
      "gateway:startup": {
        "command": "node /opt/scripts/auto-kickoff.js",
        "timeout": 30000
      },
      "agent:bootstrap": {
        "command": "echo 'Agent bootstrapped'",
        "timeout": 5000
      }
    }
  }
}
```

### Hook Fields

| Field | Type | Description |
|-------|------|-------------|
| `command` | string | Shell command to execute |
| `timeout` | number | Max execution time (ms) |
| `enabled` | boolean | Enable/disable the hook |

### Bundled Hooks
OpenClaw includes built-in hooks that can be enabled/disabled:
```json
{
  "hooks": {
    "bundled": {
      "auto-compact": true,
      "memory-flush": true
    }
  }
}
```

---

## Webhooks (HTTP Endpoints)

OpenClaw exposes built-in HTTP webhook endpoints for external service integration.

### Built-in Endpoints

#### `/hooks/wake`
Wake an idle agent:
```
POST http://openclaw:18789/hooks/wake
Content-Type: application/json
Authorization: Bearer <gateway-password>

{
  "agentId": "lead"
}
```

#### `/hooks/agent`
Send a message to an agent:
```
POST http://openclaw:18789/hooks/agent
Content-Type: application/json
Authorization: Bearer <gateway-password>

{
  "agentId": "lead",
  "message": "Task description here",
  "sessionKey": "agent:lead:main"
}
```

### Authentication
- **Bearer token:** Use the gateway password as Bearer token
- **Internal only:** These endpoints are on the OpenClaw container port (18789)
- **Not exposed externally** — our custom webhook handler (`webhook:9090`) provides the external-facing endpoint with per-webhook token auth

### Agent Routing
- `agentId` determines which agent receives the message
- If `sessionKey` is provided, message goes to that specific session
- If omitted, goes to the agent's default session

---

## Our Custom Webhook Handler (webhook:9090)

Separate from OpenClaw's built-in hooks. Provides:
- Per-webhook token authentication (external services)
- Trigger file persistence (survives restarts)
- Registry management (register/revoke/list)
- OpenClaw WS notification for immediate execution

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/trigger/{workflowId}?token=xxx` | Per-webhook token | Trigger a workflow |
| `POST` | `/register` | Site cookie | Register new webhook |
| `DELETE` | `/revoke/{workflowId}` | Site cookie | Revoke a webhook |
| `GET` | `/list` | Site cookie | List registered webhooks |
| `GET` | `/health` | None | Health check |

### External URL Format
```
https://in-fused.org/api/webhook/trigger/{workflowId}?token={secret}
```

### Trigger Flow
1. External service POSTs to `/api/webhook/trigger/{id}?token=xxx`
2. Caddy strips `/api/webhook` prefix, proxies to `webhook:9090`
3. Handler validates token against registry
4. Writes trigger file to `/workspace/webhook-triggers/{id}-{timestamp}.json`
5. Updates trigger index at `/workspace/webhook-triggers/index.json`
6. Sends WS notification to OpenClaw (`WEBHOOK_TRIGGER:{id}` to `agent:lead:main`)
7. Mission Control's workflow-bridge polls index.json and executes matching workflow

---

## Integration: Hooks vs Webhooks vs Our Handler

| Feature | OpenClaw Hooks | OpenClaw Webhooks | Our Webhook Handler |
|---------|---------------|-------------------|-------------------|
| Type | Event-driven | HTTP endpoints | HTTP endpoints |
| Auth | Internal | Bearer token | Per-webhook token |
| External | No | Not directly | Yes (via Caddy) |
| Purpose | Lifecycle automation | Agent messaging | Workflow triggers |
| Persistence | No | No | Yes (trigger files) |
