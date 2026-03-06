#!/bin/sh
# =============================================================================
# OpenClaw Gateway Entrypoint
# =============================================================================
# 1. Patches openclaw.json (separate JS file — avoids shell quoting issues)
# 2. Seeds agent workspace files (SOUL.md, MEMORY.md, etc.)
# 3. Starts the OpenClaw gateway
# =============================================================================

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
(sleep 30 && node /opt/scripts/seed-agent-workspaces.js) &

# Step 4: Start gateway. Do NOT pass --bind on CLI — it bypasses config file
# validation for controlUi.allowedOrigins. Let openclaw.json handle it.
exec node openclaw.mjs gateway --allow-unconfigured
