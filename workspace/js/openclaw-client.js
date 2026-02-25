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
    this._backgrounded = false;

    // iOS/mobile: pause reconnection when app is backgrounded to save battery.
    // Force a clean reconnect when the user returns.
    this._onVisibilityChange = () => {
      if (document.hidden) {
        this._backgrounded = true;
        // Cancel any pending reconnect timers — no point retrying while hidden
        if (this._reconnectTimer) {
          clearTimeout(this._reconnectTimer);
          this._reconnectTimer = null;
        }
      } else {
        this._backgrounded = false;
        // If we were authenticated but the socket died while backgrounded, reconnect
        if (this._password && !this.authenticated) {
          this._reconnectDelay = 2000; // reset backoff — user is actively returning
          this._scheduleReconnect();
        }
      }
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  // ---------------------------------------------------------------------------
  // CONNECTION — uses /ws/openclaw (dedicated route, avoids root-path conflicts)
  // Falls back to / (legacy root WebSocket) if the dedicated route fails.
  // ---------------------------------------------------------------------------

  connect(password, { maxRetries = 2 } = {}) {
    this._password = password;
    return this._attemptConnect(password, maxRetries);
  }

  async _attemptConnect(password, retriesLeft) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Dedicated WebSocket path — Caddy strips /ws/openclaw and proxies to
    // openclaw:18789/ so the gateway sees a connection at root (as expected).
    const paths = ['/ws/openclaw', '/'];

    for (const path of paths) {
      try {
        const result = await this._connectToPath(`${proto}//${location.host}${path}`);
        return result;
      } catch (err) {
        console.warn(`[OpenClaw] WebSocket ${path} failed: ${err.message}`);
        // Try next path
      }
    }

    // All paths failed — retry with backoff if retries remain
    if (retriesLeft > 0) {
      const delay = (3 - retriesLeft) * 3000; // 3s, 6s
      console.log(`[OpenClaw] All paths failed, retrying in ${delay / 1000}s (${retriesLeft} left)...`);
      await new Promise(r => setTimeout(r, delay));
      return this._attemptConnect(password, retriesLeft - 1);
    }

    throw new Error('Connection timeout');
  }

  _connectToPath(url) {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        let settled = false;

        ws.onopen = () => {
          console.log(`[OpenClaw] WebSocket connected to ${url}, awaiting handshake...`);
        };

        ws.onmessage = (event) => {
          this._handleMessage(event.data, (result) => {
            if (!settled) { settled = true; resolve(result); }
          }, (err) => {
            if (!settled) { settled = true; reject(err); }
          });
        };

        ws.onerror = (err) => {
          console.warn('[OpenClaw] WebSocket error:', err);
        };

        ws.onclose = (event) => {
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
          if (!wasAuth && !settled) {
            settled = true;
            reject(new Error(`Connection closed (code: ${event.code})`));
          }
        };

        // Store ws reference so _handleMessage and _sendHandshake work
        this.ws = ws;

        // Timeout the initial connection
        setTimeout(() => {
          if (!this.authenticated && !settled) {
            ws.onclose = null; // prevent auto-reconnect for this attempt
            ws.close();
            settled = true;
            reject(new Error('Handshake timeout'));
          }
        }, 8000);

      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect() {
    this._password = null;
    this._backgrounded = false;
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

    // Clear all event handlers so re-connecting after logout doesn't
    // accumulate duplicate listeners from previous sessions.
    this._eventHandlers.clear();
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    // Don't attempt reconnection while iOS/mobile has us backgrounded
    if (this._backgrounded) return;
    console.log(`[OpenClaw] Reconnecting in ${this._reconnectDelay / 1000}s...`);
    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      try {
        await this.connect(this._password, { maxRetries: 1 });
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
