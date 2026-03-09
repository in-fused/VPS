# OpenClaw Workspace Files Reference
> Auto-generated from docs.openclaw.ai. Do not edit manually.
> Last updated: 2026-03-09

---

## Workspace Location

Each agent has a workspace at `~/.openclaw/workspace-<name>/` (e.g., `/home/node/.openclaw/workspace-Lead/`).

OpenClaw reads workspace files on every agent turn and includes their content in the system prompt.

---

## Workspace Files

| File | Purpose | Loaded | Max Size |
|------|---------|--------|----------|
| `SOUL.md` | Agent identity, role, personality, rules | Always | 20,000 chars |
| `USER.md` | User/owner profile and preferences | Always | 20,000 chars |
| `AGENTS.md` | Team structure, other agents, routing | Always | 20,000 chars |
| `IDENTITY.md` | Agent self-description (agent-writable) | Always | 20,000 chars |
| `TOOLS.md` | Available tools, usage instructions | Always | 20,000 chars |
| `HEARTBEAT.md` | Periodic check-in behavior | Always | 20,000 chars |
| `BOOTSTRAP.md` | Startup sequence, initialization tasks | On first turn / bootstrap | 20,000 chars |
| `BOOT.md` | Additional boot instructions | On bootstrap | 20,000 chars |
| `MEMORY.md` | Project context, reference pointers | Always | 20,000 chars |
| `memory/*.md` | Persistent daily logs (agent-writable) | On memory search | No limit |

### Size Limits
- **Per file:** `agents.defaults.bootstrapMaxChars` (default: 20,000 characters)
- **Total across all files:** `agents.defaults.bootstrapTotalMaxChars` (default: 150,000 characters)
- Files exceeding limits are truncated with a warning

### Loading Order
1. `SOUL.md` — core identity (loaded first, highest priority)
2. `USER.md` — user context
3. `AGENTS.md` — team awareness
4. `IDENTITY.md` — self-description
5. `TOOLS.md` — tool instructions
6. `HEARTBEAT.md` — periodic behavior
7. `MEMORY.md` — project context
8. `BOOTSTRAP.md` / `BOOT.md` — startup sequence (loaded on bootstrap only)

---

## File Details

### SOUL.md
The primary identity file. Defines:
- Agent name, role, and personality
- Core rules and constraints
- Behavioral guidelines
- Protocol instructions (ACK, delegation, etc.)
- Co-authoring examples

**OpenClaw creates a default SOUL.md** during agent initialization. Our seeder overwrites it twice (before start + 30s after) to ensure our custom content persists.

### USER.md
Owner/user profile shared across all agents:
- Communication preferences
- Mobile-first workflow context
- Timezone and availability

### AGENTS.md
Team structure and collaboration rules:
- Agent hierarchy (teams, leads, specialists)
- Delegation chains
- Competition/governance rules
- Cross-team collaboration protocol

### IDENTITY.md
Agent-writable self-description. Unlike SOUL.md (which is force-overwritten), agents can update their own IDENTITY.md to refine their self-understanding over time.

### TOOLS.md
Tool usage instructions:
- Available tools and syntax
- Inbox-check cron setup
- EXECUTE_WORKFLOW parsing
- Collaboration protocol
- Oracle ARM bridge commands

### HEARTBEAT.md
Periodic check-in behavior:
- What to check on each heartbeat
- Reporting format
- Escalation rules
- Extended version for leads (includes delegation monitoring)

### BOOTSTRAP.md
Startup sequence executed on first turn:
- Verify tool access
- Set up cron jobs
- Check for pending work
- Delegate or find tasks

**OpenClaw creates its own default BOOTSTRAP.md.** Our seeder overwrites it.

### MEMORY.md
Project context and reference pointers:
- Infrastructure overview
- File paths and conventions
- Oracle ARM connection details
- Reference doc pointers

### memory/*.md
Persistent daily logs written by agents:
- Format: `YYYY-MM-DD.md`
- Contains: task logs, decisions, learnings
- **Never touched by seeder** — persists across restarts
- Searchable via `memory_search` tool (hybrid vector + BM25)

---

## Workspace Operations via RPC

| Method | Description |
|--------|-------------|
| `agents.files.list` | List all files in agent workspace |
| `agents.files.get` | Read a specific workspace file |
| `agents.files.set` | Write/overwrite a workspace file |

---

## Agent Workspace Directories

| Agent | Workspace Path |
|-------|---------------|
| Lead | `~/.openclaw/workspace-Lead/` |
| CodeCraft | `~/.openclaw/workspace-CodeCraft/` |
| Scout | `~/.openclaw/workspace-Scout/` |
| Scribe | `~/.openclaw/workspace-Scribe/` |
| Ops Lead | `~/.openclaw/workspace-Ops Lead/` |
| Builder | `~/.openclaw/workspace-Builder/` |
| Sentinel | `~/.openclaw/workspace-Sentinel/` |
| Chronicler | `~/.openclaw/workspace-Chronicler/` |

---

## Memory System

### Semantic Search
The `memory_search` tool uses hybrid vector + BM25 search across:
- `MEMORY.md` (project context)
- `memory/*.md` (daily logs)

### Embedding Provider
Auto-detected from available API keys. In our setup, OpenAI-compatible embeddings via LiteLLM master key.

### Memory Persistence
- Workspace files (SOUL, USER, etc.) → force-overwritten on restart
- `memory/*.md` → persistent, never touched by seeder
- `IDENTITY.md` → agent-writable, but seeder does overwrite if it exists in the seed set
