import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import {
  BORDURE,
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
} from '@/features/documents/charte-pdf';

/**
 * La notice de l'espace entreprise, jointe à l'e-mail qui en donne le lien
 * après la signature du devis (demande d'Ismael, 2026-10-07) : comment s'y
 * rendre, ce que contient chaque rubrique, et comment échanger avec l'équipe.
 * À la charte des documents remis au client.
 */

export type NoticeEspace = {
  readonly organisme: string;
  /** Les personnes que le client peut joindre directement, dans « Échanges ». */
  readonly equipe: ReadonlyArray<{ nom: string; fonction: string }>;
  readonly logoPng?: Uint8Array | null;
};

const MARGE = 40;

/** Les guillemets français tiennent à leur mot : jamais seuls en bout de ligne. */
const insecable = (t: string) => t.replace(/« /g, '«\u00a0').replace(/ »/g, '\u00a0»').replace(/ :/g, '\u00a0:');
const ORANGE = rgb(0.976, 0.451, 0.086); // #f97316

const RUBRIQUES: ReadonlyArray<[string, string]> = [
  ['À faire', 'Ce qui vous attend, le plus urgent en premier : documents à signer, questionnaires à remplir, factures à régler, convocations à transmettre à vos salariés.'],
  ['Planning', 'Les séances à venir et passées de vos salariés, en tableau ou en liste : dates, horaires, lieu ou lien de connexion, formateur, participants. Les heures réalisées sur les heures prévues. La convocation générale en PDF.'],
  ['Apprenants', 'Vos salariés inscrits : leurs heures, leurs émargements et les documents qui les concernent.'],
  ['Documents', 'Convention, convocations, programme, attestations : à consulter, télécharger ou signer en ligne.'],
  ['Facturation', 'Le prix convenu, vos devis et vos factures, avec le reste à payer.'],
  ['Questionnaires', 'Vos questionnaires : à remplir, à venir (avec la date à laquelle ils s’ouvrent) et déjà répondus. Ils s’ouvrent d’eux-mêmes le jour venu.'],
  ['Échanges', 'Votre messagerie avec l’équipe : un fil commun et un fil personnel avec chaque membre, documents joints compris. Les e-mails que nous vous avons envoyés y sont aussi.'],
];

function paragraphe(page: PDFPage, polices: Polices, texte: string, y: number, opts: { taille?: number; couleur?: ReturnType<typeof rgb>; gras?: boolean } = {}): number {
  const taille = opts.taille ?? 10;
  const largeur = page.getSize().width - 2 * MARGE;
  for (const l of couper(insecable(texte), opts.gras ? polices.fontBold : polices.font, taille, largeur)) {
    page.drawText(l, { x: MARGE, y, size: taille, font: opts.gras ? polices.fontBold : polices.font, color: opts.couleur ?? TEXTE });
    y -= taille + 4.5;
  }
  return y - 4;
}

/** Une étape numérotée : pastille orange et texte. */
function etape(page: PDFPage, polices: Polices, n: number, texte: string, y: number): number {
  const largeur = page.getSize().width - 2 * MARGE - 28;
  page.drawCircle({ x: MARGE + 9, y: y + 3.5, size: 9, color: ORANGE });
  const chiffre = String(n);
  page.drawText(chiffre, { x: MARGE + 9 - polices.fontBold.widthOfTextAtSize(chiffre, 9.5) / 2, y: y, size: 9.5, font: polices.fontBold, color: rgb(1, 1, 1) });
  const lignes = couper(insecable(texte), polices.font, 10, largeur);
  lignes.forEach((l, i) => page.drawText(l, { x: MARGE + 28, y: y - i * 14.5, size: 10, font: polices.font, color: TEXTE }));
  return y - Math.max(1, lignes.length) * 14.5 - 8;
}

/** Un encadré lavande : titre violet et texte. */
function encadre(page: PDFPage, polices: Polices, titre: string, texte: string, y: number): number {
  const largeur = page.getSize().width - 2 * MARGE;
  const lignes = couper(insecable(texte), polices.font, 9.5, largeur - 24);
  const h = 22 + lignes.length * 13.5 + 10;
  page.drawRectangle({ x: MARGE, y: y - h, width: largeur, height: h, color: LAVANDE, borderColor: BORDURE, borderWidth: 0.6 });
  page.drawRectangle({ x: MARGE, y: y - h, width: 3, height: h, color: VIOLET });
  page.drawText(titre, { x: MARGE + 14, y: y - 16, size: 10, font: polices.fontBold, color: VIOLET });
  lignes.forEach((l, i) => page.drawText(l, { x: MARGE + 14, y: y - 31 - i * 13.5, size: 9.5, font: polices.font, color: TEXTE }));
  return y - h - 14;
}

export async function construireNoticeEspace(n: NoticeEspace): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Votre espace entreprise — ${n.organisme}`);
  doc.setAuthor(n.organisme);
  const polices: Polices = { font: await doc.embedFont(StandardFonts.Helvetica), fontBold: await doc.embedFont(StandardFonts.HelveticaBold), fontItalic: await doc.embedFont(StandardFonts.HelveticaOblique) };
  const pied = `${n.organisme} · Votre espace entreprise — mode d’emploi`;
  const largeur = 595.28 - 2 * MARGE;

  // ── Page 1 : y aller, et ce qu'on y trouve ──
  let page = doc.addPage([595.28, 841.89]);
  let y = await ouvrirDocument(doc, page, polices, {
    titre: 'Votre espace entreprise',
    sousTitre: 'Mode d’emploi',
    ligne: `${n.organisme} · tout le suivi de la formation de vos salariés, au même endroit`,
    logoPng: n.logoPng ?? null,
  });

  y = paragraphe(
    page,
    polices,
    `Votre devis est signé : merci de votre confiance. Pour suivre la formation de vos salariés, ${n.organisme} met à votre disposition un espace en ligne, sans mot de passe à créer.`,
    y,
  );

  y = dessinerTitreSection(page, polices, MARGE, y - 4, largeur, 'Accéder à votre espace');
  y = etape(page, polices, 1, 'Ouvrez le lien personnel reçu par e-mail (bouton « Ouvrir mon espace »). Il fonctionne sur ordinateur, tablette et téléphone.', y);
  y = etape(page, polices, 2, 'Ajoutez la page à vos favoris : vous y reviendrez en un clic, pendant toute la formation.', y);
  y = etape(page, polices, 3, `Lien perdu ou expiré (il vaut un an) ? Demandez-en un nouveau à ${n.organisme} : l’ancien cesse alors de fonctionner.`, y);

  y = dessinerTitreSection(page, polices, MARGE, y - 6, largeur, 'Les rubriques de votre espace');
  for (const [libelle, texte] of RUBRIQUES) {
    if (y - hauteurLigneLibelle(polices, largeur, libelle, texte, { largeurLibelle: 120 }) < 70) {
      dessinerPied(page, polices, pied);
      page = doc.addPage([595.28, 841.89]);
      y = 841.89 - 60;
    }
    y = dessinerLigneLibelle(page, polices, MARGE, y, largeur, libelle, texte, { largeurLibelle: 120 }) - 4;
  }
  dessinerPied(page, polices, pied);

  // ── Page 2 : échanger avec l'équipe ──
  page = doc.addPage([595.28, 841.89]);
  y = 841.89 - 60;
  y = dessinerTitreSection(page, polices, MARGE, y, largeur, `Échanger avec ${n.organisme}`);
  y = paragraphe(
    page,
    polices,
    `Une question sur une séance, un salarié, un document ou une facture ? Écrivez-nous depuis la rubrique « Échanges » de votre espace : c’est le moyen le plus simple de joindre ${n.organisme} et ses membres, et tout l’historique reste au même endroit.`,
    y,
  );
  y = etape(page, polices, 1, 'Ouvrez la rubrique « Échanges ».', y);
  y = etape(page, polices, 2, `Choisissez à qui écrire : « Toute l’équipe ${n.organisme} » (le message est lu par toute l’équipe), ou une personne en particulier (le message n’est lu que par elle).`, y);
  y = etape(page, polices, 3, 'Écrivez votre message et, si besoin, joignez un document avec le trombone (PDF, image, Word, Excel ; 20 Mo au plus).', y);
  y = etape(page, polices, 4, 'La réponse arrive dans le même fil, et un e-mail vous prévient.', y);

  if (n.equipe.length > 0) {
    y = dessinerTitreSection(page, polices, MARGE, y - 6, largeur, 'Vos interlocuteurs');
    for (const m of n.equipe) {
      y = dessinerLigneLibelle(page, polices, MARGE, y, largeur, m.nom, m.fonction, { largeurLibelle: 180 }) - 4;
    }
    y -= 6;
  }

  y = encadre(page, polices, 'Un document à signer ?', 'Il apparaît dans « À faire » avec un bouton « Signer » : la signature se fait en ligne, en quelques secondes, et le document signé rejoint votre rubrique « Documents ».', y);
  y = encadre(page, polices, 'Un souci avec la formation ?', 'En bas de votre espace, « Faire une réclamation » transmet votre signalement à l’organisme, qui vous répond et en assure le suivi.', y);
  encadre(
    page,
    polices,
    'Bon à savoir',
    'Le lien de votre espace vous est personnel : merci de ne pas le transférer. Vos salariés reçoivent, eux, leurs propres liens (convocation, émargement, questionnaires) quand nous avons leur adresse e-mail ; sinon, ils vous sont confiés pour que vous les leur transmettiez.',
    y,
  );
  dessinerPied(page, polices, pied);

  return doc.save();
}
