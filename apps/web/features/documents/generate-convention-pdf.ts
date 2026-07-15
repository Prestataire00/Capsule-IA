import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { drawSignatureBlock, orgCachetLines } from './apply-org-signature';
import { drawOrgLogo } from './pdf-logo';

export type ConventionInput = {
  organization: {
    name: string;
    siret: string | null;
    nda: string | null; // numéro de déclaration d'activité
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
    address: string | null;
  };
  company: {
    name: string;
    siret: string | null;
    address: string | null;
  } | null;
  funder: {
    /** Nom du financeur, ou « Entreprise / apprenant » pour le reste à charge. */
    name: string;
    /** Libellé du mode de financement (CPF, Autofinancement, Reste à charge…). */
    modeLabel: string;
    /** Montant pris en charge par ce financeur (centimes), si connu. */
    amountCents: number | null;
    /** N° de dossier externe (ex. dossier CPF), si présent. */
    externalFileNumber: string | null;
  } | null;
  formation: {
    title: string;
    description: string | null;
    objectives: string[];
    targetAudience: string | null;
    prerequisites: string[];
    evaluationMethod: string | null;
    pedagogicalMethod: string | null;
  };
  dossier: {
    reference: string;
    startDate: string;
    endDate: string;
    totalHours: number;
    modality: string;
    modalities?: string[];
    totalAmountCents: number | null;
    currency: string;
    accessibilityNotes: string | null;
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

const fmtEuros = (cents: number | null, currency: string): string => {
  if (cents == null) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);
};

const modalityLabel = (m: string): string =>
  ({ presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' } as Record<string, string>)[m] ?? m;

function ensureRoom(doc: PDFDocument, c: Cursor, neededHeight: number): Cursor {
  if (c.y - neededHeight < MARGIN) {
    const page = doc.addPage([A4.width, A4.height]);
    return { page, y: A4.height - MARGIN };
  }
  return c;
}

function drawLabel(c: Cursor, font: PDFFont, label: string): Cursor {
  c.page.drawText(label.toUpperCase(), {
    x: MARGIN,
    y: c.y,
    size: 8,
    font,
    color: COLOR_MUTED,
  });
  return { ...c, y: c.y - 12 };
}

function drawHeading(doc: PDFDocument, c: Cursor, fontBold: PDFFont, text: string): Cursor {
  const out = ensureRoom(doc, c, 30);
  out.page.drawText(text, { x: MARGIN, y: out.y, size: 13, font: fontBold, color: COLOR_BODY });
  out.page.drawLine({
    start: { x: MARGIN, y: out.y - 6 },
    end: { x: MARGIN + COL, y: out.y - 6 },
    thickness: 0.5,
    color: COLOR_RULE,
  });
  return { ...out, y: out.y - 18 };
}

function drawText(doc: PDFDocument, c: Cursor, font: PDFFont, text: string, opts: { size?: number; color?: ReturnType<typeof rgb>; maxWidth?: number } = {}): Cursor {
  const size = opts.size ?? 10;
  const maxWidth = opts.maxWidth ?? COL;
  const color = opts.color ?? COLOR_BODY;
  const lines = wrapText(text, font, size, maxWidth);
  let cursor = ensureRoom(doc, c, lines.length * (size + 4));
  for (const line of lines) {
    cursor.page.drawText(line, { x: MARGIN, y: cursor.y, size, font, color });
    cursor = { ...cursor, y: cursor.y - (size + 4) };
  }
  return cursor;
}

function drawKeyValue(doc: PDFDocument, c: Cursor, font: PDFFont, fontBold: PDFFont, key: string, value: string): Cursor {
  const cursor = ensureRoom(doc, c, 16);
  cursor.page.drawText(key, { x: MARGIN, y: cursor.y, size: 9, font, color: COLOR_MUTED });
  const lines = wrapText(value, fontBold, 10, COL - 140);
  cursor.page.drawText(lines[0] ?? '—', { x: MARGIN + 140, y: cursor.y, size: 10, font: fontBold, color: COLOR_BODY });
  let y = cursor.y - 14;
  for (let i = 1; i < lines.length; i++) {
    const c2 = ensureRoom(doc, { page: cursor.page, y }, 14);
    c2.page.drawText(lines[i] ?? '', { x: MARGIN + 140, y: c2.y, size: 10, font: fontBold, color: COLOR_BODY });
    y = c2.y - 14;
  }
  return { page: cursor.page, y };
}

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

export async function generateConventionPDF(input: ConventionInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([A4.width, A4.height]);
  let c: Cursor = { page, y: A4.height - MARGIN };

  // Logo de l'organisme — coin supérieur droit
  await drawOrgLogo(doc, page, input.logoPng, { right: MARGIN + COL, top: A4.height - MARGIN + 6, maxW: 150, maxH: 48 });

  // Header
  c.page.drawRectangle({ x: MARGIN, y: c.y - 4, width: 32, height: 4, color: COLOR_ACCENT });
  c = { ...c, y: c.y - 24 };
  c.page.drawText('CONVENTION DE FORMATION PROFESSIONNELLE', {
    x: MARGIN, y: c.y, size: 14, font: fontBold, color: COLOR_BODY,
  });
  c = { ...c, y: c.y - 14 };
  c.page.drawText('Article L.6353-1 et suivants du Code du Travail', {
    x: MARGIN, y: c.y, size: 8, font, color: COLOR_MUTED,
  });
  c = { ...c, y: c.y - 18 };
  c.page.drawText(`Référence : ${input.dossier.reference}`, {
    x: MARGIN, y: c.y, size: 9, font, color: COLOR_BODY,
  });
  c.page.drawText(`Généré le ${fmtDate(input.generatedAt.toISOString())}`, {
    x: MARGIN + COL - 150, y: c.y, size: 9, font, color: COLOR_MUTED,
  });
  c = { ...c, y: c.y - 24 };

  // Section 1 — Organisme de formation
  c = drawHeading(doc, c, fontBold, '1. Organisme de formation');
  c = drawKeyValue(doc, c, font, fontBold, 'Raison sociale', input.organization.name);
  if (input.organization.siret) c = drawKeyValue(doc, c, font, fontBold, 'SIRET', input.organization.siret);
  if (input.organization.nda) c = drawKeyValue(doc, c, font, fontBold, 'N° déclaration activité', input.organization.nda);
  if (input.organization.address) c = drawKeyValue(doc, c, font, fontBold, 'Adresse', input.organization.address);
  if (input.organization.representativeName) c = drawKeyValue(doc, c, font, fontBold, 'Représenté par', input.organization.representativeName);
  c = { ...c, y: c.y - 12 };

  // Section 2 — Bénéficiaire
  c = drawHeading(doc, c, fontBold, '2. Bénéficiaire de la formation');
  c = drawKeyValue(doc, c, font, fontBold, 'Nom', `${input.learner.firstName} ${input.learner.lastName}`);
  c = drawKeyValue(doc, c, font, fontBold, 'Email', input.learner.email);
  if (input.learner.birthDate) c = drawKeyValue(doc, c, font, fontBold, 'Date de naissance', fmtDate(input.learner.birthDate));
  if (input.learner.address) c = drawKeyValue(doc, c, font, fontBold, 'Adresse', input.learner.address);
  if (input.company) {
    c = drawKeyValue(doc, c, font, fontBold, 'Entreprise', input.company.name);
    if (input.company.siret) c = drawKeyValue(doc, c, font, fontBold, 'SIRET entreprise', input.company.siret);
  }
  if (input.funder) c = drawKeyValue(doc, c, font, fontBold, 'Financeur', `${input.funder.name} (${input.funder.modeLabel})`);
  c = { ...c, y: c.y - 12 };

  // Section 3 — Formation
  c = drawHeading(doc, c, fontBold, '3. Action de formation');
  c = drawKeyValue(doc, c, font, fontBold, 'Intitulé', input.formation.title);
  c = drawKeyValue(doc, c, font, fontBold, 'Période', `du ${fmtDate(input.dossier.startDate)} au ${fmtDate(input.dossier.endDate)}`);
  c = drawKeyValue(doc, c, font, fontBold, 'Durée totale', `${input.dossier.totalHours} heures`);
  const modalitiesText =
    input.dossier.modalities && input.dossier.modalities.length > 1
      ? input.dossier.modalities.map(modalityLabel).join(', ')
      : modalityLabel(input.dossier.modality);
  c = drawKeyValue(doc, c, font, fontBold, 'Modalité', modalitiesText);
  c = drawKeyValue(doc, c, font, fontBold, 'Montant total', fmtEuros(input.dossier.totalAmountCents, input.dossier.currency));
  if (input.funder) {
    c = drawKeyValue(doc, c, font, fontBold, 'Mode de financement', input.funder.modeLabel);
    c = drawKeyValue(doc, c, font, fontBold, 'Montant pris en charge', fmtEuros(input.funder.amountCents, input.dossier.currency));
    if (input.funder.externalFileNumber) {
      c = drawKeyValue(doc, c, font, fontBold, 'N° de dossier', input.funder.externalFileNumber);
    }
  }
  c = { ...c, y: c.y - 8 };

  if (input.formation.objectives.length > 0) {
    c = drawLabel(c, font, 'Objectifs pédagogiques');
    for (const obj of input.formation.objectives) {
      c = drawText(doc, c, font, `• ${obj}`, { size: 10 });
    }
    c = { ...c, y: c.y - 4 };
  }
  if (input.formation.targetAudience) {
    c = drawLabel(c, font, 'Public cible');
    c = drawText(doc, c, font, input.formation.targetAudience);
    c = { ...c, y: c.y - 4 };
  }
  if (input.formation.prerequisites.length > 0) {
    c = drawLabel(c, font, 'Prérequis');
    for (const p of input.formation.prerequisites) {
      c = drawText(doc, c, font, `• ${p}`, { size: 10 });
    }
    c = { ...c, y: c.y - 4 };
  }
  if (input.formation.pedagogicalMethod) {
    c = drawLabel(c, font, 'Méthodes pédagogiques');
    c = drawText(doc, c, font, input.formation.pedagogicalMethod);
    c = { ...c, y: c.y - 4 };
  }
  if (input.formation.evaluationMethod) {
    c = drawLabel(c, font, "Modalités d'évaluation");
    c = drawText(doc, c, font, input.formation.evaluationMethod);
    c = { ...c, y: c.y - 4 };
  }

  // Section 4 — Accessibilité
  c = drawHeading(doc, c, fontBold, '4. Accessibilité (Qualiopi indicateur 26)');
  c = drawText(
    doc, c, font,
    input.dossier.accessibilityNotes
      ?? "L'organisme s'engage à étudier toute demande d'aménagement liée à une situation de handicap. Contactez la référente handicap pour toute adaptation nécessaire.",
    { size: 10 },
  );
  c = { ...c, y: c.y - 16 };

  // Section 5 — Signatures
  c = ensureRoom(doc, c, 120);
  c = drawHeading(doc, c, fontBold, '5. Signatures des parties');
  c = { ...c, y: c.y - 24 };

  const colW = (COL - 24) / 2;
  c.page.drawRectangle({ x: MARGIN, y: c.y - 80, width: colW, height: 80, borderColor: COLOR_RULE, borderWidth: 0.5 });
  c.page.drawRectangle({ x: MARGIN + colW + 24, y: c.y - 80, width: colW, height: 80, borderColor: COLOR_RULE, borderWidth: 0.5 });
  c.page.drawText('Le bénéficiaire', { x: MARGIN + colW + 32, y: c.y - 12, size: 8, font: fontBold, color: COLOR_MUTED });
  c.page.drawText(`${input.learner.firstName} ${input.learner.lastName}`, {
    x: MARGIN + colW + 32, y: c.y - 70, size: 8, font, color: COLOR_BODY,
  });

  // Colonne organisme : signature + cachet OF apposés automatiquement
  const sigAnchor = { x: MARGIN, y: c.y - 80, width: colW, height: 80 };
  await drawSignatureBlock(doc, c.page, { font, fontBold }, sigAnchor, {
    signaturePng: input.signaturePng,
    stampPng: input.stampPng,
    stampText: input.stampPng ? null : orgCachetLines(input.organization),
    representativeName: input.organization.representativeName,
    representativeTitle: input.representativeTitle,
    place: input.place,
    date: input.generatedAt,
  });

  // Footer pied de page
  const pages = doc.getPages();
  pages.forEach((p, idx) => {
    p.drawText(`Page ${idx + 1} / ${pages.length}  ·  ${input.organization.name}  ·  ${input.dossier.reference}`, {
      x: MARGIN, y: 24, size: 7, font, color: COLOR_MUTED,
    });
  });

  return doc.save();
}
