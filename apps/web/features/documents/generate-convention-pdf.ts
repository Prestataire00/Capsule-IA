import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { drawSignatureBlock, orgCachetLines } from './apply-org-signature';
import { drawOrgLogo } from './pdf-logo';
import { drawRgpdMention } from './pdf-rgpd';
import { richTextBlocks, richTextToPlain } from './rich-text';

export type ConventionInput = {
  organization: {
    name: string;
    siret: string | null;
    nda: string | null; // numéro de déclaration d'activité
    address: string | null;
    representativeName: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    certifications?: string | null;
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
  /**
   * Convention groupée : les salariés d'une même entreprise inscrits à une même
   * séance figurent tous sur UNE convention, au lieu d'une chacun. Absent ou
   * réduit à une personne, le document garde sa forme individuelle.
   */
  participants?: ReadonlyArray<{
    firstName: string;
    lastName: string;
    email: string;
    birthDate: string | null;
  }>;
  company: {
    name: string;
    siret: string | null;
    address: string | null;
    /** Responsable qui signe pour l'entreprise cliente. */
    representative?: string | null;
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
  /**
   * « contrat » : particulier qui finance lui-même sa formation — contrat de
   * formation professionnelle (art. L.6353-3 à L.6353-7), avec délai de
   * rétractation. « convention » (défaut) : entreprise ou financeur.
   */
  contractKind?: 'convention' | 'contrat';
  /**
   * Destinataire de l'exemplaire, quand le client est une entreprise :
   * « entreprise » liste l'intégralité de ses stagiaires sur un seul document,
   * « stagiaire » le nomme seul, sans exposer ses collègues. Les deux portent
   * les mêmes engagements ; seul le bloc bénéficiaire change. Par défaut,
   * déduit de `participants` (plusieurs → exemplaire entreprise).
   */
  audience?: 'entreprise' | 'stagiaire';
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

function drawLabel(doc: PDFDocument, c: Cursor, font: PDFFont, label: string): Cursor {
  // 28 pt : l'intitulé et sa première ligne restent sur la même page.
  const out = ensureRoom(doc, c, 28);
  out.page.drawText(label.toUpperCase(), {
    x: MARGIN,
    y: out.y,
    size: 8,
    font,
    color: COLOR_MUTED,
  });
  return { ...out, y: out.y - 12 };
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

function drawText(
  doc: PDFDocument,
  c: Cursor,
  font: PDFFont,
  text: string,
  opts: { size?: number; color?: ReturnType<typeof rgb>; maxWidth?: number; hanging?: number } = {},
): Cursor {
  const size = opts.size ?? 10;
  // `hanging` : décalage des lignes de continuation, pour qu'une puce qui
  // déborde s'aligne sous son texte et non sous son point.
  const hanging = opts.hanging ?? 0;
  const maxWidth = (opts.maxWidth ?? COL) - hanging;
  const color = opts.color ?? COLOR_BODY;
  const lines = wrapText(text, font, size, maxWidth);
  let cursor = c;
  for (const [i, line] of lines.entries()) {
    cursor = ensureRoom(doc, cursor, size + 4);
    cursor.page.drawText(line, { x: MARGIN + (i === 0 ? 0 : hanging), y: cursor.y, size, font, color });
    cursor = { ...cursor, y: cursor.y - (size + 4) };
  }
  return cursor;
}

/**
 * Champ saisi dans l'éditeur riche : stocké en HTML, rendu ici en paragraphes
 * et puces. Sans cette réduction, la convention imprimait le balisage.
 */
function drawRichText(doc: PDFDocument, c: Cursor, font: PDFFont, html: string | null): Cursor {
  let cursor = c;
  for (const bloc of richTextBlocks(html)) {
    cursor =
      bloc.kind === 'li'
        ? drawText(doc, cursor, font, `• ${bloc.text}`, { hanging: 10 })
        : drawText(doc, cursor, font, bloc.text);
    cursor = { ...cursor, y: cursor.y - 2 };
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
  const contrat = input.contractKind === 'contrat';
  // Destinataire : explicite quand l'appelant le fixe, sinon déduit de la liste
  // des participants (plusieurs noms = c'est l'exemplaire du client).
  const destinataire = input.audience ?? ((input.participants?.length ?? 0) > 1 ? 'entreprise' : 'stagiaire');
  const entrepriseSurLeDocument = destinataire === 'entreprise' && !!input.company && !contrat;
  c.page.drawText(contrat ? 'CONTRAT DE FORMATION PROFESSIONNELLE' : 'CONVENTION DE FORMATION PROFESSIONNELLE', {
    x: MARGIN, y: c.y, size: 14, font: fontBold, color: COLOR_BODY,
  });
  c = { ...c, y: c.y - 14 };
  c.page.drawText(contrat ? 'Articles L.6353-3 à L.6353-7 du Code du travail' : 'Article L.6353-1 et suivants du Code du Travail', {
    x: MARGIN, y: c.y, size: 8, font, color: COLOR_MUTED,
  });
  c = { ...c, y: c.y - 18 };
  c.page.drawText(`Référence : ${input.dossier.reference}`, {
    x: MARGIN, y: c.y, size: 9, font, color: COLOR_BODY,
  });
  c.page.drawText(`Généré le ${fmtDate(input.generatedAt.toISOString())}`, {
    x: MARGIN + COL - 150, y: c.y, size: 9, font, color: COLOR_MUTED,
  });
  c = { ...c, y: c.y - 14 };

  // Un client entreprise reçoit deux jeux de documents : le sien, qui couvre
  // tous ses salariés, et celui de chaque stagiaire, nominatif. Le lecteur doit
  // savoir lequel il tient en main dès l'en-tête.
  const exemplaire = entrepriseSurLeDocument
    ? `Exemplaire de l'entreprise — ${input.company!.name}`
    : input.company
      ? `Exemplaire du stagiaire — ${input.learner.firstName} ${input.learner.lastName}`
      : null;
  if (exemplaire) {
    c.page.drawText(exemplaire, { x: MARGIN, y: c.y, size: 9, font, color: COLOR_MUTED });
  }
  c = { ...c, y: c.y - (exemplaire ? 24 : 10) };

  // Section 1 — Organisme de formation
  c = drawHeading(doc, c, fontBold, '1. Organisme de formation');
  c = drawKeyValue(doc, c, font, fontBold, 'Raison sociale', input.organization.name);
  if (input.organization.siret) c = drawKeyValue(doc, c, font, fontBold, 'SIRET', input.organization.siret);
  if (input.organization.nda) c = drawKeyValue(doc, c, font, fontBold, 'N° déclaration activité', input.organization.nda);
  if (input.organization.address) c = drawKeyValue(doc, c, font, fontBold, 'Adresse', input.organization.address);
  // Téléphone et e-mail sur deux lignes : accolés par une barre verticale, ils
  // se lisaient comme une seule chaîne illisible.
  if (input.organization.contactPhone) c = drawKeyValue(doc, c, font, fontBold, 'Téléphone', input.organization.contactPhone);
  if (input.organization.contactEmail) c = drawKeyValue(doc, c, font, fontBold, 'E-mail', input.organization.contactEmail);
  if (input.organization.certifications) {
    c = drawKeyValue(doc, c, font, fontBold, 'Agréments', input.organization.certifications);
  }
  if (input.organization.representativeName) c = drawKeyValue(doc, c, font, fontBold, 'Représenté par', input.organization.representativeName);
  c = { ...c, y: c.y - 12 };

  // Section 2 — Bénéficiaire(s)
  // Seul l'exemplaire de l'entreprise nomme les collègues : celui du stagiaire
  // ne porte que lui, pour ne pas diffuser l'effectif à chaque salarié.
  const groupe = entrepriseSurLeDocument && (input.participants?.length ?? 0) > 0;
  c = drawHeading(doc, c, fontBold, groupe ? '2. Bénéficiaires de la formation' : '2. Bénéficiaire de la formation');

  if (groupe) {
    const effectif = input.participants!.length;
    c = drawKeyValue(doc, c, font, fontBold, 'Effectif', `${effectif} participant${effectif > 1 ? 's' : ''}`);
    for (const [i, p] of input.participants!.entries()) {
      const naissance = p.birthDate ? ` — né(e) le ${fmtDate(p.birthDate)}` : '';
      c = drawKeyValue(
        doc,
        c,
        font,
        fontBold,
        String(i + 1).padStart(2, '0'),
        `${p.firstName} ${p.lastName} — ${p.email}${naissance}`,
      );
    }
  } else {
    c = drawKeyValue(doc, c, font, fontBold, 'Nom', `${input.learner.firstName} ${input.learner.lastName}`);
    c = drawKeyValue(doc, c, font, fontBold, 'Email', input.learner.email);
    if (input.learner.birthDate) c = drawKeyValue(doc, c, font, fontBold, 'Date de naissance', fmtDate(input.learner.birthDate));
    if (input.learner.address) c = drawKeyValue(doc, c, font, fontBold, 'Adresse', input.learner.address);
  }
  if (input.company) {
    c = drawKeyValue(doc, c, font, fontBold, 'Entreprise', input.company.name);
    if (input.company.siret) c = drawKeyValue(doc, c, font, fontBold, 'SIRET entreprise', input.company.siret);
    if (input.company.representative) c = drawKeyValue(doc, c, font, fontBold, 'Représentée par', input.company.representative);
  }
  if (input.funder) {
    // Le libellé du mode porte déjà ses propres parenthèses (« Reste à charge
    // (financement direct) ») : les imbriquer donnait « X (Y (Z)) ».
    const financeur =
      input.funder.name === input.funder.modeLabel
        ? input.funder.name
        : `${input.funder.name} — ${input.funder.modeLabel}`;
    c = drawKeyValue(doc, c, font, fontBold, 'Financeur', financeur);
  }
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

  const puces = (valeurs: readonly string[]): string[] =>
    valeurs.flatMap((v) => richTextBlocks(v).map((b) => b.text));

  const objectifs = puces(input.formation.objectives);
  if (objectifs.length > 0) {
    c = drawLabel(doc, c, font, 'Objectifs pédagogiques');
    for (const obj of objectifs) {
      c = drawText(doc, c, font, `• ${obj}`, { hanging: 10 });
    }
    c = { ...c, y: c.y - 4 };
  }
  if (richTextToPlain(input.formation.targetAudience)) {
    c = drawLabel(doc, c, font, 'Public cible');
    c = drawRichText(doc, c, font, input.formation.targetAudience);
    c = { ...c, y: c.y - 4 };
  }
  const prerequis = puces(input.formation.prerequisites);
  if (prerequis.length > 0) {
    c = drawLabel(doc, c, font, 'Prérequis');
    for (const p of prerequis) {
      c = drawText(doc, c, font, `• ${p}`, { hanging: 10 });
    }
    c = { ...c, y: c.y - 4 };
  }
  if (richTextToPlain(input.formation.pedagogicalMethod)) {
    c = drawLabel(doc, c, font, 'Méthodes pédagogiques');
    c = drawRichText(doc, c, font, input.formation.pedagogicalMethod);
    c = { ...c, y: c.y - 4 };
  }
  if (richTextToPlain(input.formation.evaluationMethod)) {
    c = drawLabel(doc, c, font, "Modalités d'évaluation");
    c = drawRichText(doc, c, font, input.formation.evaluationMethod);
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

  let signatureSection = 5;
  if (contrat) {
    c = drawHeading(doc, c, fontBold, '5. Délai de rétractation et modalités de paiement');
    for (const paragraph of [
      "Le stagiaire dispose d'un délai de 10 jours à compter de la signature du présent contrat pour se rétracter, par lettre recommandée avec avis de réception (art. L.6353-5 du Code du travail). Aucune somme ne peut être exigée avant l'expiration de ce délai.",
      "À l'expiration du délai de rétractation, il ne peut être exigé plus de 30 % du prix convenu ; le solde est échelonné au fur et à mesure du déroulement de la formation (art. L.6353-6).",
      "Si, par suite de force majeure dûment reconnue, le stagiaire est empêché de suivre la formation, il peut rompre le contrat : seules les prestations effectivement dispensées sont dues, au prorata de leur valeur prévue au contrat (art. L.6353-7).",
    ]) {
      c = drawText(doc, c, font, paragraph, { size: 10 });
      c = { ...c, y: c.y - 4 };
    }
    c = { ...c, y: c.y - 12 };
    signatureSection = 6;
  }

  // Signatures
  c = ensureRoom(doc, c, 150);
  c = drawHeading(doc, c, fontBold, `${signatureSection}. Signatures des parties`);
  c = { ...c, y: c.y - 24 };

  const colW = (COL - 24) / 2;
  // 100 pt : de quoi loger le cachet SOUS l'intitulé du cadre et AU-DESSUS du
  // nom du signataire, sans que les trois se chevauchent.
  const sigH = 100;
  c.page.drawRectangle({ x: MARGIN, y: c.y - sigH, width: colW, height: sigH, borderColor: COLOR_RULE, borderWidth: 0.5 });
  c.page.drawRectangle({ x: MARGIN + colW + 24, y: c.y - sigH, width: colW, height: sigH, borderColor: COLOR_RULE, borderWidth: 0.5 });
  // Client entreprise : c'est l'entreprise (son responsable) qui signe, jamais
  // le salarié — même pour un seul inscrit. Particulier : le stagiaire signe.
  // L'entreprise signe les DEUX exemplaires : c'est elle le client, que le
  // document liste ses dix salariés ou n'en nomme qu'un.
  const entrepriseSigne = !!input.company && !contrat;
  c.page.drawText(entrepriseSigne ? "Le client (l'entreprise)" : contrat ? 'Le stagiaire' : 'Le bénéficiaire', {
    x: MARGIN + colW + 32, y: c.y - 12, size: 8, font: fontBold, color: COLOR_MUTED,
  });
  c.page.drawText(
    entrepriseSigne
      ? `${input.company!.name}${input.company!.representative ? ` — ${input.company!.representative}` : ''}`
      : `${input.learner.firstName} ${input.learner.lastName}`,
    { x: MARGIN + colW + 32, y: c.y - (sigH - 10), size: 8, font, color: COLOR_BODY },
  );

  // Colonne organisme : signature + cachet OF apposés automatiquement
  const sigAnchor = { x: MARGIN, y: c.y - sigH, width: colW, height: sigH };
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

  drawRgpdMention(doc, font, null);

  return doc.save();
}
