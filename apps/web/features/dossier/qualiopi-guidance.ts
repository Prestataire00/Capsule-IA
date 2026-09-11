// Guidage actionnable des indicateurs Qualiopi de niveau dossier : pour chaque
// indicateur non satisfait, QUOI faire + OÙ le corriger. Pur, réutilisable.
//
// Clé : le NUMÉRO OFFICIEL du Référentiel national qualité (guide de lecture
// V9). L'ancien guidage était indexé sur des codes (« I23 »…) issus d'un
// référentiel mal numéroté : l'indicateur 23 y désignait l'évaluation des
// acquis, alors qu'il s'agit de la veille légale (audit CAP-35).

export type DossierTab = 'documents' | 'questionnaires' | 'emargements' | 'vue' | 'financeurs';

export type Guidance = { todo: string; tab: DossierTab; linkLabel: string; href?: string };

const PROOF_GUIDANCE: Guidance = {
  todo: 'Joignez la pièce justificative (preuve) correspondant à cet indicateur.',
  tab: 'documents',
  linkLabel: 'Ajouter la preuve',
};

// Consigne + lien par source de règle (surcharge d'organisme) — repli.
const BY_SOURCE: Record<string, Guidance> = {
  proof: PROOF_GUIDANCE,
  questionnaire_positionnement: {
    todo: "Envoyez le questionnaire de positionnement à l'apprenant.",
    tab: 'questionnaires',
    linkLabel: 'Envoyer le questionnaire',
  },
  questionnaire_evaluation: {
    todo: "Envoyez le questionnaire d'évaluation des acquis à l'apprenant.",
    tab: 'questionnaires',
    linkLabel: 'Envoyer le questionnaire',
  },
  attendance_signed: {
    todo: "Créez les feuilles d'émargement des séances et faites-les signer (formateur + apprenants).",
    tab: 'emargements',
    linkLabel: 'Gérer les émargements',
  },
  document_signed: {
    todo: 'Générez le document requis puis faites-le signer.',
    tab: 'documents',
    linkLabel: 'Gérer les documents',
  },
};

/** Consigne précise par numéro officiel (prioritaire sur la source). */
const TODO_BY_NUMBER: Record<number, string> = {
  4: "L'analyse du besoin est recueillie à l'inscription (étape « Fiche besoin ») et valide l'indicateur. Si l'apprenant a été ajouté sans passer par l'inscription, envoyez-lui le questionnaire de positionnement.",
  5: "Renseignez les objectifs pédagogiques et les modalités d'évaluation dans la fiche formation — cela valide l'indicateur.",
  6: "Renseignez le programme et les modalités pédagogiques dans la fiche formation — cela valide l'indicateur.",
  7: "Joignez la preuve de l'adéquation du contenu au référentiel de la certification visée.",
  8: "Le positionnement à l'entrée est recueilli par le questionnaire de positionnement (fiche besoin) : sa complétion valide l'indicateur.",
  9: "La convocation envoyée à l'apprenant (automatiquement à J-7) ou un document de convocation généré valide l'indicateur. À défaut, joignez la preuve de l'information donnée sur les conditions de déroulement (livret d'accueil, règlement intérieur).",
  10: "Joignez la preuve de l'adaptation de la prestation et du suivi (entretiens, ajustements, comptes rendus).",
  11: "Envoyez le questionnaire d'évaluation des acquis — sa complétion valide l'indicateur.",
  12: "Créez les feuilles d'émargement des séances et faites-les signer : leur finalisation valide l'indicateur.",
  13: "Joignez la preuve de la coordination avec l'entreprise d'accueil (livret d'apprentissage, échanges avec le tuteur).",
  14: "Joignez la preuve de l'accompagnement socio-professionnel de l'apprenti.",
  15: "Joignez la preuve de l'information de l'apprenti sur ses droits, ses devoirs et la santé-sécurité au travail.",
  16: "Joignez la preuve de l'information du bénéficiaire sur la certification et de son inscription à l'examen.",
  21: "Affectez un formateur au dossier — cela valide l'indicateur (CV et qualifications en preuve complémentaire).",
  30: "Envoyez le questionnaire de satisfaction à chaud en fin de formation — sa complétion valide l'indicateur.",
};

/** Lien surchargé par numéro quand il diffère du défaut de la source. */
const TAB_BY_NUMBER: Partial<Record<number, { tab: DossierTab; linkLabel: string }>> = {
  4: { tab: 'questionnaires', linkLabel: 'Envoyer le questionnaire' },
  8: { tab: 'questionnaires', linkLabel: 'Envoyer le questionnaire' },
  9: { tab: 'documents', linkLabel: 'Générer la convocation' },
  11: { tab: 'questionnaires', linkLabel: 'Envoyer le questionnaire' },
  12: { tab: 'emargements', linkLabel: 'Gérer les émargements' },
  30: { tab: 'questionnaires', linkLabel: 'Envoyer le questionnaire' },
};

/** Indicateurs validés par le contenu de la fiche formation. */
const FORMATION_NUMBERS = new Set([5, 6]);

export type GuidanceCtx = { formationId?: string; dossierId?: string };

export function guidanceFor(number: number, source: string, ctx: GuidanceCtx = {}): Guidance {
  const base = BY_SOURCE[source] ?? PROOF_GUIDANCE;
  const todo = TODO_BY_NUMBER[number] ?? base.todo;

  if (ctx.formationId && FORMATION_NUMBERS.has(number)) {
    return { todo, tab: 'documents', linkLabel: 'Compléter la fiche formation', href: `/formations/${ctx.formationId}/edit` };
  }
  if (ctx.dossierId && number === 21) {
    return { todo, tab: 'documents', linkLabel: 'Affecter un formateur', href: `/dossiers/${ctx.dossierId}/qualiopi#affecter-formateur` };
  }

  const override = TAB_BY_NUMBER[number];
  return {
    todo,
    tab: override?.tab ?? base.tab,
    linkLabel: override?.linkLabel ?? base.linkLabel,
  };
}
