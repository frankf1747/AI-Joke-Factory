/* Sold ÷ published per batch, in submission order — the team's learning curve.
   A rising line means later batches sell better: the feedback loop is working.
   Pure SVG, no library; fixed height, stretches to its container's width. The points come from
   services/leanMode.ts learningCurvePoints, which is unit-tested. */
import React from 'react';
import type { BatchPoint } from '../types/api';
import { learningCurvePoints } from '../services/leanMode';

export const LearningCurve: React.FC<{ series: BatchPoint[]; height?: number }> = ({ series, height = 48 }) => {
  const pts = learningCurvePoints(series);
  if (pts.length === 0) {
    return <p className="text-xs italic text-gray-400">No published batches yet.</p>;
  }
  // Fixed pixel height, full container width: the viewBox stretches only
  // horizontally (preserveAspectRatio="none"). Strokes don't scale, and the
  // dots are zero-length round-capped strokes, so they stay round at any width.
  const w = 280;
  const x = (i: number) => (pts.length === 1 ? w / 2 : (i / (pts.length - 1)) * (w - 8) + 4);
  const y = (r: number) => height - 4 - r * (height - 8);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.rate).toFixed(1)}`).join(' ');
  const latest = Math.round(pts[pts.length - 1].rate * 100);
  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${w} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        className="block"
        role="img"
        aria-label={`Sell-through per batch, latest ${latest}%`}
      >
        <line x1="0" y1={y(0)} x2={w} y2={y(0)} stroke="#e5e7eb" vectorEffect="non-scaling-stroke" />
        <path d={d} fill="none" stroke="#059669" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {pts.map((p, i) => (
          <path
            key={p.seq}
            d={`M${x(i).toFixed(1)},${y(p.rate).toFixed(1)}h0`}
            stroke="#059669"
            strokeWidth="5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <figcaption className="text-[10px] text-gray-500">
        Sell-through per batch · {pts.length} batch{pts.length === 1 ? '' : 'es'} · latest {latest}%
      </figcaption>
    </figure>
  );
};

export default LearningCurve;
