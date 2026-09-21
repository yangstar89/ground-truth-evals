/**
 * A deterministic fake model.
 *
 * It exists so the whole pipeline - prompt, reply, parse, grade, summarise,
 * diff, report - can be exercised and tested without an API key and without
 * spending anything. It is not a mock in the testing sense: it answers from the
 * case's own ground truth, perturbed on purpose, so a stub run produces a
 * report that looks like a real one.
 *
 * The perturbations are chosen to imitate how models actually fail rather than
 * to be uniformly random:
 *
 *   - most answers are close but rounded
 *   - some are badly wrong, the way a confident guess is wrong
 *   - ICM answers sometimes chip-chop, which is exactly the mistake the ICM
 *     task exists to catch
 *   - some replies ignore the JSON contract and answer in prose
 *   - a few are unreadable altogether
 *
 * Everything is a pure function of the case id and the seed, so two stub runs
 * with the same seed are byte-identical and a baseline diff of one against the
 * other is empty.
 */
import { getAction, getFrequencies } from '../oracle/ranges.js';

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

export function createStubRunner({ seed = 1, skill = 0.8 } = {}) {
  const name = `stub(seed=${seed},skill=${skill})`;
  return {
    name,
    model: name,
    async complete(kase) {
      const d = (stream) => draw(kase.id, seed, stream);
      const wildlyWrong = d('wrong') > skill;
      const ignoresSchema = d('schema') > 0.85;
      const unreadable = d('unreadable') > 0.96;

      if (unreadable) {
        return { text: 'This one really depends on the opponent, so I would not want to put a number on it.' };
      }

      if (kase.type === 'equity') {
        const truth = kase.expected * 100;
        // A rounded answer normally; a large miss when the draw says so.
        const jitter = (d('jitter') - 0.5) * 2.4;
        const value = wildlyWrong
          ? Math.max(0, Math.min(100, truth + (d('bigmiss') > 0.5 ? 1 : -1) * (12 + d('size') * 30)))
          : truth + jitter;
        const rounded = Math.round(value * 10) / 10;
        return {
          text: ignoresSchema
            ? `Hero is around ${rounded}% here.`
            : JSON.stringify({ equity_pct: rounded }),
        };
      }

      if (kase.type === 'icm') {
        const pool = kase.payouts.reduce((a, b) => a + b, 0);
        const chips = kase.stacks.reduce((a, b) => a + b, 0);
        // The classic error: treat chips as money.
        const chipChop = kase.stacks.map((s) => (s / chips) * pool);
        const source = wildlyWrong ? chipChop : kase.expected;
        const values = source.map((v) => Math.round(v * 10) / 10);
        return {
          text: ignoresSchema
            ? `Roughly ${values.join(', ')} in seat order.`
            : JSON.stringify({ icm: values }),
        };
      }

      if (kase.type === 'range') {
        const freqs = getFrequencies(kase.entry);
        const best = getAction(kase.entry);
        const others = ['raise', 'call', 'fold'].filter((a) => a !== best);
        const action = wildlyWrong ? others[Math.floor(d('pick') * others.length)] : best;
        // On a mixed hand, sometimes take the minority branch: still correct,
        // and it exercises the frequency reporting.
        const mixed = Object.values(freqs).filter((f) => f > 0).length > 1;
        const chosen = !wildlyWrong && mixed && d('minority') > 0.6
          ? Object.entries(freqs).filter(([, f]) => f > 0).sort((a, b) => a[1] - b[1])[0][0]
          : action;
        return {
          text: ignoresSchema ? `I would ${chosen}.` : JSON.stringify({ action: chosen }),
        };
      }

      throw new Error(`stub has no answer for case type ${kase.type}`);
    },
  };
}
