import { describe, it, expect } from 'vitest';
import { decideTransport, RESEND_MAX_ATTACH_BYTES } from '../attachments';

describe('decideTransport', () => {
  it('attache quand le total reste sous le seuil', () => {
    expect(decideTransport([1_000, 2_000])).toBe('attach');
  });

  it('attache pile au seuil (limite inclusive)', () => {
    expect(decideTransport([RESEND_MAX_ATTACH_BYTES])).toBe('attach');
  });

  it('bascule en lien quand le total dépasse le seuil', () => {
    expect(decideTransport([RESEND_MAX_ATTACH_BYTES, 1])).toBe('link');
  });

  it('attache quand il n’y a aucune pièce', () => {
    expect(decideTransport([])).toBe('attach');
  });
});
