# OpenClaw Tools Reference
> Auto-generated from docs.openclaw.ai. Do not edit manually.
> Last updated: 2026-03-09

---

## Tool Profiles

Profiles define the default set of tools available to agents:

| Profile | Tools Included | Use Case |
|---------|---------------|----------|
| `minimal` | `sessions_list`, `sessions_history`, `sessions_send`, `memory_search`, `memory_get` | Communication-only agents |
| `messaging` | All of `minimal` + `agents_list`, `gateway` | Default since v2026.3.2 |
| `coding` | All of `messaging` + `read`, `write`, `edit`, `exec`, `apply_patch` | Developer agents |
| `full` | All tools | Full access (recommended for most agents) |

**Important:** v2026.3.2 changed the default from `coding` to `messaging`. Our entrypoint explicitly sets `tools.profile = 'full'`.

---

## Tool Groups

Tools can be referenced individually or by group in allow/deny lists:

| Group | Members | Description |
|-------|---------|-------------|
| `group:runtime` | `exec`, `bash`, `process` | Shell/process execution |
| `group:fs` | `read`, `write`, `edit`, `apply_patch` | Filesystem operations |
| `group:sessions` | `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn` | Session management |
| `group:memory` | `memory_search`, `memory_get` | Semantic memory access |
| `group:web` | `web_search`, `web_fetch` | Web access |
| `group:ui` | `browser` | Browser automation |
| `group:automation` | `cron`, `gateway` | System automation |
| `group:messaging` | `agents_list` | Agent discovery |
| `group:openclaw` | All OpenClaw-specific tools | All agent tools |

---

## Per-Agent Tool Overrides

Override tool access per-agent using `agents.list[].tools`:

### Deny Specific Tools
```json
{
  "agents": {
    "list": [{
      "id": "scribe",
      "tools": {
        "deny": ["exec", "browser"]
      }
    }]
  }
}
```

### Allow Only Specific Tools
```json
{
  "agents": {
    "list": [{
      "id": "scout",
      "tools": {
        "allow": ["web_search", "web_fetch", "read", "sessions_send"]
      }
    }]
  }
}
```

### Using Groups
```json
{
  "tools": {
    "deny": ["group:runtime", "group:ui"]
  }
}
```

**Precedence:** `allow` takes priority over `deny`. If both are specified, only tools in `allow` AND not in `deny` are available.

**Profile + overrides:** The `profile` sets the base, then `allow`/`deny` modify it:
```json
{
  "tools": {
    "profile": "full",
    "deny": ["browser", "exec"]
  }
}
```

---

## Available Tools (Full Profile)

| Tool | Description | Notes |
|------|-------------|-------|
| `read` | Read file contents | Agent workspace only |
| `write` | Write file contents | Agent workspace only |
| `edit` | Edit file (search/replace) | Agent workspace only |
| `apply_patch` | Apply unified diff patch | Agent workspace only |
| `exec` | Execute shell command | Runs on OpenClaw container |
| `bash` | Interactive bash session | Alternative to exec |
| `process` | Manage background processes | Start/stop/list |
| `sessions_list` | List sessions | Can filter by agent |
| `sessions_history` | Get session message history | By session key |
| `sessions_send` | Send message to agent session | Agent-to-agent messaging |
| `sessions_spawn` | Spawn a sub-agent session | Create child sessions |
| `memory_search` | Search agent memory | Hybrid vector + BM25 |
| `memory_get` | Get specific memory entry | By key/path |
| `web_search` | Search the web | Requires `tools.web.search.apiKey` |
| `web_fetch` | Fetch URL content | HTTP GET with parsing |
| `cron` | Manage cron jobs | Create/update/remove schedules |
| `gateway` | Gateway configuration | Runtime config changes |
| `browser` | Browser automation | Puppeteer/CDP |
| `agents_list` | List configured agents | Discover other agents |

---

## Tool Execution Context

- **Working directory:** Agent's workspace (`~/.openclaw/workspace-<name>/`)
- **Shell:** `/bin/sh` (Alpine Linux in the OpenClaw container)
- **No curl:** OpenClaw container uses `wget` — agents must use `wget` or `node -e "fetch(...)"`
- **Timeout:** Default 120s per tool execution
- **Loop detection:** OpenClaw detects recursive tool calls and aborts after configurable depth

---

## Sub-Agent Tools

When an agent spawns sub-agents via `sessions_spawn`:
- Sub-agents inherit the parent's tool profile by default
- Sub-agent model defaults to the system default (not the parent's model)
- Sub-agents can be given a restricted tool set via spawn parameters
- Max concurrent sub-agents configurable at agent level
