import { beforeEach, describe, expect, it } from 'vitest';
import { clearLocalGameMarks } from './context';
import { botTeams, clearBotTeams, recordBotTeams } from './services/runRecord/botRegistry';

beforeEach(() => clearBotTeams());

/* After a successful Reset Game the bot panel's marks must not carry into the next class,
   or that class's saved record would call its student teams bots. */
describe('clearLocalGameMarks', () => {
  it('forgets which teams the bot panel created', () => {
    recordBotTeams([{ teamId: 4, persona: 'steady' }]);
    clearLocalGameMarks({ removeItem: () => {} });
    expect(botTeams().size).toBe(0);
  });

  it('removes the locally kept batch and rating history', () => {
    const removed: string[] = [];
    clearLocalGameMarks({ removeItem: k => { removed.push(k); } });
    expect(removed).toEqual(['joke_factory_submitted_batch_jokes_v1', 'joke_factory_qc_rated_history_v1']);
  });
});
