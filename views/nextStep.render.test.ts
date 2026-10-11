import { describe, expect, it } from 'vitest';
import JokeMaker from './JokeMaker';
import QualityControl from './QualityControl';
import { TEST_CONFIG, renderWithGame, testUser } from './testing/renderWithGame';
import { Role } from '../types';

const summary = {
  team: { id: 1, name: 'Team 1' }, round_id: 1, rank: 1, points: 0, total_sales: 0,
  batches_created: 0, batches_processed: 0, published_jokes: 0, unprocessed_batches: 0,
};

describe('the Next step line on the student screens', () => {
  it('sits under the Joke Maker\'s stat tiles, above Jokes by stage', () => {
    const out = renderWithGame(JokeMaker, { user: testUser(Role.JOKE_MAKER), teamSummary: summary });
    const line = out.indexOf('Next step');
    expect(line).toBeGreaterThan(out.indexOf('Content Waste'));
    expect(line).toBeLessThan(out.indexOf('Jokes by stage'));
    expect(out).toContain("Marketing&#x27;s desk is empty — send your next batch of 5.");
  });

  it('tells a Joke Maker to get ready before the round starts', () => {
    const out = renderWithGame(JokeMaker, {
      user: testUser(Role.JOKE_MAKER), config: { ...TEST_CONFIG, isActive: false }, teamSummary: summary,
    });
    expect(out).toContain('Get your AI tool ready — the round starts soon.');
  });

  it('renders on both screens before anything has loaded (no summary, no batches, no desk)', () => {
    const cases = [
      [JokeMaker, Role.JOKE_MAKER, 'Keep writing — every batch is another chance to sell.'],
      [QualityControl, Role.QUALITY_CONTROL, 'Release what&#x27;s good enough, then tell your Joke Maker what to change.'],
    ] as const;
    for (const [view, role, sentence] of cases) {
      const out = renderWithGame(view, { user: testUser(role), teamSummary: null, qcQueue: null, batches: [] });
      expect(out).toContain('Next step');
      expect(out).toContain(sentence);
    }
  });

  it('sits under Marketing\'s stat tiles and prices a waiting batch at the round\'s storage fee', () => {
    const sent = new Date(Date.now() - 50_000).toISOString();
    const out = renderWithGame(QualityControl, {
      user: testUser(Role.QUALITY_CONTROL),
      teamSummary: { ...summary, unprocessed_batches: 1 },
      qcQueue: { batch: { batch_id: 9, round_id: 1, team_id: 1, submitted_at: sent, raw_text: 'one\n\ntwo' }, jokes: [], queue_size: 1 },
    });
    const line = out.indexOf('Next step');
    expect(line).toBeGreaterThan(out.indexOf('Hosting fees'));
    expect(line).toBeLessThan(out.indexOf('The 12 criteria customers judge'));
    expect(out).toMatch(/Batch waiting (5\d) s — release what&#x27;s good enough\. Storage costs 10¢ a joke each minute\./);
  });
});
