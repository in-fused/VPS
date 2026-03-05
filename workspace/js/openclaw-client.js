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

    // Shared reconnection logic — called from visibility, pageshow, and focus handlers.
    // iOS needs all three: visibilitychange misses some app-switcher returns,
    // pageshow misses some lock-screen returns, focus is the final fallback.
    this._tryReconnect = () => {
      if (this._password && !this.authenticated) {
        this._backgrounded = false;
        this._reconnectDelay = 2000;
        this._connectionState = 'reconnecting';
        this._scheduleReconnect();
      }
    };

    this._onVisibilityChange = () => {
      if (document.hidden) {
        this._backgrounded = true;
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
        this._stopKeepAlive();
      } else {
        this._backgrounded = false;
        if (this.authenticated) this._startKeepAlive();
        else this._tryReconnect();
      }
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    this._onPageShow = (event) => {
      if (event.persisted || !this.authenticated) this._tryReconnect();
    };
    window.addEventListener('pageshow', this._onPageShow);

    this._onFocus = () => {
      if (!this._backgrounded) this._tryReconnect();
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
    // Close any existing connection to prevent orphaned WebSockets.
    // This can happen if boot() or reconnect() is called while already connected.
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      const oldWs = this.ws;
      oldWs.onclose = null; // prevent auto-reconnect from the old socket
      oldWs.onmessage = null;
      oldWs.onerror = null;
      oldWs.close();
      this.ws = null;
    }
    // Cancel any pending reconnect from the old connection
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
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
        this._handshakeSent = false;

        ws.onopen = () => {
          this._log('info', `TCP connected to ${url}, awaiting server hello...`);
          // Do NOT send handshake here. OpenClaw's gateway sends its hello
          // first — sending our connect before that triggers "invalid request
          // frame" (1008). Wait for the server's initial message in onmessage.
        };

        ws.onmessage = (event) => {
          // Debug: log raw message type for handshake diagnosis
          try {
            const peek = JSON.parse(event.data);
            const extra = peek.event ? ` event=${peek.event}` : '';
            this._log('info', `recv type=${peek.type}${extra}`);
          } catch { this._log('warn', `recv non-JSON: ${event.data?.slice?.(0, 80)}`); }
          this._handleMessage(event.data, (result) => {
            if (!settled) { settled = true; resolve(result); }
          }, (err) => {
            if (!settled) { settled = true; reject(err); }
          });
        };

        ws.onerror = () => {
          // Note: browsers hide WebSocket error details for security — this is normal
          this._log('info', `WebSocket error event on ${url} (see close code for details)`);
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
        // Use a lightweight documented RPC method; if it times out, the socket is dead
        this.request('health', {}).catch(() => {
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

    // Handshake: server hello/challenge (classic format)
    if (msg.type === 'hello' || msg.type === 'challenge') {
      this._log('info', 'Server hello received, sending auth...');
      this._handshakeSent = true;
      this._sendHandshake(msg);
      return;
    }

    // Auth success helper (shared by hello-ok, welcome, and v3 connect response)
    const _authSuccess = (payload) => {
      this._log('info', 'Authenticated successfully');
      this.connected = true;
      this.authenticated = true;
      this._lastError = null;
      this._connectionState = 'connected';
      this._startKeepAlive();
      if (connectResolve) connectResolve(true);
      this._emit('connected', payload || {});
    };
    const _authFail = (errMsg) => {
      this._log('error', `Auth rejected: ${errMsg}`);
      this._lastError = errMsg;
      this._connectionState = 'disconnected';
      if (connectReject) connectReject(new Error(errMsg));
    };

    // Handshake: server ack (legacy hello-ok / welcome)
    if (msg.type === 'hello-ok' || msg.type === 'welcome') {
      _authSuccess(msg.payload);
      return;
    }

    // Handshake: server rejection
    if (msg.type === 'hello-error' || msg.type === 'error') {
      _authFail(msg.error || msg.message || 'Auth failed');
      return;
    }

    // Server-push event — may also be the server's hello in newer format
    if (msg.type === 'event') {
      if (!this._handshakeSent) {
        this._log('info', `Server initial event (${msg.event || 'unknown'}), sending auth...`);
        this._handshakeSent = true;
        this._sendHandshake(msg.payload || {});
      }
      this._emit(msg.event, msg.payload || {});
      return;
    }

    // Connect response — v3 protocol auth acknowledgment
    if (msg.type === 'res' && String(msg.id) === this._connectReqId) {
      if (msg.ok !== false && !msg.error) {
        _authSuccess(msg.payload);
      } else {
        _authFail(msg.error?.message || msg.error || 'Auth failed');
      }
      return;
    }

    // RPC response — match by string ID (server may echo back number or string)
    if (msg.type === 'res') {
      const pending = this._pending.get(String(msg.id));
      if (pending) {
        this._pending.delete(String(msg.id));
        clearTimeout(pending.timeout);
        if (msg.ok !== false && !msg.error) {
          pending.resolve(msg.payload || msg.result || msg.data || {});
        } else {
          pending.reject(new Error(msg.error?.message || msg.error || 'RPC error'));
        }
      }
      return;
    }

    // Catch-all for unrecognized messages — send handshake if not sent yet
    this._log('info', `Unhandled msg type: ${msg.type}`);
    if (!this._handshakeSent) {
      this._log('info', 'Treating unrecognized first message as server hello, sending auth...');
      this._handshakeSent = true;
      this._sendHandshake(msg);
    }
  }

  // ===========================================================================
  // VERIFIED WORKING HANDSHAKE — DO NOT MODIFY without testing on live server.
  // ===========================================================================
  // This exact message format was validated against OpenClaw v3 protocol on
  // 2026-03-02 after 3 rounds of breakage. Every field is load-bearing:
  //
  //   auth.token     — required for token-mode compat; some versions check this
  //   auth.password  — required for password-mode; omitting → "gateway password missing"
  //   auth.mode      — do NOT include; schema rejects it as unexpected property
  //   client.id      — must be 'webchat' (schema rejects unknown constants)
  //   client.mode    — must be 'webchat'
  //   device block   — must be OMITTED entirely (dummy crypto → "device identity mismatch")
  //   role/scopes    — 'operator' with full scope list
  //
  // If you change ANY of these fields, you MUST test the WebSocket connection
  // end-to-end on the live server before pushing. The owner deploys from an
  // iPhone — broken pushes cost hours of debugging on a mobile screen.
  // ===========================================================================
  _sendHandshake(challenge) {
    const hasPw = !!(this._password && this._password.length > 0);
    const nonce = challenge?.nonce || '';
    this._log('info', `Sending handshake (hasPassword=${hasPw}, hasNonce=${!!nonce})`);

    this._connectReqId = String(++this._reqId);

    const authMsg = {
      type: 'req',
      id: this._connectReqId,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        auth: {
          token: this._password,
          password: this._password,
        },
        role: 'operator',
        scopes: ['operator.read', 'operator.write', 'operator.admin', 'operator.approvals', 'operator.pairing'],
        client: {
          id: 'webchat',
          version: '1.0.0',
          platform: 'web',
          mode: 'webchat',
        },
        // NO device block — dangerouslyDisableDeviceAuth + allowInsecureAuth
        // on the server means device identity is not required. Sending dummy
        // crypto values causes "device identity mismatch" (1008).
      },
    };

    this._log('info', `Handshake frame: type=req method=connect proto=3 (no device block — auth bypass)`);
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

      const id = String(++this._reqId);
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
        try { cb(event, payload); } catch (e) { console.error('[OpenClaw] Wildcard handler error:', e); }
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
    const params = {};
    if (agentId) params.agentId = agentId;
    params.includeDerivedTitles = true;
    params.includeLastMessage = true;
    const result = await this.request('sessions.list', params);
    return result.sessions || result || [];
  }

  async getHistory(sessionKey) {
    const result = await this.request('chat.history', { sessionKey });
    return result.messages || result || [];
  }

  async deleteSession(sessionKey) {
    return this.request('sessions.delete', { key: sessionKey });
  }

  async resetSession(sessionKey, reason) {
    const params = { key: sessionKey };
    if (reason) params.reason = reason;
    return this.request('sessions.reset', params);
  }

  // ---------------------------------------------------------------------------
  // HIGH-LEVEL API: CHAT
  // ---------------------------------------------------------------------------

  // ===========================================================================
  // VERIFIED SCHEMA — ChatSendParamsSchema (additionalProperties: false)
  // ===========================================================================
  // Required: sessionKey (NonEmptyString), message (String), idempotencyKey (NonEmptyString)
  // Optional: thinking (String), deliver (Boolean), attachments (Array), timeoutMs (Integer)
  // NO other fields allowed — agentId, sessionId, etc. cause validation errors.
  // Session key format: "agent:<agentId>:main" for webchat DMs.
  // deliver: false prevents forwarding to external channels (Telegram, Discord).
  // ===========================================================================
  async sendChat(text, { sessionKey, timeoutMs } = {}) {
    if (!sessionKey) throw new Error('sessionKey is required for chat.send');
    const params = {
      sessionKey,
      message: text,
      idempotencyKey: this._generateId(),
      deliver: false,
    };
    if (timeoutMs !== undefined) params.timeoutMs = timeoutMs;
    const result = await this.request('chat.send', params);
    return result;
  }

  // Generate a unique ID for idempotency keys
  _generateId() {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 10);
    return `mc-${ts}-${rand}`;
  }

  async abortChat(sessionKey, runId) {
    const params = { sessionKey };
    if (runId) params.runId = runId;
    return this.request('chat.abort', params);
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

  // ---------------------------------------------------------------------------
  // HIGH-LEVEL API: CRON JOBS
  // ---------------------------------------------------------------------------

  async listCronJobs() {
    const result = await this.request('cron.list');
    return result.jobs || result || [];
  }

  async addCronJob(job) {
    return this.request('cron.add', job);
  }

  async removeCronJob(jobId) {
    return this.request('cron.remove', { id: jobId });
  }

  async runCronJob(jobId) {
    return this.request('cron.run', { id: jobId });
  }

  async getCronRuns(jobId) {
    const result = await this.request('cron.runs', { id: jobId });
    return result.runs || result || [];
  }
}

// Singleton instance
window.openclawClient = new OpenClawClient();
