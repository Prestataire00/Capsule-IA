import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { drawOrgLogo } from './pdf-logo';

export type BpfFinancialLine = { code: string; label: string; cents: number };
export type BpfBreakdownRow = { key: string; label: string; stagiaires: number; heures: number };
export type BpfNsfRow = { code: string; label: string; heures: number };
export type BpfChargesInput = {
  totalCents: number;
  salairesFormateursCents: number;
  achatsFormationCents: number;
  sousTraitanceConfieeCents: number;
  sousTraitanceConfieeHeures: number;
  autresCents: number;
};

export type BpfInput = {
  year: number;
  organization: {
    name: string;
    legalName: string | null;
    siret: string | null;
    nda: string | null; // numéro de déclaration d'activité
    address: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  logoPng: Uint8Array | null;
  financial: { lines: BpfFinancialLine[]; totalCents: number };
  pedago: { stagiaires: number; heures: number; actions: number; dossiers: number };
  formateurs: { internes: number; externes: number; total: number };
  byCategory: BpfBreakdownRow[];
  byActionType: BpfBreakdownRow[];
  byNsf: BpfNsfRow[];
  charges: BpfChargesInput;
  generatedAt: Date;
};

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const COL = A4.width - MARGIN * 2;
const COLOR_BODY = rgb(0.094, 0.094, 0.106);
const COLOR_MUTED = rgb(0.42, 0.42, 0.45);
const COLOR_RULE = rgb(0.82, 0.82, 0.85);
const COLOR_ACCENT = rgb(0.486, 0.227, 0.929);
const COLOR_CADRE_BG = rgb(0.93, 0.91, 0.99);

type Cursor = { page: PDFPage; y: number };

// pdf-lib (WinAnsi) ne sait pas encoder les espaces fines insécables (U+202F/U+00A0)
// insérées par Intl fr-FR ; on les remplace par une espace normale.
function ascii(s: string): string {
  return s.replace(/[\u202f\u00a0]/g, ' ');
}

function fmtMoney(cents: number): string {
  return ascii(new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100));
}

function fmtNum(n: number): string {
  return ascii(new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n));
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
}

function ensureRoom(doc: PDFDocument, c: Cursor, neededHeight: number): Cursor {
  if (c.y - neededHeight < MARGIN + 40) {
    const page = doc.addPage([A4.width, A4.height]);
    return { page, y: A4.height - MARGIN };
  }
  return c;
}

/** En-tête d'un cadre officiel (bande grisée avec lettre + intitulé). */
function drawCadre(c: Cursor, fontBold: PDFFont, letter: string, title: string): Cursor {
  const h = 20;
  c.page.drawRectangle({ x: MARGIN, y: c.y - h + 4, width: COL, height: h, color: COLOR_CADRE_BG });
  c.page.drawRectangle({ x: MARGIN, y: c.y - h + 4, width: 3, height: h, color: COLOR_ACCENT });
  c.page.drawText(`CADRE ${letter}`, { x: MARGIN + 10, y: c.y - 9, size: 8.5, font: fontBold, color: COLOR_ACCENT });
  c.page.drawText(title, { x: MARGIN + 72, y: c.y - 9, size: 9.5, font: fontBold, color: COLOR_BODY });
  return { ...c, y: c.y - h - 6 };
}

/** Ligne « libellé …………… valeur » (label gauche, valeur droite). */
function drawField(c: Cursor, font: PDFFont, fontBold: PDFFont, label: string, value: string): Cursor {
  c.page.drawText(label, { x: MARGIN + 8, y: c.y, size: 9, font, color: COLOR_MUTED });
  const w = fontBold.widthOfTextAtSize(value, 9.5);
  c.page.drawText(value, { x: MARGIN + COL - 8 - w, y: c.y, size: 9.5, font: fontBold, color: COLOR_BODY });
  return { ...c, y: c.y - 15 };
}

/** Ligne d'un tableau chiffré (code, libellé, montant à droite). */
function drawMoneyRow(
  c: Cursor,
  font: PDFFont,
  fontBold: PDFFont,
  code: string,
  label: string,
  value: string,
  opts?: { bold?: boolean; bg?: boolean },
): Cursor {
  const rowH = 17;
  if (opts?.bg) {
    c.page.drawRectangle({ x: MARGIN, y: c.y - 5, width: COL, height: rowH, color: rgb(0.97, 0.97, 0.985) });
  }
  const f = opts?.bold ? fontBold : font;
  if (code) c.page.drawText(code, { x: MARGIN + 8, y: c.y, size: 7.5, font, color: COLOR_MUTED });
  c.page.drawText(label, { x: MARGIN + 42, y: c.y, size: 9, font: f, color: COLOR_BODY });
  const vColor = opts?.bold ? COLOR_ACCENT : COLOR_BODY;
  const w = (opts?.bold ? fontBold : font).widthOfTextAtSize(value, 9.5);
  c.page.drawText(value, { x: MARGIN + COL - 8 - w, y: c.y, size: 9.5, font: opts?.bold ? fontBold : font, color: vColor });
  c.page.drawLine({ start: { x: MARGIN, y: c.y - 5 }, end: { x: MARGIN + COL, y: c.y - 5 }, thickness: 0.3, color: COLOR_RULE });
  return { ...c, y: c.y - rowH };
}

/** Sous-titre de section à l'intérieur d'un cadre. */
function drawSubhead(c: Cursor, fontBold: PDFFont, text: string): Cursor {
  c.page.drawText(text, { x: MARGIN + 8, y: c.y, size: 8.5, font: fontBold, color: COLOR_MUTED });
  return { ...c, y: c.y - 15 };
}

/** En-tête des colonnes « Stagiaires » / « Heures ». */
function drawCountHeader(c: Cursor, font: PDFFont): Cursor {
  const s = 'Stagiaires';
  const h = 'Heures';
  c.page.drawText(s, { x: MARGIN + COL - 150 - font.widthOfTextAtSize(s, 7), y: c.y, size: 7, font, color: COLOR_MUTED });
  c.page.drawText(h, { x: MARGIN + COL - 8 - font.widthOfTextAtSize(h, 7), y: c.y, size: 7, font, color: COLOR_MUTED });
  return { ...c, y: c.y - 12 };
}

/** Ligne « libellé | stagiaires | heures ». */
function drawCountRow(c: Cursor, font: PDFFont, label: string, stagiaires: string, heures: string): Cursor {
  const rowH = 15;
  c.page.drawText(label, { x: MARGIN + 12, y: c.y, size: 8.5, font, color: COLOR_BODY });
  c.page.drawText(stagiaires, { x: MARGIN + COL - 150 - font.widthOfTextAtSize(stagiaires, 8.5), y: c.y, size: 8.5, font, color: COLOR_BODY });
  c.page.drawText(heures, { x: MARGIN + COL - 8 - font.widthOfTextAtSize(heures, 8.5), y: c.y, size: 8.5, font, color: COLOR_BODY });
  c.page.drawLine({ start: { x: MARGIN, y: c.y - 4 }, end: { x: MARGIN + COL, y: c.y - 4 }, thickness: 0.25, color: COLOR_RULE });
  return { ...c, y: c.y - rowH };
}

/**
 * Génère le PDF du Bilan Pédagogique et Financier au format administratif
 * Cerfa n° 10443*17 (document officiel auto-rempli à partir des données du CRM).
 */
export async function generateBpfPDF(input: BpfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([A4.width, A4.height]);
  let c: Cursor = { page, y: A4.height - MARGIN };

  await drawOrgLogo(doc, page, input.logoPng, { right: MARGIN + COL, top: A4.height - MARGIN + 6, maxW: 130, maxH: 44 });

  // Titre officiel
  c.page.drawRectangle({ x: MARGIN, y: c.y - 4, width: 32, height: 4, color: COLOR_ACCENT });
  c = { ...c, y: c.y - 24 };
  c.page.drawText('BILAN PÉDAGOGIQUE ET FINANCIER', { x: MARGIN, y: c.y, size: 16, font: fontBold, color: COLOR_BODY });
  c = { ...c, y: c.y - 16 };
  c.page.drawText(`Cerfa n° 10443*17  ·  Prestataire de formation professionnelle  ·  Année ${input.year}`, {
    x: MARGIN, y: c.y, size: 9, font, color: COLOR_MUTED,
  });
  c = { ...c, y: c.y - 12 };
  c.page.drawText('Article L.6352-11 du Code du travail — à télédéclarer avant le 30 avril', {
    x: MARGIN, y: c.y, size: 8, font, color: COLOR_MUTED,
  });
  c = { ...c, y: c.y - 20 };
  c.page.drawLine({ start: { x: MARGIN, y: c.y }, end: { x: MARGIN + COL, y: c.y }, thickness: 0.6, color: COLOR_RULE });
  c = { ...c, y: c.y - 22 };

  // CADRE A — Identification du déclarant
  c = drawCadre(c, fontBold, 'A', 'Identification du déclarant');
  c = drawField(c, font, fontBold, 'Dénomination / raison sociale', input.organization.name);
  if (input.organization.legalName && input.organization.legalName !== input.organization.name) {
    c = drawField(c, font, fontBold, 'Dénomination légale', input.organization.legalName);
  }
  c = drawField(c, font, fontBold, 'N° SIRET', input.organization.siret ?? '—');
  c = drawField(c, font, fontBold, "N° de déclaration d'activité (NDA)", input.organization.nda ?? '—');
  c = drawField(c, font, fontBold, 'Adresse', input.organization.address ?? '—');
  const contact = [input.organization.contactEmail, input.organization.contactPhone].filter(Boolean).join('  ·  ');
  if (contact) c = drawField(c, font, fontBold, 'Contact', contact);
  c = { ...c, y: c.y - 10 };

  // CADRE B — Bilan financier (origine des produits, HT)
  c = ensureRoom(doc, c, 40 + input.financial.lines.length * 17 + 30);
  c = drawCadre(c, fontBold, 'B', "Bilan financier — origine des produits de l'organisme (hors taxes)");
  for (const l of input.financial.lines) {
    c = ensureRoom(doc, c, 20);
    c = drawMoneyRow(c, font, fontBold, l.code, l.label, fmtMoney(l.cents));
  }
  c = drawMoneyRow(c, font, fontBold, '', 'TOTAL DES PRODUITS', fmtMoney(input.financial.totalCents), { bold: true, bg: true });
  c = { ...c, y: c.y - 12 };

  // CADRE B (suite) — Charges de l'organisme
  c = ensureRoom(doc, c, 40 + 5 * 17);
  c = drawSubhead(c, fontBold, "Charges de l'organisme (hors taxes)");
  c = drawMoneyRow(c, font, fontBold, '', 'Total des charges', fmtMoney(input.charges.totalCents), { bold: true, bg: true });
  c = drawMoneyRow(c, font, fontBold, '', 'dont rémunération des formateurs', fmtMoney(input.charges.salairesFormateursCents));
  c = drawMoneyRow(c, font, fontBold, '', 'dont achats de prestations de formation', fmtMoney(input.charges.achatsFormationCents));
  c = drawMoneyRow(c, font, fontBold, '', `dont sous-traitance confiée à d'autres OF (${fmtNum(input.charges.sousTraitanceConfieeHeures)} h)`, fmtMoney(input.charges.sousTraitanceConfieeCents));
  if (input.charges.autresCents > 0) {
    c = drawMoneyRow(c, font, fontBold, '', 'dont autres charges', fmtMoney(input.charges.autresCents));
  }
  c = { ...c, y: c.y - 12 };

  // CADRE C — Bilan pédagogique
  c = ensureRoom(doc, c, 40 + 4 * 17);
  c = drawCadre(c, fontBold, 'C', 'Bilan pédagogique — activité de formation');
  c = drawMoneyRow(c, font, fontBold, 'C-1', 'Nombre de stagiaires', fmtNum(input.pedago.stagiaires));
  c = drawMoneyRow(c, font, fontBold, 'C-2', "Nombre total d'heures-stagiaires", `${fmtNum(input.pedago.heures)} h`);
  c = drawMoneyRow(c, font, fontBold, 'C-3', "Nombre d'actions de formation (formations distinctes)", fmtNum(input.pedago.actions));
  c = drawMoneyRow(c, font, fontBold, 'C-4', 'Nombre de dossiers de formation', fmtNum(input.pedago.dossiers));
  c = { ...c, y: c.y - 6 };

  // Répartition par catégorie de stagiaire
  if (input.byCategory.length > 0) {
    c = ensureRoom(doc, c, 40 + input.byCategory.length * 15);
    c = drawSubhead(c, fontBold, 'Répartition par catégorie de stagiaire');
    c = drawCountHeader(c, font);
    for (const r of input.byCategory) {
      c = ensureRoom(doc, c, 16);
      c = drawCountRow(c, font, r.label, fmtNum(r.stagiaires), `${fmtNum(r.heures)} h`);
    }
    c = { ...c, y: c.y - 8 };
  }

  // Répartition par type d'action
  if (input.byActionType.length > 0) {
    c = ensureRoom(doc, c, 40 + input.byActionType.length * 15);
    c = drawSubhead(c, fontBold, "Répartition par type d'action");
    c = drawCountHeader(c, font);
    for (const r of input.byActionType) {
      c = ensureRoom(doc, c, 16);
      c = drawCountRow(c, font, r.label, fmtNum(r.stagiaires), `${fmtNum(r.heures)} h`);
    }
    c = { ...c, y: c.y - 8 };
  }

  // Heures-stagiaires par spécialité de formation (NSF)
  if (input.byNsf.length > 0) {
    c = ensureRoom(doc, c, 40 + input.byNsf.length * 17);
    c = drawSubhead(c, fontBold, 'Heures-stagiaires par spécialité de formation (NSF)');
    for (const r of input.byNsf) {
      c = ensureRoom(doc, c, 20);
      c = drawMoneyRow(c, font, fontBold, '', r.label, `${fmtNum(r.heures)} h`);
    }
  }
  c = { ...c, y: c.y - 12 };

  // CADRE D — Personnes dispensant les formations
  c = ensureRoom(doc, c, 40 + 3 * 17);
  c = drawCadre(c, fontBold, 'D', 'Personnes dispensant les heures de formation');
  c = drawMoneyRow(c, font, fontBold, 'D-1', 'Formateurs internes (salariés de l\'organisme)', fmtNum(input.formateurs.internes));
  c = drawMoneyRow(c, font, fontBold, 'D-2', 'Formateurs externes (sous-traitance / vacataires)', fmtNum(input.formateurs.externes));
  c = drawMoneyRow(c, font, fontBold, '', 'TOTAL des personnes intervenues', fmtNum(input.formateurs.total), { bold: true, bg: true });
  c = { ...c, y: c.y - 18 };

  // Mentions légales / avertissement
  c = ensureRoom(doc, c, 70);
  const notes = [
    "Document généré automatiquement à partir des factures, dossiers, formateurs et dépenses de l'année.",
    "Catégories de stagiaires et types d'action auto-déterminés (financeur, statut, formation) — à vérifier.",
    'La télédéclaration s\'effectue en ligne sur « Mon Activité Formation » (portail EFP Connect),',
    'auprès de la DREETS territorialement compétente.',
  ];
  for (const n of notes) {
    c.page.drawText(n, { x: MARGIN, y: c.y, size: 7.5, font, color: COLOR_MUTED });
    c = { ...c, y: c.y - 10 };
  }

  // Footer
  const generatedLabel = `Édité le ${fmtDate(input.generatedAt)}`;
  const pages = doc.getPages();
  pages.forEach((p, idx) => {
    p.drawText(`${input.organization.name}  ·  BPF ${input.year}  ·  ${generatedLabel}  ·  Page ${idx + 1}/${pages.length}`, {
      x: MARGIN, y: 24, size: 7, font, color: COLOR_MUTED,
    });
  });

  return doc.save();
}
