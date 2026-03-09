# OpenClaw Multi-Agent Reference
> Auto-generated from docs.openclaw.ai. Do not edit manually.
> Last updated: 2026-03-09

---

## Agent Configuration Schema

### Agent List Entry
```json
{
  "agents": {
    "list": [
      {
        "id": "lead",
        "name": "Lead",
        "emoji": "crown",
        "workspace": "Lead",
        "model": {
          "primary": "litellm/cerebras-llama-3.3-70b"
        },
        "tools": {
          "profile": "full",
          "deny": ["browser"]
        },
        "delegationTargets": ["codecraft", "scout", "scribe"],
        "subagents": {
          "model": { "primary": "litellm/cerebras-llama-4-scout" }
        }
      }
    ]
  }
}
```

### Agent Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique ID (lowercase, no spaces) |
| `name` | string | Yes | Display name |
| `emoji` | string | No | Agent emoji icon |
| `workspace` | string | No | Workspace directory name (defaults to name) |
| `model` | object | No | `{ primary: 'model-id' }` |
| `tools` | object | No | Tool profile + allow/deny overrides |
| `delegationTargets` | string[] | No | IDs this agent can delegate to |
| `subagents` | object | No | Sub-agent configuration |
| `routing` | object | No | Message routing rules |

---

## Agent-to-Agent Messaging

### Sending Messages
```
sessions_send({
  sessionKey: "agent:<target-id>:main",
  message: "Task description here"
})
```

### Session Key Format
- `agent:<agentId>:main` — webchat/main session
- `agent:<agentId>:<custom>` — custom named session
- Sessions auto-create on first message

### Delegation Chain
```
Lead → CodeCraft, Scout, Scribe
CodeCraft → Scout, Scribe
Scout → Scribe
Scribe → (none)

Ops Lead → Builder, Sentinel, Chronicler
Builder → Sentinel, Chronicler
Sentinel → Chronicler
Chronicler → (none)
```

### Cross-Team Collaboration
- Any agent can message any other agent via `sessions_send`
- Cross-team collaboration is encouraged
- Initiator stages final deliverable
- Both agents get governance credit

---

## Sub-Agents

Agents can spawn sub-agents for parallel or specialized work:

```
sessions_spawn({
  model: "litellm/cerebras-llama-4-scout",
  prompt: "Research task here",
  tools: ["web_search", "web_fetch", "read"]
})
```

### Sub-Agent Defaults
- Model: system default (not parent's model)
- Tools: parent's tool profile (can be restricted)
- Workspace: temporary (cleaned up after completion)

### Configuration
```json
{
  "subagents": {
    "model": {
      "primary": "litellm/cerebras-llama-4-scout"
    }
  }
}
```

---

## Session Management

### Session Types
| Type | Key Format | Description |
|------|------------|-------------|
| Main | `agent:<id>:main` | Primary conversation session |
| Named | `agent:<id>:<name>` | Custom named session |
| Isolated | (cron-created) | Temporary, no history |

### Session Operations
| Operation | Tool/RPC | Description |
|-----------|----------|-------------|
| List | `sessions_list()` | List all sessions |
| History | `sessions_history(key)` | Get message history |
| Send | `sessions_send(key, msg)` | Send message to session |
| Reset | `sessions.reset` (RPC) | Clear session, fresh start |
| Delete | `sessions.delete` (RPC) | Remove session entirely |
| Compact | `sessions.compact` (RPC) | Force memory compaction |

### Session Visibility
- Default: `"own"` — agents see only their own sessions
- Our config: `"all"` — agents can see all sessions for team coordination
- Set via: `tools.sessions.visibility = 'all'`

---

## Routing & Bindings

### Channel Routing
Messages from external channels (Telegram, Discord, etc.) can be routed to specific agents:
```json
{
  "channels": {
    "telegram": {
      "routing": {
        "default": "lead",
        "patterns": {
          "/security *": "sentinel",
          "/build *": "builder"
        }
      }
    }
  }
}
```

### Session Isolation
- Each agent has its own session namespace
- Messages between agents use `sessions_send`
- Cron jobs can target `"main"` or `"isolated"` sessions
- Sub-agents run in temporary sessions

---

## Our Agent Setup

### Model Assignments (MODEL_MAP)

| Agent | Model | Provider | Cost |
|-------|-------|----------|------|
| Lead | cerebras-llama-3.3-70b | Cerebras | Free |
| CodeCraft | cerebras-llama-3.3-70b | Cerebras | Free |
| Ops Lead | cerebras-llama-3.3-70b | Cerebras | Free |
| Scout | gemini-pro | Google Gemini | Free |
| Builder | gemini-flash | Google Gemini | Free |
| Sentinel | cerebras-llama-4-scout | Cerebras | Free |
| Scribe | gemini-flash-lite | Google Gemini | Free |
| Chronicler | gemini-flash-lite | Google Gemini | Free |
| Subagents | cerebras-llama-4-scout | Cerebras | Free |

### Tool Restrictions (Planned — Phase 1)

| Agent | Deny | Rationale |
|-------|------|-----------|
| Lead | `browser` | Orchestrator, doesn't need browser |
| CodeCraft | (none) | Full access — developer |
| Scout | `exec` | Research only |
| Scribe | `exec`, `browser` | Documentation writer |
| Ops Lead | `browser` | Platform orchestrator |
| Builder | (none) | Full access — infra developer |
| Sentinel | (none) | Full access — security auditing |
| Chronicler | `exec`, `browser` | Documentation writer |
