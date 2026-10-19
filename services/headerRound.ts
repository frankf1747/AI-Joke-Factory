export type HeaderRoundNumber = 1 | 2;
export type HeaderRoundStatus = 'CONFIGURED' | 'ACTIVE' | 'ENDED';
export type RoundTime = { startedAt: number | null; endedAt: number | null };
export type RoundTimes = Record<HeaderRoundNumber, RoundTime>;

export type HeaderRound = {
  round: HeaderRoundNumber;
  state: 'not-started' | 'running' | 'over';
  clockSecs: number;
  clockLabel: 'not started' | 'elapsed' | 'total';
};

type Input = {
  selectedRound: HeaderRoundNumber;
  statuses: Record<HeaderRoundNumber, HeaderRoundStatus | null>;
  times: RoundTimes;
  /** Current time in ms since the epoch. */
  now: number;
};

const wholeSecs = (fromMs: number, toMs: number) => Math.max(0, Math.floor((toMs - fromMs) / 1000));

/**
 * Which round the header shows and its clock. A running round wins; between rounds
 * the header stays on the round that just ended (Round 1) until Round 2 starts;
 * once both have ended it shows Round 2.
 */
export function headerRound({ selectedRound, statuses, times, now }: Input): HeaderRound {
  const round: HeaderRoundNumber =
    statuses[1] === 'ACTIVE' ? 1
    : statuses[2] === 'ACTIVE' ? 2
    : statuses[2] === 'ENDED' ? 2
    : statuses[1] === 'ENDED' ? 1
    : selectedRound;

  const { startedAt, endedAt } = times[round];
  const status = statuses[round];

  if (status === 'ACTIVE') {
    return { round, state: 'running', clockSecs: startedAt == null ? 0 : wholeSecs(startedAt, now), clockLabel: 'elapsed' };
  }
  if (status === 'ENDED') {
    const total = startedAt == null || endedAt == null ? 0 : wholeSecs(startedAt, endedAt);
    return { round, state: 'over', clockSecs: total, clockLabel: 'total' };
  }
  return { round, state: 'not-started', clockSecs: 0, clockLabel: 'not started' };
}

/**
 * Nothing is running and a round has ended: the header's 'over' state. Between rounds
 * the context already points config.round at Round 2, so this reads both statuses.
 */
export function isRoundOver(statuses: Record<HeaderRoundNumber, HeaderRoundStatus | null>): boolean {
  if (statuses[1] === 'ACTIVE' || statuses[2] === 'ACTIVE') return false;
  return statuses[1] === 'ENDED' || statuses[2] === 'ENDED';
}
