import { describe, it, expect } from 'vitest';
import { parseEnv } from './env.js';

describe('parseEnv', () => {
  it('reads plain assignments', () => {
    expect(parseEnv('A=1\nB=two')).toEqual({ A: '1', B: 'two' });
  });
  it('ignores blanks and comments', () => {
    expect(parseEnv('\n# a comment\n\nA=1\n')).toEqual({ A: '1' });
  });
  it('strips matching quotes but keeps inner spaces', () => {
    expect(parseEnv('A="a b"\nB=\'c d\'')).toEqual({ A: 'a b', B: 'c d' });
  });
  it('drops a trailing comment only when unquoted', () => {
    expect(parseEnv('A=sk-live # real key')).toEqual({ A: 'sk-live' });
    expect(parseEnv('A="sk-live # not a comment"')).toEqual({ A: 'sk-live # not a comment' });
  });
  it('tolerates export and CRLF', () => {
    expect(parseEnv('export A=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' });
  });
  it('keeps an empty value distinguishable', () => {
    expect(parseEnv('OPENAI_API_KEY=')).toEqual({ OPENAI_API_KEY: '' });
  });
  it('skips malformed lines rather than guessing', () => {
    expect(parseEnv('no-equals\n=novalue\n1BAD=x\nA=1')).toEqual({ A: '1' });
  });
  it('does not mangle a value containing an equals sign', () => {
    expect(parseEnv('A=a=b=c')).toEqual({ A: 'a=b=c' });
  });
});
