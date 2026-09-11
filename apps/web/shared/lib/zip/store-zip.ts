/**
 * Archive ZIP minimale, sans compression (méthode « stored »).
 *
 * Suffit pour empaqueter des pièces déjà compressées (PDF, images, documents
 * bureautiques) et un peu de texte, sans ajouter de dépendance. Noms en UTF-8
 * (bit 11), pas de ZIP64 : moins de 65 535 fichiers et de 4 Gio au total.
 */
export type ZipEntry = { readonly name: string; readonly data: Uint8Array; readonly date?: Date };

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dos(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const UTF8 = 0x0800;
const LIMITE = 0xffffffff;

export function zipStore(entries: readonly ZipEntry[]): Uint8Array<ArrayBuffer> {
  if (entries.length > 0xffff) throw new Error('zip: trop de fichiers (ZIP64 non géré)');
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const { time, date } = dos(e.date ?? new Date());

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, UTF8, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, e.data.length, true);
    local.setUint32(22, e.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, e.data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, UTF8, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, e.data.length, true);
    cd.setUint32(24, e.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);

    offset += 30 + name.length + e.data.length;
    if (offset > LIMITE) throw new Error('zip: archive trop volumineuse (ZIP64 non géré)');
  }

  const tailleCentrale = central.reduce((a, b) => a + b.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, entries.length, true);
  fin.setUint16(10, entries.length, true);
  fin.setUint32(12, tailleCentrale, true);
  fin.setUint32(16, offset, true);

  const morceaux = [...parts, ...central, new Uint8Array(fin.buffer)];
  const out = new Uint8Array(new ArrayBuffer(morceaux.reduce((a, b) => a + b.length, 0)));
  let p = 0;
  for (const m of morceaux) {
    out.set(m, p);
    p += m.length;
  }
  return out;
}
