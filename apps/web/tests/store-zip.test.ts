// Archive ZIP de l'export d'audit : structure lisible par tout décompresseur.
import { describe, it, expect } from 'vitest';
import { crc32, zipStore } from '@/shared/lib/zip/store-zip';

const enc = new TextEncoder();

describe('archive ZIP sans compression', () => {
  it('calcule le CRC-32 de référence', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('produit en-têtes locaux, répertoire central et fin d’archive cohérents', () => {
    const contenu = enc.encode('bonjour');
    const z = zipStore([
      { name: 'synthese.html', data: contenu },
      { name: 'preuves/I23/1-veille-légale.pdf', data: new Uint8Array([1, 2, 3]) },
    ]);
    const v = new DataView(z.buffer, z.byteOffset, z.byteLength);

    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint16(6, true) & 0x0800).toBe(0x0800);
    expect(v.getUint32(14, true)).toBe(crc32(contenu));

    const fin = z.length - 22;
    expect(v.getUint32(fin, true)).toBe(0x06054b50);
    expect(v.getUint16(fin + 10, true)).toBe(2);
    const debutCentral = v.getUint32(fin + 16, true);
    expect(v.getUint32(debutCentral, true)).toBe(0x02014b50);
    expect(debutCentral + v.getUint32(fin + 12, true)).toBe(fin);
  });

  it('accepte une archive vide', () => {
    expect(zipStore([]).length).toBe(22);
  });
});
