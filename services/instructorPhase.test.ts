import { describe, expect, it } from 'vitest';
import { defaultTab, defaultViewRound, instructorPhase, phaseAction } from './instructorPhase';

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
