# poker-agent-evals

[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An evaluation harness that scores an LLM's poker decisions against **computed
ground truth** rather than a rubric or another model's opinion.

Most LLM evals grade fuzzy work — is this summary good, is this answer helpful —
and end up leaning on a human rubric or an LLM judge, both of which are noisy
and neither of which is cheap to re-run. Poker is arithmetic. `AcAd` against
`KcKd` on a `2c 7d 9h` flop has an exact equity, reachable by enumerating every
remaining board. That makes every grader here deterministic, every run
reproducible, and re-grading free.

The harness itself knows nothing about poker: `src/` runs models, caches
replies, grades, diffs and reports, and a *suite* supplies the domain. Poker is
the worked example; `examples/dates/` is the same harness over date arithmetic
in eighty lines. To point it at your own domain, read
**[docs/harness.md](docs/harness.md)**.

## Results

The same 75 cases, the same prompt, each model run unaided and then with the
oracle available as MCP tools. Cases passed:

| | equity | icm | range | all |
|---|---|---|---|---|
| gpt-4o-mini, unaided | 3/31 | 0/16 | 23/28 | **26/75** |
| gpt-4o-mini, with tools | 31/31 | 16/16 | 28/28 | **75/75** |
| claude-sonnet-5, unaided | 19/31 | 14/16 | 25/28 | **58/75** |
| claude-sonnet-5, with tools | 31/31 | 15/16 | 28/28 | **74/75** |

What the runs show:

- **Unaided, the errors are large, not marginal.** gpt-4o-mini's equity answers
  were 17.5 percentage points out on average. Re-scored at double the tolerance
  (5pp), it passes 8 of 31 instead of 3; Sonnet 5 passes 20 instead of 19. The
  thresholds are not what decides these numbers.
- **The two models fail differently.** gpt-4o-mini answers at once and is wrong:
  it split three equal stacks 400/240/160, and paid a single 1,000 prize out as
  2,000 across three seats. Sonnet 5 is usually right, but on 9 cases it spent
  its whole 16,000-token output budget working the arithmetic and never
  answered: flops needing 990 boards, and five- and six-player ICM.
- **The cheap model with tools beats the strong model without them**, 75 to 58.
- **A model with tools does not always use them.** gpt-4o-mini called a tool on
  all 75 cases. Sonnet 5 answered 9 of the 16 ICM cases by hand with the tool
  available, and its one remaining failure is one of them: a five-player table it
  tried to compute itself and ran out of budget on. How often a model reaches
  for a tool is a separate number from how well it uses one, and the harness
  reports both.

### The other games

The same two models over 36 Omaha, short-deck and Omaha Hi-Lo spots, where a
Hold'em habit is wrong:

| | plo | plo5 | plo6 | shortdeck | hi-lo | all |
|---|---|---|---|---|---|---|
| gpt-4o-mini, unaided | 1/12 | 1/4 | 1/4 | 0/8 | 1/8 | **4/36** |
| gpt-4o-mini, with tools | 12/12 | 1/4 | 4/4 | 8/8 | 7/8 | **32/36** |
| claude-sonnet-5, unaided | 2/12 | 1/4 | 1/4 | 4/8 | 1/8 | **9/36** |
| claude-sonnet-5, with tools | 12/12 | 4/4 | 4/4 | 8/8 | 8/8 | **36/36** |

- **Unaided, both models are close to guessing**: 4/36 and 9/36, against 26/75
  and 58/75 on Hold'em. Short deck is the one they handle best, because it is
  the most Hold'em-like; Omaha Hi-Lo, where the pot can split, is the worst.
- **Sonnet 5 ran out of its 16,000-token budget on 15 of the 36**, having tried
  to enumerate Omaha by hand - sixty five-card combinations per player per
  board. Where it did answer, it sometimes applied the two-card rule too
  hard: holding `AhKh` on a two-heart board it called the nut flush draw
  worth 0%, when it is worth 39.6%.
- **With the tools, the arithmetic stops being the problem** and using them
  correctly becomes the whole game. Sonnet 5 made exactly 36 calls for 36
  cases, every one naming the right game with the cards transcribed exactly,
  and scored 36/36.
- **gpt-4o-mini's 21 failed calls out of 59 are the finding.** On the
  five-card Omaha spots it asked for `plo`, the four-card game. The tool
  refused and named both the game and the count - and rather than correct the
  variant, the model *deleted a card from the hand* to fit. That produced
  confident answers to a spot nobody asked about (49.8% where the truth is
  61.9%), and it is why three of its four failures are plo5 while every other
  game is near-perfect. A tool that refuses clearly is not enough on its own:
  the model still has to repair the right thing.

### How much of this is noise?

Measured rather than asserted, by running two conditions a second time:

| condition | run 1 | run 2 | cases that moved |
|---|---|---|---|
| claude-sonnet-5, unaided, Hold'em | 58/75 | 55/75 | 5 (4 broke, 1 fixed) |
| gpt-4o-mini, with tools, variants | 32/36 | 34/36 | 4 (1 broke, 3 fixed) |

So a single run is worth about ±3 cases, and gaps of that size mean nothing:
75/75 against 74/75 is a tie. The differences the tables are actually about —
26/75 against 75/75 with tools, or 4/36 unaided against 32/36 — are an order of
magnitude larger than the noise. Sonnet 5 runs at its default sampling, since
it rejects a temperature, so its repeat differs by more; gpt-4o-mini runs at
temperature 0 and still moved 4 cases, because the tool loop gives it more than
one way to go wrong.

Two more limits. The tools return the oracle's own answers, so the with-tools
rows measure tool *use* - choosing the tool, passing the cards correctly,
reporting the result faithfully - rather than the oracle, whose correctness the
unit tests establish against published values. And runs were made in September
2026; gpt-4o-mini at temperature 0, Sonnet 5 at its default sampling with
adaptive thinking. Token counts for each run, and the baselines behind every
number, are in [docs/results.md](docs/results.md) and
`examples/poker/baselines/`.

## How it works

```
src/             the harness, which knows nothing about poker
  suite.js       the seam: what a domain must provide
  protocol.js    one case -> one prompt; one reply -> one value
  graders/       a value -> a score, plus run summaries and baseline diffs
  runners/       OpenAI, Anthropic and a stub; the tool loop; the MCP client
  report.js      a run -> markdown, never blending the task types

examples/dates/  a second suite in 80 lines, and the shortest thing to read
                 first if you want the harness rather than the poker

examples/poker/  the worked example: everything poker-specific
  suite.js       prompts, readers and graders for the three tasks
  oracle/        the source of truth - equity, ICM, preflop charts
  cases/         one spot per line: the inputs, the truth, a tolerance
                 v1.jsonl is Hold'em, variants.jsonl the other games
  mcp-server.mjs the same oracle, served to a model as MCP tools
  baselines/     graded runs, committed; every number in Results is from one

runs/            every raw reply, cached, so re-grading costs nothing
```

### The oracle

`examples/poker/oracle/` computes the right answer independently of anything
being tested.

Two regimes, and every case records which one produced its number:

| | |
|---|---|
| `enumerate` | every remaining board is walked, so the answer is not an estimate. Two known hands on a flop is C(45,2) = 990 boards. |
| `sample` | a seeded draw, for spaces too large to walk. Heads-up preflop is already 1,712,304 boards. The seed lives in the case, so a case file replays identically anywhere. |

`enumerateEquity` **throws** rather than quietly sampling when a space exceeds
the cap, so `"exact": true` in a case file always means exact. A grader silently
degrading into a guess is how eval suites rot.

### The games

Hold'em is the default; `variant` on a case selects another. Each one is in the
set because it breaks a Hold'em habit, which is exactly where a model that has
read a lot of Hold'em goes wrong.

| Variant | Cards | What changes |
|---|---|---|
| `holdem` | 2 | - |
| `plo`, `plo5`, `plo6` | 4, 5, 6 | Exactly two hole cards and three board cards play. Four board hearts and one in hand is not a flush, and the board can never be played. |
| `shortdeck` | 2 | A 36-card deck: a flush beats a full house, and A-6-7-8-9 is the lowest straight. |
| `omaha-hi-lo` | 4 | Half the pot to the best low of five distinct ranks eight or lower - which may be made from two different hole cards than the high hand used. |

`examples/poker/cases/variants.jsonl` holds 36 spots across those games, in a
file of its own so the Hold'em numbers stay comparable with every baseline
already committed. Twenty-six of them enumerate exactly - including short-deck
preflop, which is only C(32,5) boards once sixteen cards are gone.

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

Complete and tested — **211 tests**, including 21 that drive the MCP server over
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
- [x] the same cases run unaided and with tools, for two models (see Results)
- [x] harness and domain split apart, so another domain plugs in as a suite
- [x] Omaha (4/5/6 cards), short deck and Omaha Hi-Lo, with 36 more cases
- [x] both models run over the variant cases, unaided and with tools

## The oracle as MCP tools

`examples/poker/mcp-server.mjs` serves the oracle over stdio to any MCP client:

| Tool | Takes | Returns |
|---|---|---|
| `poker_equity` | `hero`, `board?`, `opponents?`, `num_opponents?`, `variant?`, `seed?` | `equity`, `equity_pct`, `method`, `exact`, `samples`, `variant`, `seed?` |
| `poker_icm` | `stacks`, `payouts` | `equities`, `pool`, `sums_to_pool` |
| `poker_range_action` | `hand`, `position`, `scenario` | `action`, `frequencies`, `mixed`, `position`, `scenario` |

Three decisions shape it:

- **Descriptions tell a model when to call, not just what the tool does.** A
  model reads them before deciding whether to calculate by hand, and the
  unaided runs show what calculating by hand gets you.
- **Every refusal says what would have been valid**, and comes back as a tool
  result the model can read, not a protocol error it may never see: `unknown
  position "LJ"; valid: UTG, HJ, CO, BTN, SB, BB.` so the next call can be right.
- **Equity samples where the eval would refuse.** The eval's `enumerateEquity`
  throws past its cap because a case marked exact must be exact. A tool that
  refuses is useless, so `poker_equity` samples instead and reports
  `exact: false`, so an agent can tell a computed answer from an estimate.

Install, after `npm install`, with the absolute path to this checkout:

```bash
# Claude Code
claude mcp add poker-oracle -- node /path/to/poker-agent-evals/examples/poker/mcp-server.mjs

# Codex
codex mcp add poker-oracle -- node /path/to/poker-agent-evals/examples/poker/mcp-server.mjs
```

Cursor, in `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "poker-oracle": {
      "command": "node",
      "args": ["/path/to/poker-agent-evals/examples/poker/mcp-server.mjs"]
    }
  }
}
```

Run the eval with the tools available to the model:

```bash
node bin/eval.mjs --model anthropic:claude-sonnet-5 --tools "node examples/poker/mcp-server.mjs" \
  --baseline examples/poker/baselines/anthropic-sonnet-5.json
```

The prompt is unchanged, so the tools are the only difference between that run
and the unaided one. The tools return the oracle's own answers, so a with-tools
run measures tool *use* - choosing the tool, passing the cards correctly,
reporting the result faithfully - not the oracle, whose correctness the unit
tests establish against published values.

## Running

```bash
npm install
npm test                      # 211 tests, no network
npm run cases                 # regenerate cases/v1.jsonl from the specs
npm run eval:stub             # the whole pipeline, no API key, no spend
```

Against a real model:

```bash
cp .env.example .env          # then fill in a key; .env is gitignored
node bin/eval.mjs --model openai:gpt-4o-mini --concurrency 6
node bin/eval.mjs --model anthropic:claude-sonnet-5 --baseline examples/poker/baselines/stub-seed1.json
```

Re-grade a stored run without paying for it again:

```bash
node bin/eval.mjs --regrade runs/<file>.jsonl
```

Against the other games:

```bash
node bin/eval.mjs --model openai:gpt-4o-mini --cases examples/poker/cases/variants.jsonl
```

`--save <path>` writes a baseline, `--strict` exits non-zero on any regression,
and `docs/example-report.md` shows what the output looks like.

## Evaluating something else

Nothing under `src/` mentions poker. A *suite* supplies the domain: a system
prompt, and one task per case type, where a task is a prompt, one or two
readers and a grader. The whole of `examples/dates/suite.js` is eighty lines
and has no oracle behind it, because the calendar is the oracle.

```bash
node examples/dates/build-cases.mjs
node bin/eval.mjs --suite examples/dates/suite.js --model stub
```

**[docs/harness.md](docs/harness.md)** is the guide: the suite and task
interfaces, the case file format, every CLI flag, what the harness guarantees
and why, and how to hand a model tools. The short version is that a case
carries its own frozen ground truth, and a grader reports `error` in named
units as well as `pass` — so a near miss is never confused with a catastrophe,
and errors in different units are never averaged.

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

The ICM oracle is the standard Malmuth-Harville model, and the preflop ranges
are chart data of the kind every solver output agrees on; neither is
proprietary. Equity is computed from scratch here, on purpose, rather than
borrowed from an existing engine.
