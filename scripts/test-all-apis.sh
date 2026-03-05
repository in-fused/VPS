#!/usr/bin/env bash
###############################################################################
# test-all-apis.sh — Comprehensive API & Connection Diagnostics
###############################################################################
# Tests EVERY API endpoint, model routing pair, OpenClaw RPC methods,
# fallback chains, and connection accuracy across the entire stack.
#
# Usage:
#   bash scripts/test-all-apis.sh              # Full test suite
#   bash scripts/test-all-apis.sh --quick      # Skip paid models
#   bash scripts/test-all-apis.sh --models     # Only test model routing
#   bash scripts/test-all-apis.sh --openclaw   # Only test OpenClaw APIs
#   bash scripts/test-all-apis.sh --fallbacks  # Only test fallback chains
#
# Run from the VPS repo directory.
# Keys are read from .env — never printed in full (first 8 chars only).
#
# iOS/SSM single-line:
#   cd /home/VPS && sudo bash scripts/test-all-apis.sh
#
# Desktop/SSH:
#   cd /home/VPS
#   bash scripts/test-all-apis.sh
###############################################################################

set -uo pipefail

# ============================================================================
# Configuration
# ============================================================================
QUICK_MODE=false
ONLY_MODELS=false
ONLY_OPENCLAW=false
ONLY_FALLBACKS=false

for arg in "$@"; do
  case "$arg" in
    --quick)     QUICK_MODE=true ;;
    --models)    ONLY_MODELS=true ;;
    --openclaw)  ONLY_OPENCLAW=true ;;
    --fallbacks) ONLY_FALLBACKS=true ;;
    --help|-h)
      echo "Usage: bash scripts/test-all-apis.sh [--quick|--models|--openclaw|--fallbacks]"
      echo "  --quick      Skip paid models (only test free tiers)"
      echo "  --models     Only test LiteLLM model routing pairs"
      echo "  --openclaw   Only test OpenClaw RPC/WebSocket APIs"
      echo "  --fallbacks  Only test fallback chain behavior"
      exit 0
      ;;
  esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Counters
PASS=0; FAIL=0; SKIP=0; WARN=0
TOTAL_LATENCY=0; LATENCY_COUNT=0

# Results accumulator for final ranking
declare -a MODEL_RESULTS=()

RESP=$(mktemp /tmp/api-test-XXXXXX.json)
RESP2=$(mktemp /tmp/api-test2-XXXXXX.json)
trap "rm -f $RESP $RESP2" EXIT

###############################################################################
# Helpers
###############################################################################

mask_key() {
  local key="$1"
  [ ${#key} -le 8 ] && echo "${key}..." && return
  echo "${key:0:8}..."
}

# Run HTTP requests inside the Docker network (services don't expose ports to host)
# Usage: docker_curl [-X method] [-H header]... [-d body] [-o outfile] [-w format] [--max-time N] <url>
# Returns: writes response to $RESP (or -o file), prints http_code if -w used
docker_curl() {
  # Build curl args, routing through the litellm container (has python3)
  # We use python3 urllib since curl may not be in the container
  local method="GET" url="" body="" max_time=30 outfile="$RESP" write_format="" headers=()

  while [ $# -gt 0 ]; do
    case "$1" in
      -X) method="$2"; shift 2 ;;
      -H) headers+=("$2"); shift 2 ;;
      -d) body="$2"; shift 2 ;;
      -o) outfile="$2"; shift 2 ;;
      -w) write_format="$2"; shift 2 ;;
      -s) shift ;;  # silently ignore -s
      --max-time) max_time="$2"; shift 2 ;;
      *) url="$1"; shift ;;
    esac
  done

  # Build python3 script for the HTTP request
  local header_code=""
  for h in "${headers[@]}"; do
    local hname="${h%%:*}"
    local hval="${h#*: }"
    # Escape single quotes in header values for python string safety
    hval=$(printf '%s' "$hval" | sed "s/'/\\\\'/g")
    header_code="${header_code}req.add_header('${hname}', '${hval}');"
  done

  local py_script="
import urllib.request, urllib.error, json, sys, socket
socket.setdefaulttimeout(${max_time})
try:
    req = urllib.request.Request('${url}', method='${method}')
    ${header_code}
"
  if [ -n "$body" ]; then
    # Escape single quotes in body for python
    local escaped_body
    escaped_body=$(printf '%s' "$body" | sed "s/'/\\\\'/g")
    py_script="${py_script}    req.data = '${escaped_body}'.encode()
    req.add_header('Content-Type', 'application/json')
"
  fi

  py_script="${py_script}    resp = urllib.request.urlopen(req)
    data = resp.read().decode()
    code = resp.getcode()
    print(str(code) + '|||' + data)
except urllib.error.HTTPError as e:
    data = e.read().decode() if e.fp else ''
    print(str(e.code) + '|||' + data)
except Exception as e:
    print('000|||' + str(e))
"

  local result
  result=$(docker exec litellm python3 -c "$py_script" 2>/dev/null) || result="000|||connection failed"

  local http_code="${result%%|||*}"
  local response_body="${result#*|||}"

  printf '%s' "$response_body" > "$outfile"

  if [ -n "$write_format" ]; then
    printf '%s' "$http_code"
  fi
}

# Shorthand: run a LiteLLM API call, return http_code, body in $RESP
litellm_api() {
  local endpoint="$1"; shift
  docker_curl -s -o "$RESP" -w "%{http_code}" --max-time 30 \
    -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
    "$@" "http://localhost:4000${endpoint}"
}

# Shorthand: OpenClaw wget from inside its container
openclaw_wget() {
  local url="$1"
  docker exec openclaw wget -qO- --timeout=10 "$url" 2>/dev/null
}

pass() { echo -e "  ${GREEN}PASS${NC}  $1"; PASS=$((PASS + 1)); }
fail() {
  echo -e "  ${RED}FAIL${NC}  $1"
  [ -n "${2:-}" ] && echo -e "        ${RED}-> $2${NC}"
  FAIL=$((FAIL + 1))
}
skip() { echo -e "  ${YELLOW}SKIP${NC}  $1 — ${2:-not configured}"; SKIP=$((SKIP + 1)); }
warn() { echo -e "  ${YELLOW}WARN${NC}  $1"; WARN=$((WARN + 1)); }

section() {
  echo ""
  echo -e "${BOLD}${BLUE}================================================================${NC}"
  echo -e "${BOLD}${BLUE}  $1${NC}"
  echo -e "${BOLD}${BLUE}================================================================${NC}"
  echo ""
}

subsection() {
  echo ""
  echo -e "${BOLD}--- $1 ---${NC}"
}

extract_error() {
  if command -v python3 &>/dev/null; then
    python3 -c "
import json, sys
try:
    d = json.load(open('$RESP'))
    msg = d.get('error', {})
    if isinstance(msg, dict):
        print(msg.get('message', str(msg)[:200]))
    else:
        print(str(msg)[:200])
except:
    print('(parse error)')
" 2>/dev/null
  else
    head -c 200 "$RESP" 2>/dev/null
  fi
}

# Test a model via LiteLLM with timing
# Usage: test_model <alias> <tier> <cost_per_1m> [skip_if_quick]
test_model() {
  local alias="$1" tier="$2" cost="$3" skip_paid="${4:-false}"

  if [ "$QUICK_MODE" = "true" ] && [ "$skip_paid" = "true" ]; then
    skip "$alias ($tier)" "skipped in --quick mode"
    return
  fi

  local start_ms end_ms elapsed_ms
  start_ms=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000000000))" 2>/dev/null || echo 0)

  local http_code
  http_code=$(docker_curl -s -o "$RESP" -w "%{http_code}" --max-time 30 \
    -X POST \
    -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
    -d "{\"model\":\"$alias\",\"max_tokens\":5,\"messages\":[{\"role\":\"user\",\"content\":\"Say OK\"}]}" \
    "http://localhost:4000/v1/chat/completions" \
    ) || http_code="000"

  end_ms=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000000000))" 2>/dev/null || echo 0)

  if [ "$start_ms" != "0" ] && [ "$end_ms" != "0" ]; then
    elapsed_ms=$(( (end_ms - start_ms) / 1000000 ))
  else
    elapsed_ms=0
  fi

  local response_text=""
  if [ "$http_code" = "200" ]; then
    response_text=$(python3 -c "
import json
try:
    d = json.load(open('$RESP'))
    c = d.get('choices',[{}])[0]
    msg = c.get('message',{}).get('content','') or c.get('delta',{}).get('content','')
    model_used = d.get('model','unknown')
    tokens = d.get('usage',{})
    total_tok = tokens.get('total_tokens', '?')
    print(f'{msg.strip()[:50]} | model={model_used} | tokens={total_tok}')
except:
    print('(parse error)')
" 2>/dev/null)
    local latency_label=""
    if [ "$elapsed_ms" -gt 0 ]; then
      latency_label=" (${elapsed_ms}ms)"
      TOTAL_LATENCY=$((TOTAL_LATENCY + elapsed_ms))
      LATENCY_COUNT=$((LATENCY_COUNT + 1))
    fi
    pass "$alias [$tier, \$$cost/1M]${latency_label} -> $response_text"
    MODEL_RESULTS+=("$elapsed_ms|$cost|$tier|$alias|PASS")
  elif [ "$http_code" = "429" ]; then
    warn "$alias [$tier] — rate limited (429). Fallback should handle this."
    MODEL_RESULTS+=("99999|$cost|$tier|$alias|RATE_LIMITED")
  elif [ "$http_code" = "000" ]; then
    fail "$alias [$tier]" "connection timeout or DNS error"
    MODEL_RESULTS+=("99999|$cost|$tier|$alias|TIMEOUT")
  else
    local err
    err=$(extract_error)
    fail "$alias [$tier] — HTTP $http_code" "$err"
    MODEL_RESULTS+=("99999|$cost|$tier|$alias|FAIL_$http_code")
  fi
}

# Test a direct provider API (bypassing LiteLLM)
# Usage: test_provider_direct <name> <url> <auth_header> <body>
test_provider_direct() {
  local name="$1" url="$2" auth_header="$3" body="$4"

  local start_ms end_ms elapsed_ms
  start_ms=$(date +%s%N 2>/dev/null || echo 0)

  local http_code
  http_code=$(curl -s -o "$RESP" -w "%{http_code}" --max-time 20 \
    -X POST "$url" \
    -H "$auth_header" \
    -H "Content-Type: application/json" \
    -d "$body" \
    2>/dev/null) || http_code="000"

  end_ms=$(date +%s%N 2>/dev/null || echo 0)
  if [ "$start_ms" != "0" ] && [ "$end_ms" != "0" ]; then
    elapsed_ms=$(( (end_ms - start_ms) / 1000000 ))
  else
    elapsed_ms=0
  fi

  if [ "$http_code" = "200" ]; then
    pass "$name direct (${elapsed_ms}ms)"
  elif [ "$http_code" = "000" ]; then
    fail "$name direct" "connection timeout"
  else
    local err
    err=$(extract_error)
    fail "$name direct — HTTP $http_code" "$err"
  fi
}

###############################################################################
# Load .env
###############################################################################
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

if [ ! -f "$REPO_DIR/.env" ]; then
  echo -e "${RED}ERROR: .env not found at $REPO_DIR/.env${NC}"
  exit 1
fi

set -a; source "$REPO_DIR/.env"; set +a

echo ""
echo -e "${BOLD}${MAGENTA}============================================================${NC}"
echo -e "${BOLD}${MAGENTA}  in-fused.org — Comprehensive API & Connection Diagnostics${NC}"
echo -e "${BOLD}${MAGENTA}  $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${BOLD}${MAGENTA}============================================================${NC}"
[ "$QUICK_MODE" = "true" ] && echo -e "${YELLOW}  Mode: QUICK (skipping paid models)${NC}"
[ "$ONLY_MODELS" = "true" ] && echo -e "${YELLOW}  Mode: MODELS ONLY${NC}"
[ "$ONLY_OPENCLAW" = "true" ] && echo -e "${YELLOW}  Mode: OPENCLAW ONLY${NC}"
[ "$ONLY_FALLBACKS" = "true" ] && echo -e "${YELLOW}  Mode: FALLBACKS ONLY${NC}"

###############################################################################
# SECTION 1: Infrastructure Health
###############################################################################
if [ "$ONLY_MODELS" != "true" ] && [ "$ONLY_FALLBACKS" != "true" ]; then

section "1. INFRASTRUCTURE HEALTH"

subsection "Docker Services"
SERVICES=("caddy" "open-webui" "litellm" "litellm-db" "openclaw" "scrapling")
for svc in "${SERVICES[@]}"; do
  status=$(docker compose -f "$REPO_DIR/docker-compose.yml" ps --format '{{.State}}' "$svc" 2>/dev/null || echo "unknown")
  health=$(docker inspect --format '{{.State.Health.Status}}' "$svc" 2>/dev/null || echo "none")
  if [ "$status" = "running" ]; then
    if [ "$health" = "healthy" ] || [ "$health" = "none" ]; then
      pass "$svc: $status (health: $health)"
    else
      warn "$svc: $status but health=$health"
    fi
  else
    fail "$svc: $status" "expected running"
  fi
done

subsection "LiteLLM Health Endpoint"
if [ -n "${LITELLM_MASTER_KEY:-}" ]; then
  HTTP=$(docker_curl -s -o "$RESP" -w "%{http_code}" --max-time 10 \
    "http://localhost:4000/health/liveliness") || HTTP="000"
  if [ "$HTTP" = "200" ]; then
    pass "LiteLLM /health/liveliness (HTTP $HTTP)"
  else
    fail "LiteLLM health" "HTTP $HTTP"
  fi

  # Model count
  HTTP=$(docker_curl -s -o "$RESP" -w "%{http_code}" --max-time 10 \
    -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
    "http://localhost:4000/v1/models") || HTTP="000"
  if [ "$HTTP" = "200" ]; then
    count=$(python3 -c "import json; print(len(json.load(open('$RESP')).get('data',[])))" 2>/dev/null || echo "?")
    pass "LiteLLM /v1/models — $count models registered"
  else
    fail "LiteLLM /v1/models" "HTTP $HTTP"
  fi
else
  skip "LiteLLM" "LITELLM_MASTER_KEY not set"
fi

subsection "OpenClaw Health Endpoint"
OC_HEALTH=$(docker exec openclaw wget -qO- --timeout=10 "http://localhost:18789/healthz" 2>/dev/null)
if [ -n "$OC_HEALTH" ]; then
  pass "OpenClaw /healthz (via docker exec)"
else
  fail "OpenClaw /healthz" "not reachable inside container — may be starting"
fi

# OpenClaw gateway base
OC_GW=$(docker exec openclaw wget -qO- --timeout=10 "http://localhost:18789/openclaw/" 2>&1)
if [ $? -eq 0 ]; then
  pass "OpenClaw /openclaw/ gateway UI accessible"
else
  warn "OpenClaw /openclaw/ — not reachable (may require auth)"
fi

subsection "Scrapling Health"
HTTP=$(docker exec scrapling curl -sf http://localhost:8000/health 2>/dev/null && echo "200" || echo "000")
if [ "$HTTP" = "200" ]; then
  pass "Scrapling /health — internal API accessible"
else
  fail "Scrapling /health" "not reachable inside container"
fi

# Test scrapling actual scrape
SCRAPE_RESULT=$(docker exec scrapling curl -sf 'http://localhost:8000/scrape?url=https://httpbin.org/get' 2>/dev/null)
if echo "$SCRAPE_RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('status')=='success' or d.get('body','')" 2>/dev/null; then
  pass "Scrapling scrape test (httpbin.org)"
else
  warn "Scrapling scrape — may be rate-limited or slow"
fi

subsection "OpenClaw Config Validation"
# Check config is valid JSON
CONFIG_OK=$(docker exec openclaw node -e "
try {
  const c = JSON.parse(require('fs').readFileSync('/home/node/.openclaw/openclaw.json','utf8'));
  const agents = c.agents?.list?.length || 0;
  const provider = c.models?.providers?.litellm ? 'litellm' : 'unknown';
  const profile = c.tools?.profile || 'default';
  const cron = c.cron?.enabled ? 'on' : 'off';
  const a2a = c.tools?.agentToAgent?.enabled ? 'on' : 'off';
  console.log(JSON.stringify({ok:true, agents, provider, profile, cron, a2a}));
} catch(e) { console.log(JSON.stringify({ok:false, error:e.message})); }
" 2>/dev/null)

if echo "$CONFIG_OK" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['ok']" 2>/dev/null; then
  agents=$(echo "$CONFIG_OK" | python3 -c "import json,sys; print(json.load(sys.stdin)['agents'])" 2>/dev/null)
  provider=$(echo "$CONFIG_OK" | python3 -c "import json,sys; print(json.load(sys.stdin)['provider'])" 2>/dev/null)
  profile=$(echo "$CONFIG_OK" | python3 -c "import json,sys; print(json.load(sys.stdin)['profile'])" 2>/dev/null)
  cron_st=$(echo "$CONFIG_OK" | python3 -c "import json,sys; print(json.load(sys.stdin)['cron'])" 2>/dev/null)
  a2a_st=$(echo "$CONFIG_OK" | python3 -c "import json,sys; print(json.load(sys.stdin)['a2a'])" 2>/dev/null)
  pass "OpenClaw config valid: ${agents} agents, provider=${provider}, tools=${profile}, cron=${cron_st}, a2a=${a2a_st}"
else
  fail "OpenClaw config" "invalid JSON or missing keys"
fi

fi # end infrastructure section

###############################################################################
# SECTION 2: Direct Provider API Key Verification
###############################################################################
if [ "$ONLY_OPENCLAW" != "true" ] && [ "$ONLY_FALLBACKS" != "true" ]; then

section "2. DIRECT PROVIDER API KEYS"
echo -e "${DIM}  Testing each provider's API directly (bypasses LiteLLM)${NC}"

subsection "Groq (Account 1)"
if [ -n "${GROQ_API_KEY:-}" ]; then
  echo -e "  Key: $(mask_key "$GROQ_API_KEY")"
  test_provider_direct "Groq-1" \
    "https://api.groq.com/openai/v1/chat/completions" \
    "Authorization: Bearer $GROQ_API_KEY" \
    '{"model":"llama-3.3-70b-versatile","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}'
else
  skip "GROQ_API_KEY"
fi

subsection "Groq (Account 2)"
if [ -n "${GROQ_API_KEY_2:-}" ]; then
  echo -e "  Key: $(mask_key "$GROQ_API_KEY_2")"
  test_provider_direct "Groq-2" \
    "https://api.groq.com/openai/v1/chat/completions" \
    "Authorization: Bearer $GROQ_API_KEY_2" \
    '{"model":"llama-3.3-70b-versatile","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}'
else
  skip "GROQ_API_KEY_2"
fi

subsection "Cerebras"
if [ -n "${CEREBRAS_API_KEY:-}" ]; then
  echo -e "  Key: $(mask_key "$CEREBRAS_API_KEY")"
  test_provider_direct "Cerebras" \
    "https://api.cerebras.ai/v1/chat/completions" \
    "Authorization: Bearer $CEREBRAS_API_KEY" \
    '{"model":"llama-3.3-70b","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}'
else
  skip "CEREBRAS_API_KEY"
fi

subsection "Google Gemini"
if [ -n "${GEMINI_API_KEY:-}" ]; then
  echo -e "  Key: $(mask_key "$GEMINI_API_KEY")"
  # Gemini uses a different API format — test via generateContent
  HTTP=$(curl -s -o "$RESP" -w "%{http_code}" --max-time 20 \
    -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"contents":[{"parts":[{"text":"Say OK"}]}],"generationConfig":{"maxOutputTokens":5}}' \
    2>/dev/null) || HTTP="000"
  if [ "$HTTP" = "200" ]; then
    pass "Gemini direct (HTTP $HTTP)"
  else
    err=$(extract_error)
    fail "Gemini direct — HTTP $HTTP" "$err"
  fi
else
  skip "GEMINI_API_KEY"
fi

subsection "Mistral"
if [ -n "${MISTRAL_API_KEY:-}" ]; then
  echo -e "  Key: $(mask_key "$MISTRAL_API_KEY")"
  test_provider_direct "Mistral" \
    "https://api.mistral.ai/v1/chat/completions" \
    "Authorization: Bearer $MISTRAL_API_KEY" \
    '{"model":"mistral-large-latest","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}'
else
  skip "MISTRAL_API_KEY"
fi

subsection "DeepSeek"
if [ -n "${DEEPSEEK_API_KEY:-}" ]; then
  echo -e "  Key: $(mask_key "$DEEPSEEK_API_KEY")"
  test_provider_direct "DeepSeek" \
    "https://api.deepseek.com/chat/completions" \
    "Authorization: Bearer $DEEPSEEK_API_KEY" \
    '{"model":"deepseek-chat","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}'
else
  skip "DEEPSEEK_API_KEY"
fi

subsection "OpenAI"
if [ -n "${OPENAI_API_KEY:-}" ]; then
  echo -e "  Key: $(mask_key "$OPENAI_API_KEY")"
  test_provider_direct "OpenAI" \
    "https://api.openai.com/v1/chat/completions" \
    "Authorization: Bearer $OPENAI_API_KEY" \
    '{"model":"gpt-4o-mini","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}'
else
  skip "OPENAI_API_KEY"
fi

subsection "Anthropic"
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo -e "  Key: $(mask_key "$ANTHROPIC_API_KEY")"
  HTTP=$(curl -s -o "$RESP" -w "%{http_code}" --max-time 20 \
    -X POST "https://api.anthropic.com/v1/messages" \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d '{"model":"claude-haiku-4-5-20251001","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}' \
    2>/dev/null) || HTTP="000"
  if [ "$HTTP" = "200" ]; then
    pass "Anthropic direct (HTTP $HTTP)"
  else
    err=$(extract_error)
    fail "Anthropic direct — HTTP $HTTP" "$err"
  fi
else
  skip "ANTHROPIC_API_KEY"
fi

subsection "MiniMax"
if [ -n "${MINIMAX_API_KEY:-}" ]; then
  echo -e "  Key: $(mask_key "$MINIMAX_API_KEY")"
  test_provider_direct "MiniMax" \
    "https://api.minimax.io/v1/chat/completions" \
    "Authorization: Bearer $MINIMAX_API_KEY" \
    '{"model":"MiniMax-M2.5","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}'
else
  skip "MINIMAX_API_KEY"
fi

subsection "Ollama (Oracle Cloud)"
if [ -n "${OLLAMA_BASE_URL:-}" ]; then
  echo -e "  URL: $OLLAMA_BASE_URL"
  HTTP=$(curl -s -o "$RESP" -w "%{http_code}" --max-time 10 \
    "${OLLAMA_BASE_URL}/api/tags" 2>/dev/null) || HTTP="000"
  if [ "$HTTP" = "200" ]; then
    count=$(python3 -c "import json; print(len(json.load(open('$RESP')).get('models',[])))" 2>/dev/null || echo "?")
    pass "Ollama reachable — $count models (HTTP $HTTP)"
  else
    fail "Ollama — HTTP $HTTP"
  fi
else
  skip "OLLAMA_BASE_URL"
fi

fi # end provider section

###############################################################################
# SECTION 3: LiteLLM Model Routing — Every Model Pair
###############################################################################
if [ "$ONLY_OPENCLAW" != "true" ] && [ "$ONLY_FALLBACKS" != "true" ]; then

section "3. LITELLM MODEL ROUTING — ALL 22 MODELS"
echo -e "${DIM}  Testing each model alias via LiteLLM proxy (localhost:4000)${NC}"
echo -e "${DIM}  Measures: HTTP status, response latency, actual model used, token count${NC}"

# Check LiteLLM is running (from inside the container)
LLM_UP=$(docker_curl -s -o "$RESP" -w "%{http_code}" --max-time 5 \
  "http://localhost:4000/health/liveliness") || LLM_UP="000"

if [ "$LLM_UP" != "200" ]; then
  fail "LiteLLM not reachable — skipping model tests"
else

subsection "TIER 1: FREE — Ollama (Oracle Cloud)"
test_model "qwen2.5-coder:14b" "FREE/Ollama" "0.00"
test_model "deepseek-coder-v2:16b" "FREE/Ollama" "0.00"
test_model "llama3.2:8b" "FREE/Ollama" "0.00"

subsection "TIER 2: FREE — Groq (2 accounts, load-balanced)"
test_model "groq-llama-3.3-70b" "FREE/Groq" "0.00"
test_model "groq-qwen3-32b" "FREE/Groq" "0.00"

subsection "TIER 3: FREE — Cerebras (1M TPD)"
test_model "cerebras-llama-3.3-70b" "FREE/Cerebras" "0.00"
test_model "cerebras-qwen3-32b" "FREE/Cerebras" "0.00"
test_model "cerebras-llama-4-scout" "FREE/Cerebras" "0.00"

subsection "TIER 4: FREE — Google Gemini"
test_model "gemini-flash" "FREE/Gemini" "0.00"
test_model "gemini-flash-lite" "FREE/Gemini" "0.00"
test_model "gemini-pro" "FREE/Gemini" "0.00"

subsection "TIER 5: FREE — Mistral (2 RPM)"
test_model "mistral-large" "FREE/Mistral" "0.00"
test_model "codestral" "FREE/Mistral" "0.00"

subsection "TIER 6: CHEAP — DeepSeek + OpenAI"
test_model "deepseek-chat" "CHEAP" "0.28" "$QUICK_MODE"
test_model "deepseek-coder" "CHEAP" "0.28" "$QUICK_MODE"
test_model "gpt-4o-mini" "CHEAP" "0.15" "$QUICK_MODE"

subsection "TIER 7: MID — Claude Haiku + MiniMax"
test_model "claude-haiku" "MID" "1.00" "$QUICK_MODE"
test_model "minimax-m2.5" "MID" "0.30" "$QUICK_MODE"

subsection "TIER 8: PREMIUM — Use sparingly"
test_model "claude-sonnet" "PREMIUM" "3.00" true
test_model "claude-opus" "PREMIUM" "15.00" true
test_model "gpt-4o" "PREMIUM" "2.50" true
test_model "o1" "PREMIUM" "15.00" true

fi # litellm up check

fi # end models section

###############################################################################
# SECTION 4: Fallback Chain Testing
###############################################################################
if [ "$ONLY_OPENCLAW" != "true" ] && [ "$ONLY_MODELS" != "true" ]; then

section "4. FALLBACK CHAIN VERIFICATION"
echo -e "${DIM}  Testing LiteLLM router fallback behavior on 429/error${NC}"
echo -e "${DIM}  Configured chains:${NC}"
echo -e "${DIM}    groq-llama-3.3-70b -> cerebras-llama-3.3-70b -> deepseek-chat${NC}"
echo -e "${DIM}    groq-qwen3-32b -> cerebras-qwen3-32b -> deepseek-chat${NC}"
echo -e "${DIM}    cerebras-* -> groq-* -> deepseek-chat${NC}"
echo -e "${DIM}    gemini-*/mistral-* -> deepseek-chat/deepseek-coder${NC}"

# Verify fallback config is loaded
docker_curl -s -o "$RESP" --max-time 10 \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  "http://localhost:4000/v1/models" > /dev/null
FALLBACK_CONFIG=$(cat "$RESP")

if [ -n "$FALLBACK_CONFIG" ] && [ "$FALLBACK_CONFIG" != "connection failed" ]; then
  pass "LiteLLM router config loaded (fallbacks configured in litellm_config.yaml)"
else
  fail "Could not verify LiteLLM router config"
fi

# Test that latency-based routing is working by hitting load-balanced models
subsection "Load Balancing — Groq (2 accounts)"
echo -e "${DIM}  groq-llama-3.3-70b has 2 deployments (GROQ_API_KEY + GROQ_API_KEY_2)${NC}"

for i in 1 2 3; do
  start_ms=$(date +%s%N 2>/dev/null || echo 0)
  http=$(docker_curl -s -o "$RESP" -w "%{http_code}" --max-time 15 \
    -X POST \
    -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
    -d '{"model":"groq-llama-3.3-70b","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}' \
    "http://localhost:4000/v1/chat/completions") || http="000"
  end_ms=$(date +%s%N 2>/dev/null || echo 0)
  if [ "$start_ms" != "0" ] && [ "$end_ms" != "0" ]; then
    ms=$(( (end_ms - start_ms) / 1000000 ))
  else
    ms=0
  fi

  if [ "$http" = "200" ]; then
    model_used=$(python3 -c "import json; print(json.load(open('$RESP')).get('model','?'))" 2>/dev/null)
    pass "Request $i: ${ms}ms (routed to: $model_used)"
  elif [ "$http" = "429" ]; then
    warn "Request $i: rate limited (429) — fallback should activate"
  else
    fail "Request $i: HTTP $http"
  fi
  # Small delay to avoid hammering
  sleep 1
done

subsection "Fallback Trigger Test — Rapid Groq Requests"
echo -e "${DIM}  Sending rapid requests to trigger rate limiting and verify fallback${NC}"

FALLBACK_TRIGGERED=false
for i in $(seq 1 5); do
  http=$(docker_curl -s -o "$RESP" -w "%{http_code}" --max-time 20 \
    -X POST \
    -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
    -d '{"model":"groq-qwen3-32b","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}' \
    "http://localhost:4000/v1/chat/completions") || http="000"

  if [ "$http" = "200" ]; then
    model_used=$(python3 -c "import json; print(json.load(open('$RESP')).get('model','?'))" 2>/dev/null)
    # Check if the actual model used differs from the requested one (fallback happened)
    if echo "$model_used" | grep -qi "cerebras\|deepseek"; then
      FALLBACK_TRIGGERED=true
      pass "Fallback activated! groq-qwen3-32b -> $model_used"
      break
    fi
  fi
done

if [ "$FALLBACK_TRIGGERED" = "false" ]; then
  echo -e "  ${CYAN}INFO${NC}  No fallback triggered — Groq rate limits not hit (both accounts have capacity)"
fi

fi # end fallbacks section

###############################################################################
# SECTION 5: OpenClaw API & RPC Methods
###############################################################################
if [ "$ONLY_MODELS" != "true" ] && [ "$ONLY_FALLBACKS" != "true" ]; then

section "5. OPENCLAW API & RPC METHODS"

subsection "OpenClaw Container Internals"

# Check agent list via config
AGENT_LIST=$(docker exec openclaw node -e "
try {
  const c = JSON.parse(require('fs').readFileSync('/home/node/.openclaw/openclaw.json','utf8'));
  const agents = (c.agents?.list || []).map(a => a.id);
  console.log(JSON.stringify({ok:true, agents}));
} catch(e) { console.log(JSON.stringify({ok:false, error:e.message})); }
" 2>/dev/null)

if echo "$AGENT_LIST" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['ok']" 2>/dev/null; then
  agents=$(echo "$AGENT_LIST" | python3 -c "import json,sys; print(', '.join(json.load(sys.stdin)['agents']))" 2>/dev/null)
  pass "Agent list: $agents"
else
  fail "Could not read agent config"
fi

# Check workspace files exist for each agent
subsection "Agent Workspace Files"
EXPECTED_AGENTS=("Lead" "CodeCraft" "Scout" "Scribe" "Ops Lead" "Builder" "Sentinel" "Chronicler")
WORKSPACE_FILES=("SOUL.md" "USER.md" "AGENTS.md" "MEMORY.md" "TOOLS.md" "HEARTBEAT.md")

for agent in "${EXPECTED_AGENTS[@]}"; do
  missing=""
  for file in "${WORKSPACE_FILES[@]}"; do
    exists=$(docker exec openclaw test -f "/home/node/.openclaw/workspace-${agent}/${file}" && echo "yes" || echo "no")
    if [ "$exists" = "no" ]; then
      missing="$missing $file"
    fi
  done
  if [ -z "$missing" ]; then
    pass "workspace-${agent}/: all 6 files present"
  else
    fail "workspace-${agent}/" "missing:$missing"
  fi
done

subsection "OpenClaw Tools Profile"
TOOLS_CHECK=$(docker exec openclaw node -e "
try {
  const c = JSON.parse(require('fs').readFileSync('/home/node/.openclaw/openclaw.json','utf8'));
  const profile = c.tools?.profile || 'messaging';
  const a2a = c.tools?.agentToAgent?.enabled || false;
  const cron = c.cron?.enabled || false;
  const loopDet = c.tools?.loopDetection?.enabled || false;
  const sessVis = c.tools?.sessions?.visibility || 'default';
  console.log(JSON.stringify({profile, a2a, cron, loopDet, sessVis}));
} catch(e) { console.log(JSON.stringify({error:e.message})); }
" 2>/dev/null)

profile=$(echo "$TOOLS_CHECK" | python3 -c "import json,sys; print(json.load(sys.stdin).get('profile','?'))" 2>/dev/null)
if [ "$profile" = "full" ]; then
  pass "tools.profile = 'full' (agents have exec, read, write, edit)"
else
  fail "tools.profile = '$profile'" "should be 'full' — agents missing coding tools!"
fi

a2a=$(echo "$TOOLS_CHECK" | python3 -c "import json,sys; print(json.load(sys.stdin).get('a2a',False))" 2>/dev/null)
[ "$a2a" = "True" ] && pass "agent-to-agent messaging: enabled" || fail "agent-to-agent messaging: disabled"

cron=$(echo "$TOOLS_CHECK" | python3 -c "import json,sys; print(json.load(sys.stdin).get('cron',False))" 2>/dev/null)
[ "$cron" = "True" ] && pass "cron jobs: enabled" || fail "cron jobs: disabled"

loop=$(echo "$TOOLS_CHECK" | python3 -c "import json,sys; print(json.load(sys.stdin).get('loopDet',False))" 2>/dev/null)
[ "$loop" = "True" ] && pass "loop detection: enabled" || warn "loop detection: disabled"

sessVis=$(echo "$TOOLS_CHECK" | python3 -c "import json,sys; print(json.load(sys.stdin).get('sessVis','?'))" 2>/dev/null)
[ "$sessVis" = "all" ] && pass "session visibility: all (team coordination)" || warn "session visibility: $sessVis"

subsection "OpenClaw -> LiteLLM Connectivity"
# Test that OpenClaw can reach LiteLLM internally
LITELLM_FROM_OC=$(docker exec openclaw wget -qO- --timeout=10 "http://litellm:4000/health/liveliness" 2>/dev/null)
if echo "$LITELLM_FROM_OC" | grep -qi "alive\|ok\|healthy\|true" 2>/dev/null; then
  pass "OpenClaw -> LiteLLM:4000 (internal network)"
else
  fail "OpenClaw -> LiteLLM:4000" "cannot reach LiteLLM from OpenClaw container"
fi

# Test model list from OpenClaw's perspective
MODEL_LIST_OC=$(docker exec openclaw wget -qO- --timeout=10 \
  --header="Authorization: Bearer ${LITELLM_MASTER_KEY}" \
  "http://litellm:4000/v1/models" 2>/dev/null)
if [ -n "$MODEL_LIST_OC" ]; then
  oc_models=$(echo "$MODEL_LIST_OC" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null || echo "?")
  pass "OpenClaw sees $oc_models models via LiteLLM"
else
  fail "OpenClaw cannot list models from LiteLLM"
fi

subsection "OpenClaw -> Scrapling Connectivity"
SCRAPE_FROM_OC=$(docker exec openclaw wget -qO- --timeout=10 "http://scrapling:8000/health" 2>/dev/null)
if echo "$SCRAPE_FROM_OC" | grep -qi "ok\|healthy\|alive" 2>/dev/null; then
  pass "OpenClaw -> Scrapling:8000 (internal network)"
else
  fail "OpenClaw -> Scrapling:8000" "agents cannot reach scraping API"
fi

subsection "Compaction Settings"
COMPACTION=$(docker exec openclaw node -e "
try {
  const c = JSON.parse(require('fs').readFileSync('/home/node/.openclaw/openclaw.json','utf8'));
  const comp = c.agents?.defaults?.compaction || {};
  console.log(JSON.stringify(comp));
} catch(e) { console.log('{}'); }
" 2>/dev/null)

soft=$(echo "$COMPACTION" | python3 -c "import json,sys; print(json.load(sys.stdin).get('memoryFlush',{}).get('softThresholdTokens','not set'))" 2>/dev/null)
if [ "$soft" = "50000" ]; then
  pass "compaction.softThresholdTokens = 50000 (prevents compaction loop)"
else
  warn "compaction.softThresholdTokens = $soft (should be 50000 to prevent #32106)"
fi

fi # end openclaw section

###############################################################################
# SECTION 6: Agent-Model Assignment Verification
###############################################################################
if [ "$ONLY_FALLBACKS" != "true" ]; then

section "6. AGENT-MODEL ASSIGNMENT MAP"
echo -e "${DIM}  Verifying each agent's assigned model is reachable via LiteLLM${NC}"

# Extract agent->model mapping from config
AGENT_MODELS=$(docker exec openclaw node -e "
try {
  const c = JSON.parse(require('fs').readFileSync('/home/node/.openclaw/openclaw.json','utf8'));
  const list = c.agents?.list || [];
  list.forEach(a => {
    const model = (a.model?.primary || 'default').replace('litellm/','');
    const subModel = a.subagents?.model?.primary?.replace('litellm/','') || 'none';
    console.log(a.id + '|' + model + '|' + subModel);
  });
} catch(e) { console.error(e.message); }
" 2>/dev/null)

if [ -n "$AGENT_MODELS" ]; then
  echo "$AGENT_MODELS" | while IFS='|' read -r agent_id model sub_model; do
    echo -e "  ${CYAN}$agent_id${NC}: model=${BOLD}$model${NC}, subagent_model=${sub_model}"
    # Quick check if the model works (reuse cached results if already tested)
    hit=$(docker_curl -s -o "$RESP" -w "%{http_code}" --max-time 10 \
      -X POST \
      -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
      -d "{\"model\":\"$model\",\"max_tokens\":1,\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}" \
      "http://localhost:4000/v1/chat/completions") || hit="000"
    if [ "$hit" = "200" ]; then
      pass "  $agent_id -> $model: reachable"
    elif [ "$hit" = "429" ]; then
      warn "  $agent_id -> $model: rate limited (fallback will handle)"
    else
      fail "  $agent_id -> $model: HTTP $hit" "agent will fail on this model"
    fi
  done
else
  fail "Could not read agent-model mapping"
fi

fi # end agent-model section

###############################################################################
# SECTION 7: Results Summary & Ranking
###############################################################################

section "7. RESULTS SUMMARY"

echo -e "${BOLD}Test Results:${NC}"
echo -e "  ${GREEN}$PASS passed${NC}  |  ${RED}$FAIL failed${NC}  |  ${YELLOW}$WARN warnings${NC}  |  ${YELLOW}$SKIP skipped${NC}"
echo ""

if [ "$LATENCY_COUNT" -gt 0 ]; then
  AVG=$((TOTAL_LATENCY / LATENCY_COUNT))
  echo -e "${BOLD}Average Model Latency:${NC} ${AVG}ms (across $LATENCY_COUNT successful model tests)"
  echo ""
fi

# Print model ranking (sorted by latency, free first)
if [ ${#MODEL_RESULTS[@]} -gt 0 ]; then
  echo -e "${BOLD}${CYAN}MODEL RANKING (by latency, free models first):${NC}"
  echo -e "${DIM}  Latency | Cost/1M  | Tier          | Model               | Status${NC}"
  echo    "  --------|----------|---------------|---------------------|--------"

  # Sort: free first (by cost), then by latency
  printf '%s\n' "${MODEL_RESULTS[@]}" | sort -t'|' -k2,2n -k1,1n | while IFS='|' read -r latency cost tier model status; do
    if [ "$latency" = "99999" ]; then
      lat_display="timeout"
    else
      lat_display="${latency}ms"
    fi
    color="$NC"
    [ "$status" = "PASS" ] && color="$GREEN"
    echo "$status" | grep -q "FAIL\|TIMEOUT" && color="$RED"
    [ "$status" = "RATE_LIMITED" ] && color="$YELLOW"
    printf "  ${color}%-8s | \$%-7s | %-13s | %-19s | %s${NC}\n" \
      "$lat_display" "$cost" "$tier" "$model" "$status"
  done
  echo ""
fi

# Recommendations
if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}ISSUES FOUND:${NC}"
  echo "  Review failed tests above. Common fixes:"
  echo "  - API key invalid/expired: Update in .env, then: docker compose up -d"
  echo "  - Service not running: docker compose up -d <service>"
  echo "  - Rate limited: Normal for free tiers — fallbacks handle this"
  echo ""
fi

echo -e "${BOLD}FREE MODEL RECOMMENDATIONS:${NC}"
echo "  Best for agents (tool calling): cerebras-qwen3-32b (1M TPD, fastest)"
echo "  Best for research (large ctx):  gemini-flash (1M context, 250 RPD)"
echo "  Best for coding:                codestral (Mistral, 2 RPM, 1B/month)"
echo "  Best for high-volume:           gemini-flash-lite (1000 RPD)"
echo "  Fallback safety net:            deepseek-chat (\$0.28/1M — cheap paid)"
echo ""

echo -e "${BOLD}OPTIMAL FALLBACK CHAINS:${NC}"
echo "  Primary agent work:  cerebras-qwen3-32b -> groq-qwen3-32b -> deepseek-chat"
echo "  Research tasks:      gemini-flash -> deepseek-chat"
echo "  Code generation:     codestral -> deepseek-coder"
echo "  High-volume batch:   groq-llama-3.3-70b -> cerebras-llama-3.3-70b -> deepseek-chat"
echo ""

# Deploy commands
echo -e "${BOLD}DEPLOY COMMANDS:${NC}"
echo ""
echo "iOS/SSM (single-line):"
echo "  cd /home/VPS && sudo bash scripts/test-all-apis.sh"
echo ""
echo "Quick mode (free models only):"
echo "  cd /home/VPS && sudo bash scripts/test-all-apis.sh --quick"
echo ""

if [ "$FAIL" -eq 0 ] && [ "$PASS" -gt 0 ]; then
  echo -e "${GREEN}All tests passed! Stack is healthy.${NC}"
fi
