import React, { useMemo, useState } from 'react';
import { Card, RoleLayout, BRAND } from '../components';
import {
  ShoppingBag, X, Repeat, DollarSign,
  Factory, ClipboardCheck, Bot, ChevronRight, Info, Cpu, Sparkles, Eye, Ban,
} from 'lucide-react';
import {
  simulateCustomer, simulateMarket, normalPdf, DEMO_JOKES, DEMO_CONFIG,
  type DecisionStep, type Verdict, type DimScore, type JokeMarketResult,
} from '../services/aiCustomerDemo';

/* ---- verdict styling ---- */
const VERDICT: Record<Verdict, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  BUY:       { label: 'Bought',                 color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', icon: <ShoppingBag size={14} /> },
  SWAP:      { label: 'Swapped in',             color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', icon: <Repeat size={14} /> },
  SKIP_LOW:  { label: 'Skipped · below bar',    color: '#b45309', bg: '#fffbeb', border: '#fde68a', icon: <X size={14} /> },
  SKIP_FULL: { label: 'Skipped · budget full',  color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', icon: <X size={14} /> },
};

const CFG = DEMO_CONFIG;
const fit2 = (n: number) => n.toFixed(2);

/* ---- Pipeline breadcrumb: where this stage sits in the game ---- */
const Pipeline: React.FC = () => {
  const stages = [
    { label: 'Production', sub: 'Joke Makers create', icon: <Factory size={15} />, active: false },
    { label: 'Marketing', sub: 'title & publish', icon: <ClipboardCheck size={15} />, active: false },
    { label: 'AI Customers', sub: `${CFG.customerCount} automated buyers`, icon: <Bot size={15} />, active: true },
  ];
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {stages.map((s, i) => (
        <React.Fragment key={s.label}>
          <div
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 border ${
              s.active ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-white border-gray-200 text-gray-400'
            }`}
          >
            <span className={s.active ? 'text-indigo-600' : 'text-gray-300'}>{s.icon}</span>
            <span className="leading-tight">
              <span className="block text-xs font-bold">{s.label}</span>
              <span className="block text-[10px] opacity-80">{s.sub}</span>
            </span>
          </div>
          {i < stages.length - 1 && <ChevronRight size={16} className="text-gray-300" />}
        </React.Fragment>
      ))}
    </div>
  );
};

/* ---- A single dimension row in the scorecard ---- */
const DimRow: React.FC<{ d: DimScore }> = ({ d }) => (
  <div className={`flex items-center gap-2 py-1 ${d.placeholder ? 'opacity-45' : ''}`}>
    <span className="w-24 shrink-0 text-[11px] font-semibold text-gray-600 truncate" title={d.label}>{d.label}</span>
    {d.placeholder ? (
      <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded bg-gray-100 text-gray-500" title="Categories not defined yet — contributes 0">
        <Ban size={9} /> N/A
      </span>
    ) : (
      <span
        className={`shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded ${
          d.source === 'rule' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'
        }`}
        title={d.source === 'rule' ? 'Scored in code from the word count' : 'Classified by the LLM'}
      >
        {d.source === 'rule' ? <Cpu size={9} /> : <Sparkles size={9} />}
        {d.source === 'rule' ? 'Rule' : 'LLM'}
      </span>
    )}
    <span className="w-32 shrink-0 text-[11px] text-gray-500 truncate" title={`joke: ${d.level} · ideal: ${d.ideal}`}>
      {d.placeholder ? '—' : d.level}
      {!d.placeholder && d.level !== d.ideal && <span className="text-gray-300"> → {d.ideal}</span>}
    </span>
    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.round(d.fit * 100)}%`, background: d.pass ? '#10b981' : '#f59e0b' }}
      />
    </div>
    <span className={`w-11 shrink-0 text-right text-[11px] font-bold tabular-nums ${d.pass ? 'text-emerald-600' : 'text-gray-400'}`}>
      {d.placeholder ? '0' : `+${d.fit.toFixed(2)}`}
    </span>
  </div>
);

/* ---- The threshold distribution: customers' bars are normal(τ, jitter).
   A customer buys when their bar ≤ the joke's fit, i.e. the area to the LEFT
   of the fit line. That shaded area is the share of the market that buys. ---- */
const ThresholdCurve: React.FC<{ result: JokeMarketResult }> = ({ result }) => {
  const W = 300;
  const H = 108;
  const mean = CFG.tau;
  const sd = CFG.jitter;
  // Plot ±3.2 sd around τ so the whole bell fits.
  const lo = mean - 3.2 * sd;
  const hi = mean + 3.2 * sd;
  const x2px = (x: number) => ((x - lo) / (hi - lo)) * W;
  const peak = normalPdf(mean, mean, sd);
  const y2px = (y: number) => H - (y / peak) * (H - 10);

  const N = 80;
  const pts = Array.from({ length: N + 1 }, (_, i) => {
    const x = lo + (i / N) * (hi - lo);
    return { x, px: x2px(x), py: y2px(normalPdf(x, mean, sd)) };
  });
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ');

  // Shaded "buys" region: everything with a bar ≤ the joke's fit.
  const fitClamped = Math.max(lo, Math.min(hi, result.trueFit));
  const fillPts = pts.filter(p => p.x <= fitClamped);
  const fitPx = x2px(fitClamped);
  const area =
    fillPts.length > 0
      ? `M${fillPts[0].px.toFixed(1)},${H} ` +
        fillPts.map(p => `L${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ') +
        ` L${fitPx.toFixed(1)},${y2px(normalPdf(fitClamped, mean, sd)).toFixed(1)} L${fitPx.toFixed(1)},${H} Z`
      : '';

  const tauPx = x2px(mean);
  const buysRight = result.trueFit >= mean;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label="Customer threshold distribution">
        {area && <path d={area} fill={BRAND.sold} fillOpacity={0.22} />}
        <path d={line} fill="none" stroke="#94a3b8" strokeWidth={1.5} />
        {/* τ (the mean bar) */}
        <line x1={tauPx} y1={4} x2={tauPx} y2={H} stroke="#334155" strokeWidth={1} strokeDasharray="3 2" />
        <text x={tauPx} y={H + 13} textAnchor="middle" fontSize="9" fill="#334155">τ {CFG.tau}</text>
        {/* the joke's fit */}
        <line x1={fitPx} y1={0} x2={fitPx} y2={H} stroke={BRAND.sold} strokeWidth={2} />
        <text x={fitPx} y={H + 13} textAnchor={buysRight ? 'end' : 'start'} fontSize="9" fontWeight="700" fill={BRAND.sold}>
          fit {fit2(result.trueFit)}
        </text>
      </svg>
      <div className="text-sm font-bold text-gray-900 mt-1">
        {result.bought} of {CFG.customerCount} bought
      </div>
      <div className="text-[11px] text-gray-500">
        Everyone whose bar (normal, centered on τ) falls at or below the joke's fit buys — the green area.
      </div>
    </div>
  );
};

/* ---- Scorecard for the selected joke ---- */
const Scorecard: React.FC<{ step: DecisionStep; result: JokeMarketResult }> = ({ step, result }) => {
  const v = VERDICT[step.verdict];
  const { trueFit, maxFit } = step.score;
  const leftPct = (n: number) => `${(n / maxFit) * 100}%`;
  const cleared = trueFit >= CFG.tau;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-[11px] font-mono text-gray-400">JOKE #{step.joke.id}</div>
          <div className="font-bold text-gray-900 truncate">{step.joke.title}</div>
          <div className="text-sm text-gray-500 italic mt-0.5 line-clamp-2">"{step.joke.text}"</div>
        </div>
        <span
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border"
          style={{ color: v.color, background: v.bg, borderColor: v.border }}
          title="What the representative customer did"
        >
          {v.icon} {v.label}
        </span>
      </div>

      {/* true_fit gauge: 0..maxFit, with the τ marker */}
      <div className="mb-3">
        <div className="flex justify-between text-[11px] font-semibold text-gray-500 mb-1">
          <span>True fit — the sum of all dimension fits</span>
          <span className="tabular-nums text-gray-800">{fit2(trueFit)} / {maxFit}</span>
        </div>
        <div className="relative h-3 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: leftPct(trueFit), background: cleared ? '#10b981' : '#f59e0b' }}
          />
          {/* τ line — the average customer bar */}
          <div
            className="absolute top-[-2px] bottom-[-2px] w-0.5 bg-gray-800"
            style={{ left: leftPct(CFG.tau) }}
            title={`Average buy threshold τ = ${CFG.tau}`}
          />
        </div>
        <div className="text-[10px] text-gray-400 mt-1">
          τ = {CFG.tau} of {maxFit} (the average bar) · see the spread of bars in the market panel ·
          {' '}{step.score.passedCount}/{step.score.dims.length - 1} dimensions at or above {CFG.perDimBar}
        </div>
      </div>

      {/* Per-dimension breakdown */}
      <div className="divide-y divide-gray-50">
        {step.score.dims.map(d => <DimRow key={d.id} d={d} />)}
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 text-xs">
        <span className="font-semibold text-gray-500">Sum</span>
        <span className="font-bold tabular-nums text-gray-900">{fit2(trueFit)} / {maxFit}</span>
      </div>

      {/* Decision narration for the representative customer */}
      <div
        className="mt-3 rounded-lg px-3 py-2 text-xs font-medium border"
        style={{ color: v.color, background: v.bg, borderColor: v.border }}
      >
        {step.note}
      </div>

      {/* What the whole market did */}
      <div className="mt-2 rounded-lg px-3 py-2 text-xs bg-gray-50 border border-gray-200 text-gray-600">
        Across all {CFG.customerCount} customers:{' '}
        <b className="text-emerald-700">{result.counts.BUY} bought</b>
        {result.counts.SWAP > 0 && <> · <b className="text-violet-700">{result.counts.SWAP} swapped in</b></>}
        {result.counts.SKIP_LOW > 0 && <> · <b className="text-amber-700">{result.counts.SKIP_LOW} below their bar</b></>}
        {result.counts.SKIP_FULL > 0 && <> · <b className="text-slate-600">{result.counts.SKIP_FULL} out of budget</b></>}
        {result.held !== result.bought && (
          <> · only <b>{result.held}</b> still hold it at the end (the rest swapped it out)</>
        )}
      </div>
    </div>
  );
};

const Customer: React.FC = () => {
  // One representative customer (bar = τ) drives the walkthrough; the market run
  // gives the per-joke totals. Both are pure, so this computes once.
  const steps = useMemo(() => simulateCustomer(DEMO_JOKES, CFG, CFG.tau), []);
  const market = useMemo(() => simulateMarket(DEMO_JOKES, CFG, 1), []);
  const [idx, setIdx] = useState(0);

  const current = steps[idx];
  const currentResult = market[current.joke.id];

  return (
    <RoleLayout>
      <div className="space-y-5">
        {/* Header + context */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Bot size={20} className="text-indigo-600" /> AI Customer Engine — how the backend buys
              </h1>
              <p className="text-sm text-gray-500">
                {CFG.customerCount} AI customers deciding on a batch of {DEMO_JOKES.length} published jokes.
                Click any joke to see its scoring.
              </p>
            </div>
            <Pipeline />
          </div>

          <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-3 py-2 text-xs flex items-start gap-2">
            <Eye size={14} className="mt-0.5 shrink-0" />
            <span>
              <b>Instructor-only view.</b> This shows the engine's internal per-dimension scoring and the
              hidden ideal. Marketing only ever sees which dimensions were good or need work — never the
              numbers, the levels, or the target itself.
            </span>
          </div>
        </div>

        {/* The three rules, stated plainly */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card title="1 · Score" subtitle="once per joke">
            <p className="text-[12px] text-gray-600 leading-relaxed">
              Each joke is classified on <b>12 dimensions</b> and compared to the instructor's hidden ideal.
              Add up the {steps[0].score.maxFit} scored fits → <b>true fit</b>, from 0 to {steps[0].score.maxFit}.
              <span className="block mt-1 text-gray-400">Structure has no agreed categories yet, so it scores 0 and sits out.</span>
            </p>
          </Card>
          <Card title="2 · Jitter" subtitle="why demand is partial">
            <p className="text-[12px] text-gray-600 leading-relaxed">
              Every customer wants the same thing, but holds a slightly different bar. The bars
              form a <b>bell curve around τ</b> (jitter = its spread). A joke well above τ sells
              to everyone; one sitting near τ sells to <b>some but not all</b>.
            </p>
          </Card>
          <Card title="3 · Buy or swap" subtitle="budget makes it competitive">
            <p className="text-[12px] text-gray-600 leading-relaxed">
              Buy while budget lasts (${CFG.budget.toFixed(2)} at ${CFG.price.toFixed(2)} each → {CFG.budget / CFG.price} jokes).
              Once full, a new joke only gets in if it beats the weakest one held by more
              than <b>M = {CFG.swapMargin}</b> — otherwise the customer holds.
            </p>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* LEFT: the market, then one customer close-up */}
          <div className="space-y-4">
            <Card title="Customer bars" subtitle={`joke #${current.joke.id} · ${CFG.customerCount} customers`} accent={BRAND.sold}>
              <ThresholdCurve result={currentResult} />
            </Card>

            <Card title="One customer, close up" subtitle="bar set exactly at τ" accent={BRAND.production}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 flex items-center gap-1.5">
                  <DollarSign size={13} className="text-emerald-600" /> Budget left
                </span>
                <span className="text-lg font-bold tabular-nums text-gray-900">${current.budgetAfter.toFixed(2)}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-3">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.round((current.budgetAfter / CFG.budget) * 100)}%` }}
                />
              </div>
              <div className="space-y-1.5 min-h-[54px]">
                {current.basket.length === 0 ? (
                  <p className="text-sm text-gray-400 italic text-center py-3">Holding nothing yet</p>
                ) : (
                  current.basket.map(id => {
                    const jk = DEMO_JOKES.find(j => j.id === id)!;
                    return (
                      <div key={id} className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-md px-2.5 py-1.5">
                        <ShoppingBag size={13} className="text-emerald-600 shrink-0" />
                        <span className="text-xs font-medium text-gray-800 truncate">#{id} {jk.title}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            <Card title="How to read this">
              <ul className="text-[11px] text-gray-600 space-y-2">
                <li className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded bg-sky-100 text-sky-700"><Cpu size={9} /> Rule</span>
                  Length — scored in code from the word count.
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded bg-violet-100 text-violet-700"><Sparkles size={9} /> LLM</span>
                  The other 11 — one model call per batch.
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded bg-gray-100 text-gray-500"><Ban size={9} /> N/A</span>
                  Structure — placeholder, contributes 0.
                </li>
                <li className="flex items-start gap-2 pt-1 border-t border-gray-100">
                  <Info size={12} className="mt-0.5 shrink-0 text-gray-400" />
                  <span>
                    <b>Title Fit</b> is the one dimension Marketing owns outright — it grades their title
                    against the joke itself, so it has no ideal to match.
                  </span>
                </li>
              </ul>
            </Card>
          </div>

          {/* RIGHT: batch queue + scorecard */}
          <div className="lg:col-span-2 space-y-4">
            <Card title={`Batch of ${DEMO_JOKES.length}`} subtitle="published jokes entering the market" accent={BRAND.production}>
              <div className="space-y-1.5">
                {steps.map((s, i) => {
                  const isActive = i === idx;
                  const r = market[s.joke.id];
                  return (
                    <button
                      key={s.joke.id}
                      onClick={() => setIdx(i)}
                      className={`w-full text-left flex items-center gap-3 rounded-lg border px-3 py-2 transition ${
                        isActive ? 'border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200' : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <span className="font-mono text-[11px] text-gray-400 w-5 shrink-0">#{s.joke.id}</span>
                      <span className="text-sm text-gray-800 flex-1 truncate">{s.joke.title}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-gray-500 w-16 text-right">
                        fit {fit2(r.trueFit)}
                      </span>
                      <span
                        className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border w-24 justify-center"
                        style={
                          r.bought === 0
                            ? { color: VERDICT.SKIP_LOW.color, background: VERDICT.SKIP_LOW.bg, borderColor: VERDICT.SKIP_LOW.border }
                            : { color: VERDICT.BUY.color, background: VERDICT.BUY.bg, borderColor: VERDICT.BUY.border }
                        }
                      >
                        {r.bought}/{CFG.customerCount} sold
                      </span>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Scorecard step={current} result={currentResult} />
          </div>
        </div>
      </div>
    </RoleLayout>
  );
};

export default Customer;
