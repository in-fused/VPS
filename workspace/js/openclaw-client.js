// ============================================================================
// OpenClaw WebSocket Client — Mission Control Integration
// Speaks the OpenClaw Gateway WebSocket RPC protocol
// Falls back gracefully if connection fails
// ============================================================================

class OpenClawClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.authenticated = false;
    this._reqId = 0;
    this._pending = new Map(); // id -> { resolve, reject, timeout }
    this._eventHandlers = new Map(); // event -> Set<callback>
    this._reconnectTimer = null;
    this._reconnectDelay = 2000;
    this._maxReconnectDelay = 30000;
    this._password = null;
  }

  // ---------------------------------------------------------------------------
  // CONNECTION
  // ---------------------------------------------------------------------------

  connect(password) {
    this._password = password;
    return new Promise((resolve, reject) => {
      try {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${proto}//${location.host}/`;

        this.ws = new WebSocket(url);
        this.ws.onopen = () => {
          console.log('[OpenClaw] WebSocket connected, awaiting handshake...');
        };

        this.ws.onmessage = (event) => {
          this._handleMessage(event.data, resolve, reject);
        };

        this.ws.onerror = (err) => {
          console.warn('[OpenClaw] WebSocket error:', err);
        };

        this.ws.onclose = (event) => {
          const wasAuth = this.authenticated;
          this.connected = false;
          this.authenticated = false;
          console.log(`[OpenClaw] WebSocket closed (code: ${event.code})`);

          // Reject all pending requests
          for (const [id, p] of this._pending) {
            p.reject(new Error('Connection closed'));
            clearTimeout(p.timeout);
          }
          this._pending.clear();

          // Fire disconnect event
          this._emit('disconnect', { wasAuthenticated: wasAuth, code: event.code });

          // Auto-reconnect if was previously authenticated
          if (wasAuth && this._password) {
            this._scheduleReconnect();
          }

          // If we never authenticated, reject the connect promise
          if (!wasAuth) {
            reject(new Error(`Connection closed (code: ${event.code})`));
          }
        };

        // Timeout the initial connection
        setTimeout(() => {
          if (!this.authenticated) {
            this.disconnect();
            reject(new Error('Connection timeout'));
          }
        }, 10000);

      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect() {
    this._password = null;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // prevent auto-reconnect
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.authenticated = false;
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    console.log(`[OpenClaw] Reconnecting in ${this._reconnectDelay / 1000}s...`);
    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      try {
        await this.connect(this._password);
        this._reconnectDelay = 2000; // reset on success
        this._emit('reconnect', {});
      } catch {
        // Exponential backoff
        this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._maxReconnectDelay);
        this._scheduleReconnect();
      }
    }, this._reconnectDelay);
  }

  // ---------------------------------------------------------------------------
  // MESSAGE HANDLING
  // ---------------------------------------------------------------------------

  _handleMessage(raw, connectResolve, connectReject) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      console.warn('[OpenClaw] Non-JSON message:', raw);
      return;
    }

    // Handshake: server hello/challenge
    if (msg.type === 'hello' || msg.type === 'challenge') {
      console.log('[OpenClaw] Server challenge received');
      this._sendHandshake(msg);
      return;
    }

    // Handshake: server ack
    if (msg.type === 'hello-ok' || msg.type === 'welcome') {
      console.log('[OpenClaw] Authenticated successfully');
      this.connected = true;
      this.authenticated = true;
      if (connectResolve) connectResolve(true);
      this._emit('connected', msg.payload || {});
      return;
    }

    // Handshake: server rejection
    if (msg.type === 'hello-error' || msg.type === 'error') {
      console.error('[OpenClaw] Auth rejected:', msg.error || msg.message);
      if (connectReject) connectReject(new Error(msg.error || msg.message || 'Auth failed'));
      return;
    }

    // RPC response
    if (msg.type === 'res') {
      const pending = this._pending.get(msg.id);
      if (pending) {
        this._pending.delete(msg.id);
        clearTimeout(pending.timeout);
        if (msg.ok !== false && !msg.error) {
          pending.resolve(msg.payload || msg.result || msg.data || {});
        } else {
          pending.reject(new Error(msg.error?.message || msg.error || 'RPC error'));
        }
      }
      return;
    }

    // Server-push event
    if (msg.type === 'event') {
      this._emit(msg.event, msg.payload || {});
      return;
    }

    // Catch-all for unrecognized messages — might be handshake variants
    console.log('[OpenClaw] Unhandled message type:', msg.type, msg);
  }

  _sendHandshake(challenge) {
    // Build the connect/auth message
    // Protocol: send auth credentials with the challenge nonce
    const authMsg = {
      type: 'connect',
      params: {
        auth: {
          mode: 'password',
          token: this._password,
          password: this._password, // some versions use 'password' key
        },
        protocol: {
          min: 1,
          max: 1,
        },
        role: 'operator',
        scopes: ['operator.read', 'operator.write', 'operator.admin', 'operator.approvals'],
        client: {
          name: 'MissionControl',
          version: '1.0.0',
        },
      },
    };

    // Include nonce if the server sent one
    if (challenge.nonce) {
      authMsg.params.nonce = challenge.nonce;
    }

    this._send(authMsg);
  }

  _send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // ---------------------------------------------------------------------------
  // RPC REQUEST/RESPONSE
  // ---------------------------------------------------------------------------

  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.authenticated) {
        reject(new Error('Not connected to OpenClaw'));
        return;
      }

      const id = ++this._reqId;
      const timeout = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, 30000);

      this._pending.set(id, { resolve, reject, timeout });

      this._send({
        type: 'req',
        id,
        method,
        params,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // EVENT SYSTEM
  // ---------------------------------------------------------------------------

  on(event, callback) {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }
    this._eventHandlers.get(event).add(callback);
    return () => this._eventHandlers.get(event)?.delete(callback);
  }

  _emit(event, payload) {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      for (const cb of handlers) {
        try { cb(payload); } catch (e) { console.error('[OpenClaw] Event handler error:', e); }
      }
    }
    // Also emit wildcard
    const wild = this._eventHandlers.get('*');
    if (wild) {
      for (const cb of wild) {
        try { cb(event, payload); } catch {}
      }
    }
  }

  // ---------------------------------------------------------------------------
  // HIGH-LEVEL API: AGENTS
  // ---------------------------------------------------------------------------

  async listAgents() {
    const result = await this.request('agents.list');
    return result.agents || result || [];
  }

  async addAgent(config) {
    return this.request('agents.add', config);
  }

  async deleteAgent(agentId) {
    return this.request('agents.delete', { agentId });
  }

  // ---------------------------------------------------------------------------
  // HIGH-LEVEL API: SESSIONS
  // ---------------------------------------------------------------------------

  async listSessions(agentId) {
    const params = agentId ? { agentId } : {};
    const result = await this.request('sessions.list', params);
    return result.sessions || result || [];
  }

  async getHistory(sessionId) {
    const result = await this.request('chat.history', { sessionId });
    return result.messages || result || [];
  }

  async deleteSession(sessionId) {
    return this.request('sessions.delete', { sessionId });
  }

  // ---------------------------------------------------------------------------
  // HIGH-LEVEL API: CHAT
  // ---------------------------------------------------------------------------

  // Send a chat message and return the runId for tracking streaming events
  async sendChat(text, options = {}) {
    const params = {
      message: text,
      ...options,
    };
    const result = await this.request('chat.send', params);
    return result; // { runId, status: "started" }
  }

  async abortChat(runId) {
    return this.request('chat.abort', { runId });
  }

  // ---------------------------------------------------------------------------
  // HIGH-LEVEL API: CONFIG & TOOLS
  // ---------------------------------------------------------------------------

  async getConfig() {
    return this.request('config.get');
  }

  async getToolsCatalog() {
    return this.request('tools.catalog');
  }

  async getCronJobs() {
    return this.request('cron.status');
  }
}

// Singleton instance
window.openclawClient = new OpenClawClient();
