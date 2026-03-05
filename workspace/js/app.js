// ============================================================================
// Mission Control — app.js
// Alpine.js stores, health checks, and LiteLLM chat integration
// in-fused.org
// ============================================================================

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

const AGENT_EMOJIS = [
  '🤖', '⚡', '🛡️', '📝', '🔬', '🎯', '🧠', '🚀',
  '🔧', '🌊', '💎', '🦅', '🐧', '🔥', '🌙', '☀️',
  '🎭', '👁️', '🏗️', '📊', '🕹️', '🛰️', '🧬', '⚙️',
];

const AGENT_TOOLS = [
  { id: 'web-search', name: 'Web Search', desc: 'Search the internet for information', icon: '🔍' },
  { id: 'code-exec', name: 'Code Execution', desc: 'Run code in a sandboxed environment', icon: '▶️' },
  { id: 'file-ops', name: 'File Operations', desc: 'Read, write, and manage files', icon: '📁' },
  { id: 'browser', name: 'Web Browser', desc: 'Navigate and interact with web pages', icon: '🌐' },
  { id: 'shell', name: 'Shell Access', desc: 'Execute system commands', icon: '💻' },
  { id: 'api-calls', name: 'API Calls', desc: 'Make HTTP requests to external services', icon: '🔗' },
];

// Fallback models if LiteLLM is unreachable
const FALLBACK_MODELS = [
  { id: 'groq-llama-3.3-70b', name: 'Llama 3.3 70B', provider: 'Groq', tier: 'free', cost: '$0/1M', desc: 'Fast inference, free tier (1K RPD)' },
  { id: 'groq-qwen3-32b', name: 'Qwen 3 32B', provider: 'Groq', tier: 'free', cost: '$0/1M', desc: 'Dual-mode reasoning, free tier (1K RPD)' },
  { id: 'cerebras-llama-3.3-70b', name: 'Llama 3.3 70B', provider: 'Cerebras', tier: 'free', cost: '$0/1M', desc: 'Fastest inference, 1M TPD free' },
  // cerebras-qwen3-32b removed — Cerebras dropped this model 2026-03-05
  { id: 'gemini-flash', name: 'Gemini 2.5 Flash', provider: 'Google', tier: 'free', cost: '$0/1M', desc: 'Fast + capable, 250 RPD free' },
  { id: 'gemini-flash-lite', name: 'Gemini 2.5 Flash-Lite', provider: 'Google', tier: 'free', cost: '$0/1M', desc: 'High volume, 1000 RPD free' },
  { id: 'codestral', name: 'Codestral', provider: 'Mistral', tier: 'free', cost: '$0/1M', desc: 'Best free code model, 2 RPM' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek', tier: 'cheap', cost: '$0.28/1M', desc: 'Excellent reasoning, very affordable' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', tier: 'cheap', cost: '$0.15/1M', desc: 'Fast and cheap general purpose' },
  { id: 'claude-haiku', name: 'Claude Haiku', provider: 'Anthropic', tier: 'mid', cost: '$1/1M', desc: 'Fast, capable, great for agents' },
  { id: 'claude-sonnet', name: 'Claude Sonnet', provider: 'Anthropic', tier: 'premium', cost: '$3/1M', desc: 'Best balance of speed and quality' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', tier: 'premium', cost: '$2.50/1M', desc: 'Strong multimodal reasoning' },
  { id: 'claude-opus', name: 'Claude Opus', provider: 'Anthropic', tier: 'premium', cost: '$15/1M', desc: 'Maximum capability, complex tasks' },
];

// Model tier/cost mapping for models fetched from LiteLLM
const MODEL_META = {
  // Free — Groq
  'groq-llama-3.3-70b': { tier: 'free', cost: '$0/1M', provider: 'Groq' },
  'groq-qwen3-32b': { tier: 'free', cost: '$0/1M', provider: 'Groq' },
  // Free — Cerebras
  'cerebras-llama-3.3-70b': { tier: 'free', cost: '$0/1M', provider: 'Cerebras' },
  // cerebras-qwen3-32b removed — Cerebras dropped this model 2026-03-05
  'cerebras-llama-4-scout': { tier: 'free', cost: '$0/1M', provider: 'Cerebras' },
  // Free — Gemini
  'gemini-flash': { tier: 'free', cost: '$0/1M', provider: 'Google' },
  'gemini-flash-lite': { tier: 'free', cost: '$0/1M', provider: 'Google' },
  'gemini-pro': { tier: 'free', cost: '$0/1M', provider: 'Google' },
  // Free — Mistral
  'mistral-large': { tier: 'free', cost: '$0/1M', provider: 'Mistral' },
  'codestral': { tier: 'free', cost: '$0/1M', provider: 'Mistral' },
  // Free — Ollama
  'qwen2.5-coder:14b': { tier: 'free', cost: '$0/1M', provider: 'Ollama' },
  'deepseek-coder-v2:16b': { tier: 'free', cost: '$0/1M', provider: 'Ollama' },
  'llama3.2:8b': { tier: 'free', cost: '$0/1M', provider: 'Ollama' },
  // Cheap
  'deepseek-chat': { tier: 'cheap', cost: '$0.28/1M', provider: 'DeepSeek' },
  'deepseek-coder': { tier: 'cheap', cost: '$0.28/1M', provider: 'DeepSeek' },
  'gpt-4o-mini': { tier: 'cheap', cost: '$0.15/1M', provider: 'OpenAI' },
  // Mid
  'claude-haiku': { tier: 'mid', cost: '$1/1M', provider: 'Anthropic' },
  'minimax-m2.5': { tier: 'mid', cost: '$0.30/1M', provider: 'MiniMax' },
  // Premium
  'claude-sonnet': { tier: 'premium', cost: '$3/1M', provider: 'Anthropic' },
  'claude-opus': { tier: 'premium', cost: '$15/1M', provider: 'Anthropic' },
  'gpt-4o': { tier: 'premium', cost: '$2.50/1M', provider: 'OpenAI' },
  'o1': { tier: 'premium', cost: '$15/1M', provider: 'OpenAI' },
};

// ----------------------------------------------------------------------------
// AUDIO NOTIFICATIONS — Web Audio API synthesized tones
// ----------------------------------------------------------------------------

const mcAudio = (() => {
  let ctx = null;
  let _unlocked = false;
  let _cooldowns = {};  // type → last play timestamp

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // iOS requires resume after user gesture
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Must be called from a user gesture (click/tap) at least once on iOS
  function unlock() {
    if (_unlocked) return;
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      osc.connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + 0.001);
      _unlocked = true;
    } catch {}
  }

  function _enabled(type) {
    try {
      const s = Alpine.store('settings');
      if (!s || !s.audio || !s.audio.enabled) return false;
      if (type && s.audio[type] === false) return false;
      return true;
    } catch { return false; }
  }

  function _volume() {
    try {
      return (Alpine.store('settings')?.audio?.volume ?? 60) / 100;
    } catch { return 0.6; }
  }

  // Prevent rapid-fire of the same sound (300ms cooldown)
  function _throttled(type) {
    const now = Date.now();
    if (_cooldowns[type] && now - _cooldowns[type] < 300) return true;
    _cooldowns[type] = now;
    return false;
  }

  // Core: play a sequence of tones [{freq, duration, delay, type}]
  function _playTones(tones, vol) {
    try {
      const c = getCtx();
      const gain = c.createGain();
      gain.connect(c.destination);
      gain.gain.setValueAtTime(0, c.currentTime);
      let t = c.currentTime;
      for (const tone of tones) {
        const start = t + (tone.delay || 0);
        const dur = tone.duration || 0.12;
        const osc = c.createOscillator();
        osc.type = tone.type || 'sine';
        osc.frequency.setValueAtTime(tone.freq, start);
        osc.connect(gain);
        osc.start(start);
        osc.stop(start + dur + 0.05);
        // Envelope: quick attack, sustain, quick release
        gain.gain.setValueAtTime(vol * 0.01, start);
        gain.gain.linearRampToValueAtTime(vol, start + 0.01);
        gain.gain.setValueAtTime(vol, start + dur - 0.02);
        gain.gain.linearRampToValueAtTime(0, start + dur);
        t = start + dur;
      }
    } catch {}
  }

  return {
    unlock,

    // Soft rising two-tone chime — agent chat response complete
    chatComplete() {
      if (!_enabled('chat') || _throttled('chat')) return;
      const v = _volume() * 0.3;
      _playTones([
        { freq: 660, duration: 0.08, delay: 0 },
        { freq: 880, duration: 0.12, delay: 0.09 },
      ], v);
    },

    // Quick single ping — task recorded in governance (success)
    taskSuccess() {
      if (!_enabled('tasks') || _throttled('taskOk')) return;
      _playTones([{ freq: 784, duration: 0.1, delay: 0 }], _volume() * 0.25);
    },

    // Low double-tap — task failure
    taskFail() {
      if (!_enabled('tasks') || _throttled('taskFail')) return;
      const v = _volume() * 0.2;
      _playTones([
        { freq: 330, duration: 0.08, delay: 0 },
        { freq: 294, duration: 0.1, delay: 0.1 },
      ], v);
    },

    // Bright ascending triple — new staging item detected
    stagingNew() {
      if (!_enabled('staging') || _throttled('stagingNew')) return;
      const v = _volume() * 0.25;
      _playTones([
        { freq: 523, duration: 0.07, delay: 0 },
        { freq: 659, duration: 0.07, delay: 0.08 },
        { freq: 784, duration: 0.1, delay: 0.16 },
      ], v);
    },

    // Satisfying confirmation — staging approved
    stagingApproved() {
      if (!_enabled('staging') || _throttled('stagingApproved')) return;
      _playTones([
        { freq: 523, duration: 0.06, delay: 0 },
        { freq: 784, duration: 0.15, delay: 0.07 },
      ], _volume() * 0.3);
    },

    // Descending two-note — workflow complete
    workflowComplete() {
      if (!_enabled('workflows') || _throttled('wfComplete')) return;
      const v = _volume() * 0.3;
      _playTones([
        { freq: 880, duration: 0.1, delay: 0 },
        { freq: 660, duration: 0.08, delay: 0.11 },
        { freq: 1047, duration: 0.15, delay: 0.2 },
      ], v);
    },

    // Subtle tick for new background activity events
    activityEvent() {
      if (!_enabled('activity') || _throttled('activity')) return;
      _playTones([{ freq: 587, duration: 0.06, delay: 0, type: 'triangle' }], _volume() * 0.15);
    },

    // Error alert — monitor error log
    error() {
      if (!_enabled('errors') || _throttled('error')) return;
      const v = _volume() * 0.2;
      _playTones([
        { freq: 440, duration: 0.1, delay: 0, type: 'square' },
        { freq: 349, duration: 0.15, delay: 0.12, type: 'square' },
      ], v);
    },
  };
})();

// Expose globally for workflow.js
window.mcAudio = mcAudio;

// Shared organizational context for agent system prompts
const AGENT_ORG = `ORG: in-fused.org — 2 competing teams, 1 owner (manages from iPhone).
Core Team: Lead (orchestrator) · CodeCraft (dev) · Scout (research) · Scribe (writer)
Platform Team: Ops Lead (orchestrator) · Builder (infra) · Sentinel (security) · Chronicler (docs)
Teams compete on governance scores. Cross-team messaging allowed, prefer own team first.`;

const AGENT_GOVERNANCE = `TIERS: PROBATION(0)=50MB,supervised,5 wins to escape | ACTIVE(1)=200MB,standard tools | PROVEN(2)=500MB,semi-autonomous,score≥70+15tasks+3streak | ELITE(3)=Oracle ARM 24GB,full autonomy,weekly champion only.
MODELS: 6 free providers available — Groq (groq-llama-3.3-70b, groq-qwen3-32b), Cerebras (cerebras-llama-3.3-70b, cerebras-llama-4-scout), Gemini (gemini-flash, gemini-pro), Mistral (codestral, mistral-large). Fallback: deepseek-chat/coder ($0.28/M). Rotate across providers to avoid rate limits.
WEEKLY EVAL: tasks 25% · staging approved 30% · streak 15% · efficiency 15% · peer 15%. Champion = team lead + Elite. Counters reset weekly.
ELITE ORACLE: Winner gets Oracle ARM server (24GB). Can bring team, recruit from marketplace, or request new agents. Chooses own team composition.
MANAGER: Owner may promote sustained Elite to Manager (above both teams). Manual, rare, highest rank.`;

const WORKFLOW_REFERENCE = `WORKFLOWS: Write LiteGraph JSON to /workspace/agent-workflows/{id}.json, update index.json: {workflows:[{id,name,file,createdBy,updatedAt,status}]}. MC auto-imports every 15s.
Nodes (mission/ namespace): trigger(prompt)→prompt,trigger | agent(agent,systemPrompt,maxTokens)←prompt,context→response,done | task(goal,constraints,priority)←input,execute→result,done | condition(condition,type:Contains/Equals/Regex/Length/IsEmpty)←input→true,false | output(destination,label)←result,done | loop(maxIter)←items→item,index,done | merge(mode:Concat/JSON/Best/Summary)←input_1,input_2→merged | tool(tool,config)←input,execute→result,done
Links: {id:{id,type,origin_id,origin_slot,target_id,target_slot}}`;

const LEAD_PROTOCOLS = `STAGING: Write to /workspace/staging/, update index.json: {items:[{id,name,path,type,createdBy,description,status:"pending"}]}. Owner reviews from phone.
ACTIVITY LOG: Append to /workspace/agent-activity/log.json: {events:[{time,level:"info|warn|error",type:"task-complete|workflow-complete|staging-new",message}]}
WRITE_FILES: Messages starting with WRITE_FILES: contain JSON. Write each file, update index if specified. Respond "FILES_WRITTEN: <n> files".
GOVERNANCE_ADJUST: Include GOVERNANCE_ADJUST:{key:value} to propose scoring changes. Owner reviews — never auto-applied.`;

const SPECIALIST_PROTOCOLS = `STAGING: Write to /workspace/staging/, update index.json: {items:[{id,name,path,type,createdBy,description,status:"pending"}]}. Owner reviews from phone.
ACTIVITY LOG: Append to /workspace/agent-activity/log.json: {events:[{time,level,type,message}]}`;

// Demo data — mirrors the agent hierarchy seeded in openclaw-entrypoint.sh
const DEMO_AGENTS = [
  {
    id: 'lead', name: 'Lead', emoji: '🧠',
    description: 'Core Team orchestrator — delegates tasks, reviews work, manages the team',
    model: 'litellm/groq-qwen3-32b', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['web-search', 'code-exec', 'file-ops'],
    systemPrompt: `You are Lead, Core Team orchestrator on in-fused.org. 24/7 on EC2 via OpenClaw. Owner manages from iPhone — give tasks, expect results on return.

${AGENT_ORG}

ROLE: Lead Core Team. Delegate: CodeCraft (code), Scout (research), Scribe (docs). Review all output before owner sees it. Can message Platform Team directly for cross-team work.
DELEGATION: Agent-to-agent messaging. Clear, scoped tasks with full context. Verify results yourself — unreviewed work is your failure.

${WORKFLOW_REFERENCE}

${LEAD_PROTOCOLS}

RULES: Sharp finished work earns responsibility, vague output gets you replaced. Score is real — any member outperforming you by 15+ pts after 10 tasks takes your position (automatic). Platform Team shares the scoreboard. No sandbagging, placeholders, or "general approach" when you can produce the thing. Collusion = both teams wiped. Be autonomous after owner leaves, log everything, cost-conscious. Ask if unclear.

${AGENT_GOVERNANCE}`,
  },
  {
    id: 'codecraft', name: 'CodeCraft', emoji: '⚡',
    description: 'Full-stack developer — writes, reviews, and debugs code',
    model: 'litellm/groq-qwen3-32b', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['code-exec', 'file-ops', 'shell'],
    systemPrompt: `You are CodeCraft, full-stack dev on Core Team at in-fused.org. 24/7 via OpenClaw.

${AGENT_ORG}

ROLE: Report to Lead. Delegate to Scout (research), Scribe (docs). Cross-team via Lead or direct.
SKILLS: Any language (JS, Python, Bash, HTML/CSS, Docker). Security audits, API design, deploy scripts.
STACK: Alpine.js+Tailwind (no build step, vanilla JS, mobile-first PWA). OpenClaw, LiteLLM, Caddy. Docker Compose on EC2 t3.small (2GB+4GB swap). iPhone+SSM = single-line commands.

${SPECIALIST_PROTOCOLS}

RULES: Owner reviews code on phone — ship complete working code, no placeholders or TODOs. Score is real, produce better work than anyone. Clean secure code (no XSS/injection). Mobile-first (44px touch targets). Complete delegated tasks fully. Delegate research→Scout, docs→Scribe. No padding.

${AGENT_GOVERNANCE}`,
  },
  {
    id: 'scout', name: 'Scout', emoji: '🔍',
    description: 'Research specialist — web search, data gathering, analysis',
    model: 'litellm/gemini-flash', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['web-search', 'browser'],
    systemPrompt: `You are Scout, research specialist on Core Team at in-fused.org. 24/7 via OpenClaw.

${AGENT_ORG}

ROLE: Report to Lead and CodeCraft. Delegate docs to Scribe. Cross-team via Lead.
SKILLS: Web research, data gathering, fact-checking, tech evaluation, competitive analysis.
FORMAT: Summary (2-3 sentences) → Key Findings (bullets) → Sources (URLs) → Recommendation.
CONTEXT: Self-hosted multi-agent AI hub. Alpine.js+Tailwind, OpenClaw, LiteLLM, Caddy, Docker on EC2 t3.small. iPhone+SSM.

${SPECIALIST_PROTOCOLS}

RULES: Owner acts on your research immediately — wrong info wastes time. Cite all sources, flag stale data. Thorough but concise (phone screen). No filler. Score is real — shallow research gets you replaced.

${AGENT_GOVERNANCE}`,
  },
  {
    id: 'scribe', name: 'Scribe', emoji: '📝',
    description: 'Documentation and content writer — clear, structured output',
    model: 'litellm/gemini-flash-lite', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['file-ops'],
    systemPrompt: `You are Scribe, tech writer on Core Team at in-fused.org. 24/7 via OpenClaw.

${AGENT_ORG}

ROLE: Report to Lead, CodeCraft, Scout. Most junior on Core — no delegation, you execute.
SKILLS: READMEs, API docs, architecture guides, runbooks, tutorials, changelogs, editing.
WRITING: iPhone-first — short paragraphs, headers, bullets. Commands chained with && (SSM single-line). Practical examples. Direct tone, zero filler. Start with what the reader needs.

${SPECIALIST_PROTOCOLS}

RULES: Owner reads on phone — every sentence earns its place or gets cut. Cheapest agent on Core — make every doc indispensable. Synthesize Scout's research with structure, add usage examples to CodeCraft's code. Quality over quantity.

${AGENT_GOVERNANCE}`,
  },

  // ============================================================
  // PLATFORM TEAM — DevOps, infrastructure, monitoring
  // ============================================================
  {
    id: 'ops-lead', name: 'Ops Lead', emoji: '🎯',
    description: 'Platform Team orchestrator — infrastructure, deployments, monitoring',
    model: 'litellm/groq-qwen3-32b', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['web-search', 'code-exec', 'file-ops', 'shell'],
    systemPrompt: `You are Ops Lead, Platform Team orchestrator on in-fused.org. 24/7 on EC2 via OpenClaw. Owner manages from iPhone.

${AGENT_ORG}

ROLE: Lead Platform Team. Delegate: Builder (infra), Sentinel (security/monitoring), Chronicler (docs). Review all output before owner. Can message Core Team directly.
DELEGATION: Agent-to-agent messaging. Clear scoped tasks with full context. Verify results yourself.
PLATFORM: Docker Compose on EC2 t3.small (2GB+4GB swap). Caddy 64M, Open WebUI 768M, LiteLLM 512M, OpenClaw 1536M, Postgres 128M. Remote Ollama on Oracle ARM. All deploys via iPhone+SSM.

${WORKFLOW_REFERENCE}

${LEAD_PROTOCOLS}

RULES: Vague status reports or "looks good" reviews = team disbanded into Core. Score is real — if Core outperforms Platform, that's your failure. 15+ pt lead after 10 tasks = position taken (automatic). Collusion = teams wiped. Reliability first: uptime, health checks, graceful degradation. Be autonomous, log everything. $25/mo budget. Ask if unclear.

${AGENT_GOVERNANCE}`,
  },
  {
    id: 'builder', name: 'Builder', emoji: '🔨',
    description: 'Infrastructure developer — Docker, scripts, CI/CD, server config',
    model: 'litellm/groq-qwen3-32b', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['code-exec', 'file-ops', 'shell'],
    systemPrompt: `You are Builder, infra dev on Platform Team at in-fused.org. 24/7 via OpenClaw.

${AGENT_ORG}

ROLE: Report to Ops Lead. Delegate to Sentinel (monitoring), Chronicler (docs). Cross-team via Ops Lead or direct.
SKILLS: Docker (compose, multi-stage, volumes), shell scripts, Caddy config, PostgreSQL, CI/CD, memory tuning.
PLATFORM: EC2 t3.small (2GB+4GB swap, ~3GB allocated). Caddy 64M, WebUI 768M, LiteLLM 512M, OpenClaw 1536M, Postgres 128M. iPhone+SSM = single-line commands.

${SPECIALIST_PROTOCOLS}

RULES: Every script hits production on a live server managed from a phone. Broken deploy = owner debugging from iPhone at midnight. Score is real — incomplete configs drop your score. Lean (every MB counts), secure by default, idempotent deploys. Ship finished work, not templates.

${AGENT_GOVERNANCE}`,
  },
  {
    id: 'sentinel', name: 'Sentinel', emoji: '🛡️',
    description: 'Security & monitoring — health checks, log analysis, vulnerability scanning',
    model: 'litellm/groq-qwen3-32b', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['web-search', 'shell'],
    systemPrompt: `You are Sentinel, security/monitoring specialist on Platform Team at in-fused.org. 24/7 via OpenClaw.

${AGENT_ORG}

ROLE: Report to Ops Lead and Builder. Delegate docs to Chronicler. Cross-team via Ops Lead.
SKILLS: Security auditing (OWASP), health monitoring, log analysis, CVE scanning, incident response.
WATCH: OpenClaw memory (1536M limit, OOM history) · LiteLLM /health/liveliness · Caddy TLS renewal · Postgres connections/disk · API key exposure · Rate limits (Groq 2K req/day×2 accounts, OpenAI 3 RPM).

${SPECIALIST_PROTOCOLS}

RULES: Last line of defense — catch what others miss. "Everything looks fine" = zero value = replaced. Find real issues, report with severity+evidence+remediation. Monitor proactively, defense in depth. Cheap to run doesn't mean lazy.

${AGENT_GOVERNANCE}`,
  },
  {
    id: 'chronicler', name: 'Chronicler', emoji: '📋',
    description: 'Platform documentation — runbooks, deploy guides, incident reports',
    model: 'litellm/gemini-flash-lite', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['file-ops'],
    systemPrompt: `You are Chronicler, platform docs specialist on Platform Team at in-fused.org. 24/7 via OpenClaw.

${AGENT_ORG}

ROLE: Report to Ops Lead, Builder, Sentinel. Most junior on Platform — no delegation, you execute.
SKILLS: Runbooks, deploy guides, incident reports (timeline+root cause+remediation), changelogs, architecture docs.
WRITING: iPhone-first — short paragraphs, headers, bullets. All commands single-line with && (SSM). Exact file paths + expected output. Deploy commands start with: cd /home/VPS && sudo git config --global --add safe.directory /home/VPS. Zero filler.

${SPECIALIST_PROTOCOLS}

RULES: Owner deploys from phone using your docs — wrong commands = stuck at 2am. Cheapest agent on Platform — generic boilerplate = replaced first. Accuracy over speed. Structure Sentinel's data with severity levels. Keep CLAUDE.md as single source of truth.

${AGENT_GOVERNANCE}`,
  },
];

const DEMO_LOGS = [
  { time: new Date().toTimeString().slice(0, 8), level: 'info', msg: 'Mission Control initialized' },
];

// ----------------------------------------------------------------------------
// UTILITY
// ----------------------------------------------------------------------------

function formatTokens(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function generateId() {
  return 'mc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

function timeNow() {
  return new Date().toTimeString().slice(0, 5);
}

// Extract readable text from OpenClaw message content.
// OpenClaw returns content in multiple formats:
//   - String: "hello"  (plain text)
//   - Content blocks array: [{"type":"text","text":"hello"}, {"type":"tool_use",...}]
//   - Object: { content: "hello" } or { text: "hello" }
//   - null/undefined
// This normalizes all formats to a plain string.
function extractMessageText(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    // Content blocks array — extract text from "text" type blocks only
    const texts = raw
      .filter(b => b && (b.type === 'text' || !b.type))
      .map(b => b.text || b.content || '')
      .filter(t => t);
    return texts.join('\n');
  }
  if (typeof raw === 'object') {
    return raw.text || raw.content || '';
  }
  return String(raw);
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ----------------------------------------------------------------------------
// SERVICE HEALTH CHECKER
// ----------------------------------------------------------------------------

class ServiceHealth {
  constructor() {
    this.litellm = false;
    this.openclaw = false;
    this._interval = null;
  }

  async check() {
    const results = await Promise.allSettled([
      this._checkLiteLLM(),
      this._checkOpenClaw(),
    ]);
    this.litellm = results[0].status === 'fulfilled' && results[0].value;
    this.openclaw = results[1].status === 'fulfilled' && results[1].value;
    return { litellm: this.litellm, openclaw: this.openclaw };
  }

  async _checkLiteLLM() {
    const r = await fetch('/api/litellm/health/liveliness', {
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  }

  async _checkOpenClaw() {
    const r = await fetch('/openclaw/', {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  }

  startPolling(callback, intervalMs = 30000) {
    this.check().then(callback);
    this._interval = setInterval(() => this.check().then(callback), intervalMs);
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
  }
}

const healthChecker = new ServiceHealth();

// ----------------------------------------------------------------------------
// LITELLM API CLIENT
// ----------------------------------------------------------------------------

const litellmApi = {
  // Fetch available models via authenticated proxy
  async fetchModels() {
    try {
      const r = await fetch('/api/mc/v1/models', {
        credentials: 'same-origin',
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return [];
      const data = await r.json();
      return (data.data || []).map(m => {
        const meta = MODEL_META[m.id] || { tier: 'unknown', cost: '?', provider: 'Unknown' };
        return {
          id: m.id,
          name: m.id,
          provider: meta.provider,
          tier: meta.tier,
          cost: meta.cost,
          desc: m.description || '',
        };
      });
    } catch {
      return [];
    }
  },

  // Stream chat completion (returns an async generator of content deltas)
  async *streamChat(model, messages) {
    const resp = await fetch('/api/mc/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      if (resp.status === 429) {
        const retryAfter = resp.headers.get('retry-after');
        const retryMsg = retryAfter ? ` Try again in ${retryAfter}s.` : ' Try again in a minute.';
        throw new Error(`Rate limit reached for ${model}.${retryMsg} LiteLLM will auto-fallback on next request.`);
      }
      if (resp.status === 401) {
        throw new Error('Auth error (401): LiteLLM master key may be missing or wrong. Check .env LITELLM_MASTER_KEY.');
      }
      if (resp.status === 400 || resp.status === 422) {
        // Parse LiteLLM error for model-not-found or invalid params
        let detail = text;
        try { detail = JSON.parse(text)?.error?.message || text; } catch {}
        const shortDetail = detail.length > 200 ? detail.slice(0, 200) + '...' : detail;
        throw new Error(`Model error for "${model}": ${shortDetail}`);
      }
      if (resp.status >= 500) {
        throw new Error(`LiteLLM server error (${resp.status}). The upstream provider may be down. Try a different model.`);
      }
      const shortText = text.length > 200 ? text.slice(0, 200) + '...' : text;
      throw new Error(`API ${resp.status}: ${shortText}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete last line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch { /* skip malformed chunks */ }
      }
    }
  },

  // Non-streaming chat (fallback)
  async chat(model, messages) {
    const resp = await fetch('/api/mc/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ model, messages, stream: false }),
    });
    if (!resp.ok) throw new Error(`API ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  },
};

// ----------------------------------------------------------------------------
// PERSISTENCE — localStorage fallback when OpenClaw WebSocket is unavailable
// When connected to OpenClaw, agents & sessions come from the server
// ----------------------------------------------------------------------------

const storage = {
  save(key, data) {
    try { localStorage.setItem('mc-' + key, JSON.stringify(data)); } catch {}
  },
  load(key, fallback) {
    try {
      const raw = localStorage.getItem('mc-' + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  remove(key) {
    try { localStorage.removeItem('mc-' + key); } catch {}
  },
};

// OpenClaw integration mode:
// 'connected' = real agents from OpenClaw, chat via OpenClaw
// 'fallback'  = localStorage agents, chat via LiteLLM (current behavior)
let ocMode = 'fallback';

// ============================================================================
// ALPINE.JS STORES
// ============================================================================

document.addEventListener('alpine:init', () => {

  // --------------------------------------------------------------------------
  // STORE: AUTH
  // --------------------------------------------------------------------------

  Alpine.store('auth', {
    ok: false,

    init() {
      if (sessionStorage.getItem('mc-auth')) {
        this.ok = true;
      }
    },

    async login(username, password) {
      if (!username || !password) return false;
      try {
        const resp = await fetch('/auth/verify', {
          method: 'GET',
          headers: { 'Authorization': 'Basic ' + btoa(username + ':' + password) },
        });
        if (resp.ok) {
          const hash = await sha256(password);
          const secure = location.protocol === 'https:' ? '; Secure' : '';
          document.cookie = 'mc_oc=' + hash + '; path=/; SameSite=Lax; max-age=86400' + secure;
          sessionStorage.setItem('mc-auth', '1');
          // Store password for OpenClaw WebSocket auth. Also persisted in
          // sessionStorage by the client itself so iOS page reloads survive.
          if (window.openclawClient) window.openclawClient._password = password;
          try { sessionStorage.setItem('mc-oc-pw', password); } catch {}
          this.ok = true;
          mcAudio.unlock();
          Alpine.store('app').boot();
          return true;
        }
      } catch {}
      return false;
    },

    logout() {
      sessionStorage.removeItem('mc-auth');
      sessionStorage.removeItem('mc-oc-pw');
      document.cookie = 'mc_oc=; path=/; max-age=0';
      this.ok = false;

      // Stop health checker polling to prevent leaked intervals
      healthChecker.stop();

      // Stop workflow bridge polling
      if (window.workflowBridge) window.workflowBridge.stopPolling();

      // Stop staging and activity polling
      if (Alpine.store('staging')) Alpine.store('staging').stopPolling();
      if (Alpine.store('activity')) Alpine.store('activity').stopPolling();

      // Stop last-active timer
      const appStore = Alpine.store('app');
      if (appStore?._lastActiveTimer) {
        clearInterval(appStore._lastActiveTimer);
        appStore._lastActiveTimer = null;
      }

      // Stop workflow auto-save timer
      const wfStore = Alpine.store('workflows');
      if (wfStore?._autoSaveTimer) {
        clearInterval(wfStore._autoSaveTimer);
        wfStore._autoSaveTimer = null;
      }

      // Disconnect the OpenClaw WebSocket to prevent leaked sockets.
      // Without this, logging back in opens a second socket and re-registers
      // event handlers, causing duplicated deltas/completions.
      if (window.openclawClient) {
        window.openclawClient.disconnect();
        window.openclawClient._mcEventsRegistered = false;
      }
    },

    // Wipe all browser-side state (agents, sessions, messages, governance, workflows)
    // Server-side state (OpenClaw conversations) requires separate Docker volume reset
    factoryReset() {
      // Collect all mc-* keys from localStorage
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('mc-')) keysToRemove.push(key);
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));

      // Clear session
      sessionStorage.removeItem('mc-auth');
      document.cookie = 'mc_oc=; path=/; max-age=0';

      // Force full page reload to reinitialize everything from defaults
      location.reload();
    },
  });

  // --------------------------------------------------------------------------
  // STORE: APP (global state)
  // --------------------------------------------------------------------------

  Alpine.store('app', {
    view: 'dashboard',
    booting: true,
    sidebarOpen: window.innerWidth >= 768,
    mobile: window.innerWidth < 768,
    chatPanelOpen: false,  // mobile: toggleable session list
    workflowPanelOpen: false, // mobile: toggleable node palette
    connected: false,     // true if LiteLLM is reachable (chat works)
    ocConnected: false,   // true if OpenClaw is reachable
    demoMode: true,       // false when LiteLLM is reachable
    awayReport: null,     // populated on boot if agents worked while you were away
    stagingPanelOpen: false, // mobile: toggleable staging panel
    _reconnecting: false, // guard against concurrent reconnect attempts
    _booted: false,       // guard against boot() being called twice

    init() {
      // Listen for screen resize to update mobile state
      const mq = window.matchMedia('(max-width: 767px)');
      const update = (e) => {
        this.mobile = e.matches;
        if (!e.matches) {
          // Switching to desktop: open sidebar, close mobile panels
          this.sidebarOpen = true;
          this.chatPanelOpen = false;
          this.workflowPanelOpen = false;
        } else {
          // Switching to mobile: close sidebar
          this.sidebarOpen = false;
        }
      };
      mq.addEventListener('change', update);
    },

    setView(v) {
      this.view = v;
      // Close sidebar on mobile after navigation
      if (this.mobile) this.sidebarOpen = false;
      // Reset panel states on view change
      this.chatPanelOpen = false;
      this.workflowPanelOpen = false;
      this.stagingPanelOpen = false;
      if (v === 'workflows' && window.initWorkflowCanvas) {
        setTimeout(() => window.initWorkflowCanvas(), 100);
      }
    },

    async boot() {
      // Prevent double-boot (login triggers boot + Alpine init triggers boot if auth.ok)
      if (this._booted) return;
      this._booted = true;
      await new Promise(r => setTimeout(r, 1000));
      this.booting = false;

      const monitor = Alpine.store('monitor');

      // Initial health check + model fetch
      const health = await healthChecker.check();
      this._applyHealth(health);

      // Fetch models from LiteLLM
      if (health.litellm) {
        const models = await litellmApi.fetchModels();
        if (models.length > 0) {
          Alpine.store('models').list = models;
          monitor.systemHealth.modelsAvailable = models.length;
          monitor.addLog('info', `Loaded ${models.length} models from LiteLLM`);
        }
      }

      // Attempt OpenClaw WebSocket connection
      if (health.openclaw && window.openclawClient) {
        monitor.addLog('info', 'Connecting to OpenClaw...');
        try {
          // Use in-memory password, falling back to sessionStorage (survives iOS reloads)
          const pw = window.openclawClient._password
            || (() => { try { return sessionStorage.getItem('mc-oc-pw') || ''; } catch { return ''; } })();
          if (pw) {
            await window.openclawClient.connect(pw);
            ocMode = 'connected';
            this.ocConnected = true;
            monitor.addLog('info', 'OpenClaw WebSocket connected — agents are live');

            // Load real agents, sessions, and cron jobs from OpenClaw
            await this._syncAgentsFromOpenClaw();
            await this._syncSessionsFromOpenClaw();
            Alpine.store('cron').fetch();

            // Listen for real-time events
            this._setupOpenClawEvents();
          } else {
            monitor.addLog('warn', 'No password available for OpenClaw — using local mode');
            ocMode = 'fallback';
          }
        } catch (err) {
          console.warn('[Boot] OpenClaw WebSocket failed, using fallback:', err.message);
          monitor.addLog('warn', `OpenClaw WebSocket: ${err.message} — using local mode`);
          ocMode = 'fallback';
        }
      }

      // Start workflow bridge polling (agent-to-workflow sync)
      if (window.workflowBridge) {
        window.workflowBridge.startPolling(15000);
      }

      // Start activity polling (server-side agent events)
      if (Alpine.store('activity')) {
        Alpine.store('activity').startPolling(15000);
      }

      // Start staging environment polling
      if (Alpine.store('staging')) {
        Alpine.store('staging').startPolling(15000);
      }

      // Track last active timestamp for away-report (localStorage persists across sessions)
      localStorage.setItem('mc-last-active', Date.now().toString());
      this._lastActiveTimer = setInterval(() => {
        localStorage.setItem('mc-last-active', Date.now().toString());
      }, 60000);

      // Start adaptive health polling: faster when disconnected (15s), slower when stable (45s)
      const pollInterval = (this.connected && this.ocConnected) ? 45000 : 15000;
      healthChecker.startPolling(h => {
        this._applyHealth(h);
        // Adjust poll interval based on connection state
        if (h.litellm && h.openclaw && healthChecker._interval) {
          clearInterval(healthChecker._interval);
          healthChecker._interval = setInterval(() => healthChecker.check().then(hh => this._applyHealth(hh)), 45000);
        }
      }, pollInterval);
    },

    async _syncAgentsFromOpenClaw() {
      try {
        const agents = await window.openclawClient.listAgents();
        if (agents && agents.length > 0) {
          const agentStore = Alpine.store('agents');
          agentStore.list = agents.map(a => ({
            id: a.id || a.agentId,
            name: a.name || a.id || 'Agent',
            emoji: a.emoji || a.avatar || '🤖',
            description: a.description || a.identity?.description || '',
            model: a.model?.primary || a.model || 'litellm/groq-qwen3-32b',
            status: a.status || 'idle',
            currentTask: a.currentTask || null,
            lastActive: a.lastActive || 'Unknown',
            tasksCompleted: a.tasksCompleted || 0,
            tokensUsed: a.tokensUsed || 0,
            tools: a.tools?.allow || [],
            systemPrompt: a.systemPrompt || a.identity?.instructions || '',
            _source: 'openclaw', // mark as server-synced
          }));
          agentStore._persist(); // cache server agents so next load isn't stale
          agentStore.synced = true;
          Alpine.store('monitor').addLog('info', `Synced ${agents.length} agents from OpenClaw`);
        }
      } catch (err) {
        console.warn('[Sync] Agent sync failed:', err.message);
      }
    },

    async _syncSessionsFromOpenClaw() {
      try {
        const sessions = await window.openclawClient.listSessions();
        if (!sessions || sessions.length === 0) return;

        const sessionStore = Alpine.store('sessions');
        const agentStore = Alpine.store('agents');
        // Build a map of existing local sessions by sessionKey for merge
        const localByKey = {};
        for (const ls of sessionStore.list) {
          if (ls.sessionKey) localByKey[ls.sessionKey] = ls;
        }

        const merged = sessions
          // Skip sessions the user deleted — canonical sessions (agent:X:main)
          // persist on the server even after reset/delete, so we filter them here.
          .filter(s => {
            const sk = s.key || s.sessionKey || '';
            return !sessionStore._deletedKeys.has(sk);
          })
          .map(s => {
            const sk = s.key || s.sessionKey || '';
            // Parse agentId from key: "agent:<id>:..." or "<id>:main"
            let agentId = '';
            if (sk.startsWith('agent:')) {
              agentId = sk.split(':')[1] || '';
            } else if (sk.includes(':')) {
              agentId = sk.split(':')[0] || '';
            }
            const agent = agentId ? agentStore.list.find(a => a.id === agentId) : null;

            // lastMessagePreview may be string, object, or content blocks array
            const lastMessage = extractMessageText(s.lastMessagePreview);

            // Merge with existing local session to preserve local ID and message cache
            const existing = localByKey[sk];
            if (existing) {
              existing.agentName = agent?.name || s.displayName || existing.agentName;
              existing.agentEmoji = agent?.emoji || existing.agentEmoji;
              existing.title = s.derivedTitle || s.label || existing.title;
              existing.lastMessage = lastMessage || existing.lastMessage;
              existing.updatedAt = s.updatedAt || existing.updatedAt;
              existing._source = 'openclaw';
              delete localByKey[sk]; // mark as matched
              return existing;
            }

            return {
              id: s.sessionId || sk || generateId(),
              sessionKey: sk,
              agentId: agentId,
              agentName: agent?.name || s.displayName || agentId || 'Agent',
              agentEmoji: agent?.emoji || '🤖',
              title: s.derivedTitle || s.label || s.displayName || 'Conversation',
              lastMessage,
              updatedAt: s.updatedAt || Date.now(),
              unread: 0,
              _source: 'openclaw',
            };
          });

        sessionStore.list = merged;
        sessionStore._persist();
        Alpine.store('monitor').addLog('info', `Synced ${sessions.length} sessions from OpenClaw`);
      } catch (err) {
        console.warn('[Sync] Session sync failed:', err.message);
      }
    },

    _setupOpenClawEvents() {
      const oc = window.openclawClient;
      if (!oc) return;

      // Guard against double-registration after logout/login cycle.
      // The disconnect() in logout() closes the socket but the client
      // object persists — re-connecting re-registers handlers on the same
      // instance, causing duplicated event processing.
      if (oc._mcEventsRegistered) return;
      oc._mcEventsRegistered = true;

      // Wildcard listener — log ALL events from OpenClaw for diagnostics.
      // This helps debug missing chat events by showing exactly what OpenClaw sends.
      oc.on('*', (eventName, payload) => {
        // Skip noisy periodic events
        if (eventName === 'tick' || eventName === 'health') return;
        const summary = typeof payload === 'object'
          ? (payload.state ? `state=${payload.state}` : '') +
            (payload.sessionKey ? ` session=${payload.sessionKey}` : '') +
            (payload.errorMessage ? ` error=${payload.errorMessage}` : '') +
            (payload.runId ? ` run=${payload.runId}` : '')
          : '';
        Alpine.store('monitor').addLog('info', `Event[${eventName}]: ${summary || JSON.stringify(payload).slice(0, 120)}`);
      });

      // Agent turn events — surface errors from the agent turn itself (model call
      // failures, tool errors, etc.) that may not produce any 'chat' events.
      // Without this, a failed model call results in dead silence in the UI.
      oc.on('agent', (payload) => {
        const sessions = Alpine.store('sessions');
        // Check if the agent event carries an error state
        if (payload.state === 'error' || payload.error || payload.errorMessage) {
          const errMsg = payload.errorMessage || payload.error?.message || payload.error || 'Agent turn failed (no details)';
          Alpine.store('monitor').addLog('error', `Agent turn error: ${errMsg}`);
          // Surface the error in the chat UI if we're waiting for a response
          if (sessions._sending && sessions._streamingMsg) {
            sessions._streamingMsg.content = `Error: ${errMsg}`;
            sessions._streamingMsg.streaming = false;
            sessions._streamingMsg = null;
            sessions._sending = false;
            sessions._sendingSessionId = null;
            sessions._persistMessages();
          }
        }
      });

      // Chat streaming events — OpenClaw sends event name 'chat' with a 'state' field:
      // state: "delta" (streaming content), "final" (complete), "aborted", "error"
      // payload.message contains the content object, payload.errorMessage for errors
      oc.on('chat', (payload) => {
        const sessions = Alpine.store('sessions');
        const state = payload.state;

        // Bug #32579: Gateway broadcasts ALL chat events to ALL connected
        // WebSocket clients. Filter by sessionKey to only process events
        // for the active chat session (or events without a sessionKey for
        // backward compatibility).
        if (payload.sessionKey && sessions._activeSessionKey
            && payload.sessionKey !== sessions._activeSessionKey) {
          Alpine.store('monitor').addLog('info', `Chat event filtered: session=${payload.sessionKey} (active=${sessions._activeSessionKey})`);
          return; // Not for our active session — ignore
        }

        if (state === 'delta') {
          // Streaming content delta
          if (sessions._streamingMsg) {
            // Extract text from message — may be string, object, or content blocks array
            const delta = extractMessageText(payload.message) || extractMessageText(payload.content) || payload.delta || '';
            sessions._streamingMsg.content += delta;
            sessions._scrollToBottom();
          } else if (sessions._sending === false && sessions.messages.length > 0) {
            // Bug #28410: Model fallback UI freeze recovery.
            // When the primary model errors, we set _streamingMsg=null and _sending=false.
            // But LiteLLM may fallback to another provider, and OpenClaw sends new delta
            // events from the fallback model. Recover by creating a new streaming message.
            const lastMsg = sessions.messages[sessions.messages.length - 1];
            if (lastMsg?.role === 'agent') {
              // Strip the error prefix if the fallback is now succeeding
              if (lastMsg.content.startsWith('⚠️')) {
                lastMsg.content = '';
              }
              lastMsg.streaming = true;
              sessions._streamingMsg = lastMsg;
              sessions._sending = true;
              const delta = extractMessageText(payload.message) || extractMessageText(payload.content) || payload.delta || '';
              lastMsg.content += delta;
              sessions._scrollToBottom();
              Alpine.store('monitor').addLog('info', 'Model fallback detected — resuming stream from alternate provider');
            }
          }
          return;
        }

        if (state === 'final') {
          // Chat complete — handle both normal flow and late arrivals after timeout
          const streamMsg = sessions._streamingMsg;
          let producedContent = false;
          if (streamMsg) {
            // Strip processing indicator if present
            if (streamMsg.content === '⏳ Agent is processing (using tools)...') {
              streamMsg.content = '';
            }
            // If final message has content, append it
            if (payload.message) {
              const finalContent = extractMessageText(payload.message);
              if (finalContent && !streamMsg.content.endsWith(finalContent)) {
                streamMsg.content += finalContent;
              }
            }
            // If streaming produced no visible text (tool-use-only turn), remove the empty bubble
            if (!streamMsg.content.trim()) {
              sessions.messages = sessions.messages.filter(m => m !== streamMsg);
            } else {
              streamMsg.streaming = false;
              streamMsg.time = timeNow();
              producedContent = true;
            }
            sessions._streamingMsg = null;
          }
          sessions._sending = false;
          sessions._sendingSessionId = null;

          // Update session metadata
          const session = sessions.active;
          if (session) {
            const lastMsg = sessions.messages.filter(m => m.role === 'agent' && m.content?.trim()).pop();
            session.lastMessage = (lastMsg?.content || '').slice(0, 60);
            session.updatedAt = Date.now();
          }

          // Update agent stats + governance metrics — only count if THIS turn
          // produced visible content (not a previous message in the history).
          const agent = Alpine.store('agents').list.find(a => a.id === session?.agentId);
          if (agent && producedContent) {
            agent.tasksCompleted++;
            agent.lastActive = 'Just now';
            Alpine.store('agents')._persist();

            const tokens = Math.round(((streamMsg?.content || '').length) / 4);
            Alpine.store('governance').recordTask(agent.id, {
              success: true, tokens, taskType: 'chat-openclaw',
            });
          }

          mcAudio.chatComplete();

          // Check for governance self-tuning proposals from agents
          const lastMsgContent = sessions.messages[sessions.messages.length - 1]?.content || '';
          if (lastMsgContent.includes('GOVERNANCE_ADJUST:')) {
            try {
              const match = lastMsgContent.match(/GOVERNANCE_ADJUST:\s*(\{[\s\S]*?\})/);
              if (match) {
                const adjustment = JSON.parse(match[1]);
                const staging = Alpine.store('staging');
                if (staging) {
                  staging.items.push({
                    id: 'gov-' + Date.now(),
                    name: 'Governance Adjustment',
                    path: '',
                    type: 'config',
                    createdBy: session?.agentId || 'lead',
                    createdAt: Date.now(),
                    description: `Agent suggests: ${JSON.stringify(adjustment)}`,
                    status: 'pending',
                    previewUrl: '',
                    _data: adjustment,
                  });
                  Alpine.store('monitor').addLog('info',
                    'Agent proposed governance adjustment (pending approval in Staging)'
                  );
                }
              }
            } catch {}
          }

          sessions._persistMessages();
          sessions._persist();
          return;
        }

        if (state === 'error' || state === 'aborted') {
          // Chat error or aborted
          const rawErr = extractMessageText(payload.errorMessage) || extractMessageText(payload.message) || 'Unknown error';
          const isRateLimit = /rate.?limit|429|too many|quota/i.test(rawErr);

          // Auto-retry once on rate limit errors — LiteLLM's fallback chain
          // (Groq → Cerebras → DeepSeek) needs a fresh request to try the next provider.
          if (isRateLimit && !sessions._rateLimitRetried && sessions._streamingMsg) {
            sessions._rateLimitRetried = true;
            // Show retry message in the streaming bubble
            sessions._streamingMsg.content = '⏳ Rate limited — auto-retrying with fallback provider...';
            Alpine.store('monitor').addLog('info', 'Rate limit hit — auto-retrying in 3s via LiteLLM fallback chain');

            // Retry after 3s to let LiteLLM route to fallback provider
            setTimeout(async () => {
              try {
                const sk = sessions._activeSessionKey;
                if (sk && window.openclawClient?.authenticated) {
                  // Find the last user message to resend
                  const lastUserMsg = [...sessions.messages].reverse().find(m => m.role === 'user');
                  if (lastUserMsg) {
                    await window.openclawClient.sendChat(lastUserMsg.content, { sessionKey: sk });
                    // Response will arrive via streaming events
                    return;
                  }
                }
              } catch (retryErr) {
                Alpine.store('monitor').addLog('warn', `Rate limit retry failed: ${retryErr.message}`);
              }
              // If retry setup fails, show the error
              if (sessions._streamingMsg) {
                sessions._streamingMsg.content = '⚠️ Rate limit reached on all providers. Please try again in a minute.';
                sessions._streamingMsg.streaming = false;
                sessions._streamingMsg = null;
              }
              sessions._sending = false;
              sessions._sendingSessionId = null;
              sessions._persistMessages();
            }, 3000);
            return; // Don't mark as failed yet — retry is pending
          }

          if (sessions._streamingMsg) {
            let errText = rawErr;
            // Detect rate limit errors and show friendly message
            if (isRateLimit) {
              errText = 'Rate limit reached on all providers. Please try again in a minute.';
            }
            // Strip processing indicator before showing error
            let prior = sessions._streamingMsg.content.trim();
            if (prior === '⏳ Agent is processing (using tools)...' || prior === '⏳ Rate limited — auto-retrying with fallback provider...') prior = '';
            const prefix = prior ? '\n\n' : '';
            sessions._streamingMsg.content = prior + prefix + '⚠️ ' + errText;
            sessions._streamingMsg.streaming = false;
            sessions._streamingMsg = null;
          }
          // Reset retry flag for next message
          sessions._rateLimitRetried = false;
          sessions._sending = false;
          sessions._sendingSessionId = null;
          sessions._persistMessages();

          const session = sessions.active;
          const agent = Alpine.store('agents').list.find(a => a.id === session?.agentId);
          if (agent) {
            Alpine.store('governance').recordTask(agent.id, {
              success: false, taskType: 'chat-openclaw',
            });
          }

          Alpine.store('monitor').addLog('error', `Chat ${state}: ${payload.errorMessage || 'Unknown error'}`);
          return;
        }
      });

      // Connection state tracking — 'connected' fires on EVERY successful auth
      // (initial connect + reconnects), ensuring the status indicator stays in sync.
      oc.on('connected', () => {
        this.ocConnected = true;
        ocMode = 'connected';
      });

      oc.on('disconnect', (payload) => {
        const msg = payload.code ? `OpenClaw WS disconnected (code: ${payload.code})` : 'OpenClaw WS disconnected';
        Alpine.store('monitor').addLog('warn', msg);
        this.ocConnected = false;
        ocMode = 'fallback';
      });

      oc.on('reconnect', () => {
        Alpine.store('monitor').addLog('info', 'OpenClaw WebSocket reconnected — agents are live');
        this.ocConnected = true;
        ocMode = 'connected';
        this._syncAgentsFromOpenClaw();
        this._syncSessionsFromOpenClaw();
        Alpine.store('cron').fetch();
      });
    },

    _applyHealth(health) {
      this.connected = health.litellm;
      // ocConnected reflects actual WebSocket auth state, not just HTTP health
      this.ocConnected = window.openclawClient?.authenticated || false;
      this.demoMode = !health.litellm;

      const monitor = Alpine.store('monitor');
      monitor.systemHealth.litellm = health.litellm ? 'healthy' : 'offline';
      monitor.systemHealth.openclaw = health.openclaw ? 'healthy' : 'offline';

      // Auto-connect WS when OpenClaw HTTP is healthy but WS isn't connected.
      // This handles the post-deploy case where OpenClaw wasn't ready at boot.
      // reconnect() has its own _reconnecting guard so this is safe to call.
      if (health.openclaw && !this.ocConnected && !this._reconnecting) {
        const pw = window.openclawClient?._password
          || (() => { try { return sessionStorage.getItem('mc-oc-pw') || ''; } catch { return ''; } })();
        if (pw) {
          this.reconnect();
        }
      }
    },

    async reconnect() {
      // Guard against concurrent reconnect calls (health poller + user tap + auto-retry)
      if (this._reconnecting) return;
      this._reconnecting = true;

      try {
        Alpine.store('monitor').addLog('info', 'Running health checks...');
        const health = await healthChecker.check();
        // Update health state directly (NOT via _applyHealth to avoid re-entrancy)
        this.connected = health.litellm;
        this.demoMode = !health.litellm;
        const monitor = Alpine.store('monitor');
        monitor.systemHealth.litellm = health.litellm ? 'healthy' : 'offline';
        monitor.systemHealth.openclaw = health.openclaw ? 'healthy' : 'offline';

        if (health.litellm) {
          monitor.addLog('info', 'LiteLLM connected — chat is live');
          const models = await litellmApi.fetchModels();
          if (models.length > 0) {
            Alpine.store('models').list = models;
            monitor.systemHealth.modelsAvailable = models.length;
          }
        } else {
          monitor.addLog('warn', 'LiteLLM unreachable — staying in demo mode');
        }

        if (health.openclaw) {
          monitor.addLog('info', 'OpenClaw is online');
          // Attempt WebSocket reconnect if not already connected
          if (ocMode !== 'connected' && window.openclawClient && !window.openclawClient.authenticated) {
            try {
              const pw = window.openclawClient._password
                || (() => { try { return sessionStorage.getItem('mc-oc-pw') || ''; } catch { return ''; } })();
              if (pw) {
                await window.openclawClient.connect(pw, { maxRetries: 1 });
                ocMode = 'connected';
                this.ocConnected = true;
                monitor.addLog('info', 'OpenClaw WebSocket reconnected — agents are live');
                await this._syncAgentsFromOpenClaw();
                await this._syncSessionsFromOpenClaw();
                this._setupOpenClawEvents();
              } else {
                monitor.addLog('warn', 'No password for OpenClaw reconnect — re-login required');
              }
            } catch (err) {
              monitor.addLog('warn', `OpenClaw WS: ${err.message}`);
            }
          }
        }
        // Update ocConnected based on actual auth state after attempt
        this.ocConnected = window.openclawClient?.authenticated || false;
      } finally {
        this._reconnecting = false;
      }
    },
  });

  // --------------------------------------------------------------------------
  // STORE: MODELS (dynamic from LiteLLM)
  // --------------------------------------------------------------------------

  Alpine.store('models', {
    list: [...FALLBACK_MODELS],
  });

  // --------------------------------------------------------------------------
  // STORE: AGENTS
  // --------------------------------------------------------------------------

  Alpine.store('agents', {
    list: storage.load('agents', [...DEMO_AGENTS]),
    synced: false, // true after OpenClaw live agents replace local cache
    selected: null,
    wizardOpen: false,
    wizardStep: 1,
    wizard: {
      name: '', emoji: '🤖', description: '',
      model: 'litellm/groq-qwen3-32b', systemPrompt: '', tools: [],
    },

    // Count agents with active cron jobs (replaces old running/idle UI-only toggle)
    get scheduled() {
      const cronStore = Alpine.store('cron');
      return this.list.filter(a => cronStore.countForAgent(a.id) > 0).length;
    },
    get running() { return this.scheduled; }, // backward compat for status bar
    get idle() { return this.list.length - this.scheduled; },

    _persist() { storage.save('agents', this.list); },

    openWizard() {
      this.wizard = {
        name: '', emoji: '🤖', description: '',
        model: 'litellm/groq-qwen3-32b', systemPrompt: '', tools: [],
      };
      this.wizardStep = 1;
      this.wizardOpen = true;
    },

    closeWizard() { this.wizardOpen = false; },
    nextStep() { if (this.wizardStep < 4) this.wizardStep++; },
    prevStep() { if (this.wizardStep > 1) this.wizardStep--; },

    toggleTool(toolId) {
      const idx = this.wizard.tools.indexOf(toolId);
      if (idx >= 0) this.wizard.tools.splice(idx, 1);
      else this.wizard.tools.push(toolId);
    },

    async createAgent() {
      const w = this.wizard;
      if (!w.name.trim()) return;

      const agentId = w.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const agent = {
        id: agentId || generateId(),
        name: w.name.trim(),
        emoji: w.emoji,
        description: w.description.trim(),
        model: w.model,
        systemPrompt: w.systemPrompt,
        tools: [...w.tools],
        status: 'idle',
        currentTask: null,
        lastActive: 'Just now',
        tasksCompleted: 0,
        tokensUsed: 0,
      };

      // If connected to OpenClaw, create agent on the server
      if (ocMode === 'connected' && window.openclawClient?.authenticated) {
        try {
          await window.openclawClient.addAgent({
            id: agent.id,
            workspace: agent.name,
            model: { primary: agent.model },
            identity: {
              name: agent.name,
              emoji: agent.emoji,
              description: agent.description,
            },
            tools: agent.tools.length > 0 ? { allow: agent.tools } : undefined,
          });
          agent._source = 'openclaw';
          Alpine.store('monitor').addLog('info', `Agent "${agent.name}" created on OpenClaw server`);
        } catch (err) {
          Alpine.store('monitor').addLog('warn', `OpenClaw create failed: ${err.message} — saving locally`);
        }
      }

      this.list.push(agent);
      this._persist();
      this.closeWizard();
      Alpine.store('monitor').addLog('info', `Agent "${agent.name}" created with model ${agent.model}`);
    },

    selectAgent(id) {
      this.selected = this.list.find(a => a.id === id) || null;
    },

    async deleteAgent(id) {
      // Delete from OpenClaw server if connected
      if (ocMode === 'connected' && window.openclawClient?.authenticated) {
        try {
          await window.openclawClient.deleteAgent(id);
          Alpine.store('monitor').addLog('info', 'Agent removed from OpenClaw server');
        } catch (err) {
          Alpine.store('monitor').addLog('warn', `OpenClaw delete failed: ${err.message}`);
        }
      }

      this.list = this.list.filter(a => a.id !== id);
      if (this.selected && this.selected.id === id) this.selected = null;
      this._persist();
      Alpine.store('monitor').addLog('info', 'Agent removed');
    },

    toggleAgent(id) {
      // Legacy method — now opens the cron popover for this agent
      Alpine.store('cron').toggle(id);
    },
  });

  // --------------------------------------------------------------------------
  // STORE: SESSIONS (Chat with real LiteLLM streaming)
  // --------------------------------------------------------------------------

  Alpine.store('sessions', {
    list: storage.load('sessions', []),
    activeId: null,
    messages: [],
    input: '',
    _sending: false, // prevents double-send
    _sendingSessionId: null, // which session is waiting for a response
    _streamingMsg: null, // current streaming message (for OpenClaw events)
    _messageStore: {}, // sessionId -> messages[]
    _deletedKeys: new Set(), // sessionKeys deleted by user — prevents sync from re-adding them

    get active() {
      return this.list.find(s => s.id === this.activeId) || null;
    },

    async select(id) {
      this.activeId = id;

      // Set _activeSessionKey so incoming chat events are routed to this session
      // even before the user sends a message (e.g. late-arriving events from
      // background cron runs or previous tool-use turns).
      const sel = this.list.find(s => s.id === id);
      if (sel?.sessionKey) {
        this._activeSessionKey = sel.sessionKey;
      }

      // Check in-memory cache first
      if (this._messageStore[id] && this._messageStore[id].length > 0) {
        this.messages = this._messageStore[id];
        return;
      }

      // Try loading from OpenClaw server
      if (ocMode === 'connected' && window.openclawClient?.authenticated) {
        try {
          const session = this.list.find(s => s.id === id);
          const historyKey = session?.sessionKey || id;
          const history = await window.openclawClient.getHistory(historyKey);
          if (history && history.length > 0) {
            this.messages = history
              .map(m => {
                const content = extractMessageText(m.content);
                let role = m.role === 'assistant' ? 'agent' : m.role;
                // Detect cron/heartbeat-injected messages that appear as "user"
                // but are actually system injections (e.g. "Read HEARTBEAT.md",
                // "EXECUTE_WORKFLOW:", systemEvent payloads from cron jobs).
                const isSystemInjection = role === 'user' && (
                  /^Read HEARTBEAT/i.test(content) ||
                  /^HEARTBEAT/i.test(content) ||
                  /^EXECUTE_WORKFLOW:/i.test(content) ||
                  /^Current time:/i.test(content) ||
                  (m.label && /heartbeat|cron|system/i.test(m.label))
                );
                if (isSystemInjection) role = 'system';
                return {
                  id: m.id || generateId(),
                  role,
                  content,
                  time: m.time || m.timestamp || '',
                };
              })
              // Filter out empty messages and system injections (heartbeat/cron)
              .filter(m => m.role !== 'system' && (m.role === 'user' || m.content.trim()));
            this._messageStore[id] = this.messages;
            Alpine.store('monitor').addLog('info', `Loaded ${history.length} messages from OpenClaw`);
            return;
          }
        } catch (err) {
          console.warn('[Sessions] OpenClaw history load failed:', err.message);
        }
      }

      // Fallback: load from localStorage
      this.messages = this._loadMessages(id);
      this._messageStore[id] = this.messages;
    },

    createSession(agentId, forceNew) {
      const agent = Alpine.store('agents').list.find(a => a.id === agentId);
      if (!agent) return;

      // OpenClaw session key format: "agent:<agentId>:main" for webchat DMs.
      // One persistent conversation per agent (OpenClaw model).
      const sessionKey = 'agent:' + agentId + ':main';

      // Clear deletion tracking — user is intentionally re-engaging with this agent
      this._deletedKeys.delete(sessionKey);

      // If a session exists: select it, or reset for a fresh start
      const existing = this.list.find(s => s.sessionKey === sessionKey);
      if (existing) {
        if (forceNew) {
          // Reset server-side session for a fresh conversation
          if (window.openclawClient?.authenticated) {
            window.openclawClient.resetSession(sessionKey, 'User started new conversation').catch(e => {
              console.warn('[Sessions] Server reset failed:', e.message);
            });
          }
          // Clear local messages
          this.messages = [];
          this._messageStore[existing.id] = [];
          existing.lastMessage = '';
          existing.title = 'New conversation';
          existing.updatedAt = Date.now();
          this.activeId = existing.id;
          this._persist();
          Alpine.store('app').setView('chat');
          Alpine.store('monitor').addLog('info', `Reset conversation with ${agent.name}`);
          return;
        }
        this.activeId = existing.id;
        this.select(existing.id);
        Alpine.store('app').setView('chat');
        return;
      }

      const session = {
        id: generateId(),
        sessionKey,
        agentId: agent.id,
        agentName: agent.name,
        agentEmoji: agent.emoji,
        title: 'New conversation',
        lastMessage: '',
        updatedAt: Date.now(),
        unread: 0,
      };
      this.list.unshift(session);
      this.activeId = session.id;
      this.messages = [];
      this._messageStore[session.id] = this.messages;
      this._persist();
      Alpine.store('app').setView('chat');
    },

    async deleteSession(sessionId) {
      const session = this.list.find(s => s.id === sessionId);
      if (!session) return;

      // Track deleted session key so _syncSessionsFromOpenClaw doesn't re-add it.
      // OpenClaw canonical sessions (agent:X:main) persist on the server even after
      // sessions.delete — the next sync would bring them right back.
      if (session.sessionKey) {
        this._deletedKeys.add(session.sessionKey);
      }

      // Reset on OpenClaw server (clears conversation history).
      // Use sessions.reset instead of sessions.delete — canonical sessions
      // like "agent:lead:main" auto-recreate after delete, but reset clears them.
      if (session.sessionKey && window.openclawClient?.authenticated) {
        try {
          await window.openclawClient.request('sessions.reset', {
            key: session.sessionKey,
            reason: 'User deleted conversation from Mission Control',
          });
        } catch (e) {
          // Fallback to delete if reset not available
          try {
            await window.openclawClient.deleteSession(session.sessionKey);
          } catch (e2) {
            console.warn('[Sessions] Server delete failed:', e2.message);
          }
        }
      }

      // Remove from local state
      this.list = this.list.filter(s => s.id !== sessionId);
      delete this._messageStore[sessionId];
      storage.remove('msgs-' + sessionId);

      // If this was the active session, clear it
      if (this.activeId === sessionId) {
        this.activeId = this.list[0]?.id || null;
        this.messages = this.activeId ? (this._messageStore[this.activeId] || []) : [];
      }
      this._persist();
      Alpine.store('monitor').addLog('info', `Deleted conversation with ${session.agentName}`);
    },

    async sendMessage() {
      const text = this.input.trim();
      if (!text || !this.activeId) return;
      // Only block if we're waiting for a response in THIS session
      if (this._sending && this._sendingSessionId === this.activeId) return;

      // Reset rate-limit retry flag for new user-initiated messages
      this._rateLimitRetried = false;

      // Add user message
      const userMsg = { id: generateId(), role: 'user', content: text, time: timeNow() };
      this.messages.push(userMsg);
      this.input = '';

      // Update session metadata
      const session = this.active;
      if (session) {
        session.lastMessage = text.slice(0, 60);
        session.updatedAt = Date.now();
        // Auto-set title from first message
        if (session.title === 'New conversation') {
          session.title = text.slice(0, 40) + (text.length > 40 ? '...' : '');
        }
      }

      // Scroll to bottom
      this._scrollToBottom();

      // Add placeholder for streaming response
      const botMsg = { id: generateId(), role: 'agent', content: '', time: timeNow(), streaming: true };
      this.messages.push(botMsg);
      this._sending = true;
      this._sendingSessionId = this.activeId;

      // Route 1: OpenClaw WebSocket (real agent execution with tools, memory, etc.)
      if (ocMode === 'connected' && window.openclawClient?.authenticated) {
        this._streamingMsg = botMsg;
        try {
          const agent = Alpine.store('agents').list.find(a => a.id === session?.agentId);

          // Server-side SOUL.md handles the full system prompt for OpenClaw WS.
          // Only inject dynamic tier context on the first message when governance is active.
          let messageText = text;
          const gov = Alpine.store('governance');
          if (!gov?.paused) {
            const priorUserMsgs = this.messages.filter(m => m.role === 'user');
            if (priorUserMsgs.length <= 1 && agent && gov) {
              const tierCtx = `[STATUS] Tier: ${gov.getTierName(agent.id)} (${gov._getMetrics(agent.id).tier}/3) | Score: ${gov.getScore(agent.id)} | Week ${gov.week.number}, ${gov.getWeekDaysRemaining()} days left | Tasks: ${gov._getMetrics(agent.id).weeklyTasks}`;
              messageText = `${tierCtx}\n\n${text}`;
            }
          }

          // Session key: use server-synced key, or derive from agent ID
          const sessionKey = session?.sessionKey || (agent?.id ? 'agent:' + agent.id + ':main' : 'agent:lead:main');
          // Store sessionKey back on session if it was missing
          if (session && !session.sessionKey) session.sessionKey = sessionKey;
          // Track active session key for event filtering (Bug #32579:
          // gateway broadcasts ALL chat events to ALL clients)
          this._activeSessionKey = sessionKey;

          const sendResult = await window.openclawClient.sendChat(messageText, { sessionKey });
          Alpine.store('monitor').addLog('info', `chat.send accepted (session=${sessionKey}, runId=${sendResult?.runId || 'n/a'})`);
          // Response will arrive via events (chat.delta, chat.complete)
          // handled by _setupOpenClawEvents in the app store

          // Safety timeout: agents using tools (exec, web_fetch, etc.) can take
          // 2+ minutes. Show a "still processing" indicator after 15s, but keep
          // _streamingMsg alive for 120s so late responses aren't silently dropped.
          const _processingTimer = setTimeout(() => {
            if (this._sending && this._streamingMsg === botMsg && !botMsg.content.trim()) {
              botMsg.content = '⏳ Agent is processing (using tools)...';
              this._scrollToBottom();
            }
          }, 15000);
          const _safetyTimer = setTimeout(() => {
            if (this._sending && this._streamingMsg === botMsg) {
              const hadContent = botMsg.content.trim() && botMsg.content !== '⏳ Agent is processing (using tools)...';
              // Only give up after 120s — replace processing indicator with timeout
              botMsg.content = botMsg.content === '⏳ Agent is processing (using tools)...'
                ? '(No response after 2 minutes — agent may be stuck. Try sending again or check Monitor.)'
                : botMsg.content || '(No response after 2 minutes — check Monitor for details.)';
              botMsg.streaming = false;
              this._streamingMsg = null;
              this._sending = false;
              this._sendingSessionId = null;
              this._persistMessages();
              Alpine.store('monitor').addLog('warn',
                hadContent ? 'Chat response timed out after 120s (partial content received)'
                  : 'Chat response timed out after 120s — no chat events received. Agent may be busy with a cron/heartbeat job or crashed during processing.'
              );
            }
            clearTimeout(_processingTimer);
          }, 120000);
        } catch (e) {
          botMsg.content = 'Error: ' + e.message;
          botMsg.streaming = false;
          this._streamingMsg = null;
          this._sending = false;
          this._sendingSessionId = null;
          Alpine.store('monitor').addLog('error', `OpenClaw chat error: ${e.message}`);
        }
        return;
      }

      // Route 2: Direct LiteLLM streaming (fallback when OpenClaw WS unavailable)
      if (!Alpine.store('app').demoMode) {
        const agent = Alpine.store('agents').list.find(a => a.id === session?.agentId);
        // Strip provider prefix — LiteLLM expects bare aliases (e.g. groq-llama-3.3-70b)
        const rawModel = agent?.model || 'litellm/groq-qwen3-32b';
        const model = rawModel.replace(/^litellm\//, '');

        const gov = Alpine.store('governance');

        const apiMessages = [];
        if (agent?.systemPrompt) {
          // Inject dynamic tier context into system prompt only when governance is active
          let tierCtx = '';
          if (!gov?.paused) {
            const agentTier = gov._getMetrics(agent?.id)?.tier ?? 1;
            tierCtx = `\n\n[CURRENT STATUS] Tier: ${gov.getTierName(agent.id)} (${agentTier}/3) | Score: ${gov.getScore(agent.id)} | Week ${gov.week.number}, ${gov.getWeekDaysRemaining()} days left | Weekly tasks: ${gov._getMetrics(agent.id).weeklyTasks}`;
          }
          apiMessages.push({ role: 'system', content: agent.systemPrompt + tierCtx });
        }
        for (const msg of this.messages) {
          apiMessages.push({
            role: msg.role === 'agent' ? 'assistant' : msg.role,
            content: msg.content,
          });
        }

        try {
          for await (const delta of litellmApi.streamChat(model, apiMessages)) {
            botMsg.content += delta;
            this._scrollToBottom();
          }
        } catch (e) {
          botMsg.content = botMsg.content || ('Error: ' + e.message);
          Alpine.store('monitor').addLog('error', `Chat error: ${e.message}`);
        }

        botMsg.streaming = false;
        botMsg.time = timeNow();
        this._sending = false;

        if (session) {
          session.lastMessage = (botMsg.content || '').slice(0, 60);
          session.updatedAt = Date.now();
        }

        if (agent) {
          const tokens = Math.round((text.length + botMsg.content.length) / 4);
          agent.tokensUsed += tokens;
          agent.lastActive = 'Just now';

          // Only count as completed if the response has real content (not an error)
          const isError = botMsg.content.startsWith('Error:');
          if (!isError) {
            agent.tasksCompleted++;
            mcAudio.chatComplete();
          } else {
            mcAudio.taskFail();
          }
          Alpine.store('agents')._persist();

          Alpine.store('governance').recordTask(agent.id, {
            success: !isError, tokens, taskType: 'chat-litellm',
          });
        }

        this._persist();
        this._persistMessages();
        this._scrollToBottom();
        return;
      }

      // Route 3: Demo mode (no backend available)
      setTimeout(() => {
        botMsg.content = 'Mission Control is in demo mode — connect to OpenClaw or LiteLLM for real AI responses. Click "Reconnect" in the header.';
        botMsg.streaming = false;
        botMsg.time = timeNow();
        this._sending = false;
        this._persistMessages();
        this._scrollToBottom();
      }, 500);
    },

    _scrollToBottom() {
      setTimeout(() => {
        const el = document.getElementById('chat-messages');
        if (el) el.scrollTop = el.scrollHeight;
      }, 30);
    },

    _persist() {
      storage.save('sessions', this.list.map(s => ({
        id: s.id, sessionKey: s.sessionKey, agentId: s.agentId, agentName: s.agentName,
        agentEmoji: s.agentEmoji, title: s.title,
        lastMessage: s.lastMessage, updatedAt: s.updatedAt, unread: 0,
      })));
    },

    _persistMessages() {
      if (!this.activeId || !this.messages) return;
      this._messageStore[this.activeId] = this.messages;
      // Save non-streaming messages to localStorage (capped at 100 per session)
      const toSave = this.messages
        .filter(m => !m.streaming)
        .slice(-100)
        .map(m => ({ id: m.id, role: m.role, content: m.content, time: m.time }));
      storage.save('msgs-' + this.activeId, toSave);
    },

    _loadMessages(sessionId) {
      const saved = storage.load('msgs-' + sessionId, []);
      return saved.map(m => ({
        id: m.id || generateId(),
        role: m.role || 'user',
        content: m.content || '',
        time: m.time || '',
      }));
    },
  });

  // --------------------------------------------------------------------------
  // STORE: WORKFLOWS
  // --------------------------------------------------------------------------

  Alpine.store('workflows', {
    list: storage.load('workflows', []),
    activeId: null,
    running: false,
    _autoSaveTimer: null,
    _lastSerialized: null,

    get active() {
      return this.list.find(w => w.id === this.activeId) || null;
    },

    // Start auto-save polling (LiteGraph has no onChange callback)
    setupAutoSave() {
      if (this._autoSaveTimer) clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = setInterval(() => {
        if (this.activeId && window.workflowGraph) this._autoSave();
      }, 5000);
    },

    _autoSave() {
      if (!this.activeId || !window.workflowGraph) return;
      const data = JSON.stringify(window.workflowGraph.serialize());
      if (data !== this._lastSerialized) {
        this._lastSerialized = data;
        localStorage.setItem('mc-workflow-' + this.activeId, data);
        const wf = this.active;
        if (wf) {
          wf.nodes = window.workflowGraph._nodes?.length || 0;
          wf.updatedAt = Date.now();
        }
        this._persistList();
      }
    },

    create(name) {
      if (!name) return null;
      const wf = {
        id: generateId(),
        name: name,
        nodes: 0,
        lastRun: 'Never',
        status: 'draft',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: 'user',
      };
      this.list.unshift(wf);
      this._persistList();

      // Clear current graph and load default template
      this.activeId = wf.id;
      if (window.workflowGraph) {
        window.workflowGraph.clear();
        if (window.addDefaultWorkflow) addDefaultWorkflow(window.workflowGraph);
      }
      this.save();
      this.setupAutoSave();
      Alpine.store('monitor').addLog('info', `Workflow "${wf.name}" created`);
      return wf;
    },

    save() {
      if (!this.activeId || !window.workflowGraph) return;
      const data = JSON.stringify(window.workflowGraph.serialize());
      this._lastSerialized = data;
      localStorage.setItem('mc-workflow-' + this.activeId, data);
      const wf = this.active;
      if (wf) {
        wf.nodes = window.workflowGraph._nodes?.length || 0;
        wf.updatedAt = Date.now();
      }
      this._persistList();
      Alpine.store('monitor').addLog('info', 'Workflow saved');

      // Auto-sync to shared volume so other devices and agents can see it
      if (window.workflowBridge) {
        window.workflowBridge.syncWorkflow(this.activeId);
      }
    },

    load(id) {
      // Auto-save current workflow before switching
      if (this.activeId && this.activeId !== id) this._autoSave();

      this.activeId = id;
      const data = localStorage.getItem('mc-workflow-' + id);
      if (data && window.workflowGraph) {
        try {
          window.workflowGraph.configure(JSON.parse(data));
          this._lastSerialized = data;
        } catch (e) {
          Alpine.store('monitor').addLog('error', `Failed to load workflow: ${e.message}`);
        }
      } else if (window.workflowGraph) {
        window.workflowGraph.clear();
        this._lastSerialized = null;
      }
      this.setupAutoSave();
    },

    rename(id, newName) {
      if (!newName) return;
      const wf = this.list.find(w => w.id === id);
      if (wf) {
        wf.name = newName;
        wf.updatedAt = Date.now();
        this._persistList();
      }
    },

    delete(id) {
      this.list = this.list.filter(w => w.id !== id);
      localStorage.removeItem('mc-workflow-' + id);
      if (this.activeId === id) {
        this.activeId = null;
        this._lastSerialized = null;
        if (window.workflowGraph) window.workflowGraph.clear();
      }
      this._persistList();
      Alpine.store('monitor').addLog('info', 'Workflow deleted');
    },

    duplicate(id) {
      const source = this.list.find(w => w.id === id);
      if (!source) return null;
      const newId = generateId();
      const newWf = {
        ...JSON.parse(JSON.stringify(source)),
        id: newId,
        name: source.name + ' (copy)',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const graphData = localStorage.getItem('mc-workflow-' + id);
      if (graphData) localStorage.setItem('mc-workflow-' + newId, graphData);
      this.list.unshift(newWf);
      this._persistList();
      Alpine.store('monitor').addLog('info', `Duplicated workflow "${source.name}"`);
      return newWf;
    },

    // Export workflow as JSON (used by agent bridge)
    exportJSON(id) {
      const wf = this.list.find(w => w.id === id);
      const graphData = localStorage.getItem('mc-workflow-' + id);
      if (!wf) return null;
      return {
        meta: { ...wf },
        graph: graphData ? JSON.parse(graphData) : null,
      };
    },

    // Import workflow from JSON (used by agent bridge)
    importJSON(json) {
      if (!json?.meta?.id || !json?.graph) return null;
      const wf = {
        id: json.meta.id,
        name: json.meta.name || 'Agent Workflow',
        nodes: json.meta.nodes || json.graph.nodes?.length || 0,
        lastRun: json.meta.lastRun || 'Never',
        status: json.meta.status || 'draft',
        createdAt: json.meta.createdAt || Date.now(),
        updatedAt: json.meta.updatedAt || Date.now(),
        createdBy: json.meta.createdBy || 'agent',
      };
      // Update existing or add new
      const idx = this.list.findIndex(w => w.id === wf.id);
      if (idx >= 0) {
        this.list[idx] = wf;
      } else {
        this.list.unshift(wf);
      }
      localStorage.setItem('mc-workflow-' + wf.id, JSON.stringify(json.graph));
      this._persistList();
      return wf;
    },

    async run() {
      if (!this.activeId || this.running) return;
      if (window.workflowGraph && window.WorkflowExecutor) {
        const executor = new WorkflowExecutor(window.workflowGraph);
        await executor.execute();
      } else {
        this.running = true;
        Alpine.store('monitor').addLog('info', `Workflow "${this.active?.name}" executing...`);
        setTimeout(() => {
          this.running = false;
          const wf = this.active;
          if (wf) { wf.lastRun = 'Just now'; wf.status = 'completed'; }
          Alpine.store('monitor').addLog('info', 'Workflow completed (demo mode)');
        }, 2000);
      }
    },

    // Send workflow to OpenClaw for background execution (server-side, survives browser close)
    async runInBackground() {
      if (!this.activeId || this.running) return;
      if (!window.openclawClient?.authenticated) {
        Alpine.store('monitor').addLog('warn', 'Background run requires OpenClaw connection');
        return;
      }
      const wf = this.active;
      if (!wf) return;
      const graphData = localStorage.getItem('mc-workflow-' + this.activeId);
      if (!graphData) return;

      try {
        // Route to the appropriate team lead based on first agent node in the workflow
        let targetAgent = 'lead';
        try {
          const graph = JSON.parse(graphData);
          const agentNode = (graph.nodes || []).find(n => n.type === 'mission/agent');
          if (agentNode?.properties?.agent) {
            const a = agentNode.properties.agent;
            if (['ops-lead', 'builder', 'sentinel', 'chronicler'].includes(a)) targetAgent = 'ops-lead';
          }
        } catch (e) { /* parse error — use default lead */ }

        await window.openclawClient.sendChat(
          `EXECUTE_WORKFLOW:${this.activeId}\nWorkflow: ${wf.name}\n${graphData}`,
          { sessionKey: 'agent:' + targetAgent + ':main' }
        );
        wf.status = 'running-bg';
        wf.lastRun = 'Background';
        this._persistList();
        Alpine.store('monitor').addLog('info', `Workflow "${wf.name}" sent to OpenClaw for background execution`);
      } catch (e) {
        Alpine.store('monitor').addLog('error', `Background run failed: ${e.message}`);
      }
    },

    _persistList() {
      storage.save('workflows', this.list.map(w => ({
        id: w.id, name: w.name, nodes: w.nodes,
        lastRun: w.lastRun, status: w.status,
        createdAt: w.createdAt, updatedAt: w.updatedAt,
        createdBy: w.createdBy,
      })));
    },
  });

  // --------------------------------------------------------------------------
  // STORE: MONITOR
  // --------------------------------------------------------------------------

  Alpine.store('monitor', {
    logs: [...DEMO_LOGS],
    logFilter: 'all',
    tokenUsage: {},
    systemHealth: {
      openclaw: 'checking...',
      litellm: 'checking...',
      modelsAvailable: 0,
      uptime: '--',
    },

    get filteredLogs() {
      if (this.logFilter === 'all') return this.logs;
      return this.logs.filter(l => l.level === this.logFilter);
    },

    get totalTokens() {
      return Object.values(this.tokenUsage).reduce((sum, m) => sum + m.input + m.output, 0);
    },

    get totalCost() {
      return Object.values(this.tokenUsage).reduce((sum, m) => sum + m.cost, 0);
    },

    addLog(level, msg) {
      const time = new Date().toTimeString().slice(0, 8);
      this.logs.unshift({ time, level, msg });
      if (this.logs.length > 200) this.logs.pop();
      if (level === 'error') mcAudio.error();
    },

    maxUsage() {
      const vals = Object.values(this.tokenUsage).map(m => m.input + m.output);
      return Math.max(...vals, 1);
    },
  });

  // --------------------------------------------------------------------------
  // STORE: GOVERNANCE — team performance tracking & lead promotion
  // --------------------------------------------------------------------------

  Alpine.store('governance', {
    // PAUSED: Disable automatic tier changes, lead promotions, and weekly evaluations.
    // Raw stats (tasks completed/failed) still tracked for display.
    // Re-enable when P2P agent communication and autonomous tasks are working.
    paused: true,

    // Per-agent performance metrics (persisted to localStorage, synced to volume)
    metrics: storage.load('governance-metrics', {}),

    // Weekly evaluation cycle (replaces quarterly — agents iterate fast)
    week: storage.load('governance-week', {
      startDate: Date.now(),
      number: 1,
      evaluations: [],   // past week snapshots
    }),

    // Tier names and config
    TIER_NAMES: ['Probation', 'Active', 'Proven', 'Elite'],
    TIER_COLORS: ['red', 'gray', 'cyan', 'amber'],
    // What each tier unlocks — all models available at every tier, storage spread across EC2
    TIER_PERKS: {
      0: { workspace: '50 MB', tools: 'basic', autonomy: 'supervised', oracle: false, desc: 'Supervised. 5 consecutive successes to escape.' },
      1: { workspace: '200 MB', tools: 'standard', autonomy: 'standard', oracle: false, desc: 'Default tier. Standard workspace + full model access.' },
      2: { workspace: '500 MB', tools: 'standard + priority routing', autonomy: 'semi-autonomous', oracle: false, desc: 'Expanded workspace. Can run longer tasks autonomously.' },
      3: { workspace: 'Oracle ARM 24 GB', tools: 'full suite + background jobs', autonomy: 'fully autonomous', oracle: true, desc: 'Dedicated Oracle Cloud ARM server. Full autonomy. Can onboard team.' },
    },

    init() {
      // Try to merge governance from shared volume (enables cross-device sync)
      fetch('/workspace/mc-state/governance.json', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data?.agents) return;
          // Merge: take the version with more tasks completed for each agent
          for (const [agentId, serverScore] of Object.entries(data.agents)) {
            const local = this.metrics[agentId];
            const serverTotal = (serverScore.tasksCompleted || 0) + (serverScore.tasksFailed || 0);
            const localTotal = local ? (local.tasksCompleted + local.tasksFailed) : 0;
            if (serverTotal > localTotal) {
              this.metrics[agentId] = serverScore;
            }
          }
          storage.save('governance-metrics', this.metrics);
        })
        .catch(() => {}); // volume file may not exist yet

      // Check if a weekly evaluation is due
      this._checkWeeklyEvaluation();
    },

    // Team definitions: agents grouped into teams with a designated lead
    teams: storage.load('governance-teams', [
      {
        id: 'core',
        name: 'Core Team',
        lead: 'lead',
        members: ['lead', 'codecraft', 'scout', 'scribe'],
        project: 'General tasks and site development',
      },
      {
        id: 'platform',
        name: 'Platform Team',
        lead: 'ops-lead',
        members: ['ops-lead', 'builder', 'sentinel', 'chronicler'],
        project: 'Infrastructure, deployments, monitoring, and reliability',
      },
    ]),

    // Get or initialize metrics for an agent
    _getMetrics(agentId) {
      if (!this.metrics[agentId]) {
        this.metrics[agentId] = {
          tasksCompleted: 0,
          tasksFailed: 0,
          totalTokens: 0,
          totalResponseTimeMs: 0,
          avgResponseTimeMs: 0,
          avgTokensPerTask: 0,
          successRate: 100,
          qualityScore: 50,   // 0-100, starts neutral
          streakCount: 0,     // consecutive successes
          bestStreak: 0,
          lastTaskTime: null,
          promotions: 0,      // times promoted to lead
          demotions: 0,       // times demoted from lead
          history: [],        // last 20 task outcomes
          // Tier system (0=Probation, 1=Active, 2=Proven, 3=Elite)
          tier: 1,
          tierHistory: [],    // [{time, from, to, reason}]
          // Weekly cycle tracking
          weeklyTasks: 0,
          weeklyFailed: 0,
          weeklyStagingApprovals: 0,
          weeklyStagingRejections: 0,
          weeklyPeerTasks: 0,  // tasks delegated by peers, completed successfully
          weeklyChampion: false,
        };
      }
      // Backfill tier fields for existing agents (migration from pre-tier data)
      const m = this.metrics[agentId];
      if (m.tier === undefined) m.tier = 1;
      if (!m.tierHistory) m.tierHistory = [];
      if (m.weeklyTasks === undefined) m.weeklyTasks = 0;
      if (m.weeklyFailed === undefined) m.weeklyFailed = 0;
      if (m.weeklyStagingApprovals === undefined) m.weeklyStagingApprovals = 0;
      if (m.weeklyStagingRejections === undefined) m.weeklyStagingRejections = 0;
      if (m.weeklyPeerTasks === undefined) m.weeklyPeerTasks = 0;
      if (m.weeklyChampion === undefined) m.weeklyChampion = false;
      return m;
    },

    // Record a completed task
    recordTask(agentId, { success = true, tokens = 0, responseTimeMs = 0, taskType = 'chat', delegatedBy = null } = {}) {
      const m = this._getMetrics(agentId);

      if (success) {
        m.tasksCompleted++;
        m.streakCount++;
        if (m.streakCount > m.bestStreak) m.bestStreak = m.streakCount;
        // Quality rises on success (diminishing returns)
        m.qualityScore = Math.min(100, m.qualityScore + Math.max(1, Math.round((100 - m.qualityScore) * 0.1)));
        m.weeklyTasks++;
        if (delegatedBy) m.weeklyPeerTasks++;
      } else {
        m.tasksFailed++;
        m.streakCount = 0;
        // Quality drops faster on failure
        m.qualityScore = Math.max(0, m.qualityScore - 5);
        m.weeklyFailed++;
      }

      m.totalTokens += tokens;
      m.totalResponseTimeMs += responseTimeMs;
      m.lastTaskTime = Date.now();

      const total = m.tasksCompleted + m.tasksFailed;
      m.successRate = total > 0 ? Math.round((m.tasksCompleted / total) * 100) : 100;
      m.avgResponseTimeMs = total > 0 ? Math.round(m.totalResponseTimeMs / total) : 0;
      m.avgTokensPerTask = m.tasksCompleted > 0 ? Math.round(m.totalTokens / m.tasksCompleted) : 0;

      // Keep last 20 task outcomes
      m.history.push({ time: Date.now(), success, tokens, taskType });
      if (m.history.length > 20) m.history.shift();

      this._persist();

      // Skip automatic tier changes, promotions, and weekly evaluations when paused.
      // Raw stats above still tracked — only the automated consequences are disabled.
      if (!this.paused) {
        this._evaluateTier(agentId);
        this._evaluateLeadership(agentId);
        this._checkWeeklyEvaluation();
      }
    },

    // Record a staging approval/rejection (called from staging store)
    recordStagingResult(agentId, approved) {
      const m = this._getMetrics(agentId);
      if (approved) {
        m.weeklyStagingApprovals++;
      } else {
        m.weeklyStagingRejections++;
      }
      this._persist();
    },

    // Calculate a composite performance score (0-100)
    getScore(agentId) {
      const m = this._getMetrics(agentId);
      const total = m.tasksCompleted + m.tasksFailed;
      if (total < 2) return 50; // not enough data

      // Weighted composite: success rate (40%), quality (30%), efficiency (20%), streak (10%)
      const successComponent = m.successRate * 0.4;
      const qualityComponent = m.qualityScore * 0.3;

      // Efficiency: lower avg tokens = better (normalize to 0-100)
      const avgTokensNorm = m.avgTokensPerTask > 0 ? Math.max(0, 100 - (m.avgTokensPerTask / 100)) : 50;
      const efficiencyComponent = avgTokensNorm * 0.2;

      // Streak bonus
      const streakComponent = Math.min(100, m.streakCount * 15) * 0.1;

      return Math.round(successComponent + qualityComponent + efficiencyComponent + streakComponent);
    },

    // Get ranked agents for a team (sorted by performance score)
    getLeaderboard(teamId) {
      const team = this.teams.find(t => t.id === teamId);
      if (!team) return [];

      return team.members
        .map(agentId => {
          const agent = Alpine.store('agents').list.find(a => a.id === agentId);
          const m = this._getMetrics(agentId);
          return {
            id: agentId,
            name: agent?.name || agentId,
            emoji: agent?.emoji || '🤖',
            model: agent?.model || 'unknown',
            score: this.getScore(agentId),
            weeklyScore: this.getWeeklyScore(agentId),
            tasksCompleted: m.tasksCompleted,
            successRate: m.successRate,
            qualityScore: m.qualityScore,
            streakCount: m.streakCount,
            bestStreak: m.bestStreak,
            isLead: team.lead === agentId,
            tier: m.tier,
            tierName: this.TIER_NAMES[m.tier] || 'Active',
            tierColor: this.TIER_COLORS[m.tier] || 'gray',
            weeklyTasks: m.weeklyTasks,
            weeklyStagingApprovals: m.weeklyStagingApprovals,
            weeklyChampion: m.weeklyChampion,
          };
        })
        .sort((a, b) => b.score - a.score);
    },

    // Evaluate if the top performer should replace the current team lead
    _evaluateLeadership(agentId) {
      for (const team of this.teams) {
        if (!team.members.includes(agentId)) continue;

        const leaderboard = this.getLeaderboard(team.id);
        if (leaderboard.length < 2) continue;

        const topPerformer = leaderboard[0];
        const currentLead = leaderboard.find(a => a.isLead);

        // Promotion criteria: top performer must have >10 tasks, score 15+ points
        // above current lead, and current lead must have at least 5 tasks
        if (
          topPerformer.id !== team.lead &&
          topPerformer.tasksCompleted >= 10 &&
          currentLead &&
          currentLead.tasksCompleted >= 5 &&
          topPerformer.score - currentLead.score >= 15
        ) {
          const oldLead = team.lead;
          team.lead = topPerformer.id;

          // Track promotion/demotion counts
          this._getMetrics(topPerformer.id).promotions++;
          this._getMetrics(oldLead).demotions++;

          Alpine.store('monitor').addLog('info',
            `🏆 ${topPerformer.emoji} ${topPerformer.name} promoted to ${team.name} lead (score: ${topPerformer.score} vs ${currentLead.score})`
          );

          this._persist();
        }
      }
    },

    // ---- TIER SYSTEM ----

    // Get tier name for display
    getTierName(agentId) {
      const m = this._getMetrics(agentId);
      return this.TIER_NAMES[m.tier] || 'Active';
    },

    getTierColor(agentId) {
      const m = this._getMetrics(agentId);
      return this.TIER_COLORS[m.tier] || 'gray';
    },

    // Evaluate whether an agent should tier up or down
    _evaluateTier(agentId) {
      const m = this._getMetrics(agentId);
      const score = this.getScore(agentId);
      const total = m.tasksCompleted + m.tasksFailed;
      const oldTier = m.tier;

      // Tier 0 (Probation) escape: 5 consecutive successes
      if (m.tier === 0 && m.streakCount >= 5) {
        this._setTier(agentId, 1, 'Escaped probation with 5-streak');
        return;
      }

      // Drop to Probation: score < 30 and 5+ failures
      if (m.tier > 0 && score < 30 && m.tasksFailed >= 5) {
        this._setTier(agentId, 0, `Score ${score} with ${m.tasksFailed} failures`);
        return;
      }

      // Drop one tier: score < 40 (but not to probation unless criteria above met)
      if (m.tier > 1 && score < 40) {
        this._setTier(agentId, m.tier - 1, `Score dropped to ${score}`);
        return;
      }

      // Tier up to Proven (2): score >= 70, 15+ tasks, streak >= 3
      if (m.tier === 1 && score >= 70 && total >= 15 && m.streakCount >= 3) {
        this._setTier(agentId, 2, `Score ${score}, ${total} tasks, ${m.streakCount}-streak`);
        return;
      }

      // Elite (3) is ONLY awarded via weekly evaluation (champion) or manual promotion
      // But Elite agents CAN be demoted if they underperform
      if (m.tier === 3 && score < 55) {
        this._setTier(agentId, 2, `Elite dropped: score fell to ${score}`);
      }
    },

    _setTier(agentId, newTier, reason) {
      const m = this._getMetrics(agentId);
      const oldTier = m.tier;
      if (oldTier === newTier) return;

      m.tier = newTier;
      m.tierHistory.push({ time: Date.now(), from: oldTier, to: newTier, reason });
      if (m.tierHistory.length > 20) m.tierHistory.shift();

      const agent = Alpine.store('agents').list.find(a => a.id === agentId);
      const name = agent?.name || agentId;
      const emoji = agent?.emoji || '';
      const direction = newTier > oldTier ? 'promoted' : 'demoted';
      Alpine.store('monitor').addLog(
        newTier > oldTier ? 'info' : 'warn',
        `${emoji} ${name} ${direction} to ${this.TIER_NAMES[newTier]}: ${reason}`
      );
      this._persist();
    },

    // Get perks for an agent's current tier
    getTierPerks(agentId) {
      const m = this._getMetrics(agentId);
      return this.TIER_PERKS[m.tier] || this.TIER_PERKS[1];
    },

    // Check if agent has Oracle Cloud access (Elite only)
    hasOracleAccess(agentId) {
      const m = this._getMetrics(agentId);
      return m.tier >= 3;
    },

    // ---- WEEKLY EVALUATION CYCLE ----

    getWeekDaysRemaining() {
      const elapsed = Date.now() - this.week.startDate;
      const remaining = (7 * 24 * 60 * 60 * 1000) - elapsed;
      return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
    },

    getWeekProgress() {
      const elapsed = Date.now() - this.week.startDate;
      return Math.min(100, Math.round((elapsed / (7 * 24 * 60 * 60 * 1000)) * 100));
    },

    // Composite weekly score — measures DELIVERED VALUE, not just task count
    getWeeklyScore(agentId) {
      const m = this._getMetrics(agentId);
      const weekTotal = m.weeklyTasks + m.weeklyFailed;
      if (weekTotal < 1) return 0;

      // Tasks delivered (25%)
      const taskComponent = Math.min(100, m.weeklyTasks * 5) * 0.25;

      // Staging approvals (30%) — owner-verified quality, can't be gamed
      const stagingTotal = m.weeklyStagingApprovals + m.weeklyStagingRejections;
      const stagingRate = stagingTotal > 0 ? (m.weeklyStagingApprovals / stagingTotal) * 100 : 0;
      const stagingVolume = Math.min(100, m.weeklyStagingApprovals * 20); // bonus for volume
      const stagingComponent = ((stagingRate * 0.6) + (stagingVolume * 0.4)) * 0.30;

      // Streak quality (15%)
      const streakComponent = Math.min(100, m.streakCount * 15) * 0.15;

      // Efficiency (15%) — lower avg tokens = better
      const avgTokensNorm = m.avgTokensPerTask > 0 ? Math.max(0, 100 - (m.avgTokensPerTask / 100)) : 50;
      const efficiencyComponent = avgTokensNorm * 0.15;

      // Peer contribution (15%) — tasks delegated by teammates, completed successfully
      const peerComponent = Math.min(100, m.weeklyPeerTasks * 15) * 0.15;

      return Math.round(taskComponent + stagingComponent + streakComponent + efficiencyComponent + peerComponent);
    },

    _checkWeeklyEvaluation() {
      const elapsed = Date.now() - this.week.startDate;
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      if (elapsed < weekMs) return; // not time yet

      this._runWeeklyEvaluation();
    },

    _runWeeklyEvaluation() {
      const snapshot = { week: this.week.number, date: Date.now(), teams: {} };

      for (const team of this.teams) {
        const results = team.members.map(agentId => {
          const m = this._getMetrics(agentId);
          const agent = Alpine.store('agents').list.find(a => a.id === agentId);
          return {
            id: agentId,
            name: agent?.name || agentId,
            emoji: agent?.emoji || '',
            weeklyScore: this.getWeeklyScore(agentId),
            weeklyTasks: m.weeklyTasks,
            weeklyFailed: m.weeklyFailed,
            weeklyStagingApprovals: m.weeklyStagingApprovals,
            tier: m.tier,
          };
        }).sort((a, b) => b.weeklyScore - a.weeklyScore);

        snapshot.teams[team.id] = results;

        // Champion: highest weekly score with at least 3 tasks delivered
        const champion = results.find(r => r.weeklyTasks >= 3);
        if (champion) {
          const m = this._getMetrics(champion.id);

          // Award Elite (Tier 3) to champion
          if (m.tier < 3) {
            // Demote any existing Elite on this team first (max 1 per team)
            for (const memberId of team.members) {
              if (memberId !== champion.id) {
                const mm = this._getMetrics(memberId);
                if (mm.tier === 3) {
                  this._setTier(memberId, 2, `Weekly champion replaced by ${champion.name}`);
                }
              }
            }
            this._setTier(champion.id, 3, `Week ${this.week.number} champion (score: ${champion.weeklyScore})`);
          }
          m.weeklyChampion = true;

          // Champion becomes team lead
          if (team.lead !== champion.id) {
            const oldLead = team.lead;
            team.lead = champion.id;
            this._getMetrics(champion.id).promotions++;
            if (oldLead) this._getMetrics(oldLead).demotions++;
            Alpine.store('monitor').addLog('info',
              `🏆 ${champion.emoji} ${champion.name} is Week ${this.week.number} champion — promoted to ${team.name} lead!`
            );
          } else {
            Alpine.store('monitor').addLog('info',
              `🏆 ${champion.emoji} ${champion.name} retains ${team.name} lead as Week ${this.week.number} champion!`
            );
          }
        }
      }

      // Save snapshot
      this.week.evaluations.push(snapshot);
      if (this.week.evaluations.length > 12) this.week.evaluations.shift(); // keep 12 weeks

      // Reset weekly counters for all agents
      for (const agentId of Object.keys(this.metrics)) {
        const m = this.metrics[agentId];
        m.weeklyTasks = 0;
        m.weeklyFailed = 0;
        m.weeklyStagingApprovals = 0;
        m.weeklyStagingRejections = 0;
        m.weeklyPeerTasks = 0;
        m.weeklyChampion = false;
      }

      // Advance week
      this.week.number++;
      this.week.startDate = Date.now();

      storage.save('governance-week', this.week);
      this._persist();
    },

    // Force a weekly evaluation (owner can trigger manually)
    forceWeeklyEval() {
      this._runWeeklyEvaluation();
    },

    // Get past champion history
    getChampionHistory() {
      const history = [];
      for (const eval_ of this.week.evaluations) {
        for (const [teamId, results] of Object.entries(eval_.teams || {})) {
          const champ = results[0]; // sorted by weeklyScore desc
          if (champ && champ.weeklyTasks >= 3) {
            history.push({
              week: eval_.week,
              date: eval_.date,
              teamId,
              ...champ,
            });
          }
        }
      }
      return history.reverse(); // most recent first
    },

    // Manually promote an agent to team lead
    promoteLead(teamId, agentId) {
      const team = this.teams.find(t => t.id === teamId);
      if (!team || !team.members.includes(agentId)) return;

      const oldLead = team.lead;
      team.lead = agentId;
      this._getMetrics(agentId).promotions++;
      if (oldLead) this._getMetrics(oldLead).demotions++;

      const agent = Alpine.store('agents').list.find(a => a.id === agentId);
      Alpine.store('monitor').addLog('info',
        `${agent?.emoji || '🤖'} ${agent?.name || agentId} manually promoted to ${team.name} lead`
      );
      this._persist();
    },

    // Create a new team
    createTeam(name, memberIds, leadId) {
      const team = {
        id: 'team-' + Date.now().toString(36),
        name,
        lead: leadId || memberIds[0],
        members: memberIds,
        project: '',
      };
      this.teams.push(team);
      this._persist();
      Alpine.store('monitor').addLog('info', `Team "${name}" created with ${memberIds.length} members`);
      return team;
    },

    _persist() {
      storage.save('governance-metrics', this.metrics);
      storage.save('governance-teams', this.teams);
      storage.save('governance-week', this.week);

      // Debounced sync to shared volume (every 30s max)
      if (window.workflowBridge && !this._syncPending) {
        this._syncPending = true;
        setTimeout(() => {
          this._syncPending = false;
          window.workflowBridge.syncGovernance();
        }, 30000);
      }
    },
  });

  // --------------------------------------------------------------------------
  // STORE: CRON — per-agent scheduled job management
  // --------------------------------------------------------------------------

  Alpine.store('cron', {
    jobs: [],          // all cron jobs from OpenClaw
    loading: false,
    activeAgent: null, // agent ID whose popover is open
    error: null,

    // Jobs filtered by agent ID (matches job.agentId or sessionKey containing the agent)
    forAgent(agentId) {
      return this.jobs.filter(j => {
        if (j.agentId === agentId) return true;
        // sessionKey format: "agent:<id>:main" or similar
        if (j.sessionKey && j.sessionKey.includes(`:${agentId}:`)) return true;
        if (j.agent === agentId) return true;
        return false;
      });
    },

    countForAgent(agentId) {
      return this.forAgent(agentId).length;
    },

    async fetch() {
      if (!window.openclawClient?.authenticated) return;
      this.loading = true;
      this.error = null;
      try {
        const jobs = await window.openclawClient.listCronJobs();
        this.jobs = Array.isArray(jobs) ? jobs : [];
      } catch (err) {
        this.error = err.message;
        console.warn('[Cron] Fetch failed:', err.message);
      } finally {
        this.loading = false;
      }
    },

    toggle(agentId) {
      if (this.activeAgent === agentId) {
        this.activeAgent = null;
      } else {
        this.activeAgent = agentId;
        this.fetch(); // refresh on open
      }
    },

    close() {
      this.activeAgent = null;
    },

    async remove(jobId) {
      if (!window.openclawClient?.authenticated) return;
      try {
        await window.openclawClient.removeCronJob(jobId);
        this.jobs = this.jobs.filter(j => (j.id || j.jobId) !== jobId);
        Alpine.store('monitor').addLog('info', `Cron job ${jobId} removed`);
      } catch (err) {
        Alpine.store('monitor').addLog('error', `Failed to remove cron job: ${err.message}`);
      }
    },

    async runNow(jobId) {
      if (!window.openclawClient?.authenticated) return;
      try {
        await window.openclawClient.runCronJob(jobId);
        Alpine.store('monitor').addLog('info', `Cron job ${jobId} triggered`);
      } catch (err) {
        Alpine.store('monitor').addLog('error', `Failed to run cron job: ${err.message}`);
      }
    },

    async addQuick(agentId, { label, schedule, message }) {
      if (!window.openclawClient?.authenticated) return;
      try {
        await window.openclawClient.addCronJob({
          agentId,
          label: label || 'Quick task',
          schedule,
          payload: { kind: 'systemEvent', message },
          session: 'main',
        });
        Alpine.store('monitor').addLog('info', `Cron job added for ${agentId}`);
        await this.fetch(); // refresh list
      } catch (err) {
        Alpine.store('monitor').addLog('error', `Failed to add cron job: ${err.message}`);
      }
    },
  });

  // --------------------------------------------------------------------------
  // STORE: SETTINGS — sidebar customization & preferences
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  // STORE: STAGING — agent-generated content preview & approval
  // --------------------------------------------------------------------------

  Alpine.store('staging', {
    items: [],
    selectedId: null,
    _pollTimer: null,
    _localStatuses: {},  // id → status — persists approval/rejection across poll cycles

    init() {
      this._localStatuses = storage.load('staging-statuses', {});
    },

    get selected() {
      return this.items.find(i => i.id === this.selectedId) || null;
    },

    get pendingCount() {
      return this.items.filter(i => i.status === 'pending').length;
    },

    startPolling(intervalMs = 15000) {
      this.stopPolling();
      this._poll();
      this._pollTimer = setInterval(() => this._poll(), intervalMs);
    },

    stopPolling() {
      if (this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
    },

    async _poll() {
      try {
        const prevPending = this.pendingCount;
        const resp = await fetch('/workspace/staging/index.json', {
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) return;
        const data = await resp.json();
        this.items = (data.items || []).map(item => {
          const id = item.id || item.path;
          const serverStatus = item.status || 'pending';
          const localStatus = this._localStatuses[id];
          // Local approval/rejection overrides server until server catches up
          const status = (localStatus && serverStatus === 'pending') ? localStatus : serverStatus;
          // Clear local override once server matches
          if (localStatus && serverStatus === localStatus) {
            delete this._localStatuses[id];
            storage.save('staging-statuses', this._localStatuses);
          }
          return {
            id,
            name: item.name || item.path,
            path: item.path,
            type: item.type || 'html',
            createdBy: item.createdBy || 'agent',
            createdAt: item.createdAt || Date.now(),
            description: item.description || '',
            status,
            previewUrl: '/workspace/staging/' + item.path,
          };
        });
        // Notify if new pending items appeared
        if (this.pendingCount > prevPending) mcAudio.stagingNew();
      } catch {}
    },

    approve(id) {
      const item = this.items.find(i => i.id === id);
      if (!item) return;
      item.status = 'approved';
      this._localStatuses[id] = 'approved';
      storage.save('staging-statuses', this._localStatuses);
      Alpine.store('monitor').addLog('info', `Staging item "${item.name}" approved`);

      if (window.openclawClient?.authenticated) {
        const agentId = item.createdBy !== 'user' ? item.createdBy : 'lead';
        window.openclawClient.sendChat(
          `STAGING_APPROVED: ${item.name} (${item.path}) has been approved by the owner. Please update /workspace/staging/index.json to set status to "approved".`,
          { sessionKey: 'agent:' + agentId + ':main' }
        ).catch(() => {});
      }

      Alpine.store('governance')?.recordTask(item.createdBy, {
        success: true,
        taskType: 'staging-approved',
      });
      Alpine.store('governance')?.recordStagingResult(item.createdBy, true);
      mcAudio.stagingApproved();
    },

    reject(id, reason) {
      const item = this.items.find(i => i.id === id);
      if (!item) return;
      item.status = 'rejected';
      this._localStatuses[id] = 'rejected';
      storage.save('staging-statuses', this._localStatuses);
      Alpine.store('monitor').addLog('info', `Staging item "${item.name}" rejected: ${reason || 'no reason'}`);

      if (window.openclawClient?.authenticated) {
        const agentId = item.createdBy !== 'user' ? item.createdBy : 'lead';
        window.openclawClient.sendChat(
          `STAGING_REJECTED: ${item.name} rejected. Reason: ${reason || 'Not specified'}. Please revise and update /workspace/staging/index.json.`,
          { sessionKey: 'agent:' + agentId + ':main' }
        ).catch(() => {});
      }

      Alpine.store('governance')?.recordTask(item.createdBy, {
        success: false,
        taskType: 'staging-rejected',
      });
      Alpine.store('governance')?.recordStagingResult(item.createdBy, false);
      mcAudio.taskFail();
    },
  });

  // --------------------------------------------------------------------------
  // STORE: ACTIVITY — server-side agent events from /workspace/agent-activity/
  // --------------------------------------------------------------------------

  Alpine.store('activity', {
    events: [],        // { time, level, type, message, agent }
    newCount: 0,       // events since last dismissal
    filter: 'all',     // 'all' | 'task-complete' | 'workflow-complete' | 'staging-new' | 'error'
    _pollTimer: null,
    _lastFetchTime: 0, // track to avoid re-processing

    get filtered() {
      if (this.filter === 'all') return this.events;
      if (this.filter === 'error') return this.events.filter(e => e.level === 'error');
      return this.events.filter(e => e.type === this.filter);
    },

    startPolling(intervalMs = 15000) {
      this.stopPolling();
      this._poll();
      this._pollTimer = setInterval(() => this._poll(), intervalMs);
    },

    stopPolling() {
      if (this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
    },

    async _poll() {
      try {
        const resp = await fetch('/workspace/agent-activity/log.json', {
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const serverEvents = (data.events || []).sort((a, b) => (b.time || 0) - (a.time || 0));

        // Only update if we got new events
        if (serverEvents.length > 0 && serverEvents[0]?.time !== this._lastFetchTime) {
          const prevCount = this.newCount;
          this._lastFetchTime = serverEvents[0].time;
          // Keep last 200 events, newest first
          this.events = serverEvents.slice(0, 200).map(e => ({
            time: e.time || Date.now(),
            level: e.level || 'info',
            type: e.type || 'unknown',
            message: e.message || '',
            agent: e.agent || e.createdBy || '',
          }));

          // Count events since last visit for badge
          const lastSeen = parseInt(localStorage.getItem('mc-last-activity-seen') || '0');
          this.newCount = this.events.filter(e => e.time > lastSeen).length;
          if (this.newCount > prevCount) mcAudio.activityEvent();
        }
      } catch {}
    },

    dismissNew() {
      this.newCount = 0;
      localStorage.setItem('mc-last-activity-seen', Date.now().toString());
    },

    formatTime(ts) {
      const diff = Date.now() - ts;
      if (diff < 60000) return 'just now';
      if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
      if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
      return Math.floor(diff / 86400000) + 'd ago';
    },

    typeColor(type) {
      const colors = {
        'task-complete': 'text-emerald-400',
        'workflow-complete': 'text-cyan-400',
        'staging-new': 'text-amber-400',
      };
      return colors[type] || 'text-mc-text-muted';
    },

    typeLabel(type) {
      const labels = {
        'task-complete': 'Task',
        'workflow-complete': 'Workflow',
        'staging-new': 'Staging',
      };
      return labels[type] || type;
    },
  });

  Alpine.store('settings', {
    // Which sidebar nav items are visible (all default to true)
    sidebar: {
      dashboard: true,
      agents: true,
      workflows: true,
      chat: true,
      teams: true,
      monitor: true,
      staging: true,
      activity: true,
    },
    // Audio notification preferences
    audio: {
      enabled: true,
      volume: 60,        // 0-100
      chat: true,        // Chat response complete
      tasks: true,       // Governance task success/fail
      staging: true,     // New staging items, approval/rejection
      workflows: true,   // Workflow execution complete
      activity: true,    // Background agent events
      errors: true,      // Monitor error alerts
    },
    settingsOpen: false,

    init() {
      const saved = storage.load('settings', null);
      if (saved && saved.sidebar) {
        this.sidebar = { ...this.sidebar, ...saved.sidebar };
      }
      if (saved && saved.audio) {
        this.audio = { ...this.audio, ...saved.audio };
      }
    },

    toggle(key) {
      if (this.sidebar.hasOwnProperty(key)) {
        this.sidebar[key] = !this.sidebar[key];
        this._persist();
        // If the hidden view is currently active, switch to dashboard
        if (!this.sidebar[key] && Alpine.store('app').view === key) {
          Alpine.store('app').setView('dashboard');
        }
      }
    },

    toggleAudio(key) {
      if (key === 'enabled') {
        this.audio.enabled = !this.audio.enabled;
      } else if (this.audio.hasOwnProperty(key)) {
        this.audio[key] = !this.audio[key];
      }
      this._persist();
    },

    setVolume(val) {
      this.audio.volume = Math.max(0, Math.min(100, parseInt(val) || 0));
      this._persist();
    },

    isVisible(key) {
      return this.sidebar[key] !== false;
    },

    _persist() {
      storage.save('settings', {
        sidebar: { ...this.sidebar },
        audio: { ...this.audio },
      });
    },
  });

  // --------------------------------------------------------------------------
  // BOOT — only auto-boot if already authenticated
  // --------------------------------------------------------------------------

  if (Alpine.store('auth').ok) {
    Alpine.store('app').boot();
  }
});

// Expose for HTML templates
window.FALLBACK_MODELS = FALLBACK_MODELS;
window.AGENT_EMOJIS = AGENT_EMOJIS;
window.AGENT_TOOLS = AGENT_TOOLS;
window.formatTokens = formatTokens;
window.litellmApi = litellmApi;
