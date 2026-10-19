/* Tutorial — the instructor's "How this works" modal. Short, no logic dump.

   It used to have Joke Maker, Marketing and AI Customers tabs too. Students now
   get a guided walkthrough of their real screen instead
   (components/tour/GuidedTour.tsx), with the "how customers buy" step folded
   into each tour, so this modal is the instructor's alone.

   Ported from design_handoff_joke_factory_ui/Tutorial.jsx.txt. The steps follow
   the Instructor screen's flow: Setup, Teams, the control bar and Live, between
   rounds, then Debrief. */

import React, { useMemo, useState } from 'react';
import { SlidersHorizontal, ArrowLeft, ArrowRight, Check, Star, Sparkles } from 'lucide-react';
// Import the leaf modules directly, never the components barrel — the barrel
// imports THIS file, so going back through it would create a cycle.
import { BRAND } from '../config/brand';
import { Button, Card } from './ui';
import {
  DIMENSIONS, IDEAL_DIMENSIONS, MAX_FIT, DEFAULT_IDEAL_PROFILE, TITLE_FIT_GRADES, dimById,
} from '../config/dimensions';

const COLOR = BRAND.bruinBlue;

/* ---------------------------------------------------------------- tiny visuals */

const Badge: React.FC<{ children: React.ReactNode; icon?: React.ReactNode }> = ({ children, icon }) => (
  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 text-[11px] font-semibold">
    {icon}{children}
  </span>
);

const CostChip: React.FC<{ lines: Array<[string, string]> }> = ({ lines }) => (
  <div className="space-y-2">
    {lines.map((l, i) => (
      <div key={i} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
        <span className="text-sm text-gray-700">{l[0]}</span>
        <span className="text-sm font-bold tabular-nums text-gray-900">{l[1]}</span>
      </div>
    ))}
  </div>
);

/** "Perfect 1, Strong 0.75, …" — read off the shared map so the prose can't
    drift from the scale the engine actually applies. */
const TITLE_FIT_SCALE = Object.entries(TITLE_FIT_GRADES)
  .map(([grade, value]) => `${grade} ${value}`)
  .join(', ');

/** The 12 judging criteria, with the one Marketing owns called out. */
const CriteriaGrid: React.FC = () => (
  <div>
    <div className="flex flex-wrap gap-1.5 mb-3">
      {DIMENSIONS.map(d => {
        const intrinsic = !d.hasIdeal;
        return (
          <span
            key={d.id}
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border ${
              intrinsic
                ? 'bg-amber-50 text-amber-800 border-amber-300'
                : 'bg-white text-gray-700 border-gray-200'
            }`}
          >
            {intrinsic ? <Star size={10} /> : <Sparkles size={10} className="opacity-40" />}
            {d.label}
          </span>
        );
      })}
    </div>
    <p className="text-[11px] text-gray-600 leading-relaxed">
      <b className="text-amber-800">Title Fit</b> is the one criterion Marketing owns outright, and the only
      one graded on a scale of its own: it rates how well their title matches the joke ({TITLE_FIT_SCALE}),
      so a vague title costs the team a fraction of a point and a random one costs the whole mark.
    </p>
  </div>
);

const ProfileMini: React.FC = () => {
  const shown = Object.entries(DEFAULT_IDEAL_PROFILE).slice(0, 5);
  return (
    <div className="space-y-1.5">
      {shown.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between text-[12px]">
          <span className="text-gray-500">{dimById(k)?.label ?? k}</span>
          <span className="px-2 py-0.5 rounded text-white text-[11px] font-semibold" style={{ background: BRAND.bruinBlue }}>{v}</span>
        </div>
      ))}
      <div className="text-[11px] text-gray-400 pt-1">
        + {Object.keys(DEFAULT_IDEAL_PROFILE).length - shown.length} more criteria, hidden from every team.
      </div>
    </div>
  );
};

const RoundMini: React.FC = () => (
  <div className="flex items-center gap-2">
    <div className="flex-1 rounded-lg border-2 p-3 text-center" style={{ borderColor: BRAND.waste }}>
      <div className="text-xs font-bold" style={{ color: BRAND.waste }}>Round 1</div>
      <div className="text-[10px] text-gray-500 mt-0.5">Siloed · push</div>
    </div>
    <ArrowRight size={16} className="text-gray-300" />
    <div className="flex-1 rounded-lg border-2 p-3 text-center" style={{ borderColor: BRAND.sold }}>
      <div className="text-xs font-bold" style={{ color: BRAND.sold }}>Round 2</div>
      <div className="text-[10px] text-gray-500 mt-0.5">Co-located · pull</div>
    </div>
  </div>
);

/* ---------------------------------------------------------------- steps */

interface Step { t: string; b: string; v: () => React.ReactNode }

export function buildSteps(): Step[] {
  return [
    {
      t: 'Set up the class',
      b: `Open the Setup tab. Set how many minutes customers arrive over, the market and the costs, then press Apply. Then pick the hidden ideal joke: one level on each of the ${IDEAL_DIMENSIONS.length} criteria that have a target. It saves as you go. Reset game sits at the bottom of the tab.`,
      v: () => <ProfileMini />,
    },
    {
      t: `The ${MAX_FIT} criteria`,
      b: `Every released joke is judged on ${MAX_FIT} criteria. ${IDEAL_DIMENSIONS.length} of them are matched against the hidden ideal joke you set; Title Fit grades itself, so there is nothing to set for it. The more criteria a joke matches outright, the more customers buy it.`,
      v: () => <CriteriaGrid />,
    },
    {
      t: 'Seat the pairs',
      b: 'Students join in pairs and wait in the lobby on the Teams tab. Auto-assign seats them into teams of one Joke Maker pair and one Marketing pair; it is off while a round runs. Drag a pair to move it, use ⇄ to switch a team\'s two roles and × to remove an account. Team names are kept in this browser only.',
      v: () => <CostChip lines={[['4 teams', '8 pairs'], ['Joke Maker', '1 pair per team'], ['Marketing', '1 pair per team']]} />,
    },
    {
      t: 'Start and watch',
      b: 'Press Start Round 1 in the control bar above the tabs. Rounds do not end on their own: the bar says when customers stop arriving, and you press End Round 1 around then. The Live tab shows class totals, the leaderboard (Present puts it on the big screen), the four lean charts and the live market.',
      v: () => <CostChip lines={[['Class totals', 'sales, profit, fees'], ['Leaderboard', 'sort or Present'], ['Lean charts', 'four, in a grid'], ['Live market', 'best sellers first']]} />,
    },
    {
      t: 'Between rounds',
      b: 'After Round 1, turn on Show students their teammates so each Joke Maker pair can sit with its Marketing pair, then press Start Round 2. That move is the intervention that fixes the information flow. The Round 1 and Round 2 switch only changes which round you view; Start and End always act on the round in play.',
      v: () => <RoundMini />,
    },
    {
      t: 'Debrief',
      b: 'When both rounds have ended, press Open debrief. The Debrief tab puts Round 1 next to Round 2 for every team: profit and its change, jokes never sold, fees, and the time from sent to released. Ask the teams what changed.',
      v: () => <CostChip lines={[['Profit', 'Round 1, Round 2, change'], ['Never sold', 'Round 1, Round 2'], ['Fees', 'Round 1, Round 2'], ['Sent to released', 'Round 1, Round 2']]} />,
    },
  ];
}

/* ---------------------------------------------------------------- main */

const Tutorial: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const steps = useMemo(buildSteps, []);
  const [step, setStep] = useState(0);
  const last = step === steps.length - 1;

  return (
    <Card className="overflow-hidden">
      <div className="grid md:grid-cols-2 gap-0 -m-4">
        {/* left: copy + steps */}
        <div className="p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <Badge icon={<SlidersHorizontal size={15} />}>Instructor</Badge>
            <span className="text-[11px] text-gray-400">Master control</span>
          </div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-300 mt-4 mb-1">
            Step {step + 1} of {steps.length}
          </div>
          <h2 className="text-2xl font-bold text-gray-900 leading-tight">{steps[step].t}</h2>
          <p className="text-[15px] text-gray-600 mt-3 leading-relaxed flex-1">{steps[step].b}</p>

          {/* progress + nav */}
          <div className="mt-6">
            <div className="flex gap-1.5 mb-4">
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  aria-label={`Go to step ${i + 1}`}
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: i === step ? 28 : 14, background: i <= step ? COLOR : '#e5e7eb' }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="px-3 py-1.5 text-sm inline-flex items-center gap-1.5"
                onClick={() => setStep(s => Math.max(0, s - 1))}
                disabled={step === 0}
              >
                <ArrowLeft size={14} /> Back
              </Button>
              {!last ? (
                <Button
                  className="ml-auto px-3 py-1.5 text-sm inline-flex items-center gap-1.5"
                  onClick={() => setStep(s => s + 1)}
                >
                  Next <ArrowRight size={14} />
                </Button>
              ) : (
                <Button
                  className="ml-auto px-3 py-1.5 text-sm text-white inline-flex items-center gap-1.5"
                  style={{ background: COLOR }}
                  onClick={() => onClose?.()}
                >
                  Got it <Check size={14} />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* right: visual */}
        <div className="p-6 bg-slate-50 border-l border-gray-100 flex items-center">
          <div className="w-full">{steps[step].v()}</div>
        </div>
      </div>
    </Card>
  );
};

export default Tutorial;
