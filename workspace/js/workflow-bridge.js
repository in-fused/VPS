// ============================================================================
// Workflow Bridge — Agent <-> Mission Control bidirectional workflow sync
//
// IMPORT (Agent → MC):
//   Primary: Polls /workspace/agent-workflows/index.json (agents write via
//            their `write` tool to the shared Docker volume).
//   Secondary: Polls each agent's workspace via agents.files.get RPC
//              (catches workflows agents wrote to their own workspace).
//
// EXPORT (MC → Agent):
//   Uses agents.files.set RPC to write workflow JSON + index directly to
//   Lead and Ops Lead's workspace directories — zero chat pollution.
//   Agents can read these with their `read` tool.
//
// Phase 4: Full bidirectional bridge with RPC-based sync.
// in-fused.org
// ============================================================================

class WorkflowBridge {
  constructor() {
    this._pollTimer = null;
    this._knownFiles = new Set();
    this._basePath = '/workspace/agent-workflows';
    this._syncTimers = {};
    this._lastAgentPoll = 0;
  }

  startPolling(intervalMs = 15000) {
    this.stopPolling();
    this._poll();
    this._pollTimer = setInterval(() => this._poll(), intervalMs);
  }

  stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  // =========================================================================
  // MAIN POLL LOOP
  // =========================================================================

  async _poll() {
    try {
      // 1. Poll the shared volume (primary import path)
      await this._pollVolume();

      // 2. Poll agent workspaces via RPC (every 60s, secondary import path)
      const now = Date.now();
      if (window.openclawClient?.authenticated && now - this._lastAgentPoll > 60000) {
        this._lastAgentPoll = now;
        await this._pollAgentWorkspaces();
      }

      // 3. Check for background execution results
      await this._checkExecutionResults();

      // 4. Check for activity logs
      await this._checkActivityLog();
    } catch {
      // Silently fail — services may not be up yet
    }
  }

  // =========================================================================
  // IMPORT: Shared volume → Mission Control
  // =========================================================================

  async _pollVolume() {
    const resp = await fetch(this._basePath + '/index.json', {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!resp.ok) return;

    const index = await resp.json();

    for (const entry of (index.workflows || [])) {
      const key = entry.id + ':' + entry.updatedAt;
      if (this._knownFiles.has(key)) continue;

      const wfResp = await fetch(this._basePath + '/' + entry.file, {
        cache: 'no-store',
      });
      if (!wfResp.ok) continue;

      const wfData = await wfResp.json();
      this._importWorkflow(entry, wfData);
    }

    // Check for execution requests
    for (const entry of (index.workflows || [])) {
      if (entry.requestExecution && entry.status !== 'running') {
        this._executeAgentWorkflow(entry.id);
      }
    }
  }

  // =========================================================================
  // IMPORT: Agent workspace files → Mission Control (via RPC)
  // =========================================================================

  async _pollAgentWorkspaces() {
    if (!window.openclawClient?.authenticated) return;

    // Check Lead and Ops Lead workspace for agent-created workflows
    for (const agentId of ['lead', 'ops-lead']) {
      try {
        const index = await window.openclawClient.readAgentWorkflowIndex(agentId);
        if (!index?.workflows) continue;

        for (const entry of index.workflows) {
          const key = `rpc:${agentId}:${entry.id}:${entry.updatedAt}`;
          if (this._knownFiles.has(key)) continue;

          try {
            const wfData = await window.openclawClient.readAgentWorkflow(agentId, entry.id);
            if (wfData) {
              this._importWorkflow(entry, wfData.graph || wfData);
              this._knownFiles.add(key);
            }
          } catch {
            // Individual workflow read failed — skip
          }
        }
      } catch {
        // Agent doesn't have a workflows/ directory yet — normal
      }
    }
  }

  // =========================================================================
  // SHARED: Import a workflow into the Mission Control store
  // =========================================================================

  _importWorkflow(entry, graphData) {
    const wfStore = Alpine?.store('workflows');
    if (!wfStore) return;

    const key = entry.id + ':' + entry.updatedAt;
    wfStore.importJSON({
      meta: {
        id: entry.id,
        name: entry.name || 'Agent Workflow',
        nodes: graphData.nodes?.length || 0,
        lastRun: 'Never',
        status: entry.status || 'draft',
        createdAt: entry.createdAt || Date.now(),
        updatedAt: entry.updatedAt || Date.now(),
        createdBy: entry.createdBy || 'agent',
      },
      graph: graphData,
    });

    this._knownFiles.add(key);
    Alpine.store('monitor')?.addLog('info',
      `Imported agent workflow: ${entry.name} (by ${entry.createdBy || 'agent'})`
    );

    // Play notification sound for agent-created workflows
    if (entry.createdBy && entry.createdBy !== 'user' && window.mcAudio) {
      mcAudio.notification();
    }

    // Record workflow creation in governance
    if (entry.createdBy && entry.createdBy !== 'user') {
      Alpine.store('governance')?.recordTask(entry.createdBy, {
        success: true,
        taskType: 'workflow-create',
        tokens: 0,
      });
    }
  }

  // =========================================================================
  // EXECUTE: Run an agent-requested workflow on Mission Control
  // =========================================================================

  async _executeAgentWorkflow(workflowId) {
    const wfStore = Alpine?.store('workflows');
    if (!wfStore) return;

    wfStore.load(workflowId);
    await new Promise(r => setTimeout(r, 500));
    await wfStore.run();

    // Collect results from output nodes
    const results = {};
    if (window.workflowGraph) {
      for (const node of window.workflowGraph._nodes) {
        if (node.type === 'mission/output') {
          results[node.properties.label || node.id] = node._lastResult || '';
        }
      }
    }

    // Write results back via RPC (no chat pollution)
    if (window.openclawClient?.authenticated) {
      try {
        const resultJson = JSON.stringify({
          workflowId,
          completedAt: Date.now(),
          success: true,
          outputs: results,
        }, null, 2);
        await window.openclawClient.setAgentFile('lead', `workflows/results/${workflowId}.json`, resultJson);
      } catch {
        // Fallback: inject as labeled message
        try {
          await window.openclawClient.injectChat(
            `WORKFLOW_RESULT:${workflowId}\n${JSON.stringify(results, null, 2)}`,
            { sessionKey: 'agent:lead:main', label: 'system-bridge' }
          );
        } catch {}
      }
    }
  }

  // =========================================================================
  // IMPORT: Background execution results from volume
  // =========================================================================

  async _checkExecutionResults() {
    try {
      const resp = await fetch(this._basePath + '/results/index.json', {
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      if (!resp.ok) return;

      const index = await resp.json();
      const wfStore = Alpine?.store('workflows');
      if (!wfStore) return;

      for (const result of (index.results || [])) {
        const key = 'bg-result:' + result.id + ':' + result.completedAt;
        if (this._knownFiles.has(key)) continue;

        const resResp = await fetch(this._basePath + '/results/' + result.file, {
          cache: 'no-store',
        });
        if (!resResp.ok) continue;

        const resData = await resResp.json();
        this._knownFiles.add(key);

        const wf = wfStore.list.find(w => w.id === result.workflowId);
        if (wf) {
          wf.lastRun = new Date(result.completedAt).toLocaleString();
          wf.status = result.success ? 'completed' : 'failed';
          wf._bgResult = resData;
        }

        Alpine.store('monitor')?.addLog(
          result.success ? 'info' : 'warn',
          `Background workflow "${result.name || result.workflowId}" ${result.success ? 'completed' : 'failed'}`
        );
      }
    } catch {
      // Results directory may not exist yet
    }
  }

  // =========================================================================
  // EXPORT: Mission Control → Agent workspaces (via RPC)
  // =========================================================================

  // Sync a single workflow to agent workspaces (called on every save)
  async syncWorkflow(wfId) {
    if (!window.openclawClient?.authenticated) return;
    const wfStore = Alpine?.store('workflows');
    if (!wfStore) return;

    const wf = wfStore.list.find(w => w.id === wfId);
    const graphData = localStorage.getItem('mc-workflow-' + wfId);
    if (!wf || !graphData) return;

    // Debounce: don't sync more than once per 10s per workflow
    const now = Date.now();
    if (this._syncTimers[wfId] && now - this._syncTimers[wfId] < 10000) return;
    this._syncTimers[wfId] = now;

    const meta = {
      id: wf.id,
      name: wf.name,
      nodes: wf.nodes,
      createdBy: wf.createdBy || 'user',
      createdAt: wf.createdAt,
      updatedAt: wf.updatedAt,
      status: wf.status || 'draft',
    };

    try {
      // Write via RPC to both team leads' workspaces
      const graphJson = JSON.parse(graphData);
      await window.openclawClient.syncWorkflowToAgent(wfId, meta, graphJson);

      // Also update the index
      await this._syncIndex();
    } catch {
      // RPC failed — agents can still find workflows via the volume poll
    }
  }

  // Export all Mission Control workflows to agent workspaces (full sync)
  async syncToVolume() {
    if (!window.openclawClient?.authenticated) return;
    const wfStore = Alpine?.store('workflows');
    if (!wfStore) return;

    let synced = 0;
    for (const wf of wfStore.list) {
      const graphData = localStorage.getItem('mc-workflow-' + wf.id);
      if (!graphData) continue;

      try {
        const meta = {
          id: wf.id,
          name: wf.name,
          nodes: wf.nodes,
          createdBy: wf.createdBy || 'user',
          createdAt: wf.createdAt,
          updatedAt: wf.updatedAt,
          status: wf.status || 'draft',
        };
        await window.openclawClient.syncWorkflowToAgent(wf.id, meta, JSON.parse(graphData));
        synced++;
      } catch {
        // Individual workflow sync failed — continue with others
      }
    }

    await this._syncIndex();
    Alpine.store('monitor')?.addLog('info', `Synced ${synced} workflows to agent workspaces`);
  }

  // Sync the workflow index to Lead's workspace
  async _syncIndex() {
    if (!window.openclawClient?.authenticated) return;
    const wfStore = Alpine?.store('workflows');
    if (!wfStore) return;

    const entries = wfStore.list.map(wf => ({
      id: wf.id,
      name: wf.name,
      file: wf.id + '.json',
      createdBy: wf.createdBy || 'user',
      createdAt: wf.createdAt,
      updatedAt: wf.updatedAt,
      status: wf.status || 'draft',
    }));

    try {
      await window.openclawClient.syncWorkflowIndex(entries);
    } catch {}
  }

  // =========================================================================
  // GOVERNANCE SYNC — writes state to team leads' workspace files
  // =========================================================================

  async syncGovernance() {
    if (!window.openclawClient?.authenticated) return;
    const gov = Alpine?.store('governance');
    if (!gov) return;

    const state = {
      agents: {},
      teams: gov.teams,
      updatedAt: Date.now(),
    };

    for (const agent of (Alpine.store('agents')?.list || [])) {
      const score = gov.getScore(agent.id);
      if (score) state.agents[agent.id] = score;
    }

    const md = this._buildGovernanceMd(state);

    try {
      await window.openclawClient.setAgentFile('lead', 'GOVERNANCE.md', md);
      await window.openclawClient.setAgentFile('ops-lead', 'GOVERNANCE.md', md);
      return;
    } catch {
      // agents.files.set not available — fall back to chat.inject
    }

    const payload = {
      action: 'WRITE_FILES',
      files: [{
        path: '/workspace/mc-state/governance.json',
        content: JSON.stringify(state, null, 2),
      }],
    };

    try {
      await window.openclawClient.injectChat(
        `WRITE_FILES:${JSON.stringify(payload)}`,
        { sessionKey: 'agent:lead:main', label: 'system-bridge' }
      );
    } catch {}
  }

  _buildGovernanceMd(state) {
    const lines = ['# Governance State', '', `Updated: ${new Date(state.updatedAt).toISOString()}`, ''];

    lines.push('## Agent Scores', '');
    lines.push('| Agent | Score | Tier |');
    lines.push('|-------|-------|------|');
    for (const [id, score] of Object.entries(state.agents)) {
      lines.push(`| ${id} | ${score} | — |`);
    }
    lines.push('');

    if (state.teams?.length) {
      lines.push('## Teams', '');
      for (const team of state.teams) {
        lines.push(`### ${team.name}`);
        lines.push(`- Lead: ${team.lead}`);
        lines.push(`- Members: ${(team.members || []).join(', ')}`);
        if (team.project) lines.push(`- Project: ${team.project}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  // =========================================================================
  // ACTIVITY LOG — reads /workspace/agent-activity/log.json for away report
  // =========================================================================

  async _checkActivityLog() {
    try {
      const resp = await fetch('/workspace/agent-activity/log.json', {
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      if (!resp.ok) return;

      const data = await resp.json();
      if (!localStorage.getItem('mc-last-activity-seen')) {
        localStorage.setItem('mc-last-activity-seen', Date.now().toString());
      }
      const lastSeen = parseInt(localStorage.getItem('mc-last-activity-seen') || '0');
      const newEvents = (data.events || []).filter(e => (e.time || 0) > lastSeen);

      if (newEvents.length > 0) {
        const appStore = Alpine.store('app');

        if (!appStore.awayReport && newEvents.length > 3) {
          const duration = this._formatDuration(Date.now() - lastSeen);
          appStore.awayReport = {
            duration,
            tasksCompleted: newEvents.filter(e => e.type === 'task-complete').length,
            workflowsRun: newEvents.filter(e => e.type === 'workflow-complete').length,
            stagingItems: newEvents.filter(e => e.type === 'staging-new').length,
            errors: newEvents.filter(e => e.level === 'error').length,
          };
        }

        localStorage.setItem('mc-last-activity-seen', Date.now().toString());
        Alpine.store('monitor')?.addLog('info', `Synced ${newEvents.length} agent events`);
      }
    } catch {}
  }

  _formatDuration(ms) {
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ${mins % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
}

window.workflowBridge = new WorkflowBridge();
