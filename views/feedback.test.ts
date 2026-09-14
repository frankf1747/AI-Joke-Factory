import { describe, it, expect } from 'vitest';
import { toFeedbackRows } from './QualityControl';

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

  it('handles a joke with no feedback yet', () => {
    const [row] = toFeedbackRows({ jokes: [{ joke_id: 2, joke_title: 'x', was_bought: false, good_dimensions: [], improve_dimensions: [] }] } as never);
    expect(row.good).toEqual([]);
    expect(row.improve).toEqual([]);
  });
});
