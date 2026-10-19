/* IdealProfilePicker — the instructor's hidden ideal joke.

   The backend refuses to start a round without a complete, valid ideal_profile
   (usecase/instructor.go:239-245 returns 409 CONFLICT when it is unset), and it
   enforces three rules on the payload (scoring/dimensions.go:182-207):

     1. a category for every one of the 11 ideal dimensions,
     2. no TITLE_FIT — it is self-scoring and has no ideal,
     3. no catch-all ("None of the above") as an ideal.

   config/dimensions.ts already models all three, so this module leans on it
   rather than restating the vocabulary. */
import React from 'react';
import {
  IDEAL_DIMENSIONS, DEFAULT_IDEAL_PROFILE, isCatchAll,
  type DimensionSpec, type IdealDimension,
} from '../config/dimensions';

export type IdealProfile = Record<IdealDimension, string>;

/** The backend rejects a catch-all as an ideal (scoring/dimensions.go:195-197). */
export function selectableCategories(dim: DimensionSpec): string[] {
  return dim.categories.filter(c => !isCatchAll(c));
}

/**
 * A profile the backend will accept: total over all 11 ideal dimensions, no blanks, no
 * catch-alls. Partial profiles 400 with "missing category for <DIM>"
 * (scoring/dimensions.go:189-194), so this must be true before start is even attempted.
 */
export function isCompleteProfile(profile: Partial<Record<string, string>>): boolean {
  return IDEAL_DIMENSIONS.every(dim => {
    const chosen = profile[dim.id];
    return typeof chosen === 'string' && chosen !== '' && !isCatchAll(chosen);
  });
}

interface Props {
  value: IdealProfile;
  onChange: (next: IdealProfile) => void;
  /** Locked while a round is ACTIVE and once both rounds have ended; "Use defaults" is hidden then too. */
  disabled?: boolean;
}

/** One row per dimension: its label and a select whose option values and labels are the
    backend's exact strings (config/dimensions.backend-parity.test.ts guards them). */
export function IdealProfilePicker({ value, onChange, disabled = false }: Props) {
  const complete = isCompleteProfile(value);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 px-[18px] pb-1.5 pt-4">
        <div>
          <h2 className="text-[17px] font-semibold" style={{ color: 'var(--ink)' }}>Hidden ideal joke</h2>
          <p className="mt-0.5 text-[13px]" style={{ color: 'var(--ink-3)' }}>
            What the AI customers want. Students never see this.
          </p>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_IDEAL_PROFILE })}
            className="shrink-0 border-0 bg-transparent text-[13.5px] font-medium"
            style={{ color: 'var(--navy)' }}
          >
            Use defaults
          </button>
        )}
      </div>
      <div className="px-[18px] pb-3.5 pt-1">
        {IDEAL_DIMENSIONS.map((dim, i) => (
          <div
            key={dim.id}
            className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-2.5 py-[5px]"
            style={i > 0 ? { borderTop: '1px solid var(--rule)' } : undefined}
          >
            <label htmlFor={`ideal-${dim.id}`} className="text-[14px]" style={{ color: 'var(--ink-2)' }}>{dim.label}</label>
            <select
              id={`ideal-${dim.id}`}
              value={value[dim.id as IdealDimension] ?? ''}
              disabled={disabled}
              onChange={e => onChange({ ...value, [dim.id]: e.target.value })}
              className="min-w-0 rounded-[4px] border bg-[color:var(--paper)] px-2 py-1.5 text-[14px] font-medium focus:border-[color:var(--navy)] focus:bg-[color:var(--sheet)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}
            >
              <option value="">Choose</option>
              {selectableCategories(dim).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="rounded-b-[var(--r-3)] border-t px-[18px] py-3.5 text-[12.5px]" style={{ borderColor: 'var(--rule)', background: 'var(--paper)' }}>
        {!complete && (
          <p className="mb-1" style={{ color: 'var(--warn)' }}>Every dimension must be set before the round can start.</p>
        )}
        <p style={{ color: 'var(--ink-3)' }}>Saved as you make each change.</p>
      </div>
    </div>
  );
}
