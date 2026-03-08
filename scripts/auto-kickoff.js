// ============================================================================
// Auto-Kickoff — Sends startup message to both leads after OpenClaw boots
// ============================================================================
// Runs from the entrypoint after 30s delay. Connects to OpenClaw WS, sends
// a "wake up" message that triggers BOOTSTRAP.md execution, then exits.
// ============================================================================

const WebSocket = require('ws');

const OC_URL = 'ws://localhost:18789/';
const PASSWORD = process.env.OPENCLAW_PASSWORD || process.env.OPENCLAW_GATEWAY_PASSWORD || '';
const LEADS = ['lead', 'ops-lead'];

// Message to trigger bootstrap — directive, non-optional
const KICKOFF_MSG = `SYSTEM RESTART. You are now online. This is not a request — execute immediately:

1. Run BOOTSTRAP.md Phase 0 (warmup: test read, write, comms)
2. Set up your inbox-check cron job (see BOOTSTRAP.md Phase 1)
3. Read /workspace/staging/index.json and /workspace/agent-activity/log.json
4. If pending work exists, execute it NOW. If not, CREATE work for your team.
5. Message each team member with a task assignment.

Do NOT reply with a plan. Do NOT ask for clarification. Execute these steps using your tools RIGHT NOW.`;

function generateId() {
  return 'kickoff-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function kickoff() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(OC_URL);
    let reqId = 0;
    const pending = new Map();
    let authenticated = false;
    let sent = 0;

    const timeout = setTimeout(() => {
      console.log('[kickoff] Timeout after 30s, closing');
      ws.close();
      resolve(sent);
    }, 30000);

    ws.on('error', (err) => {
      console.warn('[kickoff] WS error:', err.message);
      clearTimeout(timeout);
      reject(err);
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      resolve(sent);
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      // Handle hello/challenge → send connect handshake
      if (msg.type === 'hello' || msg.type === 'challenge') {
        const id = String(++reqId);
        ws.send(JSON.stringify({
          type: 'req',
          id,
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            auth: { token: PASSWORD, password: PASSWORD },
            role: 'operator',
            scopes: ['operator.read', 'operator.write', 'operator.admin'],
            client: { id: 'webchat', version: '1.0.0', platform: 'web', mode: 'backend' },
          },
        }));
        pending.set(id, 'connect');
        return;
      }

      // Handle responses
      if (msg.type === 'res') {
        const what = pending.get(msg.id);
        pending.delete(msg.id);

        if (what === 'connect') {
          if (msg.error) {
            console.error('[kickoff] Auth failed:', msg.error);
            ws.close();
            return;
          }
          authenticated = true;
          console.log('[kickoff] Authenticated. Sending kickoff to leads...');
          sendToLeads();
          return;
        }

        if (what && what.startsWith('chat:')) {
          const agent = what.split(':')[1];
          if (msg.error) {
            console.warn(`[kickoff] chat.send to ${agent} failed:`, msg.error);
          } else {
            console.log(`[kickoff] Sent to ${agent} ✓`);
            sent++;
          }
          // Close after sending to all leads
          if (pending.size === 0) {
            console.log(`[kickoff] Done. ${sent}/${LEADS.length} leads activated.`);
            ws.close();
          }
        }
      }
    });

    function sendToLeads() {
      for (const agentId of LEADS) {
        const id = String(++reqId);
        pending.set(id, `chat:${agentId}`);
        ws.send(JSON.stringify({
          type: 'req',
          id,
          method: 'chat.send',
          params: {
            sessionKey: `agent:${agentId}:main`,
            message: KICKOFF_MSG,
            idempotencyKey: generateId(),
            deliver: false,
          },
        }));
      }
    }
  });
}

// Run on every restart when enabled — agents must bootstrap fresh each time
if (process.env.OPENCLAW_AUTO_KICKOFF === '1') {
  console.log('[kickoff] Auto-kickoff enabled. Connecting to OpenClaw...');
  kickoff()
    .then((n) => console.log(`[kickoff] Complete. ${n} leads activated.`))
    .catch((err) => console.warn('[kickoff] Failed:', err.message));
} else {
  console.log('[kickoff] Auto-kickoff disabled. Set OPENCLAW_AUTO_KICKOFF=1 in .env to enable.');
}
