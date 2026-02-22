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
console.log('[entrypoint] OpenClaw config updated: auth=password, basePath=/openclaw/, bind=lan, model=litellm/gpt-4o-mini');
"

exec node openclaw.mjs gateway --allow-unconfigured
