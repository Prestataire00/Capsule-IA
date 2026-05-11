import { describe, it, expect } from 'vitest';
import { classifyHours, isHalfDay } from '../half-day';

describe('classifyHours', () => {
  it('split morning+afternoon if crosses noon', () => {
    expect(classifyHours(9, 17)).toEqual(['morning', 'afternoon']);
  });

  it('morning only if ends ≤ 13h', () => {
    expect(classifyHours(9, 12.5)).toEqual(['morning']);
  });

  it('afternoon only if starts ≥ 12h', () => {
    expect(classifyHours(13, 17)).toEqual(['afternoon']);
  });

  it('evening if starts ≥ 18h', () => {
    expect(classifyHours(18, 21)).toEqual(['evening']);
  });

  it('crosses noon for 8h-18h (split)', () => {
    expect(classifyHours(8, 18)).toEqual(['morning', 'afternoon']);
  });
});

describe('isHalfDay', () => {
  it('accepts valid values', () => {
    expect(isHalfDay('morning')).toBe(true);
    expect(isHalfDay('afternoon')).toBe(true);
    expect(isHalfDay('full')).toBe(true);
    expect(isHalfDay('evening')).toBe(true);
  });

  it('rejects invalid', () => {
    expect(isHalfDay('xxx')).toBe(false);
    expect(isHalfDay(null)).toBe(false);
    expect(isHalfDay(undefined)).toBe(false);
    expect(isHalfDay(42)).toBe(false);
  });
});
