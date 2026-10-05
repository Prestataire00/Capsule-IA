import 'server-only';
import { drawRgpdMention } from './pdf-rgpd';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { DISCRET, TEXTE, couper, ouvrirDocument, dessinerLigneLibelle, dessinerTitreSection, hauteurLigneLibelle } from './charte-pdf';
import { orgIdentityLines } from './legal/org-identity';
import { identityOf } from './pdf-org-header';

export type LegalPdfInput = {
  title: string;
  organization: {
    name: string;
    nda: string | null;
    address: string | null;
    siret?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    certifications?: string | null;
  };
  logoPng: Uint8Array | null;
  contentMd: string;
};

/**
 * Document à la charte Capsule IA (celle des propositions) : bandeau violet,
 * identité de l'organisme, puis le corps — « ### Titre » devient une section,
 * « Libellé : valeur » une ligne sur fond lavande, le reste un paragraphe.
 */
export async function generateLegalDocPDF(input: LegalPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const polices = { font, fontBold, fontItalic };
  const marge = 40;
  const largeurPage = 595.28; // A4
  const hauteurPage = 841.89;
  const largeur = largeurPage - 2 * marge;
  const bas = 70;

  let page = pdf.addPage([largeurPage, hauteurPage]);
  let y = await ouvrirDocument(pdf, page, polices, { titre: input.title, ligne: input.organization.name, logoPng: input.logoPng });

  // Le même bloc d'identité que sur les autres documents, en discret.
  const [, ...orgMeta] = orgIdentityLines(identityOf(input.organization));
  for (const l of orgMeta) {
    page.drawText(l, { x: marge, y, size: 8, font, color: DISCRET });
    y -= 11;
  }
  y -= 6;

  const place = (h: number) => {
    if (y - h < bas) {
      page = pdf.addPage([largeurPage, hauteurPage]);
      y = hauteurPage - 50;
    }
  };

  let apresTitre = false;
  for (const brut of input.contentMd.split('\n')) {
    const t = brut.replace(/[*_`]/g, '').trimEnd();
    if (apresTitre && t.trim() === '') continue;
    apresTitre = false;
    const titre = /^#{1,3}\s+(.*)$/.exec(t);
    const libelle = /^([^:]{2,40}?)\s:\s(.+)$/.exec(t);
    if (titre) {
      place(48);
      y = dessinerTitreSection(page, polices, marge, y - 22, largeur, titre[1] ?? '');
      apresTitre = true;
    } else if (libelle && !/^https?$/i.test(libelle[1] ?? '')) {
      const h = hauteurLigneLibelle(polices, largeur, libelle[1] ?? '', libelle[2] ?? '');
      place(h);
      y = dessinerLigneLibelle(page, polices, marge, y, largeur, libelle[1] ?? '', libelle[2] ?? '');
    } else if (t.trim() === '') {
      y -= 6;
    } else {
      for (const l of couper(t, font, 10, largeur)) {
        place(14);
        page.drawText(l, { x: marge, y: y - 10, size: 10, font, color: TEXTE });
        y -= 14;
      }
    }
  }
  drawRgpdMention(pdf, font, null);

  return pdf.save();
}
