/* Tutorial — hands-on onboarding for each role. Short (1–2 min), no logic dump;
   a couple of genuinely interactive steps so the learning is hands-on.

   Ported from design_handoff_joke_factory_ui/Tutorial.jsx.txt, with the copy
   brought in line with the current rules: 12 judging criteria (incl. Title Fit),
   Marketing-only costs, and "Rank 1 always ships". */

import React, { useMemo, useState } from 'react';
import {
  PenTool, ClipboardCheck, Users, SlidersHorizontal, ArrowLeft, ArrowRight, ArrowDown,
  GripVertical, ChevronUp, ChevronDown, Check, Star, MousePointerClick, BadgeCheck,
  Store, ShoppingBag, MessageSquare, Scissors, CornerDownLeft, Sparkles,
} from 'lucide-react';
// Import the leaf modules directly, never the components barrel — the barrel
// imports THIS file, so going back through it would create a cycle.
import { BRAND, fmt$ } from '../config/brand';
import { Button, Card, StatBox } from './ui';
import {
  DIMENSIONS, IDEAL_DIMENSIONS, MAX_FIT, DEFAULT_IDEAL_PROFILE, TITLE_FIT_GRADES, dimById,
} from '../config/dimensions';
import { SIM_CONFIG } from '../config/simConfig';
import { DEMO_CONFIG } from '../services/aiCustomerDemo';

export type TutorialRole = 'joke_maker' | 'marketing' | 'customers' | 'instructor';

const ECON = SIM_CONFIG.economics;
const CFG = DEMO_CONFIG;

const ROLE_META: Record<TutorialRole, { label: string; tag: string; icon: React.ReactNode; color: string }> = {
  joke_maker: { label: 'Joke Maker', tag: 'Production',            icon: <PenTool size={15} />,          color: BRAND.production },
  marketing:  { label: 'Marketing',  tag: 'Curate & publish',      icon: <ClipboardCheck size={15} />,   color: BRAND.marketing },
  customers:  { label: 'AI Customers', tag: `${CFG.customerCount} automated buyers`, icon: <Users size={15} />, color: BRAND.market },
  instructor: { label: 'Instructor', tag: 'Master control',        icon: <SlidersHorizontal size={15} />, color: BRAND.bruinBlue },
};

/* ---------------------------------------------------------------- tiny visuals */

const Badge: React.FC<{ children: React.ReactNode; icon?: React.ReactNode }> = ({ children, icon }) => (
  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 text-[11px] font-semibold">
    {icon}{children}
  </span>
);

const FlowMini: React.FC<{ active: string }> = ({ active }) => {
  const stages: Array<[string, string, string, React.ReactNode]> = [
    ['producing', 'Production', BRAND.production, <PenTool size={16} key="a" />],
    ['marketing', 'Marketing', BRAND.marketing, <ClipboardCheck size={16} key="b" />],
    ['market', 'On Market', BRAND.market, <Store size={16} key="c" />],
    ['sold', 'Sold', BRAND.sold, <ShoppingBag size={16} key="d" />],
  ];
  return (
    <div className="flex items-center gap-1.5">
      {stages.map(([k, l, c, icon], i) => (
        <React.Fragment key={k}>
          <div
            className="flex-1 text-center rounded-lg py-3 border"
            style={{ background: active === k ? `${c}18` : '#f8fafc', borderColor: active === k ? c : '#e5e7eb' }}
          >
            <span style={{ color: active === k ? c : '#94a3b8' }} className="inline-block">{icon}</span>
            <div className="text-[10px] font-semibold mt-1" style={{ color: active === k ? c : '#94a3b8' }}>{l}</div>
          </div>
          {i < 3 && <ArrowRight size={14} className="text-gray-300 shrink-0" />}
        </React.Fragment>
      ))}
    </div>
  );
};

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
      one graded on a scale of its own: it rates how well their title matches the joke — {TITLE_FIT_SCALE} —
      so a vague title costs the team a fraction of a point and a random one costs the whole mark.
    </p>
  </div>
);

const PasteSplitDemo: React.FC = () => {
  const [v, setV] = useState('1) Our standup could’ve been an email.\n2) I hugged my pivot table.\n3) The AI sent a 40-slide deck.');
  const numbered = /\d{1,2}[.)]\s+/.test(v.trim());
  const lines = (numbered ? v.trim().split(/\s*\d{1,2}[.)]\s+/) : v.split('\n')).map(l => l.trim()).filter(Boolean);
  return (
    <div>
      <textarea
        value={v}
        onChange={e => setV(e.target.value)}
        rows={3}
        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400 resize-none"
      />
      <div className="flex items-center gap-2 my-2 text-gray-400 text-xs">
        <ArrowDown size={13} /> Marketing will cut this into {lines.length} jokes
      </div>
      <div className="space-y-1.5">
        {lines.map((l, i) => (
          <div key={i} className="bg-white border border-blue-100 border-l-[3px] border-l-blue-400 rounded-md px-2.5 py-1.5 text-sm text-gray-700">{l}</div>
        ))}
      </div>
    </div>
  );
};

/** Mirrors the real splitter: the text is fixed, only the cut point moves. */
const SplitMini: React.FC = () => (
  <div>
    <div className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-[13px] leading-relaxed joke-font">
      <span className="bg-[#ffd100]/45 rounded-sm">I hugged my pivot table.</span>
      <span className="inline-flex items-center gap-1 rounded-md bg-[#ffd100] text-[#003b5c] text-[10px] font-sans font-bold px-2 py-0.5 mx-1 align-middle">
        Split <CornerDownLeft size={10} />
      </span>
      <span className="text-gray-500">The AI sent a 40-slide deck.</span>
    </div>
    <p className="text-[11px] text-gray-500 mt-2 flex items-start gap-1.5">
      <Scissors size={12} className="mt-0.5 shrink-0" />
      Click between two jokes to place the cut, then press Enter to split them apart.
    </p>
  </div>
);

/** Rank + submit, matching the live rule: Rank 1 always ships.
    Auto-plays a drag-to-reorder motion so users see the two cards can swap;
    any manual interaction pauses the demo. */
const RankSubmitDemo: React.FC = () => {
  const CARD_SHIFT = 74; // ≈ one card height + gap, in px
  const [cards, setCards] = useState([
    { id: 1, t: '“I scheduled a meeting to discuss having fewer meetings. Attendance was full.”' },
    { id: 2, t: '“Coffee is renewable: I renew my entire personality every cup.”' },
  ]);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [lifting, setLifting] = useState(false); // true while the swap glides
  const [touched, setTouched] = useState(false); // manual interaction stops the demo

  // Auto-demo loop: glide the two cards past each other, then commit the swap.
  React.useEffect(() => {
    if (touched) return;
    let alive = true;
    const timers: number[] = [];
    const loop = () => {
      if (!alive) return;
      setLifting(true);
      timers.push(window.setTimeout(() => {
        if (!alive) return;
        setCards(c => (c.length === 2 ? [c[1], c[0]] : c));
        setLifting(false);
        timers.push(window.setTimeout(loop, 1700));
      }, 620));
    };
    timers.push(window.setTimeout(loop, 1300));
    return () => { alive = false; timers.forEach(clearTimeout); };
  }, [touched]);

  const stop = () => setTouched(true);
  const move = (i: number, d: number) => {
    stop();
    setCards(c => {
      const n = [...c];
      const j = i + d;
      if (j < 0 || j >= n.length) return c;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  };
  const toggle = (id: number, isRankOne: boolean) => {
    stop();
    if (isRankOne) return; // Rank 1 can't be deselected — reorder instead
    setSelected(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  return (
    <div className="space-y-2">
      {cards.map((c, i) => {
        const isRankOne = i === 0;
        const sel = selected.has(c.id) && !isRankOne;
        // During the demo glide, top card drops and bottom card lifts, so they cross.
        const dy = lifting ? (i === 0 ? CARD_SHIFT : -CARD_SHIFT) : 0;
        return (
          <div
            key={c.id}
            onClick={e => {
              if ((e.target as HTMLElement).closest('button')) return;
              toggle(c.id, isRankOne);
            }}
            style={{ transform: `translateY(${dy}px)`, transition: 'transform 560ms ease', zIndex: lifting && i === 1 ? 5 : 1 }}
            className={`relative rounded-lg border p-3 cursor-pointer ${
              sel
                ? 'bg-green-50 border-green-400 ring-1 ring-green-400'
                : isRankOne
                ? 'bg-amber-50/60 border-amber-300 border-dashed'
                : 'bg-white border-gray-200 hover:border-gray-300'
            } ${lifting && i === 1 ? 'shadow-lg' : ''}`}
          >
            <div className="flex items-start gap-2">
              <span className="shrink-0 flex flex-col items-center justify-center w-8 h-8 rounded-md bg-gray-900 text-white leading-none">
                <span className="text-[6px] font-bold uppercase tracking-wider text-gray-400">Rank</span>
                <span className="text-xs font-extrabold tabular-nums">{i + 1}</span>
              </span>
              <p className="joke-font flex-1 text-[13px] text-gray-800 leading-snug">{c.t}</p>
              <div className="shrink-0 flex flex-col items-center gap-0.5">
                <GripVertical size={13} className="text-gray-300" />
                <button onClick={() => move(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-25"><ChevronUp size={13} /></button>
                <button onClick={() => move(i, 1)} disabled={i === cards.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-25"><ChevronDown size={13} /></button>
              </div>
            </div>
            <div
              className="mt-2 text-[10px] font-semibold flex items-center gap-1"
              style={{ color: sel ? '#16a34a' : isRankOne ? '#b45309' : '#94a3b8' }}
            >
              {sel ? <Check size={11} /> : isRankOne ? <Star size={11} /> : <MousePointerClick size={11} />}
              {sel ? 'Selected to submit' : isRankOne ? 'Rank 1 — always ships' : 'Click to add'}
            </div>
          </div>
        );
      })}
      <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
        <GripVertical size={12} /> Drag or use the arrows to re-rank · click a lower card to add it · to ship only one, move it to the top.
      </div>
    </div>
  );
};

const SoldSignalMini: React.FC = () => (
  <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
    <div className="flex items-center gap-1.5 mb-1.5">
      <BadgeCheck size={13} className="text-emerald-600" />
      <span className="text-[11px] font-semibold text-emerald-700">Sold · &ldquo;Corporate Comedy&rdquo;</span>
    </div>
    <p className="text-[11px] text-gray-700 mb-2.5">
      Feedback names the criteria only — never the levels, the scores, or the hidden target.
    </p>
    <div className="grid grid-cols-2 gap-2">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 mb-1">Good — keep doing</div>
        {['Length', 'Topic'].map(l => (
          <div key={l} className="text-[11px] text-gray-700 flex items-center gap-1"><Check size={10} className="text-emerald-600" />{l}</div>
        ))}
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-1">Improve</div>
        {['Wordplay', 'Clarity', 'Energy'].map(l => (
          <div key={l} className="text-[11px] text-gray-700 flex items-center gap-1"><ArrowRight size={10} className="text-amber-600" />{l}</div>
        ))}
      </div>
    </div>
  </div>
);

/** Compact 100-dot market — wide grid so it stays short and the modal height
    doesn't jump between steps. The point is the proportion, not the animation. */
const CustomerDemo: React.FC<{ bought?: number; caption?: React.ReactNode }> = ({ bought = 66, caption }) => (
  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
    <div className="grid gap-[2px] mb-2" style={{ gridTemplateColumns: 'repeat(20,1fr)' }}>
      {Array.from({ length: CFG.customerCount }).map((_, i) => (
        <div key={i} className="rounded-[1px] aspect-square" style={{ background: i < bought ? BRAND.sold : '#e2e8f0' }} />
      ))}
    </div>
    <div className="text-[11px] text-gray-600">
      {caption ?? (
        <>
          <b>{bought} of {CFG.customerCount}</b> bought this one. Every customer wants the same joke,
          but each holds a slightly different bar — so a joke near the line sells to some and not others.
        </>
      )}
    </div>
  </div>
);

const FitBar: React.FC = () => {
  // Fit is a sum of 0 / .25 / .5 / .75 / 1 per criterion, so it always lands on
  // a quarter — 7.25 is the demo batch's borderline joke. Bars are drawn from a
  // continuous band, so they need not be quarters.
  const rows: Array<[string, number, string]> = [
    ['Joke’s true fit', 7.25, BRAND.navy],
    ['C1’s bar — buys', 6.78, BRAND.sold],
    ['C2’s bar — skips', 7.28, BRAND.waste],
  ];
  return (
    <div className="space-y-2">
      {rows.map(([l, v, c]) => (
        <div key={l} className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 w-28 shrink-0">{l}</span>
          <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(v / MAX_FIT) * 100}%`, background: c }} />
          </div>
          <span className="text-[11px] font-bold tabular-nums text-gray-700 w-10 text-right">{v}</span>
        </div>
      ))}
      <p className="text-[11px] text-gray-500 pt-1">
        Same joke, same taste — but C1&rsquo;s bar sits below {CFG.tau} and C2&rsquo;s above it, because bars
        are spread evenly across τ ± {CFG.jitter} (jitter = the band&rsquo;s half-width).
      </p>
    </div>
  );
};

const ScoreboardMini: React.FC = () => (
  <div className="space-y-2.5">
    <div className="grid grid-cols-3 gap-2">
      <StatBox label="Rank" value="2" tone="rank" />
      <StatBox label="Sold / Total" value="11/40" tone="blue" />
      <StatBox label="Profit" value={fmt$(8.6)} tone="emerald" valueClassName="text-xl" />
      <StatBox label="Lead time" value="2:40" tone="sky" />
      <StatBox label="Batches" value="7" tone="slate" />
      <StatBox label="Waste" value="29" tone="rose" />
    </div>
    <div className="rounded-lg bg-amber-50 border border-amber-100 p-2.5 flex items-start gap-2">
      <MessageSquare size={13} className="text-amber-600 mt-0.5 shrink-0" />
      <p className="text-[11px] text-gray-700">
        Each batch can carry <b>feedback from Marketing</b> — read it to see what to change next round.
      </p>
    </div>
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
        + {Object.keys(DEFAULT_IDEAL_PROFILE).length - shown.length} more criteria — hidden from every team.
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

function buildSteps(): Record<TutorialRole, Step[]> {
  const criteriaStep: Step = {
    t: 'The 12 criteria',
    b: 'Every published joke is judged on 12 criteria against a hidden "ideal joke" the instructor sets before the round. The more criteria a joke matches outright, the more customers buy it.',
    v: () => <CriteriaGrid />,
  };

  return {
    joke_maker: [
      { t: 'You run Production', b: 'Your team is the Joke Maker. Use any external AI tool to generate jokes, then feed them into the factory in batches. Creating jokes is free — produce as many as you can.', v: () => <FlowMini active="producing" /> },
      { t: 'Paste a batch — Marketing splits it', b: 'Paste the whole block of jokes exactly as the AI gave them to you. Marketing cuts it into individual jokes on their desk.', v: () => <PasteSplitDemo /> },
      { t: 'Then Marketing takes over', b: 'Your batch lands on Marketing’s desk: they rank the jokes, title the ones they back, and publish them to the market. They also send feedback on each batch — read it to see what landed and what to change next time.', v: () => <FlowMini active="marketing" /> },
      criteriaStep,
      { t: 'Read your scoreboard', b: 'Track your rank, jokes sold vs. total made, profit, lead time, batches and waste. Each batch can also carry written feedback from Marketing — open it to see what landed and what to change next time.', v: () => <ScoreboardMini /> },
      { t: 'Who you’re selling to', b: `Your buyers are ${CFG.customerCount} AI customers who all share one hidden sense of humor. The closer your jokes match their taste, the more of them buy — so aim for what this crowd likes, not just any laugh.`, v: () => <CustomerDemo caption={<>A joke that matches their taste sells to most of the {CFG.customerCount}; one that misses sells to few. Your goal is simply to match what they like.</>} /> },
    ],
    marketing: [
      { t: 'You are Marketing', b: 'You decide which jokes reach the market. The Joke Maker sends you raw batches; you split them into jokes, rank the best, title them, and publish the ones worth selling.', v: () => <FlowMini active="marketing" /> },
      { t: 'Split the batch into jokes', b: 'The Joke Maker sends one block of text. Click between two jokes to place a cut, then press Enter to split them into separate jokes.', v: () => <SplitMini /> },
      { t: 'Rank, title & publish', b: 'Put the best joke on top and give each a Topic and a market title. The Rank 1 joke always ships — click any lower card to send it too. To ship only one, drag it to the top.', v: () => <RankSubmitDemo /> },
      { t: 'Every joke costs the team', b: `Publishing a joke costs ${fmt$(ECON.costOfPublishing)}; throwing one away costs ${fmt$(ECON.costOfDiscard)}. Each sale earns ${fmt$(ECON.marketPrice)}. Publish what will actually sell — and don’t sit on the batch.`, v: () => <CostChip lines={[['Publish 2 jokes', `−${fmt$(2 * ECON.costOfPublishing)}`], ['Discard 3 jokes', `−${fmt$(3 * ECON.costOfDiscard)}`], ['Each sale earns', `+${fmt$(ECON.marketPrice)}`]]} /> },
      { t: 'What customers judge', b: 'Customers score every joke on 12 criteria against a hidden ideal. You can’t see the scores, but knowing the criteria tells you what to coach the Joke Maker on — and Title Fit is one you control directly.', v: () => <CriteriaGrid /> },
      { t: 'Who you’re selling to', b: `Your buyers are ${CFG.customerCount} AI customers who all share one hidden ideal joke. A joke that fits sells to most of them; one that half-fits sells to some. Your job is to read the market and figure out what they want.`, v: () => <CustomerDemo /> },
      { t: 'Coach the Joke Maker', b: 'Every sale tells you which criteria the joke did well on and which to improve — names only, never the scores. Send that back so the next batch lands closer to what customers want.', v: () => <SoldSignalMini /> },
    ],
    customers: [
      { t: `${CFG.customerCount} AI customers`, b: 'Customers are fully automated. They share one hidden ideal joke set by the instructor, and every joke scores the same for all of them — what differs is the bar each one holds.', v: () => <CustomerDemo /> },
      criteriaStep,
      { t: 'One score per joke', b: `Each criterion scores 1 when the joke matches the ideal exactly, 0.5 when it is one step away on a scale, and 0 beyond that — so being close only half counts, and two steps off scores the same as being completely wrong. Add them up for the joke's true fit, from 0 to ${MAX_FIT}. Clear a customer's bar (around τ = ${CFG.tau}) and they buy.`, v: () => <FitBar /> },
      { t: 'Everyone’s bar is a little different', b: `Bars are spread evenly across τ = ${CFG.tau} ± ${CFG.jitter} rather than clustering at the centre. A joke above the top of that band clears every bar; one sitting inside it clears only some. That's why demand is partial, not all-or-nothing.`, v: () => <CustomerDemo bought={52} /> },
      { t: 'Buy, then swap', b: `With ${fmt$(CFG.budget)} at ${fmt$(CFG.marketPrice)} a joke, each customer holds ${CFG.budget / CFG.marketPrice}. Once full, a new joke only gets in if it beats the weakest one they hold by more than ${CFG.swapMargin} — otherwise they keep what they have.`, v: () => <FitBar /> },
    ],
    instructor: [
      { t: 'Build the room', b: 'Create teams, assign Joke Maker / Marketing roles, and watch the live distribution as students join the lobby.', v: () => <CostChip lines={[['4 teams', '8 students'], ['AI customers', String(CFG.customerCount)]]} /> },
      { t: 'Set the hidden ideal', b: `Choose one level on each of the ${IDEAL_DIMENSIONS.length} criteria that have a target — the secret ideal the AI customers reward. Title Fit is the twelfth: it grades itself, so there is nothing to set. Then tune τ, jitter, swap margin, budget, and the two costs.`, v: () => <ProfileMini /> },
      criteriaStep,
      { t: 'Run the rounds', b: 'Start, end, and reset rounds. Between rounds reveal teammates so Round 2 can co-locate Production and Marketing — the intervention that fixes the information flow.', v: () => <RoundMini /> },
      { t: 'Watch it land', b: 'Your dashboard tracks the leaderboard, sales over time, average fit, waste and lead time — so the chaos-to-kaizen story is visible in the numbers.', v: () => <RoundMini /> },
    ],
  };
}

/* ---------------------------------------------------------------- main */

const Tutorial: React.FC<{ initialRole?: TutorialRole; onClose?: () => void }> = ({
  initialRole = 'joke_maker',
  onClose,
}) => {
  const STEPS = useMemo(buildSteps, []);
  const [role, setRole] = useState<TutorialRole>(initialRole);
  const [step, setStep] = useState(0);
  const steps = STEPS[role];
  const meta = ROLE_META[role];
  const last = step === steps.length - 1;

  const go = (r: TutorialRole) => { setRole(r); setStep(0); };

  return (
    <div>
      {/* role tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {(Object.keys(ROLE_META) as TutorialRole[]).map(k => {
          const m = ROLE_META[k];
          return (
            <button
              key={k}
              onClick={() => go(k)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                role === k ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
              style={role === k ? { background: m.color } : undefined}
            >
              {m.icon} {m.label}
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <div className="grid md:grid-cols-2 gap-0 -m-4">
          {/* left: copy + steps */}
          <div className="p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <Badge icon={meta.icon}>{meta.label}</Badge>
              <span className="text-[11px] text-gray-400">{meta.tag}</span>
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
                    style={{ width: i === step ? 28 : 14, background: i <= step ? meta.color : '#e5e7eb' }}
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
                    style={{ background: meta.color }}
                    onClick={() => onClose?.()}
                  >
                    Got it — start <Check size={14} />
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
    </div>
  );
};

export default Tutorial;
