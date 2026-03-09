# OpenClaw Tools Reference
> Auto-generated from docs.openclaw.ai. Do not edit manually.
> Last updated: 2026-03-09

---

## Tool Profiles

Profiles define the default set of tools available to agents:

| Profile | Tools Included | Use Case |
|---------|---------------|----------|
| `minimal` | `session_status` only | Minimal access |
| `coding` | `group:fs`, `group:runtime`, `group:sessions`, `group:memory`, `image` | Developer agents |
| `messaging` | `group:messaging`, `sessions_list`, `sessions_history`, `sessions_send`, `session_status` | Default since v2026.3.2 |
| `full` | All tools, no restrictions | Full access (recommended) |

**Important:** v2026.3.2 changed the default from `coding` to `messaging`. Our entrypoint explicitly sets `tools.profile = 'full'`.

---

## Tool Groups

| Group | Members | Description |
|-------|---------|-------------|
| `group:runtime` | `exec`, `bash`, `process` | Shell/process execution |
| `group:fs` | `read`, `write`, `edit`, `apply_patch` | Filesystem operations |
| `group:sessions` | `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `session_status` | Session management |
| `group:memory` | `memory_search`, `memory_get` | Semantic memory access |
| `group:web` | `web_search`, `web_fetch` | Web access |
| `group:ui` | `browser`, `canvas` | Browser/canvas automation |
| `group:automation` | `cron`, `gateway` | System automation |
| `group:messaging` | `message` | Channel messaging |
| `group:nodes` | `nodes` | Node management |
| `group:openclaw` | All built-in tools | Everything |

---

## All Available Tools

| Tool | Description | Notes |
|------|-------------|-------|
| `read` | Read file contents | Agent workspace only |
| `write` | Write file contents | Agent workspace only |
| `edit` | Edit file (search/replace) | Agent workspace only |
| `apply_patch` | Apply unified diff patch | Requires `tools.exec.applyPatch.enabled` |
| `exec` | Execute shell command | Runs on OpenClaw container |
| `bash` | Interactive bash session | Alternative to exec |
| `process` | Manage background processes | Start/stop/list |
| `sessions_list` | List sessions | Can filter by agent |
| `sessions_history` | Get session message history | By session key |
| `sessions_send` | Send message to agent session | Agent-to-agent messaging |
| `sessions_spawn` | Spawn a sub-agent session | Create child sessions |
| `session_status` | Get current session status | |
| `memory_search` | Search agent memory | Hybrid vector + BM25 |
| `memory_get` | Get specific memory entry | By key/path |
| `web_search` | Search the web | Requires search API key |
| `web_fetch` | Fetch URL content | HTTP GET with parsing |
| `cron` | Manage cron jobs | Create/update/remove schedules |
| `gateway` | Gateway configuration | Runtime config changes |
| `browser` | Browser automation | Puppeteer/CDP |
| `canvas` | Canvas operations | Canvas hosting |
| `nodes` | Node management | |
| `image` | Image processing | Vision input |
| `pdf` | PDF processing | |
| `message` | Send channel message | Telegram/Discord/etc. |
| `agents_list` | List configured agents | Discover other agents |

---

## Per-Agent Tool Overrides

Override tool access per-agent using `agents.list[].tools`:

### Deny Specific Tools
```json
{ "tools": { "deny": ["exec", "browser"] } }
```

### Allow Only Specific Tools
```json
{ "tools": { "allow": ["web_search", "web_fetch", "read", "sessions_send"] } }
```

### Using Groups
```json
{ "tools": { "deny": ["group:runtime", "group:ui"] } }
```

### Per-Model Overrides
```json
{
  "tools": {
    "byProvider": {
      "cerebras-llama-4-scout": { "profile": "coding", "deny": ["browser"] }
    }
  }
}
```

**Precedence:** `allow` takes priority over `deny`. The `profile` sets the base, then `allow`/`deny` modify it.

---

## Sub-Agent Spawning (sessions_spawn)

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `task` | string | Yes | Task description |
| `label` | string | No | Sub-agent label |
| `agentId` | string | No | Target agent ID |
| `model` | string | No | Model override |
| `thinking` | string | No | Thinking mode |
| `runTimeoutSeconds` | number | No | Execution timeout |
| `thread` | boolean | No | Thread mode |
| `mode` | string | No | `"run"` or `"session"` |
| `cleanup` | string | No | `"keep"` or `"delete"` |
| `sandbox` | string | No | `"inherit"` or `"require"` |

### Sub-Agent Session Keys
- Depth 0: `agent:<id>:main`
- Depth 1: `agent:<id>:subagent:<uuid>`
- Depth 2: `agent:<id>:subagent:<uuid>:subagent:<uuid>`

---

## Exec Configuration

| Key | Type | Default |
|-----|------|---------|
| `tools.exec.backgroundMs` | number | `10000` |
| `tools.exec.timeoutSec` | number | `1800` |
| `tools.exec.cleanupMs` | number | `1800000` |
| `tools.exec.notifyOnExit` | boolean | `true` |
| `tools.exec.host` | string | `"sandbox"` |
| `tools.exec.security` | string | allowlist |
| `tools.exec.ask` | string | `"on-miss"` |
| `tools.exec.safeBins` | array | — |
| `tools.exec.safeBinTrustedDirs` | array | `/bin`, `/usr/bin` |
| `tools.exec.applyPatch.enabled` | boolean | `false` |

---

## Web Configuration

### Search
| Key | Type | Default |
|-----|------|---------|
| `tools.web.search.enabled` | boolean | `true` |
| `tools.web.search.provider` | string | auto (Brave, Gemini, Grok, Kimi, Perplexity) |
| `tools.web.search.apiKey` | string | — |
| `tools.web.search.maxResults` | number | `5` |
| `tools.web.search.timeoutSeconds` | number | `30` |

### Fetch
| Key | Type | Default |
|-----|------|---------|
| `tools.web.fetch.enabled` | boolean | `true` |
| `tools.web.fetch.maxChars` | number | `50000` |
| `tools.web.fetch.maxResponseBytes` | number | `2000000` |
| `tools.web.fetch.timeoutSeconds` | number | `30` |
| `tools.web.fetch.readability` | boolean | `true` |
| `tools.web.fetch.firecrawl.enabled` | boolean | `true` |

---

## Loop Detection

| Key | Type | Default |
|-----|------|---------|
| `tools.loopDetection.enabled` | boolean | `false` |
| `tools.loopDetection.historySize` | number | `30` |
| `tools.loopDetection.warningThreshold` | number | `10` |
| `tools.loopDetection.criticalThreshold` | number | `20` |
| `tools.loopDetection.globalCircuitBreakerThreshold` | number | `30` |

---

## Media Configuration

| Key | Type | Default |
|-----|------|---------|
| `tools.media.concurrency` | number | `2` |
| `tools.media.audio.enabled` | boolean | `true` |
| `tools.media.audio.maxBytes` | number | `20971520` (20MB) |
| `tools.media.video.enabled` | boolean | `true` |
| `tools.media.video.maxBytes` | number | `52428800` (50MB) |

---

## Spawn Attachments

| Key | Type | Default |
|-----|------|---------|
| `tools.sessions_spawn.attachments.enabled` | boolean | `false` |
| `tools.sessions_spawn.attachments.maxTotalBytes` | number | `5242880` |
| `tools.sessions_spawn.attachments.maxFiles` | number | `50` |
| `tools.sessions_spawn.attachments.maxFileBytes` | number | `1048576` |
