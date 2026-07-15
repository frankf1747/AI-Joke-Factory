# AI Joke Factory V2 — Phase 2A (FE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconnect the frontend to the real backend once BE Phase 1 + BE Phase 2A (classifier) have landed; verify every Phase 1 feature still works end-to-end on the real server; add an optional instructor debug view for joke classification.

**Architecture:** Frontend stays React 19 + Vite. The only routing change is flipping `VITE_USE_MOCK_API` so requests go to the real backend (Render). The localStorage mock stays installed and reachable behind a toggle for offline development. A small new instructor-only view fetches `/v1/instructor/jokes/{joke_id}/classification` and displays the 11 dim levels.

**Tech Stack:** React 19, TypeScript ~5.8, Vite 6, Vitest, lucide-react.

**Dependencies that MUST be live before starting:**
- BE Phase 1 (Items #1, #2, #3, #7 in [[Backend Change Requests (V2)]]) — `cost_of_creation`, force-release, Topic field, FE rename ack.
- BE Phase 2A (Item #9) — `joke_classifications` populated; debug endpoint `GET /v1/instructor/jokes/{joke_id}/classification`.

**Testing approach:**
- Pure logic: Vitest TDD (e.g. the classification renderer if any).
- Integration / UI: manual verification in the browser against the live backend (each task includes a concrete click-path + expected result).
- TypeScript build (`npm run build`) must pass after every task.

---

## File Structure

**Modified files:**
- `.env.local` — flip back to real BE.
- `services/apiClient.ts` (already supports mock/real toggle — no source change needed, just env).
- `services/jmService.ts` etc. (no change — already call real endpoints).
- `views/Instructor.tsx` — add optional classification debug panel.

**New files:**
- `services/classificationService.ts` — typed wrapper around the new debug endpoint.
- `components/ClassificationDebugPanel.tsx` — small read-only UI for the 11-dim levels.

---

## Task 1: Reconnect FE to the real backend

**Files:**
- Modify: `.env.local`

- [ ] **Step 1: Restore the real backend URL and toggle mock off**

Replace `.env.local` contents with:

```
VITE_API_BASE_URL=https://jokefactory-be.onrender.com
# Set VITE_USE_MOCK_API=true to fall back to the local mock for offline dev.
VITE_USE_MOCK_API=false
```

- [ ] **Step 2: Run dev server and confirm requests go to real BE**

Run: `npm run dev`. Open the app at `http://localhost:3000`. Open DevTools → Network. Join as any player.
Expected: requests fire against `https://jokefactory-be.onrender.com/v1/...` (not localStorage mock). No 4xx/5xx on `/v1/session/me` or `/v1/rounds/active`.

- [ ] **Step 3: Commit**

```bash
git add .env.local
git commit -m "chore: reconnect FE to real backend after BE Phase 1 landed"
```

---

## Task 2: Smoke-test two-cost profit on real BE

**Files:** (verification-only — no code change)

- [ ] **Step 1: As Instructor, configure a round and set `cost_of_creation`**

Log in as Instructor (`Charles2026` / existing password). On the round config screen, set Production Cost = $0.10 (or whatever the BE field is now called). Start the round.

Expected: round status is ACTIVE; backend `/v1/rounds/active` payload includes `cost_of_creation`.

- [ ] **Step 2: As JM, submit a batch and watch the breakdown**

Submit a 5-joke batch. Watch the Profit card on the JM screen.
Expected:
- Profit drops by ~$0.50 (5 × $0.10 production cost) immediately on submit.
- 4-line breakdown shows Revenue $0, Production −$0.50, Publish $0, Profit −$0.50.

- [ ] **Step 3: As Marketing, rate + force-release a joke; verify publish cost lands**

Rate the batch (give one joke a 5, others mixed). Submit.
Expected: Marketing's Profit card publish line increments by `0.10 × published_count`; backend's `cost_breakdown` (if exposed) matches.

- [ ] **Step 4: Commit a note**

If everything looks right, no code commit — just verified. If you found a discrepancy, file it under [[Backend Change Requests (V2)]] Item #1 acceptance and ping Hussain.

---

## Task 3: Smoke-test force-release on real BE

- [ ] **Step 1: As Marketing, rate a batch with NO 5s**

Rate all five jokes 1–3. Submit.
Expected: backend response `published.count = 1` (highest-rated joke). The Market screen (as Customer or via instructor view) shows exactly one joke from that batch.

- [ ] **Step 2: Rate another batch with two 5s**

Submit.
Expected: `published.count = 2`; both 5-rated jokes appear in market.

- [ ] **Step 3: Tied highest with no 5s**

Rate three jokes 4 and the others 2. Submit (no tiebreak hint sent by FE).
Expected: server picks deterministically (lowest `joke_id`); one of the three appears.

If any of these don't match, log against BE Item #2.

---

## Task 4: Smoke-test Topic palette + Marketing tagging

- [ ] **Step 1: As Marketing, rate a batch; confirm Topic is required**

Open a batch. Rate a joke without picking a Topic.
Expected: Submit is blocked with a clear error ("Topic required").

- [ ] **Step 2: Pick a Topic for each joke; submit**

Expected: each joke is persisted with its Topic. Subsequent fetches of `/…/teams/{team_id}/batches` return `topic` per joke (or whatever field name BE chose — confirm with Hussain).

- [ ] **Step 3: As JM, confirm soft hint shows**

Expected: the soft hint line below the paste box shows `Stuck for ideas? Try: Workplace · MBA / Student Life · Tech · AI · Animals · Sports · …`. No Topic picker on the JM screen.

---

## Task 5: Smoke-test the rename + cheap polling fix

- [ ] **Step 1: Log in as QC role**

Expected: header role badge reads "MARKETING"; main card reads "Marketing Desk"; history reads "Marketing History".

- [ ] **Step 2: Hide the tab for 30 seconds**

Switch to another browser tab and back.
Expected: while hidden, no polling occurred (check Network tab); on return, a refresh fires immediately and the regular 2.5 s interval resumes.

---

## Task 6: Add the classification debug service

**Files:**
- Create: `services/classificationService.ts`
- Modify: `types.ts` (add `JokeClassification` shape)

- [ ] **Step 1: Add the type**

In `types.ts`, append:

```ts
export interface JokeClassificationLevel {
  dim_id: string;   // e.g. 'length', 'topic', 'humor_style'
  level: string;    // e.g. 'Short', 'Workplace', 'Pun'
}

export interface JokeClassificationResponse {
  joke_id: JokeId;
  classified_at: string | null;
  status: 'ok' | 'failed' | 'pending';
  classifications: JokeClassificationLevel[];
}
```

- [ ] **Step 2: Create the service**

Create `services/classificationService.ts`:

```ts
import { apiRequest } from './apiClient';
import type { JokeClassificationResponse, JokeId } from '../types';

export const classificationService = {
  get(joke_id: JokeId): Promise<JokeClassificationResponse> {
    return apiRequest<JokeClassificationResponse>(
      `/v1/instructor/jokes/${joke_id}/classification`,
      { method: 'GET' },
    );
  },
};
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add types.ts services/classificationService.ts
git commit -m "feat: add classification debug service"
```

---

## Task 7: Add the classification debug panel (instructor-only)

**Files:**
- Create: `components/ClassificationDebugPanel.tsx`
- Modify: `views/Instructor.tsx` — add a small "Inspect joke classification" panel using the new component.

- [ ] **Step 1: Create the component**

```tsx
// components/ClassificationDebugPanel.tsx
import React, { useState } from 'react';
import { classificationService } from '../services/classificationService';
import type { JokeClassificationResponse } from '../types';
import { Card, Button } from '../components';

export const ClassificationDebugPanel: React.FC = () => {
  const [jokeIdInput, setJokeIdInput] = useState('');
  const [result, setResult] = useState<JokeClassificationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchOne = async () => {
    const id = Number(jokeIdInput);
    if (!Number.isFinite(id)) { setError('Enter a numeric joke_id'); return; }
    setLoading(true); setError(null);
    try {
      const data = await classificationService.get(id);
      setResult(data);
    } catch (e: any) {
      setError(e?.message ?? 'Fetch failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Joke Classification (debug)">
      <div className="flex gap-2 items-center mb-3">
        <input
          type="text"
          value={jokeIdInput}
          onChange={e => setJokeIdInput(e.target.value)}
          placeholder="joke_id"
          className="px-2 py-1 border border-gray-300 rounded text-sm flex-1"
        />
        <Button onClick={fetchOne} disabled={loading}>{loading ? '…' : 'Fetch'}</Button>
      </div>
      {error && <div className="text-sm text-red-700 mb-2">{error}</div>}
      {result && (
        <div>
          <div className="text-xs text-gray-500 mb-2">Status: {result.status} · classified_at: {result.classified_at ?? '—'}</div>
          <ul className="space-y-1">
            {result.classifications.map(c => (
              <li key={c.dim_id} className="text-sm flex justify-between border-b border-gray-100 py-1">
                <span className="font-medium text-gray-700">{c.dim_id}</span>
                <span className="text-gray-900">{c.level}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
};

export default ClassificationDebugPanel;
```

- [ ] **Step 2: Render it on the Instructor page**

In `views/Instructor.tsx`, add the import and place the panel near the existing instructor controls (e.g. as a collapsed/secondary card):

```tsx
import ClassificationDebugPanel from '../components/ClassificationDebugPanel';
// …somewhere in the JSX tree, in a sidebar or below the main controls:
<ClassificationDebugPanel />
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Log in as Instructor. Submit + rate a joke as another tab (JM + Marketing). Note the joke_id from the network response. Paste it into the debug panel → click Fetch.
Expected: panel shows 11 dim → level rows (length, topic, humor_style, complexity, edginess, structure, wordplay, freshness, setup_payoff, clarity, energy).

- [ ] **Step 5: Commit**

```bash
git add components/ClassificationDebugPanel.tsx views/Instructor.tsx
git commit -m "feat: instructor debug panel for joke classification"
```

---

## Self-Review

- **Reconnect** → Task 1.
- **Phase 1 feature verification on real BE** → Tasks 2–5 (cost, force-release, Topic, rename + polling).
- **Classification debug view** → Tasks 6–7.
- **Mock stays available** → Task 1 keeps the toggle in place; no removal.
- Every UI task has a build check + manual verification step. No placeholders.
