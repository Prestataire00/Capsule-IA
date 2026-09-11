import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { MENTION_FRANCHISE, MENTION_PENALITES, formatEuros } from '@/features/trainer-space/billing-rules';

/**
 * PDF d'une facture d'honoraires émise par un formateur à un organisme.
 * Mentions obligatoires : identité et SIRET de l'émetteur et du client,
 * numéro, dates, désignation, HT, TVA ou mention de franchise, échéance,
 * pénalités de retard et indemnité forfaitaire de recouvrement.
 */

export type TrainerInvoicePdfInput = {
  readonly number: string;
  readonly issueDate: string; // AAAA-MM-JJ
  readonly dueDate: string | null;
  readonly issuer: {
    readonly legalName: string;
    readonly addressLines: readonly string[];
    readonly siret: string | null;
    readonly vatNumber: string | null;
    readonly email: string | null;
    readonly iban: string | null;
    readonly bic: string | null;
  };
  readonly client: { readonly name: string; readonly addressLines: readonly string[]; readonly siret: string | null };
  readonly lines: readonly { label: string; quantity: number; unit: string; unitPriceCents: number; totalCents: number }[];
  readonly vatRegime: 'franchise' | 'assujetti';
  readonly vatRate: number;
  readonly subtotalCents: number;
  readonly vatCents: number;
  readonly totalCents: number;
  readonly notes: string | null;
};

const A4 = { w: 595.28, h: 841.89 };
const M = 48;
const LARGEUR = A4.w - M * 2;
const TEXTE = rgb(0.094, 0.094, 0.106);
const DISCRET = rgb(0.42, 0.42, 0.45);
const FILET = rgb(0.89, 0.89, 0.91);
const ACCENT = rgb(0.976, 0.451, 0.086);

/** Polices standard (WinAnsi) : on retire ce qu'elles ne savent pas encoder (espaces fines du format français…). */
const sur = (t: string) =>
  t.replace(/[   ]/g, ' ').replace(/[^\x20-\x7E¡-ÿ‘’“”–—…€Œœ•]/g, '');

const dateFr = (iso: string) => {
  const [a, m, j] = iso.split('-');
  return a && m && j ? `${j}/${m}/${a}` : iso;
};

const quantite = (q: number) => q.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

function couper(texte: string, police: PDFFont, taille: number, largeur: number): string[] {
  const lignes: string[] = [];
  for (const paragraphe of sur(texte).split('\n')) {
    let courante = '';
    for (const mot of paragraphe.split(' ')) {
      const essai = courante ? `${courante} ${mot}` : mot;
      if (police.widthOfTextAtSize(essai, taille) <= largeur) courante = essai;
      else {
        if (courante) lignes.push(courante);
        courante = mot;
      }
    }
    lignes.push(courante);
  }
  return lignes;
}

export async function generateTrainerInvoicePdf(input: TrainerInvoicePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(sur(`Facture ${input.number}`));
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = doc.addPage([A4.w, A4.h]);
  let y = A4.h - M;

  const ecrire = (t: string, x: number, yy: number, o: { taille?: number; police?: PDFFont; couleur?: ReturnType<typeof rgb> } = {}) =>
    page.drawText(sur(t), { x, y: yy, size: o.taille ?? 10, font: o.police ?? normal, color: o.couleur ?? TEXTE });
  const aDroite = (t: string, xDroit: number, yy: number, o: { taille?: number; police?: PDFFont } = {}) => {
    const police = o.police ?? normal;
    const taille = o.taille ?? 10;
    ecrire(t, xDroit - police.widthOfTextAtSize(sur(t), taille), yy, { taille, police });
  };

  // Émetteur (gauche) et titre (droite).
  ecrire(input.issuer.legalName, M, y, { taille: 13, police: gras });
  let yg = y - 16;
  for (const l of [
    ...input.issuer.addressLines,
    input.issuer.siret ? `SIRET ${input.issuer.siret}` : '',
    input.issuer.vatNumber ? `TVA intracommunautaire ${input.issuer.vatNumber}` : '',
    input.issuer.email ?? '',
  ].filter(Boolean)) {
    ecrire(l, M, yg, { taille: 9, couleur: DISCRET });
    yg -= 12;
  }
  aDroite('FACTURE', A4.w - M, y, { taille: 20, police: gras });
  aDroite(`N° ${input.number}`, A4.w - M, y - 20, { police: gras });
  aDroite(`Date : ${dateFr(input.issueDate)}`, A4.w - M, y - 34);
  if (input.dueDate) aDroite(`Échéance : ${dateFr(input.dueDate)}`, A4.w - M, y - 48);

  // Client.
  y = Math.min(yg, y - 60) - 24;
  page.drawRectangle({ x: A4.w / 2, y: y - 64, width: A4.w / 2 - M, height: 76, borderColor: FILET, borderWidth: 1 });
  ecrire('Facturé à', A4.w / 2 + 10, y - 2, { taille: 8, couleur: DISCRET });
  ecrire(input.client.name, A4.w / 2 + 10, y - 16, { police: gras });
  let yc = y - 30;
  for (const l of [...input.client.addressLines, input.client.siret ? `SIRET ${input.client.siret}` : ''].filter(Boolean).slice(0, 3)) {
    ecrire(l, A4.w / 2 + 10, yc, { taille: 9, couleur: DISCRET });
    yc -= 12;
  }
  y -= 96;

  // Lignes.
  const cols = { qte: M + LARGEUR * 0.58, pu: M + LARGEUR * 0.8, total: A4.w - M };
  const entete = () => {
    page.drawRectangle({ x: M, y: y - 6, width: LARGEUR, height: 20, color: rgb(0.98, 0.98, 0.99) });
    ecrire('Désignation', M + 6, y, { taille: 9, police: gras });
    aDroite('Quantité', cols.qte, y, { taille: 9, police: gras });
    aDroite('P.U. HT', cols.pu, y, { taille: 9, police: gras });
    aDroite('Total HT', cols.total - 6, y, { taille: 9, police: gras });
    y -= 22;
  };
  entete();
  for (const l of input.lines) {
    const libelle = couper(l.label, normal, 9, LARGEUR * 0.5);
    if (y - libelle.length * 11 < M + 140) {
      page = doc.addPage([A4.w, A4.h]);
      y = A4.h - M;
      entete();
    }
    libelle.forEach((t, i) => ecrire(t, M + 6, y - i * 11, { taille: 9 }));
    aDroite(`${quantite(l.quantity)} ${l.unit}${l.quantity > 1 && l.unit !== 'forfait' ? 's' : ''}`, cols.qte, y, { taille: 9 });
    aDroite(formatEuros(l.unitPriceCents), cols.pu, y, { taille: 9 });
    aDroite(formatEuros(l.totalCents), cols.total - 6, y, { taille: 9 });
    y -= Math.max(1, libelle.length) * 11 + 8;
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: A4.w - M, y: y + 4 }, thickness: 0.5, color: FILET });
  }

  // Totaux.
  y -= 8;
  const ligneTotal = (lib: string, montant: string, fort = false) => {
    aDroite(lib, cols.pu, y, { police: fort ? gras : normal });
    aDroite(montant, cols.total - 6, y, { police: fort ? gras : normal });
    y -= 16;
  };
  ligneTotal('Total HT', formatEuros(input.subtotalCents));
  if (input.vatRegime === 'assujetti') ligneTotal(`TVA ${quantite(input.vatRate)} %`, formatEuros(input.vatCents));
  page.drawLine({ start: { x: cols.qte, y: y + 10 }, end: { x: A4.w - M, y: y + 10 }, thickness: 1, color: ACCENT });
  ligneTotal('Net à payer', formatEuros(input.totalCents), true);
  if (input.vatRegime === 'franchise') {
    aDroite(MENTION_FRANCHISE, A4.w - M, y, { taille: 8 });
    y -= 14;
  }

  // Notes, règlement, mentions.
  y -= 10;
  if (input.notes) {
    for (const t of couper(input.notes, normal, 9, LARGEUR)) {
      ecrire(t, M, y, { taille: 9 });
      y -= 12;
    }
    y -= 6;
  }
  ecrire('Règlement', M, y, { taille: 9, police: gras });
  y -= 12;
  const reglement = [
    input.dueDate ? `À régler au plus tard le ${dateFr(input.dueDate)}, par virement.` : 'À régler par virement.',
    input.issuer.iban ? `IBAN ${input.issuer.iban}${input.issuer.bic ? ` · BIC ${input.issuer.bic}` : ''}` : '',
  ].filter(Boolean);
  for (const t of reglement) {
    ecrire(t, M, y, { taille: 9 });
    y -= 12;
  }
  y -= 4;
  for (const t of couper(MENTION_PENALITES, normal, 7.5, LARGEUR)) {
    ecrire(t, M, y, { taille: 7.5, couleur: DISCRET });
    y -= 10;
  }

  return doc.save();
}
