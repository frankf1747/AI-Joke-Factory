// UI-facing simulation settings: the Marketing Topic palette and the local
// economics used by the mock backend.
//
// This is NOT the joke rubric. Every scoring concern — the 12 dimensions, their
// real categories, dim_fit, true_fit, and Length classification — lives in
// config/dimensions.ts, which mirrors the Go backend. A second length
// classifier used to live here with different thresholds (25/61 vs the
// backend's 15/40); it had no callers and was deleted rather than left as a
// trap for the next grep.

export type CategoryId =
  | 'workplace' | 'mba' | 'tech' | 'ai' | 'animals' | 'sports'
  | 'everyday' | 'social_media' | 'education' | 'random';


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

  // ---- Economics (Marketing-only cost model; assume ~15 teams) ----
  // JM creates for free. Marketing pays to publish, and pays a smaller amount
  // to throw a joke away — so they prioritise without JM under-producing.
  economics: {
    marketPrice:      1.00,
    costOfPublishing: 0.10,
    costOfDiscard:    0.01,
    buyerBudget:      3.00,
  },

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
