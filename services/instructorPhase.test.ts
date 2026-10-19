import { describe, expect, it } from 'vitest';
import { defaultTab, defaultViewRound, followPhase, instructorPhase, knownPhase, phaseAction } from './instructorPhase';

describe('instructorPhase', () => {
  it('maps the two round statuses to a phase', () => {
    expect(instructorPhase({ 1: 'CONFIGURED', 2: 'CONFIGURED' })).toBe('lobby');
    expect(instructorPhase({ 1: null, 2: null })).toBe('lobby');
    expect(instructorPhase({ 1: 'ACTIVE', 2: 'CONFIGURED' })).toBe('r1-running');
    expect(instructorPhase({ 1: 'ENDED', 2: 'CONFIGURED' })).toBe('between');
    expect(instructorPhase({ 1: 'ENDED', 2: 'ACTIVE' })).toBe('r2-running');
    expect(instructorPhase({ 1: 'ENDED', 2: 'ENDED' })).toBe('over');
  });
});

describe('defaultTab', () => {
  it('opens Teams in the lobby, Live during and between rounds, Debrief at the end', () => {
    expect(defaultTab('lobby')).toBe('teams');
    expect(defaultTab('r1-running')).toBe('live');
    expect(defaultTab('between')).toBe('live');
    expect(defaultTab('r2-running')).toBe('live');
    expect(defaultTab('over')).toBe('debrief');
  });
});

describe('phaseAction', () => {
  it('gives one action per phase', () => {
    expect(phaseAction('lobby')).toBe('start-r1');
    expect(phaseAction('r1-running')).toBe('end-r1');
    expect(phaseAction('between')).toBe('start-r2');
    expect(phaseAction('r2-running')).toBe('end-r2');
    expect(phaseAction('over')).toBe('debrief');
  });
});

describe('defaultViewRound', () => {
  it('views Round 1 until Round 2 has started', () => {
    expect(defaultViewRound('lobby')).toBe(1);
    expect(defaultViewRound('r1-running')).toBe(1);
    expect(defaultViewRound('between')).toBe(1);
    expect(defaultViewRound('r2-running')).toBe(2);
    expect(defaultViewRound('over')).toBe(2);
  });
});

/* After a reload both statuses are null until the first poll lands. Null reads
   as the lobby, so committing a tab then would open Teams for one poll and jump
   to Live. The tab waits for a known phase instead. */
describe('knownPhase and followPhase', () => {
  it('has no phase while both statuses are unknown', () => {
    expect(knownPhase({ 1: null, 2: null })).toBeNull();
    expect(knownPhase({ 1: 'ACTIVE', 2: null })).toBe('r1-running');
    expect(knownPhase({ 1: 'CONFIGURED', 2: 'CONFIGURED' })).toBe('lobby');
  });

  it('commits no tab until the phase is known, then opens the phase default', () => {
    const start = { tab: null, phase: null };
    expect(followPhase(start, null)).toBe(start);
    expect(followPhase(start, 'r1-running')).toEqual({ tab: 'live', phase: 'r1-running' });
  });

  it('keeps a tab picked before the first poll, and moves with later phase changes', () => {
    const picked = followPhase({ tab: 'setup', phase: null }, 'r1-running');
    expect(picked).toEqual({ tab: 'setup', phase: 'r1-running' });
    expect(followPhase(picked, 'r1-running')).toBe(picked);
    expect(followPhase(picked, 'between')).toEqual({ tab: 'live', phase: 'between' });
    expect(followPhase({ tab: 'live', phase: 'r2-running' }, 'over')).toEqual({ tab: 'debrief', phase: 'over' });
  });

  it('keeps the tab when a poll briefly loses both statuses', () => {
    const s = { tab: 'live' as const, phase: 'r1-running' as const };
    expect(followPhase(s, null)).toBe(s);
  });
});
