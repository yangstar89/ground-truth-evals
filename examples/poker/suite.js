/**
 * The poker suite: the worked example of what src/ evaluates.
 *
 * Poker is a good first domain because the answers are computable. `AcAd`
 * against `KcKd` on a `2c 7d 9h` flop has an exact equity, reachable by
 * walking every remaining board, so the grader is arithmetic rather than
 * opinion - no rubric, no model judging another model.
 *
 * Everything poker-specific lives under this directory: the oracle that
 * computes the truth, the cases with that truth frozen into them, the three
 * tasks, and an MCP server that hands the same oracle to a model as tools.
 */
import { tasks, stub } from './tasks.js';

export default {
  name: 'poker',
  systemPrompt: 'You are a precise poker calculator. Follow the output schema exactly.',
  unreadableReply: 'This one really depends on the opponent, so I would not want to put a number on it.',
  tasks,
  stub,
};
