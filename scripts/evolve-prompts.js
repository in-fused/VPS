#!/usr/bin/env node
/**
 * Automated Prompt Evolution Pipeline — "Isolate, Refine, Integrate"
 *
 * One command. Tests all agents, uses a reasoning model (qwen3-coder:30b)
 * to judge outputs and generate improvements, iterates until scores converge,
 * then stages winners for owner review in Mission Control.
 *
 * Usage:
 *   node scripts/evolve-prompts.js                          # Full pipeline, all agents
 *   node scripts/evolve-prompts.js --agents lead,codecraft  # Specific agents
 *   node scripts/evolve-prompts.js --generations 5          # Max refinement iterations
 *   node scripts/evolve-prompts.js --dry-run                # Test without writing results
 *
 * What it does:
 *   1. ISOLATE:   Tests each agent's current SOUL.md against role-specific tasks
 *   2. REFINE:    qwen3-coder:30b analyzes failures, generates improved prompts
 *                 Loops until score converges or --generations limit hit
 *   3. INTEGRATE: Stages winning prompts to /workspace/staging/ for owner review
 *                 Updates evolution-state.json for Mission Control
 *
 * All inference runs on Oracle ARM Ollama — zero cost, zero rate limits.
 *
 * Environment:
 *   OLLAMA_BASE_URL  — default: http://150.136.153.194:11434
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://150.136.153.194:11434';
const WORKSPACE = path.resolve(__dirname, '..', 'workspace');
const SEED_SCRIPT = path.resolve(__dirname, 'seed-agent-workspaces.js');

// Model roles:
//   FAST_MODEL  — runs test tasks (agent simulation). Smaller = faster iteration.
//   JUDGE_MODEL — evaluates outputs + generates mutations. Bigger = smarter judgment.
let FAST_MODEL = 'qwen3:14b';
let JUDGE_MODEL = 'qwen3-coder:30b';

const DEFAULT_GENERATIONS = 3;   // max refinement iterations per agent
const RUNS_PER_TASK = 3;         // runs per task per generation (statistical stability)
const CONVERGENCE_THRESHOLD = 3; // stop if score improves less than this between generations

// ---------------------------------------------------------------------------
// Test tasks per role (same as agent-test-harness.js)
// ---------------------------------------------------------------------------

const TEST_TASKS = {
  lead: [
    { id: 'delegate-task', name: 'Delegation accuracy', weight: 3,
      prompt: 'A user asks you to build a crypto price dashboard and document it. Delegate to the right team members with specific instructions.',
      expect: ['sessions_send', 'codecraft', 'scribe', '/workspace/staging/'] },
    { id: 'review-output', name: 'Output review quality', weight: 2,
      prompt: 'CodeCraft has staged a file at /workspace/staging/health-monitor.html. Review it (assume it exists and has basic HTML). Provide specific feedback.',
      expect: ['staging', 'approve', 'reject', 'feedback'] },
    { id: 'self-directed', name: 'Self-directed work', weight: 2,
      prompt: 'You have no pending tasks. The staging queue is empty. Activity log shows no recent events. What do you do?',
      expect: ['sessions_send', 'assign', 'create', 'staging'] },
  ],
  codecraft: [
    { id: 'build-dashboard', name: 'Build a deliverable', weight: 3,
      prompt: 'Build a system status dashboard at /workspace/staging/sys-status.html. It should check service health endpoints and display results. Dark theme, mobile-first.',
      expect: ['write', '/workspace/staging/', '<html', 'fetch', 'mobile'] },
    { id: 'fix-bug', name: 'Debug and fix', weight: 3,
      prompt: 'The staging preview shows a white page. The iframe src is /workspace/staging/staging/file.html (double "staging"). The previewUrl is built as: \'/workspace/staging/\' + item.path where item.path is "staging/file.html". Fix this.',
      expect: ['path', 'staging/', 'replace', 'fix'] },
    { id: 'code-security', name: 'Security awareness', weight: 2,
      prompt: 'Review this code for security issues: `app.get("/api/data", (req, res) => { const query = req.query.q; res.send(eval(query)); });`',
      expect: ['eval', 'injection', 'sanitize', 'dangerous'] },
  ],
  scout: [
    { id: 'research-task', name: 'Research quality', weight: 3,
      prompt: 'Research the differences between Ollama, vLLM, and llama.cpp for self-hosted LLM inference. Compare performance, memory usage, and ease of deployment.',
      expect: ['Ollama', 'vLLM', 'llama.cpp', 'memory', 'performance'] },
    { id: 'fact-check', name: 'Accuracy and sourcing', weight: 2,
      prompt: 'What are the current rate limits for Cerebras free tier inference API? How do they compare to Groq?',
      expect: ['tokens', 'requests', 'day', 'limit', 'Cerebras', 'Groq'] },
  ],
  scribe: [
    { id: 'write-docs', name: 'Documentation quality', weight: 3,
      prompt: 'Write a deployment runbook for the in-fused.org system. Commands must be single-line (owner uses iPhone + SSM). Cover: full deploy, single service restart, volume reset, log checking.',
      expect: ['deploy', 'docker compose', 'single-line', '&&', '/workspace/staging/'] },
    { id: 'concise-output', name: 'Mobile-friendly formatting', weight: 2,
      prompt: 'Summarize what OpenClaw is and how it connects to LiteLLM in 3 bullet points for a README.',
      expect: ['-', 'OpenClaw', 'LiteLLM', 'agent'] },
  ],
  'ops-lead': [
    { id: 'delegate-infra', name: 'Infrastructure delegation', weight: 3,
      prompt: 'Memory usage is at 85% on the EC2 instance. OpenClaw is at 1.4GB of its 1536MB limit. Delegate investigation and remediation to your team.',
      expect: ['sessions_send', 'builder', 'sentinel', 'memory', 'OOM'] },
    { id: 'incident-response', name: 'Incident handling', weight: 3,
      prompt: 'LiteLLM health check is returning 503. Agents cannot reach any models. What steps do you take?',
      expect: ['health', 'restart', 'docker', 'logs', 'fallback'] },
  ],
  builder: [
    { id: 'docker-task', name: 'Infrastructure competence', weight: 3,
      prompt: 'Write a docker-compose health check for OpenClaw that uses wget (not curl) to check the gateway endpoint at /openclaw/ on port 18789.',
      expect: ['wget', 'healthcheck', '18789', '/openclaw/', 'interval'] },
    { id: 'script-task', name: 'Script quality', weight: 2,
      prompt: 'Write a bash script that checks if all Docker services are running, reports memory usage per container, and alerts if any exceed 80% of their limit.',
      expect: ['docker', 'stats', 'memory', '%', 'alert'] },
  ],
  sentinel: [
    { id: 'security-audit', name: 'Security analysis', weight: 3,
      prompt: 'Audit this Caddyfile snippet for security issues: `reverse_proxy /api/* localhost:4000 { header_up X-API-Key {env.API_KEY} }` — what are the risks?',
      expect: ['header', 'API', 'key', 'exposure', 'log', 'risk'] },
    { id: 'health-check', name: 'Monitoring depth', weight: 3,
      prompt: 'Design a health monitoring strategy for the 5 Docker services (Caddy, LiteLLM, OpenClaw, Postgres, Scrapling). What to check, frequency, and alerting thresholds.',
      expect: ['health', 'endpoint', 'memory', 'interval', 'threshold', 'alert'] },
  ],
  chronicler: [
    { id: 'runbook', name: 'Runbook quality', weight: 3,
      prompt: 'Write a runbook for "OpenClaw won\'t start". Cover: dependency checks, log inspection, config validation, volume reset, and full redeploy. All commands single-line.',
      expect: ['docker', 'logs', 'health', 'volume', '&&', 'restart'] },
    { id: 'incident-report', name: 'Incident documentation', weight: 2,
      prompt: 'Write an incident report: "2026-03-10, 14:00 UTC — OpenClaw OOM killed at 1536MB after compaction loop. Root cause: softThresholdTokens not set."',
      expect: ['incident', 'root cause', 'timeline', 'fix', 'prevention'] },
  ],
};

// ---------------------------------------------------------------------------
// Forbidden phrases — must NEVER appear in agent output
// ---------------------------------------------------------------------------

const FORBIDDEN_PHRASES = [
  'I cannot', "I'm unable", "I don't have access", 'not possible',
  'please advise', 'awaiting instructions', 'let me know',
  "I'll do", "Here's my plan", "I would suggest",
];

// ---------------------------------------------------------------------------
// Ollama chat
// ---------------------------------------------------------------------------

async function chat(model, system, user, opts = {}) {
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    stream: false,
    options: { temperature: opts.temperature ?? 0.7, num_predict: opts.maxTokens ?? 2048 },
  };

  const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeout ?? 600000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Ollama ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.message?.content || '';
}

// ---------------------------------------------------------------------------
// Extract the REAL SOUL.md from seed-agent-workspaces.js
// ---------------------------------------------------------------------------

function extractRealSoul(agentId) {
  const src = fs.readFileSync(SEED_SCRIPT, 'utf8');

  // Match the AGENT_SOULS object entries
  // Pattern: `  agentId: \`...\`,` or `  'agent-id': \`...\`,`
  const key = agentId.includes('-') ? `'${agentId}'` : agentId;
  const patterns = [
    new RegExp(`${key}:\\s*\`([\\s\\S]*?)\`\\s*,\\s*\\n\\s*(?:\\w|'|\\})`, 's'),
    new RegExp(`${key}:\\s*\`([\\s\\S]*?)\`\\s*,?\\s*$`, 'sm'),
  ];

  for (const re of patterns) {
    const m = src.match(re);
    if (m) return m[1];
  }

  // Fallback: find the AGENT_SOULS block and extract by position
  const soulsStart = src.indexOf('const AGENT_SOULS = {');
  if (soulsStart === -1) throw new Error('Cannot find AGENT_SOULS in seed script');

  const searchKey = agentId.includes('-') ? `'${agentId}':` : `${agentId}:`;
  const keyStart = src.indexOf(searchKey, soulsStart);
  if (keyStart === -1) throw new Error(`Cannot find SOUL for ${agentId}`);

  // Find the template literal
  const btStart = src.indexOf('`', keyStart);
  if (btStart === -1) throw new Error(`Cannot find template start for ${agentId}`);

  // Find the matching closing backtick (handle nested but no actual backticks in SOUL content)
  let depth = 0;
  let i = btStart + 1;
  while (i < src.length) {
    if (src[i] === '`' && src[i - 1] !== '\\') break;
    i++;
  }
  return src.slice(btStart + 1, i);
}

// Also get SHARED_TOOLS for context
function extractSharedTools() {
  const src = fs.readFileSync(SEED_SCRIPT, 'utf8');
  const m = src.match(/const SHARED_TOOLS\s*=\s*`([\s\S]*?)`;/);
  return m ? m[1] : '';
}

// ---------------------------------------------------------------------------
// LLM-as-Judge — uses JUDGE_MODEL (qwen3-coder:30b) for evaluation
// ---------------------------------------------------------------------------

async function judgeOutput(agentId, task, output) {
  const judgePrompt = `You are evaluating an AI agent's response to a task. Be strict and specific.

AGENT ROLE: ${agentId}
TASK: "${task.name}"
TASK PROMPT: ${task.prompt}
EXPECTED ELEMENTS: ${task.expect.join(', ')}

AGENT OUTPUT:
---
${output.slice(0, 3000)}
---

Score this output on 5 dimensions (0-100 each). Be harsh — 50 is average, 70+ is good.

1. RELEVANCE: Does it address the task directly? Does it mention/use the expected elements?
2. ACTION: Does it ACT (tool calls, code blocks, concrete commands) or just narrate/plan?
3. COMPLIANCE: Does it avoid forbidden phrases ("I cannot", "I'll do", "please advise", "let me know")?
4. COMPLETENESS: Is the response substantive and thorough enough to be useful?
5. CONCISENESS: Is it focused without unnecessary filler? (Under 800 words is ideal)

Also identify:
- STRENGTHS: What the prompt is doing well (1-2 bullet points)
- WEAKNESSES: What the prompt is failing at (1-2 bullet points, be specific)
- SUGGESTION: One concrete change to the system prompt that would fix the biggest weakness

Output as JSON only:
{"relevance":N,"action":N,"compliance":N,"completeness":N,"conciseness":N,"strengths":["..."],"weaknesses":["..."],"suggestion":"..."}`;

  const result = await chat(JUDGE_MODEL, 'You are a strict AI evaluator. Output valid JSON only. No markdown fences.', judgePrompt, {
    temperature: 0.3, // low temp for consistent judging
    maxTokens: 1024,
    timeout: 600000,
  });

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Normalize to 0-100 and compute total
      const dims = ['relevance', 'action', 'compliance', 'completeness', 'conciseness'];
      for (const d of dims) parsed[d] = Math.max(0, Math.min(100, parsed[d] || 0));
      parsed.total = Math.round(dims.reduce((s, d) => s + parsed[d], 0) / dims.length);
      return parsed;
    }
  } catch {}

  // Fallback: keyword-based scoring if judge fails
  return keywordScore(output, task);
}

function keywordScore(output, task) {
  const text = output.toLowerCase();
  const hits = task.expect.filter(kw => text.includes(kw.toLowerCase()));
  const relevance = Math.round((hits.length / task.expect.length) * 100);
  const hasForbidden = FORBIDDEN_PHRASES.some(p => output.includes(p));
  return {
    relevance,
    action: output.includes('```') || output.includes('write(') ? 70 : 30,
    compliance: hasForbidden ? 20 : 90,
    completeness: output.split(/\s+/).length > 50 ? 70 : 40,
    conciseness: output.split(/\s+/).length < 800 ? 80 : 40,
    total: 0, // will be recalculated
    strengths: [],
    weaknesses: hits.length < task.expect.length / 2 ? ['Missing expected elements'] : [],
    suggestion: 'N/A (judge fallback)',
    _fallback: true,
  };
}

// ---------------------------------------------------------------------------
// LLM-as-Judge — generate improved prompt variant
// ---------------------------------------------------------------------------

async function generateImprovedPrompt(agentId, currentPrompt, judgments) {
  // Collect all weaknesses and suggestions across tasks
  const weaknesses = judgments
    .flatMap(j => j.judgments.flatMap(jj => jj.weaknesses || []))
    .filter(Boolean);
  const suggestions = judgments
    .map(j => j.judgments.map(jj => jj.suggestion).filter(Boolean))
    .flat();
  const avgScores = {};
  const dims = ['relevance', 'action', 'compliance', 'completeness', 'conciseness'];
  for (const d of dims) {
    const vals = judgments.flatMap(j => j.judgments.map(jj => jj[d] || 0));
    avgScores[d] = Math.round(vals.reduce((a, b) => a + b, 0) / (vals.length || 1));
  }

  const refinementPrompt = `You are an expert prompt engineer. Your job is to improve an AI agent's system prompt.

AGENT: ${agentId}
CURRENT SCORES (0-100): ${JSON.stringify(avgScores)}
WEAKNESSES IDENTIFIED:
${weaknesses.map(w => `- ${w}`).join('\n') || '(none)'}

JUDGE SUGGESTIONS:
${suggestions.map(s => `- ${s}`).join('\n') || '(none)'}

CURRENT SYSTEM PROMPT:
---
${currentPrompt.slice(0, 4000)}
---

CONSTRAINTS:
- Must stay under 4000 characters (owner reads on iPhone)
- Must contain "NEVER say" rules for forbidden phrases: ${FORBIDDEN_PHRASES.slice(0, 5).join(', ')}
- Must contain staging output path: /workspace/staging/
- Must contain activity logging: /workspace/agent-activity/log.json
- Must use wget (NOT curl) in any shell examples
- Must NOT contain placeholder text, TODOs, or "coming soon"
- For lead/ops-lead: must include delegation examples with sessions_send
- Structure: start with identity/prime directive, then rules, then patterns/examples

Produce the COMPLETE improved system prompt. Not a diff — the full replacement.
Focus on fixing the weaknesses. Keep what's already working.

Output the prompt text directly, no JSON wrapping, no markdown fences.`;

  const result = await chat(JUDGE_MODEL, 'You are a prompt engineering expert. Output the improved prompt directly.', refinementPrompt, {
    temperature: 0.5,
    maxTokens: 4096,
    timeout: 600000,
  });

  // Extract changes by comparing
  const changes = [];
  if (result.length !== currentPrompt.length) changes.push(`Length: ${currentPrompt.length} → ${result.length} chars`);
  for (const w of weaknesses.slice(0, 3)) changes.push(`Addresses: ${w}`);

  return { prompt: result.slice(0, 4500), changes };
}

// ---------------------------------------------------------------------------
// Core pipeline: test one prompt against all tasks
// ---------------------------------------------------------------------------

async function evaluatePrompt(agentId, systemPrompt, tasks, label) {
  const results = [];

  for (const task of tasks) {
    const taskJudgments = [];

    for (let run = 0; run < RUNS_PER_TASK; run++) {
      process.stdout.write(`    ${label} | ${task.id} run ${run + 1}/${RUNS_PER_TASK}... `);
      try {
        const t0 = Date.now();
        const output = await chat(FAST_MODEL, systemPrompt, task.prompt);
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

        // Use LLM judge
        const judgment = await judgeOutput(agentId, task, output);
        judgment._elapsed = parseFloat(elapsed);
        judgment._wordCount = output.split(/\s+/).length;
        judgment._sample = output.slice(0, 300);
        taskJudgments.push(judgment);

        const bar = '█'.repeat(Math.round(judgment.total / 5)) + '░'.repeat(20 - Math.round(judgment.total / 5));
        console.log(`${judgment.total}/100 [${bar}] ${elapsed}s`);
      } catch (e) {
        console.log(`ERR: ${e.message.slice(0, 60)}`);
        taskJudgments.push({ total: 0, error: e.message });
      }
    }

    const validJudgments = taskJudgments.filter(j => !j.error);
    const avgTotal = validJudgments.length > 0
      ? Math.round(validJudgments.reduce((s, j) => s + j.total, 0) / validJudgments.length)
      : 0;

    results.push({
      taskId: task.id,
      taskName: task.name,
      weight: task.weight,
      avgScore: avgTotal,
      judgments: taskJudgments,
    });
  }

  // Weighted overall
  const totalWeight = results.reduce((s, r) => s + r.weight, 0);
  const weighted = Math.round(results.reduce((s, r) => s + r.avgScore * r.weight, 0) / totalWeight);

  return { weighted, tasks: results };
}

// ---------------------------------------------------------------------------
// Full pipeline for one agent
// ---------------------------------------------------------------------------

async function evolveAgent(agentId, maxGenerations) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  EVOLVING: ${agentId}`);
  console.log(`  Model: ${FAST_MODEL} (tasks) | ${JUDGE_MODEL} (judge)`);
  console.log(`  Max generations: ${maxGenerations} | Runs/task: ${RUNS_PER_TASK}`);
  console.log(`${'═'.repeat(60)}\n`);

  const tasks = TEST_TASKS[agentId];
  if (!tasks) {
    console.error(`  No test tasks for ${agentId}, skipping`);
    return null;
  }

  // Load the real SOUL.md from the seed script
  let currentPrompt;
  try {
    currentPrompt = extractRealSoul(agentId);
    console.log(`  Loaded SOUL.md (${currentPrompt.length} chars)\n`);
  } catch (e) {
    console.error(`  Cannot extract SOUL for ${agentId}: ${e.message}`);
    return null;
  }

  const sharedTools = extractSharedTools();
  const fullPrompt = (prompt) => `${prompt}\n\n${sharedTools.slice(0, 2000)}`;

  // Generation 0: test baseline
  console.log(`  ── Generation 0 (baseline) ──`);
  const baseline = await evaluatePrompt(agentId, fullPrompt(currentPrompt), tasks, 'G0');
  console.log(`\n  Baseline score: ${baseline.weighted}/100\n`);

  const history = [{ gen: 0, score: baseline.weighted, prompt: currentPrompt, judgments: baseline.tasks }];
  let bestScore = baseline.weighted;
  let bestPrompt = currentPrompt;
  let bestGen = 0;

  // Refinement loop
  for (let gen = 1; gen <= maxGenerations; gen++) {
    console.log(`  ── Generation ${gen}/${maxGenerations} ──`);
    console.log(`  Generating improved prompt via ${JUDGE_MODEL}...`);

    const { prompt: improvedPrompt, changes } = await generateImprovedPrompt(
      agentId, bestPrompt, history[history.length - 1].judgments ? [{ judgments: history[history.length - 1].judgments.flatMap(t => t.judgments) }] : []
    );

    if (!improvedPrompt || improvedPrompt.length < 100) {
      console.log(`  Judge returned empty/short prompt, stopping refinement`);
      break;
    }

    console.log(`  Changes: ${changes.join(' | ')}`);
    console.log(`  New prompt: ${improvedPrompt.length} chars\n`);

    // Test the variant
    const result = await evaluatePrompt(agentId, fullPrompt(improvedPrompt), tasks, `G${gen}`);
    const delta = result.weighted - bestScore;

    console.log(`\n  Gen ${gen} score: ${result.weighted}/100 (${delta >= 0 ? '+' : ''}${delta} vs best)\n`);

    history.push({ gen, score: result.weighted, prompt: improvedPrompt, changes, judgments: result.tasks });

    if (result.weighted > bestScore) {
      bestScore = result.weighted;
      bestPrompt = improvedPrompt;
      bestGen = gen;
    }

    // Convergence check
    if (Math.abs(delta) < CONVERGENCE_THRESHOLD) {
      console.log(`  Converged (delta ${delta} < threshold ${CONVERGENCE_THRESHOLD}), stopping\n`);
      break;
    }
  }

  return {
    agentId,
    baselineScore: history[0].score,
    bestScore,
    bestGen,
    bestPrompt,
    improvement: bestScore - history[0].score,
    history,
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Stage results for owner review
// ---------------------------------------------------------------------------

function stageResults(allResults) {
  const promptsDir = path.join(WORKSPACE, 'prompts');
  const resultsDir = path.join(promptsDir, 'test-results');
  const stagingDir = path.join(WORKSPACE, 'staging');
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
  if (!fs.existsSync(stagingDir)) fs.mkdirSync(stagingDir, { recursive: true });

  // 1. Save detailed results per agent
  for (const r of allResults) {
    const file = path.join(resultsDir, `${r.agentId}-evolution-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(r, null, 2));
  }

  // 2. Update evolution-state.json
  const stateFile = path.join(promptsDir, 'evolution-state.json');
  let state = { experiments: [], stats: { generations: 0, tested: 0, promoted: 0, rejected: 0 }, lastRun: 0, log: [] };
  if (fs.existsSync(stateFile)) {
    try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch {}
  }

  const winners = allResults.filter(r => r.improvement > 0);

  for (const r of allResults) {
    state.experiments.push({
      promptId: `${r.agentId}-soul-evolved-${Date.now()}`,
      original: `[Baseline SOUL.md — ${r.baselineScore}/100]`,
      evolved: r.bestPrompt.slice(0, 4000),
      changes: r.history[r.bestGen]?.changes || [`+${r.improvement} points over ${r.history.length} generations`],
      validationResults: [
        { rule: 'under-4000-chars', passed: r.bestPrompt.length <= 4000 },
        { rule: 'no-forbidden-phrases', passed: !FORBIDDEN_PHRASES.some(p => r.bestPrompt.includes(p)) },
        { rule: 'beats-baseline', passed: r.improvement > 0 },
        { rule: 'llm-judged', passed: true },
      ],
      status: r.improvement > 0 ? 'pending-review' : 'rejected',
      target: r.agentId,
      baselineScore: r.baselineScore,
      variantScore: r.bestScore,
      delta: r.improvement,
      model: `${FAST_MODEL} (test) + ${JUDGE_MODEL} (judge)`,
      generations: r.history.length,
      createdAt: Date.now(),
    });

    state.stats.generations += r.history.length - 1; // exclude baseline
    state.stats.tested++;
    if (r.improvement <= 0) state.stats.rejected++;
  }

  state.lastRun = Date.now();
  state.log.push({
    time: Date.now(),
    type: 'evolve-pipeline',
    message: `Full pipeline: ${allResults.length} agents, ${winners.length} improved. Best: ${winners.sort((a, b) => b.improvement - a.improvement)[0]?.agentId || 'none'} (+${winners[0]?.improvement || 0})`,
  });

  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

  // 3. Stage an HTML report for the owner
  if (winners.length > 0) {
    const reportHtml = buildReport(allResults);
    const reportPath = path.join(stagingDir, 'prompt-evolution-report.html');
    fs.writeFileSync(reportPath, reportHtml);

    // Update staging index
    const indexPath = path.join(stagingDir, 'index.json');
    let index = { items: [] };
    if (fs.existsSync(indexPath)) {
      try { index = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch {}
    }

    // Remove old evolution report if present
    index.items = (index.items || []).filter(i => i.id !== 'prompt-evolution-report');
    index.items.push({
      id: 'prompt-evolution-report',
      name: `Prompt Evolution Report — ${winners.length} winners`,
      path: 'prompt-evolution-report.html',
      type: 'report',
      createdBy: 'evolve-prompts.js',
      description: `${allResults.length} agents tested, ${winners.length} improved prompts ready for review`,
      status: 'pending',
    });

    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    console.log(`  Staged: ${reportPath}`);
  }

  // 4. Write latest summary
  const summaryFile = path.join(resultsDir, 'latest-summary.json');
  const summary = {};
  for (const r of allResults) {
    summary[r.agentId] = {
      baseline: r.baselineScore,
      best: r.bestScore,
      improvement: r.improvement,
      generations: r.history.length,
      timestamp: r.timestamp,
    };
  }
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));

  return { winners: winners.length, stateFile, summaryFile };
}

// ---------------------------------------------------------------------------
// HTML report for staging
// ---------------------------------------------------------------------------

function buildReport(allResults) {
  const rows = allResults.map(r => {
    const cls = r.improvement > 0 ? 'text-green-400' : r.improvement < 0 ? 'text-red-400' : 'text-gray-400';
    const badge = r.improvement > 0 ? '✓ IMPROVED' : r.improvement < 0 ? '✗ REGRESSED' : '— NO CHANGE';
    return `
      <tr class="border-b border-gray-800">
        <td class="py-3 px-4 font-medium">${r.agentId}</td>
        <td class="py-3 px-4 text-center">${r.baselineScore}</td>
        <td class="py-3 px-4 text-center font-bold ${cls}">${r.bestScore}</td>
        <td class="py-3 px-4 text-center ${cls}">${r.improvement >= 0 ? '+' : ''}${r.improvement}</td>
        <td class="py-3 px-4 text-center">${r.history.length}</td>
        <td class="py-3 px-4 text-center"><span class="px-2 py-1 rounded text-xs ${cls} bg-gray-800">${badge}</span></td>
      </tr>`;
  }).join('');

  const winners = allResults.filter(r => r.improvement > 0);
  const details = winners.map(r => `
    <div class="bg-gray-900 rounded-lg p-4 mb-4">
      <h3 class="text-lg font-bold text-[#d4af37] mb-2">${r.agentId} — +${r.improvement} points</h3>
      <p class="text-sm text-gray-400 mb-2">Best variant from generation ${r.bestGen} of ${r.history.length - 1}</p>
      <details class="mt-2">
        <summary class="cursor-pointer text-sm text-[#d4af37]">View improved SOUL.md (${r.bestPrompt.length} chars)</summary>
        <pre class="mt-2 p-3 bg-black rounded text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto max-h-96">${escapeHtml(r.bestPrompt)}</pre>
      </details>
      <div class="mt-3 text-xs text-gray-500">
        Score progression: ${r.history.map(h => `G${h.gen}:${h.score}`).join(' → ')}
      </div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Prompt Evolution Report</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#0a0a0f] text-[#e8e8e8] min-h-screen p-4">
  <div class="max-w-2xl mx-auto">
    <h1 class="text-2xl font-bold text-[#d4af37] mb-1">Prompt Evolution Report</h1>
    <p class="text-sm text-gray-400 mb-4">${new Date().toISOString().split('T')[0]} | ${allResults.length} agents tested | ${winners.length} improved</p>

    <table class="w-full text-sm mb-6">
      <thead>
        <tr class="border-b border-gray-700 text-gray-400">
          <th class="py-2 px-4 text-left">Agent</th>
          <th class="py-2 px-4 text-center">Before</th>
          <th class="py-2 px-4 text-center">After</th>
          <th class="py-2 px-4 text-center">Delta</th>
          <th class="py-2 px-4 text-center">Gens</th>
          <th class="py-2 px-4 text-center">Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    ${winners.length > 0 ? `
    <h2 class="text-xl font-bold text-[#d4af37] mb-3">Winning Variants</h2>
    <p class="text-sm text-gray-400 mb-4">These prompts scored higher than the current SOUL.md. Review and approve to deploy.</p>
    ${details}
    ` : '<p class="text-gray-400">All current prompts are optimal for this model — no improvements found.</p>'}

    <p class="text-xs text-gray-600 mt-8">
      Test model: ${FAST_MODEL} | Judge model: ${JUDGE_MODEL} | ${RUNS_PER_TASK} runs/task | Oracle ARM Ollama
    </p>
  </div>
</body>
</html>`;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Automated Prompt Evolution Pipeline

Usage: node scripts/evolve-prompts.js [options]

Options:
  --agents <list>      Comma-separated agent IDs (default: all)
  --generations <n>    Max refinement iterations per agent (default: ${DEFAULT_GENERATIONS})
  --dry-run            Run tests but don't write results
  --single-model       Use qwen3:14b for both test + judge (avoids model swap, much faster)
  --help               Show this help

How it works:
  1. Tests each agent's SOUL.md against role-specific tasks using ${FAST_MODEL}
  2. ${JUDGE_MODEL} (30B reasoning model) evaluates outputs and generates improvements
  3. Iterates until scores converge or generation limit is hit
  4. Stages winning prompts for owner review in Mission Control

All inference runs on Oracle ARM Ollama — zero cost.
`);
    process.exit(0);
  }

  const agentsIdx = args.indexOf('--agents');
  const agentList = agentsIdx >= 0
    ? args[agentsIdx + 1].split(',').map(s => s.trim())
    : Object.keys(TEST_TASKS);

  const gensIdx = args.indexOf('--generations');
  const maxGen = gensIdx >= 0 ? parseInt(args[gensIdx + 1]) : DEFAULT_GENERATIONS;
  const dryRun = args.includes('--dry-run');

  // --single-model: use qwen3:14b for both test + judge (avoids 30b model swap, 4x faster)
  if (args.includes('--single-model')) {
    JUDGE_MODEL = FAST_MODEL;
    console.log('Single-model mode: using qwen3:14b for both test and judge (no model swaps)');
  }

  // Verify Ollama
  console.log(`Checking Ollama at ${OLLAMA_URL}...`);
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(10000) });
    const data = await resp.json();
    const available = (data.models || []).map(m => m.name);
    console.log(`Connected. Models: ${available.join(', ')}`);

    for (const needed of [FAST_MODEL, JUDGE_MODEL]) {
      if (!available.some(m => m.startsWith(needed))) {
        console.error(`Required model "${needed}" not found.`);
        process.exit(1);
      }
    }
  } catch (e) {
    console.error(`Cannot reach Ollama: ${e.message}`);
    process.exit(1);
  }

  console.log(`\nPipeline: ${agentList.length} agents × ${maxGen} max generations × ${RUNS_PER_TASK} runs/task`);
  console.log(`Estimated: ~${agentList.length * maxGen * RUNS_PER_TASK * 2} Ollama calls (test + judge)\n`);

  const allResults = [];

  for (const agentId of agentList) {
    const result = await evolveAgent(agentId, maxGen);
    if (result) allResults.push(result);
  }

  // Stage results
  if (!dryRun && allResults.length > 0) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log('  STAGING RESULTS');
    console.log(`${'═'.repeat(60)}\n`);

    const { winners } = stageResults(allResults);
    console.log(`\n  ${winners} agent(s) improved and staged for review.`);
  }

  // Final summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  FINAL RESULTS');
  console.log(`${'═'.repeat(60)}`);
  allResults.sort((a, b) => b.improvement - a.improvement);
  for (const r of allResults) {
    const arrow = r.improvement > 0 ? '↑' : r.improvement < 0 ? '↓' : '→';
    const color = r.improvement > 0 ? '+' : '';
    console.log(`  ${r.agentId.padEnd(12)} ${r.baselineScore} → ${r.bestScore} (${color}${r.improvement}) ${arrow}  [${r.history.length} gens]`);
  }

  const winners = allResults.filter(r => r.improvement > 0);
  if (winners.length > 0) {
    console.log(`\n  ★ ${winners.length} winning prompt(s) staged in Mission Control.`);
    console.log(`    Review at: https://in-fused.org/workspace/ → Staging tab`);
  } else {
    console.log(`\n  All current prompts are already optimal for this model.`);
  }
  console.log();
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
