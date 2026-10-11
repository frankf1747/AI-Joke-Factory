# Guided walkthrough (replaces the student pop-up tutorial) — design

Status: drafted 2026-10-11 from the conversation. The decisions the user made are in §2. The defaults the controller chose are marked **[default — review]**.
Branch: `feat/lean-market` (frontend `AI-Joke-Factory` only; no backend change).
Prerequisite: `2026-10-11-team-screens-notes-design.md` is implemented first. The tour shows its final screens: no student charts, the Marketing note box, the Joke Maker's "From Marketing" callout and the Customer feedback pop-out.

## 1. Goal

Students have a few minutes, not an hour, to learn the game. Replace the student pop-up tutorial, a modal with illustrations, with a **one-minute guided walkthrough of the real screen**:
- the page dims;
- one area at a time is spotlighted, with a short caption: where to look, what you see, what each number means;
- the screen is filled with sample jokes and numbers that change as the tour plays, so it reads like a demo animation.

Success means:
- a first-time student understands what to do on their seat, and what each number means, after one viewing of about 60 seconds;
- the tour never changes the real game;
- it is skippable and replayable;
- it shows what is actually on the student's screen, because it **is** the student's screen.

## 2. Decisions

| Question | Decision |
|---|---|
| When it plays | **Option A (user):** automatically, the first time a student reaches their role screen. Skippable. The "?" button replays it. |
| Style | **User:** a walkthrough of the real site with highlights and placeholder jokes, like a 1-minute demo animation. |
| Pace | **[default — review]** Auto-play: each step advances on its own after ~5–7 s. Controls: Back, Pause/Play, Next, Skip tour. About 60 s in total. |
| Roles | **[default — review]** Joke Maker and Marketing each get their own tour. The instructor keeps the existing "How this works" modal (instructor tab only). The modal's student and "AI Customers" tabs are retired; one "how customers buy" step is folded into each student tour. |
| Mid-round arrivals | **[default — review]** Auto-play only when the student's round is not ACTIVE: lobby, before Start, between rounds. A student arriving mid-round sees a small dismissible prompt, "New here? Watch the 1-minute tour", instead of a tour that takes over the screen. |
| Classic vs Lean | Steps that only exist in Lean (setup cost line, WIP counter, Lean cost tiles) appear only when the student's round is Lean. The rest is shared. |
| Watch mode | Never auto-plays in an instructor watch tab, and offers no replay button there. This is the same rule as the old tutorial. |
| Dependencies | **[default — review]** No new library. A small in-house spotlight engine gives full control over the scripted demo state and timing. |

## 3. How it works

### 3.1 Demo stage: the real screen, sample data

- While the tour plays, a full-screen **stage** layer covers the app.
- The stage renders the student's real role view (`views/JokeMaker.tsx` or `views/QualityControl.tsx`, inside the same `RoleLayout`) under its own `GameContext.Provider`, whose value is a **demo game** built from a fixed script. `GameContext` is exported for this.
- Every action in the demo game is a no-op: submit, split, release, rate, note and the rest.
- A `DemoModeContext` (`useDemoMode() === true`) tells views and hooks inside the stage not to make network calls. Any direct API call or poll in the student views must check it. The plan audits the views for these.
- The real app keeps running underneath, unchanged. When the tour ends, the stage unmounts and the student is on their real, live screen.

### 3.2 Spotlight engine

- Elements to highlight carry a `data-tour="<id>"` attribute, added to existing elements in the two views and in `RoleLayout`.
- For each step, the engine:
  - finds `[data-tour=id]` inside the stage and scrolls it into view;
  - draws a rounded cut-out spotlight around its bounding box, using a large box-shadow, so the rest dims;
  - places a caption bubble beside it, choosing the side with room.
- The spotlight follows resizes and scroll, using `ResizeObserver` plus scroll and resize listeners.
- A step with no target shows a centred card (welcome and closing).
- If a target is missing, the step shows as a centred card. The tour never stalls.
- A control bar is fixed at the bottom with:
  - a progress bar and "Step n of N";
  - Back, Pause/Play, Next and **Skip tour**.

  Keyboard: Esc skips, ←/→ go back and next, Space pauses.
- Each step has `durationMs` (default 6000) and an optional `onEnter(demo)`, which sets demo state for that moment, for example adding a batch or typing jokes into the textbox. Back replays the previous step's state from scratch: the state for step k is rebuilt by applying `onEnter` for steps 1..k to a fresh demo game, so going back is deterministic.
- `prefers-reduced-motion`: no typing animation (text appears whole), no spotlight transitions, and steps still auto-advance.
- The engine is pure enough to test. The step machine (`next`, `back`, `pause`, `tick`, `skip`) is a reducer, and the timer drives it.

### 3.3 Seen flag and launch

- The key is `jf_tour_seen_v1:<ROLE>` in localStorage. A new key means every student sees the new tour once, even if they dismissed the old tutorial.
- The flag is set when the tour ends: finished or skipped. As before, it is written on dismissal, not on mount, so React StrictMode's double mount cannot suppress it.
- The tour auto-plays when all of these hold:
  - the role is Joke Maker or Marketing;
  - the tab is not in watch mode;
  - the flag is unset;
  - the round is not ACTIVE.
- If the round is ACTIVE and the flag is unset, the header shows the "New here? Watch the 1-minute tour" prompt. Its × dismisses the prompt and sets the flag.
- The header "?" button replays the tour for students, and opens the old modal for the instructor.
- If the round becomes ACTIVE while the tour plays, the Skip button's label changes to **"Round started — go to the game"**, styled as primary.

## 4. Tour scripts

The sample data comes from a fixed script, `services/tour/demoScript.ts`:
- the team is "Team Demo";
- there are five short placeholder jokes, original, clean and one line each;
- one earlier batch is already on the market with 2 of 5 sold;
- the numbers stay plausible and consistent: Profit, Jokes Sold / Made and the costs agree with the game's own formulas at the default prices.

The captions below are the copy to use. Steps marked *(Lean)* are included only in Lean rounds; *(Lean R2)* only when the round has a WIP limit.

### Joke Maker tour (~60 s)

1. *(centre)* **You're the Joke Maker.** "Your team earns money when AI customers buy your jokes. Here's your screen in one minute."
2. *(production textbox; demo types five jokes in)* **Write, then paste.** "Write jokes with your AI tool and paste the whole reply here. Marketing splits it into separate jokes."
3. *(certify + Send to Marketing; demo ticks the box)* **Send a batch.** "Tick the box and press Send to Marketing. Each send is one batch."
4. *(Lean)* *(setup-cost line)* **Every batch has a setup cost.** "Each batch costs money to set up, so make it count."
5. *(Lean R2)* *(WIP counter, demo shows "2 of 2 waiting")* **Don't flood Marketing.** "When Marketing's queue is full you can't send more. Wait, or go help them."
6. *(Value stream; demo batch moves through the stages)* **Follow your batches.** "Each row is a batch. The dots show where every joke is: with Marketing, on the market, sold or wasted."
7. *(the expanded batch's "From Marketing" callout)* **Read Marketing's note.** "Marketing tells you what customers liked and what to change. Read it before you write the next batch."
8. *(stat tiles: Profit, Jokes Sold / Made)* **Your scoreboard.** "Profit is sales minus costs, and it can go negative. Jokes Sold / Made shows how many of your jokes sold at least once."
9. *(centre)* **How customers buy.** "AI customers judge every joke on 12 criteria and buy the ones that fit what they like. Fewer, better-aimed jokes beat lots of random ones."
10. *(centre)* **Your goal.** "Send jokes customers want, learn from each batch, improve the next one." [Start]

### Marketing tour (~60 s)

1. *(centre)* **You're Marketing.** "You decide which jokes go to market. Each joke you publish costs $0.10, and each sale earns $1.00." Use the actual configured prices, not fixed text.
2. *(Marketing Desk; a demo batch arrives and is split into five jokes)* **A batch arrives.** "Your Joke Maker's batch lands here. Split it into separate jokes."
3. *(joke list; demo keeps 3 and discards 2)* **Pick the winners.** "Keep the jokes customers will buy. Discarding costs only $0.01."
4. *(Topic and title fields; demo fills a title)* **Topic and title.** "Give each joke a topic and a title. A good title helps it sell."
5. *(note box; demo types a note)* **Tell your Joke Maker.** "Say what to change next. Your note is sent with this batch."
6. *(Release to market)* **Release.** "Released jokes go on the market, where customers start buying."
7. *(stat tiles: Profit, Jokes Sold / Made, Content Backlog)* **Your scoreboard.** "Profit, how many jokes have sold, and how many jokes are waiting for you."
8. *(Lean)* *(Setup cost and Carrying cost tiles)* **Waste costs money.** "Unsold jokes and waiting batches cost money every minute. Release quickly and publish only what sells."
9. *(Customer feedback card; a demo card shows Landed and Needs-work chips)* **What customers said.** "For your latest jokes: which criteria landed and which missed. It never says by how much."
10. *(Pop-out button)* **Keep it in view.** "Pop the feedback out to keep it on top while you work."
11. *(centre)* **Your goal.** "Ship what sells, tell your Joke Maker why, and improve every batch." [Start]

If a step's target does not exist on the screen, for example because the round has no WIP limit, the step is skipped, not shown blank.

## 5. Units

| Unit | Responsibility |
|---|---|
| `context.tsx` | Export `GameContext`; add `DemoModeContext` and `useDemoMode()`. Live polls and requests are skipped when demo mode is on. |
| `services/tour/tourMachine.ts` | Pure step reducer (`next`, `back`, `pause`, `resume`, `tick`, `skip`, `finish`) and the step type. |
| `services/tour/tourSteps.ts` | Joke Maker and Marketing step lists, plus `stepsFor(role, { lean, wipLimit })`. |
| `services/tour/demoScript.ts` | Placeholder jokes, the initial demo game state, and `buildDemoState(steps, k)`. |
| `services/tour/seen.ts` | Seen-flag read and write, plus `shouldAutoPlay({ role, watch, seen, roundActive })`. |
| `components/tour/DemoStage.tsx` | Full-screen stage that renders the role view with the demo `GameContext` and demo mode on. |
| `components/tour/Spotlight.tsx` | Cut-out highlight, caption bubble placement, and tracking resize and scroll. |
| `components/tour/GuidedTour.tsx` | Puts the stage, spotlight, control bar, timer and keyboard together. |
| `components.tsx` | `TutorialLauncher`: students get the tour (auto-play rule, "?" replay, mid-round prompt); the instructor keeps the old modal. |
| `components/Tutorial.tsx` | Kept for the instructor. Its student and Customers tabs are removed. |
| `views/JokeMaker.tsx`, `views/QualityControl.tsx`, `components.tsx` (RoleLayout) | `data-tour` attributes; demo-mode guards on any direct API calls. |

## 6. Error handling

- A missing target becomes a centred card; a missing step is skipped.
- localStorage unavailable: no auto-play (as today). The "?" button still works.
- An error inside the demo stage is caught by an error boundary around the stage. It ends the tour, sets nothing, and logs to the console. The student lands on the live screen.
- Demo mode must never send a request. A test asserts this.

## 7. Testing

**Vitest**
- The tour machine: auto-advance, back rebuilds state, pause stops ticks, skip and finish set the flag.
- `stepsFor` filtering: Classic vs Lean, and with or without a WIP limit.
- `shouldAutoPlay` for every combination of role, watch mode, seen flag and round state.
- `buildDemoState` is deterministic and its numbers are consistent: profit equals sales × price − published × publish cost − discarded × discard cost, plus the Lean costs.
- With demo mode on, rendering the views makes zero fetch calls (fetch stubbed).
- Static render: each step's `data-tour` target exists in the demo-rendered view, for both roles and both modes.

**Browser (local stack)**
- As a fresh Joke Maker and a fresh Marketing seat with no seen flag, in a round that has not started:
  - the tour auto-plays;
  - every step highlights the right element;
  - the sample data changes as described;
  - Skip, Back and Pause work;
  - the flag is set afterwards;
  - "?" replays.
- Mid-round arrival shows the prompt instead of the tour.
- The instructor's "?" still opens the old modal.
- The live screen afterwards is unchanged, and the network log shows no requests made by the demo.

## 8. Out of scope

- An instructor walkthrough.
- An instructor-triggered tour for the whole class (option B).
- Audio narration.
- Translating captions.
- The "what to do next" coach line and the per-batch result message suggested in conversation (separate projects).
