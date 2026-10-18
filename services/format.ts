/** Whole non-negative seconds: fractions floor, negatives and NaN clamp to 0. */
function whole(secs: number): number {
  return Number.isFinite(secs) ? Math.max(0, Math.floor(secs)) : 0;
}

const two = (n: number): string => String(n).padStart(2, '0');

/** A wait or span: "45 s", "1 min", "1 min 12 s", then whole minutes from 10 min ("56 min"). */
export function fmtDuration(secs: number): string {
  const s = whole(secs);
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  const rest = s % 60;
  return min >= 10 || rest === 0 ? `${min} min` : `${min} min ${rest} s`;
}

/** A running clock with two-digit minutes: "07:19", "96:35". */
export function fmtClock(secs: number): string {
  const s = whole(secs);
  return `${two(Math.floor(s / 60))}:${two(s % 60)}`;
}

/** Minutes without padding, then two-digit seconds: "1:12", "0:52". */
export function fmtMinSec(secs: number): string {
  const s = whole(secs);
  return `${Math.floor(s / 60)}:${two(s % 60)}`;
}

/** "priya_tomás" -> "Priya and Tomás"; a solo name is just capitalised. */
export function pairNames(displayName: string): string {
  return displayName
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(' and ');
}

/** The ordinal suffix for a rank: 1st, 2nd, 3rd, 4th, 11th, 21st. */
export function ordinal(n: number): { n: number; suffix: 'st' | 'nd' | 'rd' | 'th' } {
  const lastTwo = Math.abs(n) % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return { n, suffix: 'th' };
  switch (Math.abs(n) % 10) {
    case 1: return { n, suffix: 'st' };
    case 2: return { n, suffix: 'nd' };
    case 3: return { n, suffix: 'rd' };
    default: return { n, suffix: 'th' };
  }
}
