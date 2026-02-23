#!/bin/sh
###############################################################################
# caddy-entrypoint.sh — Generate workspace auth hash and start Caddy
###############################################################################
# Generates a bcrypt hash from WORKSPACE_PASSWORD at container startup,
# exports it as WORKSPACE_PASS_HASH for use in the Caddyfile, then starts
# Caddy. This avoids storing bcrypt hashes in .env (which has $ escaping issues).
###############################################################################

if [ -n "${WORKSPACE_PASSWORD:-}" ]; then
    WORKSPACE_PASS_HASH=$(caddy hash-password --plaintext "$WORKSPACE_PASSWORD")
    export WORKSPACE_PASS_HASH
    echo "[caddy-entrypoint] Workspace basicauth configured (user: admin)"
else
    # No password = no auth on workspace (fallback: block all with invalid hash)
    export WORKSPACE_PASS_HASH='$2a$14$invalid.hash.that.never.matches.anything.ever'
    echo "[caddy-entrypoint] WARNING: WORKSPACE_PASSWORD not set — workspace access blocked"
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
