# Phase 1 — Platform Team: Security Lockdown

PRIORITY 1: Lock down the site. Nothing else until security is verified.

## Delegation

### 1. YOU (Ops Lead): Context check
- Read SOUL.md, TOOLS.md, MEMORY.md — confirm full context
- Read /workspace/staging/index.json and /workspace/agent-activity/log.json — report current state
- Coordinate with Lead's team if they're already working

### 2. SENTINEL: Security audit
- Write findings to /workspace/staging/security-audit.html
- Check: are any secrets (API keys, passwords) exposed in non-.env files?
- Check: is the auth cookie (mc_oc) secure? HttpOnly? SameSite?
- Check: CORS headers, CSP headers, X-Frame-Options in Caddy responses
- Check: are Docker containers running as root? Any unnecessary capabilities?
- Check: is the OpenClaw WS auth handshake rejecting bad credentials?
- Severity-rank all findings: CRITICAL / HIGH / MEDIUM / LOW

### 3. BUILDER: Infrastructure audit
- Write findings to /workspace/staging/infra-audit.html
- Memory: what's each container using vs its limit? (use exec to check if possible)
- Restart policies: are all services set to restart on failure?
- Health checks: which services have them, which don't?
- Volumes: are permissions correct on all mounted volumes?
- Network: is anything exposed that shouldn't be? (Scrapling should be internal-only)

### 4. CHRONICLER: Deployment runbook
- Write to /workspace/staging/deploy-runbook.html
- Every command must be single-line (owner uses iPhone + SSM)
- Cover: full deploy, single-service update, rollback, logs, restart, volume reset
- Use TOOLS.md staging template — golden cyber theme, mobile-optimized
- Include copy buttons for each command block

### 5. CRON: 6-hour monitoring job
- Checks all service health endpoints
- Logs results to /workspace/agent-activity/log.json
- Flags anything above 80% memory or any unhealthy service

## Rules
- Every task logs to activity log
- Every deliverable goes to staging with index.json updated
- No log = no credit
- Owner checks from phone — work autonomously after browser closes
