import React, { useMemo, useState } from 'react';
import { useGame } from '../context';
import { Button, Card, StatBox, RoleLayout, Modal, SectionLabel, BRAND, fmt$ } from '../components';
import {
  Send, Zap, GripVertical, ChevronUp, ChevronDown, Check, X as XIcon,
  Star, BadgeCheck, CheckCircle2, Minus, MousePointerClick,
  Scissors, CornerDownLeft,
  Briefcase, GraduationCap, Cpu, Bot, PawPrint, Medal, Coffee,
  Smartphone, BookOpen, Pencil, type LucideIcon,
} from 'lucide-react';
import { SIM_CONFIG } from '../config/simConfig';
import { DIMENSIONS, CATEGORICAL_DIMS, IDEAL_PROFILE, dimById, dimProx } from '../config/dimensions';

/* ---- Icon lookup for the 10 Topic palette ---- */
const TOPIC_ICONS: Record<string, LucideIcon> = {
  Briefcase, GraduationCap, Cpu, Bot, PawPrint, Medal,
  Coffee, Smartphone, BookOpen, Pencil,
};

/* ---- Helpers ---- */
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/* deterministic 0..1 from an integer — keeps the revealed dim subset stable per joke */
const mkSeed = (n: number) => {
  const x = Math.sin(n * 99.13) * 10000;
  return x - Math.floor(x);
};

/* ---- Dim metadata for rendering revealed dims on each sale ---- */
interface RevealedDim {
  dim: ReturnType<typeof dimById>;
  level: string;
  prox: number;
}

/* Build a default-classified joke from text for demo/seed signals:
   we lean on the IDEAL_PROFILE so a published joke has a plausible level on each dim. */
function defaultDims(): Record<string, string> {
  return { ...IDEAL_PROFILE };
}

/* The dims a sale reveals: one of the top-3 closest + two seeded-random others. */
function revealedDimsFor(jokeId: number, dims: Record<string, string>): RevealedDim[] {
  const scored: RevealedDim[] = DIMENSIONS.map(d => ({
    dim: d,
    level: dims[d.id] ?? d.levels[0],
    prox: dimProx(d, dims[d.id] ?? d.levels[0]),
  }));
  const ranked = [...scored].sort((a, b) => b.prox - a.prox);
  const top = ranked[Math.floor(mkSeed(jokeId) * 3) % Math.min(3, ranked.length)];
  const rest = scored.filter(s => s.dim!.id !== top.dim!.id);
  const r1 = rest[Math.floor(mkSeed(jokeId + 1) * rest.length)];
  let r2 = rest[Math.floor(mkSeed(jokeId + 7) * rest.length)];
  if (r2 && r1 && r2.dim!.id === r1.dim!.id) {
    r2 = rest[(rest.indexOf(r1) + 1) % rest.length];
  }
  return [top, r1, r2].filter(Boolean) as RevealedDim[];
}

/* ============================ Dim scale ============================ */
const DimScale: React.FC<{ dim: ReturnType<typeof dimById>; level: string; prox: number }> = ({
  dim, level, prox,
}) => {
  if (!dim) return null;
  const onTarget = prox >= 0.999;
  if (CATEGORICAL_DIMS.has(dim.id)) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-gray-500 w-14 shrink-0">{dim.label}</span>
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${onTarget ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
          {onTarget ? <Check size={11} /> : <XIcon size={11} />} {level}
        </span>
      </div>
    );
  }
  const frac = Math.max(0, Math.min(1, prox));
  const maxLevel = dim.levels[dim.levels.length - 1];
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="text-[10px] font-semibold text-gray-500 truncate">{dim.label}</span>
        <span className={`text-[10px] truncate ${onTarget ? 'text-emerald-700 font-semibold' : 'text-gray-500'}`}>{level}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-gray-400 truncate max-w-[58px]">{dim.levels[0]}</span>
        <div
          className="relative flex-1 h-1.5 rounded-full"
          style={{ background: 'linear-gradient(90deg,#e5e7eb 0%,#d9f2e1 55%,#22c55e 100%)' }}
        >
          <span
            className="absolute top-1/2 rounded-full bg-white"
            style={{
              left: `calc(5px + (100% - 10px) * ${frac})`,
              width: 11, height: 11,
              transform: 'translate(-50%,-50%)',
              border: `2px solid ${onTarget ? '#16a34a' : '#94a3b8'}`,
              boxShadow: '0 1px 2px rgb(0 0 0 / .15)',
            }}
          />
        </div>
        <span className="text-[9px] text-gray-400 truncate max-w-[58px] text-right">{maxLevel}</span>
      </div>
    </div>
  );
};

/* ============================ Sold signal ============================ */
const SoldSignal: React.FC<{ entry: { id: number; text: string; title: string; dims: RevealedDim[] } }> = ({ entry }) => {
  const top2 = [...entry.dims].sort((a, b) => b.prox - a.prox).slice(0, 2).map(s => s.dim!.label.toLowerCase());
  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 mk-fade-in">
      <div className="flex items-center gap-1.5 mb-1.5">
        <BadgeCheck size={13} className="text-emerald-600 shrink-0" />
        <span className="text-[11px] font-semibold text-emerald-700">
          Sold{entry.title ? ` · "${entry.title}"` : ''}
        </span>
      </div>
      <p className="text-[11px] text-gray-500 italic mb-2 line-clamp-2">{entry.text}</p>
      {top2.length === 2 && (
        <p className="text-[11px] text-gray-700 mb-2.5">
          Bought because the <b>{top2[0]}</b> and <b>{top2[1]}</b> were right.
        </p>
      )}
      <div className="space-y-1.5">
        {entry.dims.map(s => <DimScale key={s.dim!.id} dim={s.dim} level={s.level} prox={s.prox} />)}
      </div>
    </div>
  );
};

/* ============================ Phase 1: interactive batch splitter ============================
   Marketing reads the raw AI blob and splits it into individual jokes by placing a
   caret between texts. Everything before the caret highlights; Enter or the
   "Split Above?" button carves it off as the next joke. Auto-finalizes at targetCount
   (Round 1). Removing a split card re-opens everything from that point. */

/** Compute the character offset within `container` for a click at (x, y). */
function offsetFromPoint(container: HTMLElement, x: number, y: number): number | null {
  let range: Range | null = null;
  const doc = document as any;
  if (doc.caretRangeFromPoint) {
    range = doc.caretRangeFromPoint(x, y);
  } else if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
    }
  }
  if (!range) return null;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node === range.startContainer) return offset + range.startOffset;
    offset += (node.textContent || '').length;
  }
  return null;
}

const BatchSplitter: React.FC<{
  rawText: string;
  targetCount: number | null; // R1 = 5 (soft hint only — no auto-advance)
  onComplete: (jokes: string[]) => void;
}> = ({ rawText, targetCount, onComplete }) => {
  // Offset model: one immutable-ish `text` + a sorted list of cut offsets. Cards are the
  // segments before the last cut; `working` is the tail (editable). Removing a cut is
  // lossless — it never inserts a separator, so undo restores the original format exactly.
  const [text, setText] = useState(rawText.trim());
  const [cuts, setCuts] = useState<number[]>([]);
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
  const boxEmpty = working.trim() === '';
  // Count of jokes made so far (cards) + any remaining chunk (shown as the pending last joke).
  const shownCount = splits.length + (boxEmpty ? 0 : 1);
  // Confirm is only allowed once every joke is a card and the box is empty.
  const canConfirm = splits.length > 0 && boxEmpty;

  const suppressSyncRef = React.useRef(false);
  const syncCaret = () => {
    if (suppressSyncRef.current) return; // ignore the keyup/select that fires right after a split
    if (taRef.current) setCaret(taRef.current.selectionStart ?? 0);
  };

  // Measure the caret marker (in the mirror layer) and float the split button next to it.
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

  /** Edit only the working tail; cuts (all before lastCut) stay valid. */
  const editWorking = (newVal: string) => {
    setText(text.slice(0, lastCut) + newVal);
  };

  /** Explicit commit — the ONLY way to leave Phase 1 (box must be empty). */
  const confirm = () => {
    const jokes = splits.map(s => s.trim()).filter(Boolean);
    if (jokes.length) onComplete(jokes);
  };

  // Shared box-model so the mirror highlight lines up exactly with the textarea.
  const boxClass =
    'joke-font text-[16px] leading-relaxed whitespace-pre-wrap break-words rounded-lg border px-3 py-3 min-h-[280px] w-full';

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 text-blue-800 rounded-lg px-3 py-2.5 text-sm flex items-start gap-2">
        <Scissors size={16} className="mt-0.5 shrink-0" />
        <span>
          <b>Split the batch.</b> Put the cursor between two jokes and press <b>Enter</b> (or click
          <b> Split</b>). 
        </span>
      </div>

      {/* already-split jokes */}
      {splits.length > 0 && (
        <div className="space-y-1.5">
          {splits.map((s, i) => (
            <div key={i} className="group flex items-start gap-2 rounded-md border border-[#ffe08a] bg-[#ffd100]/[0.14] px-3 py-2">
              <span className="shrink-0 w-5 h-5 grid place-items-center rounded bg-[#003b5c] text-white text-[10px] font-bold tabular-nums mt-0.5">
                {i + 1}
              </span>
              <span className="joke-font text-gray-900 text-[15px] leading-snug flex-1">{s}</span>
              <button
                onClick={() => undoFrom(i)}
                title="Undo from here"
                className="text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition shrink-0 mt-0.5"
              >
                <XIcon size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* working chunk — editable textarea with a highlight mirror behind it */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <SectionLabel>Unsplit text {boxEmpty ? '(empty)' : ''}</SectionLabel>
          <span className="text-[11px] text-gray-400">
            {shownCount}{targetCount != null ? `/${targetCount}` : ''} jokes
          </span>
        </div>

        <div ref={containerRef} className="relative">
          {/* mirror: renders the same text, transparent, only the highlight bg + caret marker show */}
          <div
            aria-hidden
            className={`${boxClass} absolute inset-0 text-transparent border-transparent pointer-events-none overflow-hidden select-none`}
          >
            <span className="bg-[#ffd100]/45 rounded-sm">{working.slice(0, safeCaret)}</span>
            <span ref={markerRef} style={{ display: 'inline-block', width: 0 }} />
            {working.slice(safeCaret)}
            {'​'}
          </div>

          {/* editable textarea on top */}
          <textarea
            ref={taRef}
            value={working}
            onChange={(e) => { editWorking(e.target.value); requestAnimationFrame(syncCaret); }}
            onClick={syncCaret}
            onKeyUp={syncCaret}
            onSelect={syncCaret}
            onKeyDown={(e) => {
              // Enter splits at the caret; Shift+Enter inserts a line break (for editing).
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSplit(); }
            }}
            spellCheck={false}
            placeholder="All text split — review your jokes above, then confirm."
            className={`${boxClass} relative bg-transparent text-gray-900 border-gray-300 resize-y outline-none focus:ring-2 focus:ring-[#8bb8e8]`}
            style={{ caretColor: '#005587' }}
          />

          {/* floating split button — pinned to the caret, layered above the text */}
          {caretPos && canSplit && (
            <button
              onClick={doSplit}
              style={{ position: 'absolute', top: caretPos.top, left: caretPos.left + 4, transform: 'translateY(-1px)', zIndex: 10 }}
              className="inline-flex items-center gap-1 rounded-md bg-[#ffd100] text-[#003b5c] text-[11px] font-sans font-bold px-2.5 py-1 shadow-lg shadow-[#ffd100]/50 hover:bg-[#f5c400] ring-1 ring-[#003b5c]/10 whitespace-nowrap"
              title="Split off the text before the cursor"
            >
              Split <CornerDownLeft size={11} />
            </button>
          )}
        </div>
      </div>

      {/* explicit confirm — enabled only when the box is empty (every joke is a card) */}
      <div className="flex items-center justify-end pt-1 gap-3">
        {!canConfirm && (
          <span className="text-[11px] text-gray-400">
            {boxEmpty ? 'Split at least one joke first.' : 'Split the remaining text to finish.'}
          </span>
        )}
        <Button variant={canConfirm ? 'success' : 'secondary'} onClick={confirm} disabled={!canConfirm}>
          <span className="flex items-center gap-1">
            <Check size={14} /> Confirm, next
          </span>
        </Button>
      </div>
    </div>
  );
};

/* ============================ Marketing screen ============================ */
const QualityControl: React.FC = () => {
  const { user, roster, qcQueue, rateBatch, splitBatch, unsplitBatch, config, teamSummary, batches } = useGame();

  /* Live queue from API */
  const incomingJokes = useMemo(() => {
    if (!qcQueue) return [];
    return qcQueue.jokes.map(j => ({
      id: j.joke_id,
      text: j.joke_text,
    }));
  }, [qcQueue]);

  /* Local rank order — initialize from incoming */
  const [orderIds, setOrderIds] = useState<number[]>([]);
  const [topics, setTopics] = useState<Record<number, string>>({});
  const [otherText, setOtherText] = useState<Record<number, string>>({});
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [batchFeedback, setBatchFeedback] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dismissedTeamPopup, setDismissedTeamPopup] = useState(false);

  /* Sync orderIds when a new batch arrives OR the current batch gets split
     (jokes go from empty → populated for the same batch_id). Keying on a
     signature of batch_id + joke ids covers both cases without spurious resets. */
  const queueSig = qcQueue
    ? `${qcQueue.batch.batch_id}:${incomingJokes.map(j => j.id).join(',')}`
    : null;
  const prevSig = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (queueSig !== prevSig.current) {
      prevSig.current = queueSig;
      setOrderIds(incomingJokes.map(j => j.id));
      setTopics({});
      setOtherText({});
      setTitles({});
      setSelectedIds(new Set());
      setBatchFeedback('');
    }
  }, [queueSig, incomingJokes]);

  /* Marketing feedback panel: seed a sample signal from team's already-published jokes
     so the panel isn't empty on first load. Then append entries as releases happen. */
  const [sold, setSold] = useState<Array<{ id: number; text: string; title: string; dims: RevealedDim[] }>>([]);
  React.useEffect(() => {
    // Build initial sample from the current team's published-and-sold jokes once.
    if (sold.length > 0 || !user?.team) return;
    const myBatches = batches.filter(b => b.team === user?.team);
    const samples: Array<{ id: number; text: string; title: string; dims: RevealedDim[] }> = [];
    for (const b of myBatches) {
      for (const j of (b.jokes as any[])) {
        if (j.is_published && Number(j.sold_count ?? 0) > 0) {
          samples.push({
            id: j.joke_id,
            text: j.joke_text ?? j.content ?? '',
            title: j.joke_title ?? '',
            dims: revealedDimsFor(j.joke_id, j.dims ?? defaultDims()),
          });
          if (samples.length >= 3) break;
        }
      }
      if (samples.length >= 3) break;
    }
    if (samples.length) setSold(samples);
  }, [batches, user?.team, sold.length]);

  const move = (idx: number, dir: -1 | 1) => setOrderIds(o => {
    const n = [...o];
    const j = idx + dir;
    if (j < 0 || j >= n.length) return o;
    [n[idx], n[j]] = [n[j], n[idx]];
    return n;
  });
  const onDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) return;
    setOrderIds(o => {
      const n = [...o];
      const [m] = n.splice(dragIdx, 1);
      n.splice(i, 0, m);
      return n;
    });
    setDragIdx(i);
  };
  const endDrag = () => setDragIdx(null);

  const toggle = (id: number) => setSelectedIds(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const jokeById = (id: number) => incomingJokes.find(j => j.id === id);
  const submittingIds = selectedIds.size
    ? orderIds.filter(id => selectedIds.has(id))
    : orderIds[0] != null ? [orderIds[0]] : [];
  const isSubmitting = (id: number) => submittingIds.includes(id);

  const canRelease = submittingIds.length > 0 && submittingIds.every(
    id =>
      topics[id] &&
      (topics[id] !== 'other' || (otherText[id] || '').trim().length > 0) &&
      (titles[id] || '').trim().length > 0,
  );

  const release = async () => {
    if (!canRelease || !qcQueue) return;
    /* Build ratings: 5 for submitted, 1 for not (force-release picks the 5s). */
    const ratings: Record<string, number> = {};
    const topicsOut: Record<string, string> = {};
    const titlesOut: Record<string, string> = {};
    const tagsOut: Record<string, string[]> = {};
    for (const id of orderIds) {
      const submit = submittingIds.includes(id);
      ratings[String(id)] = submit ? 5 : 1;
      if (submit) {
        topicsOut[String(id)] = topics[id] === 'other'
          ? (otherText[id] || '').trim() || 'other'
          : topics[id];
        titlesOut[String(id)] = titles[id];
      }
      tagsOut[String(id)] = []; // rank-and-select model doesn't require tags
    }

    const batchId = String(qcQueue.batch.batch_id);
    const count = submittingIds.length;
    await rateBatch(batchId, ratings, tagsOut, batchFeedback, titlesOut, topicsOut);

    /* Append SoldSignal entries for the released jokes (using IDEAL_PROFILE-derived dims). */
    setSold(prev => {
      const additions = submittingIds.map(id => {
        const j = jokeById(id)!;
        return {
          id,
          text: j?.text ?? '',
          title: (titles[id] || '').trim(),
          dims: revealedDimsFor(id, defaultDims()),
        };
      });
      return [...additions, ...prev];
    });

    const def = selectedIds.size ? '' : 'top-ranked (default) · ';
    setToast(`Released ${count} joke${count > 1 ? 's' : ''} · ${def}feedback sent to Joke Maker · −${fmt$(count * config.costOfPublishing)}`);
    window.setTimeout(() => setToast(null), 2800);
  };

  React.useEffect(() => {
    if (!config.showTeamPopup) setDismissedTeamPopup(false);
  }, [config.showTeamPopup]);

  /* Phase gate: a raw-text batch with no jokes yet must be split first. */
  const rawText = (qcQueue?.batch as any)?.raw_text as string | undefined;
  const needsSplit = !!(rawText && rawText.trim()) && incomingJokes.length === 0;
  const splitTarget = config.round === 1 ? config.round1BatchSize : null;

  /* Stats */
  const myRank = teamSummary?.rank ?? '—';
  const queueSize = qcQueue?.queue_size ?? incomingJokes.length;
  const avgScore = teamSummary?.avg_score_overall != null
    ? Number(teamSummary.avg_score_overall).toFixed(1)
    : '—';
  const totalSales = teamSummary?.total_sales ?? 0;

  return (
    <RoleLayout>
      {/* Round 2: Team popup */}
      <Modal
        isOpen={config.round === 2 && config.showTeamPopup && !dismissedTeamPopup}
        onClose={() => setDismissedTeamPopup(true)}
        title="Meet Your Team"
        showCloseButton={false}
      >
        <div className="space-y-2">
          <p className="text-sm text-gray-600">Great job! Go sit with your team members:</p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded">
            {(roster.length ? roster : (user ? [user] : [])).map(m => (
              <div key={m.id} className="flex items-center justify-between px-3 py-2">
                <span className="font-medium text-gray-900">{m.name}</span>
                <span className="text-xs font-bold text-gray-500">{m.role.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Marketing Desk */}
        <div className="lg:col-span-2 space-y-6">
          <Card
            title="Marketing Desk"
            subtitle={needsSplit
              ? 'Read the batch · click to place a cut · split into individual jokes'
              : 'Rank the cards (best on top) · assign Topic · click to submit · title each · release'}
            accent={BRAND.marketing}
          >
            {needsSplit ? (
              <BatchSplitter
                key={qcQueue?.batch?.batch_id}
                rawText={rawText!}
                targetCount={splitTarget}
                onComplete={(jokes) => {
                  if (qcQueue) splitBatch(String(qcQueue.batch.batch_id), jokes);
                }}
              />
            ) : orderIds.length === 0 ? (
              <div className="text-center py-12">
                <div className="bg-green-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="text-green-500" size={32} />
                </div>
                <h3 className="text-lg font-medium text-gray-900">All Clear!</h3>
                <p className="text-gray-500">Waiting for Joke Maker to submit new batches.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Escape hatch: re-open this batch in the splitting phase if the split was wrong. */}
                <div className="flex justify-end">
                  <button
                    onClick={() => { if (qcQueue) unsplitBatch(String(qcQueue.batch.batch_id)); }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#00456e] bg-[#8bb8e8]/20 border border-[#8bb8e8] px-2.5 py-1 rounded-md hover:bg-[#8bb8e8]"
                    title="Re-open this batch to fix the splitting"
                  >
                    <Scissors size={12} /> Back to splitting
                  </button>
                </div>
                {orderIds.map((id, idx) => {
                  const j = jokeById(id);
                  if (!j) return null;
                  const selected = selectedIds.has(id);
                  const isDefault = !selectedIds.size && idx === 0;
                  const submitting = selected || isDefault;
                  const dragging = dragIdx === idx;
                  return (
                    <div
                      key={id}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('button, input, textarea')) return;
                        toggle(id);
                      }}
                      draggable
                      onDragStart={(e) => {
                        if ((e.target as HTMLElement).closest('button, input, textarea')) {
                          e.preventDefault();
                          return;
                        }
                        setDragIdx(idx);
                      }}
                      onDragOver={(e) => onDragOver(e, idx)}
                      onDragEnd={endDrag}
                      onDrop={endDrag}
                      className={`rounded-xl border-2 p-4 cursor-pointer transition-all shadow-sm hover:shadow-md ${
                        dragging ? 'opacity-40' : ''
                      } ${
                        selected
                          ? 'bg-green-50 border-green-400 ring-2 ring-green-200'
                          : isDefault
                          ? 'bg-white border-amber-300 border-dashed'
                          : 'bg-white border-gray-200 hover:border-[#8bb8e8]'
                      }`}
                    >
                      {submitting ? (
                        <div className={`mb-3 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-md px-3 py-2 ${
                          selected ? 'bg-green-600 text-white' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {selected ? <Check size={14} /> : <Star size={14} />}
                          {selected ? 'Selected to submit' : 'Top rank — submits by default'}
                        </div>
                      ) : (
                        <div className="mb-3 flex items-center justify-center gap-1.5 text-xs font-medium rounded-md px-3 py-2 bg-white border border-dashed border-gray-300 text-gray-500">
                          <MousePointerClick size={13} />
                          Click to submit
                        </div>
                      )}

                      <div className="flex items-start gap-3">
                        {idx < 3 ? (
                          <span className="shrink-0 flex flex-col items-center justify-center w-11 h-11 rounded-lg bg-gray-900 text-white leading-none">
                            <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400">Rank</span>
                            <span className="text-base font-extrabold tabular-nums mt-0.5">{ordinal(idx + 1)}</span>
                          </span>
                        ) : (
                          <span
                            className="shrink-0 flex items-center justify-center w-11 h-11 rounded-lg bg-gray-100 text-gray-400 leading-none"
                            title="Unranked"
                          >
                            <Minus size={18} />
                          </span>
                        )}
                        <blockquote className="flex-1 border-l-[3px] border-[#8bb8e8] pl-3 py-0.5">
                          <p className="joke-font text-gray-900 text-[17px] leading-relaxed text-pretty">{j.text}</p>
                        </blockquote>
                        <div className="shrink-0 flex flex-col items-center gap-0.5">
                          <GripVertical size={16} className="text-gray-300" />
                          <button
                            onClick={() => move(idx, -1)}
                            disabled={idx === 0}
                            title="Rank higher"
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:cursor-not-allowed"
                          >
                            <ChevronUp size={15} />
                          </button>
                          <button
                            onClick={() => move(idx, 1)}
                            disabled={idx === orderIds.length - 1}
                            title="Rank lower"
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:cursor-not-allowed"
                          >
                            <ChevronDown size={15} />
                          </button>
                        </div>
                      </div>

                      {submitting && (
                        <div className="mt-3">
                          <SectionLabel className="mb-1.5">
                            Topic <span className="text-rose-500">· required</span>
                          </SectionLabel>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
                            {SIM_CONFIG.categories.map(c => {
                              const on = topics[id] === c.id;
                              const Ic = TOPIC_ICONS[c.icon];
                              return (
                                <button
                                  key={c.id}
                                  onClick={() => setTopics(t => ({ ...t, [id]: c.id }))}
                                  className={`inline-flex items-center justify-center gap-1 text-[11px] px-2 py-1.5 rounded-md border transition-colors ${
                                    on ? 'bg-[#005587] text-white border-[#005587]' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                                  }`}
                                >
                                  {Ic && <Ic size={12} />} {c.label}
                                </button>
                              );
                            })}
                          </div>
                          {topics[id] === 'other' && (
                            <input
                              value={otherText[id] || ''}
                              onChange={(e) => setOtherText(t => ({ ...t, [id]: e.target.value }))}
                              placeholder="Type a custom topic…"
                              maxLength={30}
                              className="mt-2 w-full bg-white border border-[#8bb8e8] rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#8bb8e8]"
                            />
                          )}
                        </div>
                      )}

                      {submitting && (
                        <div className="mt-3">
                          <SectionLabel className="mb-1.5">
                            Market title <span className="text-gray-400">(this joke)</span>
                          </SectionLabel>
                          <input
                            value={titles[id] || ''}
                            onChange={(e) => setTitles(t => ({ ...t, [id]: e.target.value }))}
                            placeholder="A short market title for this joke…"
                            maxLength={120}
                            className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#8bb8e8]"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <SectionLabel className="mb-1.5">
                    Batch feedback <span className="text-gray-400">(sent to Joke Maker)</span>
                  </SectionLabel>
                  <textarea
                    value={batchFeedback}
                    onChange={(e) => setBatchFeedback(e.target.value)}
                    rows={3}
                    placeholder="Notes on the whole batch — what landed, what to drop next round…"
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#8bb8e8] resize-none placeholder-gray-400"
                  />
                </div>

                <div className="flex items-center justify-end pt-1">
                  <Button variant={canRelease ? 'success' : 'secondary'} onClick={release} disabled={!canRelease}>
                    <span className="flex items-center gap-1">Release to market <Send size={15} /></span>
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT: stats + sold-signal learning panel */}
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <StatBox label="Current Rank" value={String(myRank)} tone="rank" />
            <StatBox label="Queue" value={queueSize} tone="blue" />
            <StatBox label="Avg Score" value={avgScore} tone="sky" />
            <StatBox label="Total Sales" value={totalSales} tone="emerald" />
          </div>
          <Card
            title="What's selling — and why"
            subtitle="Each sale is free market research: which attributes matched customer demand"
            accent={BRAND.sold}
          >
            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {sold.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">
                  No sales yet — release jokes to start uncovering the target.
                </p>
              ) : (
                sold.map(e => <SoldSignal key={e.id} entry={e} />)
              )}
            </div>
          </Card>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2">
          <Zap size={16} className="text-[#005587]" /> {toast}
        </div>
      )}
    </RoleLayout>
  );
};

export default QualityControl;
