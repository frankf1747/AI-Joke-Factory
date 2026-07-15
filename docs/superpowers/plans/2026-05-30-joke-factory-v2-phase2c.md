# AI Joke Factory V2 — Phase 2C (FE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Marketing Live Feed — a new panel on the Marketing screen that consumes the backend's SSE endpoint and shows every sold joke class-wide with its fit total and per-joke drip-feed reveals (`dim = level ✓`). This closes the V2 loop end-to-end.

**Architecture:** A new `services/sseClient.ts` opens a Server-Sent Events stream to `/v1/marketing/rounds/{round_id}/feed/stream` and emits events into a React hook. A new `MarketingFeed` component consumes the hook and renders a per-joke aggregated table with sticky live ticker. The feed is rendered as a new panel on the Marketing screen alongside the existing Inspection Station and History. UI placement is confirmed with a quick mockup pass at the start of the phase.

**Tech Stack:** React 19, TypeScript ~5.8, Vite 6, Vitest. EventSource (built into the browser, no library needed).

**Dependencies that MUST be live before starting:**
- BE Phase 2A — classifier writing `joke_classifications`.
- BE Phase 2B — AI customer engine creating `purchases` with `revealed_dim_id` + `revealed_level`.
- BE Phase 2C (Items #6, #8) — `GET /v1/marketing/rounds/{round_id}/feed/stream` (SSE) and `GET /v1/marketing/rounds/{round_id}/feed?since={cursor}` (REST fallback for backlog).

**Testing approach:**
- Pure logic (aggregation reducer, dim metadata): Vitest TDD.
- SSE client: integration-tested manually against the live BE; unit test only the message-parsing function.
- UI: manual verification with a populated round.

---

## File Structure

**New files:**
- `services/marketingFeedService.ts` — REST fallback for initial backlog.
- `services/sseClient.ts` — generic SSE client utility (typed).
- `hooks/useMarketingFeed.ts` — React hook combining initial backlog + SSE stream + per-joke aggregation.
- `services/marketingFeed.ts` — pure reducer: list of sale events → per-joke aggregated rows.
- `services/marketingFeed.test.ts` — Vitest tests for the reducer.
- `components/MarketingFeed.tsx` — the panel UI.
- `components/MarketingFeedRow.tsx` — one row (per joke).
- `config/dimensions.ts` — metadata for the 11 dims (id, display label, ordered level list).

**Modified files:**
- `types.ts` — `MarketingFeedEvent` type.
- `views/QualityControl.tsx` — add `<MarketingFeed />` panel.

---

## Task 0 (do first): Confirm UI placement via quick mockup

You agreed earlier that the panel placement is decided after a quick mockup pass. Before writing any production code, sketch where the feed sits on the Marketing screen.

- [ ] **Step 1: Sketch three placement options**

Use a paper/figma/screenshot of the current Marketing layout. Mock up:
- (a) New full-width panel below the right sidebar (Stats + History).
- (b) Replaces the right-column "Inspection History" card.
- (c) New collapsible right-side drawer.

- [ ] **Step 2: Pick one + commit screenshots**

Commit chosen mockup as `docs/superpowers/specs/2026-05-30-marketing-feed-placement.md` (or .png).
For the rest of this plan, the code targets **option (a) — new panel below the existing right sidebar**. If you pick a different option, adjust Task 8 only.

---

## Task 1: Dimension metadata module

**Files:**
- Create: `config/dimensions.ts`
- Create: `config/dimensions.test.ts`

The 11 dimensions need a shared metadata source: id (matches backend), display label, ordered list of allowed levels.

- [ ] **Step 1: Write failing tests**

Create `config/dimensions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DIMENSIONS, dimById } from './dimensions';

describe('DIMENSIONS', () => {
  it('has exactly 11 entries', () => {
    expect(DIMENSIONS).toHaveLength(11);
  });

  it('every id is unique', () => {
    const ids = DIMENSIONS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('dimById returns the right dim or undefined', () => {
    expect(dimById('length')?.label).toBeDefined();
    expect(dimById('bogus')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — Expected FAIL**

Run: `npm test`.

- [ ] **Step 3: Implement**

Create `config/dimensions.ts`:

```ts
export interface DimensionDef {
  id: string;          // matches backend dim_id
  label: string;       // user-facing
  levels: string[];    // ordered (ordinal) or unordered (categorical) list of valid level values
}

export const DIMENSIONS: DimensionDef[] = [
  { id: 'length',           label: 'Length',           levels: ['Short', 'Medium', 'Long'] },
  { id: 'topic',            label: 'Topic',            levels: ['Workplace', 'MBA / Student Life', 'Tech', 'AI', 'Animals', 'Sports', 'Everyday life', 'Social media', 'Education', 'Random / absurd'] },
  { id: 'humor_style',      label: 'Humor Style',      levels: ['Pun', 'Observational', 'Irony', 'Absurdity', 'Exaggeration', 'Self-deprecating', 'Anti-joke', 'Callback'] },
  { id: 'complexity',       label: 'Complexity',       levels: ['Very simple', 'Simple', 'Moderate', 'Thoughtful', 'Expert'] },
  { id: 'edginess',         label: 'Edginess',         levels: ['Clean', 'Slightly edgy'] },
  { id: 'structure',        label: 'Structure',        levels: ['One-liner', 'Setup-punchline', 'Q&A', 'Short story', 'Dialogue', 'List'] },
  { id: 'wordplay',         label: 'Wordplay',         levels: ['None', 'Light', 'Moderate', 'Heavy'] },
  { id: 'freshness',        label: 'Freshness',        levels: ['Timeless', 'Slightly current', 'Current', 'Very topical', 'Time-sensitive'] },
  { id: 'setup_payoff',     label: 'Setup→Payoff',     levels: ['Immediate', 'Quick', 'Balanced', 'Long', 'Very long build'] },
  { id: 'clarity',          label: 'Clarity',          levels: ['Crystal clear', 'Mostly clear', 'Slightly ambiguous', 'Ambiguous', 'Reinterpretation'] },
  { id: 'energy',           label: 'Energy',           levels: ['Deadpan', 'Low', 'Conversational', 'Animated', 'High-energy'] },
];

const byId = new Map(DIMENSIONS.map(d => [d.id, d]));
export function dimById(id: string): DimensionDef | undefined {
  return byId.get(id);
}
```

- [ ] **Step 4: Run tests — Expected PASS**

- [ ] **Step 5: Commit**

```bash
git add config/dimensions.ts config/dimensions.test.ts
git commit -m "feat: dimension metadata for the Marketing Feed UI"
```

---

## Task 2: Feed event type + pure aggregation reducer

**Files:**
- Modify: `types.ts` — add `MarketingFeedEvent`.
- Create: `services/marketingFeed.ts` — pure reducer.
- Create: `services/marketingFeed.test.ts`.

- [ ] **Step 1: Type the event**

In `types.ts`, append:

```ts
export interface MarketingFeedEvent {
  purchase_id: number;
  team_id: TeamId;
  team_name: string;
  joke_id: JokeId;
  joke_title: string;
  fit_total: number;             // 0..11
  revealed_dim_id: string;       // one of DIMENSIONS[].id
  revealed_level: string;        // the joke's level on that dim
  created_at: string;            // ISO timestamp
}

export interface MarketingFeedAggregatedJoke {
  joke_id: JokeId;
  team_id: TeamId;
  team_name: string;
  joke_title: string;
  fit_total: number;
  sales_count: number;
  // dim_id → revealed level (the joke's actual level on that dim — same on every reveal)
  revealedLevels: Record<string, string>;
  last_sale_at: string;
}
```

- [ ] **Step 2: Write failing tests for the reducer**

Create `services/marketingFeed.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { aggregateFeedEvents } from './marketingFeed';
import type { MarketingFeedEvent } from '../types';

const ev = (overrides: Partial<MarketingFeedEvent>): MarketingFeedEvent => ({
  purchase_id: 0, team_id: 1 as any, team_name: 'Alpha',
  joke_id: 100 as any, joke_title: 'Atoms walk into a bar',
  fit_total: 7.83, revealed_dim_id: 'humor_style', revealed_level: 'Pun',
  created_at: '2026-06-01T10:00:00Z',
  ...overrides,
});

describe('aggregateFeedEvents', () => {
  it('groups events by joke_id and counts sales', () => {
    const events = [
      ev({ purchase_id: 1 }),
      ev({ purchase_id: 2, revealed_dim_id: 'length', revealed_level: 'Short' }),
      ev({ purchase_id: 3 }),
    ];
    const rows = aggregateFeedEvents(events);
    expect(rows).toHaveLength(1);
    expect(rows[0].sales_count).toBe(3);
    expect(rows[0].revealedLevels.humor_style).toBe('Pun');
    expect(rows[0].revealedLevels.length).toBe('Short');
  });

  it('keeps separate rows per joke_id', () => {
    const events = [
      ev({ joke_id: 100 as any, purchase_id: 1 }),
      ev({ joke_id: 200 as any, purchase_id: 2, joke_title: 'Other', fit_total: 9.16 }),
    ];
    const rows = aggregateFeedEvents(events);
    expect(rows).toHaveLength(2);
  });

  it('sorts by fit_total descending by default', () => {
    const events = [
      ev({ joke_id: 100 as any, purchase_id: 1, fit_total: 6.5 }),
      ev({ joke_id: 200 as any, purchase_id: 2, fit_total: 9.16, joke_title: 'Best' }),
      ev({ joke_id: 300 as any, purchase_id: 3, fit_total: 7.83, joke_title: 'Mid' }),
    ];
    const rows = aggregateFeedEvents(events);
    expect(rows.map(r => r.fit_total)).toEqual([9.16, 7.83, 6.5]);
  });
});
```

- [ ] **Step 3: Run tests — Expected FAIL**

- [ ] **Step 4: Implement the reducer**

Create `services/marketingFeed.ts`:

```ts
import type { MarketingFeedEvent, MarketingFeedAggregatedJoke } from '../types';

/**
 * Fold a stream of sale events into per-joke aggregated rows.
 * Multiple events for the same joke add to sales_count and merge revealedLevels.
 * (A joke's level on any given dim is fixed, so later reveals just confirm earlier ones.)
 */
export function aggregateFeedEvents(events: MarketingFeedEvent[]): MarketingFeedAggregatedJoke[] {
  const byJoke = new Map<number, MarketingFeedAggregatedJoke>();
  for (const e of events) {
    const key = Number(e.joke_id);
    const existing = byJoke.get(key);
    if (existing) {
      existing.sales_count += 1;
      existing.revealedLevels[e.revealed_dim_id] = e.revealed_level;
      if (e.created_at > existing.last_sale_at) existing.last_sale_at = e.created_at;
    } else {
      byJoke.set(key, {
        joke_id: e.joke_id,
        team_id: e.team_id,
        team_name: e.team_name,
        joke_title: e.joke_title,
        fit_total: e.fit_total,
        sales_count: 1,
        revealedLevels: { [e.revealed_dim_id]: e.revealed_level },
        last_sale_at: e.created_at,
      });
    }
  }
  return Array.from(byJoke.values()).sort((a, b) => b.fit_total - a.fit_total);
}
```

- [ ] **Step 5: Run tests — Expected PASS**

- [ ] **Step 6: Commit**

```bash
git add types.ts services/marketingFeed.ts services/marketingFeed.test.ts
git commit -m "feat: feed event type + per-joke aggregation reducer"
```

---

## Task 3: REST backlog service

**Files:**
- Create: `services/marketingFeedService.ts`

- [ ] **Step 1: Implement the REST fallback**

```ts
// services/marketingFeedService.ts
import { apiRequest } from './apiClient';
import type { MarketingFeedEvent, RoundId } from '../types';

interface MarketingFeedBacklogResponse {
  events: MarketingFeedEvent[];
  next_cursor?: string;
}

export const marketingFeedService = {
  backlog(round_id: RoundId, since?: string): Promise<MarketingFeedBacklogResponse> {
    const q = since ? `?since=${encodeURIComponent(since)}` : '';
    return apiRequest<MarketingFeedBacklogResponse>(
      `/v1/marketing/rounds/${round_id}/feed${q}`,
      { method: 'GET' },
    );
  },
};
```

- [ ] **Step 2: Build check + commit**

```bash
npm run build
git add services/marketingFeedService.ts
git commit -m "feat: REST backlog service for marketing feed"
```

---

## Task 4: SSE client utility

**Files:**
- Create: `services/sseClient.ts`

`EventSource` is built into the browser. This wrapper adds typed messages + auth header injection (note: native `EventSource` doesn't support custom headers; if BE needs `X-User-Id` in URL/query instead, adjust per BE).

- [ ] **Step 1: Implement**

```ts
// services/sseClient.ts
// Minimal SSE client. Uses native EventSource.
// Note: EventSource cannot set custom headers; BE accepts X-User-Id as a query param for the stream endpoint.

export interface SseOptions<T> {
  url: string;                      // full URL including auth query
  onEvent: (data: T, eventId?: string) => void;
  onError?: (err: Event) => void;
  lastEventId?: string;             // resume cursor
}

export interface SseConnection {
  close: () => void;
}

export function openSse<T>(opts: SseOptions<T>): SseConnection {
  const url = opts.lastEventId
    ? `${opts.url}${opts.url.includes('?') ? '&' : '?'}lastEventId=${encodeURIComponent(opts.lastEventId)}`
    : opts.url;
  const es = new EventSource(url, { withCredentials: false });

  es.onmessage = (ev) => {
    try {
      const parsed = JSON.parse(ev.data) as T;
      opts.onEvent(parsed, ev.lastEventId);
    } catch {
      // ignore malformed
    }
  };

  es.onerror = (ev) => {
    opts.onError?.(ev);
    // EventSource auto-reconnects on transient errors; only close on permanent failure.
  };

  return {
    close: () => es.close(),
  };
}
```

- [ ] **Step 2: Build check + commit**

```bash
npm run build
git add services/sseClient.ts
git commit -m "feat: typed SSE client wrapper"
```

---

## Task 5: `useMarketingFeed` hook

**Files:**
- Create: `hooks/useMarketingFeed.ts`

- [ ] **Step 1: Implement**

```tsx
// hooks/useMarketingFeed.ts
import { useEffect, useRef, useState, useMemo } from 'react';
import { useGame } from '../context';
import { marketingFeedService } from '../services/marketingFeedService';
import { openSse, type SseConnection } from '../services/sseClient';
import { aggregateFeedEvents } from '../services/marketingFeed';
import type { MarketingFeedEvent, MarketingFeedAggregatedJoke } from '../types';

export interface UseMarketingFeedResult {
  events: MarketingFeedEvent[];        // raw events (newest last); useful for the ticker
  rows: MarketingFeedAggregatedJoke[]; // aggregated per joke, sorted by fit desc
  connected: boolean;
}

export function useMarketingFeed(): UseMarketingFeedResult {
  const { user, config } = useGame();
  const roundId = (config as any)?.roundId ?? (config as any)?.round_id ?? 1;
  const userId = user?.user_id;

  const [events, setEvents] = useState<MarketingFeedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const sseRef = useRef<SseConnection | null>(null);
  const lastIdRef = useRef<string | undefined>(undefined);

  // Initial backlog + SSE
  useEffect(() => {
    if (!userId || !roundId) return;
    let cancelled = false;

    const start = async () => {
      try {
        const backlog = await marketingFeedService.backlog(roundId);
        if (cancelled) return;
        setEvents(backlog.events);
        lastIdRef.current = backlog.next_cursor;
      } catch { /* live stream still attempted */ }

      const base = (import.meta as any).env?.VITE_API_BASE_URL || '';
      const url = `${base}/v1/marketing/rounds/${roundId}/feed/stream?X-User-Id=${userId}`;
      sseRef.current = openSse<MarketingFeedEvent>({
        url,
        lastEventId: lastIdRef.current,
        onEvent: (data, eventId) => {
          if (cancelled) return;
          setConnected(true);
          if (eventId) lastIdRef.current = eventId;
          setEvents(prev => [...prev, data].slice(-1000)); // soft cap
        },
        onError: () => setConnected(false),
      });
    };
    start();

    return () => {
      cancelled = true;
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, [userId, roundId]);

  const rows = useMemo(() => aggregateFeedEvents(events), [events]);
  return { events, rows, connected };
}
```

- [ ] **Step 2: Build check + commit**

```bash
npm run build
git add hooks/useMarketingFeed.ts
git commit -m "feat: useMarketingFeed hook (backlog + SSE + aggregation)"
```

---

## Task 6: Per-row component

**Files:**
- Create: `components/MarketingFeedRow.tsx`

- [ ] **Step 1: Implement**

```tsx
// components/MarketingFeedRow.tsx
import React from 'react';
import { DIMENSIONS } from '../config/dimensions';
import type { MarketingFeedAggregatedJoke } from '../types';
import { Check } from 'lucide-react';

const fmtFit = (n: number) => `${n.toFixed(2)} / 11`;

export const MarketingFeedRow: React.FC<{ row: MarketingFeedAggregatedJoke }> = ({ row }) => (
  <div className="border border-gray-200 rounded-md p-3 bg-white">
    <div className="flex justify-between items-start mb-2">
      <div>
        <div className="text-sm font-semibold text-gray-900">{row.joke_title || `Joke #${row.joke_id}`}</div>
        <div className="text-xs text-gray-500">{row.team_name} · {row.sales_count} sales</div>
      </div>
      <div className="text-right">
        <div className="text-lg font-bold text-emerald-700">{fmtFit(row.fit_total)}</div>
        <div className="text-[10px] uppercase text-gray-400">fit</div>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      {DIMENSIONS.map(d => {
        const level = row.revealedLevels[d.id];
        const revealed = !!level;
        return (
          <div
            key={d.id}
            className={`flex justify-between ${revealed ? 'text-gray-800' : 'text-gray-300'}`}
          >
            <span>{d.label}</span>
            <span className="flex items-center gap-1">
              {revealed ? <>{level} <Check size={12} className="text-emerald-500" /></> : '—'}
            </span>
          </div>
        );
      })}
    </div>
  </div>
);

export default MarketingFeedRow;
```

- [ ] **Step 2: Build check + commit**

```bash
npm run build
git add components/MarketingFeedRow.tsx
git commit -m "feat: MarketingFeedRow per-joke aggregated card"
```

---

## Task 7: Panel component (live ticker + aggregated rows)

**Files:**
- Create: `components/MarketingFeed.tsx`

- [ ] **Step 1: Implement**

```tsx
// components/MarketingFeed.tsx
import React from 'react';
import { useMarketingFeed } from '../hooks/useMarketingFeed';
import { Card } from '../components';
import { MarketingFeedRow } from './MarketingFeedRow';

export const MarketingFeed: React.FC = () => {
  const { events, rows, connected } = useMarketingFeed();
  const recent = events.slice(-5).reverse();

  return (
    <Card title="Market Feed (class-wide)">
      <div className="text-xs mb-3">
        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${connected ? 'bg-emerald-500' : 'bg-gray-400'}`} />
        {connected ? 'Live' : 'Connecting…'}
      </div>

      {recent.length > 0 && (
        <div className="mb-4 border-l-4 border-emerald-200 pl-3">
          <div className="text-[10px] uppercase text-gray-400 mb-1">Last few sales</div>
          <ul className="space-y-1">
            {recent.map(e => (
              <li key={e.purchase_id} className="text-xs text-gray-700">
                <span className="font-medium">{e.team_name}</span> · {e.joke_title || `#${e.joke_id}`} · fit {e.fit_total.toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {rows.length === 0 ? (
          <div className="text-sm text-gray-400 italic text-center py-6">No sales yet — feed will populate as customers buy.</div>
        ) : (
          rows.map(r => <MarketingFeedRow key={r.joke_id} row={r} />)
        )}
      </div>
    </Card>
  );
};

export default MarketingFeed;
```

- [ ] **Step 2: Build check + commit**

```bash
npm run build
git add components/MarketingFeed.tsx
git commit -m "feat: MarketingFeed panel (live ticker + aggregated rows)"
```

---

## Task 8: Integrate into the Marketing screen

**Files:**
- Modify: `views/QualityControl.tsx`

Plan assumes option (a) from Task 0 (full-width new panel below the right sidebar). If you chose differently, adjust placement.

- [ ] **Step 1: Add the import and place the panel**

In `views/QualityControl.tsx`, add at top:

```tsx
import MarketingFeed from '../components/MarketingFeed';
```

Locate the outer grid (`<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">`). Wrap that grid plus a new full-width panel in a vertical flex (or add a row below it). Easiest: after the closing `</div>` of that grid, add:

```tsx
<div className="mt-8">
  <MarketingFeed />
</div>
```

- [ ] **Step 2: Build check**

Run: `npm run build` — Expected: PASS.

- [ ] **Step 3: Manual verification (end-to-end)**

Have BE Phase 2A + 2B + 2C running. Start a round; submit + rate jokes; let the customer engine tick.
Expected within 30 s:
- The "Live" indicator turns green (SSE connected).
- Last-few-sales ticker shows recent sale lines.
- Per-joke aggregated rows appear, sorted by fit descending.
- Each row's "revealed" dims show `level ✓`; unrevealed dims are greyed out and show `—`.
- As more sales accumulate, more dims fill in per row (the drip-feed effect).

Switch users: log in as JM. Confirm the Marketing Feed panel does **NOT** appear on the JM screen.

- [ ] **Step 4: Commit**

```bash
git add views/QualityControl.tsx
git commit -m "feat: render MarketingFeed panel on Marketing screen"
```

---

## Self-Review

- **Mockup-first** → Task 0 (placement decision locked before code).
- **Dim metadata** → Task 1 (shared source of truth for the 11 dims).
- **Pure aggregation logic** → Tasks 2 (with Vitest TDD).
- **Backend integration** → Tasks 3 (REST backlog) + 4 (SSE) + 5 (hook).
- **UI components** → Tasks 6 (row) + 7 (panel).
- **Integration** → Task 8 (mounted on Marketing screen only — JM unaffected).
- All UI tasks end with a build check; the end-to-end test in Task 8 is the canonical verification.
- No JM-facing changes (the info-lag is preserved by the panel being Marketing-only).
- No removal of Phase 1 / Phase 2A / Phase 2B features.
