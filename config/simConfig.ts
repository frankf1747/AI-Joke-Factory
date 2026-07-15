// Single source of truth for the AI Joke Factory Phase 1 simulation.
// Edit these values freely to retune. Phase 2 will extend this module with
// the customer engine config (ideal joke profile, tau, M, jitter, tick) when
// those land in the real backend.

export type CategoryId =
  | 'workplace' | 'mba' | 'tech' | 'ai' | 'animals' | 'sports'
  | 'everyday' | 'social_media' | 'education' | 'random';

export type LengthClass = 'short' | 'medium' | 'long';

export interface CategoryDef {
  id: CategoryId;
  label: string;
  icon: string; // lucide-react icon name
}

export const SIM_CONFIG = {
  // ---- Approved Topic categories (10 — from the professor's joke universe) ----
  categories: [
    { id: 'workplace',    label: 'Workplace',    icon: 'Briefcase' },
    { id: 'mba',          label: 'MBA Life',     icon: 'GraduationCap' },
    { id: 'tech',         label: 'Tech',         icon: 'Cpu' },
    { id: 'ai',           label: 'AI',           icon: 'Bot' },
    { id: 'animals',      label: 'Animals',      icon: 'PawPrint' },
    { id: 'sports',       label: 'Sports',       icon: 'Medal' },
    { id: 'everyday',     label: 'Everyday',     icon: 'Coffee' },
    { id: 'social_media', label: 'Social media', icon: 'Smartphone' },
    { id: 'education',    label: 'Education',    icon: 'BookOpen' },
    { id: 'other',        label: 'Other',        icon: 'Pencil' },
  ] as CategoryDef[],

  bannedCategories: ['Religion', 'Politics', 'Tragedy', 'Targeting a person or group'],

  // ---- Economics (two-cost model; assume ~15 teams) ----
  economics: {
    marketPrice:      1.00,
    costOfCreation:   0.10,
    costOfPublishing: 0.10,
    buyerBudget:      3.00,
  },

  // ---- Length classification (3 buckets; used by Phase 2 classifier later) ----
  length: { shortMaxWords: 25, longMinWords: 61 },

  // ---- Dev-mode toggles ----
  dev: {
    // When true (mock mode), the mock backend's simulateBuyerTick auto-buys
    // published jokes so the flow viz "Sold" lane animates. Off in production
    // — the real AI Customer Engine handles buying.
    simulatedBuyerInMock: true,
  },
};

export function categoryById(id: string): CategoryDef | undefined {
  return SIM_CONFIG.categories.find(c => c.id === id);
}

export function classifyLength(text: string): LengthClass {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words <= SIM_CONFIG.length.shortMaxWords) return 'short';
  if (words >= SIM_CONFIG.length.longMinWords) return 'long';
  return 'medium';
}
