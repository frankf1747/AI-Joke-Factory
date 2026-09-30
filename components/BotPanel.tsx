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
  SPEEDS, type EngineStatus, type FromWorker, type ProbeResult, type SeatStatus, type Speed, type ToWorker,
} from '../services/bots/protocol';

export function botPanelRequested(search: string): boolean {
  return new URLSearchParams(search).get('bots') === '1';
}

const PROBE_EVERY_MS = 5_000;
const DEFAULT_COUNTS: Record<PersonaId, number> = { CAREFUL: 4, BALANCED: 4, SPRAY: 4 };
type Pending = 'start' | 'stop' | 'remove' | 'reform' | null;

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
  const [counts, setCounts] = useState<Record<PersonaId, number>>(DEFAULT_COUNTS);
  const [speed, setSpeed] = useState<Speed>(1);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  const mock = isMockApiMode();
  const instructorId = user ? Number(user.user_id) : null;
  const send = useCallback((message: ToWorker) => {
    workerRef.current?.postMessage(message);
  }, []);

  useEffect(() => {
    if (instructorId == null || mock) return undefined;
    const worker = new Worker(new URL('../services/bots/worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const m = event.data;
      if (m.type === 'status') setStatus(m.status);
      else if (m.type === 'probe') setProbe(m.result);
      else if (m.type === 'done') {
        if (!m.ok) {
          setError(m.message);
          setPending(null);
        }
      } else if (m.type === 'fatal') {
        setError(m.message);
        setPending(null);
      }
    };
    const init: ToWorker = { type: 'init', baseUrl: getApiBaseUrl(), instructorUserId: instructorId, seed: `bots-${Date.now()}` };
    worker.postMessage(init);
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [instructorId, mock]);

  useEffect(() => {
    if (roundId == null || instructorId == null || mock) return undefined;
    const tick = () => send({ type: 'probe', roundId: Number(roundId) });
    tick();
    const timer = window.setInterval(tick, PROBE_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [roundId, instructorId, mock, send]);

  // A command is finished when the status it was meant to produce arrives.
  useEffect(() => {
    if (!status || pending === null) return;
    const done =
      (pending === 'start' && status.running) ||
      (pending === 'stop' && !status.running) ||
      (pending === 'remove' && status.teams.length === 0) ||
      (pending === 'reform' && !status.scrambled);
    if (done) setPending(null);
  }, [status, pending]);

  if (mock) {
    return (
      <Card title="🤖 Bot players" subtitle="Test tool">
        <p className="text-sm text-gray-600">Bot players need the real backend. This build is serving the in-browser mock API.</p>
      </Card>
    );
  }

  const total = PERSONA_ORDER.reduce((sum, id) => sum + counts[id], 0);
  const running = status?.running ?? false;
  const roundActive = probe?.roundStatus === 'ACTIVE';
  // Only a round that has not started can take bots: the backend refuses to
  // start an ACTIVE or ENDED one (usecase/instructor.go:232-237).
  const roundOpen = probe?.roundStatus === 'CONFIGURED';
  const sizeOk = total >= 1 && total <= MAX_BOT_TEAMS;
  const profileOk = isCompleteProfile(config.idealProfile);
  const idle = !running && pending === null;
  const canRunAllBots = idle && sizeOk && profileOk && probe !== null && probe.humans === 0 && roundOpen;
  const canFill = idle && sizeOk && probe !== null && roundOpen;
  const nothingToRemove = (probe?.bots ?? 0) === 0 && (status?.teams.length ?? 0) === 0;

  const start = (startRound: boolean) => {
    if (roundId == null) return;
    setError(null);
    setPending('start');
    const teams = personaSequence(counts).map((persona, i) => ({ index: i + 1, persona }));
    send({
      type: 'start',
      commandId: ++commandIdRef.current,
      options: { roundId: Number(roundId), teams, speed, startRound, idealProfile: { ...config.idealProfile } },
    });
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
          <Button onClick={() => start(true)} disabled={!canRunAllBots}>Run all-bot class</Button>
          <Button variant="secondary" onClick={() => start(false)} disabled={!canFill}>Fill with bot teams</Button>
          <Button variant="secondary" onClick={() => { setPending('stop'); send({ type: 'stop', commandId: ++commandIdRef.current }); }} disabled={!running}>Stop</Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (roundId == null) return;
              setPending('remove');
              send({ type: 'remove', commandId: ++commandIdRef.current, roundId: Number(roundId) });
            }}
            disabled={pending !== null || nothingToRemove}
          >
            Remove bots
          </Button>
          {status?.scrambled && (
            // Disabled while any command is in flight: two overlapping re-forms each
            // reshuffle the humans and interleave their patches, which can strand a
            // human team. The engine also serializes them; this stops the double-click.
            <Button onClick={() => { setPending('reform'); send({ type: 'reform', commandId: ++commandIdRef.current }); }} disabled={pending !== null}>
              Re-form teams
            </Button>
          )}
        </div>

        <p className="text-xs text-gray-500">
          Lobby: {probe ? `${probe.humans} human${probe.humans === 1 ? '' : 's'}, ${probe.bots} bot${probe.bots === 1 ? '' : 's'}` : 'checking…'}
          {' · '}Round: {probe?.roundStatus ?? '…'}
          {' · '}Classification calls: {status?.classificationCalls ?? 0}
          {pending ? ` · ${pending}…` : ''}
        </p>
        {!profileOk && (
          <p className="text-xs text-amber-700">Set every dimension of the hidden ideal joke before running an all-bot class.</p>
        )}
        {probe && probe.humans > 0 && idle && (
          <p className="text-xs text-amber-700">
            All-bot class needs an empty lobby. Use Fill with bot teams to play alongside the {probe.humans} human{probe.humans === 1 ? '' : 's'} waiting.
          </p>
        )}
        {roundActive && idle && (
          <p className="text-xs text-amber-700">A round is active. Bots can only be added before it starts.</p>
        )}
        {probe?.roundStatus === 'ENDED' && idle && (
          <p className="text-xs text-amber-700">This round has ended. Bots need a round that has not started yet.</p>
        )}
        {status?.warnings.map(w => <p key={w} className="text-xs text-amber-700">{w}</p>)}
        {status?.scrambled && (
          <p className="text-xs text-rose-700">Teams were re-shuffled — probably Auto-Assign. Bots are paused until you re-form teams.</p>
        )}
        {error && <p className="text-xs text-rose-700">Error: {error}</p>}

        {status && status.teams.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="py-1 pr-3">Bot team</th>
                  <th className="pr-3">Persona</th>
                  <th className="pr-3">Joke Maker</th>
                  <th className="pr-3">Marketing</th>
                  <th className="pr-3">Published</th>
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
