import 'server-only';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type LegalPdfInput = {
  title: string;
  organization: { name: string; nda: string | null; address: string | null };
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

  const line = (text: string, f = font, fs = 10) => {
    if (y < margin + 20) {
      page = pdf.addPage([width, height]);
      y = height - margin;
    }
    page.drawText(text, { x: margin, y, size: fs, font: f, color: rgb(0.1, 0.1, 0.1) });
    y -= fs + 4;
  };

  line(input.organization.name, bold, 14);
  if (input.organization.nda) line(`Déclaration d'activité : ${input.organization.nda}`, font, 9);
  if (input.organization.address) line(input.organization.address, font, 9);
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
  return pdf.save();
}
