import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { drawOrgLogo } from './pdf-logo';

export type QuestionnairePdfInput = {
  organization: { name: string; siret: string | null; nda: string | null };
  logoPng: Uint8Array | null;
  dossierReference: string;
  formationTitle: string;
  questionnaireTitle: string;
  respondent: string | null;
  submittedAt: string | null;
  answers: { label: string; value: string }[];
};

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const COL = A4.width - MARGIN * 2;
const BODY = rgb(0.094, 0.094, 0.106);
const MUTED = rgb(0.42, 0.42, 0.45);
const RULE = rgb(0.89, 0.89, 0.91);
const ACCENT = rgb(0.92, 0.45, 0.13); // orange brand

const fmtDateTime = (iso: string): string =>
  new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/);
    let line = '';
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function generateQuestionnairePDF(input: QuestionnairePdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  // Logo de l'organisme — coin supérieur droit
  await drawOrgLogo(pdf, page, input.logoPng, { right: MARGIN + COL, top: A4.height - MARGIN + 6, maxW: 150, maxH: 48 });

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([A4.width, A4.height]);
      y = A4.height - MARGIN;
    }
  };

  const text = (s: string, f: PDFFont, size: number, color = BODY) => {
    page.drawText(s, { x: MARGIN, y, size, font: f, color });
  };

  // En-tête organisme
  text(input.organization.name, bold, 14);
  y -= 16;
  const orgMeta = [input.organization.siret ? `SIRET ${input.organization.siret}` : null, input.organization.nda ? `NDA ${input.organization.nda}` : null]
    .filter(Boolean)
    .join('  ·  ');
  if (orgMeta) {
    text(orgMeta, font, 9, MUTED);
    y -= 14;
  }
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + COL, y }, thickness: 1, color: RULE });
  y -= 24;

  // Titre
  text(input.questionnaireTitle, bold, 16, ACCENT);
  y -= 22;
  for (const meta of [
    `Dossier : ${input.dossierReference} — ${input.formationTitle}`,
    input.respondent ? `Répondant : ${input.respondent}` : null,
    input.submittedAt ? `Répondu le ${fmtDateTime(input.submittedAt)}` : 'Réponse enregistrée',
  ].filter((m): m is string => !!m)) {
    text(meta, font, 10, MUTED);
    y -= 14;
  }
  y -= 12;

  // Réponses
  for (const a of input.answers) {
    const labelLines = wrap(a.label, bold, 11, COL);
    const valueLines = wrap(a.value || '—', font, 11, COL);
    ensureSpace(labelLines.length * 15 + valueLines.length * 15 + 14);
    for (const l of labelLines) {
      text(l, bold, 11);
      y -= 15;
    }
    for (const l of valueLines) {
      text(l, font, 11, rgb(0.25, 0.25, 0.3));
      y -= 15;
    }
    y -= 8;
  }

  // Pied de page (preuve)
  ensureSpace(40);
  y = Math.max(y, MARGIN + 20);
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + COL, y }, thickness: 0.5, color: RULE });
  y -= 14;
  text('Document généré pour preuve Qualiopi — réponses horodatées et archivées.', font, 8, MUTED);

  return pdf.save();
}
