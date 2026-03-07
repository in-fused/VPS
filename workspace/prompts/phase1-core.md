# Phase 1 — Core Team: Operational Readiness

PRIORITY 1: Site must be fully operational before anything else.

## Delegation

### 1. YOU (Lead): Context check
- Read SOUL.md, TOOLS.md, MEMORY.md — confirm you have full context
- Read /workspace/staging/index.json and /workspace/agent-activity/log.json — report current state
- If any prior agent work exists, summarize it

### 2. CODECRAFT: Functional audit of Mission Control
- Load and test /workspace/js/app.js, workflow.js, openclaw-client.js
- Verify: chat sends/receives, agent list populates, session persistence works, WS reconnect works
- File any bugs found as items in /workspace/staging/ with clear reproduction steps
- Fix anything you can fix in-place (JS only, no server changes)

### 3. SCOUT: External connectivity verification
- Test 5 free APIs from TOOLS.md via exec wget (crypto, weather, HN, geocoding, NASA)
- Test Scrapling: exec wget -qO- 'http://scrapling:8000/health' then scrape a real URL
- Test agent-to-agent: send a test message to Ops Lead's team via sessions_send
- Report which APIs work, which fail, and any rate-limit headers observed

### 4. SCRIBE: System status page
- Write a concise system status page to /workspace/staging/system-status.html
- What services are running, what's verified working, what's untested
- Use TOOLS.md staging template — golden cyber theme, mobile-first
- Include a "last updated" timestamp and agent attribution

### 5. CRON: Daily health-check job (runs every 24h)
- Hits the Scrapling health endpoint
- Checks /workspace/staging/index.json exists and is valid JSON
- Appends result to /workspace/agent-activity/log.json

## Rules
- Every task logs to activity log
- Every deliverable goes to staging with index.json updated
- No log = no credit
- Owner checks from phone — work autonomously after browser closes
