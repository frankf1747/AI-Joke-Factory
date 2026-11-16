import { beforeEach, describe, expect, it } from 'vitest';
import { botTeams, clearBotTeams, recordBotTeams } from './botRegistry';

beforeEach(() => clearBotTeams());

describe('botRegistry', () => {
  it('keeps teams that have an id and skips the rest', () => {
    recordBotTeams([{ teamId: 4, persona: 'steady' }, { teamId: null, persona: 'rusher' }]);
    expect(botTeams().size).toBe(1);
    expect(botTeams().get(4)).toEqual({ persona: 'steady' });
  });

  it('marks a "Uses feedback" team as using feedback', () => {
    recordBotTeams([{ teamId: 4, persona: 'FEEDBACK' }, { teamId: 5, persona: 'BALANCED' }]);
    expect(botTeams().get(4)).toEqual({ persona: 'FEEDBACK', use_feedback: true });
    expect(botTeams().get(5)).toEqual({ persona: 'BALANCED' });
  });

  it('keeps what it has when told about no teams', () => {
    recordBotTeams([{ teamId: 4, persona: 'steady' }]);
    recordBotTeams([]);
    expect(botTeams().size).toBe(1);
  });

  it('replaces the map with a new list', () => {
    recordBotTeams([{ teamId: 4, persona: 'steady' }]);
    recordBotTeams([{ teamId: 7, persona: 'rusher' }]);
    expect([...botTeams().keys()]).toEqual([7]);
  });
});
