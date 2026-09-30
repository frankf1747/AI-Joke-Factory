// components/botPanelLogic.ts
/**
 * Which Bot Panel buttons are live, and why the others are not.
 *
 * Pure, so it is tested under node (vitest has no DOM here). The rule it keeps:
 * a disabled "Run all-bot class" or "Fill with bot teams" always comes with at
 * least one human-readable reason, and an enabled one with none — the button
 * is enabled exactly when its reason list is empty.
 *
 * The engine re-checks the round before seating anyone, so these gates are
 * about not offering a button that would fail, not about safety.
 */
import { MAX_BOT_TEAMS, PERSONA_ORDER, type PersonaId } from '../services/bots/personas';
import type { Command, EngineStatus, ProbeResult } from '../services/bots/protocol';

/** A lobby reading older than this is not trusted: the panel fails closed. */
export const PROBE_STALE_MS = 15_000;

export interface Pending {
  id: number;
  command: Command;
}

export interface PanelInput {
  /** False until the instructor view knows which round it is on. */
  hasRound: boolean;
  /** The last lobby reading, or null before the first one for this round. */
  probe: ProbeResult | null;
  /** No reading has arrived for longer than PROBE_STALE_MS; see probeIsStale. */
  probeStale: boolean;
  status: EngineStatus | null;
  pending: Pending | null;
  counts: Readonly<Record<PersonaId, number>>;
  profileComplete: boolean;
}

export interface PanelControls {
  /** Nothing running and nothing in flight: the inputs may be edited. */
  idle: boolean;
  total: number;
  canRunAllBots: boolean;
  canFill: boolean;
  canStop: boolean;
  canRemove: boolean;
  canReform: boolean;
  runAllBotsBlockedBy: string[];
  fillBlockedBy: string[];
}

const PENDING_REASON: Record<Command, string> = {
  start: 'Starting bots…',
  stop: 'Stopping bots…',
  remove: 'Removing bots…',
  reform: 'Re-forming teams…',
};

export const REASONS = {
  noRound: 'No round is selected yet.',
  checking: 'Checking the lobby…',
  stale: "Can't reach the backend — lobby status is stale.",
  roundUnknown: "The backend doesn't list this round, so its status is unknown. Refresh, or pick another round.",
  roundActive: 'A round is active. Bots can only be added before it starts.',
  roundEnded: 'This round has ended. Bots need a round that has not started yet.',
  noTeams: 'Choose at least one bot team.',
  tooManyTeams: (total: number) => `At most ${MAX_BOT_TEAMS} bot teams — ${total} chosen.`,
  humansPresent: (humans: number) =>
    `All-bot class needs an empty lobby. Use Fill with bot teams to play alongside the ${humans} human${humans === 1 ? '' : 's'} waiting.`,
  profileIncomplete: 'Set every dimension of the hidden ideal joke before running an all-bot class.',
  running: 'Bots are running. Stop them first.',
  pending: (command: Command) => PENDING_REASON[command],
} as const;

export function probeIsStale(lastHeardAt: number, now: number): boolean {
  return now - lastHeardAt > PROBE_STALE_MS;
}

export function panelControls(input: PanelInput): PanelControls {
  const { hasRound, probe, probeStale, status, pending, counts, profileComplete } = input;
  const running = status?.running ?? false;
  const idle = !running && pending === null;
  const total = PERSONA_ORDER.reduce((sum, id) => sum + counts[id], 0);

  // Reasons both buttons share. While busy, only the busy reason (and a stale
  // warning) is given: lobby and profile advice is noise until bots stop.
  const shared: string[] = [];
  if (pending) shared.push(REASONS.pending(pending.command));
  else if (running) shared.push(REASONS.running);
  if (!hasRound) shared.push(REASONS.noRound);
  else if (probeStale) shared.push(REASONS.stale);
  // A stale reading is not trusted for anything, so it adds no reasons of its own.
  const reading = hasRound && !probeStale ? probe : null;
  if (idle) {
    if (hasRound && !probeStale) {
      if (!probe) shared.push(REASONS.checking);
      else if (probe.roundStatus === 'UNKNOWN') shared.push(REASONS.roundUnknown);
      else if (probe.roundStatus === 'ACTIVE') shared.push(REASONS.roundActive);
      else if (probe.roundStatus === 'ENDED') shared.push(REASONS.roundEnded);
    }
    if (total < 1) shared.push(REASONS.noTeams);
    else if (total > MAX_BOT_TEAMS) shared.push(REASONS.tooManyTeams(total));
  }

  const runAllBotsBlockedBy = [...shared];
  if (idle) {
    if (reading && reading.humans > 0) runAllBotsBlockedBy.push(REASONS.humansPresent(reading.humans));
    if (!profileComplete) runAllBotsBlockedBy.push(REASONS.profileIncomplete);
  }
  const fillBlockedBy = [...shared];

  const botsKnown = (probe?.bots ?? 0) > 0 || (status?.teams.length ?? 0) > 0;
  return {
    idle,
    total,
    canRunAllBots: runAllBotsBlockedBy.length === 0,
    canFill: fillBlockedBy.length === 0,
    // Stop is the kill switch. The engine's stop() also cancels a start still
    // in progress, so a slow start must never lock it out.
    canStop: running || pending?.command === 'start',
    canRemove: pending === null && botsKnown,
    // Two overlapping re-forms each reshuffle the humans; the engine serializes
    // them, and this stops the double-click.
    canReform: (status?.scrambled ?? false) && pending === null,
    runAllBotsBlockedBy,
    fillBlockedBy,
  };
}
