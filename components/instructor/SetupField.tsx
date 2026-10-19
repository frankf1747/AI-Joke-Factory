/* The Setup tab's field pieces (spec 6b): a labelled field with an optional hint,
   and a number input with a "$" in front or a unit after it. A changed input is
   outlined in amber (--waiting) until Apply saves it. */
import React from 'react';

export const SetupField: React.FC<{
  label: string;
  /** The input's id, when the field holds one input. */
  htmlFor?: string;
  hint?: React.ReactNode;
  /** Spans both columns of the group. */
  wide?: boolean;
  children: React.ReactNode;
}> = ({ label, htmlFor, hint, wide, children }) => (
  <div className={wide ? 'sm:col-span-2' : undefined}>
    {htmlFor
      ? <label htmlFor={htmlFor} className="mb-1 block text-[13px]" style={{ color: 'var(--ink-2)' }}>{label}</label>
      : <span className="mb-1 block text-[13px]" style={{ color: 'var(--ink-2)' }}>{label}</span>}
    {children}
    {hint != null && <small className="mt-[3px] block text-[12px]" style={{ color: 'var(--ink-3)' }}>{hint}</small>}
  </div>
);

export const SetupInput: React.FC<{
  id: string;
  /** The accessible name (the visible label may cover several inputs). */
  label: string;
  /** A number, or the raw text a box keeps while it is being typed in. */
  value: number | string;
  /** The typed number, and the raw text for a box that keeps it. */
  onChange: (v: number, raw: string) => void;
  onBlur?: () => void;
  disabled: boolean;
  step: string;
  min: string;
  /** Shown in front of the number, e.g. "$". */
  prefix?: string;
  /** Shown after the number, e.g. "min" or "per joke-minute". */
  suffix?: string;
  changed?: boolean;
  /** Tooltip, e.g. why the input is locked. */
  title?: string;
}> = ({ id, label, value, onChange, onBlur, disabled, step, min, prefix, suffix, changed = false, title }) => (
  <div
    data-changed={changed ? 'true' : undefined}
    style={{
      borderColor: changed ? 'var(--waiting)' : 'var(--rule)',
      opacity: disabled ? 0.6 : undefined,
    }}
    title={title}
    className="flex items-center rounded-[4px] border bg-[color:var(--paper)] focus-within:!border-[color:var(--navy)] focus-within:bg-[color:var(--sheet)]"
  >
    {prefix && <em className="pl-2.5 text-[12.5px] not-italic" style={{ color: 'var(--ink-3)' }}>{prefix}</em>}
    <input
      id={id}
      aria-label={label}
      type="number"
      step={step}
      min={min}
      value={value}
      onChange={e => onChange(Number(e.target.value), e.target.value)}
      onBlur={onBlur}
      disabled={disabled}
      className="min-w-0 flex-1 appearance-none border-0 bg-transparent px-2.5 py-[7px] font-mono text-[14.5px] font-medium tabular-nums outline-none [-moz-appearance:textfield] disabled:cursor-not-allowed [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      style={{ color: 'var(--ink)' }}
    />
    {suffix && <em className="whitespace-nowrap px-2.5 text-[12.5px] not-italic" style={{ color: 'var(--ink-3)' }}>{suffix}</em>}
  </div>
);
