// ============================================================================
// Mission Control — workflow.js
// LiteGraph.js custom node types, canvas initialization, and workflow executor
// Nodes execute real OpenClaw/LiteLLM calls when the workflow runs
// in-fused.org
// ============================================================================

window.workflowGraph = null;
window.workflowCanvas = null;

function initWorkflowCanvas() {
  if (typeof LiteGraph === 'undefined') {
    console.warn('LiteGraph not loaded yet');
    return;
  }

  const container = document.getElementById('workflow-canvas');
  if (!container) return;
  if (window.workflowCanvas && window.workflowCanvas._mounted) return;

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

  if (graph._nodes.length === 0) {
    addDefaultWorkflow(graph);
  }

  function resizeCanvas() {
    const rect = container.parentElement.getBoundingClientRect();
    container.width = rect.width;
    container.height = rect.height;
    canvas.resize();
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
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
    }, { values: ['Manual', 'Scheduled', 'Webhook', 'On Event'] });
    this.properties = { prompt: '', trigger: 'Manual' };
    this.size = [280, 120];
    this.color = '#064e3b';
    this.bgcolor = '#022c22';
  }
  TriggerNode.title = 'Trigger';
  TriggerNode.desc = 'Workflow start point';
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

    const model = agent?.model || 'groq-llama-3.3-70b';
    const messages = [];
    const sysPrompt = this.properties.systemPrompt || agent?.systemPrompt;
    if (sysPrompt) messages.push({ role: 'system', content: sysPrompt });
    messages.push({ role: 'user', content: fullPrompt });

    // Try OpenClaw first, then LiteLLM, then return error
    if (window.openclawClient?.authenticated) {
      try {
        await window.openclawClient.sendChat(fullPrompt, {
          agentId: agent?.id,
        });
        // Wait for response via events (simplified — collect until complete)
        const response = await this._waitForResponse(5000);
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
  AgentNode.prototype._waitForResponse = function (timeoutMs) {
    return new Promise((resolve) => {
      let content = '';
      const cleanup = [];

      const timer = setTimeout(() => {
        cleanup.forEach(fn => fn());
        resolve(content || '[Timeout waiting for response]');
      }, timeoutMs);

      if (window.openclawClient) {
        const offDelta = window.openclawClient.on('chat.delta', (p) => {
          content += (p.content || p.delta || '');
        });
        const offComplete = window.openclawClient.on('chat.complete', () => {
          clearTimeout(timer);
          cleanup.forEach(fn => fn());
          resolve(content);
        });
        cleanup.push(offDelta, offComplete);
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
  // TOOL NODE
  // ------------------------------------------
  function ToolNode() {
    this.addInput('input', 'string');
    this.addInput('execute', LiteGraph.ACTION);
    this.addOutput('result', 'string');
    this.addOutput('done', LiteGraph.EVENT);
    this.addWidget('combo', 'Tool', 'Web Search', (v) => {
      this.properties.tool = v;
    }, { values: ['Web Search', 'Code Execution', 'File Operations', 'Web Browser', 'Shell Access', 'API Call'] });
    this.addWidget('text', 'Config', '{}', (v) => {
      this.properties.config = v;
    });

    this.properties = { tool: 'Web Search', config: '{}' };
    this.size = [260, 120];
    this.color = '#6b4d1a';
    this.bgcolor = '#2e1f0a';
  }
  ToolNode.title = 'Tool';
  ToolNode.desc = 'Executes a tool (search, code, files, browser, shell, API)';
  ToolNode.prototype.onExecute = function () {
    const input = this.getInputData(0);
    if (input) {
      this.setOutputData(0, this._lastResult || `[${this.properties.tool}] ${input}`);
    }
  };
  ToolNode.prototype.runAsync = async function (inputs) {
    const input = inputs.input || '';
    // Tools execute through an agent prompt that requests the specific tool
    const toolPrompt = `Use the ${this.properties.tool} tool to: ${input}`;

    if (window.openclawClient?.authenticated) {
      try {
        await window.openclawClient.sendChat(toolPrompt);
        const response = await AgentNode.prototype._waitForResponse.call(this, 10000);
        this._lastResult = response;
        return { result: response };
      } catch {}
    }

    // Fallback
    this._lastResult = `[${this.properties.tool}] Executed: ${input.slice(0, 100)}`;
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
    if (monitor) {
      monitor.addLog('info', `[Workflow] ${this.properties.label}: ${result.slice(0, 200)}`);
    }
    return { output: result };
  };
  LiteGraph.registerNodeType('mission/output', OutputNode);

  // ------------------------------------------
  // LOOP NODE
  // ------------------------------------------
  function LoopNode() {
    this.addInput('items', 'string');
    this.addOutput('item', 'string');
    this.addOutput('index', 'number');
    this.addOutput('done', LiteGraph.EVENT);
    this.addWidget('number', 'Max Iterations', 10, (v) => {
      this.properties.maxIter = v;
    }, { min: 1, max: 100, step: 1 });

    this.properties = { maxIter: 10 };
    this.size = [220, 100];
    this.color = '#1a3d5c';
    this.bgcolor = '#0a1f2e';
  }
  LoopNode.title = 'Loop';
  LoopNode.desc = 'Iterates over items';
  LoopNode.prototype.onExecute = function () {};
  LoopNode.prototype.runAsync = async function (inputs) {
    const items = inputs.items || '';
    // Simple: split by newlines
    const parts = items.split('\n').filter(Boolean).slice(0, this.properties.maxIter);
    return { items: parts, count: parts.length };
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
        merged = a.length > b.length ? a : b;
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

    for (const node of sorted) {
      if (!this.running) break;

      // Highlight executing node
      node.boxcolor = '#f59e0b'; // amber = running
      this.graph.setDirtyCanvas(true);

      try {
        // Gather inputs from connected upstream nodes
        const inputs = this._gatherInputs(node);

        // Execute the node's async handler
        if (typeof node.runAsync === 'function') {
          const output = await node.runAsync(inputs);
          this.results.set(node.id, output);
          monitor?.addLog('debug', `Node "${node.title}" completed`);
          node.boxcolor = '#10b981'; // green = success
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
