#!/bin/bash
###############################################################################
# setup-paperclip-db.sh — Register OpenClaw agents in Paperclip DB
###############################################################################
# Bypasses Better Auth by writing directly to PostgreSQL via psql.
# Uses psql -v variable substitution so special chars in passwords are safe.
#
# Called from deploy.sh after the stack is healthy.
###############################################################################

PREFIX="[paperclip-db]"
DOMAIN="${DOMAIN:-in-fused.org}"
OPENCLAW_PASSWORD="${OPENCLAW_PASSWORD:-}"

PSQL() {
  docker compose exec -T paperclip-db psql -U paperclip paperclip "$@"
}

# Check connectivity
if ! PSQL -c "SELECT 1;" > /dev/null 2>&1; then
  echo "$PREFIX paperclip-db not reachable — skipping agent setup"
  exit 0
fi

echo "$PREFIX Running Paperclip agent setup via direct DB access..."

# 'ENDSQL' (quoted) prevents bash from expanding anything inside.
# psql's -v flag + :'variable' syntax handles password escaping safely.
PSQL -v pw="$OPENCLAW_PASSWORD" -v dom="$DOMAIN" << 'ENDSQL'
\set ON_ERROR_STOP on

DO $agent_setup$
DECLARE
  co_table TEXT;
  ag_table TEXT;
  co_id    UUID;
  ag_id    UUID;
  mgr_id   UUID;

  pw   TEXT := :'pw';
  dom  TEXT := :'dom';

  -- Dynamic column names (snake_case vs camelCase detection)
  co_id_col  TEXT;
  at_col     TEXT;   -- adapter_type
  ac_col     TEXT;   -- adapter_config
  rt_col     TEXT;   -- reports_to (may be absent)
  budget_col TEXT;

  -- Compact agent definitions: n=name k=openclaw-key r=reportsTo
  agents_json JSONB := '[
    {"n":"Lead",       "k":"lead",       "role":"ceo",        "t":"Core Team Lead",          "c":["delegation","review","planning"],                         "r":null},
    {"n":"CodeCraft",  "k":"codecraft",  "role":"engineer",   "t":"Full-Stack Developer",     "c":["coding","debugging","code-review","shell"],               "r":"Lead"},
    {"n":"Scout",      "k":"scout",      "role":"researcher", "t":"Research Specialist",      "c":["web-search","analysis","data-gathering"],                 "r":"Lead"},
    {"n":"Scribe",     "k":"scribe",     "role":"writer",     "t":"Documentation Writer",     "c":["writing","editing","documentation"],                      "r":"Lead"},
    {"n":"Ops Lead",   "k":"ops-lead",   "role":"cto",        "t":"Platform Team Lead",       "c":["delegation","review","infrastructure","planning"],        "r":"Lead"},
    {"n":"Builder",    "k":"builder",    "role":"engineer",   "t":"Infrastructure Developer", "c":["docker","scripting","ci-cd","shell"],                     "r":"Ops Lead"},
    {"n":"Sentinel",   "k":"sentinel",   "role":"security",   "t":"Security & Monitoring",    "c":["security-audit","monitoring","log-analysis","shell"],     "r":"Ops Lead"},
    {"n":"Chronicler", "k":"chronicler", "role":"writer",     "t":"Platform Documentation",   "c":["writing","editing","documentation"],                      "r":"Ops Lead"}
  ]';

  ag       JSONB;
  adapter  JSONB;
  name_ids JSONB := '{}';

BEGIN

  -- -------------------------------------------------------------------------
  -- 1. Discover table names
  -- -------------------------------------------------------------------------
  SELECT tablename INTO co_table
  FROM pg_tables WHERE schemaname='public' AND tablename ~ '^compan' LIMIT 1;

  SELECT tablename INTO ag_table
  FROM pg_tables WHERE schemaname='public' AND tablename ~ '^agent' LIMIT 1;

  IF co_table IS NULL OR ag_table IS NULL THEN
    RAISE NOTICE '[paperclip-db] Tables not found (co=%, ag=%) — Paperclip migrations not run yet',
      COALESCE(co_table,'?'), COALESCE(ag_table,'?');
    RETURN;
  END IF;

  RAISE NOTICE '[paperclip-db] Tables: company=% agent=%', co_table, ag_table;

  -- -------------------------------------------------------------------------
  -- 2. Detect column naming convention (snake_case vs camelCase)
  -- -------------------------------------------------------------------------
  SELECT column_name INTO co_id_col
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name=ag_table
    AND column_name IN ('company_id','companyId') LIMIT 1;
  co_id_col := COALESCE(co_id_col, 'company_id');

  SELECT column_name INTO at_col
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name=ag_table
    AND column_name IN ('adapter_type','adapterType') LIMIT 1;
  at_col := COALESCE(at_col, 'adapter_type');

  SELECT column_name INTO ac_col
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name=ag_table
    AND column_name IN ('adapter_config','adapterConfig') LIMIT 1;
  ac_col := COALESCE(ac_col, 'adapter_config');

  -- reports_to is optional
  SELECT column_name INTO rt_col
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name=ag_table
    AND column_name IN ('reports_to','reportsTo') LIMIT 1;

  SELECT column_name INTO budget_col
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name=ag_table
    AND column_name IN ('budget_monthly_cents','budgetMonthlyCents') LIMIT 1;

  RAISE NOTICE '[paperclip-db] Agent cols: %I=%s, adapter_type=%s, adapter_config=%s, reports_to=%s',
    co_id_col, co_id_col, at_col, ac_col, COALESCE(rt_col,'none');

  -- -------------------------------------------------------------------------
  -- 3. Find or create the company
  -- -------------------------------------------------------------------------
  EXECUTE format('SELECT id FROM %I WHERE name=$1 LIMIT 1', co_table)
  INTO co_id USING 'in-fused.org';

  IF co_id IS NULL THEN
    BEGIN
      EXECUTE format(
        'INSERT INTO %I (name,description,budget_monthly_cents) VALUES ($1,$2,$3) RETURNING id',
        co_table
      ) INTO co_id
      USING 'in-fused.org',
        'Self-hosted multi-agent AI hub on EC2. 2 competing teams, 8 agents, all on free-tier models.',
        5000;
    EXCEPTION WHEN OTHERS THEN
      -- Fallback: some schema versions omit optional columns
      EXECUTE format('INSERT INTO %I (name) VALUES ($1) RETURNING id', co_table)
      INTO co_id USING 'in-fused.org';
    END;
    RAISE NOTICE '[paperclip-db] Created company: %', co_id;
  ELSE
    RAISE NOTICE '[paperclip-db] Company exists: %', co_id;
  END IF;

  -- -------------------------------------------------------------------------
  -- 4. Upsert agents (pass 1: create/update, skip reportsTo for now)
  -- -------------------------------------------------------------------------
  FOR ag IN SELECT * FROM jsonb_array_elements(agents_json) LOOP

    -- Build adapter config with the OpenClaw connection details
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
      'headers',                jsonb_build_object('origin', 'https://' || dom),
      'sessionKeyStrategy',     'fixed',
      'sessionKey',             'agent:' || (ag->>'k') || ':main',
      'timeoutSec',             600,
      'waitTimeoutMs',          120000
    );

    -- Check if agent already exists
    EXECUTE format('SELECT id FROM %I WHERE name=$1 AND %I=$2 LIMIT 1', ag_table, co_id_col)
    INTO ag_id USING ag->>'n', co_id;

    IF ag_id IS NULL THEN
      -- Create new agent
      BEGIN
        EXECUTE format(
          'INSERT INTO %I (name,%I,%I,%I,role,title) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
          ag_table, co_id_col, at_col, ac_col
        ) INTO ag_id
        USING ag->>'n', co_id, 'openclaw_gateway', adapter, ag->>'role', ag->>'t';
      EXCEPTION WHEN OTHERS THEN
        -- Minimal fallback (schema may not have role/title)
        EXECUTE format(
          'INSERT INTO %I (name,%I,%I,%I) VALUES ($1,$2,$3,$4) RETURNING id',
          ag_table, co_id_col, at_col, ac_col
        ) INTO ag_id USING ag->>'n', co_id, 'openclaw_gateway', adapter;
      END;
      RAISE NOTICE '[paperclip-db] Created "%": %', ag->>'n', ag_id;
    ELSE
      -- Update adapter config (fixes authToken persistence bug #44493)
      EXECUTE format('UPDATE %I SET %I=$1,%I=$2 WHERE id=$3', ag_table, at_col, ac_col)
      USING 'openclaw_gateway', adapter, ag_id;
      RAISE NOTICE '[paperclip-db] Updated "%": %', ag->>'n', ag_id;
    END IF;

    -- Track name → id for reports_to pass
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
          EXECUTE format('UPDATE %I SET %I=$1 WHERE id=$2', ag_table, rt_col)
          USING mgr_id, ag_id;
          RAISE NOTICE '[paperclip-db] "%" → reports to "%"', ag->>'n', ag->>'r';
        END IF;
      END IF;
    END LOOP;
  END IF;

  RAISE NOTICE '[paperclip-db] Done! All 8 agents registered/updated.';

END;
$agent_setup$;
ENDSQL

echo "$PREFIX DB setup complete."
