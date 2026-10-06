/**
 * The key check behind scripts/smoke-api.ts, split out so it can be unit
 * tested without running the script (which probes a server and exits).
 *
 * `keys` are required: absent ones are reported as missing.
 * `optional` keys are declared but may be absent (fields only newer backends
 * send, e.g. the Lean market mode fields on a round): never missing, and never
 * reported as extra when present.
 */
export function checkKeys(
  label: string,
  value: unknown,
  keys: string[],
  optional: string[] = [],
): { missing: string[]; extra: string[] } | string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return `${label} is ${Array.isArray(value) ? 'an array' : String(value)}, expected an object`;
  }
  const present = Object.keys(value as Record<string, unknown>);
  return {
    missing: keys.filter((k) => !present.includes(k)),
    extra: keys.length ? present.filter((k) => !keys.includes(k) && !optional.includes(k)) : [],
  };
}
