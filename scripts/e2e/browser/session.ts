import type { BrowserContext, Page } from '@playwright/test';

/** Never defaulted, never logged, never written to a file. */
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

export const FE_URL =
  process.env.E2E_FE_URL ?? 'https://kind-sky-0ccf01e0f.3.azurestaticapps.net';

export const BE_URL =
  process.env.E2E_BE_URL ??
  'https://jokefactory-api.whitepebble-2daa4226.westus2.azurecontainerapps.io';

export const INSTRUCTOR_NAME = process.env.E2E_INSTRUCTOR_NAME ?? 'E2E Instructor';

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

/** components.tsx — `${TUTORIAL_SEEN_PREFIX}${Role}` suppresses the instructor's auto-opening tutorial. */
export const TUTORIAL_SEEN_PREFIX = 'jf_tutorial_seen_v1:';

/** services/tour/seen.ts — `${TOUR_SEEN_PREFIX}${Role}` stops the students' guided tour auto-playing. */
export const TOUR_SEEN_PREFIX = 'jf_tour_seen_v1:';

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
 * Stop the instructor's tutorial modal and the students' guided tour starting
 * on their own and swallowing the first click.
 * Must be called BEFORE the context's first navigation.
 */
export async function suppressTutorials(context: BrowserContext): Promise<void> {
  await context.addInitScript(({ tutorial, tour }) => {
    try {
      for (const role of ['INSTRUCTOR', 'JOKE_MAKER', 'QUALITY_CONTROL', 'CUSTOMER']) {
        localStorage.setItem(`${tutorial}${role}`, '1');
      }
      for (const role of ['JOKE_MAKER', 'QUALITY_CONTROL']) {
        localStorage.setItem(`${tour}${role}`, '1');
      }
    } catch {
      /* ignore */
    }
  }, { tutorial: TUTORIAL_SEEN_PREFIX, tour: TOUR_SEEN_PREFIX });
}

/** Read the live session identity back out of a page — useful for handing ids to the orchestrator. */
export async function readSession(page: Page): Promise<{ userId: string | null; displayName: string | null }> {
  return page.evaluate(keys => ({
    userId: localStorage.getItem(keys.USER_ID),
    displayName: localStorage.getItem(keys.DISPLAY_NAME),
  }), LS);
}
