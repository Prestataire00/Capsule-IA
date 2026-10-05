import { rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import { drawOrgLogo } from './pdf-logo';

/**
 * La charte des documents Capsule IA, celle des propositions générées
 * (`features/proposition/proposition-html.ts`) : bandeau violet profond en
 * tête, titres de section en capitales violettes soulignées, libellés sur fond
 * lavande. Une seule définition pour tous les PDF remis à l'entreprise
 * (demande d'Ismael, 05/10/2026). Pur : du dessin pdf-lib, aucune donnée.
 */

export const VIOLET = rgb(0.298, 0.114, 0.584); // #4c1d95
export const LAVANDE = rgb(0.953, 0.937, 0.98); // #f3effa
export const LAVANDE_FONCE = rgb(0.914, 0.882, 0.965); // #e9e1f6
export const BORDURE = rgb(0.894, 0.894, 0.906); // #e4e4e7
export const TEXTE = rgb(0.094, 0.094, 0.106); // #18181b
export const DISCRET = rgb(0.443, 0.443, 0.478); // #71717a
export const BLANC = rgb(1, 1, 1);

export type Polices = { font: PDFFont; fontBold: PDFFont; fontItalic?: PDFFont };

/** Découpe un texte en lignes qui tiennent dans `largeur`. */
export function couper(texte: string, font: PDFFont, taille: number, largeur: number): string[] {
  const lignes: string[] = [];
  for (const paragraphe of texte.split('\n')) {
    let courante = '';
    for (const mot of paragraphe.split(/\s+/).filter(Boolean)) {
      const essai = courante ? `${courante} ${mot}` : mot;
      if (font.widthOfTextAtSize(essai, taille) <= largeur) courante = essai;
      else {
        if (courante) lignes.push(courante);
        courante = mot;
      }
    }
    lignes.push(courante);
  }
  return lignes;
}

/**
 * Le bandeau de tête : violet plein, titre en blanc, sous-titre et ligne de
 * contexte. Pleine largeur, collé en haut de la page. Renvoie l'ordonnée sous lui.
 */
export function dessinerBandeau(
  page: PDFPage,
  polices: Polices,
  contenu: { titre: string; sousTitre?: string | null; ligne?: string | null; reserveDroite?: number },
): number {
  const { width, height } = page.getSize();
  const marge = 40;
  const largeurTexte = width - 2 * marge - (contenu.reserveDroite ?? 0);
  const titre = couper(contenu.titre, polices.fontBold, 20, largeurTexte);
  const sous = contenu.sousTitre ? couper(contenu.sousTitre, polices.fontItalic ?? polices.font, 11, largeurTexte) : [];
  const ligne = contenu.ligne ? couper(contenu.ligne, polices.font, 9, largeurTexte) : [];
  const hauteur = 28 + titre.length * 24 + sous.length * 14 + ligne.length * 12 + 14;

  page.drawRectangle({ x: 0, y: height - hauteur, width, height: hauteur, color: VIOLET });
  let y = height - 34;
  for (const l of titre) {
    page.drawText(l, { x: marge, y, size: 20, font: polices.fontBold, color: BLANC });
    y -= 24;
  }
  for (const l of sous) {
    page.drawText(l, { x: marge, y, size: 11, font: polices.fontItalic ?? polices.font, color: BLANC });
    y -= 14;
  }
  for (const l of ligne) {
    page.drawText(l, { x: marge, y: y - 2, size: 9, font: polices.font, color: LAVANDE_FONCE });
    y -= 12;
  }
  return height - hauteur - 18;
}

/** Titre de section : capitales violettes, filet violet dessous. Renvoie l'ordonnée sous le filet. */
export function dessinerTitreSection(page: PDFPage, polices: Polices, x: number, y: number, largeur: number, texte: string): number {
  page.drawText(texte.toUpperCase(), { x, y, size: 10.5, font: polices.fontBold, color: VIOLET });
  page.drawLine({ start: { x, y: y - 5 }, end: { x: x + largeur, y: y - 5 }, thickness: 0.8, color: VIOLET });
  return y - 20;
}

/**
 * Une ligne « libellé | valeur » : libellé violet sur fond lavande, valeur
 * dans une case bordée. Renvoie l'ordonnée sous la ligne.
 */
export function dessinerLigneLibelle(
  page: PDFPage,
  polices: Polices,
  x: number,
  y: number,
  largeur: number,
  libelle: string,
  valeur: string,
  opts: { largeurLibelle?: number; taille?: number } = {},
): number {
  const taille = opts.taille ?? 9.5;
  const lLib = opts.largeurLibelle ?? Math.round(largeur * 0.3);
  const lVal = largeur - lLib;
  const libs = couper(libelle, polices.fontBold, taille, lLib - 14);
  const vals = couper(valeur || '—', polices.font, taille, lVal - 14);
  const n = Math.max(libs.length, vals.length);
  const h = n * (taille + 3.5) + 10;
  page.drawRectangle({ x, y: y - h, width: lLib, height: h, color: LAVANDE, borderColor: BORDURE, borderWidth: 0.6 });
  page.drawRectangle({ x: x + lLib, y: y - h, width: lVal, height: h, borderColor: BORDURE, borderWidth: 0.6 });
  libs.forEach((l, i) => page.drawText(l, { x: x + 7, y: y - 6 - taille - i * (taille + 3.5) + 2, size: taille, font: polices.fontBold, color: VIOLET }));
  vals.forEach((l, i) => page.drawText(l, { x: x + lLib + 7, y: y - 6 - taille - i * (taille + 3.5) + 2, size: taille, font: polices.font, color: TEXTE }));
  return y - h;
}

/** La hauteur qu'occupera une ligne libellé/valeur : pour changer de page avant de la dessiner. */
export function hauteurLigneLibelle(polices: Polices, largeur: number, libelle: string, valeur: string, opts: { largeurLibelle?: number; taille?: number } = {}): number {
  const taille = opts.taille ?? 9.5;
  const lLib = opts.largeurLibelle ?? Math.round(largeur * 0.3);
  const n = Math.max(couper(libelle, polices.fontBold, taille, lLib - 14).length, couper(valeur || '—', polices.font, taille, largeur - lLib - 14).length);
  return n * (taille + 3.5) + 10;
}

/** Pied de page : filet lavande et mention, en bas de chaque page. */
export function dessinerPied(page: PDFPage, polices: Polices, texte: string): void {
  const { width } = page.getSize();
  page.drawLine({ start: { x: 40, y: 46 }, end: { x: width - 40, y: 46 }, thickness: 0.6, color: LAVANDE_FONCE });
  for (const [i, l] of couper(texte, polices.font, 7, width - 80).slice(0, 3).entries()) {
    page.drawText(l, { x: 40, y: 36 - i * 9, size: 7, font: polices.font, color: DISCRET });
  }
}

/**
 * L'en-tête complet d'un document : bandeau violet et, s'il existe, le logo
 * de l'organisme sur une pastille blanche dans le bandeau. Renvoie l'ordonnée
 * sous le bandeau.
 */
export async function ouvrirDocument(
  doc: PDFDocument,
  page: PDFPage,
  polices: Polices,
  contenu: { titre: string; sousTitre?: string | null; ligne?: string | null; logoPng?: Uint8Array | null },
): Promise<number> {
  const { width, height } = page.getSize();
  const avecLogo = Boolean(contenu.logoPng && contenu.logoPng.byteLength > 0);
  const y = dessinerBandeau(page, polices, { ...contenu, reserveDroite: avecLogo ? 96 : 0 });
  if (avecLogo) {
    const hBandeau = height - y - 18;
    const cote = Math.min(64, hBandeau - 16);
    page.drawRectangle({ x: width - 40 - cote - 12, y: height - 8 - cote, width: cote + 12, height: cote, color: BLANC });
    await drawOrgLogo(doc, page, contenu.logoPng ?? null, { right: width - 40 - 6, top: height - 12, maxW: cote, maxH: cote - 8 });
  }
  return y;
}
