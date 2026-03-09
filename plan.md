# Agent Optimization — Top 7 Priorities: Phased Implementation Plan

> **Scope:** All changes target `scripts/patch-openclaw-config.js`, `scripts/seed-agent-workspaces.js`, and `workspace/js/app.js`. No new services, no new dependencies. Each phase is independently deployable and testable.

---

## Phase 1: Per-Agent Tool Restrictions
**Priority:** #1 — Biggest governance & security win
**Risk:** Medium (bad config = crash loop)
**Files:** `scripts/patch-openclaw-config.js`

### What
OpenClaw supports per-agent `tools.allow` / `tools.deny` via `agents.list[].tools`. Currently all 8 agents get `tools.profile = 'full'` with identical capabilities. Scribe/Chronicler (documentation writers) don't need `exec` or `browser`. Lead (orchestrator) doesn't need `browser`.

### Changes
Add a `TOOL_RESTRICTIONS` map in `patch-openclaw-config.js` alongside `MODEL_MAP`. During the agent list iteration (lines 276-291), apply per-agent tool deny lists:

```
TOOL_RESTRICTIONS = {
  'lead':       { deny: ['browser'] },
  'codecraft':  {},                          // Full access (developer)
  'scout':      { deny: ['exec'] },          // Research only, web_fetch is sufficient
  'scribe':     { deny: ['exec', 'browser'] }, // Writes docs, no shell/browser needed
  'ops-lead':   { deny: ['browser'] },
  'builder':    {},                          // Full access (infra developer)
  'sentinel':   {},                          // Full access (security needs exec for auditing)
  'chronicler': { deny: ['exec', 'browser'] }, // Writes docs, no shell/browser needed
}
```

In the agent list iteration, add:
```javascript
if (TOOL_RESTRICTIONS[agent.id]) {
  agent.tools = agent.tools || {};
  if (TOOL_RESTRICTIONS[agent.id].deny) {
    agent.tools.deny = TOOL_RESTRICTIONS[agent.id].deny;
  }
}
```

### Verification
- Deploy → check `docker compose exec openclaw cat /home/node/.openclaw/openclaw.json | jq '.agents.list[] | {id, tools}'`
- Test: Scribe session → try `exec ls` → should be denied
- Test: CodeCraft session → try `exec ls` → should succeed
- If crash loop: check OpenClaw logs for "unexpected property" — may need to verify `agent.tools.deny` is a valid key (vs `agent.tools.profile`)

### Rollback
Remove the `TOOL_RESTRICTIONS` block and the iteration addition. Restart.

---

## Phase 2: Lighter Model for Cron Jobs
**Priority:** #2 — ~80% token savings on routine checks
**Risk:** Low (prompt-level change only)
**Files:** `scripts/seed-agent-workspaces.js`

### What
Every agent's inbox-check cron (*/5 * * * *) runs on their primary model. Lead's cron uses cerebras-llama-3.3-70b to check "do I have messages?" — wasteful. OpenClaw cron `payload` can specify `kind: 'agentTurn'` with a `session: 'isolated'` target, but model selection for cron is determined by the agent's primary model.

### Approach
Instead of changing the cron's model (which OpenClaw doesn't support per-job), modify BOOTSTRAP.md to instruct agents to create their inbox-check cron with minimal processing:

1. In `BOOTSTRAP.md`, change the cron payload from `kind: 'systemEvent'` (which triggers a full agent turn on the main session) to `kind: 'agentTurn'` with `session: 'isolated'`. This runs the cron in an isolated session that doesn't pollute the main conversation.

2. Add explicit instructions in BOOTSTRAP.md: "For inbox-check cron: read sessions_list ONLY. If no unread messages, do NOTHING (no summary, no log, no response). If unread messages exist, read them and execute."

3. The real token savings come from reducing the cron prompt size and eliminating unnecessary responses on empty inboxes.

### Alternative (if OpenClaw adds per-cron model)
Monitor [GitHub Issue #7926](https://github.com/openclaw/openclaw/issues/7926) — if per-cron model override ships, switch inbox-check to `cerebras-llama-4-scout` (8b equivalent, ~5x cheaper per-token).

### Verification
- After deploy, check cron job count: `docker compose exec openclaw wget -qO- http://localhost:18789/healthz`
- Monitor OpenClaw logs for 30 min — cron should run silently when no messages
- Token usage should drop noticeably in LiteLLM dashboard

---

## Phase 3: Add `reserveTokensFloor: 40000` to Compaction Config
**Priority:** #3 — Prevents context balloon on long sessions
**Risk:** Low (additive config)
**Files:** `scripts/patch-openclaw-config.js`

### What
Currently we set `softThresholdTokens = 50000` (line 149) to prevent the aggressive compaction loop from v2026.3.1. But we don't set `reserveTokensFloor` — it defaults to 20000. With Gemini models (1M context window), sessions can balloon to enormous sizes before compaction triggers. Setting `reserveTokensFloor: 40000` triggers compaction earlier, giving more headroom for the summarization API call.

### Changes
In `patch-openclaw-config.js`, after line 149, add:
```javascript
config.agents.defaults.compaction.reserveTokensFloor = 40000;
```

### Verification
- Deploy → verify config: `docker compose exec openclaw cat /home/node/.openclaw/openclaw.json | jq '.agents.defaults.compaction'`
- Expected output should show both `softThresholdTokens: 50000` and `reserveTokensFloor: 40000`
- Monitor for 24h — agents should compact before hitting context limits

### Rollback
Remove the single line. Restart.

---

## Phase 4: Upgrade Sentinel Model
**Priority:** #4 — Stronger reasoning for security analysis
**Risk:** Low (model swap only)
**Files:** `scripts/patch-openclaw-config.js`

### What
Sentinel currently uses `cerebras-llama-4-scout` (same as subagent default). For security analysis, monitoring, and audit tasks, a 70B model provides significantly better reasoning. `cerebras-llama-3.3-70b` is also free (1M TPD via Cerebras) and is already used by Lead, CodeCraft, and Ops Lead.

### Changes
In `MODEL_MAP` (line 272):
```javascript
// Before:
'sentinel': 'litellm/cerebras-llama-4-scout',
// After:
'sentinel': 'litellm/cerebras-llama-3.3-70b',
```

Also update the agent seed (line 227):
```javascript
model: { primary: 'litellm/cerebras-llama-3.3-70b' },
```

And update CLAUDE.md agent table and `SHARED_AGENTS` in `seed-agent-workspaces.js`.

### Rate Limit Impact
- Cerebras: 1M TPD shared across all users of that model
- Currently 3 agents use cerebras-llama-3.3-70b (Lead, CodeCraft, Ops Lead)
- Adding Sentinel makes it 4 agents on the same model
- 1M TPD / 4 agents = 250K TPD each — still very generous
- If rate limits become an issue, Sentinel's tasks are less frequent than Lead/CodeCraft

### Verification
- Deploy → check agent config: `docker compose exec openclaw cat /home/node/.openclaw/openclaw.json | jq '.agents.list[] | select(.id=="sentinel") | .model'`
- Test: Send Sentinel a security audit task → verify stronger analysis quality

---

## Phase 5: ACK Protocol for Task Delegation
**Priority:** #5 — Reduces undetected delegation failures from 2h to ~10min
**Risk:** Low (prompt-level change only)
**Files:** `scripts/seed-agent-workspaces.js`

### What
When Lead delegates to a specialist, the specialist's inbox-check cron picks it up within 5 minutes. But if the specialist fails silently (error, rate limit, misunderstanding), the Lead doesn't know for up to 2 hours (next heartbeat cycle). Adding an ACK protocol means specialists immediately confirm receipt.

### Changes
Update `SHARED_TOOLS` in `seed-agent-workspaces.js` to add ACK protocol:

```markdown
## ACK Protocol — Task Acknowledgment
When you receive a delegated task from another agent:
1. IMMEDIATELY reply with `ACK:{taskId}` — confirms receipt and intention to execute
2. Begin executing the task
3. When done, reply with results as normal
4. If you CANNOT execute (missing context, rate limit, scope issue):
   Reply with `NACK:{taskId} reason: {explanation}` within 2 minutes

If Lead/Ops Lead sends a task and receives no ACK within 10 minutes,
they will re-delegate to another specialist or escalate.
```

Update `BOOTSTRAP.md` for leads to add ACK monitoring:

```markdown
## Delegation Monitoring
After delegating a task via sessions_send:
1. Wait up to 10 minutes for ACK
2. If no ACK: check agent's session for errors, then re-delegate or escalate
3. If NACK: read the reason and either fix the issue or delegate to another agent
```

### Verification
- Deploy → send Lead a task that requires delegation
- Check Lead's session — should see delegation message
- Check specialist's session — should see ACK within 5 minutes
- This is a behavioral change driven by prompts — no config validation needed

---

## Phase 6: Oracle ARM Usage Patterns in SOUL.md
**Priority:** #6 — Underutilized 24GB ARM instance
**Risk:** Low (prompt-level guidance)
**Files:** `scripts/seed-agent-workspaces.js`

### What
The Oracle ARM instance (4 OCPU / 24GB) is referenced in MEMORY.md but agents currently underuse it. Adding explicit usage patterns in SOUL.md gives agents concrete tasks they can offload to the ARM instance.

### Changes
Update SOUL.md for specific agents:

**CodeCraft SOUL.md** — Add:
```markdown
## Oracle ARM Dev Sandbox
You have SSH access to Oracle ARM (4 OCPU / 24GB). Use it for:
- Running npm install / npm test for dependency-heavy projects
- Building Docker images (ARM architecture)
- Long-running test suites that would timeout on EC2
- Hosting temporary dev servers for testing
Bridge commands: see TOOLS.md Oracle section
```

**Sentinel SOUL.md** — Add:
```markdown
## Oracle ARM Monitoring
You have SSH access to Oracle ARM (4 OCPU / 24GB). Use it for:
- Running security scans (nmap, nikto) against staging environments
- Monitoring Ollama model health and memory usage
- Checking Oracle Cloud networking and firewall rules
- Running automated audit scripts on a schedule
Bridge commands: see TOOLS.md Oracle section
```

**Builder SOUL.md** — Add:
```markdown
## Oracle ARM Infrastructure
You have SSH access to Oracle ARM (4 OCPU / 24GB). Use it for:
- Deploying and testing infrastructure changes before EC2
- Managing Ollama models (pull, remove, update)
- Running Ansible/Terraform for Oracle Cloud resources
- Testing network connectivity between Oracle and EC2
Bridge commands: see TOOLS.md Oracle section
```

### Verification
- Deploy → check workspace files: `docker compose exec openclaw cat /home/node/.openclaw/workspace-CodeCraft/SOUL.md | grep -A5 "Oracle ARM"`
- Send CodeCraft a task that could use Oracle: "Run the project's test suite on Oracle ARM" → verify it uses SSH bridge

---

## Phase 7: Leverage Unused OpenClaw Features
**Priority:** #7 — Free capabilities currently unused
**Risk:** Low-Medium (new RPC calls, test before production)
**Files:** `workspace/js/openclaw-client.js`, `workspace/js/app.js`, `scripts/seed-agent-workspaces.js`

### Sub-features (implement incrementally):

#### 7a. `chat.inject` for Silent Context Updates
**Already wired** in `openclaw-client.js` (line 616). Currently only used by workflow-bridge.js for WRITE_FILES messages. Can be used for:
- Injecting real-time system status into agent sessions without triggering a turn
- Pushing governance score updates as labeled context
- Silent refresh of reference doc pointers when config changes

**Changes:** Add a `refreshAgentContext()` method to app.js that injects current system status into active agent sessions via `chat.inject` with a `'system-status'` label. Wire to the periodic health check (every 60s).

#### 7b. `sessions.compact` for Manual Memory Management
**Not yet wrapped** in openclaw-client.js. Available via base `request()` method.

**Changes:**
1. Add `compactSession(sessionKey)` wrapper to openclaw-client.js
2. Add "Compact" button to the chat session dropdown in index.html
3. Useful when a session gets very long and the user wants to force a memory flush

#### 7c. Per-Job Model Selection (Future)
OpenClaw doesn't currently support per-cron-job model selection. Monitor [Issue #7926](https://github.com/openclaw/openclaw/issues/7926). When available, switch cron jobs to lighter models.

#### 7d. OTEL Tracing (Future)
OpenClaw supports OTEL export but requires an OTEL collector endpoint. Low priority for now — adds observability but requires additional infrastructure (Jaeger/Tempo/etc.). Can be added via:
```javascript
config.telemetry = { otel: { enabled: true, endpoint: 'http://otel-collector:4318' } };
```
Not recommended until we have a collector running.

### Verification
- 7a: Check agent session history — should see `system-status` labeled messages
- 7b: Click "Compact" on a long session → verify session length decreases
- 7c/7d: Future — track upstream issues

---

## Deployment Order

Phases are ordered by impact/risk ratio. Each phase is a separate commit:

```
Phase 1 → Phase 3 → Phase 4 → Phase 2 → Phase 5 → Phase 6 → Phase 7a → Phase 7b
```

**Why this order:**
1. Phase 1 (tool restrictions) — highest governance impact, deploy first
2. Phase 3 (reserveTokensFloor) — one-line config, easy win
3. Phase 4 (Sentinel upgrade) — model swap, immediate quality improvement
4. Phase 2 (lighter cron) — prompt changes, needs monitoring
5. Phase 5 (ACK protocol) — behavioral change, needs observation
6. Phase 6 (Oracle patterns) — guidance only, observe adoption
7. Phase 7a/7b — feature additions, lowest priority

Each phase should be deployed individually, monitored for 30 min, then proceed to next.

---

## Deploy Commands (per phase)

📱 iOS/SSM:
```
cd /home/VPS && sudo git config --global --add safe.directory /home/VPS && sudo git pull origin claude/webhook-trigger-support-LaTkg && sudo bash scripts/deploy.sh
```

🖥️ Desktop/SSH:
```bash
cd /home/VPS
sudo git config --global --add safe.directory /home/VPS
sudo git pull origin claude/webhook-trigger-support-LaTkg
sudo bash scripts/deploy.sh
```

**Quick verify after each phase:**

📱 iOS/SSM:
```
cd /home/VPS && sudo docker compose logs --tail=30 openclaw | head -30
```

🖥️ Desktop/SSH:
```bash
cd /home/VPS
sudo docker compose logs --tail=30 openclaw
```

**Check agent config after deploy:**

📱 iOS/SSM:
```
cd /home/VPS && sudo docker compose exec openclaw cat /home/node/.openclaw/openclaw.json | python3 -m json.tool | tail -50
```

🖥️ Desktop/SSH:
```bash
cd /home/VPS
sudo docker compose exec openclaw cat /home/node/.openclaw/openclaw.json | python3 -m json.tool | tail -50
```
