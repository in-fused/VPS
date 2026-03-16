#!/usr/bin/env bash
###############################################################################
# generate-reference-docs.sh — Generates split reference docs for agents
###############################################################################
# Creates focused reference files that agents can read on-demand for deep
# project context. Each file covers a specific domain and stays under 30KB
# so agents can read them in one shot.
#
# Output: /workspace/reference/ (served at https://in-fused.org/workspace/reference/)
# Agents read via: read(path: "/workspace/reference/<file>.md")
#
# Replaces the old monolithic project-bundle.md (607KB, too large to read).
###############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
cd "$REPO_DIR"

OUT_DIR="workspace/reference"
mkdir -p "$OUT_DIR"

###############################################################################
# 1. infrastructure.md — Docker, Caddy, deploy, networking
###############################################################################
cat > "$OUT_DIR/infrastructure.md" << 'HEADER'
# Infrastructure Reference
> Auto-generated. Source files: docker-compose.yml, Caddyfile, deploy.sh
> Read this when you need to understand how services are configured,
> how routing works, or how deployments happen.

HEADER

echo "## docker-compose.yml" >> "$OUT_DIR/infrastructure.md"
echo '```yaml' >> "$OUT_DIR/infrastructure.md"
cat docker-compose.yml >> "$OUT_DIR/infrastructure.md"
echo '```' >> "$OUT_DIR/infrastructure.md"
echo "" >> "$OUT_DIR/infrastructure.md"

echo "## Caddyfile (reverse proxy)" >> "$OUT_DIR/infrastructure.md"
echo '```' >> "$OUT_DIR/infrastructure.md"
cat Caddyfile >> "$OUT_DIR/infrastructure.md"
echo '```' >> "$OUT_DIR/infrastructure.md"
echo "" >> "$OUT_DIR/infrastructure.md"

echo "## deploy.sh (deployment script)" >> "$OUT_DIR/infrastructure.md"
echo '```bash' >> "$OUT_DIR/infrastructure.md"
cat scripts/deploy.sh >> "$OUT_DIR/infrastructure.md"
echo '```' >> "$OUT_DIR/infrastructure.md"

###############################################################################
# 2. models.md — LiteLLM config, model routing, rate limits
###############################################################################
cat > "$OUT_DIR/models.md" << 'HEADER'
# Models & Routing Reference
> Auto-generated. Source: litellm_config.yaml
> Read this when you need to understand model tiers, rate limits,
> fallback chains, or provider configuration.

HEADER

echo '```yaml' >> "$OUT_DIR/models.md"
cat litellm_config.yaml >> "$OUT_DIR/models.md"
echo '```' >> "$OUT_DIR/models.md"

###############################################################################
# 3. agents.md — Agent config, workspace seeder, entrypoint, kickoff
###############################################################################
cat > "$OUT_DIR/agents.md" << 'HEADER'
# Agent System Reference
> Auto-generated. Source files: seed-agent-workspaces.js,
> patch-openclaw-config.js, openclaw-entrypoint.sh, auto-kickoff.js
> Read this when you need to understand how agents are configured,
> how workspace files are seeded, or how the startup sequence works.

HEADER

echo "## openclaw-entrypoint.sh (container startup)" >> "$OUT_DIR/agents.md"
echo '```bash' >> "$OUT_DIR/agents.md"
cat scripts/openclaw-entrypoint.sh >> "$OUT_DIR/agents.md"
echo '```' >> "$OUT_DIR/agents.md"
echo "" >> "$OUT_DIR/agents.md"

echo "## patch-openclaw-config.js (config patching)" >> "$OUT_DIR/agents.md"
echo '```javascript' >> "$OUT_DIR/agents.md"
cat scripts/patch-openclaw-config.js >> "$OUT_DIR/agents.md"
echo '```' >> "$OUT_DIR/agents.md"
echo "" >> "$OUT_DIR/agents.md"

echo "## seed-agent-workspaces.js (workspace file seeder)" >> "$OUT_DIR/agents.md"
echo '```javascript' >> "$OUT_DIR/agents.md"
cat scripts/seed-agent-workspaces.js >> "$OUT_DIR/agents.md"
echo '```' >> "$OUT_DIR/agents.md"
echo "" >> "$OUT_DIR/agents.md"

echo "## auto-kickoff.js (startup messages)" >> "$OUT_DIR/agents.md"
echo '```javascript' >> "$OUT_DIR/agents.md"
cat scripts/auto-kickoff.js >> "$OUT_DIR/agents.md"
echo '```' >> "$OUT_DIR/agents.md"

###############################################################################
# 4. frontend.md — Mission Control architecture summary (NOT raw source)
###############################################################################
cat > "$OUT_DIR/frontend.md" << 'EOF'
# Mission Control Frontend Reference
> Summary of the Mission Control SPA architecture.
> For full source, read the files directly:
> - read(path: "/workspace/index.html") — HTML templates (Alpine.js)
> - read(path: "/workspace/js/app.js") — Alpine stores, chat, agents
> - read(path: "/workspace/js/openclaw-client.js") — OpenClaw WS RPC client

## Tech Stack
- Alpine.js 3.14.8 (reactive stores, no build step)
- Tailwind CSS (CDN)
- Vanilla JS, served as static files from Caddy
- Paperclip (external, at /paperclip/) handles workflows, governance, and orchestration

## Views (sidebar navigation)
| View | Description |
|------|-------------|
| Dashboard | Stats, autonomy status, staging queue preview, activity feed |
| Agents | Team-grouped cards with cron status, actions |
| Paperclip | External link to Paperclip UI for workflows and orchestration |
| Chat | Session list + message stream (3-tier: OC WS → LiteLLM SSE → demo) |
| Teams | Team structure and agent roles |
| Monitor | System health, token usage, activity logs |
| Staging | Agent output review: iframe preview + approve/reject actions |
| Activity | Server-polled event feed + WebSocket live events, filterable |
| Settings | Sidebar visibility, audio notifications, connection info |

## Alpine Stores (app.js)
| Store | Key State | Purpose |
|-------|-----------|---------|
| auth | ok, login(), logout() | Cookie + sessionStorage auth |
| app | view, connected, ocConnected, mobile, awayReport | View routing, health, boot |
| agents | list[], createAgent(), deleteAgent() | Agent CRUD, syncs to OpenClaw |
| sessions | list[], messages[], sendMessage() | Chat sessions + streaming |
| workflows | (stub — moved to Paperclip) | No-op interface for compatibility |
| models | list[] | LiteLLM model list |
| governance | (stub — moved to Paperclip) | No-op interface for compatibility |
| staging | items[], approve(), reject() | Agent output review |
| activity | events[], filtered | Server + live event feed |
| cron | jobs[], fetch(), forAgent() | Per-agent cron job management |
| monitor | logs[], tokenUsage | System health + usage |
| settings | sidebar, audio | UI preferences |

## Design System (styles.css)
- BG: #0a0e17, Surface: #111827, Elevated: #1f2937
- Primary: #06b6d4 (cyan), Secondary: #8b5cf6 (violet)
- Gold accent: #d4af37 (staging items, highlights)
- 44px minimum touch targets on mobile
- iOS safe areas (viewport-fit=cover)

## Chat System — 3-Tier Fallback
1. OpenClaw WebSocket (preferred): JSON-RPC chat.send → streaming events
2. LiteLLM SSE (fallback): POST /api/mc/v1/chat/completions with stream: true
3. Demo mode (no backend): Static placeholder

## OpenClaw WS Client (openclaw-client.js)
- Connect to /ws/openclaw with password auth (no device block)
- JSON-RPC: type=req/res, method=chat.send/agents.list/sessions.list/etc.
- Auto-reconnect with exponential backoff (2s→30s)
- iOS visibility change handlers for PWA background/foreground
EOF

###############################################################################
# 5. scraping.md — Scrapling API reference
###############################################################################
cat > "$OUT_DIR/scraping.md" << 'HEADER'
# Scrapling API Reference
> Auto-generated. Source: scrapling/api.py
> Read this when you need to understand the web scraping API
> available at http://scrapling:8000 (internal only).

HEADER

echo '```python' >> "$OUT_DIR/scraping.md"
cat scrapling/api.py >> "$OUT_DIR/scraping.md"
echo '```' >> "$OUT_DIR/scraping.md"

###############################################################################
# 6. startup-chain.md — Startup and autonomy chain (hand-maintained)
###############################################################################
# This file is hand-maintained (not auto-generated from source).
# Only regenerate if the file is missing.
if [ ! -f "$OUT_DIR/startup-chain.md" ]; then
    echo "[reference] startup-chain.md missing — creating placeholder"
    cat > "$OUT_DIR/startup-chain.md" << 'STARTUP_EOF'
# Startup Chain Reference
> See CLAUDE.md "Startup Chain" section for the full 6-layer chain documentation.
> This file should be manually maintained. Run deploy to regenerate other reference docs.
STARTUP_EOF
fi

###############################################################################
# 7. project-overview.md — High-level project context (condensed CLAUDE.md)
###############################################################################
cat > "$OUT_DIR/project-overview.md" << 'HEADER'
# Project Overview
> Auto-generated. Source: CLAUDE.md (condensed)
> Read this for high-level project architecture, resolved issues,
> and system-wide context.

HEADER

echo '```markdown' >> "$OUT_DIR/project-overview.md"
cat CLAUDE.md >> "$OUT_DIR/project-overview.md"
echo '```' >> "$OUT_DIR/project-overview.md"

###############################################################################
# Generate index
###############################################################################
cat > "$OUT_DIR/index.md" << 'EOF'
# Reference Documentation Index

On-demand deep context for agents. Each file covers a specific domain.

| File | What's Inside | When to Read |
|------|--------------|--------------|
| [infrastructure.md](infrastructure.md) | docker-compose, Caddyfile, deploy.sh | Modifying services, routing, deploys |
| [models.md](models.md) | litellm_config.yaml (27+ models) | Understanding model tiers, rate limits |
| [agents.md](agents.md) | Entrypoint, config patcher, workspace seeder, kickoff | Agent config, startup sequence |
| [frontend.md](frontend.md) | Mission Control architecture summary | Understanding the UI, stores, views |
| [scraping.md](scraping.md) | Scrapling API source (api.py) | Web scraping capabilities |
| [startup-chain.md](startup-chain.md) | Full deploy→boot→seed→kickoff→cron chain | Debugging agent bootstrap, understanding autonomy loop |
| [project-overview.md](project-overview.md) | Full CLAUDE.md | High-level architecture, resolved issues |

## How to Access
```
read(path: "/workspace/reference/index.md")
read(path: "/workspace/reference/infrastructure.md")
read(path: "/workspace/reference/models.md")
```

## URL Access (requires auth)
```
https://in-fused.org/workspace/reference/index.md
https://in-fused.org/workspace/reference/infrastructure.md
```
EOF

# Print sizes
echo "[reference] Generated reference docs:"
for f in "$OUT_DIR"/*.md; do
    SIZE=$(wc -c < "$f")
    LINES=$(wc -l < "$f")
    echo "  $(basename "$f"): ${LINES} lines, $((SIZE / 1024))KB"
done
