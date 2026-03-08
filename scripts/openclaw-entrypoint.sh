#!/bin/sh
# =============================================================================
# OpenClaw Gateway Entrypoint
# =============================================================================
# 1. Patches openclaw.json (separate JS file — avoids shell quoting issues)
# 2. Seeds agent workspace files (SOUL.md, MEMORY.md, etc.)
# 3. Starts the OpenClaw gateway
# =============================================================================

# Step 0: Ensure SSH client is available for oracle-bridge.sh
# OpenClaw image is Node.js-based and may not include ssh/scp.
# Install silently in background to avoid delaying startup.
if ! command -v ssh >/dev/null 2>&1; then
  echo "[entrypoint] Installing SSH client for Oracle ARM bridge..."
  (
    if command -v apk >/dev/null 2>&1; then
      apk add --no-cache openssh-client >/dev/null 2>&1
    elif command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq && apt-get install -y -qq openssh-client >/dev/null 2>&1
    fi
    echo "[entrypoint] SSH client installed"
  ) &
fi

# Step 1: Patch openclaw.json config
node /opt/scripts/patch-openclaw-config.js
if [ $? -ne 0 ]; then
  echo "[entrypoint] ERROR: config patch failed, starting with existing config"
fi

# Step 2: Seed server-side workspace files for each agent.
# Runs twice: once now (seeds new files), once after 30s delay (overwrites
# OpenClaw's default SOUL.md/BOOTSTRAP.md that it creates on agent init).
node /opt/scripts/seed-agent-workspaces.js

# Step 3: Delayed re-seed after OpenClaw creates its default workspace files.
# OpenClaw reads workspace files on every turn, so changes take effect
# immediately on the next agent interaction.
# After re-seed, auto-kickoff sends startup messages to both leads (opt-in).
(sleep 30 && node /opt/scripts/seed-agent-workspaces.js && sleep 10 && node /opt/scripts/auto-kickoff.js) &

# Step 4: Start gateway. Do NOT pass --bind on CLI — it bypasses config file
# validation for controlUi.allowedOrigins. Let openclaw.json handle it.
exec node openclaw.mjs gateway --allow-unconfigured
