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
    "maxConcurrentRuns": 3,
    "store": "~/.openclaw/cron/jobs.json",
    "sessionRetention": "24h",
    "runLog": { "maxBytes": 2000000, "keepLines": 2000 },
    "retry": {
      "maxAttempts": 3,
      "backoffMs": [30000, 60000, 300000, 900000, 3600000],
      "retryOn": ["rate_limit", "overloaded", "network", "server_error"]
    }
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
| `text` | string | Text content (for systemEvent) |
| `message` | string | Message content (for agentTurn) |
| `model` | string | Model override for this job (agentTurn only) |
| `thinking` | string | Thinking mode override (agentTurn only) |
| `timeoutSeconds` | number | Timeout override (agentTurn only) |
| `lightContext` | boolean | Reduce context (agentTurn only) |

### Thinking Values
`"off"`, `"minimal"`, `"low"`, `"medium"`, `"high"`, `"xhigh"`

---

## Session Targets

| Target | Description |
|--------|-------------|
| `"main"` | Runs in the agent's main session (visible in chat history) — **DO NOT USE for cron** |
| `"isolated"` | Runs in a disposable session (no history pollution) — **ALWAYS use this for cron** |

**Rule:** All cron jobs MUST target `"isolated"`. Using `"main"` causes heartbeat/cron responses to appear in the owner's chat UI, mixing system noise with real conversations.

---

## Cron Tool Syntax (Agent-Side)

Agents create cron jobs via the `cron` tool:

### Create
```
cron({
  action: "add",
  schedule: { cron: "*/5 * * * *" },
  payload: { kind: "agentTurn", message: "INBOX CHECK", session: "isolated" }
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
    "kind": "agentTurn",
    "message": "INBOX CHECK: Read session history for delegated tasks. Execute immediately.",
    "session": "isolated"
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

| Mode | Fields | Behavior |
|------|--------|----------|
| `announce` | `delivery.channel`, `delivery.to`, `delivery.bestEffort` | Channel delivery + brief main session summary |
| `webhook` | `delivery.to` (HTTPS URL) | POST payload to URL, uses `Authorization: Bearer <token>` if `cron.webhookToken` set |
| `none` | — | Internal only, no external delivery |

### Retry Behavior

| Error Type | Retries | Backoff |
|------------|---------|---------|
| Transient (429, overload, timeout, server error) | Up to 3 | 30s → 1m → 5m |
| Permanent (auth, config, validation errors) | 0 (disabled immediately) | — |
| Recurring jobs | Exponential | 30s → 1m → 5m → 15m → 60m |

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
