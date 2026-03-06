#!/usr/bin/env node
// ============================================================================
// Workflow Builder — CLI helper for OpenClaw agents
//
// Generates valid LiteGraph JSON from a simple declarative description.
// Agents call this via: exec node /workspace/js/workflow-builder.js '<json>'
//
// Input format (JSON string as first CLI arg):
// {
//   "id": "wf-my-workflow",
//   "name": "My Workflow",
//   "nodes": [
//     { "type": "trigger", "prompt": "Do something" },
//     { "type": "agent", "agent": "lead" },
//     { "type": "condition", "condition": "error", "conditionType": "Contains" },
//     { "type": "output", "label": "Result", "destination": "Log" },
//     { "type": "tool", "tool": "Web Search", "agent": "scout" },
//     { "type": "task", "goal": "Summarize", "priority": "High" },
//     { "type": "loop" },
//     { "type": "merge" }
//   ],
//   "connections": [
//     [0, 1],          // node0.output[0] -> node1.input[0]
//     [1, 2],
//     [2, 3, 0, 0],   // node2.output[0] -> node3.input[0] (explicit slots)
//     [2, 4, 1, 0]    // node2.output[1] -> node4.input[0] (false branch)
//   ]
// }
//
// Output: writes LiteGraph JSON + index.json to /workspace/agent-workflows/
// Also prints the workflow ID to stdout.
// ============================================================================

const fs = require('fs');
const path = require('path');

const WORKFLOW_DIR = '/workspace/agent-workflows';
const INDEX_PATH = path.join(WORKFLOW_DIR, 'index.json');

// Node type definitions: LiteGraph type string, default size, default properties
const NODE_TYPES = {
  trigger: {
    lgType: 'mission/trigger',
    size: [280, 120],
    defaults: { prompt: '', trigger: 'Manual' },
    outputs: [{ name: 'prompt', type: 'string' }, { name: 'trigger', type: -1 }],
    inputs: [],
  },
  agent: {
    lgType: 'mission/agent',
    size: [280, 160],
    defaults: { agent: '(Auto)', context: '' },
    outputs: [{ name: 'response', type: 'string' }, { name: 'done', type: -1 }],
    inputs: [{ name: 'prompt', type: 'string' }, { name: 'context', type: 'string' }],
  },
  task: {
    lgType: 'mission/task',
    size: [280, 160],
    defaults: { goal: '', constraints: '', priority: 'Normal' },
    outputs: [{ name: 'result', type: 'string' }, { name: 'done', type: -1 }],
    inputs: [{ name: 'input', type: 'string' }, { name: 'execute', type: -1 }],
  },
  tool: {
    lgType: 'mission/tool',
    size: [280, 140],
    defaults: { tool: 'Web Search', config: '{}', agentId: 'lead' },
    outputs: [{ name: 'result', type: 'string' }, { name: 'done', type: -1 }],
    inputs: [{ name: 'input', type: 'string' }, { name: 'execute', type: -1 }],
  },
  condition: {
    lgType: 'mission/condition',
    size: [280, 150],
    defaults: { condition: '', type: 'Contains' },
    outputs: [{ name: 'true', type: 'string' }, { name: 'false', type: 'string' }],
    inputs: [{ name: 'input', type: 'string' }],
  },
  output: {
    lgType: 'mission/output',
    size: [280, 120],
    defaults: { label: 'Output', destination: 'Log' },
    outputs: [],
    inputs: [{ name: 'result', type: 'string' }, { name: 'done', type: -1 }],
  },
  loop: {
    lgType: 'mission/loop',
    size: [280, 120],
    defaults: { splitBy: 'newline' },
    outputs: [{ name: 'item', type: 'string' }, { name: 'index', type: 'number' }, { name: 'done', type: -1 }],
    inputs: [{ name: 'items', type: 'string' }],
  },
  merge: {
    lgType: 'mission/merge',
    size: [280, 120],
    defaults: { mode: 'Concatenate' },
    outputs: [{ name: 'merged', type: 'string' }],
    inputs: [{ name: 'input_1', type: 'string' }, { name: 'input_2', type: 'string' }],
  },
};

function buildGraph(spec) {
  const nodes = [];
  const links = [];
  let linkId = 1;
  let lastNodeId = 0;

  // Auto-layout: arrange nodes left-to-right with spacing
  const X_START = 100;
  const X_STEP = 350;
  const Y_BASE = 200;

  for (let i = 0; i < spec.nodes.length; i++) {
    const n = spec.nodes[i];
    const def = NODE_TYPES[n.type];
    if (!def) {
      console.error(`Unknown node type: ${n.type}. Valid: ${Object.keys(NODE_TYPES).join(', ')}`);
      process.exit(1);
    }

    lastNodeId = i + 1;
    const properties = { ...def.defaults };

    // Map user-friendly properties to LiteGraph properties
    if (n.prompt !== undefined) properties.prompt = n.prompt;
    if (n.agent !== undefined) {
      if (n.type === 'agent') properties.agent = n.agent;
      if (n.type === 'tool') properties.agentId = n.agent;
    }
    if (n.trigger !== undefined) properties.trigger = n.trigger;
    if (n.tool !== undefined) properties.tool = n.tool;
    if (n.config !== undefined) properties.config = typeof n.config === 'string' ? n.config : JSON.stringify(n.config);
    if (n.goal !== undefined) properties.goal = n.goal;
    if (n.constraints !== undefined) properties.constraints = n.constraints;
    if (n.priority !== undefined) properties.priority = n.priority;
    if (n.condition !== undefined) properties.condition = n.condition;
    if (n.conditionType !== undefined) properties.type = n.conditionType;
    if (n.label !== undefined) properties.label = n.label;
    if (n.destination !== undefined) properties.destination = n.destination;
    if (n.mode !== undefined) properties.mode = n.mode;
    if (n.context !== undefined) properties.context = n.context;
    if (n.splitBy !== undefined) properties.splitBy = n.splitBy;

    // Position: user can override with x/y, otherwise auto-layout
    const x = n.x !== undefined ? n.x : X_START + i * X_STEP;
    const y = n.y !== undefined ? n.y : Y_BASE;

    const lgNode = {
      id: lastNodeId,
      type: def.lgType,
      pos: [x, y],
      size: [...def.size],
      properties,
      flags: {},
      inputs: def.inputs.map(inp => ({ name: inp.name, type: inp.type, link: null })),
      outputs: def.outputs.map(out => ({ name: out.name, type: out.type, links: null })),
    };

    nodes.push(lgNode);
  }

  // Process connections: [fromIdx, toIdx, fromSlot?, toSlot?]
  for (const conn of (spec.connections || [])) {
    const [fromIdx, toIdx, fromSlot = 0, toSlot = 0] = conn;
    const fromNode = nodes[fromIdx];
    const toNode = nodes[toIdx];
    if (!fromNode || !toNode) {
      console.error(`Invalid connection: node ${fromIdx} -> ${toIdx}`);
      continue;
    }

    const fromOutput = fromNode.outputs[fromSlot];
    const toInput = toNode.inputs[toSlot];
    if (!fromOutput || !toInput) {
      console.error(`Invalid slot: node${fromIdx}.out[${fromSlot}] -> node${toIdx}.in[${toSlot}]`);
      continue;
    }

    const lid = linkId++;
    // Link format: [linkId, originId, originSlot, targetId, targetSlot, type]
    links.push([lid, fromNode.id, fromSlot, toNode.id, toSlot, fromOutput.type]);

    // Update node references
    if (!fromOutput.links) fromOutput.links = [];
    fromOutput.links.push(lid);
    toInput.link = lid;
  }

  return {
    last_node_id: lastNodeId,
    last_link_id: linkId - 1,
    nodes,
    links,
    groups: [],
    config: {},
    extra: {},
    version: 0.4,
  };
}

function updateIndex(id, name, nodeCount, createdBy) {
  let index = { workflows: [] };
  try {
    index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
  } catch {}

  const entry = {
    id,
    name,
    file: id + '.json',
    createdBy: createdBy || 'agent',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'draft',
  };

  // Update existing or add new
  const idx = index.workflows.findIndex(w => w.id === id);
  if (idx >= 0) {
    index.workflows[idx] = { ...index.workflows[idx], ...entry };
  } else {
    index.workflows.push(entry);
  }

  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
}

// Main
try {
  const input = process.argv[2];
  if (!input) {
    console.log('Usage: node workflow-builder.js \'{"id":"...","name":"...","nodes":[...],"connections":[...]}\'');
    console.log('');
    console.log('Node types: ' + Object.keys(NODE_TYPES).join(', '));
    console.log('');
    console.log('Example:');
    console.log(JSON.stringify({
      id: 'wf-example',
      name: 'Research & Report',
      createdBy: 'lead',
      nodes: [
        { type: 'trigger', prompt: 'Research AI news' },
        { type: 'agent', agent: 'scout' },
        { type: 'output', label: 'Research Results' },
      ],
      connections: [[0, 1], [1, 2]],
    }, null, 2));
    process.exit(0);
  }

  const spec = JSON.parse(input);
  if (!spec.id) spec.id = 'wf-' + Date.now().toString(36);
  if (!spec.name) spec.name = 'Agent Workflow';

  const graph = buildGraph(spec);

  // Ensure directory exists
  fs.mkdirSync(WORKFLOW_DIR, { recursive: true });

  // Write graph file
  const graphPath = path.join(WORKFLOW_DIR, spec.id + '.json');
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2));

  // Update index
  updateIndex(spec.id, spec.name, spec.nodes.length, spec.createdBy);

  console.log(spec.id);
} catch (e) {
  console.error('Error: ' + e.message);
  process.exit(1);
}
