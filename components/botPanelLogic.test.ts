// components/botPanelLogic.test.ts
import { describe, it, expect } from 'vitest';
import {
  PROBE_STALE_MS, REASONS, panelControls, probeIsStale, type PanelInput,
} from './botPanelLogic';
import { MAX_BOT_TEAMS } from '../services/bots/personas';
import type { EngineStatus, ProbeResult } from '../services/bots/protocol';

const probe = (over: Partial<ProbeResult> = {}): ProbeResult => ({ humans: 0, bots: 0, roundStatus: 'CONFIGURED', ...over });

const status = (over: Partial<EngineStatus> = {}): EngineStatus => ({
  running: false, speed: 1, teams: [], classificationCalls: 0, scrambled: false, warnings: [], ...over,
});

const team = {
  index: 1, persona: 'SPRAY' as const, teamId: 2, batchesPublished: 0,
  jm: { userId: 10, name: 'A', activity: 'joined', error: null },
  marketing: { userId: 11, name: 'B', activity: 'joined', error: null },
};

/** A panel that can do everything: round open, lobby empty, profile set, idle. */
function input(over: Partial<PanelInput> = {}): PanelInput {
  return {
    hasRound: true,
    probe: probe(),
    probeStale: false,
    status: status(),
    pending: null,
    counts: { CAREFUL: 1, BALANCED: 1, SPRAY: 1, LEARNER: 0 },
    profileComplete: true,
    ...over,
  };
}

describe('panelControls: Run all-bot class and Fill', () => {
  it('allows both with no reasons when everything is in order', () => {
    const c = panelControls(input());
    expect(c).toMatchObject({ canRunAllBots: true, canFill: true, runAllBotsBlockedBy: [], fillBlockedBy: [] });
  });

  it('always pairs a disabled button with a reason, and an enabled one with none', () => {
    const cases: PanelInput[] = [
      input(),
      input({ hasRound: false }),
      input({ probe: null }),
      input({ probe: null, probeStale: true }),
      input({ probeStale: true }),
      input({ probe: probe({ roundStatus: 'UNKNOWN' }) }),
      input({ probe: probe({ roundStatus: 'ACTIVE' }) }),
      input({ probe: probe({ roundStatus: 'ENDED' }) }),
      input({ probe: probe({ humans: 3 }) }),
      input({ counts: { CAREFUL: 0, BALANCED: 0, SPRAY: 0, LEARNER: 0 } }),
      input({ counts: { CAREFUL: MAX_BOT_TEAMS, BALANCED: 1, SPRAY: 0, LEARNER: 0 } }),
      input({ profileComplete: false }),
      input({ pending: { id: 1, command: 'start' } }),
      input({ status: status({ running: true }) }),
    ];
    for (const c of cases.map(panelControls)) {
      expect(c.canRunAllBots).toBe(c.runAllBotsBlockedBy.length === 0);
      expect(c.canFill).toBe(c.fillBlockedBy.length === 0);
    }
  });

  it('waits for a round to be selected', () => {
    const c = panelControls(input({ hasRound: false, probe: null }));
    expect(c.runAllBotsBlockedBy).toEqual([REASONS.noRound]);
    expect(c.fillBlockedBy).toEqual([REASONS.noRound]);
  });

  it('waits for the first lobby reading', () => {
    const c = panelControls(input({ probe: null }));
    expect(c.runAllBotsBlockedBy).toEqual([REASONS.checking]);
    expect(c.fillBlockedBy).toEqual([REASONS.checking]);
  });

  it('fails closed when no reading ever arrived', () => {
    const c = panelControls(input({ probe: null, probeStale: true }));
    expect(c.runAllBotsBlockedBy).toEqual([REASONS.stale]);
    expect(c.fillBlockedBy).toEqual([REASONS.stale]);
  });

  it('fails closed on a stale reading, and ignores what that reading said', () => {
    const c = panelControls(input({ probeStale: true, probe: probe({ humans: 2, roundStatus: 'ACTIVE' }) }));
    expect(c.runAllBotsBlockedBy).toEqual([REASONS.stale]);
    expect(c.fillBlockedBy).toEqual([REASONS.stale]);
  });

  it('gives an UNKNOWN round its own reason', () => {
    const c = panelControls(input({ probe: probe({ roundStatus: 'UNKNOWN' }) }));
    expect(c.runAllBotsBlockedBy).toEqual([REASONS.roundUnknown]);
    expect(c.fillBlockedBy).toEqual([REASONS.roundUnknown]);
  });

  it('refuses an ACTIVE round', () => {
    const c = panelControls(input({ probe: probe({ roundStatus: 'ACTIVE' }) }));
    expect(c.runAllBotsBlockedBy).toEqual([REASONS.roundActive]);
    expect(c.fillBlockedBy).toEqual([REASONS.roundActive]);
  });

  it('refuses an ENDED round', () => {
    const c = panelControls(input({ probe: probe({ roundStatus: 'ENDED' }) }));
    expect(c.runAllBotsBlockedBy).toEqual([REASONS.roundEnded]);
    expect(c.fillBlockedBy).toEqual([REASONS.roundEnded]);
  });

  it('points to Fill when humans are waiting, and lets Fill go ahead', () => {
    const c = panelControls(input({ probe: probe({ humans: 3 }) }));
    expect(c.runAllBotsBlockedBy).toEqual([REASONS.humansPresent(3)]);
    expect(c.runAllBotsBlockedBy[0]).toMatch(/Fill with bot teams/);
    expect(c.canFill).toBe(true);
  });

  it('says "human" for one', () => {
    expect(REASONS.humansPresent(1)).toMatch(/1 human waiting/);
    expect(REASONS.humansPresent(2)).toMatch(/2 humans waiting/);
  });

  it('needs at least one bot team', () => {
    const c = panelControls(input({ counts: { CAREFUL: 0, BALANCED: 0, SPRAY: 0, LEARNER: 0 } }));
    expect(c.runAllBotsBlockedBy).toEqual([REASONS.noTeams]);
    expect(c.fillBlockedBy).toEqual([REASONS.noTeams]);
  });

  it(`allows exactly ${MAX_BOT_TEAMS} bot teams and no more`, () => {
    expect(panelControls(input({ counts: { CAREFUL: MAX_BOT_TEAMS, BALANCED: 0, SPRAY: 0, LEARNER: 0 } })).canFill).toBe(true);
    const c = panelControls(input({ counts: { CAREFUL: MAX_BOT_TEAMS, BALANCED: 1, SPRAY: 0, LEARNER: 0 } }));
    expect(c.runAllBotsBlockedBy).toEqual([REASONS.tooManyTeams(MAX_BOT_TEAMS + 1)]);
    expect(c.fillBlockedBy).toEqual([REASONS.tooManyTeams(MAX_BOT_TEAMS + 1)]);
  });

  it('needs the ideal profile for an all-bot class only, never for Fill', () => {
    const c = panelControls(input({ profileComplete: false }));
    expect(c.runAllBotsBlockedBy).toEqual([REASONS.profileIncomplete]);
    expect(c.canFill).toBe(true);
  });

  it('lists every reason that applies at once', () => {
    const c = panelControls(input({
      probe: probe({ humans: 1, roundStatus: 'ENDED' }), profileComplete: false,
      counts: { CAREFUL: 0, BALANCED: 0, SPRAY: 0, LEARNER: 0 },
    }));
    expect(c.runAllBotsBlockedBy).toEqual([
      REASONS.roundEnded, REASONS.noTeams, REASONS.humansPresent(1), REASONS.profileIncomplete,
    ]);
    expect(c.fillBlockedBy).toEqual([REASONS.roundEnded, REASONS.noTeams]);
  });

  it('blocks both while a command is in flight, naming it', () => {
    const c = panelControls(input({ pending: { id: 4, command: 'remove' } }));
    expect(c.runAllBotsBlockedBy).toEqual([REASONS.pending('remove')]);
    expect(c.fillBlockedBy).toEqual([REASONS.pending('remove')]);
    for (const command of ['start', 'stop', 'remove', 'reform'] as const) {
      expect(REASONS.pending(command)).toMatch(/\S/);
    }
  });

  it('blocks both while bots run, with only the busy reason, not lobby or profile ones', () => {
    const c = panelControls(input({
      status: status({ running: true }), probe: probe({ humans: 0, roundStatus: 'ACTIVE' }), profileComplete: false,
    }));
    expect(c.runAllBotsBlockedBy).toEqual([REASONS.running]);
    expect(c.fillBlockedBy).toEqual([REASONS.running]);
  });

  it('still warns that the reading is stale while busy', () => {
    const c = panelControls(input({ status: status({ running: true }), probeStale: true }));
    expect(c.runAllBotsBlockedBy).toEqual([REASONS.running, REASONS.stale]);
  });

  it('reports idle only with nothing running and nothing pending', () => {
    expect(panelControls(input()).idle).toBe(true);
    expect(panelControls(input({ status: null })).idle).toBe(true);
    expect(panelControls(input({ status: status({ running: true }) })).idle).toBe(false);
    expect(panelControls(input({ pending: { id: 1, command: 'reform' } })).idle).toBe(false);
  });

  it('totals the persona counts', () => {
    expect(panelControls(input({ counts: { CAREFUL: 2, BALANCED: 3, SPRAY: 4, LEARNER: 0 } })).total).toBe(9);
  });
});

describe('panelControls: Stop', () => {
  it('is off when nothing runs', () => {
    expect(panelControls(input()).canStop).toBe(false);
  });

  it('is on while bots run', () => {
    expect(panelControls(input({ status: status({ running: true }) })).canStop).toBe(true);
  });

  it('is on while a start is pending, even before status says running — it is the kill switch', () => {
    expect(panelControls(input({ status: null, pending: { id: 1, command: 'start' } })).canStop).toBe(true);
    expect(panelControls(input({ status: status(), pending: { id: 1, command: 'start' } })).canStop).toBe(true);
  });

  it('is off while another command is pending and nothing runs', () => {
    for (const command of ['stop', 'remove', 'reform'] as const) {
      expect(panelControls(input({ pending: { id: 1, command } })).canStop).toBe(false);
    }
  });
});

describe('panelControls: Remove bots', () => {
  it('is off with no bots anywhere', () => {
    expect(panelControls(input()).canRemove).toBe(false);
    expect(panelControls(input({ probe: null, status: null })).canRemove).toBe(false);
  });

  it('is on for bots the lobby shows, even ones this engine never ran', () => {
    expect(panelControls(input({ probe: probe({ bots: 4 }) })).canRemove).toBe(true);
  });

  it('is on for bots this engine seated, even before the lobby shows them', () => {
    expect(panelControls(input({ probe: null, status: status({ teams: [team] }) })).canRemove).toBe(true);
  });

  it('is off while any command is pending', () => {
    expect(panelControls(input({ probe: probe({ bots: 4 }), pending: { id: 1, command: 'stop' } })).canRemove).toBe(false);
  });
});

describe('panelControls: Re-form teams', () => {
  it('is on only when bots report a re-shuffle', () => {
    expect(panelControls(input()).canReform).toBe(false);
    expect(panelControls(input({ status: null })).canReform).toBe(false);
    expect(panelControls(input({ status: status({ scrambled: true, running: true }) })).canReform).toBe(true);
  });

  it('is off while anything is pending', () => {
    for (const command of ['start', 'stop', 'remove', 'reform'] as const) {
      expect(panelControls(input({ status: status({ scrambled: true }), pending: { id: 1, command } })).canReform).toBe(false);
    }
  });
});

describe('probeIsStale', () => {
  it(`is fresh up to ${PROBE_STALE_MS} ms since the last reply, and stale after`, () => {
    expect(PROBE_STALE_MS).toBe(15_000);
    expect(probeIsStale(1_000, 1_000)).toBe(false);
    expect(probeIsStale(1_000, 1_000 + PROBE_STALE_MS)).toBe(false);
    expect(probeIsStale(1_000, 1_001 + PROBE_STALE_MS)).toBe(true);
  });
});
