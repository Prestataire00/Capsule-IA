import { describe, it, expect } from 'vitest';
import { sha256Hex } from './file-hash';

describe('sha256Hex', () => {
  it('hash connu pour une entrée vide', () => {
    expect(sha256Hex(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
  it('déterministe et sensible au contenu', () => {
    const a = sha256Hex(new TextEncoder().encode('hello'));
    const b = sha256Hex(new TextEncoder().encode('hello'));
    const c = sha256Hex(new TextEncoder().encode('world'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });
});
