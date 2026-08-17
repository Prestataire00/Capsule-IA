import type { PDFDocument, PDFFont } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import { rgpdMention } from './legal/requirements';

/**
 * Mention d'information RGPD (art. 13-14) en pied de la dernière page.
 *
 * Tout document remis à un apprenant, une entreprise ou un financeur porte des
 * données personnelles : la mention doit figurer sur le document lui-même, pas
 * seulement dans les CGV. Dessinée au-dessus du pied de page courant (numéro de
 * page, y = 24) pour ne pas le recouvrir.
 */
export function drawRgpdMention(
  doc: PDFDocument,
  font: PDFFont,
  contactEmail?: string | null,
  opts: { margin?: number; size?: number; baseline?: number } = {},
): void {
  const margin = opts.margin ?? 48;
  const size = opts.size ?? 6;
  const baseline = opts.baseline ?? 34;

  const pages = doc.getPages();
  const page = pages[pages.length - 1];
  if (!page) return;

  const maxWidth = page.getWidth() - margin * 2;
  const lines = wrap(rgpdMention(contactEmail), font, size, maxWidth);
  const color = rgb(0.63, 0.63, 0.67);

  // Dessiné de bas en haut : la dernière ligne se pose juste au-dessus du pied de page.
  lines.forEach((line, i) => {
    page.drawText(line, {
      x: margin,
      y: baseline + (lines.length - 1 - i) * (size + 1.5),
      size,
      font,
      color,
    });
  });
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}
