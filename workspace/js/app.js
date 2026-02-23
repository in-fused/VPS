// ============================================================================
// Mission Control — app.js
// Alpine.js stores, WebSocket client, and component logic
// in-fused.org
// ============================================================================

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

const MODELS = [
  { id: 'groq-llama-3.3-70b', name: 'Llama 3.3 70B', provider: 'Groq', tier: 'free', cost: '$0/1M', desc: 'Fast inference, free tier (1K req/day)' },
  { id: 'qwen2.5-coder:14b', name: 'Qwen 2.5 Coder 14B', provider: 'Ollama', tier: 'free', cost: '$0/1M', desc: 'Local coding model on Oracle ARM' },
  { id: 'deepseek-coder-v2:16b', name: 'DS Coder V2 16B', provider: 'Ollama', tier: 'free', cost: '$0/1M', desc: 'Local coding model on Oracle ARM' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek', tier: 'cheap', cost: '$0.14/1M', desc: 'Excellent reasoning, very affordable' },
  { id: 'deepseek-coder', name: 'DeepSeek Coder', provider: 'DeepSeek', tier: 'cheap', cost: '$0.14/1M', desc: 'Specialized coding model' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', tier: 'cheap', cost: '$0.15/1M', desc: 'Fast and cheap general purpose' },
  { id: 'claude-haiku', name: 'Claude Haiku', provider: 'Anthropic', tier: 'mid', cost: '$1/1M', desc: 'Fast, capable, great for agents' },
  { id: 'claude-sonnet', name: 'Claude Sonnet', provider: 'Anthropic', tier: 'premium', cost: '$3/1M', desc: 'Best balance of speed and quality' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', tier: 'premium', cost: '$2.50/1M', desc: 'Strong multimodal reasoning' },
  { id: 'claude-opus', name: 'Claude Opus', provider: 'Anthropic', tier: 'premium', cost: '$15/1M', desc: 'Maximum capability, complex tasks' },
];

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

// Demo data for when not connected to OpenClaw
const DEMO_AGENTS = [
  {
    id: 'demo-1', name: 'CodeCraft', emoji: '⚡',
    description: 'Full-stack development and code review',
    model: 'groq-llama-3.3-70b', status: 'running',
    currentTask: 'Refactoring auth module',
    lastActive: 'Now', tasksCompleted: 12, tokensUsed: 45200,
    tools: ['code-exec', 'file-ops', 'shell'],
  },
  {
    id: 'demo-2', name: 'Sentinel', emoji: '🛡️',
    description: 'Security analysis and vulnerability scanning',
    model: 'claude-haiku', status: 'idle',
    currentTask: null,
    lastActive: '5m ago', tasksCompleted: 8, tokensUsed: 23100,
    tools: ['web-search', 'code-exec', 'shell'],
  },
  {
    id: 'demo-3', name: 'Scribe', emoji: '📝',
    description: 'Documentation, content writing, and reports',
    model: 'deepseek-chat', status: 'idle',
    currentTask: null,
    lastActive: '22m ago', tasksCompleted: 23, tokensUsed: 67800,
    tools: ['web-search', 'file-ops', 'browser'],
  },
];

const DEMO_SESSIONS = [
  {
    id: 'sess-1', agentId: 'demo-1', agentName: 'CodeCraft', agentEmoji: '⚡',
    title: 'Auth refactor discussion', lastMessage: 'Working on the JWT validation...',
    updatedAt: Date.now() - 60000, unread: 2,
  },
  {
    id: 'sess-2', agentId: 'demo-2', agentName: 'Sentinel', agentEmoji: '🛡️',
    title: 'API security audit', lastMessage: 'Found 2 potential CSRF issues.',
    updatedAt: Date.now() - 300000, unread: 0,
  },
];

const DEMO_MESSAGES = [
  { id: 'm1', role: 'user', content: 'Can you review the authentication module for security issues?', time: '12:31' },
  { id: 'm2', role: 'agent', content: 'I\'ll analyze the auth module now. Let me look at the JWT validation, session management, and password hashing.\n\nStarting with `src/auth/jwt.ts`...', time: '12:31' },
  { id: 'm3', role: 'agent', content: '**Analysis complete.** Here are my findings:\n\n1. JWT secret is hardcoded in `config.ts` — should use environment variable\n2. Token expiry is set to 30 days — recommend 24h with refresh tokens\n3. Password hashing uses bcrypt with cost 10 — good, but consider Argon2id\n\nShall I implement these fixes?', time: '12:32' },
  { id: 'm4', role: 'user', content: 'Yes, go ahead and fix all three. Start with the JWT secret.', time: '12:33' },
  { id: 'm5', role: 'agent', content: 'Working on the JWT validation changes now...', time: '12:33', streaming: true },
];

const DEMO_LOGS = [
  { time: '12:34:56', level: 'info', msg: 'Agent CodeCraft started task: Refactoring auth module' },
  { time: '12:34:12', level: 'info', msg: 'WebSocket gateway connected (demo mode)' },
  { time: '12:33:45', level: 'debug', msg: 'Session sess-1 message received (124 tokens)' },
  { time: '12:32:01', level: 'info', msg: 'Agent Sentinel completed security scan' },
  { time: '12:31:18', level: 'warn', msg: 'Groq rate limit at 87% — 870/1000 requests today' },
  { time: '12:30:44', level: 'info', msg: 'LiteLLM health check passed — 10 models available' },
  { time: '12:28:33', level: 'debug', msg: 'Agent Scribe session idle timeout (15m)' },
  { time: '12:25:00', level: 'info', msg: 'Mission Control initialized' },
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

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ----------------------------------------------------------------------------
// WEBSOCKET CONNECTION MANAGER
// ----------------------------------------------------------------------------

class OpenClawConnection {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 8; // stop after 8 tries (~4 min with backoff)
    this.autoReconnect = true;
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.listeners = new Map();
    this._url = null;
    this._password = null;
  }

  connect(url, password) {
    if (this.ws) this.disconnect();
    this._url = url;
    this._password = password;
    this.autoReconnect = true;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        // Attempt authentication
        if (password) {
          this.send('auth', { password });
        }
        this.connected = true;
        this.reconnectAttempts = 0; // reset backoff on success
        this._emit('connected');
        this._addLog('info', 'Connected to OpenClaw gateway');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this._handleMessage(data);
        } catch (e) {
          // Non-JSON message, ignore
        }
      };

      this.ws.onclose = () => {
        const wasConnected = this.connected;
        this.connected = false;
        this._emit('disconnected');

        if (!this.autoReconnect) return;

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          this._addLog('warn', 'Disconnected — gave up reconnecting after ' + this.reconnectAttempts + ' attempts');
          this.autoReconnect = false;
          return;
        }

        // Exponential backoff: 2s, 4s, 8s, 16s, 32s, 60s cap
        const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 60000);
        this.reconnectAttempts++;
        const delaySec = Math.round(delay / 1000);

        if (wasConnected) {
          this._addLog('warn', 'Disconnected from OpenClaw gateway — reconnecting in ' + delaySec + 's');
        } else {
          this._addLog('debug', 'Connection attempt ' + this.reconnectAttempts + '/' + this.maxReconnectAttempts + ' — retry in ' + delaySec + 's');
        }

        this.reconnectTimer = setTimeout(() => this.connect(url, password), delay);
      };

      this.ws.onerror = () => {
        // Only log on first attempt to avoid spamming
        if (this.reconnectAttempts === 0) {
          this._addLog('error', 'WebSocket connection failed');
        }
      };

    } catch (e) {
      this._addLog('error', 'Failed to create WebSocket: ' + e.message);
    }
  }

  disconnect() {
    this.autoReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  // Manual reconnect (resets backoff)
  retry() {
    if (this._url) {
      this.reconnectAttempts = 0;
      this.connect(this._url, this._password);
    }
  }

  send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return null;
    const id = ++this.messageId;
    const msg = { id, method, params, type: 'request' };
    this.ws.send(JSON.stringify(msg));

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(callback);
  }

  _emit(event, data) {
    const cbs = this.listeners.get(event) || [];
    cbs.forEach(cb => cb(data));
  }

  _handleMessage(data) {
    // Response to a request
    if (data.id && this.pendingRequests.has(data.id)) {
      const { resolve } = this.pendingRequests.get(data.id);
      this.pendingRequests.delete(data.id);
      resolve(data.result || data);
      return;
    }

    // Streaming content
    if (data.type === 'stream' || data.type === 'content') {
      this._emit('stream', data);
    }

    // Agent status update
    if (data.type === 'status' || data.method === 'agent.status') {
      this._emit('agent-status', data);
    }

    // Session update
    if (data.type === 'session' || data.method === 'sessions.update') {
      this._emit('session-update', data);
    }

    // Generic event
    this._emit('message', data);
  }

  _addLog(level, msg) {
    const store = window.Alpine && Alpine.store('monitor');
    if (store) {
      const now = new Date();
      const time = now.toTimeString().slice(0, 8);
      store.logs.unshift({ time, level, msg });
      if (store.logs.length > 200) store.logs.pop();
    }
  }
}

// Singleton connection
const ocConnection = new OpenClawConnection();

// ----------------------------------------------------------------------------
// ALPINE.JS STORE: APP (global state)
// ----------------------------------------------------------------------------

document.addEventListener('alpine:init', () => {

  // --------------------------------------------------------------------------
  // ALPINE.JS STORE: AUTH
  // --------------------------------------------------------------------------

  Alpine.store('auth', {
    ok: false,

    init() {
      // No hash configured = no auth required (local dev / no password set)
      if (!window.__AUTH_HASH) {
        this.ok = true;
        return;
      }
      // Check existing session
      const stored = sessionStorage.getItem('mc-auth');
      if (stored === window.__AUTH_HASH) {
        this.ok = true;
      }
    },

    async login(username, password) {
      if (!username || !password) return false;
      if (username.toLowerCase() !== 'admin') return false;

      const hash = await sha256(password);
      if (hash === window.__AUTH_HASH) {
        sessionStorage.setItem('mc-auth', hash);
        this.ok = true;
        // Kick off boot sequence after auth
        Alpine.store('app').boot();
        return true;
      }
      return false;
    },

    logout() {
      sessionStorage.removeItem('mc-auth');
      this.ok = false;
    },
  });

  // --------------------------------------------------------------------------
  // ALPINE.JS STORE: APP (global state)
  // --------------------------------------------------------------------------

  Alpine.store('app', {
    view: 'dashboard',
    booting: true,
    sidebarOpen: true,
    connected: false,
    demoMode: true,

    setView(v) {
      this.view = v;
      // Initialize workflow canvas when switching to workflows
      if (v === 'workflows' && window.initWorkflowCanvas) {
        setTimeout(() => window.initWorkflowCanvas(), 100);
      }
    },

    async boot() {
      // Show boot screen briefly
      await new Promise(r => setTimeout(r, 1800));
      this.booting = false;

      // Try connecting to OpenClaw
      this.tryConnect();
    },

    tryConnect() {
      // Determine WebSocket URL
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = proto + '//' + location.host + '/';

      ocConnection.on('connected', () => {
        this.connected = true;
        this.demoMode = false;
      });

      // On ANY disconnect: go to demo mode and stop. No auto-reconnect.
      // This prevents the connect/disconnect loop that burns API credits.
      ocConnection.on('disconnected', () => {
        this.connected = false;
        this.demoMode = true;
        ocConnection.disconnect(); // cancel any pending reconnect timers
      });

      // Single connection attempt — no auto-reconnect
      ocConnection.connect(wsUrl);

      // If not connected after 5s, enter demo mode
      setTimeout(() => {
        if (!this.connected) {
          this.demoMode = true;
          ocConnection.disconnect();
          Alpine.store('monitor').addLog('info', 'Running in demo mode — use Reconnect to try again');
        }
      }, 5000);
    },

    // Manual reconnect triggered from UI
    reconnect() {
      this.demoMode = false;
      Alpine.store('monitor').addLog('info', 'Attempting to reconnect to OpenClaw...');
      ocConnection.retry();

      // If still not connected after 8s, go back to demo mode
      setTimeout(() => {
        if (!this.connected) {
          this.demoMode = true;
          ocConnection.disconnect();
          Alpine.store('monitor').addLog('warn', 'Reconnect failed — back to demo mode');
        }
      }, 8000);
    },
  });

  // --------------------------------------------------------------------------
  // ALPINE.JS STORE: AGENTS
  // --------------------------------------------------------------------------

  Alpine.store('agents', {
    list: [...DEMO_AGENTS],
    selected: null,
    wizardOpen: false,
    wizardStep: 1,
    wizard: {
      name: '',
      emoji: '🤖',
      description: '',
      model: 'groq-llama-3.3-70b',
      systemPrompt: '',
      tools: [],
    },

    get running() { return this.list.filter(a => a.status === 'running').length; },
    get idle() { return this.list.filter(a => a.status === 'idle').length; },

    openWizard() {
      this.wizard = {
        name: '', emoji: '🤖', description: '',
        model: 'groq-llama-3.3-70b', systemPrompt: '', tools: [],
      };
      this.wizardStep = 1;
      this.wizardOpen = true;
    },

    closeWizard() {
      this.wizardOpen = false;
    },

    nextStep() {
      if (this.wizardStep < 4) this.wizardStep++;
    },

    prevStep() {
      if (this.wizardStep > 1) this.wizardStep--;
    },

    toggleTool(toolId) {
      const idx = this.wizard.tools.indexOf(toolId);
      if (idx >= 0) {
        this.wizard.tools.splice(idx, 1);
      } else {
        this.wizard.tools.push(toolId);
      }
    },

    createAgent() {
      const w = this.wizard;
      if (!w.name.trim()) return;

      const agent = {
        id: generateId(),
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

      this.list.push(agent);
      this.closeWizard();
      Alpine.store('monitor').addLog('info', `Agent "${agent.name}" created with model ${agent.model}`);

      // If connected, send to OpenClaw
      if (!Alpine.store('app').demoMode) {
        ocConnection.send('agent.create', {
          name: agent.name,
          model: agent.model,
          systemPrompt: agent.systemPrompt,
        });
      }
    },

    selectAgent(id) {
      this.selected = this.list.find(a => a.id === id) || null;
    },

    deleteAgent(id) {
      this.list = this.list.filter(a => a.id !== id);
      if (this.selected && this.selected.id === id) this.selected = null;
      Alpine.store('monitor').addLog('info', `Agent removed`);
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
    },
  });

  // --------------------------------------------------------------------------
  // ALPINE.JS STORE: SESSIONS (Chat)
  // --------------------------------------------------------------------------

  Alpine.store('sessions', {
    list: [...DEMO_SESSIONS],
    activeId: null,
    messages: [...DEMO_MESSAGES],
    input: '',

    get active() {
      return this.list.find(s => s.id === this.activeId) || null;
    },

    select(id) {
      this.activeId = id;
      // In real mode, load messages from OpenClaw
      if (!Alpine.store('app').demoMode) {
        ocConnection.send('sessions.history', { sessionId: id });
      }
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
      Alpine.store('app').setView('chat');
    },

    sendMessage() {
      const text = this.input.trim();
      if (!text || !this.activeId) return;

      const msg = {
        id: generateId(),
        role: 'user',
        content: text,
        time: new Date().toTimeString().slice(0, 5),
      };
      this.messages.push(msg);
      this.input = '';

      // Update session
      const session = this.active;
      if (session) {
        session.lastMessage = text.slice(0, 60);
        session.updatedAt = Date.now();
      }

      // In real mode, send to OpenClaw
      if (!Alpine.store('app').demoMode) {
        ocConnection.send('sessions.send', {
          sessionId: this.activeId,
          message: text,
        });
      } else {
        // Demo: simulate agent response
        setTimeout(() => {
          this.messages.push({
            id: generateId(),
            role: 'agent',
            content: 'This is a demo response. Connect to a live OpenClaw instance to interact with real agents.',
            time: new Date().toTimeString().slice(0, 5),
          });
        }, 1000);
      }

      // Scroll to bottom
      setTimeout(() => {
        const el = document.getElementById('chat-messages');
        if (el) el.scrollTop = el.scrollHeight;
      }, 50);
    },
  });

  // --------------------------------------------------------------------------
  // ALPINE.JS STORE: WORKFLOWS
  // --------------------------------------------------------------------------

  Alpine.store('workflows', {
    list: [
      { id: 'wf-1', name: 'Code Review Pipeline', nodes: 4, lastRun: '1h ago', status: 'ready' },
      { id: 'wf-2', name: 'Security Scan', nodes: 3, lastRun: '3h ago', status: 'ready' },
    ],
    activeId: null,
    running: false,

    get active() {
      return this.list.find(w => w.id === this.activeId) || null;
    },

    create(name) {
      const wf = {
        id: generateId(),
        name: name || 'Untitled Workflow',
        nodes: 0,
        lastRun: 'Never',
        status: 'draft',
      };
      this.list.push(wf);
      this.activeId = wf.id;
      return wf;
    },

    save() {
      if (window.workflowGraph) {
        const data = JSON.stringify(window.workflowGraph.serialize());
        localStorage.setItem('mc-workflow-' + this.activeId, data);
        Alpine.store('monitor').addLog('info', 'Workflow saved');
      }
    },

    load(id) {
      this.activeId = id;
      const data = localStorage.getItem('mc-workflow-' + id);
      if (data && window.workflowGraph) {
        window.workflowGraph.configure(JSON.parse(data));
      }
    },

    run() {
      if (!this.activeId) return;
      this.running = true;
      Alpine.store('monitor').addLog('info', `Workflow "${this.active?.name}" executing...`);

      // Demo: simulate run
      setTimeout(() => {
        this.running = false;
        const wf = this.active;
        if (wf) {
          wf.lastRun = 'Just now';
          wf.status = 'completed';
        }
        Alpine.store('monitor').addLog('info', `Workflow completed successfully`);
      }, 3000);
    },
  });

  // --------------------------------------------------------------------------
  // ALPINE.JS STORE: MONITOR
  // --------------------------------------------------------------------------

  Alpine.store('monitor', {
    logs: [...DEMO_LOGS],
    logFilter: 'all',
    tokenUsage: {
      'groq-llama-3.3-70b': { input: 12500, output: 8300, cost: 0 },
      'claude-haiku': { input: 6200, output: 4100, cost: 0.01 },
      'deepseek-chat': { input: 4100, output: 2800, cost: 0.001 },
      'gpt-4o-mini': { input: 2300, output: 1500, cost: 0.0006 },
    },
    systemHealth: {
      openclaw: 'healthy',
      litellm: 'healthy',
      modelsAvailable: 10,
      uptime: '2d 4h 12m',
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
      const now = new Date();
      const time = now.toTimeString().slice(0, 8);
      this.logs.unshift({ time, level, msg });
      if (this.logs.length > 200) this.logs.pop();
    },

    maxUsage() {
      const vals = Object.values(this.tokenUsage).map(m => m.input + m.output);
      return Math.max(...vals, 1);
    },
  });

  // --------------------------------------------------------------------------
  // BOOT — only auto-boot if already authenticated (from sessionStorage)
  // Otherwise, auth.login() will call boot() after successful login.
  // --------------------------------------------------------------------------

  if (Alpine.store('auth').ok) {
    Alpine.store('app').boot();
  }
});

// Export for use in HTML
window.MODELS = MODELS;
window.AGENT_EMOJIS = AGENT_EMOJIS;
window.AGENT_TOOLS = AGENT_TOOLS;
window.formatTokens = formatTokens;
