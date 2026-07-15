/* DevRoleSwitcher — floating dev-only panel that lets you jump between role views
   with one click. Only renders when VITE_USE_MOCK_API=true. Mutates the mock DB +
   localStorage session keys, then reloads. */
import React, { useState } from 'react';
import { useGame } from '../context';
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

const LS_DB = 'joke_factory_mock_db_v1';
const LS_USER_ID = 'joke_factory_user_id';
const LS_DISPLAY_NAME = 'joke_factory_display_name';
const LS_ROLE = 'joke_factory_role';
const LS_ROUND_ID = 'joke_factory_round_id';

interface RoleOption {
  label: string;
  apiRole: 'JM' | 'QC' | 'CUSTOMER' | 'INSTRUCTOR';
  uiRole: 'JOKE_MAKER' | 'QUALITY_CONTROL' | 'CUSTOMER' | 'INSTRUCTOR';
  team: number | null;
  tint: string;
}

const ROLES: RoleOption[] = [
  { label: 'Joke Maker', apiRole: 'JM',         uiRole: 'JOKE_MAKER',      team: 1,    tint: 'bg-blue-600 hover:bg-blue-500' },
  { label: 'Marketing', apiRole: 'QC',         uiRole: 'QUALITY_CONTROL', team: 1,    tint: 'bg-violet-600 hover:bg-violet-500' },
  { label: 'Customer',  apiRole: 'CUSTOMER',   uiRole: 'CUSTOMER',        team: null, tint: 'bg-emerald-600 hover:bg-emerald-500' },
  { label: 'Instructor',apiRole: 'INSTRUCTOR', uiRole: 'INSTRUCTOR',      team: null, tint: 'bg-amber-600 hover:bg-amber-500' },
];

const nowIso = () => new Date().toISOString();

function seedDb(): any {
  const teams = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `Team ${i + 1}` }));
  // Two raw batches already waiting in Marketing's queue on Team 1, so switching
  // to Marketing immediately has something to split. JM can add more.
  const rawBatches: Record<string, any> = {
    '5001': {
      batch_id: 5001, round_id: 1, team_id: 1, status: 'SUBMITTED',
      submitted_at: nowIso(),
      raw_text:
        '1) I told my boss I needed a raise; he said be a self-starter, so I started napping.\n' +
        '2) My therapist said embrace your mistakes, so I hugged my pivot table.\n' +
        '3) Why did the MBA bring a ladder to class? To reach the higher-level frameworks.\n' +
        '4) Our standup is five people agreeing it could have been an email.\n' +
        '5) I asked AI for a joke; it returned a 40-slide deck and a follow-up meeting.',
      jokes: [], avg_score: null, passes_count: null,
    },
    '5002': {
      batch_id: 5002, round_id: 1, team_id: 1, status: 'SUBMITTED',
      submitted_at: nowIso(),
      raw_text:
        '1) I scheduled a meeting to discuss having fewer meetings. Attendance was full.\n' +
        '2) Coffee is renewable: I renew my entire personality every cup.\n' +
        '3) My deadlines are houseplants — alive purely through panic.\n' +
        '4) A bear walks into a brokerage; the portfolio was already grizzly.\n' +
        '5) We moved everything to the cloud; now rain feels like a backup.',
      jokes: [], avg_score: null, passes_count: null,
    },
  };
  return {
    seq: { user_id: 1100, batch_id: 5002, purchase_id: 9000 },
    active_round_id: 1,
    round: {
      id: 1, round_number: 1, status: 'ACTIVE',
      batch_size: 5, customer_budget: 10,
      started_at: nowIso(), ended_at: null, is_popped_active: false,
    },
    teams, participants: {}, assignments: {}, batches: rawBatches, purchases: {}, purchaseIndex: {},
  };
}

function loadOrSeedDb(): any {
  const raw = localStorage.getItem(LS_DB);
  if (raw) {
    try { return JSON.parse(raw); } catch { /* fall through */ }
  }
  const db = seedDb();
  localStorage.setItem(LS_DB, JSON.stringify(db));
  return db;
}

function ensureDevUser(db: any): number {
  const existing = Number(localStorage.getItem(LS_USER_ID) || 0);
  if (existing && db.participants[String(existing)]) return existing;
  const userId = ++db.seq.user_id;
  db.participants[String(userId)] = {
    user_id: userId,
    display_name: 'DevTester',
    status: 'ASSIGNED',
    joined_at: nowIso(),
    assigned_at: nowIso(),
  };
  localStorage.setItem(LS_USER_ID, String(userId));
  localStorage.setItem(LS_DISPLAY_NAME, 'DevTester');
  return userId;
}

function switchRole(opt: RoleOption) {
  const db = loadOrSeedDb();
  const userId = ensureDevUser(db);
  db.assignments[String(userId)] = { role: opt.apiRole, team_id: opt.team };
  // Keep the round ACTIVE so screens behave normally.
  if (db.round.status !== 'ACTIVE') {
    db.round.status = 'ACTIVE';
    db.round.started_at = nowIso();
    db.round.ended_at = null;
  }
  localStorage.setItem(LS_DB, JSON.stringify(db));
  localStorage.setItem(LS_ROLE, opt.uiRole);
  localStorage.setItem(LS_ROUND_ID, '1');
  // Force a clean reload so the GameRouter re-reads role assignment from /session/me.
  location.reload();
}

function resetSession() {
  if (!confirm('Reset all dev session state (mock DB + login)?')) return;
  localStorage.removeItem(LS_DB);
  localStorage.removeItem(LS_USER_ID);
  localStorage.removeItem(LS_DISPLAY_NAME);
  localStorage.removeItem(LS_ROLE);
  localStorage.removeItem(LS_ROUND_ID);
  location.reload();
}

const DevRoleSwitcher: React.FC = () => {
  // Only render in mock mode.
  const isMock = String((import.meta as any).env?.VITE_USE_MOCK_API ?? '').toLowerCase() === 'true';
  if (!isMock) return null;

  const { user } = useGame();
  const [collapsed, setCollapsed] = useState(false);

  const currentLabel = user
    ? user.role.replace('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    : 'no session';

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-50 bg-gray-900 text-amber-400 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1.5 rounded-full shadow-2xl border border-gray-700 hover:bg-gray-800"
        title="Show dev role switcher"
      >
        DEV
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-gray-900 text-white rounded-lg shadow-2xl border border-gray-700 px-3 py-2 flex items-center gap-2 text-xs">
      <span className="font-bold text-amber-400 tracking-wider">DEV</span>
      <span className="text-gray-400 mr-1">·</span>
      <span className="text-gray-300 mr-2 max-w-[120px] truncate" title={currentLabel}>
        {currentLabel}
      </span>
      <div className="flex items-center gap-1">
        {ROLES.map(r => (
          <button
            key={r.label}
            onClick={() => switchRole(r)}
            className={`px-2 py-1 rounded text-white font-semibold ${r.tint}`}
            title={`Switch to ${r.label}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <button
        onClick={resetSession}
        className="ml-1 px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white inline-flex items-center gap-1"
        title="Clear localStorage and start over"
      >
        <RefreshCw size={11} /> Reset
      </button>
      <button
        onClick={() => setCollapsed(true)}
        className="ml-1 text-gray-400 hover:text-white"
        title="Hide"
      >
        <ChevronDown size={14} />
      </button>
    </div>
  );
};

export default DevRoleSwitcher;
