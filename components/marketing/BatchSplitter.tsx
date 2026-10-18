import React, { useMemo, useState } from 'react';
import { CornerDownLeft } from 'lucide-react';
import { splitStatus } from '../../services/desk';

/* ============================ Phase 1: interactive batch splitter ============================
   Marketing reads the raw AI blob and splits it into individual jokes by placing a
   caret between texts. Everything before the caret highlights; Enter or the
   "Cut" button carves it off as the next joke. Never auto-advances. Removing a
   cut card re-opens everything from that point. */

const MONO = "'IBM Plex Mono', ui-monospace, monospace";

/* Shared box model so the mirror highlight lines up exactly with the textarea. */
const BOX_STYLE: React.CSSProperties = {
  border: '1px solid var(--rule)',
  borderRadius: 'var(--r-md)',
  padding: '12px 14px',
  minHeight: 160,
  fontSize: 15,
  lineHeight: 1.6,
};

/** The batch-size squares of Round 1, filled by cut pieces. */
const Squares: React.FC<{ filled: number; total: number }> = ({ filled, total }) => (
  <span className="inline-flex gap-[3px] mr-2 align-[-1px]" aria-hidden="true">
    {Array.from({ length: total }, (_, i) => (
      <span
        key={i}
        className="h-2.5 w-2.5 rounded-[2px]"
        style={i < filled ? { background: 'var(--navy)' } : { border: '1.5px solid var(--rule-2)' }}
      />
    ))}
  </span>
);

export const BatchSplitter: React.FC<{
  rawText: string;
  round: 1 | 2;
  /** Round 1 target: exactly this many jokes. */
  batchSize: number;
  /** Round 2: up to this many jokes. */
  limit: number;
  onComplete: (jokes: string[]) => void;
  /** Cut offsets to start from (tests only). */
  initialCuts?: number[];
}> = ({ rawText, round, batchSize, limit, onComplete, initialCuts }) => {
  // Offset model: one immutable `text` + a sorted list of cut offsets. Cards are the
  // segments before the last cut; `working` is the tail. Removing a cut is lossless —
  // it never inserts a separator, so undo restores the original format exactly.
  // The text is READ-ONLY: Marketing decides where the cuts go, never what the jokes say.
  // (The component is keyed on batch_id by the caller, so a new batch remounts it.)
  const text = useMemo(() => rawText.trim(), [rawText]);
  const [cuts, setCuts] = useState<number[]>(initialCuts ?? []);
  const [caret, setCaret] = useState<number>(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const markerRef = React.useRef<HTMLSpanElement>(null);
  const [caretPos, setCaretPos] = useState<{ top: number; left: number } | null>(null);

  const lastCut = cuts.length ? cuts[cuts.length - 1] : 0;
  const working = text.slice(lastCut);
  const splits = cuts.map((c, i) => text.slice(i === 0 ? 0 : cuts[i - 1], c));

  const safeCaret = Math.min(caret, working.length);
  const highlighted = working.slice(0, safeCaret).trim();
  const canSplit = highlighted.length > 0;
  // Only cut pieces count as jokes; the uncut remainder is not one yet.
  const status = splitStatus({ cuts: splits.length, remainder: working, round, batchSize, limit });

  const suppressSyncRef = React.useRef(false);
  const syncCaret = () => {
    if (suppressSyncRef.current) return; // ignore the keyup/select that fires right after a split
    if (taRef.current) setCaret(taRef.current.selectionStart ?? 0);
  };

  // Measure the caret marker (in the mirror layer) and float the cut button next to it.
  React.useLayoutEffect(() => {
    if (!canSplit || !markerRef.current || !containerRef.current) {
      setCaretPos(null);
      return;
    }
    const mr = markerRef.current.getBoundingClientRect();
    const cr = containerRef.current.getBoundingClientRect();
    setCaretPos({ top: mr.top - cr.top, left: mr.left - cr.left });
  }, [safeCaret, working, canSplit]);

  /** Add a cut at the caret (absolute offset into `text`). Never auto-advances. */
  const doSplit = () => {
    if (!working.slice(0, safeCaret).trim()) return;
    // Advance the cut past trailing whitespace so the working chunk starts clean (no blank line).
    let newCut = lastCut + safeCaret;
    while (newCut < text.length && /\s/.test(text[newCut])) newCut++;
    suppressSyncRef.current = true; // ignore the keyup that follows an Enter-split
    setCuts([...cuts, newCut]);
    setCaret(0);
    requestAnimationFrame(() => {
      const t = taRef.current;
      if (t) { t.focus(); t.setSelectionRange(0, 0); }
      suppressSyncRef.current = false;
    });
  };

  /** Remove card `i` and everything after — merges it back into the working chunk losslessly. */
  const undoFrom = (i: number) => {
    setCuts(cuts.slice(0, i));
    setCaret(0);
  };

  /** Explicit commit — the ONLY way to leave Phase 1 (the count must be valid).
   *  Strips the AI's leading list markers ("1) ", "2." …) so they don't reach the
   *  market or the classifier — Marketing can no longer delete them by hand. */
  const confirm = () => {
    if (!status.valid) return;
    const jokes = splits
      .map(s => s.trim().replace(/^\d{1,2}\s*[.)]\s*/, '').trim())
      .filter(Boolean);
    if (jokes.length) onComplete(jokes);
  };

  return (
    <div className="space-y-3">
      {/* already-cut jokes */}
      {splits.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {splits.map((s, i) => (
            <div
              key={i}
              className="group grid grid-cols-[28px_1fr_auto] items-baseline gap-2.5 px-3 py-2"
              style={{ background: 'var(--sheet)', border: '1px solid var(--rule)', borderRadius: 'var(--r-md)' }}
            >
              <span className="text-[12.5px]" style={{ fontFamily: MONO, color: 'var(--ink-3)' }}>{`#${i + 1}`}</span>
              <p className="joke-font m-0 text-[15px] leading-normal" style={{ color: 'var(--ink)' }}>{s}</p>
              <button
                type="button"
                onClick={() => undoFrom(i)}
                className="text-[12.5px] font-medium opacity-0 transition-opacity hover:underline group-hover:opacity-100 focus:opacity-100 group-focus-within:opacity-100"
                style={{ color: 'var(--ink-3)' }}
              >
                Undo from here
              </button>
            </div>
          ))}
        </div>
      )}

      {/* the text still to split: a read-only textarea over a highlight mirror */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
          <span>Still to split</span>
          <span className="inline-flex items-center">
            {round === 1 && <Squares filled={splits.length} total={batchSize} />}
            <span className="tabular-nums" style={{ fontFamily: MONO }}>
              {round === 1 ? `${splits.length} of ${batchSize}` : `${splits.length}, up to ${limit}`}
            </span>
          </span>
        </div>

        <div ref={containerRef} className="relative">
          {/* mirror: renders the same text, transparent, only the highlight bg + caret marker show */}
          <div
            aria-hidden
            className="joke-font absolute inset-0 w-full overflow-hidden whitespace-pre-wrap break-words pointer-events-none select-none"
            style={{ ...BOX_STYLE, color: 'transparent', borderColor: 'transparent' }}
          >
            <span className="rounded-sm" style={{ background: 'var(--navy-tint)' }}>{working.slice(0, safeCaret)}</span>
            <span ref={markerRef} style={{ display: 'inline-block', width: 0 }} />
            {working.slice(safeCaret)}
            {'​'}
          </div>

          {/* read-only textarea on top — caret still moves, but the text can't change.
              readOnly (not disabled) keeps focus, caret, selection and key handling,
              which the mirror highlight and the floating cut button both depend on.
              In a watch tab the enclosing Marketing desk fieldset disables it as well,
              and that is intended: the watcher must not place cuts for the bot. */}
          <textarea
            ref={taRef}
            value={working}
            readOnly
            onClick={syncCaret}
            onKeyUp={syncCaret}
            onSelect={syncCaret}
            onKeyDown={(e) => {
              // Enter cuts at the caret. The text itself is not editable.
              if (e.key === 'Enter') { e.preventDefault(); doSplit(); }
            }}
            spellCheck={false}
            aria-label="Unsplit text. Put the cursor between two jokes and press Enter."
            placeholder="All text split. Review your jokes above, then confirm."
            className="joke-font relative block w-full resize-y whitespace-pre-wrap break-words outline-none cursor-text bg-transparent focus:border-[color:var(--navy)]"
            style={{ ...BOX_STYLE, color: 'var(--ink)', caretColor: 'var(--navy)' }}
          />

          {/* floating cut button — pinned to the caret, layered above the text */}
          {caretPos && canSplit && (
            <button
              type="button"
              onClick={doSplit}
              style={{ position: 'absolute', top: caretPos.top, left: caretPos.left + 4, transform: 'translateY(-1px)', zIndex: 10 }}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-[color:var(--navy)] px-2.5 py-1 text-[11px] font-semibold text-white"
              title="Cut off the text before the cursor"
            >
              Cut <CornerDownLeft size={11} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 pt-1">
        <div className="grid gap-0.5">
          <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
            Click between two jokes and press <Keycap>Enter</Keycap> to cut. The wording stays as written.
          </span>
          <span className="text-[13px]" style={{ color: 'var(--ink-3)' }} role="status">{status.message}</span>
        </div>
        <button
          type="button"
          onClick={confirm}
          disabled={!status.valid}
          className={`shrink-0 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
            status.valid
              ? 'bg-[color:var(--gold)] hover:bg-[color:var(--gold-2)] text-[color:var(--navy)]'
              : 'bg-[color:var(--paper-2)] text-[color:var(--ink-3)]'
          }`}
        >
          Confirm, next <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
};

const Keycap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd
    className="mx-px inline-block rounded px-1.5 pb-px text-xs font-semibold align-[1px]"
    style={{
      fontFamily: MONO, color: 'var(--ink)', background: 'var(--sheet)',
      border: '1px solid var(--rule-2)', borderBottomWidth: 2,
    }}
  >
    {children}
  </kbd>
);
