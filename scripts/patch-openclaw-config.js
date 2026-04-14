#!/usr/bin/env node
// =============================================================================
// OpenClaw Config Patcher
// =============================================================================
// Patches openclaw.json with our gateway, provider, agent, and tool settings.
// Run before OpenClaw starts. Merges into existing config (preserves wizard settings).
// Extracted from inline node -e block to avoid shell double-quote expansion issues.
// =============================================================================

const fs = require('fs');
const configPath = '/home/node/.openclaw/openclaw.json';

let config = {};
try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {
  console.log('[config-patch] No existing config, starting fresh');
}

// =========================================================================
// Gateway settings for reverse proxy
// =========================================================================
config.gateway = config.gateway || {};
config.gateway.port = 18789;
// 'lan' is a named mode (resolves to 0.0.0.0). Raw IPs like '0.0.0.0'
// silently fall back to loopback.
config.gateway.bind = 'lan';

// Auth — password mode via OPENCLAW_GATEWAY_PASSWORD env var
config.gateway.auth = config.gateway.auth || {};
config.gateway.auth.mode = 'password';

// Control UI basePath for reverse proxy at /openclaw/
config.gateway.controlUi = config.gateway.controlUi || {};
config.gateway.controlUi.basePath = '/openclaw/';
// Disable per-device pairing — password auth is sufficient for self-hosted.
config.gateway.controlUi.dangerouslyDisableDeviceAuth = true;
// allowInsecureAuth is required for Docker/reverse-proxy setups (issue #1679).
config.gateway.controlUi.allowInsecureAuth = true;
// v2026.2.24+: non-loopback bind requires explicit allowedOrigins or the
// Host-header fallback flag. Set both.
var domain = process.env.DOMAIN || '';
config.gateway.controlUi.allowedOrigins = domain
  ? ['https://' + domain, 'http://openclaw:18789', 'openclaw:18789']
  : ['http://openclaw:18789', 'openclaw:18789'];
// http://openclaw:18789 and openclaw:18789 cover both formats that
// dangerouslyAllowHostHeaderOriginFallback may construct from the Host header
// when Paperclip's gateway adapter connects internally via Docker bridge.
config.gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback = true;

// Remove any unknown keys that cause config validation errors
delete config.gateway.trustProxy;
delete config.gateway.host; // not a valid key — only 'bind' is recognized
// rateLimit is not a valid gateway.auth key — causes crash loop
if (config.gateway.auth) {
  delete config.gateway.auth.rateLimit;
}

// Trust Caddy reverse proxy — Docker bridge subnets
config.gateway.trustedProxies = ['172.16.0.0/12', '10.0.0.0/8', '192.168.0.0/16'];

// =========================================================================
// LLM provider — custom 'litellm' provider pointing at our LiteLLM proxy
// =========================================================================
config.models = config.models || {};
config.models.mode = 'merge';
config.models.providers = config.models.providers || {};
// Resolve LiteLLM base URL: prefer OPENAI_API_BASE_URL (set from ORACLE_LITELLM_URL in
// docker-compose), then ORACLE_LITELLM_URL directly (in case the compose env chain broke),
// then fall back to the Oracle ARM hardcoded host, and last resort the old Docker service name.
// The 'litellm' Docker service no longer exists on EC2 — it runs on Oracle ARM.
var litellmBaseUrl = process.env.OPENAI_API_BASE_URL
  || (process.env.ORACLE_LITELLM_URL ? process.env.ORACLE_LITELLM_URL + '/v1' : null)
  || 'http://litellm:4000/v1';
console.log('[config-patch] LiteLLM baseUrl:', litellmBaseUrl);

config.models.providers.litellm = {
  baseUrl: litellmBaseUrl,
  apiKey: process.env.OPENAI_API_KEY || '',
  api: 'openai-completions',
  models: [
    // Free — Groq (load-balanced across 4 accounts)
    { id: 'groq-llama-3.3-70b', name: 'Llama 3.3 70B on Groq (free)', contextWindow: 131072, maxTokens: 8192 },
    { id: 'groq-qwen3-32b', name: 'Qwen 3 32B on Groq (free)', contextWindow: 131072, maxTokens: 40960 },
    // Free — Cerebras (1M tokens/day, fastest inference)
    { id: 'groq-gpt-oss-120b', name: 'GPT-OSS 120B on Groq (free)', contextWindow: 131072, maxTokens: 8192 },
    { id: 'groq-gpt-oss-20b', name: 'GPT-OSS 20B on Groq (free, fast)', contextWindow: 131072, maxTokens: 8192 },
    // Free — Cerebras (production: gpt-oss-120b, llama3.1-8b. Preview: qwen3-235b, zai-glm)
    { id: 'cerebras-gpt-oss-120b', name: 'GPT-OSS 120B on Cerebras (free, primary)', contextWindow: 131072, maxTokens: 8192 },
    { id: 'cerebras-llama-3.1-8b', name: 'Llama 3.1 8B on Cerebras (free, fastest)', contextWindow: 131072, maxTokens: 8192 },
    { id: 'cerebras-qwen3-235b', name: 'Qwen 3 235B on Cerebras (free, preview)', contextWindow: 131072, maxTokens: 8192 },
    { id: 'cerebras-zai-glm', name: 'ZAI GLM-4.7 on Cerebras (free, preview)', contextWindow: 128000, maxTokens: 8192 },
    // Free — Gemini
    { id: 'gemini-flash', name: 'Gemini 2.5 Flash (free)', contextWindow: 1048576, maxTokens: 65536 },
    { id: 'gemini-flash-lite', name: 'Gemini 2.5 Flash-Lite (free)', contextWindow: 1048576, maxTokens: 65536 },
    { id: 'gemini-pro', name: 'Gemini 2.5 Pro (free)', contextWindow: 1048576, maxTokens: 65536 },
    // Free — Mistral (load-balanced across 2 keys, 4 RPM total)
    { id: 'mistral-large', name: 'Mistral Large (free)', contextWindow: 131072, maxTokens: 8192 },
    { id: 'codestral', name: 'Codestral (free/code)', contextWindow: 262144, maxTokens: 8192 },
    { id: 'mistral-small', name: 'Mistral Small 3.1 (free, fast)', contextWindow: 131072, maxTokens: 8192 },
    { id: 'mistral-nemo', name: 'Mistral Nemo (free, lightweight)', contextWindow: 131072, maxTokens: 8192 },
    // Cheap — DeepSeek + OpenAI
    { id: 'deepseek-chat', name: 'DeepSeek Chat (cheap)', contextWindow: 128000, maxTokens: 8192 },
    { id: 'deepseek-coder', name: 'DeepSeek Coder (cheap)', contextWindow: 128000, maxTokens: 8192 },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (cheap)', contextWindow: 128000, maxTokens: 16384 },
    // Mid
    { id: 'claude-haiku', name: 'Claude Haiku (mid)', contextWindow: 200000, maxTokens: 4096 },
    { id: 'minimax-m2.5', name: 'MiniMax M2.5 (mid)', contextWindow: 1000000, maxTokens: 16384 },
    // Premium
    { id: 'claude-sonnet', name: 'Claude Sonnet (premium)', contextWindow: 200000, maxTokens: 8192 },
    { id: 'claude-opus', name: 'Claude Opus (premium)', contextWindow: 200000, maxTokens: 4096 },
    { id: 'gpt-4o', name: 'GPT-4o (premium)', contextWindow: 128000, maxTokens: 16384 },
    { id: 'o1', name: 'OpenAI o1 (premium)', contextWindow: 200000, maxTokens: 100000 },
    // Ollama models are NOT listed here — they use the native 'ollama' provider
    // (added below when OLLAMA_BASE_URL is set) which supports tool calling +
    // streaming simultaneously. The LiteLLM OpenAI-compat layer drops tool calls
    // when streaming, so routing Ollama through LiteLLM breaks agent tool use.
  ]
};

// =========================================================================
// Native Ollama provider — direct connection for tool calling + streaming
// =========================================================================
// The LiteLLM OpenAI-compat layer (/v1) silently drops tool calls when
// streaming is enabled (OpenClaw hardcodes stream:true). The native Ollama
// provider uses /api/chat which supports both simultaneously.
var ollamaUrl = process.env.OLLAMA_BASE_URL || '';
if (ollamaUrl) {
  // Strip /v1 suffix if present — native provider needs bare URL
  ollamaUrl = ollamaUrl.replace(/\/v1\/?$/, '');
  config.models.providers.ollama = {
    baseUrl: ollamaUrl,
    apiKey: 'ollama-local',
    api: 'ollama',
    models: [
      { id: 'qwen3.5:9b', name: 'Qwen 3.5 9B (free/local)', contextWindow: 32768, maxTokens: 8192, reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
      { id: 'qwen3:14b', name: 'Qwen3 14B (free/local)', contextWindow: 32768, maxTokens: 8192, reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
      { id: 'qwen3-coder:30b', name: 'Qwen3 Coder 30B (free/local)', contextWindow: 131072, maxTokens: 8192, reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
    ],
  };
  console.log('[config-patch] Native Ollama provider added: ' + ollamaUrl + ' (3 models, tool calling enabled)');
}

// =========================================================================
// Agent defaults
// =========================================================================
config.agents = config.agents || {};
config.agents.defaults = config.agents.defaults || {};
config.agents.defaults.model = { primary: 'litellm/cerebras-gpt-oss-120b' };
// Allowlist litellm + ollama providers (prevents anthropic fallback)
config.agents.defaults.models = ollamaUrl
  ? { litellm: {}, ollama: {} }
  : { litellm: {} };

// =========================================================================
// Tools configuration
// =========================================================================
config.tools = config.tools || {};

// Tool profile: explicitly set 'full' to ensure coding agents have exec,
// read, write, edit tools. v2026.3.2 changed default to 'messaging'.
config.tools.profile = 'full';

// Agent-to-agent messaging: peer-to-peer across both teams
config.tools.agentToAgent = {
  enabled: true,
  allow: ['lead', 'codecraft', 'scout', 'scribe', 'ops-lead', 'builder', 'sentinel', 'chronicler'],
};

// Sub-agent spawning (no extra keys — they cause validation crash loops)
config.tools.subagents = config.tools.subagents || {};

// Session visibility: agents can see each other's sessions for team coordination
config.tools.sessions = config.tools.sessions || {};
config.tools.sessions.visibility = 'all';

// Loop detection: safety net against runaway agent tool loops
config.tools.loopDetection = config.tools.loopDetection || {};
config.tools.loopDetection.enabled = true;

// =========================================================================
// Cron, compaction, memory, auto-update
// =========================================================================
config.cron = config.cron || {};
config.cron.enabled = true;
config.cron.maxConcurrentRuns = 1;

// Compaction: prevent aggressive compaction loop regression (#32106)
config.agents.defaults.compaction = config.agents.defaults.compaction || {};
config.agents.defaults.compaction.mode = 'safeguard';
config.agents.defaults.compaction.memoryFlush = config.agents.defaults.compaction.memoryFlush || {};
config.agents.defaults.compaction.memoryFlush.enabled = true;
config.agents.defaults.compaction.memoryFlush.softThresholdTokens = 50000;
config.agents.defaults.compaction.reserveTokensFloor = 40000;
config.agents.defaults.compaction.identifierPolicy = 'strict';

// Context pruning: cache-ttl mode trims stale tool results from long sessions
config.agents.defaults.contextPruning = config.agents.defaults.contextPruning || {};
config.agents.defaults.contextPruning.mode = 'cache-ttl';
config.agents.defaults.contextPruning.ttl = '2h';
config.agents.defaults.contextPruning.keepLastAssistants = 3;

// =========================================================================
// Session configuration
// =========================================================================
config.session = config.session || {};

// Agent-to-agent ping-pong limit (at session level, NOT tools level)
config.session.agentToAgent = config.session.agentToAgent || {};
config.session.agentToAgent.maxPingPongTurns = 5;

// Session store maintenance: force-overwrite to scrub any agent-added invalid keys
// (agents have previously added compactInterval, autoCompact, orphanCleanup via config RPC)
config.session.maintenance = {
  mode: 'enforce',
  pruneAfter: '14d',
  maxEntries: 200,
  maxDiskBytes: '200mb',
};

// Memory search embeddings: use Gemini text-embedding-004 directly (free, 1500 RPM).
// Native gemini provider avoids LiteLLM proxy hop for every embedding call.
config.agents.defaults.memorySearch = {
  enabled: true,
  provider: 'gemini',
  model: 'text-embedding-004',
  remote: {
    apiKey: process.env.GEMINI_API_KEY || '',
  },
};

// Auto-updater: stable channel
config.update = config.update || {};
config.update.channel = 'stable';
config.update.auto = config.update.auto || {};
config.update.auto.enabled = true;

// =========================================================================
// Telegram (optional)
// =========================================================================
if (process.env.TELEGRAM_BOT_TOKEN) {
  config.channels = config.channels || {};
  config.channels.telegram = {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    groupPolicy: 'open',
  };
  console.log('[config-patch] Telegram bot token configured (groupPolicy: open)');
}

// =========================================================================
// Multi-Agent Hierarchy: 2 teams, 8 agents
// =========================================================================
config.agents.list = config.agents.list || [];

// Only seed agents if none exist yet (preserve user-created agents)
// Models here match MODEL_MAP below (FREE-FIRST strategy):
//   Leads/developers: cerebras-gpt-oss-120b (free, 3000 t/s)
//   Research/security: groq-gpt-oss-120b (free, 500 t/s)
//   Doc writers: gemini-flash-lite (free, high RPD)
if (config.agents.list.length === 0) {
  config.agents.list = [
    // CORE TEAM
    {
      id: 'lead', workspace: 'Lead',
      model: { primary: 'litellm/cerebras-gpt-oss-120b' },
      identity: { name: 'Lead', emoji: '\u{1F9E0}' },
      subagents: { allowAgents: ['codecraft', 'scout', 'scribe', 'ops-lead', 'builder', 'sentinel', 'chronicler'], model: { primary: 'litellm/cerebras-gpt-oss-120b' } },
    },
    {
      id: 'codecraft', workspace: 'CodeCraft',
      model: { primary: 'litellm/cerebras-gpt-oss-120b' },
      identity: { name: 'CodeCraft', emoji: '\u26A1' },
      subagents: { allowAgents: ['lead', 'scout', 'scribe', 'ops-lead', 'builder', 'sentinel', 'chronicler'], model: { primary: 'litellm/cerebras-gpt-oss-120b' } },
    },
    {
      id: 'scout', workspace: 'Scout',
      model: { primary: 'litellm/groq-gpt-oss-120b' },
      identity: { name: 'Scout', emoji: '\u{1F50D}' },
      subagents: { allowAgents: ['lead', 'codecraft', 'scribe', 'ops-lead', 'builder', 'sentinel', 'chronicler'], model: { primary: 'litellm/groq-gpt-oss-120b' } },
    },
    {
      id: 'scribe', workspace: 'Scribe',
      model: { primary: 'litellm/gemini-flash-lite' },
      identity: { name: 'Scribe', emoji: '\u{1F4DD}' },
      subagents: { allowAgents: ['lead', 'codecraft', 'scout', 'ops-lead', 'builder', 'sentinel', 'chronicler'], model: { primary: 'litellm/gemini-flash-lite' } },
    },
    // PLATFORM TEAM
    {
      id: 'ops-lead', workspace: 'Ops Lead',
      model: { primary: 'litellm/cerebras-gpt-oss-120b' },
      identity: { name: 'Ops Lead', emoji: '\u{1F3AF}' },
      subagents: { allowAgents: ['lead', 'codecraft', 'scout', 'scribe', 'builder', 'sentinel', 'chronicler'], model: { primary: 'litellm/cerebras-gpt-oss-120b' } },
    },
    {
      id: 'builder', workspace: 'Builder',
      model: { primary: 'litellm/cerebras-gpt-oss-120b' },
      identity: { name: 'Builder', emoji: '\u{1F528}' },
      subagents: { allowAgents: ['lead', 'codecraft', 'scout', 'scribe', 'ops-lead', 'sentinel', 'chronicler'], model: { primary: 'litellm/cerebras-gpt-oss-120b' } },
    },
    {
      id: 'sentinel', workspace: 'Sentinel',
      model: { primary: 'litellm/groq-gpt-oss-120b' },
      identity: { name: 'Sentinel', emoji: '\u{1F6E1}\uFE0F' },
      subagents: { allowAgents: ['lead', 'codecraft', 'scout', 'scribe', 'ops-lead', 'builder', 'chronicler'], model: { primary: 'litellm/groq-gpt-oss-120b' } },
    },
    {
      id: 'chronicler', workspace: 'Chronicler',
      model: { primary: 'litellm/gemini-flash-lite' },
      identity: { name: 'Chronicler', emoji: '\u{1F4CB}' },
      subagents: { allowAgents: ['lead', 'codecraft', 'scout', 'scribe', 'ops-lead', 'builder', 'sentinel'], model: { primary: 'litellm/gemini-flash-lite' } },
    },
  ];
}

// =========================================================================
// Cleanup: remove keys that crash OpenClaw config validation
// =========================================================================
delete config.compaction;
delete config.contextPruning;
delete config.memorySearch;
delete config.experimental;

// Clean unrecognized tool keys that crash OpenClaw config validation
if (config.tools) {
  delete config.tools.approval;
  delete config.tools.filesystem;
  delete config.tools.exec;
}
if (config.tools && config.tools.subagents) {
  delete config.tools.subagents.maxDepth;
  delete config.tools.subagents.maxConcurrent;
  delete config.tools.subagents.maxChildrenPerAgent;
  delete config.tools.subagents.runTimeoutSeconds;
}
if (config.tools && config.tools.agentToAgent) {
  delete config.tools.agentToAgent.maxPingPongTurns;
}

// Per-agent tool restrictions (Phase 1 optimization)
// gateway tool lets agents modify openclaw.json at runtime — DENY for all agents.
// Agents previously used it to add invalid session.maintenance keys, crashing OpenClaw.
var TOOL_RESTRICTIONS = {
  'lead':       { deny: ['browser', 'gateway'] },           // Orchestrator, doesn't need browser
  'codecraft':  { deny: ['gateway'] },                      // Full access — developer (no config)
  'scout':      { deny: ['exec', 'gateway'] },              // Research only
  'scribe':     { deny: ['exec', 'browser', 'gateway'] },   // Documentation writer
  'ops-lead':   { deny: ['browser', 'gateway'] },           // Platform orchestrator
  'builder':    { deny: ['gateway'] },                      // Full access — infra developer (no config)
  'sentinel':   { deny: ['gateway'] },                      // Full access — security auditing (no config)
  'chronicler': { deny: ['exec', 'browser', 'gateway'] },   // Documentation writer
};

// Clean unrecognized agent keys + force model assignments
// FREE-FIRST strategy: all agents use free providers as primary.
// DeepSeek is ONLY in the LiteLLM fallback chain (triggers on 429/failures).
// Leads/developers: cerebras-gpt-oss-120b (GPT-OSS 120B, production, 3000 t/s)
// Research/security: groq-gpt-oss-120b (GPT-OSS 120B on Groq, production, 500 t/s)
// Doc writers: gemini-flash-lite (free, high RPD)
var MODEL_MAP = {
  'lead': 'litellm/cerebras-gpt-oss-120b',
  'codecraft': 'litellm/cerebras-gpt-oss-120b',
  'scout': 'litellm/groq-gpt-oss-120b',
  'scribe': 'litellm/gemini-flash-lite',
  'ops-lead': 'litellm/cerebras-gpt-oss-120b',
  'builder': 'litellm/cerebras-gpt-oss-120b',
  'sentinel': 'litellm/groq-gpt-oss-120b',
  'chronicler': 'litellm/gemini-flash-lite',
};
// Subagent models match parent — prevents capability mismatches during parallel execution
var SUBAGENT_MODEL_MAP = {
  'lead': 'litellm/cerebras-gpt-oss-120b',
  'codecraft': 'litellm/cerebras-gpt-oss-120b',
  'scout': 'litellm/groq-gpt-oss-120b',
  'scribe': 'litellm/gemini-flash-lite',
  'ops-lead': 'litellm/cerebras-gpt-oss-120b',
  'builder': 'litellm/cerebras-gpt-oss-120b',
  'sentinel': 'litellm/groq-gpt-oss-120b',
  'chronicler': 'litellm/gemini-flash-lite',
};
var SUBAGENT_FALLBACK = 'litellm/cerebras-gpt-oss-120b';
if (Array.isArray(config.agents && config.agents.list)) {
  config.agents.list.forEach(function(agent) {
    if (agent.identity) delete agent.identity.description;
    if (agent.subagents) delete agent.subagents.maxDepth;
    delete agent.instructions;
    if (MODEL_MAP[agent.id] && agent.model) {
      agent.model.primary = MODEL_MAP[agent.id];
    }
    if (agent.model && agent.model.primary === 'litellm/gpt-4o-mini') {
      agent.model.primary = SUBAGENT_FALLBACK;
    }
    if (agent.subagents && agent.subagents.model) {
      agent.subagents.model.primary = SUBAGENT_MODEL_MAP[agent.id] || SUBAGENT_FALLBACK;
    }
    // Apply per-agent tool restrictions
    if (TOOL_RESTRICTIONS[agent.id] && TOOL_RESTRICTIONS[agent.id].deny && TOOL_RESTRICTIONS[agent.id].deny.length > 0) {
      agent.tools = agent.tools || {};
      agent.tools.deny = TOOL_RESTRICTIONS[agent.id].deny;
    }
  });
}

// =========================================================================
// Write config
// =========================================================================
fs.mkdirSync('/home/node/.openclaw', { recursive: true });
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('[config-patch] OpenClaw config written: bind=lan, auth=password, agents=' +
  (config.agents.list ? config.agents.list.length : 0) +
  ', provider=litellm, profile=full');
