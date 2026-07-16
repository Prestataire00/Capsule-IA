// Guidage actionnable des indicateurs Qualiopi : pour chaque indicateur non
// satisfait, QUOI faire + OÙ le corriger (onglet du dossier). Pur, réutilisable.

export type DossierTab = 'documents' | 'questionnaires' | 'emargements' | 'vue' | 'financeurs';

export type Guidance = { todo: string; tab: DossierTab; linkLabel: string; href?: string };

const PROOF_GUIDANCE: Guidance = {
  todo: 'Joignez la pièce justificative (preuve) correspondant à cet indicateur.',
  tab: 'documents',
  linkLabel: 'Ajouter la preuve',
};

// Consigne + lien par TYPE de preuve attendu (fallback).
const BY_SOURCE: Record<string, Guidance> = {
  proof: PROOF_GUIDANCE,
  questionnaire_positionnement: {
    todo:
      "Le positionnement est normalement recueilli à l'inscription (étape « Fiche besoin ») et validé automatiquement. Si l'apprenant a été ajouté sans passer par le formulaire d'inscription, envoyez-lui le questionnaire de positionnement.",
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

// Consigne PRÉCISE par code d'indicateur (prioritaire sur la source).
const TODO_BY_CODE: Record<string, string> = {
  I4: "Renseignez les objectifs pédagogiques dans la fiche formation (onglet Programme) — cela valide l'indicateur. Joindre une preuve reste possible.",
  I5: "Le questionnaire de positionnement, une fois complété par l'apprenant, valide l'adaptation du parcours (preuve facultative).",
  I6: "Renseignez les modalités pédagogiques dans la fiche formation — cela valide l'indicateur (preuve facultative).",
  I7: "Complétez le programme détaillé dans la fiche formation (onglet Programme) — cela valide l'indicateur (preuve facultative).",
  I8: "Renseignez les modalités d'évaluation dans la fiche formation — cela valide l'indicateur (preuve facultative).",
  I9: "Joignez une preuve d'adaptation pédagogique en cours de formation.",
  I10: "Le positionnement est recueilli automatiquement à l'inscription (étape « Fiche besoin ») et valide l'indicateur. Si l'apprenant a été ajouté sans passer par l'inscription, envoyez-lui le questionnaire de positionnement.",
  I11: "Joignez une preuve d'accueil/d'adaptation pour les publics spécifiques (accessibilité, handicap).",
  I12: "Joignez une preuve de l'accompagnement de l'apprenant (suivi, contacts).",
  I13: 'Joignez une preuve des conditions de déroulement (convocation, infos pratiques, lieu).',
  I14: 'Joignez une preuve de coordination des différents acteurs de la formation.',
  I15: "Envoyez le questionnaire d'évaluation des acquis — sa complétion valide l'indicateur (preuve facultative).",
  I20: 'Joignez une preuve des locaux et moyens matériels mis à disposition.',
  I21: "Affectez un formateur au dossier — cela valide l'indicateur (CV / qualifications en preuve facultative).",
  I22: "Créez les feuilles d'émargement et faites-les signer.",
  I23: "Envoyez le questionnaire d'évaluation des acquis à l'apprenant.",
  I26: 'Envoyez le questionnaire de satisfaction à chaud en fin de formation.',
  I27: 'Envoyez le questionnaire de satisfaction à froid (quelques semaines après).',
  I30: 'Joignez une preuve de traitement des dysfonctionnements / réclamations.',
};

// Lien surchargé par code quand il diffère du défaut de la source.
const TAB_BY_CODE: Partial<Record<string, { tab: DossierTab; linkLabel: string }>> = {
  I5: { tab: 'questionnaires', linkLabel: 'Envoyer le questionnaire' },
  I15: { tab: 'questionnaires', linkLabel: 'Envoyer le questionnaire' },
  I21: { tab: 'documents', linkLabel: 'Ajouter la preuve (formateur)' },
  I26: { tab: 'questionnaires', linkLabel: 'Envoyer le questionnaire' },
  I27: { tab: 'questionnaires', linkLabel: 'Envoyer le questionnaire' },
};

const PROGRAMME_CODES = new Set(['I4', 'I6', 'I7', 'I8']);

export type GuidanceCtx = { formationId?: string; dossierId?: string };

export function guidanceFor(code: string, source: string, ctx: GuidanceCtx = {}): Guidance {
  const base = BY_SOURCE[source] ?? PROOF_GUIDANCE;
  const todo = TODO_BY_CODE[code] ?? base.todo;
  const linkOverride = TAB_BY_CODE[code];
  // I4/I6/I7/I8 : lien direct vers l'éditeur de programme de la formation.
  if (ctx.formationId && PROGRAMME_CODES.has(code)) {
    return { todo, tab: 'documents', linkLabel: 'Compléter le programme', href: `/formations/${ctx.formationId}/programme` };
  }
  // I21 : lien vers le contrôle d'affectation de formateur (page Qualiopi du dossier).
  if (ctx.dossierId && code === 'I21') {
    return { todo, tab: 'documents', linkLabel: 'Affecter un formateur', href: `/dossiers/${ctx.dossierId}/qualiopi#affecter-formateur` };
  }
  return {
    todo,
    tab: linkOverride?.tab ?? base.tab,
    linkLabel: linkOverride?.linkLabel ?? base.linkLabel,
  };
}
