// Local simulation settings: the economics the mock backend prices with, and
// dev-mode toggles.
//
// This is NOT the joke rubric. Every scoring concern — the 12 dimensions, their
// categories (Topic included), dim_fit, true_fit, and Length classification —
// lives in config/dimensions.ts, which mirrors the Go backend. Two rival copies
// used to live here: a length classifier with 25/61-word thresholds, and a
// 10-entry Topic palette that shared not one value with the backend's 15. Both
// are gone. If you need a category list, import it from config/dimensions.

export const SIM_CONFIG = {

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

