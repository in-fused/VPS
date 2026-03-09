# OpenClaw Cron Jobs Reference
> Auto-generated from docs.openclaw.ai. Do not edit manually.
> Last updated: 2026-03-09

---

## Overview

OpenClaw supports server-side scheduled jobs that run 24/7, independent of browser sessions. Agents create cron jobs via the `cron` tool.

### Configuration
```json
{
  "cron": {
    "enabled": true,
    "maxConcurrentRuns": 1
  }
}
```

---

## Schedule Types

### `at` — One-Shot
Run once at a specific time:
```json
{
  "schedule": {
    "at": "2026-03-10T14:00:00Z"
  }
}
```

### `every` — Interval
Run at fixed intervals:
```json
{
  "schedule": {
    "every": "5m"
  }
}
```
Supported units: `s` (seconds), `m` (minutes), `h` (hours), `d` (days)

### `cron` — Cron Expression
Standard cron expression:
```json
{
  "schedule": {
    "cron": "*/5 * * * *"
  }
}
```
Format: `minute hour day-of-month month day-of-week`

---

## Payload Configuration

### Kind: `systemEvent`
Injects event into the agent's main session, triggering a full agent turn:
```json
{
  "payload": {
    "kind": "systemEvent",
    "data": {
      "type": "inbox_check"
    }
  }
}
```

### Kind: `agentTurn`
Runs an isolated agent turn (doesn't pollute main conversation):
```json
{
  "payload": {
    "kind": "agentTurn",
    "session": "isolated",
    "model": "litellm/cerebras-llama-4-scout",
    "thinking": "brief"
  }
}
```

| Payload Key | Type | Description |
|-------------|------|-------------|
| `kind` | string | `"systemEvent"` or `"agentTurn"` |
| `session` | string | `"main"` or `"isolated"` |
| `data` | object | Event data (for systemEvent) |
| `model` | string | Model override for this job (agentTurn only) |
| `thinking` | string | Thinking mode override (agentTurn only) |

---

## Session Targets

| Target | Description |
|--------|-------------|
| `"main"` | Runs in the agent's main session (visible in chat history) |
| `"isolated"` | Runs in a disposable session (no history pollution) |

---

## Cron Tool Syntax (Agent-Side)

Agents create cron jobs via the `cron` tool:

### Create
```
cron({
  action: "add",
  schedule: { cron: "*/5 * * * *" },
  payload: { kind: "systemEvent", data: { type: "inbox_check" } }
})
```

### Remove
```
cron({
  action: "remove",
  id: "<job-id>"
})
```

### List
```
cron({ action: "list" })
```

---

## RPC Methods

| Method | Params | Description |
|--------|--------|-------------|
| `cron.list` | — | List all cron jobs |
| `cron.status` | — | Get cron system status (includes job count) |
| `cron.add` | `schedule`, `payload`, `agentId?` | Add a cron job |
| `cron.update` | `id`, `schedule?`, `payload?` | Update a cron job |
| `cron.remove` | `id` | Remove a cron job |
| `cron.run` | `id` | Manually trigger a job |
| `cron.runs` | `id?` | List run history |
| `cron.runs.read` | `runId` | Read specific run output |

---

## Our Cron Usage

### Inbox-Check (All Agents)
Every agent creates this on bootstrap:
```json
{
  "schedule": { "cron": "*/5 * * * *" },
  "payload": {
    "kind": "systemEvent",
    "data": { "type": "inbox_check" }
  }
}
```
- Checks `sessions_list()` for unread messages
- Reads and executes delegated tasks
- Replies with results
- **Critical for delegation chain** — without this, `sessions_send` messages sit unread

### Per-Job Model Override (Future)
When OpenClaw adds per-cron-job model selection, inbox-check could use a lighter model:
```json
{
  "schedule": { "cron": "*/5 * * * *" },
  "payload": {
    "kind": "agentTurn",
    "session": "isolated",
    "model": "litellm/cerebras-llama-4-scout"
  }
}
```
This would save ~80% tokens on routine inbox checks.

---

## Delivery Modes

| Mode | Description |
|------|-------------|
| Direct injection | `systemEvent` injects directly into session |
| Agent turn | `agentTurn` triggers a full agent processing cycle |
| Isolated | `session: "isolated"` prevents main session pollution |

---

## Monitoring

Check cron status:
```bash
docker compose exec openclaw wget -qO- http://localhost:18789/healthz
```

List active cron jobs via RPC:
```javascript
// Via WebSocket
{ type: "req", id: "1", method: "cron.status", params: {} }
```
