/* One joke on Marketing's choose stage, and the Topic and title fields every
   joke you sell needs. A selected card is a navy-tinted sheet with its fields;
   an unselected one is a dashed outline that will be discarded.

   The Topic is decorative: it is required here as a "think about it" gate but is
   never sent to the API (the scoring engine classifies topic from the joke text). */
import React from 'react';
import { Check, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { dimById } from '../../config/dimensions';

export const TOPIC_CATEGORIES = dimById('TOPIC')?.categories ?? [];
export const TITLE_MAX = 120;

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const FIELD_STYLE: React.CSSProperties = {
  border: '1px solid var(--rule-2)',
  borderRadius: 'var(--r-sm)',
  background: 'var(--sheet)',
  color: 'var(--ink)',
};

/** The status words of a card: what a selected joke still needs, or "Discard". */
export function pickStatus(selected: boolean, topic: string | undefined, title: string | undefined): string {
  if (!selected) return 'Discard';
  return topic && (title ?? '').trim() ? 'To market' : 'Needs a topic and a title';
}

/** Topic select and Market title input, side by side. Shared by the card and the decision dialog. */
export const PickFields: React.FC<{
  topic?: string;
  title?: string;
  onTopic: (topic: string) => void;
  onTitle: (title: string) => void;
}> = ({ topic, title = '', onTopic, onTitle }) => (
  <div className="grid gap-3 sm:grid-cols-[170px_1fr]">
    <label className="block">
      <span className="mb-1 block text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Topic</span>
      <select
        value={topic ?? ''}
        onChange={(e) => onTopic(e.target.value)}
        required
        aria-label="Topic"
        className="w-full px-2.5 py-1.5 text-sm font-medium outline-none focus:border-[color:var(--navy)]"
        style={{ ...FIELD_STYLE, color: topic ? 'var(--ink)' : 'var(--ink-3)' }}
      >
        <option value="" disabled>Topic</option>
        {TOPIC_CATEGORIES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </label>
    <label className="block">
      <span className="mb-1 flex justify-between text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
        <span>Market title</span>
        <span style={{ fontFamily: MONO }}>{`${title.length}/${TITLE_MAX}`}</span>
      </span>
      <input
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        maxLength={TITLE_MAX}
        aria-label="Market title"
        placeholder="A short market title for this joke"
        className="w-full px-2.5 py-1.5 text-sm font-medium outline-none focus:border-[color:var(--navy)]"
        style={FIELD_STYLE}
      />
    </label>
  </div>
);

const MoveButton: React.FC<{ dir: 'up' | 'down'; disabled: boolean; onClick: () => void }> = ({ dir, disabled, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={dir === 'up' ? 'Move up' : 'Move down'}
    className="text-[color:var(--ink-4)] hover:text-[color:var(--ink-2)] disabled:opacity-25 disabled:cursor-not-allowed"
  >
    {dir === 'up' ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
  </button>
);

export const JokePick: React.FC<{
  index: number;
  total: number;
  jokeId: number;
  text: string;
  selected: boolean;
  topic?: string;
  title?: string;
  dragging: boolean;
  readOnly: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDeselect: () => void;
  onTopic: (topic: string) => void;
  onTitle: (title: string) => void;
  onMove: (dir: -1 | 1) => void;
  /** Drag-to-reorder handlers for the whole card. */
  dragProps: React.HTMLAttributes<HTMLDivElement>;
}> = ({
  index, total, jokeId, text, selected, topic, title, dragging, readOnly,
  onSelect, onToggle, onDeselect, onTopic, onTitle, onMove, dragProps,
}) => {
  const complete = selected && !!topic && (title ?? '').trim().length > 0;
  return (
    <div
      data-pick={jokeId}
      {...dragProps}
      onClick={(e) => {
        if (readOnly) return;
        if ((e.target as HTMLElement).closest('button, input, textarea, select, label, [role="checkbox"]')) return;
        if (!selected) onSelect();
      }}
      className={`mt-2 transition-colors ${dragging ? 'opacity-40' : ''} ${readOnly || selected ? 'cursor-default' : 'cursor-pointer'}`}
      style={{
        borderRadius: 'var(--r-md)',
        padding: selected ? '9.5px 13.5px 11.5px' : '10px 14px 12px',
        border: selected ? '1.5px solid var(--navy)' : '1px dashed var(--rule-2)',
        background: selected ? 'var(--navy-tint)' : 'transparent',
      }}
    >
      <div className="grid grid-cols-[16px_18px_26px_1fr_auto_auto] items-baseline gap-2">
        <span className="self-center cursor-grab text-[color:var(--ink-4)]" title="Drag to reorder" aria-hidden="true">
          <GripVertical size={15} />
        </span>
        <span
          role="checkbox"
          aria-checked={selected}
          aria-label={`Sell joke #${index + 1}`}
          tabIndex={readOnly ? -1 : 0}
          onClick={() => { if (!readOnly) onToggle(); }}
          onKeyDown={(e) => {
            if (readOnly || (e.key !== ' ' && e.key !== 'Enter')) return;
            e.preventDefault();
            onToggle();
          }}
          className="grid h-[18px] w-[18px] cursor-pointer place-items-center self-center rounded-[5px] text-white"
          style={{
            border: `1.5px solid ${selected ? 'var(--navy)' : 'var(--rule-2)'}`,
            background: selected ? 'var(--navy)' : 'var(--sheet)',
          }}
        >
          {selected && <Check size={13} strokeWidth={3} />}
        </span>
        <span className="text-[12.5px]" style={{ fontFamily: MONO, color: 'var(--ink-3)' }}>{`#${index + 1}`}</span>
        <p
          className="joke-font m-0 text-[15.5px] leading-normal text-pretty"
          style={{ color: selected ? 'var(--ink)' : 'var(--ink-3)' }}
        >
          {text}
        </p>
        <span
          className="whitespace-nowrap text-[12.5px] font-medium"
          style={{ color: !selected ? 'var(--ink-3)' : complete ? 'var(--navy)' : 'var(--warn)' }}
        >
          {pickStatus(selected, topic, title)}
        </span>
        <span className="flex flex-col items-center self-center">
          <MoveButton dir="up" disabled={index === 0} onClick={() => onMove(-1)} />
          <MoveButton dir="down" disabled={index === total - 1} onClick={() => onMove(1)} />
        </span>
      </div>

      {selected && (
        <div data-tour="mk-topic-title" className="mt-2.5 grid gap-2.5 sm:ml-[76px]">
          <PickFields topic={topic} title={title} onTopic={onTopic} onTitle={onTitle} />
          <div>
            <button
              type="button"
              onClick={onDeselect}
              className="text-[13px] font-medium underline-offset-2 hover:underline"
              style={{ color: 'var(--navy)' }}
            >
              Deselect
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
