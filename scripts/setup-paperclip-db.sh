#!/bin/bash
###############################################################################
# setup-paperclip-db.sh — Register OpenClaw agents in Paperclip DB
###############################################################################
# Bypasses Better Auth by writing directly to PostgreSQL via psql.
#
# Strategy: write SQL to a temp file with bash substituting ${PW}/${DOM},
# and \$N escaping for PostgreSQL EXECUTE parameter placeholders.
# Avoids psql :'variable' syntax which does not work inside DO blocks.
#
# Called from deploy.sh after the stack is healthy.
###############################################################################

set -euo pipefail

PREFIX="[paperclip-db]"

# Source .env from the repo root if vars aren't already in the environment.
# Needed when running directly with sudo (which strips env vars).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$(dirname "$SCRIPT_DIR")/.env"
if [ -f "$ENV_FILE" ] && [ -z "${OPENCLAW_PASSWORD:-}" ]; then
  set -a; source "$ENV_FILE"; set +a
  echo "$PREFIX Loaded env from $ENV_FILE"
fi

DOMAIN="${DOMAIN:-in-fused.org}"
OPENCLAW_PASSWORD="${OPENCLAW_PASSWORD:-}"

if [ -z "$OPENCLAW_PASSWORD" ]; then
  echo "$PREFIX ERROR: OPENCLAW_PASSWORD is empty — cannot set agent auth tokens"
  exit 1
fi

PSQL_CMD="docker compose exec -T paperclip-db psql -U paperclip paperclip"

if ! $PSQL_CMD -c "SELECT 1;" > /dev/null 2>&1; then
  echo "$PREFIX paperclip-db not reachable — skipping agent setup"
  exit 0
fi

echo "$PREFIX Running Paperclip agent setup via direct DB access..."

# Escape single quotes for SQL string literal embedding
PW=$(printf '%s' "$OPENCLAW_PASSWORD" | sed "s/'/''/g")
DOM=$(printf '%s' "$DOMAIN" | sed "s/'/''/g")

# Write SQL to temp file on the host.
# Bash expands ${PW} and ${DOM}; \$ escapes reach PostgreSQL as $
SQL_FILE=$(mktemp /tmp/pc-setup-XXXXXX.sql)
trap "rm -f '$SQL_FILE'" EXIT

cat > "$SQL_FILE" << ENDSQL
\set ON_ERROR_STOP on

DO \$agent_setup\$
DECLARE
  co_table TEXT;
  ag_table TEXT;
  co_id    UUID;
  ag_id    UUID;
  mgr_id   UUID;

  pw   TEXT := '${PW}';
  dom  TEXT := '${DOM}';

  co_id_col  TEXT;
  at_col     TEXT;
  ac_col     TEXT;
  rt_col     TEXT;
  st_col     TEXT;

  agents_json JSONB := '[
    {"n":"Lead",       "k":"lead",       "role":"ceo",        "t":"Core Team Lead",          "r":null},
    {"n":"CodeCraft",  "k":"codecraft",  "role":"engineer",   "t":"Full-Stack Developer",     "r":"Lead"},
    {"n":"Scout",      "k":"scout",      "role":"researcher", "t":"Research Specialist",      "r":"Lead"},
    {"n":"Scribe",     "k":"scribe",     "role":"writer",     "t":"Documentation Writer",     "r":"Lead"},
    {"n":"Ops Lead",   "k":"ops-lead",   "role":"cto",        "t":"Platform Team Lead",       "r":"Lead"},
    {"n":"Builder",    "k":"builder",    "role":"engineer",   "t":"Infrastructure Developer", "r":"Ops Lead"},
    {"n":"Sentinel",   "k":"sentinel",   "role":"security",   "t":"Security & Monitoring",    "r":"Ops Lead"},
    {"n":"Chronicler", "k":"chronicler", "role":"writer",     "t":"Platform Documentation",   "r":"Ops Lead"}
  ]';

  ag       JSONB;
  adapter  JSONB;
  name_ids JSONB := '{}';

BEGIN

  -- -------------------------------------------------------------------------
  -- 1. Discover tables (exact match — avoids agent_api_keys etc.)
  -- -------------------------------------------------------------------------
  SELECT tablename INTO co_table
  FROM pg_tables WHERE schemaname='public' AND tablename IN ('companies','company') LIMIT 1;

  SELECT tablename INTO ag_table
  FROM pg_tables WHERE schemaname='public' AND tablename IN ('agents','agent') LIMIT 1;

  IF co_table IS NULL OR ag_table IS NULL THEN
    RAISE NOTICE '[paperclip-db] Tables not found (co=%, ag=%) — migrations not complete',
      COALESCE(co_table,'?'), COALESCE(ag_table,'?');
    RETURN;
  END IF;
  RAISE NOTICE '[paperclip-db] Tables: company=% agent=%', co_table, ag_table;

  -- -------------------------------------------------------------------------
  -- 2. Column detection (snake_case vs camelCase)
  -- -------------------------------------------------------------------------
  SELECT column_name INTO co_id_col FROM information_schema.columns
  WHERE table_schema='public' AND table_name=ag_table
    AND column_name IN ('company_id','companyId') LIMIT 1;
  co_id_col := COALESCE(co_id_col, 'company_id');

  SELECT column_name INTO at_col FROM information_schema.columns
  WHERE table_schema='public' AND table_name=ag_table
    AND column_name IN ('adapter_type','adapterType') LIMIT 1;
  at_col := COALESCE(at_col, 'adapter_type');

  SELECT column_name INTO ac_col FROM information_schema.columns
  WHERE table_schema='public' AND table_name=ag_table
    AND column_name IN ('adapter_config','adapterConfig') LIMIT 1;
  ac_col := COALESCE(ac_col, 'adapter_config');

  SELECT column_name INTO rt_col FROM information_schema.columns
  WHERE table_schema='public' AND table_name=ag_table
    AND column_name IN ('reports_to','reportsTo') LIMIT 1;

  SELECT column_name INTO st_col FROM information_schema.columns
  WHERE table_schema='public' AND table_name=ag_table
    AND column_name IN ('status','state') LIMIT 1;

  RAISE NOTICE '[paperclip-db] Agent cols: %=%s, adapter_type=%, adapter_config=%, reports_to=%, status=%',
    'company_id', co_id_col, at_col, ac_col, COALESCE(rt_col,'none'), COALESCE(st_col,'none');

  -- -------------------------------------------------------------------------
  -- 3. Find or create company
  -- -------------------------------------------------------------------------
  EXECUTE format('SELECT id FROM %I WHERE name=\$1 LIMIT 1', co_table)
  INTO co_id USING 'in-fused.org';

  IF co_id IS NULL THEN
    BEGIN
      EXECUTE format(
        'INSERT INTO %I (name,description,budget_monthly_cents) VALUES (\$1,\$2,\$3) RETURNING id',
        co_table
      ) INTO co_id USING
        'in-fused.org',
        'Self-hosted multi-agent AI hub on EC2. 2 competing teams, 8 agents, all on free-tier models.',
        5000;
    EXCEPTION WHEN OTHERS THEN
      EXECUTE format('INSERT INTO %I (name) VALUES (\$1) RETURNING id', co_table)
      INTO co_id USING 'in-fused.org';
    END;
    RAISE NOTICE '[paperclip-db] Created company: %', co_id;
  ELSE
    RAISE NOTICE '[paperclip-db] Company exists: %', co_id;
  END IF;

  -- -------------------------------------------------------------------------
  -- 4. Upsert agents (pass 1: create/update without reportsTo)
  -- Update ALL rows matching name+adapter_type (handles duplicates; cannot
  -- DELETE dupes because heartbeat_runs has a FK on agents.id).
  -- -------------------------------------------------------------------------

  FOR ag IN SELECT * FROM jsonb_array_elements(agents_json) LOOP

    adapter := jsonb_build_object(
      'url',                    'ws://openclaw:18789',
      'agentId',                ag->>'k',
      'authToken',              pw,
      'password',               pw,
      'disableDeviceAuth',      TRUE,
      'autoPairOnFirstConnect', TRUE,
      'clientId',               'openclaw-control-ui',
      'clientMode',             'ui',
      'clientVersion',          'paperclip',
      'scopes',   '["operator.admin","operator.read","operator.write","operator.pairing"]'::jsonb,
      'headers',                jsonb_build_object('origin', 'https://' || dom, 'x-openclaw-token', pw),
      'sessionKeyStrategy',     'fixed',
      'sessionKey',             'agent:' || (ag->>'k') || ':main',
      'timeoutSec',             600,
      'waitTimeoutMs',          120000
    );

    -- Update ALL existing rows for this agent (may be >1 due to past duplicates)
    EXECUTE format(
      'UPDATE %I SET %I=\$1,%I=\$2,%I=\$3,updated_at=NOW() WHERE name=\$4 AND adapter_type=\$5',
      ag_table, at_col, ac_col, co_id_col
    ) USING 'openclaw_gateway', adapter, co_id, ag->>'n', 'openclaw_gateway';

    -- Get one id for status update + reports_to tracking
    EXECUTE format(
      'SELECT id FROM %I WHERE name=\$1 AND adapter_type=\$2 LIMIT 1',
      ag_table
    ) INTO ag_id USING ag->>'n', 'openclaw_gateway';

    IF ag_id IS NULL THEN
      BEGIN
        EXECUTE format(
          'INSERT INTO %I (name,%I,%I,%I,role,title) VALUES (\$1,\$2,\$3,\$4,\$5,\$6) RETURNING id',
          ag_table, co_id_col, at_col, ac_col
        ) INTO ag_id
        USING ag->>'n', co_id, 'openclaw_gateway', adapter, ag->>'role', ag->>'t';
      EXCEPTION WHEN OTHERS THEN
        EXECUTE format(
          'INSERT INTO %I (name,%I,%I,%I) VALUES (\$1,\$2,\$3,\$4) RETURNING id',
          ag_table, co_id_col, at_col, ac_col
        ) INTO ag_id USING ag->>'n', co_id, 'openclaw_gateway', adapter;
      END;
      RAISE NOTICE '[paperclip-db] Created "%": %', ag->>'n', ag_id;
    ELSE
      RAISE NOTICE '[paperclip-db] Updated all "%" rows: one id=%', ag->>'n', ag_id;
    END IF;

    -- Reset ALL rows for this agent to idle (Paperclip blocks paused/terminated/pending_approval)
    IF st_col IS NOT NULL THEN
      BEGIN
        EXECUTE format(
          'UPDATE %I SET %I=\$1,pause_reason=NULL,paused_at=NULL,updated_at=NOW() WHERE name=\$2 AND adapter_type=\$3',
          ag_table, st_col
        ) USING 'idle', ag->>'n', 'openclaw_gateway';
      EXCEPTION WHEN OTHERS THEN
        EXECUTE format(
          'UPDATE %I SET %I=\$1 WHERE name=\$2 AND adapter_type=\$3',
          ag_table, st_col
        ) USING 'idle', ag->>'n', 'openclaw_gateway';
      END;
    END IF;

    name_ids := name_ids || jsonb_build_object(ag->>'n', ag_id::TEXT);
  END LOOP;

  -- -------------------------------------------------------------------------
  -- 5. Set reports_to (pass 2)
  -- -------------------------------------------------------------------------
  IF rt_col IS NOT NULL THEN
    FOR ag IN SELECT * FROM jsonb_array_elements(agents_json) LOOP
      IF ag->>'r' IS NOT NULL THEN
        ag_id  := (name_ids->>(ag->>'n'))::UUID;
        mgr_id := (name_ids->>(ag->>'r'))::UUID;
        IF ag_id IS NOT NULL AND mgr_id IS NOT NULL THEN
          EXECUTE format('UPDATE %I SET %I=\$1 WHERE id=\$2', ag_table, rt_col)
          USING mgr_id, ag_id;
          RAISE NOTICE '[paperclip-db] "%" reports to "%"', ag->>'n', ag->>'r';
        END IF;
      END IF;
    END LOOP;
  END IF;

  RAISE NOTICE '[paperclip-db] Done! All 8 agents registered/updated.';

END;
\$agent_setup\$;
ENDSQL

# Pipe temp file to psql (stdin redirection passes file through docker exec -T)
$PSQL_CMD < "$SQL_FILE"

echo "$PREFIX DB setup complete."
