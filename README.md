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

Built and tested (54 tests, ~1s):

- [x] hand evaluator, cards, parsing
- [x] equity oracle — enumerate and seeded sample
- [x] ICM oracle
- [x] preflop range data
- [x] prompt building and two-tier reply parsing
- [x] three graders, run summaries, baseline diffs

Not yet built:

- [ ] case generator and a committed case set
- [ ] model runners (OpenAI, Anthropic, and a deterministic stub)
- [ ] report rendering

No API key is needed for anything above, and none is read from anywhere but the
environment. See `.env.example`.

## Running

```bash
npm install
npm test
```

## Provenance

`src/oracle/icm.js` and `src/oracle/ranges.js` are taken from another of the author's projects,
Both are standard published poker mathematics — the
Malmuth-Harville model and preflop charts of the kind every solver output
agrees on — rather than anything proprietary. The equity engine is not
vendored; this repo computes equity from scratch, on purpose.
