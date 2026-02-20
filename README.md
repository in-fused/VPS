# in-fused.org — Unified AI Hub

A self-hosted, multi-agent AI workforce running on free-tier infrastructure. Access Claude, ChatGPT, DeepSeek, Groq, and local Ollama models through a single web interface at `https://in-fused.org`.

## Architecture

```
[Browser → https://in-fused.org]
       │
       ▼
┌─── AWS EC2 t2.micro (FREE) ───────────────────┐
│                                                  │
│  Caddy ── reverse proxy + auto-HTTPS ── :443    │
│    ├──► Open WebUI ── Chat Frontend             │
│    └──► LiteLLM ── API Gateway                  │
│           ├──► Remote Ollama (Oracle Cloud)      │
│           ├──► Groq API (free)                   │
│           ├──► DeepSeek API (cheap)              │
│           ├──► Claude API                        │
│           └──► ChatGPT API                       │
│                                                  │
│  OpenClaw ── 24/7 autonomous agent              │
└──────────────────────────────────────────────────┘
                    │
┌─── Oracle Cloud ARM (FREE FOREVER) ──────────────┐
│  Ollama Server (24GB RAM)                         │
│    • qwen2.5-coder:14b   (coding)                │
│    • deepseek-coder-v2:16b (code + general)      │
│    • llama3.2:8b          (fast chat)            │
└───────────────────────────────────────────────────┘
```

## Cost: $10/month Total

| Item | Monthly Cost |
|------|-------------|
| AWS EC2 t2.micro | $0 (free tier) |
| Oracle Cloud ARM 24GB | $0 (free forever) |
| API credits | ~$10 |
| **Total** | **~$10** |

### Model Cost Tiers

Pick the cheapest model that fits your task:

| Tier | Model | Cost per 1M tokens | Best For |
|------|-------|-------------------|----------|
| FREE | Local Ollama (Qwen 2.5 Coder 14B) | $0 | Daily coding, routine chat |
| FREE | Groq (Llama 3.3 70B) | $0 (1K req/day) | When local is slow |
| CHEAP | DeepSeek Chat | $0.14 in / $0.28 out | Complex tasks needing speed |
| CHEAP | GPT-4o-mini | $0.15 in / $0.60 out | General tasks |
| MID | Claude Haiku | $1.00 in / $5.00 out | Fast + smart |
| PREMIUM | Claude Sonnet | $3.00 in / $15.00 out | Complex reasoning (use sparingly) |
| PREMIUM | GPT-4o | $2.50 in / $10.00 out | Strong all-around (use sparingly) |

**Strategy**: Use FREE tier (local models + Groq) for 80% of work. CHEAP tier for 15%. PREMIUM for 5%.

---

## Part 1: AWS EC2 Hub Setup

### Step 1.1 — Find Your EC2 Public IP

1. Open the AWS Console: https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#Instances:
2. Click on your instance (`i-0fe5af5ddcf0065d6`)
3. In the **Details** tab, find **Public IPv4 address**
4. Copy this IP — you'll need it

### Step 1.2 — Allocate an Elastic IP (Keeps IP Stable)

Without an Elastic IP, your public IP changes every time the instance stops/starts.

1. Go to: **EC2 Console → Network & Security → Elastic IPs** (left sidebar)
2. Click **Allocate Elastic IP address**
3. Leave defaults → Click **Allocate**
4. Select the new Elastic IP → Click **Actions → Associate Elastic IP address**
5. Choose your instance (`i-0fe5af5ddcf0065d6`) → Click **Associate**
6. **Write down your Elastic IP** — this is your permanent server IP

> **Note**: Elastic IPs are free while associated with a running instance. They cost ~$3.60/month if the instance is stopped. Release the Elastic IP if you stop the instance long-term.

### Step 1.3 — Point Your Domain to the Server

1. Go to your domain registrar's DNS settings (wherever you purchased `in-fused.org`)
2. **Recommended**: Transfer DNS to Cloudflare (free DDoS protection + fast DNS):
   - Sign up at https://cloudflare.com
   - Add site `in-fused.org`
   - Follow the instructions to update nameservers at your registrar
3. Create an **A record**:
   - **Name**: `@` (or `in-fused.org`)
   - **IPv4 address**: Your Elastic IP from Step 1.2
   - **Proxy status**: DNS only (gray cloud) — let Caddy handle HTTPS
   - **TTL**: Auto
4. Optionally create a `www` CNAME:
   - **Name**: `www`
   - **Target**: `in-fused.org`

Wait a few minutes for DNS to propagate. Test with:
```bash
ping in-fused.org
```
It should resolve to your Elastic IP.

### Step 1.4 — Configure Security Groups

1. In the EC2 Console, click on your instance
2. Click the **Security** tab
3. Click the **Security Group** link (e.g., `sg-xxxxxxxx`)
4. Click **Edit inbound rules**
5. Set up these rules:

| Type | Port | Source | Description |
|------|------|--------|-------------|
| SSH | 22 | My IP | Initial SSH access |
| Custom TCP | 2222 | My IP | Hardened SSH port (after setup) |
| HTTP | 80 | 0.0.0.0/0 | Web (redirects to HTTPS) |
| HTTPS | 443 | 0.0.0.0/0 | Secure web access |

6. Click **Save rules**

> **Important**: "My IP" automatically fills your current IP. If your home IP changes, you'll need to update this. After running the setup script, SSH moves to port 2222 — you can remove the port 22 rule then.

### Step 1.5 — SSH Into Your Server

Open a terminal on your computer and run:

```bash
# Replace YOUR-KEY with your actual .pem filename
chmod 400 ~/Downloads/YOUR-KEY.pem
ssh -i ~/Downloads/YOUR-KEY.pem ubuntu@in-fused.org
```

If DNS hasn't propagated yet, use the Elastic IP directly:
```bash
ssh -i ~/Downloads/YOUR-KEY.pem ubuntu@YOUR_ELASTIC_IP
```

You should see `ubuntu@ip-xxx-xxx:~$` — you're in!

### Step 1.6 — Clone the Repository and Run Setup

```bash
# Clone the repo
git clone https://github.com/in-fused/VPS.git
cd VPS

# Run the server hardening + Docker installation
sudo bash scripts/setup-server.sh
```

This takes 2-5 minutes. It will:
- Update all packages
- Create a `deploy` user
- Harden SSH (key-only, port 2222, no root)
- Install firewall (UFW) and intrusion prevention (Fail2Ban)
- Install Docker
- Create 2GB swap (critical for 1GB instance)
- Enable automatic security updates

### Step 1.7 — CRITICAL: Test SSH on New Port

**Do NOT close your current SSH session yet!** Open a **new terminal** and test:

```bash
ssh -i ~/Downloads/YOUR-KEY.pem -p 2222 deploy@in-fused.org
```

If this works, you're good. If not, go back to the original session and check `/etc/ssh/sshd_config`.

From now on, always use port 2222:
```bash
ssh -i ~/Downloads/YOUR-KEY.pem -p 2222 deploy@in-fused.org
```

### Step 1.8 — Configure API Keys

```bash
cd ~/VPS

# Create your .env from the template
cp .env.example .env

# Edit with your API keys
nano .env
```

**Required** (you already have these):
- `ANTHROPIC_API_KEY=sk-ant-...` — your Claude key
- `OPENAI_API_KEY=sk-...` — your OpenAI key

**Recommended** (sign up for free — see Part 3 below):
- `GROQ_API_KEY=gsk_...` — 1,000 free requests/day
- `DEEPSEEK_API_KEY=sk-...` — extremely cheap ($0.14/1M tokens)

Leave `WEBUI_SECRET_KEY` and `LITELLM_MASTER_KEY` empty — the deploy script auto-generates them.

Save and exit nano: `Ctrl+O` → `Enter` → `Ctrl+X`

### Step 1.9 — Deploy the Stack

```bash
bash scripts/deploy.sh
```

This pulls Docker images (~1-2 minutes), starts all services, and runs health checks.

### Step 1.10 — Access Your AI Hub!

Open your browser and go to:

**https://in-fused.org**

1. You'll see the Open WebUI login page
2. Click **Sign Up** to create your admin account (first user = admin)
3. Choose a model from the dropdown (e.g., `gpt-4o-mini` or `claude-haiku`)
4. Start chatting!

> **If HTTPS isn't working yet** (domain DNS may take up to 24 hours), use `http://YOUR_ELASTIC_IP` temporarily.

---

## Part 2: Oracle Cloud Ollama Server (Free 24GB RAM)

This gives you FREE local AI models — no API credits needed for daily coding and chat.

### Step 2.1 — Create Oracle Cloud Account

1. Go to https://cloud.oracle.com
2. Click **Sign Up** / **Start for Free**
3. Fill in your details (credit card required for verification but won't be charged)
4. **Important**: Select a home region. **Recommended: Frankfurt (eu-frankfurt-1)** — tends to have better ARM availability

### Step 2.2 — Launch ARM Instance

1. In the Oracle Cloud Console, click **Create a VM Instance**
2. Configure:
   - **Name**: `ollama-server`
   - **Placement**: Try different Availability Domains if you get capacity errors
   - **Image**: **Ubuntu 22.04** (click Change Image → Ubuntu → 22.04 Minimal aarch64)
   - **Shape**: Click **Change Shape** → **Ampere** → **VM.Standard.A1.Flex**
     - OCPUs: **4**
     - Memory: **24 GB**
   - **Boot Volume**: **200 GB**
   - **Networking**: Use defaults (public subnet)
   - **SSH Keys**: Upload your `.pem` public key or generate new ones

3. Click **Create**

#### Handling "Out of Capacity" Error

If you see: `Out of capacity for shape VM.Standard.A1.Flex in availability domain AD-1`

**Try these in order:**

1. **Different Availability Domain**: Edit the instance → change AD to AD-2 or AD-3
2. **Smaller config**: Try 2 OCPU + 12GB RAM (still enough for small models)
3. **Different region**: If not tied to Frankfurt, try Toronto, São Paulo, or Sydney
4. **Automated retry script**: Use this tool that automatically retries until capacity opens:
   ```bash
   # On your local machine:
   git clone https://github.com/hitrov/oci-arm-host-capacity.git
   cd oci-arm-host-capacity
   # Follow the README for setup — it retries every 60 seconds
   ```
5. **Try off-peak hours**: Early morning UTC tends to have more availability

### Step 2.3 — Set Up the Ollama Server

Once your instance is running, find its public IP in the Oracle Console.

```bash
# SSH into Oracle Cloud instance
ssh -i ~/Downloads/YOUR-ORACLE-KEY.pem ubuntu@ORACLE_IP

# Download the setup script
git clone https://github.com/in-fused/VPS.git
cd VPS

# Run setup — replace with your EC2 Elastic IP!
sudo bash scripts/setup-ollama-server.sh YOUR_EC2_ELASTIC_IP
```

This installs Ollama, hardens security, and pulls three models (~30-45 minutes for downloads):
- **qwen2.5-coder:14b** — Your primary coding model (rivals GPT-4o for code)
- **deepseek-coder-v2:16b** — Strong coder, 300+ languages
- **llama3.2:8b** — Fast general chat

### Step 2.4 — Connect Ollama to Your Hub

Back on your EC2 server:

```bash
# SSH into EC2
ssh -i ~/Downloads/YOUR-KEY.pem -p 2222 deploy@in-fused.org

# Edit .env
cd ~/VPS
nano .env
```

Update this line with your Oracle instance's public IP:
```
OLLAMA_BASE_URL=http://ORACLE_PUBLIC_IP:11434
```

Restart the stack:
```bash
docker compose down && docker compose up -d
```

### Step 2.5 — Verify Local Models

1. Open https://in-fused.org
2. Click the model dropdown at the top
3. You should see local models: `qwen2.5-coder:14b`, `deepseek-coder-v2:16b`, `llama3.2:8b`
4. Select one and send a message — this runs entirely on your Oracle server at $0 cost!

### Step 2.6 — Oracle Cloud Security Group

In the Oracle Console, add a rule to allow your EC2 to connect:

1. Go to **Networking → Virtual Cloud Networks → your VCN → Security Lists**
2. **Add Ingress Rule**:
   - Source CIDR: `YOUR_EC2_ELASTIC_IP/32`
   - Destination Port: `11434`
   - Description: `Ollama from EC2`

---

## Part 3: API Key Signup Guide

You already have Anthropic and OpenAI. Here's how to get the others:

### DeepSeek (Extremely Cheap — $0.14/1M tokens)

1. Go to https://platform.deepseek.com
2. Click **Sign Up** → create account
3. Go to **API Keys** (left sidebar)
4. Click **Create API Key** → copy it
5. Add to your `.env`:
   ```
   DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxx
   ```
6. Restart: `docker compose down && docker compose up -d`

**Why DeepSeek**: At $0.14 per million input tokens, $10 buys you ~71 million tokens. That's roughly 35,000 full conversations. Excellent for coding.

### Groq (FREE — 1,000 Requests/Day)

1. Go to https://console.groq.com
2. Click **Sign Up** → create account with Google/GitHub
3. Go to **API Keys**
4. Click **Create API Key** → copy it
5. Add to your `.env`:
   ```
   GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxx
   ```
6. Restart: `docker compose down && docker compose up -d`

**Why Groq**: 1,000 free requests per day on 70B+ models (Llama 3.3 70B, Mixtral). That's genuinely useful daily capacity at $0. Models run on Groq's custom LPU hardware — extremely fast responses.

### MiniMax (Optional — Add Later)

MiniMax M2.5 is a strong coding model at $0.30/1M tokens. Add when you need it:
1. Go to https://www.minimax.io
2. Sign up and get API key
3. Add to `.env` and uncomment the MiniMax section in `litellm_config.yaml`

---

## Part 4: Daily Usage Guide

### Choosing Models in Open WebUI

When you open https://in-fused.org, you'll see a model dropdown at the top. Models are labeled by cost tier:

- **"FREE — ..."** → Local Ollama models, $0 cost. Use these for daily work!
- **"FREE (1K/day) — ..."** → Groq models, $0 but rate-limited
- **"CHEAP — ..."** → DeepSeek, GPT-4o-mini. Pennies per conversation.
- **"MID — ..."** → Claude Haiku. Smart + fast.
- **"PREMIUM — ..."** → Claude Sonnet/Opus, GPT-4o. Use sparingly!

**Daily workflow**:
1. Start with a FREE local model (Qwen 2.5 Coder for code, Llama 3.2 for chat)
2. If it's not good enough, switch to Groq (still free)
3. If you need more, use DeepSeek or GPT-4o-mini
4. Only use Claude Sonnet or GPT-4o for truly complex reasoning tasks

### OpenClaw — Autonomous 24/7 Agent

OpenClaw runs as a background service that can execute tasks autonomously. It connects to your LLM providers through LiteLLM.

**Checking OpenClaw status**:
```bash
docker compose logs openclaw
```

**Configuring OpenClaw**: OpenClaw supports integration with messaging platforms (Telegram, Discord, Signal, WhatsApp). Configuration is done through the OpenClaw container. See the OpenClaw documentation for platform-specific setup.

> **Future**: Kimi Claw integration is planned for future exploration as an additional autonomous agent option.

### Managing Ollama Models

SSH into your Oracle Cloud server to manage local models:

```bash
ssh -i ~/Downloads/YOUR-ORACLE-KEY.pem -p 2222 deploy@ORACLE_IP

# List installed models
ollama list

# Pull a new model
ollama pull codellama:13b

# Remove a model (to free disk space)
ollama rm deepseek-coder-v2:16b

# Test a model directly
ollama run qwen2.5-coder:14b "Write a Python function to reverse a linked list"
```

After adding or removing models, they automatically appear in Open WebUI.

### Monitoring API Spend

Track your spending:
- **Anthropic**: https://console.anthropic.com/settings/usage
- **OpenAI**: https://platform.openai.com/usage
- **DeepSeek**: https://platform.deepseek.com/usage
- **Groq**: https://console.groq.com/settings/usage

**Budget tip**: Set spending limits in each provider's dashboard to avoid surprises.

### Updating the Stack

Pull the latest images and restart:
```bash
cd ~/VPS
git pull origin main
docker compose pull
docker compose up -d
```

---

## Security Overview

| Layer | Protection | Details |
|-------|-----------|---------|
| SSH | Key-only auth | Passwords completely disabled |
| SSH | Port 2222 | Non-standard port reduces scans 99% |
| SSH | Fail2Ban | 3 failed attempts → 1 hour ban |
| Network | UFW Firewall | Only ports 2222, 80, 443 open |
| AWS | Security Groups | SSH restricted to your IP only |
| AWS | Elastic IP | Stable IP, no exposure on restart |
| TLS | Auto-HTTPS | Caddy + Let's Encrypt for in-fused.org |
| Docker | Network isolation | Services on internal network only |
| Docker | Memory limits | Prevents OOM crashes on 1GB instance |
| App | User auth | Open WebUI requires login (first user = admin) |
| App | Security headers | HSTS, XSS protection, no-sniff |
| Secrets | .env file | Never committed to git |
| Ollama | IP whitelist | Only accepts connections from EC2 |
| OS | Auto-updates | Unattended security patches |

---

## Quick Reference

```bash
# SSH into EC2
ssh -i ~/Downloads/YOUR-KEY.pem -p 2222 deploy@in-fused.org

# View running services
docker compose ps

# View logs (all services)
docker compose logs -f

# View specific service logs
docker compose logs -f open-webui
docker compose logs -f litellm
docker compose logs -f openclaw

# Restart everything
docker compose restart

# Stop everything
docker compose down

# Update and restart
docker compose pull && docker compose up -d

# Check disk usage
df -h

# Check memory
free -h

# Check swap usage
swapon --show
```

## Troubleshooting

### "502 Bad Gateway"
Services are still starting. Wait 30-60 seconds and refresh.

### "Connection refused" on https://in-fused.org
- Check DNS: `ping in-fused.org` should resolve to your Elastic IP
- Check Caddy: `docker compose logs caddy`
- Check Security Groups: ports 80 and 443 must be open

### Models not showing in Open WebUI
- Check LiteLLM: `docker compose logs litellm`
- Verify API keys in `.env`
- If Ollama models missing: check `OLLAMA_BASE_URL` in `.env`

### Out of memory / slow performance
The t2.micro has only 1GB RAM + 2GB swap. This is tight but works. If you experience issues:
- Check memory: `free -h`
- Check what's using memory: `docker stats`
- Consider upgrading to t3.small ($15/month) for 2GB RAM

### SSH connection refused
After running setup-server.sh, SSH is on port **2222**, not 22:
```bash
ssh -i ~/Downloads/YOUR-KEY.pem -p 2222 deploy@in-fused.org
```
Make sure port 2222 is open in your AWS Security Group.
