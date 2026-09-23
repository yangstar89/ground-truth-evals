/**
 * Scoring shapes a suite composes its graders from.
 *
 * Three shapes cover most computable domains: a number within a tolerance, a
 * vector judged by its worst element, and a choice from a fixed set. Each
 * returns the envelope the harness expects - pass, error, unit, detail - so a
 * suite writes what its units are and what close enough means, and nothing
 * else.
 *
 * A suite is free to ignore all of this and return the envelope itself; these
 * exist so that the common cases are three lines rather than twenty.
 */

/** A number, scored by absolute error against a tolerance. */
export function numeric({ got, expected, tolerance, unit, dp = 1, label = '' }) {
  const error = Math.abs(got - expected);
  const what = label ? `${label}: ` : '';
  return {
    pass: error <= tolerance,
    error,
    unit,
    expected,
    got,
    detail: `${what}said ${got.toFixed(dp)}, truth ${expected.toFixed(dp)} (${error.toFixed(dp)} out, tolerance ${tolerance})`,
  };
}

/**
 * A vector, scored by its worst element. The worst is the right summary
 * because an average would let a catastrophic seat hide behind good ones.
 */
export function worstOf({ got, expected, tolerance, unit, dp = 1, elementName = 'element' }) {
  let worst = 0;
  let at = 0;
  for (let i = 0; i < expected.length; i++) {
    const e = Math.abs(got[i] - expected[i]);
    if (e > worst) { worst = e; at = i; }
  }
  return {
    pass: worst <= tolerance,
    error: worst,
    unit,
    expected,
    got,
    detail: `worst ${elementName} ${at + 1}: said ${got[at].toFixed(dp)}, truth ${expected[at].toFixed(dp)} (${worst.toFixed(dp)} out, tolerance ${tolerance.toFixed(dp)})`,
  };
}

/**
 * A choice from a fixed set, where more than one answer may be acceptable.
 *
 * `weights` says how often the truth plays each option; anything with a
 * non-zero weight passes, and the distance from the most-frequent option is
 * the error - so a model that always takes a 5% branch still shows up in the
 * numbers rather than scoring the same as one that takes the 95% branch.
 */
export function choice({ got, weights, unit = 'frequency points', describe }) {
  const entries = Object.entries(weights);
  const primary = entries.reduce((best, e) => (e[1] > best[1] ? e : best), entries[0])[0];
  const weight = weights[got] ?? 0;
  const mixed = entries.filter(([, w]) => w > 0).length > 1;
  return {
    pass: weight > 0,
    error: (weights[primary] ?? 0) - weight,
    unit,
    expected: primary,
    got,
    mixed,
    frequency: weight,
    detail: describe
      ? describe({ got, primary, weight, mixed, weights })
      : mixed
        ? `said ${got}, truth plays it ${weight}% of the time (most frequent: ${primary} at ${weights[primary]}%)`
        : `said ${got}, truth says ${primary}`,
  };
}
