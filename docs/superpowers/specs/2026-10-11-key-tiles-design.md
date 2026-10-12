# Four key tiles, the rest behind "More" — design

Status: approved in conversation 2026-10-11 ("keep key tiles (4?) to make space evenly weighted, the rest
behind 'more' button to unfold"). Tile choice is the controller's default. Frontend only, branch `feat/lean-market`.

## 1. Goal

Each student screen shows too many numbers (Joke Maker 6 tiles, Marketing 10). Show four key tiles in an
even 2 × 2 grid, and fold the rest behind a "More" button, so a first-time student knows where to look.

## 2. Tiles

| Screen | Key tiles (always shown, in this order) | Behind "More" |
|---|---|---|
| Joke Maker | Profit · Current Team Rank · Jokes Sold / Made · Created to Publish | Batches · Content Waste |
| Marketing | Profit · Current Team Rank · Jokes Sold / Made · Content Backlog | Created to Publish · Publish → first sale · Content Waste · Shipping fees · Storage fees · Hosting fees |

- **Evenly weighted:** the four key tiles are the same size, value size and height. Profit loses its larger
  `text-xl` value so no tile dominates; its colour tone stays.
- Labels, values, tones and tooltips (the fee tiles' `title`) are unchanged.
- The Lean-only tiles (`leanMode`) stay Lean-only inside "More".

## 3. The "More" control

- A full-width text button under the 2 × 2 grid: **"More numbers"** with a chevron-down icon, which unfolds
  the extra tiles in the same 2-column grid below; when open it reads **"Fewer numbers"** with a chevron-up.
- `aria-expanded` and `aria-controls` on the button; the folded tiles are not rendered (or `hidden`) when closed.
- Closed by default. The open/closed choice is remembered per browser and per role in `localStorage`
  (key `jf_more_tiles_<role>`), every read and write wrapped in try/catch; a failure just means "closed".
- In watch mode (`?watch=`) it behaves the same.
- The Next step line stays directly under the tile block (under the button), unchanged.

## 4. Implementation

- One shared component, `components/StatTiles.tsx`: props `key` tiles (ReactNode[]), `more` tiles
  (ReactNode[]), `storageKey`. Both screens use it. If `more` is empty, no button.
- Tests (`renderToStaticMarkup`): each screen renders exactly its four key tile labels in order; the
  folded labels are absent when closed and present when open (initial-open prop for the test);
  the button's text and `aria-expanded`; storage failure falls back to closed; Lean fee tiles only in Lean.
- Existing screen tests that look for folded tiles are updated to open "More" or to assert absence.

## 5. Out of scope

The tile values themselves, the instructor screen, the walkthrough (it is refreshed afterwards to show
these screens).
