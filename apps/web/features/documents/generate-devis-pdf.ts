import { PDFDocument, StandardFonts, type PDFPage } from 'pdf-lib';
import { orgIdentityLines } from './legal/org-identity';
import { conditionsDuDevis, type QuoteHtmlInput } from './generate-devis-html';
import {
  BLANC,
  BORDURE,
  DISCRET,
  LAVANDE,
  TEXTE,
  VIOLET,
  couper,
  dessinerLigneLibelle,
  dessinerPied,
  dessinerTitreSection,
  hauteurLigneLibelle,
  ouvrirDocument,
  type Polices,
} from './charte-pdf';

/**
 * Le devis en PDF, à la charte des documents remis au client (demande
 * d'Ismael, 2026-10-08 : Serra Paysage voulait le devis signé « tout
 * simplement », sans l'interface autour). Même contenu que la page HTML du
 * devis — mêmes données, mêmes conditions. La signature électronique s'y
 * ajoute en certificat (`construirePdfSigneDepuis`).
 */

const A4: [number, number] = [595.28, 841.89];
const MARGE = 40;
const LARGEUR = A4[0] - 2 * MARGE;
const BAS = 64;

const MODALITES: Record<string, string> = { presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' };
const euros = (cents: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100).replace(/ /g, ' ');
const jour = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

export async function genererDevisPdf(input: QuoteHtmlInput, logoPng: Uint8Array | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Devis ${input.reference}`);
  doc.setAuthor(input.org.legalName || input.org.name);
  const polices: Polices = {
    font: await doc.embedFont(StandardFonts.Helvetica),
    fontBold: await doc.embedFont(StandardFonts.HelveticaBold),
    fontItalic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  const { font, fontBold } = polices;
  const pied = `${input.org.legalName || input.org.name} · Devis n° ${input.reference}`;
  const isCompany = input.client.kind === 'company';
  const exonere = input.totals.byRate.every((r) => r.rate === 0);

  let page: PDFPage = doc.addPage(A4);
  let y = await ouvrirDocument(doc, page, polices, {
    titre: `Devis n° ${input.reference}`,
    sousTitre: `Établi le ${jour(input.issuedOn)} — valable jusqu'au ${jour(input.validUntil)}`,
    ligne: input.org.legalName || input.org.name,
    logoPng,
  });
  const place = (h: number) => {
    if (y - h >= BAS) return;
    dessinerPied(page, polices, pied);
    page = doc.addPage(A4);
    y = A4[1] - 50;
  };
  const texte = (t: string, opts: { taille?: number; gras?: boolean; couleur?: typeof TEXTE; x?: number; largeur?: number } = {}) => {
    const taille = opts.taille ?? 9.5;
    const police = opts.gras ? fontBold : font;
    for (const l of couper(t, police, taille, opts.largeur ?? LARGEUR)) {
      place(taille + 4);
      page.drawText(l, { x: opts.x ?? MARGE, y, size: taille, font: police, color: opts.couleur ?? TEXTE });
      y -= taille + 4;
    }
  };

  // ── Organisme et client, côte à côte ──
  const colonne = (titre: string, lignes: string[], x: number) => {
    let yy = y;
    page.drawText(titre.toUpperCase(), { x, y: yy, size: 8, font: fontBold, color: VIOLET });
    yy -= 13;
    for (const l of lignes) {
      for (const morceau of couper(l, font, 9, LARGEUR / 2 - 12)) {
        page.drawText(morceau, { x, y: yy, size: 9, font, color: TEXTE });
        yy -= 12;
      }
    }
    return yy;
  };
  const orgLignes = orgIdentityLines({
    name: input.org.legalName || input.org.name,
    address: input.org.address,
    phone: input.org.contactPhone,
    email: input.org.contactEmail,
    siret: input.org.siret,
    nda: input.org.nda,
    certifications: input.org.certifications ?? null,
  });
  const clientLignes = [
    input.client.name,
    input.client.siret ? `SIRET ${input.client.siret}` : null,
    input.client.address,
    isCompany && input.client.attention ? `À l'attention de ${input.client.attention}` : null,
    input.client.email,
    input.client.phone,
  ].filter((l): l is string => Boolean(l));
  const bas1 = colonne('Organisme de formation', orgLignes, MARGE);
  const bas2 = colonne(isCompany ? 'Client' : 'Client — à titre individuel', clientLignes, MARGE + LARGEUR / 2 + 8);
  y = Math.min(bas1, bas2) - 10;

  texte(`Objet : ${input.object}`, { gras: true });
  y -= 6;

  // ── Détails de la formation ──
  place(40);
  y = dessinerTitreSection(page, polices, MARGE, y, LARGEUR, 'Détails de la formation');
  const lieux = [...new Set(input.sessions.map((s) => s.location).filter((l): l is string => Boolean(l)))];
  const details: Array<[string, string]> = [
    ['Intitulé', input.formation.title],
    ['Durée', input.formation.durationHours ? `${input.formation.durationHours} h` : '—'],
    ['Modalité', input.formation.modality ? (MODALITES[input.formation.modality] ?? input.formation.modality) : '—'],
    ['Dates', input.sessions.length ? input.sessions.map((s) => `${jour(s.startsAt)} de ${heure(s.startsAt)} à ${heure(s.endsAt)}`).join('\n') : 'À convenir'],
    ['Lieu', lieux.length ? lieux.join(', ') : '—'],
    [input.learners.length > 1 ? 'Stagiaires' : 'Stagiaire', input.learners.length ? input.learners.join(', ') : '—'],
  ];
  for (const [k, v] of details) {
    place(hauteurLigneLibelle(polices, LARGEUR, k, v, { largeurLibelle: 130 }));
    y = dessinerLigneLibelle(page, polices, MARGE, y, LARGEUR, k, v, { largeurLibelle: 130 });
  }
  y -= 12;

  // ── Prestation ──
  place(60);
  y = dessinerTitreSection(page, polices, MARGE, y, LARGEUR, 'Prestation');
  const cols = exonere
    ? [{ t: 'Désignation', w: 285 }, { t: 'Quantité', w: 60 }, { t: 'Prix unit. net', w: 85 }, { t: 'Total net', w: LARGEUR - 430 }]
    : [{ t: 'Désignation', w: 245 }, { t: 'Quantité', w: 55 }, { t: 'Prix unit. HT', w: 80 }, { t: 'TVA', w: 45 }, { t: 'Total HT', w: LARGEUR - 425 }];
  const entete = () => {
    page.drawRectangle({ x: MARGE, y: y - 18, width: LARGEUR, height: 18, color: VIOLET });
    let x = MARGE;
    for (const c of cols) {
      page.drawText(c.t, { x: x + 5, y: y - 12.5, size: 8.5, font: fontBold, color: BLANC });
      x += c.w;
    }
    y -= 18;
  };
  entete();
  for (const l of input.lines) {
    const desc = couper(l.description, fontBold, 9, (cols[0]?.w ?? 200) - 10);
    const det = l.details ? couper(l.details, font, 8, (cols[0]?.w ?? 200) - 10) : [];
    const h = 8 + desc.length * 12 + det.length * 10 + 4;
    if (y - h < BAS) {
      dessinerPied(page, polices, pied);
      page = doc.addPage(A4);
      y = A4[1] - 50;
      entete();
    }
    page.drawRectangle({ x: MARGE, y: y - h, width: LARGEUR, height: h, borderColor: BORDURE, borderWidth: 0.6 });
    let yy = y - 13;
    for (const d of desc) {
      page.drawText(d, { x: MARGE + 5, y: yy, size: 9, font: fontBold, color: TEXTE });
      yy -= 12;
    }
    for (const d of det) {
      page.drawText(d, { x: MARGE + 5, y: yy, size: 8, font: polices.fontItalic ?? font, color: DISCRET });
      yy -= 10;
    }
    const valeurs = [
      Number(l.quantity).toLocaleString('fr-FR'),
      euros(l.unitAmountCents),
      ...(exonere ? [] : [`${l.vatRate ?? input.vatRate} %`]),
      euros(Math.round(l.quantity * l.unitAmountCents)),
    ];
    let x = MARGE + (cols[0]?.w ?? 0);
    valeurs.forEach((v, i) => {
      const w = cols[i + 1]?.w ?? 60;
      page.drawText(v, { x: x + w - 5 - font.widthOfTextAtSize(v, 9), y: y - 13, size: 9, font, color: TEXTE });
      x += w;
    });
    y -= h;
  }
  y -= 10;

  // ── Totaux ──
  const totaux: Array<[string, string, boolean]> = [
    [exonere ? 'Total net' : 'Total HT', euros(input.totals.subtotalCents), false],
    ...(exonere
      ? ([['TVA', 'Exonération — art. 261-4-4°a du CGI', false]] as Array<[string, string, boolean]>)
      : input.totals.byRate.map((r): [string, string, boolean] => [`TVA ${r.rate} % (base ${euros(r.baseCents)})`, euros(r.vatCents), false])),
    [exonere ? 'Total net de taxe' : 'Total TTC', euros(input.totals.totalCents), true],
  ];
  place(totaux.length * 16 + 10);
  for (const [k, v, fort] of totaux) {
    const police = fort ? fontBold : font;
    const couleur = fort ? VIOLET : TEXTE;
    page.drawText(k, { x: MARGE + LARGEUR - 300, y, size: 9.5, font: police, color: couleur });
    page.drawText(v, { x: MARGE + LARGEUR - police.widthOfTextAtSize(v, 9.5), y, size: 9.5, font: police, color: couleur });
    y -= 16;
  }
  y -= 8;

  // ── Informations complémentaires, conditions ──
  if (input.notes) {
    place(40);
    y = dessinerTitreSection(page, polices, MARGE, y, LARGEUR, 'Informations complémentaires');
    texte(input.notes);
    y -= 6;
  }
  place(40);
  y = dessinerTitreSection(page, polices, MARGE, y, LARGEUR, 'Conditions');
  for (const c of conditionsDuDevis(input)) {
    const lignes = couper(c, font, 9, LARGEUR - 12);
    place(lignes.length * 12 + 4);
    page.drawText('•', { x: MARGE, y, size: 9, font, color: VIOLET });
    for (const l of lignes) {
      page.drawText(l, { x: MARGE + 12, y, size: 9, font, color: TEXTE });
      y -= 12;
    }
    y -= 3;
  }

  // ── Bon pour accord ──
  y -= 10;
  place(90);
  const largeurCase = LARGEUR / 2 - 8;
  page.drawRectangle({ x: MARGE + LARGEUR - largeurCase, y: y - 80, width: largeurCase, height: 80, color: LAVANDE, borderColor: BORDURE, borderWidth: 0.6 });
  page.drawText('Bon pour accord — le client', { x: MARGE + LARGEUR - largeurCase + 10, y: y - 16, size: 9, font: fontBold, color: VIOLET });
  page.drawText('Date, nom, signature (et cachet)', { x: MARGE + LARGEUR - largeurCase + 10, y: y - 30, size: 8, font, color: DISCRET });
  y -= 90;

  // Particulier : l'annexe de rétractation, comme sur la page HTML.
  if (!isCompany) {
    dessinerPied(page, polices, pied);
    page = doc.addPage(A4);
    y = A4[1] - 50;
    y = dessinerTitreSection(page, polices, MARGE, y, LARGEUR, 'Annexe — Droit de rétractation');
    texte(
      "Vous disposez d'un délai de 10 jours à compter de la signature du contrat de formation pour vous rétracter, par lettre recommandée avec avis de réception (art. L.6353-5 du Code du travail). Ce délai est porté à 14 jours lorsque le contrat est conclu à distance ou hors établissement (art. L.221-18 du Code de la consommation). Aucune somme ne peut être exigée avant l'expiration de ce délai.",
    );
    y -= 8;
    texte('Formulaire de rétractation — à compléter et renvoyer uniquement si vous souhaitez vous rétracter.', { gras: true });
    texte(`À l'attention de ${input.org.legalName || input.org.name}${input.org.address ? `, ${input.org.address}` : ''}${input.org.contactEmail ? ` — ${input.org.contactEmail}` : ''}.`);
    texte(`Devis n° ${input.reference} — ${input.formation.title}. Nom du stagiaire : ${input.client.name}.`);
    texte('Date : ____________________     Signature : ____________________');
  }
  dessinerPied(page, polices, pied);
  return doc.save();
}
