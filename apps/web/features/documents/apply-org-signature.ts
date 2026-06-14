import 'server-only';
import { rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';

export type SignatureAssets = {
  signaturePng: Uint8Array | null;
  stampPng: Uint8Array | null;
  representativeName: string | null;
  representativeTitle: string | null;
  place: string | null;
  date: Date;
};

export type SignatureAnchor = { x: number; y: number; width: number; height: number };

const COLOR_BODY = rgb(0.094, 0.094, 0.106);
const COLOR_MUTED = rgb(0.42, 0.42, 0.45);

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
}

export async function drawSignatureBlock(
  doc: PDFDocument,
  page: PDFPage,
  fonts: { font: PDFFont; fontBold: PDFFont },
  anchor: SignatureAnchor,
  assets: SignatureAssets,
): Promise<void> {
  const { x, y, width, height } = anchor;

  // Légende "Fait à ..., le ..."
  const place = assets.place?.trim();
  const caption = place ? `Fait à ${place}, le ${fmtDate(assets.date)}` : `Fait le ${fmtDate(assets.date)}`;
  page.drawText(caption, { x, y: y + height + 8, size: 9, font: fonts.font, color: COLOR_BODY });

  // Cadre
  page.drawText("Signature et cachet de l'organisme", {
    x: x + 6, y: y + height - 12, size: 8, font: fonts.fontBold, color: COLOR_MUTED,
  });

  // Cachet en fond (à droite), puis signature par-dessus (à gauche)
  if (assets.stampPng) {
    const stamp = await doc.embedPng(assets.stampPng);
    const s = stamp.scaleToFit(72, 72);
    page.drawImage(stamp, { x: x + width - s.width - 8, y: y + 8, width: s.width, height: s.height, opacity: 0.85 });
  }
  if (assets.signaturePng) {
    const sig = await doc.embedPng(assets.signaturePng);
    const s = sig.scaleToFit(110, 48);
    page.drawImage(sig, { x: x + 8, y: y + 16, width: s.width, height: s.height });
  }

  // Nom + qualité du représentant
  const repLine = [assets.representativeName, assets.representativeTitle].filter(Boolean).join(' — ');
  if (repLine) {
    page.drawText(repLine, { x: x + 6, y: y + 4, size: 8, font: fonts.font, color: COLOR_BODY });
  }
}
