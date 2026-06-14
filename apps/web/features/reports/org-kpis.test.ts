import { describe, it, expect } from 'vitest';
import { qualiopiCompletionRate } from './org-kpis';

describe('qualiopiCompletionRate', () => {
  it('cas normal : (active_completed - blocking) / active_completed', () => {
    expect(qualiopiCompletionRate(10, 2)).toBeCloseTo(0.8, 10);
  });

  it('0 dossier actif/complété → 1 (rien à bloquer = 100 %)', () => {
    expect(qualiopiCompletionRate(0, 0)).toBe(1);
  });

  it('tous bloquants → 0', () => {
    expect(qualiopiCompletionRate(5, 5)).toBe(0);
  });

  it('clamp dans [0, 1] même si blocking > active_completed', () => {
    expect(qualiopiCompletionRate(3, 7)).toBe(0);
  });
});
