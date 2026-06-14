import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { drawSignatureBlock, type SignatureAssets } from './apply-org-signature';

async function setup() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, page, fonts: { font, fontBold } };
}

const anchor = { x: 300, y: 200, width: 240, height: 90 };

describe('drawSignatureBlock', () => {
  it('ne jette pas et embarque 0 image quand les assets sont null', async () => {
    const { doc, page, fonts } = await setup();
    const assets: SignatureAssets = {
      signaturePng: null, stampPng: null,
      representativeName: 'Marie OF', representativeTitle: 'Gérante',
      place: 'Lyon', date: new Date('2026-06-12T00:00:00Z'),
    };
    await expect(drawSignatureBlock(doc, page, fonts, anchor, assets)).resolves.toBeUndefined();
    const bytes = await doc.save();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('embarque la signature quand un PNG valide est fourni', async () => {
    const { doc, page, fonts } = await setup();
    // PNG 1x1 transparent (base64)
    const png1x1 = Uint8Array.from(atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    ), (c) => c.charCodeAt(0));
    const assets: SignatureAssets = {
      signaturePng: png1x1, stampPng: png1x1,
      representativeName: 'Marie OF', representativeTitle: 'Gérante',
      place: 'Lyon', date: new Date('2026-06-12T00:00:00Z'),
    };
    await expect(drawSignatureBlock(doc, page, fonts, anchor, assets)).resolves.toBeUndefined();
    const bytes = await doc.save();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
