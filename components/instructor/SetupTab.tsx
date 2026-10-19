/* The Instructor's Setup tab (spec 6b): a lock banner, the round settings in four
   groups (Round timing, Market, Costs, Batches) with Apply and its change count,
   the hidden ideal joke, and Reset game at the bottom. The screen keeps the edits
   in progress, so leaving the tab does not drop them. */
import React from 'react';
import { Lock, RotateCcw } from 'lucide-react';
import { useGame } from '../../context';
import { IdealProfilePicker } from '../IdealProfilePicker';
import { FeeConfigFields, type FeeConfigValues } from '../FeeConfigFields';
import type { IdealDimension } from '../../config/dimensions';
import type { GameConfig } from '../../types';
import { productionTeamCount } from '../../services/leanMode';
import { setupLockText, type SetupValues } from '../../services/roundConfig';
import { SetupField, SetupInput } from './SetupField';

export const LEAN_LOCK_HINT = 'Lean settings lock once the round starts';

export interface SetupTabProps {
  local: SetupValues;
  setLocal: (next: SetupValues) => void;
  canEditBudget: boolean;
  canEditPricing: boolean;
  canEditLean: boolean;
  /** The patch Apply would send (buildApplyUpdates): its keys are the changed fields. */
  pending: Partial<GameConfig>;
  /** Shipping fees that fall with batch size: Apply waits until they are fixed. */
  applyBlocked: boolean;
  /** After Apply, which rounds the fees went to. */
  feeNotice: string | null;
  onApply: () => void;
  onReset: () => void;
}

const SHEET: React.CSSProperties = { background: 'var(--sheet)', border: '1px solid var(--rule)', borderRadius: 'var(--r-3)' };
const PRIMARY =
  'inline-flex shrink-0 items-center gap-2 rounded-[var(--r-md)] px-[18px] py-2.5 text-[14.5px] font-semibold transition-colors bg-[color:var(--gold)] hover:bg-[color:var(--gold-2)] text-[color:var(--navy)] disabled:cursor-not-allowed disabled:bg-[color:var(--paper-2)] disabled:text-[color:var(--ink-4)]';
const FIELDS = 'grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2';

const changesText = (n: number) => `${n} ${n === 1 ? 'change' : 'changes'}`;

const Group: React.FC<{ title: string; first?: boolean; children: React.ReactNode }> = ({ title, first, children }) => (
  <div className="px-[18px] pb-4 pt-1" style={first ? undefined : { borderTop: '1px solid var(--rule)' }}>
    <h3 className="mb-2.5 mt-3.5 text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>{title}</h3>
    {children}
  </div>
);

export const SetupTab: React.FC<SetupTabProps> = ({
  local, setLocal, canEditBudget, canEditPricing, canEditLean, pending, applyBlocked, feeNotice, onApply, onReset,
}) => {
  const { config, roster, roundStatuses, updateConfig } = useGame();
  const lockText = setupLockText(roundStatuses);
  // The lock icon shows while nothing can change; between rounds the banner only informs.
  const allLocked = config.isActive || (roundStatuses[1] === 'ENDED' && roundStatuses[2] === 'ENDED');
  const changed = new Set(Object.keys(pending)) as ReadonlySet<keyof GameConfig>;
  const count = changed.size;
  const fees = {
    values: local.fees,
    onChange: (next: FeeConfigValues) => setLocal({ ...local, fees: next }),
    disabled: !canEditLean,
    lockHint: LEAN_LOCK_HINT,
    changed: changed as ReadonlySet<keyof FeeConfigValues>,
  };
  const set = (k: 'budget' | 'marketPrice' | 'costOfPublishing') => (v: number) => setLocal({ ...local, [k]: v });

  return (
    <div>
      {lockText && (
        <div role="status" className="mb-4 flex items-center gap-2.5 rounded-[var(--r-md)] px-4 py-[11px] text-[14px]" style={{ background: 'var(--paper-2)', color: 'var(--ink-2)' }}>
          {allLocked && <Lock size={16} aria-hidden="true" style={{ color: 'var(--ink-3)' }} />}
          <span>{lockText}</span>
        </div>
      )}
      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1.15fr_1fr]">
        <div style={SHEET}>
          <Group title="Round timing" first>
            <div className={FIELDS}>
              <FeeConfigFields part="timing" {...fees} />
              <div className="self-start rounded-[var(--r-md)] px-3 py-2.5 text-[13.5px]" style={{ background: 'var(--paper)', color: 'var(--ink-2)' }}>
                <b className="mb-0.5 block font-semibold" style={{ color: 'var(--ink)' }}>Rounds don&apos;t end on their own.</b>
                End each round from the bar at the top, around the time customers stop arriving. The game has no automatic end time.
              </div>
            </div>
          </Group>
          <Group title="Market">
            <div className={FIELDS}>
              <FeeConfigFields part="market" {...fees} teamCount={productionTeamCount(roster)} />
              <SetupField label="Customer budget" htmlFor="cfg-budget" hint="What each customer can spend.">
                <SetupInput
                  id="cfg-budget" label="Customer budget" value={local.budget} step="0.5" min="0" prefix="$"
                  disabled={!canEditBudget} changed={changed.has('customerBudget')} onChange={set('budget')}
                />
              </SetupField>
              <SetupField label="Price per sale" htmlFor="cfg-market-price">
                <SetupInput
                  id="cfg-market-price" label="Price per sale" value={local.marketPrice} step="0.10" min="0" prefix="$"
                  disabled={!canEditPricing} changed={changed.has('marketPrice')} onChange={set('marketPrice')}
                />
              </SetupField>
            </div>
          </Group>
          <Group title="Costs">
            <div className={FIELDS}>
              <FeeConfigFields part="costs" {...fees} />
              <SetupField label="Publishing" htmlFor="cfg-publishing">
                <SetupInput
                  id="cfg-publishing" label="Publishing cost per joke" value={local.costOfPublishing} step="0.01" min="0" prefix="$" suffix="per joke"
                  disabled={!canEditPricing} changed={changed.has('costOfPublishing')} onChange={set('costOfPublishing')}
                />
              </SetupField>
            </div>
          </Group>
          <Group title="Batches">
            <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-[14px] sm:grid-cols-2" style={{ color: 'var(--ink-2)' }}>
              <span>Round 1: exactly <b className="font-mono font-semibold" style={{ color: 'var(--ink)' }}>{config.round1BatchSize}</b> jokes</span>
              <span>Round 2: up to <b className="font-mono font-semibold" style={{ color: 'var(--ink)' }}>{config.round2BatchLimit}</b> jokes</span>
            </div>
          </Group>
          <div className="flex items-center justify-between gap-3 rounded-b-[var(--r-3)] border-t px-[18px] py-3.5" style={{ borderColor: 'var(--rule)', background: 'var(--paper)' }}>
            <span role="status" className="text-[13.5px]" style={{ color: count === 0 && feeNotice ? 'var(--selling)' : 'var(--ink-3)' }}>
              {count > 0 ? `${count} unsaved ${count === 1 ? 'change' : 'changes'}.` : feeNotice ? `${feeNotice}.` : 'No changes.'}
            </span>
            <button type="button" onClick={onApply} disabled={count === 0 || applyBlocked} className={PRIMARY}>
              {count > 0 ? `Apply ${changesText(count)}` : 'Apply'}
            </button>
          </div>
        </div>

        <div>
          <div style={SHEET}>
            <IdealProfilePicker
              value={config.idealProfile as Record<IdealDimension, string>}
              onChange={next => updateConfig({ idealProfile: next })}
              disabled={allLocked}
            />
          </div>
          <div className="mt-[18px] flex items-center justify-between gap-4 px-[18px] py-3.5" style={SHEET}>
            <p className="text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Reset clears every team, batch and sale.</p>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex shrink-0 items-center gap-[7px] rounded-[var(--r-md)] px-3.5 py-[9px] text-sm font-medium transition-colors hover:bg-[color:var(--warn-bg)]"
              style={{ background: 'var(--sheet)', color: 'var(--warn)', border: '1px solid color-mix(in srgb, var(--warn) 35%, var(--sheet))' }}
            >
              <RotateCcw size={16} aria-hidden="true" />
              Reset game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
