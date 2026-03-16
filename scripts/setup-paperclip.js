#!/usr/bin/env node
/**
 * setup-paperclip.js — Register OpenClaw agents in Paperclip
 *
 * Phase 2 of Paperclip integration:
 * 1. Waits for Paperclip to be healthy
 * 2. Creates the company (in-fused.org)
 * 3. Registers all 8 agents with openclaw_gateway adapter
 * 4. Sets budget limits
 * 5. Creates initial goals
 *
 * Idempotent: safe to run on every restart. Skips existing resources.
 *
 * Usage: node /opt/scripts/setup-paperclip.js
 * Env:   OPENCLAW_PASSWORD, PAPERCLIP_DB_PASSWORD, BETTER_AUTH_SECRET
 */

const PAPERCLIP_URL = 'http://paperclip:3100';
const OPENCLAW_URL = 'http://openclaw:18789';
const OPENCLAW_PASSWORD = process.env.OPENCLAW_PASSWORD || '';
const MAX_RETRIES = 20;
const RETRY_DELAY_MS = 3000;

const PREFIX = '[paperclip-setup]';

// Agent definitions matching our 2-team hierarchy
const AGENTS = [
  // Core Team
  {
    name: 'Lead',
    role: 'ceo',
    title: 'Core Team Lead',
    team: 'core',
    reportsTo: null,  // CEO — reports to board (owner)
    model: 'cerebras-llama-4-scout',
    budgetMonthlyCents: 0, // free model
    capabilities: ['delegation', 'review', 'planning'],
    openclawAgentId: 'lead',
  },
  {
    name: 'CodeCraft',
    role: 'engineer',
    title: 'Full-Stack Developer',
    team: 'core',
    reportsTo: 'Lead',
    model: 'cerebras-llama-4-scout',
    budgetMonthlyCents: 0,
    capabilities: ['coding', 'debugging', 'code-review', 'shell'],
    openclawAgentId: 'codecraft',
  },
  {
    name: 'Scout',
    role: 'researcher',
    title: 'Research Specialist',
    team: 'core',
    reportsTo: 'Lead',
    model: 'groq-llama-3.3-70b',
    budgetMonthlyCents: 0,
    capabilities: ['web-search', 'analysis', 'data-gathering'],
    openclawAgentId: 'scout',
  },
  {
    name: 'Scribe',
    role: 'writer',
    title: 'Documentation Writer',
    team: 'core',
    reportsTo: 'Lead',
    model: 'gemini-flash-lite',
    budgetMonthlyCents: 0,
    capabilities: ['writing', 'editing', 'documentation'],
    openclawAgentId: 'scribe',
  },
  // Platform Team
  {
    name: 'Ops Lead',
    role: 'cto',
    title: 'Platform Team Lead',
    team: 'platform',
    reportsTo: 'Lead',  // CTO reports to CEO
    model: 'cerebras-llama-4-scout',
    budgetMonthlyCents: 0,
    capabilities: ['delegation', 'review', 'infrastructure', 'planning'],
    openclawAgentId: 'ops-lead',
  },
  {
    name: 'Builder',
    role: 'engineer',
    title: 'Infrastructure Developer',
    team: 'platform',
    reportsTo: 'Ops Lead',
    model: 'cerebras-llama-4-scout',
    budgetMonthlyCents: 0,
    capabilities: ['docker', 'scripting', 'ci-cd', 'shell'],
    openclawAgentId: 'builder',
  },
  {
    name: 'Sentinel',
    role: 'security',
    title: 'Security & Monitoring',
    team: 'platform',
    reportsTo: 'Ops Lead',
    model: 'groq-llama-3.3-70b',
    budgetMonthlyCents: 0,
    capabilities: ['security-audit', 'monitoring', 'log-analysis', 'shell'],
    openclawAgentId: 'sentinel',
  },
  {
    name: 'Chronicler',
    role: 'writer',
    title: 'Platform Documentation',
    team: 'platform',
    reportsTo: 'Ops Lead',
    model: 'gemini-flash-lite',
    budgetMonthlyCents: 0,
    capabilities: ['writing', 'editing', 'documentation'],
    openclawAgentId: 'chronicler',
  },
];

// ------------------------------------------------------------------
// HTTP helpers
// ------------------------------------------------------------------

async function api(method, path, body = null) {
  const url = `${PAPERCLIP_URL}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }

  return { status: res.status, ok: res.ok, json, text };
}

async function waitForHealth() {
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      const res = await fetch(`${PAPERCLIP_URL}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        console.log(`${PREFIX} Paperclip healthy (attempt ${i}/${MAX_RETRIES})`);
        return true;
      }
    } catch {}
    console.log(`${PREFIX} Waiting for Paperclip... (${i}/${MAX_RETRIES})`);
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
  }
  console.error(`${PREFIX} Paperclip not healthy after ${MAX_RETRIES} retries`);
  return false;
}

// ------------------------------------------------------------------
// Setup steps
// ------------------------------------------------------------------

async function findOrCreateCompany() {
  // Check if company already exists
  const list = await api('GET', '/api/companies');
  if (list.ok && list.json?.length > 0) {
    const existing = list.json.find(c => c.name === 'in-fused.org');
    if (existing) {
      console.log(`${PREFIX} Company "in-fused.org" already exists (${existing.id})`);
      return existing.id;
    }
  }

  // Create company
  const res = await api('POST', '/api/companies', {
    name: 'in-fused.org',
    description: 'Self-hosted multi-agent AI hub on EC2. 2 competing teams, 8 agents, all on free-tier models.',
    budgetMonthlyCents: 5000, // $50/month cap (mostly free, DeepSeek fallback)
  });

  if (res.ok && res.json?.id) {
    console.log(`${PREFIX} Created company "in-fused.org" (${res.json.id})`);
    return res.json.id;
  }

  // May need onboarding first
  if (res.status === 401 || res.status === 403) {
    console.log(`${PREFIX} Paperclip needs initial onboarding. Visit https://in-fused.org/paperclip/ to complete setup.`);
    console.log(`${PREFIX} After onboarding, re-run this script or restart the stack.`);
    return null;
  }

  console.error(`${PREFIX} Failed to create company: ${res.status} ${res.text}`);
  return null;
}

async function registerAgents(companyId) {
  // Get existing agents
  const existing = await api('GET', `/api/companies/${companyId}/agents`);
  const existingNames = new Set();
  const nameToId = {};
  if (existing.ok && existing.json) {
    for (const a of existing.json) {
      existingNames.add(a.name);
      nameToId[a.name] = a.id;
    }
  }

  // Register agents in order (CEO first, then reports)
  // First pass: create all agents without reportsTo
  for (const agent of AGENTS) {
    if (existingNames.has(agent.name)) {
      console.log(`${PREFIX} Agent "${agent.name}" already registered`);
      continue;
    }

    const payload = {
      name: agent.name,
      role: agent.role,
      title: agent.title,
      capabilities: agent.capabilities,
      budgetMonthlyCents: agent.budgetMonthlyCents,
      adapterType: 'openclaw_gateway',
      adapterConfig: {
        url: `ws://openclaw:18789`,
        agentId: agent.openclawAgentId,
        authToken: OPENCLAW_PASSWORD,
        disableDeviceAuth: true,
        autoPairOnFirstConnect: true,
        clientMode: 'backend',
        clientVersion: 'paperclip',
        scopes: ['operator.admin', 'operator.read', 'operator.write', 'operator.pairing'],
        sessionKeyStrategy: 'issue',
        timeoutSec: 120,
        waitTimeoutMs: 30000,
      },
    };

    // Set reportsTo if the manager was already created
    if (agent.reportsTo && nameToId[agent.reportsTo]) {
      payload.reportsTo = nameToId[agent.reportsTo];
    }

    const res = await api('POST', `/api/companies/${companyId}/agents`, payload);
    if (res.ok && res.json?.id) {
      nameToId[agent.name] = res.json.id;
      console.log(`${PREFIX} Registered "${agent.name}" (${res.json.id})`);
    } else {
      console.error(`${PREFIX} Failed to register "${agent.name}": ${res.status} ${res.text}`);
    }
  }

  // Second pass: set reportsTo for agents whose managers weren't created yet
  for (const agent of AGENTS) {
    if (!agent.reportsTo || !nameToId[agent.name] || !nameToId[agent.reportsTo]) continue;

    // Check if reportsTo was set during creation
    const agentRes = await api('GET', `/api/agents/${nameToId[agent.name]}`);
    if (agentRes.ok && agentRes.json?.reportsTo) continue;

    await api('PATCH', `/api/agents/${nameToId[agent.name]}`, {
      reportsTo: nameToId[agent.reportsTo],
    });
    console.log(`${PREFIX} Set "${agent.name}" reports to "${agent.reportsTo}"`);
  }

  // Apply SQL workaround for openclaw_gateway token bug (#44493)
  // The x-openclaw-token header may not be auto-populated during agent creation
  console.log(`${PREFIX} Agent registration complete. If heartbeats fail, apply the SQL workaround:`);
  console.log(`${PREFIX}   UPDATE agents SET adapter_config = adapter_config || '{"authToken":"${OPENCLAW_PASSWORD}"}'::jsonb WHERE adapter_type = 'openclaw_gateway';`);

  return nameToId;
}

async function createInitialGoals(companyId) {
  // Check if goals/issues already exist
  const existing = await api('GET', `/api/companies/${companyId}/issues`);
  if (existing.ok && existing.json?.length > 0) {
    console.log(`${PREFIX} Goals already exist (${existing.json.length} issues), skipping`);
    return;
  }

  const goals = [
    {
      title: 'Maintain reliable autonomous agent operation',
      description: 'All 8 agents should be running autonomously on free-tier models. Agents should wake on heartbeats, complete assigned tasks, and stage results for owner review.',
      priority: 'high',
      status: 'todo',
    },
    {
      title: 'Keep infrastructure costs under $25/month',
      description: 'EC2 t3.small (~$25/month). All agents on free models (Cerebras, Groq, Gemini). DeepSeek ($0.28/1M) as last-resort fallback only.',
      priority: 'high',
      status: 'todo',
    },
    {
      title: 'Produce staged deliverables for owner review',
      description: 'Agents should write deliverables to /workspace/staging/ with index.json updates. Owner reviews on iPhone via Mission Control.',
      priority: 'medium',
      status: 'todo',
    },
  ];

  for (const goal of goals) {
    const res = await api('POST', `/api/companies/${companyId}/issues`, goal);
    if (res.ok) {
      console.log(`${PREFIX} Created goal: "${goal.title}"`);
    } else {
      console.error(`${PREFIX} Failed to create goal: ${res.status} ${res.text}`);
    }
  }
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

async function main() {
  console.log(`${PREFIX} Starting Paperclip setup...`);

  const healthy = await waitForHealth();
  if (!healthy) {
    console.error(`${PREFIX} Aborting — Paperclip not reachable`);
    process.exit(0); // non-fatal — don't block OpenClaw startup
  }

  const companyId = await findOrCreateCompany();
  if (!companyId) {
    console.log(`${PREFIX} Skipping agent registration (no company ID)`);
    process.exit(0);
  }

  await registerAgents(companyId);
  await createInitialGoals(companyId);

  console.log(`${PREFIX} Setup complete. Visit https://in-fused.org/paperclip/ to manage agents.`);
}

main().catch(err => {
  console.error(`${PREFIX} Error:`, err.message);
  process.exit(0); // non-fatal
});
