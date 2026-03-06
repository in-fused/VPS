# Post-Deployment Multi-Agent Streamlining Plan

## Revised Scope (after code exploration)

**Removed from scope:**
- Loop node iteration — **already works**. `WorkflowExecutor` handles `_loop: true` and re-runs downstream subgraph per item.
- Cron jobs UI — **already exists**. Per-agent cron popover in Teams view with job list, Run Now, Remove buttons.

**Remaining 5 items, bundled into 3 phases:**

---

## Phase 1: Agent Visibility & Governance Wiring
*Goal: Make agent activity reliable and automatically scored*

### 1A. Reinforce Activity Logging in Agent Prompts
**Problem:** Agents skip logging despite MANDATORY directives in SOUL.md/BOOTSTRAP.md.
**Root cause:** The instruction is buried deep in long prompts. Agents deprioritize it.
**Fix:**
- `scripts/seed-agent-workspaces.js`: Add a `BOOTSTRAP.md` post-task checklist that's impossible to ignore — make it the LAST thing in the file so it's freshest in context
- Add a concrete JSON template (copy-paste ready) so agents don't have to construct the format from memory
- Add a negative reinforcement line: "If log.json has no entry for your task, governance scores you 0 for it"
- Consider adding a HEARTBEAT.md enhancement: leads audit their team's log entries periodically

### 1B. Wire Governance to OpenClaw Chat Events (Auto-Record)
**Problem:** `recordTask()` is called manually at chat completion but doesn't capture token usage, response time, or task type from OpenClaw's actual event data.
**Fix:**
- In the `sessions` store streaming handler (`app.js`), extract `usage` from `state: "final"` events and pass to `recordTask()`:
  - `tokens` from `event.usage.totalTokens` (or sum of input+output)
  - `responseTimeMs` from elapsed time between send and final
  - `success: true` for final, `success: false` for error/aborted
- Ensure Route 2 (LiteLLM SSE) fallback also records tasks with available data
- Wire staging approvals/rejections to governance (check if already done — exploration showed lines 3591, 3615)

### 1C. Evaluate Governance Un-Pause
**Problem:** Governance is paused — stats tracked but no automatic tier changes or lead promotions.
**Fix:**
- Review the pause reason (likely caution during deployment debugging)
- Add a "soft un-pause" mode: enable tier changes but require owner confirmation for lead promotions (not fully automatic)
- OR: simply un-pause now that the system is stable, since the owner can re-pause from the UI

**Files modified:** `scripts/seed-agent-workspaces.js`, `workspace/js/app.js`

---

## Phase 2: Scheduled Workflow Triggers
*Goal: Wire the Trigger node's "Scheduled" type to OpenClaw's cron system*

### 2A. Wire Trigger Node to Cron RPC
**Problem:** Trigger node has Scheduled/Webhook/On Event in the UI dropdown but only Manual actually works. Cron system exists separately.
**Fix:**
- In `workspace/js/workflow.js` Trigger node:
  - When trigger type is "Scheduled", add a cron expression widget (text input)
  - Add a "Save Schedule" button widget that calls `Alpine.store('cron').addQuick()` with the workflow's agent and the cron expression
  - The cron job payload sends `EXECUTE_WORKFLOW:{id}` to the appropriate team lead
- In the `WorkflowExecutor`:
  - When a workflow has a Scheduled trigger, `run()` should register/update the cron job
  - When deleted, remove the associated cron job
- The cron job itself uses `systemEvent` payload kind, targeting the lead's main session

### 2B. Show Cron-Linked Workflows in Trigger Node
- When loading a workflow with a Scheduled trigger, check if a matching cron job exists and show its status (active/paused, last run, next run)
- Add ability to pause/resume the schedule from the Trigger node properties

**Files modified:** `workspace/js/workflow.js`, `workspace/js/app.js` (cron store integration)

---

## Phase 3: Tool Node & Results Viewer
*Goal: Upgrade Tool node from NL prompt to structured invocation, polish results display*

### 3A. Upgrade Tool Node to Structured Tool Invocation
**Problem:** Tool node sends NL prompts like "Please search the web for X" to an agent, hoping they use the right tool. No structured invocation, no guaranteed tool use.
**Fix:**
- Redesign Tool node `runAsync()` to use OpenClaw chat with explicit tool-use instructions:
  - **Web Search**: Send chat with explicit instruction to use `web_search` tool, parse result from tool output
  - **Code Execution**: Send with instruction to use `exec` tool with the provided command
  - **File Read/Write**: Send with instruction to use `read`/`write` tools
  - **Shell Access**: Send with instruction to use `exec` tool
  - **Web Browser**: Send with instruction to use `browser` tool
- Extract structured results from the agent's tool_result content blocks (already parsed by `extractMessageText`)
- Add timeout per tool type (web search: 30s, code exec: 60s, file ops: 15s)
- Keep the NL fallback for Route 2 (direct LiteLLM, no tools available)

### 3B. Polish Workflow Results Viewer
**Problem:** Results display is a raw JSON dump in a `<pre>` block. Not useful on mobile.
**Fix:**
- Replace JSON dump with structured cards:
  - Each output node gets its own card with label, result text, and timestamp
  - Success/failure status with color coding
  - Collapsible detail for long outputs
- Add "Results History" — show last N results per workflow (not just the most recent)
- Mobile-optimized: cards stack vertically, touch-friendly expand/collapse
- Add a "Results" tab in the workflow sidebar (alongside the existing workflow list)

**Files modified:** `workspace/js/workflow.js`, `workspace/index.html`, `workspace/css/styles.css`

---

## Execution Order & Rationale

**Phase 1 first** because:
- Visibility is prerequisite for trusting autonomous agents
- Small, focused changes to prompt files + minor app.js wiring
- Immediately improves the owner's "come back and see what happened" experience

**Phase 2 second** because:
- Scheduling enables true background autonomy (the PRIMARY GOAL)
- Builds on Phase 1 (scheduled workflows generate activity logs and governance scores)
- Moderate complexity, contained to Trigger node + cron store

**Phase 3 last** because:
- Highest complexity, largest blast radius
- Tool node changes affect all workflow executions
- Results viewer is cosmetic polish — functional baseline already exists
- Can be deferred if Phase 1+2 deliver enough value

## Risk Notes
- All UI changes must be mobile-tested (iPhone PWA)
- Governance un-pause needs owner input (ask before enabling)
- Tool node changes should be backward-compatible (existing NL workflows still work)
- Cron integration needs error handling for when OpenClaw WS is disconnected
