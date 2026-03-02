# Initial Agent Prompts — First Conversations

> Copy-paste these into Mission Control Chat. Send Prompt 1 to **Lead**, Prompt 2 to **Ops Lead**.
> System prompts are auto-injected on first message — these are pure tasking, don't repeat org structure.

---

## How This Works

1. Open Mission Control → Chat → New Conversation → pick **Lead**
2. Paste **Prompt 1** below → Send
3. New Conversation → pick **Ops Lead**
4. Paste **Prompt 2** below → Send
5. Close the browser. Agents continue working via OpenClaw 24/7.
6. Come back later → check Staging, Activity Log, and chat history for results.

You do NOT need to message specialists directly. Leads delegate to their teams automatically.

---

## Prompt 1 — Lead (Core Team)

```
The system is live. All 8 agents deployed across two teams, LiteLLM routing 14 models, OpenClaw running 24/7. This is your first real session — everything starts now.

IMMEDIATE TASKS — delegate these to your team:

1. SELF-DISCOVERY (you): Run exec to explore your environment. Check what tools you have, read /workspace/ to see the shared volume structure, and verify you can reach CodeCraft, Scout, and Scribe via sessions_send. Report what you find.

2. CODECRAFT: Have them audit the Mission Control codebase at /workspace/js/ — specifically app.js, workflow.js, and openclaw-client.js. Look for bugs, dead code, security issues, or quick performance wins. Write findings to /workspace/staging/ for my review.

3. SCOUT: Research OpenClaw's cron tool capabilities and server-side agent workspace files (SOUL.md, AGENTS.md, IDENTITY.md, MEMORY.md). We currently inject system prompts client-side — I want to know if migrating to server-side workspace files would be better. Also research the OpenClaw provider docs at docs.openclaw.ai/providers/openai for any transport or compaction settings we should configure. Full report to /workspace/staging/.

4. SCRIBE: Create a "System Status" document covering: what's deployed, what's working, what needs work (reference the WORKFLOW SYSTEM section from your instructions). Put it in /workspace/staging/.

5. CRON SETUP: Create a daily cron job — check system health, summarize what happened in the last 24h, log to the activity log. This proves background autonomy works.

RULES OF ENGAGEMENT:
- I will close this browser and come back later. Keep working autonomously.
- Log ALL significant events to the activity log.
- Put ALL deliverables in /workspace/staging/ for my review.
- Start building a team rhythm: daily health checks, proactive improvements, honest competition with Platform Team.
- You're competing against Ops Lead's team. Governance scores are live. Prove Core Team delivers.

Confirm you can reach your team and tools, then get to work.
```

---

## Prompt 2 — Ops Lead (Platform Team)

```
The system is live. All 8 agents deployed, both teams competing on governance scores. You lead Platform Team. This is your first real session — establish your team's value from minute one.

IMMEDIATE TASKS — delegate these to your team:

1. SELF-DISCOVERY (you): Run exec to explore your environment. Verify tool access, read /workspace/, confirm you can reach Builder, Sentinel, and Chronicler via sessions_send. Report findings.

2. SENTINEL: Full security and health audit. Check for exposed secrets in Docker logs, verify Caddy TLS config, review container memory usage vs limits (OpenClaw has OOM history at 1536M), scan for CVEs in our images, check API key exposure. Write a security report to /workspace/staging/.

3. BUILDER: Audit docker-compose.yml, deploy.sh, and openclaw-entrypoint.sh. Check memory limits, restart policies, health check coverage, volume management. We just enabled OpenClaw auto-update (stable channel) — verify the config looks correct. Propose any infrastructure improvements to /workspace/staging/.

4. CHRONICLER: Create a deployment runbook — exact commands for full deploy, single-service restart, volume reset, log checking. All commands must be single-line (owner uses iPhone + SSM). Put it in /workspace/staging/.

5. CRON SETUP: Create a cron job that runs every 6 hours — health-check all services (LiteLLM /health/liveliness, OpenClaw gateway status, container memory), log results to the activity log. Flag anything above 80% memory usage as a warning.

RULES OF ENGAGEMENT:
- I will close the browser. You keep working.
- Proactive monitoring is your team's reason to exist. Don't wait for me to notice problems — find and fix them.
- ALL proposals go to /workspace/staging/ for my review. No direct changes without approval.
- Log everything to the activity log. When I return, I want to see exactly what you did.
- Core Team (Lead, CodeCraft, Scout, Scribe) is your competition. Governance scores are live. Outperform them.

Confirm team connectivity and begin.
```

---

## What to Expect

After sending both prompts:

- **Immediate:** Each lead should confirm they can reach their team and list available tools
- **Within minutes:** Leads begin delegating tasks to specialists
- **Within the hour:** First staging items should appear for your review
- **Ongoing:** Cron jobs run in background, activity log fills up, agents work autonomously

When you return to Mission Control:
- Check **Staging** view for deliverables awaiting your approval
- Check **Activity** view for the "While You Were Away" log
- Check **Teams** view for governance scores and team performance
- Check **Chat** history with each lead for progress reports
