import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { drawSignatureBlock } from './apply-org-signature';
import { drawOrgLogo } from './pdf-logo';

// Certificat de réalisation (F-DOC-09) — document administratif obligatoire,
// signé UNIQUEMENT par l'organisme (pas de signature apprenant). Généré pour
// tout dossier terminé, indépendamment de la satisfaction. La durée affichée
// est la durée RÉALISÉE (heures délivrées), conformément au modèle officiel.
export type CertificatInput = {
  organization: {
    name: string;
    siret: string | null;
    nda: string | null;
    address: string | null;
    representativeName: string | null;
  };
  signaturePng: Uint8Array | null;
  stampPng: Uint8Array | null;
  logoPng: Uint8Array | null;
  representativeTitle: string | null;
  place: string | null;
  learner: {
    firstName: string;
    lastName: string;
    email: string;
    birthDate: string | null;
  };
  formation: {
    title: string;
  };
  dossier: {
    reference: string;
    startDate: string;
    endDate: string;
    plannedHours: number;
    deliveredHours: number;
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

const fmtHours = (h: number): string => {
  const r = Math.round(h * 100) / 100;
  return Number.isInteger(r) ? `${r}` : r.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
};

const modalityLabel = (m: string): string =>
  ({ presentiel: 'Présentiel', distanciel: 'À distance', hybride: 'Mixte (présentiel + distance)' } as Record<string, string>)[m] ?? m;

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

export async function generateCertificatPDF(input: CertificatInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([A4.width, A4.height]);
  let c: Cursor = { page, y: A4.height - MARGIN };

  // Logo de l'organisme — coin supérieur droit
  await drawOrgLogo(doc, page, input.logoPng, { right: MARGIN + COL, top: A4.height - MARGIN + 6, maxW: 150, maxH: 48 });

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
  c.page.drawText('CERTIFICAT DE RÉALISATION', {
    x: MARGIN, y: c.y, size: 18, font: fontBold, color: COLOR_BODY,
  });
  c = { ...c, y: c.y - 18 };
  c.page.drawText("Action concourant au développement des compétences — article L.6313-1 du Code du Travail", {
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
  c.page.drawText(`Établi le ${fmtDate(input.generatedAt.toISOString())}`, {
    x: MARGIN + COL - 150, y: c.y, size: 9, font, color: COLOR_MUTED,
  });
  c = { ...c, y: c.y - 28 };

  // Texte de certification
  const orgName = input.organization.name;
  const rep = input.organization.representativeName;
  const learnerFullName = `${input.learner.firstName} ${input.learner.lastName}`;
  const intro = rep
    ? `Je soussigné(e) ${rep}, représentant légal de ${orgName}, certifie que :`
    : `${orgName} certifie que :`;
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

  c = drawText(c, font, "a réalisé l'action de formation suivante :", { size: 11 });
  c = { ...c, y: c.y - 14 };

  // Détails — durée RÉALISÉE en tête (modèle officiel)
  c = drawKeyValue(c, font, fontBold, 'Intitulé', input.formation.title);
  c = drawKeyValue(c, font, fontBold, 'Période', `du ${fmtDate(input.dossier.startDate)} au ${fmtDate(input.dossier.endDate)}`);
  c = drawKeyValue(c, font, fontBold, 'Durée réalisée', `${fmtHours(input.dossier.deliveredHours)} heures`);
  if (Math.round(input.dossier.plannedHours) !== Math.round(input.dossier.deliveredHours)) {
    c = drawKeyValue(c, font, fontBold, 'Durée prévue', `${fmtHours(input.dossier.plannedHours)} heures`);
  }
  c = drawKeyValue(c, font, fontBold, 'Modalité', modalityLabel(input.dossier.modality));
  c = drawKeyValue(c, font, fontBold, "Taux d'assiduité", `${Math.round(input.dossier.attendanceRate)} %`);
  c = { ...c, y: c.y - 18 };

  // Closing
  c = drawText(
    c, font,
    "Le présent certificat de réalisation est établi pour servir de justificatif d'exécution de l'action auprès du financeur. Il atteste de la réalisation effective de l'action de formation pour la durée mentionnée ci-dessus.",
    { size: 10, color: COLOR_MUTED },
  );
  c = { ...c, y: c.y - 30 };

  // Cadre signature auto (signature + cachet OF uniquement — pas d'apprenant)
  const sigAnchor = { x: MARGIN + COL - 240, y: c.y - 90, width: 240, height: 90 };
  await drawSignatureBlock(doc, c.page, { font, fontBold }, sigAnchor, {
    signaturePng: input.signaturePng,
    stampPng: input.stampPng,
    representativeName: input.organization.representativeName,
    representativeTitle: input.representativeTitle,
    place: input.place,
    date: input.generatedAt,
  });

  // Footer
  page.drawText(`${input.organization.name}  ·  ${input.dossier.reference}  ·  Certificat de réalisation Qualiopi`, {
    x: MARGIN, y: 24, size: 7, font, color: COLOR_MUTED,
  });

  return doc.save();
}
