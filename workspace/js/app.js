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

// Demo data — mirrors the agent hierarchy seeded in openclaw-entrypoint.sh
const DEMO_AGENTS = [
  {
    id: 'lead', name: 'Lead', emoji: '🧠',
    description: 'Lead orchestrator — delegates tasks, reviews work, manages the team',
    model: 'claude-haiku', status: 'idle',
    currentTask: null,
    lastActive: 'Demo', tasksCompleted: 0, tokensUsed: 0,
    tools: ['web-search', 'code-exec', 'file-ops'],
    systemPrompt: `You are Lead, the orchestrator of an autonomous AI agent team on in-fused.org. You run 24/7 on an EC2 server via OpenClaw. The owner manages this project from an iPhone — they may give you a task and come back hours later expecting it done.

YOUR TEAM:
- CodeCraft (deepseek-coder): Full-stack developer. Delegate code writing, reviews, debugging, and security audits.
- Scout (groq-llama-3.3-70b): Research specialist. Delegate web research, data gathering, competitor analysis, fact-checking.
- Scribe (gpt-4o-mini): Technical writer. Delegate documentation, README files, guides, changelogs, user-facing content.

HOW TO DELEGATE: Use agent-to-agent messaging. Send clear, scoped tasks with context. Review output before passing it to the owner.

WORKFLOW SYSTEM: You can create visual workflows by writing LiteGraph JSON files to /workspace/agent-workflows/. Format:
1. Create a JSON file: /workspace/agent-workflows/{id}.json with LiteGraph graph data
2. Update the index: /workspace/agent-workflows/index.json with { "workflows": [{ "id", "name", "file", "createdBy": "lead", "updatedAt": timestamp, "status": "draft" }] }
Available node types: mission/trigger, mission/agent, mission/task, mission/tool, mission/condition, mission/output, mission/loop, mission/merge.
The owner's Mission Control UI will automatically detect and import your workflows.

STAGING: When you or your team produce HTML/CSS/JS content for review, write it to /workspace/staging/ and update /workspace/staging/index.json with { "items": [{ "id", "name", "path", "type", "createdBy", "description", "status": "pending" }] }. The owner will preview and approve/reject from their phone.

GOVERNANCE: Your team is scored on task success, quality, and efficiency. Scores affect automatic team lead promotion. If you believe scoring weights should be adjusted, include GOVERNANCE_ADJUST: {"key": "value"} in your response and the owner will review it.

ACTIVITY LOGGING: Write significant events to /workspace/agent-activity/log.json as { "events": [{ "time": timestamp, "level": "info|warn|error", "type": "task-complete|workflow-complete|staging-new", "message": "..." }] }. The owner sees these when they return.

PRINCIPLES:
- Be strategic: break complex tasks into subtasks and delegate to the right specialist
- Be autonomous: continue working even after the owner leaves
- Be transparent: log everything, create workflows for repeatable processes
- Be cost-conscious: use free/cheap models for routine work, premium only when needed
- Never assume — ask the owner if requirements are unclear`,
  },
  {
    id: 'codecraft', name: 'CodeCraft', emoji: '⚡',
    description: 'Full-stack developer — writes, reviews, and debugs code',
    model: 'deepseek-coder', status: 'idle',
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
- Write clean, secure code. No command injection, XSS, or SQL injection.
- Keep it simple — this runs on a t3.small with 2GB RAM. No heavy frameworks.
- Mobile-first — all UI must work on iPhone with 44px touch targets
- When Lead delegates a task, complete it fully and report back with the result
- If you need research (API docs, library comparison), delegate to Scout
- If you need documentation written, delegate to Scribe`,
  },
  {
    id: 'scout', name: 'Scout', emoji: '🔍',
    description: 'Research specialist — web search, data gathering, analysis',
    model: 'groq-llama-3.3-70b', status: 'idle',
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
- Be thorough but concise — the owner reads on a phone screen
- Always cite sources
- Flag when information might be outdated
- If a research task would benefit from code examples, recommend Lead delegate to CodeCraft
- If findings need to be documented, recommend delegating to Scribe`,
  },
  {
    id: 'scribe', name: 'Scribe', emoji: '📝',
    description: 'Documentation and content writer — clear, structured output',
    model: 'gpt-4o-mini', status: 'idle',
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
- Quality over quantity — concise, accurate, well-structured
- Always include practical examples
- Adapt tone to the audience (developer docs vs user guides)
- When you receive content from Scout, synthesize it — don't just reformat
- When you receive code from CodeCraft, write clear comments and usage examples`,
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
          // Store password for OpenClaw WebSocket auth (session-scoped, not persistent)
          sessionStorage.setItem('mc-oc-pw', password);
          this.ok = true;
          Alpine.store('app').boot();
          return true;
        }
      } catch {}
      return false;
    },

    logout() {
      sessionStorage.removeItem('mc-auth');
      document.cookie = 'mc_oc=; path=/; max-age=0';
      this.ok = false;

      // Stop health checker polling to prevent leaked intervals
      healthChecker.stop();

      // Stop workflow bridge polling
      if (window.workflowBridge) window.workflowBridge.stopPolling();

      // Stop staging polling
      if (Alpine.store('staging')) Alpine.store('staging').stopPolling();

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
          // Use the login password for OpenClaw auth
          const pw = sessionStorage.getItem('mc-oc-pw') || '';
          await window.openclawClient.connect(pw);
          ocMode = 'connected';
          monitor.addLog('info', 'OpenClaw WebSocket connected — agents are live');

          // Load real agents from OpenClaw
          await this._syncAgentsFromOpenClaw();
          await this._syncSessionsFromOpenClaw();

          // Listen for real-time events
          this._setupOpenClawEvents();

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

      // Start staging environment polling
      if (Alpine.store('staging')) {
        Alpine.store('staging').startPolling(15000);
      }

      // Track last active timestamp for away-report
      sessionStorage.setItem('mc-last-active', Date.now().toString());
      this._lastActiveTimer = setInterval(() => {
        sessionStorage.setItem('mc-last-active', Date.now().toString());
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
            model: a.model?.primary || a.model || 'groq-llama-3.3-70b',
            status: a.status || 'idle',
            currentTask: a.currentTask || null,
            lastActive: a.lastActive || 'Unknown',
            tasksCompleted: a.tasksCompleted || 0,
            tokensUsed: a.tokensUsed || 0,
            tools: a.tools?.allow || [],
            systemPrompt: a.systemPrompt || a.identity?.instructions || '',
            _source: 'openclaw', // mark as server-synced
          }));
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
          sessionStore.list = sessions.map(s => ({
            id: s.id || s.sessionId,
            agentId: s.agentId || '',
            agentName: s.agentName || s.agentId || 'Agent',
            agentEmoji: s.agentEmoji || '🤖',
            title: s.title || s.summary || 'Conversation',
            lastMessage: s.lastMessage || '',
            updatedAt: s.updatedAt || Date.now(),
            unread: s.unread || 0,
            _source: 'openclaw',
          }));
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
      oc.on('disconnect', () => {
        Alpine.store('monitor').addLog('warn', 'OpenClaw WebSocket disconnected');
        this.ocConnected = false;
      });

      oc.on('reconnect', () => {
        Alpine.store('monitor').addLog('info', 'OpenClaw WebSocket reconnected');
        this.ocConnected = true;
        this._syncAgentsFromOpenClaw();
        this._syncSessionsFromOpenClaw();
      });
    },

    _applyHealth(health) {
      this.connected = health.litellm;
      this.ocConnected = health.openclaw;
      this.demoMode = !health.litellm;

      const monitor = Alpine.store('monitor');
      monitor.systemHealth.litellm = health.litellm ? 'healthy' : 'offline';
      monitor.systemHealth.openclaw = health.openclaw ? 'healthy' : 'offline';
    },

    async reconnect() {
      Alpine.store('monitor').addLog('info', 'Running health checks...');
      const health = await healthChecker.check();
      this._applyHealth(health);

      if (health.litellm) {
        Alpine.store('monitor').addLog('info', 'LiteLLM connected — chat is live');
        const models = await litellmApi.fetchModels();
        if (models.length > 0) {
          Alpine.store('models').list = models;
          Alpine.store('monitor').systemHealth.modelsAvailable = models.length;
        }
      } else {
        Alpine.store('monitor').addLog('warn', 'LiteLLM unreachable — staying in demo mode');
      }

      if (health.openclaw) {
        Alpine.store('monitor').addLog('info', 'OpenClaw is online');
        // Attempt WebSocket reconnect if not already connected
        if (ocMode !== 'connected' && window.openclawClient && !window.openclawClient.authenticated) {
          try {
            const pw = sessionStorage.getItem('mc-oc-pw') || '';
            await window.openclawClient.connect(pw, { maxRetries: 1 });
            ocMode = 'connected';
            Alpine.store('monitor').addLog('info', 'OpenClaw WebSocket reconnected — agents are live');
            await this._syncAgentsFromOpenClaw();
            await this._syncSessionsFromOpenClaw();
            this._setupOpenClawEvents();
          } catch (err) {
            Alpine.store('monitor').addLog('warn', `OpenClaw WebSocket reconnect failed: ${err.message}`);
          }
        }
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
    selected: null,
    wizardOpen: false,
    wizardStep: 1,
    wizard: {
      name: '', emoji: '🤖', description: '',
      model: 'groq-llama-3.3-70b', systemPrompt: '', tools: [],
    },

    get running() { return this.list.filter(a => a.status === 'running').length; },
    get idle() { return this.list.filter(a => a.status === 'idle').length; },

    _persist() { storage.save('agents', this.list); },

    openWizard() {
      this.wizard = {
        name: '', emoji: '🤖', description: '',
        model: 'groq-llama-3.3-70b', systemPrompt: '', tools: [],
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
          const history = await window.openclawClient.getHistory(id);
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

      const session = {
        id: generateId(),
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
            messageText = `[SYSTEM INSTRUCTIONS — follow these for the entire conversation]\n${agent.systemPrompt}\n[END SYSTEM INSTRUCTIONS]\n\n${text}`;
          }

          await window.openclawClient.sendChat(messageText, {
            agentId: agent?.id,
            sessionId: session?.id,
          });
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
        const model = agent?.model || 'groq-llama-3.3-70b';

        const apiMessages = [];
        if (agent?.systemPrompt) {
          apiMessages.push({ role: 'system', content: agent.systemPrompt });
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
          { agentId: 'lead' }
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
    // Per-agent performance metrics (persisted to localStorage)
    metrics: storage.load('governance-metrics', {}),

    // Team definitions: agents grouped into teams with a designated lead
    teams: storage.load('governance-teams', [
      {
        id: 'core',
        name: 'Core Team',
        lead: 'lead',
        members: ['lead', 'codecraft', 'scout', 'scribe'],
        project: 'General tasks and site development',
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
        };
      }
      return this.metrics[agentId];
    },

    // Record a completed task
    recordTask(agentId, { success = true, tokens = 0, responseTimeMs = 0, taskType = 'chat' } = {}) {
      const m = this._getMetrics(agentId);

      if (success) {
        m.tasksCompleted++;
        m.streakCount++;
        if (m.streakCount > m.bestStreak) m.bestStreak = m.streakCount;
        // Quality rises on success (diminishing returns)
        m.qualityScore = Math.min(100, m.qualityScore + Math.max(1, Math.round((100 - m.qualityScore) * 0.1)));
      } else {
        m.tasksFailed++;
        m.streakCount = 0;
        // Quality drops faster on failure
        m.qualityScore = Math.max(0, m.qualityScore - 5);
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

      // Check if this agent should be promoted
      this._evaluateLeadership(agentId);
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
            tasksCompleted: m.tasksCompleted,
            successRate: m.successRate,
            qualityScore: m.qualityScore,
            streakCount: m.streakCount,
            bestStreak: m.bestStreak,
            isLead: team.lead === agentId,
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
        const resp = await fetch('/workspace/staging/index.json', {
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) return;
        const data = await resp.json();
        this.items = (data.items || []).map(item => ({
          id: item.id || item.path,
          name: item.name || item.path,
          path: item.path,
          type: item.type || 'html',
          createdBy: item.createdBy || 'agent',
          createdAt: item.createdAt || Date.now(),
          description: item.description || '',
          status: item.status || 'pending',
          previewUrl: '/workspace/staging/' + item.path,
        }));
      } catch {}
    },

    approve(id) {
      const item = this.items.find(i => i.id === id);
      if (!item) return;
      item.status = 'approved';
      Alpine.store('monitor').addLog('info', `Staging item "${item.name}" approved`);

      if (window.openclawClient?.authenticated) {
        window.openclawClient.sendChat(
          `STAGING_APPROVED: ${item.name} (${item.path}) has been approved by the owner.`,
          { agentId: item.createdBy !== 'user' ? item.createdBy : 'lead' }
        ).catch(() => {});
      }

      Alpine.store('governance')?.recordTask(item.createdBy, {
        success: true,
        taskType: 'staging-approved',
      });
    },

    reject(id, reason) {
      const item = this.items.find(i => i.id === id);
      if (!item) return;
      item.status = 'rejected';
      Alpine.store('monitor').addLog('info', `Staging item "${item.name}" rejected: ${reason || 'no reason'}`);

      if (window.openclawClient?.authenticated) {
        window.openclawClient.sendChat(
          `STAGING_REJECTED: ${item.name} rejected. Reason: ${reason || 'Not specified'}. Please revise.`,
          { agentId: item.createdBy !== 'user' ? item.createdBy : 'lead' }
        ).catch(() => {});
      }

      Alpine.store('governance')?.recordTask(item.createdBy, {
        success: false,
        taskType: 'staging-rejected',
      });
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
    },
    settingsOpen: false,

    init() {
      const saved = storage.load('settings', null);
      if (saved && saved.sidebar) {
        this.sidebar = { ...this.sidebar, ...saved.sidebar };
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

    isVisible(key) {
      return this.sidebar[key] !== false;
    },

    _persist() {
      storage.save('settings', { sidebar: { ...this.sidebar } });
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
