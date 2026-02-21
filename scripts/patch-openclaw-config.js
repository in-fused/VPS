#!/usr/bin/env node
// Patches the OpenClaw config for Docker reverse-proxy hosting.
//
// Fixes:
//   gateway.bind = "all"           → listen on 0.0.0.0 (required for Docker networking)
//   gateway.controlUi.basePath     → "/openclaw" (matches Caddy route)
//   gateway.trustedProxies         → Docker bridge subnets (so X-Forwarded-For works)
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

// Apply Docker-specific settings
config.gateway.bind = "all"; // Listen on 0.0.0.0 so Caddy container can reach us
config.gateway.controlUi.basePath = "/openclaw"; // Match Caddy route
config.gateway.trustedProxies = ["172.16.0.0/12", "10.0.0.0/8", "192.168.0.0/16"];

// Write back as JSON (valid JSON5 subset)
fs.mkdirSync(CONFIG_DIR, { recursive: true });
fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");

console.log("OpenClaw config updated at", CONFIG_PATH);
console.log("Gateway settings:");
console.log(JSON.stringify(config.gateway, null, 2));
console.log("\nRestart OpenClaw to apply: docker compose restart openclaw");
