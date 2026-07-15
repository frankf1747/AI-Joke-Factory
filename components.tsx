import React from 'react';
import { LogOut, User as UserIcon, X, Trophy, TrendingUp, Tag, Info } from 'lucide-react';
import { useGame } from './context';
import { Role } from './types';

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

// Official UCLA palette (see UCLA Slack theme): Navy #003b5c, Bruin Blue #005587,
// Light Blue #8bb8e8, Gold #ffb81c, Bright Gold #ffd100.
export const BRAND = {
  navy: '#003b5c',        // deep navy — headers / dark accents
  bruinBlue: '#005587',   // UCLA Bruin blue — primary brand
  lightBlue: '#8bb8e8',   // light blue accent
  bruinGold: '#ffb81c',   // UCLA gold
  brightGold: '#ffd100',  // bright gold
  action: '#005587',      // primary action = Bruin blue
  production: '#005587',  // Joke Maker lane
  marketing: '#003b5c',   // Marketing lane — navy (distinct from production)
  market: '#ffb81c',      // on-market lane — gold
  sold: '#059669',        // sold / revenue — kept green for meaning
  waste: '#e11d48',       // wasted / loss — kept red for meaning
} as const;

export const fmt$ = (n: number): string =>
  n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;

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

export const RoleLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout, config, teamNames } = useGame();
  
  if (!user) return null;

  const showTeamBadge = user.role !== Role.CUSTOMER && user.role !== Role.INSTRUCTOR;
  // Use the registry name if available, else fallback to "Team X"
  const displayTeamName = teamNames[user.team] || `Team ${user.team}`;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
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
             <button onClick={logout} className="text-gray-400 hover:text-red-500 transition-colors" title="Logout">
               <LogOut size={18} />
             </button>
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