import 'server-only';
import { drawRgpdMention } from './pdf-rgpd';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { drawOrgLogo } from './pdf-logo';
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

// Rendu simple : en-tête OF + titre + corps markdown (lignes) sur pages A4.
export async function generateLegalDocPDF(input: LegalPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 50;
  const width = 595.28; // A4
  const height = 841.89;
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  // Logo de l'organisme — coin supérieur droit
  await drawOrgLogo(pdf, page, input.logoPng, { right: width - margin, top: height - margin + 6, maxW: 150, maxH: 48 });

  const line = (text: string, f = font, fs = 10) => {
    if (y < margin + 20) {
      page = pdf.addPage([width, height]);
      y = height - margin;
    }
    page.drawText(text, { x: margin, y, size: fs, font: f, color: rgb(0.1, 0.1, 0.1) });
    y -= fs + 4;
  };

  // Même bloc d'identité que sur les autres documents.
  const [orgName, ...orgMeta] = orgIdentityLines(identityOf(input.organization));
  line(orgName ?? input.organization.name, bold, 14);
  for (const l of orgMeta) line(l, font, 9);
  y -= 10;
  line(input.title, bold, 16);
  y -= 6;

  for (const raw of input.contentMd.split('\n')) {
    const t = raw.replace(/[*_`]/g, '');
    if (t.startsWith('### ')) line(t.slice(4), bold, 11);
    else if (t.startsWith('## ')) line(t.slice(3), bold, 12);
    else if (t.startsWith('# ')) line(t.slice(2), bold, 13);
    else if (t.trim() === '') y -= 6;
    else for (let i = 0; i < t.length; i += 95) line(t.slice(i, i + 95));
  }
  drawRgpdMention(pdf, font, null);

  return pdf.save();
}
