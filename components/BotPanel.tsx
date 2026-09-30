// components/BotPanel.tsx
/* BotPanel — the instructor's control surface for bot players.

   Rendered only when the page is opened with ?bots=1 (botPanelRequested): this
   is a test tool on the production deployment, and it must not be one misclick
   away during a real class.

   The panel owns no game logic. It hosts services/bots/worker.ts, sends it
   commands, and renders what the engine reports. Unmounting — including closing
   the tab — terminates the worker, which stops every bot. That is the kill
   switch, by design. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '../context';
import { Button, Card } from '../components';
import { isCompleteProfile } from './IdealProfilePicker';
import { getApiBaseUrl, isMockApiMode } from '../services/apiClient';
import { MAX_BOT_TEAMS, PERSONAS, PERSONA_ORDER, personaSequence, type PersonaId } from '../services/bots/personas';
import {
  SPEEDS, type Command, type EngineStatus, type FromWorker, type ProbeResult, type SeatStatus, type Speed, type ToWorker,
} from '../services/bots/protocol';
import { panelControls, probeIsStale, type Pending } from './botPanelLogic';

export function botPanelRequested(search: string): boolean {
  return new URLSearchParams(search).get('bots') === '1';
}

const PROBE_EVERY_MS = 5_000;
const DEFAULT_COUNTS: Record<PersonaId, number> = { CAREFUL: 4, BALANCED: 4, SPRAY: 4 };
const COMMAND_LABEL: Record<Command, string> = { start: 'Start', stop: 'Stop', remove: 'Remove bots', reform: 'Re-form teams' };

function clampCount(raw: string): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.min(MAX_BOT_TEAMS, Math.max(0, n)) : 0;
}

const SeatCell: React.FC<{ seat: SeatStatus }> = ({ seat }) => (
  <div>
    <div>{seat.activity}</div>
    {seat.error && <div className="text-rose-700">{seat.error}</div>}
  </div>
);

export const BotPanel: React.FC = () => {
  const { user, roundId, config } = useGame();
  const workerRef = useRef<Worker | null>(null);
  const commandIdRef = useRef(0);
  /** For the worker's message handler, which outlives any one roundId. */
  const roundIdRef = useRef<number | null>(null);
  const [counts, setCounts] = useState<Record<PersonaId, number>>(DEFAULT_COUNTS);
  const [speed, setSpeed] = useState<Speed>(1);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  /** When the last lobby reading arrived, or when the panel started waiting for one. */
  const [heardAt, setHeardAt] = useState(() => Date.now());
  /** Re-read on every probe tick, so staleness is re-evaluated without a reply. */
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const mock = isMockApiMode();
  const instructorId = user ? Number(user.user_id) : null;
  const send = useCallback((message: ToWorker) => {
    workerRef.current?.postMessage(message);
  }, []);

  useEffect(() => {
    if (instructorId == null || mock) return undefined;
    // A new worker holds a new, idle engine: nothing from the old one applies.
    setStatus(null);
    setPending(null);
    setError(null);
    setProbe(null);
    setHeardAt(Date.now());
    const worker = new Worker(new URL('../services/bots/worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    const probeNow = () => {
      if (roundIdRef.current != null) worker.postMessage({ type: 'probe', roundId: roundIdRef.current } satisfies ToWorker);
    };
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const m = event.data;
      if (m.type === 'status') setStatus(m.status);
      else if (m.type === 'probe') {
        setProbe(m.result);
        setHeardAt(Date.now());
      } else if (m.type === 'done') {
        // Only the acknowledgement of the command still pending clears it: a
        // start superseded by Stop must not clear Stop's pending state.
        setPending(p => (p?.id === m.commandId ? null : p));
        if (!m.ok) setError(`${COMMAND_LABEL[m.command]} failed: ${m.message}`);
        // The lobby just changed; don't leave the buttons on a reading up to 5 s old.
        probeNow();
      } else if (m.type === 'fatal') {
        setError(m.message);
      }
    };
    const init: ToWorker = { type: 'init', baseUrl: getApiBaseUrl(), instructorUserId: instructorId, seed: `bots-${Date.now()}` };
    worker.postMessage(init);
    probeNow();
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [instructorId, mock]);

  useEffect(() => {
    roundIdRef.current = roundId == null ? null : Number(roundId);
    // Fail closed until this round's own reading arrives.
    setProbe(null);
    const started = Date.now();
    setHeardAt(started);
    setNow(started);
    if (roundId == null || instructorId == null || mock) return undefined;
    const tick = () => {
      setNow(Date.now());
      send({ type: 'probe', roundId: Number(roundId) });
    };
    tick();
    const timer = window.setInterval(tick, PROBE_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [roundId, instructorId, mock, send]);

  if (mock) {
    return (
      <Card title="🤖 Bot players" subtitle="Test tool">
        <p className="text-sm text-gray-600">Bot players need the real backend. This build is serving the in-browser mock API.</p>
      </Card>
    );
  }

  const controls = panelControls({
    hasRound: roundId != null,
    probe,
    probeStale: probeIsStale(heardAt, now),
    status,
    pending,
    counts,
    profileComplete: isCompleteProfile(config.idealProfile),
  });
  const { idle, total } = controls;
  const reasons = [...new Set([...controls.runAllBotsBlockedBy, ...controls.fillBlockedBy])];

  /** Every command goes through here: a fresh id, a fresh error line, pending keyed to the id. */
  const issue = (command: Command, message: (commandId: number) => ToWorker) => {
    if (!workerRef.current) return;
    const id = ++commandIdRef.current;
    setError(null);
    setPending({ id, command });
    send(message(id));
  };

  const start = (startRound: boolean) => {
    if (roundId == null) return;
    const teams = personaSequence(counts).map((persona, i) => ({ index: i + 1, persona }));
    issue('start', commandId => ({
      type: 'start',
      commandId,
      options: { roundId: Number(roundId), teams, speed, startRound, idealProfile: { ...config.idealProfile } },
    }));
  };

  const changeSpeed = (next: Speed) => {
    setSpeed(next);
    send({ type: 'setSpeed', speed: next });
  };

  return (
    <Card title="🤖 Bot players" subtitle="Test tool — shown because the URL has ?bots=1. Closing this tab stops every bot.">
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-end gap-4">
          {PERSONA_ORDER.map(id => (
            <label key={id} className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-500">{PERSONAS[id].label}</span>
              <input
                type="number" min={0} max={MAX_BOT_TEAMS} value={counts[id]} disabled={!idle}
                aria-label={`${PERSONAS[id].label} bot teams`}
                onChange={e => setCounts(c => ({ ...c, [id]: clampCount(e.target.value) }))}
                className="w-20 rounded border border-gray-300 px-2 py-1"
              />
            </label>
          ))}
          <div className="text-xs text-gray-500">
            {total} bot team{total === 1 ? '' : 's'}{total > MAX_BOT_TEAMS ? ` — max ${MAX_BOT_TEAMS}` : ''}
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Bot speed">
            {SPEEDS.map(s => (
              <button
                key={s} type="button" onClick={() => changeSpeed(s)} aria-pressed={speed === s}
                className={`rounded px-2 py-1 text-xs font-semibold ${speed === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => start(true)} disabled={!controls.canRunAllBots}>Run all-bot class</Button>
          <Button variant="secondary" onClick={() => start(false)} disabled={!controls.canFill}>Fill with bot teams</Button>
          <Button
            variant="secondary"
            onClick={() => issue('stop', commandId => ({ type: 'stop', commandId }))}
            disabled={!controls.canStop}
          >
            Stop
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (roundId == null) return;
              issue('remove', commandId => ({ type: 'remove', commandId, roundId: Number(roundId) }));
            }}
            disabled={!controls.canRemove}
          >
            Remove bots
          </Button>
          {status?.scrambled && (
            <Button onClick={() => issue('reform', commandId => ({ type: 'reform', commandId }))} disabled={!controls.canReform}>
              Re-form teams
            </Button>
          )}
        </div>

        <div aria-live="polite" className="space-y-1">
          <p className="text-xs text-gray-500">
            Lobby: {probe ? `${probe.humans} human${probe.humans === 1 ? '' : 's'}, ${probe.bots} bot${probe.bots === 1 ? '' : 's'}` : 'checking…'}
            {' · '}Round: {probe?.roundStatus ?? '…'}
            {' · '}Classification calls: {status?.classificationCalls ?? 0}
          </p>
          {reasons.map(r => <p key={r} className="text-xs text-amber-700">{r}</p>)}
          {status?.warnings.map(w => <p key={w} className="text-xs text-amber-700">{w}</p>)}
          {status?.scrambled && (
            <p className="text-xs text-rose-700">Teams were re-shuffled — probably Auto-Assign. Bots are paused until you re-form teams.</p>
          )}
          {error && <p className="text-xs text-rose-700">Error: {error}</p>}
        </div>

        {status && status.teams.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Bot teams, and what each seat is doing</caption>
              <thead className="text-gray-500">
                <tr>
                  <th scope="col" className="py-1 pr-3">Bot team</th>
                  <th scope="col" className="pr-3">Persona</th>
                  <th scope="col" className="pr-3">Joke Maker</th>
                  <th scope="col" className="pr-3">Marketing</th>
                  <th scope="col" className="pr-3">Published</th>
                </tr>
              </thead>
              <tbody>
                {status.teams.map(t => (
                  <tr key={t.index} className="border-t border-gray-100 align-top">
                    <td className="py-1 pr-3 font-semibold">
                      {String(t.index).padStart(2, '0')}{t.teamId != null ? ` · team ${t.teamId}` : ''}
                    </td>
                    <td className="pr-3">{PERSONAS[t.persona].label}</td>
                    <td className="pr-3"><SeatCell seat={t.jm} /></td>
                    <td className="pr-3"><SeatCell seat={t.marketing} /></td>
                    <td className="pr-3">{t.batchesPublished}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
};
