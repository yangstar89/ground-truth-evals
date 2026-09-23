/**
 * The dates suite, which is also the test that the harness is domain-free:
 * a suite written in eighty lines, with no oracle behind it, runs through the
 * same prompting, parsing, grading and summarising as the poker one.
 */
import { describe, it, expect } from 'vitest';
import { buildPrompt, parseAnswer } from '../../src/protocol.js';
import { grade, summarise } from '../../src/graders/index.js';
import { createStubRunner } from '../../src/runners/stub.js';
import suite, { daysBetween, weekdayOf } from './suite.js';

const daysCase = { id: 'days-1', type: 'days', tag: 'leap-day', from: '2024-02-28', to: '2024-03-01', expected: 2 };
const dayCase = { id: 'day-1', type: 'day', tag: 'historic', date: '1969-07-20', expected: 'sunday' };

describe('the truth it computes', () => {
  it('knows which years are leap years, including the century rule', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2023-02-28', '2023-03-01')).toBe(1);
    // 1900 is not a leap year; 2000 is, being divisible by 400.
    expect(daysBetween('1900-02-28', '1900-03-01')).toBe(1);
    expect(daysBetween('2000-02-28', '2000-03-01')).toBe(2);
  });

  it('counts backwards as a negative number rather than a distance', () => {
    expect(daysBetween('2024-06-01', '2024-05-20')).toBe(-12);
    expect(daysBetween('2024-05-05', '2024-05-05')).toBe(0);
  });

  it('names weekdays that can be checked against known dates', () => {
    expect(weekdayOf('1969-07-20')).toBe('sunday');
    expect(weekdayOf('2000-01-01')).toBe('saturday');
    expect(weekdayOf('2024-02-29')).toBe('thursday');
  });

  it('is decided by the date, not by the machine\'s time zone', () => {
    // Computed at midnight UTC, so a machine in Auckland scores the same.
    expect(weekdayOf('2024-03-01')).toBe('friday');
    expect(daysBetween('2024-01-01', '2024-12-31')).toBe(365);
  });
});

describe('running through the harness', () => {
  it('asks for one JSON object, as every suite must', () => {
    for (const kase of [daysCase, dayCase]) {
      expect(buildPrompt(suite, kase)).toContain('exactly one JSON object');
    }
  });

  it('reads the schema, and prose when the schema is ignored', () => {
    expect(parseAnswer(suite, daysCase, '{"days": 2}')).toMatchObject({ value: 2, recovered: false });
    expect(parseAnswer(suite, daysCase, 'about 2 days')).toMatchObject({ value: 2, recovered: true });
    expect(parseAnswer(suite, dayCase, 'It was a Sunday.')).toMatchObject({ value: 'sunday', recovered: true });
    expect(parseAnswer(suite, dayCase, '{"weekday": "funday"}').error).toBeTruthy();
  });

  it('scores days exactly: one day out is wrong, and the error says how far', () => {
    expect(grade(suite, daysCase, '{"days": 2}').pass).toBe(true);
    const off = grade(suite, daysCase, '{"days": 3}');
    expect([off.pass, off.error, off.unit]).toEqual([false, 1, 'days']);
  });

  it('scores a weekday as one right answer out of seven', () => {
    expect(grade(suite, dayCase, '{"weekday": "sunday"}').pass).toBe(true);
    const wrong = grade(suite, dayCase, '{"weekday": "monday"}');
    expect(wrong.pass).toBe(false);
    expect(wrong.detail).toContain('was a sunday');
  });

  it('reports the two task types separately, never blending days with weekdays', () => {
    const s = summarise([grade(suite, daysCase, '{"days": 9}'), grade(suite, dayCase, '{"weekday": "sunday"}')]);
    expect(s.byType.days.unit).toBe('days');
    expect(s.byType.day.unit).toBe('frequency points');
    // Days and frequency points cannot be averaged, so there is no overall figure.
    expect(s.overall.meanError).toBeNull();
  });

  it('runs the stub with no key and no network, and the graders can read it', async () => {
    const runner = createStubRunner(suite, { seed: 1, skill: 1 });
    for (const kase of [daysCase, dayCase]) {
      const { text } = await runner.complete(kase);
      expect(grade(suite, kase, text).pass).toBe(true);
    }
  });
});
