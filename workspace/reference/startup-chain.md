# Startup Chain Reference
> How autonomous background work starts and runs 24/7.
> Read this when debugging agent bootstrap, cron failures, or understanding why agents do (or don't) wake up.

## The 6-Layer Chain

Every deploy or container restart triggers this exact sequence:

```
deploy.sh
  └─→ docker compose up -d
        └─→ OpenClaw container starts
              └─→ openclaw-entrypoint.sh (PID 1)
                    ├── [1] patch-openclaw-config.js — patches openclaw.json
                    ├── [2] seed-agent-workspaces.js — filesystem seed (all 7 files × 8 agents)
                    ├── [3] exec node openclaw.mjs gateway — OpenClaw starts (~50s to healthy)
                    └── [4] background: sleep 45 → seed-via-rpc.js → sleep 5 → auto-kickoff.js
                                                                           │
                                                                           └─→ Sends KICKOFF_MSG to lead + ops-lead
                                                                                 │
                                                                                 ├─→ Lead reads BOOTSTRAP.md → Phase -1 (load context) → Phase 0 (verify tools, message team, set up cron)
                                                                                 └─→ Ops Lead reads BOOTSTRAP.md → same sequence
                                                                                       │
                                                                                       └─→ Each specialist gets a task message from their lead
                                                                                             │
                                                                                             └─→ Specialist inbox-check cron fires (0 */2 * * *) → picks up task → executes → stages output
```

## Layer Details

### Layer 1: Config Patching (`patch-openclaw-config.js`)
**When:** Immediately on container start (before OpenClaw gateway)
**What:** Patches `openclaw.json` with:
- Gateway: port 18789, bind "lan", basePath "/openclaw/"
- Auth: password mode, device auth disabled, insecure auth allowed
- Provider: "litellm" at http://litellm:4000/v1 (only provider, prevents anthropic fallback)
- Tools: profile "full" (v2026.3.2 default is "messaging" — would remove exec/read/write/edit)
- Cron: enabled, maxConcurrentRuns=3
- Compaction: softThresholdTokens=50000 (prevents aggressive compaction loop)
- Agent tool restrictions: per-agent deny lists (lead/ops-lead: no browser, scout: no exec, scribe/chronicler: no exec+browser)
- Invalid key scrubbing: removes keys that cause crash loops (identity.description, supportsDeveloperRole, etc.)

**If it fails:** OpenClaw starts with existing config. Log: `[entrypoint] ERROR: config patch failed`

### Layer 2: Filesystem Seed (`seed-agent-workspaces.js`)
**When:** After config patch, before OpenClaw gateway starts
**What:** Writes 7 files to each agent's workspace directory (`~/.openclaw/workspace-<Name>/`):
- SOUL.md (agent-specific identity and rules)
- USER.md (owner profile — shared)
- AGENTS.md (team structure — shared)
- MEMORY.md (infrastructure context — shared)
- TOOLS.md (tool reference + permissions — per-agent permissions injected)
- HEARTBEAT.md (periodic checklist — lead vs specialist variant)
- BOOTSTRAP.md (startup sequence — lead vs specialist variant)

**All 7 files are force-overwritten** on every restart. Agents write persistent notes to `memory/*.md` — those are never touched.

**Cache:** Also writes to `/tmp/workspace-seed-cache/<agentId>/` for the RPC seeder to read later.

### Layer 3: Gateway Start (`openclaw.mjs gateway`)
**When:** After filesystem seed
**What:** OpenClaw gateway process starts. Takes ~50s to become healthy (Doctor changes + config overwrite + gateway bind).
**Health check:** `wget -qO- http://localhost:18789/openclaw/`

**During startup:** OpenClaw may overwrite workspace files with its own defaults. This is why Layer 4 exists.

### Layer 4: RPC Seed + Kickoff (background, 45s delay)
**When:** 45s after gateway start (background process)
**What:**
1. `seed-via-rpc.js` — waits for OpenClaw health, then pushes all workspace files via `agents.files.set` RPC. This makes them "operator-managed" so OpenClaw won't overwrite them again.
2. `auto-kickoff.js` — connects via WebSocket, sends KICKOFF_MSG to `agent:lead:main` and `agent:ops-lead:main`

**The kickoff message** is a 6-step directive:
0. READ workspace files first (AGENTS.md, TOOLS.md, MEMORY.md)
1. Run BOOTSTRAP.md Phase 0 (verify tools)
2. Set up inbox-check cron
3. Read staging + activity
4. Execute or create work
5. Message team with specific task assignments

**If kickoff fails:** Agents still have cron jobs from previous runs (if the volume wasn't reset). They'll wake up on the next cron tick.

### Layer 5: Lead Bootstrap (`BOOTSTRAP.md`)
**When:** Triggered by kickoff message
**What:** Lead executes BOOTSTRAP.md phases:
- **Phase -1:** Load context — read AGENTS.md, TOOLS.md, MEMORY.md, reference docs
- **Phase 0:** Verify tools (read, write, comms), log online, set up inbox-check cron (0 */2 — every 2h, dedup first), set up heartbeat cron (0 */4 — every 4h), message each team member with a specific task
- **Phase 1:** Initial output sprint — produce at least 1 staged deliverable, check prompt evolution state

### Layer 6: Agent Autonomy Loop (ongoing, 24/7)
**When:** After bootstrap, runs forever
**What:** Two interlocking cron jobs per agent:
- **Inbox-check** (0 */2 * * *, every 2h): Check for delegated tasks, execute them, stage output, confirm back. If no tasks, create work. Dedup guard: agents check `cron(action: "list")` before creating.
- **Heartbeat** (0 */4 * * *, every 4h, leads only): Check staging count, identify silent agents, assign more work, verify delegations.

**The autonomy loop is self-sustaining.** Even if an agent's session is reset, the cron jobs persist (they're server-side). The next cron tick wakes the agent, which reads BOOTSTRAP.md and re-establishes the loop.

## Timing (approximate)

| Event | Time After `docker compose up` |
|-------|-------------------------------|
| Config patched | +2s |
| Filesystem seed complete | +5s |
| OpenClaw gateway starts | +5s |
| OpenClaw healthy | +50-60s |
| RPC seed complete | +55-65s |
| Kickoff messages sent | +60-70s |
| Leads start bootstrap | +65-75s |
| Team members get first tasks | +70-80s |
| First inbox-check cron fires | +5min |
| First deliverables staged | +10-15min |

## Failure Modes & Recovery

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Agents never wake up | Kickoff failed or cron not set up | Check `docker compose logs openclaw` for `[kickoff]` lines. Manual: send a message to lead via Mission Control chat. |
| Agents wake but can't use tools | `tools.profile` not set to "full" | Check `patch-openclaw-config.js` ran. Look for `[config-patch]` in logs. |
| Workspace files are stale | RPC seed failed | Check for `[rpc-seed]` in logs. Manual: restart OpenClaw container. |
| Delegation doesn't work | Inbox-check cron missing | In Mission Control chat, tell the agent: "Set up your inbox-check cron. See BOOTSTRAP.md." |
| Agents compacting every 2-3 min | softThresholdTokens not set | Verify entrypoint sets compaction threshold. Check config. |
| WebSocket auth fails | Password mismatch or device auth enabled | Verify OPENCLAW_PASSWORD in .env matches. Check entrypoint disables device auth. |

## Key Insight: Why "Just Redeploy" Works

The entire chain is idempotent:
- Config patching is overwrite-based (not append)
- Workspace files are force-overwritten every restart
- RPC seed uses operator-managed files (won't be overwritten by OpenClaw)
- Kickoff runs fresh every restart (no lock file)
- Cron jobs persist across restarts (server-side)

So deploying = pulling new code + restarting containers = full re-initialization of the agent swarm. No manual steps needed.
