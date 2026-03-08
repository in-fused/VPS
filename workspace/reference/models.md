# Models & Routing Reference
> Auto-generated. Source: litellm_config.yaml
> Read this when you need to understand model tiers, rate limits,
> fallback chains, or provider configuration.

```yaml
###############################################################################
# LiteLLM Proxy Configuration — Cost-Tiered Model Routing
###############################################################################
# Models organized by cost tier. Updated 2026-03-03.
#
# Tier 1 (FREE):  Local Ollama models — daily coding & chat
# Tier 2 (FREE):  Groq — fast cloud inference, 500K-100K TPD (free tier)
# Tier 3 (FREE):  Cerebras — 1M tokens/day, fastest inference
# Tier 4 (FREE):  Gemini — Flash-Lite 1000 RPD, Flash 250 RPD
# Tier 5 (FREE):  Mistral — all models, 2 RPM, 1B tokens/month
# Tier 6 (CHEAP): DeepSeek, GPT-4o-mini — $0.14-0.60/1M tokens
# Tier 7 (MID):   Claude Haiku, MiniMax M2.5 — $0.80-1.20/1M
# Tier 8 (PREM):  Claude Sonnet, GPT-4o — use sparingly
###############################################################################

model_list:

  # ===========================================================================
  # TIER 1: FREE — Local Ollama Models (via Oracle Cloud)
  # ===========================================================================
  # These cost $0. Use for daily coding, chat, and routine tasks.
  # Requires OLLAMA_BASE_URL to be set in .env

  - model_name: "qwen3.5:9b"
    litellm_params:
      model: "ollama/qwen3.5:9b"
      api_base: "os.environ/OLLAMA_BASE_URL"
      stream: true
    model_info:
      description: "FREE — Qwen 3.5 9B. Beats GPT-OSS-120B. Best small model for agents + tool calling."

  - model_name: "qwen3:14b"
    litellm_params:
      model: "ollama/qwen3:14b"
      api_base: "os.environ/OLLAMA_BASE_URL"
      stream: true
    model_info:
      description: "FREE — Qwen3 14B dense. Strong reasoning, reliable on ARM CPU."

  - model_name: "qwen3-coder:30b"
    litellm_params:
      model: "ollama/qwen3-coder:30b-a3b"
      api_base: "os.environ/OLLAMA_BASE_URL"
      stream: true
    model_info:
      description: "FREE — Qwen3 Coder 30B MoE (3.3B active). Best open-source coding model."

  # ===========================================================================
  # TIER 2: FREE — Groq API (free tier, load-balanced across 4 accounts)
  # ===========================================================================
  # Fast cloud inference at no cost. llama-3.3-70b: 1K RPD, 100K TPD.
  # qwen3-32b: 1K RPD, 500K TPD. Load-balanced across 4 Groq accounts.

  - model_name: "groq-llama-3.3-70b"
    litellm_params:
      model: "groq/llama-3.3-70b-versatile"
      api_key: "os.environ/GROQ_API_KEY"
      stream: true
    model_info:
      description: "FREE — 70B model on Groq. Very fast. 1K RPD, 100K TPD."

  - model_name: "groq-llama-3.3-70b"
    litellm_params:
      model: "groq/llama-3.3-70b-versatile"
      api_key: "os.environ/GROQ_API_KEY_2"
      stream: true
    model_info:
      description: "FREE — 70B model on Groq (account 2)."

  - model_name: "groq-llama-3.3-70b"
    litellm_params:
      model: "groq/llama-3.3-70b-versatile"
      api_key: "os.environ/GROQ_API_KEY_3"
      stream: true
    model_info:
      description: "FREE — 70B model on Groq (account 3)."

  - model_name: "groq-llama-3.3-70b"
    litellm_params:
      model: "groq/llama-3.3-70b-versatile"
      api_key: "os.environ/GROQ_API_KEY_4"
      stream: true
    model_info:
      description: "FREE — 70B model on Groq (account 4)."

  - model_name: "groq-qwen3-32b"
    litellm_params:
      model: "groq/qwen/qwen3-32b"
      api_key: "os.environ/GROQ_API_KEY"
      stream: true
    model_info:
      description: "FREE — Qwen 3 32B. Dual-mode reasoning + tool use. 131K context."

  - model_name: "groq-qwen3-32b"
    litellm_params:
      model: "groq/qwen/qwen3-32b"
      api_key: "os.environ/GROQ_API_KEY_2"
      stream: true
    model_info:
      description: "FREE — Qwen 3 32B on Groq (account 2)."

  - model_name: "groq-qwen3-32b"
    litellm_params:
      model: "groq/qwen/qwen3-32b"
      api_key: "os.environ/GROQ_API_KEY_3"
      stream: true
    model_info:
      description: "FREE — Qwen 3 32B on Groq (account 3)."

  - model_name: "groq-qwen3-32b"
    litellm_params:
      model: "groq/qwen/qwen3-32b"
      api_key: "os.environ/GROQ_API_KEY_4"
      stream: true
    model_info:
      description: "FREE — Qwen 3 32B on Groq (account 4)."

  # ===========================================================================
  # TIER 3: FREE — Cerebras (1M tokens/day, fastest inference)
  # ===========================================================================
  # 2.4x faster than Groq. 1M TPD free. No credit card required.

  - model_name: "cerebras-llama-3.3-70b"
    litellm_params:
      model: "cerebras/llama-3.3-70b"
      api_key: "os.environ/CEREBRAS_API_KEY"
      stream: true
    model_info:
      description: "FREE — Llama 3.3 70B on Cerebras. 1M TPD. Fastest inference."

  # cerebras-qwen3-32b REMOVED — Cerebras dropped qwen3-32b (404 as of 2026-03-05).
  # Use groq-qwen3-32b instead (load-balanced across 4 accounts).

  - model_name: "cerebras-llama-4-scout"
    litellm_params:
      model: "cerebras/llama-4-scout-17b-16e-instruct"
      api_key: "os.environ/CEREBRAS_API_KEY"
      stream: true
    model_info:
      description: "FREE — Llama 4 Scout 17B on Cerebras. 1M TPD."

  - model_name: "cerebras-llama-3.1-8b"
    litellm_params:
      model: "cerebras/llama3.1-8b"
      api_key: "os.environ/CEREBRAS_API_KEY"
      stream: true
    model_info:
      description: "FREE — Llama 3.1 8B on Cerebras. 2267 t/s. Fastest model."

  - model_name: "cerebras-qwen3-235b"
    litellm_params:
      model: "cerebras/qwen-3-235b-a22b-instruct-2507"
      api_key: "os.environ/CEREBRAS_API_KEY"
      stream: true
    model_info:
      description: "FREE — Qwen 3 235B on Cerebras. Reduced free-tier limits."

  - model_name: "cerebras-zai-glm"
    litellm_params:
      model: "cerebras/zai-glm-4.7"
      api_key: "os.environ/CEREBRAS_API_KEY"
      stream: true
    model_info:
      description: "FREE — ZAI GLM-4.7 on Cerebras. Reasoning model. 128K context."

  - model_name: "cerebras-gpt-oss-120b"
    litellm_params:
      model: "cerebras/gpt-oss-120b"
      api_key: "os.environ/CEREBRAS_API_KEY"
      stream: true
    model_info:
      description: "FREE — GPT-OSS 120B on Cerebras. Reasoning model. 2096 t/s."

  # ===========================================================================
  # TIER 4: FREE — Google Gemini (load-balanced across 3 API keys)
  # ===========================================================================
  # 3 keys = 3x quota. Flash: 750 RPD, Flash-Lite: 3000 RPD, Pro: 300 RPD.

  - model_name: "gemini-flash"
    litellm_params:
      model: "gemini/gemini-2.5-flash"
      api_key: "os.environ/GEMINI_API_KEY"
      stream: true
    model_info:
      description: "FREE — Gemini 2.5 Flash. 10 RPM, 250 RPD. Fast + capable."

  - model_name: "gemini-flash"
    litellm_params:
      model: "gemini/gemini-2.5-flash"
      api_key: "os.environ/GEMINI_API_KEY_2"
      stream: true
    model_info:
      description: "FREE — Gemini 2.5 Flash (key 2)."

  - model_name: "gemini-flash"
    litellm_params:
      model: "gemini/gemini-2.5-flash"
      api_key: "os.environ/GEMINI_API_KEY_3"
      stream: true
    model_info:
      description: "FREE — Gemini 2.5 Flash (key 3)."

  - model_name: "gemini-flash-lite"
    litellm_params:
      model: "gemini/gemini-2.5-flash-lite"
      api_key: "os.environ/GEMINI_API_KEY"
      stream: true
    model_info:
      description: "FREE — Gemini 2.5 Flash-Lite. 15 RPM, 1000 RPD. High volume."

  - model_name: "gemini-flash-lite"
    litellm_params:
      model: "gemini/gemini-2.5-flash-lite"
      api_key: "os.environ/GEMINI_API_KEY_2"
      stream: true
    model_info:
      description: "FREE — Gemini 2.5 Flash-Lite (key 2)."

  - model_name: "gemini-flash-lite"
    litellm_params:
      model: "gemini/gemini-2.5-flash-lite"
      api_key: "os.environ/GEMINI_API_KEY_3"
      stream: true
    model_info:
      description: "FREE — Gemini 2.5 Flash-Lite (key 3)."

  - model_name: "gemini-pro"
    litellm_params:
      model: "gemini/gemini-2.5-pro"
      api_key: "os.environ/GEMINI_API_KEY"
      stream: true
    model_info:
      description: "FREE — Gemini 2.5 Pro. 5 RPM, 100 RPD. Best free reasoning."

  - model_name: "gemini-pro"
    litellm_params:
      model: "gemini/gemini-2.5-pro"
      api_key: "os.environ/GEMINI_API_KEY_2"
      stream: true
    model_info:
      description: "FREE — Gemini 2.5 Pro (key 2)."

  - model_name: "gemini-pro"
    litellm_params:
      model: "gemini/gemini-2.5-pro"
      api_key: "os.environ/GEMINI_API_KEY_3"
      stream: true
    model_info:
      description: "FREE — Gemini 2.5 Pro (key 3)."

  # ---------------------------------------------------------------------------
  # Gemini Embeddings (for OpenClaw memory_search — load-balanced across 3 keys)
  # ---------------------------------------------------------------------------
  # text-embedding-004: 768 dimensions, 2048 token input, FREE (1500 RPM).
  # OpenClaw routes embeddings here via memorySearch.remote.baseUrl config.

  - model_name: "gemini-embedding"
    litellm_params:
      model: "gemini/text-embedding-004"
      api_key: "os.environ/GEMINI_API_KEY"
    model_info:
      description: "FREE — Gemini text-embedding-004 (key 1). For agent memory search."

  - model_name: "gemini-embedding"
    litellm_params:
      model: "gemini/text-embedding-004"
      api_key: "os.environ/GEMINI_API_KEY_2"
    model_info:
      description: "FREE — Gemini text-embedding-004 (key 2)."

  - model_name: "gemini-embedding"
    litellm_params:
      model: "gemini/text-embedding-004"
      api_key: "os.environ/GEMINI_API_KEY_3"
    model_info:
      description: "FREE — Gemini text-embedding-004 (key 3)."

  # ===========================================================================
  # TIER 5: FREE — Mistral (all models, 2 RPM, 1B tokens/month)
  # ===========================================================================
  # Low RPM but massive monthly allowance. Great for overflow/coding.

  - model_name: "mistral-large"
    litellm_params:
      model: "mistral/mistral-large-latest"
      api_key: "os.environ/MISTRAL_API_KEY"
      stream: true
    model_info:
      description: "FREE — Mistral Large. 2 RPM. Strong reasoning. 1B tokens/mo."

  - model_name: "codestral"
    litellm_params:
      model: "mistral/codestral-latest"
      api_key: "os.environ/MISTRAL_API_KEY"
      stream: true
    model_info:
      description: "FREE — Codestral. 2 RPM. Best free code model. 1B tokens/mo."

  - model_name: "mistral-small"
    litellm_params:
      model: "mistral/mistral-small-latest"
      api_key: "os.environ/MISTRAL_API_KEY"
      stream: true
    model_info:
      description: "FREE — Mistral Small 3.1 24B. Fast + capable."

  - model_name: "mistral-nemo"
    litellm_params:
      model: "mistral/open-mistral-nemo"
      api_key: "os.environ/MISTRAL_API_KEY"
      stream: true
    model_info:
      description: "FREE — Mistral Nemo. Lightweight, good for simple tasks."

  # ===========================================================================
  # TIER 6: CHEAP — $0.14-0.60 per 1M tokens
  # ===========================================================================
  # Use when you need speed + quality beyond free tiers.

  - model_name: "deepseek-chat"
    litellm_params:
      model: "deepseek/deepseek-chat"
      api_key: "os.environ/DEEPSEEK_API_KEY"
      api_base: "https://api.deepseek.com"
      stream: true
    model_info:
      description: "CHEAP ($0.28/1M in) — DeepSeek V3.2. Excellent value."

  - model_name: "deepseek-coder"
    litellm_params:
      model: "deepseek/deepseek-coder"
      api_key: "os.environ/DEEPSEEK_API_KEY"
      api_base: "https://api.deepseek.com"
      stream: true
    model_info:
      description: "CHEAP ($0.28/1M in) — DeepSeek Coder. Great for code."

  - model_name: "gpt-4o-mini"
    litellm_params:
      model: "gpt-4o-mini"
      api_key: "os.environ/OPENAI_API_KEY"
      stream: true
    model_info:
      description: "CHEAP ($0.15/1M in) — Fast, capable. Good general use."

  # ===========================================================================
  # TIER 7: MID — $0.80-1.20 per 1M tokens
  # ===========================================================================

  - model_name: "claude-haiku"
    litellm_params:
      model: "anthropic/claude-haiku-4-5-20251001"
      api_key: "os.environ/ANTHROPIC_API_KEY"
      stream: true
    model_info:
      description: "MID ($1.00/1M in) — Claude Haiku. Fast + smart."

  # ===========================================================================
  # TIER 8: PREMIUM — $3-15 per 1M tokens (use sparingly!)
  # ===========================================================================
  # Reserve for complex reasoning, architecture decisions, hard debugging.

  - model_name: "claude-sonnet"
    litellm_params:
      model: "anthropic/claude-sonnet-4-6"
      api_key: "os.environ/ANTHROPIC_API_KEY"
      stream: true
    model_info:
      description: "PREMIUM ($3/1M in) — Claude Sonnet. Complex reasoning."

  - model_name: "claude-opus"
    litellm_params:
      model: "anthropic/claude-opus-4-6"
      api_key: "os.environ/ANTHROPIC_API_KEY"
      stream: true
    model_info:
      description: "PREMIUM ($15/1M in) — Claude Opus. Best quality. Use rarely."

  - model_name: "gpt-4o"
    litellm_params:
      model: "gpt-4o"
      api_key: "os.environ/OPENAI_API_KEY"
      stream: true
    model_info:
      description: "PREMIUM ($2.50/1M in) — GPT-4o. Strong all-around."

  - model_name: "o1"
    litellm_params:
      model: "o1"
      api_key: "os.environ/OPENAI_API_KEY"
      stream: true
    model_info:
      description: "PREMIUM ($15/1M in) — OpenAI o1. Deep reasoning."

  # ===========================================================================
  # MiniMax M2.5
  # ===========================================================================
  - model_name: "minimax-m2.5"
    litellm_params:
      model: "openai/MiniMax-M2.5"
      api_key: "os.environ/MINIMAX_API_KEY"
      api_base: "https://api.minimax.io/v1"
      stream: true
    model_info:
      description: "MID ($0.30/1M in) — MiniMax M2.5. Strong coder. 1M context."

# =============================================================================
# General Settings
# =============================================================================
general_settings:
  master_key: "os.environ/LITELLM_MASTER_KEY"
  # Allow connections from our domain only
  allowed_origins: ["https://in-fused.org"]

litellm_settings:
  # Drop unsupported params (e.g. 'store') instead of rejecting requests
  drop_params: true
  # Enable streaming for all models
  set_verbose: false
  # Cache disabled — prevents cross-user response leakage
  cache: false
  # Request timeout
  request_timeout: 120
  # Number of retries on failure
  num_retries: 2

router_settings:
  # When a free-tier model hits rate limits (429), fall back through the chain.
  # Each free provider has ~1M TPD. Chain ensures agents never get stuck.
  # Groq ↔ Cerebras (cross-fallback), then DeepSeek as paid safety net.
  fallbacks:
    # Free-first strategy: exhaust ALL free cloud providers → free Ollama → paid last resort.
    # Ollama models (qwen3.5:9b, qwen3:14b, qwen3-coder:30b) have ZERO rate limits.
    # Cloud free tiers
    - gemini-flash: ["gemini-flash-lite", "mistral-small", "groq-llama-3.3-70b", "qwen3.5:9b", "deepseek-chat"]
    - gemini-flash-lite: ["gemini-flash", "mistral-small", "groq-llama-3.3-70b", "qwen3.5:9b", "deepseek-chat"]
    - gemini-pro: ["gemini-flash", "groq-llama-3.3-70b", "cerebras-zai-glm", "qwen3:14b", "deepseek-chat"]
    - groq-llama-3.3-70b: ["gemini-flash", "cerebras-llama-3.3-70b", "groq-qwen3-32b", "qwen3.5:9b", "deepseek-chat"]
    - groq-qwen3-32b: ["gemini-flash", "groq-llama-3.3-70b", "mistral-small", "qwen3.5:9b", "deepseek-chat"]
    - cerebras-llama-3.3-70b: ["gemini-flash", "groq-llama-3.3-70b", "qwen3:14b", "deepseek-chat"]
    - cerebras-llama-4-scout: ["gemini-flash-lite", "groq-llama-3.3-70b", "cerebras-llama-3.3-70b", "qwen3.5:9b", "deepseek-chat"]
    - cerebras-qwen3-235b: ["gemini-pro", "groq-qwen3-32b", "cerebras-zai-glm", "qwen3:14b", "deepseek-chat"]
    - cerebras-zai-glm: ["gemini-pro", "cerebras-gpt-oss-120b", "groq-llama-3.3-70b", "qwen3:14b", "deepseek-chat"]
    - cerebras-gpt-oss-120b: ["gemini-flash", "groq-llama-3.3-70b", "cerebras-zai-glm", "qwen3:14b", "deepseek-chat"]
    - cerebras-llama-3.1-8b: ["gemini-flash-lite", "cerebras-llama-4-scout", "qwen3.5:9b", "deepseek-chat"]
    - mistral-large: ["mistral-small", "gemini-flash", "qwen3:14b", "deepseek-chat"]
    - mistral-small: ["mistral-large", "gemini-flash-lite", "qwen3.5:9b", "deepseek-chat"]
    - mistral-nemo: ["mistral-small", "gemini-flash-lite", "qwen3.5:9b", "deepseek-chat"]
    - codestral: ["mistral-small", "gemini-flash", "qwen3-coder:30b", "deepseek-coder"]
    # Ollama models fall back to each other, then cloud free, then paid
    - "qwen3.5:9b": ["qwen3:14b", "gemini-flash-lite", "groq-llama-3.3-70b", "deepseek-chat"]
    - "qwen3:14b": ["qwen3.5:9b", "gemini-flash", "cerebras-llama-3.3-70b", "deepseek-chat"]
    - "qwen3-coder:30b": ["qwen3:14b", "codestral", "gemini-flash", "deepseek-coder"]
  # Allow 1 retry per deployment, then cascade to fallback chain.
  # Previously num_retries=0 + RateLimitErrorRetries=0 prevented fallbacks from triggering.
  num_retries: 1
  retry_after: 1
  # After 2 failures, temporarily remove a deployment from the pool (60s cooldown)
  allowed_fails: 2
  cooldown_time: 60
  # Use lowest-latency model when multiple are available (load balancing)
  routing_strategy: "latency-based-routing"
  # Allow 429s to trigger fallback chain (Groq → Cerebras → DeepSeek)
  retry_policy:
    RateLimitErrorRetries: 2
    ContentPolicyViolationErrorRetries: 0
```
