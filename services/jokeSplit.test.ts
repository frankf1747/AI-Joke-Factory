import { describe, it, expect } from 'vitest';
import { splitJokes } from './jokeSplit';

describe('splitJokes', () => {
  it('splits a numbered "1) ... 2) ..." batch', () => {
    expect(splitJokes('1) Joke one\n2) Joke two\n3) Joke three')).toEqual([
      'Joke one',
      'Joke two',
      'Joke three',
    ]);
  });

  it('splits a "1. ... 2. ..." batch', () => {
    expect(splitJokes('1. Joke one\n2. Joke two')).toEqual(['Joke one', 'Joke two']);
  });

  it('splits plain newline-separated jokes (no numbers)', () => {
    const text =
      'Why did the scarecrow win an award? Because he was outstanding in his field.\n' +
      'Why don’t eggs tell jokes? They’d crack each other up.';
    expect(splitJokes(text)).toEqual([
      'Why did the scarecrow win an award? Because he was outstanding in his field.',
      'Why don’t eggs tell jokes? They’d crack each other up.',
    ]);
  });

  it('keeps a multi-paragraph numbered joke intact', () => {
    const text =
      '1. A man walks into a library and asks the librarian, “Do you have books on good decisions?”\n\n' +
      'The librarian says, “Yes, but are you sure you want one?”\n\n' +
      'The man says, “Maybe I should read it first.”\n\n' +
      '2. A student tells his teacher, “I don’t deserve a zero on this test.”\n\n' +
      'The teacher says, “You’re right, but zero is the lowest grade I’m allowed to give.”';
    const jokes = splitJokes(text);
    expect(jokes).toHaveLength(2);
    expect(jokes[0]).toContain('A man walks into a library');
    expect(jokes[0]).toContain('Maybe I should read it first');
    expect(jokes[1]).toContain('A student tells his teacher');
    expect(jokes[1]).toContain('lowest grade');
  });

  it('does not split on numbers that live inside a joke', () => {
    expect(splitJokes('In 1999 a man bought 3 cats for $5 each.')).toEqual([
      'In 1999 a man bought 3 cats for $5 each.',
    ]);
  });

  it('falls back to one joke when an embedded list breaks the 1,2,3 sequence', () => {
    // Markers come out 1, 1, 2 — not sequential — so numbering is not trusted
    // and the whole thing stays as one block for the user to split manually.
    const text = '1. He made resolutions:\n1. Eat less\n2. Sleep more';
    const jokes = splitJokes(text);
    expect(jokes).toHaveLength(1);
    expect(jokes[0]).toContain('He made resolutions');
  });

  it('splits blank-line-separated jokes when there are no numbers', () => {
    expect(splitJokes('Joke one line.\n\nJoke two line.')).toEqual([
      'Joke one line.',
      'Joke two line.',
    ]);
  });

  it('strips bullet and dash markers', () => {
    expect(splitJokes('- Joke one\n• Joke two\n* Joke three')).toEqual([
      'Joke one',
      'Joke two',
      'Joke three',
    ]);
  });

  it('strips markdown bold around markers', () => {
    expect(splitJokes('**1.** Joke one\n**2.** Joke two')).toEqual(['Joke one', 'Joke two']);
  });

  it('normalizes Windows newlines', () => {
    expect(splitJokes('1) Joke one\r\n2) Joke two')).toEqual(['Joke one', 'Joke two']);
  });

  it('returns [] for empty or whitespace input', () => {
    expect(splitJokes('')).toEqual([]);
    expect(splitJokes('   \n  ')).toEqual([]);
  });
});
