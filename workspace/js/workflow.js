// ============================================================================
// Mission Control — workflow.js
// LiteGraph.js custom node types and canvas initialization
// in-fused.org
// ============================================================================

// Global references
window.workflowGraph = null;
window.workflowCanvas = null;

// Wait for LiteGraph to be available
function initWorkflowCanvas() {
  if (typeof LiteGraph === 'undefined') {
    console.warn('LiteGraph not loaded yet');
    return;
  }

  const container = document.getElementById('workflow-canvas');
  if (!container) return;

  // Only init once
  if (window.workflowCanvas && window.workflowCanvas._mounted) return;

  // Register custom node types (only once)
  if (!LiteGraph.registered_node_types['mission/agent']) {
    registerCustomNodes();
  }

  // Create graph and canvas
  const graph = new LiteGraph.LGraph();
  const canvas = new LiteGraph.LGraphCanvas(container, graph);

  // Canvas styling for dark theme
  canvas.background_image = null;
  canvas.clear_background_color = '#0a0e17';
  canvas.default_link_color = '#06b6d4';
  canvas.highquality_render = true;
  canvas.render_shadows = false;
  canvas.render_curved_connections = true;
  canvas.connections_width = 2;

  // Node defaults
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

  // Save references
  window.workflowGraph = graph;
  window.workflowCanvas = canvas;
  canvas._mounted = true;

  // Start rendering
  graph.start();

  // Add some default nodes if graph is empty
  if (graph._nodes.length === 0) {
    addDefaultWorkflow(graph);
  }

  // Handle resize
  function resizeCanvas() {
    const rect = container.parentElement.getBoundingClientRect();
    container.width = rect.width;
    container.height = rect.height;
    canvas.resize();
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

// Make it globally available
window.initWorkflowCanvas = initWorkflowCanvas;

// ============================================================================
// CUSTOM NODE TYPES
// ============================================================================

function registerCustomNodes() {

  // ------------------------------------------
  // INPUT / TRIGGER NODE
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
  TriggerNode.desc = 'Workflow start point — defines the input prompt or trigger condition';
  TriggerNode.prototype.onExecute = function () {
    this.setOutputData(0, this.properties.prompt);
    if (this.properties.trigger === 'Manual') {
      this.triggerSlot(1);
    }
  };
  LiteGraph.registerNodeType('mission/trigger', TriggerNode);

  // ------------------------------------------
  // AGENT NODE
  // ------------------------------------------
  function AgentNode() {
    this.addInput('prompt', 'string');
    this.addInput('context', 'string');
    this.addOutput('response', 'string');
    this.addOutput('done', LiteGraph.EVENT);

    const modelNames = (window.MODELS || []).map(m => m.name);
    this.addWidget('combo', 'Model', 'Llama 3.3 70B', (v) => {
      this.properties.model = v;
    }, { values: modelNames.length ? modelNames : ['Llama 3.3 70B', 'Claude Haiku', 'GPT-4o Mini'] });

    this.addWidget('text', 'System Prompt', 'You are a helpful assistant.', (v) => {
      this.properties.systemPrompt = v;
    });
    this.addWidget('number', 'Max Tokens', 2048, (v) => {
      this.properties.maxTokens = v;
    }, { min: 128, max: 32768, step: 128 });

    this.properties = { model: 'Llama 3.3 70B', systemPrompt: 'You are a helpful assistant.', maxTokens: 2048 };
    this.size = [300, 180];
    this.color = '#1e3a5f';
    this.bgcolor = '#0c1929';
  }
  AgentNode.title = 'Agent';
  AgentNode.desc = 'Sends prompt to an LLM agent and returns the response';
  AgentNode.prototype.onExecute = function () {
    const prompt = this.getInputData(0);
    const context = this.getInputData(1) || '';
    if (prompt) {
      // In a real implementation, this would call the LiteLLM API
      this.setOutputData(0, `[${this.properties.model}] Response to: ${prompt}`);
      this.triggerSlot(1);
    }
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
      this.setOutputData(0, `Task [${this.properties.priority}]: ${this.properties.goal} | Input: ${input}`);
    }
  };
  TaskNode.prototype.onAction = function () {
    this.triggerSlot(1);
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
      this.setOutputData(0, `[${this.properties.tool}] Result for: ${input}`);
    }
  };
  ToolNode.prototype.onAction = function () {
    this.triggerSlot(1);
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
  ConditionNode.desc = 'Routes data based on a condition (if/else branching)';
  ConditionNode.prototype.onExecute = function () {
    const input = this.getInputData(0) || '';
    let result = false;
    const cond = this.properties.condition;

    switch (this.properties.type) {
      case 'Contains': result = input.includes(cond); break;
      case 'Equals': result = input === cond; break;
      case 'Regex': try { result = new RegExp(cond).test(input); } catch (e) { result = false; } break;
      case 'Length >': result = input.length > parseInt(cond) || 0; break;
      case 'Is Empty': result = !input || input.trim() === ''; break;
    }

    this.setOutputData(result ? 0 : 1, input);
  };
  LiteGraph.registerNodeType('mission/condition', ConditionNode);

  // ------------------------------------------
  // OUTPUT NODE
  // ------------------------------------------
  function OutputNode() {
    this.addInput('result', 'string');
    this.addInput('done', LiteGraph.ACTION);
    this.addWidget('combo', 'Destination', 'Console', (v) => {
      this.properties.destination = v;
    }, { values: ['Console', 'Chat Response', 'File', 'Webhook', 'Next Workflow'] });
    this.addWidget('text', 'Label', 'Output', (v) => {
      this.properties.label = v;
    });

    this.properties = { destination: 'Console', label: 'Output' };
    this.size = [240, 100];
    this.color = '#1a4d3a';
    this.bgcolor = '#0a2e1f';
  }
  OutputNode.title = 'Output';
  OutputNode.desc = 'Sends results to a destination (console, chat, file, webhook)';
  OutputNode.prototype.onExecute = function () {
    const input = this.getInputData(0);
    if (input) {
      console.log(`[Output: ${this.properties.label}]`, input);
    }
  };
  OutputNode.prototype.onAction = function () {
    const store = window.Alpine && Alpine.store('monitor');
    if (store) {
      store.addLog('info', `Workflow output [${this.properties.label}]: completed`);
    }
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
  LoopNode.desc = 'Iterates over items or repeats a fixed number of times';
  LoopNode.prototype.onExecute = function () {
    const items = this.getInputData(0);
    if (items) {
      this.setOutputData(0, items);
      this.setOutputData(1, 0);
    }
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
  MergeNode.desc = 'Combines multiple inputs into a single output';
  MergeNode.prototype.onExecute = function () {
    const a = this.getInputData(0) || '';
    const b = this.getInputData(1) || '';
    this.setOutputData(0, a + '\n---\n' + b);
  };
  LiteGraph.registerNodeType('mission/merge', MergeNode);
}

// ============================================================================
// DEFAULT WORKFLOW TEMPLATE
// ============================================================================

function addDefaultWorkflow(graph) {
  // Create a simple example workflow
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
  output.properties.destination = 'Chat Response';
  graph.add(output);

  const tool = LiteGraph.createNode('mission/tool');
  tool.pos = [1100, 300];
  tool.properties.tool = 'Web Search';
  graph.add(tool);

  // Connect: trigger → agent → condition → output/tool
  trigger.connect(0, agent, 0);
  agent.connect(0, condition, 0);
  condition.connect(0, output, 0);
  condition.connect(1, tool, 0);
}

// ============================================================================
// PALETTE DRAG-AND-DROP
// ============================================================================

window.addNodeToCanvas = function (nodeType) {
  if (!window.workflowGraph) {
    // Try to initialize if not done yet
    initWorkflowCanvas();
  }
  if (!window.workflowGraph) return;

  const node = LiteGraph.createNode('mission/' + nodeType);
  if (node) {
    // Place in center of visible area
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
