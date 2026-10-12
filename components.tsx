import React from 'react';
import { LogOut, User as UserIcon, X, Trophy, TrendingUp, Tag, Info, HelpCircle } from 'lucide-react';
import { useDemoMode, useGame } from './context';
import { Role } from './types';
import { isWatchMode } from './services/watchMode';
import Tutorial from './components/Tutorial';
import { GuidedTour, TourErrorBoundary } from './components/tour/GuidedTour';
import { isTourRole, launchMode, markTourSeen, readTourSeen, recordTourEnd } from './services/tour/seen';
// Presentational primitives live in components/ui.tsx so leaf modules can import
// them without cycling back through this barrel. Re-exported for existing callers.
export { Button, Card, StatBox, SectionLabel } from './components/ui';
export type { StatBoxTone } from './components/ui';


// BRAND and fmt$ live in config/brand.ts so leaf components can import them
// without pulling in this barrel (which would create a cycle). Re-exported here
// so the many existing `from '../components'` imports keep working.
export { BRAND, fmt$ } from './config/brand';

export const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; maxWidth?: string; showCloseButton?: boolean }> = ({ isOpen, onClose, title, children, maxWidth = 'max-w-lg', showCloseButton = true }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className={`bg-white rounded-xl shadow-2xl w-full ${maxWidth} overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]`}>
        <div className="flex justify-between items-center p-4 border-b border-gray-100 shrink-0">
          <h3 className="text-xl font-bold text-gray-800">{title}</h3>
          {showCloseButton && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-full transition-colors">
              <X size={24} />
            </button>
          )}
        </div>
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

/** localStorage key for "the instructor has already seen How this works". Versioned
 *  so a future copy revision can force it to show again. The students' guided
 *  tour has its own key: services/tour/seen.ts TOUR_SEEN_PREFIX. */
export const TUTORIAL_SEEN_PREFIX = 'jf_tutorial_seen_v1:';

/** The mid-round prompt (spec §3.3). */
export const TOUR_PROMPT_TEXT = 'New here? Watch the 1-minute tour';
/** The students' "?" button. */
export const TOUR_REPLAY_LABEL = 'Replay the 1-minute tour';

type TourPhase = 'pending' | 'idle' | 'tour' | 'prompt';

/**
 * The header's "?" button and what opens on its own. Kept as its own component
 * because RoleLayout early-returns before its JSX — hooks there would be
 * conditional.
 *
 * Instructor: the "How this works" modal, opened once on its own.
 * Joke Maker and Marketing: the guided tour of their own screen
 * (components/tour/GuidedTour.tsx). It plays on its own the first time, when
 * the round is not ACTIVE; a student arriving mid-round gets a dismissible
 * prompt instead, and "?" replays it (services/tour/seen.ts launchMode).
 * A watch tab gets none of this: it shows someone else's seat, and a seen-flag
 * written there would land in the shared localStorage of whoever else uses the
 * browser.
 *
 * Seen-flags are written when the modal or tour is dismissed, never on mount:
 * StrictMode mounts twice in dev, and a flag written on mount #1 would
 * suppress the auto-open on mount #2.
 */
const TutorialLauncher: React.FC<{ role: Role; tourView?: React.ComponentType }> = ({ role, tourView }) => {
  const { config, roundId } = useGame();
  const watch = isWatchMode();
  const tourRole = isTourRole(role) && tourView ? role : null;

  // ---- Instructor: the modal, auto-opened once.
  const [modalOpen, setModalOpen] = React.useState(() => {
    if (role !== Role.INSTRUCTOR || watch) return false;
    try {
      return !localStorage.getItem(`${TUTORIAL_SEEN_PREFIX}${role}`);
    } catch {
      return false; // private mode / storage disabled — don't auto-open
    }
  });
  const dismissModal = () => {
    setModalOpen(false);
    try {
      localStorage.setItem(`${TUTORIAL_SEEN_PREFIX}${role}`, '1');
    } catch {
      // ignore — worst case it opens again next time
    }
  };

  // ---- Students: the tour, decided once the round's state is known. roundId
  // arrives in the same poll update as config.isActive; before it, config
  // still holds its defaults (not ACTIVE), so deciding earlier would auto-play
  // the tour over a student who joined mid-round.
  const [phase, setPhase] = React.useState<TourPhase>('pending');
  if (phase === 'pending' && tourRole && roundId != null) {
    const mode = launchMode({ role: tourRole, watch, seen: readTourSeen(tourRole), roundActive: config.isActive });
    setPhase(mode === 'none' ? 'idle' : mode);
  }

  if (watch) return null;

  if (role === Role.INSTRUCTOR) {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          className="text-gray-400 hover:text-blue-600 transition-colors"
          title="How this works"
          aria-label="Open the tutorial"
        >
          <HelpCircle size={18} />
        </button>
        <Modal isOpen={modalOpen} onClose={dismissModal} title="How this works" maxWidth="max-w-5xl">
          <Tutorial onClose={dismissModal} />
        </Modal>
      </>
    );
  }

  if (!tourRole || !tourView) return null;

  return (
    <>
      <button
        onClick={() => setPhase('tour')}
        className="text-gray-400 hover:text-blue-600 transition-colors"
        title={TOUR_REPLAY_LABEL}
        aria-label={TOUR_REPLAY_LABEL}
      >
        <HelpCircle size={18} />
      </button>
      {phase === 'prompt' && (
        <div
          role="status"
          className="fixed top-[4.5rem] left-4 right-4 sm:left-auto z-20 flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 py-1 pl-3 pr-1 text-sm text-amber-900 shadow-md"
          style={{ marginLeft: 0 }}
        >
          <button onClick={() => setPhase('tour')} className="flex-1 text-left font-semibold underline-offset-2 hover:underline">
            {TOUR_PROMPT_TEXT}
          </button>
          <button
            onClick={() => {
              markTourSeen(tourRole);
              setPhase('idle');
            }}
            className="rounded-full p-1 text-amber-700 hover:bg-amber-100"
            aria-label="Dismiss the tour prompt"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {phase === 'tour' && (
        /* GuidedTour's own render (plan, demo frame, controls) can throw too; with
           no other boundary in the app that would blank everything. Any error ends
           the tour on the live screen, with no seen flag; unmounting restores
           #root and scrolling. */
        <TourErrorBoundary
          onError={error => {
            console.error('Guided tour stopped:', error);
            setPhase('idle');
          }}
        >
          <GuidedTour
            role={tourRole}
            view={tourView}
            config={config}
            roundActive={config.isActive}
            onEnd={outcome => {
              recordTourEnd(tourRole, outcome);
              setPhase('idle');
            }}
          />
        </TourErrorBoundary>
      )}
    </>
  );
};

export const RoleLayout: React.FC<{
  children: React.ReactNode;
  /** The screen this layout wraps. The students' guided tour replays it with sample data. */
  tourView?: React.ComponentType;
}> = ({ children, tourView }) => {
  const { user, logout, config, teamNames } = useGame();
  /* Inside the guided tour's demo stage the header has no tutorial launcher: it
     would start a tour inside the tour and write seen-flags to localStorage. */
  const demoMode = useDemoMode();

  if (!user) return null;

  const showTeamBadge = user.role !== Role.CUSTOMER && user.role !== Role.INSTRUCTOR;
  // Use the registry name if available, else fallback to "Team X"
  const displayTeamName = teamNames[user.team] || `Team ${user.team}`;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className={`bg-white border-b border-gray-200 sticky ${isWatchMode() ? 'top-9' : 'top-0'} z-10 shadow-sm`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
             <div className="flex flex-col">
               <span className="font-bold text-lg text-gray-800">The Joke Factory</span>
               <span className="text-xs text-gray-500">Round {config.round} • {config.isActive ? 'Active' : 'Paused'}</span>
             </div>
          </div>
          
          <div className="flex items-center space-x-6">
             {showTeamBadge && (
               <div className="flex items-baseline space-x-2 bg-gray-100 px-3 py-1 rounded-full">
                 <span className="text-xs font-bold text-gray-500 uppercase leading-none">Team</span>
                 <span className="font-semibold text-blue-600 leading-none">{displayTeamName}</span>
               </div>
             )}
             
             {/* UCLA Logo next to User Icon */}
             <img 
               src="https://www.anderson.ucla.edu/themes/custom/ucla_anderson/logo.svg" 
               alt="UCLA Anderson" 
               className="h-10 w-auto object-contain hidden sm:block"
             />

             <div className="flex items-center space-x-2">
                <UserIcon size={16} className="text-gray-400" />
                <span className="text-sm font-medium">{user.name} ({user.role.replace('_', ' ')})</span>
             </div>
             {!demoMode && <TutorialLauncher role={user.role} tourView={tourView} />}
             {/* A watch tab has no session of its own to end, and logging out would only strand it on a login screen. */}
             {!isWatchMode() && (
               <button onClick={logout} className="text-gray-400 hover:text-red-500 transition-colors" title="Logout">
                 <LogOut size={18} />
               </button>
             )}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center text-xs text-gray-500">
          © 2025 AI Joke Factory • Educational Use
        </div>
      </footer>
    </div>
  );
};

export const PerformanceToggle: React.FC<{ label?: string }> = ({ label }) => {
  const normalized = String(label ?? '').trim().toUpperCase().replace(/[\s_]+/g, '_');
  
  let activeIndex = -1;
  if (normalized === 'HIGH_PERFORMING' || normalized === 'HIGH') activeIndex = 0;
  else if (normalized === 'AVG' || normalized === 'AVERAGE' || normalized === 'AVG_PERFORMING' || normalized === 'AVERAGE_PERFORMING') activeIndex = 1;
  else if (normalized === 'LOW_PERFORMING' || normalized === 'LOW') activeIndex = 2;

  // New state to control the animation duration
  const [isAnimating, setIsAnimating] = React.useState(false);

  // Effect to trigger animation when activeIndex changes to 0 (Best Seller)
  React.useEffect(() => {
    if (activeIndex === 0) {
      setIsAnimating(true);
      // Removed the timeout here, relying on CSS animation iteration count for smooth stop
    } else {
      setIsAnimating(false);
    }
  }, [activeIndex]);

  return (
    <div className="mb-6">
      <div className="mb-3">
        <div className="flip-card flip-card-horizontal h-[28px]">
          <div className="flip-card-inner">
            <div className="flip-card-face flex items-center gap-3">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Market Position</h4>
              <div className="h-px bg-gray-100 flex-1"></div>
              <span className="text-gray-400">
                <Info size={14} />
              </span>
            </div>
            <div className="flip-card-face flip-card-back flex items-center text-[13px] font-semibold text-gray-600" style={{ transform: 'rotateX(180deg)' }}>
              <span>
                Market Position shown to customers:
                <br />
                Based on Sold/Accepted ratio and Profit.
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex gap-1.5 w-full relative isolate">
        {/* Best Seller (Flex Grow to take space) */}
        <div
          className={`
            flex-1 flex flex-row items-center justify-center gap-1.5 px-1 py-3 rounded-xl border-2 transition-all duration-300 ease-out whitespace-nowrap
            ${activeIndex === 0 
              ? 'border-emerald-700 bg-emerald-700 text-white shadow-lg shadow-emerald-200 scale-[1.03]' 
              : 'border-transparent bg-gray-50 text-gray-400'
            }
          `}
        >
          <Trophy 
            size={18} 
            className={`shrink-0 ${isAnimating ? 'animate-bounce' : ''}`} 
            style={isAnimating ? { animationIterationCount: 10 } : undefined}
            strokeWidth={2.5} 
          />
          <span className="font-bold text-sm sm:text-base tracking-tight leading-none">Best Seller</span>
        </div>

        {/* Trending (Flex Grow to take space) */}
        <div
          className={`
             flex-1 flex flex-row items-center justify-center gap-1.5 px-1 py-3 rounded-xl border-2 transition-all duration-300 ease-out whitespace-nowrap
            ${activeIndex === 1 
              ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-200 scale-[1.03]' 
              : 'border-transparent bg-gray-50 text-gray-400'
            }
          `}
        >
          <TrendingUp size={18} className="shrink-0" strokeWidth={2.5} />
          <span className="font-bold text-sm sm:text-base tracking-tight leading-none">Trending</span>
        </div>

        {/* Seller (Fixed width / Flex none, smaller) */}
        <div
          className={`
             flex-none w-24 flex flex-row items-center justify-center gap-1.5 px-1 py-3 rounded-xl border-2 transition-all duration-300 ease-out whitespace-nowrap
            ${activeIndex === 2 
              ? 'border-gray-200 bg-white text-gray-700 shadow-sm' 
              : 'border-transparent bg-gray-50 text-gray-400'
            }
          `}
        >
          <Tag size={18} className="shrink-0" strokeWidth={2.5} />
          <span className="font-bold text-xs sm:text-sm tracking-tight leading-none">Seller</span>
        </div>
      </div>
    </div>
  );
};