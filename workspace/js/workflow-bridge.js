// ============================================================================
// Workflow Bridge — Agent <-> Mission Control workflow sync
// Agents write JSON to /workspace/agent-workflows/ on the shared volume.
// Mission Control polls for new/updated workflows, imports them, and
// sends execution results back via OpenClaw chat.
// in-fused.org
// ============================================================================

class WorkflowBridge {
  constructor() {
    this._pollTimer = null;
    this._knownFiles = new Set();
    this._basePath = '/workspace/agent-workflows';
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

  async _poll() {
    try {
      const resp = await fetch(this._basePath + '/index.json', {
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      if (!resp.ok) return; // no index yet

      const index = await resp.json();

      for (const entry of (index.workflows || [])) {
        const key = entry.id + ':' + entry.updatedAt;
        if (this._knownFiles.has(key)) continue;

        // Fetch the workflow definition
        const wfResp = await fetch(this._basePath + '/' + entry.file, {
          cache: 'no-store',
        });
        if (!wfResp.ok) continue;

        const wfData = await wfResp.json();
        const wfStore = Alpine?.store('workflows');
        if (wfStore) {
          wfStore.importJSON({
            meta: {
              id: entry.id,
              name: entry.name || 'Agent Workflow',
              nodes: wfData.nodes?.length || 0,
              lastRun: 'Never',
              status: entry.status || 'draft',
              createdAt: entry.createdAt || Date.now(),
              updatedAt: entry.updatedAt || Date.now(),
              createdBy: entry.createdBy || 'agent',
            },
            graph: wfData,
          });

          this._knownFiles.add(key);
          Alpine.store('monitor')?.addLog('info',
            `Imported agent workflow: ${entry.name} (by ${entry.createdBy || 'agent'})`
          );

          // Record workflow creation in governance
          if (entry.createdBy && entry.createdBy !== 'user') {
            Alpine.store('governance')?.recordTask(entry.createdBy, {
              success: true,
              taskType: 'workflow-create',
              tokens: 0,
            });
          }
        }
      }

      // Check for execution requests
      for (const entry of (index.workflows || [])) {
        if (entry.requestExecution && entry.status !== 'running') {
          this._executeAgentWorkflow(entry.id);
        }
      }

      // Check for background execution results
      this._checkExecutionResults();

      // Also check for activity logs
      this._checkActivityLog();
    } catch {
      // Silently fail — directory may not exist yet
    }
  }

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

    // Send results back to the Lead agent via OpenClaw
    if (window.openclawClient?.authenticated) {
      try {
        await window.openclawClient.sendChat(
          `WORKFLOW_RESULT:${workflowId}\n${JSON.stringify(results, null, 2)}`,
          { agentId: 'lead' }
        );
      } catch {}
    }
  }

  // Check for background execution results from /workspace/agent-workflows/results/
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

        // Fetch the full result
        const resResp = await fetch(this._basePath + '/results/' + result.file, {
          cache: 'no-store',
        });
        if (!resResp.ok) continue;

        const resData = await resResp.json();
        this._knownFiles.add(key);

        // Update workflow status in store
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

  // Sync a single workflow to the volume (called on every save)
  async syncWorkflow(wfId) {
    if (!window.openclawClient?.authenticated) return;
    const wfStore = Alpine?.store('workflows');
    if (!wfStore) return;

    const wf = wfStore.list.find(w => w.id === wfId);
    const graphData = localStorage.getItem('mc-workflow-' + wfId);
    if (!wf || !graphData) return;

    // Debounce: don't sync more than once per 10s per workflow
    const now = Date.now();
    this._syncTimers = this._syncTimers || {};
    if (this._syncTimers[wfId] && now - this._syncTimers[wfId] < 10000) return;
    this._syncTimers[wfId] = now;

    const payload = {
      action: 'WRITE_FILES',
      files: [
        {
          path: `/workspace/agent-workflows/${wfId}.json`,
          content: graphData,
        },
      ],
      updateIndex: {
        path: '/workspace/agent-workflows/index.json',
        entry: {
          id: wf.id,
          name: wf.name,
          file: wf.id + '.json',
          createdBy: wf.createdBy || 'user',
          createdAt: wf.createdAt,
          updatedAt: wf.updatedAt,
          status: wf.status || 'draft',
        },
      },
    };

    try {
      await window.openclawClient.sendChat(
        `WRITE_FILES:${JSON.stringify(payload)}`,
        { agentId: 'lead' }
      );
    } catch {}
  }

  // Export all Mission Control workflows to the shared volume (full sync)
  async syncToVolume() {
    if (!window.openclawClient?.authenticated) return;

    const wfStore = Alpine?.store('workflows');
    if (!wfStore) return;

    const files = [];
    const indexEntries = [];

    for (const wf of wfStore.list) {
      const graphData = localStorage.getItem('mc-workflow-' + wf.id);
      if (graphData) {
        files.push({
          path: `/workspace/agent-workflows/${wf.id}.json`,
          content: graphData,
        });
        indexEntries.push({
          id: wf.id,
          name: wf.name,
          file: wf.id + '.json',
          createdBy: wf.createdBy || 'user',
          createdAt: wf.createdAt,
          updatedAt: wf.updatedAt,
          status: wf.status || 'draft',
        });
      }
    }

    const payload = {
      action: 'WRITE_FILES',
      files,
      replaceIndex: {
        path: '/workspace/agent-workflows/index.json',
        content: JSON.stringify({ updatedAt: Date.now(), workflows: indexEntries }),
      },
    };

    try {
      await window.openclawClient.sendChat(
        `WRITE_FILES:${JSON.stringify(payload)}`,
        { agentId: 'lead' }
      );
      Alpine.store('monitor')?.addLog('info', `Synced ${files.length} workflows to volume`);
    } catch {}
  }

  // Sync governance state to the shared volume
  async syncGovernance() {
    if (!window.openclawClient?.authenticated) return;
    const gov = Alpine?.store('governance');
    if (!gov) return;

    const state = {
      agents: {},
      teams: gov.teams,
      updatedAt: Date.now(),
    };

    // Extract per-agent scores
    for (const agent of (Alpine.store('agents')?.list || [])) {
      const score = gov.getScore(agent.id);
      if (score) state.agents[agent.id] = score;
    }

    const payload = {
      action: 'WRITE_FILES',
      files: [{
        path: '/workspace/mc-state/governance.json',
        content: JSON.stringify(state, null, 2),
      }],
    };

    try {
      await window.openclawClient.sendChat(
        `WRITE_FILES:${JSON.stringify(payload)}`,
        { agentId: 'lead' }
      );
    } catch {}
  }

  // Check for agent activity logs written while the browser was closed
  async _checkActivityLog() {
    try {
      const resp = await fetch('/workspace/agent-activity/log.json', {
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      if (!resp.ok) return;

      const data = await resp.json();
      // Use localStorage (not sessionStorage) so timestamp persists across browser sessions.
      // On first-ever visit, initialize to now so we don't show stale events as "new".
      if (!localStorage.getItem('mc-last-activity-seen')) {
        localStorage.setItem('mc-last-activity-seen', Date.now().toString());
      }
      const lastSeen = parseInt(localStorage.getItem('mc-last-activity-seen') || '0');
      const newEvents = (data.events || []).filter(e => (e.time || 0) > lastSeen);

      if (newEvents.length > 0) {
        const appStore = Alpine.store('app');

        // Build away report for dashboard (only on first check after returning)
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
