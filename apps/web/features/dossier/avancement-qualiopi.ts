// ARCHETYPE: shared
// Ce qu'une étape validée à la main prouve, côté Qualiopi. Module pur.
//
// L'avancement du dossier et la conformité Qualiopi décrivaient la même
// réalité sans se parler. Valider « Analyse du besoin reçue » parce qu'elle
// s'est faite au téléphone laissait l'onglet Qualiopi réclamer le
// questionnaire de positionnement : deux écrans, deux vérités, et c'est
// l'auditeur qui aurait tranché.
//
// Le lien passe par `qualiopi_proofs`, qui existe déjà : un indicateur est
// satisfait dès qu'une preuve valide est déposée pour le dossier. Rien à
// inventer — la validation manuelle DÉPOSE une preuve, avec son auteur, sa
// date et son motif. C'est exactement ce qu'on relira devant un auditeur, et
// c'est honnête : la preuve dit qu'elle est déclarative.
//
// On ne cartographie QUE les liens certains. Une étape commerciale — devis
// envoyé, facture réglée — ne prouve aucun indicateur, et prétendre le
// contraire ferait passer un dossier pour conforme sans l'être : le contraire
// exact du service à rendre.

/**
 * Numéros officiels du Référentiel national qualité (guide de lecture V9)
 * couverts par chaque étape d'avancement.
 */
export const INDICATEURS_PAR_ETAPE: Readonly<Record<string, readonly number[]>> = {
  // 4 « Analyse du besoin du bénéficiaire » et 8 « Positionnement et
  // évaluation des acquis à l'entrée » sont tous deux satisfaits par le
  // questionnaire de positionnement. Recueillir le besoin au téléphone les
  // remplit aussi — c'est le même acte, par un autre canal.
  needs: [4, 8],
  // 12 « Engagement des bénéficiaires » est satisfait par l'émargement
  // finalisé. Une formation réalisée et émargée sur papier le prouve tout
  // autant.
  done: [12],
};

/**
 * Les étapes dont la validation manuelle n'apporte aucune preuve Qualiopi.
 *
 * Listées plutôt que déduites : dire « cette étape ne prouve rien » est une
 * décision, pas un oubli, et l'écran doit pouvoir l'annoncer.
 */
export const ETAPES_SANS_INDICATEUR = [
  'created',
  'session',
  'devis',
  'devis_sent',
  'devis_signed',
  'convention',
  'convention_signed',
  'paid',
] as const;

export const indicateursDeLEtape = (stepKey: string): readonly number[] =>
  INDICATEURS_PAR_ETAPE[stepKey] ?? [];

/** Le titre de la preuve déposée, tel qu'il se lira dans l'onglet Qualiopi. */
export const titreDeLaPreuve = (libelleEtape: string): string =>
  `${libelleEtape} — validée à la main`;

/**
 * La description de la preuve : le motif saisi, ou à défaut une phrase qui dit
 * ce qu'elle est.
 *
 * Jamais vide : une preuve sans description laisse l'auditeur deviner d'où
 * elle sort, ce qui est pire que pas de preuve du tout.
 */
export const descriptionDeLaPreuve = (note: string | null | undefined, quand: Date): string => {
  const propre = (note ?? '').trim();
  const date = quand.toLocaleDateString('fr-FR');
  return propre !== ''
    ? `${propre} (validé à la main le ${date}, hors application.)`
    : `Étape déclarée réalisée hors de l'application, le ${date}. Aucun motif n'a été précisé.`;
};
