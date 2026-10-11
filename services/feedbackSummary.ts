/* The pattern across Marketing's recent customer feedback, for the top of the
   floating window: which criteria customers keep liking ("Keep doing") and
   which they keep missing ("Fix next"), counted over the jokes shown.

   Each criterion lands on one side only: the side it fell on more often, with
   that count. A tie goes to Fix next, the side that asks for action. */
import type { FeedbackRow } from '../views/feedback';

export interface SummaryItem {
  id: string;
  label: string;
  /** How many of the shown jokes it landed (keep) or missed (fix) on. */
  count: number;
}

export interface FeedbackSummary {
  keep: SummaryItem[];
  fix: SummaryItem[];
}

const byCountThenLabel = (a: SummaryItem, b: SummaryItem) =>
  b.count - a.count || a.label.localeCompare(b.label);

export function summarizeFeedback(rows: readonly FeedbackRow[]): FeedbackSummary {
  const tally = new Map<string, { label: string; landed: number; missed: number }>();
  const entry = (id: string, label: string) => {
    let t = tally.get(id);
    if (!t) { t = { label, landed: 0, missed: 0 }; tally.set(id, t); }
    return t;
  };
  for (const r of rows) {
    for (const g of r.good) entry(g.id, g.label).landed += 1;
    for (const m of r.improve) entry(m.id, m.label).missed += 1;
  }
  const keep: SummaryItem[] = [];
  const fix: SummaryItem[] = [];
  for (const [id, t] of tally) {
    if (t.landed > t.missed) keep.push({ id, label: t.label, count: t.landed });
    else if (t.missed > 0) fix.push({ id, label: t.label, count: t.missed });
  }
  return { keep: keep.sort(byCountThenLabel), fix: fix.sort(byCountThenLabel) };
}
