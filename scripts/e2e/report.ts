/**
 * Output: what the operator reads, and what the run leaves behind.
 *
 * TWO AUDIENCES, TWO FORMATS, AND THEY ARE NOT THE SAME DOCUMENT.
 *
 *   The TERMINAL is read once, by a person, usually at an inconvenient hour,
 *   usually because something is wrong. It gets aligned columns, one line per
 *   claim, grouping by layer so the eye can skip whole sections, and — for any
 *   failure — the diagnosis wrapped under the claim it belongs to. It does NOT
 *   get the raw evidence; a wall of JSON in a terminal is how a real finding
 *   gets scrolled past.
 *
 *   The ARTIFACTS are read later, by whoever is arguing about what happened.
 *   They get everything, unabridged and machine-readable, because the run that
 *   produced them was destructive and cannot be repeated casually. report.json
 *   carries the whole Evidence bundle, which means a failed claim can be
 *   re-judged, or a new claim written and run against the old data, without
 *   touching the live backend again.
 *
 * A FAILURE PRINTS A DIAGNOSIS, NOT AN ASSERTION. "expected 12, got 11" tells
 * the reader what they can already see. Every failing claim in this suite
 * carries a named likely cause and somewhere to look; this file's job is to
 * make sure that text is impossible to miss, not to summarise it away.
 *
 * NO DEPENDENCIES. Node 20+ built-ins only, same as everything else here.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Check, PreflightReport } from './preflight';
import type { AssertionLayer, AssertionResult, Evidence } from './assertions/types';

/* ===========================================================================
   The run, as a whole
=========================================================================== */

export interface RunConfig {
  fe: string;
  be: string;
  roundId: number | null;
  teamCount: number;
  perTeam: number;
  controlTeamNumber: number;
  instructorName: string;
  seed: string | number;
  /** Never the password itself — only whether one was supplied. */
  adminPasswordSupplied: boolean;
}

export interface PhaseRecord {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}

export interface RunReport {
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  config: RunConfig;
  preflight: PreflightReport | null;
  phases: PhaseRecord[];
  assertions: AssertionResult[];
  /** Absent when the run aborted before a round existed. */
  evidence: Evidence | null;
  /** Wait timings, flattened — WaitTimings itself does not serialise. */
  waitSummary: string | null;
  /** Set when the run never got far enough to assert anything. */
  abortReason: string | null;
  verdict: 'GO' | 'NO-GO';
}

/* ===========================================================================
   Terminal
=========================================================================== */

const WIDTH = 100;

export function fmtMs(ms: number): string {
  if (!Number.isFinite(ms)) return 'n/a';
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m${String(Math.round((ms % 60_000) / 1_000)).padStart(2, '0')}s`;
}

/** Word-wrap that keeps a hanging indent, so a three-line diagnosis still reads
 *  as one block belonging to one claim. Same approach preflight.ts uses. */
function wrap(text: string, width: number, indent: string): string[] {
  const out: string[] = [];
  // Respect deliberate newlines — the diagnoses use them for numbered causes.
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    if (words.length === 0) {
      out.push('');
      continue;
    }
    for (const w of words) {
      if (line && line.length + 1 + w.length > width) {
        out.push(line);
        line = w;
      } else {
        line = line ? `${line} ${w}` : w;
      }
    }
    if (line) out.push(line);
  }
  return out.map((l) => indent + l);
}

function rule(char = '─'): string {
  return char.repeat(WIDTH);
}

function heading(title: string): string[] {
  return ['', title.toUpperCase(), rule()];
}

const LAYER_ORDER: readonly AssertionLayer[] = [
  'lifecycle',
  'ingest',
  'concurrency',
  'async pipeline',
  'economics',
  'classifier',
];

function statusTag(ok: boolean, kind: 'check' | 'judgment'): string {
  if (kind === 'judgment') return ok ? 'READING' : 'VERDICT';
  return ok ? 'PASS   ' : 'FAIL   ';
}

function renderPreflight(report: PreflightReport | null): string[] {
  const lines = heading('layer 1 — preflight (read-only)');
  if (!report) {
    lines.push('  not run');
    return lines;
  }
  const width = Math.max(...report.checks.map((c: Check) => c.name.length));
  for (const c of report.checks) {
    const head = `  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(width)}  ${`${c.ms}ms`.padStart(7)}  `;
    const body = wrap(c.detail, WIDTH - head.length, ' '.repeat(head.length));
    lines.push(head + body[0].trimStart());
    lines.push(...body.slice(1));
  }
  return lines;
}

function renderPhases(phases: readonly PhaseRecord[]): string[] {
  const lines = heading('layer 2 — round execution');
  if (!phases.length) {
    lines.push('  no phase ran');
    return lines;
  }
  const width = Math.max(...phases.map((p) => p.name.length));
  for (const p of phases) {
    const head = `  ${p.ok ? 'ok  ' : 'FAIL'}  ${p.name.padEnd(width)}  ${fmtMs(p.ms).padStart(8)}  `;
    const body = wrap(p.detail, WIDTH - head.length, ' '.repeat(head.length));
    lines.push(head + (body[0] ?? '').trimStart());
    lines.push(...body.slice(1));
  }
  return lines;
}

function renderAssertions(results: readonly AssertionResult[]): string[] {
  const lines = heading('layer 2 — the oracle');
  if (!results.length) {
    lines.push('  no claim was evaluated — the run aborted before there was anything to judge');
    return lines;
  }

  const groups = new Map<AssertionLayer, AssertionResult[]>();
  for (const r of results) {
    const bucket = groups.get(r.layer);
    if (bucket) bucket.push(r);
    else groups.set(r.layer, [r]);
  }

  for (const layer of LAYER_ORDER) {
    const group = groups.get(layer);
    if (!group?.length) continue;
    lines.push('', `  ${layer}`);
    for (const r of group) {
      const head = `  ${statusTag(r.ok, r.kind)}  ${String(r.id).padStart(2)}. ${r.name}`;
      lines.push(head);
      lines.push(...wrap(r.summary, WIDTH - 14, ' '.repeat(14)));
      for (const note of r.notes ?? []) {
        lines.push(...wrap(`· ${note}`, WIDTH - 14, ' '.repeat(14)));
      }
      if (!r.ok && r.diagnosis) {
        lines.push(`${' '.repeat(14)}DIAGNOSIS`);
        lines.push(...wrap(r.diagnosis, WIDTH - 16, ' '.repeat(16)));
      }
    }
  }
  return lines;
}

function renderTimings(run: RunReport): string[] {
  if (!run.waitSummary) return [];
  return [...heading('convergence timings'), ...run.waitSummary.split('\n')];
}

/**
 * The verdict line. Deliberately loud and deliberately last: this is the one
 * line that gets screenshotted into a chat window, so it has to carry the
 * counts and the duration on its own.
 */
function renderVerdict(run: RunReport): string[] {
  const failed = run.assertions.filter((a) => !a.ok);
  const preflightFailed = run.preflight ? run.preflight.checks.filter((c) => !c.ok).length : 0;
  const lines = ['', rule('═')];

  if (run.abortReason) {
    lines.push(`NO-GO — the run aborted: ${run.abortReason}`);
  } else if (run.verdict === 'GO') {
    lines.push(
      `GO — ${run.assertions.length} claim(s) upheld, ${run.preflight?.checks.length ?? 0} preflight ` +
        `check(s) passed, ${run.config.teamCount} team(s) carried through a full round in ` +
        `${fmtMs(run.totalMs)}.`,
    );
  } else {
    lines.push(
      `NO-GO — ${failed.length} of ${run.assertions.length} claim(s) FAILED` +
        (preflightFailed ? ` (and ${preflightFailed} preflight check(s))` : '') +
        ` in ${fmtMs(run.totalMs)}.`,
    );
    lines.push(`         ${failed.map((f) => `#${f.id} ${f.name}`).join('; ')}`);
    lines.push('         Each failure above carries a DIAGNOSIS naming the likely cause.');
  }

  lines.push(rule('═'));
  return lines;
}

/** The whole terminal report, as one string. Printing is the caller's job. */
export function renderReport(run: RunReport): string {
  const lines: string[] = [
    rule('═'),
    'AI JOKE FACTORY — END-TO-END CLASSROOM RUN',
    rule('═'),
    `  frontend     ${run.config.fe}`,
    `  backend      ${run.config.be}`,
    `  round        ${run.config.roundId ?? '(never resolved)'}`,
    `  class        ${run.config.teamCount} team(s) × ${run.config.perTeam} joke(s); team ` +
      `${run.config.controlTeamNumber} is the bland control`,
    `  started      ${run.startedAt}`,
    ...renderPreflight(run.preflight),
    ...renderPhases(run.phases),
    ...renderAssertions(run.assertions),
    ...renderTimings(run),
    ...renderVerdict(run),
  ];
  return lines.join('\n');
}

/* ===========================================================================
   Artifacts
=========================================================================== */

/**
 * `2026-09-16T14-32-05Z` — sortable, unambiguous, and legal as a directory name
 * on every filesystem this will ever touch (a bare ISO string is not: colons
 * are reserved on Windows and awkward in a shell everywhere else).
 */
export function timestampDir(when: Date = new Date()): string {
  return when.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
}

/** Minimal CSV quoting: only what the format actually requires. Diagnoses and
 *  joke titles both contain commas and quotes, so this is not optional. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = Array.isArray(value) ? value.join(' ') : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(header: readonly string[], rows: readonly unknown[][]): string {
  return [header.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n') + '\n';
}

/**
 * Per-joke classification latency.
 *
 * LATENCY IS MEASURED PER BATCH, NOT PER JOKE — the worker claims a job for a
 * whole batch and classifies it in one LLM call, so there is no per-joke timing
 * to be had. Each joke therefore carries its BATCH's convergence time, and the
 * column is named `batch_classification_ms` rather than `classification_ms` so
 * nobody averages it as though the twelve values were independent.
 */
function timingsCsv(evidence: Evidence): string {
  const rows: unknown[][] = [];
  const convByTeam = new Map(evidence.convergence.map((c) => [c.teamNumber, c]));

  for (const o of evidence.outcomes) {
    const conv = convByTeam.get(o.teamNumber);
    const scored = new Set(
      (conv?.jokes ?? [])
        .filter((j) => j.good_dimensions.length + j.improve_dimensions.length > 0)
        .map((j) => j.joke_id),
    );
    const submitMs = o.steps.find((s) => s.phase === 'submit')?.ms ?? null;
    const claimMs = o.steps.find((s) => s.phase === 'claim')?.ms ?? null;
    const publishMs = o.steps.find((s) => s.phase === 'publish')?.ms ?? null;

    for (const jokeId of o.splitJokeIds) {
      const published = o.publishedJokeIds.includes(jokeId);
      rows.push([
        o.teamNumber,
        o.teamId,
        o.corpus,
        o.submittedBatchId,
        jokeId,
        published ? 'PUBLISHED' : 'DISCARDED',
        scored.has(jokeId) ? 'yes' : 'no',
        conv ? Math.round(conv.classificationMs) : '',
        conv?.polls ?? '',
        conv?.timedOut ? 'yes' : 'no',
        submitMs === null ? '' : Math.round(submitMs),
        claimMs === null ? '' : Math.round(claimMs),
        publishMs === null ? '' : Math.round(publishMs),
      ]);
    }
  }

  return csv(
    [
      'team_number',
      'team_id',
      'corpus',
      'batch_id',
      'joke_id',
      'decision',
      'scored',
      'batch_classification_ms',
      'classification_polls',
      'classification_timed_out',
      'submit_ms',
      'claim_ms',
      'publish_ms',
    ],
    rows,
  );
}

/**
 * The raw numbers behind claim 8's spread statistic.
 *
 * `sold_count` is the observable PROXY for the fit score — joke_fit is never
 * served on any route — and the feedback signature is the second proxy. Both
 * are here per joke, so the spread claim 8 reports can be recomputed by hand
 * from this file rather than taken on trust.
 */
function scoresCsv(evidence: Evidence): string {
  const board = new Map(evidence.market.map((i) => [i.joke_id, i]));
  const corpusOf = new Map(evidence.outcomes.map((o) => [o.teamNumber, o.corpus]));
  const titleOf = new Map<number, string>();
  const fixtureOf = new Map<number, string>();
  for (const o of evidence.outcomes) {
    for (const [id, title] of Object.entries(o.titles)) titleOf.set(Number(id), title);
    o.splitJokeIds.forEach((id, i) => fixtureOf.set(id, o.handIds[i] ?? ''));
  }

  const rows: unknown[][] = [];
  for (const conv of evidence.convergence) {
    for (const j of conv.jokes) {
      const item = board.get(j.joke_id);
      rows.push([
        conv.teamNumber,
        corpusOf.get(conv.teamNumber) ?? '',
        fixtureOf.get(j.joke_id) ?? '',
        j.joke_id,
        titleOf.get(j.joke_id) ?? j.joke_title,
        item ? item.sold_count : '',
        j.was_bought ? 'yes' : 'no',
        j.good_dimensions.length + j.improve_dimensions.length,
        j.good_dimensions.join(' '),
        j.improve_dimensions.join(' '),
        `${[...j.good_dimensions].sort().join('|')}/${[...j.improve_dimensions].sort().join('|')}`,
      ]);
    }
  }

  return csv(
    [
      'team_number',
      'corpus',
      'fixture_id',
      'joke_id',
      'joke_title',
      'sold_count',
      'was_bought',
      'dimension_count',
      'good_dimensions',
      'improve_dimensions',
      'feedback_signature',
    ],
    rows,
  );
}

export interface WrittenArtifacts {
  dir: string;
  files: string[];
  /** Set when writing failed. A run must not be reported as NO-GO because the
   *  disk was full — the terminal output already carried the verdict. */
  error: string | null;
}

/**
 * Write the run to `scripts/e2e/.results/<timestamp>/`.
 *
 * Never throws. Artifacts are evidence, not the verdict: a run that found a
 * double claim and then could not write a CSV has still found a double claim,
 * and crashing here would lose that on the way out. The failure is returned so
 * the caller can print it.
 *
 * The WaitTimings instance on Evidence does not survive JSON.stringify (it is a
 * class with private state), so it is replaced by its already-computed summary
 * string and dropped from the serialised bundle.
 */
export function writeArtifacts(baseDir: string, run: RunReport): WrittenArtifacts {
  const dir = join(baseDir, timestampDir(new Date(run.startedAt)));
  const files: string[] = [];
  try {
    mkdirSync(dir, { recursive: true });

    // SECURITY. RunConfig carries the admin password because login needs it, but
    // report.json outlives the run on disk. Strip it here as well as at the
    // ApiError dump site: two independent redactions, so neither one is the only
    // thing standing between a secret and a file. `adminPasswordSupplied` already
    // records the only fact a reader actually needs — whether one was given.
    const { adminPassword: _redacted, ...safeConfig } = run.config as RunReport['config'] & {
      adminPassword?: string;
    };

    const serialisable: RunReport = {
      ...run,
      config: safeConfig as RunReport['config'],
      evidence: run.evidence ? { ...run.evidence, timings: undefined as never } : null,
    };
    writeFileSync(join(dir, 'report.json'), `${JSON.stringify(serialisable, null, 2)}\n`, 'utf8');
    files.push('report.json');

    if (run.evidence) {
      writeFileSync(join(dir, 'timings.csv'), timingsCsv(run.evidence), 'utf8');
      files.push('timings.csv');
      writeFileSync(join(dir, 'scores.csv'), scoresCsv(run.evidence), 'utf8');
      files.push('scores.csv');
    }

    return { dir, files, error: null };
  } catch (err) {
    return {
      dir,
      files,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
