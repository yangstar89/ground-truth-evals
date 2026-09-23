/**
 * A second domain, in about eighty lines: date arithmetic.
 *
 * It exists to show what a suite is, and to keep the claim that the harness is
 * domain-free honest. Poker needs a thousand lines of oracle; this needs none,
 * because the answers come from the calendar. Everything else - running the
 * model, caching replies, grading, summarising, diffing against a baseline,
 * the report - is the same code that runs the poker suite.
 *
 * Two task types, because most of what a harness does only shows up when a run
 * mixes them: results are reported per type and errors are never averaged
 * across units.
 *
 *   days   how many days between two dates, in days
 *   day    which weekday a date falls on, as a choice of seven
 */
import { CONTRACT } from '../../src/protocol.js';
import { numeric, choice } from '../../src/graders/score.js';

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** Midnight UTC, so no run is ever decided by the machine's time zone. */
export const utc = (iso) => new Date(`${iso}T00:00:00Z`);

/** The truth, computed rather than looked up. */
export const daysBetween = (from, to) => Math.round((utc(to) - utc(from)) / 86400000);
export const weekdayOf = (iso) => WEEKDAYS[(utc(iso).getUTCDay() + 6) % 7];

const days = {
  prompt: (k) => [
    'You are computing a number of days between two dates.',
    '',
    `From: ${k.from}`,
    `To: ${k.to}`,
    '',
    'Give the whole number of days from the first date to the second.',
    'Count forward: if the second date is earlier, the answer is negative.',
    '',
    CONTRACT,
    'Schema: {"days": <integer>}',
  ].join('\n'),
  fromObject: (k, obj) => (typeof obj.days === 'number' && Number.isFinite(obj.days) ? obj.days : undefined),
  fromProse: (k, text) => {
    const m = text.match(/-?\d+/);
    return m ? Number(m[0]) : undefined;
  },
  // Dates are exact, so the tolerance is zero: a day out is wrong.
  grade: (k, got) => numeric({ got, expected: k.expected, tolerance: 0, unit: 'days', dp: 0 }),
};

const day = {
  prompt: (k) => [
    'You are naming the day of the week a date falls on.',
    '',
    `Date: ${k.date}`,
    '',
    `Answer with one of: ${WEEKDAYS.join(', ')}.`,
    '',
    CONTRACT,
    'Schema: {"weekday": "<day>"}',
  ].join('\n'),
  fromObject: (k, obj) => {
    const s = obj.weekday ?? obj.day;
    return typeof s === 'string' && WEEKDAYS.includes(s.trim().toLowerCase()) ? s.trim().toLowerCase() : undefined;
  },
  fromProse: (k, text) => WEEKDAYS.find((d) => new RegExp(`\\b${d}\\b`, 'i').test(text)),
  // One right answer out of seven: the weights a choice grader wants are a
  // hundred on the truth and nothing anywhere else.
  grade: (k, got) => choice({
    got,
    weights: Object.fromEntries(WEEKDAYS.map((d) => [d, d === k.expected ? 100 : 0])),
    unit: 'frequency points',
    describe: ({ primary }) => `said ${got}, ${k.date} was a ${primary}`,
  }),
};

export default {
  name: 'dates',
  systemPrompt: 'You are a precise calendar calculator. Follow the output schema exactly.',
  unreadableReply: 'That depends on the calendar you mean.',
  tasks: { days, day },
  /** How the fake model answers, so the pipeline runs with no API key. */
  stub(kase, { draw, wildlyWrong }) {
    if (kase.type === 'days') {
      const value = wildlyWrong ? kase.expected + 1 + Math.floor(draw('off') * 30) : kase.expected;
      return { json: { days: value }, prose: `It is ${value} days.` };
    }
    if (kase.type === 'day') {
      const i = WEEKDAYS.indexOf(kase.expected);
      const value = wildlyWrong ? WEEKDAYS[(i + 1 + Math.floor(draw('off') * 6)) % 7] : kase.expected;
      return { json: { weekday: value }, prose: `That was a ${value}.` };
    }
    return null;
  },
};
