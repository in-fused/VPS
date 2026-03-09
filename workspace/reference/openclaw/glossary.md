# OpenClaw Glossary
> Auto-generated. Do not edit manually.
> Last updated: 2026-03-09

---

## Terms & Concepts

| Term | Definition |
|------|-----------|
| **Agent** | An autonomous AI entity with its own identity, model, tools, and workspace |
| **Agent Turn** | A single processing cycle where an agent reads input, thinks, and produces output |
| **Bootstrap** | The startup sequence an agent runs on first activation (reads BOOTSTRAP.md) |
| **Compaction** | Memory management that summarizes old messages to stay within context limits |
| **Control UI** | OpenClaw's built-in web interface at the gateway endpoint |
| **Cron Job** | A server-side scheduled task that runs independently of browser sessions |
| **Delegation** | When one agent assigns work to another via `sessions_send` |
| **Delta** | A streaming token chunk during chat generation (`state: "delta"`) |
| **Device Auth** | Cryptographic device identity verification (disabled in our setup) |
| **Final** | The completion signal for a chat generation (`state: "final"`) |
| **Gateway** | The HTTP/WebSocket server that OpenClaw exposes for external access |
| **Hook** | An event-driven command that executes in response to OpenClaw lifecycle events |
| **Idempotency Key** | A unique string per chat request to prevent duplicate processing |
| **Inject** | Silently add context to a session without triggering an agent turn (`chat.inject`) |
| **Isolated Session** | A temporary session that doesn't pollute the main conversation history |
| **Main Session** | The primary conversation session for an agent (`agent:<id>:main`) |
| **Memory Flush** | Writing compacted summaries to the agent's memory files |
| **Memory Search** | Hybrid vector + BM25 search across agent memory files |
| **Operator** | The highest privilege role for WebSocket connections |
| **Payload** | The data object in a cron job that defines what action to take |
| **Profile** | A named set of tool permissions (`minimal`, `coding`, `messaging`, `full`) |
| **Reserve Tokens Floor** | Minimum tokens to keep free after compaction |
| **Run ID** | Unique identifier for a chat generation run (matches idempotency key) |
| **Sandbox** | File system isolation for agent workspace access |
| **Scopes** | Permission scopes for WebSocket connections (e.g., `operator.read`) |
| **Session Key** | Unique identifier for a chat session (format: `agent:<id>:<name>`) |
| **Soft Threshold Tokens** | Token count at which compaction starts being considered |
| **Sub-Agent** | A child agent spawned by a parent for parallel/specialized work |
| **System Event** | A cron payload type that injects into the main session |
| **Tool Group** | A named collection of related tools (e.g., `group:runtime`) |
| **Trusted Proxy** | A reverse proxy CIDR that OpenClaw trusts for IP forwarding |
| **Wake** | Activating an idle agent via the `/hooks/wake` endpoint or `wake` RPC |
| **Wire Format** | The API protocol format (`openai`, `anthropic`, `google`) |
| **Workspace** | The directory containing an agent's configuration and memory files |

---

## Abbreviations

| Abbreviation | Full Term |
|-------------|-----------|
| A2A | Agent-to-Agent (messaging) |
| ACK | Acknowledgment (task receipt confirmation) |
| BM25 | Best Matching 25 (text ranking algorithm) |
| CDP | Chrome DevTools Protocol |
| CIDR | Classless Inter-Domain Routing |
| CORS | Cross-Origin Resource Sharing |
| DM | Direct Message |
| NACK | Negative Acknowledgment |
| OTEL | OpenTelemetry |
| RPC | Remote Procedure Call |
| RPD | Requests Per Day |
| SSE | Server-Sent Events |
| TPD | Tokens Per Day |
| WS | WebSocket |

---

## Model IDs (Alias → Upstream)

LiteLLM exposes models with aliases. Agents use the alias, not the upstream ID.

| Alias (what agents use) | Upstream ID (LiteLLM config) |
|-------------------------|----------------------------|
| `cerebras-llama-3.3-70b` | `cerebras/llama-3.3-70b` |
| `cerebras-llama-4-scout` | `cerebras/llama-4-scout-17b-16e-instruct` |
| `cerebras-gpt-oss-120b` | `cerebras/gpt-oss-120b` |
| `cerebras-zai-glm` | `cerebras/zai-glm-32b-instruct` |
| `gemini-flash` | `gemini/gemini-2.5-flash` |
| `gemini-flash-lite` | `gemini/gemini-2.0-flash-lite` |
| `gemini-pro` | `gemini/gemini-2.5-pro` |
| `groq-llama-3.3-70b` | `groq/llama-3.3-70b-versatile` |
| `groq-qwen3-32b` | `groq/qwen-qwq-32b` |
| `codestral` | `mistral/codestral-latest` |
| `mistral-large` | `mistral/mistral-large-latest` |
| `mistral-small` | `mistral/mistral-small-latest` |
| `mistral-nemo` | `mistral/open-mistral-nemo` |
| `deepseek-chat` | `deepseek/deepseek-chat` |
| `deepseek-coder` | `deepseek/deepseek-coder` |

---

## Session Key Patterns

| Pattern | Example | Description |
|---------|---------|-------------|
| `agent:<id>:main` | `agent:lead:main` | Primary webchat session |
| `agent:<id>:<custom>` | `agent:lead:security-audit` | Named session |
| `agent:<id>:cron-<jobId>` | `agent:lead:cron-abc123` | Cron job session |

---

## Chat States

| State | Meaning | Action |
|-------|---------|--------|
| `delta` | Streaming token | Append to UI |
| `final` | Generation complete | Show final message, update usage |
| `aborted` | User/system cancelled | Show abort notice |
| `error` | Error occurred | Show error, may retry |
