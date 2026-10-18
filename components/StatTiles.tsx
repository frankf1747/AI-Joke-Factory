/* ============================ Stat tiles ============================
   Key tiles in a 2 x 2 grid (none when the Scoreboard carries the key numbers,
   then only the disclosure shows); everything else folds behind
   a "More numbers" button so a first-time student knows where to look. The
   open/closed choice is remembered per browser and role in localStorage.

   Imports nothing from the components barrel (it pulls in context, and context
   reaches back into components). The screens pass in ready-made tiles. */

import React, { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/** localStorage key for a role's folded-tiles choice. */
export const moreTilesKey = (role: string) => `jf_more_tiles_${role}`;

/** Remembered choice; any storage failure means "closed". */
export function readMoreOpen(storageKey: string): boolean {
  try {
    return localStorage.getItem(storageKey) === '1';
  } catch {
    return false;
  }
}

export function writeMoreOpen(storageKey: string, open: boolean): void {
  try {
    localStorage.setItem(storageKey, open ? '1' : '0');
  } catch {
    /* storage blocked: the choice just is not remembered */
  }
}

export const StatTiles: React.FC<{
  keyTiles: React.ReactNode[];
  moreTiles: React.ReactNode[];
  storageKey: string;
  /** Start open (tests); default is the remembered choice, else closed. */
  initialOpen?: boolean;
  /** Controlled (the guided tour's demo): open or closed whatever the student
      chose. The remembered choice is then neither read nor written. */
  open?: boolean;
  /** data-tour ids for the guided tour: the key-tile grid and the More numbers panel. */
  tourKey?: string;
  tourMore?: string;
}> = ({ keyTiles, moreTiles, storageKey, initialOpen, open: forcedOpen, tourKey, tourMore }) => {
  const [openState, setOpen] = useState(() => forcedOpen ?? initialOpen ?? readMoreOpen(storageKey));
  const open = forcedOpen ?? openState;
  const panelId = useId();
  const toggle = () => {
    if (forcedOpen !== undefined) return;
    const next = !open;
    setOpen(next);
    writeMoreOpen(storageKey, next);
  };
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <div>
      {keyTiles.length > 0 && <div data-tour={tourKey} className="grid grid-cols-2 gap-3">{keyTiles}</div>}
      {moreTiles.length > 0 && (
        <>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={panelId}
            className={`${keyTiles.length > 0 ? 'mt-2 ' : ''}w-full flex items-center justify-center gap-1 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-800 rounded-md hover:bg-gray-100`}
          >
            {open ? 'Fewer numbers' : 'More numbers'}
            <Chevron size={14} aria-hidden="true" />
          </button>
          <div id={panelId} data-tour={tourMore} className="grid grid-cols-2 gap-3 mt-2" hidden={!open}>
            {open && moreTiles}
          </div>
        </>
      )}
    </div>
  );
};
