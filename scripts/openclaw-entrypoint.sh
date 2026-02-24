#!/bin/sh
# =============================================================================
# OpenClaw Gateway Entrypoint
# =============================================================================
# Ensures the gateway config has the correct basePath and bind settings
# for running behind a Caddy reverse proxy at /openclaw/.
# Merges into existing config (preserves onboarding wizard settings).
# =============================================================================

node -e "
const fs = require('fs');
const path = '/home/node/.openclaw/openclaw.json';

let config = {};
try { config = JSON.parse(fs.readFileSync(path, 'utf8')); } catch {}

// Ensure gateway settings for reverse proxy
config.gateway = config.gateway || {};
config.gateway.port = 18789;
config.gateway.bind = 'lan';

// Auth — password mode via OPENCLAW_GATEWAY_PASSWORD env var
config.gateway.auth = config.gateway.auth || {};
config.gateway.auth.mode = 'password';

// Control UI basePath for reverse proxy at /openclaw/
config.gateway.controlUi = config.gateway.controlUi || {};
config.gateway.controlUi.basePath = '/openclaw/';
// Disable per-device pairing — password auth is sufficient for self-hosted.
// Without this, each new browser requires manual CLI approval even after
// entering the correct password (device pairing is a separate auth layer).
config.gateway.controlUi.dangerouslyDisableDeviceAuth = true;

// Remove any unknown keys that cause config validation errors
delete config.gateway.trustProxy;

// Trust Caddy reverse proxy — Docker bridge subnets
// Without this, OpenClaw ignores X-Forwarded-For headers and rejects
// all WebSocket connections as untrusted ('1008 pairing required').
config.gateway.trustedProxies = ['172.16.0.0/12', '10.0.0.0/8', '192.168.0.0/16'];

// LLM provider — define custom 'litellm' provider pointing at our LiteLLM proxy.
// Uses openai-completions wire format. This prevents subagents from falling back
// to the hardcoded DEFAULT_PROVIDER 'anthropic' (openclaw#3237).
config.models = config.models || {};
config.models.mode = 'merge';
config.models.providers = config.models.providers || {};
config.models.providers.litellm = {
  baseUrl: process.env.OPENAI_API_BASE_URL || 'http://litellm:4000/v1',
  apiKey: process.env.OPENAI_API_KEY || '',
  api: 'openai-completions',
  models: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (cheap)', contextWindow: 128000, maxTokens: 16384 },
    { id: 'deepseek-chat', name: 'DeepSeek Chat (cheap)', contextWindow: 128000, maxTokens: 8192 },
    { id: 'deepseek-coder', name: 'DeepSeek Coder (cheap)', contextWindow: 128000, maxTokens: 8192 },
    { id: 'claude-haiku', name: 'Claude Haiku (mid)', contextWindow: 200000, maxTokens: 4096 },
    { id: 'claude-sonnet', name: 'Claude Sonnet (premium)', contextWindow: 200000, maxTokens: 8192 },
    { id: 'gpt-4o', name: 'GPT-4o (premium)', contextWindow: 128000, maxTokens: 16384 },
    { id: 'groq-llama-3.3-70b', name: 'Llama 3.3 70B on Groq (free)', contextWindow: 131072, maxTokens: 8192 },
    { id: 'minimax-m2.5', name: 'MiniMax M2.5 (mid)', contextWindow: 1000000, maxTokens: 16384 },
    { id: 'qwen2.5-coder:14b', name: 'Qwen 2.5 Coder 14B (free/local)', contextWindow: 32768, maxTokens: 8192 },
    { id: 'llama3.2:8b', name: 'Llama 3.2 8B (free/local)', contextWindow: 8192, maxTokens: 4096 }
  ]
};

// Default model — object format with primary key (flat strings break subagents)
config.agents = config.agents || {};
config.agents.defaults = config.agents.defaults || {};
config.agents.defaults.model = { primary: 'groq-llama-3.3-70b' };
// Allowlist only the litellm provider to prevent anthropic fallback
config.agents.defaults.models = { litellm: {} };

// Enable sub-agent creation and agent-to-agent communication
config.tools = config.tools || {};

// Agent-to-agent messaging: allow all defined agents to talk to each other
// (peer-to-peer, not just parent→child). This enables team collaboration
// where any agent can message any other agent directly via sessions_send.
config.tools.agentToAgent = {
  enabled: true,
  allow: ['lead', 'codecraft', 'scout', 'scribe'],
  maxPingPongTurns: 5,  // allow up to 5 back-and-forth exchanges
};

// Sub-agent spawning: depth 3 allows team leads to delegate to workers
// who can further delegate one more level (lead → team lead → worker).
// Concurrency tuned for t3.small (2GB RAM + 4GB swap):
//   maxConcurrent=4 prevents memory exhaustion from too many parallel agents
//   maxChildrenPerAgent=3 prevents any single orchestrator from fan-out
config.tools.subagents = config.tools.subagents || {};
config.tools.subagents.maxDepth = 3;
config.tools.subagents.maxConcurrent = 4;
config.tools.subagents.maxChildrenPerAgent = 3;
config.tools.subagents.runTimeoutSeconds = 600;  // 10 min per sub-agent task

// =========================================================================
// Multi-Agent Hierarchy: Define core agent roles
// =========================================================================
// Lead agent orchestrates work, delegates to specialized sub-agents.
// All agents route through LiteLLM for model access.
config.agents.list = config.agents.list || [];

// Only seed agents if none exist yet (preserve user-created agents)
if (config.agents.list.length === 0) {
  config.agents.list = [
    {
      id: 'lead',
      workspace: 'Lead',
      model: { primary: 'claude-haiku' },
      identity: {
        name: 'Lead',
        emoji: '🧠',
        description: 'Lead orchestrator — delegates tasks, reviews work, manages the team. Breaks down complex requests into subtasks and assigns to the best-suited agent. Reviews output quality and provides feedback.',
      },
      subagents: {
        allowAgents: ['codecraft', 'scout', 'scribe'],
        maxDepth: 3,
        model: { primary: 'groq-llama-3.3-70b' },  // sub-agents use free tier
      },
    },
    {
      id: 'codecraft',
      workspace: 'CodeCraft',
      model: { primary: 'deepseek-coder' },
      identity: {
        name: 'CodeCraft',
        emoji: '⚡',
        description: 'Full-stack developer — writes, reviews, and debugs code. Specializes in JavaScript, Python, HTML/CSS, and DevOps. Can spawn workers for parallel code tasks.',
      },
      subagents: {
        allowAgents: ['scout', 'scribe'],
        maxDepth: 2,
        model: { primary: 'groq-llama-3.3-70b' },
      },
    },
    {
      id: 'scout',
      workspace: 'Scout',
      model: { primary: 'groq-llama-3.3-70b' },
      identity: {
        name: 'Scout',
        emoji: '🔍',
        description: 'Research specialist — web search, data gathering, competitive analysis. Provides cited sources and structured summaries. Can delegate to workers for parallel research.',
      },
      subagents: {
        allowAgents: ['scribe'],
        maxDepth: 2,
        model: { primary: 'groq-llama-3.3-70b' },
      },
    },
    {
      id: 'scribe',
      workspace: 'Scribe',
      model: { primary: 'gpt-4o-mini' },
      identity: {
        name: 'Scribe',
        emoji: '📝',
        description: 'Documentation and content writer — clear, structured output. Creates guides, README files, blog posts, and technical documentation adapted to the target audience.',
      },
    },
  ];
}

// =========================================================================
// Cleanup: remove keys that crash OpenClaw config validation
// =========================================================================
// These were added as memory optimizations but are not recognized by the
// current OpenClaw version. They cause 'Config invalid' + crash loop.
// Clean them up in case they persist in the JSON from a previous run.
delete config.compaction;
delete config.contextPruning;
delete config.memorySearch;
delete config.experimental;

fs.mkdirSync('/home/node/.openclaw', { recursive: true });
fs.writeFileSync(path, JSON.stringify(config, null, 2));
console.log('[entrypoint] OpenClaw config updated: auth=password, basePath=/openclaw/, bind=lan, model=groq-llama-3.3-70b, depth=3, concurrent=4, a2a=peer');
"

exec node openclaw.mjs gateway --allow-unconfigured
