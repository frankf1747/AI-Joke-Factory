import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type {
  ApiInstructorStatsResponse,
  ApiMarketItem,
  ApiQcQueueNextResponse,
  ApiTeamBatchesResponse,
  ApiTeamSummaryResponse,
  Batch,
  BatchId,
  GameConfig,
  InstructorLobby,
  Joke,
  JokeId,
  Role,
  RoundId,
  Team,
  TeamId,
  User,
  UserId,
} from './types';
import type { TeamFeedbackResponse } from './types/api';
import { teamApi } from './services/api';
import type { RoundTimes } from './services/headerRound';
import { instructorService } from './services/instructorService';
import type { PatchUserRole } from './services/instructorService';
import { jmService } from './services/jmService';
import { queueSizeAfterRelease } from './services/desk';
import { buildPublishBody, marketingService, publishFailureMessage, toMarketingNote } from './services/marketingService';
import { customerService } from './services/customerService';
import { sessionService } from './services/sessionService';
import { ApiError } from './services/apiClient';
import { clearPersisted, getWatchIdentity, isWatchMode, mayClaimMarketingBatch } from './services/watchMode';
import { setMockRoundNumber } from './services/mockApi';
import { DEFAULT_IDEAL_PROFILE } from './config/dimensions';
import { DEFAULT_CUSTOMER_BUDGET, configFromInstructorRound, customerBudgetFromRound } from './services/roundConfig';
import { LEAN_DEFAULTS, MARKET_MODE_LOCKED_TEXT, WIP_LIMIT_TEXT, configSaveErrorText, isMarketModeLocked, isWipLimitReached, leanConfigFromRound, leanConfigToBody, leanTargetRounds, saveRoundConfig } from './services/leanMode';
import { isCompleteProfile } from './components/IdealProfilePicker';
import type { DemoUi } from './services/tour/demoUi';

const LS_USER_ID = 'joke_factory_user_id';
const LS_DISPLAY_NAME = 'joke_factory_display_name';
const LS_ROLE = 'joke_factory_role';
const LS_ROUND_ID = 'joke_factory_round_id';
/** Config keys updateConfig sends to the backend besides the Lean ones (see leanConfigToBody).
    Batch sizes are not among them: Reset Game sets Round 1 to exactly 5 and
    Round 2 to up to 10, and the instructor screen no longer edits them. */
const PERSISTED_CONFIG_KEYS = new Set<keyof GameConfig>([
  'customerBudget', 'marketPrice', 'costOfPublishing', 'costOfDiscard', 'idealProfile',
]);

const LS_SUBMITTED_BATCH_JOKES = 'joke_factory_submitted_batch_jokes_v1';
const LS_QC_RATED_HISTORY = 'joke_factory_qc_rated_history_v1';

const DEFAULT_ROUND2_BATCH_LIMIT = 10;
const DEFAULT_MARKET_PRICE = 1;
const DEFAULT_COST_OF_PUBLISHING = 0.1;
const DEFAULT_COST_OF_DISCARD = 0.01;
// Marketing's decision clock (see services/marketingNudge.ts). Instructor-tunable.
const DEFAULT_MARKETING_NUDGE_1_SECONDS = 60;
const DEFAULT_MARKETING_NUDGE_2_SECONDS = 45;
const POLL_INTERVAL_MS = 2500;

// Helper to init team names (fallback, will be replaced by /v1/teams where possible)
const INITIAL_TEAM_NAMES: Record<string, string> = {};
for (let i = 1; i <= 20; i++) INITIAL_TEAM_NAMES[i.toString()] = `Team ${i}`;


function nowMs() {
  return Date.now();
}

function isMockModeEnabled(): boolean {
  const env = (import.meta as any).env || {};
  const forceMock = String(env.VITE_USE_MOCK_API ?? '').toLowerCase() === 'true';
  const prod = Boolean(env.PROD);
  const base = String(env.VITE_API_BASE_URL ?? '').trim();
  return forceMock || (prod && !base);
}

export function toRole(apiRole: string | null): Role {
  switch (apiRole) {
    case 'INSTRUCTOR':
      return 'INSTRUCTOR' as Role;
    case 'JM':
      return 'JOKE_MAKER' as Role;
    // The backend renamed QC to MARKETING in V2 (core/domain/enums.go:6-14). The UI enum
    // keeps the name QUALITY_CONTROL to avoid a repo-wide rename; only the wire value moved.
    case 'MARKETING':
    case 'QC':
      return 'QUALITY_CONTROL' as Role;
    // The real backend can never send CUSTOMER, but the in-browser mock still does:
    // DevRoleSwitcher writes { role: 'CUSTOMER' } into the mock DB and the app re-reads it
    // through /session/me. Dropping this case would route the dev Customer view to the
    // Waiting Room. Remove it with views/Customer.tsx, not here.
    case 'CUSTOMER':
      return 'CUSTOMER' as Role;
    default:
      return 'UNASSIGNED' as Role;
  }
}

/**
 * UI role -> the value the backend will accept on a write. The mirror of `toRole`.
 *
 * The read side is deliberately permissive (it still accepts the legacy 'QC'); this side must
 * not be. usecase/instructor.go:207-218 accepts INSTRUCTOR | JM | MARKETING and returns
 * 400 VALIDATION_ERROR "unsupported role" for everything else, so a Marketing seat has exactly
 * one correct spelling on the wire and 'QC' is a guaranteed failure.
 *
 * Returns undefined for roles with no backend seat (CUSTOMER, UNASSIGNED). Callers must treat
 * undefined as "do not send a role", not as "send it without one": PatchUser falls back to
 * `existing.Role` when role is nil (instructor.go:196-198), so an omitted role silently keeps
 * the old one instead of failing.
 */
export function toApiRole(uiRole: Role | undefined): PatchUserRole | undefined {
  switch (uiRole) {
    case 'INSTRUCTOR' as Role:
      return 'INSTRUCTOR';
    case 'JOKE_MAKER' as Role:
      return 'JM';
    case 'QUALITY_CONTROL' as Role:
      return 'MARKETING';
    default:
      // CUSTOMER has no backend seat at all (customers are simulated now), and UNASSIGNED is
      // expressed as status WAITING rather than as a role.
      return undefined;
  }
}

function makeUser(base: { user_id: UserId; display_name: string }, role: Role, team_id: TeamId | null): User {
  const team = team_id ? String(team_id) : 'N/A';
  return {
    user_id: base.user_id,
    display_name: base.display_name,
    team_id,
    role,
    // UI compatibility
    id: String(base.user_id),
    name: base.display_name,
    team,
    // customer UI compatibility (populated later)
    wallet: 0,
    purchasedJokes: [],
  };
}

type RoundStatus = 'ACTIVE' | 'ENDED' | 'CONFIGURED';

function normalizeRoundStatus(s: string | undefined | null): 'ACTIVE' | 'ENDED' | 'CONFIGURED' | null {
  if (!s) return null;
  const upper = String(s).toUpperCase();
  if (upper.includes('ACTIVE')) return 'ACTIVE';
  if (upper.includes('ENDED')) return 'ENDED';
  if (upper.includes('CONFIGURED')) return 'CONFIGURED';
  return null;
}

/** ISO string from the API to ms epoch; null when missing or unparseable. */
function parseRoundTime(iso: unknown): number | null {
  if (typeof iso !== 'string' || !iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function roundTimesFrom(r1: any, r2: any): RoundTimes {
  return {
    1: { startedAt: parseRoundTime(r1?.started_at), endedAt: parseRoundTime(r1?.ended_at) },
    2: { startedAt: parseRoundTime(r2?.started_at), endedAt: parseRoundTime(r2?.ended_at) },
  };
}

const EMPTY_ROUND_TIMES: RoundTimes = {
  1: { startedAt: null, endedAt: null },
  2: { startedAt: null, endedAt: null },
};

function sameRoundTimes(a: RoundTimes, b: RoundTimes): boolean {
  return ([1, 2] as const).every(n => a[n].startedAt === b[n].startedAt && a[n].endedAt === b[n].endedAt);
}

export function mapBatchFromTeamList(
  roundNumber: number,
  team_id: TeamId,
  teamBatches: ApiTeamBatchesResponse['batches'][number],
  jokeTexts?: string[],
): Batch {
  const batch_id = teamBatches.batch_id;
  const status = teamBatches.status;
  const jokesFromApi = Array.isArray(teamBatches.jokes) ? teamBatches.jokes : null;
  const jokes: Joke[] = jokesFromApi
    ? jokesFromApi.map(j => ({
        joke_id: j.joke_id as JokeId,
        joke_text: j.joke_text,
        id: String(j.joke_id),
        content: j.joke_text,
        joke_title: j.joke_title ?? null,
        publish_status: j.publish_status,
        sold_count: j.sold_count ?? (j as any)?.soldCount ?? undefined,
        is_bought: (j as any)?.is_bought ?? (j as any)?.isBought ?? undefined,
        // The backend sends publish_status: PENDING | PUBLISHED | DISCARDED. is_published is
        // kept as the UI's vocabulary, derived here at the boundary.
        is_published:
          j.publish_status != null
            ? j.publish_status === 'PUBLISHED'
            : ((j as any)?.is_published ?? (j as any)?.isPublished ?? undefined),
        first_sold_at: j.first_sold_at ?? (j as any)?.firstSoldAt ?? null,
        published_at: j.published_at ?? (j as any)?.publishedAt ?? null,
        topic: (j as any)?.topic ?? (j as any)?.category ?? undefined,
      }))
    : (jokeTexts || []).map((txt, idx) => {
        const fakeJokeId = Number(`${batch_id}${idx}`); // stable-ish per batch; only for UI rendering
        return {
          joke_id: fakeJokeId as JokeId,
          joke_text: txt,
          id: String(fakeJokeId),
          content: txt,
        };
      });

  const submittedAt = teamBatches.submitted_at ? Date.parse(teamBatches.submitted_at) : undefined;
  // The backend renamed rated_at -> processed_at in V2 (handler/batch.go). Accept both so a
  // stale mock response still maps.
  const ratedAtRaw = teamBatches.processed_at ?? teamBatches.rated_at;
  const ratedAt = ratedAtRaw ? Date.parse(ratedAtRaw) : undefined;

  return {
    batch_id,
    round_id: 0 as RoundId, // not included in list endpoint response; tracked separately
    team_id,
    status,
    jokes,
    submitted_at: teamBatches.submitted_at,
    rated_at: ratedAtRaw,
    // Marketing's note to the Joke Maker. An older backend sends no key at all,
    // and that, null and a blank string all read as "no note".
    marketing_note: toMarketingNote(teamBatches.marketing_note),
    // No avg_score / passes_count / feedback / tag_summary: the batch listing
    // sends none of them. `feedback` and `tagSummary` survive only as local
    // state, merged back in by the caller from its persisted copy.
    tagSummary: [],
    // UI compatibility aliases
    id: String(batch_id),
    team: String(team_id),
    round: roundNumber,
    submittedAt,
    ratedAt,
  };
}

/**
 * Roles that load their team's customer feedback: Marketing only.
 *
 * The backend would let the Joke Maker read it too (FeedbackService.Get
 * accepts JM or MARKETING on the team, core/usecase/feedback.go:44-49), but the
 * game wants the Joke Maker to hear from Marketing, not from a panel both
 * seats share: Marketing reads the customers and writes a note with each
 * batch. So the Joke Maker makes no /feedback requests at all.
 */
const TEAM_FEEDBACK_ROLES: ReadonlySet<string> = new Set(['QUALITY_CONTROL']);

/**
 * One poll of GET /v1/rounds/{rid}/teams/{tid}/feedback for the Marketing
 * branch. Every other role gets `undefined` without a request.
 *
 * Returns `undefined` for "nothing to apply" — no team yet, route unsupported,
 * or a failed request. That is deliberately distinct from `null`: a transient
 * failure must leave the last good feedback on screen rather than blanking the
 * panel mid-round.
 *
 * `unsupportedRef` latches on a 404 so a backend without the route is asked
 * once, not every POLL_INTERVAL_MS forever; it is reset wherever the session is
 * (see the resets below).
 *
 * teamApi.feedback unwraps the {data} envelope itself, so callers need no
 * `?.data ?? x` dance — see apiClient.apiRequest. X-User-Id is required by the
 * handler and is attached by apiRequest (from localStorage, or in a watch tab
 * from sessionStorage via services/watchMode.ts).
 */
export async function pollTeamFeedback(
  role: Role,
  roundId: RoundId | number | null,
  teamId: TeamId | null,
  unsupportedRef: { current: boolean },
): Promise<TeamFeedbackResponse | null | undefined> {
  if (!TEAM_FEEDBACK_ROLES.has(String(role))) return undefined;
  if (!roundId || !teamId || unsupportedRef.current) return undefined;
  try {
    return (await teamApi.feedback(Number(roundId), teamId)) ?? null;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.code === 'NOT_FOUND')) {
      unsupportedRef.current = true;
    }
    // ignore; retry on the next poll if supported
    return undefined;
  }
}

/* ---------------------------------------------------------------------------
   One Marketing poll tick (live work): queue count, queue/next, team summary,
   feedback and the team's batches. Lifted out of the poll effect so a test can
   drive it with a fake API; the effect passes the real services, refs and setters.

   queue/next LOCKS the team's next batch to the caller, so it is the only call
   held back while a batch is on the desk: it runs when the desk is empty, and
   again once the held batch is MARKETING_QUEUE_NEXT_REFRESH_MS old, so a lock
   change or the round ending is still seen. Everything else runs every tick.
   The guard reads refs, never the qcQueue value the effect closed over.
--------------------------------------------------------------------------- */
export const MARKETING_QUEUE_NEXT_REFRESH_MS = 10_000;
const STALE_QUEUE_NEXT = Symbol('stale queue/next');

export interface MarketingPollIo {
  queueCount(roundId: RoundId): Promise<unknown>;
  queueNext(roundId: RoundId): Promise<unknown>;
  teamSummary(roundId: RoundId, teamId: TeamId): Promise<unknown>;
  listTeamBatches(roundId: RoundId, teamId: TeamId): Promise<unknown>;
  pollFeedback(
    role: Role,
    roundId: RoundId,
    teamId: TeamId | null,
    unsupportedRef: { current: boolean },
  ): Promise<TeamFeedbackResponse | null | undefined>;
}

export interface MarketingPollDeps {
  io: MarketingPollIo;
  role: Role;
  roundId: RoundId;
  roundNumber: number;
  /** The user's assigned team; null when not on one. */
  teamId: TeamId | null;
  /** False in a watch tab whose bot is not Marketing on this team: queue/next would lock a batch to the bot. */
  mayClaim: () => boolean;
  isCancelled: () => boolean;
  now?: () => number;
  refs: {
    /** Mirror of the qcQueue state (the batch on the desk). */
    qcQueue: { current: ApiQcQueueNextResponse | null };
    qcNextRetryAfter: { current: number };
    /** When queue/next was last asked. */
    qcNextFetchedAt: { current: number };
    /** Bumped by the desk actions (split, unsplit, release) that set the queue themselves. */
    qcQueueGen: { current: number };
    teamSummaryUnsupported: { current: boolean };
    teamFeedbackUnsupported: { current: boolean };
    submittedBatchJokes: { current: Record<string, string[]> };
    qcRatedHistory: { current: Record<string, Batch> };
  };
  set: {
    queue(q: ApiQcQueueNextResponse | null): void;
    queueSize(n: number): void;
    teamSummary(s: ApiTeamSummaryResponse | null): void;
    teamFeedback(f: TeamFeedbackResponse | null): void;
    batches(b: Batch[]): void;
  };
}

export const MARKETING_POLL_IO: MarketingPollIo = {
  queueCount: roundId => marketingService.queueCount(roundId),
  queueNext: roundId => marketingService.queueNext(roundId),
  teamSummary: (roundId, teamId) => jmService.teamSummary(roundId, teamId),
  listTeamBatches: (roundId, teamId) => jmService.listTeamBatches(roundId, teamId),
  pollFeedback: pollTeamFeedback,
};

export async function pollMarketingWork(deps: MarketingPollDeps): Promise<{
  summaryTeamId: TeamId | null;
  didHydrateBatchesFromApi: boolean;
}> {
  const { io, role, roundId: effectiveRound, refs, set } = deps;
  const now = deps.now ?? Date.now;
  const cancelled = deps.isCancelled;
  const setQueue = (q: ApiQcQueueNextResponse | null) => {
    if (cancelled()) return;
    refs.qcQueue.current = q;
    set.queue(q);
  };

  // Some backends return 404 "resource not found: batch" when queue is empty.
  // To avoid noisy errors, check queue/count first and only call queue/next when size > 0.
  let normalizedQueue: ApiQcQueueNextResponse | null = null;
  try {
    const countRaw = await io.queueCount(effectiveRound);
    const countAny: any = (countRaw as any)?.data ?? countRaw;
    // Support both queue_size and count field names.
    const size = Number(countAny?.queue_size ?? countAny?.count ?? 0);
    // The count belongs to the poll, not to the held batch: report it on every tick.
    if (!cancelled()) set.queueSize(size);
    if (!size) {
      setQueue(null);
    } else {
      // While a batch is held, queue/next is only re-asked every
      // MARKETING_QUEUE_NEXT_REFRESH_MS; the rest of the tick still runs.
      const held = refs.qcQueue.current !== null;
      const due = !held || now() - refs.qcNextFetchedAt.current >= MARKETING_QUEUE_NEXT_REFRESH_MS;

      // queue/next LOCKS the team's next batch to the caller. In a watch
      // tab the caller is the bot, so claim only while the bot's own
      // engine says it is Marketing on this very team — otherwise leave
      // qcQueue as it is. Always true in a normal tab. See
      // services/watchMode.ts mayClaimMarketingBatch.
      // Only call queue/next if we are not in a backoff period from a recent 404.
      if (due && deps.mayClaim() && now() >= refs.qcNextRetryAfter.current) {
        refs.qcNextFetchedAt.current = now();
        // A desk action that lands while queue/next is in flight makes its answer stale
        // (it may still show the batch as it was before the split or the release): drop it.
        const gen = refs.qcQueueGen.current;
        try {
          const rawQ = await io.queueNext(effectiveRound);
          if (refs.qcQueueGen.current !== gen) throw STALE_QUEUE_NEXT;
          const qAny: any = rawQ;
          const qData = (qAny?.data ?? qAny) as any;
          // queue/next answers 200 {batch: null, jokes: [], queue_size: N} when every
          // batch is held by a teammate: CountSubmittedBatchesForTeam counts locked
          // batches, so queue_size can be > 0 while batch is null. A null batch means
          // "the queue is not empty but nothing is available to me", which renders
          // identically to an empty queue — and without this guard QualityControl's
          // read of qcQueue.batch.batch_id throws and blanks the Marketing screen.
          normalizedQueue = qData && qData.batch
            ? {
                batch: qData.batch,
                jokes: Array.isArray(qData.jokes) ? qData.jokes : [],
                queue_size: qData.queue_size ?? size,
              }
            : null;
          setQueue(normalizedQueue);
          refs.qcNextRetryAfter.current = 0; // success, clear backoff
        } catch (e) {
          if (e === STALE_QUEUE_NEXT || refs.qcQueueGen.current !== gen) {
            // Dropped: a desk action landed while this was in flight and already set the queue.
          } else if (e instanceof ApiError && e.status === 404) {
            // If queue/next 404s despite count > 0, it usually means the batch
            // is already locked by another QC or not available to this user.
            setQueue(null);
            // Back off for 30 seconds to avoid spamming 404s if count is lying.
            refs.qcNextRetryAfter.current = now() + 30000;
          } else {
            throw e; // rethrow other errors to be caught by outer block
          }
        }
      }
    }
  } catch {
    setQueue(null);
  }

  // Team summary for QC (rank/points/avg quality). Prefer batch team_id; fallback to assignment team.
  const summaryTeamId = (normalizedQueue?.batch?.team_id ?? deps.teamId ?? null) as TeamId | null;
  if (summaryTeamId) {
    try {
      if (!refs.teamSummaryUnsupported.current) {
        const ts = await io.teamSummary(effectiveRound, summaryTeamId);
        if (!cancelled()) {
          set.teamSummary((ts as any)?.data ?? ts ?? null);
        }
      }
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.code === 'NOT_FOUND')) {
        refs.teamSummaryUnsupported.current = true;
      }
      // ignore summary failures; will retry on next poll if supported
    }
  }

  // QC batch history: load team batches from API so refresh/logout can restore submitted/rated batch stats.
  // Merge with locally persisted QC-rated history to preserve feedback/tags where the API omits them.
  const qcTeamId = deps.teamId;

  /* Marketing's feedback panel. Gated on the user actually being on a
     team, because the route is per-team — pollTeamFeedback owns that
     gate, the Marketing-only role gate and the 404 latch. */
  const qcFeedback = await io.pollFeedback(role, effectiveRound, qcTeamId, refs.teamFeedbackUnsupported);
  if (qcFeedback !== undefined && !cancelled()) set.teamFeedback(qcFeedback);

  let didHydrateBatchesFromApi = false;
  if (qcTeamId) {
    try {
      const listRaw = await io.listTeamBatches(effectiveRound, qcTeamId);
      const listData: any = (listRaw as any)?.data ?? listRaw;
      const batchesArr: any[] = Array.isArray(listData?.batches) ? listData.batches : [];
      const mapped = batchesArr.map(b =>
        mapBatchFromTeamList(
          deps.roundNumber,
          qcTeamId,
          b,
          refs.submittedBatchJokes.current[`${effectiveRound}:${String(b.batch_id)}`],
        ),
      );
      // Process qcExtra first, then mapped overwrites - so API data (is_published, sold_count) wins
      const qcExtra = Object.values(refs.qcRatedHistory.current).filter((b: Batch) => b.team_id === qcTeamId);
      const merged = [...qcExtra, ...mapped].reduce<Record<string, Batch>>((acc, b: Batch) => {
        const existing = acc[String(b.batch_id)];
        if (existing) {
          // Merge: API data wins, but keep local feedback/tags if API doesn't have them
          acc[String(b.batch_id)] = {
            ...existing,
            ...b,
            feedback: b.feedback ?? existing.feedback,
            tagSummary: b.tagSummary?.length ? b.tagSummary : existing.tagSummary,
          };
        } else {
          acc[String(b.batch_id)] = b;
        }
        return acc;
      }, {} as Record<string, Batch>);
      if (!cancelled()) {
        set.batches(Object.values(merged).sort((a, b) => (a.batch_id - b.batch_id)));
        didHydrateBatchesFromApi = true;
      }
    } catch {
      // ignore; fallback below
    }
  }

  return { summaryTeamId, didHydrateBatchesFromApi };
}

/* GET /lobby: Go sends ports.LobbySnapshot, PascalCase with no json tags (ApiInstructorLobbyResponse),
   with null for empty Teams/Unassigned; the mock sends the older snake_case shape, customers included.
   Read both into one InstructorLobby. */
export function normalizeInstructorLobby(raw: any, fallbackRoundId: RoundId | null): InstructorLobby {
  const data = raw?.data ?? raw ?? {};
  const teamsArr: any[] = Array.isArray(data?.Teams ?? data?.teams) ? (data.Teams ?? data.teams) : [];
  const customersArr: any[] = Array.isArray(data?.Customers ?? data?.customers) ? (data.Customers ?? data.customers) : [];
  const unassignedArr: any[] = Array.isArray(data?.Unassigned ?? data?.unassigned) ? (data.Unassigned ?? data.unassigned) : [];
  return {
    round_id: data?.RoundID ?? data?.round_id ?? fallbackRoundId,
    summary: {
      waiting: data?.Summary?.Waiting ?? data?.summary?.waiting ?? 0,
      assigned: data?.Summary?.Assigned ?? data?.summary?.assigned ?? 0,
      dropped: data?.Summary?.Dropped ?? data?.summary?.dropped ?? 0,
      team_count: data?.Summary?.TeamCount ?? data?.summary?.team_count ?? teamsArr.length,
    },
    teams: teamsArr.map(t => {
      const members: any[] = Array.isArray(t.Members ?? t.members) ? (t.Members ?? t.members) : [];
      const team = t.Team ?? t.team ?? {};
      const teamId = team.ID ?? team.Id ?? team.id ?? t.TeamID ?? t.team_id;
      const teamName = team.Name ?? team.name ?? `Team ${teamId ?? ''}`;
      return {
        team: { id: Number(teamId) as TeamId, name: String(teamName) },
        members: members.map(m => ({
          user_id: Number(m.UserID ?? m.user_id) as UserId,
          display_name: String(m.DisplayName ?? m.display_name ?? ''),
          role: m.Role ?? m.role ?? null,
        })),
      };
    }),
    customers: customersArr.map(c => ({
      user_id: Number(c.UserID ?? c.user_id) as UserId,
      display_name: String(c.DisplayName ?? c.display_name ?? ''),
      role: c.Role ?? c.role ?? 'CUSTOMER',
    })),
    unassigned: unassignedArr.map(u => ({
      user_id: Number(u.UserID ?? u.user_id) as UserId,
      display_name: String(u.DisplayName ?? u.display_name ?? ''),
      status: u.Status ?? u.status ?? 'WAITING',
    })),
  };
}

export function normalizeInstructorStats(raw: any): ApiInstructorStatsResponse {
  const data = raw?.data ?? raw ?? {};
  const normalizeTeam = (t: any) => ({
    id: Number(t?.id ?? t?.ID ?? 0) as TeamId,
    name: String(t?.name ?? t?.Name ?? `Team ${t?.id ?? t?.ID ?? ''}`),
  });
  // Backend variants: some implementations return `leaderboard`, others return `teams`.
  const leaderboard = Array.isArray(data.leaderboard ?? data.Leaderboard)
    ? (data.leaderboard ?? data.Leaderboard)
    : Array.isArray(data.teams ?? data.Teams)
      ? (data.teams ?? data.Teams)
      : [];
  const normLeaderboard = leaderboard.map((item: any) => ({
    rank: Number(item.rank ?? item.Rank ?? 0),
    team: normalizeTeam(item.team ?? item.Team ?? {}),
    points: Number(item.points ?? item.Points ?? 0),
    total_sales: Number(item.total_sales ?? item.TotalSales ?? 0),
    unsold_jokes: Number(item.unsold_jokes ?? item.UnsoldJokes ?? item.unsoldJokes ?? 0),
    discarded_jokes: Number(item.discarded_jokes ?? item.DiscardedJokes ?? 0),
    batches_processed: Number(item.batches_processed ?? item.BatchesProcessed ?? 0),
    profit: Number(item.profit ?? item.Profit ?? 0),
    total_jokes: Number(item.total_jokes ?? item.TotalJokes ?? 0),
    published_jokes: Number(item.published_jokes ?? item.PublishedJokes ?? 0),
    // Lean rounds only: the leaderboard, debrief and learning curve key off it.
    ...(item.lean != null ? { lean: item.lean } : {}),
  }));

  /* rejection_by_team is NOT on the wire — ports.TeamStats has no rejection
     series. It is derived here from the leaderboard, whose discarded_jokes and
     total_jokes are exactly its two inputs, so the "Wasted Jokes" bars render
     real numbers instead of an array the backend never sends. */
  const rejection_by_team = normLeaderboard.map((t: ApiInstructorStatsResponse['leaderboard'][number]) => ({
    team_id: t.team.id,
    team_name: t.team.name,
    unaccepted_jokes: t.discarded_jokes,
    rejection_rate: t.total_jokes > 0 ? t.discarded_jokes / t.total_jokes : 0,
  }));

  // Stats API shape varies by backend implementation. Support both naming schemes:
  // - sales_over_time -> cumulative_sales
  // - batch_sequence_quality -> learning_curve
  const cumulative_sales = Array.isArray(data.cumulative_sales ?? data.CumulativeSales)
    ? (data.cumulative_sales ?? data.CumulativeSales)
    : Array.isArray(data.sales_over_time ?? data.SalesOverTime)
      ? (data.sales_over_time ?? data.SalesOverTime)
      : [];
  const unrated_jokes_over_time = Array.isArray(data.unrated_jokes_over_time ?? data.UnratedJokesOverTime)
    ? (data.unrated_jokes_over_time ?? data.UnratedJokesOverTime)
    : [];
  const learning_curve = Array.isArray(data.learning_curve ?? data.LearningCurve)
    ? (data.learning_curve ?? data.LearningCurve)
    : Array.isArray(data.batch_sequence_quality ?? data.BatchSequenceQuality)
      ? (data.batch_sequence_quality ?? data.BatchSequenceQuality)
      : [];
  const mapKeys = (arr: any[], keyMap: Record<string, string>) =>
    arr.map((item: any) => {
      const out: any = {};
      Object.entries(item).forEach(([k, v]) => {
        const nk = keyMap[k] ?? keyMap[k.toLowerCase()] ?? k;
        out[nk] = v;
      });
      return out;
    });

  return {
    round_id: Number(data.round_id ?? data.RoundId ?? data.roundId ?? 0) as RoundId,
    leaderboard: normLeaderboard,
    cumulative_sales: mapKeys(cumulative_sales, {
      event_index: 'event_index',
      EventIndex: 'event_index',
      team_event_index: 'team_event_index',
      TeamEventIndex: 'team_event_index',
      team_id: 'team_id',
      TeamId: 'team_id',
      team_name: 'team_name',
      TeamName: 'team_name',
      total_sales: 'total_sales',
      TotalSales: 'total_sales',
      cumulative_points: 'total_sales', // backend uses cumulative_points for sales series
      CumulativePoints: 'total_sales',
      timestamp: 'timestamp',
      Timestamp: 'timestamp',
    }),
    unrated_jokes_over_time: mapKeys(unrated_jokes_over_time, {
      team_event_index: 'team_event_index',
      TeamEventIndex: 'team_event_index',
      event_index: 'team_event_index',
      EventIndex: 'team_event_index',
      team_id: 'team_id',
      TeamId: 'team_id',
      team_name: 'team_name',
      TeamName: 'team_name',
      queue_count: 'queue_count',
      QueueCount: 'queue_count',
      timestamp: 'timestamp',
      Timestamp: 'timestamp',
    }),
    learning_curve: mapKeys(learning_curve, {
      team_id: 'team_id',
      TeamId: 'team_id',
      team_name: 'team_name',
      TeamName: 'team_name',
      batch_order: 'batch_order',
      BatchOrder: 'batch_order',
      avg_score: 'avg_score',
      AvgScore: 'avg_score',
    }),
    rejection_by_team,
  };
}

export interface ConfigSaveResult {
  /** False when the selected round refused the save (or there was no round to save to). */
  saved: boolean;
  feeRounds: number[];
}

export interface GameContextType {
  user: User | null;
  roster: User[]; // Instructor: lobby; JM/QC: teammates
  login: (name: string, role: Role) => Promise<void>;
  instructorLogin: (displayName: string, password: string) => Promise<void>;
  logout: () => void;
  
  config: GameConfig;
  /**
   * Applies `updates` locally and persists the round parameters. Lean settings
   * (fees, arrival window) go to every round still CONFIGURED; the rest to the
   * selected round. feeRounds lists the round numbers whose Lean settings were
   * written (empty when none changed or the save failed).
   */
  updateConfig: (updates: Partial<GameConfig>) => Promise<ConfigSaveResult>;
  setRound: (round: number) => void;
  setGameActive: (active: boolean) => Promise<void>;
  endRound: () => Promise<void>;
  toggleTeamPopup: (show: boolean) => Promise<void>;
  resetGame: () => Promise<boolean>;
  
  // Lobby / Team Formation
  formTeams: () => Promise<void>;
  resetToLobby: () => void;

  // Team Name Management
  teamNames: Record<string, string>;
  updateTeamName: (teamNum: string, name: string) => void;
  updateUser: (userId: string, updates: Partial<User>) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;

  batches: Batch[];
  addBatch: (jokes: string[]) => Promise<void>;
  /** Resolves true when the backend accepted the batch, false otherwise. */
  submitRawBatch: (rawText: string) => Promise<boolean>;
  splitBatch: (batchId: string, jokes: string[]) => Promise<void>;
  unsplitBatch: (batchId: string) => Promise<void>;
  /** Resolves true when the backend accepted the publish. Resolves false when
   *  it did not: silently when there is no active round or the batch is not the
   *  one claimed (nothing was sent), or after an alert when the backend rejected
   *  it. Either way the caller keeps its decisions and the typed note. */
  publishBatch: (
    batchId: string,
    publishedIds: number[],
    jokeTitles: { [jokeId: string]: string },
    note?: string,
  ) => Promise<boolean>;
  
  sales: Record<string, number>; // jokeId -> count of purchases

  // API-driven view models
  roundId: RoundId | null;
  /** Instructor only: the backend ids of Round 1 and Round 2, from /rounds/active. */
  roundIds: { 1: RoundId | null; 2: RoundId | null };
  /** Each round's normalized status, from /rounds/active (null = unknown). Polled for the instructor and for seated students. */
  roundStatuses: { 1: RoundStatus | null; 2: RoundStatus | null };
  /** Each round's start and end (ms epoch, null when unknown), from /rounds/active whatever the round's status. */
  roundTimes: RoundTimes;
  marketItems: ApiMarketItem[];
  teamSummary: ApiTeamSummaryResponse | null;
  /* Per-joke pass/fail feedback for the signed-in user's team. Dimension IDS
     only — the backend deliberately sends no categories, no ideal levels and no
     numbers, because teams are meant to reverse-engineer the hidden ideal by
     selling jokes. Null until the first successful poll (and in mock mode,
     which has no /feedback route). */
  teamFeedback: TeamFeedbackResponse | null;
  instructorLobby: InstructorLobby | null;
  instructorStats: ApiInstructorStatsResponse | null;
  instructorStatsRound1: ApiInstructorStatsResponse | null;
  instructorStatsRound2: ApiInstructorStatsResponse | null;
  qcQueue: ApiQcQueueNextResponse | null;
  /** Batches waiting for Marketing (queue/count `queue_size`), refreshed every poll whether or not a batch is held. Null until known. */
  qcQueueSize: number | null;
}

/** Exported so view tests can render a screen with a fake game (views/testing/renderWithGame.ts). */
export const GameContext = createContext<GameContextType | undefined>(undefined);

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};

/**
 * Demo mode: on inside the guided tour's stage (components/tour/DemoStage.tsx),
 * off everywhere else. The stage renders the real student views under its own
 * GameContext.Provider (a scripted demo game, services/tour/demoGame.ts). The
 * value here is the scripted screen state the views read in place of their own
 * local state (services/tour/demoUi.ts); null means "not a demo". Anything that
 * could reach the network, write localStorage or start a timer that opens a
 * dialog checks useDemoMode() first.
 */
export const DemoModeContext = createContext<DemoUi | null>(null);
export const useDemoMode = (): boolean => useContext(DemoModeContext) !== null;
export const useDemoUi = (): DemoUi | null => useContext(DemoModeContext);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /* A provider inside the guided tour's demo stage never polls. The stage uses
     its own demo context, not this provider; this is the backstop. */
  const demoMode = useDemoMode();
  const [user, setUser] = useState<User | null>(null);
  const [roundId, setRoundId] = useState<RoundId | null>(null);
  const [roundIds, setRoundIds] = useState<{ 1: RoundId | null; 2: RoundId | null }>({ 1: null, 2: null });
  const [roundStatuses, setRoundStatuses] = useState<{ 1: RoundStatus | null; 2: RoundStatus | null }>({ 1: null, 2: null });
  const [roundTimes, setRoundTimes] = useState<RoundTimes>(EMPTY_ROUND_TIMES);
  const [roster, setRoster] = useState<User[]>([]);
  const [teamNames, setTeamNames] = useState<Record<string, string>>(INITIAL_TEAM_NAMES);

  const [batches, setBatches] = useState<Batch[]>([]);
  const [sales] = useState<Record<string, number>>({}); // legacy; kept for compatibility but no longer authoritative

  const [marketItems, setMarketItems] = useState<ApiMarketItem[]>([]);
  const [teamSummary, setTeamSummary] = useState<ApiTeamSummaryResponse | null>(null);
  const [teamFeedback, setTeamFeedback] = useState<TeamFeedbackResponse | null>(null);
  const [instructorLobby, setInstructorLobby] = useState<InstructorLobby | null>(null);
  const [instructorStats, setInstructorStats] = useState<ApiInstructorStatsResponse | null>(null);
  const [instructorStatsByRoundNumber, setInstructorStatsByRoundNumber] = useState<Record<1 | 2, ApiInstructorStatsResponse | null>>({
    1: null,
    2: null,
  });
  const [qcQueue, setQcQueue] = useState<ApiQcQueueNextResponse | null>(null);
  /** Batches waiting for Marketing, from queue/count; null until the first count. Independent of qcQueue. */
  const [qcQueueSize, setQcQueueSize] = useState<number | null>(null);
  /* The Marketing poll closes over its first render, so it reads the held batch and the
     time of the last queue/next from refs. qcQueueRef mirrors qcQueue. */
  const qcQueueRef = useRef<ApiQcQueueNextResponse | null>(null);
  const qcNextFetchedAtRef = useRef<number>(0);
  /* Bumped by split, unsplit and release, which set qcQueue themselves: a queue/next
     already in flight when one lands is stale and the poll drops it. */
  const qcQueueGenRef = useRef<number>(0);
  useEffect(() => { qcQueueRef.current = qcQueue; }, [qcQueue]);
  const teamSummaryUnsupportedRef = useRef<boolean>(false);
  /* Same latch as teamSummaryUnsupportedRef: the in-browser mock API has no
     /feedback route, so without this every poll tick would fire a doomed
     request. One 404 and we stop asking. */
  const teamFeedbackUnsupportedRef = useRef<boolean>(false);
  const lastInstructorStatsFetchRef = useRef<Record<number, number>>({});
  const qcNextRetryAfterRef = useRef<number>(0);

  // Local caches to preserve UI that expects joke text (API does not return it for batch history).
  const submittedBatchJokesRef = useRef<Record<string, string[]>>({});
  const qcRatedHistoryRef = useRef<Record<string, Batch>>({});

  // Polling controls
  const pollAbortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  /** The customer budget last read from the round; Start sends the budget only when it differs. */
  const storedBudgetRef = useRef<number | null>(null);

  const initialConfig = (): GameConfig => ({
    status: 'LOBBY', // Start in LOBBY to show setup screen
    round: 1,
    isActive: false,
    showTeamPopup: false,
    startTime: null,
    elapsedTime: 0,
    customerBudget: DEFAULT_CUSTOMER_BUDGET,
    round1BatchSize: 5,
    round2BatchLimit: DEFAULT_ROUND2_BATCH_LIMIT,
    marketPrice: DEFAULT_MARKET_PRICE,
    costOfPublishing: DEFAULT_COST_OF_PUBLISHING,
    costOfDiscard: DEFAULT_COST_OF_DISCARD,
    marketingNudge1Seconds: DEFAULT_MARKETING_NUDGE_1_SECONDS,
    marketingNudge2Seconds: DEFAULT_MARKETING_NUDGE_2_SECONDS,
    idealProfile: { ...DEFAULT_IDEAL_PROFILE },
    ...LEAN_DEFAULTS,
  });

  const [config, setConfig] = useState<GameConfig>(initialConfig());

  /* The stored config and hidden ideal joke, read back from the backend (instructor only), so a
     reload shows what was saved rather than the defaults. Fetched on mount and when the viewed
     round changes, never on an interval, so it cannot clobber an edit in progress; an edit made
     while a fetch was in flight (updateConfig bumps the counter) discards that fetch's result. */
  const configEditSeqRef = useRef(0);
  /** Latched when the backend has no GET /config route (404/405): today's defaults stay, no retries. */
  const roundConfigUnsupportedRef = useRef(false);
  const isInstructorUser = user?.role === ('INSTRUCTOR' as Role);

  const loadStoredRoundConfig = async (targetRoundId: RoundId): Promise<boolean> => {
    if (roundConfigUnsupportedRef.current) return false;
    const editsBefore = configEditSeqRef.current;
    try {
      const res = await instructorService.getRoundConfig(targetRoundId);
      if (configEditSeqRef.current !== editsBefore) return false;
      const patch = configFromInstructorRound(res.round);
      if (patch.customerBudget !== undefined) storedBudgetRef.current = patch.customerBudget;
      setConfig(prev => ({ ...prev, ...patch }));
      return true;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) {
        if (!roundConfigUnsupportedRef.current) console.warn('This backend cannot read the round config back (no GET /config); showing defaults.');
        roundConfigUnsupportedRef.current = true;
      }
      return false;
    }
  };

  const viewedRoundId = roundIds[config.round === 2 ? 2 : 1];
  useEffect(() => {
    if (!isInstructorUser || !viewedRoundId) return;
    void loadStoredRoundConfig(viewedRoundId);
    // loadStoredRoundConfig only reads refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInstructorUser, viewedRoundId]);

  // Restore local caches across refresh (best-effort). Not in a watch tab:
  // these shared caches belong to the instructor or another user of this
  // browser, not to the bot being watched.
  useEffect(() => {
    if (isWatchMode()) return;
    try {
      const raw = localStorage.getItem(LS_SUBMITTED_BATCH_JOKES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          submittedBatchJokesRef.current = parsed as Record<string, string[]>;
        }
      }
    } catch {
      // ignore
    }
    try {
      const raw = localStorage.getItem(LS_QC_RATED_HISTORY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          qcRatedHistoryRef.current = parsed as Record<string, Batch>;
        }
      }
    } catch {
      // ignore
    }
  }, []);
  // Initial load from localStorage (session only)
  useEffect(() => {
    // A watch tab takes its identity from this tab only; the shared
    // localStorage belongs to the instructor. See services/watchMode.ts.
    const watching = getWatchIdentity();
    if (watching) {
      setUser(makeUser({ user_id: watching.userId as UserId, display_name: watching.displayName }, 'UNASSIGNED' as Role, null));
      return;
    }
    const storedUserId = localStorage.getItem(LS_USER_ID);
    const storedName = localStorage.getItem(LS_DISPLAY_NAME);
    const storedRole = localStorage.getItem(LS_ROLE);
    const storedRoundId = localStorage.getItem(LS_ROUND_ID);
    if (storedUserId && storedName) {
      const uid = Number(storedUserId);
      if (!Number.isNaN(uid)) {
        const role = storedRole === 'INSTRUCTOR' ? ('INSTRUCTOR' as Role) : ('UNASSIGNED' as Role);
        setUser(makeUser({ user_id: uid as UserId, display_name: storedName }, role, null));
        if (role === ('INSTRUCTOR' as Role) && storedRoundId) {
          const rid = Number(storedRoundId);
          if (!Number.isNaN(rid)) setRoundId(rid as RoundId);
        }
      }
    }
  }, []);

  // Professional polling: /v1/session/me + /v1/rounds/active (+ role-specific data)
  useEffect(() => {
    // Start polling only when a user is present (after login/join), and never
    // in demo mode.
    if (!user || demoMode) {
      // ensure no timers are running
      pollAbortRef.current?.abort();
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const poll = async () => {
      pollAbortRef.current?.abort();
      pollAbortRef.current = new AbortController();

      try {
        // Instructors: poll lobby + stats, and ALSO poll /rounds/active so the instructor UI
        // always reflects whether the round is running (even after logout/login).
        if (user.role === ('INSTRUCTOR' as Role)) {
          let effectiveRoundId = roundId;
          let normalizedStatus: 'ACTIVE' | 'ENDED' | 'CONFIGURED' | null = null;
          let isActive = false;
          let round1Status: 'ACTIVE' | 'ENDED' | 'CONFIGURED' | null = null;
          let apiRoundNumber: number | undefined = undefined;
          let r1: any = null;
          let r2: any = null;
          let r1Id: RoundId | null = null;
          let r2Id: RoundId | null = null;
          let r2Status: 'ACTIVE' | 'ENDED' | 'CONFIGURED' | null = null;

          // Prefer /rounds/active to derive round status + correct round id (supports distinct ids per round).
          try {
            const active = await sessionService.activeRound();
            const payload: any = active as any;
            const rounds = Array.isArray(payload?.data?.rounds ?? payload?.rounds ?? active.rounds)
              ? (payload?.data?.rounds ?? payload?.rounds ?? active.rounds)
              : [];
            const pickStatus = (r: any) => normalizeRoundStatus(r?.status);
            r1 = rounds.find((r: any) => Number(r?.round_number) === 1) ?? null;
            r2 = rounds.find((r: any) => Number(r?.round_number) === 2) ?? null;
            round1Status = pickStatus(r1);
            r2Status = pickStatus(r2);
            r1Id = (r1?.id ?? null) as RoundId | null;
            r2Id = (r2?.id ?? null) as RoundId | null;
            if (!cancelled) {
              const ids = { 1: r1Id, 2: r2Id };
              setRoundIds(prev => (prev[1] === ids[1] && prev[2] === ids[2] ? prev : ids));
              const sts = { 1: round1Status, 2: r2Status };
              setRoundStatuses(prev => (prev[1] === sts[1] && prev[2] === sts[2] ? prev : sts));
              const times = roundTimesFrom(r1, r2);
              setRoundTimes(prev => (sameRoundTimes(prev, times) ? prev : times));
            }

            const activeRound = rounds.find((r: any) => pickStatus(r) === 'ACTIVE') ?? null;
            const selectedRound =
              activeRound ??
              (round1Status === 'ENDED' ? r2 : null) ??
              r1 ??
              rounds[0] ??
              null;

            normalizedStatus = pickStatus(selectedRound) ?? 'CONFIGURED';
            isActive = normalizedStatus === 'ACTIVE';
            apiRoundNumber = selectedRound?.round_number as number | undefined;
            const rid = (selectedRound?.id ?? null) as RoundId | null;
            if (rid) {
              effectiveRoundId = rid;
              if (!cancelled && rid !== roundId) setRoundId(rid);
            }

            // Keep instructor UI in sync with backend-controlled round state.
            if (!cancelled) {
              const popupActiveRaw = Boolean(
                (apiRoundNumber === 2 ? selectedRound?.is_popped_active : r2?.is_popped_active) ?? false,
              );
              const popupActive = (apiRoundNumber ?? 1) === 2 && popupActiveRaw;

              setConfig(prev => {
                const baseRound = apiRoundNumber ?? prev.round ?? 1;
                const nextRound = round1Status === 'ENDED' ? 2 : baseRound;
                const nextStartTime =
                  isActive
                    ? (selectedRound?.started_at ? Date.parse(selectedRound.started_at) : prev.startTime ?? Date.now())
                    : null;
                const elapsed =
                  isActive && nextStartTime
                    ? Math.max(0, Math.floor((nowMs() - nextStartTime) / 1000))
                    : prev.elapsedTime;

                // Only trust backend-provided config numbers once the round has started (or ended).
                // Before start, some backends return placeholder values like { customer_budget: 0, batch_size: 1 }.
                const shouldUseBackendConfig = isActive || normalizedStatus === 'ENDED';
                // The budget is read whatever the status: the stored value is real before the start too.
                const nextCustomerBudget = customerBudgetFromRound(selectedRound, prev.customerBudget);
          if (Number(selectedRound?.customer_budget) > 0) storedBudgetRef.current = Number(selectedRound?.customer_budget);
                const nextRound1BatchSize =
                  shouldUseBackendConfig && Number(r1?.batch_size) > 1
                    ? Number(r1?.batch_size)
                    : prev.round1BatchSize;
                const nextRound2BatchLimit =
                  shouldUseBackendConfig && Number((r2 as any)?.max_batch_size ?? (r2 as any)?.MaxBatchSize ?? r2?.batch_size) > 1
                    ? Number((r2 as any)?.max_batch_size ?? (r2 as any)?.MaxBatchSize ?? r2?.batch_size)
                    : (prev.round2BatchLimit ?? DEFAULT_ROUND2_BATCH_LIMIT);
                const nextMarketPrice =
                  shouldUseBackendConfig && Number(selectedRound?.market_price) > 0
                    ? Number(selectedRound?.market_price)
                    : prev.marketPrice ?? DEFAULT_MARKET_PRICE;
                const nextCostOfPublishing =
                  shouldUseBackendConfig && Number((selectedRound as any)?.cost_of_publishing) >= 0
                    ? Number((selectedRound as any)?.cost_of_publishing)
                    : prev.costOfPublishing ?? DEFAULT_COST_OF_PUBLISHING;
                const nextCostOfDiscard =
                  shouldUseBackendConfig && Number((selectedRound as any)?.cost_of_discard) >= 0
                    ? Number((selectedRound as any)?.cost_of_discard)
                    : prev.costOfDiscard ?? DEFAULT_COST_OF_DISCARD;
                return {
                  ...prev,
                  status: isActive ? 'PLAYING' : (round1Status === 'ENDED' ? 'PLAYING' : 'LOBBY'),
                  round: nextRound,
                  isActive,
                  showTeamPopup: popupActive,
                  startTime: nextStartTime,
                  elapsedTime: elapsed,
                  customerBudget: nextCustomerBudget,
                  round1BatchSize: nextRound1BatchSize,
                  round2BatchLimit: nextRound2BatchLimit,
                  marketPrice: nextMarketPrice,
                  costOfPublishing: nextCostOfPublishing,
                  costOfDiscard: nextCostOfDiscard,
                  // Lean settings are read unconditionally (not gated on
                  // shouldUseBackendConfig): the instructor picks them before
                  // start, and a backend without them reads as CLASSIC.
                  ...leanConfigFromRound(selectedRound),
                };
              });
            }
          } catch {
            // ignore; fallback to session/me for round id below
          }

          // Fallback: if we still don't know roundId (e.g., older backends), resolve via /session/me.
          if (!effectiveRoundId) {
            try {
              const me = await sessionService.me();
              if (!cancelled) {
                effectiveRoundId = me.round_id;
                setRoundId(me.round_id);
              }
            } catch (e) {
              // If /session/me fails due to session loss, don't spin forever.
              if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
                logout();
                return;
              }
            }
          }

          if (!effectiveRoundId) return;
          try {
            // Market list for instructor (read-only): supports the instructor Live Market panel.
            // Best-effort; if it fails we keep the last known marketItems.
            try {
              const marketRaw = await customerService.market(effectiveRoundId);
              const market: any = (marketRaw as any)?.data ?? marketRaw;
              const items = (market?.items ?? []) as ApiMarketItem[];
              if (!cancelled) {
                setMarketItems(prev => {
                  if (prev.length !== items.length) return items;
                  for (let i = 0; i < prev.length; i++) {
                    const a = prev[i];
                    const b = items[i];
                    if (
                      a.joke_id !== b.joke_id ||
                      a.team_id !== b.team_id ||
                      Number(a.sold_count ?? 0) !== Number(b.sold_count ?? 0)
                    ) {
                      return items;
                    }
                  }
                  return prev;
                });
              }
            } catch {
              // ignore
            }

            const rawLobby = await instructorService.lobby(effectiveRoundId);
            let stats: any = null;

            // Stats: keep current round stats + also cache per-round stats for Round 1/2 so the UI can
            // view Round 1 stats during Round 2.
            const now = nowMs();
            const shouldFetchStatsForRound = (roundNum: 1 | 2, rid: RoundId | null, st: any) => {
              if (!rid) return false;
              const s = normalizeRoundStatus(st?.status) ?? null;
              // Only bother fetching stats when the round has started or ended (backend may 404/empty otherwise).
              if (!(s === 'ACTIVE' || s === 'ENDED')) return false;
              const last = lastInstructorStatsFetchRef.current[roundNum] ?? 0;
              return now - last >= POLL_INTERVAL_MS; // align with poll interval
            };

            const fetches: Array<Promise<{ roundNum: 1 | 2; raw: any } | null>> = [
              (async () => {
                if (!shouldFetchStatsForRound(1, r1Id, r1)) return null;
                try {
                  const raw = await instructorService.stats(r1Id as RoundId);
                  lastInstructorStatsFetchRef.current[1] = now;
                  return { roundNum: 1, raw };
                } catch {
                  return null;
                }
              })(),
              (async () => {
                if (!shouldFetchStatsForRound(2, r2Id, r2)) return null;
                try {
                  const raw = await instructorService.stats(r2Id as RoundId);
                  lastInstructorStatsFetchRef.current[2] = now;
                  return { roundNum: 2, raw };
                } catch {
                  return null;
                }
              })(),
            ];

            // Always try current round stats if we couldn't resolve per-round ids yet.
            try {
              if (isActive || normalizedStatus === 'ENDED' || normalizedStatus == null) {
                stats = await instructorService.stats(effectiveRoundId);
              }
            } catch {
              // ignore stats failures
            }

            if (!cancelled) {
              const lobbyNormalized = normalizeInstructorLobby(rawLobby, effectiveRoundId);
              setInstructorLobby(lobbyNormalized);
              if (stats) {
                const norm = normalizeInstructorStats((stats as any)?.data ?? stats ?? null);
                setInstructorStats(norm);
                // Also drop into per-round cache if we can infer the round number.
                if (r1Id && norm.round_id === r1Id) {
                  setInstructorStatsByRoundNumber(prev => ({ ...prev, 1: norm }));
                } else if (r2Id && norm.round_id === r2Id) {
                  setInstructorStatsByRoundNumber(prev => ({ ...prev, 2: norm }));
                } else if (apiRoundNumber === 1 || apiRoundNumber === 2) {
                  setInstructorStatsByRoundNumber(prev => ({ ...prev, [apiRoundNumber as 1 | 2]: norm }));
                }
              }

              // Update per-round stats from fetches (if any).
              Promise.all(fetches).then(results => {
                if (cancelled) return;
                const updates: Partial<Record<1 | 2, ApiInstructorStatsResponse>> = {};
                for (const r of results) {
                  if (!r) continue;
                  const norm = normalizeInstructorStats((r.raw as any)?.data ?? r.raw ?? null);
                  updates[r.roundNum] = norm;
                }
                if (Object.keys(updates).length) {
                  setInstructorStatsByRoundNumber(prev => ({ ...prev, ...(updates as any) }));
                }
              });

              // Build roster for instructor drag/drop (teams + customers + unassigned)
              const rosterUsers: User[] = [];
              lobbyNormalized.teams.forEach(t => {
                t.members.forEach(m => {
                  rosterUsers.push(makeUser({ user_id: m.user_id, display_name: m.display_name }, toRole(m.role), t.team.id));
                });
              });
              lobbyNormalized.customers.forEach(c => {
                rosterUsers.push(makeUser({ user_id: c.user_id, display_name: c.display_name }, 'CUSTOMER' as Role, null));
              });
              lobbyNormalized.unassigned.forEach(u => {
                rosterUsers.push(makeUser({ user_id: u.user_id, display_name: u.display_name }, 'UNASSIGNED' as Role, null));
              });
              setRoster(rosterUsers);
            }
          } catch (e) {
            // If the backend wiped the instructor during reset, stop polling and force re-login.
            if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) {
              logout();
              return;
            }
            // otherwise ignore; instructor endpoints will surface errors on action
          }
          return;
        }

        const me = await sessionService.me();
        if (cancelled) return;

        // Determine effective round id from session/me or active round fallback.
        // Some backends may omit round_id from /session/me; use active round id if present.
        const effectiveRoundIdFromMe = me.round_id ?? null;

        let role = toRole(me.assignment.role);
        // Only demote to UNASSIGNED when participant is waiting and not an instructor.
        if (role !== ('INSTRUCTOR' as Role) && me.participant?.status === 'WAITING') {
          role = 'UNASSIGNED' as Role;
        }
        const teamId = role === ('UNASSIGNED' as Role) ? null : me.assignment.team_id;
        const nextUser = makeUser(me.user, role, teamId);

        setUser(prev => {
          if (!prev) return nextUser;
          // IMPORTANT: avoid resetting customer fields (wallet/purchases) to defaults on every poll tick.
          // We treat these as "statistics" and only update them when API values change.
          const keepCustomerFields = role === ('CUSTOMER' as Role);
          const merged: User = {
            ...prev,
            ...nextUser,
            wallet: keepCustomerFields ? prev.wallet : nextUser.wallet,
            purchasedJokes: keepCustomerFields ? prev.purchasedJokes : nextUser.purchasedJokes,
          };
          // avoid re-render storms
          const same =
            prev.user_id === merged.user_id &&
            prev.role === merged.role &&
            prev.team_id === merged.team_id &&
            prev.wallet === merged.wallet &&
            JSON.stringify(prev.purchasedJokes) === JSON.stringify(merged.purchasedJokes);
          return same ? prev : merged;
        });

        // If user is still unassigned, skip rounds/active call to avoid noise in waiting room.
        if (role === ('UNASSIGNED' as Role)) {
          setConfig(prev => ({
            ...prev,
            status: 'LOBBY',
            isActive: false,
            startTime: null,
            elapsedTime: 0,
          }));
          return;
        }

        const active = await sessionService.activeRound();
        if (cancelled) return;

        const activePayload: any = active as any;
        const rounds = Array.isArray(activePayload?.data?.rounds ?? active.rounds)
          ? (activePayload?.data?.rounds ?? active.rounds)
          : [];
        const pickStatus = (r: any) => normalizeRoundStatus(r?.status);
        const r1 = rounds.find(r => Number(r?.round_number) === 1) ?? null;
        const r2 = rounds.find(r => Number(r?.round_number) === 2) ?? null;
        const round1Status = pickStatus(r1);
        // Both rounds' statuses, so a student screen can tell "between rounds" from "class over".
        const sts = { 1: round1Status, 2: pickStatus(r2) };
        setRoundStatuses(prev => (prev[1] === sts[1] && prev[2] === sts[2] ? prev : sts));
        const times = roundTimesFrom(r1, r2);
        setRoundTimes(prev => (sameRoundTimes(prev, times) ? prev : times));

        const activeRound = rounds.find(r => pickStatus(r) === 'ACTIVE') ?? null;
        // If nothing is ACTIVE, prefer Round 2 once Round 1 has ended.
        const selectedRound =
          activeRound ??
          (round1Status === 'ENDED' ? r2 : null) ??
          r1 ??
          rounds[0] ??
          null;

        const effectiveRoundId =
          (selectedRound?.id as RoundId | undefined) ??
          effectiveRoundIdFromMe ??
          roundId;
        if (effectiveRoundId && effectiveRoundId !== roundId) {
          setRoundId(effectiveRoundId);
        } else if (effectiveRoundIdFromMe && roundId == null) {
          setRoundId(effectiveRoundIdFromMe);
        }
        const apiRoundNumber = selectedRound?.round_number as number | undefined;
        const normalizedStatus = pickStatus(selectedRound) ?? 'CONFIGURED';
        const isActive = normalizedStatus === 'ACTIVE';

        // Backend-controlled Round 2 team popup flag.
        const popupActiveRaw = Boolean(
          (apiRoundNumber === 2 ? selectedRound?.is_popped_active : r2?.is_popped_active) ?? false,
        );
        const popupActive = (apiRoundNumber ?? 1) === 2 && popupActiveRaw;

        setConfig(prev => {
          const baseRound = apiRoundNumber ?? prev.round ?? 1;
          // Auto-advance UI: after Round 1 is ENDED, default to Round 2 even before it becomes ACTIVE.
          const nextRound = round1Status === 'ENDED' ? 2 : baseRound;
          const nextStartTime =
            isActive
              ? (selectedRound?.started_at ? Date.parse(selectedRound.started_at) : prev.startTime ?? Date.now())
              : null;
          const elapsed =
            isActive && nextStartTime
              ? Math.max(0, Math.floor((nowMs() - nextStartTime) / 1000))
              : prev.elapsedTime;

          // Only trust backend-provided config numbers once the round has started (or ended).
          // Before start, some backends return placeholder values like { customer_budget: 0, batch_size: 1 }.
          const shouldUseBackendConfig = isActive || normalizedStatus === 'ENDED';
          const nextCustomerBudget = customerBudgetFromRound(selectedRound, prev.customerBudget);
          if (Number(selectedRound?.customer_budget) > 0) storedBudgetRef.current = Number(selectedRound?.customer_budget);
          const nextRound1BatchSize =
            shouldUseBackendConfig && Number(r1?.batch_size) > 1
              ? Number(r1?.batch_size)
              : prev.round1BatchSize;
          const nextRound2BatchLimit =
            shouldUseBackendConfig && Number((r2 as any)?.max_batch_size ?? (r2 as any)?.MaxBatchSize ?? r2?.batch_size) > 1
              ? Number((r2 as any)?.max_batch_size ?? (r2 as any)?.MaxBatchSize ?? r2?.batch_size)
              : (prev.round2BatchLimit ?? DEFAULT_ROUND2_BATCH_LIMIT);
          const nextMarketPrice =
            shouldUseBackendConfig && Number(selectedRound?.market_price) > 0
              ? Number(selectedRound?.market_price)
              : prev.marketPrice ?? DEFAULT_MARKET_PRICE;
          const nextCostOfPublishing =
            shouldUseBackendConfig && Number((selectedRound as any)?.cost_of_publishing) >= 0
              ? Number((selectedRound as any)?.cost_of_publishing)
              : prev.costOfPublishing ?? DEFAULT_COST_OF_PUBLISHING;
          const nextCostOfDiscard =
            shouldUseBackendConfig && Number((selectedRound as any)?.cost_of_discard) >= 0
              ? Number((selectedRound as any)?.cost_of_discard)
              : prev.costOfDiscard ?? DEFAULT_COST_OF_DISCARD;
          return {
            ...prev,
            status: isActive ? 'PLAYING' : (round1Status === 'ENDED' ? 'PLAYING' : 'LOBBY'),
            round: nextRound,
            isActive,
            showTeamPopup: popupActive,
            startTime: nextStartTime,
            elapsedTime: elapsed,
            customerBudget: nextCustomerBudget,
            round1BatchSize: nextRound1BatchSize,
            round2BatchLimit: nextRound2BatchLimit,
            marketPrice: nextMarketPrice,
            costOfPublishing: nextCostOfPublishing,
            costOfDiscard: nextCostOfDiscard,
            // Lean settings of the current round; CLASSIC when absent.
            ...leanConfigFromRound(selectedRound),
          };
        });

        // Role-specific data
        if (role === ('INSTRUCTOR' as Role)) {
          try {
            const rawLobby = await instructorService.lobby(me.round_id);
            let stats: any = null;
            // NOTE: do not depend on React state `config` here; this polling closure
            // does not re-bind on config changes. Use the freshly computed round status
            // from this poll cycle (isActive / normalizedStatus).
            if (isActive || normalizedStatus === 'ENDED') {
              try {
                stats = await instructorService.stats(me.round_id);
              } catch {
                // ignore stats failures; keep lobby data
              }
            }
            if (!cancelled) {
              const lobbyNormalized = normalizeInstructorLobby(rawLobby, me.round_id);
              setInstructorLobby(lobbyNormalized);
              if (stats) setInstructorStats(normalizeInstructorStats((stats as any)?.data ?? stats ?? null));

              // Build roster for instructor drag/drop (teams + customers + unassigned)
              const rosterUsers: User[] = [];
              lobbyNormalized.teams.forEach(t => {
                t.members.forEach(m => {
                  rosterUsers.push(makeUser({ user_id: m.user_id, display_name: m.display_name }, toRole(m.role), t.team.id));
                });
              });
              lobbyNormalized.customers.forEach(c => {
                rosterUsers.push(makeUser({ user_id: c.user_id, display_name: c.display_name }, 'CUSTOMER' as Role, null));
              });
              lobbyNormalized.unassigned.forEach(u => {
                rosterUsers.push(makeUser({ user_id: u.user_id, display_name: u.display_name }, 'UNASSIGNED' as Role, null));
              });
              setRoster(rosterUsers);
            }
          } catch {
            // ignore; instructor endpoints will surface errors on action
          }
        } else if (role === ('JOKE_MAKER' as Role) && me.assignment.team_id) {
          const effectiveRound = effectiveRoundId ?? me.round_id ?? null;
          if (!effectiveRound) {
            // cannot fetch team data without round id; wait for next poll
            return;
          }
          // Avoid spamming endpoints that require an ACTIVE round.
          // Also allow ENDED so teams can still view history where supported.
          const canFetchTeamData = isActive || normalizedStatus === 'ENDED';
          if (!canFetchTeamData) {
            // Still allow Round 2 popup roster to show teammates even when round isn't active.
            if (!cancelled) {
              if (popupActive) {
                const teammates = Array.isArray(me.teammates) ? me.teammates : [];
                const users: User[] = [
                  nextUser,
                  ...teammates.map(t =>
                    makeUser(
                      { user_id: Number(t.user_id) as UserId, display_name: String(t.display_name ?? '') },
                      toRole(t.role),
                      me.assignment.team_id as TeamId,
                    ),
                  ),
                ];
                setRoster(users);
              } else {
                setRoster([nextUser]);
              }
            }
            return;
          }
          try {
            const listPromise = jmService.listTeamBatches(effectiveRound, me.assignment.team_id);
            const summaryPromise = teamSummaryUnsupportedRef.current
              ? Promise.resolve(null)
              : jmService.teamSummary(effectiveRound, me.assignment.team_id);
            const [summaryRaw, listRaw] = await Promise.all([summaryPromise, listPromise]);
            if (!cancelled) {
              const summaryData: any = summaryRaw ? ((summaryRaw as any)?.data ?? summaryRaw) : null;
              const listData: any = (listRaw as any)?.data ?? listRaw;
              const batchesArr: any[] = Array.isArray(listData?.batches) ? listData.batches : [];

              if (summaryData) setTeamSummary(summaryData as any);
              const roundNumber = apiRoundNumber ?? config.round ?? 1;
              const mapped = batchesArr.map(b =>
                mapBatchFromTeamList(
                  roundNumber,
                  me.assignment.team_id!,
                  b,
                  submittedBatchJokesRef.current[`${effectiveRound}:${String(b.batch_id)}`],
                ),
              );
              // Merge QC-rated history (if any) so JM can still see feedback in same session.
              // Process qcExtra first, then mapped overwrites - so API data (is_published, sold_count) wins
              const qcExtra = Object.values(qcRatedHistoryRef.current).filter((b: Batch) => b.team_id === me.assignment.team_id);
              const merged = [...qcExtra, ...mapped].reduce<Record<string, Batch>>((acc, b: Batch) => {
                const existing = acc[String(b.batch_id)];
                if (existing) {
                  // Merge: API data wins, but keep local feedback/tags if API doesn't have them
                  acc[String(b.batch_id)] = {
                    ...existing,
                    ...b,
                    feedback: b.feedback ?? existing.feedback,
                    tagSummary: b.tagSummary?.length ? b.tagSummary : existing.tagSummary,
                  };
                } else {
                  acc[String(b.batch_id)] = b;
                }
                return acc;
              }, {} as Record<string, Batch>);
              setBatches(Object.values(merged).sort((a, b) => (a.batch_id - b.batch_id)));
            }
          } catch (e) {
            // If backend doesn't implement team summary, stop calling it.
            if (e instanceof ApiError && (e.status === 404 || e.code === 'NOT_FOUND')) {
              teamSummaryUnsupportedRef.current = true;
            }
            // ignore; action will surface
          }

          /* No customer feedback for the Joke Maker: it is Marketing-only (see
             TEAM_FEEDBACK_ROLES). The Joke Maker hears from Marketing instead. */

          // Round 2: show team popup members when backend says popup is active.
          if (popupActive) {
            // Use /session/me teammates to populate popup (no lobby fetch).
            const teammates = Array.isArray(me.teammates) ? me.teammates : [];
            if (!cancelled) {
              const users: User[] = [
                nextUser,
                ...teammates.map(t =>
                  makeUser(
                    { user_id: Number(t.user_id) as UserId, display_name: String(t.display_name ?? '') },
                    toRole(t.role),
                    me.assignment.team_id as TeamId,
                  ),
                ),
              ];
              setRoster(users.length ? users : [nextUser]);
            }
          } else {
            // Default: keep roster minimal (self only)
            setRoster([nextUser]);
          }
        } else if (role === ('QUALITY_CONTROL' as Role)) {
          const effectiveRound = effectiveRoundId ?? me.round_id ?? null;
          if (!effectiveRound) {
            setQcQueue(null);
            setQcQueueSize(null);
            return;
          }
          // Avoid spamming endpoints that require an ACTIVE round.
          const canFetchQcWork = isActive || normalizedStatus === 'ENDED';
          if (!canFetchQcWork) {
            if (!cancelled) { setQcQueue(null); setQcQueueSize(null); }
            // Still allow popup roster + local rated history.
            if (!cancelled) {
              const hist = Object.values(qcRatedHistoryRef.current);
              setBatches(hist);
              if (popupActive) {
                const popupTeamId = (me.assignment.team_id ?? null) as TeamId | null;
                const teammates = Array.isArray(me.teammates) ? me.teammates : [];
                const users: User[] = [
                  nextUser,
                  ...teammates.map(t =>
                    makeUser(
                      { user_id: Number(t.user_id) as UserId, display_name: String(t.display_name ?? '') },
                      toRole(t.role),
                      (popupTeamId ?? null) as TeamId,
                    ),
                  ),
                ];
                setRoster(users.length ? users : [nextUser]);
              } else {
                setRoster([nextUser]);
              }
            }
            return;
          }
          // QC queue (live work), team summary, feedback and batch history: one Marketing tick.
          const { summaryTeamId, didHydrateBatchesFromApi } = await pollMarketingWork({
            io: MARKETING_POLL_IO,
            role,
            roundId: effectiveRound as RoundId,
            roundNumber: apiRoundNumber ?? config.round ?? 1,
            teamId: (me.assignment?.team_id ?? null) as TeamId | null,
            mayClaim: () => mayClaimMarketingBatch(teamId),
            isCancelled: () => cancelled,
            refs: {
              qcQueue: qcQueueRef,
              qcNextRetryAfter: qcNextRetryAfterRef,
              qcNextFetchedAt: qcNextFetchedAtRef,
              qcQueueGen: qcQueueGenRef,
              teamSummaryUnsupported: teamSummaryUnsupportedRef,
              teamFeedbackUnsupported: teamFeedbackUnsupportedRef,
              submittedBatchJokes: submittedBatchJokesRef,
              qcRatedHistory: qcRatedHistoryRef,
            },
            set: {
              queue: setQcQueue,
              queueSize: setQcQueueSize,
              teamSummary: setTeamSummary,
              teamFeedback: setTeamFeedback,
              batches: setBatches,
            },
          });

          if (popupActive) {
            const popupTeamId = (summaryTeamId ?? me.assignment.team_id ?? null) as TeamId | null;
            // Use /session/me teammates to populate popup (no lobby fetch).
            const teammates = Array.isArray(me.teammates) ? me.teammates : [];
            if (!cancelled) {
              const users: User[] = [
                nextUser,
                ...teammates.map(t =>
                  makeUser(
                    { user_id: Number(t.user_id) as UserId, display_name: String(t.display_name ?? '') },
                    toRole(t.role),
                    (popupTeamId ?? null) as TeamId,
                  ),
                ),
              ];
              setRoster(users.length ? users : [nextUser]);
            }
          } else {
            setRoster([nextUser]);
          }

          // Fallback: if API list isn't available, keep local rated history visible in QC UI.
          if (!cancelled && !didHydrateBatchesFromApi) {
            const hist = Object.values(qcRatedHistoryRef.current);
            setBatches(hist);
          }
        }
      } catch (e) {
        // If session/me fails because user is not found, clear session so user can re-join lobby.
        if (e instanceof ApiError && e.status === 404) {
          logout();
          return;
        }
        // Otherwise ignore transient errors; user can retry.
      }
    };

    poll();

    const startTimer = () => {
      if (pollTimerRef.current) return;
      pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    };
    const stopTimer = () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        poll();
        startTimer();
      } else {
        stopTimer();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'visible') startTimer();

    return () => {
      cancelled = true;
      pollAbortRef.current?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
      stopTimer();
    };
  }, [user?.user_id, user?.role, roundId]);

  // Timer Logic
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (config.isActive) {
      timer = setInterval(() => {
        setConfig(prev => {
          if (!prev.startTime) return prev;
          const nextElapsed = Math.max(0, Math.floor((nowMs() - prev.startTime) / 1000));
          if (nextElapsed === prev.elapsedTime) return prev;
          return { ...prev, elapsedTime: nextElapsed };
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [config.isActive, config.startTime]);

  const login = async (name: string, _role: Role) => {
    const display_name = name.trim();
    if (!display_name) return;
    try {
      const joined = await sessionService.join({ display_name });
      localStorage.setItem(LS_USER_ID, String(joined.user.user_id));
      localStorage.setItem(LS_DISPLAY_NAME, joined.user.display_name);
      localStorage.setItem(LS_ROLE, 'UNASSIGNED');
      localStorage.removeItem(LS_ROUND_ID);

      // Immediately set local user to unblock router; polling will hydrate assignment.
      const next = makeUser(joined.user, 'UNASSIGNED' as Role, null);
      setUser(next);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.code === 'NAME_TAKEN') {
        alert('Name already taken. Please choose a different display name.');
        return;
      }
      alert('Failed to join session. Please try again.');
    }
  };

  const instructorLogin = async (displayName: string, password: string) => {
    const display_name = displayName.trim();
    if (!display_name || !password.trim()) return;
    try {
      const resp = await instructorService.login({ display_name, password });
      localStorage.setItem(LS_USER_ID, String(resp.user.user_id));
      localStorage.setItem(LS_DISPLAY_NAME, resp.user.display_name);
      localStorage.setItem(LS_ROLE, 'INSTRUCTOR');
      localStorage.setItem(LS_ROUND_ID, String(resp.round_id));
      const next = makeUser(
        { user_id: resp.user.user_id as UserId, display_name: resp.user.display_name },
        'INSTRUCTOR' as Role,
        null,
      );
      setUser(next);
      setRoundId(resp.round_id);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) {
          alert('Incorrect password or instructor access not configured.');
          return;
        }
        if (e.status === 400) {
          alert('Invalid login payload.');
          return;
        }
      }
      alert('Failed to login as instructor.');
    }
  };

  const logout = () => {
    // stop polling immediately
    pollAbortRef.current?.abort();
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    setUser(null);
    // No-op in a watch tab: this runs on a 404 from /session/me, so removing a
    // bot while watching it would otherwise log the instructor out everywhere.
    clearPersisted([LS_USER_ID, LS_DISPLAY_NAME, LS_ROLE, LS_ROUND_ID]);
    setRoundId(null);
    setConfig(initialConfig());
    setRoster([]);
    setBatches([]);
    setMarketItems([]);
    setTeamSummary(null);
    setTeamFeedback(null);
    /* Clear the "route missing" latches too. They exist to stop hammering a
       backend that 404s, not to remember a verdict for the rest of the page's
       life — a latch tripped before a route existed must not outlive the
       session it was tripped in. */
    teamSummaryUnsupportedRef.current = false;
    teamFeedbackUnsupportedRef.current = false;
    roundConfigUnsupportedRef.current = false;
    setInstructorLobby(null);
    setInstructorStats(null);
    setInstructorStatsByRoundNumber({ 1: null, 2: null });
    setRoundIds({ 1: null, 2: null });
    setRoundStatuses({ 1: null, 2: null });
    setRoundTimes(EMPTY_ROUND_TIMES);
    setQcQueue(null);
    setQcQueueSize(null);

    // Clear local caches (avoid leaking state across users).
    submittedBatchJokesRef.current = {};
    qcRatedHistoryRef.current = {};
    clearPersisted([LS_SUBMITTED_BATCH_JOKES, LS_QC_RATED_HISTORY]);
  };

  const updateConfig = async (updates: Partial<GameConfig>): Promise<ConfigSaveResult> => {
    const previous = config;
    configEditSeqRef.current += 1;
    setConfig(prev => ({ ...prev, ...updates }));

    // Client-only knobs: the marketing nudge timers are React state by design and have no
    // backend column. Everything else is a real round parameter and must be persisted, or
    // the instructor's settings are silently discarded (they were, until now).
    if (!roundId || !user || user.role !== ('INSTRUCTOR' as Role)) return { saved: true, feeRounds: [] };

    const otherBody: Record<string, unknown> = {};
    if (updates.customerBudget !== undefined) otherBody.customer_budget = updates.customerBudget;
    if (updates.marketPrice !== undefined) otherBody.market_price = updates.marketPrice;
    if (updates.costOfPublishing !== undefined) otherBody.cost_of_publishing = updates.costOfPublishing;
    if (updates.costOfDiscard !== undefined) otherBody.cost_of_discard = updates.costOfDiscard;
    if (updates.idealProfile !== undefined) otherBody.ideal_profile = updates.idealProfile;
    // One rule set and one set of fees for both rounds (spec §1): a Lean edit goes to every
    // round still CONFIGURED, the selected one included; a started round stays locked.
    const leanBody = leanConfigToBody(updates) as Record<string, unknown>;

    if (Object.keys(otherBody).length === 0 && Object.keys(leanBody).length === 0) return { saved: true, feeRounds: [] };

    const currentNumber = roundIds[1] === roundId ? 1 : roundIds[2] === roundId ? 2 : null;
    const result = await saveRoundConfig({
      current: roundId, currentNumber, otherBody, leanBody,
      targets: leanTargetRounds(roundId, roundIds, roundStatuses),
      send: async (id, body) => {
        const res: any = await instructorService.updateRoundConfig(id as RoundId, body);
        // Fallback: the public round now carries customers_per_team and the poll reads it; the config response (the instructor
        // round) is the only place the stored value comes back, so keep it for the field.
        const stored = res?.data?.round?.customers_per_team ?? res?.round?.customers_per_team;
        if (id === roundId && typeof stored === 'number' && Number.isFinite(stored)) {
          setConfig(prev => (prev.customersPerTeam === stored ? prev : { ...prev, customersPerTeam: stored }));
        }
        return res;
      },
    });
    if (result.error == null) return { saved: true, feeRounds: result.feeRounds };

    const e = result.error;
    console.error('Failed to persist round config', e);
    if (!result.currentSaved) {
      // The server refused (or never saw) these values: put back what was on screen before,
      // for the persisted fields only. Client-only knobs (nudge timers) were never sent.
      const persistedKeys = (Object.keys(updates) as (keyof GameConfig)[]).filter(
        k => PERSISTED_CONFIG_KEYS.has(k) || Object.keys(leanConfigToBody({ [k]: updates[k] } as Partial<GameConfig>)).length > 0,
      );
      if (persistedKeys.length > 0) {
        setConfig(prev => {
          const next = { ...prev };
          for (const k of persistedKeys) (next as Record<string, unknown>)[k] = previous[k];
          return next;
        });
      }
    }
    alert(isMarketModeLocked(e) ? MARKET_MODE_LOCKED_TEXT : configSaveErrorText(e));
    return { saved: result.currentSaved, feeRounds: result.feeRounds };
  };

  // --- LOBBY & TEAM FORMATION LOGIC ---

  const formTeams = async () => {
    if (!roundId) return;
    if (!user || user.role !== ('INSTRUCTOR' as Role)) return;

    // One account per seat: a "user" here is a student pair (App.tsx normalises two names
    // into one key), and each team is 1 JM + 1 Marketing. Human customers are gone, so
    // there is nothing to set aside — the backend ignores customer_count entirely
    // (dto.AssignRequest is {team_count} only) and pushes any surplus account back to
    // WAITING (usecase/instructor.go:175-186).
    const assignable = roster.filter(u => u.role !== ('INSTRUCTOR' as Role)).length;
    const teamCount = Math.floor(assignable / 2);
    if (teamCount <= 0) {
      alert('At least 2 participants are needed to form a team.');
      return;
    }

    try {
      await instructorService.autoAssign(roundId, { team_count: teamCount });
      await updateConfig({ status: 'PLAYING' });
    } catch {
      alert('Failed to auto-assign teams. Please try again.');
    }
  };

  const resetToLobby = () => {
    // Best-effort: instructor can move everyone back to WAITING by patching status only.
    // (Schema doesn’t specify a full “reset round” endpoint.)
    if (!roundId || !user || user.role !== ('INSTRUCTOR' as Role)) {
      setConfig(prev => ({ ...prev, status: 'LOBBY', isActive: false, elapsedTime: 0 }));
      return;
    }

    (async () => {
      try {
        // Go's lobby is PascalCase with null rosters when empty: read it through the normalizer.
        const lobby = normalizeInstructorLobby(await instructorService.lobby(roundId), roundId);
        const userIds: UserId[] = [];
        lobby.teams.forEach(t => t.members.forEach(m => userIds.push(m.user_id)));
        lobby.customers.forEach(c => userIds.push(c.user_id));

        await Promise.all(userIds.map(uid => instructorService.patchUser(roundId, uid, { status: 'WAITING' })));
        setConfig(prev => ({ ...prev, status: 'LOBBY', isActive: false, elapsedTime: 0 }));
        setBatches([]);
        setMarketItems([]);
      } catch {
        alert('Failed to reset to lobby.');
      }
    })();
  };

  // ------------------------------------

  const updateTeamName = (teamNum: string, name: string) => {
    const newNames = { ...teamNames, [teamNum]: name };
    setTeamNames(newNames);
    // No team rename endpoint provided in schema; keep local-only to avoid UI changes.
  };
  
  const updateUser = async (userId: string, updates: Partial<User>) => {
    if (!roundId) return;
    if (!user) return;
    const isInstructor = user.role === ('INSTRUCTOR' as Role);
    const isSelf = Number(userId) === user.user_id;
    // Allow the current user to switch their own role/team in mock/demo mode (even if not
    // instructor), so you can jump between the JM and Marketing views during local demos.
    // The Customer view is reached via DevRoleSwitcher, which writes the mock DB directly.
    if (!isInstructor && !(isMockModeEnabled() && isSelf)) return;
    const uid = Number(userId) as UserId;

    // There is no human Customer seat to assign any more - customers are simulated - and the
    // backend has no CUSTOMER role, so this PATCH is a guaranteed 400 VALIDATION_ERROR
    // "unsupported role" (usecase/instructor.go:207-218, reproduced against a live server).
    // views/Instructor.tsx:797 still offers a Customer drop zone; refuse here rather than fire
    // a request we know fails, and rather than omit the role, which would make the backend
    // silently keep the user's existing one. The dev route to views/Customer.tsx is
    // DevRoleSwitcher, which writes the mock DB directly and does not come through here.
    if (updates.role === ('CUSTOMER' as Role)) {
      alert('Customers are simulated in this version, so there is no Customer seat to assign.');
      return;
    }

    const role = toApiRole(updates.role);

    const status =
      updates.role === ('UNASSIGNED' as Role) ? 'WAITING'
      : updates.role ? 'ASSIGNED'
      : undefined;
    const team_id = updates.team && updates.team !== 'N/A' ? (Number(updates.team) as TeamId) : undefined;

    try {
      await instructorService.patchUser(roundId, uid, {
        status,
        role,
        team_id: updates.team === 'N/A' ? null : team_id,
      });
    } catch {
      alert('Failed to update user assignment.');
    }
  };

  const deleteUser = async (userId: string) => {
    if (!roundId) return;
    if (!user || user.role !== ('INSTRUCTOR' as Role)) return;
    const uid = Number(userId);
    if (!Number.isFinite(uid)) return;

    try {
      await instructorService.deleteUser(roundId, uid as UserId);
      // Optimistic removal; poll will re-sync.
      setRoster(prev => prev.filter(u => Number(u.id) !== uid));
      setInstructorLobby(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          teams: prev.teams.map(t => ({ ...t, members: t.members.filter(m => m.user_id !== (uid as UserId)) })),
          customers: prev.customers.filter(c => c.user_id !== (uid as UserId)),
          unassigned: prev.unassigned.filter(u => u.user_id !== (uid as UserId)),
        };
      });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 404) {
          alert('User not found (may have already been deleted).');
          return;
        }
        if (e.status === 409) {
          alert('Cannot delete an instructor account.');
          return;
        }
        if (e.status === 400) {
          alert('Invalid user id.');
          return;
        }
      }
      alert('Failed to delete user.');
    }
  };

  const addBatch = async (jokeContents: string[]) => {
    if (!user || !roundId || !user.team_id) return;
    // Round 2: enforce max batch size (UI also enforces, but this guards refresh/paste edge cases).
    if (config.round === 2 && jokeContents.length > config.round2BatchLimit) {
      alert(`Round 2 allows up to ${config.round2BatchLimit} jokes per batch.`);
      return;
    }

    try {
      const created = await jmService.createBatch(roundId, { team_id: user.team_id, jokes: jokeContents });
      const createdBatch: any = (created as any)?.data?.batch ?? (created as any)?.batch ?? created;
      // Cache joke text for UI history.
      submittedBatchJokesRef.current[`${roundId}:${String(createdBatch.batch_id)}`] = jokeContents;
      try {
        localStorage.setItem(LS_SUBMITTED_BATCH_JOKES, JSON.stringify(submittedBatchJokesRef.current));
      } catch {
        // ignore
      }
      // Trigger refresh: rely on poll; also do a quick local update for responsiveness.
      const batch: Batch = {
        batch_id: createdBatch.batch_id,
        round_id: createdBatch.round_id,
        team_id: createdBatch.team_id,
        status: createdBatch.status,
        jokes: jokeContents.map((txt, idx) => {
          const fakeJokeId = Number(`${createdBatch.batch_id}${idx}`) as JokeId;
          return { joke_id: fakeJokeId, joke_text: txt, id: String(fakeJokeId), content: txt };
        }),
        submitted_at: createdBatch.submitted_at,
        id: String(createdBatch.batch_id),
        team: String(createdBatch.team_id),
        round: config.round,
        submittedAt: createdBatch.submitted_at ? Date.parse(createdBatch.submitted_at) : undefined,
      };
      setBatches(prev => [...prev.filter(b => b.batch_id !== batch.batch_id), batch]);
    } catch (e) {
      // Lean market mode: Marketing already has wip_limit batches waiting.
      if (e instanceof ApiError && isWipLimitReached(e)) {
        alert(WIP_LIMIT_TEXT);
        return;
      }
      if (e instanceof ApiError) {
        if (e.status === 409 && e.code === 'ROUND_NOT_ACTIVE') {
          alert('Round is not active. Please wait for the instructor to start.');
          return;
        }
        if (e.status === 400 && e.code === 'INVALID_BATCH_SIZE') {
          alert('Invalid batch size for this round.');
          return;
        }
      }
      alert('Failed to submit batch.');
    }
  };

  // V2: JM submits a raw text blob; Marketing splits it later.
  const submitRawBatch = async (rawText: string): Promise<boolean> => {
    if (!user || !roundId || !user.team_id) return false;
    const text = rawText.trim();
    if (!text) return false;
    try {
      await jmService.createBatch(roundId, { team_id: user.team_id, raw_text: text });
      // Rely on poll to surface the new batch; no optimistic joke list (unsplit).
      return true;
    } catch (e) {
      // Lean market mode: Marketing already has wip_limit batches waiting.
      if (e instanceof ApiError && isWipLimitReached(e)) {
        alert(WIP_LIMIT_TEXT);
        return false;
      }
      if (e instanceof ApiError && e.status === 409 && e.code === 'ROUND_NOT_ACTIVE') {
        alert('Round is not active. Please wait for the instructor to start.');
        return false;
      }
      alert('Failed to submit batch.');
      return false;
    }
  };

  // V2: Marketing splits a raw-text batch into individual jokes.
  const splitBatch = async (batchId: string, jokes: string[]) => {
    const clean = jokes.map(j => j.trim()).filter(Boolean);
    if (clean.length === 0) return;
    qcQueueGenRef.current += 1;
    try {
      const updated = await marketingService.splitBatch(Number(batchId) as BatchId, { jokes: clean });
      const q: any = (updated as any)?.data ?? updated;
      qcQueueGenRef.current += 1;
      if (q && q.batch) {
        qcNextFetchedAtRef.current = Date.now(); // the desk holds this answer, so no immediate re-ask
        setQcQueue(q as ApiQcQueueNextResponse);
      }
    } catch (e) {
      alert('Failed to split batch.');
    }
  };

  // V2: Marketing re-opens a split batch back into the splitting phase.
  const unsplitBatch = async (batchId: string) => {
    qcQueueGenRef.current += 1;
    try {
      const updated = await marketingService.unsplitBatch(Number(batchId) as BatchId);
      const q: any = (updated as any)?.data ?? updated;
      qcQueueGenRef.current += 1;
      if (q && q.batch) {
        qcNextFetchedAtRef.current = Date.now(); // the desk holds this answer, so no immediate re-ask
        setQcQueue(q as ApiQcQueueNextResponse);
      }
    } catch (e) {
      alert('Failed to reopen batch for splitting.');
    }
  };

  /* Replaces `rateBatch`. V2 deleted the rating model outright — no joke_ratings
     table, no avg_score, no /ratings route — so Marketing now states an explicit
     per-joke decision instead of scoring jokes and letting the server infer which
     ones ship.

     The old body also mirrored the batch into `qcRatedHistoryRef` + localStorage
     and pushed it through setBatches. That is deliberately NOT carried over:
       - `batches` is re-hydrated from jmService.listTeamBatches on the 2.5s poll,
         and that API data already wins over the local copy in every merge, so the
         published batch reappears on its own with real is_published / sold_count.
       - The local copy's only unique fields were `feedback` and `tagSummary`,
         which no longer exist on either side of the wire.
     Stale entries written by earlier builds are still merged on hydration and
     still cleared by resetGame, so nothing breaks for an existing session. */
  const publishBatch = async (
    batchId: string,
    publishedIds: number[],
    jokeTitles: { [jokeId: string]: string },
    note = '',
  ): Promise<boolean> => {
    if (!roundId) return false;
    const bid = Number(batchId) as BatchId;
    const active = qcQueue?.batch?.batch_id === bid ? qcQueue : null;
    if (!active) return false;

    // One decision per joke in the batch, plus Marketing's note when it has any
    // text — see buildPublishBody.
    const body = buildPublishBody(active.jokes ?? [], publishedIds, jokeTitles, note);

    qcQueueGenRef.current += 1;
    try {
      await marketingService.publish(bid, body);
      qcQueueGenRef.current += 1;
      qcNextFetchedAtRef.current = 0; // the desk is empty, so the next tick asks for the next batch
      setQcQueue(null);
      setQcQueueSize(queueSizeAfterRelease); // the released batch no longer waits; the next queue/count corrects it
      return true;
    } catch (e) {
      // The batch stays claimed and the desk keeps its decisions and note, so the
      // marketer can fix the problem and release again. A note over 500
      // characters shows the server's own message (publishFailureMessage).
      alert(publishFailureMessage(e));
      return false;
    }
  };

  const setRound = (round: number) => {
    // Allow instructor to toggle Round 1/2 manually (e.g. during Lobby/Config).
    // If a round is ACTIVE, polling will likely revert this to the active round, which is intended.
    const next = round === 2 ? 2 : 1;
    setConfig(prev => ({ ...prev, round: next }));

    // In mock mode, also notify the mock backend
    if (isMockModeEnabled()) {
      try {
        setMockRoundNumber(next as 1 | 2);
      } catch {
        // ignore
      }
    }
  };

  const ensureInstructorRoundId = async (): Promise<RoundId | null> => {
    if (roundId) return roundId;
    if (!user || user.role !== ('INSTRUCTOR' as Role)) return null;
    try {
      const me = await sessionService.me();
      if (me?.round_id) {
        setRoundId(me.round_id);
        return me.round_id;
      }
    } catch {
      // ignore
    }
    return null;
  };

  const ensureInstructorRoundIdForRoundNumber = async (roundNumber: number): Promise<RoundId | null> => {
    if (!user || user.role !== ('INSTRUCTOR' as Role)) return null;
    // Prefer resolving by round_number from /v1/rounds/active (supports separate ids for round 1 vs round 2).
    try {
      const active = await sessionService.activeRound();
      const payload: any = active as any;
      const rounds = Array.isArray(payload?.data?.rounds ?? payload?.rounds) ? (payload?.data?.rounds ?? payload?.rounds) : [];
      const match = rounds.find((r: any) => Number(r?.round_number) === Number(roundNumber));
      const rid = (match?.id ?? null) as RoundId | null;
      if (rid) {
        setRoundId(rid);
        return rid;
      }
    } catch {
      // ignore
    }

    // Fallback: use session/me (older backends).
    return await ensureInstructorRoundId();
  };

  const setGameActive = async (isActive: boolean) => {
    // Backend schema supports start/end (no pause). We map `Start` to /start.
    // `Pause` remains local-only until backend supports a pause endpoint.
    if (!user || user.role !== ('INSTRUCTOR' as Role)) {
      setConfig(prev => ({ ...prev, isActive }));
      return;
    }
    const rid = isActive ? await ensureInstructorRoundIdForRoundNumber(config.round) : await ensureInstructorRoundId();
    if (!rid) {
      alert('Missing round id; please refresh and try again.');
      return;
    }
    try {
      if (isActive) {
        const batch_size = config.round === 2 ? config.round2BatchLimit : config.round1BatchSize;
        const customer_budget = config.customerBudget;
        const market_price = config.marketPrice;
        const cost_of_publishing = config.costOfPublishing;
        // Prevent sending obviously invalid defaults (some backends report 0/1 before start).
        if (!Number.isFinite(customer_budget) || customer_budget <= 0) {
          alert('Customer budget must be greater than 0.');
          return;
        }
        if (!Number.isFinite(batch_size) || batch_size <= 1) {
          alert('Batch size must be at least 2.');
          return;
        }
        if (!Number.isFinite(market_price) || market_price <= 0) {
          alert('Market Price must be greater than 0.');
          return;
        }
        if (!Number.isFinite(cost_of_publishing) || cost_of_publishing < 0) {
          alert('Cost of Publishing must be 0 or greater.');
          return;
        }
        // The backend validates the profile unconditionally on start and answers a bare
        // 409 CONFLICT with no `field` key when it is unset (usecase/instructor.go:239-245).
        // Check it here so a partial profile reads as a fixable instruction instead.
        if (!isCompleteProfile(config.idealProfile)) {
          alert('Set every dimension of the hidden ideal joke before starting the round.');
          return;
        }

        // Send the budget only when it differs from what the round stores, so Start never overwrites it with a stale value.
        await instructorService.start(rid, {
          ...(customer_budget !== storedBudgetRef.current ? { customer_budget } : {}),
          batch_size,
          market_price,
          cost_of_publishing,
          ideal_profile: config.idealProfile,
        });
      }
      setConfig(prev => ({
        ...prev,
        isActive,
        status: 'PLAYING',
        startTime: isActive ? Date.now() : prev.startTime,
        elapsedTime: isActive ? 0 : prev.elapsedTime,
      }));
    } catch {
      alert('Failed to start round.');
    }
  };
  const toggleTeamPopup = async (show: boolean) => {
    // Backend now controls Round 2 popups via /v1/rounds/active -> is_popped_active.
    // Best-effort: update server config when instructor toggles; polling will sync all clients.
    if (!user || user.role !== ('INSTRUCTOR' as Role)) {
      updateConfig({ showTeamPopup: show });
      return;
    }
    const rid = await ensureInstructorRoundIdForRoundNumber(config.round);
    if (!rid) {
      alert('Missing round id; please refresh and try again.');
      return;
    }
    try {
      const resp = await instructorService.popups(rid, { is_popped_active: show });
      const roundAny: any = (resp as any)?.data?.round ?? (resp as any)?.round ?? resp;
      updateConfig({ showTeamPopup: Boolean(roundAny?.is_popped_active ?? show) });
    } catch {
      alert('Failed to update popup state.');
    }
  };

  const endRound = async () => {
    if (!user || user.role !== ('INSTRUCTOR' as Role)) return;
    const rid = await ensureInstructorRoundIdForRoundNumber(config.round);
    if (!rid) {
      alert('Missing round id; please refresh and try again.');
      return;
    }
    try {
      await instructorService.end(rid);
      setConfig(prev => {
        // Auto-advance: after ending Round 1, default the UI to Round 2 and keep teams.
        if (prev.round === 1) {
          if (isMockModeEnabled()) {
            try {
              setMockRoundNumber(2);
            } catch {
              // ignore
            }
          }
          return {
            ...prev,
            round: 2,
            isActive: false,
            status: 'PLAYING',
            startTime: null,
            elapsedTime: 0,
          };
        }

        // After ending Round 2, do NOT return to lobby setup (auto-assign).
        // Keep UI in PLAYING (but inactive) so instructor can resume Round 2,
        // and only show lobby setup again after an explicit reset.
        // Keep elapsedTime as the final value (do not reset to 0).
        return { ...prev, isActive: false, status: 'PLAYING', startTime: null, elapsedTime: prev.elapsedTime };
      });
    } catch {
      alert('Failed to end round.');
    }
  };
  
  const resetGame = async () => {
    // Only instructors can reset; requires X-User-Id header (set by apiClient — from localStorage, or sessionStorage in a watch tab; see services/watchMode.ts).
    if (!user || user.role !== ('INSTRUCTOR' as Role)) return false;
    try {
      await instructorService.reset();
    } catch {
      alert('Failed to reset game.');
      return false;
    }
    // Clear local game state but keep instructor logged in (do NOT logout).
    // Polling will re-hydrate roundId/lobby after reset.
    setConfig(initialConfig());
    setRoundId(null);
    setRoster([]);
    setBatches([]);
    setMarketItems([]);
    setTeamSummary(null);
    setTeamFeedback(null);
    /* Clear the "route missing" latches too. They exist to stop hammering a
       backend that 404s, not to remember a verdict for the rest of the page's
       life — a latch tripped before a route existed must not outlive the
       session it was tripped in. */
    teamSummaryUnsupportedRef.current = false;
    teamFeedbackUnsupportedRef.current = false;
    setInstructorLobby(null);
    setInstructorStats(null);
    setInstructorStatsByRoundNumber({ 1: null, 2: null });
    setRoundIds({ 1: null, 2: null });
    setRoundStatuses({ 1: null, 2: null });
    setRoundTimes(EMPTY_ROUND_TIMES);
    setQcQueue(null);
    setQcQueueSize(null);
    setTeamNames(INITIAL_TEAM_NAMES);
    submittedBatchJokesRef.current = {};
    qcRatedHistoryRef.current = {};
    localStorage.removeItem(LS_SUBMITTED_BATCH_JOKES);
    localStorage.removeItem(LS_QC_RATED_HISTORY);
    
    // Explicitly re-fetch lobby state to ensure UI syncs with the fresh backend state immediately.
    // The instructor reset endpoint clears backend data, so we must reload the lobby (which might be empty).
    if (user && user.role === 'INSTRUCTOR') {
      try {
        const me = await sessionService.me();
        if (me.round_id) {
           setRoundId(me.round_id);
           const lobbyRaw = await instructorService.lobby(me.round_id);
           // ... (polling will handle the rest, but this kickstarts the sync)
        }
      } catch {
        // ignore errors during re-sync
      }
    }
    
    return true;
  };

  return (
    <GameContext.Provider value={{
      user, login, instructorLogin, logout, roster,
      config, updateConfig, setRound, setGameActive, endRound, resetGame, toggleTeamPopup,
      formTeams, resetToLobby,
      teamNames, updateTeamName, updateUser, deleteUser,
      batches, addBatch, submitRawBatch, splitBatch, unsplitBatch, publishBatch,
      sales,
      roundId,
      roundIds,
      roundStatuses,
      roundTimes,
      marketItems,
      teamSummary,
      teamFeedback,
      instructorLobby,
      instructorStats,
      instructorStatsRound1: instructorStatsByRoundNumber[1],
      instructorStatsRound2: instructorStatsByRoundNumber[2],
      qcQueue,
      qcQueueSize,
    }}>
      {children}
    </GameContext.Provider>
  );
};