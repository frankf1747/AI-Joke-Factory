/**
 * Layer 3 — real-browser, three-role walkthrough against the LIVE deployment.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ THIS SPEC IS RUNNABLE BUT NOT SELF-DRIVING.                               │
 * │                                                                            │
 * │ A parent orchestrator owns the instructor password, the destructive DB     │
 * │ reset (`POST /v1/admin/reset`) and the round configuration. This file      │
 * │ therefore:                                                                 │
 * │   • reads EVERY credential and identity from the environment,              │
 * │   • hardcodes NO password, ever,                                           │
 * │   • SKIPS cleanly (not fails) when E2E_ADMIN_PASSWORD is absent,           │
 * │   • exports its per-role page objects so the orchestrator can reuse the    │
 * │     steps piecemeal instead of re-running the whole test.                  │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Preconditions the orchestrator is responsible for (this spec asserts them
 * rather than creating them):
 *   1. The backend DB is in a known state (reset, or at least no round running).
 *   2. Round 1 exists and is CONFIGURED — `POST /rounds/{id}/start` returns 409
 *      CONFLICT if no ideal profile was ever configured
 *      (services/instructorService.ts, `start`).
 *
 * Environment variables
 * ---------------------
 *   E2E_ADMIN_PASSWORD   (required — absent ⇒ the whole describe block skips)
 *   E2E_FE_URL           deployed frontend origin
 *   E2E_BE_URL           deployed backend origin (asserted against, not called)
 *   E2E_INSTRUCTOR_NAME  instructor display name
 *   E2E_JM_MEMBER_1 / E2E_JM_MEMBER_2    the Joke Maker pair
 *   E2E_MK_MEMBER_1 / E2E_MK_MEMBER_2    the Marketing pair
 *   E2E_POLL_BUDGET_MS   how long a polled hand-off may take (default 45000)
 *   E2E_LLM_BUDGET_MS    how long async LLM classification may take (default 180000)
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  ADMIN_PASSWORD, BE_URL, FE_URL, INSTRUCTOR_NAME, LS, TUTORIAL_SEEN_PREFIX,
  readSession, seedSession, suppressTutorials, type SeedableRole, type SessionSeed,
} from './session';

// Re-exported so anything that imported these from this spec keeps working.
export {
  ADMIN_PASSWORD, BE_URL, FE_URL, INSTRUCTOR_NAME, LS, TUTORIAL_SEEN_PREFIX,
  readSession, seedSession, suppressTutorials, type SeedableRole, type SessionSeed,
};

/* ───────────────────────────── environment ───────────────────────────── */

export const MISSING_PASSWORD_MESSAGE =
  'E2E_ADMIN_PASSWORD is not set. This spec drives the LIVE deployment and cannot ' +
  'log in as instructor without it. The parent orchestrator normally supplies it ' +
  '(along with the destructive DB reset and round setup); to run this spec ' +
  'standalone, export E2E_ADMIN_PASSWORD first.';

if (!ADMIN_PASSWORD) {
  // `test.skip()`'s reason only surfaces in the HTML/JSON report, so say it on
  // stdout too — a silently skipped live suite is worse than a failing one.
  console.warn(`\n[e2e/browser] SKIPPING roles.spec.ts — ${MISSING_PASSWORD_MESSAGE}\n`);
}

/** Student identities are pairs — LoginScreen normalises them into a team name. */
export const JM_MEMBERS: [string, string] = [
  process.env.E2E_JM_MEMBER_1 ?? 'e2ejm1',
  process.env.E2E_JM_MEMBER_2 ?? 'e2ejm2',
];
export const MK_MEMBERS: [string, string] = [
  process.env.E2E_MK_MEMBER_1 ?? 'e2emk1',
  process.env.E2E_MK_MEMBER_2 ?? 'e2emk2',
];

/** Budget for a hand-off that must arrive via the 2500 ms poll loop. */
export const POLL_BUDGET_MS = Number(process.env.E2E_POLL_BUDGET_MS ?? 45_000);
/** Budget for the backend's asynchronous LLM classification pass. */
export const LLM_BUDGET_MS = Number(process.env.E2E_LLM_BUDGET_MS ?? 180_000);

/**
 * Mirrors LoginScreen.normalizeTeamName in App.tsx — the display name the
 * backend stores for a student pair, and therefore the string the instructor's
 * roster chips render.
 */
export function normalizeTeamName(a: string, b: string): string {
  return [a, b]
    .map(n => n.trim().toLowerCase())
    .filter(Boolean)
    .sort((x, y) => x.localeCompare(y))
    .join('_');
}

export const JM_DISPLAY_NAME = normalizeTeamName(...JM_MEMBERS);
export const MK_DISPLAY_NAME = normalizeTeamName(...MK_MEMBERS);

/**
 * Mirrors services/format.ts `pairNames`: the Teams tab shows a pair as
 * "E2ejm1 and E2ejm2", not the stored "e2ejm1_e2ejm2".
 */
export function pairNames(displayName: string): string {
  return displayName
    .split('_')
    .filter(part => part.length > 0)
    .map(part => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(' and ');
}

export const JM_CHIP_NAME = pairNames(JM_DISPLAY_NAME);
export const MK_CHIP_NAME = pairNames(MK_DISPLAY_NAME);

/* ─────────────────────────────── page objects ───────────────────────────── */

/**
 * The shared login screen (App.tsx `LoginScreen`).
 *
 * SELECTOR NOTE: the "Team Members" / "Display Name" / "Admin Password" labels
 * are bare <label> elements with no htmlFor and no wrapped input, so
 * `getByLabel` does NOT resolve them. The inputs' only accessible name comes
 * from their placeholder, which is what these locators use.
 */
export class LoginScreen {
  constructor(readonly page: Page) {}

  get studentTab(): Locator {
    return this.page.getByRole('button', { name: 'Student Pair Login' });
  }
  get instructorTab(): Locator {
    return this.page.getByRole('button', { name: 'Instructor Login' });
  }
  get member1(): Locator {
    return this.page.getByPlaceholder('Member 1 (e.g. Joe)');
  }
  get member2(): Locator {
    return this.page.getByPlaceholder('Member 2 (e.g. John)');
  }
  get joinLobby(): Locator {
    return this.page.getByRole('button', { name: 'Join Lobby' });
  }
  get instructorName(): Locator {
    return this.page.getByPlaceholder('Instructor Name');
  }
  get adminPassword(): Locator {
    return this.page.getByPlaceholder('Password');
  }
  get loginAsInstructor(): Locator {
    return this.page.getByRole('button', { name: 'Login as Instructor' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    await expect(this.page.getByRole('heading', { name: 'The Joke Factory' })).toBeVisible();
  }

  async joinAsStudentPair(members: [string, string]): Promise<void> {
    await this.studentTab.click();
    await this.member1.fill(members[0]);
    await this.member2.fill(members[1]);
    await this.joinLobby.click();
  }

  /** The password is passed in from the environment — it is never stored here. */
  async loginAsInstructorWith(displayName: string, password: string): Promise<void> {
    await this.instructorTab.click();
    await this.instructorName.fill(displayName);
    await this.adminPassword.fill(password);
    await this.loginAsInstructor.click();
  }
}

/** The waiting room every student lands in until the instructor assigns roles. */
export class WaitingRoom {
  constructor(readonly page: Page) {}

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Waiting Room' });
  }

  async expectVisible(): Promise<void> {
    await expect(this.heading).toBeVisible({ timeout: POLL_BUDGET_MS });
  }
}

/** views/Instructor.tsx: the control bar above the Live / Teams / Setup / Debrief tabs. */
export class InstructorPage {
  readonly login: LoginScreen;
  constructor(readonly page: Page) {
    this.login = new LoginScreen(page);
  }

  /** The control bar (components/instructor/ControlBar.tsx), a <section aria-label="Round control">. */
  get controlBar(): Locator {
    return this.page.getByRole('region', { name: 'Round control' });
  }
  tab(name: 'Live' | 'Teams' | 'Setup' | 'Debrief'): Locator {
    return this.page.getByRole('tab', { name, exact: true });
  }
  /** The Teams tab's lobby strip title: "Lobby" or "Lobby: n pairs waiting". */
  get lobbyTitle(): Locator {
    return this.page.getByText(/^Lobby(: \d+ pairs? waiting)?$/);
  }
  /** Reads "Auto-assign" or "Auto-assign n teams"; off while a round runs. */
  get autoAssign(): Locator {
    return this.page.getByRole('button', { name: /^Auto-assign/ }).first();
  }
  /** With teams already seated, Auto-assign asks first ("Reshuffle the teams?"). */
  get reshuffleConfirm(): Locator {
    return this.page.getByRole('dialog').getByRole('button', { name: /^Auto-assign/ });
  }
  /** Gold, and enabled only while the round is CONFIGURED. There is no pause or resume. */
  startRound(n: 1 | 2): Locator {
    return this.controlBar.getByRole('button', { name: `Start Round ${n}` });
  }
  /** Replaces Start once the round is running; it opens a confirm. */
  endRound(n: 1 | 2): Locator {
    return this.controlBar.getByRole('button', { name: `End Round ${n}` });
  }

  /**
   * A team slot on the Teams tab: `data-seat` is "JM" or "MARKETING" on the
   * slot row (components/instructor/TeamsTab.tsx).
   */
  seat(seat: 'JM' | 'MARKETING'): Locator {
    return this.page.locator(`[data-seat="${seat}"]`);
  }

  /** A pair chip, anywhere on the Teams tab. Its name span holds the pair names exactly. */
  chip(chipName: string): Locator {
    return this.page.getByText(chipName, { exact: true });
  }

  async signIn(password: string): Promise<void> {
    await this.login.goto();
    await this.login.loginAsInstructorWith(INSTRUCTOR_NAME, password);
    await expect(this.controlBar).toBeVisible({ timeout: POLL_BUDGET_MS });
  }

  /** Assert both pairs have shown up in the lobby before forming teams. */
  async waitForStudentsInLobby(chipNames: string[]): Promise<void> {
    await this.tab('Teams').click();
    await expect(this.lobbyTitle).toBeVisible();
    for (const name of chipNames) {
      await expect(this.chip(name).first()).toBeVisible({ timeout: POLL_BUDGET_MS });
    }
  }

  async formTeams(): Promise<void> {
    await expect(this.autoAssign).toBeEnabled({ timeout: POLL_BUDGET_MS });
    await this.autoAssign.click();
    // A fresh class has no teams, so there is no confirm; a reshuffle asks first.
    if (await this.reshuffleConfirm.isVisible()) await this.reshuffleConfirm.click();
  }

  /**
   * Auto-assign hands out Joke Maker / Marketing arbitrarily. Chips no longer
   * toggle on click: the ⇄ button on a seated chip ("Switch roles in {team}")
   * swaps the team's two roles, so one swap puts both pairs where this spec
   * expects them.
   */
  async ensureRole(chipName: string, want: 'JM' | 'MARKETING'): Promise<void> {
    const other = want === 'JM' ? 'MARKETING' : 'JM';
    const wanted = this.seat(want).getByText(chipName, { exact: true });
    const wrong = this.seat(other).getByText(chipName, { exact: true });
    await expect(wanted.or(wrong).first()).toBeVisible({ timeout: POLL_BUDGET_MS });
    if (await wanted.count()) return;
    const swap = this.seat(other).filter({ hasText: chipName }).getByRole('button', { name: /^Switch roles in / });
    // The chip's buttons fade in on hover; Playwright clicks them either way.
    await swap.hover();
    await swap.click();
    await expect(wanted).toBeVisible({ timeout: POLL_BUDGET_MS });
  }

  async startRoundOne(): Promise<void> {
    await expect(this.startRound(1)).toBeEnabled({ timeout: POLL_BUDGET_MS });
    await this.startRound(1).click();
    await expect(this.endRound(1)).toBeVisible({ timeout: POLL_BUDGET_MS });
  }
}

/** views/JokeMaker.tsx */
export class JokeMakerPage {
  readonly login: LoginScreen;
  readonly waitingRoom: WaitingRoom;
  constructor(readonly page: Page) {
    this.login = new LoginScreen(page);
    this.waitingRoom = new WaitingRoom(page);
  }

  get productionLine(): Locator {
    return this.page.getByRole('heading', { name: 'Production line', exact: true });
  }
  get pausedBanner(): Locator {
    return this.page.getByText('Game is paused. Wait for the instructor to start.');
  }
  /** SELECTOR NOTE: the raw-blob textarea has no label — placeholder only. */
  get rawInput(): Locator {
    return this.page.getByPlaceholder(/Paste the full AI output here/);
  }
  /** Implicitly labelled (the <label> wraps the checkbox), so getByLabel works. */
  get certifyCheckbox(): Locator {
    return this.page.getByLabel('I certify these jokes are not offensive.');
  }
  get sendToMarketing(): Locator {
    return this.page.getByRole('button', { name: /Send to Marketing/ });
  }
  get valueStream(): Locator {
    return this.page.getByRole('region', { name: 'Value stream' });
  }
  get submittedToast(): Locator {
    return this.page.getByText(/Batch sent to Marketing/);
  }

  /** The "Jokes by stage" card (components/jokeMaker/JokesByStage.tsx). */
  get jokesByStage(): Locator {
    return this.page.getByRole('region', { name: 'Jokes by stage' });
  }

  /**
   * A "Jokes by stage" row: `<label> <count>` with no role and no test id, so
   * the label text is the only anchor, hence label → parent row.
   */
  stageRow(label: 'With Marketing' | 'Selling' | 'Lost its buyers' | 'No buyer yet' | 'Not released'): Locator {
    return this.jokesByStage.getByText(label, { exact: true }).locator('xpath=..');
  }

  /** The team's Scoreboard (components/Scoreboard.tsx): rank, profit, found a buyer, sales. */
  get scoreboard(): Locator {
    return this.page.getByRole('region', { name: 'Scoreboard' });
  }

  async joinAs(members: [string, string]): Promise<void> {
    await this.login.goto();
    await this.login.joinAsStudentPair(members);
  }

  /** The instructor's assignment arrives via the poll loop, not a reload. */
  async waitForRoleAssignment(): Promise<void> {
    await expect(this.productionLine).toBeVisible({ timeout: POLL_BUDGET_MS });
  }

  async expectRoundActive(): Promise<void> {
    await expect(this.pausedBanner).toHaveCount(0, { timeout: POLL_BUDGET_MS });
    await expect(this.rawInput).toBeEnabled();
  }

  async submitRawBlob(blob: string): Promise<void> {
    await this.rawInput.fill(blob);
    await this.certifyCheckbox.check();
    await expect(this.sendToMarketing).toBeEnabled();
    await this.sendToMarketing.click();
    await expect(this.submittedToast).toBeVisible();
  }

  /**
   * The Joke Maker's own view of "Marketing released the batch": the
   * Scoreboard's "of N on market" counts the released jokes, and "With
   * Marketing" drops to 0 batches once the batch has left Marketing's desk.
   *
   * The Joke Maker no longer has a Customer feedback card (it hears from
   * Marketing through the note in its Value stream), so the feedback check
   * lives on MarketingPage only.
   */
  async waitForRelease(jokeCount: number): Promise<void> {
    await expect(this.scoreboard).toContainText(`of ${jokeCount} on market`, { timeout: LLM_BUDGET_MS });
    await expect(this.stageRow('With Marketing')).toContainText('0 batches', { timeout: LLM_BUDGET_MS });
  }
}

/** views/QualityControl.tsx — the Marketing role. */
export class MarketingPage {
  readonly login: LoginScreen;
  readonly waitingRoom: WaitingRoom;
  constructor(readonly page: Page) {
    this.login = new LoginScreen(page);
    this.waitingRoom = new WaitingRoom(page);
  }

  get desk(): Locator {
    return this.page.getByRole('heading', { name: 'Marketing desk', exact: true });
  }
  get allClear(): Locator {
    return this.page.getByRole('heading', { name: 'Desk is clear' });
  }
  /** The desk bar's "Where you are" steps; Split is current while a batch needs splitting. */
  get splitterBanner(): Locator {
    return this.page.getByLabel('Where you are').locator('[aria-current="step"]', { hasText: 'Split' });
  }
  /** The splitter's working chunk: a readOnly <textarea> with its own aria-label. */
  get splitterTextarea(): Locator {
    return this.page.getByRole('textbox', { name: /^Unsplit text/ });
  }
  get confirmSplit(): Locator {
    return this.page.getByRole('button', { name: /Confirm, next/ });
  }
  get releaseToMarket(): Locator {
    return this.page.getByRole('button', { name: /Release to market/ });
  }
  get customerFeedbackEmpty(): Locator {
    return this.page.getByText('No feedback yet. Release jokes to start uncovering the target.');
  }

  /**
   * A single joke card on the choose stage (components/marketing/JokePick.tsx),
   * by its position: every card carries `data-pick={jokeId}`. `total` is kept so
   * callers need not change.
   */
  jokeCard(index: number, _total: number): Locator {
    return this.page.locator('[data-pick]').nth(index);
  }

  async joinAs(members: [string, string]): Promise<void> {
    await this.login.goto();
    await this.login.joinAsStudentPair(members);
  }

  async waitForRoleAssignment(): Promise<void> {
    await expect(this.desk).toBeVisible({ timeout: POLL_BUDGET_MS });
  }

  /**
   * "Claim" the next batch.
   *
   * There is no claim ACTION in this app: `GET /v1/marketing/queue/next` in the
   * 2500 ms poll loop hands Marketing the next batch automatically, so arrival
   * IS the claim. Asserting on the poll (rather than reloading) is deliberate —
   * the polling loop is itself under test. Returns how long the hand-off took.
   */
  async claimNextBatch(budgetMs = POLL_BUDGET_MS): Promise<number> {
    const started = Date.now();
    await expect(this.splitterBanner).toBeVisible({ timeout: budgetMs });
    return Date.now() - started;
  }

  /**
   * Drive the BatchSplitter to one card per line of the raw blob.
   *
   * The textarea is readOnly and the component derives its cut point from
   * `selectionStart`, updated by its onClick/onKeyUp/onSelect handlers. So each
   * cut is: place the caret at the first newline, fire the events the component
   * listens for, then press Enter (QualityControl.tsx `doSplit`).
   */
  /**
   * Cut the raw blob into one card per joke.
   *
   * THE SPLITTER IS A readOnly TEXTAREA that derives its cut point from
   * `selectionStart`, so there is no typing to simulate — the caret has to be
   * planted by script and then announced with the events the component listens
   * for (`onSelect` / `onClick` / `onKeyUp`), after which Enter performs the cut.
   *
   * THAT HANDSHAKE IS RACY, and pretending otherwise cost a red run: the
   * component re-renders after every accepted cut, and a caret set against the
   * node as it is being replaced is silently dropped. Observed failing on cut 4
   * with cuts 1-3 landing, which is the signature of a lost race rather than a
   * wrong offset — a wrong offset would fail on the first cut, every time. So
   * each cut is retried against the freshly-read value, and only a cut that
   * never takes across several attempts is a real failure.
   *
   * N JOKES NEED N CUTS, not N-1. The last pass places the caret at end-of-text,
   * and that is precisely what promotes the trailing joke into its own card and
   * empties the unsplit box — which is the condition "Confirm, next" enables on.
   * Treating the tail as "whatever is left over" and skipping that final cut
   * leaves the last joke stranded in the box with Confirm greyed out, which is
   * exactly how this helper was broken while trying to tidy it.
   */
  async splitIntoJokes(expected: number): Promise<void> {
    const ta = this.splitterTextarea;
    await expect(ta).toBeVisible();

    for (let cut = 1; cut <= expected; cut++) {
      const before = await ta.inputValue();
      if (!before.trim()) break;
      const nl = before.indexOf('\n');
      const offset = nl === -1 ? before.length : nl;

      let shrank = false;
      for (let attempt = 1; attempt <= 4 && !shrank; attempt++) {
        await ta.evaluate((el, off) => {
          const node = el as HTMLTextAreaElement;
          node.focus();
          node.setSelectionRange(off, off);
          node.dispatchEvent(new Event('select', { bubbles: true }));
          node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          node.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' }));
        }, offset);
        await ta.press('Enter');

        const after = await ta.inputValue();
        shrank = after !== before;
        if (!shrank) await this.page.waitForTimeout(250);
      }

      expect(
        shrank,
        `cut ${cut}/${expected} never took — the splitter did not pick up the caret ` +
          'after 4 attempts, so this is not the usual re-render race',
      ).toBe(true);
    }

    await expect(
      this.confirmSplit,
      'every joke must be its own card (unsplit box empty) before confirming',
    ).toBeEnabled();
    await this.confirmSplit.click();
  }

  /** Tick a card's "Sell joke #n" checkbox, then pick its Topic and fill its market title. */
  async prepareJoke(index: number, total: number, topic: string, title: string): Promise<void> {
    const card = this.jokeCard(index, total);
    await expect(card).toBeVisible({ timeout: POLL_BUDGET_MS });

    const sell = card.getByRole('checkbox', { name: `Sell joke #${index + 1}` });
    if ((await sell.getAttribute('aria-checked')) !== 'true') {
      await sell.click();
    }
    await expect(sell).toHaveAttribute('aria-checked', 'true');

    await card.getByLabel('Topic').selectOption(topic);
    await card.getByLabel('Market title').fill(title);
    await expect(card.getByText('To market', { exact: true })).toBeVisible();
  }

  async publish(): Promise<void> {
    await expect(this.releaseToMarket).toBeEnabled();
    await this.releaseToMarket.click();
    /* WHAT PUBLISH ACTUALLY LOOKS LIKE. An earlier version of this waited for a
       "Released N jokes" toast. No such text exists — the app has no publish
       confirmation at all. What it does instead is drop the desk straight back
       to its empty state, because the batch has left Marketing's queue. That
       transition IS the receipt, so assert on it rather than on a message the
       UI never shows. Verified against the live deployment. */
    await expect(this.page.getByRole('heading', { name: /Desk is clear/i })).toBeVisible({
      timeout: POLL_BUDGET_MS,
    });
  }

  /**
   * Marketing's view of "classification finished": real customer feedback rows.
   * The empty state clearing proves rows arrived; a "Landed" or "Missed" line
   * proves they carry criteria, not a row of blanks.
   */
  async waitForCustomerFeedback(): Promise<void> {
    await expect(this.customerFeedbackEmpty).toHaveCount(0, { timeout: LLM_BUDGET_MS });
    await expect(this.page.getByText(/^(Landed|Missed)$/).first()).toBeVisible({ timeout: LLM_BUDGET_MS });
  }
}

/* ────────────────────────────── the fixture data ─────────────────────────── */

/**
 * One joke per line — the splitter helper cuts on newlines.
 *
 * THE LENGTH IS LOAD-BEARING: it must equal the round's `batch_size` (5).
 * MarketingService.Publish enforces `requireAtLeastOnePublished` on round 1, and
 * the split stage refuses to confirm until the card count reaches batch_size —
 * the UI shows it as a quiet "3/5 jokes" counter and simply does not advance.
 * A shorter blob therefore strands the run on the split screen with no error
 * message, which is exactly how this spec failed the first time it ran against a
 * working backend. Do not trim this list to make the test faster.
 */
export const RAW_BLOB = [
  '1) Why did the operations manager bring a ladder to work? To raise the throughput.',
  '2) I told my boss I was great at multitasking, so he gave me two problems and one deadline.',
  '3) My inventory system and I have trust issues — it keeps telling me it is just-in-time.',
  '4) Our forecast was accurate exactly once, and we have been trying to reproduce the conditions ever since.',
  '5) I asked the warehouse for a status update and they said it depends which shelf you believe.',
].join('\n');

export const JOKE_COUNT = RAW_BLOB.split('\n').length;

/** Topic values come from config/dimensions.ts's TOPIC categories. */
export const JOKE_RELEASES = [
  { topic: 'Work', title: 'Ladder to Throughput' },
  { topic: 'Work', title: 'Two Problems One Deadline' },
  { topic: 'Technology', title: 'Just In Time Trust Issues' },
  { topic: 'Work', title: 'Accurate Once, Never Again' },
  { topic: 'Work', title: 'Whichever Shelf You Believe' },
];

/* ──────────────────────────────── the test ──────────────────────────────── */

test.describe('Three-role round: Instructor → Joke Maker → Marketing → Joke Maker', () => {
  /* The orchestrator owns the password. Without it there is nothing this spec
     can honestly do, so skip loudly rather than fail confusingly. */
  test.skip(!ADMIN_PASSWORD, MISSING_PASSWORD_MESSAGE);

  test('a batch travels from Joke Maker through Marketing to the market and back', async ({
    browser,
  }) => {
    /* Three independent contexts = three independent localStorage session
       identities. They must not share one, or the last join would overwrite
       the others' joke_factory_user_id. */
    const instructorCtx = await browser.newContext({ baseURL: FE_URL });
    const jmCtx = await browser.newContext({ baseURL: FE_URL });
    const mkCtx = await browser.newContext({ baseURL: FE_URL });

    for (const ctx of [instructorCtx, jmCtx, mkCtx]) {
      await suppressTutorials(ctx);
    }

    const instructor = new InstructorPage(await instructorCtx.newPage());
    const jm = new JokeMakerPage(await jmCtx.newPage());
    const mk = new MarketingPage(await mkCtx.newPage());

    try {
      /* ── 1. Instructor: lobby, teams, start ─────────────────────────────── */
      await test.step('instructor logs in and sees the lobby', async () => {
        await instructor.signIn(ADMIN_PASSWORD!);
      });

      await test.step('both student pairs join and land in the waiting room', async () => {
        await jm.joinAs(JM_MEMBERS);
        await jm.waitingRoom.expectVisible();
        await mk.joinAs(MK_MEMBERS);
        await mk.waitingRoom.expectVisible();
      });

      await test.step('instructor assigns teams', async () => {
        await instructor.waitForStudentsInLobby([JM_CHIP_NAME, MK_CHIP_NAME]);
        await instructor.formTeams();
        await instructor.ensureRole(JM_CHIP_NAME, 'JM');
        await instructor.ensureRole(MK_CHIP_NAME, 'MARKETING');
      });

      await test.step('instructor starts the round', async () => {
        await instructor.startRoundOne();
      });

      /* ── 2. Joke Maker: sees the round go active, submits a raw blob ────── */
      await test.step('joke maker picks up its role and the active round via polling', async () => {
        await jm.waitForRoleAssignment();
        await jm.expectRoundActive();
      });

      await test.step('joke maker submits a raw multi-joke blob', async () => {
        await jm.submitRawBlob(RAW_BLOB);
      });

      /* ── 3. Marketing: batch arrives BY POLLING, split, publish ──────────── */
      await test.step('marketing receives the batch through the poll loop', async () => {
        await mk.waitForRoleAssignment();
        /* No reload: the 2500 ms poll in context.tsx is what must deliver this. */
        const elapsed = await mk.claimNextBatch(POLL_BUDGET_MS);
        expect(
          elapsed,
          `batch should reach Marketing's queue within ${POLL_BUDGET_MS}ms of polling`,
        ).toBeLessThan(POLL_BUDGET_MS);
      });

      await test.step('marketing splits the blob into individual jokes', async () => {
        await mk.splitIntoJokes(JOKE_COUNT);
        await expect(mk.jokeCard(0, JOKE_COUNT)).toBeVisible({ timeout: POLL_BUDGET_MS });
      });

      await test.step('marketing assigns a topic + title to each joke and publishes', async () => {
        for (let i = 0; i < JOKE_COUNT; i++) {
          const { topic, title } = JOKE_RELEASES[i];
          await mk.prepareJoke(i, JOKE_COUNT, topic, title);
        }
        await mk.publish();
      });

      /* ── 4. Back to the Joke Maker: published, then classified ──────────── */
      await test.step('joke maker sees the release and marketing, later, the feedback', async () => {
        /* Both land via the poll loop, never a reload. Classification is
           asynchronous on the backend, so the feedback can take a while. */
        await jm.waitForRelease(JOKE_COUNT);
        await mk.waitForCustomerFeedback();
      });
    } finally {
      await instructorCtx.close();
      await jmCtx.close();
      await mkCtx.close();
    }
  });
});
