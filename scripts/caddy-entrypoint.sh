#!/bin/sh
###############################################################################
# caddy-entrypoint.sh — Generate workspace auth hash and start Caddy
###############################################################################
# Computes a SHA-256 hash from WORKSPACE_PASSWORD, exports it as
# WORKSPACE_PASS_SHA256 for injection into index.html via Caddy templates.
# The client-side login screen compares user input against this hash.
###############################################################################

if [ -n "${WORKSPACE_PASSWORD:-}" ]; then
    WORKSPACE_PASS_SHA256=$(printf '%s' "$WORKSPACE_PASSWORD" | sha256sum | cut -d' ' -f1)
    export WORKSPACE_PASS_SHA256
    echo "[caddy-entrypoint] Workspace auth configured"
else
    export WORKSPACE_PASS_SHA256=""
    echo "[caddy-entrypoint] WARNING: WORKSPACE_PASSWORD not set — workspace has no auth"
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
