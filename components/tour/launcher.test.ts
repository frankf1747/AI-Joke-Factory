import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/* The real GuidedTour portals into document.body, which a static render does
   not have; this stand-in shows whether the launcher chose to play it. */
vi.mock('./GuidedTour', async () => {
  const React = await import('react');
  const actual = await vi.importActual<typeof import('./GuidedTour')>('./GuidedTour');
  return {
    TourErrorBoundary: actual.TourErrorBoundary,
    GuidedTour: (props: { role: string; roundActive: boolean }) =>
      React.createElement('div', { 'data-test-tour': props.role, 'data-round-active': String(props.roundActive) }),
  };
});

import { GameContext } from '../../context';
import { RoleLayout, TOUR_REPLAY_LABEL } from '../../components';
import { demoGameContext, type DemoGameData } from '../../services/tour/demoGame';
import { TOUR_SEEN_PREFIX } from '../../services/tour/seen';
import { TOUR_SEEN_PREFIX as E2E_TOUR_SEEN_PREFIX } from '../../scripts/e2e/browser/session';
import { Role, type GameConfig, type User } from '../../types';
import { TEST_CONFIG } from '../../views/testing/renderWithGame';

/** The gold pill the header no longer shows. */
const OLD_PILL_TEXT = 'New here? Watch the 1-minute tour';

class SpyStorage {
  map = new Map<string, string>();
  writes: string[] = [];
  broken = false;
  get length() { return this.map.size; }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k: string) { if (this.broken) throw new Error('SecurityError'); return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.writes.push(`set ${k}`); this.map.set(k, String(v)); }
  removeItem(k: string) { this.writes.push(`remove ${k}`); this.map.delete(k); }
  clear() { this.map.clear(); }
}

/** The lobby before Round 1 starts, at the default fees. */
const CONFIG: GameConfig = { ...TEST_CONFIG, status: 'LOBBY', isActive: false, startTime: null, elapsedTime: 0 };

function game(role: Role, over: { isActive?: boolean; roundId?: number | null } = {}): DemoGameData {
  const user: User = {
    user_id: 5, display_name: 'Ann_bo', role, team_id: 3, id: '5', name: 'Ann_bo', team: '3', wallet: 0, purchasedJokes: [],
  };
  return {
    user, roster: [user], config: { ...CONFIG, isActive: over.isActive ?? false }, teamNames: {}, batches: [], sales: {},
    roundId: over.roundId === undefined ? 7 : over.roundId, roundIds: { 1: null, 2: null }, roundStatuses: { 1: null, 2: null }, roundTimes: { 1: { startedAt: null, endedAt: null }, 2: { startedAt: null, endedAt: null } },
    marketItems: [], teamSummary: null, teamFeedback: null, instructorLobby: null, instructorStats: null,
    instructorStatsRound1: null, instructorStatsRound2: null, qcQueue: null,
  };
}

const Screen = () => createElement('main', null, 'the live screen');
const render = (role: Role, over: { isActive?: boolean; roundId?: number | null } = {}) =>
  renderToStaticMarkup(createElement(GameContext.Provider, { value: demoGameContext(game(role, over)) },
    createElement(RoleLayout, { tourView: Screen }, createElement(Screen))));

let storage: SpyStorage;
beforeEach(() => {
  storage = new SpyStorage();
  (globalThis as any).localStorage = storage;
});
afterEach(() => {
  delete (globalThis as any).localStorage;
  delete (globalThis as any).sessionStorage;
});

describe('a student\'s first visit', () => {
  for (const role of [Role.JOKE_MAKER, Role.QUALITY_CONTROL]) {
    it(`${role}: the tour plays on its own while the round is not ACTIVE`, () => {
      const html = render(role);
      expect(html).toContain(`data-test-tour="${role}"`);
      expect(html).not.toContain(OLD_PILL_TEXT);
      expect(html).toContain(`aria-label="${TOUR_REPLAY_LABEL}"`);
    });

    it(`${role}: mid-round, no tour and no pill, only the "?"`, () => {
      const html = render(role, { isActive: true });
      expect(html).not.toContain(OLD_PILL_TEXT);
      expect(html).not.toContain('Dismiss the tour prompt');
      expect(html).toContain(`aria-label="${TOUR_REPLAY_LABEL}"`);
      expect(html).not.toContain('data-test-tour');
    });
  }

  it('waits for the round\'s state before deciding, so a mid-round arrival is never shown the tour by mistake', () => {
    const html = render(Role.JOKE_MAKER, { roundId: null });
    expect(html).not.toContain('data-test-tour');
    expect(html).not.toContain(OLD_PILL_TEXT);
    expect(html).toContain(`aria-label="${TOUR_REPLAY_LABEL}"`);
  });

  it('writes no seen-flag on mount, however many times it mounts (StrictMode)', () => {
    render(Role.JOKE_MAKER);
    render(Role.JOKE_MAKER);
    render(Role.QUALITY_CONTROL, { isActive: true });
    expect(storage.writes).toEqual([]);
    expect(render(Role.JOKE_MAKER)).toContain('data-test-tour="JOKE_MAKER"');
  });
});

describe('a student who has seen it', () => {
  it('gets neither the tour nor the prompt, only the "?" to replay it', () => {
    storage.setItem(`${TOUR_SEEN_PREFIX}JOKE_MAKER`, '1');
    for (const isActive of [false, true]) {
      const html = render(Role.JOKE_MAKER, { isActive });
      expect(html).not.toContain('data-test-tour');
      expect(html).not.toContain(OLD_PILL_TEXT);
      expect(html).toContain(`aria-label="${TOUR_REPLAY_LABEL}"`);
    }
  });

  it('the old tutorial flag does not count: everyone sees the new tour once', () => {
    storage.setItem('jf_tutorial_seen_v1:JOKE_MAKER', '1');
    expect(render(Role.JOKE_MAKER)).toContain('data-test-tour="JOKE_MAKER"');
  });
});

describe('no auto-play', () => {
  it('when localStorage cannot be read; "?" still works', () => {
    storage.broken = true;
    const html = render(Role.QUALITY_CONTROL);
    expect(html).not.toContain('data-test-tour');
    expect(html).not.toContain(OLD_PILL_TEXT);
    expect(html).toContain(`aria-label="${TOUR_REPLAY_LABEL}"`);
  });

  it('in an instructor watch tab — and no "?" there either', () => {
    (globalThis as any).sessionStorage = {
      getItem: (k: string) => (k === 'joke_factory_watch_user_id' ? '42' : k === 'joke_factory_watch_display_name' ? 'Bot 1' : null),
    };
    for (const role of [Role.JOKE_MAKER, Role.QUALITY_CONTROL]) {
      const html = render(role);
      expect(html).not.toContain('data-test-tour');
      expect(html).not.toContain(OLD_PILL_TEXT);
      expect(html).not.toContain(TOUR_REPLAY_LABEL);
    }
  });
});

describe('the instructor', () => {
  it('keeps the "How this works" modal, opened once on its own', () => {
    const html = render(Role.INSTRUCTOR);
    expect(html).toContain('title="How this works"');
    expect(html).toContain('Build the room');
    expect(html).not.toContain('data-test-tour');
    storage.setItem('jf_tutorial_seen_v1:INSTRUCTOR', '1');
    expect(render(Role.INSTRUCTOR)).not.toContain('Build the room');
  });

  it('a customer seat has no tutorial at all now', () => {
    const html = render(Role.CUSTOMER);
    expect(html).not.toContain('How this works');
    expect(html).not.toContain(TOUR_REPLAY_LABEL);
  });
});

describe('the browser e2e suite', () => {
  it('seeds the same seen-flag key, so the tour never covers the screen it drives', () => {
    expect(E2E_TOUR_SEEN_PREFIX).toBe(TOUR_SEEN_PREFIX);
  });
});
