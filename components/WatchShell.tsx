// components/WatchShell.tsx
/* WatchShell — frames a watch tab: who you are watching, and why the bot did
   what it did.

   The screen underneath is the real Joke Maker or Marketing view, but it can
   only show server state — a batch arriving, cards splitting, a publish landing.
   A bot's CHOICES (why it kept two jokes and dropped three) are not server state
   until publish, so the engine narrates them on a BroadcastChannel and this
   strip shows the entries for the watched bot. */
import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../context';
import { getWatchIdentity } from '../services/watchMode';
import { PERSONAS } from '../services/bots/personas';
import { BOT_CHANNEL, type BotMeta, type ChannelMessage, type ReasoningEntry } from '../services/bots/protocol';

const MAX_ENTRIES = 200;

function seatLabel(meta: BotMeta | null, role: unknown): string | null {
  if (meta) return meta.seat === 'A' ? 'Joke Maker' : 'Marketing';
  if (role === 'JOKE_MAKER') return 'Joke Maker';
  if (role === 'QUALITY_CONTROL') return 'Marketing';
  return null;
}

// A stale worker build may send a persona id this bundle does not know.
function personaLabel(meta: BotMeta): string {
  const known = PERSONAS as unknown as Record<string, { label: string } | undefined>;
  return known[meta.persona]?.label ?? meta.persona;
}

export const WatchShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useGame();
  const watching = getWatchIdentity();
  const botUserId = watching?.userId ?? null;
  const [entries, setEntries] = useState<ReasoningEntry[]>([]);
  const [meta, setMeta] = useState<BotMeta | null>(null);

  // Once this tab has shown the bot, losing the user means the bot is gone:
  // /session/me 404s after Remove bots or a class reset, and context logs out.
  // Say so, instead of dropping to a login screen whose join would be refused.
  const hadUser = useRef(false);
  const [botLeft, setBotLeft] = useState(false);
  useEffect(() => {
    if (user) hadUser.current = true;
    else if (hadUser.current) setBotLeft(true);
  }, [user]);

  useEffect(() => {
    if (botUserId == null || typeof BroadcastChannel === 'undefined') return undefined;
    const channel = new BroadcastChannel(BOT_CHANNEL);
    channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      const m = event.data;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'history' && m.botUserId === botUserId) {
        setEntries(m.entries.slice(-MAX_ENTRIES));
        setMeta(m.meta);
      } else if (m.type === 'log' && m.entry.botUserId === botUserId) {
        setEntries(prev => [...prev, m.entry].slice(-MAX_ENTRIES));
      }
    };
    const ask: ChannelMessage = { type: 'history-request', botUserId };
    channel.postMessage(ask);
    return () => channel.close();
  }, [botUserId]);

  if (!watching) return <>{children}</>;
  const seat = seatLabel(meta, user?.role);

  return (
    <div className="min-h-screen">
      <div role="status" data-testid="watch-banner" className="sticky top-0 z-50 flex h-9 items-center bg-gray-900 px-4 text-sm text-white">
        <span>
          👁 WATCHING <strong>{watching.displayName}</strong>
          {seat ? ` · ${seat}` : ''}
          {user?.team_id != null ? ` · Team ${user.team_id}` : ''}
          {meta ? ` · ${personaLabel(meta)}` : ''}
          {' · read-only'}
        </span>
      </div>
      <div className="lg:pr-80">
        {botLeft ? (
          <div role="alert" data-testid="watch-bot-left" className="mx-auto mt-16 max-w-md rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700 shadow-sm">
            <h1 className="mb-2 text-lg font-semibold text-gray-900">{watching.displayName} has left the game</h1>
            <p>The bot was removed, or the class was reset. Close this tab.</p>
          </div>
        ) : children}
      </div>
      <aside
        aria-label="Bot reasoning"
        className="border-t border-gray-200 bg-white p-4 text-xs lg:fixed lg:bottom-0 lg:right-0 lg:top-9 lg:w-80 lg:overflow-y-auto lg:border-l lg:border-t-0"
      >
        <h2 className="mb-2 font-semibold uppercase tracking-wide text-gray-500">Bot&apos;s reasoning (newest first)</h2>
        {entries.length === 0 ? (
          <p className="italic text-gray-400">
            Nothing yet. Entries appear as the bot acts, while the instructor tab with the Bot Panel stays open.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {[...entries].reverse().map((e, i) => (
              <li key={`${e.at}-${e.botUserId}-${entries.length - 1 - i}`} data-testid="reasoning-entry">
                <time className="mr-2 tabular-nums text-gray-400">{new Date(e.at).toLocaleTimeString()}</time>
                {e.text}
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
};
