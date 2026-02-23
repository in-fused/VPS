#!/bin/sh
###############################################################################
# caddy-entrypoint.sh — Generate auth hashes and start Caddy
###############################################################################
# Computes:
#   1. A bcrypt hash for Caddy's basicauth (server-side /auth/verify endpoint)
#   2. A SHA-256 hash used as cookie value after successful auth
#
# The bcrypt hash stays server-side only. The SHA-256 is never sent to the
# browser in HTML — instead, auth pages POST credentials to /auth/verify
# (which uses bcrypt), and on success the client computes SHA-256 locally
# and sets a cookie. Caddy's cookie matcher checks that cookie for protected
# routes (/openclaw/*, root WebSocket).
###############################################################################

if [ -n "${WORKSPACE_PASSWORD:-}" ]; then
    # Bcrypt hash for Caddy basicauth (server-side only)
    WORKSPACE_PASS_BCRYPT=$(caddy hash-password --plaintext "$WORKSPACE_PASSWORD")
    export WORKSPACE_PASS_BCRYPT
    echo "[caddy-entrypoint] Bcrypt hash generated for basicauth"

    # SHA-256 hash used as cookie value after successful login
    WORKSPACE_PASS_SHA256=$(printf '%s' "$WORKSPACE_PASSWORD" | sha256sum | cut -d' ' -f1)
    export WORKSPACE_PASS_SHA256
    echo "[caddy-entrypoint] Workspace auth configured (bcrypt + sha256)"
else
    export WORKSPACE_PASS_BCRYPT=""
    export WORKSPACE_PASS_SHA256=""
    echo "[caddy-entrypoint] WARNING: WORKSPACE_PASSWORD not set — workspace has no auth"
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
