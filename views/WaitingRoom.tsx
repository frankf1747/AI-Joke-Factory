import React from 'react';
import { Check, LogOut } from 'lucide-react';
import { useGame } from '../context';
import { Role } from '../types';
import { pairNames } from '../services/format';
import { headerRound, type HeaderRound } from '../services/headerRound';
import { isWatchMode } from '../services/watchMode';

const LOGO = 'https://www.anderson.ucla.edu/themes/custom/ucla_anderson/logo.svg';

/* Before a round starts the lamp waits in gold, as the room does; running and over match RoleLayout's andon. */
const ANDON: Record<HeaderRound['state'], { word: string; text: string; lamp: string }> = {
  'not-started': { word: 'Not started', text: 'var(--waiting)', lamp: 'var(--waiting-dot)' },
  running: { word: 'Running', text: 'var(--selling)', lamp: 'var(--selling)' },
  over: { word: 'Round over', text: 'var(--navy)', lamp: 'var(--navy)' },
};

type SeatRole = 'joke-maker' | 'marketing';
const SEAT_NAME: Record<SeatRole, string> = { 'joke-maker': 'Joke Maker', marketing: 'Marketing' };

/** The role a pair already holds while its team is still being set, if any. */
function seatRole(role: Role | undefined): SeatRole | null {
  if (role === Role.JOKE_MAKER) return 'joke-maker';
  if (role === Role.QUALITY_CONTROL) return 'marketing';
  return null;
}

const ROLES: { key: SeatRole; summary: string; steps: string[] }[] = [
  {
    key: 'joke-maker',
    summary: 'Writes jokes with any AI tool and sends them to Marketing in batches.',
    steps: ['Paste a batch of jokes', 'Send it to Marketing', 'Watch how each joke sells'],
  },
  {
    key: 'marketing',
    summary: 'Splits each batch into jokes, picks the ones to sell, and tells the Joke Maker what customers want.',
    steps: ['Split the batch', 'Choose what to sell, with a title', 'Release it to market'],
  },
];

const SHEET: React.CSSProperties = { background: 'var(--sheet)', borderColor: 'var(--rule)' };

const Header: React.FC<{ names: string }> = ({ names }) => {
  const { config, roundStatuses, roundTimes, logout } = useGame();
  // The andon shows state and round only, so the clock's "now" never matters here.
  const h = headerRound({ selectedRound: config.round === 2 ? 2 : 1, statuses: roundStatuses, times: roundTimes, now: 0 });
  const andon = ANDON[h.state];

  return (
    <header className="border-b" style={SHEET}>
      <div className="max-w-[1240px] mx-auto px-4 sm:px-7 h-16 flex items-center justify-between gap-3 sm:gap-6">
        <div className="flex flex-col leading-tight min-w-0 flex-1">
          <span className="truncate whitespace-nowrap text-[17px] font-semibold tracking-[-0.015em] text-[color:var(--ink)]">The Joke Factory</span>
          <span className="truncate text-[12.5px] text-[color:var(--ink-3)]">Waiting room</span>
        </div>
        <div className="flex shrink-0 items-center gap-2.5 sm:gap-3 whitespace-nowrap" aria-label="Round status" data-header-state={h.state}>
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ background: andon.lamp, boxShadow: `0 0 0 3px color-mix(in srgb, ${andon.lamp} 22%, transparent)` }}
          />
          <span className="text-[13px] font-semibold" style={{ color: andon.text }}>{andon.word}</span>
          <span className="text-[13px] text-[color:var(--ink-3)]">Round {h.round}</span>
        </div>
        <div className="flex items-center justify-end gap-[18px] sm:flex-1 min-w-0">
          <img src={LOGO} alt="UCLA Anderson" className="hidden sm:block h-[30px] w-auto" />
          <span className="hidden sm:block whitespace-nowrap truncate text-[13.5px] text-[color:var(--ink-2)] pl-[18px] border-l" style={{ borderColor: 'var(--rule)' }}>
            {names}
          </span>
          {/* A watch tab has no session of its own to end. */}
          {!isWatchMode() && (
            <button
              type="button"
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
              className="grid h-[34px] w-[34px] place-items-center rounded-lg text-[color:var(--ink-3)] hover:bg-[color:var(--paper)] hover:text-[color:var(--ink)]"
            >
              <LogOut size={17} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div aria-hidden="true" className="h-[3px]" style={{ background: andon.lamp }} />
    </header>
  );
};

/** Where a signed-in pair waits until the instructor gives it a team and a role. */
const WaitingRoom: React.FC = () => {
  const { user } = useGame();
  const names = pairNames(user?.display_name ?? '');
  const seated = seatRole(user?.role);
  const seatName = seated ? SEAT_NAME[seated] : null;

  const lede = seated
    ? `You're ${seated === 'joke-maker' ? 'the Joke Maker' : 'Marketing'}. Your instructor is finishing the teams; your screen switches on its own.`
    : 'Your instructor is seating everyone. Your screen switches on its own once you have a team.';

  return (
    <div className="min-h-screen" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <Header names={names} />

      <main className="max-w-[760px] mx-auto px-4 pt-9 pb-16 sm:px-6 sm:pt-14 sm:pb-20">
        <h1 className="m-0 text-[25px] sm:text-[30px] font-semibold tracking-[-0.02em]">You&apos;re in, {names}.</h1>
        <p className="mt-2 text-base text-[color:var(--ink-2)] max-w-[56ch]">{lede}</p>

        <ol aria-label="What happens next" className="mt-8 list-none rounded-[12px] border px-[22px] py-5" style={SHEET}>
          <Step mark={<span className="grid h-[22px] w-[22px] place-items-center rounded-full text-white" style={{ background: 'var(--selling)' }}><Check size={13} strokeWidth={2.5} /></span>}
            title="Joined the class" sub={`Signed in as ${names}.`} />
          <Step
            first={false}
            mark={
              <span className="grid h-[22px] w-[22px] place-items-center rounded-full" style={{ background: 'var(--waiting-bg)', boxShadow: 'inset 0 0 0 1.5px var(--waiting-dot)' }}>
                <span className="jf-wait-pulse h-2 w-2 rounded-full" style={{ background: 'var(--waiting-dot)' }} />
              </span>
            }
            title={seatName ? `Seated as ${seatName}` : 'Seated on a team'}
            sub={seatName ? 'Waiting for your team to be set.' : 'Your instructor gives each pair a team and a role.'}
            when="Waiting"
            current
          />
          <Step
            first={false}
            mark={<span className="grid h-[22px] w-[22px] place-items-center rounded-full font-mono text-xs font-semibold text-[color:var(--ink-4)]" style={{ boxShadow: 'inset 0 0 0 1.5px var(--rule-2)' }}>3</span>}
            title="Round 1 starts"
            sub="A 1-minute tour shows you your screen first."
            next
          />
        </ol>
        <p className="mt-3.5 mx-0.5 text-[13.5px] text-[color:var(--ink-3)]">Keep this tab open. You don&apos;t need to refresh.</p>

        <p className="mt-11 mb-3 text-[13px] font-semibold text-[color:var(--ink-3)]">While you wait: the two roles</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {ROLES.map(r => {
            const yours = seated === r.key;
            return (
              <div
                key={r.key}
                data-role-card={r.key}
                data-yours={yours ? 'true' : undefined}
                className="rounded-[12px] border px-5 py-[18px]"
                style={yours ? { ...SHEET, borderColor: 'var(--navy)', boxShadow: 'inset 0 0 0 1px var(--navy)' } : SHEET}
              >
                {yours && (
                  <span className="float-right rounded-full px-2 py-0.5 text-xs font-semibold text-[color:var(--navy)]" style={{ background: 'var(--navy-tint)' }}>
                    Your role
                  </span>
                )}
                <h3 className="m-0 mb-1.5 text-base font-semibold">{SEAT_NAME[r.key]}</h3>
                <p className="m-0 text-sm text-[color:var(--ink-2)]">{r.summary}</p>
                <ol className="mt-3 pl-[18px] list-decimal text-[13.5px] text-[color:var(--ink-3)]">
                  {r.steps.map(s => <li key={s} className="my-0.5">{s}</li>)}
                </ol>
              </div>
            );
          })}
        </div>
        <div className="mt-3.5 grid grid-cols-[auto_1fr] items-baseline gap-3.5 rounded-[12px] border px-5 py-4" style={SHEET}>
          <b className="text-[13px] font-semibold text-[color:var(--ink-3)]">The goal</b>
          <p className="m-0 text-sm text-[color:var(--ink-2)]">
            Earn the most profit as a team. AI customers buy the jokes that fit their hidden taste, and every joke you release or discard has a cost.
          </p>
        </div>
      </main>
    </div>
  );
};

const Step: React.FC<{
  mark: React.ReactNode;
  title: string;
  sub: string;
  when?: string;
  first?: boolean;
  current?: boolean;
  next?: boolean;
}> = ({ mark, title, sub, when, first = true, current, next }) => (
  <li
    aria-current={current ? 'step' : undefined}
    className={`grid grid-cols-[28px_1fr_auto] items-start gap-3.5 py-3 ${first ? '' : 'border-t'}`}
    style={first ? undefined : { borderColor: 'var(--rule)' }}
  >
    <span aria-hidden="true" className="mt-px">{mark}</span>
    <div>
      <b className={`block text-[15px] ${next ? 'font-medium text-[color:var(--ink-3)]' : 'font-semibold text-[color:var(--ink)]'}`}>{title}</b>
      <span className="block text-[13.5px] text-[color:var(--ink-3)]">{sub}</span>
    </div>
    <span className="whitespace-nowrap pt-0.5 text-[12.5px] text-[color:var(--ink-4)]">{when ?? ''}</span>
  </li>
);

export default WaitingRoom;
