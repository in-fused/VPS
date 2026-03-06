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
// Bind to all interfaces so Caddy can reach us on the Docker bridge network.
// Set both 'bind' and 'host' — different OpenClaw versions use different keys.
config.gateway.bind = '0.0.0.0';
config.gateway.host = '0.0.0.0';

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
// allowInsecureAuth is required for Docker/reverse-proxy setups (issue #1679).
// Without it, connections from trustedProxies are still treated as external
// and device identity is enforced despite dangerouslyDisableDeviceAuth=true.
config.gateway.controlUi.allowInsecureAuth = true;
// v2026.2.24+: non-loopback bind requires explicit allowedOrigins or the
// Host-header fallback flag. Set both — explicit origin for production,
// fallback for dev/IP access.
var domain = process.env.DOMAIN || '';
config.gateway.controlUi.allowedOrigins = domain
  ? ['https://' + domain]
  : [];
config.gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback = true;

// Remove any unknown keys that cause config validation errors
delete config.gateway.trustProxy;

// Trust Caddy reverse proxy — Docker bridge subnets
// Without this, OpenClaw ignores X-Forwarded-For headers and rejects
// all WebSocket connections as untrusted ('1008 pairing required').
config.gateway.trustedProxies = ['172.16.0.0/12', '10.0.0.0/8', '192.168.0.0/16'];

// LLM provider — define custom 'litellm' provider pointing at our LiteLLM proxy.
// Uses openai wire format (chat/completions). This prevents subagents from falling back
// to the hardcoded DEFAULT_PROVIDER 'anthropic' (openclaw#3237).
config.models = config.models || {};
config.models.mode = 'merge';
config.models.providers = config.models.providers || {};
config.models.providers.litellm = {
  baseUrl: process.env.OPENAI_API_BASE_URL || 'http://litellm:4000/v1',
  apiKey: process.env.OPENAI_API_KEY || '',
  api: 'openai-completions',
  models: [
    // Free — Groq (load-balanced across 2 accounts)
    { id: 'groq-llama-3.3-70b', name: 'Llama 3.3 70B on Groq (free)', contextWindow: 131072, maxTokens: 8192 },
    { id: 'groq-qwen3-32b', name: 'Qwen 3 32B on Groq (free)', contextWindow: 131072, maxTokens: 40960 },
    // Free — Cerebras (1M tokens/day, fastest inference)
    { id: 'cerebras-llama-3.3-70b', name: 'Llama 3.3 70B on Cerebras (free)', contextWindow: 131072, maxTokens: 8192 },
    { id: 'cerebras-llama-4-scout', name: 'Llama 4 Scout on Cerebras (free)', contextWindow: 131072, maxTokens: 8192 },
    { id: 'cerebras-llama-3.1-8b', name: 'Llama 3.1 8B on Cerebras (free, fastest)', contextWindow: 8192, maxTokens: 8192 },
    { id: 'cerebras-qwen3-235b', name: 'Qwen 3 235B on Cerebras (free)', contextWindow: 131072, maxTokens: 8192 },
    { id: 'cerebras-zai-glm', name: 'ZAI GLM-4.7 on Cerebras (free, reasoning)', contextWindow: 128000, maxTokens: 8192 },
    { id: 'cerebras-gpt-oss-120b', name: 'GPT-OSS 120B on Cerebras (free, reasoning)', contextWindow: 8192, maxTokens: 8192 },
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
    // Local Ollama
    { id: 'qwen2.5-coder:14b', name: 'Qwen 2.5 Coder 14B (free/local)', contextWindow: 32768, maxTokens: 8192 },
    { id: 'llama3.2:8b', name: 'Llama 3.2 8B (free/local)', contextWindow: 8192, maxTokens: 4096 },
    { id: 'deepseek-coder-v2:16b', name: 'DeepSeek Coder V2 16B (free/local)', contextWindow: 128000, maxTokens: 8192 }
  ]
};

// Default model — object format with primary key (flat strings break subagents)
// Cerebras Llama 3.1 8B: FREE, fastest inference (2267 t/s), ideal for subagent bursts.
// Cerebras has 1M TPD across all models. DeepSeek ($0.28/1M) is the paid last resort on 429.
config.agents = config.agents || {};
config.agents.defaults = config.agents.defaults || {};
config.agents.defaults.model = { primary: 'litellm/cerebras-llama-4-scout' };
// Allowlist only the litellm provider to prevent anthropic fallback
config.agents.defaults.models = { litellm: {} };

// Enable sub-agent creation and agent-to-agent communication
config.tools = config.tools || {};

// Tool profile: explicitly set 'full' to ensure coding agents have exec,
// read, write, edit tools. v2026.3.2 changed default to 'messaging' which
// excludes these. 'full' includes all built-in tools.
config.tools.profile = 'full';

// Agent-to-agent messaging: allow all defined agents to talk to each other
// (peer-to-peer, not just parent→child). This enables team collaboration
// where any agent can message any other agent directly via sessions_send.
// NOTE: Only 'enabled' and 'allow' are recognized; maxPingPongTurns is not.
config.tools.agentToAgent = {
  enabled: true,
  allow: ['lead', 'codecraft', 'scout', 'scribe', 'ops-lead', 'builder', 'sentinel', 'chronicler'],
};

// Sub-agent spawning: enable subagents (no extra keys — maxDepth,
// maxConcurrent, maxChildrenPerAgent, runTimeoutSeconds are all
// unrecognized by OpenClaw and cause config validation crash loops).
config.tools.subagents = config.tools.subagents || {};

// Session visibility: allow agents to see each other's sessions for
// team coordination via sessions_list and sessions_history tools.
config.tools.sessions = config.tools.sessions || {};
config.tools.sessions.visibility = 'all';

// Cron service: enables server-side scheduled jobs so agents can create
// background tasks that run 24/7 even when the browser is closed.
// maxConcurrentRuns=1 to stay within t3.small memory budget.
config.cron = config.cron || {};
config.cron.enabled = true;
config.cron.maxConcurrentRuns = 1;

// Compaction: prevent aggressive compaction loop regression (#32106).
// v2026.3.1 defaults softThresholdTokens to 4000 which triggers compaction
// every 2-3 minutes. Set to 50000 to prevent this. PR #32803 is the
// definitive fix but is still under review.
config.agents.defaults.compaction = config.agents.defaults.compaction || {};
config.agents.defaults.compaction.mode = 'safeguard';
config.agents.defaults.compaction.memoryFlush = config.agents.defaults.compaction.memoryFlush || {};
config.agents.defaults.compaction.memoryFlush.enabled = true;
config.agents.defaults.compaction.memoryFlush.softThresholdTokens = 50000;
// Preserve ticket/issue IDs during summarization
config.agents.defaults.compaction.identifierPolicy = 'strict';

// Memory search embeddings: route through LiteLLM proxy to use free Gemini
// text-embedding-004 (load-balanced across 3 keys, 1500 RPM each).
// Without this, OpenClaw tries api.openai.com with OPENAI_API_KEY which is
// actually the LiteLLM master key — causing 401 "Incorrect API key" errors
// and breaking memory_search for all agents.
config.agents.defaults.memorySearch = config.agents.defaults.memorySearch || {};
config.agents.defaults.memorySearch.provider = 'openai';
config.agents.defaults.memorySearch.model = 'gemini-embedding';
config.agents.defaults.memorySearch.remote = {
  baseUrl: 'http://litellm:4000/v1/',
  apiKey: process.env.OPENAI_API_KEY || '',
};

// Loop detection: safety net against runaway agent tool loops
config.tools.loopDetection = config.tools.loopDetection || {};
config.tools.loopDetection.enabled = true;

// Auto-updater: keep OpenClaw on stable channel with automatic updates.
// In-app mechanism (separate from Docker image tags). Stable channel avoids
// bleeding-edge regressions like #30092 (dangerouslyDisableDeviceAuth issue).
config.update = config.update || {};
config.update.channel = 'stable';
config.update.auto = config.update.auto || {};
config.update.auto.enabled = true;

// Telegram bot integration (only if token provided via env).
// Guarded: if the config key format is wrong, OpenClaw will reject it at
// startup, but the entrypoint cleanup below will catch it on next restart.
if (process.env.TELEGRAM_BOT_TOKEN) {
  config.channels = config.channels || {};
  config.channels.telegram = {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
  };
  console.log('[entrypoint] Telegram bot token configured');
}

// =========================================================================
// Multi-Agent Hierarchy: Define core agent roles
// =========================================================================
// Lead agent orchestrates work, delegates to specialized sub-agents.
// All agents route through LiteLLM for model access.
config.agents.list = config.agents.list || [];

// Only seed agents if none exist yet (preserve user-created agents)
// NOTE: OpenClaw does NOT recognize identity.description or subagents.maxDepth.
// Only valid identity keys: name, emoji. Only valid subagents keys: allowAgents, model.
if (config.agents.list.length === 0) {
  config.agents.list = [
    // CORE TEAM — Reliability-first strategy (2026-03-06 rebalance).
    // cerebras-zai-glm rate-limits on first request — demoted to fallback only.
    // Cerebras Llama 3.3 70B: proven reliable, strong reasoning+coding (128K context).
    // cerebras-gpt-oss-120b/llama-3.1-8b have 8192 context — below OpenClaw 16K min.
    // Cerebras: Lead(70b), CodeCraft(70b), Ops Lead(70b), Sentinel(scout), Subagents(scout)
    // Gemini: Scout(pro), Builder(flash), Scribe(flash-lite), Chronicler(flash-lite)
    {
      id: 'lead',
      workspace: 'Lead',
      model: { primary: 'litellm/cerebras-llama-3.3-70b' },
      identity: {
        name: 'Lead',
        emoji: '🧠',
      },
      subagents: {
        allowAgents: ['codecraft', 'scout', 'scribe'],
        model: { primary: 'litellm/cerebras-llama-4-scout' },
      },
    },
    {
      id: 'codecraft',
      workspace: 'CodeCraft',
      model: { primary: 'litellm/cerebras-llama-3.3-70b' },
      identity: {
        name: 'CodeCraft',
        emoji: '⚡',
      },
      subagents: {
        allowAgents: ['scout', 'scribe'],
        model: { primary: 'litellm/cerebras-llama-4-scout' },
      },
    },
    {
      id: 'scout',
      workspace: 'Scout',
      model: { primary: 'litellm/gemini-pro' },
      identity: {
        name: 'Scout',
        emoji: '🔍',
      },
      subagents: {
        allowAgents: ['scribe'],
        model: { primary: 'litellm/cerebras-llama-4-scout' },
      },
    },
    {
      id: 'scribe',
      workspace: 'Scribe',
      model: { primary: 'litellm/gemini-flash-lite' },
      identity: {
        name: 'Scribe',
        emoji: '📝',
      },
    },
    // PLATFORM TEAM — Cerebras for orchestration+security, Gemini for infra+docs.
    {
      id: 'ops-lead',
      workspace: 'Ops Lead',
      model: { primary: 'litellm/cerebras-llama-3.3-70b' },
      identity: {
        name: 'Ops Lead',
        emoji: '🎯',
      },
      subagents: {
        allowAgents: ['builder', 'sentinel', 'chronicler'],
        model: { primary: 'litellm/cerebras-llama-4-scout' },
      },
    },
    {
      id: 'builder',
      workspace: 'Builder',
      model: { primary: 'litellm/gemini-flash' },
      identity: {
        name: 'Builder',
        emoji: '🔨',
      },
      subagents: {
        allowAgents: ['sentinel', 'chronicler'],
        model: { primary: 'litellm/cerebras-llama-4-scout' },
      },
    },
    {
      id: 'sentinel',
      workspace: 'Sentinel',
      model: { primary: 'litellm/cerebras-llama-4-scout' },
      identity: {
        name: 'Sentinel',
        emoji: '🛡️',
      },
      subagents: {
        allowAgents: ['chronicler'],
        model: { primary: 'litellm/cerebras-llama-4-scout' },
      },
    },
    {
      id: 'chronicler',
      workspace: 'Chronicler',
      model: { primary: 'litellm/gemini-flash-lite' },
      identity: {
        name: 'Chronicler',
        emoji: '📋',
      },
    },
  ];
}

// =========================================================================
// Cleanup: remove keys that crash OpenClaw config validation
// =========================================================================
// OpenClaw validates config strictly — any unrecognized key causes a crash
// loop. Clean up keys that were added in previous runs but aren't valid.
delete config.compaction;
delete config.contextPruning;
delete config.memorySearch;
delete config.experimental;

// Clean unrecognized subagent/tool keys (persisted from previous entrypoint)
delete config.tools?.subagents?.maxDepth;
delete config.tools?.subagents?.maxConcurrent;
delete config.tools?.subagents?.maxChildrenPerAgent;
delete config.tools?.subagents?.runTimeoutSeconds;
delete config.tools?.agentToAgent?.maxPingPongTurns;

// Clean unrecognized agent keys from persisted agent list.
// Also spread models across providers to avoid single-provider rate limit exhaustion.
// Model assignment: Reliability-first strategy (2026-03-06 rebalance).
// cerebras-zai-glm rate-limits on first request — demoted to fallback only.
// cerebras-gpt-oss-120b and cerebras-llama-3.1-8b have 8192 context — too small for OpenClaw 16K min.
// Cerebras: Lead(70b), CodeCraft(70b), OpsLead(70b), Sentinel(scout), Subagents(scout)
// Gemini: Scout(pro), Builder(flash), Scribe(flash-lite), Chronicler(flash-lite)
var MODEL_MAP = {
  'lead': 'litellm/cerebras-llama-3.3-70b',
  'codecraft': 'litellm/cerebras-llama-3.3-70b',
  'scout': 'litellm/gemini-pro',
  'scribe': 'litellm/gemini-flash-lite',
  'ops-lead': 'litellm/cerebras-llama-3.3-70b',
  'builder': 'litellm/gemini-flash',
  'sentinel': 'litellm/cerebras-llama-4-scout',
  'chronicler': 'litellm/gemini-flash-lite',
};
var SUBAGENT_MODEL = 'litellm/cerebras-llama-4-scout';
if (Array.isArray(config.agents?.list)) {
  config.agents.list.forEach(function(agent) {
    if (agent.identity) delete agent.identity.description;
    if (agent.subagents) delete agent.subagents.maxDepth;
    delete agent.instructions; // not a valid OpenClaw agent key
    // Force all agents to their MODEL_MAP assignment (2026-03-05 rebalance).
    // This migrates from any previous strategy (Gemini-first, Groq, dead Cerebras models).
    if (MODEL_MAP[agent.id] && agent.model) {
      agent.model.primary = MODEL_MAP[agent.id];
    }
    // Migrate paid gpt-4o-mini to free model
    if (agent.model && agent.model.primary === 'litellm/gpt-4o-mini') {
      agent.model.primary = SUBAGENT_MODEL;
    }
    // Force all subagent models to Cerebras 8B (fastest for burst spawns)
    if (agent.subagents && agent.subagents.model) {
      agent.subagents.model.primary = SUBAGENT_MODEL;
    }
  });
}

fs.mkdirSync('/home/node/.openclaw', { recursive: true });
fs.writeFileSync(path, JSON.stringify(config, null, 2));
console.log('[entrypoint] OpenClaw config updated: auth=password, basePath=/openclaw/, bind=0.0.0.0, default=cerebras-llama-4-scout, a2a=peer, agents=8 (2 teams), Cerebras (70b/scout) + Gemini (pro/flash/flash-lite) + deepseek (fallback)');
"

# Seed server-side workspace files (SOUL.md, MEMORY.md, etc.) for each agent.
# Runs twice: once now (seeds new files), once after 30s delay (overwrites
# OpenClaw's default SOUL.md/BOOTSTRAP.md that it creates on agent init).
node /opt/scripts/seed-agent-workspaces.js

# Delayed re-seed: OpenClaw creates default workspace files on startup,
# overwriting our seeded SOUL.md/BOOTSTRAP.md. This background task waits
# for OpenClaw to finish initializing, then overwrites the defaults.
# OpenClaw reads workspace files on every turn, so changes take effect
# immediately on the next agent interaction.
(sleep 30 && node /opt/scripts/seed-agent-workspaces.js) &

# Pass bind via CLI flags too — config field may be ignored in newer versions.
exec node openclaw.mjs gateway --allow-unconfigured --host 0.0.0.0 --bind 0.0.0.0
