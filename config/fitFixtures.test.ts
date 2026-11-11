/* The shared fit fixtures (config/fit-fixtures.json): the backend runs the same
   file in src/core/domain/scoring/fit_fixtures_test.go, so the TypeScript port
   of DimFit and TrueFit (config/dimensions.ts) and the Go rules agree on every
   case. scripts/traits/traitCorpusParity.test.ts checks the two copies match. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIMENSIONS, dimFit, trueFit } from './dimensions';

interface FitCase {
  name: string;
  ideal: string;
  classification: Record<string, string>;
  dim_fit: Record<string, number>;
  true_fit: number;
}

const fixtures = JSON.parse(readFileSync(new URL('./fit-fixtures.json', import.meta.url), 'utf8')) as {
  ideals: Record<string, Record<string, string>>;
  cases: FitCase[];
};

describe('shared fit fixtures', () => {
  it('lists every one of the 12 dimensions in each case', () => {
    expect(fixtures.cases.length).toBeGreaterThanOrEqual(6);
    for (const c of fixtures.cases) {
      expect(Object.keys(c.dim_fit).sort()).toEqual(DIMENSIONS.map(d => d.id).sort());
      expect(fixtures.ideals[c.ideal]).toBeDefined();
    }
  });

  for (const c of fixtures.cases) {
    it(c.name, () => {
      const ideal = fixtures.ideals[c.ideal];
      for (const d of DIMENSIONS) {
        expect(dimFit(d.id, d.hasIdeal ? ideal[d.id] ?? '' : '', c.classification[d.id] ?? ''), d.id).toBe(c.dim_fit[d.id]);
      }
      expect(trueFit(c.classification, ideal)).toBe(c.true_fit);
    });
  }
});
