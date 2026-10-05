import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { drawSignatureBlock, orgCachetLines } from './apply-org-signature';
import { BLANC, ouvrirDocument, VIOLET } from './charte-pdf';
import { drawRgpdMention } from './pdf-rgpd';
import { formaterSiren, formaterSiret, sirenDeSiret } from '@/shared/lib/siret';

export type InvoiceLine = {
  description: string;
  quantity: number;
  unitAmountCents: number;
  vatRate: number;
};

export type InvoiceInput = {
  organization: {
    name: string;
    siret: string | null;
    nda: string | null;
    /** L'organisme a opté pour le paiement de la TVA d'après les débits. */
    vatOnDebits?: boolean;
    address: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    certifications?: string | null;
  };
  recipient: {
    name: string;
    siret: string | null;
    address: string | null;
    /** Responsable de l'entreprise cliente à l'attention de qui la facture est adressée. */
    attention?: string | null;
  };
  signaturePng: Uint8Array | null;
  stampPng: Uint8Array | null;
  logoPng: Uint8Array | null;
  representativeName: string | null;
  representativeTitle: string | null;
  place: string | null;
  invoice: {
    reference: string;
    issuedAt: string | null; // YYYY-MM-DD
    dueAt: string | null;
    status: string;
    subtotalCents: number;
    vatCents: number;
    totalCents: number;
    currency: string;
    paymentTerms: string | null;
    dossierReference: string | null;
    /** invoice | deposit | balance | credit_note */
    kind?: string;
    /** Avoir : référence de la facture qu'il annule. */
    relatedReference?: string | null;
  };
  lines: InvoiceLine[];
  generatedAt: Date;
};

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const COL = A4.width - MARGIN * 2;
const COLOR_BODY = rgb(0.094, 0.094, 0.106);
const COLOR_MUTED = rgb(0.42, 0.42, 0.45);
const COLOR_RULE = rgb(0.89, 0.89, 0.91);
const COLOR_ACCENT = VIOLET;

type Cursor = { page: PDFPage; y: number };

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
};

/**
 * `Intl.NumberFormat('fr-FR')` sépare les milliers par une espace fine
 * insécable (U+202F) et précède l'euro d'une insécable (U+00A0). WinAnsi, le
 * jeu de caractères des polices standard de pdf-lib, n'encode ni l'une ni
 * l'autre : `drawText` lève « WinAnsi cannot encode ». Toute facture d'au
 * moins 1 000 € échouait donc à la génération. Les autres montants passaient,
 * d'où un bug qui ne se voyait que sur les grosses factures.
 */
const espacesEncodables = (s: string): string => s.replace(/[\u202f\u00a0]/g, ' ');

function fmtMoney(cents: number, currency: string): string {
  return espacesEncodables(new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100));
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

function ensureRoom(doc: PDFDocument, c: Cursor, neededHeight: number): Cursor {
  if (c.y - neededHeight < MARGIN + 30) {
    const page = doc.addPage([A4.width, A4.height]);
    return { page, y: A4.height - MARGIN };
  }
  return c;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'BROUILLON',
  issued: 'ÉMISE',
  paid: 'PAYÉE',
  overdue: 'EN RETARD',
  cancelled: 'ANNULÉE',
  partially_paid: 'PARTIELLEMENT PAYÉE',
};

export async function generateInvoicePDF(input: InvoiceInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([A4.width, A4.height]);
  let c: Cursor = { page, y: A4.height - MARGIN };

  // En-tête à la charte Capsule IA : bandeau violet (FACTURE, ACOMPTE ou AVOIR), logo.
  const title = input.invoice.kind === 'credit_note' ? 'Avoir' : input.invoice.kind === 'deposit' ? 'Acompte' : 'Facture';
  const statusLabel =
    input.invoice.kind === 'deposit'
      ? "Facture d'acompte"
      : input.invoice.kind === 'balance'
        ? 'Facture de solde'
        : (STATUS_LABEL[input.invoice.status] ?? input.invoice.status);
  const yTete = await ouvrirDocument(doc, page, { font, fontBold }, {
    titre: `${title} ${input.invoice.reference}`,
    sousTitre: [statusLabel, input.invoice.relatedReference ? `sur facture ${input.invoice.relatedReference}` : null].filter(Boolean).join(' · '),
    ligne: input.organization.name,
    logoPng: input.logoPng,
  });
  c = { ...c, y: yTete };
  const orgMeta = [
    input.organization.siret ? `SIRET ${input.organization.siret}` : null,
    input.organization.nda ? `NDA ${input.organization.nda}` : null,
  ].filter(Boolean).join('  ·  ');
  for (const l of [orgMeta, input.organization.address, [input.organization.contactEmail, input.organization.contactPhone].filter(Boolean).join('  ·  ')]) {
    if (!l) continue;
    c.page.drawText(l, { x: MARGIN, y: c.y, size: 8, font, color: COLOR_MUTED });
    c = { ...c, y: c.y - 10 };
  }
  c = { ...c, y: c.y - 18 };

  // Bloc référence / dates (gauche) + destinataire (droite)
  const blockY = c.y;
  c.page.drawText('RÉFÉRENCE', { x: MARGIN, y: blockY, size: 8, font: fontBold, color: COLOR_ACCENT });
  c.page.drawText(input.invoice.reference, { x: MARGIN, y: blockY - 14, size: 11, font: fontBold, color: COLOR_BODY });

  if (input.invoice.issuedAt) {
    c.page.drawText('DATE D\'ÉMISSION', { x: MARGIN, y: blockY - 36, size: 8, font: fontBold, color: COLOR_ACCENT });
    c.page.drawText(fmtDate(input.invoice.issuedAt), { x: MARGIN, y: blockY - 50, size: 10, font, color: COLOR_BODY });
  }
  if (input.invoice.dueAt) {
    c.page.drawText('ÉCHÉANCE', { x: MARGIN + 140, y: blockY - 36, size: 8, font: fontBold, color: COLOR_ACCENT });
    c.page.drawText(fmtDate(input.invoice.dueAt), { x: MARGIN + 140, y: blockY - 50, size: 10, font, color: COLOR_BODY });
  }
  if (input.invoice.dossierReference) {
    c.page.drawText('DOSSIER', { x: MARGIN, y: blockY - 72, size: 8, font: fontBold, color: COLOR_ACCENT });
    c.page.drawText(input.invoice.dossierReference, {
      x: MARGIN, y: blockY - 86, size: 10, font, color: COLOR_BODY,
    });
  }

  // Destinataire à droite
  const rightX = MARGIN + COL / 2 + 20;
  c.page.drawText('FACTURER À', { x: rightX, y: blockY, size: 8, font: fontBold, color: COLOR_ACCENT });
  c.page.drawText(input.recipient.name, { x: rightX, y: blockY - 14, size: 11, font: fontBold, color: COLOR_BODY });
  let recipY = blockY - 30;
  if (input.recipient.siret) {
    // Le SIREN du client est devenu une mention obligatoire (réforme de la
    // facturation électronique) : c'est par lui que l'administration rapproche
    // les flux. On l'affiche pour lui-même, le SIRET désignant l'établissement.
    const siren = formaterSiren(sirenDeSiret(input.recipient.siret));
    if (siren) {
      c.page.drawText(`SIREN ${siren}`, { x: rightX, y: recipY, size: 9, font, color: COLOR_BODY });
      recipY -= 12;
    }
    c.page.drawText(`SIRET ${formaterSiret(input.recipient.siret) ?? input.recipient.siret}`, {
      x: rightX, y: recipY, size: 9, font, color: COLOR_MUTED,
    });
    recipY -= 12;
  }
  if (input.recipient.attention) {
    c.page.drawText(`À l'attention de ${input.recipient.attention}`, { x: rightX, y: recipY, size: 9, font, color: COLOR_MUTED });
    recipY -= 12;
  }
  if (input.recipient.address) {
    const addrLines = wrapText(input.recipient.address, font, 9, COL / 2 - 20);
    for (const l of addrLines) {
      c.page.drawText(l, { x: rightX, y: recipY, size: 9, font, color: COLOR_MUTED });
      recipY -= 12;
    }
  }

  c = { ...c, y: blockY - 110 };

  // Table header
  c.page.drawRectangle({
    x: MARGIN, y: c.y - 18,
    width: COL, height: 22,
    color: VIOLET,
  });
  c.page.drawText('DÉSIGNATION', { x: MARGIN + 8, y: c.y - 12, size: 8, font: fontBold, color: BLANC });
  c.page.drawText('QTÉ', { x: MARGIN + COL - 240, y: c.y - 12, size: 8, font: fontBold, color: BLANC });
  c.page.drawText('PU HT', { x: MARGIN + COL - 180, y: c.y - 12, size: 8, font: fontBold, color: BLANC });
  c.page.drawText('TVA', { x: MARGIN + COL - 100, y: c.y - 12, size: 8, font: fontBold, color: BLANC });
  c.page.drawText('TOTAL HT', { x: MARGIN + COL - 60, y: c.y - 12, size: 8, font: fontBold, color: BLANC });
  c = { ...c, y: c.y - 22 };

  // Table rows
  for (const line of input.lines) {
    const descLines = wrapText(line.description, font, 10, COL - 280);
    const rowH = Math.max(20, descLines.length * 13 + 8);
    c = ensureRoom(doc, c, rowH);

    let descY = c.y - 6;
    for (const l of descLines) {
      c.page.drawText(l, { x: MARGIN + 8, y: descY, size: 10, font, color: COLOR_BODY });
      descY -= 13;
    }

    const qtyStr = line.quantity % 1 === 0 ? `${line.quantity}` : line.quantity.toFixed(2);
    c.page.drawText(qtyStr, { x: MARGIN + COL - 240, y: c.y - 6, size: 10, font, color: COLOR_BODY });
    c.page.drawText(fmtMoney(line.unitAmountCents, input.invoice.currency), {
      x: MARGIN + COL - 180, y: c.y - 6, size: 10, font, color: COLOR_BODY,
    });
    c.page.drawText(`${line.vatRate}%`, { x: MARGIN + COL - 100, y: c.y - 6, size: 10, font, color: COLOR_BODY });
    const lineTotal = Math.round(line.quantity * line.unitAmountCents);
    c.page.drawText(fmtMoney(lineTotal, input.invoice.currency), {
      x: MARGIN + COL - 60, y: c.y - 6, size: 10, font: fontBold, color: COLOR_BODY,
    });

    c = { ...c, y: c.y - rowH };
    c.page.drawLine({
      start: { x: MARGIN, y: c.y },
      end: { x: MARGIN + COL, y: c.y },
      thickness: 0.3,
      color: COLOR_RULE,
    });
  }

  c = { ...c, y: c.y - 16 };

  // Totaux
  const totalsX = MARGIN + COL - 160;
  c.page.drawText('Sous-total HT', { x: totalsX, y: c.y, size: 10, font, color: COLOR_MUTED });
  c.page.drawText(fmtMoney(input.invoice.subtotalCents, input.invoice.currency), {
    x: MARGIN + COL - 60, y: c.y, size: 10, font, color: COLOR_BODY,
  });
  c = { ...c, y: c.y - 16 };
  c.page.drawText('TVA', { x: totalsX, y: c.y, size: 10, font, color: COLOR_MUTED });
  c.page.drawText(fmtMoney(input.invoice.vatCents, input.invoice.currency), {
    x: MARGIN + COL - 60, y: c.y, size: 10, font, color: COLOR_BODY,
  });
  c = { ...c, y: c.y - 6 };
  c.page.drawLine({
    start: { x: totalsX, y: c.y },
    end: { x: MARGIN + COL, y: c.y },
    thickness: 0.5,
    color: COLOR_RULE,
  });
  c = { ...c, y: c.y - 16 };
  c.page.drawText('Total TTC', { x: totalsX, y: c.y, size: 12, font: fontBold, color: COLOR_BODY });
  c.page.drawText(fmtMoney(input.invoice.totalCents, input.invoice.currency), {
    x: MARGIN + COL - 60, y: c.y, size: 12, font: fontBold, color: COLOR_ACCENT,
  });

  c = { ...c, y: c.y - 40 };

  // Nature de l'opération : mention devenue obligatoire. Pour un organisme de
  // formation elle ne varie pas — ce qu'il vend est une prestation de services.
  c = ensureRoom(doc, c, 24);
  c.page.drawText('Nature de l’opération : prestation de services', {
    x: MARGIN, y: c.y, size: 8, font, color: COLOR_MUTED,
  });
  c = { ...c, y: c.y - 14 };

  // Option pour les débits : obligatoire sur la facture quand l'organisme l'a
  // prise (la TVA est alors exigible à la facturation, non à l'encaissement).
  if (input.organization.vatOnDebits) {
    c = ensureRoom(doc, c, 24);
    c.page.drawText('Option pour le paiement de la taxe d’après les débits', {
      x: MARGIN, y: c.y, size: 8, font, color: COLOR_MUTED,
    });
    c = { ...c, y: c.y - 14 };
  }

  // Mention TVA (formation pro souvent exonérée)
  if (input.invoice.vatCents === 0) {
    c = ensureRoom(doc, c, 24);
    c.page.drawText("TVA non applicable, article 261-4-4° a du CGI", {
      x: MARGIN, y: c.y, size: 8, font, color: COLOR_MUTED,
    });
    c = { ...c, y: c.y - 14 };
  }

  // Paiement terms
  if (input.invoice.paymentTerms) {
    c = ensureRoom(doc, c, 24);
    c.page.drawText('CONDITIONS DE PAIEMENT', { x: MARGIN, y: c.y, size: 8, font: fontBold, color: COLOR_MUTED });
    c = { ...c, y: c.y - 12 };
    const paymentLines = wrapText(input.invoice.paymentTerms, font, 10, COL);
    for (const l of paymentLines) {
      c = ensureRoom(doc, c, 14);
      c.page.drawText(l, { x: MARGIN, y: c.y, size: 10, font, color: COLOR_BODY });
      c = { ...c, y: c.y - 14 };
    }
  }

  // Cadre signature auto (signature + cachet OF apposés), en bas à droite
  c = ensureRoom(doc, c, 110);
  c = { ...c, y: c.y - 12 };
  const sigAnchor = { x: MARGIN + COL - 240, y: c.y - 90, width: 240, height: 90 };
  await drawSignatureBlock(doc, c.page, { font, fontBold }, sigAnchor, {
    signaturePng: input.signaturePng,
    stampPng: input.stampPng,
    stampText: input.stampPng ? null : orgCachetLines(input.organization),
    representativeName: input.representativeName,
    representativeTitle: input.representativeTitle,
    place: input.place,
    date: input.generatedAt,
  });

  // Footer
  const pages = doc.getPages();
  pages.forEach((p, idx) => {
    p.drawText(`${input.organization.name}  ·  ${input.invoice.reference}  ·  Page ${idx + 1}/${pages.length}`, {
      x: MARGIN, y: 24, size: 7, font, color: COLOR_MUTED,
    });
  });

  drawRgpdMention(doc, font, input.organization.contactEmail);

  return doc.save();
}
