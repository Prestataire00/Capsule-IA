import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type AttestationInput = {
  organization: {
    name: string;
    siret: string | null;
    nda: string | null;
    address: string | null;
    representativeName: string | null;
  };
  learner: {
    firstName: string;
    lastName: string;
    email: string;
    birthDate: string | null;
  };
  formation: {
    title: string;
    objectives: string[];
  };
  dossier: {
    reference: string;
    startDate: string;
    endDate: string;
    totalHours: number;
    modality: string;
    attendanceRate: number; // 0-100
  };
  generatedAt: Date;
};

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const COL = A4.width - MARGIN * 2;
const COLOR_BODY = rgb(0.094, 0.094, 0.106);
const COLOR_MUTED = rgb(0.42, 0.42, 0.45);
const COLOR_RULE = rgb(0.89, 0.89, 0.91);
const COLOR_ACCENT = rgb(0.486, 0.227, 0.929);

type Cursor = { page: PDFPage; y: number };

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
};

const modalityLabel = (m: string): string =>
  ({ presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride', afest: 'AFEST' } as Record<string, string>)[m] ?? m;

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function drawText(c: Cursor, font: PDFFont, text: string, opts: { size?: number; color?: ReturnType<typeof rgb>; maxWidth?: number } = {}): Cursor {
  const size = opts.size ?? 10;
  const maxWidth = opts.maxWidth ?? COL;
  const color = opts.color ?? COLOR_BODY;
  const lines = wrapText(text, font, size, maxWidth);
  let cursor = c;
  for (const line of lines) {
    cursor.page.drawText(line, { x: MARGIN, y: cursor.y, size, font, color });
    cursor = { ...cursor, y: cursor.y - (size + 4) };
  }
  return cursor;
}

function drawKeyValue(c: Cursor, font: PDFFont, fontBold: PDFFont, key: string, value: string): Cursor {
  c.page.drawText(key, { x: MARGIN, y: c.y, size: 9, font, color: COLOR_MUTED });
  const lines = wrapText(value, fontBold, 11, COL - 160);
  c.page.drawText(lines[0] ?? '—', { x: MARGIN + 160, y: c.y, size: 11, font: fontBold, color: COLOR_BODY });
  let y = c.y - 16;
  for (let i = 1; i < lines.length; i++) {
    c.page.drawText(lines[i] ?? '', { x: MARGIN + 160, y, size: 11, font: fontBold, color: COLOR_BODY });
    y -= 16;
  }
  return { page: c.page, y };
}

export async function generateAttestationPDF(input: AttestationInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([A4.width, A4.height]);
  let c: Cursor = { page, y: A4.height - MARGIN };

  // Header — barre d'accent + organisme
  c.page.drawRectangle({ x: MARGIN, y: c.y - 4, width: 32, height: 4, color: COLOR_ACCENT });
  c = { ...c, y: c.y - 22 };
  c.page.drawText(input.organization.name.toUpperCase(), {
    x: MARGIN, y: c.y, size: 11, font: fontBold, color: COLOR_BODY,
  });
  c = { ...c, y: c.y - 12 };
  const orgMeta = [
    input.organization.siret ? `SIRET ${input.organization.siret}` : null,
    input.organization.nda ? `Déclaration d'activité n° ${input.organization.nda}` : null,
  ].filter(Boolean).join('  ·  ');
  if (orgMeta) {
    c.page.drawText(orgMeta, { x: MARGIN, y: c.y, size: 8, font, color: COLOR_MUTED });
    c = { ...c, y: c.y - 10 };
  }
  if (input.organization.address) {
    c.page.drawText(input.organization.address, { x: MARGIN, y: c.y, size: 8, font, color: COLOR_MUTED });
    c = { ...c, y: c.y - 10 };
  }
  c = { ...c, y: c.y - 30 };

  // Titre
  c.page.drawText('ATTESTATION DE RÉALISATION', {
    x: MARGIN, y: c.y, size: 18, font: fontBold, color: COLOR_BODY,
  });
  c = { ...c, y: c.y - 18 };
  c.page.drawText("Action de formation professionnelle continue — article L.6353-1 du Code du Travail", {
    x: MARGIN, y: c.y, size: 9, font, color: COLOR_MUTED,
  });
  c = { ...c, y: c.y - 6 };
  c.page.drawLine({
    start: { x: MARGIN, y: c.y },
    end: { x: MARGIN + COL, y: c.y },
    thickness: 0.5,
    color: COLOR_RULE,
  });
  c = { ...c, y: c.y - 30 };

  // Référence + génération
  c.page.drawText(`Référence dossier : ${input.dossier.reference}`, {
    x: MARGIN, y: c.y, size: 9, font, color: COLOR_BODY,
  });
  c.page.drawText(`Généré le ${fmtDate(input.generatedAt.toISOString())}`, {
    x: MARGIN + COL - 150, y: c.y, size: 9, font, color: COLOR_MUTED,
  });
  c = { ...c, y: c.y - 28 };

  // Texte d'attestation
  const orgName = input.organization.name;
  const rep = input.organization.representativeName;
  const learnerFullName = `${input.learner.firstName} ${input.learner.lastName}`;
  const intro = rep
    ? `Je soussigné(e) ${rep}, représentant légal de ${orgName}, atteste que :`
    : `${orgName} atteste que :`;
  c = drawText(c, font, intro, { size: 11 });
  c = { ...c, y: c.y - 14 };

  // Bénéficiaire en bloc
  c.page.drawText(learnerFullName.toUpperCase(), {
    x: MARGIN, y: c.y, size: 14, font: fontBold, color: COLOR_ACCENT,
  });
  c = { ...c, y: c.y - 14 };
  const learnerMeta = [
    `Email ${input.learner.email}`,
    input.learner.birthDate ? `Né(e) le ${fmtDate(input.learner.birthDate)}` : null,
  ].filter(Boolean).join('  ·  ');
  c.page.drawText(learnerMeta, { x: MARGIN, y: c.y, size: 9, font, color: COLOR_MUTED });
  c = { ...c, y: c.y - 22 };

  // Texte
  c = drawText(c, font, "a suivi l'action de formation suivante :", { size: 11 });
  c = { ...c, y: c.y - 14 };

  // Détails formation
  c = drawKeyValue(c, font, fontBold, 'Intitulé', input.formation.title);
  c = drawKeyValue(c, font, fontBold, 'Période', `du ${fmtDate(input.dossier.startDate)} au ${fmtDate(input.dossier.endDate)}`);
  c = drawKeyValue(c, font, fontBold, 'Durée totale', `${input.dossier.totalHours} heures`);
  c = drawKeyValue(c, font, fontBold, 'Modalité', modalityLabel(input.dossier.modality));
  c = drawKeyValue(c, font, fontBold, "Taux d'assiduité", `${Math.round(input.dossier.attendanceRate)} %`);
  c = { ...c, y: c.y - 18 };

  // Objectifs (si présents)
  if (input.formation.objectives.length > 0) {
    c.page.drawText('OBJECTIFS PÉDAGOGIQUES VISÉS', {
      x: MARGIN, y: c.y, size: 8, font, color: COLOR_MUTED,
    });
    c = { ...c, y: c.y - 14 };
    for (const obj of input.formation.objectives) {
      c = drawText(c, font, `•  ${obj}`, { size: 10 });
    }
    c = { ...c, y: c.y - 16 };
  }

  // Closing
  c = drawText(
    c, font,
    "La présente attestation est délivrée à l'intéressé(e) pour servir et valoir ce que de droit. Elle constitue une pièce du dossier individuel de formation, conservée pendant 10 ans dans l'espace personnel de l'apprenant.",
    { size: 10, color: COLOR_MUTED },
  );
  c = { ...c, y: c.y - 30 };

  // Signature
  const today = fmtDate(input.generatedAt.toISOString());
  c.page.drawText(`Fait le ${today}`, {
    x: MARGIN + COL - 200, y: c.y, size: 10, font, color: COLOR_BODY,
  });
  c = { ...c, y: c.y - 30 };

  // Cadre signature
  const sigBoxW = 240;
  const sigBoxH = 90;
  c.page.drawRectangle({
    x: MARGIN + COL - sigBoxW, y: c.y - sigBoxH,
    width: sigBoxW, height: sigBoxH,
    borderColor: COLOR_RULE, borderWidth: 0.5,
  });
  c.page.drawText("Signature et cachet de l'organisme", {
    x: MARGIN + COL - sigBoxW + 8, y: c.y - 14,
    size: 8, font: fontBold, color: COLOR_MUTED,
  });
  if (rep) {
    c.page.drawText(rep, {
      x: MARGIN + COL - sigBoxW + 8, y: c.y - sigBoxH + 10,
      size: 9, font, color: COLOR_BODY,
    });
  }

  // Footer
  page.drawText(`${input.organization.name}  ·  ${input.dossier.reference}  ·  Attestation Qualiopi`, {
    x: MARGIN, y: 24, size: 7, font, color: COLOR_MUTED,
  });

  return doc.save();
}
