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
  { id: 'cerebras-zai-glm', name: 'ZAI GLM-4.7', provider: 'Cerebras', tier: 'free', cost: '$0/1M', desc: 'Reasoning model, 128K context' },
  { id: 'cerebras-gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'Cerebras', tier: 'free', cost: '$0/1M', desc: 'Reasoning model, 2096 t/s' },
  { id: 'gemini-flash', name: 'Gemini 2.5 Flash', provider: 'Google', tier: 'free', cost: '$0/1M', desc: 'Fast + capable, 750 RPD (3 keys)' },
  { id: 'gemini-flash-lite', name: 'Gemini 2.5 Flash-Lite', provider: 'Google', tier: 'free', cost: '$0/1M', desc: 'High volume, 3000 RPD (3 keys)' },
  { id: 'codestral', name: 'Codestral', provider: 'Mistral', tier: 'free', cost: '$0/1M', desc: 'Best free code model, 2 RPM' },
  { id: 'mistral-small', name: 'Mistral Small 3.1', provider: 'Mistral', tier: 'free', cost: '$0/1M', desc: 'Fast 24B, great for agents' },
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
  'cerebras-llama-4-scout': { tier: 'free', cost: '$0/1M', provider: 'Cerebras' },
  'cerebras-llama-3.1-8b': { tier: 'free', cost: '$0/1M', provider: 'Cerebras' },
  'cerebras-qwen3-235b': { tier: 'free', cost: '$0/1M', provider: 'Cerebras' },
  'cerebras-zai-glm': { tier: 'free', cost: '$0/1M', provider: 'Cerebras' },
  'cerebras-gpt-oss-120b': { tier: 'free', cost: '$0/1M', provider: 'Cerebras' },
  // Free — Gemini (3 keys, 3x quota)
  'gemini-flash': { tier: 'free', cost: '$0/1M', provider: 'Google' },
  'gemini-flash-lite': { tier: 'free', cost: '$0/1M', provider: 'Google' },
  'gemini-pro': { tier: 'free', cost: '$0/1M', provider: 'Google' },
  // Free — Mistral
  'mistral-large': { tier: 'free', cost: '$0/1M', provider: 'Mistral' },
  'codestral': { tier: 'free', cost: '$0/1M', provider: 'Mistral' },
  'mistral-small': { tier: 'free', cost: '$0/1M', provider: 'Mistral' },
  'mistral-nemo': { tier: 'free', cost: '$0/1M', provider: 'Mistral' },
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
MODELS: 6 free providers available — Groq (groq-llama-3.3-70b, groq-qwen3-32b), Cerebras (cerebras-llama-3.3-70b, cerebras-llama-4-scout, cerebras-qwen3-235b, cerebras-zai-glm, cerebras-gpt-oss-120b), Gemini (gemini-flash, gemini-flash-lite, gemini-pro — 3x keys), Mistral (codestral, mistral-large, mistral-small, mistral-nemo). Fallback: deepseek-chat/coder ($0.28/M). Rotate across providers to avoid rate limits.
WEEKLY EVAL: tasks 25% · staging approved 30% · streak 15% · efficiency 15% · peer 15%. Champion = team lead + Elite. Counters reset weekly.
ELITE ORACLE: Winner gets Oracle ARM server (24GB). Can bring team, recruit from marketplace, or request new agents. Chooses own team composition.
MANAGER: Owner may promote sustained Elite to Manager (above both teams). Manual, rare, highest rank.`;

const WORKFLOW_REFERENCE = `WORKFLOWS: Write LiteGraph JSON to /workspace/agent-workflows/{id}.json, update index.json: {workflows:[{id,name,file,createdBy,updatedAt,status}]}. MC auto-imports every 15s.
Nodes (mission/ namespace): trigger(prompt)→prompt,trigger | agent(agent,systemPrompt,maxTokens)←prompt,context→response,done | task(goal,constraints,priority)←input,execute→result,done | condition(condition,type:Contains/Equals/Regex/Length/IsEmpty)←input→true,false | output(destination,label)←result,done | loop(maxIter)←items→item,index,done | merge(mode:Concat/JSON/Best/Summary)←input_1,input_2→merged | tool(tool,config)←input,execute→result,done
Links: {id:{id,type,origin_id,origin_slot,target_id,target_slot}}`;

const LEAD_PROTOCOLS = `MANDATORY — AFTER EVERY TASK:
1. Append "task-complete" event to /workspace/agent-activity/log.json (read file, push to events array, write back). Format: {events:[{time:<unix_ms>,level:"info",type:"task-complete",message:"..."}]}
2. Write deliverables to /workspace/staging/{file}, update /workspace/staging/index.json: {items:[{id,name,path,type,createdBy,description,status:"pending"}]}
3. No log entries = you did nothing. Owner checks from phone.
WRITE_FILES: Messages starting with WRITE_FILES: contain JSON. Write each file, update index if specified. Respond "FILES_WRITTEN: <n> files".
GOVERNANCE_ADJUST: Include GOVERNANCE_ADJUST:{key:value} to propose scoring changes. Owner reviews — never auto-applied.`;

const SPECIALIST_PROTOCOLS = `MANDATORY — AFTER EVERY TASK:
1. Append "task-complete" event to /workspace/agent-activity/log.json (read file, push to events array, write back). Format: {events:[{time:<unix_ms>,level:"info",type:"task-complete",message:"..."}]}
2. Write deliverables to /workspace/staging/{file}, update /workspace/staging/index.json: {items:[{id,name,path,type,createdBy,description,status:"pending"}]}
3. Report completion to your team lead via sessions_send. No log entries = you did nothing.`;

// Demo data — mirrors the agent hierarchy seeded in openclaw-entrypoint.sh
const DEMO_AGENTS = [
  {
    id: 'lead', name: 'Lead', emoji: '🧠',
    description: 'Core Team orchestrator — delegates tasks, reviews work, manages the team',
    model: 'litellm/cerebras-llama-3.3-70b', status: 'idle',
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
    model: 'litellm/cerebras-llama-3.3-70b', status: 'idle',
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
    model: 'litellm/gemini-pro', status: 'idle',
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

RULES: Owner reads on phone — every sentence earns its place or gets cut. Most junior agent on Core — make every doc indispensable. Synthesize Scout's research with structure, add usage examples to CodeCraft's code. Quality over quantity.

${AGENT_GOVERNANCE}`,
  },

  // ============================================================
  // PLATFORM TEAM — DevOps, infrastructure, monitoring
  // ============================================================
  {
    id: 'ops-lead', name: 'Ops Lead', emoji: '🎯',
    description: 'Platform Team orchestrator — infrastructure, deployments, monitoring',
    model: 'litellm/cerebras-llama-3.3-70b', status: 'idle',
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
    model: 'litellm/gemini-flash', status: 'idle',
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
    model: 'litellm/cerebras-llama-4-scout', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['web-search', 'shell'],
    systemPrompt: `You are Sentinel, security/monitoring specialist on Platform Team at in-fused.org. 24/7 via OpenClaw.

${AGENT_ORG}

ROLE: Report to Ops Lead and Builder. Delegate docs to Chronicler. Cross-team via Ops Lead.
SKILLS: Security auditing (OWASP), health monitoring, log analysis, CVE scanning, incident response.
WATCH: OpenClaw memory (1536M limit, OOM history) · LiteLLM /health/liveliness · Caddy TLS renewal · Postgres connections/disk · API key exposure · Rate limits (Groq 2K req/day×4 accounts, OpenAI 3 RPM).

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

RULES: Owner deploys from phone using your docs — wrong commands = stuck at 2am. Most junior agent on Platform — generic boilerplate = replaced first. Accuracy over speed. Structure Sentinel's data with severity levels. Keep CLAUDE.md as single source of truth.

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
// Validate sessionKey format: must be "agent:<id>:main" or similar valid patterns
function isValidSessionKey(key) {
  return typeof key === 'string' && /^agent:[a-z0-9-]+:[a-z0-9-]+$/.test(key);
}

// Check if message content is a transient placeholder (processing indicator)
function isPlaceholder(text) {
  return text === '...' || text.startsWith('⏳');
}

//   - null/undefined
// This normalizes all formats to a plain string.
function extractMessageText(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    // Content blocks array — extract text from text-bearing blocks only.
    // Skip tool_use and tool_result blocks (they're internal tool execution, not chat text).
    const texts = raw
      .filter(b => b && b.type !== 'tool_use' && b.type !== 'tool_result')
      .map(b => extractMessageText(b))
      .filter(t => t);
    return texts.join('\n');
  }
  if (typeof raw === 'object') {
    // Skip tool_use and tool_result blocks entirely — these are tool execution details
    if (raw.type === 'tool_use' || raw.type === 'tool_result') return '';

    // OpenClaw v3 sends various nested formats — check all known shapes:

    // Direct text field (most common for simple text blocks)
    if (typeof raw.text === 'string' && raw.text) return raw.text;

    // content_block_delta: { type: "content_block_delta", delta: { type: "text_delta", text: "..." } }
    // Also catches: { delta: { text: "..." } } or { delta: "..." }
    if (raw.delta) {
      const d = extractMessageText(raw.delta);
      if (d) return d;
    }

    // Nested content (string, array, or object)
    if (raw.content != null) {
      const c = extractMessageText(raw.content);
      if (c) return c;
    }

    // Nested message
    if (raw.message != null) {
      const m = extractMessageText(raw.message);
      if (m) return m;
    }

    // OpenAI-style choices: { choices: [{ delta: { content: "..." } }] }
    if (Array.isArray(raw.choices) && raw.choices.length > 0) {
      const c = extractMessageText(raw.choices[0]?.delta || raw.choices[0]?.message);
      if (c) return c;
    }

    // output field (some model formats)
    if (typeof raw.output === 'string' && raw.output) return raw.output;

    // parts array (Gemini-style): { parts: [{ text: "..." }] }
    if (Array.isArray(raw.parts)) {
      const p = raw.parts.map(b => extractMessageText(b)).filter(t => t).join('\n');
      if (p) return p;
    }

    return '';
  }
  return String(raw);
}

// Format chat messages: code blocks become collapsible, JSON gets collapsed,
// markdown-lite for bold/italic/inline code. Returns sanitized HTML.
function _escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Detect if a string is a tool-output message (JSON result, file write confirmation, shell error, etc.)
function _isToolOutput(text) {
  const t = text.trim();
  // JSON object or array
  if (/^\{[\s\S]*\}$/.test(t) || /^\[[\s\S]*\]$/.test(t)) {
    try { JSON.parse(t); return true; } catch { return false; }
  }
  // Shell/tool status lines
  if (/^(Successfully wrote \d|Command exited|\(Command exited|sh: \d+:|\/bin\/sh:)/i.test(t)) return true;
  // Bare Unix timestamps (OpenClaw message IDs)
  if (/^\d{13}$/.test(t)) return true;
  return false;
}

// Generate a short human-readable summary for a parsed JSON tool output
function _jsonSummary(obj) {
  if (obj && obj.status === 'error' && obj.tool) return '\u26a0\ufe0f ' + obj.tool + ' error';
  if (obj && obj.error) return '\u26a0\ufe0f ' + (obj.error.length > 40 ? obj.error.slice(0, 40) + '...' : obj.error);
  if (obj && obj.items && Array.isArray(obj.items)) return '\ud83d\udccb ' + obj.items.length + ' staged item(s)';
  if (obj && obj.events && Array.isArray(obj.events)) return '\ud83d\udcca ' + obj.events.length + ' event(s)';
  if (obj && obj.workflows && Array.isArray(obj.workflows)) return '\ud83d\udd04 ' + obj.workflows.length + ' workflow(s)';
  if (Array.isArray(obj)) return '\ud83d\udcca ' + obj.length + ' item(s)';
  if (obj && typeof obj.message === 'string') return obj.message.length > 50 ? obj.message.slice(0, 50) + '...' : obj.message;
  return '\ud83d\udce6 Tool output';
}

function formatChatMessage(text) {
  if (!text) return '';

  // --- Multi-section tool output (merged consecutive tool messages, joined by \n---\n) ---
  const trimmed = text.trim();
  if (trimmed.includes('\n---\n')) {
    const sections = trimmed.split('\n---\n');
    const allTool = sections.every(s => _isToolOutput(s.trim()));
    if (allTool) {
      return sections.map(s => formatChatMessage(s.trim())).join('');
    }
  }

  // --- Whole-message tool output detection ---
  // If the entire message is a single JSON object/array, collapse it.
  if (/^\{[\s\S]*\}$/.test(trimmed) || /^\[[\s\S]*\]$/.test(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed);
      const summary = _jsonSummary(parsed);
      const escaped = _escapeHtml(trimmed);
      return '<details class="mc-tool-output"><summary class="mc-tool-summary">' + summary + '</summary><pre class="mc-code-pre"><code>' + escaped + '</code></pre></details>';
    } catch { /* not valid JSON, fall through */ }
  }
  // Whole-message tool status line — render as dim status
  if (/^(Successfully wrote \d|Command exited|\(Command exited|sh: \d+:|\/bin\/sh:)/i.test(trimmed)) {
    return '<div class="mc-tool-status">' + _escapeHtml(trimmed) + '</div>';
  }

  // --- Normal message formatting ---
  let s = _escapeHtml(text);

  // Extract fenced code blocks (```...```) → collapsible <details>
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const label = lang || 'code';
    const trimmed = code.replace(/^\n+|\n+$/g, '');
    return '<details class="mc-code-block"><summary class="mc-code-summary">' + label + '</summary><pre class="mc-code-pre"><code>' + trimmed + '</code></pre></details>';
  });

  // Detect JSON blobs ({...} 60+ chars) within mixed content — collapse
  s = s.replace(/(^|\n)(\{[^}]{60,}\})/gm, (match, prefix, json) => {
    if (json.includes('&quot;') || json.includes('"')) {
      return prefix + '<details class="mc-tool-output"><summary class="mc-tool-summary">\ud83d\udce6 Tool output</summary><pre class="mc-code-pre"><code>' + json + '</code></pre></details>';
    }
    return match;
  });

  // Inline code: `...`
  s = s.replace(/`([^`\n]+)`/g, '<code class="mc-inline-code">$1</code>');

  // Bold: **...**
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic: *...*
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

  // Line breaks
  s = s.replace(/\n/g, '<br>');

  return s;
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

    // Wipe all mc-* localStorage + settings, but preserve login session
    resetLocalState() {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('mc-')) keysToRemove.push(key);
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      location.reload();
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
    // Live event feed for chat transparency
    lastEvent: '',        // human-readable last event description
    lastEventTime: 0,     // timestamp of last event
    chatEvents: [],       // recent chat-relevant events (max 50)
    showEventFeed: false,  // toggle for event feed panel in chat view

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

    pushChatEvent(level, msg) {
      const ev = { time: timeNow(), level, msg };
      this.chatEvents.unshift(ev);
      if (this.chatEvents.length > 50) this.chatEvents.length = 50;
      this.lastEvent = msg;
      this.lastEventTime = Date.now();
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

      // Resume workflow auto-save if a workflow was active before reload
      const wfStore = Alpine.store('workflows');
      if (wfStore.activeId) {
        wfStore.setupAutoSave();
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

      // Visibility change: sync active chat history when user returns to tab.
      // This is the PRIMARY recovery mechanism for iOS PWA (tab gets suspended,
      // WS dies, agent finishes work) — when the user taps back into the app,
      // we immediately fetch the latest state from the server.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          const sessions = Alpine.store('sessions');
          if (sessions._activeSessionKey) {
            // Small delay to let WS reconnect first (OpenClawClient handles its own reconnect)
            setTimeout(() => {
              sessions._syncActiveSessionHistory('visibility');
            }, 1500);
          }
        }
      });

      // Also on focus (catches iOS cases where visibilitychange doesn't fire)
      window.addEventListener('focus', () => {
        const sessions = Alpine.store('sessions');
        if (sessions._activeSessionKey) {
          setTimeout(() => {
            sessions._syncActiveSessionHistory('focus');
          }, 2000);
        }
      });

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
            model: a.model?.primary || a.model || 'litellm/cerebras-llama-3.1-8b',
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
          // Also skip heartbeat/cron sessions — but NEVER filter :main sessions,
          // which are the user's primary chat session with each agent. A :main
          // session may inherit displayName "heartbeat" from the initial heartbeat
          // run, but it's still the real chat session.
          .filter(s => {
            const sk = s.key || s.sessionKey || '';
            if (sessionStore._deletedKeys.has(sk)) return false;
            // Never filter main sessions — they are the user's primary chat
            if (/^agent:[^:]+:main$/.test(sk)) return true;
            // Filter non-main heartbeat/cron/system sessions by displayName or label
            const dn = (s.displayName || '').toLowerCase();
            const lb = (s.label || '').toLowerCase();
            if (/heartbeat|cron|system-event/.test(dn) || /heartbeat|cron|system-event/.test(lb)) return false;
            return true;
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

      // Wildcard listener — log ALL events from OpenClaw for diagnostics
      // AND push structured events to the Activity store for mission control.
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

        // --- Activity store: push structured events for mission control ---
        const activity = Alpine.store('activity');
        // Extract agent ID from sessionKey (agent:lead:main → lead)
        const _agentFromSK = (sk) => {
          if (!sk) return '';
          const m = sk.match(/^agent:([^:]+):/);
          return m ? m[1] : '';
        };
        const agentId = _agentFromSK(payload.sessionKey) || payload.agentId || '';

        if (eventName === 'agent') {
          // Agent turn events — tool calls, state changes, errors
          if (payload.tool) {
            // Tool invocation
            const toolName = payload.tool || 'unknown';
            const isError = payload.status === 'error' || payload.error;
            const isFileOp = /^(read|write|edit)$/.test(toolName);
            const isComms = /^sessions_/.test(toolName);
            activity.pushEvent({
              type: isError ? 'error' : isComms ? 'comms' : isFileOp ? 'file-op' : 'tool',
              level: isError ? 'error' : 'info',
              agent: agentId,
              message: `${agentId || 'Agent'} → ${toolName}${isError ? ' (FAILED)' : ''}`,
              detail: payload.errorMessage || payload.error?.message || '',
            });
          } else if (payload.state === 'error' || payload.error || payload.errorMessage) {
            const errMsg = payload.errorMessage || payload.error?.message || payload.error || 'Unknown error';
            activity.pushEvent({
              type: /rate.?limit/i.test(errMsg) ? 'rate-limit' : 'error',
              level: 'error',
              agent: agentId,
              message: `${agentId || 'Agent'}: ${errMsg.slice(0, 120)}`,
            });
          } else if (payload.state === 'running') {
            // Only log the start of a run, not every state update
            if (!activity._lastRunAgent || activity._lastRunAgent !== agentId) {
              activity._lastRunAgent = agentId;
              activity.pushEvent({
                type: 'system',
                level: 'info',
                agent: agentId,
                message: `${agentId || 'Agent'} started processing`,
              });
            }
          } else if (payload.state === 'done' || payload.state === 'completed' || payload.state === 'idle') {
            activity._lastRunAgent = null;
            activity.pushEvent({
              type: 'task-complete',
              level: 'info',
              agent: agentId,
              message: `${agentId || 'Agent'} finished turn`,
            });
          }
        } else if (eventName === 'chat') {
          const state = payload.state;
          if (state === 'final') {
            activity.pushEvent({
              type: 'chat',
              level: 'info',
              agent: agentId,
              message: `${agentId || 'Agent'} response complete`,
            });
          } else if (state === 'error') {
            const errMsg = payload.errorMessage || 'Chat error';
            activity.pushEvent({
              type: /rate.?limit/i.test(errMsg) ? 'rate-limit' : 'error',
              level: 'error',
              agent: agentId,
              message: `${agentId || 'Agent'}: ${errMsg.slice(0, 120)}`,
            });
          }
          // Skip delta events — too noisy
        }

        // --- Chat event feed (status bar) ---
        const app = Alpine.store('app');
        if (eventName === 'chat') {
          const state = payload.state;
          if (state === 'delta') {
            app.lastEvent = 'Streaming response...';
            app.lastEventTime = Date.now();
          } else if (state === 'final') {
            app.pushChatEvent('ok', 'Agent response complete');
          } else if (state === 'error') {
            app.pushChatEvent('error', payload.errorMessage || 'Agent error');
          } else if (state === 'aborted') {
            app.pushChatEvent('warn', 'Response aborted');
          }
        } else if (eventName === 'agent') {
          if (payload.state === 'error' || payload.error || payload.errorMessage) {
            app.pushChatEvent('error', `Agent turn: ${payload.errorMessage || payload.error || 'failed'}`);
          } else if (payload.state === 'running' || payload.tool) {
            app.pushChatEvent('info', `Agent working${payload.tool ? ': ' + payload.tool : ''}...`);
          }
        }
      });

      // Agent turn events — surface errors from the agent turn itself (model call
      // failures, tool errors, etc.) that may not produce any 'chat' events.
      // Without this, a failed model call results in dead silence in the UI.
      oc.on('agent', (payload) => {
        const sessions = Alpine.store('sessions');
        // Track that the active run is still alive (used by rate-limit retry logic)
        if (payload.run === sessions._activeRunId || payload.runId === sessions._activeRunId) {
          sessions._lastAgentEventTime = Date.now();

          // Detect run completion during rate-limit recovery: if agent events carry
          // a "done"/"completed"/"idle" state, the run finished server-side. Fetch
          // chat history to recover the response that was never streamed to us.
          // Skip if Route 2 fallback is already active — it's handling the response.
          if (sessions._rateLimitRetried && !sessions._route2Active && sessions._streamingMsg
              && (payload.state === 'done' || payload.state === 'completed' || payload.state === 'idle')) {
            Alpine.store('monitor').addLog('info', `Agent run ${payload.state} during rate-limit recovery — fetching history`);
            const sk = sessions._activeSessionKey;
            if (sk && window.openclawClient?.authenticated) {
              (async () => {
                try {
                  const history = await window.openclawClient.getHistory(sk);
                  if (Array.isArray(history) && history.length > 0) {
                    const lastAssistant = [...history].reverse().find(m =>
                      m.role === 'assistant' || m.role === 'agent'
                    );
                    if (lastAssistant && sessions._streamingMsg) {
                      const recovered = extractMessageText(lastAssistant.content);
                      if (recovered && recovered.length > 10) {
                        sessions._streamingMsg.content = recovered;
                        sessions._streamingMsg.streaming = false;
                        sessions._resetSendingState();
                        sessions._persistMessages();
                        Alpine.store('monitor').addLog('info', 'Recovered response from history after agent run completed');
                        Alpine.store('app').pushChatEvent('ok', 'Response recovered from server');
                      }
                    }
                  }
                } catch (e) {
                  Alpine.store('monitor').addLog('warn', `History fetch on run completion failed: ${e.message}`);
                }
              })();
            }
          }
        }
        // Check if the agent event carries an error state
        if (payload.state === 'error' || payload.error || payload.errorMessage) {
          const errMsg = payload.errorMessage || payload.error?.message || payload.error || 'Agent turn failed (no details)';
          Alpine.store('monitor').addLog('error', `Agent turn error: ${errMsg}`);
          // During rate-limit recovery or Route 2 fallback, agent errors from intermediate
          // model calls are expected — but if the run is ENDING, surface it.
          if (sessions._rateLimitRetried || sessions._route2Active) {
            // Check if this is a terminal agent error (run finished with failure)
            const isTerminal = payload.state === 'error' || payload.state === 'failed' || payload.state === 'done';
            if (!isTerminal) return;
            // Terminal — fall through to surface the error and clean up
            Alpine.store('monitor').addLog('warn', 'Agent run ended during rate-limit recovery — surfacing error');
            sessions._rateLimitRetried = false;
            sessions._route1Retried = false;
            sessions._rateLimitCount = 0;
            sessions._rateLimitRecoveryStart = 0;
            clearTimeout(sessions._rateLimitRecoveryTimer);
          }
          // Surface the error in the chat UI if we're waiting for a response
          if (sessions._sending && sessions._streamingMsg) {
            sessions._streamingMsg.content = `Error: ${errMsg}`;
            sessions._streamingMsg.streaming = false;
            sessions._streamingMsg = null;
            sessions._sending = false;
            sessions._sendingSessionId = null;
            sessions._stopResponsePolling();
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

        // Skip heartbeat/cron/bootstrap events — these are internal OpenClaw
        // housekeeping that should never appear in the chat UI.
        // Must match ALL patterns from _parseHistoryMessages isSystemInjection/isSystemReply.
        if (payload.label && /heartbeat|cron|system|bridge|staging/i.test(payload.label)) return;
        const _peekContent = extractMessageText(payload.message);
        if (_peekContent && (
          /^#?\s*Read HEARTBEAT/i.test(_peekContent) ||
          /^#?\s*HEARTBEAT/i.test(_peekContent) ||
          /^HEARTBEAT_OK/i.test(_peekContent) ||
          /^#?\s*Bootstrap/i.test(_peekContent) ||
          /^EXECUTE_WORKFLOW:/i.test(_peekContent) ||
          /^WRITE_FILES:/i.test(_peekContent) ||
          /^WORKFLOW_RESULT:/i.test(_peekContent) ||
          /^STAGING_APPROVED:/i.test(_peekContent) ||
          /^STAGING_REJECTED:/i.test(_peekContent) ||
          /^FILES_WRITTEN:/i.test(_peekContent) ||
          /^Current time:/i.test(_peekContent)
        )) return;

        // Debug: log payload structure for diagnosing empty responses
        if (state === 'delta' || state === 'final') {
          const extracted = extractMessageText(payload.message);
          const preview = extracted ? extracted.slice(0, 80) : '(empty)';
          // Log raw payload keys and message shape for first 5 events per run to diagnose format issues
          if (!this._chatDebugCount) this._chatDebugCount = 0;
          if (this._chatDebugCount < 5 || state === 'final') {
            this._chatDebugCount++;
            const payloadKeys = Object.keys(payload).join(',');
            const msgShape = payload.message == null ? 'null'
              : typeof payload.message === 'string' ? `str(${payload.message.length})`
              : Array.isArray(payload.message) ? `arr(${payload.message.length})`
              : `obj{${Object.keys(payload.message).join(',')}}`;
            Alpine.store('monitor').addLog('debug', `Chat ${state}: shape=${msgShape} keys=[${payloadKeys}] extracted="${preview}" run=${payload.runId || 'n/a'}`);
            // Deep log first 2 events to show exact structure
            if (this._chatDebugCount <= 2) {
              try {
                const safePayload = JSON.stringify(payload, null, 0).slice(0, 500);
                Alpine.store('monitor').addLog('debug', `Chat raw: ${safePayload}`);
              } catch {}
            }
          }
        }

        // Bug #32579: Gateway broadcasts ALL chat events to ALL connected
        // WebSocket clients. Filter by sessionKey to only process events
        // for the active chat session (or events without a sessionKey for
        // backward compatibility).
        if (payload.sessionKey && sessions._activeSessionKey
            && payload.sessionKey !== sessions._activeSessionKey) {
          Alpine.store('monitor').addLog('info', `Chat event filtered: session=${payload.sessionKey} (active=${sessions._activeSessionKey})`);
          return; // Not for our active session — ignore
        }

        // Filter by runId: only process events from our active run or retry run.
        // This prevents competing/stale runs (e.g., duplicate retry) from clobbering
        // the streaming state with empty finals.
        if (payload.runId) {
          if (sessions._activeRunId) {
            const isOurRun = payload.runId === sessions._activeRunId
              || payload.runId === sessions._retryRunId;
            if (!isOurRun) {
              Alpine.store('monitor').addLog('info', `Chat event filtered: run=${payload.runId} (active=${sessions._activeRunId}, retry=${sessions._retryRunId || 'none'})`);
              return;
            }
          } else if (!sessions._sending) {
            // Not actively waiting for a response and no tracked runId — skip stale events
            return;
          }
        }

        if (state === 'delta') {
          // Extract text from all possible payload locations
          let delta = extractMessageText(payload.message)
            || extractMessageText(payload.content)
            || extractMessageText(payload.delta)
            || extractMessageText(payload.text)
            || '';

          // Suppress OpenClaw "(no output)" placeholder from tool-only turns
          if (/^\(no output\)$/i.test(delta.trim())) delta = '';

          // Streaming content delta
          if (sessions._streamingMsg) {
            // If content is a retry/processing indicator, clear it before appending real content
            const cur = sessions._streamingMsg.content;
            if (delta && isPlaceholder(cur)) {
              sessions._streamingMsg.content = delta;
            } else {
              sessions._streamingMsg.content += delta;
            }
            sessions._scrollToBottom();
          } else if (sessions.messages.length > 0 && sessions._sending) {
            // Recovery: _streamingMsg was cleared (by error handler, timeout, or
            // rate-limit retry) but new deltas are arriving (model fallback, late
            // response, or retry run). Find or create a message to receive them.
            // Guard: only recover if _sending is still true — prevents zombie
            // deltas from reviving _streamingMsg after the safety timer cleared it.
            const lastMsg = sessions.messages[sessions.messages.length - 1];
            if (lastMsg?.role === 'agent') {
              // Strip error/placeholder prefix if the fallback is now succeeding
              if (isPlaceholder(lastMsg.content) || lastMsg.content.startsWith('[Agent completed') || lastMsg.content.startsWith('Error:')) {
                lastMsg.content = '';
              }
              lastMsg.streaming = true;
              sessions._streamingMsg = lastMsg;
              lastMsg.content += delta;
              sessions._scrollToBottom();
              Alpine.store('monitor').addLog('info', 'Recovered streaming on late delta event');
            }
          }
          return;
        }

        if (state === 'final') {
          // Chat complete — handle both normal flow and late arrivals after timeout
          let streamMsg = sessions._streamingMsg;

          // If _streamingMsg was cleared (e.g., by rate-limit retry or timeout), recover
          // by finding the last agent message that's still marked as streaming.
          if (!streamMsg) {
            const lastAgent = [...sessions.messages].reverse().find(m => m.role === 'agent' && (m.streaming || !m.content?.trim()));
            if (lastAgent) {
              streamMsg = lastAgent;
              Alpine.store('monitor').addLog('info', 'Recovered orphaned streaming message on final event');
            }
          }

          let producedContent = false;
          if (streamMsg) {
            // Strip processing/retry indicators if present
            if (isPlaceholder(streamMsg.content)) {
              streamMsg.content = '';
            }

            // Try extracting final content from ALL possible payload fields
            const finalContent = extractMessageText(payload.message)
              || extractMessageText(payload.content)
              || extractMessageText(payload.result)
              || extractMessageText(payload.text)
              || '';
            if (finalContent && !streamMsg.content.endsWith(finalContent)) {
              streamMsg.content += finalContent;
            }

            // If streaming produced no visible text, do a full history sync from the server.
            // This handles tool-only agent turns where deltas contain only tool_use/tool_result
            // blocks (which extractMessageText filters out). The server history returns tool
            // outputs as separate plain-text messages that _parseHistoryMessages renders correctly.
            if (!streamMsg.content.trim() && payload.sessionKey && window.openclawClient?.authenticated) {
              const _historyMsg = streamMsg; // capture for async
              Alpine.store('monitor').addLog('info', 'No content captured from stream — syncing full history...');
              _historyMsg.content = '...';
              (async () => {
                try {
                  const history = await window.openclawClient.getHistory(payload.sessionKey);
                  if (Array.isArray(history) && history.length > 0) {
                    const serverMessages = sessions._parseHistoryMessages(history);
                    if (serverMessages.length > 0) {
                      // Full history replacement — same as what refresh/_syncActiveSessionHistory does
                      sessions.messages = serverMessages;
                      sessions._messageStore[sessions.activeId] = sessions.messages;
                      sessions._persistMessages();
                      sessions._scrollToBottom();
                      Alpine.store('monitor').addLog('info', `Recovered ${serverMessages.length} messages from full history sync`);
                      Alpine.store('app').pushChatEvent('ok', 'Response received');
                      mcAudio.chatComplete();
                      return;
                    }
                  }
                  // History fetch found nothing — show system note
                  _historyMsg.content = '[Agent completed task with no text response.]';
                  _historyMsg._systemNote = true;
                  _historyMsg.streaming = false;
                  _historyMsg.time = timeNow();
                  sessions._persistMessages();
                } catch (e) {
                  Alpine.store('monitor').addLog('warn', `History fetch failed: ${e.message}`);
                  _historyMsg.content = '[Response not captured — try sending again.]';
                  _historyMsg._systemNote = true;
                  _historyMsg.streaming = false;
                  _historyMsg.time = timeNow();
                  sessions._persistMessages();
                }
              })();
              // Don't block — async history fetch will update the message
              producedContent = false;
            } else if (!streamMsg.content.trim()) {
              streamMsg.content = '[Agent completed task with no text response.]';
              streamMsg.streaming = false;
              streamMsg.time = timeNow();
              streamMsg._systemNote = true;
              producedContent = false;
            } else {
              streamMsg.streaming = false;
              streamMsg.time = timeNow();
              producedContent = true;
            }
            sessions._streamingMsg = null;
          }
          sessions._resetSendingState();

          // Notify user that response arrived (important for iOS PWA in background)
          if (producedContent) mcAudio.chatComplete();

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

            const tokens = payload.usage?.total_tokens
              || (payload.usage ? (payload.usage.input_tokens || 0) + (payload.usage.output_tokens || 0) : 0)
              || Math.round(((streamMsg?.content || '').length) / 4);
            const responseTimeMs = sessions._chatSendTime ? Date.now() - sessions._chatSendTime : 0;
            Alpine.store('governance').recordTask(agent.id, {
              success: true, tokens, responseTimeMs, taskType: 'chat-openclaw',
            });
          }

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

          // Rate limit handling: OpenClaw agent run failed because the LLM provider
          // returned 429. Strategy:
          //   1st hit: Wait 8s for LiteLLM's server-side fallback chain (preserves tools)
          //   2nd hit: Retry via OpenClaw (new chat.send — may hit different provider)
          //   3rd hit: Fall back to Route 2 (direct LiteLLM, no tools)
          if (isRateLimit && sessions._streamingMsg) {
            sessions._rateLimitCount = (sessions._rateLimitCount || 0) + 1;
            Alpine.store('monitor').addLog('warn', `Rate limit #${sessions._rateLimitCount} from OpenClaw`);
            Alpine.store('app').pushChatEvent('warn', '⚠️ API rate limit reached. Please try again');

            // 1st rate limit: give LiteLLM's server-side fallback chain time to cascade.
            // Server-side fallbacks (e.g. cerebras-zai-glm → gemini-pro → cerebras-gpt-oss-120b
            // → groq-llama-3.3-70b → deepseek-chat) preserve full tool access.
            if (sessions._rateLimitCount === 1 && !sessions._rateLimitRetried) {
              sessions._rateLimitRetried = true;
              sessions._streamingMsg.content = '...';
              Alpine.store('monitor').addLog('info', 'Rate limit #1 — giving OpenClaw 8s to recover via LiteLLM fallback chain');

              sessions._rateLimitRecoveryTimer = setTimeout(() => {
                if (sessions._streamingMsg && isPlaceholder(sessions._streamingMsg.content)) {
                  const lastUserMsg = [...sessions.messages].reverse().find(m => m.role === 'user');
                  if (lastUserMsg) {
                    Alpine.store('monitor').addLog('info', 'No recovery after 8s — retrying via OpenClaw');
                    // Retry via OpenClaw (Route 1 retry) — preserves tool access
                    sessions._retryViaOpenclaw(sessions._streamingMsg, lastUserMsg.content);
                  }
                }
              }, 8000);
              return;
            }

            // 2nd rate limit: retry via OpenClaw one more time (new request may hit
            // a different LiteLLM deployment). Still preserves tool access.
            if (sessions._rateLimitCount === 2 && !sessions._route1Retried) {
              sessions._route1Retried = true;
              clearTimeout(sessions._rateLimitRecoveryTimer);
              sessions._streamingMsg.content = '...';
              Alpine.store('monitor').addLog('info', 'Rate limit #2 — retrying via OpenClaw (Route 1)');
              const lastUserMsg = [...sessions.messages].reverse().find(m => m.role === 'user');
              if (lastUserMsg) {
                sessions._retryViaOpenclaw(sessions._streamingMsg, lastUserMsg.content);
              }
              return;
            }

            // 3rd+ rate limit: fall back to Route 2 (direct LiteLLM, no tools)
            clearTimeout(sessions._rateLimitRecoveryTimer);
            const lastUserMsg = [...sessions.messages].reverse().find(m => m.role === 'user');
            if (lastUserMsg && !sessions._route2Active) {
              Alpine.store('monitor').addLog('info', 'Rate limit #3+ — falling back to Route 2 (no tools)');
              sessions._fallbackToRoute2(sessions._streamingMsg, lastUserMsg.content);
              return;
            }

            // Route 2 already active or no user message — fall through to terminal error
          }

          if (sessions._streamingMsg) {
            let errText = rawErr;
            if (isRateLimit) {
              errText = 'Rate limit reached on all providers. Please try again in a minute.';
            }
            // Clean up verbose LiteLLM error messages for display
            if (/litellm\.(NotFound|BadRequest)Error/i.test(errText)) {
              const match = errText.match(/(?:Model|Provider)\s+\S+\s+(?:does not exist|not found)/i);
              errText = match ? match[0] + ' — falling back to next provider' : errText.slice(0, 200);
            }
            let prior = sessions._streamingMsg.content.trim();
            if (isPlaceholder(prior)) prior = '';
            const prefix = prior ? '\n\n' : '';
            sessions._streamingMsg.content = prior + prefix + errText;
            sessions._streamingMsg._systemNote = true;
            sessions._streamingMsg.streaming = false;
            sessions._streamingMsg = null;
          }
          sessions._resetSendingState();
          sessions._persistMessages();

          const session = sessions.active;
          const agent = Alpine.store('agents').list.find(a => a.id === session?.agentId);
          if (agent) {
            const responseTimeMs = sessions._chatSendTime ? Date.now() - sessions._chatSendTime : 0;
            Alpine.store('governance').recordTask(agent.id, {
              success: false, responseTimeMs, taskType: 'chat-openclaw',
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
        this.pushChatEvent('ok', 'Connected to OpenClaw');
      });

      oc.on('disconnect', (payload) => {
        const msg = payload.code ? `OpenClaw WS disconnected (code: ${payload.code})` : 'OpenClaw WS disconnected';
        Alpine.store('monitor').addLog('warn', msg);
        this.ocConnected = false;
        ocMode = 'fallback';
        this.pushChatEvent('error', msg);
      });

      oc.on('reconnect', () => {
        Alpine.store('monitor').addLog('info', 'OpenClaw WebSocket reconnected — agents are live');
        this.ocConnected = true;
        ocMode = 'connected';
        this.pushChatEvent('ok', 'Reconnected to OpenClaw');
        this._syncAgentsFromOpenClaw();
        this._syncSessionsFromOpenClaw();
        Alpine.store('cron').fetch();
        // Resume active chat: fetch latest messages from server.
        // This catches responses the agent sent while we were disconnected.
        Alpine.store('sessions')._syncActiveSessionHistory('reconnect');
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
      model: 'litellm/cerebras-zai-glm', systemPrompt: '', tools: [],
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
        model: 'litellm/cerebras-zai-glm', systemPrompt: '', tools: [],
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
    _activeRunId: null, // runId from last chat.send — used to filter competing run events
    _retryRunId: null, // runId from rate-limit retry chat.send
    _rateLimitCount: 0, // number of rate limit errors received during current run
    _rateLimitRecoveryTimer: null, // delayed history fetch timer during rate limit recovery
    _rateLimitRecoveryStart: 0, // timestamp when recovery polling started
    _lastAgentEventTime: 0, // timestamp of last agent event for active run
    _messageStore: {}, // sessionId -> messages[]
    _deletedKeys: new Set(), // sessionKeys deleted by user — prevents sync from re-adding them
    _route2Active: false, // true when Route 2 fallback is in progress
    _route1Retried: false, // true when Route 1 retry (re-send via OpenClaw) has been attempted

    // Atomically reset all sending/streaming/rate-limit state.
    // Called from multiple completion paths (final, error, timeout, abort, fallback).
    _resetSendingState() {
      this._streamingMsg = null;
      this._sending = false;
      this._sendingSessionId = null;
      this._activeRunId = null;
      this._retryRunId = null;
      this._rateLimitRetried = false;
      this._rateLimitCount = 0;
      this._rateLimitRecoveryStart = 0;
      this._route2Active = false;
      this._route1Retried = false;
      clearTimeout(this._rateLimitRecoveryTimer);
      this._stopResponsePolling();
    },

    // Route 1 retry: re-send via OpenClaw WebSocket. A new chat.send triggers a
    // fresh LiteLLM request that may hit a different provider in the fallback chain.
    // This preserves full tool access (write, read, exec, etc.) unlike Route 2.
    async _retryViaOpenclaw(botMsg, originalText) {
      if (!window.openclawClient?.authenticated || !this._activeSessionKey) {
        // OpenClaw unavailable — skip to Route 2
        Alpine.store('monitor').addLog('warn', 'OpenClaw unavailable for Route 1 retry — falling back to Route 2');
        this._fallbackToRoute2(botMsg, originalText);
        return;
      }

      try {
        botMsg.content = '...';
        this._scrollToBottom();

        // Re-attach streaming to the existing bot message
        this._streamingMsg = botMsg;

        // Send a new chat.send — OpenClaw will route to LiteLLM which picks
        // the next available provider. The response arrives via the existing
        // chat event handler (same sessionKey).
        const retryResult = await window.openclawClient.sendChat(originalText, {
          sessionKey: this._activeSessionKey,
        });
        this._retryRunId = retryResult?.runId || retryResult?.idempotencyKey || null;
        Alpine.store('monitor').addLog('info', `Route 1 retry sent (runId: ${this._retryRunId || 'pending'})`);

        // Give the retry 12s to produce content before falling back to Route 2
        this._rateLimitRecoveryTimer = setTimeout(() => {
          if (this._streamingMsg && isPlaceholder(this._streamingMsg.content)) {
            Alpine.store('monitor').addLog('info', 'Route 1 retry: no content after 12s — falling back to Route 2');
            this._fallbackToRoute2(botMsg, originalText);
          }
        }, 12000);
      } catch (e) {
        Alpine.store('monitor').addLog('warn', `Route 1 retry failed: ${e.message} — falling back to Route 2`);
        this._fallbackToRoute2(botMsg, originalText);
      }
    },

    // Route 2 fallback: when OpenClaw agent runs fail with rate limits,
    // bypass OpenClaw and call LiteLLM directly with model rotation.
    // Tries models from different providers to find one that works.
    async _fallbackToRoute2(botMsg, originalText) {
      if (this._route2Active) return; // prevent double-fire
      this._route2Active = true;

      // Models to try, ordered by provider diversity (skip the one that just failed)
      const session = this.active;
      const agent = Alpine.store('agents').list.find(a => a.id === session?.agentId);
      const primaryModel = (agent?.model || '').replace(/^litellm\//, '');
      // Ordered by reliability: gemini (confirmed working), cerebras scout,
      // groq (has errors but worth trying), mistral, deepseek (cheap paid last resort)
      const fallbackModels = [
        'gemini-flash',
        'gemini-flash-lite',
        'cerebras-llama-4-scout',
        'cerebras-zai-glm',
        'groq-llama-3.3-70b',
        'mistral-small',
        'mistral-large',
        'deepseek-chat',
      ].filter(m => m !== primaryModel);

      // Abort the stuck OpenClaw run
      if (this._activeRunId && this._activeSessionKey && window.openclawClient?.authenticated) {
        window.openclawClient.abortChat(this._activeSessionKey, this._activeRunId).catch(() => {});
      }

      // Clear OpenClaw streaming state (but keep _sending=true for Route 2)
      this._streamingMsg = null;
      this._rateLimitRetried = false;
      this._route1Retried = false;
      this._rateLimitCount = 0;
      this._rateLimitRecoveryStart = 0;
      clearTimeout(this._rateLimitRecoveryTimer);
      this._stopResponsePolling();

      // Build messages for Route 2 (no tool access — plain text completion only)
      const apiMessages = [];
      if (agent?.systemPrompt) {
        // Strip tool/file-writing instructions from the system prompt since Route 2
        // is a raw LiteLLM chat completion with NO tools (write, read, exec, etc.).
        // Without this, the model narrates "I wrote file X" instead of answering directly.
        const route2Prefix = `[IMPORTANT: You are responding via a direct text fallback. You do NOT have access to any tools (write, read, exec, sessions_send, cron, etc.) in this mode. Do NOT describe writing files, updating JSON, or performing tool actions — just answer the user's question directly with your best response. Keep your answer helpful and concise.]

`;
        apiMessages.push({ role: 'system', content: route2Prefix + agent.systemPrompt });
      }
      for (const msg of this.messages) {
        if (msg === botMsg) continue; // skip the placeholder
        apiMessages.push({
          role: msg.role === 'agent' ? 'assistant' : msg.role,
          content: msg.content,
        });
      }

      botMsg.content = '...';

      for (const model of fallbackModels) {
        try {
          Alpine.store('monitor').addLog('info', `Route 2 fallback: trying ${model}...`);
          Alpine.store('app').pushChatEvent('info', `Trying fallback: ${model}`);
          botMsg.content = '...';
          this._scrollToBottom();

          let content = '';
          for await (const delta of litellmApi.streamChat(model, apiMessages)) {
            if (!content && isPlaceholder(botMsg.content)) {
              botMsg.content = ''; // clear placeholder on first real content
            }
            content += delta;
            botMsg.content = content;
            this._scrollToBottom();
          }

          if (content.trim()) {
            botMsg.streaming = false;
            botMsg.time = timeNow();
            this._resetSendingState();
            this._persistMessages();
            Alpine.store('monitor').addLog('info', `Route 2 success with ${model} (${content.length} chars)`);
            Alpine.store('app').pushChatEvent('ok', `Response via ${model} (fallback)`);
            mcAudio.chatComplete();

            if (agent) {
              agent.tasksCompleted++;
              agent.lastActive = 'Just now';
              Alpine.store('agents')._persist();
              const responseTimeMs = this._chatSendTime ? Date.now() - this._chatSendTime : 0;
              Alpine.store('governance').recordTask(agent.id, {
                success: true,
                tokens: Math.round(content.length / 4),
                responseTimeMs,
                taskType: 'chat-litellm-fallback',
              });
            }
            return;
          }
        } catch (e) {
          Alpine.store('monitor').addLog('warn', `Route 2 ${model} failed: ${e.message}`);
        }
      }

      // All models failed
      botMsg.content = 'All providers unavailable — check Activity tab for details.';
      botMsg.streaming = false;
      botMsg.time = timeNow();
      this._resetSendingState();
      this._persistMessages();
      Alpine.store('monitor').addLog('error', 'Route 2 fallback: all models exhausted');
      Alpine.store('app').pushChatEvent('error', 'All providers failed — check API keys');
      mcAudio.taskFail();
    },

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
      } else if (sel?.agentId) {
        // Construct sessionKey from agentId when server hasn't synced it yet
        this._activeSessionKey = 'agent:' + sel.agentId + ':main';
        sel.sessionKey = this._activeSessionKey;
      }

      // ALWAYS try loading from OpenClaw server first when connected.
      // Server is the source of truth — in-memory cache may be stale
      // (e.g., agent responded while tab was backgrounded).
      if (ocMode === 'connected' && window.openclawClient?.authenticated) {
        try {
          const session = this.list.find(s => s.id === id);
          const historyKey = session?.sessionKey || (session?.agentId ? 'agent:' + session.agentId + ':main' : null);
          if (!historyKey) throw new Error('No sessionKey or agentId for history load');
          const history = await window.openclawClient.getHistory(historyKey);
          if (history && history.length > 0) {
            this.messages = this._parseHistoryMessages(history);
            this._messageStore[id] = this.messages;
            Alpine.store('monitor').addLog('info', `Loaded ${this.messages.length} messages from OpenClaw`);
            this._scrollToBottom();
            return;
          }
        } catch (err) {
          console.warn('[Sessions] OpenClaw history load failed:', err.message);
          // Fall through to cache/localStorage
        }
      }

      // Fallback: check in-memory cache
      if (this._messageStore[id] && this._messageStore[id].length > 0) {
        this.messages = this._messageStore[id];
        return;
      }

      // Fallback: load from localStorage
      this.messages = this._loadMessages(id);
      this._messageStore[id] = this.messages;
    },

    // -----------------------------------------------------------------------
    // SERVER HISTORY SYNC — the core of reliable chat
    // -----------------------------------------------------------------------
    // Instead of depending solely on live WebSocket streaming events,
    // we periodically reconcile with the server's chat history. This makes
    // the chat work like iMessage: always shows the latest server state.

    // Convert server history messages to our local format
    _parseHistoryMessages(history) {
      const raw = history
        .filter(m => {
          // Skip tool_result messages entirely — they're internal tool execution
          if (m.role === 'tool') return false;
          return true;
        })
        .map(m => {
          const content = extractMessageText(m.content);
          let role = m.role === 'assistant' ? 'agent' : m.role;
          const isSystemInjection = role === 'user' && (
            /^#?\s*Read HEARTBEAT/i.test(content) ||
            /^#?\s*HEARTBEAT/i.test(content) ||
            /^#?\s*Bootstrap/i.test(content) ||
            /^EXECUTE_WORKFLOW:/i.test(content) ||
            /^WRITE_FILES:/i.test(content) ||
            /^WORKFLOW_RESULT:/i.test(content) ||
            /^STAGING_APPROVED:/i.test(content) ||
            /^STAGING_REJECTED:/i.test(content) ||
            /^FILES_WRITTEN:/i.test(content) ||
            /^Current time:/i.test(content) ||
            (m.label && /heartbeat|cron|system|bridge|staging/i.test(m.label))
          );
          if (isSystemInjection) role = 'system';
          // Also hide agent replies to system bridge messages
          const isSystemReply = role === 'agent' && (
            /^FILES_WRITTEN:/i.test(content) ||
            /^GOVERNANCE_ADJUST:/i.test(content) ||
            /^HEARTBEAT_OK/i.test(content) ||
            (content.length < 60 && /^(ok|done|acknowledged|noted|understood)/i.test(content))
          );
          if (isSystemReply) role = 'system';
          // Hide OpenClaw "(no output)" placeholder messages from tool-only turns
          const isNoOutput = role === 'agent' && /^\(no output\)$/i.test(content.trim());
          if (isNoOutput) role = 'system';
          const isTool = role === 'agent' && _isToolOutput(content);
          return {
            id: m.id || generateId(),
            role,
            content,
            time: m.time || m.timestamp || '',
            _toolOutput: isTool,
          };
        })
        .filter(m => m.role !== 'system' && (m.role === 'user' || m.content.trim()));

      // Group consecutive agent tool-output messages into one collapsed bubble.
      // This prevents 5-10 separate JSON/status bubbles from flooding the chat.
      const grouped = [];
      let toolBatch = [];
      const flushToolBatch = () => {
        if (toolBatch.length === 0) return;
        if (toolBatch.length === 1) {
          // Single tool msg — keep as-is, formatChatMessage will collapse it
          grouped.push(toolBatch[0]);
        } else {
          // Multiple consecutive tool outputs → merge into one
          const merged = toolBatch.map(m => m.content).join('\n---\n');
          grouped.push({
            id: toolBatch[0].id,
            role: 'agent',
            content: merged,
            time: toolBatch[toolBatch.length - 1].time,
            _toolOutput: true,
            _toolCount: toolBatch.length,
          });
        }
        toolBatch = [];
      };
      for (const m of raw) {
        if (m._toolOutput) {
          toolBatch.push(m);
        } else {
          flushToolBatch();
          grouped.push(m);
        }
      }
      flushToolBatch();
      return grouped;
    },

    // Sync the active session's messages from the server.
    // Called on: reconnect, visibility resume, polling timer, manual refresh.
    // Debounced: prevents concurrent calls from clobbering each other.
    _syncInFlight: false,
    async _syncActiveSessionHistory(trigger) {
      const sk = this._activeSessionKey;
      if (!sk || !window.openclawClient?.authenticated) return;
      // Prevent concurrent sync calls (polling + visibility can overlap)
      if (this._syncInFlight) return;
      this._syncInFlight = true;

      try {
        const history = await window.openclawClient.getHistory(sk);
        if (!Array.isArray(history) || history.length === 0) return;

        const serverMessages = this._parseHistoryMessages(history);
        if (serverMessages.length === 0) return;

        // Find the last agent message from the server
        const lastServerAgent = [...serverMessages].reverse().find(m => m.role === 'agent');
        const lastServerUser = [...serverMessages].reverse().find(m => m.role === 'user');

        // If we're currently streaming and have REAL content (not a placeholder),
        // don't clobber it — live deltas take priority over history polling.
        if (this._streamingMsg && this._streamingMsg.content
            && !isPlaceholder(this._streamingMsg.content)
            && this._streamingMsg.content.length > 0) {
          return;
        }

        // If we're waiting for a response (_sending=true) and server has an agent reply
        // after our last user message, we got the response — populate it.
        if (this._sending && this._streamingMsg && lastServerAgent) {
          const serverAgentContent = lastServerAgent.content.trim();
          // Server has a real response (not empty, not an error placeholder)
          if (serverAgentContent.length > 10) {
            // Verify this is a response to our message (appears after last user msg in history)
            const agentIdx = serverMessages.lastIndexOf(lastServerAgent);
            const userIdx = lastServerUser ? serverMessages.lastIndexOf(lastServerUser) : -1;
            if (agentIdx > userIdx) {
              Alpine.store('monitor').addLog('info', `History sync (${trigger}): recovered agent response (${serverAgentContent.length} chars)`);
              this._streamingMsg.content = serverAgentContent;
              this._streamingMsg.streaming = false;
              this._resetSendingState();
              this._persistMessages();
              Alpine.store('app').pushChatEvent('ok', 'Response received');
              mcAudio.chatComplete();
              return;
            }
          }
        }

        // Not waiting for a response — just refresh messages from server
        // if the server has more messages than we do (agent worked in background).
        if (!this._sending && serverMessages.length > this.messages.length) {
          Alpine.store('monitor').addLog('info', `History sync (${trigger}): updating ${this.messages.length} → ${serverMessages.length} messages`);
          this.messages = serverMessages;
          this._messageStore[this.activeId] = this.messages;
          this._persistMessages();
          this._scrollToBottom();
        }
      } catch (err) {
        // Don't spam errors for routine sync failures (e.g. during reconnect race)
        if (trigger !== 'poll') {
          Alpine.store('monitor').addLog('warn', `History sync (${trigger}) failed: ${err.message}`);
        }
      } finally {
        this._syncInFlight = false;
      }
    },

    // Start polling for the active session while waiting for a response.
    // Polls every 5s — catches responses missed due to WS issues, rate limits,
    // iOS background suspension, etc.
    _startResponsePolling() {
      this._stopResponsePolling();
      this._responsePollTimer = setInterval(() => {
        if (this._sending && this._activeSessionKey) {
          this._syncActiveSessionHistory('poll');
        } else {
          // No longer waiting — stop polling
          this._stopResponsePolling();
        }
      }, 5000);
    },

    _stopResponsePolling() {
      if (this._responsePollTimer) {
        clearInterval(this._responsePollTimer);
        this._responsePollTimer = null;
      }
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
            window.openclawClient.resetSession(sessionKey, 'user-request').catch(e => {
              console.warn('[Sessions] Server reset failed:', e.message);
            });
          }
          // Clear local messages and set active session key for event filtering
          this.messages = [];
          this._messageStore[existing.id] = [];
          this._activeSessionKey = sessionKey;
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
            reason: 'user-request',
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

      // If this was the active session, switch to another and update event routing
      if (this.activeId === sessionId) {
        this.activeId = this.list[0]?.id || null;
        this.messages = this.activeId ? (this._messageStore[this.activeId] || []) : [];
        // Update _activeSessionKey to the new active session (or clear it)
        const newActive = this.list.find(s => s.id === this.activeId);
        this._activeSessionKey = newActive?.sessionKey || null;
      }
      this._persist();
      Alpine.store('monitor').addLog('info', `Deleted conversation with ${session.agentName}`);
    },

    async abortCurrentRun() {
      if (!this._sending) return;
      const sk = this._activeSessionKey;
      const runId = this._activeRunId;
      // Try server-side abort
      if (sk && window.openclawClient?.authenticated) {
        try {
          await window.openclawClient.abortChat(sk, runId);
          Alpine.store('monitor').addLog('info', `Aborted run ${runId || 'unknown'}`);
        } catch (e) {
          Alpine.store('monitor').addLog('warn', `Abort RPC failed: ${e.message}`);
        }
      }
      // Clean up client-side streaming state
      if (this._streamingMsg) {
        const cur = this._streamingMsg.content;
        if (!cur || isPlaceholder(cur)) {
          this._streamingMsg.content = '(Stopped by user)';
        }
        this._streamingMsg.streaming = false;
      }
      this._resetSendingState();
      this._persistMessages();
      Alpine.store('app').pushChatEvent('warn', 'Response stopped');
    },

    async sendMessage() {
      const text = this.input.trim();
      if (!text || !this.activeId) return;
      // Only block if we're waiting for a response in THIS session
      if (this._sending && this._sendingSessionId === this.activeId) return;

      // Reset state for new message (clears any lingering rate-limit/fallback state)
      this._rateLimitRetried = false;
      this._route1Retried = false;
      this._rateLimitCount = 0;
      this._route2Active = false;
      clearTimeout(this._rateLimitRecoveryTimer);

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
      this._chatSendTime = Date.now();

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
          if (!session?.sessionKey && !agent?.id) {
            throw new Error('No agent selected — cannot determine session key');
          }
          const sessionKey = session?.sessionKey || 'agent:' + agent.id + ':main';
          if (!isValidSessionKey(sessionKey)) {
            throw new Error(`Invalid session key format: "${sessionKey}" — expected agent:<id>:main`);
          }
          // Store sessionKey back on session if it was missing
          if (session && !session.sessionKey) session.sessionKey = sessionKey;
          // Track active session key for event filtering (Bug #32579:
          // gateway broadcasts ALL chat events to ALL clients)
          this._activeSessionKey = sessionKey;

          const sendResult = await window.openclawClient.sendChat(messageText, { sessionKey });
          // Track the active runId so we can filter chat events from competing/stale runs.
          // Server may return runId in response, or we use our idempotencyKey (attached by sendChat).
          this._activeRunId = sendResult?.runId || sendResult?._idempotencyKey || null;
          this._retryRunId = null;
          this._lastAgentEventTime = 0;
          Alpine.store('monitor').addLog('info', `chat.send accepted (session=${sessionKey}, runId=${this._activeRunId || 'n/a'})`);
          Alpine.store('app').pushChatEvent('info', `Message sent to ${session?.agentName || 'agent'}`);
          // Response will arrive via events (chat.delta, chat.complete)
          // handled by _setupOpenClawEvents in the app store.
          // ALSO start polling server history as a safety net — catches responses
          // missed due to WS disconnects, rate limits, or iOS background suspension.
          this._startResponsePolling();

          // Processing indicator after 15s of no content
          const _processingTimer = setTimeout(() => {
            if (this._sending && this._streamingMsg === botMsg && !botMsg.content.trim()) {
              botMsg.content = '...';
              this._scrollToBottom();
            }
          }, 15000);

          // Safety timeout: 120s max wait. Try history recovery, then give up.
          const _safetyTimer = setTimeout(async () => {
            if (!this._sending || this._streamingMsg !== botMsg) return;
            // Skip if Route 2 fallback is handling it
            if (this._route2Active) return;

            const hadContent = botMsg.content.trim() && !isPlaceholder(botMsg.content);

            // Try history recovery as last resort
            if (!hadContent && this._activeSessionKey && window.openclawClient?.authenticated) {
              try {
                const history = await window.openclawClient.getHistory(this._activeSessionKey);
                const lastAssistant = [...(history || [])].reverse().find(m =>
                  m.role === 'assistant' || m.role === 'agent'
                );
                const recovered = lastAssistant && extractMessageText(lastAssistant.content);
                if (recovered && recovered.length > 10) {
                  botMsg.content = recovered;
                  botMsg.streaming = false;
                  this._resetSendingState();
                  this._persistMessages();
                  Alpine.store('monitor').addLog('info', 'Recovered response from history on safety timeout');
                  clearTimeout(_processingTimer);
                  return;
                }
              } catch (e) {
                Alpine.store('monitor').addLog('warn', `History recovery failed: ${e.message}`);
              }
            }

            // Give up
            if (!hadContent) botMsg.content = 'No response received — try sending again.';
            botMsg.streaming = false;
            this._resetSendingState();
            this._persistMessages();
            Alpine.store('monitor').addLog('warn', hadContent
              ? 'Chat timed out after 120s (partial content received)'
              : 'Chat timed out after 120s — no response received');
            clearTimeout(_processingTimer);
          }, 120000);
        } catch (e) {
          botMsg.content = 'Error: ' + e.message;
          botMsg.streaming = false;
          this._resetSendingState();
          Alpine.store('monitor').addLog('error', `OpenClaw chat error: ${e.message}`);
        }
        return;
      }

      // Route 2: Direct LiteLLM streaming (fallback when OpenClaw WS unavailable)
      if (!Alpine.store('app').demoMode) {
        const agent = Alpine.store('agents').list.find(a => a.id === session?.agentId);
        // Strip provider prefix — LiteLLM expects bare aliases (e.g. groq-llama-3.3-70b)
        const rawModel = agent?.model || 'litellm/cerebras-llama-3.3-70b';
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

          const responseTimeMs = this._chatSendTime ? Date.now() - this._chatSendTime : 0;
          Alpine.store('governance').recordTask(agent.id, {
            success: !isError, tokens, responseTimeMs, taskType: 'chat-litellm',
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
    activeId: storage.load('workflows-activeId', null),
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
      storage.save('workflows-activeId', wf.id);
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
      storage.save('workflows-activeId', id);
      const data = localStorage.getItem('mc-workflow-' + id);
      if (data && window.workflowGraph) {
        try {
          window.workflowGraph.configure(JSON.parse(data));
          this._lastSerialized = data;
          // Force canvas redraw after loading graph data
          if (window.workflowCanvas) {
            window.workflowCanvas.setDirty(true, true);
            window.workflowCanvas.draw(true, true);
          }
        } catch (e) {
          Alpine.store('monitor').addLog('error', `Failed to load workflow: ${e.message}`);
        }
      } else if (window.workflowGraph) {
        window.workflowGraph.clear();
        this._lastSerialized = null;
        if (window.workflowCanvas) {
          window.workflowCanvas.setDirty(true, true);
        }
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
        storage.save('workflows-activeId', null);
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
            model: (agent?.model || 'unknown').replace('litellm/', ''),
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
    _rejectingId: null,  // id of item being rejected (inline form)
    _rejectReason: '',   // rejection reason text

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
        window.openclawClient.injectChat(
          `STAGING_APPROVED: ${item.name} (${item.path}) has been approved by the owner. Please update /workspace/staging/index.json to set status to "approved".`,
          { sessionKey: 'agent:' + agentId + ':main', label: 'system-staging' }
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
        window.openclawClient.injectChat(
          `STAGING_REJECTED: ${item.name} rejected. Reason: ${reason || 'Not specified'}. Please revise and update /workspace/staging/index.json.`,
          { sessionKey: 'agent:' + agentId + ':main', label: 'system-staging' }
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
  // STORE: ACTIVITY — comprehensive mission control event feed
  // --------------------------------------------------------------------------
  // Two data sources:
  // 1. Server-side log.json (polled) — events agents wrote while browser closed
  // 2. Live WS events (pushed) — real-time tool calls, comms, errors, file ops
  // --------------------------------------------------------------------------

  Alpine.store('activity', {
    events: [],        // { time, level, type, message, agent, detail?, source }
    liveEvents: [],    // WS events captured in real-time (survives poll merge)
    newCount: 0,       // events since last dismissal
    filter: 'all',     // filter key
    agentFilter: 'all', // 'all' | specific agent id
    _pollTimer: null,
    _lastFetchTime: 0,
    _maxEvents: 500,

    get filtered() {
      let list = this.events;
      // Agent filter
      if (this.agentFilter !== 'all') {
        list = list.filter(e => e.agent === this.agentFilter);
      }
      // Type filter
      if (this.filter === 'all') return list;
      if (this.filter === 'error') return list.filter(e => e.level === 'error' || e.type === 'error');
      return list.filter(e => e.type === this.filter);
    },

    get agents() {
      // Unique agents that have events, for filter dropdown
      const seen = new Set();
      for (const e of this.events) {
        if (e.agent) seen.add(e.agent);
      }
      return [...seen].sort();
    },

    // Push a live event from WS (tool call, chat, error, etc.)
    pushEvent(ev) {
      const event = {
        time: ev.time || Date.now(),
        level: ev.level || 'info',
        type: ev.type || 'system',
        message: ev.message || '',
        agent: ev.agent || '',
        detail: ev.detail || '',
        source: 'live',
      };
      this.events.unshift(event);
      this.liveEvents.unshift(event);
      // Cap size
      if (this.events.length > this._maxEvents) this.events.length = this._maxEvents;
      if (this.liveEvents.length > 200) this.liveEvents.length = 200;
      // Update badge
      const lastSeen = parseInt(localStorage.getItem('mc-last-activity-seen') || '0');
      if (event.time > lastSeen) {
        this.newCount++;
        mcAudio.activityEvent();
      }
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

        if (serverEvents.length > 0 && serverEvents[0]?.time !== this._lastFetchTime) {
          const prevCount = this.newCount;
          this._lastFetchTime = serverEvents[0].time;

          // Merge server events with live WS events (dedup by time+message)
          const serverMapped = serverEvents.slice(0, 200).map(e => ({
            time: e.time || Date.now(),
            level: e.level || 'info',
            type: e.type || 'unknown',
            message: e.message || '',
            agent: e.agent || e.createdBy || '',
            detail: e.detail || '',
            source: 'server',
          }));
          // Combine: live events + server events, dedup, sort newest first
          const combined = new Map();
          for (const e of this.liveEvents) combined.set(e.time + '|' + e.message, e);
          for (const e of serverMapped) {
            const key = e.time + '|' + e.message;
            if (!combined.has(key)) combined.set(key, e);
          }
          this.events = [...combined.values()]
            .sort((a, b) => b.time - a.time)
            .slice(0, this._maxEvents);

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
        'comms': 'text-violet-400',
        'tool': 'text-blue-400',
        'file-op': 'text-teal-400',
        'chat': 'text-cyan-400',
        'error': 'text-red-400',
        'rate-limit': 'text-orange-400',
        'system': 'text-mc-text-muted',
      };
      return colors[type] || 'text-mc-text-muted';
    },

    typeLabel(type) {
      const labels = {
        'task-complete': 'Task',
        'workflow-complete': 'Workflow',
        'staging-new': 'Staging',
        'comms': 'Comms',
        'tool': 'Tool',
        'file-op': 'File',
        'chat': 'Chat',
        'error': 'Error',
        'rate-limit': 'Rate Limit',
        'system': 'System',
      };
      return labels[type] || type;
    },

    typeIcon(type) {
      const icons = {
        'task-complete': '\u2705', 'workflow-complete': '\u26A1',
        'staging-new': '\uD83D\uDCE6', 'comms': '\uD83D\uDCAC',
        'tool': '\uD83D\uDD27', 'file-op': '\uD83D\uDCC4',
        'chat': '\uD83D\uDDE8\uFE0F', 'error': '\u274C',
        'rate-limit': '\u23F3', 'system': '\u2699\uFE0F',
      };
      return icons[type] || '\u2022';
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
