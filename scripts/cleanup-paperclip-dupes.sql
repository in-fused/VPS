-- One-shot cleanup: remove duplicate openclaw_gateway agents (role=general or Lead/CEO title)
-- Run with Paperclip container stopped.
-- Only touches the 24 FK tables that actually exist in this Paperclip DB
-- (discovered via: SELECT conrelid::regclass, a.attname FROM pg_constraint c
--  JOIN pg_attribute a ON a.attnum=ANY(c.conkey) AND a.attrelid=c.conrelid
--  WHERE c.confrelid='agents'::regclass AND c.contype='f';)

BEGIN;

-- Pin the target IDs so we don't re-query (and so the order is stable).
CREATE TEMP TABLE dupe_agents ON COMMIT DROP AS
  SELECT id FROM agents
   WHERE adapter_type = 'openclaw_gateway'
     AND (role = 'general' OR (name = 'Lead' AND title = 'CEO'));

-- Heartbeat chain (child -> parent order)
DELETE FROM heartbeat_run_events WHERE agent_id IN (SELECT id FROM dupe_agents);
DELETE FROM heartbeat_runs       WHERE agent_id IN (SELECT id FROM dupe_agents);

-- Agent-owned state
DELETE FROM agent_runtime_state    WHERE agent_id IN (SELECT id FROM dupe_agents);
DELETE FROM agent_task_sessions    WHERE agent_id IN (SELECT id FROM dupe_agents);
DELETE FROM agent_wakeup_requests  WHERE agent_id IN (SELECT id FROM dupe_agents);
DELETE FROM agent_api_keys         WHERE agent_id IN (SELECT id FROM dupe_agents);
DELETE FROM agent_config_revisions WHERE agent_id IN (SELECT id FROM dupe_agents)
                                      OR created_by_agent_id IN (SELECT id FROM dupe_agents);

-- Activity / cost
DELETE FROM cost_events  WHERE agent_id IN (SELECT id FROM dupe_agents);
DELETE FROM activity_log WHERE agent_id IN (SELECT id FROM dupe_agents);

-- Approvals
DELETE FROM approval_comments WHERE author_agent_id      IN (SELECT id FROM dupe_agents);
DELETE FROM approvals         WHERE requested_by_agent_id IN (SELECT id FROM dupe_agents);

-- Issues
DELETE FROM issue_comments WHERE author_agent_id IN (SELECT id FROM dupe_agents);
UPDATE issue_approvals SET linked_by_agent_id = NULL
  WHERE linked_by_agent_id IN (SELECT id FROM dupe_agents);
DELETE FROM issues
  WHERE assignee_agent_id   IN (SELECT id FROM dupe_agents)
     OR created_by_agent_id IN (SELECT id FROM dupe_agents);

-- Goals / projects / join_requests
DELETE FROM goals         WHERE owner_agent_id   IN (SELECT id FROM dupe_agents);
DELETE FROM projects      WHERE lead_agent_id    IN (SELECT id FROM dupe_agents);
DELETE FROM join_requests WHERE created_agent_id IN (SELECT id FROM dupe_agents);

-- Set-NULL FKs on shared resources
UPDATE assets                      SET created_by_agent_id = NULL
  WHERE created_by_agent_id IN (SELECT id FROM dupe_agents);
UPDATE company_secrets             SET created_by_agent_id = NULL
  WHERE created_by_agent_id IN (SELECT id FROM dupe_agents);
UPDATE company_secret_versions     SET created_by_agent_id = NULL
  WHERE created_by_agent_id IN (SELECT id FROM dupe_agents);
UPDATE workspace_runtime_services  SET owner_agent_id      = NULL
  WHERE owner_agent_id IN (SELECT id FROM dupe_agents);

-- Self-referential FK
UPDATE agents SET reports_to = NULL
  WHERE reports_to IN (SELECT id FROM dupe_agents);

-- Finally drop the duplicates
DELETE FROM agents WHERE id IN (SELECT id FROM dupe_agents);

COMMIT;

-- Verify: should show exactly 8 agents, one per name, none with role='general'
SELECT name, title, role, status FROM agents
 WHERE adapter_type = 'openclaw_gateway'
 ORDER BY name;
