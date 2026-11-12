/* "Save run record": names the run, says who played, downloads the JSON and CSV
   (docs/superpowers/specs/2026-11-12-experiment-records-design.md §4). */
import React, { useState } from 'react';
import { Button, Modal } from '../../components';
import { instructorApi } from '../../services/api/instructor';
import { instructorService } from '../../services/instructorService';
import type { LeaderboardRow } from '../../services/classTotals';
import type { FeeRates } from '../../services/shownFees';
import { downloadText } from '../../services/download';
import { defaultPlayedBy, defaultRunName, fileSafeName } from '../../services/runRecord/build';
import { botTeams } from '../../services/runRecord/botRegistry';
import { recordCsv } from '../../services/runRecord/csv';
import { collectRunRecord, savableRounds, type SaveRunDeps } from '../../services/runRecord/saveRun';
import type { PlayedBy } from '../../services/runRecord/types';

export { collectRunRecord, savableRounds } from '../../services/runRecord/saveRun';
export type { SaveRunDeps, SaveRunInput } from '../../services/runRecord/saveRun';

type Stats = { leaderboard: LeaderboardRow[] } | null;

export interface SaveRunDialogProps {
  open: boolean;
  onClose: () => void;
  roundIds: { 1: number | null; 2: number | null };
  roundStatuses: { 1: string | null; 2: string | null };
  statsR1: Stats;
  statsR2: Stats;
  ratesR1: FeeRates;
  ratesR2: FeeRates;
  teamNames: Record<string, string>;
  /** Tests; the real reads when absent. */
  deps?: SaveRunDeps;
}

const REAL_DEPS: SaveRunDeps = {
  getConfig: id => instructorService.getRoundConfig(id) as Promise<Awaited<ReturnType<SaveRunDeps['getConfig']>>>,
  getCharts: id => instructorApi.leanCharts(id),
};

const PLAYED_BY: ReadonlyArray<readonly [PlayedBy, string]> = [['students', 'Students'], ['bots', 'Bots'], ['mixed', 'Mixed']];
const LABEL = 'block text-sm font-medium mb-1';
const FIELD = 'w-full rounded-md border px-3 py-2 text-sm';

const SaveRunForm: React.FC<SaveRunDialogProps> = props => {
  const { onClose, roundIds, roundStatuses, statsR1, statsR2, ratesR1, ratesR2, teamNames, deps = REAL_DEPS } = props;
  const rounds = savableRounds(roundStatuses);
  const bots = botTeams();
  const playing = (statsR1?.leaderboard ?? []).map(row => Number(row.team.id));
  const [name, setName] = useState(() => defaultRunName(new Date()));
  const [playedBy, setPlayedBy] = useState<PlayedBy>(() => defaultPlayedBy(playing, new Set(bots.keys())));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const inputs = rounds.flatMap(round => {
        const roundId = roundIds[round];
        const stats = round === 1 ? statsR1 : statsR2;
        if (roundId == null || !stats) throw new Error(`Could not read Round ${round} settings`);
        return [{ round, roundId, stats, rates: round === 1 ? ratesR1 : ratesR2 }];
      });
      const record = await collectRunRecord({ name, notes, playedBy, now: new Date(), rounds: inputs, teamNames, bots }, deps);
      const file = fileSafeName(name);
      downloadText(`${file}.jfrun.json`, JSON.stringify(record, null, 2), 'application/json');
      downloadText(`${file}.csv`, recordCsv(record), 'text/csv');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the run record');
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (name.trim() && !saving) void save(); }}>
      <div>
        <label className={LABEL} htmlFor="run-name" style={{ color: 'var(--ink-2)' }}>Name</label>
        <input id="run-name" className={FIELD} style={{ borderColor: 'var(--rule)' }} value={name} required onChange={e => setName(e.target.value)} />
      </div>
      <fieldset>
        <legend className={LABEL} style={{ color: 'var(--ink-2)' }}>Who played</legend>
        <div className="flex gap-4 text-sm">
          {PLAYED_BY.map(([value, label]) => (
            <label key={value} className="inline-flex items-center gap-1.5">
              <input type="radio" name="played-by" value={value} checked={playedBy === value} onChange={() => setPlayedBy(value)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className={LABEL} htmlFor="run-notes" style={{ color: 'var(--ink-2)' }}>Notes</label>
        <textarea id="run-notes" className={FIELD} style={{ borderColor: 'var(--rule)' }} rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      {rounds.length === 1 && (
        <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Round 2 has not ended, so this record holds Round 1 only.</p>
      )}
      {error && <p role="alert" className="text-sm" style={{ color: 'var(--warn)' }}>{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="navy" disabled={!name.trim() || saving}>Save</Button>
      </div>
    </form>
  );
};

export const SaveRunDialog: React.FC<SaveRunDialogProps> = props => (
  <Modal isOpen={props.open} onClose={props.onClose} title="Save run record">
    {/* Mounted only while open, so each opening starts from fresh defaults. */}
    <SaveRunForm {...props} />
  </Modal>
);
