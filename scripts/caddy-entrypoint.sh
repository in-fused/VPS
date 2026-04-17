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

    export WORKSPACE_AUTH_ENABLED=true
fi

# Parse ORACLE_LITELLM_URL into host:port for Caddy reverse_proxy upstream.
# NOTE: The 'litellm' Docker service no longer exists on EC2 — it runs on Oracle ARM.
# If ORACLE_LITELLM_URL is empty, Caddy would silently route /api/* to localhost:4000
# (nothing there) and Mission Control would show "API disconnected". Fail loudly instead.
if [ -z "${ORACLE_LITELLM_URL:-}" ]; then
    echo "[caddy-entrypoint] WARNING: ORACLE_LITELLM_URL is not set!"
    echo "[caddy-entrypoint] Set it in .env: ORACLE_LITELLM_URL=http://<oracle-ip>:4000"
    echo "[caddy-entrypoint] Falling back to localhost:4000 — /api/litellm/* will return 502"
    ORACLE_LITELLM_HOST="localhost:4000"
else
    ORACLE_LITELLM_HOST=$(echo "$ORACLE_LITELLM_URL" | sed -E 's|https?://||')
fi
export ORACLE_LITELLM_HOST
echo "[caddy-entrypoint] LiteLLM upstream: $ORACLE_LITELLM_HOST"

if [ -z "${WORKSPACE_PASSWORD:-}" ]; then
    # When no password is set, use impossible-to-match sentinel values.
    # Caddy matchers reference these via {$...} env placeholders — if we leave
    # them empty, matchers like `header Cookie *mc_oc=*` match everything or
    # `header Authorization "Basic "` fails confusingly. Sentinels ensure the
    # cookie/header matchers never accidentally trigger.
    export WORKSPACE_AUTH_B64="__NOAUTH__"
    export WORKSPACE_PASS_SHA256="__NOAUTH__"
    export WORKSPACE_AUTH_ENABLED=false
    echo "[caddy-entrypoint] WARNING: WORKSPACE_PASSWORD not set — auth disabled"
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
