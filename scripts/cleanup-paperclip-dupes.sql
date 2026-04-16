-- One-shot cleanup: remove duplicate openclaw_gateway agents (role=general or Lead/CEO title)
-- Run with Paperclip container stopped. Handles all 27 FK dependencies in correct order.
-- Safe to delete: only targets duplicate/stale agents, not the 8 correct ones.

BEGIN;

-- Heartbeat chain
DELETE FROM heartbeat_run_events
  WHERE run_id IN (SELECT id FROM heartbeat_runs
    WHERE agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
      AND (role='general' OR (name='Lead' AND title='CEO'))));

DELETE FROM heartbeat_runs
  WHERE agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

-- Agent state / sessions / keys
DELETE FROM agent_runtime_state
  WHERE agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

DELETE FROM agent_task_sessions
  WHERE agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

DELETE FROM agent_wakeup_requests
  WHERE agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

DELETE FROM agent_api_keys
  WHERE agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

DELETE FROM agent_config_revisions
  WHERE agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

-- Finance / activity
DELETE FROM finance_events
  WHERE agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

DELETE FROM cost_events
  WHERE agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

DELETE FROM activity_log
  WHERE agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

-- Approvals
DELETE FROM approval_comments
  WHERE author_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

DELETE FROM approvals
  WHERE requested_by_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

-- Issues and children
DELETE FROM issue_comments
  WHERE author_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

DELETE FROM issue_execution_decisions
  WHERE actor_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

UPDATE issue_approvals SET linked_by_agent_id = NULL
  WHERE linked_by_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

UPDATE issue_relations SET created_by_agent_id = NULL
  WHERE created_by_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

DELETE FROM issues
  WHERE assignee_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
      AND (role='general' OR (name='Lead' AND title='CEO')))
     OR created_by_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
      AND (role='general' OR (name='Lead' AND title='CEO')));

-- Routines
UPDATE routine_triggers SET created_by_agent_id = NULL, updated_by_agent_id = NULL
  WHERE created_by_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
      AND (role='general' OR (name='Lead' AND title='CEO')))
     OR updated_by_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
      AND (role='general' OR (name='Lead' AND title='CEO')));

DELETE FROM routines
  WHERE assignee_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

-- Goals / projects / join_requests
DELETE FROM goals
  WHERE owner_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

DELETE FROM projects
  WHERE lead_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

DELETE FROM join_requests
  WHERE created_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

-- Set-null FKs on documents / assets / secrets / services
UPDATE assets SET created_by_agent_id = NULL
  WHERE created_by_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

UPDATE documents SET created_by_agent_id = NULL, updated_by_agent_id = NULL
  WHERE created_by_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
      AND (role='general' OR (name='Lead' AND title='CEO')))
     OR updated_by_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
      AND (role='general' OR (name='Lead' AND title='CEO')));

UPDATE document_revisions SET created_by_agent_id = NULL
  WHERE created_by_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

UPDATE company_secrets SET created_by_agent_id = NULL
  WHERE created_by_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

UPDATE company_secret_versions SET created_by_agent_id = NULL
  WHERE created_by_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

UPDATE workspace_runtime_services SET owner_agent_id = NULL
  WHERE owner_agent_id IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

-- Self-referential FK
UPDATE agents SET reports_to = NULL
  WHERE reports_to IN (SELECT id FROM agents WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO')));

-- Final delete
DELETE FROM agents
  WHERE adapter_type='openclaw_gateway'
    AND (role='general' OR (name='Lead' AND title='CEO'));

COMMIT;

-- Verify
SELECT name, title, role, status FROM agents WHERE adapter_type='openclaw_gateway' ORDER BY name;
