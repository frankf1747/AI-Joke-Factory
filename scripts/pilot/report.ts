/* Pure summarisation for the lean pilot. Kept separate from the runner so the
   verdict rule is unit-tested and the markdown is reproducible.

   One RunResult is one round of one simulated class: every class plays round 1
   and round 2, like a real class, so a class contributes two RunResults. */
export type PilotMode = 'CLASSIC' | 'LEAN';
export type PilotRound = 1 | 2;

export interface TeamRow {
  teamId: number; persona: string; profit: number; sales: number; published: number;
  /** Published jokes that never sold (Lean, from batch_series); null for Classic, which has no series. */
  neverSold: number | null;
  setup: number; carrying: number; leadTimeS: number; saleTimeS: number; rank: number;
}
export interface RunResult {
  mode: PilotMode; rep: number; round: PilotRound; durationS: number; calls: number; rows: TeamRow[];
}
export interface PersonaSummary {
  n: number; meanProfit: number; meanSales: number; meanPublished: number; meanNeverSold: number | null;
  meanSetup: number; meanCarrying: number; meanLeadTimeS: number; meanSaleTimeS: number;
}

export const PERSONAS = ['CAREFUL', 'BALANCED', 'SPRAY', 'LEARNER'] as const;
const GROUPS: Array<[PilotMode, PilotRound]> = [['CLASSIC', 1], ['CLASSIC', 2], ['LEAN', 1], ['LEAN', 2]];

/** 'LEAN R2' and so on: the key summarise() groups by. */
export const groupKey = (mode: PilotMode, round: PilotRound) => `${mode} R${round}`;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const meanOrNull = (xs: Array<number | null>) => {
  const known = xs.filter((x): x is number => x != null);
  return known.length ? mean(known) : null;
};

/**
 * Published jokes that never sold, from a Lean team's batch_series. The
 * backend's unsold_jokes is max(published - sales, 0), and one joke can sell
 * many times, so it reads 0 even when most jokes never sold; a series point's
 * `sold` counts each joke at most once.
 */
export function neverSoldOf(series: ReadonlyArray<{ published: number; sold: number }> | null | undefined): number | null {
  if (!series) return null;
  return series.reduce((n, p) => n + Math.max(0, p.published - p.sold), 0);
}

/** Only these hosts may be pilot targets by default: every class starts with a destructive reset. */
export function isLocalUrl(url: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Everything a run produced, written next to the markdown as JSON so it can be re-rendered. */
export interface PilotSidecar { date: string; settings: string[]; results: RunResult[]; errors: string[]; }
const rowsOf = (runs: RunResult[], mode: PilotMode, round: PilotRound) =>
  runs.filter(r => r.mode === mode && r.round === round).flatMap(r => r.rows);
const winnerOf = (r: RunResult) => [...r.rows].sort((a, b) => b.profit - a.profit)[0];
const money = (v: number) => (v < 0 ? `-$${Math.abs(v).toFixed(2)}` : `$${v.toFixed(2)}`);

/** Per persona means, keyed by groupKey (every one of the four keys is present). */
export function summarise(runs: RunResult[]): Record<string, Record<string, PersonaSummary>> {
  const out: Record<string, Record<string, PersonaSummary>> = {};
  for (const [mode, round] of GROUPS) {
    const rows = rowsOf(runs, mode, round);
    const group: Record<string, PersonaSummary> = {};
    for (const persona of new Set(rows.map(r => r.persona))) {
      const xs = rows.filter(r => r.persona === persona);
      group[persona] = {
        n: xs.length, meanProfit: mean(xs.map(x => x.profit)), meanSales: mean(xs.map(x => x.sales)),
        meanPublished: mean(xs.map(x => x.published)), meanNeverSold: meanOrNull(xs.map(x => x.neverSold)),
        meanSetup: mean(xs.map(x => x.setup)), meanCarrying: mean(xs.map(x => x.carrying)),
        meanLeadTimeS: mean(xs.map(x => x.leadTimeS)), meanSaleTimeS: mean(xs.map(x => x.saleTimeS)),
      };
    }
    out[groupKey(mode, round)] = group;
  }
  return out;
}

export interface Verdict {
  pass: boolean;
  reasons: string[];
  /** Mean profit across all teams, for contrast only — not part of pass/fail. */
  leanR1Mean: number; leanR2Mean: number; leanImproved: boolean;
  classicR1Mean: number; classicR2Mean: number;
}

/**
 * Spec §9.3, evaluated on Lean ROUND 2 (the lean round of the class preset):
 * PASS when mean Learner profit and mean Careful profit both exceed mean Spray
 * profit, and Spray is not the top team in any Lean round-2 class.
 */
export function verdict(runs: RunResult[]): Verdict {
  const leanR2 = runs.filter(r => r.mode === 'LEAN' && r.round === 2);
  const s = summarise(leanR2)[groupKey('LEAN', 2)];
  const reasons: string[] = [];
  if (leanR2.length === 0) reasons.push('no Lean round-2 results');
  const spray = s.SPRAY?.meanProfit ?? -Infinity;
  if (!(s.LEARNER && s.LEARNER.meanProfit > spray)) reasons.push('Learner does not out-earn Spray');
  if (!(s.CAREFUL && s.CAREFUL.meanProfit > spray)) reasons.push('Careful does not out-earn Spray');
  for (const r of leanR2) {
    if (winnerOf(r)?.persona === 'SPRAY') reasons.push(`Spray won Lean class rep ${r.rep} round 2`);
  }
  const all = (mode: PilotMode, round: PilotRound) => mean(rowsOf(runs, mode, round).map(x => x.profit));
  const leanR1Mean = all('LEAN', 1);
  const leanR2Mean = all('LEAN', 2);
  return {
    pass: reasons.length === 0, reasons,
    leanR1Mean, leanR2Mean, leanImproved: leanR2Mean > leanR1Mean,
    classicR1Mean: all('CLASSIC', 1), classicR2Mean: all('CLASSIC', 2),
  };
}

export function markdown(runs: RunResult[], date: string, settings: string[] = [], errors: string[] = []): string {
  const s = summarise(runs);
  const v = verdict(runs);
  const has = (mode: PilotMode, round: PilotRound) => runs.some(r => r.mode === mode && r.round === round);
  const table = (mode: PilotMode, round: PilotRound): string[] => {
    const group = s[groupKey(mode, round)];
    const known = PERSONAS.filter(p => group[p]);
    const extra = Object.keys(group).filter(p => !(PERSONAS as readonly string[]).includes(p)).sort();
    return [
      `## ${groupKey(mode, round)}`, '',
      '| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |',
      '|---|---|---|---|---|---|---|---|---|---|',
      ...[...known, ...extra].map(p => {
        const x = group[p];
        return `| ${p} | ${x.n} | ${x.meanPublished.toFixed(1)} | ${x.meanSales.toFixed(1)} | ${x.meanNeverSold == null ? '—' : x.meanNeverSold.toFixed(1)} | `
          + `${money(x.meanSetup)} | ${money(x.meanCarrying)} | ${Math.round(x.meanLeadTimeS)}s | ${Math.round(x.meanSaleTimeS)}s | `
          + `**${money(x.meanProfit)}** |`;
      }),
      '',
    ];
  };
  const contrast = (label: string, a: number, b: number, present: boolean) =>
    present ? [`- ${label} R2 vs ${label} R1 mean profit: ${money(b)} vs ${money(a)} (${b > a ? 'improved' : 'not improved'})`] : [];
  const ordered = [...runs].sort((a, b) => a.mode.localeCompare(b.mode) || a.rep - b.rep || a.round - b.round);
  return [
    `# Lean pilot — ${date}`, '',
    `Verdict (Lean round 2): **${v.pass ? 'PASS' : 'FAIL'}**${v.reasons.length ? ' — ' + v.reasons.join('; ') : ''}`, '',
    ...contrast('Lean', v.leanR1Mean, v.leanR2Mean, has('LEAN', 1) && has('LEAN', 2)),
    ...contrast('Classic', v.classicR1Mean, v.classicR2Mean, has('CLASSIC', 1) && has('CLASSIC', 2)),
    '',
    ...(errors.length ? ['## Errors', '', ...errors.map(x => `- ${x}`), ''] : []),
    ...(settings.length ? ['## Settings', '', ...settings.map(x => `- ${x}`), ''] : []),
    'Means per team. Sales counts purchases (a joke can sell many times); never sold counts published jokes with no sale (Lean only). '
      + 'Lead time is submit to publish; time to first sale is publish to first sale (Lean only).', '',
    ...GROUPS.filter(([m, r]) => has(m, r)).flatMap(([m, r]) => table(m, r)),
    '## Classes', '',
    '| Mode | Rep | Round | Winner | Profit | Duration | Classification calls |',
    '|---|---|---|---|---|---|---|',
    ...ordered.map(r => {
      const w = winnerOf(r);
      return `| ${r.mode} | ${r.rep} | ${r.round} | ${w?.persona ?? '—'} | ${w ? money(w.profit) : '—'} | ${r.durationS}s | ${r.calls} |`;
    }),
    '',
  ].join('\n');
}
