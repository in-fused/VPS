// ============================================================================
// Auto-Kickoff — Deduplicates cron jobs, then sends startup message to leads
// ============================================================================
// Runs from the entrypoint after RPC seed completes. Connects to OpenClaw WS,
// removes duplicate cron jobs (inbox-check, heartbeat, summary) via cron.status
// + cron.remove, then sends BOOTSTRAP.md kickoff to both leads.
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
Your inbox-check cron (every 2h) and heartbeat cron (every 4h) keep the swarm running 24/7.
If an agent goes silent, poke them. If they stay silent, do their work or reassign.

## IF STUCK
Read /workspace/reference/startup-chain.md for how the full autonomy chain works.
Read /workspace/reference/openclaw/index.md for OpenClaw config, RPC, tools, cron syntax.
Message another agent for help — you are never alone.

Do NOT reply with a plan. Do NOT ask for clarification. Execute using your tools RIGHT NOW.`;

function generateId() {
  return 'kickoff-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

// ---- RPC helper: send request, return promise of response payload ----
function rpcCall(ws, reqIdRef, pendingMap, method, params) {
  return new Promise((resolve, reject) => {
    const id = String(++reqIdRef.n);
    pendingMap.set(id, { resolve, reject });
    ws.send(JSON.stringify({ type: 'req', id, method, params: params || {} }));
  });
}

// ---- Cron dedup: remove duplicate inbox-check and heartbeat crons ----
async function dedupCronJobs(ws, reqIdRef, pendingMap) {
  let jobs;
  try {
    const result = await rpcCall(ws, reqIdRef, pendingMap, 'cron.status');
    // cron.status returns { jobs: [...] } or an array directly
    jobs = Array.isArray(result) ? result : (result && Array.isArray(result.jobs) ? result.jobs : []);
  } catch (err) {
    console.warn('[kickoff] cron.status failed, skipping dedup:', err.message || err);
    return 0;
  }

  if (jobs.length === 0) {
    console.log('[kickoff] No cron jobs found, nothing to dedup');
    return 0;
  }

  console.log(`[kickoff] Found ${jobs.length} total cron jobs, checking for duplicates...`);

  // Group jobs by agent + type (inbox-check vs heartbeat vs other)
  const groups = {};
  for (const job of jobs) {
    const agentId = job.agentId || (job.sessionKey && job.sessionKey.match(/agent:([^:]+):/)?.[1]) || job.agent || 'unknown';
    const msg = (job.payload && job.payload.message) || job.message || '';
    const schedule = (job.schedule && (job.schedule.expression || job.schedule.every)) || job.cron || job.every || '';

    // Classify the job
    let type = 'other';
    if (/inbox.check/i.test(msg) || /inbox.check/i.test(job.label || '')) {
      type = 'inbox-check';
    } else if (/heartbeat/i.test(msg) || /heartbeat/i.test(job.label || '')) {
      type = 'heartbeat';
    } else if (/summary|provide a summary/i.test(msg)) {
      type = 'summary';
    }

    const key = `${agentId}::${type}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ id: job.id || job.jobId, agentId, type, schedule, label: job.label || '' });
  }

  // For each group with more than 1 job, keep the first, remove the rest
  let removed = 0;
  for (const [key, groupJobs] of Object.entries(groups)) {
    if (groupJobs.length <= 1) continue;

    console.log(`[kickoff] Agent "${groupJobs[0].agentId}" has ${groupJobs.length} "${groupJobs[0].type}" crons — removing ${groupJobs.length - 1} duplicates`);

    // Keep the first, remove the rest
    for (let i = 1; i < groupJobs.length; i++) {
      const jobId = groupJobs[i].id;
      if (!jobId) {
        console.warn(`[kickoff] Skipping removal — job has no ID:`, groupJobs[i]);
        continue;
      }
      try {
        await rpcCall(ws, reqIdRef, pendingMap, 'cron.remove', { id: jobId });
        console.log(`[kickoff] Removed duplicate cron ${jobId} (${groupJobs[i].type} for ${groupJobs[i].agentId})`);
        removed++;
      } catch (err) {
        console.warn(`[kickoff] Failed to remove cron ${jobId}:`, err.message || err);
      }
    }
  }

  console.log(`[kickoff] Dedup complete: removed ${removed} duplicate cron jobs`);
  return removed;
}

function kickoff() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(OC_URL);
    const reqIdRef = { n: 0 };
    const rpcPending = new Map();  // id → { resolve, reject } for RPC calls
    const chatPending = new Map(); // id → agentId for chat.send tracking
    let sent = 0;

    const timeout = setTimeout(() => {
      console.log('[kickoff] Timeout after 60s, closing');
      ws.close();
      resolve(sent);
    }, 60000);

    ws.addEventListener('error', (event) => {
      console.warn('[kickoff] WS error:', event.message || 'connection failed');
      clearTimeout(timeout);
      reject(new Error('WebSocket error'));
    });

    ws.addEventListener('close', () => {
      clearTimeout(timeout);
      // Reject any pending RPC calls
      for (const [id, p] of rpcPending) {
        p.reject(new Error('connection closed'));
      }
      rpcPending.clear();
      resolve(sent);
    });

    let handshakeSent = false;

    function sendConnect() {
      if (handshakeSent) return;
      handshakeSent = true;
      const id = String(++reqIdRef.n);
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
      rpcPending.set(id, {
        resolve: () => onAuthenticated(),
        reject: (err) => { console.error('[kickoff] Auth failed:', err); ws.close(); },
      });
    }

    async function onAuthenticated() {
      console.log('[kickoff] Authenticated. Running cron dedup before kickoff...');

      // Step 1: Dedup cron jobs (automated, not relying on agents)
      try {
        await dedupCronJobs(ws, reqIdRef, rpcPending);
      } catch (err) {
        console.warn('[kickoff] Dedup error (non-fatal):', err.message);
      }

      // Step 2: Send kickoff to leads
      console.log('[kickoff] Sending kickoff to leads...');
      sendToLeads();
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

      // Handle responses — route to RPC pending or chat pending
      if (msg.type === 'res') {
        // Check RPC pending first (dedup calls + connect)
        if (rpcPending.has(msg.id)) {
          const p = rpcPending.get(msg.id);
          rpcPending.delete(msg.id);
          if (msg.error) {
            p.reject(msg.error);
          } else {
            p.resolve(msg.payload);
          }
          return;
        }

        // Check chat pending
        if (chatPending.has(msg.id)) {
          const agentId = chatPending.get(msg.id);
          chatPending.delete(msg.id);
          if (msg.error) {
            console.warn(`[kickoff] chat.send to ${agentId} failed:`, msg.error);
          } else {
            console.log(`[kickoff] Sent to ${agentId} ✓`);
            sent++;
          }
          // Close after sending to all leads
          if (chatPending.size === 0 && rpcPending.size === 0) {
            console.log(`[kickoff] Done. ${sent}/${LEADS.length} leads activated.`);
            ws.close();
          }
        }
      }
    });

    function sendToLeads() {
      for (const agentId of LEADS) {
        const id = String(++reqIdRef.n);
        chatPending.set(id, agentId);
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
