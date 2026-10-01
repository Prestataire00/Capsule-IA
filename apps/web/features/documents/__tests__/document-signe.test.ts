import { describe, it, expect, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';

vi.mock('server-only', () => ({}));

import { construirePdfSigne } from '../document-signe';

// PNG 1×1 transparent.
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
  (c) => c.charCodeAt(0),
);

async function pdfUnePage(): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  d.addPage();
  return d.save();
}

function fausseBase(original: Uint8Array) {
  return {
    storage: {
      from: (bucket: string) => ({
        download: async () => ({ data: new Blob([(bucket === 'documents' ? original : PNG) as unknown as BlobPart]), error: null }),
      }),
    },
  } as never;
}

describe('le document signé', () => {
  it('ajoute un certificat après les pages du document, accents et apostrophes compris', async () => {
    const original = await pdfUnePage();
    const signe = await construirePdfSigne(
      fausseBase(original),
      { id: 'doc-1', title: 'Convention — SERRA PAYSAGE (l’entreprise)', storage_path: 'x.pdf' },
      [
        {
          nom: 'Rémy Muriach',
          email: 'remy@exemple.fr',
          signeLe: '2026-10-01T15:30:00Z',
          ip: '1.2.3.4',
          navigateur: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
          empreinte: 'a'.repeat(64),
          imagePath: 'sig.png',
        },
      ],
    );
    expect(signe).not.toBeNull();
    const relu = await PDFDocument.load(signe as Uint8Array);
    expect(relu.getPageCount()).toBe(2);
  });

  it('sans PDF archivé, rien à construire', async () => {
    const r = await construirePdfSigne(fausseBase(new Uint8Array()), { id: 'd', title: null, storage_path: null }, []);
    expect(r).toBeNull();
  });
});
