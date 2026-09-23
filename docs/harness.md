# Using the harness for your own domain

The harness scores a model against **computed truth**. It runs models, caches
every reply, grades, summarises, diffs a run against a baseline and writes a
report. It knows nothing about poker, or about whatever you point it at: a
*suite* supplies that.

It suits any domain where an answer can be checked by computing it rather than
judging it — unit conversions, tax and payroll rules, SQL results over a fixed
database, date arithmetic, geometry, retrieval where the right document id is
known. If the right answer needs an opinion, this is the wrong tool: there is
no rubric and no model-as-judge anywhere in it, and that is the point.

Two worked examples ship with it:

| | |
|---|---|
| [`examples/dates/`](../examples/dates/) | 80 lines, no oracle, two task types. Read this one first. |
| [`examples/poker/`](../examples/poker/) | the full thing: an oracle, 111 cases, an MCP server, and committed baselines. |

## Run it once, with no API key

```bash
npm install
node examples/dates/build-cases.mjs                        # writes the cases
node bin/eval.mjs --suite examples/dates/suite.js --model stub
```

That runs the whole pipeline — prompt, reply, parse, grade, summarise, report —
against a deterministic fake model, so you can see the shape of the output
before spending anything.

## A suite

A module with a default export. Everything domain-specific lives here.

```js
import { CONTRACT } from '../../src/protocol.js';
import { numeric } from '../../src/graders/score.js';

export default {
  name: 'units',
  systemPrompt: 'You are a precise calculator. Follow the output schema exactly.',
  tasks: {
    convert: {
      prompt: (kase) => [
        `Convert ${kase.value} ${kase.from} to ${kase.to}.`,
        CONTRACT,
        'Schema: {"value": <number>}',
      ].join('\n'),
      fromObject: (kase, obj) => (typeof obj.value === 'number' ? obj.value : undefined),
      fromProse: (kase, text) => Number(text.match(/-?\d+(\.\d+)?/)?.[0]),
      grade: (kase, got) => numeric({ got, expected: kase.expected, tolerance: kase.tolerance, unit: kase.to }),
    },
  },
};
```

| Field | | |
|---|---|---|
| `name` | required | names the suite in run files and reports |
| `systemPrompt` | | one line setting the model's role |
| `tasks` | required | one entry per case `type` |
| `stub` | | how the fake model answers; without it, `--model stub` refuses rather than inventing replies |
| `unreadableReply` | | what the stub says on the few cases it garbles |

### A task

| Function | | |
|---|---|---|
| `prompt(kase)` | required | the text sent to the model |
| `grade(kase, value)` | required | the score (below) |
| `fromObject(kase, obj)` | | a value out of the JSON the schema asked for |
| `fromProse(kase, text)` | | a value out of prose, when the model ignores the schema |
| `fromOffSchemaObject(kase, obj)` | | a value under a field the schema did not ask for |

Parsing is two-tier on purpose. `fromObject` is tried first; if it finds
nothing, `fromProse` runs and the reply is marked `recovered`, which the report
counts as *schema ignored*. Models do ramble, and throwing the case away would
hide a real answer — but a suite that quietly accepted anything would hide the
fact that the model never followed the contract.

### What a grader returns

```js
{ pass: true, error: 0.4, unit: 'percentage points', detail: 'said 82.2, truth 82.6' }
```

`error` matters as much as `pass`: a binary verdict cannot tell a near miss
from a catastrophe, and the difference is most of what you want when comparing
two models. `unit` is not decoration — the harness refuses to average errors
across different units, so a run mixing dollars and percentage points reports
no overall error figure rather than a meaningless one.

Three shapes in [`src/graders/score.js`](../src/graders/score.js) cover most
computable answers:

| | |
|---|---|
| `numeric({ got, expected, tolerance, unit })` | a number within a tolerance |
| `worstOf({ got, expected, tolerance, unit })` | a vector, judged by its worst element |
| `choice({ got, weights })` | a choice from a set, where more than one answer may be acceptable |

Anything else returns the envelope itself.

## Cases

One JSON object per line, in a `cases/v1.jsonl` beside the suite (or pass
`--cases`). Only two fields are the harness's business:

| Field | | |
|---|---|---|
| `id` | required | stable, and how a baseline diff names a case |
| `type` | required | which task grades it |
| `tag` | | groups the report by kind of case |
| everything else | | whatever your tasks and graders read, including the truth |

```json
{"id":"days-003","type":"days","tag":"leap-day","from":"2024-02-28","to":"2024-03-01","expected":2}
```

**Compute the truth when you generate the cases, and freeze it into the file.**
Every case then answers for itself, so changing a default — a sample count, a
rounding rule — cannot move the target under a run that has already been
scored. Have the generator audit its own output before writing:
[`examples/dates/build-cases.mjs`](../examples/dates/build-cases.mjs) is
twenty lines of that, and the poker one caught a real mistake in its own
assumptions.

## Running against a model

```bash
cp .env.example .env     # OPENAI_API_KEY and/or ANTHROPIC_API_KEY
node bin/eval.mjs --suite examples/dates/suite.js --model openai:gpt-4o-mini --concurrency 6
```

| Flag | |
|---|---|
| `--suite <path>` | the suite module; defaults to the poker one |
| `--model <spec>` | `stub`, `openai:<model>` or `anthropic:<model>` |
| `--cases <path>` | a case file other than `cases/v1.jsonl` beside the suite |
| `--concurrency <n>` | requests in flight, default 6 |
| `--save <path>` | write this run as a baseline |
| `--baseline <path>` | diff against a stored baseline; names what broke and what got fixed |
| `--strict` | exit non-zero if anything regressed, for CI |
| `--regrade <run>` | re-score stored replies with no API calls |
| `--tools "<command>"` | give the model an MCP server's tools over stdio |
| `--report <path>`, `--out <path>` | where the report and the raw replies go |
| `--seed`, `--skill` | the stub's determinism and how often it is right |

Every raw reply is written to `runs/` **before** grading. Grading is free and
model calls are not, so a grader change never costs a second bill — re-run with
`--regrade`.

## What you get back

| | |
|---|---|
| `runs/*.jsonl` | every raw reply, with usage and any tool calls |
| `reports/*.md` | one run: per task, per tag, every failure with its reason |
| a baseline | `--save`, committed, so later runs are compared against a fixed point |
| `docs/results.md` | several baselines side by side, via `node bin/compare.mjs` |

Every run records what it cost in tokens, including the tokens a reply burned
before being cut off at the output cap - those are a run's most expensive cases,
and leaving them out would understate exactly them. `bin/compare.mjs --prices
prices.json` turns tokens into money from a price list you supply, in dollars
per million tokens:

```json
{ "openai:gpt-4o-mini": { "input": 0.15, "output": 0.6 } }
```

Money is never inferred without one. Prices change, and a committed document
that quietly goes stale about what a run cost is worse than one that says
nothing.

## Things the harness insists on

These exist because each one has already gone wrong here:

- **A failed request is never a model's score.** An empty billing account once
  produced a clean-looking "0/75", so a run that cannot reach the model now
  stops at the first case and refuses to save a baseline.
- **A reply cut off by the output cap is its own category**, not an unreadable
  answer. A model that spends its whole budget thinking and never answers has
  failed differently from one that answered wrongly.
- **Errors are never averaged across units.**
- **Tool use is reported separately from accuracy**: how often a model reached
  for a tool, how many calls failed, and how many cases it answered from memory
  with the tool sitting there unused.

## Giving the model tools

`--tools "<command>"` starts an MCP server over stdio, lists its tools, hands
them to the model and runs the call loop, recording every call. The prompt does
not change, so a pair of runs differs only in whether the tools were there.

[`examples/poker/mcp-server.mjs`](../examples/poker/mcp-server.mjs) is a
worked server, and
[`examples/poker/mcp/conformance.test.js`](../examples/poker/mcp/conformance.test.js)
is the spec it was written against: every case pushed through the live server,
with bad input required to come back as a readable tool error rather than a
crash.

The server is started with a minimal environment, so API keys in the harness
process never reach it.
