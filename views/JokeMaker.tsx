import React, { useMemo, useState } from 'react';
import { useDemoUi, useGame } from '../context';
import { Card, StatBox, RoleLayout, Modal, BRAND } from '../components';
import { CheckCircle2 } from 'lucide-react';
import { Batch } from '../types';
import { stageCounts } from '../services/jokeState';
import { computeAvgCreatedToPublishSeconds } from '../services/economics';
import { isWatchMode } from '../services/watchMode';
import { shippingLine } from '../services/leanMode';
import { ValueStream } from '../components/jokeMaker/ValueStream';
import { JokesByStage } from '../components/jokeMaker/JokesByStage';
import { StatTiles, moreTilesKey } from '../components/StatTiles';
import { FeesAndWaits } from '../components/FeesAndWaits';
import { Scoreboard } from '../components/Scoreboard';
import { foundABuyer, rankInputOf } from '../services/scoreboard';
import { NextStepLive } from '../components/NextStep';
import { jokeMakerInputFrom, jokeMakerNextStep } from '../services/nextStep';

/* ---- Format a duration in seconds → "Xm Ys" / "Ys" ---- */
const fmtSeconds = (s: number | null) => {
  if (s == null) return '—';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
};

/* Customer feedback is Marketing-only: the Joke Maker hears from Marketing,
   not from a panel both seats share (context.tsx TEAM_FEEDBACK_ROLES).
   Marketing's note on each batch arrives with the batch-list poll and shows in
   the Value stream (components/jokeMaker/ValueStream.tsx). */

/* ============================ Joke Maker screen ============================ */
const MIN_RAW_CHARS = 20;

const JokeMaker: React.FC = () => {
  const { user, roster, batches, submitRawBatch, config, teamSummary, roundStatuses } = useGame();

  const [inputState, setInput] = useState('');
  const [certifiedState, setCertified] = useState(false);
  const [openSetState, setOpenSet] = useState<Set<string>>(() => new Set());
  /* Guided tour: inside the demo stage the script drives the textbox, the
     certify box, which batches are open, "Fees and wait times" and the Next step
     line's clock (services/tour/demoUi.ts). In the real game there is no
     DemoUi and the student's own state does. */
  const demoUi = useDemoUi();
  const input = demoUi ? demoUi.jmDraft : inputState;
  const certified = demoUi ? demoUi.jmCertified : certifiedState;
  const openSet = useMemo(
    () => (demoUi ? new Set(demoUi.jmOpenBatchIds) : openSetState),
    [demoUi, openSetState],
  );
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
  /* Lean market mode: every batch sent pays a shipping fee by its size (the
     line under Send). There is no WIP limit: the Joke Maker may always send. */
  const leanMode = config.marketMode === 'LEAN';
  const canSubmit = config.isActive && certified && trimmedLen >= MIN_RAW_CHARS;

  /* V2: JM pastes the raw AI output as one blob and hands it off to Marketing,
     who reads through and splits it into individual jokes. */
  const submit = async () => {
    if (!canSubmit) return;
    const sent = await submitRawBatch(input);
    // Lean: keep the draft when the backend refused the batch, so the Joke
    // Maker can send it later.
    if (leanMode && !sent) return;
    setInput('');
    setCertified(false);
    setToast('Batch sent to Marketing. They will split and rate it.');
    window.setTimeout(() => setToast(null), 2600);
  };

  const toggleBatch = (id: string) => setOpenSet(s => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  /* Stats. The Scoreboard shows rank, profit, jokes that found a buyer and sales
     (profit can and should go negative, so the team feels the cost of weak jokes). */
  const batchesCreated = teamSummary?.batches_created ?? myBatches.length;
  // Waste = jokes Marketing did not release. It is the "Not released" row in Jokes by stage.
  const waste = useMemo(() => stageCounts(myBatches).notReleased, [myBatches]);

  /* Created → Publish: average time this team's batches wait between submission
     and Marketing releasing them. Was created-to-first-sale, which mixed in
     customer demand the team can't control. */
  const avgLeadSec = useMemo(
    () => computeAvgCreatedToPublishSeconds(myBatches),
    [myBatches],
  );

  React.useEffect(() => {
    if (!config.showTeamPopup) setDismissedTeamPopup(false);
  }, [config.showTeamPopup]);

  const watching = isWatchMode();

  return (
    <RoleLayout tourView={JokeMaker}>
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
        {/* LEFT: Production line + Value stream */}
        <div className="lg:col-span-2 space-y-6">
          {/* Read-only in watch mode: this tab shows a bot's seat and must not act for it.
              A disabled fieldset disables every control inside natively; `contents`
              keeps it out of the layout. The rest of the view stays interactive. */}
          <fieldset disabled={watching} className="contents">
          <Card title="Production line" accent={BRAND.production}>
            <div className="space-y-4">
              <div data-tour="jm-next-step">
                <NextStepLive
                  step={now => jokeMakerNextStep(jokeMakerInputFrom({
                    now: demoUi ? demoUi.clockMs : now,
                    roundActive: config.isActive, round: config.round, roundStatuses, teamSummary, batches: myBatches,
                  }))}
                />
              </div>

              {!config.isActive && (
                <div
                  className="rounded-md px-3 py-2 text-sm font-medium"
                  style={{ background: 'var(--waiting-bg)', color: 'var(--waiting)' }}
                >
                  Game is paused. Wait for the instructor to start.
                </div>
              )}

              <p className="text-sm text-[color:var(--ink-2)]">
                <b className="font-semibold text-[color:var(--ink)]">{isRound1 ? 'Round 1:' : 'Round 2:'}</b>{' '}
                {isRound1
                  ? `make exactly ${targetBatchSize} jokes per batch`
                  : `make up to ${config.round2BatchLimit} jokes per batch`}
                {' '}with any AI tool and paste the whole response below. Marketing will split it into individual jokes.
              </p>

              <div data-tour="jm-draft">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={8}
                  placeholder={`Paste the full AI output here, exactly as you copied it.\n\ne.g.\n1) Why did the... \n2) I told my boss...\n3) ...`}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-[color:var(--ink)] outline-none focus:border-[color:var(--navy)] resize-y placeholder:text-[color:var(--ink-4)]"
                  style={{
                    fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
                    lineHeight: '24px',
                    backgroundColor: 'var(--sheet)',
                    borderColor: 'var(--rule-2)',
                    // Faint rules, one per text line, that scroll with the text.
                    backgroundImage: 'linear-gradient(to bottom, transparent 23px, var(--rule) 23px)',
                    backgroundSize: '100% 24px',
                    backgroundPosition: '0 8px',
                    backgroundAttachment: 'local',
                  }}
                  disabled={!config.isActive}
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-[color:var(--ink-3)]">
                    Stuck? Try work, family, food, tech or animals.
                  </p>
                  <span className="text-[11px] text-[color:var(--ink-3)] tabular-nums">
                    {trimmedLen} chars{trimmedLen > 0 && trimmedLen < MIN_RAW_CHARS ? ` · min ${MIN_RAW_CHARS}` : ''}
                  </span>
                </div>
              </div>

              <div data-tour="jm-send" className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={certified}
                    onChange={(e) => setCertified(e.target.checked)}
                    className="w-4 h-4"
                    style={{ accentColor: 'var(--navy)' }}
                    disabled={!config.isActive}
                  />
                  <span className="text-sm text-[color:var(--ink-2)]">I certify these jokes are not offensive.</span>
                </label>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
                    canSubmit
                      ? 'bg-[color:var(--gold)] hover:bg-[color:var(--gold-2)] text-[color:var(--navy)]'
                      : 'bg-[color:var(--paper-2)] text-[color:var(--ink-3)]'
                  }`}
                >
                  Send to Marketing <span aria-hidden="true">→</span>
                </button>
              </div>
              {leanMode && (
                <div data-tour="jm-shipping" className="text-xs text-right text-[color:var(--ink-3)]">
                  {shippingLine(config.round, config.round1BatchSize, config)}
                </div>
              )}
            </div>
          </Card>
          </fieldset>

          <ValueStream
            batches={myBatches}
            batchCount={teamSummary?.batches_created}
            openIds={openSet}
            onToggle={toggleBatch}
            roundStarted={teamSummary != null}
          />
        </div>

        {/* RIGHT: stat tiles + Jokes by stage */}
        <div className="space-y-5">
          <div className="space-y-2">
            <Scoreboard
              tourId="jm-stats"
              {...rankInputOf(teamSummary)}
              profit={teamSummary?.profit}
              totalSales={teamSummary ? teamSummary.total_sales : null}
              publishedJokes={teamSummary ? teamSummary.published_jokes : null}
              foundBuyer={teamSummary ? foundABuyer(myBatches) : null}
            />
            {leanMode ? (
              <FeesAndWaits
                summary={teamSummary}
                config={config}
                storageKey={moreTilesKey('joke_maker')}
                open={demoUi ? demoUi.feesOpen : undefined}
                extras={[{ label: 'Batches', value: batchesCreated }, { label: 'Content Waste', value: waste }]}
              />
            ) : (
              <StatTiles
                storageKey={moreTilesKey('joke_maker')}
                open={demoUi ? demoUi.feesOpen : undefined}
                keyTiles={[]}
                moreTiles={[
                  <StatBox key="lead" label="Created to Publish" value={fmtSeconds(avgLeadSec)} tone="sky" />,
                  <StatBox key="batches" label="Batches" value={batchesCreated} tone="slate" />,
                  <StatBox key="waste" label="Content Waste" value={waste} tone="rose" />,
                ]}
              />
            )}
          </div>
          <JokesByStage batches={myBatches} unprocessedBatches={teamSummary?.unprocessed_batches} />
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
