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
