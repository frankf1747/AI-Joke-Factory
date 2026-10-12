import { describe, expect, it } from 'vitest';
import JokeMaker from './JokeMaker';
import QualityControl from './QualityControl';
import { TEST_CONFIG, renderWithGame, testUser } from './testing/renderWithGame';
import { Role, type ApiTeamSummaryResponse } from '../types';
import type { LeanTeamStats } from '../types/api';

const summary = (lean?: Partial<LeanTeamStats>): ApiTeamSummaryResponse => ({
  team: { id: 1, name: 'Team 1' }, round_id: 1, rank: 1, points: 0, total_sales: 3, profit: -1.25,
  batches_created: 2, batches_processed: 1, published_jokes: 3, unprocessed_batches: 2,
  jokes_created: 5, jokes_published: 3,
  lean: lean && {
    batches_submitted: 2, setup_cost: 0, carrying_cost: 0, avg_submit_to_publish_s: 40, avg_publish_to_first_sale_s: 0,
    batch_series: [], ...lean,
  },
});

const jokeMaker = (round: 1 | 2, extra: Partial<typeof TEST_CONFIG> = {}) => renderWithGame(JokeMaker, {
  user: testUser(Role.JOKE_MAKER),
  config: { ...TEST_CONFIG, round, ...extra },
  teamSummary: summary({}),
});

const marketing = (lean: Partial<LeanTeamStats>) => renderWithGame(QualityControl, {
  user: testUser(Role.QUALITY_CONTROL),
  teamSummary: summary(lean),
});

describe('Joke Maker screen', () => {
  it('quotes Round 1 shipping for its batch of 5', () => {
    expect(jokeMaker(1)).toContain('Shipping: $2 per batch of 5');
  });

  it('quotes the three Round 2 tiers and says up to 10 jokes, smaller allowed', () => {
    const out = jokeMaker(2);
    expect(out).toContain('Shipping: $1 for 1–4 jokes · $2 for 5 · $3 for 6–10');
    expect(out).toContain('Generate up to 10 jokes');
    expect(out).toContain('smaller batches are fine');
  });

  it('reads the amounts from the round, never from fixed copy', () => {
    const out = jokeMaker(2, { shippingFeeSmall: 0.5, shippingFeeStandard: 1, shippingFeeLarge: 4 });
    expect(out).toContain('Shipping: $0.50 for 1–4 jokes · $1 for 5 · $4 for 6–10');
  });

  it('shows no WIP counter and no setup or carrying wording, even with an old WIP limit stored', () => {
    const out = jokeMaker(1, { wipLimit: 2, setupCostPerBatch: 2 });
    for (const gone of ['batches waiting', 'wait, or go help', 'to set up', 'Setup cost', 'Carrying cost']) {
      expect(out).not.toContain(gone);
    }
  });
});

describe('Marketing screen', () => {
  it('shows Shipping, Storage and Hosting fee tiles with one-line tooltips', () => {
    const out = marketing({ shipping_cost: 8, storage_cost: 1.5, hosting_cost: 0.2, setup_cost: 8, carrying_cost: 1.7 });
    expect(out).toContain('Shipping fees');
    expect(out).toContain('Storage fees');
    expect(out).toContain('Hosting fees');
    expect(out).toContain('$8.00');
    expect(out).toContain('$1.50');
    expect(out).toContain('$0.20');
    expect(out).toContain('title="Charged per batch you send: $1 for 1–4 jokes, $2 for 5, $3 for 6–10."');
    expect(out).toContain('title="Every minute a joke waits on Marketing&#x27;s desk costs 5¢."');
    expect(out).toContain('title="Every minute a released joke sits unsold costs 5¢."');
    expect(out).not.toContain('Setup cost');
    expect(out).not.toContain('Carrying cost');
  });

  it('reads an older backend\'s setup and carrying costs without NaN', () => {
    const out = marketing({ setup_cost: 4, carrying_cost: 2.5 });
    expect(out).toContain('$4.00');
    expect(out).toContain('$2.50');
    expect(out).not.toContain('NaN');
  });
});
