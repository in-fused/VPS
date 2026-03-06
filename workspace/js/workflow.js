// ============================================================================
// Mission Control — workflow.js
// LiteGraph.js custom node types, canvas initialization, and workflow executor
// Nodes execute real OpenClaw/LiteLLM calls when the workflow runs
// in-fused.org
// ============================================================================

window.workflowGraph = null;
window.workflowCanvas = null;

// ============================================================================
// TOUCH-TO-MOUSE BRIDGE — makes LiteGraph canvas fully usable on mobile
// Translates touch events into mouse events the canvas understands.
// Supports: single-finger pan/drag, two-finger pinch-zoom.
// ============================================================================

function _bridgeTouchEvents(canvasEl) {
  // Only apply on touch-capable devices
  if (!('ontouchstart' in window)) return;

  let _lastPinchDist = 0;
  let _isPinching = false;

  function touchToMouse(type, touch, e) {
    const mouseEvent = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: touch.clientX,
      clientY: touch.clientY,
      button: 0,
      buttons: type === 'mouseup' ? 0 : 1,
    });
    mouseEvent._fromTouch = true;
    canvasEl.dispatchEvent(mouseEvent);
    e.preventDefault();
  }

  canvasEl.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1 && !_isPinching) {
      touchToMouse('mousedown', e.touches[0], e);
    } else if (e.touches.length === 2) {
      // Cancel any in-progress single-finger drag before starting pinch
      if (!_isPinching) {
        touchToMouse('mouseup', e.touches[0], e);
      }
      _isPinching = true;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      _lastPinchDist = Math.sqrt(dx * dx + dy * dy);
      e.preventDefault();
    }
  }, { passive: false });

  canvasEl.addEventListener('touchmove', function (e) {
    if (e.touches.length === 1 && !_isPinching) {
      touchToMouse('mousemove', e.touches[0], e);
    } else if (e.touches.length === 2 && _isPinching && window.workflowCanvas) {
      // Pinch zoom — directly manipulate LiteGraph's DragAndScale
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (_lastPinchDist > 0) {
        const scaleFactor = dist / _lastPinchDist;
        const canvas = window.workflowCanvas;
        const rect = canvasEl.getBoundingClientRect();
        // Zoom toward the midpoint between the two fingers
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        const newScale = Math.max(0.15, Math.min(4, canvas.ds.scale * scaleFactor));
        canvas.ds.changeScale(newScale, [midX, midY]);
        canvas.setDirty(true, true);
      }
      _lastPinchDist = dist;
      e.preventDefault();
    }
  }, { passive: false });

  canvasEl.addEventListener('touchend', function (e) {
    if (e.touches.length === 0) {
      if (_isPinching) {
        // Pinch ended — don't fire mouseup (no drag was active)
        _isPinching = false;
      } else if (e.changedTouches.length > 0) {
        touchToMouse('mouseup', e.changedTouches[0], e);
      }
      _lastPinchDist = 0;
    } else if (e.touches.length === 1 && _isPinching) {
      // Went from 2→1 fingers: stay idle, don't start a new drag
      _lastPinchDist = 0;
    }
  }, { passive: false });

  canvasEl.addEventListener('touchcancel', function (e) {
    if (!_isPinching && e.changedTouches.length > 0) {
      touchToMouse('mouseup', e.changedTouches[0], e);
    }
    _isPinching = false;
    _lastPinchDist = 0;
  }, { passive: false });
}

function _resizeCanvas(container) {
  const rect = container.parentElement.getBoundingClientRect();
  container.width = rect.width;
  container.height = rect.height;
  if (window.workflowCanvas) window.workflowCanvas.resize();
}

function initWorkflowCanvas() {
  if (typeof LiteGraph === 'undefined') {
    console.warn('LiteGraph not loaded yet');
    return;
  }

  const container = document.getElementById('workflow-canvas');
  if (!container) return;

  // Already mounted: just resize and ensure the active workflow is loaded
  if (window.workflowCanvas && window.workflowCanvas._mounted) {
    _resizeCanvas(container);
    // Re-load active workflow if the graph is empty but we have saved data
    const wfStore = Alpine?.store('workflows');
    if (wfStore?.activeId && window.workflowGraph?._nodes?.length === 0) {
      const data = localStorage.getItem('mc-workflow-' + wfStore.activeId);
      if (data) {
        try { window.workflowGraph.configure(JSON.parse(data)); } catch {}
      }
    }
    return;
  }

  if (!LiteGraph.registered_node_types['mission/agent']) {
    registerCustomNodes();
  }

  const graph = new LiteGraph.LGraph();
  const canvas = new LiteGraph.LGraphCanvas(container, graph);

  // Dark theme
  canvas.background_image = null;
  canvas.clear_background_color = '#0a0e17';
  canvas.default_link_color = '#06b6d4';
  canvas.highquality_render = true;
  canvas.render_shadows = false;
  canvas.render_curved_connections = true;
  canvas.connections_width = 2;

  // Mobile / touch support
  canvas.allow_interaction = true;
  canvas.allow_dragnodes = true;
  canvas.allow_searchbox = false; // search popup is unusable on mobile

  // Touch-to-mouse bridge: LiteGraph's built-in touch handling is incomplete.
  // Synthesize mouse events from touch events so pan, drag, and node
  // interaction work on mobile/tablet.
  _bridgeTouchEvents(container);

  LiteGraph.NODE_DEFAULT_COLOR = '#1f2937';
  LiteGraph.NODE_DEFAULT_BGCOLOR = '#111827';
  LiteGraph.NODE_DEFAULT_BOXCOLOR = '#06b6d4';
  LiteGraph.NODE_TITLE_COLOR = '#f9fafb';
  LiteGraph.NODE_TEXT_COLOR = '#9ca3af';
  LiteGraph.LINK_COLOR = '#06b6d4';
  LiteGraph.EVENT_LINK_COLOR = '#8b5cf6';
  LiteGraph.WIDGET_BGCOLOR = '#0a0e17';
  LiteGraph.WIDGET_TEXT_COLOR = '#f9fafb';
  LiteGraph.WIDGET_SECONDARY_TEXT_COLOR = '#6b7280';

  window.workflowGraph = graph;
  window.workflowCanvas = canvas;
  canvas._mounted = true;

  graph.start();

  // Load the active workflow from store, or default if none active
  const wfStore = Alpine?.store('workflows');
  if (wfStore?.activeId) {
    // Validate the persisted activeId still exists in the list
    const exists = wfStore.list.some(w => w.id === wfStore.activeId);
    if (exists) {
      const data = localStorage.getItem('mc-workflow-' + wfStore.activeId);
      if (data) {
        try { graph.configure(JSON.parse(data)); } catch {}
      }
    } else {
      wfStore.activeId = null;
    }
  }
  if (graph._nodes.length === 0) {
    addDefaultWorkflow(graph);
  }

  _resizeCanvas(container);
  window.addEventListener('resize', () => _resizeCanvas(container));

  // Start auto-save
  if (wfStore) wfStore.setupAutoSave();
}

window.initWorkflowCanvas = initWorkflowCanvas;

// ============================================================================
// CUSTOM NODE TYPES
// ============================================================================

function registerCustomNodes() {

  // ------------------------------------------
  // TRIGGER NODE
  // ------------------------------------------
  function TriggerNode() {
    this.addOutput('prompt', 'string');
    this.addOutput('trigger', LiteGraph.EVENT);
    this.addWidget('text', 'Prompt', 'Enter your task description...', (v) => {
      this.properties.prompt = v;
    });
    this.addWidget('combo', 'Trigger', 'Manual', (v) => {
      this.properties.trigger = v;
      this._updateScheduleWidgets();
    }, { values: ['Manual', 'Scheduled', 'Webhook', 'On Event'] });
    this.properties = { prompt: '', trigger: 'Manual', cronExpression: '0 */6 * * *', cronJobId: null };
    this.size = [280, 120];
    this.color = '#064e3b';
    this.bgcolor = '#022c22';
    this._scheduleWidgets = [];
  }
  TriggerNode.title = 'Trigger';
  TriggerNode.desc = 'Workflow start point';

  TriggerNode.prototype._updateScheduleWidgets = function () {
    // Remove previous schedule widgets
    for (const w of this._scheduleWidgets) {
      const idx = this.widgets.indexOf(w);
      if (idx !== -1) this.widgets.splice(idx, 1);
    }
    this._scheduleWidgets = [];

    if (this.properties.trigger === 'Scheduled') {
      const cronWidget = this.addWidget('text', 'Cron', this.properties.cronExpression, (v) => {
        this.properties.cronExpression = v;
      });
      this._scheduleWidgets.push(cronWidget);

      const btnWidget = this.addWidget('button', this.properties.cronJobId ? 'Remove Schedule' : 'Save Schedule', '', () => {
        this._toggleCronJob();
      });
      this._scheduleWidgets.push(btnWidget);

      if (this.properties.cronJobId) {
        const statusWidget = this.addWidget('text', 'Job ID', this.properties.cronJobId, null);
        statusWidget.disabled = true;
        this._scheduleWidgets.push(statusWidget);
      }
      this.size[1] = this.properties.cronJobId ? 200 : 170;
    } else {
      this.size[1] = 120;
    }
    this.setDirtyCanvas(true);
  };

  TriggerNode.prototype._toggleCronJob = async function () {
    const cron = Alpine?.store('cron');
    if (!cron || !window.openclawClient?.authenticated) {
      Alpine?.store('monitor')?.addLog('warn', 'Cannot manage cron: OpenClaw not connected');
      return;
    }

    if (this.properties.cronJobId) {
      // Remove existing cron job
      await cron.remove(this.properties.cronJobId);
      this.properties.cronJobId = null;
      Alpine?.store('monitor')?.addLog('info', 'Scheduled trigger removed');
    } else {
      // Find the first Agent node downstream to determine target
      const graph = this.graph;
      let targetAgent = 'lead';
      if (graph) {
        const link = this.outputs[0]?.links?.[0];
        if (link != null) {
          const linkInfo = graph.links[link];
          if (linkInfo) {
            const targetNode = graph.getNodeById(linkInfo.target_id);
            if (targetNode?.properties?.agent) {
              targetAgent = targetNode.properties.agent.toLowerCase().replace(/\s+/g, '-');
              if (targetAgent === '(auto)') targetAgent = 'lead';
            }
          }
        }
      }
      // Determine workflow ID from the workflows store
      const wfStore = Alpine?.store('workflows');
      const wfId = wfStore?.active?.id || 'wf-' + Date.now();
      const wfName = wfStore?.active?.name || 'Scheduled Workflow';

      try {
        await window.openclawClient.addCronJob({
          agentId: targetAgent,
          label: `Workflow: ${wfName}`,
          schedule: { type: 'cron', expression: this.properties.cronExpression },
          payload: { kind: 'systemEvent', message: `EXECUTE_WORKFLOW:${wfId}\n${this.properties.prompt}` },
          session: 'main',
        });
        // Refresh and find the new job
        await cron.fetch();
        const myJob = cron.jobs.find(j => j.label === `Workflow: ${wfName}`);
        this.properties.cronJobId = myJob?.id || myJob?.jobId || 'saved';
        Alpine?.store('monitor')?.addLog('info', `Scheduled trigger saved: ${this.properties.cronExpression}`);
      } catch (err) {
        Alpine?.store('monitor')?.addLog('error', `Failed to save schedule: ${err.message}`);
      }
    }
    this._updateScheduleWidgets();
  };

  TriggerNode.prototype.onExecute = function () {
    this.setOutputData(0, this.properties.prompt);
  };
  // Async execution for workflow runner
  TriggerNode.prototype.runAsync = async function (inputs) {
    return { prompt: this.properties.prompt };
  };
  LiteGraph.registerNodeType('mission/trigger', TriggerNode);

  // ------------------------------------------
  // AGENT NODE — calls OpenClaw or LiteLLM
  // ------------------------------------------
  function AgentNode() {
    this.addInput('prompt', 'string');
    this.addInput('context', 'string');
    this.addOutput('response', 'string');
    this.addOutput('done', LiteGraph.EVENT);

    // Build agent list from the agents store
    const agentNames = ['(Auto)'];
    try {
      const agents = Alpine.store('agents')?.list || [];
      agents.forEach(a => agentNames.push(a.name));
    } catch {}

    this.addWidget('combo', 'Agent', '(Auto)', (v) => {
      this.properties.agent = v;
    }, { values: agentNames });

    this.addWidget('text', 'System Prompt', 'You are a helpful assistant.', (v) => {
      this.properties.systemPrompt = v;
    });
    this.addWidget('number', 'Max Tokens', 2048, (v) => {
      this.properties.maxTokens = v;
    }, { min: 128, max: 32768, step: 128 });

    this.properties = { agent: '(Auto)', systemPrompt: 'You are a helpful assistant.', maxTokens: 2048 };
    this.size = [300, 160];
    this.color = '#1e3a5f';
    this.bgcolor = '#0c1929';
  }
  AgentNode.title = 'Agent';
  AgentNode.desc = 'Sends prompt to an AI agent (OpenClaw or LiteLLM)';
  AgentNode.prototype.onExecute = function () {
    const prompt = this.getInputData(0);
    if (prompt) {
      this.setOutputData(0, this._lastResponse || '');
    }
  };
  AgentNode.prototype.runAsync = async function (inputs) {
    const prompt = inputs.prompt || '';
    const context = inputs.context || '';
    const fullPrompt = context ? `Context: ${context}\n\nTask: ${prompt}` : prompt;

    if (!fullPrompt) return { response: '' };

    // Find the agent
    let agent = null;
    if (this.properties.agent !== '(Auto)') {
      const agents = Alpine.store('agents')?.list || [];
      agent = agents.find(a => a.name === this.properties.agent);
    }

    // Strip litellm/ prefix — LiteLLM expects bare aliases (e.g. groq-llama-3.3-70b)
    const model = (agent?.model || 'groq-llama-3.3-70b').replace(/^litellm\//, '');
    const messages = [];
    const sysPrompt = this.properties.systemPrompt || agent?.systemPrompt;
    if (sysPrompt) messages.push({ role: 'system', content: sysPrompt });
    messages.push({ role: 'user', content: fullPrompt });

    // Try OpenClaw first, then LiteLLM, then return error
    if (window.openclawClient?.authenticated) {
      try {
        const agentId = agent?.id || 'lead';
        const result = await window.openclawClient.sendChat(fullPrompt, {
          sessionKey: 'agent:' + agentId + ':main',
        });
        // Correlate response events with this specific run's runId/idempotencyKey
        // to prevent cross-talk from concurrent workflow nodes or chat panel
        const runId = result?.runId || result?._idempotencyKey;
        const response = await this._waitForResponse(120000, runId);
        this._lastResponse = response;
        return { response };
      } catch (e) {
        console.warn('[Workflow Agent] OpenClaw failed, trying LiteLLM:', e.message);
      }
    }

    // Fallback: direct LiteLLM
    if (window.litellmApi) {
      try {
        const response = await litellmApi.chat(model, messages);
        this._lastResponse = response;
        return { response };
      } catch (e) {
        return { response: `Error: ${e.message}` };
      }
    }

    return { response: '[Demo] Agent would process: ' + fullPrompt.slice(0, 100) };
  };
  // Dynamically refresh the Agent combo widget so it always reflects current agents
  AgentNode.prototype.onDrawForeground = function () {
    const widget = this.widgets?.find(w => w.name === 'Agent');
    if (widget) {
      const agentNames = ['(Auto)'];
      try {
        const agents = Alpine.store('agents')?.list || [];
        agents.forEach(a => agentNames.push(a.name));
      } catch {}
      widget.options.values = agentNames;
      if (!agentNames.includes(this.properties.agent)) {
        this.properties.agent = '(Auto)';
        widget.value = '(Auto)';
      }
    }
  };
  AgentNode.prototype._waitForResponse = function (timeoutMs, runId) {
    return new Promise((resolve) => {
      let content = '';
      const cleanup = [];

      const timer = setTimeout(() => {
        cleanup.forEach(fn => fn());
        resolve(content || '[Timeout waiting for response]');
      }, timeoutMs);

      if (window.openclawClient) {
        // OpenClaw emits a single 'chat' event with payload.state = 'delta' | 'final' | 'error'
        // (not separate 'chat.delta' / 'chat.complete' events)
        const offChat = window.openclawClient.on('chat', (p) => {
          // Only process events for this specific run
          if (runId && p.runId && p.runId !== runId) return;

          if (p.state === 'delta') {
            // Use extractMessageText (from app.js) for robust nested format handling
            const delta = extractMessageText(p.message)
              || extractMessageText(p.content)
              || extractMessageText(p.delta)
              || extractMessageText(p.text)
              || '';
            content += delta;
          } else if (p.state === 'final') {
            // Extract final content if present
            if (p.message) {
              const finalText = extractMessageText(p.message);
              if (finalText && !content) content = finalText;
            }
            clearTimeout(timer);
            cleanup.forEach(fn => fn());
            resolve(content);
          } else if (p.state === 'error') {
            clearTimeout(timer);
            cleanup.forEach(fn => fn());
            resolve(content || `[Error: ${p.errorMessage || 'unknown'}]`);
          }
        });
        cleanup.push(offChat);
      }
    });
  };
  LiteGraph.registerNodeType('mission/agent', AgentNode);

  // ------------------------------------------
  // TASK NODE
  // ------------------------------------------
  function TaskNode() {
    this.addInput('input', 'string');
    this.addInput('execute', LiteGraph.ACTION);
    this.addOutput('result', 'string');
    this.addOutput('done', LiteGraph.EVENT);
    this.addWidget('text', 'Goal', 'Describe the task goal...', (v) => {
      this.properties.goal = v;
    });
    this.addWidget('text', 'Constraints', 'Any constraints or requirements...', (v) => {
      this.properties.constraints = v;
    });
    this.addWidget('combo', 'Priority', 'Normal', (v) => {
      this.properties.priority = v;
    }, { values: ['Low', 'Normal', 'High', 'Critical'] });

    this.properties = { goal: '', constraints: '', priority: 'Normal' };
    this.size = [280, 160];
    this.color = '#4a1d6b';
    this.bgcolor = '#1a0a2e';
  }
  TaskNode.title = 'Task';
  TaskNode.desc = 'Defines a task with goal, constraints, and priority';
  TaskNode.prototype.onExecute = function () {
    const input = this.getInputData(0);
    if (input) {
      this.setOutputData(0, `Task [${this.properties.priority}]: ${this.properties.goal}\n${input}`);
    }
  };
  TaskNode.prototype.runAsync = async function (inputs) {
    const input = inputs.input || '';
    let result = input;
    if (this.properties.goal) {
      result = `[Task: ${this.properties.goal}] [Priority: ${this.properties.priority}]\n`;
      if (this.properties.constraints) result += `Constraints: ${this.properties.constraints}\n`;
      result += `Input: ${input}`;
    }
    return { result };
  };
  LiteGraph.registerNodeType('mission/task', TaskNode);

  // ------------------------------------------
  // TOOL NODE — Real tool execution via OpenClaw agents
  // ------------------------------------------

  // Tool-specific prompt builders and timeout values
  const TOOL_DEFS = {
    'Web Search': {
      timeout: 30000,
      prompt: (input, config) =>
        `Use the web_search tool with query: ${input}\n` +
        (config.maxResults ? `Return up to ${config.maxResults} results.\n` : '') +
        `Return a concise summary of the most relevant findings with source URLs.`,
    },
    'Web Scrape': {
      timeout: 30000,
      prompt: (input, config) => {
        const url = config.url || input;
        const selector = config.selector ? ` --data-urlencode "selector=${config.selector}"` : '';
        return `Use the exec tool to run this command:\nwget -qO- 'http://scrapling:8000/scrape?url=${encodeURIComponent(url)}${selector}'\n\nReturn the scraped content. If it fails, report the error.`;
      },
    },
    'Code Execution': {
      timeout: 60000,
      prompt: (input, config) => {
        const lang = config.language || 'javascript';
        if (lang === 'javascript' || lang === 'node') {
          return `Use the exec tool to run this Node.js code:\nnode -e ${JSON.stringify(input)}\n\nReturn the output.`;
        }
        return `Use the exec tool to execute the following code.\nLanguage: ${lang}\n\`\`\`\n${input}\n\`\`\`\nReturn the output.`;
      },
    },
    'File Read': {
      timeout: 15000,
      prompt: (input, config) => {
        const path = config.path || input;
        return `Use the read tool to read the file at: ${path}\nReturn the file contents.`;
      },
    },
    'File Write': {
      timeout: 15000,
      prompt: (input, config) => {
        const path = config.path || '/workspace/staging/tool-output-' + Date.now().toString(36) + '.txt';
        return `Use the write tool to write the following content to ${path}:\n${input}\nConfirm when done.`;
      },
    },
    'Shell Access': {
      timeout: 60000,
      prompt: (input, config) => {
        const cmd = config.command || input;
        return `Use the exec tool to run this shell command:\n${cmd}\n\nReturn the complete output. If the command fails, return the error message.`;
      },
    },
    'API Call': {
      timeout: 30000,
      prompt: (input, config) => {
        const method = config.method || 'GET';
        const url = config.url || input;
        const headers = config.headers ? Object.entries(config.headers).map(([k, v]) => `--header '${k}: ${v}'`).join(' ') : '';
        const body = config.body ? `--post-data '${typeof config.body === 'string' ? config.body : JSON.stringify(config.body)}'` : '';
        return `Use the exec tool to make an HTTP request:\nwget -qO- ${headers} ${body} '${url}'\n\nReturn the response body.`;
      },
    },
    'Web Browser': {
      timeout: 60000,
      prompt: (input, config) => {
        const url = config.url || input;
        return `Use the browser tool to navigate to ${url}.\n` +
          (config.action || 'Take a screenshot and describe what you see.') +
          `\nReturn the results.`;
      },
    },
  };

  function ToolNode() {
    this.addInput('input', 'string');
    this.addInput('execute', LiteGraph.ACTION);
    this.addOutput('result', 'string');
    this.addOutput('done', LiteGraph.EVENT);
    this.addWidget('combo', 'Tool', 'Web Search', (v) => {
      this.properties.tool = v;
    }, { values: Object.keys(TOOL_DEFS) });
    this.addWidget('text', 'Config', '{}', (v) => {
      this.properties.config = v;
    });
    this.addWidget('combo', 'Agent', 'lead', (v) => {
      this.properties.agentId = v;
    }, { values: ['lead', 'codecraft', 'scout', 'scribe', 'ops-lead', 'builder', 'sentinel', 'chronicler'] });

    this.properties = { tool: 'Web Search', config: '{}', agentId: 'lead' };
    this.size = [280, 140];
    this.color = '#6b4d1a';
    this.bgcolor = '#2e1f0a';
  }
  ToolNode.title = 'Tool';
  ToolNode.desc = 'Executes a real tool via OpenClaw agent (search, scrape, code, files, shell, API, browser)';
  ToolNode.prototype.onExecute = function () {
    const input = this.getInputData(0);
    if (input) {
      this.setOutputData(0, this._lastResult || `[${this.properties.tool}] ${input}`);
    }
  };
  ToolNode.prototype.runAsync = async function (inputs) {
    const input = inputs.input || '';
    const toolName = this.properties.tool;
    let config = {};
    try { config = JSON.parse(this.properties.config || '{}'); } catch {}

    const toolDef = TOOL_DEFS[toolName] || TOOL_DEFS['Shell Access'];
    const toolPrompt = toolDef.prompt(input, config);
    const timeout = toolDef.timeout;

    if (window.openclawClient?.authenticated) {
      try {
        const agentId = this.properties.agentId || config.agentId || 'lead';
        const result = await window.openclawClient.sendChat(toolPrompt, {
          sessionKey: 'agent:' + agentId + ':main',
        });
        const toolRunId = result?.runId || result?._idempotencyKey;
        const response = await AgentNode.prototype._waitForResponse.call(this, timeout, toolRunId);
        this._lastResult = response;
        return { result: response };
      } catch (e) {
        this._lastResult = `[${toolName} Error]: ${e.message}`;
        return { result: this._lastResult };
      }
    }

    // Fallback: direct LiteLLM for search-like tools
    if (window.litellmApi && (toolName === 'Web Search' || toolName === 'Code Execution')) {
      try {
        const response = await litellmApi.chat('groq-llama-3.3-70b', [
          { role: 'system', content: `You are a tool execution assistant. Execute the requested tool operation and return the result.` },
          { role: 'user', content: toolPrompt },
        ]);
        this._lastResult = response;
        return { result: response };
      } catch (e) {
        this._lastResult = `[${toolName} Error]: ${e.message}`;
        return { result: this._lastResult };
      }
    }

    this._lastResult = `[${toolName}] (demo) Input: ${input.slice(0, 100)}`;
    return { result: this._lastResult };
  };
  LiteGraph.registerNodeType('mission/tool', ToolNode);

  // ------------------------------------------
  // CONDITION NODE
  // ------------------------------------------
  function ConditionNode() {
    this.addInput('input', 'string');
    this.addOutput('true', 'string');
    this.addOutput('false', 'string');
    this.addWidget('text', 'Condition', 'contains "error"', (v) => {
      this.properties.condition = v;
    });
    this.addWidget('combo', 'Type', 'Contains', (v) => {
      this.properties.type = v;
    }, { values: ['Contains', 'Equals', 'Regex', 'Length >', 'Is Empty'] });

    this.properties = { condition: '', type: 'Contains' };
    this.size = [240, 110];
    this.color = '#5c4d1a';
    this.bgcolor = '#2e260a';
  }
  ConditionNode.title = 'Condition';
  ConditionNode.desc = 'Routes data based on a condition';
  ConditionNode.prototype.onExecute = function () {
    const input = this.getInputData(0) || '';
    const result = this._evaluate(input);
    this.setOutputData(result ? 0 : 1, input);
  };
  ConditionNode.prototype._evaluate = function (input) {
    const cond = this.properties.condition;
    switch (this.properties.type) {
      case 'Contains': return input.includes(cond);
      case 'Equals': return input === cond;
      case 'Regex': try { return new RegExp(cond).test(input); } catch { return false; }
      case 'Length >': return input.length > (parseInt(cond) || 0);
      case 'Is Empty': return !input || input.trim() === '';
      default: return false;
    }
  };
  ConditionNode.prototype.runAsync = async function (inputs) {
    const input = inputs.input || '';
    const result = this._evaluate(input);
    // Return to both outputs; the executor uses the connection to route
    return { true: result ? input : null, false: result ? null : input };
  };
  LiteGraph.registerNodeType('mission/condition', ConditionNode);

  // ------------------------------------------
  // OUTPUT NODE
  // ------------------------------------------
  function OutputNode() {
    this.addInput('result', 'string');
    this.addInput('done', LiteGraph.ACTION);
    this.addWidget('combo', 'Destination', 'Log', (v) => {
      this.properties.destination = v;
    }, { values: ['Log', 'Chat Response', 'File', 'Webhook'] });
    this.addWidget('text', 'Label', 'Output', (v) => {
      this.properties.label = v;
    });

    this.properties = { destination: 'Log', label: 'Output' };
    this.size = [240, 100];
    this.color = '#1a4d3a';
    this.bgcolor = '#0a2e1f';
  }
  OutputNode.title = 'Output';
  OutputNode.desc = 'Delivers results (log, chat, file, webhook)';
  OutputNode.prototype.onExecute = function () {};
  OutputNode.prototype.runAsync = async function (inputs) {
    const result = inputs.result || '';
    const monitor = Alpine?.store('monitor');
    const dest = this.properties.destination;
    const label = this.properties.label || 'Output';

    // Always log
    if (monitor) {
      monitor.addLog('info', `[Workflow] ${label}: ${result.slice(0, 200)}`);
    }

    // Route to destination
    if (dest === 'Chat Response') {
      // Push workflow result into the active chat session as a system message
      const sessions = Alpine?.store('sessions');
      if (sessions?.activeId) {
        sessions.messages.push({
          role: 'agent',
          content: `**[Workflow: ${label}]**\n\n${result}`,
          time: new Date().toTimeString().slice(0, 5),
        });
      }
    } else if (dest === 'File') {
      // Write result to staging via workflow bridge
      if (window.workflowBridge && window.openclawClient?.authenticated) {
        try {
          const fileId = 'wf-output-' + Date.now().toString(36);
          await window.openclawClient.sendChat(
            `WRITE_FILES:${JSON.stringify({
              action: 'WRITE_FILES',
              files: [{ path: `/workspace/staging/${fileId}.txt`, content: result }],
              updateIndex: {
                path: '/workspace/staging/index.json',
                entry: { id: fileId, name: label, path: fileId + '.txt', type: 'text', createdBy: 'workflow', description: 'Workflow output: ' + label, status: 'pending' },
              },
            })}`,
            { sessionKey: 'agent:lead:main' }
          );
        } catch {}
      }
    }

    return { output: result };
  };
  LiteGraph.registerNodeType('mission/output', OutputNode);

  // ------------------------------------------
  // LOOP NODE — iterates downstream subgraph per item
  // ------------------------------------------
  function LoopNode() {
    this.addInput('items', 'string');
    this.addOutput('item', 'string');
    this.addOutput('index', 'number');
    this.addOutput('done', LiteGraph.EVENT);
    this.addOutput('results', 'string');
    this.addWidget('number', 'Max Iterations', 10, (v) => {
      this.properties.maxIter = v;
    }, { min: 1, max: 100, step: 1 });
    this.addWidget('combo', 'Separator', 'Newline', (v) => {
      this.properties.separator = v;
    }, { values: ['Newline', 'Double Newline', 'JSON Array', 'Comma'] });
    this.addWidget('combo', 'Split By', 'Newline', (v) => {
      this.properties.splitBy = v;
    }, { values: ['Newline', 'Double Newline', 'Comma', 'JSON Array'] });

    this.properties = { maxIter: 10, separator: 'Newline', splitBy: 'Newline' };
    this.size = [240, 140];
    this.color = '#1a3d5c';
    this.bgcolor = '#0a1f2e';
  }
  LoopNode.title = 'Loop';
  LoopNode.desc = 'Iterates over items, runs downstream per item, collects results';
  LoopNode.prototype.onExecute = function () {};
  LoopNode.prototype._splitItems = function (raw) {
    switch (this.properties.splitBy) {
      case 'JSON Array':
        try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr.map(String) : [raw]; } catch { return [raw]; }
      case 'Comma':
        return raw.split(',').map(s => s.trim()).filter(Boolean);
      case 'Double Newline':
        return raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
      default: // Newline
        return raw.split('\n').filter(Boolean);
    }
  };
  LoopNode.prototype._joinResults = function (results) {
    switch (this.properties.separator) {
      case 'JSON Array':
        return JSON.stringify(results);
      case 'Comma':
        return results.join(', ');
      case 'Double Newline':
        return results.join('\n\n');
      default: // Newline
        return results.join('\n');
    }
  };
  LoopNode.prototype.runAsync = async function (inputs) {
    const items = inputs.items || '';
    const parts = this._splitItems(items).slice(0, this.properties.maxIter);
    // Return _loop marker for the executor to handle iteration
    return {
      _loop: true,
      _items: parts,
      _joinResults: this._joinResults.bind(this),
      item: parts[0] || '',
      index: 0,
      done: parts.length === 0,
      results: '',
    };
  };
  LiteGraph.registerNodeType('mission/loop', LoopNode);

  // ------------------------------------------
  // MERGE NODE
  // ------------------------------------------
  function MergeNode() {
    this.addInput('input_1', 'string');
    this.addInput('input_2', 'string');
    this.addOutput('merged', 'string');
    this.addWidget('combo', 'Mode', 'Concatenate', (v) => {
      this.properties.mode = v;
    }, { values: ['Concatenate', 'JSON Merge', 'Pick Best', 'Summary'] });

    this.properties = { mode: 'Concatenate' };
    this.size = [220, 80];
    this.color = '#3d1a5c';
    this.bgcolor = '#1f0a2e';
  }
  MergeNode.title = 'Merge';
  MergeNode.desc = 'Combines multiple inputs';
  MergeNode.prototype.onExecute = function () {
    const a = this.getInputData(0) || '';
    const b = this.getInputData(1) || '';
    this.setOutputData(0, a + '\n---\n' + b);
  };
  MergeNode.prototype.runAsync = async function (inputs) {
    const a = inputs.input_1 || '';
    const b = inputs.input_2 || '';
    let merged;
    switch (this.properties.mode) {
      case 'JSON Merge':
        try { merged = JSON.stringify({ ...JSON.parse(a), ...JSON.parse(b) }); } catch { merged = a + '\n' + b; }
        break;

      case 'Pick Best':
        if (window.litellmApi && a && b) {
          try {
            merged = await litellmApi.chat('groq-llama-3.3-70b', [
              { role: 'system', content: 'Compare two text responses and return ONLY the better one verbatim. Do not add commentary.' },
              { role: 'user', content: `Response A:\n${a}\n\nResponse B:\n${b}\n\nReturn the better response:` },
            ]);
          } catch {
            merged = a.length > b.length ? a : b;
          }
        } else {
          merged = a.length > b.length ? a : b;
        }
        break;

      case 'Summary':
        if (window.litellmApi && (a || b)) {
          try {
            merged = await litellmApi.chat('groq-llama-3.3-70b', [
              { role: 'system', content: 'Summarize the following inputs into a concise unified summary.' },
              { role: 'user', content: `Input 1:\n${a}\n\nInput 2:\n${b}` },
            ]);
          } catch {
            merged = [a, b].filter(Boolean).join('\n---\n');
          }
        } else {
          merged = [a, b].filter(Boolean).join('\n---\n');
        }
        break;

      default:
        merged = [a, b].filter(Boolean).join('\n---\n');
    }
    return { merged };
  };
  LiteGraph.registerNodeType('mission/merge', MergeNode);
}

// ============================================================================
// WORKFLOW EXECUTOR — walks the graph and runs nodes with real API calls
// ============================================================================

class WorkflowExecutor {
  constructor(graph) {
    this.graph = graph;
    this.running = false;
    this.results = new Map(); // nodeId -> output data
  }

  async execute() {
    if (this.running) return;
    this.running = true;

    const monitor = Alpine?.store('monitor');
    const wfStore = Alpine?.store('workflows');
    if (wfStore) wfStore.running = true;

    const nodes = this.graph._nodes;
    if (!nodes || nodes.length === 0) {
      this.running = false;
      if (wfStore) wfStore.running = false;
      return;
    }

    // Sort nodes topologically by following links
    const sorted = this._topologicalSort(nodes);
    monitor?.addLog('info', `Workflow executing: ${sorted.length} nodes`);

    // Track nodes already executed by loop iteration so main loop skips them
    const loopExecuted = new Set();

    for (const node of sorted) {
      if (!this.running) break;
      if (loopExecuted.has(node.id)) continue;

      // Highlight executing node
      node.boxcolor = '#f59e0b'; // amber = running
      this.graph.setDirtyCanvas(true);

      try {
        // Gather inputs from connected upstream nodes
        const inputs = this._gatherInputs(node);

        // Branch gating: skip nodes whose connected inputs are all null.
        const inputValues = Object.values(inputs);
        const hasConnectedInputs = node.inputs && node.inputs.some(inp => inp.link != null);
        if (hasConnectedInputs && inputValues.length > 0 && inputValues.every(v => v === null || v === undefined)) {
          node.boxcolor = '#6b7280'; // gray = skipped (inactive branch)
          this.results.set(node.id, null); // propagate null downstream
          monitor?.addLog('debug', `Node "${node.title}" skipped (inactive branch)`);
          this.graph.setDirtyCanvas(true);
          continue;
        }

        // Execute the node's async handler
        if (typeof node.runAsync === 'function') {
          const output = await node.runAsync(inputs);

          // Handle loop iteration: re-run downstream subgraph for each item
          if (output?._loop && output._items?.length > 0) {
            const downstreamIds = this._getDownstreamNodes(node.id);
            const downstreamSorted = sorted.filter(n => downstreamIds.has(n.id));

            monitor?.addLog('info', `Loop "${node.title}": iterating ${output._items.length} items`);

            // Accumulate results from the last downstream node per iteration
            const accumulatedResults = [];

            for (let i = 0; i < output._items.length; i++) {
              if (!this.running) break;
              monitor?.addLog('debug', `Loop "${node.title}": item ${i + 1}/${output._items.length}`);

              const iterOutput = { item: output._items[i], index: i, done: i === output._items.length - 1, results: '' };
              this.results.set(node.id, iterOutput);

              let lastDnOutput = null;

              for (const dn of downstreamSorted) {
                if (!this.running) break;
                dn.boxcolor = '#f59e0b';
                this.graph.setDirtyCanvas(true);

                try {
                  const dnInputs = this._gatherInputs(dn);
                  const dnInputValues = Object.values(dnInputs);
                  const dnHasConnected = dn.inputs?.some(inp => inp.link != null);
                  if (dnHasConnected && dnInputValues.length > 0 && dnInputValues.every(v => v === null || v === undefined)) {
                    dn.boxcolor = '#6b7280';
                    continue;
                  }
                  if (typeof dn.runAsync === 'function') {
                    const dnOutput = await dn.runAsync(dnInputs);
                    this.results.set(dn.id, dnOutput);
                    lastDnOutput = dnOutput;
                    dn.boxcolor = '#10b981';

                    // Governance: record Agent node tasks during loop
                    if (dn.type === 'mission/agent' && dnOutput?.response) {
                      this._recordAgentGovernance(dn, dnOutput);
                    }
                  }
                } catch (dnErr) {
                  monitor?.addLog('error', `Loop iteration ${i}: Node "${dn.title}" failed: ${dnErr.message}`);
                  dn.boxcolor = '#ef4444';
                  this.results.set(dn.id, { error: dnErr.message });
                  lastDnOutput = { error: dnErr.message };
                }
                this.graph.setDirtyCanvas(true);
              }

              // Collect the primary text result from this iteration
              if (lastDnOutput) {
                const iterResult = lastDnOutput.response || lastDnOutput.result || lastDnOutput.merged || lastDnOutput.output
                  || (lastDnOutput.error ? `[Error: ${lastDnOutput.error}]` : '');
                if (iterResult) accumulatedResults.push(iterResult);
              }
            }

            // Mark downstream as already executed so main loop skips them
            for (const did of downstreamIds) loopExecuted.add(did);

            // Join accumulated results using the loop node's configured separator
            const joinFn = output._joinResults || ((arr) => arr.join('\n'));
            const joinedResults = joinFn(accumulatedResults);

            // Set final loop output with accumulated results
            this.results.set(node.id, {
              item: output._items[output._items.length - 1],
              index: output._items.length - 1,
              done: true,
              results: joinedResults,
            });
            node.boxcolor = '#10b981';
            this.graph.setDirtyCanvas(true);
            monitor?.addLog('info', `Loop "${node.title}": completed ${output._items.length} iterations, ${accumulatedResults.length} results collected`);
            continue;
          }

          this.results.set(node.id, output);
          monitor?.addLog('debug', `Node "${node.title}" completed`);
          node.boxcolor = '#10b981'; // green = success

          // Governance: record Agent node tasks
          if (node.type === 'mission/agent' && output?.response) {
            this._recordAgentGovernance(node, output);
          }
        } else {
          node.boxcolor = '#6b7280'; // gray = skipped
        }
      } catch (err) {
        monitor?.addLog('error', `Node "${node.title}" failed: ${err.message}`);
        node.boxcolor = '#ef4444'; // red = error
        this.results.set(node.id, { error: err.message });
      }

      this.graph.setDirtyCanvas(true);
    }

    this.running = false;
    if (wfStore) {
      wfStore.running = false;
      const wf = wfStore.active;
      if (wf) { wf.lastRun = 'Just now'; wf.status = 'completed'; }
    }
    monitor?.addLog('info', 'Workflow execution complete');
    if (window.mcAudio) window.mcAudio.workflowComplete();

    // Reset node colors after 3 seconds
    setTimeout(() => {
      for (const node of nodes) {
        node.boxcolor = LiteGraph.NODE_DEFAULT_BOXCOLOR;
      }
      this.graph.setDirtyCanvas(true);
    }, 3000);
  }

  stop() {
    this.running = false;
  }

  _topologicalSort(nodes) {
    // Simple BFS from trigger/input nodes (no incoming links)
    const inDegree = new Map();
    const adj = new Map();
    const nodeMap = new Map();

    for (const n of nodes) {
      nodeMap.set(n.id, n);
      inDegree.set(n.id, 0);
      adj.set(n.id, []);
    }

    // Count incoming connections
    if (this.graph.links) {
      for (const linkId in this.graph.links) {
        const link = this.graph.links[linkId];
        if (link && nodeMap.has(link.target_id) && nodeMap.has(link.origin_id)) {
          inDegree.set(link.target_id, (inDegree.get(link.target_id) || 0) + 1);
          adj.get(link.origin_id).push(link.target_id);
        }
      }
    }

    // BFS
    const queue = [];
    const sorted = [];

    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    while (queue.length > 0) {
      const id = queue.shift();
      sorted.push(nodeMap.get(id));

      for (const nextId of (adj.get(id) || [])) {
        const newDeg = (inDegree.get(nextId) || 1) - 1;
        inDegree.set(nextId, newDeg);
        if (newDeg === 0) queue.push(nextId);
      }
    }

    return sorted;
  }

  _getDownstreamNodes(nodeId) {
    const downstream = new Set();
    const queue = [nodeId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (this.graph.links) {
        for (const linkId in this.graph.links) {
          const link = this.graph.links[linkId];
          if (link && link.origin_id === current && !downstream.has(link.target_id)) {
            downstream.add(link.target_id);
            queue.push(link.target_id);
          }
        }
      }
    }
    return downstream;
  }

  _recordAgentGovernance(node, output) {
    try {
      const agentName = node.properties?.agent;
      if (!agentName || agentName === '(Auto)') return;
      const agent = Alpine.store('agents')?.list.find(a => a.name === agentName);
      if (!agent) return;
      const tokens = Math.round((output.response || '').length / 4);
      Alpine.store('governance')?.recordTask(agent.id, {
        success: !(output.response || '').startsWith('Error:'),
        tokens,
        taskType: 'workflow',
      });
    } catch {}
  }

  _gatherInputs(node) {
    const inputs = {};
    if (!node.inputs) return inputs;

    for (let i = 0; i < node.inputs.length; i++) {
      const input = node.inputs[i];
      if (!input.link) continue;

      const link = this.graph.links[input.link];
      if (!link) continue;

      const sourceOutput = this.results.get(link.origin_id);
      if (sourceOutput !== undefined && sourceOutput !== null) {
        // Match output slot name to input slot name
        // Use explicit undefined checks to preserve valid falsy values (null, false, 0, '')
        const sourceNode = this.graph.getNodeById(link.origin_id);
        if (sourceNode && sourceNode.outputs && sourceNode.outputs[link.origin_slot]) {
          const outputName = sourceNode.outputs[link.origin_slot].name;
          const val = sourceOutput[outputName];
          inputs[input.name] = val !== undefined ? val : (Object.values(sourceOutput)[0] ?? '');
        } else {
          inputs[input.name] = Object.values(sourceOutput)[0] ?? '';
        }
      }
    }

    return inputs;
  }
}

// ============================================================================
// DEFAULT WORKFLOW TEMPLATE
// ============================================================================

function addDefaultWorkflow(graph) {
  const trigger = LiteGraph.createNode('mission/trigger');
  trigger.pos = [100, 200];
  trigger.properties.prompt = 'Review this code for security issues';
  graph.add(trigger);

  const agent = LiteGraph.createNode('mission/agent');
  agent.pos = [450, 180];
  graph.add(agent);

  const condition = LiteGraph.createNode('mission/condition');
  condition.pos = [800, 180];
  condition.properties.condition = 'error';
  condition.properties.type = 'Contains';
  graph.add(condition);

  const output = LiteGraph.createNode('mission/output');
  output.pos = [1100, 140];
  output.properties.label = 'Review Result';
  output.properties.destination = 'Log';
  graph.add(output);

  const tool = LiteGraph.createNode('mission/tool');
  tool.pos = [1100, 300];
  tool.properties.tool = 'Web Search';
  graph.add(tool);

  trigger.connect(0, agent, 0);
  agent.connect(0, condition, 0);
  condition.connect(0, output, 0);
  condition.connect(1, tool, 0);
}

// ============================================================================
// PALETTE BUTTON HANDLER
// ============================================================================

window.addNodeToCanvas = function (nodeType) {
  if (!window.workflowGraph) {
    initWorkflowCanvas();
  }
  if (!window.workflowGraph) return;

  const node = LiteGraph.createNode('mission/' + nodeType);
  if (node) {
    const canvas = window.workflowCanvas;
    if (canvas) {
      const center = canvas.convertOffsetToCanvas([
        canvas.canvas.width / 2,
        canvas.canvas.height / 2,
      ]);
      node.pos = [center[0] - node.size[0] / 2, center[1] - node.size[1] / 2];
    } else {
      node.pos = [300, 200];
    }
    window.workflowGraph.add(node);
  }
};

// ============================================================================
// EXPOSE EXECUTOR — used by the workflows store's run() method
// ============================================================================

window.WorkflowExecutor = WorkflowExecutor;
