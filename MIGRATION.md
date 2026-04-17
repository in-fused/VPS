# EC2 Exit Migration Plan

**Status:** In progress — Phase 1 (Oracle ARM offload) complete on branch `claude/fix-critical-failures-4RPWm`
**Goal:** Eliminate ~$15/month EC2 cost before promo credit runs out
**Decision required:** Hetzner CX32 (Option A) vs. Full Oracle ARM (Option B)

---

## Current State (After Phase 1)

The branch already moved LiteLLM, Scrapling, and SearXNG off EC2:

| Where | Services | RAM |
|-------|----------|-----|
| **EC2 t3.small** | Caddy, OpenClaw, Webhook, Paperclip, Paperclip-DB, Watchtower, oracle-tunnel | ~2.1 GB used |
| **Oracle ARM** | LiteLLM, LiteLLM-DB, Scrapling, SearXNG, Ollama (native) | 4+ GB used |

EC2 still costs ~$15/month. Eliminating it means moving: **Caddy + OpenClaw + Webhook + Paperclip + Paperclip-DB + Watchtower**.

---

## Option A — Hetzner CX32 (Primary Recommendation)

**Cost:** ~$12/month (€10.99) | **Specs:** 4 vCPU, 4 GB RAM, 80 GB NVMe, 20 TB traffic | **Location:** Ashburn, VA or Hillsboro, OR

### Why Hetzner over staying on EC2

- 4 GB RAM vs 2 GB — OpenClaw gets full 1.5 GB without swap pressure
- 2x the CPU at lower cost (~$12 vs ~$15)
- NVMe storage (much faster than gp3 EBS for Docker volume I/O)
- No egress costs (EC2 charges $0.09/GB after 100GB free)
- Hetzner has no equivalent to EC2 promo expiry surprises

### Why Hetzner over Option B (full Oracle ARM)

- Oracle free tier has usage policy enforcement risk — they can reclaim free instances
- Hetzner has guaranteed SLA and dedicated resources
- Simpler: one SSH key, one server, no VCN firewall gotchas
- OpenClaw + Oracle ARM's VCN restrictions are a known pain point (see oracle-tunnel saga)

### Migration Steps — Option A

**Phase 2A.1: Provision Hetzner CX32**

1. Create account: https://hetzner.com/cloud
2. New Project → Add Server:
   - Location: Ashburn (US-East) or Hillsboro (US-West)
   - Image: Ubuntu 24.04
   - Type: CX32 (4 vCPU / 4 GB)
   - SSH Key: upload your existing key (`Infused-VPS-key.pem` public key)
   - Name: `in-fused-hub`
3. Note the server IP

**Phase 2A.2: Point DNS to Hetzner**

At your DNS provider (Cloudflare):
- Update A record `in-fused.org` → Hetzner IP
- Set TTL to 60s first (so rollback is fast)
- Wait for propagation before proceeding

**Phase 2A.3: Set Up Hetzner Server**

📱 iOS/SSM equivalent — run from your existing EC2 (or any machine with the key):
```
ssh -i ~/Downloads/Infused-VPS-key.pem root@HETZNER_IP "bash -s" < /dev/stdin
```

Or SSH in and run:
```bash
ssh -i ~/Downloads/Infused-VPS-key.pem root@HETZNER_IP
git clone https://github.com/in-fused/VPS.git /home/VPS
cd /home/VPS
sudo bash scripts/setup-server.sh
```

**Phase 2A.4: Copy Secrets from EC2**

On EC2, grab the `.env`:
```bash
cat /home/VPS/.env
```

On Hetzner, create the `.env` (same content — DO NOT regenerate DB_PASSWORD or LITELLM_SALT_KEY):
```bash
cd /home/VPS
nano .env   # paste exact content from EC2
```

Also copy the Paperclip DB volume OR let it recreate (agents re-register automatically via setup-paperclip.js on restart).

**Phase 2A.5: Copy oracle-instance-key**

The oracle-tunnel SSH key must be present:
```bash
# On EC2:
cat /home/VPS/oracle-instance-key  # copy this

# On Hetzner:
nano /home/VPS/oracle-instance-key  # paste, then:
chmod 600 /home/VPS/oracle-instance-key
```

**Phase 2A.6: Update Oracle ARM Firewall**

Oracle ARM currently allows SSH (port 22) from EC2's IP. After moving to Hetzner:

In Oracle Console → VCN → Security Lists → Ingress Rules:
- Remove rule allowing EC2 IP
- Add rule allowing Hetzner IP on port 22 (for oracle-tunnel SSH)

Also update ORACLE_LITELLM_URL, ORACLE_SCRAPLING_URL, ORACLE_SEARXNG_URL in Hetzner's `.env` — same Oracle ARM IP, no change needed there.

**Phase 2A.7: Deploy**

```bash
cd /home/VPS
sudo bash scripts/deploy.sh
```

**Phase 2A.8: Verify, Then Terminate EC2**

- Confirm https://in-fused.org loads from Hetzner
- Confirm OpenClaw agents respond in Mission Control chat
- Confirm LiteLLM models list loads (via oracle-tunnel to Oracle ARM)
- Monitor for 24h

Then:
- AWS Console → EC2 → Terminate instance
- Release Elastic IP (else you pay ~$3.60/month for unused EIP)
- Cancel EBS volume if separate

**Total monthly cost after:** ~$12 Hetzner + $0 Oracle ARM + ~$10 API credits = **~$22/month** (saves ~$3)

---

## Option B — Full Oracle ARM Consolidation (Zero Infra Cost)

**Cost:** $0/month infra | **Risk:** Oracle free tier policy enforcement

### Current Oracle ARM state — Accurate RAM accounting

The ARM instance (4 OCPU / 24 GB total RAM):

| Component | RAM |
|-----------|-----|
| LiteLLM | 2,048 MB |
| LiteLLM-DB | 128 MB |
| Scrapling | 512 MB |
| SearXNG | 256 MB |
| OS + system | ~512 MB |
| **Docker + OS subtotal** | **~3.5 GB** |

Ollama loads models **on demand** and evicts after 5 min idle — they are NOT all in RAM simultaneously:

| Model | RAM when loaded |
|-------|----------------|
| qwen3.5:9b | 6.6 GB |
| qwen3-coder:30b (MoE) | **18.6 GB** (full weights in RAM, even though only 3.3B params fire per token) |
| *(qwen3:14b was removed — freed 9.3 GB)* | — |

**Services we'd be moving from EC2:**

| Service | RAM |
|---------|-----|
| OpenClaw | 1,536 MB |
| Caddy | 64 MB |
| Webhook | 64 MB |
| Paperclip | 256 MB |
| Paperclip-DB | 128 MB |
| Watchtower | 64 MB |
| **EC2 services subtotal** | **~2.1 GB** |

**Honest headroom analysis:**

| Scenario | RAM used | Free | Verdict |
|----------|----------|------|---------|
| 30B model active + all services | 3.5 + 18.6 + 2.1 = **24.2 GB** | -200 MB | ❌ OOM |
| 9B model active + all services | 3.5 + 6.6 + 2.1 = **12.2 GB** | 11.8 GB | ✅ Fine |
| No model loaded + all services | 3.5 + 2.1 = **5.6 GB** | 18.4 GB | ✅ Fine |

**The qwen3-coder:30b model (18.6 GB) cannot coexist with the full service stack.** If it gets loaded while OpenClaw is running, Linux will OOM-kill the lowest-priority process — most likely LiteLLM or Scrapling.

**Options to make Option B work:**
1. **Drop qwen3-coder:30b** — remove from `litellm_config.yaml`. The 9B model handles most coding tasks.
2. **Keep the 30B but accept the constraint** — it works fine when OpenClaw is idle, which is most of the time. The 5-minute Ollama eviction means they rarely collide.
3. **Reduce LiteLLM memory limit from 2G to 1G** — LiteLLM rarely hits 2 GB in practice. This gives back 1 GB and makes the 30B scenario ~800 MB short instead of OOM territory.

### Risks

1. **Oracle free tier enforcement** — Oracle has reclaimed free instances that appear "commercial." Low but real risk. No SLA. No warning.
2. **Single point of failure** — If Oracle ARM goes down, everything goes down (vs. Hetzner where it's just the hub)
3. **VCN firewall complexity** — Already experienced the oracle-tunnel SSH workaround. Adding Caddy on Oracle means managing more VCN ingress rules (ports 80, 443 from 0.0.0.0/0)
4. **Oracle's bandwidth** — Free tier has limited egress (~10 TB/month outbound, which is fine, but NAT gateway costs money if misconfigured)

### Migration Steps — Option B

**Phase 2B.1: Open Oracle VCN for HTTP/HTTPS**

In Oracle Console → VCN → Security Lists → Ingress:
- Add: TCP port 80 from 0.0.0.0/0
- Add: TCP port 443 from 0.0.0.0/0
- (Port 22 already open for oracle-tunnel)

Also update iptables on the Oracle ARM instance:
```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

**Phase 2B.2: Update Oracle docker-compose.yml**

Add Caddy, OpenClaw, Webhook, Paperclip, Paperclip-DB, Watchtower to `oracle/docker-compose.yml`.

Caddy config: point `in-fused.org` HTTPS to internal Oracle services (LiteLLM now on localhost:4000, etc. — no more oracle-tunnel needed, everything is local).

**Phase 2B.3: Point DNS to Oracle ARM IP**

At Cloudflare:
- A record `in-fused.org` → Oracle ARM IP (the public IP, e.g. `150.136.153.194`)

**Phase 2B.4: Deploy to Oracle ARM**

```bash
# From EC2 (or local):
bash scripts/deploy-oracle.sh
```

Or SSH into Oracle ARM directly:
```bash
ssh -i ~/oracle-instance-key ubuntu@150.136.153.194
cd /home/oracle/VPS  # or wherever it's cloned
sudo bash scripts/deploy.sh
```

**Phase 2B.5: Verify, Then Terminate EC2**

Same as Option A — test thoroughly for 24h before terminating.

**Total monthly cost after:** $0 infra + ~$10 API credits = **~$10/month** (saves ~$15)

---

## Recommendation

**Go with Option A (Hetzner CX32)** unless you have a hard $0 infra budget.

Reasoning:
- Oracle free tier risk isn't worth it for production. If Oracle reclaims the instance, the entire site goes dark simultaneously — no fallback.
- The current hybrid (EC2 + Oracle ARM) already took significant debugging work (oracle-tunnel saga). Hetzner eliminates that complexity.
- $12/month for a guaranteed 4 GB server is good value. The $3/month savings over current EC2 is a bonus.
- Hetzner makes it easy to snapshot and restore. Oracle's free tier doesn't.

**If budget is hard $0:** Option B is viable — the ARM instance has headroom. But add a health-check alert so you know immediately if Oracle goes down.

---

## Rollback Plan (Either Option)

EC2 is still running until you terminate it. If anything goes wrong on Hetzner/Oracle ARM:
1. Update DNS A record back to EC2 Elastic IP
2. DNS propagates in 60s (if you set TTL to 60 before starting)
3. Everything is back on EC2

Keep EC2 running for 48h after successful migration before terminating.

---

## What's Already Done (Phase 1 — This Branch)

- [x] LiteLLM + LiteLLM-DB moved to Oracle ARM
- [x] Scrapling moved to Oracle ARM  
- [x] SearXNG moved to Oracle ARM
- [x] oracle-tunnel SSH service bridges Oracle ARM services to EC2
- [x] All EC2 services (OpenClaw, Caddy, Webhook) updated to use `ORACLE_LITELLM_URL`
- [x] `deploy-oracle.sh` script for syncing Oracle ARM config
- [x] `oracle/docker-compose.yml` for Oracle ARM services

## What Remains (Phase 2)

- [ ] Choose Option A (Hetzner) or Option B (Full Oracle ARM)
- [ ] Provision target server
- [ ] Update DNS
- [ ] Migrate Caddy + OpenClaw + Webhook + Paperclip
- [ ] Update Oracle VCN firewall rules for new server IP
- [ ] Verify 24h, then terminate EC2
- [ ] Release Elastic IP
