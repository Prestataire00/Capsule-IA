import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { drawSignatureBlock, orgCachetLines } from './apply-org-signature';
import { dessinerLigneLibelle, dessinerTitreSection, ouvrirDocument, VIOLET } from './charte-pdf';
import { drawRgpdMention } from './pdf-rgpd';
import { drawOrgIdentity, identityOf } from './pdf-org-header';
import { LIBELLE_ACQUIS, NIVEAUX_ACQUIS, type NiveauAcquis } from './acquis-objectifs';

export type AttestationInput = {
  organization: {
    name: string;
    siret: string | null;
    nda: string | null;
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
  };
  formation: {
    title: string;
    objectives: string[];
  };
  /** Niveau atteint par objectif (fin de formation) ; absent = « acquis » partout. */
  acquis?: ReadonlyArray<{ objectif: string; niveau: NiveauAcquis }>;
  dossier: {
    reference: string;
    startDate: string;
    endDate: string;
    totalHours: number;
    modality: string;
    attendanceRate: number; // 0-100
  };
  generatedAt: Date;
  // 'fin' (défaut) = attestation de fin de formation ; 'entree' = attestation
  // d'entrée / de démarrage (délivrée aux présents en début de formation).
  variant?: 'fin' | 'entree';
};

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const COL = A4.width - MARGIN * 2;
const COLOR_BODY = rgb(0.094, 0.094, 0.106);
const COLOR_MUTED = rgb(0.42, 0.42, 0.45);
const COLOR_ACCENT = VIOLET;

type Cursor = { page: PDFPage; y: number };

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lignes: string[] = [];
  let courante = '';
  for (const mot of text.split(/\s+/)) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (font.widthOfTextAtSize(essai, size) <= maxWidth || !courante) courante = essai;
    else {
      lignes.push(courante);
      courante = mot;
    }
  }
  if (courante) lignes.push(courante);
  return lignes;
}

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
};

const modalityLabel = (m: string): string =>
  ({ presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' } as Record<string, string>)[m] ?? m;

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
  const y = dessinerLigneLibelle(c.page, { font, fontBold }, MARGIN, c.y + 10, COL, key, value, { largeurLibelle: 160, taille: 10 });
  return { page: c.page, y: y - 10 };
}

export async function generateAttestationPDF(input: AttestationInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([A4.width, A4.height]);
  let c: Cursor = { page, y: A4.height - MARGIN };

  // En-tête à la charte Capsule IA : bandeau violet, logo, référence.
  const isEntree = input.variant === 'entree';
  const titre = isEntree ? "Attestation d'entrée en formation" : 'Attestation de fin de formation';
  const yTete = await ouvrirDocument(doc, page, { font, fontBold }, {
    titre,
    sousTitre: "Action de formation professionnelle continue — article L.6353-1 du Code du Travail",
    ligne: `Référence dossier ${input.dossier.reference} · générée le ${fmtDate(input.generatedAt.toISOString())}`,
    logoPng: input.logoPng,
  });
  c = { ...c, y: drawOrgIdentity(c.page, { font, fontBold }, identityOf(input.organization), { x: MARGIN, y: yTete }) - 22 };

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
  c = drawText(
    c,
    font,
    isEntree
      ? "est inscrit(e) et a démarré l'action de formation suivante :"
      : "a suivi l'action de formation suivante :",
    { size: 11 },
  );
  c = { ...c, y: c.y - 14 };

  // Détails formation
  c = drawKeyValue(c, font, fontBold, 'Intitulé', input.formation.title);
  if (isEntree) {
    c = drawKeyValue(c, font, fontBold, 'Date de démarrage', fmtDate(input.dossier.startDate));
    c = drawKeyValue(c, font, fontBold, 'Durée prévue', `${input.dossier.totalHours} heures`);
    c = drawKeyValue(c, font, fontBold, 'Modalité', modalityLabel(input.dossier.modality));
  } else {
    c = drawKeyValue(c, font, fontBold, 'Période', `du ${fmtDate(input.dossier.startDate)} au ${fmtDate(input.dossier.endDate)}`);
    c = drawKeyValue(c, font, fontBold, 'Durée totale', `${input.dossier.totalHours} heures`);
    c = drawKeyValue(c, font, fontBold, 'Modalité', modalityLabel(input.dossier.modality));
    c = drawKeyValue(c, font, fontBold, "Taux d'assiduité", `${Math.round(input.dossier.attendanceRate)} %`);
  }
  c = { ...c, y: c.y - 18 };

  // Objectifs : à l'entrée, ceux qui sont visés ; en fin de formation, une
  // ligne par objectif et son niveau (acquis, en cours, non acquis).
  if (input.formation.objectives.length > 0 && isEntree) {
    c = { ...c, y: dessinerTitreSection(c.page, { font, fontBold }, MARGIN, c.y, COL, 'Objectifs pédagogiques visés') + 4 };
    for (const obj of input.formation.objectives) {
      c = drawText(c, font, `•  ${obj}`, { size: 10 });
    }
    c = { ...c, y: c.y - 16 };
  } else if (input.formation.objectives.length > 0) {
    const lignes = input.acquis ?? input.formation.objectives.map((objectif) => ({ objectif, niveau: 'acquis' as NiveauAcquis }));
    c = { ...c, y: dessinerTitreSection(c.page, { font, fontBold }, MARGIN, c.y, COL, 'Évaluation des acquis, par objectif') + 4 };
    const colNiv = 78;
    const xNiv = MARGIN + COL - colNiv * NIVEAUX_ACQUIS.length;
    NIVEAUX_ACQUIS.forEach((n, i) => {
      const lib = n === 'en_cours' ? 'En cours' : LIBELLE_ACQUIS[n];
      const w = font.widthOfTextAtSize(lib, 8);
      c.page.drawText(lib, { x: xNiv + i * colNiv + (colNiv - w) / 2, y: c.y, size: 8, font: fontBold, color: COLOR_MUTED });
    });
    c = { ...c, y: c.y - 14 };
    for (const l of lignes) {
      const texte = wrap(`${l.objectif}`, font, 9.5, xNiv - MARGIN - 10);
      const h = Math.max(1, texte.length) * 12.5 + 6;
      // Un long programme continue sur une page suivante, signature comprise.
      if (c.y - h < 150) c = { page: doc.addPage([A4.width, A4.height]), y: A4.height - MARGIN };
      c.page.drawLine({ start: { x: MARGIN, y: c.y + 10 }, end: { x: MARGIN + COL, y: c.y + 10 }, thickness: 0.5, color: rgb(0.89, 0.89, 0.91) });
      texte.forEach((t, i) => c.page.drawText(t, { x: MARGIN, y: c.y - i * 12.5, size: 9.5, font, color: COLOR_BODY }));
      NIVEAUX_ACQUIS.forEach((n, i) => {
        const cx = xNiv + i * colNiv + colNiv / 2 - 4.5;
        c.page.drawRectangle({ x: cx, y: c.y - 2, width: 9, height: 9, borderColor: COLOR_MUTED, borderWidth: 0.8 });
        if (l.niveau === n) {
          c.page.drawLine({ start: { x: cx + 1.8, y: c.y + 2.6 }, end: { x: cx + 3.8, y: c.y + 0.4 }, thickness: 1.4, color: COLOR_ACCENT });
          c.page.drawLine({ start: { x: cx + 3.8, y: c.y + 0.4 }, end: { x: cx + 7.6, y: c.y + 5.8 }, thickness: 1.4, color: COLOR_ACCENT });
        }
      });
      c = { ...c, y: c.y - h };
    }
    c = { ...c, y: c.y - 12 };
  }

  // Closing
  c = drawText(
    c, font,
    "La présente attestation est délivrée à l'intéressé(e) pour servir et valoir ce que de droit. Elle constitue une pièce du dossier individuel de formation, conservée pendant 10 ans dans l'espace personnel de l'apprenant.",
    { size: 10, color: COLOR_MUTED },
  );
  c = { ...c, y: c.y - 30 };

  // Cadre signature auto (signature + cachet OF apposés)
  const sigAnchor = { x: MARGIN + COL - 240, y: c.y - 90, width: 240, height: 90 };
  await drawSignatureBlock(doc, c.page, { font, fontBold }, sigAnchor, {
    signaturePng: input.signaturePng,
    stampPng: input.stampPng,
    stampText: input.stampPng ? null : orgCachetLines(input.organization),
    representativeName: input.organization.representativeName,
    representativeTitle: input.representativeTitle,
    place: input.place,
    date: input.generatedAt,
  });

  // Footer
  page.drawText(`${input.organization.name}  ·  ${input.dossier.reference}  ·  ${titre}`, {
    x: MARGIN, y: 24, size: 7, font, color: COLOR_MUTED,
  });

  drawRgpdMention(doc, font, null);

  return doc.save();
}
