/* The Instructor's control bar (spec 6b): the Round 1 / Round 2 segmented control,
   where the class is, and the one action that matters now.

   The segments pick the round the leaderboard, charts and debrief SHOW (viewRound).
   They never change the round Start and End act on: that is the round the poll sets
   (config.round), and the action here follows the phase alone. Hook-free on purpose,
   so tests can call it and press its buttons. */
import React from 'react';
import { BarChart3, Play, Square } from 'lucide-react';
import type { RoundStatus } from '../../types';
import { fmtClock } from '../../services/format';
import { instructorPhase, phaseAction, type InstructorPhase, type PhaseStatuses } from '../../services/instructorPhase';

export type ControlBarProps = {
  statuses: PhaseStatuses;
  viewRound: 1 | 2;
  onViewRound: (round: 1 | 2) => void;
  arrivalWindowSeconds: number;
  /** Teams with at least one player seated. */
  teamsPlaying: number;
  showTeammates: boolean;
  onShowTeammates: (show: boolean) => void;
  onStart: () => void;
  /** Opens the End Round confirm; the parent ends the round on yes. */
  onEnd: () => void;
  onOpenDebrief: () => void;
};

const segmentStatus = (s: RoundStatus | null) => (s === 'ACTIVE' ? 'running' : s === 'ENDED' ? 'ended' : 'not started');

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function phaseText(phase: InstructorPhase, arrivalWindowSeconds: number, teamsPlaying: number): [string, string] {
  const running = `${plural(teamsPlaying, 'team', 'teams')} playing. Customers stop arriving at ${fmtClock(arrivalWindowSeconds)}; end the round around then.`;
  switch (phase) {
    case 'lobby': {
      const minutes = Math.round(arrivalWindowSeconds / 60);
      return ['Ready for Round 1', `Seat every pair, check the setup, then start. Customers arrive over ${plural(minutes, 'minute', 'minutes')} from Start.`];
    }
    case 'r1-running': return ['Round 1 is running', running];
    case 'between': return ['Round 1 is over', 'Show students their teammates, then start Round 2 when the room is ready.'];
    case 'r2-running': return ['Round 2 is running', running];
    case 'over': return ['Class is over', 'Both rounds ended. Open Debrief to compare the rounds.'];
  }
}

const QUIET_BUTTON = 'inline-flex items-center gap-[7px] rounded-[var(--r-md)] px-3.5 py-[9px] text-sm font-medium transition-colors';

export const ControlBar = ({
  statuses, viewRound, onViewRound, arrivalWindowSeconds, teamsPlaying,
  showTeammates, onShowTeammates, onStart, onEnd, onOpenDebrief,
}: ControlBarProps) => {
  const phase = instructorPhase(statuses);
  const action = phaseAction(phase);
  const [title, sentence] = phaseText(phase, arrivalWindowSeconds, teamsPlaying);
  const round2Started = statuses[2] === 'ACTIVE' || statuses[2] === 'ENDED';

  const segment = (round: 1 | 2) => {
    const pressed = viewRound === round;
    const disabled = round === 2 && !round2Started;
    return (
      <button
        key={round}
        type="button"
        aria-pressed={pressed}
        disabled={disabled}
        title={disabled ? 'Round 2 can be viewed once it has started' : undefined}
        onClick={() => onViewRound(round)}
        className="rounded-[7px] px-3.5 py-1.5 text-left text-sm font-medium disabled:cursor-not-allowed"
        style={pressed
          ? { background: 'var(--sheet)', color: 'var(--ink)', boxShadow: '0 1px 2px rgba(20,32,43,.08)' }
          : { color: disabled ? 'var(--ink-4)' : 'var(--ink-3)' }}
      >
        {`Round ${round}`}<small className="block text-[11.5px] font-normal" style={{ color: 'var(--ink-4)' }}>{segmentStatus(statuses[round])}</small>
      </button>
    );
  };

  const start = (round: 1 | 2) => (
    <button
      type="button"
      onClick={onStart}
      disabled={statuses[round] !== 'CONFIGURED'}
      className="inline-flex items-center gap-2 rounded-[var(--r-md)] px-[18px] py-2.5 text-[14.5px] font-semibold transition-colors bg-[color:var(--gold)] hover:bg-[color:var(--gold-2)] text-[color:var(--navy)] disabled:cursor-not-allowed disabled:bg-[color:var(--paper-2)] disabled:text-[color:var(--ink-4)]"
    >
      {`Start Round ${round}`}
      <Play size={16} aria-hidden="true" />
    </button>
  );

  const end = (round: 1 | 2) => (
    <button
      type="button"
      onClick={onEnd}
      className={`${QUIET_BUTTON} hover:bg-[color:var(--warn-bg)]`}
      style={{ background: 'var(--sheet)', color: 'var(--warn)', border: '1px solid color-mix(in srgb, var(--warn) 35%, var(--sheet))' }}
    >
      <Square size={16} aria-hidden="true" />
      {`End Round ${round}`}
    </button>
  );

  return (
    <section
      aria-label="Round control"
      className="flex flex-wrap items-center gap-x-[18px] gap-y-3 px-[18px] py-3.5"
      style={{ background: 'var(--sheet)', border: '1px solid var(--rule)', borderRadius: 'var(--r-3)' }}
    >
      <div role="group" aria-label="Round" className="inline-flex gap-0.5 rounded-[9px] p-[3px]" style={{ background: 'var(--paper)' }}>
        {segment(1)}
        {segment(2)}
      </div>
      <div className="min-w-0 flex-1 basis-72">
        <b className="block text-base font-semibold tracking-[-0.01em]" style={{ color: 'var(--ink)' }}>{title}</b>
        <span className="text-[13.5px] tabular-nums" style={{ color: 'var(--ink-3)' }}>{sentence}</span>
      </div>
      <div className="flex items-center gap-2.5">
        {action === 'start-r1' && start(1)}
        {action === 'end-r1' && end(1)}
        {action === 'start-r2' && (
          <>
            <label className="inline-flex cursor-pointer select-none items-center gap-2 text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
              <span className="relative inline-flex">
                <input
                  type="checkbox"
                  role="switch"
                  checked={showTeammates}
                  onChange={e => onShowTeammates(e.target.checked)}
                  className="peer m-0 h-5 w-[34px] cursor-pointer appearance-none rounded-full transition-colors bg-[color:var(--rule-2)] checked:bg-[color:var(--navy)]"
                />
                <span aria-hidden="true" className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-[14px]" />
              </span>
              Show students their teammates
            </label>
            {start(2)}
          </>
        )}
        {action === 'end-r2' && end(2)}
        {action === 'debrief' && (
          <button
            type="button"
            onClick={onOpenDebrief}
            className={`${QUIET_BUTTON} hover:bg-[color:var(--paper)]`}
            style={{ background: 'var(--sheet)', color: 'var(--ink)', border: '1px solid var(--rule-2)' }}
          >
            <BarChart3 size={16} aria-hidden="true" />
            Open debrief
          </button>
        )}
      </div>
    </section>
  );
};
