#!/usr/bin/env bash
###############################################################################
# test-api-keys.sh — Validate All API Keys for the AI Hub
###############################################################################
# Tests each configured API key by making a minimal call to the provider.
# Also checks LiteLLM and Ollama connectivity if available.
#
# Usage:
#   bash scripts/test-api-keys.sh
#
# Run from the VPS repo directory (~/VPS).
# Keys are read from .env — never printed in full (first 8 chars only).
###############################################################################

set -uo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Counters
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

# Temp file for curl responses
RESP_FILE=$(mktemp /tmp/api-test-XXXXXX.json)
trap "rm -f $RESP_FILE" EXIT

###############################################################################
# Helper functions
###############################################################################

mask_key() {
    local key="$1"
    if [ ${#key} -le 8 ]; then
        echo "${key}..."
    else
        echo "${key:0:8}..."
    fi
}

test_pass() {
    echo -e "  ${GREEN}PASS${NC}  $1"
    PASS_COUNT=$((PASS_COUNT + 1))
}

test_fail() {
    echo -e "  ${RED}FAIL${NC}  $1"
    if [ -n "${2:-}" ]; then
        echo -e "        ${RED}→ $2${NC}"
    fi
    FAIL_COUNT=$((FAIL_COUNT + 1))
}

test_skip() {
    echo -e "  ${YELLOW}SKIP${NC}  $1 — ${2:-not configured}"
    SKIP_COUNT=$((SKIP_COUNT + 1))
}

extract_error() {
    # Try to extract an error message from JSON response
    if command -v python3 &>/dev/null; then
        python3 -c "
import json, sys
try:
    d = json.load(open('$RESP_FILE'))
    msg = d.get('error', {})
    if isinstance(msg, dict):
        print(msg.get('message', str(msg)))
    else:
        print(str(msg))
except:
    print('(could not parse error)')
" 2>/dev/null
    else
        head -c 200 "$RESP_FILE" 2>/dev/null
    fi
}

###############################################################################
# Load .env
###############################################################################
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

if [ ! -f "$REPO_DIR/.env" ]; then
    echo -e "${RED}ERROR: .env file not found at $REPO_DIR/.env${NC}"
    echo "  Run 'cp .env.example .env' and fill in your API keys first."
    exit 1
fi

set -a
source "$REPO_DIR/.env"
set +a

echo ""
echo "============================================================"
echo "  API Key Validation"
echo "============================================================"
echo ""

###############################################################################
# Test 1: Anthropic (Claude)
###############################################################################
echo -e "${BOLD}Anthropic${NC} (Claude Haiku/Sonnet/Opus)"
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    test_skip "ANTHROPIC_API_KEY" "not set in .env"
    echo -e "        Get one at: ${CYAN}https://console.anthropic.com/settings/keys${NC}"
else
    echo -e "  Key:  $(mask_key "$ANTHROPIC_API_KEY")"
    HTTP_CODE=$(curl -s -o "$RESP_FILE" -w "%{http_code}" --max-time 15 \
        -X POST "https://api.anthropic.com/v1/messages" \
        -H "x-api-key: $ANTHROPIC_API_KEY" \
        -H "anthropic-version: 2023-06-01" \
        -H "content-type: application/json" \
        -d '{"model":"claude-haiku-4-5-20251001","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}' \
        2>/dev/null) || HTTP_CODE="000"

    if [ "$HTTP_CODE" = "200" ]; then
        test_pass "Anthropic API key is valid (HTTP $HTTP_CODE)"
    elif [ "$HTTP_CODE" = "000" ]; then
        test_fail "Anthropic — connection failed (timeout or DNS error)"
    else
        ERR=$(extract_error)
        test_fail "Anthropic — HTTP $HTTP_CODE" "$ERR"
    fi
fi
echo ""

###############################################################################
# Test 2: OpenAI (GPT-4o-mini, GPT-4o, o1)
###############################################################################
echo -e "${BOLD}OpenAI${NC} (GPT-4o-mini/GPT-4o/o1)"
if [ -z "${OPENAI_API_KEY:-}" ]; then
    test_skip "OPENAI_API_KEY" "not set in .env"
    echo -e "        Get one at: ${CYAN}https://platform.openai.com/api-keys${NC}"
else
    echo -e "  Key:  $(mask_key "$OPENAI_API_KEY")"
    HTTP_CODE=$(curl -s -o "$RESP_FILE" -w "%{http_code}" --max-time 15 \
        -X POST "https://api.openai.com/v1/chat/completions" \
        -H "Authorization: Bearer $OPENAI_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"model":"gpt-4o-mini","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}' \
        2>/dev/null) || HTTP_CODE="000"

    if [ "$HTTP_CODE" = "200" ]; then
        test_pass "OpenAI API key is valid (HTTP $HTTP_CODE)"
    elif [ "$HTTP_CODE" = "000" ]; then
        test_fail "OpenAI — connection failed (timeout or DNS error)"
    else
        ERR=$(extract_error)
        test_fail "OpenAI — HTTP $HTTP_CODE" "$ERR"
    fi
fi
echo ""

###############################################################################
# Test 3: DeepSeek
###############################################################################
echo -e "${BOLD}DeepSeek${NC} (deepseek-chat/deepseek-coder)"
if [ -z "${DEEPSEEK_API_KEY:-}" ]; then
    test_skip "DEEPSEEK_API_KEY" "not set in .env"
    echo -e "        Get one at: ${CYAN}https://platform.deepseek.com/api_keys${NC}"
else
    echo -e "  Key:  $(mask_key "$DEEPSEEK_API_KEY")"
    HTTP_CODE=$(curl -s -o "$RESP_FILE" -w "%{http_code}" --max-time 15 \
        -X POST "https://api.deepseek.com/chat/completions" \
        -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"model":"deepseek-chat","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}' \
        2>/dev/null) || HTTP_CODE="000"

    if [ "$HTTP_CODE" = "200" ]; then
        test_pass "DeepSeek API key is valid (HTTP $HTTP_CODE)"
    elif [ "$HTTP_CODE" = "000" ]; then
        test_fail "DeepSeek — connection failed (timeout or DNS error)"
    else
        ERR=$(extract_error)
        test_fail "DeepSeek — HTTP $HTTP_CODE" "$ERR"
    fi
fi
echo ""

###############################################################################
# Test 4: Groq (FREE tier)
###############################################################################
echo -e "${BOLD}Groq${NC} (Llama 3.3 70B / Mixtral — FREE tier)"
if [ -z "${GROQ_API_KEY:-}" ]; then
    test_skip "GROQ_API_KEY" "not set in .env"
    echo -e "        Get one at: ${CYAN}https://console.groq.com/keys${NC} (FREE)"
else
    echo -e "  Key:  $(mask_key "$GROQ_API_KEY")"
    HTTP_CODE=$(curl -s -o "$RESP_FILE" -w "%{http_code}" --max-time 15 \
        -X POST "https://api.groq.com/openai/v1/chat/completions" \
        -H "Authorization: Bearer $GROQ_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"model":"llama-3.3-70b-versatile","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}' \
        2>/dev/null) || HTTP_CODE="000"

    if [ "$HTTP_CODE" = "200" ]; then
        test_pass "Groq API key is valid (HTTP $HTTP_CODE)"
    elif [ "$HTTP_CODE" = "000" ]; then
        test_fail "Groq — connection failed (timeout or DNS error)"
    else
        ERR=$(extract_error)
        test_fail "Groq — HTTP $HTTP_CODE" "$ERR"
    fi
fi
echo ""

###############################################################################
# Test 5: Ollama (remote server)
###############################################################################
echo -e "${BOLD}Ollama${NC} (remote/local — free models)"
if [ -z "${OLLAMA_BASE_URL:-}" ]; then
    test_skip "OLLAMA_BASE_URL" "not set in .env"
    echo -e "        Set up Oracle Cloud server — see scripts/setup-ollama-server.sh"
else
    echo -e "  URL:  $OLLAMA_BASE_URL"
    HTTP_CODE=$(curl -s -o "$RESP_FILE" -w "%{http_code}" --max-time 10 \
        "${OLLAMA_BASE_URL}/api/tags" \
        2>/dev/null) || HTTP_CODE="000"

    if [ "$HTTP_CODE" = "200" ]; then
        # Count models available
        MODEL_COUNT=$(python3 -c "
import json
try:
    d = json.load(open('$RESP_FILE'))
    print(len(d.get('models', [])))
except:
    print('?')
" 2>/dev/null || echo "?")
        test_pass "Ollama reachable — $MODEL_COUNT model(s) available (HTTP $HTTP_CODE)"
    elif [ "$HTTP_CODE" = "000" ]; then
        test_fail "Ollama — connection failed (server down, firewall, or wrong URL)"
    else
        test_fail "Ollama — HTTP $HTTP_CODE"
    fi
fi
echo ""

###############################################################################
# Test 6: LiteLLM (internal — requires stack running)
###############################################################################
echo -e "${BOLD}LiteLLM${NC} (internal API gateway)"
if [ -z "${LITELLM_MASTER_KEY:-}" ]; then
    test_skip "LITELLM_MASTER_KEY" "not set in .env (deploy.sh auto-generates this)"
else
    echo -e "  Key:  $(mask_key "$LITELLM_MASTER_KEY")"
    # Check if LiteLLM container is running
    if docker compose -f "$REPO_DIR/docker-compose.yml" ps litellm 2>/dev/null | grep -q "running"; then
        # Health check
        HTTP_CODE=$(curl -s -o "$RESP_FILE" -w "%{http_code}" --max-time 10 \
            "http://localhost:4000/health/liveliness" \
            2>/dev/null) || HTTP_CODE="000"

        if [ "$HTTP_CODE" = "200" ]; then
            # Also check model list
            MODEL_CODE=$(curl -s -o "$RESP_FILE" -w "%{http_code}" --max-time 10 \
                -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
                "http://localhost:4000/v1/models" \
                2>/dev/null) || MODEL_CODE="000"

            if [ "$MODEL_CODE" = "200" ]; then
                MODEL_COUNT=$(python3 -c "
import json
try:
    d = json.load(open('$RESP_FILE'))
    print(len(d.get('data', [])))
except:
    print('?')
" 2>/dev/null || echo "?")
                test_pass "LiteLLM healthy — $MODEL_COUNT model(s) registered (HTTP $HTTP_CODE)"
            else
                test_fail "LiteLLM health OK but model list failed (HTTP $MODEL_CODE)" \
                    "Master key may be wrong — check LITELLM_MASTER_KEY in .env"
            fi
        elif [ "$HTTP_CODE" = "000" ]; then
            test_fail "LiteLLM — connection refused (port 4000 not exposed to host?)"
        else
            test_fail "LiteLLM — HTTP $HTTP_CODE"
        fi
    else
        test_skip "LiteLLM" "container not running (start with: docker compose up -d)"
    fi
fi
echo ""

###############################################################################
# Test 7: OpenClaw password
###############################################################################
echo -e "${BOLD}OpenClaw${NC} (agent gateway password)"
if [ -z "${OPENCLAW_PASSWORD:-}" ]; then
    test_skip "OPENCLAW_PASSWORD" "not set (deploy.sh auto-generates this)"
else
    test_pass "OPENCLAW_PASSWORD is set ($(mask_key "$OPENCLAW_PASSWORD"))"
fi
echo ""

###############################################################################
# Summary
###############################################################################
echo "============================================================"
echo -e "  Results:  ${GREEN}$PASS_COUNT passed${NC}  ${RED}$FAIL_COUNT failed${NC}  ${YELLOW}$SKIP_COUNT skipped${NC}"
echo "============================================================"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo -e "${RED}Some keys failed validation.${NC} Check the errors above."
    echo "  Edit your keys:  nano $REPO_DIR/.env"
    echo "  Then re-run:     bash $0"
    echo ""
fi

if [ "$SKIP_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}Some providers are not configured.${NC} This is OK if you don't need them."
    echo "  At minimum you need ONE of: ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, or GROQ_API_KEY"
    echo ""
fi

if [ "$FAIL_COUNT" -eq 0 ] && [ "$PASS_COUNT" -gt 0 ]; then
    echo -e "${GREEN}All configured keys are valid!${NC}"
    echo ""
    echo "  Next steps:"
    echo "    1. Deploy:  bash scripts/deploy.sh"
    echo "    2. Test:    Open https://${DOMAIN:-YOUR_DOMAIN}/ in your browser"
    echo ""
fi
