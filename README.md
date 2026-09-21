# poker-agent-evals

An evaluation harness that scores an LLM's poker decisions against **computed
ground truth** rather than a rubric or another model's opinion.

Most LLM evals grade fuzzy work — is this summary good, is this answer helpful —
and end up leaning on a human rubric or an LLM judge, both of which are noisy
and neither of which is cheap to re-run. Poker is arithmetic. `AcAd` against
`KcKd` on a `2c 7d 9h` flop has an exact equity, reachable by enumerating every
remaining board. That makes every grader here deterministic, every run
reproducible, and re-grading free.

## How it works

```
cases/*.jsonl   one spot per line: the inputs, the oracle's answer, a tolerance
src/oracle/     the source of truth - equity, ICM, preflop charts
src/protocol.js one case -> one prompt; one reply -> one value
src/graders/    a value -> a score, plus run summaries and baseline diffs
runs/           every raw reply, cached, so re-grading costs nothing
```

### The oracle

`src/oracle/` computes the right answer independently of anything being tested.
It does **not** import the equity engine from
an existing engine, even though that engine exists and is by
the same author: a grader that shares code with the system it grades can only
show that the code agrees with itself.

Two regimes, and every case records which one produced its number:

| | |
|---|---|
| `enumerate` | every remaining board is walked, so the answer is not an estimate. Two known hands on a flop is C(45,2) = 990 boards. |
| `sample` | a seeded draw, for spaces too large to walk. Heads-up preflop is already 1,712,304 boards. The seed lives in the case, so a case file replays identically anywhere. |

`enumerateEquity` **throws** rather than quietly sampling when a space exceeds
the cap, so `"exact": true` in a case file always means exact. A grader silently
degrading into a guess is how eval suites rot.

### The graders

All deterministic. Each returns `pass` *and* `error`, the graded distance from
truth in the case's own units — because a binary verdict cannot tell a near miss
from a catastrophe, and that difference is most of what you want when comparing
two models.

| Task | Ground truth | Scored on |
|---|---|---|
| `equity` | enumerated or seeded-sampled equity | absolute error, percentage points |
| `icm` | Malmuth-Harville | worst seat's error, tolerance scaled to the prize pool |
| `range` | published RFI / defence charts | whether the chart plays that action at all; mixed strategies accept any non-zero-frequency branch, and the frequency is reported |

### Output contract, and what happens when it is ignored

Prompts ask for a single JSON object. `parseAnswer` tries that first and falls
back to reading a number or an action out of prose — but records every fallback,
so *"how often did the model ignore the schema"* is a reported metric rather
than something quietly papered over. Replies that cannot be read at all are
marked `unparseable` and counted separately from replies that were simply wrong.

### Baselines

`summarise` reports pass rate and error per task type, never blended: a model
can be strong at chart lookups and hopeless at equity arithmetic, and one
percentage would hide that. `diffRuns` names the cases that **broke** and the
ones that got **fixed** against a stored baseline — an average can improve while
specific cases regress, and those are the ones worth reading.

## Status

Complete and tested — **124 tests**, including 17 that drive the MCP server over
live stdio and check it against every case:

- [x] hand evaluator, cards, parsing
- [x] equity oracle — enumerate and seeded sample
- [x] ICM oracle
- [x] preflop range data
- [x] 75-case dataset with frozen ground truth, self-auditing generator
- [x] prompt building and two-tier reply parsing
- [x] three graders, run summaries, baseline diffs
- [x] runners: OpenAI, Anthropic, and a deterministic stub
- [x] markdown reports, broken down by task and by kind of spot
- [x] MCP server exposing the oracle as tools, and a `--tools` mode that runs a
      model with them

Next: run the same cases with the model unaided and with the tools available,
and report the delta.

## The oracle as MCP tools

`bin/mcp-server.mjs` serves the oracle over stdio to any MCP client:

| Tool | Takes | Returns |
|---|---|---|
| `poker_equity` | `hero`, `board?`, `opponents?`, `num_opponents?`, `seed?` | `equity`, `equity_pct`, `method`, `exact`, `samples`, `seed?` |
| `poker_icm` | `stacks`, `payouts` | `equities`, `pool`, `sums_to_pool` |
| `poker_range_action` | `hand`, `position`, `scenario` | `action`, `frequencies`, `mixed`, `position`, `scenario` |

Three decisions shape it:

- **Descriptions tell a model when to call, not just what the tool does.** A
  model reads them before deciding whether to calculate by hand, and the
  unaided runs show what calculating by hand gets you.
- **Every refusal says what would have been valid**, and comes back as a tool
  result the model can read, not a protocol error it may never see: `unknown
  position "LJ"; valid: UTG, HJ, CO, BTN, SB, BB.` One retry is enough.
- **Equity samples where the eval would refuse.** The eval's `enumerateEquity`
  throws past its cap because a case marked exact must be exact. A tool that
  refuses is useless, so `poker_equity` samples instead and reports
  `exact: false`, so an agent can tell a computed answer from an estimate.

Install, after `npm install`, with the absolute path to this checkout:

```bash
# Claude Code
claude mcp add poker-oracle -- node /path/to/poker-agent-evals/bin/mcp-server.mjs

# Codex
codex mcp add poker-oracle -- node /path/to/poker-agent-evals/bin/mcp-server.mjs
```

Cursor, in `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "poker-oracle": {
      "command": "node",
      "args": ["/path/to/poker-agent-evals/bin/mcp-server.mjs"]
    }
  }
}
```

Run the eval with the tools available to the model:

```bash
node bin/eval.mjs --model anthropic:claude-sonnet-5 --tools "node bin/mcp-server.mjs" \
  --baseline baselines/anthropic-sonnet-5.json
```

The prompt is unchanged, so the tools are the only difference between that run
and the unaided one. The tools return the oracle's own answers, so a with-tools
run measures tool *use* - choosing the tool, passing the cards correctly,
reporting the result faithfully - not the oracle, whose correctness the unit
tests establish against published values.

## Running

```bash
npm install
npm test                      # 124 tests, no network
npm run cases                 # regenerate cases/v1.jsonl from the specs
npm run eval:stub             # the whole pipeline, no API key, no spend
```

Against a real model:

```bash
cp .env.example .env          # then fill in a key; .env is gitignored
node bin/eval.mjs --model openai:gpt-4o-mini --concurrency 6
node bin/eval.mjs --model anthropic:claude-sonnet-5 --baseline baselines/stub-seed1.json
```

Re-grade a stored run without paying for it again:

```bash
node bin/eval.mjs --regrade runs/<file>.jsonl
```

`--save <path>` writes a baseline, `--strict` exits non-zero on any regression,
and `docs/example-report.md` shows what the output looks like.

### What a stub run proves

The stub answers from the case's own ground truth, perturbed deterministically,
so four properties are checkable with no network at all:

| | |
|---|---|
| deterministic | same seed, byte-identical replies and an identical score |
| baseline-clean | a run diffed against its own baseline reports zero regressions |
| regression-sensitive | dropping the stub's skill from 0.8 to 0.55 surfaces 16 named regressions |
| free to re-grade | `--regrade` reproduces a score exactly, with no API calls |

It also imitates how models actually fail rather than failing randomly: some
answers are rounded, some are confidently wrong, some ignore the JSON contract
and answer in prose, and ICM answers sometimes chip-chop — which is precisely
the mistake the ICM task exists to catch.

## Provenance

`src/oracle/icm.js` and `src/oracle/ranges.js` are taken from another of the author's projects,
Both are standard published poker mathematics — the
Malmuth-Harville model and preflop charts of the kind every solver output
agrees on — rather than anything proprietary. The equity engine is not
vendored; this repo computes equity from scratch, on purpose.
