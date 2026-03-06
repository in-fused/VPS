# Mission Goal Prompts — Feed These to Future Sessions

## Status Summary

### Goal 1: Reliable Chat Pipeline — VERIFIED WORKING
Three-tier fallback is fully implemented in `workspace/js/app.js`:
- **Route 1** (OpenClaw WS): lines 2403-2498, 120s timeout + history recovery
- **Route 2** (LiteLLM SSE): lines 1936-2070, 2500-2568, 8 fallback models
- **Route 3** (Demo): lines 2572-2580, static placeholder

**Remaining work:**
- [ ] Verify reconnection after iOS backgrounding in real deployment
- [ ] Test rate limit cascade (429 → fallback models) under load
- [ ] Confirm `_retryViaOpenclaw` (line 1896) doesn't create duplicate responses

### Goal 2: Workflow Persistence — VERIFIED WORKING
Auto-save is active in `workspace/js/app.js` (lines 2622-2774):
- 5-second polling with change detection
- localStorage per workflow (`mc-workflow-{id}`)
- Canvas restore on navigation via `setDirty(true,true)` + `draw(true,true)`

**Remaining work:**
- [ ] Verify agent-created workflows render on canvas (LiteGraph `configure()` fix deployed?)
- [ ] Test workflow list ↔ canvas sync after page reload
- [ ] Confirm `workflowBridge` imports from `/workspace/agent-workflows/` correctly

---

## Future Session Prompts (copy-paste ready)

### Prompt 1: End-to-End Workflow Execution Verification
```
Verify end-to-end workflow execution in Mission Control. The workflow system
uses LiteGraph.js (workspace/js/workflow.js) with a WorkflowExecutor.

Test this chain: Trigger → Agent → Condition → Output

Specific checks:
1. Agent node correctly resolves model from agent config (line ~470 in workflow.js)
2. Agent node calls OpenClaw WS first, falls back to LiteLLM chat()
3. Condition node branching gates downstream (skips nodes when input is null)
4. Output node delivers to the right destination (Log/Chat Response/File)
5. WorkflowExecutor topological sort handles branches correctly

Files: workspace/js/workflow.js (~860 lines), workspace/js/app.js (workflows store at 2622)
```

### Prompt 2: Agent-Created Workflow Canvas Rendering
```
Agent-created workflows appear in the sidebar list but may not render on the
LiteGraph canvas. The fix was adding setDirty(true,true) + draw(true,true)
after workflowGraph.configure() in the workflows.load() method (app.js ~2705).

Verify:
1. workflow-bridge.js polls /workspace/agent-workflows/ and imports to localStorage
2. Imported workflows appear in workflows.list with correct metadata
3. Clicking an imported workflow loads nodes onto the canvas (not blank)
4. The canvas draws correctly after configure() — nodes visible, connections drawn
5. Auto-save kicks in after import (setupAutoSave called)

Files: workspace/js/workflow-bridge.js (~190 lines), workspace/js/app.js
```

### Prompt 3: Real Tool Execution in Workflow Nodes
```
Tool nodes in workflows are placeholders — they send natural language to OpenClaw
asking it to "use" the tool rather than invoking actual capabilities.

Upgrade the Tool node (workspace/js/workflow.js, mission/tool type) to:
1. Map tool names to actual OpenClaw tool invocations via WS RPC
2. Web Search → use web_search tool via chat.send with tool-specific prompt
3. Shell Access → use exec tool via chat.send
4. File Operations → use read/write tools
5. Fall back to current behavior if OpenClaw WS unavailable

The Tool node's runAsync() needs to construct a focused prompt that triggers
the specific tool, not a general "please use Web Search" message.
```

### Prompt 4: Loop Node Iteration
```
The Loop node (workspace/js/workflow.js, mission/loop type) splits input
into an array but does NOT iterate downstream nodes per-item.

Fix WorkflowExecutor to:
1. When a loop node outputs an array, re-run the downstream subgraph for each item
2. Track iteration index, pass individual items through connections
3. Collect all iteration outputs for the merge node
4. Handle nested loops (loop within loop) — probably depth-limit to 2

Current: Loop.runAsync() returns {item: array, index: 0, done: true}
Needed: Executor detects loop output, iterates downstream for each array element
```

### Prompt 5: Background Autonomy — Cron-Triggered Workflows
```
Connect Mission Control's scheduled triggers to OpenClaw's cron system.

Currently:
- Trigger node has a "Scheduled" option but it's UI-only (no backend)
- OpenClaw has cron.add/cron.list RPC methods (verified working)
- Agents can create cron jobs via the cron tool

Wire it up:
1. When saving a workflow with a "Scheduled" trigger, create a cron job via
   OpenClaw RPC that sends EXECUTE_WORKFLOW:{id} to the appropriate lead
2. Cron schedule picker UI in the trigger node properties panel
3. Show active cron jobs in the Workflows view (call cron.list RPC)
4. Allow canceling scheduled workflows (cron.remove)

Files: workspace/js/workflow.js (trigger node), workspace/js/app.js (workflows store),
workspace/js/openclaw-client.js (add getCronJobs, addCronJob methods)
```

### Prompt 6: P2P Verification Test
```
Verify full P2P agent communication is working after deployment.

Test procedure:
1. Open Mission Control, chat with Lead
2. Ask Lead to delegate a task to CodeCraft AND to Builder (cross-team)
3. Verify Lead uses sessions_send with correct sessionKey format
4. Verify CodeCraft receives the message and produces staged output
5. Verify Builder receives the message and produces staged output
6. Verify both confirm back to Lead with file paths
7. Verify Lead checks staging/index.json to verify deliverables
8. Check /workspace/agent-activity/log.json for all events

Expected: All 3 agents produce entries in staging/index.json and log.json.
Lead confirms to you what's ready and gives deploy command.
```

### Prompt 7: "While You Were Away" Report
```
Build the "While You Were Away" report in Mission Control.

Data source: /workspace/agent-activity/log.json (agents append events here)
Format: {events: [{time, level, type, message}, ...]}

UI:
1. Add an "Activity" or "Away Report" view to Mission Control sidebar
2. On load, fetch /workspace/agent-activity/log.json
3. Show events grouped by day, sorted newest-first
4. Filter by agent (createdBy), type (task-complete, system, error)
5. Color-code: green=task-complete, blue=system, red=error, yellow=staging-new
6. Mobile-optimized: cards, not tables. Tap to expand details.
7. "Clear" button to archive old events

Files: workspace/index.html (add view), workspace/js/app.js (add store/fetch),
workspace/css/styles.css (card styles)
```
</content>
</invoke>