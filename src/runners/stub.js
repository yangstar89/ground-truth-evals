/**
 * A deterministic fake model.
 *
 * It exists so the whole pipeline - prompt, reply, parse, grade, summarise,
 * diff, report - can be exercised and tested without an API key and without
 * spending anything. It is not a mock in the testing sense: it answers from the
 * case's own ground truth, perturbed on purpose, so a stub run produces a
 * report that looks like a real one.
 *
 * The split with the suite follows the same line as everywhere else. The dice
 * are here - which cases come out wrong, which ignore the schema, which are
 * unreadable, and the seeding that makes all of it repeatable. What a right
 * answer and a plausibly wrong answer look like is the suite's business, since
 * only it knows what a convincing mistake is in its domain.
 *
 * Everything is a pure function of the case id and the seed, so two stub runs
 * with the same seed are byte-identical and a baseline diff of one against the
 * other is empty.
 */

/** FNV-1a over the case id, mixed with the seed: stable across processes. */
function hash(id, seed) {
  let h = 0x811c9dc5 ^ (seed >>> 0);
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

/** Several independent draws per case, so behaviours do not correlate. */
const draw = (id, seed, stream) => hash(id + ':' + stream, seed);

const DEFAULT_UNREADABLE = 'That one really depends, so I would not want to put a number on it.';

export function createStubRunner(suite, { seed = 1, skill = 0.8 } = {}) {
  if (!suite?.stub) {
    throw new Error(`suite "${suite?.name ?? 'unknown'}" has no stub(); add one, or run against a real model`);
  }
  const name = `stub(seed=${seed},skill=${skill})`;
  return {
    name,
    model: name,
    async complete(kase) {
      const d = (stream) => draw(kase.id, seed, stream);
      const wildlyWrong = d('wrong') > skill;
      const ignoresSchema = d('schema') > 0.85;
      const unreadable = d('unreadable') > 0.96;

      if (unreadable) return { text: suite.unreadableReply ?? DEFAULT_UNREADABLE };

      const answer = suite.stub(kase, { draw: d, skill, wildlyWrong });
      if (!answer) throw new Error(`the stub for suite "${suite.name}" has no answer for case type ${kase.type}`);
      return { text: ignoresSchema && answer.prose ? answer.prose : JSON.stringify(answer.json) };
    },
  };
}
