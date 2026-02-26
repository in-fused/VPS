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

      // Also check for activity logs (Phase 5 support)
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

  // Export all Mission Control workflows to the shared volume (for agents to read)
  async syncToVolume() {
    if (!window.openclawClient?.authenticated) return;

    const wfStore = Alpine?.store('workflows');
    if (!wfStore) return;

    const index = { updatedAt: Date.now(), workflows: [] };
    const workflowData = [];

    for (const wf of wfStore.list) {
      const graphData = localStorage.getItem('mc-workflow-' + wf.id);
      if (graphData) {
        index.workflows.push({
          id: wf.id,
          name: wf.name,
          file: wf.id + '.json',
          createdBy: wf.createdBy || 'user',
          createdAt: wf.createdAt,
          updatedAt: wf.updatedAt,
          status: wf.status,
        });
        workflowData.push({ id: wf.id, data: graphData });
      }
    }

    const syncPayload = JSON.stringify({ type: 'workflow-sync', index, workflows: workflowData });

    try {
      await window.openclawClient.sendChat(
        `WORKFLOW_SYNC_REQUEST: Write the following workflow data to /workspace/agent-workflows/:\n${syncPayload}`,
        { agentId: 'lead' }
      );
      Alpine.store('monitor')?.addLog('info', `Synced ${index.workflows.length} workflows to volume`);
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
      const lastSeen = parseInt(sessionStorage.getItem('mc-last-activity-seen') || '0');
      const newEvents = (data.events || []).filter(e => (e.time || 0) > lastSeen);

      if (newEvents.length > 0) {
        const monitor = Alpine.store('monitor');
        const appStore = Alpine.store('app');

        for (const event of newEvents.slice(-50)) {
          monitor?.addLog(event.level || 'info', event.message || JSON.stringify(event));
        }

        // Build away report for dashboard
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

        sessionStorage.setItem('mc-last-activity-seen', Date.now().toString());
        if (newEvents.length > 0) {
          monitor?.addLog('info', `Synced ${newEvents.length} events from while you were away`);
        }
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
