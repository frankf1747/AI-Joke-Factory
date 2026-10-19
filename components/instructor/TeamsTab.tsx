/* The Instructor's Teams tab (spec 6b, 7.4): the lobby strip with an honest
   Auto-assign, then one card per real team with a Joke Maker slot and a
   Marketing slot. Pairs drag between slots or back to the lobby; ⇄ swaps a
   team's two roles; × removes the account through the confirm modal.
   TeamsTab holds the state and the modals; TeamsBoard is hook-free so the
   tests can press its buttons and drop pairs. */
import React, { useState } from 'react';
import { useGame } from '../../context';
import { Button, Modal } from '../../components';
import { pairNames } from '../../services/format';
import {
  autoAssignCount, dropAction, seatedTeams,
  type DropTarget, type MoveBody, type PairMove, type SeatPair, type SeatedTeam,
} from '../../services/teamSeats';

export type TeamsConfirm = { kind: 'reshuffle' } | { kind: 'remove'; userId: number; name: string };

export interface TeamsBoardProps {
  teams: SeatedTeam[];
  waiting: SeatPair[];
  waitingCount: number;
  autoAssignTeams: number;
  /** Waiting plus assigned pairs: everyone Auto-assign reshuffles. */
  totalPairs: number;
  /** A round is ACTIVE: POST /assign would reshuffle the pairs mid-round, so Auto-assign is off. */
  roundRunning: boolean;
  busyTeams: number[];
  /** The drop zone under the dragged pair, for its highlight. */
  dropKey: string | null;
  onDropKey: (key: string | null) => void;
  onRename: (teamId: string, name: string) => void;
  onAutoAssign: () => void;
  onConfirm: (c: TeamsConfirm) => void;
  onMove: (userId: number, body: MoveBody) => void;
  /** A drop onto an occupied slot: the dragged pair first, then the occupant. */
  onExchange: (first: PairMove & { undo: MoveBody }, second: PairMove) => void;
  onSwap: (teamId: number) => void;
}

const SHEET: React.CSSProperties = { background: 'var(--sheet)', border: '1px solid var(--rule)', borderRadius: 'var(--r-3)' };
const PRIMARY =
  'inline-flex shrink-0 items-center gap-2 rounded-[var(--r-md)] px-[18px] py-2.5 text-[14.5px] font-semibold transition-colors bg-[color:var(--gold)] hover:bg-[color:var(--gold-2)] text-[color:var(--navy)] disabled:cursor-not-allowed disabled:bg-[color:var(--paper-2)] disabled:text-[color:var(--ink-4)]';
const CHIP_BUTTON =
  'border-0 bg-transparent px-0.5 leading-none opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const TeamsBoard = ({
  teams, waiting, waitingCount, autoAssignTeams, totalPairs, roundRunning, busyTeams, dropKey,
  onDropKey, onRename, onAutoAssign, onConfirm, onMove, onExchange, onSwap,
}: TeamsBoardProps): React.ReactElement => {
  const zone = (key: string, target: DropTarget) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (dropKey !== key) onDropKey(key); },
    // Moving onto a chip inside the zone fires dragleave on the zone: keep the highlight.
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      onDropKey(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      onDropKey(null);
      const userId = Number(e.dataTransfer.getData('userId'));
      if (!userId) return;
      const action = dropAction(teams, userId, target);
      if (action?.kind === 'move') onMove(action.userId, action.body);
      else if (action?.kind === 'exchange') onExchange(action.first, action.second);
      else if (action?.kind === 'swap') onSwap(action.teamId);
    },
  });
  const zoneStyle = (key: string): React.CSSProperties | undefined =>
    dropKey === key ? { background: 'var(--navy-tint)' } : undefined;

  const chip = (pair: SeatPair, team?: SeatedTeam) => {
    const canSwap = team != null && team.jm.length === 1 && team.marketing.length === 1;
    const busy = team != null && busyTeams.includes(team.id);
    return (
      <span
        key={pair.userId}
        draggable
        onDragStart={e => e.dataTransfer.setData('userId', String(pair.userId))}
        className="group inline-flex max-w-full cursor-grab select-none items-center gap-1.5 rounded-full py-1 pl-2.5 pr-1.5 text-[13.5px] active:cursor-grabbing"
        style={{ background: 'var(--paper)', border: '1px solid var(--rule)', color: 'var(--ink)' }}
      >
        <span className="truncate">{pair.name}</span>
        {canSwap && (
          <button
            type="button"
            aria-label={`Switch roles in ${team.name}`}
            title="Switch this team's Joke Maker and Marketing"
            disabled={busy}
            onClick={e => { e.preventDefault(); e.stopPropagation(); onSwap(team.id); }}
            className={`${CHIP_BUTTON} text-[12px]`}
            style={{ color: 'var(--navy)' }}
          >⇄</button>
        )}
        <button
          type="button"
          aria-label={`Remove ${pair.name}`}
          title="Remove this account"
          onClick={e => { e.preventDefault(); e.stopPropagation(); onConfirm({ kind: 'remove', userId: pair.userId, name: pair.name }); }}
          className={`${CHIP_BUTTON} text-[15px]`}
          style={{ color: 'var(--ink-4)' }}
        >×</button>
      </span>
    );
  };

  const slot = (team: SeatedTeam, seat: 'JM' | 'MARKETING') => {
    const key = `${team.id}:${seat}`;
    const pairs = seat === 'JM' ? team.jm : team.marketing;
    return (
      <div
        key={key}
        data-team={team.id}
        data-seat={seat}
        {...zone(key, { kind: 'slot', teamId: team.id, seat })}
        className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-2 rounded-[6px] py-[5px]"
        style={{ ...(seat === 'MARKETING' ? { borderTop: '1px solid var(--rule)' } : {}), ...zoneStyle(key) }}
      >
        <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{seat === 'JM' ? 'Joke Maker' : 'Marketing'}</span>
        <span className="flex min-w-0 flex-wrap gap-1.5">
          {pairs.length > 0
            ? pairs.map(p => chip(p, team))
            : <span className="text-[13px] italic" style={{ color: 'var(--ink-4)' }}>Empty</span>}
        </span>
      </div>
    );
  };

  const hasTeams = teams.length > 0;
  const autoAssignLabel = autoAssignTeams >= 1 ? `Auto-assign ${plural(autoAssignTeams, 'team', 'teams')}` : 'Auto-assign';
  const sub = roundRunning
    ? 'Auto-assign is off while a round runs. Drag pairs to move them.'
    : totalPairs < 2
      ? 'Pairs appear here as they join. Auto-assign needs at least two.'
      : waitingCount === 0
        ? `Everyone is on a team. Drag a pair here to take them off. Auto-assign reshuffles all ${totalPairs} pairs.`
        : `Auto-assign seats all ${totalPairs} pairs into ${plural(autoAssignTeams, 'team', 'teams')}, one Joke Maker pair and one Marketing pair each.${totalPairs % 2 === 1 ? ' One pair stays in the lobby.' : ''}`;

  return (
    <div>
      <div className="mb-[18px] flex flex-col gap-[18px] px-[18px] py-4 md:flex-row md:items-center" style={SHEET}>
        <div className="md:flex-1">
          <b className="block text-[16px]" style={{ color: 'var(--ink)' }}>
            {waitingCount > 0 ? `Lobby: ${plural(waitingCount, 'pair', 'pairs')} waiting` : 'Lobby'}
          </b>
          <span className="text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{sub}</span>
        </div>
        <div
          {...zone('lobby', { kind: 'lobby' })}
          className="flex min-h-[34px] flex-wrap content-start gap-1.5 rounded-[var(--r-md)] p-1.5 md:flex-[2]"
          style={{ border: '1px dashed var(--rule-2)', ...zoneStyle('lobby') }}
        >
          {waiting.length > 0
            ? waiting.map(p => chip(p))
            : <span className="p-1 text-[13px]" style={{ color: 'var(--ink-4)' }}>Everyone is seated.</span>}
        </div>
        <button
          type="button"
          disabled={roundRunning || autoAssignTeams < 1}
          onClick={() => (hasTeams ? onConfirm({ kind: 'reshuffle' }) : onAutoAssign())}
          className={PRIMARY}
        >{autoAssignLabel}</button>
      </div>

      {hasTeams ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {teams.map(team => (
            <div key={team.id} className="px-3.5 pb-3 pt-3.5" style={SHEET}>
              <input
                type="text"
                aria-label={`Name of ${team.name}`}
                value={team.name}
                onChange={e => onRename(String(team.id), e.target.value)}
                className="-mx-1 -mt-0.5 mb-2 w-[calc(100%+8px)] rounded-[4px] border border-transparent bg-transparent px-1 py-0.5 text-[16px] font-semibold hover:border-[color:var(--rule)] focus:border-[color:var(--navy)] focus:bg-[color:var(--sheet)] focus:outline-none"
                style={{ color: 'var(--ink)' }}
              />
              {slot(team, 'JM')}
              {slot(team, 'MARKETING')}
            </div>
          ))}
        </div>
      ) : (
        <div className="px-6 py-8 text-center" style={SHEET}>
          <b className="block text-[15px]" style={{ color: 'var(--ink)' }}>No teams yet</b>
          <span className="text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Auto-assign seats the lobby into teams of two pairs.</span>
        </div>
      )}
      <p className="mt-3 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
        Team names are kept in this browser only. Drag a pair to move it; ⇄ switches a team&apos;s two roles; × removes the account.
      </p>
    </div>
  );
};

/** initialConfirm opens a confirm on first render (the render tests use it). */
export const TeamsTab: React.FC<{ initialConfirm?: TeamsConfirm }> = ({ initialConfirm }) => {
  const {
    instructorLobby, roundStatuses, teamNames, updateTeamName, formTeams, swapTeamRoles, movePair, exchangePairs, deleteUser,
  } = useGame();
  const [confirm, setConfirm] = useState<TeamsConfirm | null>(initialConfirm ?? null);
  const [busyTeams, setBusyTeams] = useState<number[]>([]);
  const [dropKey, setDropKey] = useState<string | null>(null);

  const teams = seatedTeams(instructorLobby, teamNames);
  const waiting = (instructorLobby?.unassigned ?? []).map(u => ({
    userId: Number(u.user_id), name: pairNames(u.display_name) || u.display_name,
  }));
  const summary = instructorLobby?.summary;
  const waitingCount = summary?.waiting ?? waiting.length;
  const autoAssignTeams = autoAssignCount(summary);
  const totalPairs = (summary?.waiting ?? 0) + (summary?.assigned ?? 0);
  const roundRunning = roundStatuses[1] === 'ACTIVE' || roundStatuses[2] === 'ACTIVE';

  const swap = async (teamId: number) => {
    if (busyTeams.includes(teamId)) return;
    setBusyTeams(b => [...b, teamId]);
    try {
      await swapTeamRoles(teamId);
    } finally {
      setBusyTeams(b => b.filter(id => id !== teamId));
    }
  };
  const close = () => setConfirm(null);

  return (
    <>
      <TeamsBoard
        teams={teams} waiting={waiting} waitingCount={waitingCount} autoAssignTeams={autoAssignTeams}
        totalPairs={totalPairs} roundRunning={roundRunning} busyTeams={busyTeams} dropKey={dropKey} onDropKey={setDropKey}
        onRename={updateTeamName} onAutoAssign={() => { void formTeams(); }} onConfirm={setConfirm}
        onMove={(userId, body) => { void movePair(userId, body); }}
        onExchange={(first, second) => { void exchangePairs(first, second); }} onSwap={teamId => { void swap(teamId); }}
      />

      <Modal isOpen={confirm?.kind === 'reshuffle'} onClose={close} title="Reshuffle the teams?">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
            {`This reshuffles every team. All ${totalPairs} pairs are dealt into ${plural(autoAssignTeams, 'new team', 'new teams')}, so pairs can change team and role.`}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={close} className="w-full">Keep the teams</Button>
            <Button className="w-full font-bold" disabled={roundRunning} onClick={() => { close(); void formTeams(); }}>
              {`Auto-assign ${plural(autoAssignTeams, 'team', 'teams')}`}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={confirm?.kind === 'remove'} onClose={close} title={confirm?.kind === 'remove' ? `Remove ${confirm.name}?` : 'Remove this pair?'}>
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
            This deletes the account and cannot be undone. The pair can join again from the start page.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={close} className="w-full">Keep the pair</Button>
            <Button
              variant="danger"
              className="w-full font-bold"
              onClick={() => {
                if (confirm?.kind !== 'remove') return;
                close();
                void deleteUser(String(confirm.userId));
              }}
            >Remove</Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
