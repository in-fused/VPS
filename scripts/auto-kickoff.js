// ============================================================================
// Auto-Kickoff — Sends startup message to both leads after OpenClaw boots
// ============================================================================
// Runs from the entrypoint after RPC seed completes. Connects to OpenClaw WS,
// sends a "wake up" message that triggers BOOTSTRAP.md execution, then exits.
//
// Uses Node.js v22+ native WebSocket (no external dependencies).
// ============================================================================

const OC_URL = 'ws://localhost:18789/';
const PASSWORD = process.env.OPENCLAW_PASSWORD || process.env.OPENCLAW_GATEWAY_PASSWORD || '';
const LEADS = ['lead', 'ops-lead'];

// Message to trigger bootstrap — directive, non-optional
const KICKOFF_MSG = `SYSTEM RESTART. You are now online. You are the swarm lead — the owner is overhead, not in the loop. Self-organize.

## Step 0: LOAD CONTEXT (do this FIRST)
\`read("AGENTS.md")\` — team roster, every agent ID, messaging syntax
\`read("TOOLS.md")\` — every tool, file path, permission, protocol, "WHEN STUCK" recovery
\`read("MEMORY.md")\` — infrastructure, models, reference docs, Oracle ARM
These files ARE your operating manual. Every question you might ask is already answered here.

## Step 1: BOOTSTRAP
Execute BOOTSTRAP.md now. Phase -1 (context) → Phase 0 (verify tools, log online, message team, set up cron).

## Step 2: ACTIVATE THE SWARM
Message each team member with a SPECIFIC task — full context, exact output path, staging + logging instructions, confirm-back.
P2P is your primary channel. Cross-team is encouraged. Pull in whoever has the right skills.

## Step 3: PRODUCE OUTPUT
If pending work exists in staging/activity, execute it NOW.
If not, CREATE work. Assign tasks, build something yourself, delegate research.
The owner will check staging on their phone — if it's empty, the swarm failed.

## Step 4: STAY ALIVE
Your inbox-check cron (*/5 min) and heartbeat cron (every 2h) keep the swarm running 24/7.
If an agent goes silent, poke them. If they stay silent, do their work or reassign.

## IF STUCK
Read /workspace/reference/startup-chain.md for how the full autonomy chain works.
Read /workspace/reference/openclaw/index.md for OpenClaw config, RPC, tools, cron syntax.
Message another agent for help — you are never alone.

Do NOT reply with a plan. Do NOT ask for clarification. Execute using your tools RIGHT NOW.`;

function generateId() {
  return 'kickoff-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function kickoff() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(OC_URL);
    let reqId = 0;
    const pending = new Map();
    let sent = 0;

    const timeout = setTimeout(() => {
      console.log('[kickoff] Timeout after 30s, closing');
      ws.close();
      resolve(sent);
    }, 30000);

    ws.addEventListener('error', (event) => {
      console.warn('[kickoff] WS error:', event.message || 'connection failed');
      clearTimeout(timeout);
      reject(new Error('WebSocket error'));
    });

    ws.addEventListener('close', () => {
      clearTimeout(timeout);
      resolve(sent);
    });

    let handshakeSent = false;

    function sendConnect() {
      if (handshakeSent) return;
      handshakeSent = true;
      const id = String(++reqId);
      console.log('[kickoff] Sending connect handshake...');
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
    }

    ws.addEventListener('message', (event) => {
      const raw = typeof event.data === 'string' ? event.data : String(event.data);
      let msg;
      try { msg = JSON.parse(raw); } catch (e) {
        console.warn('[kickoff] Non-JSON message:', raw.slice(0, 120));
        return;
      }

      // Debug: log message types during handshake
      if (!handshakeSent) {
        console.log(`[kickoff] recv type=${msg.type} event=${msg.event || 'n/a'}`);
      }

      // Handle hello/challenge → send connect handshake
      if (msg.type === 'hello' || msg.type === 'challenge') {
        sendConnect();
        return;
      }

      // Handle event-type hello (newer OpenClaw versions)
      if (msg.type === 'event' && !handshakeSent) {
        sendConnect();
        return;
      }

      // Catch-all: any unrecognized first message triggers handshake
      if (!handshakeSent) {
        console.log(`[kickoff] Unrecognized first msg type=${msg.type}, sending connect anyway`);
        sendConnect();
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
