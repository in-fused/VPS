#!/usr/bin/env node
// Patches the OpenClaw config for Docker reverse-proxy hosting and memory.
//
// Gateway fixes:
//   gateway.bind = "all"           → listen on 0.0.0.0 (required for Docker networking)
//   gateway.controlUi.basePath     → "/openclaw" (matches Caddy route)
//   gateway.trustedProxies         → Docker bridge subnets (so X-Forwarded-For works)
//
// Memory fixes (per https://x.com/ksimback/status/2024180197910864182):
//   1. compaction.memoryFlush      → flush memories to disk before context compaction
//   2. contextPruning              → cache-ttl mode to preserve recent context
//   3. memorySearch.hybrid         → vector + BM25 for better recall
//   4. experimental.sessionMemory  → index past session transcripts
//
// Usage (run inside the openclaw container):
//   docker compose exec openclaw node /workspace/patch-openclaw-config.js
//   docker compose restart openclaw

const fs = require("fs");
const path = require("path");
const os = require("os");

const CONFIG_DIR = path.join(os.homedir(), ".openclaw");
const CONFIG_PATH = path.join(CONFIG_DIR, "openclaw.json5");

// Read existing config (JSON5 or JSON)
let config = {};
let raw = "";
try {
  raw = fs.readFileSync(CONFIG_PATH, "utf8");
} catch (e) {
  console.log("No existing config file found at", CONFIG_PATH);
  console.log("Creating a new one...");
}

if (raw) {
  try {
    // Try json5 first (available in OpenClaw's node_modules)
    const JSON5 = require("json5");
    config = JSON5.parse(raw);
  } catch (_) {
    try {
      config = JSON.parse(raw);
    } catch (_2) {
      console.error("Could not parse existing config. Backing up and starting fresh.");
      fs.writeFileSync(CONFIG_PATH + ".bak", raw);
      config = {};
    }
  }
}

// Ensure nested objects exist
config.gateway = config.gateway || {};
config.gateway.controlUi = config.gateway.controlUi || {};

// Apply Docker-specific gateway settings
config.gateway.bind = "all"; // Listen on 0.0.0.0 so Caddy container can reach us
config.gateway.controlUi.basePath = "/openclaw"; // Match Caddy route
config.gateway.trustedProxies = ["172.16.0.0/12", "10.0.0.0/8", "192.168.0.0/16"];

// --- Memory Fix 1: Enable memory flush before compaction ---
// Triggers a silent turn before compaction to write durable memories to disk.
// This is the single most impactful change for memory retention.
config.compaction = config.compaction || {};
config.compaction.memoryFlush = {
  enabled: true,
  softThresholdTokens: 40000,
  prompt: "Distill this session to memory/YYYY-MM-DD.md. Focus on decisions, state changes, lessons, blockers. If nothing: NO_FLUSH",
  systemPrompt: "Extract only what is worth remembering. No fluff."
};

// --- Memory Fix 2: Configure context pruning ---
// Cache-TTL mode keeps recent messages and preserves last 3 assistant responses.
// Prevents the "repeat yourself" problem after context flushes.
config.contextPruning = {
  mode: "cache-ttl",
  ttl: "6h",
  keepLastAssistants: 3
};

// --- Memory Fix 3: Enable hybrid search ---
// Combines vector similarity (conceptual) with BM25 keyword search (exact tokens).
// BM25 catches exact matches (error codes, project names) that vector search misses.
config.memorySearch = config.memorySearch || {};
config.memorySearch.enabled = true;
config.memorySearch.sources = ["memory", "sessions"];
config.memorySearch.query = {
  hybrid: {
    enabled: true,
    vectorWeight: 0.7,
    textWeight: 0.3
  }
};

// --- Memory Fix 4: Index past session transcripts ---
// Makes past conversations searchable so the agent can recall decisions from days ago.
config.experimental = config.experimental || {};
config.experimental.sessionMemory = true;

// Write back as JSON (valid JSON5 subset)
fs.mkdirSync(CONFIG_DIR, { recursive: true });
fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");

console.log("OpenClaw config updated at", CONFIG_PATH);
console.log("\nGateway settings:");
console.log(JSON.stringify(config.gateway, null, 2));
console.log("\nMemory settings:");
console.log("  memoryFlush:", config.compaction.memoryFlush.enabled ? "ENABLED" : "disabled");
console.log("  contextPruning:", config.contextPruning.mode, "(TTL:", config.contextPruning.ttl + ")");
console.log("  hybridSearch:", config.memorySearch.query.hybrid.enabled ? "ENABLED" : "disabled");
console.log("  sessionMemory:", config.experimental.sessionMemory ? "ENABLED" : "disabled");
console.log("\nRestart OpenClaw to apply: docker compose restart openclaw");
