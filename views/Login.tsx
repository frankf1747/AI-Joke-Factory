import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useGame } from '../context';
import { Role } from '../types';

export type LoginTab = 'student' | 'instructor';

/** Two first names become one account name: trimmed, lowercased, sorted, joined with "_".
 *  Join is idempotent, so the same two names (in either order) rejoin the same account. */
export const normalizeTeamName = (a: string, b: string) =>
  [a, b]
    .map(n => n.trim().toLowerCase())
    .filter(Boolean)
    .sort((x, y) => x.localeCompare(y))
    .join('_');

export const WRONG_PASSWORD_TEXT = "That password didn't work. Check it and try again.";

const LOGO = 'https://www.anderson.ucla.edu/themes/custom/ucla_anderson/logo.svg';

const LABEL = 'block text-[13px] font-semibold text-[color:var(--ink-2)] mb-1.5';
const PAIR_LABEL = 'block text-[12.5px] font-medium text-[color:var(--ink-3)] mb-1.5';

const SegButton: React.FC<{ pressed: boolean; onClick: () => void; children: React.ReactNode }> = ({ pressed, onClick, children }) => (
  <button
    type="button"
    aria-pressed={pressed}
    onClick={onClick}
    className="flex-1 rounded-[7px] px-3 py-[7px] text-sm font-medium transition-colors"
    style={pressed
      ? { background: 'var(--sheet)', color: 'var(--ink)', boxShadow: '0 1px 2px rgba(20,32,43,.08)' }
      : { background: 'none', color: 'var(--ink-3)' }}
  >
    {children}
  </button>
);

const StudentForm: React.FC = () => {
  const { login } = useGame();
  const [member1, setMember1] = useState('');
  const [member2, setMember2] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = member1.trim() !== '' && member2.trim() !== '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const normalized = normalizeTeamName(member1, member2);
    if (!normalized) return;
    setBusy(true);
    try {
      // Students join as UNASSIGNED pairs; the instructor seats them.
      await login(normalized, Role.UNASSIGNED);
    } finally {
      // On success the router has already swapped this screen out; this only matters after a failure.
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <span className={LABEL}>You and your partner</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3.5">
        <div>
          <label htmlFor="jf-member-1" className={PAIR_LABEL}>Your first name</label>
          <input
            id="jf-member-1" type="text" required className="jf-input" placeholder="Joe" autoComplete="given-name"
            value={member1} onChange={e => setMember1(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="jf-member-2" className={PAIR_LABEL}>Partner&apos;s first name</label>
          <input
            id="jf-member-2" type="text" required className="jf-input" placeholder="John" autoComplete="off"
            value={member2} onChange={e => setMember2(e.target.value)}
          />
        </div>
      </div>
      <p className="mb-5 text-[13px] leading-normal text-[color:var(--ink-3)]">
        You two share one seat, as either the Joke Maker or Marketing. <b className="font-semibold text-[color:var(--ink-2)]">Lost connection?</b> Sign in again with the same two names.
      </p>
      <button type="submit" className="jf-btn-primary" disabled={!ready || busy}>
        Join the class <ArrowRight size={16} aria-hidden="true" />
      </button>
    </form>
  );
};

const InstructorForm: React.FC = () => {
  const { instructorLogin } = useGame();
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [wrongPassword, setWrongPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setWrongPassword(false);
    setBusy(true);
    try {
      const result = await instructorLogin(displayName, password);
      if (result === 'wrong-password') setWrongPassword(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="mb-3.5">
        <label htmlFor="jf-instructor-name" className={LABEL}>Your name</label>
        <input
          id="jf-instructor-name" type="text" required className="jf-input" autoComplete="name"
          value={displayName} onChange={e => setDisplayName(e.target.value)}
        />
      </div>
      <div className="mb-3.5">
        <label htmlFor="jf-instructor-password" className={LABEL}>Admin password</label>
        <div className="relative">
          <input
            id="jf-instructor-password" type={showPassword ? 'text' : 'password'} required
            className="jf-input" style={{ paddingRight: 64 }} autoComplete="current-password"
            value={password}
            onChange={e => {
              setPassword(e.target.value);
              setWrongPassword(false);
            }}
          />
          <button
            type="button"
            aria-pressed={showPassword}
            onClick={() => setShowPassword(s => !s)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-2 py-1.5 text-[12.5px] font-medium text-[color:var(--navy)]"
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <button type="submit" className="jf-btn-primary mt-2" disabled={busy}>Sign in</button>
      {wrongPassword && (
        <p role="alert" className="mt-3 text-[13px] text-[color:var(--warn)]">{WRONG_PASSWORD_TEXT}</p>
      )}
    </form>
  );
};

/** The sign-in screen: a student pair joins with two first names; the instructor signs in with the admin password. */
const Login: React.FC<{ initialTab?: LoginTab }> = ({ initialTab = 'student' }) => {
  const [tab, setTab] = useState<LoginTab>(initialTab);

  return (
    <div className="min-h-screen grid place-items-center px-4 pt-10 pb-[72px]" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <div className="w-full max-w-[440px]">
        <div className="text-center mb-[22px]">
          <img src={LOGO} alt="UCLA Anderson School of Management" className="block h-[38px] w-auto mx-auto mb-[22px]" />
          <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">The Joke Factory</h1>
          <p className="mt-1 text-sm text-[color:var(--ink-3)]">An operations management simulation</p>
        </div>

        <div className="rounded-[12px] border px-6 pt-[22px] pb-6" style={{ background: 'var(--sheet)', borderColor: 'var(--rule)' }}>
          <div role="group" aria-label="Who is signing in" className="flex gap-0.5 p-[3px] rounded-[9px] mb-[22px]" style={{ background: 'var(--paper)' }}>
            <SegButton pressed={tab === 'student'} onClick={() => setTab('student')}>Student pair</SegButton>
            <SegButton pressed={tab === 'instructor'} onClick={() => setTab('instructor')}>Instructor</SegButton>
          </div>
          {tab === 'student' ? <StudentForm /> : <InstructorForm />}
        </div>
      </div>
    </div>
  );
};

export default Login;
