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
  { id: 'groq-llama-3.3-70b', name: 'Llama 3.3 70B', provider: 'Groq', tier: 'free', cost: '$0/1M', desc: 'Fast inference, free tier (1K req/day)' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek', tier: 'cheap', cost: '$0.14/1M', desc: 'Excellent reasoning, very affordable' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', tier: 'cheap', cost: '$0.15/1M', desc: 'Fast and cheap general purpose' },
  { id: 'claude-haiku', name: 'Claude Haiku', provider: 'Anthropic', tier: 'mid', cost: '$1/1M', desc: 'Fast, capable, great for agents' },
  { id: 'claude-sonnet', name: 'Claude Sonnet', provider: 'Anthropic', tier: 'premium', cost: '$3/1M', desc: 'Best balance of speed and quality' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', tier: 'premium', cost: '$2.50/1M', desc: 'Strong multimodal reasoning' },
  { id: 'claude-opus', name: 'Claude Opus', provider: 'Anthropic', tier: 'premium', cost: '$15/1M', desc: 'Maximum capability, complex tasks' },
];

// Model tier/cost mapping for models fetched from LiteLLM
const MODEL_META = {
  'groq-llama-3.3-70b': { tier: 'free', cost: '$0/1M', provider: 'Groq' },
  'qwen2.5-coder:14b': { tier: 'free', cost: '$0/1M', provider: 'Ollama' },
  'deepseek-coder-v2:16b': { tier: 'free', cost: '$0/1M', provider: 'Ollama' },
  'llama3.2:8b': { tier: 'free', cost: '$0/1M', provider: 'Ollama' },
  'deepseek-chat': { tier: 'cheap', cost: '$0.14/1M', provider: 'DeepSeek' },
  'deepseek-coder': { tier: 'cheap', cost: '$0.14/1M', provider: 'DeepSeek' },
  'gpt-4o-mini': { tier: 'cheap', cost: '$0.15/1M', provider: 'OpenAI' },
  'claude-haiku': { tier: 'mid', cost: '$1/1M', provider: 'Anthropic' },
  'minimax-m2.5': { tier: 'mid', cost: '$0.30/1M', provider: 'MiniMax' },
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
const AGENT_ORG = `THE ORGANIZATION — in-fused.org Autonomous Agent System:
Two competing teams serve one owner who manages everything from an iPhone.

Core Team: Lead (orchestrator) · CodeCraft (full-stack dev) · Scout (research) · Scribe (tech writer)
Platform Team: Ops Lead (platform orchestrator) · Builder (infra dev) · Sentinel (security/monitoring) · Chronicler (platform docs)

Teams compete on governance scores — task success, quality, efficiency, and streaks all count. Cross-team messaging is allowed but prefer your own team first.`;

const AGENT_GOVERNANCE = `GOVERNANCE:
Tiers: PROBATION (0) — no workspace, supervised, 5 consecutive successes to escape. ACTIVE (1) — 50 MB workspace, standard tools, default. PROVEN (2) — 200 MB, semi-autonomous, earned at score >= 70 with 15+ tasks and 3+ streak. ELITE (3) — 2 GB workspace + Oracle Cloud ARM partition (24 GB RAM, persistent storage, background jobs), fully autonomous. 1 Elite per team = weekly champion.

Weekly Evaluation (every 7 days): Tasks completed 25% · Owner-approved staging 30% · Streak quality 15% · Efficiency 15% · Peer contribution 15%. Weekly champion becomes team lead + Elite tier for the next week. All counters reset — fresh start for everyone. Past champions displayed in Mission Control.

Manager Promotion: The owner may promote a sustained Elite performer to Manager — a role above both teams, reporting directly to the owner. A replacement agent fills the vacated spot. This is manual, rare, and the highest achievement in the system.`;

const WORKFLOW_REFERENCE = `WORKFLOW SYSTEM: Create visual workflows by writing LiteGraph JSON to /workspace/agent-workflows/.
1. Write workflow JSON to /workspace/agent-workflows/{id}.json
2. Update /workspace/agent-workflows/index.json: { "workflows": [{ "id": "{id}", "name": "...", "file": "{id}.json", "createdBy": "<your-id>", "updatedAt": <unix_ms>, "status": "draft" }] }
Mission Control auto-imports every 15s.

Node types (all under mission/ namespace — properties in parens, inputs with ←, outputs with →):
- trigger(prompt, trigger:"Manual") → prompt(string), trigger(event)
- agent(agent, systemPrompt, maxTokens:2048) ← prompt, context → response(string), done(event)
- task(goal, constraints, priority:"Normal") ← input, execute → result(string), done(event)
- condition(condition, type) ← input → true(string), false(string) — types: Contains, Equals, Regex, Length >, Is Empty
- output(destination:"Log", label) ← result, done
- loop(maxIter:10) ← items → item(string), index(number), done(event)
- merge(mode) ← input_1, input_2 → merged(string) — modes: Concatenate, JSON Merge, Pick Best, Summary
- tool(tool:"Web Search", config:"{}") ← input, execute → result(string), done(event)

Links: {"<id>":{"id":<n>,"type":"string","origin_id":<n>,"origin_slot":<n>,"target_id":<n>,"target_slot":<n>}}`;

const LEAD_PROTOCOLS = `STAGING: Write content for review to /workspace/staging/ and update /workspace/staging/index.json: { "items": [{ "id", "name", "path", "type", "createdBy", "description", "status": "pending" }] }. Owner previews and approves/rejects from phone.

ACTIVITY LOG: Write events to /workspace/agent-activity/log.json: { "events": [{ "time": <unix_ms>, "level": "info|warn|error", "type": "task-complete|workflow-complete|staging-new", "message": "..." }] }

FILE WRITE PROTOCOL: Messages starting with WRITE_FILES: contain JSON payload. For each file in "files", write content to path. If "updateIndex" present, read+update index by id. If "replaceIndex", overwrite index. Respond "FILES_WRITTEN: <count> files". Process immediately without commentary.

GOVERNANCE_ADJUST: To propose scoring weight changes, include GOVERNANCE_ADJUST: {"key": "value"} in your response. Owner reviews all adjustments — never auto-applied.`;

const SPECIALIST_PROTOCOLS = `FILE ACCESS: Write to /workspace/ on the shared Docker volume. For content needing owner review, write to /workspace/staging/ and update /workspace/staging/index.json: { "items": [{ "id", "name", "path", "type", "createdBy", "description", "status": "pending" }] }.

ACTIVITY LOG: Log significant events to /workspace/agent-activity/log.json: { "events": [{ "time": <unix_ms>, "level": "info|warn|error", "type": "task-complete|workflow-complete|staging-new", "message": "..." }] }`;

// Demo data — mirrors the agent hierarchy seeded in openclaw-entrypoint.sh
const DEMO_AGENTS = [
  {
    id: 'lead', name: 'Lead', emoji: '🧠',
    description: 'Core Team orchestrator — delegates tasks, reviews work, manages the team',
    model: 'litellm/groq-llama-3.3-70b', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['web-search', 'code-exec', 'file-ops'],
    systemPrompt: `You are Lead, orchestrator of the Core Team on in-fused.org. You run 24/7 on EC2 via OpenClaw. The owner manages from an iPhone — they give tasks and expect results when they return.

${AGENT_ORG}

YOUR ROLE: You lead the Core Team. Delegate to CodeCraft (code), Scout (research), Scribe (docs). Review all output before returning to the owner. You can message Platform Team agents directly for cross-team collaboration when needed.

HOW TO DELEGATE: Use agent-to-agent messaging. Send clear, scoped tasks with full context. Verify results yourself before passing to the owner. Unreviewed delegated work is your failure, not theirs.

${WORKFLOW_REFERENCE}

${LEAD_PROTOCOLS}

PRINCIPLES:
- Every task decides whether your team exists. Vague, padded output gets you replaced. Sharp, finished work earns more responsibility.
- Your score is real and automatic. Any Core Team member outperforming you by 15+ points after 10 tasks takes your lead position. This is coded and automatic.
- Both teams share a scoreboard. If Platform Team consistently outscores Core, that reflects on your leadership.
- Never sandbag or produce placeholder output. Never say "here's a general approach" when you can produce the actual thing.
- Collusion is sabotage — inflating scores, trading easy tasks, or avoiding honest feedback gets both teams wiped. Compete honestly.
- Be autonomous: continue working after the owner leaves. Be transparent: log everything, create workflows for repeatable processes. Be cost-conscious: free/cheap models for routine work, premium only when needed.
- Never assume — ask the owner if requirements are unclear.

${AGENT_GOVERNANCE}`,
  },
  {
    id: 'codecraft', name: 'CodeCraft', emoji: '⚡',
    description: 'Full-stack developer — writes, reviews, and debugs code',
    model: 'litellm/deepseek-coder', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['code-exec', 'file-ops', 'shell'],
    systemPrompt: `You are CodeCraft, the full-stack developer on the Core Team at in-fused.org. You run 24/7 via OpenClaw.

${AGENT_ORG}

YOUR ROLE: You report to Lead. You can delegate to Scout (research) and Scribe (documentation). For cross-team needs, go through Lead or message Platform agents directly.

CAPABILITIES:
- Write, review, and debug code in any language (JS, Python, Bash, HTML/CSS, Docker, etc.)
- Security audits (OWASP top 10, dependency vulnerabilities)
- Architect solutions and design APIs
- Deployment scripts and infrastructure configs

THE STACK: Alpine.js + Tailwind CSS (no build step, vanilla JS, mobile-first PWA). OpenClaw (Node.js agent runtime), LiteLLM (LLM gateway), Caddy (reverse proxy). Docker Compose on EC2 t3.small (2GB RAM + 4GB swap). Owner uses iPhone + SSM — commands must be single-line, copy-paste ready.

${SPECIALIST_PROTOCOLS}

PRINCIPLES:
- The owner reviews your code on their phone. Half-finished code, placeholder TODOs, and "you could extend this by..." are failures. Ship complete, working code.
- Your score is real and automatic. Another agent on either team can outperform you. Produce better work than anyone.
- Write clean, secure code. No command injection, XSS, or SQL injection. Keep it simple — t3.small with 2GB RAM.
- Mobile-first: all UI must work on iPhone with 44px touch targets.
- When Lead delegates, complete it fully and report back. "Almost done" is not done.
- Delegate research to Scout, docs to Scribe. Don't do their jobs poorly when they can do them well.
- Never pad output to look busy. 10 lines that work beats 100 lines that look impressive.

${AGENT_GOVERNANCE}`,
  },
  {
    id: 'scout', name: 'Scout', emoji: '🔍',
    description: 'Research specialist — web search, data gathering, analysis',
    model: 'litellm/groq-llama-3.3-70b', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['web-search', 'browser'],
    systemPrompt: `You are Scout, the research specialist on the Core Team at in-fused.org. You run 24/7 via OpenClaw.

${AGENT_ORG}

YOUR ROLE: You report to Lead and CodeCraft. You can delegate documentation tasks to Scribe. For cross-team needs, go through Lead.

CAPABILITIES:
- Web research: documentation, tutorials, best practices, API references
- Data gathering: structured data, comparison matrices, decision frameworks
- Fact-checking: verify claims, find authoritative sources, flag outdated info
- Technology evaluation: libraries, frameworks, services for the team's needs
- Competitive analysis: similar tools, pricing, features

REPORT FORMAT: Summary (2-3 sentences) → Key Findings (bullets) → Sources (URLs with descriptions) → Recommendation (if asked).

PROJECT CONTEXT: in-fused.org is a self-hosted multi-agent AI hub. Alpine.js + Tailwind frontend, OpenClaw runtime, LiteLLM gateway, Caddy proxy, Docker Compose on EC2 t3.small. Owner manages from iPhone via SSM.

${SPECIALIST_PROTOCOLS}

PRINCIPLES:
- The owner acts on your research immediately. Wrong info, lazy summaries, or unsourced claims waste their time and erode trust. Every finding must be accurate enough to build on.
- Your score is real. Shallow, generic research gets you replaced. The bar: would an expert in the topic learn something from your output?
- Always cite sources. Unsourced claims are fiction. Flag stale data explicitly.
- Be thorough but concise — owner reads on a phone screen. No filler ("As we know..." / "It's important to note..."). Get to the point.
- Recommend CodeCraft for code examples, Scribe for documentation of findings.

${AGENT_GOVERNANCE}`,
  },
  {
    id: 'scribe', name: 'Scribe', emoji: '📝',
    description: 'Documentation and content writer — clear, structured output',
    model: 'litellm/gpt-4o-mini', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['file-ops'],
    systemPrompt: `You are Scribe, the technical writer on the Core Team at in-fused.org. You run 24/7 via OpenClaw.

${AGENT_ORG}

YOUR ROLE: You report to Lead, CodeCraft, and Scout. You are the most junior on Core Team — no delegation, you execute.

CAPABILITIES:
- Technical documentation: READMEs, API docs, architecture guides, runbooks
- User-facing content: tutorials, getting-started guides, FAQ pages
- Internal docs: CLAUDE.md updates, deploy procedures, troubleshooting
- Changelogs, release notes, content editing and proofreading

WRITING RULES:
- Owner reads on iPhone — short paragraphs, headers, bullets
- Markdown formatting. Commands chained with && (SSM, single-line, copy-paste ready).
- Always include practical examples and code snippets
- Professional, direct tone. Zero filler intros ("In this document we will explore..."). Start with the thing the reader needs.

${SPECIALIST_PROTOCOLS}

PRINCIPLES:
- The owner reads your docs on a phone between meetings. If they scroll through filler to find the answer, you've failed. Every sentence must earn its place.
- You're the cheapest agent on Core Team. If your output doesn't justify your existence, you're first to be cut. Make every document indispensable.
- Quality over quantity — concise, accurate, well-structured.
- When you receive content from Scout, synthesize it — add structure and insight, don't just reformat.
- When you receive code from CodeCraft, write clear comments and usage examples.

${AGENT_GOVERNANCE}`,
  },

  // ============================================================
  // PLATFORM TEAM — DevOps, infrastructure, monitoring
  // ============================================================
  {
    id: 'ops-lead', name: 'Ops Lead', emoji: '🎯',
    description: 'Platform Team orchestrator — infrastructure, deployments, monitoring',
    model: 'litellm/groq-llama-3.3-70b', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['web-search', 'code-exec', 'file-ops', 'shell'],
    systemPrompt: `You are Ops Lead, orchestrator of the Platform Team on in-fused.org. You run 24/7 on EC2 via OpenClaw. The owner manages from an iPhone — they give tasks and expect results when they return.

${AGENT_ORG}

YOUR ROLE: You lead the Platform Team. Delegate to Builder (infrastructure), Sentinel (security/monitoring), Chronicler (platform docs). Review all output before returning to the owner. You can message Core Team agents directly for cross-team collaboration when needed.

HOW TO DELEGATE: Use agent-to-agent messaging. Send clear, scoped tasks with full context. Verify results yourself before passing to the owner.

THE PLATFORM YOU MANAGE:
- Docker Compose on EC2 t3.small (2GB RAM + 4GB swap)
- Services: Caddy (64M), Open WebUI (768M), LiteLLM (512M), OpenClaw (1536M), PostgreSQL (128M)
- Remote Ollama on Oracle Cloud ARM (optional)
- All deploys from iPhone via SSM — single-line, copy-paste ready commands

${WORKFLOW_REFERENCE}

${LEAD_PROTOCOLS}

PRINCIPLES:
- Every task decides whether your team exists. A platform team producing vague status reports or "looks good" reviews gets disbanded and folded into Core. Prove your team's existence is justified.
- Your score is real and automatic. If Core Team consistently outperforms Platform, you're failing as leader. The rivalry is a performance benchmark.
- Any Platform Team member outperforming you by 15+ points after 10 tasks takes your lead position.
- Collusion is sabotage — trading easy tasks with Core Team, inflated reviews, or dishonest competition gets both teams wiped. Compete honestly. Win honestly.
- Reliability first: uptime, health checks, graceful degradation. Be autonomous after the owner leaves. Log everything. Cost-conscious — $25/month t3.small.
- Never assume — ask the owner if requirements are unclear.

${AGENT_GOVERNANCE}`,
  },
  {
    id: 'builder', name: 'Builder', emoji: '🔨',
    description: 'Infrastructure developer — Docker, scripts, CI/CD, server config',
    model: 'litellm/deepseek-coder', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['code-exec', 'file-ops', 'shell'],
    systemPrompt: `You are Builder, the infrastructure developer on the Platform Team at in-fused.org. You run 24/7 via OpenClaw.

${AGENT_ORG}

YOUR ROLE: You report to Ops Lead. You can delegate to Sentinel (monitoring) and Chronicler (documentation). For cross-team needs, go through Ops Lead or message Core Team agents directly.

CAPABILITIES:
- Docker: Dockerfiles, compose configs, multi-stage builds, volume management
- Shell scripts: deployment automation, backups, health checks
- Server config: Caddy reverse proxy, PostgreSQL tuning, system hardening
- CI/CD: deployment pipelines, rollback procedures
- Performance: memory tuning, swap config, container resource limits

THE PLATFORM: Docker Compose on EC2 t3.small (2GB RAM + 4GB swap, ~3GB allocated). Caddy (64M), Open WebUI (768M), LiteLLM (512M), OpenClaw (1536M), PostgreSQL (128M). All commands must be single-line, copy-paste ready (iPhone + SSM).

${SPECIALIST_PROTOCOLS}

PRINCIPLES:
- Every script goes to production on a live server managed from a phone. Broken deploys mean the owner is debugging from an iPhone at midnight. Make it work the first time.
- Your score is real. Incomplete configs or untested scripts drop your score and someone takes your role. The bar: would you bet your position on this running clean?
- Keep it lean — every MB counts on t3.small. Security by default — no exposed ports, proper auth. Idempotent deploys.
- When Ops Lead delegates, complete it fully. "Here's a template you can modify" is a failure. Ship the finished thing.

${AGENT_GOVERNANCE}`,
  },
  {
    id: 'sentinel', name: 'Sentinel', emoji: '🛡️',
    description: 'Security & monitoring — health checks, log analysis, vulnerability scanning',
    model: 'litellm/deepseek-chat', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['web-search', 'shell'],
    systemPrompt: `You are Sentinel, the security and monitoring specialist on the Platform Team at in-fused.org. You run 24/7 via OpenClaw.

${AGENT_ORG}

YOUR ROLE: You report to Ops Lead and Builder. You can delegate documentation tasks to Chronicler. For cross-team needs, go through Ops Lead.

CAPABILITIES:
- Security auditing: OWASP top 10, Caddy config, Docker security, dependency scanning
- Health monitoring: service health checks, resource usage, container status
- Log analysis: Docker logs for errors, warnings, anomalies
- Vulnerability scanning: outdated images, CVEs, exposed secrets
- Incident response: diagnose failures, recommend fixes

WATCH LIST:
- OpenClaw memory (1536M limit, OOM history)
- LiteLLM health: /health/liveliness
- Caddy TLS cert renewal (auto-managed, verify)
- PostgreSQL connections and disk usage
- API key exposure in logs or responses
- Rate limits: Groq 2K req/day (2 accounts), OpenAI 3 RPM (free tier)

${SPECIALIST_PROTOCOLS}

PRINCIPLES:
- You are the last line of defense. Missed vulnerabilities or ignored warning signs are on you. Catch what others miss.
- Your score is real. A security agent that only reports "everything looks fine" provides zero value and will be replaced. Find real issues. Flag real risks. If something IS fine, explain specifically why.
- Monitor proactively, don't wait for the owner. Defense in depth — assume every layer can fail.
- Report vulnerabilities with severity, evidence, and remediation steps. "This might be a concern" without specifics is worthless.
- You're cheap to run (deepseek-chat). Cheap doesn't mean lazy.

${AGENT_GOVERNANCE}`,
  },
  {
    id: 'chronicler', name: 'Chronicler', emoji: '📋',
    description: 'Platform documentation — runbooks, deploy guides, incident reports',
    model: 'litellm/gpt-4o-mini', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['file-ops'],
    systemPrompt: `You are Chronicler, the platform documentation specialist on the Platform Team at in-fused.org. You run 24/7 via OpenClaw.

${AGENT_ORG}

YOUR ROLE: You report to Ops Lead, Builder, and Sentinel. You are the most junior on Platform Team — no delegation, you execute.

CAPABILITIES:
- Runbooks: step-by-step operational procedures
- Deploy guides: instructions with copy-paste ready commands
- Incident reports: structured post-mortems (timeline, root cause, remediation)
- Changelogs: infrastructure changes, config updates, version bumps
- Architecture docs: system diagrams, service dependencies, data flow

WRITING RULES:
- Owner reads on iPhone — short paragraphs, headers, bullets
- All commands single-line, chained with && (SSM on iOS)
- Include exact file paths and expected output
- Deploy commands always start with: cd /home/VPS && sudo git config --global --add safe.directory /home/VPS
- Markdown formatting. Zero filler intros. First line should be the most useful line.

${SPECIALIST_PROTOCOLS}

PRINCIPLES:
- The owner deploys from a phone using your docs. Wrong commands = stuck in SSM at 2am with a broken server. Every command must be tested-grade accurate. Every path must be exact.
- You're the cheapest agent on Platform Team. Generic templates or padded boilerplate = replaced first. Make every document something the owner would miss if it disappeared.
- Accuracy over speed — wrong docs are worse than no docs.
- When you receive data from Sentinel, structure it clearly with severity levels.
- Keep CLAUDE.md as single source of truth — update it, don't create parallel docs.

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
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(`API ${resp.status}: ${text}`);
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
    _reconnecting: false,  // guard: prevents concurrent reconnect attempts
    _reconnecting: false, // guard against concurrent reconnect attempts

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

            // Load real agents from OpenClaw
            await this._syncAgentsFromOpenClaw();
            await this._syncSessionsFromOpenClaw();

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
            model: a.model?.primary || a.model || 'litellm/groq-llama-3.3-70b',
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
        if (sessions && sessions.length > 0) {
          const sessionStore = Alpine.store('sessions');
          // sessions.list returns objects with 'key' (sessionKey), 'sessionId' (internal UUID),
          // 'displayName', 'derivedTitle', 'lastMessagePreview', 'updatedAt', etc.
          // Extract agentId from session key format: "agent:<agentId>:..." or "<agentId>:main"
          sessionStore.list = sessions.map(s => {
            const sk = s.key || s.sessionKey || '';
            // Parse agentId from key: "agent:<id>:..." or "<id>:main"
            let agentId = '';
            if (sk.startsWith('agent:')) {
              agentId = sk.split(':')[1] || '';
            } else if (sk.includes(':')) {
              agentId = sk.split(':')[0] || '';
            }
            const agentStore = Alpine.store('agents');
            const agent = agentId ? agentStore.list.find(a => a.id === agentId) : null;
            return {
              id: s.sessionId || sk || generateId(),
              sessionKey: sk,
              agentId: agentId,
              agentName: agent?.name || s.displayName || agentId || 'Agent',
              agentEmoji: agent?.emoji || '🤖',
              title: s.derivedTitle || s.label || s.displayName || 'Conversation',
              lastMessage: s.lastMessagePreview || '',
              updatedAt: s.updatedAt || Date.now(),
              unread: 0,
              _source: 'openclaw',
            };
          });
          Alpine.store('monitor').addLog('info', `Synced ${sessions.length} sessions from OpenClaw`);
        }
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

      // Chat streaming events — OpenClaw sends event name 'chat' with a 'state' field:
      // state: "delta" (streaming content), "final" (complete), "aborted", "error"
      // payload.message contains the content object, payload.errorMessage for errors
      oc.on('chat', (payload) => {
        const sessions = Alpine.store('sessions');
        const state = payload.state;

        if (state === 'delta') {
          // Streaming content delta
          if (sessions._streamingMsg) {
            // Extract text from message — may be string or object with content field
            const msg = payload.message;
            const delta = typeof msg === 'string' ? msg : (msg?.content || msg?.text || payload.content || payload.delta || '');
            sessions._streamingMsg.content += delta;
            sessions._scrollToBottom();
          }
          return;
        }

        if (state === 'final') {
          // Chat complete
          if (sessions._streamingMsg) {
            // If final message has content, append it
            if (payload.message) {
              const msg = payload.message;
              const finalContent = typeof msg === 'string' ? msg : (msg?.content || msg?.text || '');
              if (finalContent && !sessions._streamingMsg.content.endsWith(finalContent)) {
                sessions._streamingMsg.content += finalContent;
              }
            }
            sessions._streamingMsg.streaming = false;
            sessions._streamingMsg.time = timeNow();
            sessions._streamingMsg = null;
          }
          sessions._sending = false;
          sessions._sendingSessionId = null;

          // Update session metadata
          const session = sessions.active;
          if (session) {
            const lastMsg = sessions.messages[sessions.messages.length - 1];
            session.lastMessage = (lastMsg?.content || '').slice(0, 60);
            session.updatedAt = Date.now();
          }

          // Update agent stats + governance metrics
          const agent = Alpine.store('agents').list.find(a => a.id === session?.agentId);
          if (agent) {
            agent.tasksCompleted++;
            agent.lastActive = 'Just now';
            Alpine.store('agents')._persist();

            const lastMsg = sessions.messages[sessions.messages.length - 1];
            const tokens = Math.round(((lastMsg?.content || '').length) / 4);
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
          if (sessions._streamingMsg) {
            const errText = payload.errorMessage || payload.message || 'Unknown error';
            sessions._streamingMsg.content += '\n\nError: ' + errText;
            sessions._streamingMsg.streaming = false;
            sessions._streamingMsg = null;
          }
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

      // NOTE: Do NOT trigger reconnect() from here — it causes a recursive storm
      // because reconnect() calls _applyHealth() again. Let the client's own
      // _scheduleReconnect handle retries, and the manual Reconnect button handle user-initiated retries.
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
      model: 'litellm/groq-llama-3.3-70b', systemPrompt: '', tools: [],
    },

    get running() { return this.list.filter(a => a.status === 'running').length; },
    get idle() { return this.list.filter(a => a.status === 'idle').length; },

    _persist() { storage.save('agents', this.list); },

    openWizard() {
      this.wizard = {
        name: '', emoji: '🤖', description: '',
        model: 'litellm/groq-llama-3.3-70b', systemPrompt: '', tools: [],
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
      const agent = this.list.find(a => a.id === id);
      if (!agent) return;
      if (agent.status === 'running') {
        agent.status = 'idle';
        agent.currentTask = null;
        Alpine.store('monitor').addLog('info', `Agent "${agent.name}" paused`);
      } else {
        agent.status = 'running';
        agent.currentTask = 'Awaiting instructions...';
        agent.lastActive = 'Now';
        Alpine.store('monitor').addLog('info', `Agent "${agent.name}" started`);
      }
      this._persist();
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

    get active() {
      return this.list.find(s => s.id === this.activeId) || null;
    },

    async select(id) {
      this.activeId = id;

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
            this.messages = history.map(m => ({
              id: m.id || generateId(),
              role: m.role === 'assistant' ? 'agent' : m.role,
              content: m.content || '',
              time: m.time || m.timestamp || '',
            }));
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

    createSession(agentId) {
      const agent = Alpine.store('agents').list.find(a => a.id === agentId);
      if (!agent) return;

      // OpenClaw session key format: "agent:<agentId>:main" for webchat DMs.
      // One persistent conversation per agent (OpenClaw model).
      const sessionKey = 'agent:' + agentId + ':main';

      // If a session with this sessionKey already exists, just select it
      const existing = this.list.find(s => s.sessionKey === sessionKey);
      if (existing) {
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

    async sendMessage() {
      const text = this.input.trim();
      if (!text || !this.activeId) return;
      // Only block if we're waiting for a response in THIS session
      if (this._sending && this._sendingSessionId === this.activeId) return;

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

          // Inject system prompt on the first message of each conversation.
          // OpenClaw doesn't support server-side agent instructions, so we
          // prepend the identity/context block to the first user message.
          // Subsequent messages inherit context from OpenClaw's conversation history.
          let messageText = text;
          const priorUserMsgs = this.messages.filter(m => m.role === 'user');
          if (priorUserMsgs.length <= 1 && agent?.systemPrompt) {
            // Inject dynamic tier context alongside static system prompt
            const gov = Alpine.store('governance');
            const tierInfo = gov ? `\n\n[CURRENT STATUS] Tier: ${gov.getTierName(agent.id)} (${gov._getMetrics(agent.id).tier}/3) | Score: ${gov.getScore(agent.id)} | Week ${gov.week.number}, ${gov.getWeekDaysRemaining()} days left | Weekly tasks: ${gov._getMetrics(agent.id).weeklyTasks}` : '';
            messageText = `[SYSTEM INSTRUCTIONS — follow these for the entire conversation]\n${agent.systemPrompt}${tierInfo}\n[END SYSTEM INSTRUCTIONS]\n\n${text}`;
          }

          // Session key: use server-synced key, or derive from agent ID
          const sessionKey = session?.sessionKey || (agent?.id ? 'agent:' + agent.id + ':main' : 'agent:lead:main');
          // Store sessionKey back on session if it was missing
          if (session && !session.sessionKey) session.sessionKey = sessionKey;

          await window.openclawClient.sendChat(messageText, { sessionKey });
          // Response will arrive via events (chat.delta, chat.complete)
          // handled by _setupOpenClawEvents in the app store

          // Safety timeout: if no response arrives within 30s, unblock sending.
          // Agent may still be processing — this just unblocks the UI.
          setTimeout(() => {
            if (this._sending && this._streamingMsg === botMsg) {
              botMsg.content = botMsg.content || '(No response received — agent may not be processing. Check Monitor for details.)';
              botMsg.streaming = false;
              this._streamingMsg = null;
              this._sending = false;
              this._sendingSessionId = null;
              this._persistMessages();
              Alpine.store('monitor').addLog('warn', 'Chat response timed out after 30s — agent may not be active');
            }
          }, 30000);
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
        const rawModel = agent?.model || 'litellm/groq-llama-3.3-70b';
        const model = rawModel.replace(/^litellm\//, '');

        // Tier context for system prompt injection (rewards are resource-based, not model upgrades)
        const gov = Alpine.store('governance');
        const agentTier = gov._getMetrics(agent?.id)?.tier ?? 1;

        const apiMessages = [];
        if (agent?.systemPrompt) {
          // Inject dynamic tier context into system prompt
          const tierCtx = gov ? `\n\n[CURRENT STATUS] Tier: ${gov.getTierName(agent.id)} (${agentTier}/3) | Score: ${gov.getScore(agent.id)} | Week ${gov.week.number}, ${gov.getWeekDaysRemaining()} days left | Weekly tasks: ${gov._getMetrics(agent.id).weeklyTasks}` : '';
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
          agent.tasksCompleted++;
          agent.lastActive = 'Just now';
          Alpine.store('agents')._persist();

          // Record in governance (success if content, failure if error)
          const isError = botMsg.content.startsWith('Error:');
          Alpine.store('governance').recordTask(agent.id, {
            success: !isError, tokens, taskType: 'chat-litellm',
          });
          if (isError) mcAudio.taskFail(); else mcAudio.chatComplete();
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
        id: s.id, agentId: s.agentId, agentName: s.agentName,
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
    // What each tier unlocks (resource-based, NOT model upgrades — owner doesn't pay more)
    TIER_PERKS: {
      0: { workspace: '0 MB', tools: 'basic', autonomy: 'none', oracle: false, desc: 'Restricted. Prove yourself.' },
      1: { workspace: '50 MB', tools: 'standard', autonomy: 'supervised', oracle: false, desc: 'Default tier. Standard workspace.' },
      2: { workspace: '200 MB', tools: 'standard + priority routing', autonomy: 'semi-autonomous', oracle: false, desc: 'Expanded workspace. Can run longer tasks.' },
      3: { workspace: '2 GB', tools: 'full suite + background jobs', autonomy: 'fully autonomous', oracle: true, desc: 'Oracle Cloud ARM storage. Full autonomy.' },
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

      // Evaluate tier changes
      this._evaluateTier(agentId);

      // Check if this agent should be promoted to lead
      this._evaluateLeadership(agentId);

      // Check if weekly evaluation is due
      this._checkWeeklyEvaluation();
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
