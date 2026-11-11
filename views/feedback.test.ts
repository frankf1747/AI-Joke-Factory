import { describe, it, expect } from 'vitest';
import { dimWithDirection, toFeedbackRows } from './feedback';

/* Captured live from GET /v1/rounds/{rid}/teams/{tid}/feedback. The backend
   deliberately sends no numbers, no categories and no ideal levels, because
   teams are meant to reverse-engineer the hidden ideal by selling jokes. A
   graded distance-to-ideal reveal would hand them the profile for free, so
   anything richer than pass/fail per dimension is a bug, not a feature. */
const payload = {
  jokes: [{
    joke_id: 1,
    joke_title: 'The Other IDE',
    was_bought: false,
    good_dimensions: ['TOPIC', 'EDGINESS'],
    improve_dimensions: ['LENGTH', 'HUMOR_STYLE', 'COMPLEXITY'],
  }],
};

describe('toFeedbackRows', () => {
  it('maps dimension ids to their display labels', () => {
    const [row] = toFeedbackRows(payload as never);
    expect(row.good.map(d => d.label)).toEqual(['Topic', 'Edginess']);
    expect(row.improve.map(d => d.label)).toContain('Humor Style');
  });

  it('carries no numeric score anywhere', () => {
    const [row] = toFeedbackRows(payload as never);
    const json = JSON.stringify(row);
    expect(json).not.toMatch(/"prox"|"fit"|"score"/);
  });

  it('survives an unknown dimension id', () => {
    const [row] = toFeedbackRows({ jokes: [{ ...payload.jokes[0], good_dimensions: ['NEW_DIM'] }] } as never);
    expect(row.good[0].label).toBe('NEW_DIM');
  });

  /* The mapper is now shared by BOTH team seats (views/QualityControl.tsx and
     views/JokeMaker.tsx render it through components/FeedbackCard). One leak
     would therefore be two leaks, so this pins the whole result, not one row:
     no key and no value anywhere may carry a number the team could read as
     "how far off". */
  it('carries no numeric score for either seat, across every row', () => {
    const rows = toFeedbackRows({
      jokes: [
        payload.jokes[0],
        { joke_id: 2, joke_title: 'Second', was_bought: true, good_dimensions: ['CLARITY'], improve_dimensions: ['ENERGY'] },
      ],
    } as never);
    expect(rows).toHaveLength(2);
    const values = rows.flatMap(r => [...r.good, ...r.improve]).flatMap(d => Object.values(d));
    expect(values.every(v => typeof v === 'string')).toBe(true);
    // joke_id is the React key and is allowed; nothing else may be a number.
    for (const row of rows) {
      const { joke_id, ...rest } = row;
      expect(typeof joke_id).toBe('number');
      expect(JSON.stringify(rest)).not.toMatch(/\d/);
    }
  });

  it('handles a joke with no feedback yet', () => {
    const [row] = toFeedbackRows({ jokes: [{ joke_id: 2, joke_title: 'x', was_bought: false, good_dimensions: [], improve_dimensions: [] }] } as never);
    expect(row.good).toEqual([]);
    expect(row.improve).toEqual([]);
  });
});

describe('direction hints on missed dimensions', () => {
  const hinted = {
    jokes: [{
      joke_id: 2, joke_title: 'Long One', was_bought: false,
      good_dimensions: ['TOPIC'],
      improve_dimensions: ['LENGTH', 'HUMOR_STYLE', 'ENERGY', 'WORDPLAY'],
      improve_hints: { LENGTH: 'LOWER', ENERGY: 'HIGHER', HUMOR_STYLE: 'LOWER', WORDPLAY: 'SIDEWAYS' },
    }],
  } as unknown as Parameters<typeof toFeedbackRows>[0];

  it('turns LOWER/HIGHER into a word for ordered scales, and nothing else', () => {
    const [row] = toFeedbackRows(hinted);
    expect(row.improve.map(d => [d.id, d.direction])).toEqual([
      ['LENGTH', 'shorter'],
      ['HUMOR_STYLE', undefined], // not an ordered scale: no word even if a hint arrives
      ['ENERGY', 'more energy'],
      ['WORDPLAY', undefined], // unknown hint value is ignored
    ]);
    expect(row.improve.map(dimWithDirection)).toEqual(['Length: shorter', 'Humor Style', 'Energy: more energy', 'Wordplay']);
  });

  it('works with an older backend that sends no hints', () => {
    const [row] = toFeedbackRows(payload as Parameters<typeof toFeedbackRows>[0]);
    expect(row.improve.every(d => d.direction === undefined)).toBe(true);
  });
});
