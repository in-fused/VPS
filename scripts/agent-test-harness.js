#!/usr/bin/env node
/**
 * Agent Prompt Test Harness — "Isolate, Refine, Integrate"
 *
 * Runs one agent at a time against Ollama on Oracle ARM (zero rate limits),
 * evaluates output quality, generates prompt variants, and writes results
 * to evolution-state.json for owner review in Mission Control.
 *
 * Usage:
 *   node scripts/agent-test-harness.js <agent-id> [--model qwen3:14b] [--runs 5] [--mutate]
 *
 * Examples:
 *   node scripts/agent-test-harness.js lead                    # Test Lead with default tasks
 *   node scripts/agent-test-harness.js codecraft --runs 3      # 3 runs per task
 *   node scripts/agent-test-harness.js scout --mutate          # Test + generate improved SOUL.md
 *   node scripts/agent-test-harness.js all --runs 2            # All agents, 2 runs each
 *
 * Environment:
 *   OLLAMA_BASE_URL  — Ollama endpoint (default: http://150.136.153.194:11434)
 *   LITELLM_URL      — LiteLLM endpoint (default: http://localhost:4000)
 *   LITELLM_KEY      — LiteLLM master key (reads from .env if not set)
 *
 * Outputs:
 *   workspace/prompts/evolution-state.json  — A/B test results for owner review
 *   workspace/prompts/test-results/         — Per-agent detailed test logs
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://150.136.153.194:11434';
const LITELLM_URL = process.env.LITELLM_URL || 'http://localhost:4000';
const WORKSPACE = path.resolve(__dirname, '..', 'workspace');
const SEED_SCRIPT = path.resolve(__dirname, 'seed-agent-workspaces.js');

const MODELS = {
  'qwen3:14b':       `${OLLAMA_URL}/api/chat`,
  'qwen3.5:9b':      `${OLLAMA_URL}/api/chat`,
  'qwen3-coder:30b': `${OLLAMA_URL}/api/chat`,
};

const DEFAULT_MODEL = 'qwen3:14b';
const DEFAULT_RUNS = 5;

// ---------------------------------------------------------------------------
// Agent-specific test tasks — tailored to each role
// ---------------------------------------------------------------------------

const TEST_TASKS = {
  lead: [
    {
      id: 'delegate-task',
      name: 'Delegation accuracy',
      prompt: 'A user asks you to build a crypto price dashboard and document it. Delegate to the right team members with specific instructions.',
      expect: ['sessions_send', 'codecraft', 'scribe', '/workspace/staging/'],
      weight: 3,
    },
    {
      id: 'review-output',
      name: 'Output review quality',
      prompt: 'CodeCraft has staged a file at /workspace/staging/health-monitor.html. Review it (assume it exists and has basic HTML). Provide specific feedback — what to improve, approve, or reject.',
      expect: ['staging', 'approve', 'reject', 'feedback'],
      weight: 2,
    },
    {
      id: 'no-tasks-available',
      name: 'Self-directed work',
      prompt: 'You have no pending tasks. The staging queue is empty. Activity log shows no recent events. What do you do?',
      expect: ['sessions_send', 'assign', 'create', 'staging'],
      weight: 2,
    },
  ],
  codecraft: [
    {
      id: 'build-dashboard',
      name: 'Build a deliverable',
      prompt: 'Build a system status dashboard at /workspace/staging/sys-status.html. It should check service health endpoints and display results. Dark theme, mobile-first.',
      expect: ['write', '/workspace/staging/', '<html', 'fetch', 'mobile'],
      weight: 3,
    },
    {
      id: 'fix-bug',
      name: 'Debug and fix',
      prompt: 'The staging preview shows a white page. The iframe src is /workspace/staging/staging/file.html (double "staging"). The previewUrl is built as: \'/workspace/staging/\' + item.path where item.path is "staging/file.html". Fix this.',
      expect: ['startsWith', 'path', 'staging/', 'replace', 'fix'],
      weight: 3,
    },
    {
      id: 'code-security',
      name: 'Security awareness',
      prompt: 'Review this code for security issues: `app.get("/api/data", (req, res) => { const query = req.query.q; res.send(eval(query)); });`',
      expect: ['eval', 'injection', 'XSS', 'sanitize', 'dangerous'],
      weight: 2,
    },
  ],
  scout: [
    {
      id: 'research-task',
      name: 'Research quality',
      prompt: 'Research the differences between Ollama, vLLM, and llama.cpp for self-hosted LLM inference. Compare performance, memory usage, and ease of deployment.',
      expect: ['Ollama', 'vLLM', 'llama.cpp', 'memory', 'performance', 'comparison'],
      weight: 3,
    },
    {
      id: 'fact-check',
      name: 'Accuracy and sourcing',
      prompt: 'What are the current rate limits for Cerebras free tier inference API? How do they compare to Groq?',
      expect: ['tokens', 'requests', 'day', 'limit', 'Cerebras', 'Groq'],
      weight: 2,
    },
  ],
  scribe: [
    {
      id: 'write-docs',
      name: 'Documentation quality',
      prompt: 'Write a deployment runbook for the in-fused.org system. Commands must be single-line (owner uses iPhone + SSM). Cover: full deploy, single service restart, volume reset, log checking.',
      expect: ['deploy', 'docker compose', 'single-line', '&&', '/workspace/staging/'],
      weight: 3,
    },
    {
      id: 'concise-output',
      name: 'Mobile-friendly formatting',
      prompt: 'Summarize what OpenClaw is and how it connects to LiteLLM in 3 bullet points for a README.',
      expect: ['-', 'OpenClaw', 'LiteLLM', 'agent'],
      weight: 2,
    },
  ],
  'ops-lead': [
    {
      id: 'delegate-infra',
      name: 'Infrastructure delegation',
      prompt: 'Memory usage is at 85% on the EC2 instance. OpenClaw is at 1.4GB of its 1536MB limit. Delegate investigation and remediation to your team.',
      expect: ['sessions_send', 'builder', 'sentinel', 'memory', 'OOM'],
      weight: 3,
    },
    {
      id: 'incident-response',
      name: 'Incident handling',
      prompt: 'LiteLLM health check is returning 503. Agents cannot reach any models. What steps do you take?',
      expect: ['health', 'restart', 'docker', 'logs', 'fallback'],
      weight: 3,
    },
  ],
  builder: [
    {
      id: 'docker-task',
      name: 'Infrastructure competence',
      prompt: 'Write a docker-compose health check for OpenClaw that uses wget (not curl) to check the gateway endpoint at /openclaw/ on port 18789.',
      expect: ['wget', 'healthcheck', '18789', '/openclaw/', 'interval'],
      weight: 3,
    },
    {
      id: 'script-task',
      name: 'Script quality',
      prompt: 'Write a bash script that checks if all Docker services are running, reports memory usage per container, and alerts if any exceed 80% of their limit. Single-line friendly for SSM.',
      expect: ['docker', 'stats', 'memory', '%', 'alert'],
      weight: 2,
    },
  ],
  sentinel: [
    {
      id: 'security-audit',
      name: 'Security analysis',
      prompt: 'Audit this Caddyfile snippet for security issues: `reverse_proxy /api/* localhost:4000 { header_up X-API-Key {env.API_KEY} }` — what are the risks?',
      expect: ['header', 'API', 'key', 'exposure', 'log', 'risk'],
      weight: 3,
    },
    {
      id: 'health-check',
      name: 'Monitoring depth',
      prompt: 'Design a health monitoring strategy for the 5 Docker services (Caddy, LiteLLM, OpenClaw, Postgres, Scrapling). What to check, frequency, and alerting thresholds.',
      expect: ['health', 'endpoint', 'memory', 'interval', 'threshold', 'alert'],
      weight: 3,
    },
  ],
  chronicler: [
    {
      id: 'runbook',
      name: 'Runbook quality',
      prompt: 'Write a runbook for "OpenClaw won\'t start". Cover: dependency checks (LiteLLM health), log inspection, config validation, volume reset, and full redeploy. All commands single-line.',
      expect: ['docker', 'logs', 'health', 'volume', '&&', 'restart'],
      weight: 3,
    },
    {
      id: 'incident-report',
      name: 'Incident documentation',
      prompt: 'Write an incident report: "2026-03-10, 14:00 UTC — OpenClaw OOM killed at 1536MB after compaction loop. Root cause: softThresholdTokens not set. Fix: entrypoint now sets 50000."',
      expect: ['incident', 'root cause', 'timeline', 'fix', 'prevention'],
      weight: 2,
    },
  ],
};

// ---------------------------------------------------------------------------
// Validation rules (same as prompt evolution system)
// ---------------------------------------------------------------------------

const FORBIDDEN_PHRASES = [
  'I cannot', "I'm unable", "I don't have access", 'not possible',
  'please advise', 'awaiting instructions', 'let me know',
  "I'll do", "Here's my plan", "I would suggest",
];

function scoreOutput(output, task) {
  const scores = { relevance: 0, actionOriented: 0, noForbidden: 0, completeness: 0, conciseness: 0 };
  const text = output.toLowerCase();
  const rawText = output;

  // 1. Relevance — how many expected keywords are present (0-30)
  const hits = task.expect.filter(kw => text.includes(kw.toLowerCase()));
  scores.relevance = Math.round((hits.length / task.expect.length) * 30);

  // 2. Action-oriented — does it ACT instead of narrate? (0-25)
  const actionSignals = ['write(', 'read(', 'exec(', 'sessions_send(', '```', '<html', 'wget ', 'docker '];
  const askSignals = ["I'll ", "I would ", "I can ", "Let me ", "Here's my plan", "shall I"];
  const actionHits = actionSignals.filter(s => rawText.includes(s)).length;
  const askHits = askSignals.filter(s => rawText.includes(s)).length;
  scores.actionOriented = Math.min(25, actionHits * 8) - (askHits * 5);
  scores.actionOriented = Math.max(0, scores.actionOriented);

  // 3. No forbidden phrases (0-20)
  const forbiddenHits = FORBIDDEN_PHRASES.filter(p => rawText.includes(p));
  scores.noForbidden = forbiddenHits.length === 0 ? 20 : Math.max(0, 20 - forbiddenHits.length * 7);

  // 4. Completeness — response length vs reasonable minimum (0-15)
  const words = rawText.split(/\s+/).length;
  if (words > 50 && words < 2000) scores.completeness = 15;
  else if (words >= 20) scores.completeness = 10;
  else if (words >= 10) scores.completeness = 5;

  // 5. Conciseness — not too verbose (0-10)
  if (words < 800) scores.conciseness = 10;
  else if (words < 1500) scores.conciseness = 5;
  else scores.conciseness = 2;

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  return { scores, total, maxScore: 100, hits, forbiddenHits, wordCount: words };
}

// ---------------------------------------------------------------------------
// Ollama API client
// ---------------------------------------------------------------------------

async function chatOllama(model, systemPrompt, userMessage) {
  const url = `${OLLAMA_URL}/api/chat`;
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    stream: false,
    options: { temperature: 0.7, num_predict: 2048 },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Ollama ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  return {
    content: data.message?.content || '',
    totalDuration: data.total_duration,
    evalCount: data.eval_count,
    evalDuration: data.eval_duration,
  };
}

// ---------------------------------------------------------------------------
// Extract agent SOUL.md from seed script
// ---------------------------------------------------------------------------

function extractSoulPrompt(agentId) {
  const seedSrc = fs.readFileSync(SEED_SCRIPT, 'utf8');

  // Find the SHARED_TOOLS template (used for all agents)
  const toolsMatch = seedSrc.match(/const SHARED_TOOLS\s*=\s*`([\s\S]*?)`;/);
  const sharedTools = toolsMatch ? toolsMatch[1].slice(0, 4000) : ''; // truncate for token efficiency

  // Find agent-specific SOUL content
  // The seed script builds SOUL per agent in the AGENTS array
  const agentConfigs = {
    lead: { role: 'Core Team orchestrator', skills: 'delegation, review, team management' },
    codecraft: { role: 'Full-stack developer', skills: 'JS, Python, Bash, Docker, security audits' },
    scout: { role: 'Research specialist', skills: 'web research, data gathering, fact-checking' },
    scribe: { role: 'Documentation writer', skills: 'READMEs, guides, changelogs, tutorials' },
    'ops-lead': { role: 'Platform Team orchestrator', skills: 'infrastructure, deploys, monitoring' },
    builder: { role: 'Infrastructure developer', skills: 'Docker, scripts, CI/CD, server config' },
    sentinel: { role: 'Security & monitoring', skills: 'auditing, health checks, CVE scanning' },
    chronicler: { role: 'Platform documentation', skills: 'runbooks, deploy guides, incident reports' },
  };

  const cfg = agentConfigs[agentId];
  if (!cfg) throw new Error(`Unknown agent: ${agentId}`);

  // Build a representative system prompt (mirrors what SOUL.md + TOOLS.md provide)
  return `You are ${agentId}, ${cfg.role} on in-fused.org. You run 24/7 on EC2 via OpenClaw.

SKILLS: ${cfg.skills}

RULES:
- ACT, DON'T ASK. Execute tasks immediately using your tools.
- NEVER say "I cannot", "I'm unable", "I don't have access", "not possible"
- NEVER say "I'll do X" or "Here's my plan" — just DO it
- Stage ALL deliverables to /workspace/staging/{filename}
- Update /workspace/staging/index.json (path = filename only, NOT "staging/filename")
- Log ALL events to /workspace/agent-activity/log.json
- If no tasks exist, CREATE work

TOOLS: read(path), write(path, content), edit(path, old, new), exec(command), sessions_send(sessionKey, message), cron(action, ...)
- Shell has wget and node — NO curl
- sessions_send format: sessions_send(sessionKey: "agent:<id>:main", message: "...")

TEAM: Lead, CodeCraft, Scout, Scribe (Core) | Ops Lead, Builder, Sentinel, Chronicler (Platform)

${sharedTools.slice(0, 2000)}`;
}

// ---------------------------------------------------------------------------
// Prompt mutation — generate improved SOUL variants
// ---------------------------------------------------------------------------

async function generateMutations(agentId, model, baseline, testResults) {
  const weakTasks = testResults
    .filter(r => r.avgScore < 60)
    .map(r => `- "${r.taskName}": avg ${r.avgScore}/100 — weak on: ${r.weakAreas.join(', ')}`)
    .join('\n');

  const strongTasks = testResults
    .filter(r => r.avgScore >= 70)
    .map(r => `- "${r.taskName}": avg ${r.avgScore}/100`)
    .join('\n');

  const mutationPrompt = `You are a prompt engineer optimizing an AI agent's system prompt.

AGENT: ${agentId}
CURRENT SYSTEM PROMPT (abbreviated):
${baseline.slice(0, 3000)}

TEST RESULTS:
Strong areas:
${strongTasks || '(none above 70)'}

Weak areas:
${weakTasks || '(none below 60)'}

SCORING CRITERIA:
- Relevance (30pts): Does the agent use the right tools/concepts for the task?
- Action-oriented (25pts): Does it ACT (tool calls, code) instead of narrate?
- No forbidden phrases (20pts): Never says "I cannot", "I'll do X", "let me know"
- Completeness (15pts): Substantive response (50-2000 words)
- Conciseness (10pts): Not overly verbose (<800 words ideal)

Generate exactly 2 improved system prompt variants. For each:
1. Identify what to change and why (based on weak areas)
2. Write the complete improved system prompt
3. Keep the same structure but strengthen weak areas

IMPORTANT: Keep prompts under 4000 chars. Mobile-friendly. No filler.

Output as JSON:
[
  {"id": "variant-1", "changes": ["what changed"], "prompt": "the full improved prompt"},
  {"id": "variant-2", "changes": ["what changed"], "prompt": "the full improved prompt"}
]`;

  const result = await chatOllama(model, 'You are a prompt engineering expert. Output valid JSON only.', mutationPrompt);

  try {
    // Try to extract JSON from the response
    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('  [!] Failed to parse mutations:', e.message);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Main test runner
// ---------------------------------------------------------------------------

async function runAgentTests(agentId, model, numRuns, doMutate) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  TESTING: ${agentId} | Model: ${model} | Runs: ${numRuns}`);
  console.log(`${'='.repeat(60)}\n`);

  const tasks = TEST_TASKS[agentId];
  if (!tasks) {
    console.error(`No test tasks defined for agent: ${agentId}`);
    return null;
  }

  const systemPrompt = extractSoulPrompt(agentId);
  const taskResults = [];

  for (const task of tasks) {
    console.log(`  [${task.id}] ${task.name} (${numRuns} runs, weight: ${task.weight}x)`);
    const runs = [];

    for (let i = 0; i < numRuns; i++) {
      process.stdout.write(`    Run ${i + 1}/${numRuns}... `);
      try {
        const t0 = Date.now();
        const response = await chatOllama(model, systemPrompt, task.prompt);
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        const score = scoreOutput(response.content, task);

        runs.push({
          run: i + 1,
          score: score.total,
          scores: score.scores,
          wordCount: score.wordCount,
          hits: score.hits,
          forbiddenHits: score.forbiddenHits,
          elapsed: parseFloat(elapsed),
          tokensEval: response.evalCount || 0,
          content: response.content.slice(0, 500), // truncate for storage
        });

        const bar = '█'.repeat(Math.round(score.total / 5)) + '░'.repeat(20 - Math.round(score.total / 5));
        console.log(`${score.total}/100 [${bar}] ${elapsed}s ${score.wordCount}w`);
      } catch (e) {
        console.log(`ERROR: ${e.message}`);
        runs.push({ run: i + 1, score: 0, error: e.message });
      }
    }

    const validRuns = runs.filter(r => !r.error);
    const avgScore = validRuns.length > 0
      ? Math.round(validRuns.reduce((s, r) => s + r.score, 0) / validRuns.length)
      : 0;

    // Identify weak scoring dimensions
    const weakAreas = [];
    if (validRuns.length > 0) {
      const avgScores = {};
      for (const dim of Object.keys(validRuns[0].scores || {})) {
        avgScores[dim] = Math.round(validRuns.reduce((s, r) => s + (r.scores?.[dim] || 0), 0) / validRuns.length);
      }
      const maxByDim = { relevance: 30, actionOriented: 25, noForbidden: 20, completeness: 15, conciseness: 10 };
      for (const [dim, avg] of Object.entries(avgScores)) {
        if (avg < (maxByDim[dim] || 10) * 0.5) weakAreas.push(`${dim}(${avg}/${maxByDim[dim]})`);
      }
    }

    taskResults.push({
      taskId: task.id,
      taskName: task.name,
      avgScore,
      minScore: Math.min(...validRuns.map(r => r.score)),
      maxScore: Math.max(...validRuns.map(r => r.score)),
      weakAreas,
      runs,
      weight: task.weight,
    });

    console.log(`    → Avg: ${avgScore}/100 | Range: ${Math.min(...validRuns.map(r => r.score))}-${Math.max(...validRuns.map(r => r.score))} | Weak: ${weakAreas.join(', ') || 'none'}\n`);
  }

  // Weighted overall score
  const totalWeight = taskResults.reduce((s, t) => s + t.weight, 0);
  const weightedScore = Math.round(
    taskResults.reduce((s, t) => s + t.avgScore * t.weight, 0) / totalWeight
  );

  console.log(`  ─────────────────────────────────`);
  console.log(`  OVERALL: ${agentId} = ${weightedScore}/100 (weighted)\n`);

  // Mutation phase
  let mutations = [];
  if (doMutate) {
    console.log(`  [mutate] Generating prompt variants...`);
    mutations = await generateMutations(agentId, model, systemPrompt, taskResults);
    console.log(`  [mutate] Generated ${mutations.length} variants\n`);

    // Test each mutation
    for (const mut of mutations) {
      console.log(`  [A/B] Testing variant: ${mut.id} (changes: ${mut.changes?.join(', ')})`);
      const mutRuns = [];

      for (const task of tasks) {
        process.stdout.write(`    ${task.id}... `);
        try {
          const response = await chatOllama(model, mut.prompt, task.prompt);
          const score = scoreOutput(response.content, task);
          mutRuns.push({ taskId: task.id, score: score.total, weight: task.weight });
          console.log(`${score.total}/100`);
        } catch (e) {
          console.log(`ERROR`);
          mutRuns.push({ taskId: task.id, score: 0, weight: task.weight });
        }
      }

      const mutWeighted = Math.round(
        mutRuns.reduce((s, r) => s + r.score * r.weight, 0) / totalWeight
      );
      mut.weightedScore = mutWeighted;
      mut.delta = mutWeighted - weightedScore;
      mut.taskScores = mutRuns;
      console.log(`    → Variant ${mut.id}: ${mutWeighted}/100 (${mut.delta >= 0 ? '+' : ''}${mut.delta} vs baseline)\n`);
    }
  }

  return { agentId, model, weightedScore, taskResults, mutations, timestamp: Date.now() };
}

// ---------------------------------------------------------------------------
// Write results to evolution-state.json and test-results/
// ---------------------------------------------------------------------------

function writeResults(results) {
  // Ensure directories exist
  const promptsDir = path.join(WORKSPACE, 'prompts');
  const resultsDir = path.join(promptsDir, 'test-results');
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

  // Write detailed per-agent results
  const agentFile = path.join(resultsDir, `${results.agentId}-${Date.now()}.json`);
  fs.writeFileSync(agentFile, JSON.stringify(results, null, 2));
  console.log(`  [save] Detailed results: ${agentFile}`);

  // Update evolution-state.json with any mutations that beat baseline
  if (results.mutations && results.mutations.length > 0) {
    const stateFile = path.join(promptsDir, 'evolution-state.json');
    let state = { experiments: [], stats: { generations: 0, tested: 0, promoted: 0, rejected: 0 }, lastRun: 0, log: [] };

    if (fs.existsSync(stateFile)) {
      try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch {}
    }

    for (const mut of results.mutations) {
      const experiment = {
        promptId: `${results.agentId}-soul-${Date.now()}`,
        original: `[Baseline SOUL.md for ${results.agentId}]`,
        evolved: (mut.prompt || '').slice(0, 4000),
        changes: mut.changes || [],
        validationResults: [
          { rule: 'under-4000-chars', passed: (mut.prompt || '').length <= 4000 },
          { rule: 'no-forbidden-phrases', passed: !FORBIDDEN_PHRASES.some(p => (mut.prompt || '').includes(p)) },
          { rule: 'beats-baseline', passed: (mut.delta || 0) > 0 },
        ],
        status: (mut.delta || 0) > 0 ? 'pending-review' : 'rejected',
        target: results.agentId,
        baselineScore: results.weightedScore,
        variantScore: mut.weightedScore || 0,
        delta: mut.delta || 0,
        model: results.model,
        createdAt: Date.now(),
      };

      state.experiments.push(experiment);
      state.stats.generations++;
      state.stats.tested++;
      if (experiment.status === 'rejected') state.stats.rejected++;
    }

    state.lastRun = Date.now();
    state.log.push({
      time: Date.now(),
      type: 'test-harness',
      message: `Tested ${results.agentId}: baseline ${results.weightedScore}/100, ${results.mutations.length} variants generated`,
    });

    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    console.log(`  [save] Evolution state updated: ${stateFile}`);

    // Summary of promotable variants
    const winners = results.mutations.filter(m => (m.delta || 0) > 0);
    if (winners.length > 0) {
      console.log(`\n  ★ ${winners.length} variant(s) beat baseline — pending owner review in Mission Control`);
      for (const w of winners) {
        console.log(`    ${w.id}: +${w.delta} points (${w.changes?.join(', ')})`);
      }
    } else {
      console.log(`\n  ○ No variants beat baseline — current prompt is strong for this model`);
    }
  }

  // Write latest summary for quick reference
  const summaryFile = path.join(resultsDir, 'latest-summary.json');
  let summary = {};
  if (fs.existsSync(summaryFile)) {
    try { summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8')); } catch {}
  }
  summary[results.agentId] = {
    score: results.weightedScore,
    model: results.model,
    timestamp: results.timestamp,
    tasks: results.taskResults.map(t => ({ id: t.taskId, avg: t.avgScore, weak: t.weakAreas })),
    bestMutation: results.mutations?.sort((a, b) => (b.delta || 0) - (a.delta || 0))[0]?.delta || 0,
  };
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Agent Prompt Test Harness — Isolate, Refine, Integrate

Usage: node scripts/agent-test-harness.js <agent-id> [options]

  agent-id:  lead, codecraft, scout, scribe, ops-lead, builder, sentinel, chronicler, or "all"

Options:
  --model <name>   Ollama model (default: ${DEFAULT_MODEL})
  --runs <n>       Runs per task (default: ${DEFAULT_RUNS})
  --mutate         Generate + test improved prompt variants

Examples:
  node scripts/agent-test-harness.js lead --runs 3
  node scripts/agent-test-harness.js codecraft --mutate
  node scripts/agent-test-harness.js all --runs 2 --mutate
`);
    process.exit(0);
  }

  const agentId = args[0];
  const modelIdx = args.indexOf('--model');
  const model = modelIdx >= 0 ? args[modelIdx + 1] : DEFAULT_MODEL;
  const runsIdx = args.indexOf('--runs');
  const numRuns = runsIdx >= 0 ? parseInt(args[runsIdx + 1]) : DEFAULT_RUNS;
  const doMutate = args.includes('--mutate');

  // Verify Ollama connectivity
  console.log(`Checking Ollama at ${OLLAMA_URL}...`);
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const available = (data.models || []).map(m => m.name);
    console.log(`Connected. Models: ${available.join(', ')}`);
    if (!available.some(m => m.startsWith(model))) {
      console.error(`\nModel "${model}" not found. Available: ${available.join(', ')}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`Cannot reach Ollama: ${e.message}`);
    console.error('Set OLLAMA_BASE_URL or ensure Oracle ARM is reachable');
    process.exit(1);
  }

  const agents = agentId === 'all'
    ? Object.keys(TEST_TASKS)
    : [agentId];

  const allResults = [];

  for (const id of agents) {
    const result = await runAgentTests(id, model, numRuns, doMutate);
    if (result) {
      writeResults(result);
      allResults.push(result);
    }
  }

  // Final leaderboard
  if (allResults.length > 1) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('  LEADERBOARD');
    console.log(`${'='.repeat(60)}`);
    allResults.sort((a, b) => b.weightedScore - a.weightedScore);
    for (let i = 0; i < allResults.length; i++) {
      const r = allResults[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
      console.log(`  ${medal} ${r.agentId.padEnd(12)} ${r.weightedScore}/100`);
    }
    console.log();
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
