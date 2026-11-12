/* One CSV per run record: a row per team per round, for a spreadsheet.
   Cells that start like a formula (or with a tab or carriage return) are neutralised so a team
   name cannot run in Excel. */
import { SETTING_FIELDS, type RunRecord } from './types';

export function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const FIXED_COLUMNS = [
  'run', 'played_by', 'round', 'team', 'profit', 'sold', 'released', 'made', 'never_sold', 'discarded',
  'listing', 'hosting', 'shipping', 'storage', 'discard', 'fees_total', 'sent_to_released_s', 'to_first_sale_s', 'batches',
];

export function recordCsv(record: RunRecord): string {
  const lines = [[...FIXED_COLUMNS, ...SETTING_FIELDS.map(([key]) => key)].map(csvCell).join(',')];
  for (const round of record.rounds) {
    for (const t of round.teams) {
      const cells = [
        record.name, record.played_by, round.round, t.team, t.profit, t.sold, t.released, t.made, t.never_sold, t.discarded,
        t.fees.listing, t.fees.hosting, t.fees.shipping, t.fees.storage, t.fees.discard, t.fees.total,
        t.sent_to_released_s, t.to_first_sale_s, t.batches?.length,
        ...SETTING_FIELDS.map(([key]) => round.settings[key]),
      ];
      lines.push(cells.map(csvCell).join(','));
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}
