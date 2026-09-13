/* Presentational primitives, split out of the components barrel so leaf modules
   (e.g. components/Tutorial.tsx) can use them without an import cycle.
   `components.tsx` re-exports everything here, so existing imports keep working. */

import React from 'react';


export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'purple' | 'outline' | 'gold' | 'navy' }> = ({
  children, variant = 'primary', className = '', ...props
}) => {
  const variants = {
    // GOLD is the hero CTA — navy text on UCLA gold for maximum blue-on-gold contrast.
    primary: 'bg-[#ffd100] hover:bg-[#f5c400] text-[#003b5c] shadow-sm shadow-[#ffd100]/40',
    gold: 'bg-[#ffd100] hover:bg-[#f5c400] text-[#003b5c] shadow-sm shadow-[#ffd100]/40',
    navy: 'bg-[#003b5c] hover:bg-[#002b44] text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800',
    danger: 'bg-red-500 hover:bg-red-600 text-white',
    success: 'bg-green-600 hover:bg-green-700 text-white',
    purple: 'bg-[#003b5c] hover:bg-[#002b44] text-white',    // legacy alias → navy
    outline: 'bg-white hover:bg-gray-50 text-gray-800 border border-gray-300',
  };
  return (
    <button 
      className={`px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  accent?: string;
}> = ({ children, className = '', title, subtitle, action, accent }) => (
  <div
    className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${className}`}
    style={accent ? { borderTop: `3px solid ${accent}` } : undefined}
  >
    {(title || action) && (
      <div className="px-4 py-3 bg-gray-50/70 border-b border-gray-100 flex justify-between items-center">
        <div>
          <div className="font-semibold text-gray-800 text-sm">{title}</div>
          {subtitle && <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>}
        </div>
        {action && <div>{action}</div>}
      </div>
    )}
    <div className="p-4">{children}</div>
  </div>
);

export type StatBoxTone =
  | 'slate' | 'blue' | 'indigo' | 'emerald' | 'amber' | 'violet' | 'rose' | 'rank'
  | 'gold' | 'navy' | 'sky';

// UCLA blue-and-gold discipline with a smooth hierarchy:
//   HERO   → gold (one saturated tile leads the eye)
//   MID    → navy / bruin-blue solid, white text (key stats, on-brand)
//   SOFT   → navy-tinted fills (supporting stats recede, but not washed-out)
//   ACCENT → green / red kept muted + on-palette so they read semantically
//            without shouting louder than the positive metrics.
const STAT_TONES: Record<StatBoxTone, string> = {
  // ---- HERO (near-black navy text for crisp contrast on bright gold) ----
  gold:    'bg-[#ffd100] text-[#00263a] shadow-md shadow-[#ffd100]/40',
  rank:    'bg-[#ffd100] text-[#00263a] shadow-md shadow-[#ffd100]/40',
  // ---- MID (solid, on-brand blues) ----
  blue:    'bg-[#2774AE] text-white shadow-sm',
  navy:    'bg-[#003b5c] text-white shadow-sm',
  // ---- SOFT supporting (navy-tinted, not pale) ----
  sky:     'bg-[#003b5c]/[0.07] text-[#003b5c]',
  slate:   'bg-[#003b5c]/[0.07] text-[#334155]',
  indigo:  'bg-[#003b5c]/[0.07] text-[#003b5c]',
  violet:  'bg-[#003b5c]/[0.07] text-[#003b5c]',
  // ---- SEMANTIC accents (muted, outlined — present but never the loudest) ----
  emerald: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  rose:    'bg-[#fdecec] text-[#b23b3b] ring-1 ring-[#e8b7b7]',
  amber:   'bg-[#fff5da] text-[#8a6d00] ring-1 ring-[#ffe08a]',
};

export const StatBox: React.FC<{
  label: string;
  value: string | number;
  tone?: StatBoxTone;
  sub?: string;
  /** @deprecated use `tone` */
  color?: string;
  className?: string;
  valueClassName?: string;
  labelClassName?: string;
}> = ({ label, value, tone, sub, color, className = '', valueClassName = '', labelClassName = '' }) => {
  // Back-compat: legacy `color` prop (raw className) takes precedence if provided.
  const toneClass = color ?? STAT_TONES[tone ?? 'slate'];
  return (
    <div className={`px-3 py-3 rounded-lg flex flex-col items-center justify-center text-center ${toneClass} ${className}`}>
      <span className={`text-2xl font-bold tabular-nums leading-none ${valueClassName}`}>{value}</span>
      <span className={`text-[10px] font-bold uppercase tracking-wide opacity-85 mt-1.5 ${labelClassName}`}>{label}</span>
      {sub && <span className="text-[10px] opacity-60 mt-0.5">{sub}</span>}
    </div>
  );
};

export const SectionLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children, className = '',
}) => (
  <div className={`text-[11px] font-bold text-gray-400 uppercase tracking-wider ${className}`}>
    {children}
  </div>
);