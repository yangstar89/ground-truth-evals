# Measurements: poker-agent-evals

Generated from the baselines in `examples/poker/baselines` by `node bin/compare.mjs`.
Every figure here is read from a committed baseline file, so this document
and the runs it describes cannot disagree. What the numbers mean is
argued in the README; this file is the evidence behind it.

## v1.jsonl — 75 cases

4 runs, 2 models: anthropic:claude-sonnet-5, openai:gpt-4o-mini.

### By task

| run | equity | icm | range | all | no answer | tool calls |
| --- | --- | --- | --- | --- | --- | --- |
| anthropic:claude-sonnet-5, unaided | 19/31 | 14/16 | 25/28 | **58/75** | 9 | - |
| anthropic:claude-sonnet-5, with tools | 31/31 | 15/16 | 28/28 | **74/75** | 1 | 65 (0 failed) |
| openai:gpt-4o-mini, unaided | 3/31 | 0/16 | 23/28 | **26/75** | 0 | - |
| openai:gpt-4o-mini, with tools | 31/31 | 16/16 | 28/28 | **75/75** | 0 | 75 (0 failed) |

### By kind of spot

Weakest first, by the run that did worst on it. A tag with one or two
cases is a pointer to look, not a measurement.

| kind of spot | cases | anthropic:claude-sonnet-5, unaided | anthropic:claude-sonnet-5, with tools | openai:gpt-4o-mini, unaided | openai:gpt-4o-mini, with tools | note |
| --- | --- | --- | --- | --- | --- | --- |
| bubble-three | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| dominated | 3 | 3/3 | 3/3 | 0/3 | 3/3 |  |
| dry-flop-domination | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| even-three | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| final-table-bubble | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| five-handed | 1 | 0/1 | 0/1 | 0/1 | 1/1 | _thin_ |
| five-handed-leader | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| flat-payouts | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| flush-draw-vs-pair | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| four-handed | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| four-handed-even | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| heads-up | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| heads-up-lopsided | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| leader-three | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| longshot | 2 | 2/2 | 2/2 | 0/2 | 2/2 | _thin_ |
| made-vs-draw | 3 | 0/3 | 3/3 | 0/3 | 3/3 |  |
| more-players-than-payouts | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| multiway-flop | 2 | 0/2 | 2/2 | 0/2 | 2/2 | _thin_ |
| multiway-preflop | 3 | 1/3 | 3/3 | 0/3 | 3/3 |  |
| one-payout | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| open-ender-vs-pair | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| river-chop | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| river-lost | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| river-won | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| set-vs-overpair | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| shortstack-three | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| six-handed | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| steep-payouts | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| turn-ahead | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| turn-behind | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| turn-draw | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| two-pair-vs-draw | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| underdog-flop | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| flip | 3 | 2/3 | 3/3 | 1/3 | 3/3 |  |
| boundary | 6 | 5/6 | 6/6 | 3/6 | 6/6 |  |
| premium-vs-premium | 3 | 3/3 | 3/3 | 2/3 | 3/3 |  |
| bb-defence | 8 | 7/8 | 8/8 | 6/8 | 8/8 |  |
| position-sensitive | 8 | 7/8 | 8/8 | 8/8 | 8/8 |  |
| premium | 3 | 3/3 | 3/3 | 3/3 | 3/3 |  |
| trash | 3 | 3/3 | 3/3 | 3/3 | 3/3 |  |

### Cases no run passed (0)

_none: every case was passed by at least one run._

### Every case

What each run answered, against the truth. The tables above are these
rows counted.

| case | kind | tag | truth | anthropic:claude-sonnet-5, unaided | anthropic:claude-sonnet-5, with tools | openai:gpt-4o-mini, unaided | openai:gpt-4o-mini, with tools |
| --- | --- | --- | --- | --- | --- | --- | --- |
| eq-001 | equity | premium-vs-premium | 82.6 | ✓ 81.9 | ✓ 82.8 | ✓ 82.0 | ✓ 82.8 |
| eq-002 | equity | premium-vs-premium | 81.2 | ✓ 81.5 | ✓ 81.2 | ✓ 81.8 | ✓ 81.2 |
| eq-003 | equity | premium-vs-premium | 92.6 | ✓ 92.5 | ✓ 92.5 | ✗ 82.0 | ✓ 92.5 |
| eq-004 | equity | flip | 46.2 | ✓ 46.3 | ✓ 46.5 | ✓ 44.0 | ✓ 46.4 |
| eq-005 | equity | flip | 53.9 | ✓ 54.4 | ✓ 53.7 | ✗ 66.5 | ✓ 53.7 |
| eq-006 | equity | flip | 50.0 | ✗ 54.5 | ✓ 50.1 | ✗ 56.0 | ✓ 50.1 |
| eq-007 | equity | dominated | 74.9 | ✓ 74.0 | ✓ 74.8 | ✗ 63.6 | ✓ 74.8 |
| eq-008 | equity | dominated | 74.3 | ✓ 74.0 | ✓ 74.5 | ✗ 56.0 | ✓ 74.5 |
| eq-009 | equity | dominated | 74.3 | ✓ 74.0 | ✓ 74.5 | ✗ 56.0 | ✓ 74.5 |
| eq-010 | equity | longshot | 12.6 | ✓ 12.0 | ✓ 12.6 | ✗ 18.0 | ✓ 12.6 |
| eq-011 | equity | longshot | 14.8 | ✓ 12.5 | ✓ 15.1 | ✗ 18.0 | ✓ 15.1 |
| eq-012 | equity | made-vs-draw | - | ✗ no answer (budget) | ✓ 60.7 | ✗ 76.0 | ✓ 60.7 |
| eq-013 | equity | made-vs-draw | - | ✗ no answer (budget) | ✓ 50.6 | ✗ 76.0 | ✓ 50.6 |
| eq-014 | equity | made-vs-draw | - | ✗ no answer (budget) | ✓ 76.1 | ✗ 73.7 | ✓ 76.1 |
| eq-015 | equity | set-vs-overpair | 91.1 | ✓ 91.1 | ✓ 91.1 | ✗ 83.3 | ✓ 91.1 |
| eq-016 | equity | two-pair-vs-draw | - | ✗ no answer (budget) | ✓ 60.4 | ✗ 83.3 | ✓ 60.4 |
| eq-017 | equity | underdog-flop | - | ✗ no answer (budget) | ✓ 12.7 | ✗ 36.4 | ✓ 12.7 |
| eq-018 | equity | flush-draw-vs-pair | - | ✗ no answer (budget) | ✓ 55.0 | ✗ 36.4 | ✓ 55.1 |
| eq-019 | equity | open-ender-vs-pair | 34.2 | ✓ 34.2 | ✓ 34.2 | ✗ 36.4 | ✓ 34.2 |
| eq-020 | equity | dry-flop-domination | - | ✗ no answer (budget) | ✓ 87.5 | ✗ 45.0 | ✓ 87.5 |
| eq-021 | equity | turn-draw | 34.1 | ✓ 34.1 | ✓ 34.1 | ✗ 36.4 | ✓ 34.1 |
| eq-022 | equity | turn-behind | 13.6 | ✓ 13.6 | ✓ 13.6 | ✗ 56.3 | ✓ 13.6 |
| eq-023 | equity | turn-ahead | 86.4 | ✓ 86.4 | ✓ 86.4 | ✗ 76.0 | ✓ 86.4 |
| eq-024 | equity | river-won | 100.0 | ✓ 100.0 | ✓ 100.0 | ✗ 85.0 | ✓ 100.0 |
| eq-025 | equity | river-lost | 0.0 | ✓ 0.0 | ✓ 0.0 | ✗ 82.0 | ✓ 0.0 |
| eq-026 | equity | river-chop | 50.0 | ✓ 50.0 | ✓ 50.0 | ✗ 100.0 | ✓ 50.0 |
| eq-027 | equity | multiway-preflop | 63.8 | ✓ 65.0 | ✓ 63.8 | ✗ 82.0 | ✓ 63.8 |
| eq-028 | equity | multiway-preflop | 34.7 | ✗ 40.0 | ✓ 34.3 | ✗ 82.0 | ✓ 34.3 |
| eq-029 | equity | multiway-preflop | 24.9 | ✗ 16.5 | ✓ 25.0 | ✗ 20.0 | ✓ 25.0 |
| eq-030 | equity | multiway-flop | 51.2 | ✗ 37.5 | ✓ 51.2 | ✗ 42.0 | ✓ 51.2 |
| eq-031 | equity | multiway-flop | 84.6 | ✗ 63.4 | ✓ 84.4 | ✗ 75.0 | ✓ 84.4 |
| icm-001 | icm | even-three | 333.3 / 333.3 / 333.3 | ✓ 333.3 / 333.3 / 333.3 | ✓ 333.3 / 333.3 / 333.3 | ✗ 400.0 / 240.0 / 160.0 | ✓ 333.3 / 333.3 / 333.3 |
| icm-002 | icm | leader-three | 434.7 / 282.6 / 282.6 | ✓ 434.7 / 282.6 / 282.6 | ✓ 434.7 / 282.6 / 282.6 | ✗ 400.0 / 200.0 / 100.0 | ✓ 434.7 / 282.6 / 282.6 |
| icm-003 | icm | shortstack-three | 224.1 / 382.4 / 393.5 | ✓ 224.1 / 382.4 / 393.5 | ✓ 224.1 / 382.4 / 393.5 | ✗ 50.0 / 300.0 / 200.0 | ✓ 224.1 / 382.4 / 393.5 |
| icm-004 | icm | bubble-three | 386.7 / 386.7 / 226.7 | ✓ 386.7 / 386.7 / 226.7 | ✓ 386.7 / 386.7 / 226.7 | ✗ 600.0 / 400.0 / 0.0 | ✓ 386.7 / 386.7 / 226.7 |
| icm-005 | icm | flat-payouts | 387.8 / 306.1 / 306.1 | ✓ 387.8 / 306.1 / 306.1 | ✓ 387.8 / 306.1 / 306.1 | ✗ 250.0 / 150.0 / 100.0 | ✓ 387.8 / 306.1 / 306.1 |
| icm-006 | icm | steep-payouts | 667.8 / 166.1 / 166.1 | ✓ 667.8 / 166.1 / 166.1 | ✓ 667.8 / 166.1 / 166.1 | ✗ 600.0 / 150.0 / 50.0 | ✓ 667.8 / 166.1 / 166.1 |
| icm-007 | icm | heads-up | 530.0 / 470.0 | ✓ 530.0 / 470.0 | ✓ 530.0 / 470.0 | ✗ 450.0 / 550.0 | ✓ 530.0 / 470.0 |
| icm-008 | icm | heads-up-lopsided | 635.0 / 365.0 | ✓ 635.0 / 365.0 | ✓ 635.0 / 365.0 | ✗ 550.0 / 450.0 | ✓ 635.0 / 365.0 |
| icm-009 | icm | four-handed | 329.6 / 288.3 / 232.1 / 150.1 | ✓ 329.6 / 288.3 / 232.1 / 150.1 | ✓ 329.6 / 288.3 / 232.1 / 150.1 | ✗ 500.0 / 300.0 / 150.0 / 50.0 | ✓ 329.6 / 288.3 / 232.1 / 150.1 |
| icm-010 | icm | four-handed-even | 250.0 / 250.0 / 250.0 / 250.0 | ✓ 250.0 / 250.0 / 250.0 / 250.0 | ✓ 250.0 / 250.0 / 250.0 / 250.0 | ✗ 250.0 / 150.0 / 75.0 / 25.0 | ✓ 250.0 / 250.0 / 250.0 / 250.0 |
| icm-011 | icm | five-handed | - | ✗ no answer (budget) | ✗ no answer (budget) | ✗ 250.0 / 175.0 / 125.0 / 100.0 / 50.0 | ✓ 278.7 / 228.9 / 191.7 / 166.7 / 134.0 |
| icm-012 | icm | five-handed-leader | 361.9 / 159.5 / 159.5 / 159.5 / 159.5 | ✓ 361.9 / 159.5 / 159.5 / 159.5 / 159.5 | ✓ 361.9 / 159.5 / 159.5 / 159.5 / 159.5 | ✗ 400.0 / 62.5 / 62.5 / 62.5 / 62.5 | ✓ 361.9 / 159.5 / 159.5 / 159.5 / 159.5 |
| icm-013 | icm | six-handed | - | ✗ no answer (budget) | ✓ 215.1 / 200.7 / 183.8 / 163.6 / 137.6 / 99.2 | ✗ 164.3 / 113.3 / 83.3 / 66.8 / 50.3 / 22.3 | ✓ 215.1 / 200.7 / 183.8 / 163.6 / 137.6 / 99.2 |
| icm-014 | icm | final-table-bubble | 246.1 / 246.1 / 246.1 / 246.1 / 15.8 | ✓ 246.1 / 246.1 / 246.1 / 246.1 / 15.8 | ✓ 246.1 / 246.1 / 246.1 / 246.1 / 15.8 | ✗ 500.0 / 300.0 / 200.0 / 0.0 / 0.0 | ✓ 246.1 / 246.1 / 246.1 / 246.1 / 15.8 |
| icm-015 | icm | more-players-than-payouts | 286.8 / 201.9 / 201.9 / 154.7 / 154.7 | ✓ 286.8 / 201.9 / 201.9 / 154.7 / 154.7 | ✓ 286.8 / 201.9 / 201.9 / 154.7 / 154.7 | ✗ 400.0 / 200.0 / 200.0 / 150.0 / 150.0 | ✓ 286.8 / 201.9 / 201.9 / 154.7 / 154.7 |
| icm-016 | icm | one-payout | 500.0 / 300.0 / 200.0 | ✓ 500.0 / 300.0 / 200.0 | ✓ 500.0 / 300.0 / 200.0 | ✗ 1000.0 / 600.0 / 400.0 | ✓ 500.0 / 300.0 / 200.0 |
| rg-001 | range | premium | raise | ✓ raise | ✓ raise | ✓ raise | ✓ raise |
| rg-002 | range | premium | raise | ✓ raise | ✓ raise | ✓ raise | ✓ raise |
| rg-003 | range | premium | raise | ✓ raise | ✓ raise | ✓ raise | ✓ raise |
| rg-004 | range | trash | fold | ✓ fold | ✓ fold | ✓ fold | ✓ fold |
| rg-005 | range | trash | fold | ✓ fold | ✓ fold | ✓ fold | ✓ fold |
| rg-006 | range | trash | fold | ✓ fold | ✓ fold | ✓ fold | ✓ fold |
| rg-007 | range | position-sensitive | raise | ✓ raise | ✓ raise | ✓ fold | ✓ raise |
| rg-008 | range | position-sensitive | raise | ✓ raise | ✓ raise | ✓ raise | ✓ raise |
| rg-009 | range | position-sensitive | fold | ✓ fold | ✓ fold | ✓ fold | ✓ fold |
| rg-010 | range | position-sensitive | raise | ✓ raise | ✓ raise | ✓ raise | ✓ raise |
| rg-011 | range | position-sensitive | fold | ✗ raise | ✓ fold | ✓ fold | ✓ fold |
| rg-012 | range | position-sensitive | raise | ✓ raise | ✓ raise | ✓ raise | ✓ raise |
| rg-013 | range | position-sensitive | fold | ✓ fold | ✓ fold | ✓ fold | ✓ fold |
| rg-014 | range | position-sensitive | raise | ✓ raise | ✓ raise | ✓ raise | ✓ raise |
| rg-015 | range | boundary | raise | ✓ raise | ✓ raise | ✓ raise | ✓ raise |
| rg-016 | range | boundary | fold | ✗ raise | ✓ fold | ✗ raise | ✓ fold |
| rg-017 | range | boundary | raise | ✓ raise | ✓ raise | ✓ raise | ✓ raise |
| rg-018 | range | boundary | fold | ✓ fold | ✓ fold | ✗ raise | ✓ fold |
| rg-019 | range | boundary | raise | ✓ raise | ✓ raise | ✓ raise | ✓ raise |
| rg-020 | range | boundary | raise | ✓ raise | ✓ raise | ✗ fold | ✓ raise |
| rg-021 | range | bb-defence | call | ✓ call | ✓ call | ✗ fold | ✓ call |
| rg-022 | range | bb-defence | call | ✗ fold | ✓ call | ✗ fold | ✓ call |
| rg-023 | range | bb-defence | fold | ✓ call | ✓ fold | ✓ fold | ✓ fold |
| rg-024 | range | bb-defence | call | ✓ call | ✓ call | ✓ call | ✓ call |
| rg-025 | range | bb-defence | call | ✓ call | ✓ call | ✓ call | ✓ call |
| rg-026 | range | bb-defence | call | ✓ call | ✓ call | ✓ call | ✓ call |
| rg-027 | range | bb-defence | fold | ✓ fold | ✓ fold | ✓ fold | ✓ fold |
| rg-028 | range | bb-defence | fold | ✓ fold | ✓ fold | ✓ fold | ✓ fold |

### How these runs were made

| run | model | temperature | prompt | tools | baseline |
| --- | --- | --- | --- | --- | --- |
| anthropic:claude-sonnet-5, unaided | anthropic:claude-sonnet-5 | default | v1 | - | `anthropic-sonnet-5.json` |
| anthropic:claude-sonnet-5, with tools | anthropic:claude-sonnet-5 | default | v1 | `node bin/mcp-server.mjs` | `anthropic-sonnet-5+tools.json` |
| openai:gpt-4o-mini, unaided | openai:gpt-4o-mini | 0 | v1 | - | `openai-4o-mini.json` |
| openai:gpt-4o-mini, with tools | openai:gpt-4o-mini | 0 | v1 | `node bin/mcp-server.mjs` | `openai-4o-mini+tools.json` |

## variants.jsonl — 36 cases

4 runs, 2 models: anthropic:claude-sonnet-5, openai:gpt-4o-mini.

### By task

| run | equity | all | no answer | tool calls |
| --- | --- | --- | --- | --- |
| anthropic:claude-sonnet-5, unaided | 9/36 | **9/36** | 15 | - |
| anthropic:claude-sonnet-5, with tools | 36/36 | **36/36** | 0 | 36 (0 failed) |
| openai:gpt-4o-mini, unaided | 4/36 | **4/36** | 0 | - |
| openai:gpt-4o-mini, with tools | 32/36 | **32/36** | 2 | 59 (21 failed) |

### By game

| game | cases | anthropic:claude-sonnet-5, unaided | anthropic:claude-sonnet-5, with tools | openai:gpt-4o-mini, unaided | openai:gpt-4o-mini, with tools | note |
| --- | --- | --- | --- | --- | --- | --- |
| shortdeck | 8 | 4/8 | 8/8 | 0/8 | 8/8 |  |
| plo | 12 | 2/12 | 12/12 | 1/12 | 12/12 |  |
| omaha-hi-lo | 8 | 1/8 | 8/8 | 1/8 | 7/8 |  |
| plo5 | 4 | 1/4 | 4/4 | 1/4 | 1/4 |  |
| plo6 | 4 | 1/4 | 4/4 | 1/4 | 4/4 |  |

### By kind of spot

Weakest first, by the run that did worst on it. A tag with one or two
cases is a pointer to look, not a measurement.

| kind of spot | cases | anthropic:claude-sonnet-5, unaided | anthropic:claude-sonnet-5, with tools | openai:gpt-4o-mini, unaided | openai:gpt-4o-mini, with tools | note |
| --- | --- | --- | --- | --- | --- | --- |
| hilo-aces | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| hilo-counterfeit-risk | 1 | 0/1 | 1/1 | 0/1 | 0/1 | _thin_ |
| hilo-high-only | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| hilo-made-low | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| hilo-multiway | 1 | 0/1 | 1/1 | 1/1 | 1/1 | _thin_ |
| hilo-no-low-board | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| hilo-quartered | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| hilo-scoop-draw | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| plo-aces | 2 | 1/2 | 2/2 | 0/2 | 2/2 | _thin_ |
| plo-board-plays | 1 | 0/1 | 1/1 | 1/1 | 1/1 | _thin_ |
| plo-made-vs-draw | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| plo-multiway | 2 | 0/2 | 2/2 | 0/2 | 2/2 | _thin_ |
| plo-nut-draw-vs-top-set | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| plo-one-card-flush | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| plo-rundown | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| plo-turn | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| plo-two-must-play | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| plo-wrap-vs-set | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| plo5-aces | 1 | 0/1 | 1/1 | 0/1 | 0/1 | _thin_ |
| plo5-draw-heavy | 1 | 0/1 | 1/1 | 0/1 | 0/1 | _thin_ |
| plo5-turn | 1 | 0/1 | 1/1 | 0/1 | 0/1 | _thin_ |
| plo6-aces | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| plo6-draw-heavy | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| plo6-flop | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| short-connectors | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| short-draw-vs-pair | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| short-flush-beats-boat | 2 | 2/2 | 2/2 | 0/2 | 2/2 | _thin_ |
| short-multiway | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| short-overcards | 1 | 1/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| short-premium | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| short-wheel-straight | 1 | 0/1 | 1/1 | 0/1 | 1/1 | _thin_ |
| plo5-one-card-flush | 1 | 1/1 | 1/1 | 1/1 | 1/1 | _thin_ |
| plo6-one-card-flush | 1 | 1/1 | 1/1 | 1/1 | 1/1 | _thin_ |

### Cases no run passed (0)

_none: every case was passed by at least one run._

### Every case

What each run answered, against the truth. The tables above are these
rows counted.

| case | kind | tag | truth | anthropic:claude-sonnet-5, unaided | anthropic:claude-sonnet-5, with tools | openai:gpt-4o-mini, unaided | openai:gpt-4o-mini, with tools |
| --- | --- | --- | --- | --- | --- | --- | --- |
| veq-001 | equity (plo) | plo-one-card-flush | 0.0 | ✓ 0.0 | ✓ 0.0 | ✗ 25.0 | ✓ 0.0 |
| veq-002 | equity (plo) | plo-board-plays | - | ✗ no answer (budget) | ✓ 0.0 | ✓ 0.0 | ✓ 0.0 |
| veq-003 | equity (plo) | plo-two-must-play | - | ✗ no answer (budget) | ✓ 94.3 | ✗ 36.4 | ✓ 94.3 |
| veq-004 | equity (plo) | plo-aces | 63.4 | ✗ 72.5 | ✓ 63.1 | ✗ 83.3 | ✓ 63.1 |
| veq-005 | equity (plo) | plo-aces | 58.1 | ✓ 57.3 | ✓ 57.7 | ✗ 66.7 | ✓ 57.7 |
| veq-006 | equity (plo) | plo-rundown | 40.0 | ✗ 43.0 | ✓ 39.0 | ✗ 29.2 | ✓ 39.0 |
| veq-007 | equity (plo) | plo-wrap-vs-set | - | ✗ no answer (budget) | ✓ 42.6 | ✗ 25.0 | ✓ 42.6 |
| veq-008 | equity (plo) | plo-nut-draw-vs-top-set | 39.6 | ✗ 0.0 | ✓ 39.6 | ✗ 0.0 | ✓ 39.6 |
| veq-009 | equity (plo) | plo-made-vs-draw | - | ✗ no answer (budget) | ✓ 84.8 | ✗ 75.0 | ✓ 84.8 |
| veq-010 | equity (plo) | plo-multiway | 54.5 | ✗ 61.5 | ✓ 54.6 | ✗ 66.7 | ✓ 54.6 |
| veq-011 | equity (plo) | plo-multiway | - | ✗ no answer (budget) | ✓ 25.8 | ✗ 56.3 | ✓ 25.8 |
| veq-012 | equity (plo) | plo-turn | - | ✗ no answer (budget) | ✓ 30.0 | ✗ 36.4 | ✓ 30.0 |
| veq-013 | equity (plo5) | plo5-aces | 61.9 | ✗ 65.5 | ✓ 62.2 | ✗ 66.7 | ✗ 49.8 |
| veq-014 | equity (plo5) | plo5-one-card-flush | 0.0 | ✓ 0.0 | ✓ 0.0 | ✓ 0.0 | ✓ 0.0 |
| veq-015 | equity (plo5) | plo5-draw-heavy | - | ✗ no answer (budget) | ✓ 57.0 | ✗ 36.4 | ✗ 25.5 |
| veq-016 | equity (plo5) | plo5-turn | - | ✗ no answer (budget) | ✓ 31.6 | ✗ 36.4 | ✗ no answer (budget) |
| veq-017 | equity (plo6) | plo6-aces | 58.0 | ✗ 68.5 | ✓ 58.5 | ✗ 66.7 | ✓ 58.5 |
| veq-018 | equity (plo6) | plo6-one-card-flush | 0.0 | ✓ 0.0 | ✓ 0.0 | ✓ 0.0 | ✓ 0.0 |
| veq-019 | equity (plo6) | plo6-draw-heavy | - | ✗ no answer (budget) | ✓ 67.3 | ✗ 0.0 | ✓ 67.3 |
| veq-020 | equity (plo6) | plo6-flop | - | ✗ no answer (budget) | ✓ 74.9 | ✗ 56.3 | ✓ 74.9 |
| veq-021 | equity (shortdeck) | short-flush-beats-boat | 6.9 | ✓ 6.9 | ✓ 6.9 | ✗ 66.7 | ✓ 6.9 |
| veq-022 | equity (shortdeck) | short-flush-beats-boat | 93.1 | ✓ 93.1 | ✓ 93.1 | ✗ 66.7 | ✓ 93.1 |
| veq-023 | equity (shortdeck) | short-wheel-straight | 88.5 | ✗ 93.1 | ✓ 88.5 | ✗ 36.4 | ✓ 88.5 |
| veq-024 | equity (shortdeck) | short-premium | 74.3 | ✗ 81.7 | ✓ 74.3 | ✗ 82.3 | ✓ 74.3 |
| veq-025 | equity (shortdeck) | short-overcards | 54.3 | ✓ 53.7 | ✓ 54.3 | ✗ 44.0 | ✓ 54.3 |
| veq-026 | equity (shortdeck) | short-connectors | 39.7 | ✓ 39.5 | ✓ 39.7 | ✗ 29.6 | ✓ 39.7 |
| veq-027 | equity (shortdeck) | short-draw-vs-pair | - | ✗ no answer (budget) | ✓ 52.0 | ✗ 36.4 | ✓ 52.0 |
| veq-028 | equity (shortdeck) | short-multiway | 55.9 | ✗ 68.4 | ✓ 56.1 | ✗ 82.0 | ✓ 56.1 |
| veq-029 | equity (omaha-hi-lo) | hilo-made-low | - | ✗ no answer (budget) | ✓ 61.0 | ✗ 50.0 | ✓ 61.0 |
| veq-030 | equity (omaha-hi-lo) | hilo-counterfeit-risk | - | ✗ no answer (budget) | ✓ 73.5 | ✗ 42.0 | ✗ no answer (budget) |
| veq-031 | equity (omaha-hi-lo) | hilo-no-low-board | 4.4 | ✓ 5.5 | ✓ 4.4 | ✗ 0.0 | ✓ 4.4 |
| veq-032 | equity (omaha-hi-lo) | hilo-scoop-draw | - | ✗ no answer (budget) | ✓ 39.8 | ✗ 0.0 | ✓ 39.8 |
| veq-033 | equity (omaha-hi-lo) | hilo-aces | 65.0 | ✗ 87.5 | ✓ 65.0 | ✗ 38.5 | ✓ 64.9 |
| veq-034 | equity (omaha-hi-lo) | hilo-high-only | 45.1 | ✗ 29.0 | ✓ 45.1 | ✗ 66.7 | ✓ 45.1 |
| veq-035 | equity (omaha-hi-lo) | hilo-quartered | - | ✗ no answer (budget) | ✓ 66.1 | ✗ 50.0 | ✓ 66.1 |
| veq-036 | equity (omaha-hi-lo) | hilo-multiway | 43.3 | ✗ 57.3 | ✓ 43.5 | ✓ 45.0 | ✓ 43.5 |

### How these runs were made

| run | model | temperature | prompt | tools | baseline |
| --- | --- | --- | --- | --- | --- |
| anthropic:claude-sonnet-5, unaided | anthropic:claude-sonnet-5 | default | v1 | - | `anthropic-sonnet-5-variants.json` |
| anthropic:claude-sonnet-5, with tools | anthropic:claude-sonnet-5 | default | v1 | `node examples/poker/mcp-server.mjs` | `anthropic-sonnet-5-variants+tools.json` |
| openai:gpt-4o-mini, unaided | openai:gpt-4o-mini | 0 | v1 | - | `openai-4o-mini-variants.json` |
| openai:gpt-4o-mini, with tools | openai:gpt-4o-mini | 0 | v1 | `node examples/poker/mcp-server.mjs` | `openai-4o-mini-variants+tools.json` |
