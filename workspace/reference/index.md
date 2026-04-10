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

## OpenClaw Reference Library

Detailed OpenClaw documentation — config schema, RPC methods, tools, workspace files, cron, hooks.

| File | What's Inside | When to Read |
|------|--------------|--------------|
| [openclaw/index.md](openclaw/index.md) | Quick reference index | Starting point |
| [openclaw/config.md](openclaw/config.md) | All openclaw.json keys, defaults, validation | Modifying OpenClaw config |
| [openclaw/tools.md](openclaw/tools.md) | Tool profiles, groups, per-agent overrides | Changing agent capabilities |
| [openclaw/rpc.md](openclaw/rpc.md) | WebSocket protocol, all RPC methods | Building integrations |
| [openclaw/workspace.md](openclaw/workspace.md) | Workspace files, loading order, size limits | Agent prompt engineering |
| [openclaw/cron.md](openclaw/cron.md) | Scheduled jobs, schedule types, payloads | Background automation |
| [openclaw/hooks.md](openclaw/hooks.md) | Event hooks, webhooks, trigger endpoints | Event-driven automation |
| [openclaw/agents.md](openclaw/agents.md) | Multi-agent setup, delegation, routing | Agent management |
| [openclaw/glossary.md](openclaw/glossary.md) | Terms, abbreviations, model aliases | Quick lookup |

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
