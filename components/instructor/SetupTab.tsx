/* The Instructor's Setup tab (spec 6b): the round settings, the hidden ideal joke
   and Reset game at the bottom. Moved from views/Instructor.tsx unchanged; the
   screen keeps the edits in progress, so leaving the tab does not drop them. */
import React from 'react';
import { RefreshCw, Settings } from 'lucide-react';
import { useGame } from '../../context';
import { Button, Card } from '../../components';
import { IdealProfilePicker } from '../IdealProfilePicker';
import { FeeConfigFields, type FeeConfigValues } from '../FeeConfigFields';
import type { IdealDimension } from '../../config/dimensions';
import { productionTeamCount } from '../../services/leanMode';

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

export interface SetupTabProps {
  localNudge1: number; setLocalNudge1: Setter<number>;
  localNudge2: number; setLocalNudge2: Setter<number>;
  localBudget: number; setLocalBudget: Setter<number>;
  localMarketPrice: number; setLocalMarketPrice: Setter<number>;
  localCostOfPublishing: number; setLocalCostOfPublishing: Setter<number>;
  localFees: FeeConfigValues; setLocalFees: (next: FeeConfigValues) => void;
  canEditNudges: boolean;
  canEditBudget: boolean;
  canEditPricing: boolean;
  canEditLean: boolean;
  LEAN_LOCK_HINT: string;
  canApply: boolean;
  hasPendingConfigChanges: boolean;
  feeNotice: string | null;
  handleUpdateSettings: () => void;
  setShowResetConfirm: (show: boolean) => void;
}

export const SetupTab: React.FC<SetupTabProps> = ({
  localNudge1, setLocalNudge1, localNudge2, setLocalNudge2, localBudget, setLocalBudget,
  localMarketPrice, setLocalMarketPrice, localCostOfPublishing, setLocalCostOfPublishing, localFees, setLocalFees,
  canEditNudges, canEditBudget, canEditPricing, canEditLean, LEAN_LOCK_HINT, canApply, hasPendingConfigChanges,
  feeNotice, handleUpdateSettings, setShowResetConfirm,
}) => {
  const { config, roster, updateConfig } = useGame();
  return (
    <Card>
      <div className="flex flex-col space-y-4">
        {/* Row 3: Configurations (single line, wrap on narrow screens) */}
        <div className="flex flex-wrap items-center gap-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <Settings size={16} className="text-gray-400" />
            <span className="text-sm font-bold text-gray-700 uppercase">Config:</span>
          </div>
          <div className="flex items-center space-x-3" title="Seconds Marketing may deliberate before the first publish reminder">
            <label className="text-sm text-gray-600 whitespace-nowrap">Nudge 1 (s):</label>
            <input
              type="number"
              min={5}
              value={localNudge1}
              onChange={e => setLocalNudge1(Number(e.target.value))}
              disabled={!canEditNudges}
              className={`w-20 p-1 border border-gray-300 rounded !text-center appearance-none [-moz-appearance:textfield] bg-white text-black ${!canEditNudges ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>
          <div className="flex items-center space-x-3" title="Seconds after that reminder is dismissed before the final one">
            <label className="text-sm text-gray-600 whitespace-nowrap">Nudge 2 (s):</label>
            <input
              type="number"
              min={5}
              value={localNudge2}
              onChange={e => setLocalNudge2(Number(e.target.value))}
              disabled={!canEditNudges}
              className={`w-20 p-1 border border-gray-300 rounded !text-center appearance-none [-moz-appearance:textfield] bg-white text-black ${!canEditNudges ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>
          <div className="flex items-center space-x-3">
            <label className="text-sm text-gray-600 whitespace-nowrap">Cust. Budget:</label>
            <input
              type="number"
              value={localBudget}
              onChange={e => setLocalBudget(Number(e.target.value))}
              disabled={!canEditBudget}
              className={`w-20 p-1 border border-gray-300 rounded !text-center appearance-none [-moz-appearance:textfield] bg-white text-black ${!canEditBudget ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>
          <div className="flex items-center space-x-3">
            <label className="text-sm text-gray-600 whitespace-nowrap">Market Price (p):</label>
            <input
              type="number"
              step="0.10"
              min="0"
              value={localMarketPrice}
              onChange={e => setLocalMarketPrice(Number(e.target.value))}
              disabled={!canEditPricing}
              className={`w-20 p-1 border border-gray-300 rounded !text-center appearance-none [-moz-appearance:textfield] bg-white text-black ${!canEditPricing ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>
          <div className="flex items-center space-x-3">
            <label className="text-sm text-gray-600 whitespace-nowrap">Cost of Publishing (c):</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={localCostOfPublishing}
              onChange={e => setLocalCostOfPublishing(Number(e.target.value))}
              disabled={!canEditPricing}
              className={`w-20 p-1 border border-gray-300 rounded !text-center appearance-none [-moz-appearance:textfield] bg-white text-black ${!canEditPricing ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>
          <FeeConfigFields
            values={localFees}
            onChange={setLocalFees}
            disabled={!canEditLean}
            lockHint={LEAN_LOCK_HINT}
            round1BatchSize={config.round1BatchSize}
            round2BatchLimit={config.round2BatchLimit}
            teamCount={productionTeamCount(roster)}
          />
          <Button
            type="button"
            onClick={handleUpdateSettings}
            variant="secondary"
            disabled={!canApply}
            className={
              `px-4 py-1 text-xs font-semibold transition-colors ` +
              (canApply
                ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 ring-2 ring-amber-200'
                : 'opacity-60')
            }
          >
            Apply
          </Button>
          {feeNotice && !hasPendingConfigChanges && (
            <span role="status" className="text-xs text-emerald-700 whitespace-nowrap">{feeNotice}</span>
          )}
        </div>

        {/* Row 4: the hidden ideal joke. The backend will not start a round without a
            complete profile, so this has to be reachable before Start. */}
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <IdealProfilePicker
            value={config.idealProfile as Record<IdealDimension, string>}
            onChange={next => updateConfig({ idealProfile: next })}
            disabled={config.isActive}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={() => setShowResetConfirm(true)} variant="outline" className="inline-flex items-center gap-2 text-sm">
            <RefreshCw size={14} aria-hidden="true" /> Reset game
          </Button>
        </div>
      </div>
    </Card>
  );
};
