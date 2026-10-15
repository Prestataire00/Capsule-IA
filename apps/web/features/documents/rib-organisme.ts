import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';

/**
 * Le RIB que l'organisme dépose dans Paramètres, tel quel (PDF ou image),
 * joint en dernière page de ses factures (demande d'Ismael, 15/10/2026). Un
 * RIB de banque en ligne est souvent dessiné en tracés, sans texte lisible :
 * on le reproduit, on ne le relit pas.
 */

export type TypeRib = 'pdf' | 'png' | 'jpg';
export type RibDepose = { readonly bytes: Uint8Array; readonly type: TypeRib };

export const MIME_RIB: Record<TypeRib, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg' };
export const RIB_MAX_OCTETS = 5 * 1024 * 1024;

export const typeDuChemin = (path: string): TypeRib | null => {
  const ext = path.split('.').pop();
  return ext === 'pdf' || ext === 'png' || ext === 'jpg' ? ext : null;
};

/** Le fichier s'ouvre bien comme le type annoncé : rien d'illisible sur une facture. */
export async function ribLisible(rib: RibDepose): Promise<boolean> {
  try {
    const doc = await PDFDocument.create();
    if (rib.type === 'pdf') {
      const source = await PDFDocument.load(rib.bytes, { ignoreEncryption: false });
      return source.getPageCount() > 0;
    }
    await (rib.type === 'png' ? doc.embedPng(rib.bytes) : doc.embedJpg(rib.bytes));
    return true;
  } catch {
    return false;
  }
}

const A4 = { width: 595.28, height: 841.89 };
const MARGE = 48;

/** Ajoute le RIB en dernière page : un titre, puis sa première page (ou l'image) à l'échelle. */
export async function ajouterRibEnAnnexe(
  doc: PDFDocument,
  rib: RibDepose,
  polices: { font: PDFFont; fontBold: PDFFont },
  reference: string,
): Promise<void> {
  const page = doc.addPage([A4.width, A4.height]);
  page.drawText('Relevé d’identité bancaire', { x: MARGE, y: A4.height - 64, size: 15, font: polices.fontBold, color: rgb(0.094, 0.094, 0.106) });
  page.drawText(`Pour régler par virement, merci d’indiquer la référence ${reference}.`, {
    x: MARGE,
    y: A4.height - 82,
    size: 9.5,
    font: polices.font,
    color: rgb(0.42, 0.42, 0.45),
  });

  const largeur = A4.width - 2 * MARGE;
  const hauteurMax = A4.height - 120 - MARGE;
  const haut = A4.height - 100;

  if (rib.type === 'pdf') {
    const source = await PDFDocument.load(rib.bytes);
    const [embarquee] = await doc.embedPdf(source, [0]);
    if (!embarquee) return;
    const echelle = Math.min(largeur / embarquee.width, hauteurMax / embarquee.height);
    const l = embarquee.width * echelle;
    const h = embarquee.height * echelle;
    page.drawRectangle({ x: MARGE - 1, y: haut - h - 1, width: l + 2, height: h + 2, borderColor: rgb(0.89, 0.89, 0.91), borderWidth: 0.8 });
    page.drawPage(embarquee, { x: MARGE, y: haut - h, width: l, height: h });
    return;
  }
  const image = rib.type === 'png' ? await doc.embedPng(rib.bytes) : await doc.embedJpg(rib.bytes);
  const echelle = Math.min(largeur / image.width, hauteurMax / image.height, 1);
  page.drawImage(image, { x: MARGE, y: haut - image.height * echelle, width: image.width * echelle, height: image.height * echelle });
}
