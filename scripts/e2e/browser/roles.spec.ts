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

import { test, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

/* ───────────────────────────── environment ───────────────────────────── */

/** Never defaulted, never logged, never written to a file. */
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

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

export const FE_URL =
  process.env.E2E_FE_URL ?? 'https://kind-sky-0ccf01e0f.3.azurestaticapps.net';

export const BE_URL =
  process.env.E2E_BE_URL ??
  'https://jokefactory-api.whitepebble-2daa4226.westus2.azurecontainerapps.io';

export const INSTRUCTOR_NAME = process.env.E2E_INSTRUCTOR_NAME ?? 'E2E Instructor';

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

/* ───────────────────────── localStorage session keys ─────────────────────
 * Verbatim from context.tsx:34-39. These four are the session identity; a
 * context seeded with LS_USER_ID + LS_DISPLAY_NAME is restored as that user on
 * first render (context.tsx:459-476) and the poll loop then resolves the real
 * role from GET /v1/session/me.
 *
 * Caveat worth knowing before you seed: the restore only ever reinstates
 * INSTRUCTOR or UNASSIGNED locally, and if /v1/session/me 404s for the seeded
 * id, context.tsx:1324 calls logout(), which DELETES all four keys and drops
 * the browser back to the login screen. So seeding only works with a user id
 * the live backend actually knows.
 * ───────────────────────────────────────────────────────────────────────── */
export const LS = {
  USER_ID: 'joke_factory_user_id',
  DISPLAY_NAME: 'joke_factory_display_name',
  ROLE: 'joke_factory_role',
  ROUND_ID: 'joke_factory_round_id',
  /** Non-identity local caches, cleared on logout. */
  SUBMITTED_BATCH_JOKES: 'joke_factory_submitted_batch_jokes_v1',
  QC_RATED_HISTORY: 'joke_factory_qc_rated_history_v1',
} as const;

/** components.tsx:40 — `${TUTORIAL_SEEN_PREFIX}${Role}` suppresses the auto-opening tutorial. */
export const TUTORIAL_SEEN_PREFIX = 'jf_tutorial_seen_v1:';

export type SeedableRole = 'INSTRUCTOR' | 'UNASSIGNED';

export interface SessionSeed {
  userId: number | string;
  displayName: string;
  /** Only INSTRUCTOR is meaningfully restored locally; anything else lands as UNASSIGNED. */
  role?: SeedableRole;
  /** Only read back for an INSTRUCTOR seed. */
  roundId?: number | string;
}

/**
 * Seed a browser context as an already-joined user, skipping the login screen.
 * Must be called BEFORE the context's first navigation.
 *
 * The orchestrator uses this to hand a role's identity to a fresh context
 * without re-running `POST /v1/session/join` (which would mint a second user).
 */
export async function seedSession(context: BrowserContext, seed: SessionSeed): Promise<void> {
  await context.addInitScript(
    ({ keys, payload }) => {
      try {
        localStorage.setItem(keys.USER_ID, String(payload.userId));
        localStorage.setItem(keys.DISPLAY_NAME, payload.displayName);
        localStorage.setItem(keys.ROLE, payload.role ?? 'UNASSIGNED');
        if (payload.roundId != null) {
          localStorage.setItem(keys.ROUND_ID, String(payload.roundId));
        } else {
          localStorage.removeItem(keys.ROUND_ID);
        }
      } catch {
        /* storage disabled — the spec will fall through to the login screen */
      }
    },
    { keys: LS, payload: seed },
  );
}

/**
 * Stop the per-role tutorial modal auto-opening and swallowing the first click.
 * Must be called BEFORE the context's first navigation.
 */
export async function suppressTutorials(context: BrowserContext): Promise<void> {
  await context.addInitScript(prefix => {
    try {
      for (const role of ['INSTRUCTOR', 'JOKE_MAKER', 'QUALITY_CONTROL', 'CUSTOMER']) {
        localStorage.setItem(`${prefix}${role}`, '1');
      }
    } catch {
      /* ignore */
    }
  }, TUTORIAL_SEEN_PREFIX);
}

/** Read the live session identity back out of a page — useful for handing ids to the orchestrator. */
export async function readSession(page: Page): Promise<{ userId: string | null; displayName: string | null }> {
  return page.evaluate(keys => ({
    userId: localStorage.getItem(keys.USER_ID),
    displayName: localStorage.getItem(keys.DISPLAY_NAME),
  }), LS);
}

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

/** views/Instructor.tsx */
export class InstructorPage {
  readonly login: LoginScreen;
  constructor(readonly page: Page) {
    this.login = new LoginScreen(page);
  }

  get lobbyHeading(): Locator {
    return this.page.getByRole('heading', { name: /Lobby Management/ });
  }
  get autoAssign(): Locator {
    return this.page.getByRole('button', { name: /Auto-Assign/ });
  }
  /** Reads "Start" normally, "Resume" for a previously-ended Round 2. */
  get startRound(): Locator {
    return this.page.getByRole('button', { name: /^(Start|Resume)$/ });
  }
  /** Disabled placeholder that replaces Start once the round is running. */
  get activeIndicator(): Locator {
    return this.page.getByRole('button', { name: 'Active', disabled: true });
  }
  get endRound(): Locator {
    return this.page.getByRole('button', { name: /End Round/ });
  }
  get roundOneTab(): Locator {
    return this.page.getByRole('button', { name: 'Round 1', exact: true });
  }

  /**
   * A roster chip — the instructor's per-student handle.
   *
   * SELECTOR NOTE: the chip is a plain <div>, not a button, so it has no ARIA
   * role. Its only stable, non-class handle is `title="Drag to move, Click to
   * toggle Role"` (unassigned chips in the lobby have no title at all and are
   * matched by text instead).
   */
  assignedChip(displayName: string): Locator {
    return this.page
      .getByTitle('Drag to move, Click to toggle Role')
      .filter({ hasText: displayName });
  }

  lobbyChip(displayName: string): Locator {
    return this.page.getByText(displayName, { exact: true });
  }

  async signIn(password: string): Promise<void> {
    await this.login.goto();
    await this.login.loginAsInstructorWith(INSTRUCTOR_NAME, password);
    await expect(this.lobbyHeading).toBeVisible({ timeout: POLL_BUDGET_MS });
  }

  /** Assert both students have shown up in the lobby before forming teams. */
  async waitForStudentsInLobby(displayNames: string[]): Promise<void> {
    for (const name of displayNames) {
      await expect(this.lobbyChip(name).first()).toBeVisible({ timeout: POLL_BUDGET_MS });
    }
  }

  async formTeams(): Promise<void> {
    await expect(this.autoAssign).toBeEnabled();
    await this.autoAssign.click();
  }

  /**
   * Auto-Assign hands out JM / Marketing arbitrarily. Clicking a chip toggles
   * its role (Instructor.tsx `toggleUserRole`), so this nudges each student to
   * the seat this spec expects.
   */
  async ensureRole(displayName: string, want: 'JM' | 'Marketing'): Promise<void> {
    const chip = this.assignedChip(displayName).first();
    await expect(chip).toBeVisible({ timeout: POLL_BUDGET_MS });
    if (!(await chip.innerText()).includes(`(${want})`)) {
      await chip.click();
      await expect(chip).toContainText(`(${want})`, { timeout: POLL_BUDGET_MS });
    }
  }

  async startRoundOne(): Promise<void> {
    await this.roundOneTab.click();
    await expect(this.startRound).toBeVisible();
    await this.startRound.click();
    await expect(this.activeIndicator).toBeVisible({ timeout: POLL_BUDGET_MS });
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
    return this.page.getByText('Production Line', { exact: true });
  }
  get pausedBanner(): Locator {
    return this.page.getByText('Game is currently paused. Wait for instructor to start.');
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
    return this.page.getByText('Value stream', { exact: true });
  }
  get submittedToast(): Locator {
    return this.page.getByText(/Batch sent to Marketing/);
  }

  /**
   * A "Jokes by stage" row.
   *
   * SELECTOR NOTE: the row is `<label> … <dots> … <count>` with no role and no
   * test id; the label text is the only anchor, hence label → parent row.
   */
  stageRow(label: 'In review' | 'On market' | 'Sold' | 'Wasted'): Locator {
    return this.page.getByText(label, { exact: true }).locator('xpath=..');
  }

  /** The numeric total at the end of a stage row (its own <span>, exact text). */
  stageCount(label: 'In review' | 'On market' | 'Sold' | 'Wasted', count: number): Locator {
    return this.stageRow(label).getByText(String(count), { exact: true });
  }

  /**
   * A StatBox tile (components/ui.tsx): `<div><span>{value}</span><span>{label}</span></div>`.
   * The label is uppercased by CSS only, so the DOM text is the original string.
   */
  statBox(label: string): Locator {
    return this.page.getByText(label, { exact: true }).locator('xpath=..');
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
   * The Joke Maker's own view of "classification finished": the batch leaves
   * the `reviewing` bucket, which only happens once batch.status flips to
   * PROCESSED/RATED (JokeMaker.tsx `jokeStatus`).
   */
  async waitForClassification(jokeCount: number): Promise<void> {
    /* Jokes only become records once Marketing splits the batch, so this total
       going from 0 to jokeCount is the "published result landed" signal. */
    await expect(this.statBox('Sold / Total')).toContainText(`/${jokeCount}`, {
      timeout: LLM_BUDGET_MS,
    });
    /* And the review bucket emptying is the "classification finished" signal. */
    await expect(this.stageCount('In review', 0)).toBeVisible({ timeout: LLM_BUDGET_MS });
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
    return this.page.getByText('Marketing Desk', { exact: true });
  }
  get allClear(): Locator {
    return this.page.getByRole('heading', { name: 'All Clear!' });
  }
  get splitterBanner(): Locator {
    return this.page.getByText('Split the batch.', { exact: true });
  }
  /**
   * The splitter's working chunk.
   *
   * SELECTOR NOTE: this is a readOnly <textarea> with no label, and its
   * placeholder only renders once it is EMPTY — so it has no accessible name
   * while it holds text. It is matched positionally as the only textbox inside
   * the splitting view.
   */
  get splitterTextarea(): Locator {
    return this.page.getByRole('textbox').first();
  }
  get confirmSplit(): Locator {
    return this.page.getByRole('button', { name: /Confirm, next/ });
  }
  get releaseToMarket(): Locator {
    return this.page.getByRole('button', { name: /Release to market/ });
  }
  get customerFeedbackEmpty(): Locator {
    return this.page.getByText(/No feedback yet — release jokes to start uncovering the target/);
  }

  /**
   * A single joke card, anchored on its position badge's
   * `title="Card N of M"` — the only per-card handle the app exposes.
   * `../..` walks badge → flex row → card container.
   */
  jokeCard(index: number, total: number): Locator {
    return this.page.getByTitle(`Card ${index + 1} of ${total}`).locator('xpath=../..');
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
  async splitIntoJokes(expected: number): Promise<void> {
    const ta = this.splitterTextarea;
    await expect(ta).toBeVisible();

    for (let i = 0; i < expected; i++) {
      const remaining = await ta.inputValue();
      if (!remaining.trim()) break;
      const nl = remaining.indexOf('\n');
      const offset = nl === -1 ? remaining.length : nl;

      await ta.evaluate((el, off) => {
        const node = el as HTMLTextAreaElement;
        node.focus();
        node.setSelectionRange(off, off);
        /* The component reads selectionStart from onSelect / onClick / onKeyUp;
           both are dispatched so it does not matter which React binds. */
        node.dispatchEvent(new Event('select', { bubbles: true }));
        node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }, offset);

      await ta.press('Enter');

      /* Fail fast and legibly if the caret never reached the component — a
         silent no-op here would otherwise hang on the Confirm assertion. */
      await expect(
        ta,
        `cut ${i + 1}/${expected} did not shrink the unsplit text — the splitter ` +
          'never picked up the caret position',
      ).not.toHaveValue(remaining, { timeout: 5_000 });
    }

    await expect(
      this.confirmSplit,
      'every joke must be its own card (unsplit box empty) before confirming',
    ).toBeEnabled();
    await this.confirmSplit.click();
  }

  /** Select a card, then fill its required Topic + market title. */
  async prepareJoke(index: number, total: number, topic: string, title: string): Promise<void> {
    const card = this.jokeCard(index, total);
    await expect(card).toBeVisible({ timeout: POLL_BUDGET_MS });

    const addBanner = card.getByText('Click to add');
    if (await addBanner.count()) {
      await addBanner.click();
    }
    await expect(card.getByText('Selected to submit')).toBeVisible();

    await card.getByRole('button', { name: topic, exact: true }).click();
    // SELECTOR NOTE: "Market title" is an unassociated SectionLabel, so the
    // input is reachable only by placeholder.
    await card.getByPlaceholder(/A short market title/).fill(title);
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
    await expect(this.page.getByRole('heading', { name: /All Clear/i })).toBeVisible({
      timeout: POLL_BUDGET_MS,
    });
  }

  /** Marketing's view of "classification finished": real customer feedback rows. */
  async waitForCustomerFeedback(): Promise<void> {
    await expect(this.customerFeedbackEmpty).toHaveCount(0, { timeout: LLM_BUDGET_MS });
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

  test('a batch travels from Joke Maker through Marketing and back as feedback', async ({
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
        await instructor.waitForStudentsInLobby([JM_DISPLAY_NAME, MK_DISPLAY_NAME]);
        await instructor.formTeams();
        await instructor.ensureRole(JM_DISPLAY_NAME, 'JM');
        await instructor.ensureRole(MK_DISPLAY_NAME, 'Marketing');
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
      await test.step('joke maker sees the published result and, later, feedback', async () => {
        /* Classification is asynchronous on the backend; both of these land via
           the poll loop, never a reload. */
        await jm.waitForClassification(JOKE_COUNT);
        await mk.waitForCustomerFeedback();
      });
    } finally {
      await instructorCtx.close();
      await jmCtx.close();
      await mkCtx.close();
    }
  });
});
