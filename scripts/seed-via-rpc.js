// ============================================================================
// RPC Workspace Seeder — Sets agent files via OpenClaw's agents.files.set API
// ============================================================================
// Connects to OpenClaw's WebSocket after it's running and sets all workspace
// files via the agents.files.set RPC method. Files set through the API are
// treated as operator-managed — OpenClaw won't overwrite them with defaults.
//
// This replaces the filesystem-based second seed. The first seed (filesystem)
// still runs before OpenClaw starts as a safety net.
//
// Usage: node /opt/scripts/seed-via-rpc.js
// ============================================================================

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const OC_URL = 'ws://localhost:18789/';
const PASSWORD = process.env.OPENCLAW_PASSWORD || process.env.OPENCLAW_GATEWAY_PASSWORD || '';
const OPENCLAW_DIR = '/home/node/.openclaw';
const CONFIG_PATH = path.join(OPENCLAW_DIR, 'openclaw.json');

// Files to push via RPC (all force-overwritten files from the first seed)
const WORKSPACE_FILES = [
  'SOUL.md', 'BOOTSTRAP.md', 'TOOLS.md',
  'USER.md', 'AGENTS.md', 'MEMORY.md', 'HEARTBEAT.md',
];

// Read agent list from config
let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.error('[rpc-seed] Cannot read openclaw.json:', e.message);
  process.exit(0);
}

const agents = config?.agents?.list || [];
if (agents.length === 0) {
  console.log('[rpc-seed] No agents in config, skipping');
  process.exit(0);
}

// Cache directory written by the first seed (seed-agent-workspaces.js) BEFORE
// OpenClaw starts. By the time this RPC seeder runs, OpenClaw has overwritten
// the workspace directory with its defaults — so we read from /tmp cache.
const CACHE_DIR = '/tmp/workspace-seed-cache';

// Markers that MUST appear in our custom files (not OpenClaw defaults)
const CONTENT_MARKERS = {
  'SOUL.md': 'PRIME DIRECTIVE',
  'BOOTSTRAP.md': 'DO NOT delete, rename, or modify this file',
  'TOOLS.md': 'RULE #1: ACT',
  'USER.md': 'Owner Profile',
  'AGENTS.md': 'Team Structure',
  'MEMORY.md': 'Project Memory',
  'HEARTBEAT.md': 'Heartbeat',
};

function getAgentFiles(agent) {
  const cacheAgentDir = path.join(CACHE_DIR, agent.id);
  const files = {};
  for (const filename of WORKSPACE_FILES) {
    const filepath = path.join(cacheAgentDir, filename);
    try {
      const content = fs.readFileSync(filepath, 'utf8');
      // Validate this is our content, not OpenClaw defaults
      const marker = CONTENT_MARKERS[filename];
      if (marker && !content.includes(marker)) {
        console.error(`[rpc-seed] CORRUPT: ${agent.id}/${filename} missing marker "${marker}" — skipping (would push OpenClaw defaults)`);
        continue;
      }
      files[filename] = content;
    } catch {
      // Not in cache — skip
    }
  }
  if (Object.keys(files).length === 0) {
    console.warn(`[rpc-seed] No cached files for ${agent.id} — cache may be missing`);
  } else {
    console.log(`[rpc-seed] ${agent.id}: ${Object.keys(files).length}/7 files validated from cache`);
  }
  return files;
}

function seedViaRpc() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(OC_URL);
    let reqId = 0;
    const pending = new Map();
    let authenticated = false;
    let totalSet = 0;
    let totalErrors = 0;

    // Build the queue of all file-set operations
    const queue = [];
    for (const agent of agents) {
      const files = getAgentFiles(agent);
      for (const [filename, content] of Object.entries(files)) {
        queue.push({ agentId: agent.id, path: filename, content });
      }
    }

    const timeout = setTimeout(() => {
      console.log(`[rpc-seed] Timeout after 60s. Set ${totalSet}/${queue.length}, ${totalErrors} errors`);
      ws.close();
      resolve(totalSet);
    }, 60000);

    ws.on('error', (err) => {
      console.warn('[rpc-seed] WS error:', err.message);
      clearTimeout(timeout);
      reject(err);
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      resolve(totalSet);
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
        pending.set(id, { type: 'connect' });
        return;
      }

      // Handle responses
      if (msg.type === 'res') {
        const info = pending.get(msg.id);
        pending.delete(msg.id);
        if (!info) return;

        if (info.type === 'connect') {
          if (msg.error) {
            console.error('[rpc-seed] Auth failed:', msg.error);
            ws.close();
            return;
          }
          authenticated = true;
          console.log(`[rpc-seed] Authenticated. Pushing ${queue.length} files for ${agents.length} agents...`);
          sendBatch();
          return;
        }

        if (info.type === 'file-set') {
          if (msg.error) {
            console.warn(`[rpc-seed] Failed: ${info.agentId}/${info.path}:`, msg.error);
            totalErrors++;
          } else {
            totalSet++;
          }
          // Check if all done
          if (totalSet + totalErrors >= queue.length) {
            console.log(`[rpc-seed] Done. ${totalSet}/${queue.length} files set, ${totalErrors} errors`);
            ws.close();
          }
        }
      }
    });

    // Send all file-set requests in parallel (OpenClaw handles concurrency)
    function sendBatch() {
      // Send in batches of 8 (one agent's worth) to avoid overwhelming
      let idx = 0;
      function sendNext() {
        const batchSize = 8;
        const end = Math.min(idx + batchSize, queue.length);
        for (let i = idx; i < end; i++) {
          const item = queue[i];
          const id = String(++reqId);
          pending.set(id, { type: 'file-set', agentId: item.agentId, path: item.path });
          ws.send(JSON.stringify({
            type: 'req',
            id,
            method: 'agents.files.set',
            params: {
              agentId: item.agentId,
              path: item.path,
              content: item.content,
            },
          }));
        }
        idx = end;
        // Send next batch after a short delay
        if (idx < queue.length) {
          setTimeout(sendNext, 200);
        }
      }
      sendNext();
    }
  });
}

// Wait for OpenClaw to be healthy before connecting
function waitForHealth(maxRetries = 15, intervalMs = 2000) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    let attempts = 0;
    function check() {
      attempts++;
      const req = http.get('http://localhost:18789/openclaw/', (res) => {
        if (res.statusCode < 500) {
          resolve();
        } else if (attempts >= maxRetries) {
          reject(new Error(`OpenClaw not healthy after ${maxRetries} attempts`));
        } else {
          setTimeout(check, intervalMs);
        }
      });
      req.on('error', () => {
        if (attempts >= maxRetries) {
          reject(new Error(`OpenClaw not reachable after ${maxRetries} attempts`));
        } else {
          setTimeout(check, intervalMs);
        }
      });
      req.end();
    }
    check();
  });
}

// Main
(async () => {
  console.log('[rpc-seed] Waiting for OpenClaw to be ready...');
  try {
    await waitForHealth();
    console.log('[rpc-seed] OpenClaw is ready. Starting RPC seed...');
    const count = await seedViaRpc();
    console.log(`[rpc-seed] Complete. ${count} files seeded via RPC.`);
  } catch (err) {
    console.warn('[rpc-seed] Failed:', err.message);
    // Non-fatal — first filesystem seed is the safety net
    process.exit(0);
  }
})();
