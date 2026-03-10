# Mission Control UI Overhaul — Implementation Plan

> **Goal:** Professional, navigable UI with seamless access to all features. Mobile-first (iPhone PWA). No framework change — Alpine.js + Tailwind + vanilla JS stays.

---

## Phase 1: Sidebar Restructure + Grouped Navigation
**Files:** `workspace/index.html`, `workspace/js/app.js`, `workspace/css/styles.css`
**Risk:** Low — UI-only, no backend changes

### Changes

**1a. Grouped sidebar navigation with section headers**

Current flat list of 9 items → 4 grouped sections with uppercase section headers:

```
── Dashboard        (always visible)
── Chat             (always visible)
── Workflows        (always visible)

OBSERVE
── Activity         (event feed + away report)
── Monitor          (system logs)

MANAGE
── Agents           (agent CRUD + governance)
── Teams            (leaderboard + tiers)
── Staging          (approval queue)

AUTOMATE
── Cron Jobs        (NEW — dedicated cron view, extracted from agents)
── Webhooks         (NEW — webhook trigger management)

── Settings         (always at bottom)
```

Implementation:
- Replace flat `<nav>` buttons with grouped sections using `<div>` wrappers
- Section headers: `<div class="text-[10px] font-semibold text-mc-text-muted uppercase tracking-wider px-3 pt-4 pb-1">OBSERVE</div>`
- Collapsed sidebar: headers hidden, just icons visible with tooltips
- Mobile sidebar: full section headers visible
- Settings store: add `cron` and `webhooks` to `sidebar` visibility toggles

**1b. Mobile bottom navigation bar**

4 priority icons pinned to the bottom of the screen on mobile (`< 768px`):
- Dashboard, Chat, Activity, Agents (the 4 most-used views)

Implementation:
- Fixed bottom bar: `position: fixed; bottom: 0; left: 0; right: 0; z-index: 40`
- 4 icon buttons with labels, safe-area padding: `padding-bottom: env(safe-area-inset-bottom)`
- Active state: cyan highlight matching sidebar active style
- Add `pb-14` to main content area on mobile to prevent overlap
- Bottom bar hidden when sidebar overlay is open

**1c. Keyboard shortcut for sidebar collapse**

- `[` key toggles sidebar (matches builderz-labs pattern)
- Add `@keydown.window` listener in the app shell

---

## Phase 2: Enhanced Header Bar
**Files:** `workspace/index.html`, `workspace/js/app.js`
**Risk:** Low

### Changes

**2a. Richer status bar with live metrics**

Current header: view title + "New Agent" button + API/WS pills + Native UI link

New header layout:
```
[☰] Dashboard                                    [8 agents] [5 sessions] [API ●] [WS ●] [12:34]
```

- Agent count pill: shows total active agents (from `$store.agents.list.length`)
- Session count pill: active chat sessions
- Digital clock: monospace, updates every second
- "New Agent" button moves into Agents view (not header)

**2b. Breadcrumb-style view title**

When in a sub-context (e.g., viewing a specific agent), show: `Agents > CodeCraft`

---

## Phase 3: New Views — Cron & Webhooks
**Files:** `workspace/index.html`, `workspace/js/app.js`
**Risk:** Low-Medium (new views, but data sources already exist)

### 3a. Dedicated Cron Jobs View

Currently cron data lives in the `cron` Alpine store (fetched via `cron.status` RPC). Currently only visible as a count on the dashboard and within agent detail panels.

New standalone view:
- Table: Agent | Schedule | Payload | Last Run | Status | Actions
- Create/edit/delete cron jobs (uses existing `cron.add`/`cron.update`/`cron.remove` RPC)
- Filter by agent
- Quick-create common crons (inbox-check, heartbeat)

Implementation:
- Add `x-show="$store.app.view === 'cron'"` section in `<main>`
- Reuse `$store.cron` data (already fetched on boot)
- Add `setView('cron')` to sidebar and mobile bottom bar isn't needed (it's in AUTOMATE group)

### 3b. Webhooks Management View

Currently webhook triggers are "UI-only" (no backend endpoint). This view manages webhook URL generation and routing.

View contents:
- List of configured webhook endpoints
- Each webhook: URL, target workflow, target agent, created date
- Create webhook: generates a unique URL path, maps to a workflow trigger or agent message
- Webhook activity log (incoming calls + responses)

Backend requirement: Add a Caddy route + handler for `/api/webhooks/:id` that:
- Accepts POST with JSON body
- Looks up webhook config from a JSON file (`/workspace/webhooks/config.json`)
- Routes to either: workflow execution (sends `EXECUTE_WORKFLOW` to lead) or agent message (sends `chat.send` via OpenClaw WS)
- Logs the webhook call to `/workspace/webhooks/log.json`

Implementation:
- **Caddy:** Add `handle_path /api/webhooks/*` route → reverse proxy to a new lightweight handler
- **Handler options:** Either (a) a small Node.js script running in the OpenClaw container, or (b) a Caddy `respond` + `templates` directive that writes to the filesystem, or (c) extend the existing `workspace-init` container with a webhook listener
- **Recommended:** Option (a) — add `scripts/webhook-handler.js` that runs as a sidecar process inside the OpenClaw container (started by the entrypoint)
- **Frontend:** Standard CRUD view for webhook management + test button

---

## Phase 4: Dashboard Cards Overhaul
**Files:** `workspace/index.html`, `workspace/css/styles.css`
**Risk:** Low

### Changes

**4a. Richer stat cards with trend indicators**

Current: 4 stat cards (Agents, Staging, Activity, Cron) with counts

New: 5 stat cards in responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`):
- **Agents** — count + "X active" sub-stat + trend arrow (up/down/stable vs last visit)
- **Staging** — pending count + "X approved today" + amber highlight when pending > 0
- **Activity** — event count since last visit + "X new" badge
- **Cron Jobs** — total active + "X agents with cron" sub-stat
- **Sessions** — active chat count + "X unread" badge

Each card:
- Top 2px colored border (existing `mc-stat-border` classes)
- Large number (2xl bold)
- Small trend indicator: `↗` green / `↘` red / `→` gray
- Subtitle with secondary metric
- Clickable — navigates to the relevant view

**4b. Autonomy Status Grid improvements**

Current: 8-agent grid with green pulse / "idle" label

Add:
- Last activity timestamp per agent (from activity log)
- Current task indicator (from staging items by agent)
- Click to navigate to agent detail

---

## Phase 5: Persistent Live Feed Panel (Optional)
**Files:** `workspace/index.html`, `workspace/js/app.js`, `workspace/css/styles.css`
**Risk:** Medium — requires layout restructure

### Changes

Right-side collapsible panel showing real-time events:
- Width: 320px expanded, 40px collapsed (icon rail with indicators)
- Shows: agent activity, staging updates, cron executions, chat notifications
- Auto-scrolls, newest at top
- Collapse/expand via click or `]` key
- On mobile: hidden entirely (accessible via Activity view instead)

Implementation:
- Add panel to the right of `<main>` content area
- Data source: merge `$store.activity.events` + `$store.monitor.logs`
- Persist collapsed/expanded state in localStorage
- CSS: `transition: width 200ms ease` for smooth collapse

---

## Phase 6: Quick Search (Cmd+K)
**Files:** `workspace/index.html`, `workspace/js/app.js`
**Risk:** Low

### Changes

Global search overlay triggered by `Cmd+K` (or `Ctrl+K`):
- Searches across: agents (by name/role), views (by name), sessions (by title), staging items (by name)
- Keyboard navigation: arrows to select, Enter to navigate, Esc to close
- Click outside to dismiss

Implementation:
- Modal overlay with search input + results list
- `@keydown.window` listener for Cmd+K
- Filter against in-memory data (agents store, sessions store, staging store)
- Navigate via `$store.app.setView()` or agent selection

---

## Phase 7: Token/Cost Tracking View
**Files:** `workspace/index.html`, `workspace/js/app.js`
**Risk:** Medium (needs LiteLLM usage API)

### Changes

New "Tokens" view under OBSERVE group:
- Total tokens used (per day/week/month)
- Per-model breakdown
- Per-agent breakdown (if trackable via session keys)
- Cost estimate based on model pricing tiers

Data source: LiteLLM has usage tracking at `/api/litellm/global/spend/logs` (if enabled with DB)

Implementation:
- Add `tokens` view and sidebar entry
- Fetch from LiteLLM spend API
- Simple table + optional bar chart (CSS-only, no chart library needed)
- If LiteLLM spend tracking isn't enabled, show "Enable DB logging to track usage" message

---

## Implementation Order & Dependencies

```
Phase 1 (Sidebar + Mobile Nav)  ← START HERE, highest visual impact
  ↓
Phase 2 (Header Bar)            ← Quick follow-up, low effort
  ↓
Phase 4 (Dashboard Cards)       ← Pairs well with Phase 2
  ↓
Phase 3a (Cron View)            ← New view, data already exists
  ↓
Phase 6 (Cmd+K Search)          ← Quality-of-life, standalone
  ↓
Phase 3b (Webhooks)             ← Requires backend work
  ↓
Phase 5 (Live Feed Panel)       ← Layout restructure, do last
  ↓
Phase 7 (Token Tracking)        ← Depends on LiteLLM config
```

## Files Modified Per Phase

| Phase | index.html | app.js | styles.css | Other |
|-------|-----------|--------|-----------|-------|
| 1 | Sidebar restructure | Settings store update | Section headers, bottom nav, `[` shortcut | — |
| 2 | Header bar | Clock interval | — | — |
| 3a | New cron view | — | — | — |
| 3b | New webhook view | Webhook store | — | Caddyfile, webhook-handler.js, docker-compose.yml |
| 4 | Dashboard cards | Trend tracking | — | — |
| 5 | Live feed panel | Feed merge logic | Panel animation | — |
| 6 | Search modal | Search logic | — | — |
| 7 | Token view | LiteLLM spend fetch | — | — |

## Constraints

- **No build step.** Everything stays as static files served by Caddy.
- **No new JS libraries.** Alpine.js + Tailwind CDN + LiteGraph.js only.
- **Mobile-first.** Every change must work on iPhone PWA with touch targets ≥ 44px.
- **Protected fixes preserved.** No changes to OpenClaw client handshake, Caddy streaming config, or entrypoint scripts (unless Phase 3b webhook handler requires it).
- **Incremental commits.** Each phase is a standalone commit that doesn't break anything.
