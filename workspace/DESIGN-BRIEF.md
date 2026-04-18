# Mission Control — Design Brief
## in-fused.org Command Deck Redesign

---

## What This Is

A real-time agent monitoring and deployment dashboard for an autonomous AI agent system. 8 AI agents run 24/7, produce work, and stage it for owner review. The owner manages everything from an **iPhone** — this is the primary device.

The OpenClaw native UI at `/openclaw/` already handles all agent chat. **This interface does not need chat.** Its job is: observe, review, approve, control.

---

## Design Concept

**Spatial command center.** The user arrives at an overhead view of the entire system — all agents, all activity, all queues visible at once. Tapping any element drills deeper into a modal. Tabs organize the workspace into sections. Nothing is buried more than two taps deep.

Visual references:
- **Bloomberg Terminal** — dense, information-rich, dark, always alive
- **NASA Mission Control** — status grids, telemetry feeds, always-on beacons
- **Linear** — clean cards, fast interactions, minimal chrome
- **Vercel Dashboard** — deploy timelines, health indicators, real-time logs

---

## Existing Design System (must be preserved)

**Fonts already loaded:**
- Body: `Inter`
- Monospace/code: `JetBrains Mono`
- Display/headers: `Orbitron` (used sparingly for sci-fi feel)
- Subheadings: `Rajdhani`

**Color tokens:**
- Background: `--mc-bg` (very dark, near-black)
- Surface: `--mc-surface` (dark card background)
- Elevated: `--mc-elevated` (slightly lighter card)
- Border: `--mc-border` (subtle divider)
- Primary: `--mc-primary` = cyan `#06b6d4`
- Secondary: `--mc-secondary` = purple `#8b5cf6`
- Success: green
- Warning: amber
- Danger: red
- Dim variants: `-dim` suffix for muted versions

**Agent tier colors:**
- FREE: green
- CHEAP: cyan
- MID: amber
- PREMIUM: purple

**Existing animations (keep and extend):**
- `pulse-glow` — glowing ring pulse
- `scan-line` — horizontal scan across a surface
- `typewriter` — text types in character by character
- `fade-up`, `slide-right` — entry transitions
- `boot-text` — terminal boot sequence feel

**Status dots:**
- `.mc-dot-running` — green pulse
- `.mc-dot-idle` — amber static
- `.mc-dot-error` — red
- `.mc-dot-connected` — cyan

---

## Navigation Structure

**Top-level: 6 tabs** (replaces the current sidebar for primary navigation)

The tab bar sits at the bottom on mobile (thumb-reachable), top on desktop.

```
[ PULSE ] [ STAGING ] [ DEPLOY ] [ AGENTS ] [ AUTOMATION ] [ ARCHIVE ]
```

Each tab has:
1. A **stratospheric overview** (the default view — all key metrics visible without scrolling on mobile)
2. **Drill-down cards** — tapping any card opens a **full-screen modal** (slide up from bottom on mobile)
3. Modals have a close handle/swipe-down gesture

---

## Tab-by-Tab Layout Specs

---

### Tab 1: PULSE (default)
*Everything alive, all at once.*

**Persistent KPI bar** (always visible, top of every tab):
```
[ 8 Online ] [ 3 Staging ] [ 12 Crons ] [ 142k tokens ] [ Deployed 2h ago ]
```
Each chip is tappable → jumps to relevant tab.

**Main grid — 2 columns mobile, 3 columns desktop:**

**Tile A — Agent Swarm Grid** (largest tile, 2-col span on mobile)
- 8 agent mini-cards in a 4×2 grid
- Each: agent name, model badge, animated pulse ring (green=cron active, amber=idle, red=error), last activity "2m ago"
- Scanning line animation runs across the grid in background
- Tap any agent → Agent Detail Modal

**Tile B — Live Event Strip**
- Vertically scrolling typewriter feed of the latest 20 events
- Each event: colored dot (task-complete=green, staging-new=amber, system=cyan) + agent name + message
- Events appear with typewriter animation
- Filter chips: All · Tasks · Staging · System

**Tile C — Staging Spotlight**
- Shows 3 most-recent pending staging items
- Each: thumbnail preview, agent name, type badge (HTML/MD/JSON), age
- Inline approve ✓ / reject ✗ buttons (large touch targets)
- "View all 7 →" link to Staging tab

**Tile D — System Health**
- 4 service beacons in a row: Caddy · OpenClaw · LiteLLM · Paperclip
- Each: colored dot + service name + response time "12ms"
- Last deploy: commit SHA + timestamp + branch name
- Tap → Deploy tab

---

### Tab 2: STAGING
*Content pipeline from agent proposal to published.*

**Pipeline view (horizontal scroll on mobile):**
```
| PENDING (3) | APPROVED (1) | PUBLISHED (12) |
```

Each column is a vertical card list. Cards show:
- Thumbnail / type icon
- Title + agent name
- Age badge
- Status badge

**Card actions:**
- Swipe left → Reject (red) on mobile
- Swipe right → Approve (green) on mobile
- Tap → Staging Detail Modal

**Staging Detail Modal (full screen):**
- Header: title, agent, timestamp, type badge
- Live preview pane (rendered HTML, or markdown, or formatted JSON)
- Toggle: Preview / Diff (for edits to existing files)
- Action row: [ Approve ] [ Reject ] [ Request Revision ]
- Revision: opens text field → sends directive to agent on submit

**Batch mode:** Long-press any card → selection mode → "Approve Selected" FAB

---

### Tab 3: DEPLOY
*System health and deployment control.*

**Deploy Timeline** (top section):
- Vertical timeline of last 10 deploys
- Each entry: colored dot (success=green, failed=red, in-progress=amber pulsing) + commit message + SHA + timestamp
- Tap → expand to show deploy log tail (monospace, scrollable)

**Container Health Grid:**
- 6 service cards in 2×3 grid: Caddy / OpenClaw / LiteLLM / Scrapling / Paperclip / Webhook
- Each card: large status dot + service name + health label
- Tap → service detail modal (logs, endpoint, last health check time)

**Manual Deploy:**
- Large CTA button: "⚡ Deploy Now" with branch name shown
- On tap: confirmation sheet → triggers deploy → card pulses amber → progress log streams in → goes green/red on completion

**Oracle ARM Card:**
- Standalone card: Oracle ARM status, models loaded, disk indicator bar

---

### Tab 4: AGENTS
*Deep telemetry per agent. Workspace file browser.*

**Team split view:**
- Two columns: Core Team | Platform Team
- Agent rows: avatar circle + name + model tag + tier badge + token bar + cron count
- Tap → Agent Detail Modal

**Agent Detail Modal:**
- Top: name, model, tier, team
- Stats row: Tokens (24h) · Cost · Active crons · Last active
- Tabbed detail:
  - **Crons** — scheduled jobs list with next run time + manual run button
  - **Workspace** — file tabs: SOUL.md / MEMORY.md / TOOLS.md / BOOTSTRAP.md (read-only, markdown rendered)
  - **Sessions** — session keys list with timestamps (no content — that's /openclaw/)
- Bottom: "Send Directive →" button (opens Quick-Directive sheet)

---

### Tab 5: AUTOMATION
*Cron schedules + external webhook integrations.*

**24h Cron Timeline:**
- Horizontal bar spanning 24 hours
- Each agent's jobs plotted as colored ticks on the bar
- Agent color legend
- Current time indicator (moving)
- Tap any tick → job detail modal (schedule, last run, next run, run now button)

**Job Table** (below timeline):
- Columns: Agent · Schedule · Last Run · Next Run · Status
- Mobile: simplified to agent + next run + status dot

**Webhook Panel:**
- Card per registered webhook: name, external URL (truncated), last triggered time
- Copy URL button · Revoke button (red, confirm on tap)
- "+ Register Webhook" button → bottom sheet form

**Trigger History:**
- Last 20 trigger events: timestamp + webhook name + status dot + payload peek
- Tap → full payload modal

---

### Tab 6: ARCHIVE
*Everything reviewed, logged, and stored.*

**Secondary tab row inside Archive:**
```
[ Published ] [ Activity Log ] [ Reference Docs ] [ Prompts ]
```

- **Published**: grid of approved items (same card design as Staging but read-only)
- **Activity Log**: full event history, filterable + searchable, infinite scroll
- **Reference Docs**: file tree on left, markdown render on right (single column on mobile)
- **Prompts**: prompt cards with star ratings, category filter, copy button

---

## Global Components

### Quick-Directive FAB
- Floating action button, bottom-right corner, above iOS safe area
- Icon: ⚡ or → arrow
- Tap → Bottom sheet slides up:
  - "Send directive to:" agent picker (8 agents, avatar + name)
  - Message textarea (large, comfortable for mobile typing)
  - [ Send Directive ] button (primary color)
  - Dismiss: swipe down or tap backdrop
- On send: toast notification "Directive sent to Lead" (3s, top of screen)
- This is send-only — no response shown here. Replies appear in /openclaw/

### Modal Pattern (consistent across all tabs)
- Slides up from bottom (mobile) / fades in centered (desktop)
- Rounded top corners, drag handle bar at top
- Swipe down to dismiss
- Header: title + close ✕ button
- Scrollable body
- Sticky action buttons at bottom (above safe area)

### KPI Chips (persistent top bar)
- Inline row, horizontally scrollable on mobile
- Each chip: icon + label + value
- Alert state: chip pulses amber when value changes
- Tap to navigate to relevant tab

---

## Mobile Constraints (non-negotiable)

- **Minimum touch target:** 44×44pt on all interactive elements
- **Bottom tab bar** on mobile (thumb zone), not sidebar
- **No hover-only interactions** — everything has a tap equivalent
- **iOS safe area:** bottom FAB + tab bar must clear the home indicator
- **Swipe gestures:** swipe-down to close modals, swipe left/right on staging cards for approve/reject
- **No horizontal overflow** — all content must scroll vertically within its container
- **Text:** minimum 14px body, 12px for meta labels
- **Performance:** no heavy animations on low-power mode (respect `prefers-reduced-motion`)

---

## Screens to Mockup (Priority Order)

1. **PULSE tab** — mobile + desktop
2. **STAGING tab** — pipeline view + Staging Detail Modal (mobile)
3. **Agent Detail Modal** (mobile)
4. **Quick-Directive FAB + bottom sheet** (mobile)
5. **DEPLOY tab** — deploy timeline + container grid (mobile)
6. **AUTOMATION tab** — cron timeline (desktop shows better)
7. **Tab bar** — mobile bottom bar + desktop top bar variants

---

## What's Being Removed

The current Mission Control has a Chat view (broken, redundant with /openclaw/). Do not include any chat UI, message bubbles, conversation history, or session list in mockups. The /openclaw/ native UI handles all of that.

Also removed: Workflows tab (moved to Paperclip), Teams tab (moved to Paperclip), Governance metrics. Do not include these.

---

## Implementation Constraint for Reference

No build step. Pure HTML + Alpine.js (reactive) + Tailwind CSS (utility classes). All new components must work as static files served by Caddy. No React, no Vue, no bundler.
