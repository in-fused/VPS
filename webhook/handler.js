// ============================================================================
// Webhook Handler — Lightweight HTTP server for workflow webhook triggers
// ============================================================================
// Receives POST requests from external services (GitHub, Stripe, etc.),
// validates per-webhook tokens, writes trigger files to the shared workspace
// volume, and notifies OpenClaw for immediate workflow execution.
//
// Endpoints:
//   POST   /trigger/{workflowId}    — Trigger a workflow (token-authenticated)
//   POST   /register                — Register a new webhook (site-auth)
//   DELETE /revoke/{workflowId}     — Revoke a webhook (site-auth)
//   GET    /list                    — List registered webhooks (site-auth)
//   GET    /health                  — Health check
//
// in-fused.org
// ============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = 9090;
const WORKSPACE = '/workspace';
const REGISTRY_FILE = path.join(WORKSPACE, 'webhook-registry.json');
const TRIGGERS_DIR = path.join(WORKSPACE, 'webhook-triggers');
const TRIGGERS_INDEX = path.join(TRIGGERS_DIR, 'index.json');
const OPENCLAW_PASSWORD = process.env.OPENCLAW_PASSWORD || '';
const DOMAIN = process.env.DOMAIN || 'in-fused.org';

// Oracle ARM archive — offloads processed trigger payloads to free up EC2 disk
const ARCHIVE_URL = process.env.WEBHOOK_ARCHIVE_URL || ''; // e.g. http://150.136.153.194:9091
const ARCHIVE_TOKEN = process.env.WEBHOOK_ARCHIVE_TOKEN || '';
const ARCHIVE_AFTER_MINS = parseInt(process.env.WEBHOOK_ARCHIVE_AFTER_MINS || '30', 10);
const ARCHIVE_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

// Compute site password SHA-256 (same algorithm as caddy-entrypoint.sh)
const SITE_PASSWORD_SHA256 = OPENCLAW_PASSWORD
  ? crypto.createHash('sha256').update(OPENCLAW_PASSWORD).digest('hex')
  : '';

// Ensure directories exist
if (!fs.existsSync(TRIGGERS_DIR)) fs.mkdirSync(TRIGGERS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

function loadRegistry() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  } catch {
    return { webhooks: {} };
  }
}

function saveRegistry(registry) {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

function generateToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function loadTriggerIndex() {
  try {
    return JSON.parse(fs.readFileSync(TRIGGERS_INDEX, 'utf8'));
  } catch {
    return { triggers: [] };
  }
}

function saveTriggerIndex(index) {
  // Keep only last 50 triggers to prevent unbounded growth
  index.triggers = (index.triggers || []).slice(-50);
  fs.writeFileSync(TRIGGERS_INDEX, JSON.stringify(index, null, 2));
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function parseBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({ _raw: raw }); }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

// Validate management requests via site cookie
function isAuthorized(req) {
  if (!SITE_PASSWORD_SHA256) return true; // No password = no auth
  const cookies = req.headers.cookie || '';
  const match = cookies.match(/mc_oc=([a-f0-9]+)/);
  if (match && match[1] === SITE_PASSWORD_SHA256) return true;
  // Also accept X-Webhook-Auth header (for programmatic access)
  const authHeader = req.headers['x-webhook-auth'] || '';
  return authHeader === SITE_PASSWORD_SHA256;
}

// ---------------------------------------------------------------------------
// OpenClaw notification — best-effort immediate workflow execution
// ---------------------------------------------------------------------------

function notifyOpenClaw(workflowId, triggerData) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => { resolve(); }, 10000);

    try {
      const ws = new WebSocket('ws://openclaw:18789/');
      let reqId = 0;
      let authenticated = false;

      ws.on('error', () => { clearTimeout(timeout); resolve(); });
      ws.on('close', () => { clearTimeout(timeout); resolve(); });

      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        // Handshake
        if (msg.type === 'hello' || msg.type === 'challenge') {
          ws.send(JSON.stringify({
            type: 'req', id: String(++reqId), method: 'connect',
            params: {
              minProtocol: 3, maxProtocol: 3,
              auth: { token: OPENCLAW_PASSWORD, password: OPENCLAW_PASSWORD },
              role: 'operator',
              scopes: ['operator.read', 'operator.write'],
              client: { id: 'webchat', version: '1.0.0', platform: 'web', mode: 'backend' },
            },
          }));
          return;
        }

        // Auth response — send workflow execution message
        if (msg.type === 'res' && !authenticated) {
          if (msg.error) {
            console.warn('[webhook] OpenClaw auth failed:', msg.error);
            ws.close();
            return;
          }
          authenticated = true;

          const id = String(++reqId);
          const payload = JSON.stringify(triggerData.payload || {});
          ws.send(JSON.stringify({
            type: 'req', id, method: 'chat.send',
            params: {
              sessionKey: 'agent:lead:main',
              message: `WEBHOOK_TRIGGER:${workflowId}\nPayload: ${payload}`,
              idempotencyKey: `webhook-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
              deliver: false,
            },
          }));

          // Close after short delay to allow send to complete
          setTimeout(() => { ws.close(); }, 2000);
        }
      });
    } catch {
      clearTimeout(timeout);
      resolve();
    }
  });
}

// ---------------------------------------------------------------------------
// Archive + Cleanup — Ships processed triggers to Oracle ARM, frees EC2 disk
// ---------------------------------------------------------------------------

async function archiveTrigger(triggerFile, triggerData) {
  if (!ARCHIVE_URL) return false;
  try {
    const url = `${ARCHIVE_URL}/store`;
    const body = JSON.stringify(triggerData);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ARCHIVE_TOKEN ? { 'Authorization': `Bearer ${ARCHIVE_TOKEN}` } : {}),
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      console.warn(`[webhook] Archive failed (${resp.status}): ${triggerFile}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[webhook] Archive error: ${err.message}`);
    return false;
  }
}

async function runArchiveCycle() {
  try {
    const cutoff = Date.now() - (ARCHIVE_AFTER_MINS * 60 * 1000);
    const files = fs.readdirSync(TRIGGERS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
    let archived = 0, cleaned = 0;

    for (const file of files) {
      const filePath = path.join(TRIGGERS_DIR, file);
      let data;
      try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { continue; }

      const triggeredAt = new Date(data.triggeredAt || 0).getTime();
      if (triggeredAt > cutoff) continue; // Too recent, keep on EC2

      if (ARCHIVE_URL) {
        const ok = await archiveTrigger(file, data);
        if (ok) {
          fs.unlinkSync(filePath);
          archived++;
        }
      } else {
        // No archive URL — just clean up old trigger files to free disk
        // Keep the trigger in the index for history, delete the payload file
        fs.unlinkSync(filePath);
        cleaned++;
      }
    }

    // Prune index entries for deleted files
    const index = loadTriggerIndex();
    const remaining = new Set(
      fs.readdirSync(TRIGGERS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json')
    );
    index.triggers = index.triggers.filter(t => remaining.has(t.file) || (
      new Date(t.triggeredAt).getTime() > cutoff // Keep recent index entries even if file gone
    ));
    saveTriggerIndex(index);

    if (archived || cleaned) {
      console.log(`[webhook] Cleanup: ${archived} archived to Oracle ARM, ${cleaned} cleaned locally`);
    }
  } catch (err) {
    console.warn(`[webhook] Cleanup cycle error: ${err.message}`);
  }
}

// Run archive/cleanup cycle periodically
setInterval(runArchiveCycle, ARCHIVE_INTERVAL_MS);
// Run once on startup after 60s delay (let things settle)
setTimeout(runArchiveCycle, 60000);

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Webhook-Auth, X-Webhook-Token, Cookie',
    });
    return res.end();
  }

  // Health check
  if (pathname === '/health' && req.method === 'GET') {
    const registry = loadRegistry();
    const triggerFiles = fs.readdirSync(TRIGGERS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
    return sendJSON(res, 200, {
      status: 'ok',
      webhooks: Object.keys(registry.webhooks).length,
      localTriggers: triggerFiles.length,
      archiveEnabled: !!ARCHIVE_URL,
      archiveUrl: ARCHIVE_URL ? ARCHIVE_URL.replace(/\/\/.*@/, '//***@') : null,
    });
  }

  // -----------------------------------------------------------------------
  // TRIGGER — POST /trigger/{workflowId}?token=xxx
  // Public endpoint, validated by per-webhook token
  // -----------------------------------------------------------------------
  if (pathname.startsWith('/trigger/') && req.method === 'POST') {
    const workflowId = decodeURIComponent(pathname.slice('/trigger/'.length));
    const token = url.searchParams.get('token') || req.headers['x-webhook-token'] || '';

    const registry = loadRegistry();
    const webhook = registry.webhooks[workflowId];

    if (!webhook) return sendJSON(res, 404, { error: 'Webhook not found' });
    if (webhook.token !== token) return sendJSON(res, 403, { error: 'Invalid token' });

    const body = await parseBody(req);
    const triggerId = `${workflowId}-${Date.now()}`;
    const triggerData = {
      triggerId,
      webhookId: workflowId,
      workflowId,
      payload: body,
      headers: {
        'content-type': req.headers['content-type'] || '',
        'x-github-event': req.headers['x-github-event'] || '',
        'x-gitlab-event': req.headers['x-gitlab-event'] || '',
        'user-agent': req.headers['user-agent'] || '',
      },
      triggeredAt: new Date().toISOString(),
      status: 'pending',
    };

    // Write trigger file (persistent, survives handler restart)
    const triggerFile = path.join(TRIGGERS_DIR, `${triggerId}.json`);
    fs.writeFileSync(triggerFile, JSON.stringify(triggerData, null, 2));

    // Update trigger index (polled by Mission Control's workflow bridge)
    const triggerIndex = loadTriggerIndex();
    triggerIndex.triggers.push({
      triggerId,
      workflowId,
      file: `${triggerId}.json`,
      triggeredAt: triggerData.triggeredAt,
      status: 'pending',
    });
    saveTriggerIndex(triggerIndex);

    // Update last-triggered timestamp
    webhook.lastTriggered = triggerData.triggeredAt;
    saveRegistry(registry);

    console.log(`[webhook] Triggered: ${workflowId} → ${triggerId}`);

    // Notify OpenClaw for immediate execution (non-blocking, best-effort)
    notifyOpenClaw(workflowId, triggerData).catch(() => {});

    return sendJSON(res, 200, { triggered: true, triggerId, workflowId });
  }

  // -----------------------------------------------------------------------
  // REGISTER — POST /register
  // Management endpoint, requires site auth
  // -----------------------------------------------------------------------
  if (pathname === '/register' && req.method === 'POST') {
    if (!isAuthorized(req)) return sendJSON(res, 401, { error: 'Unauthorized' });

    const body = await parseBody(req);
    const workflowId = body.workflowId;
    if (!workflowId) return sendJSON(res, 400, { error: 'workflowId required' });

    const registry = loadRegistry();

    // If already registered, return existing webhook info
    if (registry.webhooks[workflowId]) {
      const existing = registry.webhooks[workflowId];
      return sendJSON(res, 200, {
        webhookId: workflowId,
        token: existing.token,
        url: `https://${DOMAIN}/api/webhook/trigger/${workflowId}?token=${existing.token}`,
        existing: true,
      });
    }

    const token = generateToken();
    registry.webhooks[workflowId] = {
      token,
      workflowId,
      workflowName: body.workflowName || 'Unnamed',
      createdAt: new Date().toISOString(),
      lastTriggered: null,
    };
    saveRegistry(registry);

    console.log(`[webhook] Registered: ${workflowId}`);
    return sendJSON(res, 200, {
      webhookId: workflowId,
      token,
      url: `https://${DOMAIN}/api/webhook/trigger/${workflowId}?token=${token}`,
    });
  }

  // -----------------------------------------------------------------------
  // REVOKE — DELETE /revoke/{workflowId}
  // Management endpoint, requires site auth
  // -----------------------------------------------------------------------
  if (pathname.startsWith('/revoke/') && req.method === 'DELETE') {
    if (!isAuthorized(req)) return sendJSON(res, 401, { error: 'Unauthorized' });

    const workflowId = decodeURIComponent(pathname.slice('/revoke/'.length));
    const registry = loadRegistry();

    if (!registry.webhooks[workflowId]) {
      return sendJSON(res, 404, { error: 'Webhook not found' });
    }

    delete registry.webhooks[workflowId];
    saveRegistry(registry);

    console.log(`[webhook] Revoked: ${workflowId}`);
    return sendJSON(res, 200, { revoked: true, workflowId });
  }

  // -----------------------------------------------------------------------
  // LIST — GET /list
  // Management endpoint, requires site auth
  // -----------------------------------------------------------------------
  if (pathname === '/list' && req.method === 'GET') {
    if (!isAuthorized(req)) return sendJSON(res, 401, { error: 'Unauthorized' });

    const registry = loadRegistry();
    const list = Object.values(registry.webhooks).map((w) => ({
      workflowId: w.workflowId,
      workflowName: w.workflowName,
      url: `https://${DOMAIN}/api/webhook/trigger/${w.workflowId}?token=${w.token}`,
      createdAt: w.createdAt,
      lastTriggered: w.lastTriggered,
    }));

    return sendJSON(res, 200, { webhooks: list });
  }

  // 404 fallback
  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[webhook] Handler listening on port ${PORT}`);
  console.log(`[webhook] Trigger URL format: https://${DOMAIN}/api/webhook/trigger/{workflowId}?token={secret}`);
});
