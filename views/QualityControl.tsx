import React, { useMemo, useState } from 'react';
import { useDemoMode, useDemoUi, useGame } from '../context';
import { Button, Card, StatBox, RoleLayout, Modal, fmt$ } from '../components';
import { Send, Zap, Trash2 } from 'lucide-react';
import { computeAvgCreatedToPublishSeconds } from '../services/economics';
import {
  INITIAL_NUDGE_STATE, nudgeReducer, isNudgeOpen,
  type NudgeEvent,
} from '../services/marketingNudge';
/* The feedback mapper lives in views/feedback.ts; the card, with its Pop out
   button, in components/CustomerFeedbackCard.tsx. */
import { toFeedbackRows } from './feedback';
import { CustomerFeedbackCard, WhatCustomersJudge } from '../components/CustomerFeedbackCard';
import { isWatchMode } from '../services/watchMode';
import { MARKETING_NOTE_MAX } from '../services/marketingService';
import { releaseCost, releaseOutcome } from './marketingRelease';
import { StatTiles, moreTilesKey } from '../components/StatTiles';
import { FeesAndWaits } from '../components/FeesAndWaits';
import { Scoreboard } from '../components/Scoreboard';
import { foundABuyer, rankInputOf } from '../services/scoreboard';
import { NextStepLive } from '../components/NextStep';
import { BatchSplitter } from '../components/marketing/BatchSplitter';
import { DeskBar } from '../components/marketing/DeskBar';
import { JokePick, PickFields, pickReady } from '../components/marketing/JokePick';
import { DeskClear } from '../components/marketing/DeskClear';
import { latestRelease, moreWaiting, moreWaitingLabel } from '../services/desk';
import { marketingInputFrom, marketingNextStep } from '../services/nextStep';

/* ---- Helpers ---- */
const fmtSeconds = (s: number | null) => {
  if (s == null) return '—';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
};
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/* ============================ Marketing screen ============================ */
const QualityControl: React.FC = () => {
  const { user, roster, qcQueue, qcQueueSize, publishBatch, splitBatch, unsplitBatch, config, teamSummary, teamFeedback, batches, roundId, roundStatuses } = useGame();

  /* A watch tab shows a bot's seat read-only: no nudges, no modals, no writes. */
  const watching = isWatchMode();
  /* Inside the guided tour's demo stage (context.tsx useDemoMode) the decision
     clock never arms either: a nudge dialog must not open over the demo. */
  const demoMode = useDemoMode();

  /* Live queue from API */
  const incomingJokes = useMemo(() => {
    if (!qcQueue) return [];
    return qcQueue.jokes.map(j => ({
      id: j.joke_id,
      text: j.joke_text,
    }));
  }, [qcQueue]);

  /* Local rank order — initialize from incoming */
  const [orderIdsState, setOrderIds] = useState<number[]>([]);
  const [topicsState, setTopics] = useState<Record<number, string>>({});
  const [titlesState, setTitles] = useState<Record<number, string>>({});
  const [selectedIdsState, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [batchFeedbackState, setBatchFeedback] = useState('');
  /* Guided tour: inside the demo stage the script drives the picks, Topics,
     titles, note, "Fees and wait times" and the Next step line's clock, and the cards
     stay in the order they arrived (services/tour/demoUi.ts). In the real game
     there is no DemoUi and the marketer's own state does. */
  const demoUi = useDemoUi();
  const demoOrderIds = useMemo(() => incomingJokes.map(j => j.id), [incomingJokes]);
  const orderIds = demoUi ? demoOrderIds : orderIdsState;
  const topics = demoUi ? demoUi.mkTopics : topicsState;
  const titles = demoUi ? demoUi.mkTitles : titlesState;
  const selectedIds = useMemo(
    () => (demoUi ? new Set(demoUi.mkSelectedIds) : selectedIdsState),
    [demoUi, selectedIdsState],
  );
  const batchFeedback = demoUi ? demoUi.mkNote : batchFeedbackState;
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dismissedTeamPopup, setDismissedTeamPopup] = useState(false);

  /* Decision clock. The reducer needs the instructor's durations, which live in
     `config`, so this is a useState + wrapper rather than a bare useReducer. */
  const [nudge, setNudge] = useState(INITIAL_NUDGE_STATE);
  const nudgeCfg = {
    nudge1Seconds: config.marketingNudge1Seconds,
    nudge2Seconds: config.marketingNudge2Seconds,
  };
  const nudgeCfgRef = React.useRef(nudgeCfg);
  nudgeCfgRef.current = nudgeCfg;
  // Reads the durations from a ref so the callback stays stable — otherwise every
  // config render would restart the pending timer and the clock would never finish.
  const dispatchNudge = React.useCallback(
    (event: NudgeEvent) => setNudge(prev => nudgeReducer(prev, event, nudgeCfgRef.current)),
    [],
  );

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
      setTitles({});
      setSelectedIds(new Set());
      setBatchFeedback('');
    }
  }, [queueSig, incomingJokes]);

  /* Marketing feedback panel. Real data from the backend now — see
     toFeedbackRows. Nothing is seeded and nothing is appended locally: the poll
     in context.tsx is the only source, so the panel can never show a joke the
     scoring engine hasn't actually judged. */
  const feedbackRows = useMemo(() => toFeedbackRows(teamFeedback), [teamFeedback]);

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

  const toggle = (id: number) => {
    // TEMP (ranking disabled): the top card used to be undeselectable, because
    // Rank 1 always shipped. Selection is now entirely the team's call — the
    // decision timer in services/marketingNudge.ts supplies the pressure instead.
    // if (orderIds[0] === id) return;
    setSelectedIds(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const setSelected = (id: number, on: boolean) => setSelectedIds(s => {
    if (s.has(id) === on) return s;
    const n = new Set(s);
    on ? n.add(id) : n.delete(id);
    return n;
  });

  const jokeById = (id: number) => incomingJokes.find(j => j.id === id);
  // TEMP (ranking disabled): was `(id, idx) => idx === 0 || selectedIds.has(id)`,
  // which force-shipped the top card. Nothing ships unless it's chosen now.
  // Filtering over orderIds (not selectedIds) keeps the list in card order.
  const submittingIds = orderIds.filter(id => selectedIds.has(id));
  const isSubmitting = (id: number) => submittingIds.includes(id);

  /* Round 2 batches can be a single joke, so Marketing must be able to reject the
     lot — the batch is discarded and charged as waste. Round 1 still demands at
     least one joke, which is what keeps the market stocked from a 5-joke batch. */
  const mayPublishNothing = config.round === 2;
  const discardingAll = mayPublishNothing && submittingIds.length === 0;
  /* What this batch already costs as waste. NOT a marginal cost of clicking
     discard: computeProfit derives `discarded = created − published`, so a joke
     is charged the moment it becomes a record at split time. Passing on the batch
     doesn't add a charge — it just settles the decision. The copy says "count as
     waste" rather than "costs you" for exactly that reason. */
  const discardAllCost = orderIds.length * config.costOfDiscard;
  /* The footer tally: the same formula the release toast charges (views/marketingRelease.ts). */
  const tallyCost = releaseCost(submittingIds.length, orderIds.length, config.costOfPublishing, config.costOfDiscard);

  // Every submitted joke needs a topic + title, so none can be silently dropped
  // from the payload. `every` over an empty basket is vacuously true, which is
  // exactly what lets a Round 2 discard-all through.
  const canRelease = (submittingIds.length > 0 || mayPublishNothing) && submittingIds.every(
    id => pickReady(topics[id], titles[id]),
  );

  const release = async () => {
    if (watching) return;
    if (!canRelease || !qcQueue) return;
    /* Titles and Marketing's note go on the wire. The backend stores no rating,
       no tag and no topic, so the old ratings/tags/topics payloads had nowhere to
       go; `submittingIds` already states exactly which jokes ship, which is what
       publish wants. The topic picker stays — it is deliberately decorative (the
       LLM classifies topic from the joke text), and nothing here claims it was
       saved. It is still required by `canRelease` as a "think about it" gate. */
    const titlesOut: Record<string, string> = {};
    for (const id of submittingIds) {
      titlesOut[String(id)] = titles[id];
    }

    const batchId = String(qcQueue.batch.batch_id);
    const count = submittingIds.length;
    const note = batchFeedback;
    dispatchNudge({ type: 'RELEASED' });   // no popup may ambush a team that shipped
    const ok = await publishBatch(batchId, submittingIds, titlesOut, note);

    /* No local feedback entry is appended here. Releasing a joke does not mean a
       customer has judged it — the panel fills in from the backend's own
       feedback poll once the scoring engine has actually run. */

    // A failed publish has already alerted: no toast, and the note stays in the box.
    const outcome = releaseOutcome({
      ok,
      releasedCount: count,
      batchSize: orderIds.length,
      costOfPublishing: config.costOfPublishing,
      costOfDiscard: config.costOfDiscard,
      note,
    });
    if (outcome.clearNote) setBatchFeedback('');
    if (outcome.toast) {
      setToast(outcome.toast);
      window.setTimeout(() => setToast(null), 2800);
    }
  };

  React.useEffect(() => {
    if (!config.showTeamPopup) setDismissedTeamPopup(false);
  }, [config.showTeamPopup]);

  /* Phase gate: a raw-text batch with no jokes yet must be split first. */
  const deskBatch = qcQueue?.batch ?? null;
  const waitingLabel = moreWaitingLabel(moreWaiting(qcQueueSize, deskBatch !== null));
  /* The empty desk: the recap reads this team's own batches; the round status is
     the reliable "round over" signal (queue/next answers 409 then). */
  const teamBatches = useMemo(() => batches.filter(b => b.team === user?.team), [batches, user?.team]);
  const lastRelease = useMemo(() => latestRelease(teamBatches), [teamBatches]);
  const roundOver = roundStatuses?.[config.round === 2 ? 2 : 1] === 'ENDED';
  const rawText = qcQueue?.batch?.raw_text;
  const needsSplit = !!(rawText && rawText.trim()) && incomingJokes.length === 0;

  /* ---- Marketing's decision clock ----------------------------------------
     Ranking no longer force-ships the top card, so nothing reaches the market
     unless the team chooses it. Two nudges supply the pressure that the forced
     Rank 1 used to. The state machine is in services/marketingNudge.ts; this
     block only translates it to and from React. */

  // Arm on arrival at the selection view; disarm if the batch goes away.
  const batchReady = !watching && !demoMode && !needsSplit && orderIds.length > 0;
  React.useEffect(() => {
    dispatchNudge(batchReady ? { type: 'BATCH_READY' } : { type: 'BATCH_CLEARED' });
    // queueSig, not orderIds — reordering cards must not restart the clock.
  }, [batchReady, queueSig, dispatchNudge]);

  // The single timer. `dueInMs` is null whenever nothing is pending.
  React.useEffect(() => {
    if (nudge.dueInMs == null) return;
    const t = window.setTimeout(() => dispatchNudge({ type: 'TIMEOUT' }), nudge.dueInMs);
    return () => window.clearTimeout(t);
  }, [nudge.dueInMs, nudge.phase, dispatchNudge]);

  /* Round 1's popups open with a joke already in hand, so neither is a dead end:
     the first nudge's copy says we picked their top card, and the second needs a
     subject to publish. Only ever fills an EMPTY basket — a team that has already
     chosen keeps its own picks.

     Round 2 does NOT auto-pick. Rejecting the batch is a legitimate answer there,
     so pre-selecting a joke would quietly argue against the choice we're offering. */
  const autoPickTop = React.useCallback(() => {
    if (mayPublishNothing) return;
    setSelectedIds(prev => {
      if (prev.size > 0) return prev;
      const top = orderIds[0];
      return top == null ? prev : new Set([top]);
    });
  }, [orderIds, mayPublishNothing]);

  // Whether the basket was empty when the popup opened — decides which wording
  // popup 1 uses, since "we've selected your top joke" is a lie if they'd picked.
  const [nudge1AutoPicked, setNudge1AutoPicked] = useState(false);
  React.useEffect(() => {
    if (nudge.phase === 'nudge1') {
      setNudge1AutoPicked(submittingIds.length === 0);
      autoPickTop();
    }
    if (nudge.phase === 'nudge2') autoPickTop();
    // submittingIds is read as an opening snapshot, so it must not retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nudge.phase, autoPickTop]);

  /* Stats. Profit replaces avg-score — Marketing bears the cost, so it can go
     negative. Waste = jokes the team discarded (created but never published). */
  const queueSize = qcQueue?.queue_size ?? incomingJokes.length;
  const jokesCreated = teamSummary?.jokes_created ?? 0;
  const jokesPublished = teamSummary?.jokes_published ?? 0;
  const waste = Math.max(0, jokesCreated - jokesPublished);
  // Created → Publish: avg seconds this team's batches spend between the Joke
  // Maker submitting them and Marketing releasing them — the same measure the
  // Joke Maker sees. It's Marketing's own turnaround, so it's theirs to improve.
  const avgLeadSec = useMemo(
    () => computeAvgCreatedToPublishSeconds(batches.filter(b => b.team === user?.team)),
    [batches, user?.team],
  );
  /* Lean market mode: the Fees and wait times disclosure (components/FeesAndWaits.tsx)
     replaces More numbers. Nothing of it renders for a CLASSIC round. The lean
     charts are instructor-only. */
  const leanMode = config.marketMode === 'LEAN';

  return (
    <RoleLayout tourView={QualityControl}>
      {/* Round 2: Team popup */}
      <Modal
        isOpen={!watching && config.round === 2 && config.showTeamPopup && !dismissedTeamPopup}
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
          {/* Read-only in watch mode: this tab shows a bot's seat and must not act for it.
              A disabled fieldset disables every control inside natively; `contents`
              keeps it out of the layout. The rest of the view stays interactive. */}
          <fieldset disabled={watching} className="contents">
          <Card
            tour="mk-desk"
            title="Marketing desk"
            subtitle="Split the batch, choose what to sell, then release it to the market."
            action={waitingLabel && (
              <span className="text-xs" style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", color: 'var(--ink-3)' }}>
                {waitingLabel}
              </span>
            )}
          >
          <div className="space-y-4">
            <div data-tour="mk-next-step">
              <NextStepLive
                step={now => marketingNextStep(marketingInputFrom({
                  now: demoUi ? demoUi.clockMs : now,
                  roundActive: config.isActive, round: config.round, roundId, roundStatuses,
                  storageFeePerJokeMinute: config.storageFeePerJokeMinute,
                  teamSummary, qcQueue, batches: batches.filter(b => b.team === user?.team), feedbackRows,
                }))}
              />
            </div>
            {deskBatch && (
              <DeskBar
                batchId={deskBatch.batch_id}
                submittedAt={deskBatch.submitted_at}
                stage={needsSplit ? 'split' : 'choose'}
              />
            )}
            {needsSplit ? (
              <BatchSplitter
                key={qcQueue?.batch?.batch_id}
                rawText={rawText!}
                round={config.round === 2 ? 2 : 1}
                batchSize={config.round1BatchSize}
                limit={config.round2BatchLimit}
                onComplete={(jokes) => {
                  if (qcQueue) splitBatch(String(qcQueue.batch.batch_id), jokes);
                }}
              />
            ) : orderIds.length === 0 ? (
              <DeskClear roundOver={roundOver} last={lastRelease} />
            ) : (
              <div>
                <div className="mb-3 flex items-baseline justify-between gap-4">
                  <p className="m-0 text-sm" style={{ color: 'var(--ink-2)' }}>
                    Choose what to sell. Every joke you sell needs a <b>topic</b> and a <b>title</b>. The rest are discarded.
                  </p>
                  {/* Escape hatch: re-open this batch in the splitting phase if the split was wrong. */}
                  <button
                    type="button"
                    onClick={() => { if (qcQueue) unsplitBatch(String(qcQueue.batch.batch_id)); }}
                    className="shrink-0 text-[13px] font-medium underline-offset-2 hover:underline"
                    style={{ color: 'var(--navy)' }}
                    title="Re-open this batch to fix the splitting"
                  >
                    Back to splitting
                  </button>
                </div>
                <div data-tour="mk-jokes">
                {orderIds.map((id, idx) => {
                  const j = jokeById(id);
                  if (!j) return null;
                  // TEMP (ranking disabled): every card is equal; position is
                  // just where it sits in the list.
                  return (
                    <JokePick
                      key={id}
                      index={idx}
                      total={orderIds.length}
                      jokeId={id}
                      text={j.text}
                      selected={selectedIds.has(id)}
                      topic={topics[id]}
                      title={titles[id]}
                      dragging={dragIdx === idx}
                      readOnly={watching}
                      onSelect={() => setSelected(id, true)}
                      onToggle={() => toggle(id)}
                      onDeselect={() => setSelected(id, false)}
                      onTopic={(topic) => setTopics(t => ({ ...t, [id]: topic }))}
                      onTitle={(v) => setTitles(t => ({ ...t, [id]: v }))}
                      onMove={(dir) => move(idx, dir)}
                      dragProps={{
                        draggable: !watching,
                        onDragStart: (e) => {
                          if (watching || (e.target as HTMLElement).closest('button, input, textarea, select, label')) {
                            e.preventDefault();
                            return;
                          }
                          setDragIdx(idx);
                        },
                        onDragOver: (e) => onDragOver(e, idx),
                        onDragEnd: endDrag,
                        onDrop: endDrag,
                      }}
                    />
                  );
                })}
                </div>

                {/* Marketing's note to its Joke Maker. It goes out as `note` on this
                    batch's publish call — Release or Discard batch alike — is stored
                    on the batch (batches.marketing_note) and shows under the batch
                    in the Joke Maker's Value stream. Written once: there is no
                    editing after release. The box clears when the publish succeeds
                    and keeps its text when it fails (views/marketingRelease.ts).
                    maxLength stops input at MARKETING_NOTE_MAX. */}
                <div
                  data-tour="mk-note"
                  className="mt-4 grid gap-3 pt-4"
                  style={{ borderTop: '1px solid var(--rule)' }}
                >
                  <label className="block">
                    <span className="mb-1.5 flex justify-between text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                      <span>Note to your Joke Maker, sent with this batch</span>
                      <span
                        className="tabular-nums"
                        style={{
                          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                          color: batchFeedback.length >= MARKETING_NOTE_MAX ? 'var(--warn)' : undefined,
                        }}
                      >
                        {`${batchFeedback.length}/${MARKETING_NOTE_MAX}`}
                      </span>
                    </span>
                    <textarea
                      value={batchFeedback}
                      onChange={(e) => setBatchFeedback(e.target.value.slice(0, MARKETING_NOTE_MAX))}
                      maxLength={MARKETING_NOTE_MAX}
                      rows={3}
                      aria-label="Note to your Joke Maker"
                      placeholder="What should they change next? What did customers like?"
                      className="w-full resize-y px-3 py-2 text-[14.5px] leading-normal outline-none focus:border-[color:var(--navy)]"
                      style={{ border: '1px solid var(--rule)', borderRadius: 'var(--r-md)', background: 'var(--paper)', color: 'var(--ink)' }}
                    />
                  </label>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
                      Selling <b className="font-semibold tabular-nums" style={{ fontFamily: MONO }}>{submittingIds.length}</b>, discarding{' '}
                      <b className="font-semibold tabular-nums" style={{ fontFamily: MONO }}>{orderIds.length - submittingIds.length}</b>,{' '}
                      <span style={{ color: 'var(--ink-3)' }}>{`costs ${fmt$(tallyCost)}`}</span>
                    </span>
                    <button
                      type="button"
                      data-tour="mk-release"
                      onClick={release}
                      disabled={!canRelease}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed"
                      style={{
                        borderRadius: 'var(--r-md)',
                        ...(!canRelease
                          ? { background: 'var(--paper-2)', color: 'var(--ink-3)' }
                          : discardingAll
                          ? { background: 'var(--warn-bg)', color: 'var(--warn)' }
                          : { background: 'var(--gold)', color: 'var(--navy)' }),
                      }}
                    >
                      {discardingAll ? (
                        <>
                          Discard batch · {orderIds.length} joke{orderIds.length > 1 ? 's' : ''}
                          <Trash2 size={15} aria-hidden="true" />
                        </>
                      ) : (
                        <>Release to market <span aria-hidden="true">→</span></>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          </Card>
          </fieldset>
        </div>

        {/* RIGHT: stats + customer-feedback learning panel */}
        <div className="space-y-5">
          <div className="space-y-2">
            <Scoreboard
              tourId="mk-stats"
              {...rankInputOf(teamSummary)}
              profit={teamSummary?.profit}
              totalSales={teamSummary ? teamSummary.total_sales : null}
              publishedJokes={teamSummary ? teamSummary.published_jokes : null}
              foundBuyer={teamSummary ? foundABuyer(batches.filter(b => b.team === user?.team)) : null}
            />
            {leanMode ? (
              <FeesAndWaits
                summary={teamSummary}
                config={config}
                tourId="mk-more"
                storageKey={moreTilesKey('quality_control')}
                open={demoUi ? demoUi.feesOpen : undefined}
                extras={[{ label: 'Content Backlog', value: queueSize }, { label: 'Content Waste', value: waste }]}
              />
            ) : (
              <StatTiles
                storageKey={moreTilesKey('quality_control')}
                open={demoUi ? demoUi.feesOpen : undefined}
                tourMore="mk-more"
                keyTiles={[]}
                moreTiles={[
                  /* queue_size counts this team's SUBMITTED batches in the round,
                     including the one locked on the desk. It counts batches, not jokes.
                     (The mock API still counts every team's.) Task C3 moves it to the desk header. */
                  <StatBox key="backlog" label="Content Backlog" value={queueSize} tone="blue" />,
                  <StatBox key="lead" label="Created to Publish" value={fmtSeconds(avgLeadSec)} tone="sky" />,
                  <StatBox key="waste" label="Content Waste" value={waste} tone="rose" />,
                ]}
              />
            )}
          </div>

          {/* Pop out floats this list above the game; never offered in a watch tab. */}
          <CustomerFeedbackCard rows={feedbackRows} canPopOut={!watching} />
          <WhatCustomersJudge />
        </div>
      </div>

      {/* ---- Decision nudge 1: the gentle one ---- */}
      <Modal
        isOpen={!watching && nudge.phase === 'nudge1'}
        onClose={() => dispatchNudge({ type: 'DISMISS' })}
        title={mayPublishNothing ? 'Time to make a call' : 'Time to ship something'}
        maxWidth="max-w-md"
      >
        <p className="text-sm text-gray-700 leading-relaxed">
          {/* Round 2 never auto-picks, so it can't claim we chose anything for them —
              and passing on the batch is one of the two answers we're asking for. */}
          {mayPublishNothing ? (
            <>
              You&apos;ve been deliberating a while. Publish what&apos;s worth selling — or
              pass on this batch if none of it is.
            </>
          ) : nudge1AutoPicked ? (
            <>
              You&apos;ve been deliberating a while. We&apos;ve selected your top joke to get
              you started — change it if you disagree.
            </>
          ) : (
            <>
              You&apos;ve been deliberating a while. You&apos;ve picked{' '}
              <b>{submittingIds.length} joke{submittingIds.length > 1 ? 's' : ''}</b> — give{' '}
              {submittingIds.length > 1 ? 'them' : 'it'} a Topic and a title, then release to market.
            </>
          )}
        </p>
        <p className="text-xs text-gray-500 mt-2">
          An unsold joke earns nothing. An unpublished one can&apos;t earn at all.
        </p>
        <div className="flex justify-end mt-5">
          <Button variant="primary" onClick={() => dispatchNudge({ type: 'DISMISS' })}>
            Keep choosing
          </Button>
        </div>
      </Modal>

      {/* ---- Decision nudge 2: the last one. Carries the release fields so
              "publish now" is never a dead end. ---- */}
      <Modal
        isOpen={!watching && nudge.phase === 'nudge2'}
        onClose={() => dispatchNudge({ type: 'DISMISS' })}
        title={
          discardingAll
            ? 'Publish or pass?'
            : submittingIds.length > 1
            ? 'Ready to publish these?'
            : 'Ready to publish this one?'
        }
        maxWidth="max-w-xl"
      >
        {/* Round 2 with an empty basket: there are no jokes to show fields for, so
            the dialog states both options instead and lets them pick one. */}
        {discardingAll && (
          <p className="text-sm text-gray-700 leading-relaxed">
            Nothing is selected. You can pass on this batch — the{' '}
            {orderIds.length > 1
              ? `${orderIds.length} jokes stay unpublished and count as waste`
              : 'joke stays unpublished and counts as waste'}{' '}
            (<b>{fmt$(discardAllCost)}</b>) — or keep looking for something worth selling.
          </p>
        )}
        <div className="space-y-4">
          {submittingIds.map(id => {
            const j = jokeById(id);
            if (!j) return null;
            return (
              <div key={id} className="rounded-lg border border-gray-200 p-3 space-y-3">
                <blockquote className="border-l-[3px] border-[#8bb8e8] pl-3 py-0.5">
                  <p className="joke-font text-gray-900 text-[15px] leading-relaxed">{j.text}</p>
                </blockquote>
                <PickFields
                  topic={topics[id]}
                  title={titles[id]}
                  onTopic={(topic) => setTopics(t => ({ ...t, [id]: topic }))}
                  onTitle={(v) => setTitles(t => ({ ...t, [id]: v }))}
                />
              </div>
            );
          })}
        </div>
        {!canRelease && (
          <p className="text-xs text-amber-700 mt-3">
            Add a Topic and a title to publish.
          </p>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => dispatchNudge({ type: 'DISMISS' })}>
            {discardingAll ? 'Keep choosing' : 'Not yet'}
          </Button>
          {discardingAll ? (
            <Button variant="danger" onClick={release}>
              <span className="flex items-center gap-1">Publish nothing <Trash2 size={15} /></span>
            </Button>
          ) : (
            <Button variant="success" onClick={release} disabled={!canRelease}>
              <span className="flex items-center gap-1">Publish <Send size={15} /></span>
            </Button>
          )}
        </div>
      </Modal>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2">
          <Zap size={16} className="text-[#005587]" /> {toast}
        </div>
      )}
    </RoleLayout>
  );
};

export default QualityControl;
