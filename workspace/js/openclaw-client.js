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
    this._keepAliveTimer = null;
    this._lastError = null; // last connection error message for UI display
    this._connectionState = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

    // Restore password from sessionStorage if page was reloaded (iOS memory pressure).
    // The password is also stored as a cookie hash, but we need the raw password for
    // OpenClaw WebSocket auth. sessionStorage is tab-scoped and cleared on tab close,
    // so this is acceptable from a security perspective.
    try {
      const saved = sessionStorage.getItem('mc-oc-pw');
      if (saved) this._password = saved;
    } catch {}

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
        // Stop keep-alive pings while backgrounded
        this._stopKeepAlive();
      } else {
        this._backgrounded = false;
        // If we were authenticated but the socket died while backgrounded, reconnect
        if (this._password && !this.authenticated) {
          this._reconnectDelay = 2000; // reset backoff — user is actively returning
          this._connectionState = 'reconnecting';
          this._scheduleReconnect();
        } else if (this.authenticated) {
          // Socket survived backgrounding — restart keep-alive
          this._startKeepAlive();
        }
      }
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    // iOS: pageshow fires more reliably than visibilitychange when returning
    // from the app switcher or lock screen. 'persisted' means it was restored
    // from the back-forward cache (bfcache).
    this._onPageShow = (event) => {
      if (event.persisted || !this.authenticated) {
        // Page was restored from cache or socket is dead — force reconnect
        if (this._password && !this.authenticated) {
          this._backgrounded = false;
          this._reconnectDelay = 2000;
          this._connectionState = 'reconnecting';
          this._scheduleReconnect();
        }
      }
    };
    window.addEventListener('pageshow', this._onPageShow);

    // Additional reconnection trigger via focus event (catches cases where
    // visibilitychange and pageshow both fail on iOS)
    this._onFocus = () => {
      if (this._password && !this.authenticated && !this._backgrounded) {
        this._reconnectDelay = 2000;
        this._connectionState = 'reconnecting';
        this._scheduleReconnect();
      }
    };
    window.addEventListener('focus', this._onFocus);
  }

  // ---------------------------------------------------------------------------
  // DIAGNOSTIC LOGGING — visible in Monitor view on mobile (not just console)
  // ---------------------------------------------------------------------------

  _log(level, msg) {
    const prefix = '[OpenClaw] ';
    if (level === 'error') console.error(prefix + msg);
    else if (level === 'warn') console.warn(prefix + msg);
    else console.log(prefix + msg);
    // Write to Monitor store if Alpine is initialized
    try {
      if (window.Alpine?.store?.('monitor')) {
        window.Alpine.store('monitor').addLog(level, 'WS: ' + msg);
      }
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // CONNECTION — uses /ws/openclaw (dedicated route, avoids root-path conflicts)
  // Falls back to / (legacy root WebSocket) if the dedicated route fails.
  // ---------------------------------------------------------------------------

  connect(password, { maxRetries = 2 } = {}) {
    this._password = password;
    this._lastError = null;
    this._connectionState = 'connecting';
    // Persist password in sessionStorage so iOS page reloads don't lose it.
    // sessionStorage is tab-scoped (cleared on tab close) — acceptable tradeoff.
    try { sessionStorage.setItem('mc-oc-pw', password); } catch {}
    // Re-attach event handlers if they were removed by disconnect()
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    window.removeEventListener('pageshow', this._onPageShow);
    window.addEventListener('pageshow', this._onPageShow);
    window.removeEventListener('focus', this._onFocus);
    window.addEventListener('focus', this._onFocus);
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

    this._lastError = 'All connection attempts failed';
    this._connectionState = 'disconnected';
    throw new Error('Connection timeout');
  }

  _connectToPath(url) {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        let settled = false;

        ws.onopen = () => {
          this._log('info', `TCP connected to ${url}, sending auth...`);
          // Client-speaks-first: send connect message immediately.
          // Older OpenClaw versions send a hello/challenge first (handled
          // in _handleMessage), but current versions expect the client to
          // initiate. Sending proactively works with both — if the server
          // sends a challenge with a nonce, we'll re-send with it.
          this._sendHandshake({});
        };

        ws.onmessage = (event) => {
          // Debug: log raw message type for handshake diagnosis
          try {
            const peek = JSON.parse(event.data);
            this._log('info', `recv type=${peek.type}`);
          } catch { this._log('warn', `recv non-JSON: ${event.data?.slice?.(0, 80)}`); }
          this._handleMessage(event.data, (result) => {
            if (!settled) { settled = true; resolve(result); }
          }, (err) => {
            if (!settled) { settled = true; reject(err); }
          });
        };

        ws.onerror = () => {
          this._log('warn', `error on ${url} (browser hides details)`);
        };

        ws.onclose = (event) => {
          const wasAuth = this.authenticated;
          this.connected = false;
          this.authenticated = false;
          this._stopKeepAlive();
          this._log('info', `closed (code: ${event.code}, reason: ${event.reason || 'none'})`);

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
            this._lastError = `Disconnected (code: ${event.code})`;
            this._connectionState = 'reconnecting';
            this._scheduleReconnect();
          }

          // If we never authenticated, reject the connect promise
          if (!wasAuth && !settled) {
            settled = true;
            this._lastError = `Connection closed (code: ${event.code})`;
            this._connectionState = 'disconnected';
            reject(new Error(`Connection closed (code: ${event.code})`));
          }
        };

        // Store ws reference so _handleMessage and _sendHandshake work
        this.ws = ws;

        // Timeout the initial connection — 15s for mobile networks
        setTimeout(() => {
          if (!this.authenticated && !settled) {
            this._log('warn', `Handshake timeout on ${url} — 15s, readyState=${ws.readyState}`);
            ws.onclose = null; // prevent auto-reconnect for this attempt
            ws.close();
            settled = true;
            this._lastError = 'Handshake timeout (15s)';
            this._connectionState = 'disconnected';
            reject(new Error('Handshake timeout'));
          }
        }, 15000);

      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect() {
    this._password = null;
    this._backgrounded = false;
    this._lastError = null;
    this._connectionState = 'disconnected';
    this._stopKeepAlive();
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

    // Clear persisted password on explicit disconnect (logout)
    try { sessionStorage.removeItem('mc-oc-pw'); } catch {}

    // Remove all event listeners to prevent leaked listeners
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    window.removeEventListener('pageshow', this._onPageShow);
    window.removeEventListener('focus', this._onFocus);

    // Clear all event handlers so re-connecting after logout doesn't
    // accumulate duplicate listeners from previous sessions.
    this._eventHandlers.clear();
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    // Don't attempt reconnection while iOS/mobile has us backgrounded
    if (this._backgrounded) return;
    this._connectionState = 'reconnecting';
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

  // Keep-alive: send a lightweight RPC ping every 45s to detect dead sockets
  // before the OS silently closes them (iOS aggressively kills idle sockets).
  _startKeepAlive() {
    this._stopKeepAlive();
    this._keepAliveTimer = setInterval(() => {
      if (this.authenticated && this.ws?.readyState === WebSocket.OPEN) {
        // Use a no-op RPC request; if it times out, the socket is dead
        this.request('ping', {}).catch(() => {
          console.warn('[OpenClaw] Keep-alive ping failed — socket likely dead');
          // Force close to trigger reconnect
          if (this.ws) {
            this.ws.close();
          }
        });
      }
    }, 45000);
  }

  _stopKeepAlive() {
    if (this._keepAliveTimer) {
      clearInterval(this._keepAliveTimer);
      this._keepAliveTimer = null;
    }
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
      this._log('info', 'Authenticated successfully');
      this.connected = true;
      this.authenticated = true;
      this._lastError = null;
      this._connectionState = 'connected';
      this._startKeepAlive();
      if (connectResolve) connectResolve(true);
      this._emit('connected', msg.payload || {});
      return;
    }

    // Handshake: server rejection
    if (msg.type === 'hello-error' || msg.type === 'error') {
      const errMsg = msg.error || msg.message || 'Auth failed';
      this._log('error', `Auth rejected: ${errMsg}`);
      this._lastError = errMsg;
      this._connectionState = 'disconnected';
      if (connectReject) connectReject(new Error(errMsg));
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
    // Build the connect/auth message.
    // Called immediately on ws.onopen (client-speaks-first) and again
    // if the server sends a hello/challenge with a nonce (server-speaks-first).
    const hasPw = !!(this._password && this._password.length > 0);
    this._log('info', `Sending handshake (hasPassword=${hasPw}, hasNonce=${!!(challenge?.nonce)})`);
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

    // Include nonce if the server sent one (server-speaks-first protocol)
    if (challenge && challenge.nonce) {
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
      // Snapshot the Set so handlers can safely unsubscribe during iteration
      for (const cb of [...handlers]) {
        try { cb(payload); } catch (e) { console.error('[OpenClaw] Event handler error:', e); }
      }
    }
    // Also emit wildcard
    const wild = this._eventHandlers.get('*');
    if (wild) {
      for (const cb of [...wild]) {
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
