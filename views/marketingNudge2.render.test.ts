import { describe, expect, it, vi } from 'vitest';
import { Role } from '../types';

/* Effects never run under renderToStaticMarkup, so the decision clock cannot
   reach its second nudge on its own: start it there. */
vi.mock('../services/marketingNudge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/marketingNudge')>();
  return { ...actual, INITIAL_NUDGE_STATE: { phase: 'nudge2', dueInMs: null } };
});

describe('Marketing decision dialog (nudge 2)', () => {
  it('opens as "Ready to publish this one?" with the selected joke and its Topic select', async () => {
    const { default: QualityControl } = await import('./QualityControl');
    const { EMPTY_DEMO_UI } = await import('../services/tour/demoUi');
    const { DemoModeContext, GameContext } = await import('../context');
    const { TEST_CONFIG, fakeGame, testUser } = await import('./testing/renderWithGame');
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    /* The demo UI selects joke 101, so the dialog has a joke to show fields for. */
    const out = renderToStaticMarkup(createElement(
      GameContext.Provider,
      {
        value: fakeGame({
          user: testUser(Role.QUALITY_CONTROL),
          config: TEST_CONFIG,
          qcQueueSize: 1,
          qcQueue: {
            batch: { batch_id: 5004, round_id: 1, team_id: 1, submitted_at: '2026-10-18T12:00:00Z', raw_text: null },
            jokes: [{ joke_id: 101, joke_text: 'Joke text 101' }], queue_size: 1,
          },
        }),
      },
      createElement(DemoModeContext.Provider, { value: { ...EMPTY_DEMO_UI, mkSelectedIds: [101] } }, createElement(QualityControl)),
    ));
    const dialog = out.slice(out.indexOf('Ready to publish this one?'));
    expect(out).toContain('Ready to publish this one?');
    expect(dialog).toContain('aria-label="Topic"');
    expect(dialog).toContain('<select');
    expect(dialog).toContain('Add a Topic and a title to publish.');
  });
});
