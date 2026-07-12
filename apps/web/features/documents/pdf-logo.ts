import 'server-only';
import type { PDFDocument, PDFPage } from 'pdf-lib';

// Dessine le logo de l'organisme sur une page PDF (pdf-lib), ancré par son coin
// supérieur DROIT en (right, top), redimensionné pour tenir dans maxW × maxH en
// conservant le ratio. Accepte PNG ou JPG. Renvoie la hauteur dessinée (0 si aucun
// logo ou format non supporté) — sans jamais faire échouer la génération du PDF.
export async function drawOrgLogo(
  pdf: PDFDocument,
  page: PDFPage,
  logo: Uint8Array | null,
  opts: { right: number; top: number; maxW: number; maxH: number },
): Promise<number> {
  if (!logo || logo.byteLength === 0) return 0;
  let img: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null;
  try {
    img = await pdf.embedPng(logo);
  } catch {
    try {
      img = await pdf.embedJpg(logo);
    } catch {
      return 0;
    }
  }
  const scale = Math.min(opts.maxW / img.width, opts.maxH / img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  page.drawImage(img, { x: opts.right - w, y: opts.top - h, width: w, height: h });
  return h;
}
