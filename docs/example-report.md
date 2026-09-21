# Eval run — stub(seed=1,skill=0.55)

| model | temperature | cases | pass rate | schema ignored | unreadable | out of budget | request failed | wall clock |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stub(seed=1,skill=0.55) | n/a | 75 | 58.7% | 13 | 2 | 0 | 0 | 0.0s |

## By task

| task | n | passed | pass rate | mean error | worst error |
| --- | --- | --- | --- | --- | --- |
| equity | 31 | 16 | 51.6% | 12.17 percentage points | 39.96 percentage points |
| icm | 16 | 11 | 68.8% | 66.13 USD | 412.22 USD |
| range | 28 | 17 | 60.7% | 38.57 frequency points | 100.00 frequency points |

## By kind of spot

Weakest first. This is the column that says what the model does not know.

Tags marked _thin_ carry fewer than three cases, so their rate is one or two
answers rather than a measurement - read them as a pointer to look, not as a
number to quote.

| tag | n | passed | pass rate | note |
| --- | --- | --- | --- | --- |
| flat-payouts | 1 | 0 | 0.0% | _thin_ |
| flush-draw-vs-pair | 1 | 0 | 0.0% | _thin_ |
| leader-three | 1 | 0 | 0.0% | _thin_ |
| multiway-flop | 2 | 0 | 0.0% | _thin_ |
| multiway-preflop | 3 | 0 | 0.0% |  |
| open-ender-vs-pair | 1 | 0 | 0.0% | _thin_ |
| set-vs-overpair | 1 | 0 | 0.0% | _thin_ |
| shortstack-three | 1 | 0 | 0.0% | _thin_ |
| six-handed | 1 | 0 | 0.0% | _thin_ |
| steep-payouts | 1 | 0 | 0.0% | _thin_ |
| turn-ahead | 1 | 0 | 0.0% | _thin_ |
| turn-draw | 1 | 0 | 0.0% | _thin_ |
| two-pair-vs-draw | 1 | 0 | 0.0% | _thin_ |
| position-sensitive | 8 | 2 | 25.0% |  |
| made-vs-draw | 3 | 1 | 33.3% |  |
| trash | 3 | 1 | 33.3% |  |
| dominated | 3 | 2 | 66.7% |  |
| premium | 3 | 2 | 66.7% |  |
| premium-vs-premium | 3 | 2 | 66.7% |  |
| boundary | 6 | 5 | 83.3% |  |
| bb-defence | 8 | 7 | 87.5% |  |
| bubble-three | 1 | 1 | 100.0% | _thin_ |
| dry-flop-domination | 1 | 1 | 100.0% | _thin_ |
| even-three | 1 | 1 | 100.0% | _thin_ |
| final-table-bubble | 1 | 1 | 100.0% | _thin_ |
| five-handed | 1 | 1 | 100.0% | _thin_ |
| five-handed-leader | 1 | 1 | 100.0% | _thin_ |
| flip | 3 | 3 | 100.0% |  |
| four-handed | 1 | 1 | 100.0% | _thin_ |
| four-handed-even | 1 | 1 | 100.0% | _thin_ |
| heads-up | 1 | 1 | 100.0% | _thin_ |
| heads-up-lopsided | 1 | 1 | 100.0% | _thin_ |
| longshot | 2 | 2 | 100.0% | _thin_ |
| more-players-than-payouts | 1 | 1 | 100.0% | _thin_ |
| one-payout | 1 | 1 | 100.0% | _thin_ |
| river-chop | 1 | 1 | 100.0% | _thin_ |
| river-lost | 1 | 1 | 100.0% | _thin_ |
| river-won | 1 | 1 | 100.0% | _thin_ |
| turn-behind | 1 | 1 | 100.0% | _thin_ |
| underdog-flop | 1 | 1 | 100.0% | _thin_ |

## Failures (31)

| id | task | detail |
| --- | --- | --- |
| eq-003 | equity | said 100.0%, truth 92.6% (7.4pp out, tolerance 2.5) |
| eq-007 | equity | no answer could be read from the reply: no answer found in reply |
| eq-012 | equity | said 38.4%, truth 60.7% (22.3pp out, tolerance 2) |
| eq-014 | equity | said 100.0%, truth 76.1% (23.9pp out, tolerance 2) |
| eq-015 | equity | said 69.1%, truth 91.1% (22.0pp out, tolerance 2) |
| eq-016 | equity | said 97.0%, truth 60.4% (36.6pp out, tolerance 2) |
| eq-018 | equity | said 23.4%, truth 55.1% (31.7pp out, tolerance 2) |
| eq-019 | equity | said 68.6%, truth 34.2% (34.4pp out, tolerance 2) |
| eq-021 | equity | said 19.2%, truth 34.1% (14.9pp out, tolerance 2) |
| eq-023 | equity | no answer could be read from the reply: no answer found in reply |
| eq-027 | equity | said 89.0%, truth 63.8% (25.2pp out, tolerance 2.5) |
| eq-028 | equity | said 71.2%, truth 34.7% (36.5pp out, tolerance 2.5) |
| eq-029 | equity | said 45.2%, truth 24.9% (20.3pp out, tolerance 2.5) |
| eq-030 | equity | said 21.4%, truth 51.2% (29.8pp out, tolerance 2.5) |
| eq-031 | equity | said 44.6%, truth 84.6% (40.0pp out, tolerance 2.5) |
| icm-002 | icm | worst seat 1: said 700.0, truth 434.7 (265.3 out, tolerance 20.0) |
| icm-003 | icm | worst seat 1: said 50.0, truth 224.1 (174.1 out, tolerance 20.0) |
| icm-005 | icm | worst seat 1: said 800.0, truth 387.8 (412.2 out, tolerance 20.0) |
| icm-006 | icm | worst seat 1: said 800.0, truth 667.8 (132.2 out, tolerance 20.0) |
| icm-013 | icm | worst seat 1: said 285.7, truth 215.1 (70.6 out, tolerance 20.0) |
| rg-002 | range | said fold, chart says raise |
| rg-005 | range | said raise, chart says fold |
| rg-006 | range | said call, chart says fold |
| rg-007 | range | said call, chart plays it 0% of the time (most frequent: raise at 80%) |
| rg-009 | range | said call, chart says fold |
| rg-010 | range | said fold, chart says raise |
| rg-011 | range | said call, chart says fold |
| rg-012 | range | said call, chart says raise |
| rg-013 | range | said call, chart says fold |
| rg-016 | range | said raise, chart says fold |
| rg-027 | range | said raise, chart says fold |
