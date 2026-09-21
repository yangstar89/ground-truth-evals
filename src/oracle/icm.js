/**
 * ICM equity by the Malmuth-Harville model.
 *
 * Taken from another of the author's projects, so the harness
 * has no runtime dependency on that repository. The model is standard published
 * tournament mathematics rather than anything proprietary: a player's chance of
 * finishing first is taken as their share of the chips in play, and the model
 * recurses over who finishes next with that player removed.
 *
 * It is exact for the model, so it needs no sampling and no tolerance beyond
 * floating point.
 */
export function calculateICM(stacks, payouts) {
  const totalChips = stacks.reduce((a, b) => a + b, 0);
  if (totalChips === 0) return stacks.map(() => 0);

  const n = stacks.length;
  const equities = new Array(n).fill(0);

  function recurse(remaining, payoutIndex, probability) {
    if (payoutIndex >= payouts.length || remaining.length === 0) return;

    const totalRemaining = remaining.reduce((sum, p) => sum + p.chips, 0);
    if (totalRemaining === 0) return;

    for (const player of remaining) {
      const prob = probability * (player.chips / totalRemaining);
      equities[player.index] += prob * payouts[payoutIndex];

      const next = remaining.filter((p) => p.index !== player.index);
      recurse(next, payoutIndex + 1, prob);
    }
  }

  const players = stacks.map((chips, index) => ({ chips, index }));
  recurse(players, 0, 1);

  return equities;
}
