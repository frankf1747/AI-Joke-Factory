/* The Instructor's Compare tab (docs/superpowers/specs/2026-11-12-experiment-records-design.md §5):
   saved run records side by side, settings, measures, learning curves and teams. Works without a
   live class; everything happens in the browser on the loaded files. */
import React, { useEffect, useRef, useState } from 'react';
import { Button, Card } from '../../components';
import { downloadText } from '../../services/download';
import {
  comparisonCsv, everyRunHasFit, loadCriteria, saveCriteria, type Criterion, type CriterionKey,
} from '../../services/runRecord/compare';
import { addRecords, MAX_RECORD_BYTES, type LoadedRun, type Refusal } from '../../services/runRecord/parse';
import { RunHeaders } from './compare/RunHeaders';
import { SettingsTable } from './compare/SettingsTable';
import { MeasuresTable } from './compare/MeasuresTable';
import { BatchChart } from './compare/BatchChart';
import { LABEL_WIDTH, RUN_MIN_WIDTH, SectionTitle } from './compare/layout';

function safeLocalStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/** Reads each file's text, then adds them in one go; a file over 5 MB is refused unread, one that cannot be read is refused. */
export async function readFiles(files: readonly File[]): Promise<{ readable: Array<{ fileName: string; text: string }>; unreadable: Refusal[] }> {
  const results = await Promise.all(files.map(async (f): Promise<{ ok: true; fileName: string; text: string } | { ok: false; fileName: string; reason: string }> => {
    if (f.size > MAX_RECORD_BYTES) return { ok: false, fileName: f.name, reason: 'is larger than 5 MB' };
    try {
      return { ok: true, fileName: f.name, text: await f.text() };
    } catch {
      return { ok: false, fileName: f.name, reason: 'could not be read' };
    }
  }));
  return {
    readable: results.flatMap(r => (r.ok ? [{ fileName: r.fileName, text: r.text }] : [])),
    unreadable: results.flatMap(r => (r.ok ? [] : [{ fileName: r.fileName, reason: r.reason }])),
  };
}

const MUTED = { color: 'var(--ink-3)' };

/** initialRuns: runs loaded on first render. Only the open tab is mounted, so the Instructor
 *  screen keeps the runs through onRunsChange and hands them back here; the render tests use it too. */
export const CompareTab: React.FC<{ initialRuns?: LoadedRun[]; onRunsChange?: (runs: LoadedRun[]) => void }> = ({ initialRuns, onRunsChange }) => {
  const [loaded, setLoaded] = useState<{ runs: LoadedRun[]; refused: Refusal[] }>({ runs: initialRuns ?? [], refused: [] });
  const [criteria, setCriteria] = useState<Record<CriterionKey, Criterion>>(() => loadCriteria(safeLocalStorage()));
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { runs, refused } = loaded;
  const records = runs.map(r => r.record);
  const showBots = everyRunHasFit(records);
  useEffect(() => { onRunsChange?.(runs); }, [runs, onRunsChange]);

  const addFiles = async (files: readonly File[]) => {
    if (files.length === 0) return;
    const { readable, unreadable } = await readFiles(files);
    setLoaded(s => {
      const added = addRecords(s.runs, readable);
      return { runs: added.runs, refused: [...unreadable, ...added.refused] };
    });
  };
  const remove = (index: number) => setLoaded(s => ({ ...s, runs: s.runs.filter((_, i) => i !== index) }));
  const setCriterion = (key: CriterionKey, c: Criterion) => {
    const next = { ...criteria, [key]: c };
    setCriteria(next);
    saveCriteria(safeLocalStorage(), next);
  };

  return (
    <Card
      title="Compare runs"
      subtitle="Load saved run records to compare settings and results side by side."
      action={
        <Button
          variant="secondary" disabled={runs.length === 0}
          onClick={() => downloadText('run-comparison.csv', comparisonCsv(records), 'text/csv')}
        >Save comparison (CSV)</Button>
      }
    >
      <div
        className="flex flex-wrap items-center gap-3 rounded-[var(--r-md)] px-3 py-3"
        style={{ border: `1px dashed ${dragging ? 'var(--navy)' : 'var(--rule)'}`, background: dragging ? 'var(--navy-tint)' : 'var(--paper)' }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); void addFiles(Array.from(e.dataTransfer.files)); }}
      >
        <input
          type="file" accept=".json,.jfrun.json,application/json" multiple ref={inputRef} className="sr-only" tabIndex={-1}
          aria-label="Record files"
          onChange={e => { const files: File[] = e.target.files ? Array.from(e.target.files) : []; e.target.value = ''; void addFiles(files); }}
        />
        <Button variant="outline" onClick={() => inputRef.current?.click()}>Add record files</Button>
        <span className="text-[13px]" style={MUTED}>or drop files here</span>
      </div>

      {refused.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[13px]" style={{ color: 'var(--warn)' }} role="status">
          {refused.map((r, i) => <li key={i}>{`${r.fileName} ${r.reason}`}</li>)}
        </ul>
      )}

      {runs.length === 0 ? (
        <p className="py-8 text-center text-sm" style={MUTED}>
          No runs loaded yet. Save a record from Debrief after a class, then add it here.
        </p>
      ) : (
        <>
          {runs.length === 1 && <p className="mt-3 text-[13px]" style={MUTED}>Add one more run to compare.</p>}
          <div className="mt-3 overflow-x-auto">
            <div style={{ minWidth: LABEL_WIDTH + runs.length * RUN_MIN_WIDTH }}>
              <RunHeaders runs={runs} onRemove={remove} />
              <SectionTitle>Settings</SectionTitle>
              <SettingsTable records={records} />
              <SectionTitle>Measures</SectionTitle>
              <MeasuresTable records={records} showBots={showBots} criteria={criteria} onCriterion={setCriterion} />
            </div>
          </div>
          <SectionTitle>Batch by batch</SectionTitle>
          <BatchChart records={records} fitAvailable={showBots} />
        </>
      )}
    </Card>
  );
};
