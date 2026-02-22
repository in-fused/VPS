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
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (via LiteLLM)', contextWindow: 128000, maxTokens: 16384 }
  ]
};

// Default model — object format with primary key (flat strings break subagents)
config.agents = config.agents || {};
config.agents.defaults = config.agents.defaults || {};
config.agents.defaults.model = { primary: 'litellm/gpt-4o-mini' };
// Allowlist only the litellm provider to prevent anthropic fallback
config.agents.defaults.models = { litellm: {} };

// =========================================================================
// Memory Optimizations (ref: https://x.com/ksimback/status/2024180197910864182)
// =========================================================================

// --- Memory Fix 1: Enable memory flush before compaction ---
// Triggers a silent turn before context compaction to write durable memories
// to disk. This is the single most impactful change for memory retention.
config.compaction = config.compaction || {};
config.compaction.memoryFlush = {
  enabled: true,
  softThresholdTokens: 40000,
  prompt: 'Distill this session to memory/YYYY-MM-DD.md. Focus on decisions, state changes, lessons, blockers. If nothing: NO_FLUSH',
  systemPrompt: 'Extract only what is worth remembering. No fluff.'
};

// --- Memory Fix 2: Configure context pruning ---
// Cache-TTL mode keeps recent messages and preserves last 3 assistant responses.
// Prevents the repeat-yourself problem after context flushes. Saves tokens.
config.contextPruning = {
  mode: 'cache-ttl',
  ttl: '6h',
  keepLastAssistants: 3
};

// --- Memory Fix 3: Enable hybrid search ---
// Combines vector similarity (70%) with BM25 keyword search (30%).
// BM25 catches exact matches (error codes, project names) that vector misses.
config.memorySearch = config.memorySearch || {};
config.memorySearch.enabled = true;
config.memorySearch.sources = ['memory', 'sessions'];
config.memorySearch.query = {
  hybrid: {
    enabled: true,
    vectorWeight: 0.7,
    textWeight: 0.3
  }
};

// --- Memory Fix 4: Index past session transcripts ---
// Makes past conversations searchable so the agent can recall decisions from days ago.
config.experimental = config.experimental || {};
config.experimental.sessionMemory = true;

fs.mkdirSync('/home/node/.openclaw', { recursive: true });
fs.writeFileSync(path, JSON.stringify(config, null, 2));
console.log('[entrypoint] OpenClaw config updated: auth=password, basePath=/openclaw/, bind=lan, model=litellm/gpt-4o-mini, memoryFlush=on, contextPruning=cache-ttl/6h, hybridSearch=on, sessionMemory=on');
"

exec node openclaw.mjs gateway --allow-unconfigured
