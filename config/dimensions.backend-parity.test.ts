/* ============================================================================
   BACKEND PARITY SUITE — not our tests, theirs.

   Every case below is lifted, one for one, from the Go backend's own unit
   tests for its scoring package:

     jokefactory_be/src/core/domain/scoring/dimensions_test.go
     jokefactory_be/src/core/domain/scoring/fit_test.go
     jokefactory_be/src/core/domain/scoring/length_test.go

   Ported 2026-09-13 from backend commit 8f9dfff. Go's enum constants are
   mapped to our string ids (domain.DimComplexity -> 'COMPLEXITY'); the inputs
   and the expected outputs are otherwise untouched.

   These are the backend author's assertions about what joke scoring must do.
   If one of them fails here, it does not mean the test is wrong — it means
   this frontend has drifted from the backend, and the Go code wins. Fix
   config/dimensions.ts to agree, or go change the backend first.

   Do not "improve" an expectation to make a run go green.

   NOT PORTED — Go's TestValidateIdealProfile (dimensions_test.go:41) exercises
   scoring.ValidateIdealProfile, a server-side request validator. The frontend
   has no counterpart: it builds ideal profiles from a constrained picker
   rather than validating arbitrary input. The catalog invariants that
   validator relies on are covered below; its four error paths are not.
============================================================================ */

import { describe, it, expect } from 'vitest';
import {
  DIMENSIONS,
  IDEAL_DIMENSIONS,
  CATCH_ALL,
  dimById,
  categoryIndex,
  dimFit,
  trueFit,
  wordCount,
  classifyLength,
  DEFAULT_IDEAL_PROFILE,
  type Classification,
  type IdealProfile,
  type Dimension,
  type IdealDimension,
} from './dimensions';

/* -- fit_test.go:10  TestDimFitOrdinal ------------------------------------ */

describe('go: TestDimFitOrdinal (fit_test.go:10)', () => {
  // dim := domain.DimComplexity
  //   Very simple, Simple, Moderate, Thoughtful, Expert
  const dim = 'COMPLEXITY';

  const cases: Array<[name: string, ideal: string, joke: string, want: number]> = [
    ['exact', 'Moderate', 'Moderate', 1.0],
    ['adjacent_up', 'Moderate', 'Thoughtful', 0.5],
    ['adjacent_down', 'Moderate', 'Simple', 0.5],
    ['two_steps', 'Moderate', 'Expert', 0.0],
    ['far', 'Very simple', 'Expert', 0.0],
    ['invalid_joke', 'Moderate', 'Nope', 0.0],
    ['empty', 'Moderate', '', 0.0],
  ];

  it.each(cases)('%s: dimFit(COMPLEXITY, %j, %j) === %d', (_name, ideal, joke, want) => {
    expect(dimFit(dim, ideal, joke)).toBe(want);
  });
});

/* -- fit_test.go:38  TestDimFitOrdinalCatchAll ---------------------------- */

describe('go: TestDimFitOrdinalCatchAll (fit_test.go:38)', () => {
  // Energy has a catch-all at the end of an otherwise ordinal list.
  const dim = 'ENERGY';

  const cases: Array<[name: string, ideal: string, joke: string, want: number]> = [
    ['catch_vs_normal', 'Conversational', CATCH_ALL, 0.0],
    ['normal_vs_catch', CATCH_ALL, 'Conversational', 0.0],
    ['both_catch', CATCH_ALL, CATCH_ALL, 1.0],
    // Catch-all must NOT be treated as adjacent to High-energy.
    ['high_energy_vs_catch', 'High-energy', CATCH_ALL, 0.0],
    ['exact_normal', 'Conversational', 'Conversational', 1.0],
    ['adjacent_normal', 'Conversational', 'Animated', 0.5],
  ];

  it.each(cases)('%s: dimFit(ENERGY, %j, %j) === %d', (_name, ideal, joke, want) => {
    expect(dimFit(dim, ideal, joke)).toBe(want);
  });
});

/* -- fit_test.go:67  TestDimFitCategorical -------------------------------- */

describe('go: TestDimFitCategorical (fit_test.go:67)', () => {
  it('exact match = 1.0', () => {
    expect(dimFit('TOPIC', 'Work', 'Work')).toBe(1.0);
  });

  it('mismatch = 0.0', () => {
    expect(dimFit('TOPIC', 'Work', 'Food')).toBe(0.0);
  });

  it('catch-all vs normal = 0.0', () => {
    expect(dimFit('HUMOR_STYLE', 'Pun', CATCH_ALL)).toBe(0.0);
  });

  it('both catch-all = 1.0', () => {
    expect(dimFit('HUMOR_STYLE', CATCH_ALL, CATCH_ALL)).toBe(1.0);
  });
});

/* -- fit_test.go:85  TestDimFitTitleFitGraded ----------------------------- */

describe('go: TestDimFitTitleFitGraded (fit_test.go:85)', () => {
  const grades: Array<[cat: string, want: number]> = [
    ['Perfect', 1.0],
    ['Strong', 0.75],
    ['Moderate', 0.5],
    ['Weak', 0.25],
    ['Mismatch', 0.0],
  ];

  // Ideal is ignored for graded / intrinsic scoring — Go passes "".
  it.each(grades)('TitleFit %j = %d', (cat, want) => {
    expect(dimFit('TITLE_FIT', '', cat)).toBe(want);
  });

  it('invalid TitleFit = 0', () => {
    expect(dimFit('TITLE_FIT', 'ignored', 'bogus')).toBe(0);
  });
});

/* -- fit_test.go:103  TestWorkedExample_TrueFit975 ------------------------ */

describe('go: TestWorkedExample_TrueFit975 (fit_test.go:103)', () => {
  // Sandbox / REFACTOR_PLAN worked example -> 9.75 / 12.
  const profile: IdealProfile = {
    LENGTH: 'Medium',
    TOPIC: 'Work',
    HUMOR_STYLE: 'Observational',
    COMPLEXITY: 'Moderate',
    EDGINESS: 'Clean',
    STRUCTURE: 'Setup–punchline',
    WORDPLAY: 'Light',
    FRESHNESS: 'Timeless',
    SETUP_PAYOFF: 'Balanced',
    CLARITY: 'Crystal clear',
    ENERGY: 'Conversational',
  };
  const classification: Classification = {
    LENGTH: 'Medium',                 // 1.0 exact
    TOPIC: 'Work',                    // 1.0 match
    HUMOR_STYLE: 'Observational',     // 1.0 match
    COMPLEXITY: 'Thoughtful',         // 0.5 adjacent
    EDGINESS: 'Clean',                // 1.0 match
    STRUCTURE: 'Setup–punchline',     // 1.0 match
    WORDPLAY: 'Moderate',             // 0.5 adjacent
    FRESHNESS: 'Slightly current',    // 0.5 adjacent
    SETUP_PAYOFF: 'Balanced',         // 1.0 exact
    CLARITY: 'Mostly clear',          // 0.5 adjacent
    ENERGY: 'Conversational',         // 1.0 exact
    TITLE_FIT: 'Strong',              // 0.75 graded
  };

  const wantDims: Array<[dim: string, want: number]> = [
    ['LENGTH', 1.0], ['TOPIC', 1.0], ['HUMOR_STYLE', 1.0],
    ['COMPLEXITY', 0.5], ['EDGINESS', 1.0], ['STRUCTURE', 1.0],
    ['WORDPLAY', 0.5], ['FRESHNESS', 0.5], ['SETUP_PAYOFF', 1.0],
    ['CLARITY', 0.5], ['ENERGY', 1.0], ['TITLE_FIT', 0.75],
  ];

  it.each(wantDims)('dim_fit[%s] = %d', (dim, want) => {
    expect(dimFit(dim, profile[dim] ?? '', classification[dim])).toBe(want);
  });

  it('TrueFit = 9.75', () => {
    // Go: math.Abs(got-want) > 1e-9
    expect(trueFit(classification, profile)).toBeCloseTo(9.75, 9);
  });
});

/* -- fit_test.go:154  TestOppositeJoke_NearZero --------------------------- */

describe('go: TestOppositeJoke_NearZero (fit_test.go:154)', () => {
  // Ideal at one extreme of each ordinal so an opposite can land at distance >=2
  // (Length only has 3 buckets — Short<->Long is the only zero-scoring pair).
  const profile: IdealProfile = {
    LENGTH: 'Short',
    TOPIC: 'Work',
    HUMOR_STYLE: 'Observational',
    COMPLEXITY: 'Expert',
    EDGINESS: 'Clean',
    STRUCTURE: 'Setup–punchline',
    WORDPLAY: 'None',
    FRESHNESS: 'Timeless',
    SETUP_PAYOFF: 'Immediate',
    CLARITY: 'Crystal clear',
    ENERGY: 'Deadpan',
  };
  const classification: Classification = {
    LENGTH: 'Long',                 // Short<->Long -> 0
    TOPIC: 'Politics',              // categorical miss -> 0
    HUMOR_STYLE: CATCH_ALL,         // catch-all -> 0
    COMPLEXITY: 'Very simple',      // Expert<->Very simple -> 0
    EDGINESS: 'Slightly edgy',      // categorical miss -> 0
    STRUCTURE: 'List/build-up',     // categorical miss -> 0
    WORDPLAY: 'Heavy',              // None<->Heavy -> 0
    FRESHNESS: 'Time-sensitive',    // Timeless<->Time-sensitive -> 0
    SETUP_PAYOFF: 'Very long build',// Immediate<->Very long -> 0
    CLARITY: 'Reinterpretation',    // Crystal clear<->Reinterpretation -> 0
    ENERGY: CATCH_ALL,              // catch-all -> 0
    TITLE_FIT: 'Mismatch',          // graded 0
  };

  it('opposite TrueFit = 0', () => {
    expect(trueFit(classification, profile)).toBe(0);
  });
});

/* -- fit_test.go:192  TestPerfectMatch_TrueFit12 -------------------------- */

describe('go: TestPerfectMatch_TrueFit12 (fit_test.go:192)', () => {
  const profile: IdealProfile = {
    LENGTH: 'Medium',
    TOPIC: 'Work',
    HUMOR_STYLE: 'Observational',
    COMPLEXITY: 'Moderate',
    EDGINESS: 'Clean',
    STRUCTURE: 'Setup–punchline',
    WORDPLAY: 'Light',
    FRESHNESS: 'Timeless',
    SETUP_PAYOFF: 'Balanced',
    CLARITY: 'Crystal clear',
    ENERGY: 'Conversational',
  };
  const classification: Classification = {
    LENGTH: 'Medium',
    TOPIC: 'Work',
    HUMOR_STYLE: 'Observational',
    COMPLEXITY: 'Moderate',
    EDGINESS: 'Clean',
    STRUCTURE: 'Setup–punchline',
    WORDPLAY: 'Light',
    FRESHNESS: 'Timeless',
    SETUP_PAYOFF: 'Balanced',
    CLARITY: 'Crystal clear',
    ENERGY: 'Conversational',
    TITLE_FIT: 'Perfect',
  };

  it('perfect TrueFit = 12.0', () => {
    expect(trueFit(classification, profile)).toBe(12.0);
  });
});

/* -- length_test.go:5  TestWordCount -------------------------------------- */

describe('go: TestWordCount (length_test.go:5)', () => {
  const cases: Array<[name: string, text: string, want: number]> = [
    ['empty', '', 0],
    ['whitespace', '   \t\n  ', 0],
    ['one', 'Hello', 1],
    ['simple', 'I told my boss I needed a raise', 8],
    ['multi-space', 'a  b   c', 3],
    ['newlines', 'line one\nline two', 4],
  ];

  it.each(cases)('%s: wordCount(%j) === %d', (_name, text, want) => {
    expect(wordCount(text)).toBe(want);
  });
});

/* -- length_test.go:29  TestClassifyLength -------------------------------- */

/** Go's length_test.go nWords helper: n copies of "w", space-separated. */
function nWords(n: number): string {
  if (n <= 0) return '';
  return Array.from({ length: n }, () => 'w').join(' ');
}

describe('go: TestClassifyLength (length_test.go:29)', () => {
  const cases: Array<[name: string, text: string, want: string]> = [
    ['empty_is_short', '', 'Short'],
    ['boundary_15_short', nWords(15), 'Short'],
    ['boundary_16_medium', nWords(16), 'Medium'],
    ['boundary_40_medium', nWords(40), 'Medium'],
    ['boundary_41_long', nWords(41), 'Long'],
    ['long', nWords(100), 'Long'],
  ];

  it.each(cases)('%s: classifyLength(%d words) === %s', (_name, text, want) => {
    expect(classifyLength(text)).toBe(want);
  });
});

/* -- dimensions_test.go:9  TestIdealDimensions_ExcludesTitleFit ----------- */

describe('go: TestIdealDimensions_ExcludesTitleFit (dimensions_test.go:9)', () => {
  it('IdealDimensions len = 11', () => {
    expect(IDEAL_DIMENSIONS.length).toBe(11);
  });

  it('Title Fit must not appear in IdealDimensions', () => {
    expect(IDEAL_DIMENSIONS.map(d => d.id)).not.toContain('TITLE_FIT');
  });

  it.each(IDEAL_DIMENSIONS.map(d => d.id))(
    '%s HasIdeal must be true while listed in IdealDimensions',
    id => {
      expect(dimById(id)?.hasIdeal).toBe(true);
    },
  );
});

/* -- dimensions_test.go:25  TestIsValidCategory --------------------------- */

/* Go's scoring.IsValidCategory scans spec.Categories for the string. Our
   categoryIndex does the same scan and returns -1 on a miss, so `>= 0` is the
   same predicate. */
const isValidCategory = (dimId: string, category: string) => categoryIndex(dimId, category) >= 0;

describe('go: TestIsValidCategory (dimensions_test.go:25)', () => {
  it('Work should be valid for Topic', () => {
    expect(isValidCategory('TOPIC', 'Work')).toBe(true);
  });

  it('Workplace is not in the locked Topic list', () => {
    expect(isValidCategory('TOPIC', 'Workplace')).toBe(false);
  });

  it('Setup–punchline should be valid (en-dash)', () => {
    expect(isValidCategory('STRUCTURE', 'Setup–punchline')).toBe(true);
  });

  it('None of the above should be valid for Humor Style', () => {
    expect(isValidCategory('HUMOR_STYLE', CATCH_ALL)).toBe(true);
  });
});

/* -- dimensions_test.go:41  TestValidateIdealProfile ---------------------- */

/* The four error paths are not portable (see the header). What is portable is
   the `good` profile the Go test declares valid — it is byte-for-byte the
   profile our picker ships as its default, so the same catalog rules that let
   Go accept it must hold here. */

describe('go: TestValidateIdealProfile — the `good` profile (dimensions_test.go:41)', () => {
  const good: IdealProfile = {
    LENGTH: 'Medium',
    TOPIC: 'Work',
    HUMOR_STYLE: 'Observational',
    COMPLEXITY: 'Moderate',
    EDGINESS: 'Clean',
    STRUCTURE: 'Setup–punchline',
    WORDPLAY: 'Light',
    FRESHNESS: 'Timeless',
    SETUP_PAYOFF: 'Balanced',
    CLARITY: 'Crystal clear',
    ENERGY: 'Conversational',
  };

  it('covers exactly the 11 ideal dimensions, Title Fit excluded', () => {
    expect(Object.keys(good).sort()).toEqual(IDEAL_DIMENSIONS.map(d => d.id).sort());
  });

  it.each(Object.entries(good))('%s: %j is an allowed category and not the catch-all', (dim, cat) => {
    expect(isValidCategory(dim, cat)).toBe(true);
    expect(cat).not.toBe(CATCH_ALL);
  });

  it('is the profile our picker defaults to', () => {
    expect(DEFAULT_IDEAL_PROFILE).toEqual(good);
  });
});

/* -- dimensions_test.go:84  TestAllDimensionsHaveSpecs -------------------- */

describe('go: TestAllDimensionsHaveSpecs (dimensions_test.go:84)', () => {
  it('AllDimensions len = 12', () => {
    expect(DIMENSIONS.length).toBe(12);
  });

  it.each(DIMENSIONS.map(d => d.id))('%s has a spec, non-empty Categories, and a matching key', id => {
    const spec = dimById(id);
    expect(spec, `missing spec entry for ${id}`).toBeDefined();
    expect(spec!.categories.length, `${id} has empty categories`).toBeGreaterThan(0);
    expect(spec!.id, `${id} spec id mismatch`).toBe(id);
  });
});

/* -- LOCAL TYPE-LINKAGE GUARD (not a ported Go test) ---------------------- *
 *
 * Everything above is the backend's own assertions. This last block is ours,
 * and it exists because the dimension vocabulary now has THREE copies that
 * must agree: the Go enum (core/domain/enums.go:76-103), the DIMENSIONS
 * catalog below it, and the `Dimension` union that types/api.ts re-exports and
 * sends in `ideal_profile` payloads.
 *
 * The union is the copy a test cannot see directly, and the drift that matters
 * is silent: `IdealDimension = Exclude<Dimension, 'TITLE_FIT'>` quietly becomes
 * a no-op if TITLE_FIT is ever renamed out of `Dimension`, widening the ideal
 * profile back to all 12 and re-admitting the one dimension the backend 400s
 * on (scoring.ValidateIdealProfile, dimensions.go:201-205).
 *
 * The two Record<> literals below are the bridge: they are exhaustive over the
 * union at COMPILE time (a renamed member makes them fail to type-check), and
 * their keys are compared to the runtime catalog here, so a break surfaces in
 * `npx tsc` and in this suite rather than in a classroom.
 */

describe('local: dimension union <-> catalog linkage', () => {
  // Exhaustive over Dimension: TS requires every member as a key, and rejects
  // any key that is not one. Renaming a union member breaks this literal.
  const DIMENSION_MEMBERS: Record<Dimension, true> = {
    LENGTH: true, TOPIC: true, HUMOR_STYLE: true, COMPLEXITY: true,
    EDGINESS: true, STRUCTURE: true, WORDPLAY: true, FRESHNESS: true,
    SETUP_PAYOFF: true, CLARITY: true, ENERGY: true, TITLE_FIT: true,
  };

  // Exhaustive over IdealDimension — the 11 an ideal_profile must cover.
  const IDEAL_MEMBERS: Record<IdealDimension, true> = {
    LENGTH: true, TOPIC: true, HUMOR_STYLE: true, COMPLEXITY: true,
    EDGINESS: true, STRUCTURE: true, WORDPLAY: true, FRESHNESS: true,
    SETUP_PAYOFF: true, CLARITY: true, ENERGY: true,
  };

  it('every member of the Dimension union appears in DIMENSIONS', () => {
    expect(Object.keys(DIMENSION_MEMBERS).sort()).toEqual(DIMENSIONS.map(d => d.id).sort());
  });

  it('TITLE_FIT is a member of Dimension', () => {
    expect(Object.keys(DIMENSION_MEMBERS)).toContain('TITLE_FIT');
  });

  it('IdealDimension is exactly Dimension minus TITLE_FIT', () => {
    expect(Object.keys(IDEAL_MEMBERS).sort()).toEqual(
      Object.keys(DIMENSION_MEMBERS).filter(d => d !== 'TITLE_FIT').sort(),
    );
  });

  it('every member of IdealDimension appears in IDEAL_DIMENSIONS', () => {
    expect(Object.keys(IDEAL_MEMBERS).sort()).toEqual(IDEAL_DIMENSIONS.map(d => d.id).sort());
  });

  it('DEFAULT_IDEAL_PROFILE is total over IdealDimension', () => {
    // The cast in dimensions.ts is unverifiable at compile time; this is what
    // actually guarantees the payload the instructor config path sends.
    expect(Object.keys(DEFAULT_IDEAL_PROFILE).sort()).toEqual(Object.keys(IDEAL_MEMBERS).sort());
  });

  it('DEFAULT_IDEAL_PROFILE never carries TITLE_FIT', () => {
    expect(Object.keys(DEFAULT_IDEAL_PROFILE)).not.toContain('TITLE_FIT');
  });
});
