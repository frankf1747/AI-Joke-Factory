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
  /** Locked once the round is ACTIVE — the backend freezes the profile at start. */
  disabled?: boolean;
}

export function IdealProfilePicker({ value, onChange, disabled = false }: Props) {
  const complete = isCompleteProfile(value);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-800">Hidden ideal joke</h3>
          <p className="text-xs text-slate-500">
            All {IDEAL_DIMENSIONS.length} dimensions are required. Students never see this.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ ...DEFAULT_IDEAL_PROFILE })}
          className="text-xs px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
        >
          Use defaults
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {IDEAL_DIMENSIONS.map(dim => (
          <label key={dim.id} className="text-xs">
            <span className="block text-slate-600 mb-1">{dim.label}</span>
            <select
              value={value[dim.id as IdealDimension] ?? ''}
              disabled={disabled}
              onChange={e => onChange({ ...value, [dim.id]: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-2 py-1.5 disabled:opacity-50"
            >
              <option value="">— choose —</option>
              {selectableCategories(dim).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {!complete && (
        <p className="text-xs text-amber-700">
          Every dimension must be set before the round can start.
        </p>
      )}
    </div>
  );
}
