# Handoff: The Joke Factory — V2 UI

## Overview
An educational, browser-based simulation game for an MBA operations / lean-management
class ("chaos → kaizen"). Students play one of two roles — **Joke Maker** (Production)
or **Marketing** (formerly Quality Control) — inside a two-round game run by an
**Instructor**. Jokes flow Production → Marketing → On Market → Sold; 100 AI customers
buy jokes that match a hidden "ideal joke" profile. The UI has four areas: a Flow
overview, a hands-on Tutorial, the three role screens, and supporting visualizations.

## About the Design Files
The files in this bundle are **design references created in HTML/React-via-Babel** —
prototypes that show the intended look and behavior. They are **not production code to
ship directly**. The task is to **recreate these designs in your target codebase** using
its established framework, component library, and patterns (e.g. a real React + bundler
app, Vue, etc.). If no front-end environment exists yet, pick the most appropriate stack
and implement there. Treat the HTML as the source of truth for layout, tokens, copy, and
interaction — not as files to copy verbatim.

The prototype runs React 18 through in-browser Babel with Tailwind via CDN. In a real
codebase you'd use compiled React + a real Tailwind build (or your own design-system
components). The class names in the files map 1:1 to standard Tailwind utilities.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, copy, and interactions. Recreate
pixel-faithfully using your codebase's libraries. Exact hex values, fonts, and Tailwind
classes are given below and in the files.

---

## Tech & structure of the reference
- **Routing/shell:** `app.jsx` — top nav (`Flow`, `Tutorial`, `Joke Maker`, `Marketing`,
  `Instructor`), single `view` state, renders one screen at a time. No real router.
- **Primitives:** `lib.jsx` — `Card`, `StatBox`, `SectionLabel`, `Button`, `Badge`,
  `Icon` (wraps lucide), `BRAND` color object, `fmt$` currency helper.
- **Data/model:** `data.jsx` — `ECON`, `CATEGORIES` (10 topics), `DIMENSIONS` (11 joke
  dimensions), `IDEAL_PROFILE` (hidden target), `JOKES` (samples w/ per-dimension levels
  + fit score), `TEAMS`, `TAG_OPTIONS`.
- **Screens:** `RoleScreens.jsx` — `JokeMakerScreen`, `MarketingScreen`, `InstructorScreen`.
- **Tutorial:** `Tutorial.jsx` — role-based onboarding with interactive demos.
- **Viz:** `FlowBoard.jsx` (animated flow), `MarketingFeed.jsx` (market-intelligence feed).
- **Tokens:** `colors_and_type.css` — CSS variables + type scale.

---

## Design Tokens

### Colors (from `colors_and_type.css` + `BRAND` in `lib.jsx`)
| Token | Hex | Use |
|---|---|---|
| Bruin blue | `#2774AE` | brand accent (instructor) |
| Bruin gold | `#FFD100` | brand accent |
| Navy | `#0f2747` | deep header / ticker bg |
| Action / Production | `#2563eb` (blue-600) | primary buttons, Joke Maker lane |
| Marketing | `#7c3aed` (violet-600) | Marketing lane |
| On-market | `#d97706` (amber-600) | on-market lane |
| Sold | `#059669` (emerald-600) | sold / revenue |
| Waste | `#e11d48` (rose-600) | rejected / loss |
| App background | `#f8fafc` (slate-50) | page bg |
| Card border | `#e5e7eb` (gray-200) | |
| Selected (submit) | green-50 bg / green-400 border / green-600 fill | |
| Default (top rank) | amber-50/60 bg / amber-300 dashed border | |

Joke-fit proximity scale gradient: `linear-gradient(90deg,#e5e7eb 0%,#d9f2e1 55%,#22c55e 100%)`
(gray → green). Marker dot: 11px circle, white fill, 2px border — `#16a34a` if on-target
(proximity ≥ 0.999) else `#94a3b8`.

### Typography
- **UI font:** system sans — `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.
- **Joke font:** **Lora** (Google Fonts), class `.joke-font` → `'Lora', Georgia, 'Times New Roman', serif`. Used for joke text, ~17px, normal weight, relaxed leading.
- **Mono:** for batch ids (`#8841`) and tabular numbers.
- Type scale (px / weight): display 34/800 (-0.02em) · h1 24/700 · h2 20/700 · stat 24/700 tabular · body 15/400 (1.6) · sm 13/500 · label 10–11/700 uppercase 0.08em · mono 12/500.

### Radius / shadow / spacing
- Radius: chips/inputs 6px (`--r-sm`), buttons/tiles 8px (`--r-md`), cards 12px (`--r-lg`), pill 9999px.
- Shadow (card): `0 1px 3px 0 rgb(0 0 0 / .06), 0 1px 2px -1px rgb(0 0 0 / .06)`.
- Card padding 16px (`p-4`); screen gutter `px-5 py-7`; max content width 1280px.

### Icons
[lucide](https://lucide.dev) icon set. Names used incl.: PenTool, ClipboardCheck, Store,
ShoppingBag, Star, Check, X, MousePointerClick, GripVertical, ChevronUp/Down/Right,
Send, Zap, BadgeCheck, MessageSquare, Plus, Trash2, Info, Workflow, GraduationCap, Users,
SlidersHorizontal, Play/Square, RotateCcw, ArrowRight/Left/UpRight/Down.

---

## The simulation model (`data.jsx`) — implement as real domain logic
- **Economics (`ECON`):** marketPrice $1.00/sale, costOfCreation $0.10/joke (charged at
  submit), costOfPublishing $0.10/joke (charged at release), buyerBudget $3.00,
  customers 100, buy threshold **τ = 7 / 11**, swapMargin 0.5, jitter ±0.3,
  tickSeconds 15.
- **10 Topics (`CATEGORIES`):** Workplace, MBA Life, Tech, AI, Animals, Sports, Everyday,
  Social media, Education, Random (each with a lucide icon).
- **11 Dimensions (`DIMENSIONS`):** length, topic, humor_style, complexity, edginess,
  structure, wordplay, freshness, setup_payoff, clarity, energy — each with an ordered
  list of levels. **Categorical (no order): topic, humor_style, structure.** The rest are
  treated as scalar/ordinal.
- **`IDEAL_PROFILE`:** one chosen level per dimension; the hidden target the AI customers
  reward. Instructor sets it.
- **Fit:** each joke has a `fit` 0–11 and a `dims` map of its level per dimension. A
  customer buys an unowned joke when perceived fit (true fit ± jitter) ≥ τ; holds up to 3
  within budget; swaps a held joke only if a new one beats it by > swapMargin.

---

## Screens / Views

### 1. Shell (`app.jsx`)
- Sticky white header (h-16), 1280px centered. Left: factory logo (→ overview). Center:
  pill nav (Flow, Tutorial, Joke Maker, Marketing, Instructor) — active = white bg +
  shadow. Right: role badge + UCLA Anderson lockup. Mobile: horizontal-scroll nav row.
- `main`: 1280px, `px-5 py-7`. Renders the active screen. Footer below.

### 2. Flow / Overview
- Hero "how a joke moves through the factory" animated flow board (`FlowBoard.jsx`) plus
  KPI cards that deep-link into role screens.

### 3. Tutorial (`Tutorial.jsx`)
- Role tabs (Joke Maker / Marketing / AI Customers / Instructor). Two-column `Card`:
  left = step copy + progress dots + Back/Next (last step = "Open the {role} screen"),
  right = a live interactive demo on slate-50.
- **Joke Maker steps:** You run Production → Paste a batch (we split it) → Certify, then
  submit → Then Marketing takes over → Read your scoreboard → Who you're selling to.
- **Marketing steps:** You are Marketing → Rank, then submit → Release to market → Learn
  from every sale → Who you're selling to.
- Interactive demos: `PasteSplitDemo` (numbered-paste splitter), `RankSubmitDemo`
  (drag/arrow reorder + click-to-submit cards), `SoldSignalMini` (dimension scales),
  `ScoreboardMini` (stat tiles + a Marketing feedback note), `CustomerDemo` (animated
  buy grid), plus small visuals (`FlowMini`, `CostChip`, `FitBar`, `ProfileMini`,
  `RoundMini`).

### 4. Joke Maker screen (`JokeMakerScreen`)
Two-column (`lg:grid-cols-3`, left spans 2).
- **Production Line `Card`:** info banner ("Round 1: exactly 5 jokes/batch"); a textarea
  to paste an AI batch (placeholder shows numbered format `1) … 2) … 3) …`); **"Split into
  batch"** button. Splitting: if the text contains numbered markers `\d{1,2}[.)]\s+`
  (e.g. `1)` `2.`), split on those; otherwise split on newlines; trim + drop empties; cap
  at 5. Staged jokes list (max 5) with hover-delete. "I certify these jokes are not
  offensive" checkbox gates **Submit batch** (charges $0.10 × count).
- **Value stream `Card`:** list of submitted `BatchCard`s — each shows `#id`, a row of
  status dots (one per joke), joke count, expand/collapse, and a **Feedback** button →
  `JmFeedbackModal` (Marketing's tags + note, or "awaiting feedback").
- **Right column:** 6 `StatBox` tiles (Current Rank, Sold/Acc, Avg Score, Lead Time,
  Batches, Waste) + "Jokes by stage" `StageDots` card (counts per stage: In review /
  On market / Sold / Wasted).
- **Status colors:** reviewing `#eab308` (yellow), market `#94a3b8` (grey), sold
  `#059669` (green), wasted `#e11d48` (red, faded).

### 5. Marketing screen (`MarketingScreen`) — most-iterated screen
Two-column (left spans 2).
- **Marketing Desk `Card`** — subtitle "Rank the cards (best on top) · assign Topic ·
  click to submit · title each · release". A vertical list of **joke cards** (state:
  `order` array, reorderable). Each card:
  - **Submit-status strip at the top**, shown **only when the card is being submitted**
    (selected → green `bg-green-600 text-white` "Selected to submit"; default-top → amber
    `bg-amber-100 text-amber-800` "Top rank — submits by default"). Non-submitting cards
    show no strip.
  - **Row:** left = rank badge (dark rounded square, tiny "RANK" caption over an **ordinal**
    number `1st/2nd/3rd…`); middle = joke text in a **blockquote** with a 3px violet
    left rule, `.joke-font` (Lora) ~17px; right = a vertical rail with a **GripVertical**
    handle + **▲/▼** reorder buttons.
  - **Topic selector:** `SectionLabel` "Topic" with a red "· required" suffix shown **only
    when this card is being submitted**; chips in a responsive grid
    (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`, even distribution) of all 10 categories;
    selected chip = violet-600 filled.
  - **Market title input:** shown **only when this card is being submitted** — per-joke
    title (not batch-level).
  - **Whole-card interactions:** clicking anywhere on the card **toggles submit** (turns
    light green) — except clicks on buttons/inputs/textarea. The card is **draggable** to
    reorder (drag starting on a button/input is suppressed). Multiple cards may be
    selected. If none are selected, the **top-ranked card publishes by default**.
- **Batch feedback `Card`:** a textarea labeled "Batch feedback (sent to Joke Maker)" —
  free-text notes routed back to Production.
- **Footer:** hint line + **Release to market** (`Button variant="purple"`), enabled only
  when every submitted joke has a Topic and a non-empty title; charges $0.10 × count.
- **Right column:** 4 `StatBox` tiles (Current Rank, Queue, Avg Score, Total Sales) +
  **"What's selling — and why" `Card`** (subtitle "Each sale is free market research:
  which attributes matched customer demand"). On each release, submitted jokes are added
  here as **`SoldSignal`** entries (newest first, fade-in `@keyframes mkFade`). One sale
  is pre-seeded.
  - **`SoldSignal`** = a sold joke's title, the joke text, a one-line takeaway
    "Bought because the **X** and **Y** were right." (the two highest-proximity revealed
    dims), and a **subset of 3 dimensions** revealed: **one of the top-3 closest matches +
    two seeded-random others** (`revealedDims`, deterministic per joke id via `mkSeed`).
  - **`DimScale`** rendering: **categorical** dims → a `✓ match` (emerald) / `✗ off`
    (gray) chip with the level. **Scalar** dims → a **two-line** layout (avoids label
    overlap): line 1 = dimension label + current level; line 2 = min level → gray→green
    track with the proximity marker → max level. Proximity for a dim = `1 − |levelIdx −
    idealIdx| / (levels.length − 1)`. Marker x-position inset so it never overflows:
    `left: calc(5px + (100% − 10px) * proximity)`.

### 6. Instructor screen (`InstructorScreen`)
- Round control bar (Round 1 badge, Start/End/Reset). Two columns: **Hidden ideal joke
  profile** (pick one level on each of the 11 dimensions; selected = Bruin-blue) and
  **Simulation parameters** (`ECON` values as `Param` tiles) + **Live leaderboard** table
  (Team, Sold, Avg fit, Waste, Profit — negative profit in rose).

---

## Interactions & Behavior (key)
- **Numbered paste splitting** (Joke Maker): regex `\d{1,2}[.)]\s+`; fallback to newline.
- **Rank by drag or arrows** (Marketing + tutorial demo): HTML5 drag on the whole card
  (suppressed when the drag starts on a control); live reorder on `dragover`; ▲/▼ swap.
- **Click-to-submit** (Marketing): whole-card click toggles green selection; guarded so
  clicks on buttons/inputs/textarea don't toggle. Default = top-ranked card if none chosen.
- **Release gating:** every submitted joke must have a Topic + non-empty title.
- **Sold-signal reveal:** on release, add `SoldSignal` entries with a deterministic 3-dim
  subset; categorical → check, scalar → proximity scale; fade-in animation.
- **Toasts:** bottom-center pill confirmations for submit / release (auto-dismiss ~2.6–2.8s).
- **Costs:** production charged at submit, publish charged at release ($0.10 each).

## State Management (per screen, current reference uses local React state)
- **Joke Maker:** `input`, `staged[]`, `certified`, `batches[]`, `open` (Set of expanded
  ids), `fb` (feedback modal target), `toast`.
- **Marketing:** `order[]` (reorderable jokes), `topics{}`, `titles{}` (per-joke),
  `selectedIds` (Set), `batchFeedback`, `dragIdx`, `sold[]` (revealed signals), `toast`.
- **Instructor:** `profile` (ideal per dimension), `active` (round running).
In a real app, lift the shared game state (batches, market, sales, ideal profile, econ)
into a server/store; the screens are views over it.

## Responsive behavior
- Desktop-first, 1280px max. Role screens use `lg:grid-cols-3` (left content spans 2,
  right rail 1); stack to a single column below `lg`. Topic chips reflow 2→3→5 columns.
  Header nav collapses to a scrollable row on mobile.

## Assets
- **Fonts:** Lora via Google Fonts (joke text); system sans for UI. Load Lora in your app.
- **Icons:** lucide — use your codebase's icon system or `lucide-react`.
- **No raster images / logos in this bundle.** The "UCLA Anderson" lockup is drawn in
  markup; substitute your real brand asset/system if applicable.

## Files (in this bundle)
> Note: the code/markup files are saved with a trailing `.txt` suffix (e.g.
> `RoleScreens.jsx.txt`) so they don't interfere with project tooling. They are plain
> text — drop the `.txt` to restore the real extension before running. To run the
> standalone prototype, restore `index.html` + the `.jsx`/`.css` names and open `index.html`.

- `index.html.txt` — entry: CDN React/Babel/Tailwind/lucide, Lora font, `.joke-font`, script order.
- `app.jsx.txt` — shell, nav, routing, overview.
- `lib.jsx.txt` — UI primitives + `BRAND` + helpers.
- `data.jsx.txt` — economics, categories, dimensions, ideal profile, sample jokes.
- `RoleScreens.jsx.txt` — Joke Maker, Marketing, Instructor screens (+ `DimScale`, `SoldSignal`).
- `Tutorial.jsx.txt` — role onboarding + interactive demos.
- `FlowBoard.jsx.txt`, `MarketingFeed.jsx.txt` — supporting visualizations.
- `colors_and_type.css.txt` — design tokens + type scale.
