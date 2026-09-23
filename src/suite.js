/**
 * The seam between the harness and a domain.
 *
 * Everything under src/ is domain-free: it runs models, caches replies, grades,
 * summarises, diffs against baselines and renders reports. It knows nothing
 * about poker, or about whatever you point it at. A *suite* supplies that
 * knowledge, and examples/poker is the worked example.
 *
 * A suite is a module with a default export:
 *
 *   name          what the suite is called, for run files and reports
 *   systemPrompt  one line setting the model's role
 *   tasks         one entry per case `type`, each a task object (below)
 *   stub          optional: how the deterministic fake model answers
 *
 * A task is four functions over a case. Only `prompt` and `grade` are
 * required; the two readers are how a reply becomes a value.
 *
 *   prompt(kase)          -> the text sent to the model
 *   fromObject(kase, obj) -> a value from the parsed JSON, or undefined
 *   fromProse(kase, text) -> a value from prose, or undefined
 *   grade(kase, value)    -> { pass, error, unit, detail, ... }
 *
 * Two rules the harness relies on and a domain must honour.
 *
 * A case carries its own ground truth and its own tolerance. Truth is frozen
 * into the case file when it is generated, never recomputed at grading time,
 * so a change to a default cannot move the target under a stored run.
 *
 * `grade` returns `error` as well as `pass`: the distance from truth in the
 * case's own units, and a `unit` naming them. A binary verdict cannot tell a
 * near miss from a catastrophe, and the harness refuses to average across
 * units, so the unit is not decoration.
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/** Load a suite module by path, and check it offers what the harness calls. */
export async function loadSuite(path) {
  const mod = await import(pathToFileURL(resolve(path)).href);
  const suite = mod.default ?? mod.suite;
  if (!suite) throw new Error(`${path} has no default export; a suite module must export one`);
  if (!suite.tasks || Object.keys(suite.tasks).length === 0) {
    throw new Error(`${path} exports no tasks; a suite needs at least one case type`);
  }
  for (const [type, task] of Object.entries(suite.tasks)) {
    for (const fn of ['prompt', 'grade']) {
      if (typeof task[fn] !== 'function') throw new Error(`task "${type}" in ${path} has no ${fn}()`);
    }
  }
  return { name: suite.name ?? path, systemPrompt: suite.systemPrompt ?? '', stub: suite.stub ?? null, ...suite };
}

/** The task for a case, or a readable error naming what the suite does offer. */
export function taskFor(suite, kase) {
  const task = suite.tasks[kase.type];
  if (!task) {
    throw new Error(`suite "${suite.name}" has no task for case type "${kase.type}"; it has: ${Object.keys(suite.tasks).join(', ')}`);
  }
  return task;
}
