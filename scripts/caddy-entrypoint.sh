#!/bin/sh
###############################################################################
# caddy-entrypoint.sh — Generate auth tokens and start Caddy
###############################################################################
# Computes:
#   1. A base64 auth token for /auth/verify (direct header comparison,
#      no basicauth directive = no WWW-Authenticate popup)
#   2. A SHA-256 hash used as cookie value after successful auth
###############################################################################

if [ -n "${WORKSPACE_PASSWORD:-}" ]; then
    # Base64 token for /auth/verify header comparison (server-side only)
    WORKSPACE_AUTH_B64=$(printf 'admin:%s' "$WORKSPACE_PASSWORD" | base64 | tr -d '\n')
    export WORKSPACE_AUTH_B64
    echo "[caddy-entrypoint] Auth token generated for /auth/verify"

    # SHA-256 hash used as cookie value after successful login
    WORKSPACE_PASS_SHA256=$(printf '%s' "$WORKSPACE_PASSWORD" | sha256sum | cut -d' ' -f1)
    export WORKSPACE_PASS_SHA256
    echo "[caddy-entrypoint] Workspace auth configured"
else
    export WORKSPACE_AUTH_B64=""
    export WORKSPACE_PASS_SHA256=""
    echo "[caddy-entrypoint] WARNING: WORKSPACE_PASSWORD not set — workspace has no auth"
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
