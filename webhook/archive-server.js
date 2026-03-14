#!/usr/bin/env node
// ============================================================================
// Webhook Archive Server — Runs on Oracle Cloud ARM to store trigger payloads
// ============================================================================
// Lightweight HTTP server that receives archived webhook triggers from EC2's
// webhook handler. Stores payloads as JSON files organized by date.
//
// Deploy on Oracle ARM (150.136.153.194):
//   node archive-server.js
//
// Or run as a systemd service — see scripts/setup-webhook-archive.sh
//
// Endpoints:
//   POST /store        — Store a trigger payload (bearer token auth)
//   GET  /search       — Search archived triggers (bearer token auth)
//   GET  /stats        — Storage stats (bearer token auth)
//   GET  /health       — Health check (no auth)
//
// Environment:
//   ARCHIVE_PORT       — Listen port (default: 9091)
//   ARCHIVE_TOKEN      — Bearer token for auth (required)
//   ARCHIVE_DIR        — Storage directory (default: /opt/webhook-archive)
//   ARCHIVE_MAX_GB     — Max storage in GB before oldest cleanup (default: 5)
// ============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.ARCHIVE_PORT || '9091', 10);
const TOKEN = process.env.ARCHIVE_TOKEN || '';
const ARCHIVE_DIR = process.env.ARCHIVE_DIR || '/opt/webhook-archive';
const MAX_BYTES = (parseFloat(process.env.ARCHIVE_MAX_GB || '5') * 1024 * 1024 * 1024);

// Ensure archive directory exists
if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

function isAuthorized(req) {
  if (!TOKEN) return true;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${TOKEN}`;
}

function parseBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      try { resolve(JSON.parse(raw)); } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Organize by date: /opt/webhook-archive/2026-03-14/triggerId.json
function getDateDir(isoDate) {
  const date = isoDate ? isoDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const dir = path.join(ARCHIVE_DIR, date);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Calculate total archive size
function getArchiveSize() {
  let total = 0;
  try {
    const dateDirs = fs.readdirSync(ARCHIVE_DIR).sort();
    for (const d of dateDirs) {
      const dirPath = path.join(ARCHIVE_DIR, d);
      if (!fs.statSync(dirPath).isDirectory()) continue;
      const files = fs.readdirSync(dirPath);
      for (const f of files) {
        total += fs.statSync(path.join(dirPath, f)).size;
      }
    }
  } catch { /* empty archive */ }
  return total;
}

// Clean oldest date directories when over max
function enforceMaxSize() {
  let size = getArchiveSize();
  if (size <= MAX_BYTES) return;

  const dateDirs = fs.readdirSync(ARCHIVE_DIR).sort(); // oldest first
  for (const d of dateDirs) {
    if (size <= MAX_BYTES) break;
    const dirPath = path.join(ARCHIVE_DIR, d);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    const files = fs.readdirSync(dirPath);
    for (const f of files) {
      const fp = path.join(dirPath, f);
      size -= fs.statSync(fp).size;
      fs.unlinkSync(fp);
    }
    fs.rmdirSync(dirPath);
    console.log(`[archive] Cleaned old directory: ${d}`);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // Health (no auth)
  if (pathname === '/health') {
    return sendJSON(res, 200, { status: 'ok', archive: ARCHIVE_DIR });
  }

  // Auth required for everything else
  if (!isAuthorized(req)) {
    return sendJSON(res, 401, { error: 'Unauthorized' });
  }

  // Store a trigger payload
  if (pathname === '/store' && req.method === 'POST') {
    const data = await parseBody(req);
    if (!data || !data.triggerId) {
      return sendJSON(res, 400, { error: 'Invalid payload — triggerId required' });
    }

    const dir = getDateDir(data.triggeredAt);
    const file = path.join(dir, `${data.triggerId}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));

    // Enforce storage limits
    enforceMaxSize();

    console.log(`[archive] Stored: ${data.triggerId}`);
    return sendJSON(res, 200, { stored: true, triggerId: data.triggerId });
  }

  // Search archived triggers
  if (pathname === '/search' && req.method === 'GET') {
    const workflowId = url.searchParams.get('workflowId');
    const date = url.searchParams.get('date'); // YYYY-MM-DD
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);

    const results = [];
    const dateDirs = (date ? [date] : fs.readdirSync(ARCHIVE_DIR).sort().reverse());

    for (const d of dateDirs) {
      if (results.length >= limit) break;
      const dirPath = path.join(ARCHIVE_DIR, d);
      try {
        if (!fs.statSync(dirPath).isDirectory()) continue;
      } catch { continue; }

      const files = fs.readdirSync(dirPath).sort().reverse();
      for (const f of files) {
        if (results.length >= limit) break;
        if (!f.endsWith('.json')) continue;

        try {
          const data = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf8'));
          if (workflowId && data.workflowId !== workflowId) continue;
          results.push({
            triggerId: data.triggerId,
            workflowId: data.workflowId,
            triggeredAt: data.triggeredAt,
            payloadSize: JSON.stringify(data.payload || {}).length,
          });
        } catch { continue; }
      }
    }

    return sendJSON(res, 200, { results, total: results.length });
  }

  // Storage stats
  if (pathname === '/stats' && req.method === 'GET') {
    const size = getArchiveSize();
    const dateDirs = fs.readdirSync(ARCHIVE_DIR).filter(d => {
      try { return fs.statSync(path.join(ARCHIVE_DIR, d)).isDirectory(); } catch { return false; }
    }).sort();

    let totalFiles = 0;
    for (const d of dateDirs) {
      totalFiles += fs.readdirSync(path.join(ARCHIVE_DIR, d)).filter(f => f.endsWith('.json')).length;
    }

    return sendJSON(res, 200, {
      sizeBytes: size,
      sizeMB: Math.round(size / 1024 / 1024 * 100) / 100,
      maxGB: MAX_BYTES / 1024 / 1024 / 1024,
      totalFiles,
      dateRange: dateDirs.length ? { oldest: dateDirs[0], newest: dateDirs[dateDirs.length - 1] } : null,
    });
  }

  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[archive] Webhook archive server listening on port ${PORT}`);
  console.log(`[archive] Storage: ${ARCHIVE_DIR} (max ${MAX_BYTES / 1024 / 1024 / 1024} GB)`);
});
