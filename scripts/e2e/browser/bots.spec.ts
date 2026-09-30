// scripts/e2e/browser/bots.spec.ts
/**
 * Bot players, driven through the real Bot Panel against the live backend.
 *
 * DESTRUCTIVE: resets the game first, exactly as the orchestrated suite does,
 * because "Run all-bot class" needs an empty lobby and an unstarted round. Run
 * it only against a backend nobody is using.
 *
 * Assertions go through the API, not the panel's own text: the panel reports
 * what the engine BELIEVES; the backend is what actually happened.
 */
import { test, expect, type Page } from '@playwright/test';
import { createClient, type JokeFactoryClient } from '../../../services/shared/client';
import { isBotName } from '../../../services/bots/naming';
import { participantsOf } from '../../../services/bots/placement';
import { ADMIN_PASSWORD, BE_URL, FE_URL, INSTRUCTOR_NAME, seedSession, suppressTutorials } from './session';

const CLASS_BUDGET_MS = 6 * 60_000;

interface Setup {
  instructor: JokeFactoryClient;
  api: JokeFactoryClient;
  instructorId: number;
  roundId: number;
}

async function resetAndLogin(): Promise<Setup> {
  const api = createClient({ baseUrl: BE_URL });
  const login = await api.instructorLogin({ display_name: INSTRUCTOR_NAME, password: ADMIN_PASSWORD as string });
  const instructorId = login.user.user_id;
  const instructor = api.as(instructorId, 'instructor');
  await instructor.adminResetGame_DESTRUCTIVE_TRUNCATES_ALL_GAME_DATA();
  const round1 = (await api.roundsActive()).rounds.find(r => r.round_number === 1);
  if (!round1) throw new Error('no round 1 after reset');
  return { instructor, api, instructorId, roundId: round1.id };
}

async function openPanel(page: Page, s: Setup): Promise<void> {
  await suppressTutorials(page.context());
  await seedSession(page.context(), {
    userId: s.instructorId, displayName: INSTRUCTOR_NAME, role: 'INSTRUCTOR', roundId: s.roundId,
  });
  await page.goto(`${FE_URL}/?bots=1`);
  await expect(page.getByText('🤖 Bot players')).toBeVisible({ timeout: 30_000 });
}

test.describe('Bot players (live)', () => {
  test.skip(!ADMIN_PASSWORD, 'E2E_ADMIN_PASSWORD is not set');

  test('one click runs an all-bot class that publishes and gets scored', async ({ page }) => {
    test.setTimeout(CLASS_BUDGET_MS + 2 * 60_000);
    const s = await resetAndLogin();
    await openPanel(page, s);

    await page.getByLabel('Careful bot teams').fill('1');
    await page.getByLabel('Balanced bot teams').fill('1');
    await page.getByLabel('Spray bot teams').fill('1');
    await page.getByRole('button', { name: '10×' }).click();
    await expect(page.getByText(/Lobby: 0 humans/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Run all-bot class' }).click();

    // Teams formed: three teams, every member a bot, one of each role per team.
    await expect.poll(async () => {
      const lobby = await s.instructor.instructorLobby(s.roundId);
      const teams = (lobby.Teams ?? []).filter(t => t.Members.length > 0);
      return teams.length === 3 && teams.every(t =>
        t.Members.length === 2 && t.Members.every(m => isBotName(m.DisplayName))
        && new Set(t.Members.map(m => m.Role)).size === 2);
    }, { timeout: 60_000, message: 'three all-bot teams, one Joke Maker and one Marketer each' }).toBe(true);

    await expect.poll(
      async () => (await s.api.roundsActive()).rounds.find(r => r.id === s.roundId)?.status,
      { timeout: 30_000 },
    ).toBe('ACTIVE');

    // Jokes flowed all the way through: published, then classified by the LLM.
    const lobby = await s.instructor.instructorLobby(s.roundId);
    const seats = (lobby.Teams ?? []).flatMap(t => t.Members.map(m => ({ teamId: t.Team.id, userId: m.UserID })));
    await expect.poll(async () => {
      for (const seat of seats) {
        const fb = await s.api.as(seat.userId, 'bot').teamFeedback(s.roundId, seat.teamId);
        if (fb.jokes.some(j => j.good_dimensions.length + j.improve_dimensions.length > 0)) return true;
      }
      return false;
    }, { timeout: CLASS_BUDGET_MS, intervals: [5_000], message: 'a bot joke published and scored' }).toBe(true);

    // Scoped to the panel's own table: the instructor view also renders the
    // leaderboard and Live Market tables, whose rows a bare `tbody tr` counts.
    await expect(
      page.getByRole('table', { name: 'Bot teams, and what each seat is doing' }).locator('tbody tr'),
    ).toHaveCount(3);

    // Clean up through the panel, and prove it removed bots and nothing else.
    await page.getByRole('button', { name: 'Stop' }).click();
    await page.getByRole('button', { name: 'Remove bots' }).click();
    await expect.poll(async () => {
      const after = participantsOf(await s.instructor.instructorLobby(s.roundId));
      return after.filter(p => isBotName(p.name)).length;
    }, { timeout: 60_000 }).toBe(0);
  });
});
