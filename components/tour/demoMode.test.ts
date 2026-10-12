import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { DemoModeContext, GameContext } from '../../context';
import { RoleLayout } from '../../components';
import JokeMaker from '../../views/JokeMaker';
import QualityControl from '../../views/QualityControl';
import { DEMO_ACTIONS, demoGameContext, type DemoGameData } from '../../services/tour/demoGame';
import { EMPTY_DEMO_UI } from '../../services/tour/demoUi';
import { TEST_CONFIG, testUser } from '../../views/testing/renderWithGame';
import { Role } from '../../types';

/* Demo mode must never reach the network (spec §6). Three locks, one per way a
   request could leave the guided tour's stage:
     1. every action in the demo game is a no-op;
     2. rendering the student views in demo mode makes no request;
     3. nothing reachable from the student views calls the network directly —
        every request they can cause goes through a context action, which (1)
        has replaced. A new direct call in a view fails this test until it is
        routed through the context or checks useDemoMode(). */

const ROOT = resolve(__dirname, '../..');

class SpyStorage {
  map = new Map<string, string>();
  writes: string[] = [];
  get length() { return this.map.size; }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.writes.push(`set ${k}`); this.map.set(k, String(v)); }
  removeItem(k: string) { this.writes.push(`remove ${k}`); this.map.delete(k); }
  clear() { this.writes.push('clear'); this.map.clear(); }
}

function data(role: Role): DemoGameData {
  const user = testUser(role, 99);
  return {
    user, roster: [user], config: TEST_CONFIG, teamNames: { '99': 'Team Demo' },
    batches: [], sales: {}, roundId: 1, roundIds: { 1: 1, 2: null }, roundStatuses: { 1: 'ACTIVE', 2: null },
    marketItems: [], teamSummary: null, teamFeedback: null, instructorLobby: null, instructorStats: null,
    instructorStatsRound1: null, instructorStatsRound2: null,
    qcQueue: {
      batch: { batch_id: 7, round_id: 1, team_id: 99, submitted_at: '2026-10-11T10:00:00Z', raw_text: '1) One.\n2) Two.' },
      jokes: [{ joke_id: 71, joke_text: 'One.' }, { joke_id: 72, joke_text: 'Two.' }],
      queue_size: 1,
    },
  };
}

const inDemo = (role: Role, view: ReactElement) =>
  createElement(DemoModeContext.Provider, { value: EMPTY_DEMO_UI },
    createElement(GameContext.Provider, { value: demoGameContext(data(role)) }, view));

const realFetch = globalThis.fetch;
let fetchSpy: ReturnType<typeof vi.fn>;
let storage: SpyStorage;

beforeEach(() => {
  fetchSpy = vi.fn(async () => { throw new Error('network call from the demo'); });
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  storage = new SpyStorage();
  (globalThis as any).localStorage = storage;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as any).localStorage;
});

describe('the demo game', () => {
  it('turns every action into a no-op: no request, no storage write, nothing reported as done', async () => {
    const results = await Promise.all([
      DEMO_ACTIONS.login('a', Role.JOKE_MAKER),
      DEMO_ACTIONS.instructorLogin('a', 'b'),
      DEMO_ACTIONS.updateConfig({ marketPrice: 2 }),
      DEMO_ACTIONS.setGameActive(true),
      DEMO_ACTIONS.endRound(),
      DEMO_ACTIONS.toggleTeamPopup(true),
      DEMO_ACTIONS.resetGame(),
      DEMO_ACTIONS.formTeams(),
      DEMO_ACTIONS.updateUser('1', { role: Role.JOKE_MAKER }),
      DEMO_ACTIONS.deleteUser('1'),
      DEMO_ACTIONS.addBatch(['a joke']),
      DEMO_ACTIONS.submitRawBatch('1) a joke that is long enough'),
      DEMO_ACTIONS.splitBatch('7', ['One.', 'Two.']),
      DEMO_ACTIONS.unsplitBatch('7'),
      DEMO_ACTIONS.publishBatch('7', [71], { '71': 'T' }, 'a note'),
    ]);
    DEMO_ACTIONS.logout();
    DEMO_ACTIONS.setRound(2);
    DEMO_ACTIONS.resetToLobby();
    DEMO_ACTIONS.updateTeamName('99', 'x');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storage.writes).toEqual([]);
    // The calls that report success report failure, so no view shows a "sent" toast.
    expect(results.filter(r => r === true)).toEqual([]);
    expect(results[2]).toEqual({ saved: false, feeRounds: [] });
  });

  it('keeps the data it was given and adds every action', () => {
    const ctx = demoGameContext(data(Role.JOKE_MAKER));
    expect(ctx.teamNames).toEqual({ '99': 'Team Demo' });
    expect(Object.keys(DEMO_ACTIONS)).toHaveLength(19);
    for (const key of Object.keys(DEMO_ACTIONS)) expect(typeof (ctx as any)[key]).toBe('function');
  });
});

describe('the student views in demo mode', () => {
  it('render without a request or a storage write', () => {
    const jm = renderToStaticMarkup(inDemo(Role.JOKE_MAKER, createElement(JokeMaker)));
    const mk = renderToStaticMarkup(inDemo(Role.QUALITY_CONTROL, createElement(QualityControl)));
    expect(jm).toContain('Production Line');
    expect(mk).toContain('Marketing Desk');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storage.writes).toEqual([]);
  });

  it('have no tutorial launcher in the header', () => {
    const header = (demo: boolean) => {
      const layout = createElement(GameContext.Provider, { value: demoGameContext(data(Role.INSTRUCTOR)) },
        createElement(RoleLayout, null, 'body'));
      return renderToStaticMarkup(demo ? createElement(DemoModeContext.Provider, { value: EMPTY_DEMO_UI }, layout) : layout);
    };
    expect(header(false)).toContain('title="How this works"');
    expect(header(true)).not.toContain('title="How this works"');
  });
});

/* ---------- 3. Nothing reachable from the student views calls the network ---------- */

/** The modules that talk to the backend. A view may import a constant from one
 *  (QualityControl reads MARKETING_NOTE_MAX from marketingService), so they are
 *  leaves of the walk, not failures; what fails is a CALL into them. */
const NETWORK_MODULES = new Set([
  'services/apiClient.ts', 'services/shared/client.ts', 'services/mockApi.ts',
  'services/jmService.ts', 'services/marketingService.ts', 'services/customerService.ts',
  'services/sessionService.ts', 'services/instructorService.ts', 'services/useLeanCharts.ts',
  'services/api/index.ts', 'services/api/team.ts', 'services/api/marketing.ts',
  'services/api/session.ts', 'services/api/instructor.ts',
]);
/** context.tsx makes its requests inside GameProvider (never rendered in the
 *  stage: it has its own demo provider) and inside its actions (replaced by
 *  DEMO_ACTIONS). It is the one module the views may reach that is allowed to. */
const ALLOWED_TO_CALL = new Set(['context.tsx']);
const DIRECT_CALLS: RegExp[] = [
  /\bfetch\s*\(/,
  /\bapiRequest\s*[<(]/,
  /\b(jmService|marketingService|customerService|sessionService|instructorService|teamApi|marketingApi|sessionApi|instructorApi)\s*\.\s*\w+\s*\(/,
  /\bnew\s+(WebSocket|EventSource|XMLHttpRequest)\b/,
  /\bsendBeacon\s*\(/,
  /\buseLeanCharts\s*\(/,
];

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null; // a package
  const base = resolve(dirname(from), spec);
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(cand) && /\.tsx?$/.test(cand)) return cand;
  }
  return null;
}

function reachable(roots: string[]): string[] {
  const seen = new Set<string>();
  const queue = roots.map(r => resolve(ROOT, r));
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const rel = relative(ROOT, file);
    if (NETWORK_MODULES.has(rel) || ALLOWED_TO_CALL.has(rel)) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g)) {
      const next = resolveImport(file, m[1] ?? m[2]);
      if (next) queue.push(next);
    }
  }
  return [...seen].map(f => relative(ROOT, f));
}

const STUDENT_VIEW_ROOTS = ['views/JokeMaker.tsx', 'views/QualityControl.tsx'];

describe('direct network calls reachable from the student views', () => {
  it('there are none outside context.tsx', () => {
    const files = reachable(STUDENT_VIEW_ROOTS);
    expect(files).toContain('components.tsx');
    expect(files).toContain('components/CustomerFeedbackCard.tsx');
    expect(files).toContain('components/NextStep.tsx');
    expect(files).toContain('components/StatTiles.tsx');
    const offenders: string[] = [];
    for (const rel of files) {
      if (NETWORK_MODULES.has(rel) || ALLOWED_TO_CALL.has(rel)) continue;
      const src = readFileSync(resolve(ROOT, rel), 'utf8');
      for (const re of DIRECT_CALLS) if (re.test(src)) offenders.push(`${rel}: ${re}`);
    }
    expect(offenders).toEqual([]);
  });
});
