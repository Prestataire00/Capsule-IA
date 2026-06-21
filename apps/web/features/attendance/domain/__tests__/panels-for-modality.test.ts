import { describe, it, expect } from 'vitest';
import { panelsForModality } from '../panels-for-modality';

describe('panelsForModality', () => {
  it('présentiel → signature seule', () => {
    expect(panelsForModality('presentiel')).toEqual({ signature: true, zoom: false });
  });
  it('distanciel → zoom seul', () => {
    expect(panelsForModality('distanciel')).toEqual({ signature: false, zoom: true });
  });
  it('hybride → les deux', () => {
    expect(panelsForModality('hybride')).toEqual({ signature: true, zoom: true });
  });
  it('afest → signature seule', () => {
    expect(panelsForModality('afest')).toEqual({ signature: true, zoom: false });
  });
  it('modalité inconnue → signature seule (repli sûr)', () => {
    expect(panelsForModality('autre')).toEqual({ signature: true, zoom: false });
  });
});
