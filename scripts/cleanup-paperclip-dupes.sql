-- One-shot cleanup: remove duplicate openclaw_gateway agents
-- (role='general' OR (name='Lead' AND title='CEO')).
-- Run with Paperclip container stopped.
--
-- Robust design: for tables whose rows we DELETE (issues, approvals, projects,
-- goals, join_requests), we first dynamically discover FK children via
-- pg_constraint and clean them up. This avoids needing to hardcode every
-- grandchild table (e.g. issue_read_states) that references those rows.
--
-- Direct FK children of agents we target by name (we know the set from
-- pg_constraint confrelid='agents').

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Pin the duplicate agent IDs.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE dupe_agents ON COMMIT DROP AS
  SELECT id FROM agents
   WHERE adapter_type = 'openclaw_gateway'
     AND (role = 'general' OR (name = 'Lead' AND title = 'CEO'));

-- -----------------------------------------------------------------------------
-- 2. Delete / null direct agent-owned state (no transitive children).
-- -----------------------------------------------------------------------------
DELETE FROM heartbeat_run_events WHERE agent_id IN (SELECT id FROM dupe_agents);
DELETE FROM heartbeat_runs       WHERE agent_id IN (SELECT id FROM dupe_agents);
DELETE FROM agent_runtime_state    WHERE agent_id IN (SELECT id FROM dupe_agents);
DELETE FROM agent_task_sessions    WHERE agent_id IN (SELECT id FROM dupe_agents);
DELETE FROM agent_wakeup_requests  WHERE agent_id IN (SELECT id FROM dupe_agents);
DELETE FROM agent_api_keys         WHERE agent_id IN (SELECT id FROM dupe_agents);
DELETE FROM agent_config_revisions WHERE agent_id IN (SELECT id FROM dupe_agents)
                                      OR created_by_agent_id IN (SELECT id FROM dupe_agents);
DELETE FROM cost_events  WHERE agent_id IN (SELECT id FROM dupe_agents);
DELETE FROM activity_log WHERE agent_id IN (SELECT id FROM dupe_agents);

-- Approval comments reference approvals (grandchild via author_agent_id)
DELETE FROM approval_comments WHERE author_agent_id IN (SELECT id FROM dupe_agents);
DELETE FROM issue_comments    WHERE author_agent_id IN (SELECT id FROM dupe_agents);
UPDATE issue_approvals SET linked_by_agent_id = NULL
  WHERE linked_by_agent_id IN (SELECT id FROM dupe_agents);

-- -----------------------------------------------------------------------------
-- 3. Pin parent IDs we'll have to delete, then dynamically clean FK children.
--    Postgres doesn't let us parameterize table names, so we do this as a
--    DO block that queries pg_constraint and generates DELETE/UPDATE per
--    child table.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE dupe_issues ON COMMIT DROP AS
  SELECT id FROM issues
   WHERE assignee_agent_id   IN (SELECT id FROM dupe_agents)
      OR created_by_agent_id IN (SELECT id FROM dupe_agents);

CREATE TEMP TABLE dupe_approvals ON COMMIT DROP AS
  SELECT id FROM approvals WHERE requested_by_agent_id IN (SELECT id FROM dupe_agents);

CREATE TEMP TABLE dupe_projects ON COMMIT DROP AS
  SELECT id FROM projects WHERE lead_agent_id IN (SELECT id FROM dupe_agents);

CREATE TEMP TABLE dupe_goals ON COMMIT DROP AS
  SELECT id FROM goals WHERE owner_agent_id IN (SELECT id FROM dupe_agents);

CREATE TEMP TABLE dupe_join_requests ON COMMIT DROP AS
  SELECT id FROM join_requests WHERE created_agent_id IN (SELECT id FROM dupe_agents);

-- Helper DO block: for each parent table + its pinned-IDs TEMP table,
-- scan pg_constraint for every FK pointing at parent, then delete (NOT NULL
-- FKs) or null (nullable FKs) the child rows referencing those parent IDs.
DO $cascade$
DECLARE
  pair RECORD;
  rec  RECORD;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('issues',        'dupe_issues'),
      ('approvals',     'dupe_approvals'),
      ('projects',      'dupe_projects'),
      ('goals',         'dupe_goals'),
      ('join_requests', 'dupe_join_requests')
    ) AS t(parent, pinned)
  LOOP
    FOR rec IN
      SELECT conrelid::regclass::text AS child_tbl,
             a.attname                AS child_col,
             a.attnotnull             AS child_notnull
        FROM pg_constraint c
        JOIN pg_attribute  a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
       WHERE c.confrelid = pair.parent::regclass
         AND c.contype   = 'f'
    LOOP
      IF rec.child_notnull THEN
        EXECUTE format(
          'DELETE FROM %I WHERE %I IN (SELECT id FROM %I)',
          rec.child_tbl, rec.child_col, pair.pinned
        );
      ELSE
        EXECUTE format(
          'UPDATE %I SET %I = NULL WHERE %I IN (SELECT id FROM %I)',
          rec.child_tbl, rec.child_col, rec.child_col, pair.pinned
        );
      END IF;
    END LOOP;
  END LOOP;
END
$cascade$;

-- -----------------------------------------------------------------------------
-- 4. Now safe to delete the parent rows.
-- -----------------------------------------------------------------------------
DELETE FROM issues        WHERE id IN (SELECT id FROM dupe_issues);
DELETE FROM approvals     WHERE id IN (SELECT id FROM dupe_approvals);
DELETE FROM projects      WHERE id IN (SELECT id FROM dupe_projects);
DELETE FROM goals         WHERE id IN (SELECT id FROM dupe_goals);
DELETE FROM join_requests WHERE id IN (SELECT id FROM dupe_join_requests);

-- -----------------------------------------------------------------------------
-- 5. Nullable agent-FKs on shared resources.
-- -----------------------------------------------------------------------------
UPDATE assets                     SET created_by_agent_id = NULL
  WHERE created_by_agent_id IN (SELECT id FROM dupe_agents);
UPDATE company_secrets            SET created_by_agent_id = NULL
  WHERE created_by_agent_id IN (SELECT id FROM dupe_agents);
UPDATE company_secret_versions    SET created_by_agent_id = NULL
  WHERE created_by_agent_id IN (SELECT id FROM dupe_agents);
UPDATE workspace_runtime_services SET owner_agent_id = NULL
  WHERE owner_agent_id IN (SELECT id FROM dupe_agents);

-- Self-referential
UPDATE agents SET reports_to = NULL
  WHERE reports_to IN (SELECT id FROM dupe_agents);

-- -----------------------------------------------------------------------------
-- 6. Drop the duplicates.
-- -----------------------------------------------------------------------------
DELETE FROM agents WHERE id IN (SELECT id FROM dupe_agents);

COMMIT;

-- Verify: should show exactly 8 rows, one per agent, none with role='general'.
SELECT name, title, role, status FROM agents
 WHERE adapter_type = 'openclaw_gateway'
 ORDER BY name;
