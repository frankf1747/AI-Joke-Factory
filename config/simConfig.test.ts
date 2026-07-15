import { describe, it, expect } from 'vitest';
import { SIM_CONFIG, classifyLength, categoryById } from './simConfig';

describe('SIM_CONFIG categories', () => {
  it('has 10 approved Topic categories', () => {
    expect(SIM_CONFIG.categories).toHaveLength(10);
  });

  it('category ids are unique', () => {
    const ids = SIM_CONFIG.categories.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('categoryById returns the right one or undefined', () => {
    expect(categoryById('workplace')?.label).toBe('Workplace');
    expect(categoryById('nonexistent')).toBeUndefined();
  });
});

describe('SIM_CONFIG economics', () => {
  it('all costs are non-negative', () => {
    const e = SIM_CONFIG.economics;
    expect(e.marketPrice).toBeGreaterThan(0);
    expect(e.costOfCreation).toBeGreaterThanOrEqual(0);
    expect(e.costOfPublishing).toBeGreaterThanOrEqual(0);
    expect(e.buyerBudget).toBeGreaterThan(0);
  });
});

describe('classifyLength (3 buckets)', () => {
  it('classifies short / medium / long by word count', () => {
    expect(classifyLength('one two three')).toBe('short');
    expect(classifyLength(Array(25).fill('w').join(' '))).toBe('short');     // boundary
    expect(classifyLength(Array(40).fill('w').join(' '))).toBe('medium');
    expect(classifyLength(Array(60).fill('w').join(' '))).toBe('medium');    // boundary
    expect(classifyLength(Array(80).fill('w').join(' '))).toBe('long');
  });
});
