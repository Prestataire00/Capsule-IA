import { describe, it, expect } from 'vitest';
import { renderQrPng } from './qr';

describe('renderQrPng', () => {
  it('produit un PNG non vide (signature \\x89PNG)', async () => {
    const buf = await renderQrPng('https://exemple.fr/signer/abc.def.ghi');
    expect(buf.byteLength).toBeGreaterThan(100);
    // Signature PNG : 0x89 'P' 'N' 'G'
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  });

  it('respecte la largeur demandée', async () => {
    const small = await renderQrPng('https://x', { width: 120 });
    const big = await renderQrPng('https://x', { width: 480 });
    expect(big.byteLength).toBeGreaterThan(small.byteLength);
  });
});
