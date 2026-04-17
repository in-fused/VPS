# EC2 Exit Migration Plan — All-in-One Oracle ARM

**Goal:** Move everything off EC2 onto the Oracle ARM instance (free forever).
Single host, zero infra cost, all services running without error.

**Why Oracle ARM only (not Hetzner):**
Hetzner CX32 has 4 GB RAM — not enough to run Ollama locally with 30B models.
Oracle ARM has 24 GB RAM — the only option that fits the entire stack on one machine.

---

## Current State

| Where | Services |
|-------|----------|
| **EC2 t3.small** | Caddy, OpenClaw, Webhook, Paperclip, Paperclip-DB, Watchtower, oracle-tunnel |
| **Oracle ARM (4 OCPU / 24 GB)** | LiteLLM, LiteLLM-DB, Scrapling, SearXNG, Ollama (native) |

Phase 1 (already done on this branch) moved the heavy API services to Oracle ARM.
Phase 2 (this plan) moves the remaining EC2 services to Oracle ARM and terminates EC2.

---

## RAM Budget — Verified Fits

| Service | RAM (limit) | Notes |
|---------|-------------|-------|
| Caddy | 64 MB | |
| OpenClaw | 1,536 MB | |
| LiteLLM | 1,536 MB | Reduced from 2 GB — see note below |
| LiteLLM-DB | 128 MB | |
| Scrapling | 512 MB | |
| SearXNG | 256 MB | |
| Webhook | 64 MB | |
| Paperclip | 256 MB | |
| Paperclip-DB | 128 MB | |
| Watchtower | 64 MB | |
| **Services total** | **~4.5 GB** | |
| OS + system | ~512 MB | |
| Ollama: qwen3.5:9b (when loaded) | 6,600 MB | |
| Ollama: qwen3-coder:30b (when loaded) | 18,600 MB | Loaded on demand, evicted after 5 min idle |
| **Peak (30B active)** | **~23.6 GB** | ✅ 400 MB headroom |
| **Normal (9B active)** | **~11.6 GB** | ✅ 12.4 GB headroom |

**LiteLLM memory note:** The limit was previously raised from 512 MB → 2 GB after OOM crashes.
Setting it to 1.5 GB (instead of 2 GB) saves 512 MB and is almost certainly safe — LiteLLM's
actual Python process rarely exceeds 800 MB. If it OOMs at 1.5 GB, raise to 1.75 GB.

**oracle-tunnel:** NOT needed after migration — everything is local on the same host.

---

## Migration Steps

### Step 1 — Reduce LiteLLM Memory Limit

In `oracle/docker-compose.yml`, change LiteLLM memory from `2G` to `1536M`.
(Already handled in this branch — verify before deploying.)

### Step 2 — Open Oracle VCN Ports 80 and 443

The Oracle ARM instance currently only has port 22 (SSH) and 11434 (Ollama — EC2 only) open.
Caddy needs 80 and 443 for HTTP/HTTPS and Let's Encrypt.

**In Oracle Cloud Console:**
1. Networking → Virtual Cloud Networks → your VCN → Security Lists
2. Add Ingress Rule: TCP port 80 from `0.0.0.0/0` (HTTP, needed for Let's Encrypt ACME)
3. Add Ingress Rule: TCP port 443 from `0.0.0.0/0` (HTTPS)
4. Port 22 already open — leave it

**Also open in OS-level firewall (run on Oracle ARM via SSH):**

📱 iOS/SSM:
```
ssh -i ~/oracle-instance-key ubuntu@150.136.153.194 "sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT && sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT && sudo netfilter-persistent save"
```

🖥️ Desktop/SSH:
```bash
ssh -i ~/oracle-instance-key ubuntu@150.136.153.194
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### Step 3 — Update Oracle docker-compose.yml

Add the remaining services (Caddy, OpenClaw, Webhook, Paperclip, Paperclip-DB, Watchtower)
to `oracle/docker-compose.yml`. This is the main code change in this migration.

Key differences from EC2 compose:
- No `oracle-tunnel` service (everything is local — LiteLLM is at `http://litellm:4000`)
- No `ORACLE_LITELLM_URL` / `ORACLE_SCRAPLING_URL` etc. — use Docker internal hostnames
- `OLLAMA_BASE_URL=http://host.docker.internal:11434` (Ollama runs natively, not in Docker)
- Caddy gets a real public IP (Oracle ARM's) — Let's Encrypt will issue a cert

Env vars for OpenClaw on Oracle ARM:
```
OPENAI_API_BASE_URL=http://litellm:4000/v1
OPENCLAW_GATEWAY_PASSWORD=${OPENCLAW_PASSWORD}
```

### Step 4 — Copy Secrets to Oracle ARM

The `.env` content must be identical (same DB passwords, salt keys — do NOT regenerate):

**On EC2, copy .env:**
```bash
cat /home/VPS/.env
```

**On Oracle ARM, create /home/oracle/VPS/.env** (or wherever repo is cloned) with the same content.

Also copy the SSH key for any remaining EC2 references:
```bash
# Not needed after migration — oracle-tunnel is gone
```

### Step 5 — Point DNS to Oracle ARM

At Cloudflare (set TTL to 60s first for fast rollback):
- A record `in-fused.org` → `150.136.153.194` (Oracle ARM public IP)

Wait ~2 min for propagation, verify with `ping in-fused.org`.

### Step 6 — Deploy to Oracle ARM

📱 iOS/SSM (from EC2 while it's still running):
```
cd /home/VPS && bash scripts/deploy-oracle.sh
```

🖥️ Desktop/SSH (directly on Oracle ARM):
```bash
ssh -i ~/oracle-instance-key ubuntu@150.136.153.194
cd ~/VPS
sudo bash scripts/deploy.sh
```

### Step 7 — Verify (Wait 24h Before Terminating EC2)

Check list:
- [ ] `https://in-fused.org` loads Mission Control
- [ ] Login works (cookie auth)
- [ ] OpenClaw agents respond in chat
- [ ] LiteLLM model list loads (via `/api/mc/v1/models`)
- [ ] Ollama models available (`qwen3.5:9b`, `qwen3-coder:30b`)
- [ ] Scrapling responds: `wget -qO- 'http://scrapling:8000/health'`
- [ ] SearXNG responds: `wget -qO- 'http://searxng:8080/healthz'`
- [ ] Paperclip loads at `/paperclip/`
- [ ] Agents bootstrap (check logs 60-90s after startup)

### Step 8 — Terminate EC2

After 24h of stable operation:

1. AWS Console → EC2 → select instance → Actions → Terminate
2. Elastic IPs → Release the IP (otherwise ~$3.60/month charge for unused EIP)
3. EBS volumes are deleted automatically on termination (if "Delete on termination" is checked — verify first)

**Savings: ~$15/month (EC2) = $180/year**

---

## Rollback

If anything fails, DNS is the rollback lever:
- Update Cloudflare A record back to EC2 Elastic IP
- Takes 60s to propagate (if TTL was set to 60 before starting)
- EC2 is still running until Step 8 — do not terminate until 24h verified

---

## What's Already Done (Phase 1 — This Branch)

- [x] LiteLLM + LiteLLM-DB on Oracle ARM (`oracle/docker-compose.yml`)
- [x] Scrapling on Oracle ARM
- [x] SearXNG on Oracle ARM
- [x] `deploy-oracle.sh` — syncs config and restarts Oracle services
- [x] EC2 docker-compose updated to use `ORACLE_LITELLM_URL` (oracle-tunnel bridge)
- [x] oracle-tunnel SSH service working (used during transition, removed after full migration)

## What Remains (Phase 2 — This Plan)

- [ ] Add remaining services to `oracle/docker-compose.yml` (Caddy, OpenClaw, Webhook, Paperclip, Paperclip-DB, Watchtower)
- [ ] Reduce LiteLLM memory limit to 1536M in oracle/docker-compose.yml
- [ ] Open Oracle VCN ports 80 + 443
- [ ] Update Caddyfile for Oracle ARM (no proxy to itself needed — internal Docker hostnames)
- [ ] Point DNS to Oracle ARM IP
- [ ] Deploy, verify 24h, terminate EC2, release Elastic IP
