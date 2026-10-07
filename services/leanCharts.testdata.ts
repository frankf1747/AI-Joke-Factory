/* A typed lean-charts response shared by the frontend tests
   (services/leanCharts.test.ts, services/useLeanCharts.test.ts,
   components/leanCharts/*.test.ts). One sample a minute over three minutes:
     Team 1 — batch 1: 5 jokes sent at 10 s, 4 published, 2 sold, first sale after 95 s;
              batch 2: 3 jokes sent at 130 s, nothing published.
     Team 2 — batch 1: 5 jokes sent at 20 s, all 5 published and sold, first sale after 30 s.
     Team 3 — nothing. */
import type { LeanChartsResponse, LeanWaste } from '../types/api';

const zeroWaste: LeanWaste = { setup: 0, waiting: 0, shelf: 0, never_sold: 0, discarded: 0, total: 0 };

export function leanChartsFixture(over: Partial<LeanChartsResponse> = {}): LeanChartsResponse {
  return {
    round_id: 7,
    started_at: '2026-10-06T10:00:00Z',
    clock_end: '2026-10-06T10:03:00Z',
    sample_seconds: 60,
    wip_limit: 2,
    teams: [
      {
        team_id: 1, team_name: 'Team 1',
        waste: { setup: 4, waiting: 1, shelf: 2, never_sold: 0.5, discarded: 0.02, total: 7.52 },
        idle: [
          { t: 0, waiting: 0, shelf: 0 }, { t: 60, waiting: 5, shelf: 0 },
          { t: 120, waiting: 0, shelf: 3 }, { t: 180, waiting: 0, shelf: 2 },
        ],
        batches: [
          { seq: 1, sent_s: 10, jokes: 5, published: 4, sold: 2, first_sale_s: 95 },
          { seq: 2, sent_s: 130, jokes: 3, published: 0, sold: 0, first_sale_s: null },
        ],
      },
      {
        team_id: 2, team_name: 'Team 2',
        waste: { setup: 8, waiting: 3, shelf: 1, never_sold: 1, discarded: 0, total: 13 },
        idle: [
          { t: 0, waiting: 0, shelf: 0 }, { t: 60, waiting: 0, shelf: 0 },
          { t: 120, waiting: 2, shelf: 4 }, { t: 180, waiting: 5, shelf: 1 },
        ],
        batches: [{ seq: 1, sent_s: 20, jokes: 5, published: 5, sold: 5, first_sale_s: 30 }],
      },
      {
        team_id: 3, team_name: 'Team 3',
        waste: { ...zeroWaste },
        idle: [
          { t: 0, waiting: 0, shelf: 0 }, { t: 60, waiting: 0, shelf: 0 },
          { t: 120, waiting: 0, shelf: 0 }, { t: 180, waiting: 0, shelf: 0 },
        ],
        batches: [],
      },
    ],
    class_average: {
      waste: { setup: 4, waiting: 4 / 3, shelf: 1, never_sold: 0.5, discarded: 0.02 / 3, total: 20.52 / 3 },
      idle: [
        { t: 0, waiting: 0, shelf: 0 }, { t: 60, waiting: 5 / 3, shelf: 0 },
        { t: 120, waiting: 2 / 3, shelf: 7 / 3 }, { t: 180, waiting: 5 / 3, shelf: 1 },
      ],
      sell_through: [
        { t: 0, value: 7 / 9 }, { t: 60, value: null }, { t: 120, value: null }, { t: 180, value: null },
      ],
    },
    ...over,
  };
}
