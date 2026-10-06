// services/bots/api.ts
import type {
  AssignRequest, BatchSplitRequest, BatchSubmitRequest, ConfigRequest, LobbyResponse,
  MarketingQueueEnvelope, PatchUserRequest, PublishRequest, RoundsActiveResponse,
  SessionJoinRequest, SessionJoinResponse, SessionMeResponse, TeamBatchesResponse, TeamFeedbackResponse,
} from '../../types/api';

/**
 * The slice of the shared HTTP client the engine uses. An interface, so tests
 * can hand the engine an in-memory fake; the real JokeFactoryClient satisfies it
 * structurally (worker.ts assigns one to this type, so tsc checks that).
 */
export interface BotApi {
  as(userId: number, label: string): BotApi;
  sessionJoin(body: SessionJoinRequest): Promise<SessionJoinResponse>;
  sessionMe(): Promise<SessionMeResponse>;
  roundsActive(): Promise<RoundsActiveResponse>;
  submitBatch(roundId: number, body: BatchSubmitRequest): Promise<unknown>;
  teamFeedback(roundId: number, teamId: number): Promise<TeamFeedbackResponse>;
  /** The team's own batch list with sold counts; the Learner's only market signal. */
  teamBatches(roundId: number, teamId: number): Promise<TeamBatchesResponse>;
  marketingQueueNext(roundId: number): Promise<MarketingQueueEnvelope>;
  marketingSplit(batchId: number, body: BatchSplitRequest): Promise<MarketingQueueEnvelope>;
  marketingPublish(batchId: number, body: PublishRequest): Promise<unknown>;
  instructorLobby(roundId: number): Promise<LobbyResponse>;
  instructorAssign(roundId: number, body: AssignRequest): Promise<LobbyResponse>;
  instructorPatchUser(roundId: number, userId: number, body: PatchUserRequest): Promise<LobbyResponse>;
  instructorDeleteUser(roundId: number, userId: number): Promise<unknown>;
  instructorStart(roundId: number, body?: ConfigRequest): Promise<unknown>;
}

/** HTTP status off either the real ApiError or the fake's error. */
export function statusOf(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}
