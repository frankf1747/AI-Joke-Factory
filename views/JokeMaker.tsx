import React, { useMemo, useState } from 'react';
import { useGame } from '../context';
import { Button, Card, StatBox, RoleLayout, Modal, BRAND, fmt$ } from '../components';
import type { StatBoxTone } from '../components';
import {
  Send, ChevronRight, Info, CheckCircle2,
} from 'lucide-react';
import { Batch } from '../types';
import { computeAvgCreatedToPublishSeconds } from '../services/economics';
import { dimById } from '../config/dimensions';
/* The same mapper and card Marketing renders — the feedback is per TEAM, so
   both seats must read it identically. See views/feedback.ts. */
import { toFeedbackRows } from './feedback';
import { FeedbackCard } from '../components/FeedbackCard';

/* ---- per-joke status drives the status dots ---- */
type JokeStatus = 'reviewing' | 'market' | 'sold' | 'wasted';
const JOKE_STATUS: Record<JokeStatus, { label: string; color: string }> = {
  reviewing: { label: 'In review', color: '#eab308' },
  market: { label: 'On market', color: '#94a3b8' },
  sold: { label: 'Sold', color: '#059669' },
  wasted: { label: 'Wasted', color: '#e11d48' },
};

const StatusDot: React.FC<{ status: JokeStatus; size?: number; opacity?: number }> = ({
  status, size = 11, opacity,
}) => {
  const m = JOKE_STATUS[status];
  return (
    <span
      title={m.label}
      className="rounded-full inline-block shrink-0"
      style={{ width: size, height: size, background: m.color, opacity }}
    />
  );
};

/** Derive each joke's display status from the batch + joke flags. */
function jokeStatus(batch: Batch, joke: any): JokeStatus {
  // V2 renamed RATED to PROCESSED (domain/enums.go). Accept both; the mock still says RATED.
  if (batch.status !== 'PROCESSED' && batch.status !== 'RATED') return 'reviewing';
  const published = Boolean(joke.is_published);
  const sold = Number(joke.sold_count ?? 0) > 0;
  if (!published) return 'wasted';
  if (sold) return 'sold';
  return 'market';
}

/* ---- Format a duration in seconds → "Xm Ys" / "Ys" ---- */
const fmtSeconds = (s: number | null) => {
  if (s == null) return '—';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
};

/* ============================ Batch card (collapsible) ============================ */
const BatchCard: React.FC<{
  batch: Batch;
  open: boolean;
  onToggle: () => void;
}> = ({ batch, open, onToggle }) => {
  const jokes = batch.jokes as any[];
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={onToggle} className="flex items-center gap-2.5 flex-1 min-w-0 text-left group">
          <ChevronRight
            size={15}
            className="text-gray-400"
            style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}
          />
          <span className="font-mono text-xs text-gray-400">#{batch.id.slice(-4)}</span>
          <span className="flex items-center gap-1.5">
            {jokes.map((j, i) => <StatusDot key={i} status={jokeStatus(batch, j)} size={10} />)}
          </span>
          <span className="text-[11px] text-gray-400 ml-auto pl-2 group-hover:text-gray-600">
            {jokes.length} jokes
          </span>
        </button>
      </div>
      {open && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {jokes.map((j, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <span className="text-gray-300 font-mono text-[11px] shrink-0">{i + 1}</span>
              <span className="text-sm flex-1 text-gray-700">{j.joke_text ?? j.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ============================ Jokes by stage (StageDots) ============================
   Caps visible dots at 30 (15 per row × 2 rows). When the true count exceeds 30, the
   last 5 rendered dots fade on a descending opacity ramp — signaling more are hidden.
   The numeric total on the right is always the honest count. */
const STAGE_MAX_DOTS = 30;
const STAGE_FADE_TAIL = 5;

const StageDots: React.FC<{ batches: Batch[] }> = ({ batches }) => {
  const all = batches.flatMap(b => (b.jokes as any[]).map(j => ({ status: jokeStatus(b, j) })));
  const buckets: Array<[string, JokeStatus]> = [
    ['In review', 'reviewing'],
    ['On market', 'market'],
    ['Sold', 'sold'],
    ['Wasted', 'wasted'],
  ];
  return (
    <div className="space-y-2.5">
      {buckets.map(([label, st]) => {
        const items = all.filter(j => j.status === st);
        const total = items.length;
        const overflow = total > STAGE_MAX_DOTS;
        const shown = overflow ? STAGE_MAX_DOTS : total;
        return (
          <div key={st} className="flex items-center gap-3">
            <span className="text-[11px] font-semibold text-gray-500 w-20 shrink-0">{label}</span>
            <div
              className="flex flex-wrap flex-1 min-h-[10px]"
              style={{ gap: 4, maxWidth: 192 }}
            >
              {total === 0 ? (
                <span className="text-[11px] text-gray-300">—</span>
              ) : (
                Array.from({ length: shown }).map((_, i) => {
                  // Fade the last STAGE_FADE_TAIL dots when overflowing.
                  let opacity: number | undefined;
                  if (overflow) {
                    const tailIdx = i - (shown - STAGE_FADE_TAIL);
                    if (tailIdx >= 0) {
                      opacity = 1 - (tailIdx + 1) * (0.85 / STAGE_FADE_TAIL);
                    }
                  }
                  return <StatusDot key={i} status={st} size={9} opacity={opacity} />;
                })
              )}
            </div>
            <span className="text-sm font-bold tabular-nums text-gray-700 w-6 text-right">
              {total}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/* The per-batch "Marketing feedback" modal used to live here. It rendered
   batch.feedback, which NOTHING ever persisted — the publish payload carries
   only {joke_id, joke_title, is_published} and there is no batch feedback
   column — so it was permanently empty, and the button that opened it promised
   a conversation that never happened. Replaced by the team-level "Customer
   feedback" card below, which reads the real per-team route. Don't bring the
   modal back: the data it wanted is per TEAM, not per batch. */

/* ============================ Joke Maker screen ============================ */
const MIN_RAW_CHARS = 20;

const JokeMaker: React.FC = () => {
  const { user, roster, batches, submitRawBatch, config, teamSummary, teamFeedback } = useGame();

  const [input, setInput] = useState('');
  const [certified, setCertified] = useState(false);
  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [dismissedTeamPopup, setDismissedTeamPopup] = useState(false);

  const isRound1 = config.round === 1;
  const defaultRound1BatchSize = 5;
  const round1BatchSizeForUi = (isRound1 && !config.isActive) ? defaultRound1BatchSize : config.round1BatchSize;
  const targetBatchSize = isRound1 ? round1BatchSizeForUi : null;

  const myBatches: Batch[] = useMemo(
    () => batches.filter(b => b.team === user?.team),
    [batches, user?.team],
  );

  const trimmedLen = input.trim().length;
  const canSubmit = config.isActive && certified && trimmedLen >= MIN_RAW_CHARS;

  /* V2: JM pastes the raw AI output as one blob and hands it off to Marketing,
     who reads through and splits it into individual jokes. */
  const submit = async () => {
    if (!canSubmit) return;
    await submitRawBatch(input);
    setInput('');
    setCertified(false);
    setToast('Batch sent to Marketing — they will split & rate it.');
    window.setTimeout(() => setToast(null), 2600);
  };

  const toggleBatch = (id: string) => setOpenSet(s => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  /* Stats. Profit is shown here so the team feels the cost of low-quality jokes —
     it can and should go negative. Costs are Marketing's ($0.10 published /
     $0.01 discarded); creating jokes is free. */
  const myRank = teamSummary?.rank ?? '—';
  // "Total" = every joke this team has put into the factory. Note jokes only
  // become records once Marketing splits the batch, so this reads 0 until then.
  const totalJokes = teamSummary?.jokes_created ?? 0;
  const totalSales = teamSummary?.total_sales ?? 0;
  const profitRaw = teamSummary?.profit;
  const profitLabel = profitRaw == null ? '—' : fmt$(profitRaw);
  const profitTone: StatBoxTone =
    profitRaw == null ? 'slate' : profitRaw < 0 ? 'rose' : 'emerald';
  const batchesCreated = teamSummary?.batches_created ?? myBatches.length;
  // Waste = jokes that failed to reach market (rated but not published) + published-but-unsold.
  // Compute directly from batches so it matches the "Wasted" row in StageDots exactly.
  const waste = useMemo(() => {
    let count = 0;
    for (const b of myBatches) {
      for (const j of (b.jokes as any[])) {
        const st = jokeStatus(b, j);
        if (st === 'wasted') count += 1;
      }
    }
    // Include published-but-unsold (i.e. still "On market" but stale) — leave out to match
    // the stage dot semantics. The design's Wasted bucket == rejected only.
    return count;
  }, [myBatches]);

  /* Created → Publish: average time this team's batches wait between submission
     and Marketing releasing them. Was created-to-first-sale, which mixed in
     customer demand the team can't control. */
  const avgLeadSec = useMemo(
    () => computeAvgCreatedToPublishSeconds(myBatches),
    [myBatches],
  );

  /* The team's customer feedback — the same rows Marketing sees, fetched by the
     same poll in context.tsx. Per TEAM and capped at the round's
     feedback_joke_count, so it is a short standing list, not a per-batch log. */
  const feedbackRows = useMemo(() => toFeedbackRows(teamFeedback), [teamFeedback]);

  React.useEffect(() => {
    if (!config.showTeamPopup) setDismissedTeamPopup(false);
  }, [config.showTeamPopup]);

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
        {/* LEFT: Production Line + Value stream */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="Production Line" accent={BRAND.production}>
            <div className="space-y-4">
              {!config.isActive && (
                <div className="bg-yellow-50 text-yellow-800 p-3 rounded text-sm font-medium border border-yellow-200">
                  Game is currently paused. Wait for instructor to start.
                </div>
              )}

              <div className="bg-blue-50 text-blue-800 rounded-lg px-3 py-2.5 text-sm flex items-start gap-2">
                <Info size={16} className="mt-0.5 shrink-0" />
                <span>
                  <b>{isRound1 ? `Round 1:` : `Round 2:`}</b>{' '}
                  Generate {isRound1 ? `${targetBatchSize} jokes` : `your jokes`} with any AI tool and paste
                  the whole response below. Marketing will split the batch into individual jokes.
                </span>
              </div>

              <div>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={8}
                  placeholder={`Paste the full AI output here — exactly as you copied it.\n\ne.g.\n1) Why did the... \n2) I told my boss...\n3) ...`}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 resize-y placeholder-gray-400"
                  disabled={!config.isActive}
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-gray-400 italic">
                    Stuck? Try: {(dimById('TOPIC')?.categories ?? []).slice(0, 6).join(' · ')} · …
                  </p>
                  <span className="text-[11px] text-gray-400 tabular-nums">
                    {trimmedLen} chars{trimmedLen > 0 && trimmedLen < MIN_RAW_CHARS ? ` · min ${MIN_RAW_CHARS}` : ''}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={certified}
                    onChange={(e) => setCertified(e.target.checked)}
                    className="w-4 h-4 accent-blue-600"
                    disabled={!config.isActive}
                  />
                  <span className="text-sm text-gray-700">I certify these jokes are not offensive.</span>
                </label>
                <Button variant="success" onClick={submit} disabled={!canSubmit}>
                  <span className="flex items-center gap-1"><span className="font-bold">Send to Marketing</span><Send size={15} /></span>
                </Button>
              </div>
            </div>
          </Card>

          <Card title="Value stream" subtitle="Your submitted batches — batch-level status" accent={BRAND.production}>
            <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
              {myBatches.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-4">No batches yet.</p>
              )}
              {[...myBatches].reverse().map(b => (
                <BatchCard
                  key={b.id}
                  batch={b}
                  open={openSet.has(b.id)}
                  onToggle={() => toggleBatch(b.id)}
                />
              ))}
            </div>
          </Card>
        </div>

        {/* RIGHT: stat tiles + Jokes by stage + the team's customer feedback */}
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <StatBox label="Current Team Rank" value={String(myRank)} tone="rank" />
            <StatBox label="Sold / Total" value={`${totalSales}/${totalJokes}`} tone="blue" />
            <StatBox label="Profit" value={profitLabel} tone={profitTone} valueClassName="text-xl" />
            <StatBox label="Created to Publish" value={fmtSeconds(avgLeadSec)} tone="sky" />
            <StatBox label="Batches" value={batchesCreated} tone="slate" />
            <StatBox label="Content Waste" value={waste} tone="rose" />
          </div>
          <Card title="Jokes by stage" subtitle="Where your output sits right now">
            <StageDots batches={myBatches} />
          </Card>
          <Card
            title="Customer feedback"
            subtitle="Which criteria landed and which missed — the customers never say by how much"
            accent={BRAND.sold}
          >
            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {feedbackRows.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">
                  No feedback yet — release jokes to start uncovering the target.
                </p>
              ) : (
                feedbackRows.map(r => <FeedbackCard key={r.joke_id} row={r} />)
              )}
            </div>
          </Card>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-400" /> {toast}
        </div>
      )}
    </RoleLayout>
  );
};

export default JokeMaker;
