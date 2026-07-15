import 'server-only';
import { rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';

export type SignatureAssets = {
  signaturePng: Uint8Array | null;
  stampPng: Uint8Array | null;
  /**
   * Cachet texte de l'organisme (raison sociale, adresse, SIRET) apposé
   * automatiquement quand aucun cachet image (`stampPng`) n'a été téléversé.
   * Construit via `orgCachetLines()` à partir de l'identité de l'organisme.
   */
  stampText?: string[] | null;
  representativeName: string | null;
  representativeTitle: string | null;
  place: string | null;
  date: Date;
};

export type SignatureAnchor = { x: number; y: number; width: number; height: number };

const COLOR_BODY = rgb(0.094, 0.094, 0.106);
const COLOR_MUTED = rgb(0.42, 0.42, 0.45);
// Encre du cachet : bleu tampon, proche d'un cachet encreur réel.
const COLOR_STAMP = rgb(0.13, 0.27, 0.53);

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
}

/**
 * Construit les lignes du cachet de l'organisme à partir de son identité.
 * Ex. ["CAPSULE IA", "25 RUE ROMAIN ROLLAND", "45100 ORLÉANS", "SIRET : 98953111600014"].
 * `address` est la chaîne composée (composeAddress), séparée par des virgules ;
 * la mention de pays éventuelle est retirée pour coller à un cachet classique.
 */
export function orgCachetLines(org: {
  name: string;
  address: string | null;
  siret: string | null;
}): string[] {
  const lines: string[] = [org.name.trim().toUpperCase()];
  if (org.address) {
    for (const part of org.address.split(',')) {
      const p = part.trim();
      if (p && !/^france$/i.test(p)) lines.push(p.toUpperCase());
    }
  }
  if (org.siret) lines.push(`SIRET : ${org.siret.trim()}`);
  return lines;
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
  } else if (assets.stampText && assets.stampText.length > 0) {
    // Cachet texte encadré (bleu tampon), aligné à droite de la zone de signature.
    const lines = assets.stampText;
    const lineH = 11;
    const padY = 8;
    const boxW = Math.min(176, width - 12);
    const boxH = Math.min(height - 16, lines.length * lineH + padY * 2);
    const bx = x + width - boxW - 4;
    const by = y + 8;
    page.drawRectangle({
      x: bx, y: by, width: boxW, height: boxH,
      color: rgb(1, 1, 1), borderColor: COLOR_STAMP, borderWidth: 1,
    });
    let ty = by + boxH - padY - 7;
    for (const [i, line] of lines.entries()) {
      const bold = i === 0;
      const size = bold ? 9 : 8;
      const lineFont = bold ? fonts.fontBold : fonts.font;
      const w = lineFont.widthOfTextAtSize(line, size);
      page.drawText(line, { x: bx + (boxW - w) / 2, y: ty, size, font: lineFont, color: COLOR_STAMP });
      ty -= lineH;
    }
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
