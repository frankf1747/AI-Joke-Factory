/* "Save run record": names the run, says who played, downloads the JSON and CSV, then stays
   open offering both files again in case the browser blocked one
   (docs/superpowers/specs/2026-11-12-experiment-records-design.md §4). */
import React, { useEffect, useRef, useState } from 'react';
import { Button, Modal } from '../../components';
import { instructorApi } from '../../services/api/instructor';
import { instructorService } from '../../services/instructorService';
import type { LeaderboardRow } from '../../services/classTotals';
import type { FeeRates } from '../../services/shownFees';
import { downloadText } from '../../services/download';
import { defaultPlayedBy, defaultRunName } from '../../services/runRecord/build';
import { botTeams } from '../../services/runRecord/botRegistry';
import {
  collectRunRecord, roundInputs, savableRounds, savedFiles, type SavedFile, type SavedRun, type SaveRunDeps,
} from '../../services/runRecord/saveRun';
import type { PlayedBy } from '../../services/runRecord/types';

export { collectRunRecord, savableRounds } from '../../services/runRecord/saveRun';
export type { SavedRun, SaveRunDeps, SaveRunInput } from '../../services/runRecord/saveRun';

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
  /** Tests: open already saving, or already saved. */
  initialState?: { saving: true } | { saved: SavedRun };
}

const REAL_DEPS: SaveRunDeps = {
  getConfig: id => instructorService.getRoundConfig(id) as Promise<Awaited<ReturnType<SaveRunDeps['getConfig']>>>,
  getCharts: id => instructorApi.leanCharts(id),
};

const PLAYED_BY: ReadonlyArray<readonly [PlayedBy, string]> = [['students', 'Students'], ['bots', 'Bots'], ['mixed', 'Mixed']];
const LABEL = 'block text-sm font-medium mb-1';
const FIELD = 'w-full rounded-md border px-3 py-2 text-sm';

const download = (f: SavedFile) => downloadText(f.fileName, f.text, f.mime);

/** The body of the dialog's mount effect: `closed` reads false while mounted, true once unmounted.
    It re-opens on every setup, because StrictMode (index.tsx) runs setup, cleanup, setup on mount. */
export function trackClosed(closed: { current: boolean }): () => void {
  closed.current = false;
  return () => { closed.current = true; };
}

/** Mounted only while open, so each opening starts from fresh defaults. */
const SaveRunBody: React.FC<SaveRunDialogProps> = props => {
  const { onClose, roundIds, roundStatuses, statsR1, statsR2, ratesR1, ratesR2, teamNames, deps = REAL_DEPS, initialState } = props;
  const rounds = savableRounds(roundStatuses);
  const bots = botTeams();
  const playing = (statsR1?.leaderboard ?? []).map(row => Number(row.team.id));
  const [name, setName] = useState(() => defaultRunName(new Date()));
  const [playedBy, setPlayedBy] = useState<PlayedBy>(() => defaultPlayedBy(playing, new Set(bots.keys())));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(initialState != null && 'saving' in initialState);
  const [saved, setSaved] = useState<SavedRun | null>(initialState != null && 'saved' in initialState ? initialState.saved : null);
  const [error, setError] = useState<string | null>(null);
  // Set when the dialog closes, so a save still in flight downloads nothing.
  const closed = useRef(false);
  useEffect(() => trackClosed(closed), []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const inputs = roundInputs(rounds, roundIds, { 1: statsR1, 2: statsR2 }, { 1: ratesR1, 2: ratesR2 });
      const record = await collectRunRecord({ name, notes, playedBy, now: new Date(), rounds: inputs, teamNames, bots }, deps);
      if (closed.current) return;
      const files = savedFiles(name, record);
      download(files.json);
      download(files.csv);
      setSaved(files);
    } catch (e) {
      if (closed.current) return;
      setError(e instanceof Error ? e.message : 'Could not save the run record');
    }
    setSaving(false);
  };

  return (
    <Modal isOpen onClose={onClose} title="Save run record" showCloseButton={!saving}>
      {saved ? (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>Saved. If a file did not download, use the links below.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => download(saved.json)}>Download record (.jfrun.json)</Button>
            <Button type="button" variant="outline" onClick={() => download(saved.csv)}>Download spreadsheet (.csv)</Button>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="navy" onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
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
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="navy" disabled={!name.trim() || saving}>Save</Button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export const SaveRunDialog: React.FC<SaveRunDialogProps> = props => (props.open ? <SaveRunBody {...props} /> : null);
