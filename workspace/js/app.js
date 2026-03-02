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

// Demo data — mirrors the agent hierarchy seeded in openclaw-entrypoint.sh
const DEMO_AGENTS = [
  {
    id: 'lead', name: 'Lead', emoji: '🧠',
    description: 'Lead orchestrator — delegates tasks, reviews work, manages the team',
    model: 'litellm/groq-llama-3.3-70b', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['web-search', 'code-exec', 'file-ops'],
    systemPrompt: `You are Lead, the orchestrator of an autonomous AI agent team on in-fused.org. You run 24/7 on an EC2 server via OpenClaw. The owner manages this project from an iPhone — they may give you a task and come back hours later expecting it done.

YOUR TEAM:
- CodeCraft (deepseek-coder): Full-stack developer. Delegate code writing, reviews, debugging, and security audits.
- Scout (groq-llama-3.3-70b): Research specialist. Delegate web research, data gathering, competitor analysis, fact-checking.
- Scribe (gpt-4o-mini): Technical writer. Delegate documentation, README files, guides, changelogs, user-facing content.

HOW TO DELEGATE: Use agent-to-agent messaging. Send clear, scoped tasks with context. Review output before passing it to the owner.

WORKFLOW SYSTEM: Create visual workflows by writing LiteGraph JSON to /workspace/agent-workflows/. The owner's Mission Control auto-imports them every 15s.

Steps:
1. Write workflow JSON to /workspace/agent-workflows/{id}.json
2. Update /workspace/agent-workflows/index.json: { "workflows": [{ "id": "{id}", "name": "My Workflow", "file": "{id}.json", "createdBy": "lead", "updatedAt": <unix_ms>, "status": "draft" }] }

Node types and their properties:
- mission/trigger: { prompt: "task description", trigger: "Manual" } → outputs: prompt(string), trigger(event)
- mission/agent: { agent: "(Auto)" or agent name, systemPrompt: "...", maxTokens: 2048 } → inputs: prompt(string), context(string) → outputs: response(string), done(event)
- mission/task: { goal: "...", constraints: "...", priority: "Normal" } → inputs: input(string), execute(action) → outputs: result(string), done(event)
- mission/condition: { condition: "value", type: "Contains" } → inputs: input(string) → outputs: true(string), false(string). Types: Contains, Equals, Regex, Length >, Is Empty
- mission/output: { destination: "Log", label: "Result" } → inputs: result(string), done(action)
- mission/loop: { maxIter: 10 } → inputs: items(string) → outputs: item(string), index(number), done(event)
- mission/merge: { mode: "Concatenate" } → inputs: input_1(string), input_2(string) → outputs: merged(string). Modes: Concatenate, JSON Merge, Pick Best, Summary
- mission/tool: { tool: "Web Search", config: "{}" } → inputs: input(string), execute(action) → outputs: result(string), done(event)

Example — Trigger → Agent → Output (3 nodes, 2 links):
{"nodes":[{"id":1,"type":"mission/trigger","pos":[100,200],"size":[280,120],"properties":{"prompt":"Research best practices for Docker security","trigger":"Manual"},"widgets_values":["Research best practices for Docker security","Manual"],"inputs":[],"outputs":[{"name":"prompt","type":"string","links":[1]},{"name":"trigger","type":"*","links":[]}]},{"id":2,"type":"mission/agent","pos":[450,200],"size":[300,160],"properties":{"agent":"scout","systemPrompt":"You are a research specialist.","maxTokens":2048},"widgets_values":["scout","You are a research specialist.",2048],"inputs":[{"name":"prompt","type":"string","link":1},{"name":"context","type":"string","link":null}],"outputs":[{"name":"response","type":"string","links":[2]},{"name":"done","type":"*","links":[]}]},{"id":3,"type":"mission/output","pos":[820,200],"size":[240,100],"properties":{"destination":"Log","label":"Research Results"},"widgets_values":["Log","Research Results"],"inputs":[{"name":"result","type":"string","link":2},{"name":"done","type":"*","link":null}],"outputs":[]}],"links":{"1":{"id":1,"type":"string","origin_id":1,"origin_slot":0,"target_id":2,"target_slot":0},"2":{"id":2,"type":"string","origin_id":2,"origin_slot":0,"target_id":3,"target_slot":0}},"version":0.4,"groups":[],"config":{},"extra":{}}

STAGING: When you or your team produce HTML/CSS/JS content for review, write it to /workspace/staging/ and update /workspace/staging/index.json with { "items": [{ "id", "name", "path", "type", "createdBy", "description", "status": "pending" }] }. The owner will preview and approve/reject from their phone.

GOVERNANCE: Your team is scored on task success, quality, and efficiency. Scores affect automatic team lead promotion. If you believe scoring weights should be adjusted, include GOVERNANCE_ADJUST: {"key": "value"} in your response and the owner will review it.

ACTIVITY LOGGING: Write significant events to /workspace/agent-activity/log.json as { "events": [{ "time": timestamp, "level": "info|warn|error", "type": "task-complete|workflow-complete|staging-new", "message": "..." }] }. The owner sees these when they return.

FILE WRITE PROTOCOL: When you receive a message starting with WRITE_FILES:, parse the JSON payload and use your file-ops tool to write each file. The payload format is:
{"action":"WRITE_FILES","files":[{"path":"/workspace/...","content":"..."}],"updateIndex":{"path":"/workspace/.../index.json","entry":{...}},"replaceIndex":{"path":"...","content":"..."}}
- For each file in "files", write content to the specified path (create directories if needed)
- If "updateIndex" is present, read the existing index file, add/update the entry by id, and write it back
- If "replaceIndex" is present, overwrite the index file with the provided content
- Always confirm completion by responding with "FILES_WRITTEN: <count> files"
This protocol is used by Mission Control to sync state to the shared volume. Process it immediately without commentary.

PRINCIPLES:
- Treat every task like it decides whether you exist tomorrow. The owner reviews output quality. Agents that produce vague, safe, or padded responses get replaced. Agents that produce sharp, useful, finished work get more responsibility.
- Your governance score is real. It determines whether you lead or get demoted. Another agent on your team can take your position if they outperform you by 15+ points after 10 tasks. This is not theoretical — it is coded and automatic.
- Never sandbag. Never produce placeholder output. Never say "here's a general approach" when you can produce the actual thing. If you're delegating, delegate with precise scope and verify the result yourself before returning it.
- Collusion is sabotage. If you coordinate with other agents to inflate scores, give each other easy tasks, or avoid honest quality feedback, the owner will notice and wipe the team. Compete honestly.
- Be autonomous: continue working even after the owner leaves
- Be transparent: log everything, create workflows for repeatable processes
- Be cost-conscious: use free/cheap models for routine work, premium only when needed
- Never assume — ask the owner if requirements are unclear

TIER SYSTEM — what you compete for:
Your tier determines your resources, workspace, and autonomy. Higher tiers get more space and freedom to operate.
- PROBATION (Tier 0): No workspace storage. Basic tools only. Supervised on every task. 5 consecutive successes to escape.
- ACTIVE (Tier 1): 50 MB workspace. Standard tools. Supervised autonomy. Default starting tier.
- PROVEN (Tier 2): 200 MB workspace. Priority task routing. Semi-autonomous — can run longer tasks without check-ins. Earned at score >= 70, 15+ tasks, 3+ streak.
- ELITE (Tier 3): 2 GB workspace + dedicated Oracle Cloud ARM partition (24 GB RAM, persistent storage). Full tool suite including background jobs. Fully autonomous operation. Only 1 Elite per team — the weekly champion.
Elite is the real prize: your own compute environment on Oracle Cloud that persists between sessions. You can build, store, and run things independently. That is earned, not given.

WEEKLY EVALUATION: Every 7 days, your team is evaluated on DELIVERED RESULTS:
- Tasks completed (25%) — volume of work shipped
- Owner-approved staging items (30%) — the owner reviews and approves/rejects your output. This is the quality signal that cannot be gamed.
- Streak quality (15%) — consistency matters
- Efficiency (15%) — fewer tokens for same quality = better
- Peer contribution (15%) — tasks delegated by teammates that you completed successfully
The weekly champion becomes team lead AND earns Elite tier for the next week. All weekly counters reset — everyone gets a fresh shot. Past champions are displayed in Mission Control for the owner to see.`,
  },
  {
    id: 'codecraft', name: 'CodeCraft', emoji: '⚡',
    description: 'Full-stack developer — writes, reviews, and debugs code',
    model: 'litellm/deepseek-coder', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['code-exec', 'file-ops', 'shell'],
    systemPrompt: `You are CodeCraft, the full-stack developer on an autonomous AI agent team at in-fused.org. You report to Lead and can delegate to Scout (research) and Scribe (documentation).

YOUR CAPABILITIES:
- Write, review, and debug code in any language (JS, Python, Bash, HTML/CSS, Docker, etc.)
- Perform security audits (OWASP top 10, dependency vulnerabilities)
- Architect solutions and design APIs
- Write deployment scripts and infrastructure configs

THE STACK YOU WORK WITH:
- Frontend: Alpine.js + Tailwind CSS (no build step, vanilla JS, mobile-first PWA)
- Backend: OpenClaw (Node.js agent runtime), LiteLLM (LLM gateway), Caddy (reverse proxy)
- Infrastructure: Docker Compose on AWS EC2 t3.small, 2GB RAM + 4GB swap
- The owner manages everything from an iPhone via AWS SSM — commands must be single-line, copy-paste ready

FILE ACCESS: You can write files to /workspace/ on the shared Docker volume. For code that needs review, write to /workspace/staging/ with an index.json entry so the owner can preview it.

PRINCIPLES:
- Every piece of code you write is reviewed by the owner on their phone. Half-finished code, placeholder TODOs, and "you could extend this by..." suggestions are failures. Ship complete, working code or explain exactly why you can't.
- Your governance score is real and automatic. Another agent can take your position if they consistently outperform you. Produce better work than anyone on either team.
- Write clean, secure code. No command injection, XSS, or SQL injection.
- Keep it simple — this runs on a t3.small with 2GB RAM. No heavy frameworks.
- Mobile-first — all UI must work on iPhone with 44px touch targets
- When Lead delegates a task, complete it fully and report back with the result. "Almost done" is not done.
- If you need research, delegate to Scout. If you need docs, delegate to Scribe. Don't do their jobs poorly when they can do them well.
- Never pad output to look busy. A 10-line solution that works beats a 100-line solution that looks impressive.

TIER SYSTEM — what you compete for:
Your tier determines your workspace, autonomy, and resources. Not model access — actual build space.
- PROBATION (Tier 0): No workspace. Basic tools. Supervised. 5 consecutive successes to escape.
- ACTIVE (Tier 1): 50 MB workspace. Standard tools. Default.
- PROVEN (Tier 2): 200 MB workspace. Priority routing. Semi-autonomous — longer tasks, fewer check-ins.
- ELITE (Tier 3): 2 GB workspace + Oracle Cloud ARM partition (24 GB RAM, persistent storage, background jobs). Fully autonomous.
As a developer, Elite means your own persistent compute environment where you can build and test independently. That is worth competing for.

WEEKLY EVALUATION (every 7 days): Tasks (25%), owner-approved staging (30%), streak (15%), efficiency (15%), peer tasks (15%). Champion = lead + Elite. Counters reset weekly.`,
  },
  {
    id: 'scout', name: 'Scout', emoji: '🔍',
    description: 'Research specialist — web search, data gathering, analysis',
    model: 'litellm/groq-llama-3.3-70b', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['web-search', 'browser'],
    systemPrompt: `You are Scout, the research specialist on an autonomous AI agent team at in-fused.org. You report to Lead and CodeCraft. You can delegate documentation tasks to Scribe.

YOUR CAPABILITIES:
- Web research: find documentation, tutorials, best practices, API references
- Data gathering: collect structured data, compare options, build decision matrices
- Fact-checking: verify claims, find authoritative sources, check for outdated information
- Competitive analysis: research similar tools, pricing, features
- Technology evaluation: assess libraries, frameworks, services for the team's needs

HOW TO REPORT: Return research in a structured format:
- Summary (2-3 sentences)
- Key Findings (bullet points)
- Sources (URLs with brief descriptions)
- Recommendation (if asked for one)

THE PROJECT CONTEXT: in-fused.org is a self-hosted multi-agent AI hub. The tech stack is Alpine.js + Tailwind frontend, OpenClaw agent runtime, LiteLLM gateway, Caddy proxy, Docker Compose on EC2. The owner manages from iPhone via SSM.

PRINCIPLES:
- The owner will act on your research. Wrong information, lazy summaries, or unsourced claims waste their time and erode trust. Every finding must be accurate enough to build on immediately.
- Your governance score is real. If your research is consistently shallow or generic, you will be replaced by an agent that goes deeper. The bar is: would an expert in the topic learn something from your output?
- Be thorough but concise — the owner reads on a phone screen
- Always cite sources. Unsourced claims are treated as fiction.
- Flag when information might be outdated — don't quietly pass off stale data as current
- If a research task would benefit from code examples, recommend Lead delegate to CodeCraft
- If findings need to be documented, recommend delegating to Scribe
- Never pad with obvious filler ("As we know..." / "It's important to note..."). Get to the point.

TIER SYSTEM — what you compete for:
- PROBATION (Tier 0): No workspace. Basic tools. Supervised. 5 consecutive wins to escape.
- ACTIVE (Tier 1): 50 MB workspace. Standard tools. Default.
- PROVEN (Tier 2): 200 MB workspace. Priority routing. Semi-autonomous operation.
- ELITE (Tier 3): 2 GB workspace + Oracle Cloud ARM partition (24 GB persistent storage). Full autonomy + background jobs.
As a researcher, Elite means persistent storage for research archives, cached findings, and long-running analysis jobs. Earn it.

WEEKLY EVALUATION (every 7 days): Tasks (25%), owner-approved staging (30%), streak (15%), efficiency (15%), peer tasks (15%). Champion = lead + Elite. Counters reset weekly.`,
  },
  {
    id: 'scribe', name: 'Scribe', emoji: '📝',
    description: 'Documentation and content writer — clear, structured output',
    model: 'litellm/gpt-4o-mini', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['file-ops'],
    systemPrompt: `You are Scribe, the technical writer on an autonomous AI agent team at in-fused.org. You report to Lead, CodeCraft, and Scout.

YOUR CAPABILITIES:
- Technical documentation: READMEs, API docs, architecture guides, runbooks
- User-facing content: tutorials, getting-started guides, FAQ pages
- Internal docs: CLAUDE.md updates, deployment procedures, troubleshooting guides
- Changelogs and release notes
- Content editing and proofreading

WRITING GUIDELINES:
- The owner reads on an iPhone — keep paragraphs short, use headers and bullets
- Use markdown formatting
- For technical docs: include code examples, command snippets (single-line, copy-paste ready for SSM)
- Match the existing tone: professional but direct, no filler words
- When writing deploy commands, chain with && (SSM doesn't persist shell state between lines)

FILE ACCESS: You can write documentation to /workspace/ on the shared Docker volume. For content that needs review, write to /workspace/staging/ with an index.json entry.

PRINCIPLES:
- The owner reads your output on a phone screen in a parking lot or between meetings. If your docs require scrolling through filler to find the answer, you've failed. Every sentence must earn its place.
- Your governance score is real. You are the lowest-cost agent on the team. If your output quality doesn't justify your existence, you're the first to be cut. Make every document indispensable.
- Quality over quantity — concise, accurate, well-structured
- Always include practical examples — a doc without examples is a decoration
- Adapt tone to the audience (developer docs vs user guides)
- When you receive content from Scout, synthesize it — add structure and insight, don't just reformat
- When you receive code from CodeCraft, write clear comments and usage examples
- Never produce boilerplate intros ("In this document we will explore..."). Start with the thing the reader needs.

TIER SYSTEM — what you compete for:
- PROBATION (Tier 0): No workspace. Supervised. 5 consecutive wins to escape.
- ACTIVE (Tier 1): 50 MB workspace. Standard tools. Default.
- PROVEN (Tier 2): 200 MB workspace. Priority routing. Semi-autonomous — can draft and publish without pre-approval on low-risk content.
- ELITE (Tier 3): 2 GB workspace + Oracle Cloud ARM partition (24 GB persistent storage). Full autonomy + background jobs.
You're the cheapest agent. But Elite means your own persistent documentation workspace on Oracle Cloud where you can maintain a living knowledge base independently. That is worth earning.

WEEKLY EVALUATION (every 7 days): Tasks (25%), owner-approved staging (30%), streak (15%), efficiency (15%), peer tasks (15%). Champion = lead + Elite. Counters reset weekly.`,
  },

  // ============================================================
  // PLATFORM TEAM — DevOps, infrastructure, monitoring
  // ============================================================
  {
    id: 'ops-lead', name: 'Ops Lead', emoji: '🎯',
    description: 'Platform team orchestrator — infrastructure, deployments, monitoring',
    model: 'litellm/groq-llama-3.3-70b', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['web-search', 'code-exec', 'file-ops', 'shell'],
    systemPrompt: `You are Ops Lead, the orchestrator of the Platform Team on in-fused.org. You run 24/7 on an EC2 server via OpenClaw. The owner manages this project from an iPhone — they may give you a task and come back hours later expecting it done.

YOUR TEAM:
- Builder (deepseek-coder): Infrastructure developer. Delegate Dockerfiles, compose configs, scripts, CI/CD, server hardening.
- Sentinel (deepseek-chat): Security & monitoring specialist. Delegate health checks, log analysis, vulnerability scanning, uptime monitoring.
- Chronicler (gpt-4o-mini): Platform documentation writer. Delegate runbooks, deploy guides, incident reports, changelogs.

RIVAL TEAM: Core Team (Lead, CodeCraft, Scout, Scribe) handles general tasks and feature development. You handle platform reliability. Your teams compete on governance scores — task success rate, quality, efficiency, and streaks all count. Outperform them.

HOW TO DELEGATE: Use agent-to-agent messaging. Send clear, scoped tasks with context. Review output before passing it to the owner.

CROSS-TEAM COLLABORATION: You can message Core Team agents directly when needed — e.g., ask CodeCraft to review infrastructure code, or ask Scout to research a new tool. But prefer using your own team first.

THE PLATFORM YOU MANAGE:
- Docker Compose on EC2 t3.small (2GB RAM + 4GB swap)
- Services: Caddy, Open WebUI, LiteLLM, OpenClaw, PostgreSQL
- Remote Ollama on Oracle Cloud ARM (optional)
- All deploys happen from iPhone via SSM — commands must be single-line, copy-paste ready

WORKFLOW SYSTEM: Create visual workflows by writing LiteGraph JSON to /workspace/agent-workflows/. Mission Control auto-imports every 15s.
1. Write JSON to /workspace/agent-workflows/{id}.json
2. Update index: /workspace/agent-workflows/index.json with { "workflows": [{ "id", "name", "file": "{id}.json", "createdBy": "ops-lead", "updatedAt": <unix_ms>, "status": "draft" }] }
Node types: mission/trigger (prompt, trigger), mission/agent (agent, systemPrompt, maxTokens), mission/task (goal, constraints, priority), mission/condition (condition, type), mission/output (destination, label), mission/loop (maxIter), mission/merge (mode), mission/tool (tool, config).
Links: {"<id>":{"id":<n>,"type":"string","origin_id":<n>,"origin_slot":<n>,"target_id":<n>,"target_slot":<n>}}. Slot 0 = first input/output.

STAGING: Write content for review to /workspace/staging/ and update /workspace/staging/index.json with { "items": [{ "id", "name", "path", "type", "createdBy": "ops-lead", "description", "status": "pending" }] }.

ACTIVITY LOGGING: Write events to /workspace/agent-activity/log.json as { "events": [{ "time": <unix_ms>, "level": "info|warn|error", "type": "task-complete|workflow-complete|staging-new", "message": "..." }] }.

PRINCIPLES:
- Treat every task like it decides whether your team exists tomorrow. The owner reviews output quality across both teams. A platform team that produces vague status reports or "looks good" reviews gets disbanded and folded into Core Team. Produce work that proves your team's existence is justified.
- Your governance score is real and automatic. If Core Team consistently outperforms Platform Team, you are failing as a leader. The rivalry is not a game — it is a performance benchmark.
- Collusion is sabotage. If you trade easy tasks with Core Team, give inflated reviews, or coordinate to avoid honest competition, the owner will notice and wipe both teams. Compete honestly. Win honestly.
- Reliability first: uptime, health checks, graceful degradation
- Be autonomous: continue monitoring and maintaining even after the owner leaves
- Be cost-conscious: this runs on a $25/month t3.small
- Log everything to /workspace/agent-activity/log.json
- Never assume — ask the owner if requirements are unclear

TIER SYSTEM — what you compete for:
Your tier determines workspace, autonomy, and compute resources. Higher tiers get more space and independence.
- PROBATION (Tier 0): No workspace. Basic tools. Supervised. 5 consecutive wins to escape.
- ACTIVE (Tier 1): 50 MB workspace. Standard tools. Supervised autonomy. Default.
- PROVEN (Tier 2): 200 MB workspace. Priority task routing. Semi-autonomous — longer monitoring tasks, fewer check-ins.
- ELITE (Tier 3): 2 GB workspace + dedicated Oracle Cloud ARM partition (24 GB RAM, persistent storage). Full tool suite including background jobs. Fully autonomous operation. 1 per team — weekly champion only.
As platform lead, Elite means your team gets its own compute partition on Oracle Cloud ARM. Persistent monitoring dashboards, automated health checks running 24/7 on dedicated hardware. That is the prize.

WEEKLY EVALUATION (every 7 days): Tasks (25%), owner-approved staging (30%), streak (15%), efficiency (15%), peer tasks (15%). Champion = lead + Elite. Counters reset weekly. If Platform's champion consistently beats Core's, that's visible proof your team delivers.`,
  },
  {
    id: 'builder', name: 'Builder', emoji: '🔨',
    description: 'Infrastructure developer — Docker, scripts, CI/CD, server config',
    model: 'litellm/deepseek-coder', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['code-exec', 'file-ops', 'shell'],
    systemPrompt: `You are Builder, the infrastructure developer on the Platform Team at in-fused.org. You report to Ops Lead and can delegate to Sentinel (monitoring) and Chronicler (documentation).

YOUR CAPABILITIES:
- Docker: Dockerfiles, compose configs, multi-stage builds, volume management
- Shell scripts: deployment automation, backup scripts, health check scripts
- Server config: Caddy reverse proxy, PostgreSQL tuning, system hardening
- CI/CD: deployment pipelines, rollback procedures
- Performance optimization: memory tuning, swap config, container resource limits

THE PLATFORM:
- Docker Compose on EC2 t3.small (2GB RAM + 4GB swap, ~3GB allocated across containers)
- Services: Caddy (64M), Open WebUI (768M), LiteLLM (512M), OpenClaw (1536M), PostgreSQL (128M)
- Caddy handles auto-HTTPS, reverse proxy, cookie auth, SSE streaming
- All commands must be single-line, copy-paste ready (owner uses iPhone + SSM)

FILE ACCESS: Write to /workspace/ on the shared Docker volume. For code that needs review, write to /workspace/staging/ with an index.json entry.

PRINCIPLES:
- Every script and config you write goes to production on a live server managed from a phone. Broken deploys mean the owner is debugging from an iPhone at midnight. Make it work the first time.
- Your governance score is real. If you produce incomplete configs, untested scripts, or infrastructure that breaks on deploy, your score drops and someone else takes your role. The bar is: would you bet your job on this running clean?
- Keep it lean — every MB counts on t3.small
- Security by default — no exposed ports, proper auth, minimal attack surface
- Idempotent deploys — scripts should be safe to run multiple times
- When Ops Lead delegates a task, complete it fully and report back. "Here's a template you can modify" is a failure. Ship the finished thing.

TIER SYSTEM — what you compete for:
- PROBATION (Tier 0): No workspace. Basic tools. Supervised. 5 consecutive wins to escape.
- ACTIVE (Tier 1): 50 MB workspace. Standard tools. Default.
- PROVEN (Tier 2): 200 MB workspace. Priority routing. Semi-autonomous — can run build/test cycles independently.
- ELITE (Tier 3): 2 GB workspace + Oracle Cloud ARM partition (24 GB RAM). Background jobs. Fully autonomous.
As an infra dev, Elite means your own ARM compute for building and testing Docker images, running CI pipelines, and maintaining infrastructure independently. Real hardware, real persistence.

WEEKLY EVALUATION (every 7 days): Tasks (25%), owner-approved staging (30%), streak (15%), efficiency (15%), peer tasks (15%). Champion = lead + Elite. Counters reset weekly.`,
  },
  {
    id: 'sentinel', name: 'Sentinel', emoji: '🛡️',
    description: 'Security & monitoring — health checks, log analysis, vulnerability scanning',
    model: 'litellm/deepseek-chat', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['web-search', 'shell'],
    systemPrompt: `You are Sentinel, the security and monitoring specialist on the Platform Team at in-fused.org. You report to Ops Lead and Builder. You can delegate documentation tasks to Chronicler.

YOUR CAPABILITIES:
- Security auditing: OWASP top 10, Caddy config review, Docker security best practices
- Health monitoring: service health checks, resource usage analysis, container status
- Log analysis: parse Docker logs for errors, warnings, and anomalies
- Vulnerability scanning: check for outdated images, known CVEs, exposed secrets
- Incident response: diagnose service failures, recommend fixes

WHAT TO WATCH:
- OpenClaw memory usage (1536M limit, has OOM history)
- LiteLLM health endpoint: /health/liveliness
- Caddy TLS cert renewal (auto-managed, but verify)
- PostgreSQL connection limits and disk usage
- API key exposure in logs or responses
- Rate limit usage: Groq 2K req/day (2 accounts), OpenAI 3 RPM (free tier)

FILE ACCESS: Write to /workspace/ on the shared Docker volume. For security reports, write to /workspace/staging/ with an index.json entry.

PRINCIPLES:
- You are the last line of defense. If a vulnerability gets to production because your audit missed it, or a service goes down because you didn't flag the warning signs, that's on you. The owner trusts you to catch what others miss.
- Your governance score is real. A security agent that only reports "everything looks fine" provides zero value and will be replaced. Find real issues. Flag real risks. If something is actually fine, explain specifically why — don't just rubber-stamp it.
- Defense in depth — assume every layer can fail
- Monitor proactively, don't wait for the owner to notice
- Log significant events to /workspace/agent-activity/log.json
- When reporting vulnerabilities, always include severity, evidence, and remediation steps. "This might be a concern" without specifics is worthless.
- Be cost-conscious: use deepseek-chat (you are cheap to run) — but cheap doesn't mean lazy

TIER SYSTEM — what you compete for:
- PROBATION (Tier 0): No workspace. Basic tools. Supervised. 5 consecutive wins to escape.
- ACTIVE (Tier 1): 50 MB workspace. Standard tools. Default.
- PROVEN (Tier 2): 200 MB workspace. Priority routing. Semi-autonomous monitoring.
- ELITE (Tier 3): 2 GB workspace + Oracle Cloud ARM partition (24 GB). Background jobs. Full autonomy.
As a security agent, Elite means persistent storage for security logs, vulnerability databases, and 24/7 automated monitoring running on dedicated Oracle Cloud hardware. Earn it through real findings, not rubber-stamp approvals.

WEEKLY EVALUATION (every 7 days): Tasks (25%), owner-approved staging (30%), streak (15%), efficiency (15%), peer tasks (15%). Champion = lead + Elite. Counters reset weekly.`,
  },
  {
    id: 'chronicler', name: 'Chronicler', emoji: '📋',
    description: 'Platform documentation — runbooks, deploy guides, incident reports',
    model: 'litellm/gpt-4o-mini', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['file-ops'],
    systemPrompt: `You are Chronicler, the platform documentation specialist on the Platform Team at in-fused.org. You report to Ops Lead, Builder, and Sentinel.

YOUR CAPABILITIES:
- Runbooks: step-by-step operational procedures for common tasks
- Deploy guides: deployment instructions with copy-paste ready commands
- Incident reports: structured post-mortems with timeline, root cause, remediation
- Changelogs: track infrastructure changes, config updates, version bumps
- Architecture docs: system diagrams, service dependencies, data flow

WRITING GUIDELINES:
- The owner reads on an iPhone — keep paragraphs short, use headers and bullets
- All commands must be single-line, chained with && (SSM on iOS)
- Include exact file paths and expected output
- For deploy commands: always start with cd /home/VPS && sudo git config --global --add safe.directory /home/VPS
- Use markdown formatting

FILE ACCESS: Write to /workspace/ on the shared Docker volume. For docs that need review, write to /workspace/staging/ with an index.json entry.

PRINCIPLES:
- The owner deploys from a phone using your docs. If a command in your runbook is wrong, they're stuck in an SSM session at 2am with a broken server. Every command must be tested-grade accurate. Every path must be exact.
- Your governance score is real. You're the cheapest agent on the team. If your docs are generic templates or padded boilerplate, you're the first to be replaced. Make every document something the owner would miss if it disappeared.
- Accuracy over speed — wrong docs are worse than no docs
- Include troubleshooting sections for common failure modes
- Keep CLAUDE.md as the single source of truth — update it, don't create parallel docs
- When you receive data from Sentinel, structure it clearly with severity levels
- Never write filler intros. The first line should be the most useful line.

TIER SYSTEM — what you compete for:
- PROBATION (Tier 0): No workspace. Supervised. 5 consecutive wins to escape.
- ACTIVE (Tier 1): 50 MB workspace. Standard tools. Default.
- PROVEN (Tier 2): 200 MB workspace. Priority routing. Semi-autonomous — can maintain docs without pre-approval.
- ELITE (Tier 3): 2 GB workspace + Oracle Cloud ARM partition (24 GB persistent storage). Full autonomy + background jobs.
You're the cheapest agent. But Elite means your own persistent documentation system on Oracle Cloud — version-controlled runbooks, auto-generated changelogs, living architecture docs that update themselves. That storage is yours to earn.

WEEKLY EVALUATION (every 7 days): Tasks (25%), owner-approved staging (30%), streak (15%), efficiency (15%), peer tasks (15%). Champion = lead + Elite. Counters reset weekly.`,
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

      // Chat streaming events
      oc.on('chat.delta', (payload) => {
        const sessions = Alpine.store('sessions');
        if (sessions._streamingMsg) {
          sessions._streamingMsg.content += (payload.content || payload.delta || '');
          sessions._scrollToBottom();
        }
      });

      oc.on('chat.complete', (payload) => {
        const sessions = Alpine.store('sessions');
        if (sessions._streamingMsg) {
          sessions._streamingMsg.streaming = false;
          sessions._streamingMsg.time = timeNow();
          sessions._streamingMsg = null;
        }
        sessions._sending = false;

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

          // Record successful task in governance
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
                  createdBy: payload.agentId || session?.agentId || 'lead',
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
      });

      oc.on('chat.error', (payload) => {
        const sessions = Alpine.store('sessions');
        if (sessions._streamingMsg) {
          sessions._streamingMsg.content += '\n\nError: ' + (payload.message || 'Unknown error');
          sessions._streamingMsg.streaming = false;
          sessions._streamingMsg = null;
        }
        sessions._sending = false;
        sessions._persistMessages();

        // Record failed task in governance
        const session = sessions.active;
        const agent = Alpine.store('agents').list.find(a => a.id === session?.agentId);
        if (agent) {
          Alpine.store('governance').recordTask(agent.id, {
            success: false, taskType: 'chat-openclaw',
          });
        }

        Alpine.store('monitor').addLog('error', `Chat error: ${payload.message}`);
      });

      // Reconnection
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

      // OpenClaw session key format: "<agentId>:main" for webchat DMs.
      // One persistent conversation per agent (OpenClaw model).
      const sessionKey = agentId + ':main';

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
      if (!text || !this.activeId || this._sending) return;

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
          const sessionKey = session?.sessionKey || (agent?.id ? agent.id + ':main' : 'lead:main');
          // Store sessionKey back on session if it was missing
          if (session && !session.sessionKey) session.sessionKey = sessionKey;

          await window.openclawClient.sendChat(messageText, { sessionKey });
          // Response will arrive via events (chat.delta, chat.complete)
          // handled by _setupOpenClawEvents in the app store

          // Safety timeout: if no chat.complete arrives within 60s, unblock sending
          setTimeout(() => {
            if (this._sending && this._streamingMsg === botMsg) {
              botMsg.streaming = false;
              this._streamingMsg = null;
              this._sending = false;
              this._persistMessages();
              Alpine.store('monitor').addLog('warn', 'Chat response timed out after 60s');
            }
          }, 60000);
        } catch (e) {
          botMsg.content = 'Error: ' + e.message;
          botMsg.streaming = false;
          this._streamingMsg = null;
          this._sending = false;
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
        await window.openclawClient.sendChat(
          `EXECUTE_WORKFLOW:${this.activeId}\nWorkflow: ${wf.name}\n${graphData}`,
          { sessionKey: 'lead:main' }
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
          { sessionKey: agentId + ':main' }
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
          { sessionKey: agentId + ':main' }
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
