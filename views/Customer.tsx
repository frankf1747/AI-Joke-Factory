import React, { useEffect, useMemo, useState } from 'react';
import { Card, RoleLayout, BRAND } from '../components';
import {
  Play, Pause, SkipForward, RotateCcw, ShoppingBag, X, Repeat, DollarSign,
  Factory, ClipboardCheck, Bot, ChevronRight, Info, Cpu, Sparkles, Eye,
} from 'lucide-react';
import {
  simulateCustomer, DEMO_JOKES, DEMO_CONFIG,
  type DecisionStep, type Verdict, type DimScore,
} from '../services/aiCustomerDemo';

/* ---- verdict styling ---- */
const VERDICT: Record<Verdict, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  BUY:       { label: 'Bought',                 color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', icon: <ShoppingBag size={14} /> },
  SWAP:      { label: 'Swapped in',             color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', icon: <Repeat size={14} /> },
  SKIP_LOW:  { label: 'Skipped · below bar',    color: '#b45309', bg: '#fffbeb', border: '#fde68a', icon: <X size={14} /> },
  SKIP_FULL: { label: 'Skipped · budget full',  color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', icon: <X size={14} /> },
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

/* ---- Pipeline breadcrumb: where this stage sits in the game ---- */
const Pipeline: React.FC = () => {
  const stages = [
    { label: 'Production', sub: 'Joke Makers create', icon: <Factory size={15} />, active: false },
    { label: 'Quality Control', sub: 'rate & publish', icon: <ClipboardCheck size={15} />, active: false },
    { label: 'AI Customer', sub: 'Sales — buying', icon: <Bot size={15} />, active: true },
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
  <div className="flex items-center gap-2 py-1">
    <span className="w-24 shrink-0 text-[11px] font-semibold text-gray-600 truncate" title={d.label}>{d.label}</span>
    <span
      className={`shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded ${
        d.source === 'rule' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'
      }`}
      title={d.source === 'rule' ? 'Rule-based (deterministic / QC-classifiable)' : 'LLM-inferred'}
    >
      {d.source === 'rule' ? <Cpu size={9} /> : <Sparkles size={9} />}
      {d.source === 'rule' ? 'Rule' : 'LLM'}
    </span>
    <span className="w-32 shrink-0 text-[11px] text-gray-500 truncate" title={`joke: ${d.level} · ideal: ${d.ideal}`}>
      {d.level}
      {d.level !== d.ideal && <span className="text-gray-300"> → {d.ideal}</span>}
    </span>
    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.round(d.fit * 100)}%`, background: d.pass ? '#10b981' : '#f59e0b' }}
      />
    </div>
    <span className={`w-9 shrink-0 text-right text-[11px] font-bold tabular-nums ${d.pass ? 'text-emerald-600' : 'text-amber-600'}`}>
      {pct(d.fit)}
    </span>
  </div>
);

/* ---- Scorecard for the currently-processing joke ---- */
const Scorecard: React.FC<{ step: DecisionStep }> = ({ step }) => {
  const v = VERDICT[step.verdict];
  const { overall } = step.score;
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
        >
          {v.icon} {v.label}
        </span>
      </div>

      {/* Overall score gauge with threshold marker */}
      <div className="mb-3">
        <div className="flex justify-between text-[11px] font-semibold text-gray-500 mb-1">
          <span>Overall fit</span>
          <span className="tabular-nums text-gray-800">{pct(overall)}</span>
        </div>
        <div className="relative h-3 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.round(overall * 100)}%`, background: overall >= DEMO_CONFIG.threshold ? '#10b981' : '#f59e0b' }}
          />
          {/* threshold line */}
          <div
            className="absolute top-[-2px] bottom-[-2px] w-0.5 bg-gray-800"
            style={{ left: `${Math.round(DEMO_CONFIG.threshold * 100)}%` }}
            title={`Buy threshold ${pct(DEMO_CONFIG.threshold)}`}
          />
        </div>
        <div className="text-[10px] text-gray-400 mt-1">
          Buy threshold = {pct(DEMO_CONFIG.threshold)} · {step.score.passedCount}/{step.score.dims.length} dimensions pass
        </div>
      </div>

      {/* Per-dimension breakdown */}
      <div className="divide-y divide-gray-50">
        {step.score.dims.map(d => <DimRow key={d.id} d={d} />)}
      </div>

      {/* Decision narration */}
      <div
        className="mt-3 rounded-lg px-3 py-2 text-xs font-medium border"
        style={{ color: v.color, background: v.bg, borderColor: v.border }}
      >
        {step.note}
      </div>
    </div>
  );
};

const Customer: React.FC = () => {
  const steps = useMemo(() => simulateCustomer(DEMO_JOKES, DEMO_CONFIG), []);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  const last = steps.length - 1;
  const atEnd = idx >= last;

  // Auto-advance while playing.
  useEffect(() => {
    if (!playing) return;
    if (atEnd) { setPlaying(false); return; }
    const t = window.setTimeout(() => setIdx(i => Math.min(i + 1, last)), 1600);
    return () => window.clearTimeout(t);
  }, [playing, idx, atEnd, last]);

  const current = steps[idx];
  const budget = current.budgetAfter;
  const basket = current.basket;

  // Jokes returned by a swap in any revealed step.
  const returnedSet = useMemo(() => {
    const s = new Set<string>();
    for (let i = 0; i <= idx; i++) if (steps[i].returnedJokeId) s.add(steps[i].returnedJokeId!);
    return s;
  }, [idx, steps]);

  const restart = () => { setIdx(0); setPlaying(false); };

  // Summary tallies over revealed steps.
  const revealed = steps.slice(0, idx + 1);
  const bought = revealed.filter(s => (s.verdict === 'BUY' || s.verdict === 'SWAP') && !returnedSet.has(s.joke.id)).length;

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
                A self-contained illustration of one customer processing a batch of 5 published jokes.
              </p>
            </div>
            <Pipeline />
          </div>

          <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-3 py-2 text-xs flex items-start gap-2">
            <Eye size={14} className="mt-0.5 shrink-0" />
            <span>
              <b>Instructor-only view.</b> This shows the engine's internal per-dimension scoring.
              Marketing never sees this — they only get obscured class-level sales trends.
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => (atEnd ? restart() : setPlaying(p => !p))}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
          >
            {atEnd ? <><RotateCcw size={15} /> Replay</> : playing ? <><Pause size={15} /> Pause</> : <><Play size={15} /> Play</>}
          </button>
          <button
            onClick={() => { setPlaying(false); setIdx(i => Math.min(i + 1, last)); }}
            disabled={atEnd}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <SkipForward size={15} /> Step
          </button>
          <button
            onClick={restart}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <RotateCcw size={15} /> Restart
          </button>
          <span className="text-xs text-gray-500 ml-1">Joke {idx + 1} of {steps.length}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* LEFT: customer wallet + basket + legend */}
          <div className="space-y-4">
            <Card className="bg-gradient-to-br from-gray-900 to-gray-800 text-white border-none">
              <div className="py-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider opacity-70 flex items-center gap-1.5">
                    <DollarSign size={14} className="text-emerald-400" /> Budget remaining
                  </span>
                  <span className="text-2xl font-bold tabular-nums">${budget.toFixed(2)}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                    style={{ width: `${Math.round((budget / DEMO_CONFIG.budget) * 100)}%` }}
                  />
                </div>
                <div className="mt-1.5 text-[11px] opacity-60">
                  ${DEMO_CONFIG.budget.toFixed(2)} start · ${DEMO_CONFIG.price.toFixed(2)} per joke
                </div>
              </div>
            </Card>

            <Card title="Basket" subtitle={`${bought} held`} accent={BRAND.production}>
              <div className="space-y-1.5 min-h-[60px]">
                {basket.length === 0 ? (
                  <p className="text-sm text-gray-400 italic text-center py-3">Nothing bought yet</p>
                ) : (
                  basket.map(id => {
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
                  Length &amp; topic — scored deterministically.
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded bg-violet-100 text-violet-700"><Sparkles size={9} /> LLM</span>
                  The other 9 dimensions — inferred by the model.
                </li>
                <li className="flex items-start gap-2 pt-1 border-t border-gray-100">
                  <Info size={12} className="mt-0.5 shrink-0 text-gray-400" />
                  Each joke buys if overall fit clears the threshold and budget allows; a better joke can swap out a weaker held one.
                </li>
              </ul>
            </Card>
          </div>

          {/* RIGHT: batch queue + active scorecard */}
          <div className="lg:col-span-2 space-y-4">
            <Card title="Batch of 5" subtitle="published jokes entering the market" accent={BRAND.production}>
              <div className="space-y-1.5">
                {steps.map((s, i) => {
                  const revealedStep = i <= idx;
                  const isActive = i === idx;
                  const v = VERDICT[s.verdict];
                  const returned = returnedSet.has(s.joke.id);
                  return (
                    <button
                      key={s.joke.id}
                      onClick={() => { setPlaying(false); setIdx(i); }}
                      className={`w-full text-left flex items-center gap-3 rounded-lg border px-3 py-2 transition ${
                        isActive ? 'border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200' : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <span className="font-mono text-[11px] text-gray-400 w-5 shrink-0">#{s.joke.id}</span>
                      <span className="text-sm text-gray-800 flex-1 truncate">{s.joke.title}</span>
                      {!revealedStep ? (
                        <span className="text-[11px] text-gray-400 italic shrink-0">Queued</span>
                      ) : returned ? (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full text-slate-500 bg-slate-100 border border-slate-200">
                          <RotateCcw size={11} /> Returned
                        </span>
                      ) : (
                        <span
                          className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border"
                          style={{ color: v.color, background: v.bg, borderColor: v.border }}
                        >
                          {v.icon} {v.label}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>

            <Scorecard step={current} />
          </div>
        </div>
      </div>
    </RoleLayout>
  );
};

export default Customer;
