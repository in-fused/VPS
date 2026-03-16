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

# Step 2: Seed server-side workspace files for each agent (filesystem).
# This pre-seeds files before OpenClaw starts. Step 3 re-pushes them via RPC
# after OpenClaw is running to ensure they aren't overwritten by defaults.
node /opt/scripts/seed-agent-workspaces.js

# Step 3: RPC-based re-seed after OpenClaw starts.
# The RPC seeder waits for OpenClaw to be healthy, then pushes all workspace
# files via agents.files.set — the API treats these as operator-managed, so
# OpenClaw won't overwrite them with its defaults. This replaces the old
# filesystem-based delayed second seed (which had a race condition).
# After RPC seed, auto-kickoff sends startup messages to both leads.
# Sleep 45s first — OpenClaw takes ~50s to start (Doctor changes + config
# overwrite + gateway bind). Without this delay, the health check retries
# burn out before the gateway is even listening.
(sleep 45 && node /opt/scripts/seed-via-rpc.js && sleep 5 && node /opt/scripts/auto-kickoff.js) &

# Step 3b: Register agents in Paperclip (background, non-blocking).
# Waits for Paperclip to be healthy, creates company + agents + goals.
# Idempotent — skips existing resources. Non-fatal on failure.
(sleep 60 && node /opt/scripts/setup-paperclip.js) &

# Step 4: Start gateway. Do NOT pass --bind on CLI — it bypasses config file
# validation for controlUi.allowedOrigins. Let openclaw.json handle it.
exec node openclaw.mjs gateway --allow-unconfigured
