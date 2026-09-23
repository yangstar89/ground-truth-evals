#!/usr/bin/env node
/**
 * Run the eval.
 *
 *   node bin/eval.mjs --model stub
 *   node bin/eval.mjs --model openai:gpt-4o-mini --concurrency 6
 *   node bin/eval.mjs --model stub --baseline baselines/stub.json
 *   node bin/eval.mjs --regrade runs/2026-09-21T12-00-00-stub.jsonl
 *   node bin/eval.mjs --model anthropic:claude-sonnet-5 --tools "node examples/poker/mcp-server.mjs"
 *   node bin/eval.mjs --suite examples/poker/suite.js --model stub
 *
 * Every raw reply is written to runs/ before grading. That ordering is on
 * purpose: grading is free and repeatable, model calls are neither, so a
 * grader change never costs another API bill - re-run with --regrade instead.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, basename, dirname } from 'node:path';
import { createRunner } from '../src/runners/index.js';
import { buildPrompt } from '../src/protocol.js';
import { gradeRow, summarise, diffRuns } from '../src/graders/index.js';
import { loadSuite } from '../src/suite.js';
import { renderMarkdown, renderLine } from '../src/report.js';
import { mapLimit, isFatal } from '../src/runners/http.js';
import { TruncatedError } from '../src/runners/api.js';
import { connectTools } from '../src/runners/tools.js';
import { loadEnv } from '../src/env.js';

// Before any runner is constructed, so a key in .env is found.
loadEnv();

function parseArgs(argv) {
  const args = {
    model: 'stub',
    suite: 'examples/poker/suite.js',
    cases: null,
    concurrency: 6,
    seed: 1,
    skill: 0.8,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    const takesValue = next !== undefined && !next.startsWith('--');
    if (takesValue) {
      args[key] = /^-?\d+(\.\d+)?$/.test(next) ? Number(next) : next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

/** The prompt text is part of what a result means, so its version is recorded. */
const PROMPT_VERSION = 'v1';

function loadCases(path) {
  const text = readFileSync(resolve(path), 'utf8');
  return text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

/** A suite's own cases sit beside it, so --suite alone is enough to run one. */
function defaultCasesFor(suitePath) {
  return resolve(dirname(resolve(suitePath)), 'cases', 'v1.jsonl');
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
}

async function main() {
  // The suite is the domain: prompts, parsing, graders, the stub's mistakes.
  // Everything else in this file is the same whatever it evaluates.
  const suite = await loadSuite(args.suite);
  const casePath = args.cases ?? defaultCasesFor(args.suite);
  const cases = loadCases(casePath);

  let runRows;
  let meta;

  if (args.regrade) {
    // No model call at all: replay a stored run through the current graders.
    const path = resolve(args.regrade);
    const rows = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
    const header = rows[0].meta ? rows.shift() : null;
    runRows = rows;
    meta = {
      model: header?.meta?.model ?? 'unknown (regrade)',
      temperature: header?.meta?.temperature ?? null,
      promptVersion: header?.meta?.promptVersion ?? 'unknown',
      suite: header?.meta?.suite ?? suite.name,
      ...(header?.meta?.tools ? { tools: header.meta.tools } : {}),
      durationMs: 0,
      regradedFrom: basename(path),
    };
    console.log(`regrading ${runRows.length} stored replies from ${basename(path)} — no API calls`);
  } else {
    // With --tools, the model is handed a real MCP server's tools. The prompt
    // is unchanged, so the tools are the only difference between two runs.
    let tools = null;
    if (args.tools) {
      if (String(args.model).startsWith('stub')) {
        console.error('--tools needs a real model; the stub answers from ground truth and would never call one.');
        process.exit(2);
      }
      tools = await connectTools(String(args.tools));
      console.log(`tools from "${tools.command}": ${tools.tools.map((t) => t.name).join(', ')}`);
    }
    const runner = createRunner(suite, args.model, {
      seed: args.seed,
      skill: args.skill,
      temperature: args.temperature,
      tools,
    });
    console.log(`${runner.name}: ${cases.length} cases, concurrency ${args.concurrency}`);

    const started = Date.now();
    let done = 0;
    // Set by the first error that every later case would hit too.
    let fatal = null;
    const replies = await mapLimit(cases, Number(args.concurrency), async (kase) => {
      if (fatal) return null;
      const prompt = buildPrompt(suite, kase);
      const t0 = Date.now();
      try {
        const res = await runner.complete(kase, prompt);
        return {
          id: kase.id,
          text: res.text,
          ms: Date.now() - t0,
          usage: res.usage ?? null,
          ...(res.toolCalls ? { toolCalls: res.toolCalls } : {}),
        };
      } catch (e) {
        if (isFatal(e)) fatal ??= e;
        // Any other failed call is data, not a crash: record it, and why, so
        // the grader can tell a model that ran out of budget from a request
        // that never reached one.
        return {
          id: kase.id,
          text: '',
          ms: Date.now() - t0,
          error: String(e.message ?? e),
          errorKind: e instanceof TruncatedError ? 'truncated' : 'request',
          ...(tools ? { toolCalls: e.toolCalls ?? [] } : {}),
        };
      } finally {
        done++;
        if (done % 10 === 0 || done === cases.length) {
          process.stdout.write(`\r  ${done}/${cases.length}`);
        }
      }
    });
    process.stdout.write('\n');
    await tools?.close();

    if (fatal) {
      // Nothing is written: there is no model behaviour here to keep or grade.
      console.error(`\nstopped: ${fatal.message}`);
      console.error('No run, report or baseline was written.');
      process.exit(1);
    }

    meta = {
      model: runner.name,
      temperature: runner.temperature ?? null,
      promptVersion: PROMPT_VERSION,
      durationMs: Date.now() - started,
      suite: suite.name,
      cases: basename(casePath),
      ...(tools ? { tools: { command: tools.command, names: tools.tools.map((t) => t.name) } } : {}),
    };
    runRows = replies;

    const runPath = resolve(args.out ?? `runs/${stamp()}-${runner.name.replace(/[:()=,.]/g, '_')}.jsonl`);
    mkdirSync(dirname(runPath), { recursive: true });
    writeFileSync(runPath, [JSON.stringify({ meta }), ...runRows.map((r) => JSON.stringify(r))].join('\n') + '\n');
    console.log(`  raw replies -> ${runPath}`);
    meta.runFile = basename(runPath);
  }

  const byId = new Map(cases.map((c) => [c.id, c]));
  const results = runRows
    .filter((r) => byId.has(r.id))
    .map((r) => gradeRow(suite, byId.get(r.id), r));

  const summary = summarise(results);

  let diff = null;
  if (args.baseline) {
    const path = resolve(args.baseline);
    if (!existsSync(path)) {
      console.error(`baseline not found: ${path}`);
      process.exit(2);
    }
    const stored = JSON.parse(readFileSync(path, 'utf8'));
    diff = { ...diffRuns(stored.results, results), baselineName: basename(path) };
  }

  const md = renderMarkdown({ meta, summary, results, cases, diff });
  const reportPath = resolve(args.report ?? `reports/${stamp()}-${meta.model.replace(/[:()=,.]/g, '_')}.md`);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, md);

  // A baseline is what later runs are judged against, so one with a hole in
  // it would report every case in the hole as "fixed" the next time round.
  const failedRequests = summary.overall.requestFailed;
  if (args.save && failedRequests) {
    console.log('');
    console.log(renderLine(meta, summary));
    console.log(`  report -> ${reportPath}`);
    console.error(`\nnot saving a baseline: ${failedRequests} request(s) failed, so those cases were never graded.`);
    console.error('Re-run them; --save only accepts a run where every case reached the model.');
    process.exit(2);
  }

  if (args.save) {
    const savePath = resolve(args.save);
    mkdirSync(dirname(savePath), { recursive: true });
    writeFileSync(savePath, JSON.stringify({ meta, summary, results }, null, 2));
    console.log(`  baseline -> ${savePath}`);
  }

  console.log('');
  console.log(renderLine(meta, summary));
  console.log(`  report -> ${reportPath}`);

  if (diff) {
    console.log(`  vs ${diff.baselineName}: ${diff.regressions.length} regressions, ${diff.fixes.length} fixes`);
    for (const r of diff.regressions) console.log(`    REGRESSED ${r.id}  ${r.detail}`);
    // A regression is the one outcome worth failing a pipeline over.
    if (diff.regressions.length && args.strict) process.exit(1);
  }
}

main().catch((e) => {
  console.error(String(e.stack ?? e));
  process.exit(1);
});
