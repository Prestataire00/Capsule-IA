// ARCHETYPE: shared
// Qui reçoit quel questionnaire, et à quel moment. Module pur.
//
// Les modèles n'étaient classés que par `kind` — « positionnement »,
// « satisfaction_chaud », « opco » —, un vocabulaire de base de données. Rien
// ne disait à qui le questionnaire s'adresse ni quand il part, alors que ce
// sont les deux questions qu'on se pose en ouvrant cet écran : « qu'est-ce que
// mon stagiaire reçoit ? », « qu'est-ce qui part après la formation ? ».
//
// La réponse se déduit de ce qui existe déjà — le `kind` et le `code` du
// modèle — plutôt que d'une colonne de plus à tenir à jour, et qui se serait
// contredite avec le comportement réel dès le premier oubli.

export const INTERLOCUTEURS = [
  { cle: 'apprenant', label: 'Stagiaire', accent: 'rose' },
  { cle: 'entreprise', label: 'Entreprise cliente', accent: 'blue' },
  { cle: 'formateur', label: 'Formateur', accent: 'purple' },
  { cle: 'financeur', label: 'Financeur', accent: 'emerald' },
] as const;

export type Interlocuteur = (typeof INTERLOCUTEURS)[number]['cle'];

export const ETAPES = [
  { cle: 'avant', label: 'Avant la formation' },
  { cle: 'pendant', label: 'Pendant la formation' },
  { cle: 'apres', label: 'Après la formation' },
] as const;

export type Etape = (typeof ETAPES)[number]['cle'];

/**
 * Le destinataire d'un modèle.
 *
 * Le `code` prime sur le `kind` : la satisfaction entreprise est enregistrée
 * en `satisfaction_chaud`, faute de valeur dédiée dans l'énumération — la lire
 * par son seul `kind` la rangerait chez le stagiaire, et on chercherait
 * longtemps pourquoi le client ne reçoit rien.
 */
export function interlocuteurDuModele(modele: { kind: string; code?: string | null }): Interlocuteur {
  const code = modele.code ?? '';
  if (code.startsWith('satisfaction_entreprise')) return 'entreprise';
  if (code.startsWith('sys_manager')) return 'entreprise';
  if (code.startsWith('funder_') || code.startsWith('sys_financeur')) return 'financeur';
  if (modele.kind === 'satisfaction_formateur') return 'formateur';
  if (modele.kind === 'opco') return 'financeur';
  return 'apprenant';
}

/** Le moment où le questionnaire part, dans la vie d'une formation. */
export function etapeDuModele(modele: { kind: string; code?: string | null }): Etape {
  if (modele.kind === 'positionnement') return 'avant';
  if (modele.kind === 'evaluation_acquis') return 'pendant';
  if (modele.kind === 'satisfaction_chaud' || modele.kind === 'satisfaction_froid') return 'apres';
  if (modele.kind === 'satisfaction_formateur') return 'apres';
  // Un questionnaire financeur s'instruit avant, et se justifie après. On le
  // range au début : c'est là qu'il conditionne la prise en charge.
  if (modele.kind === 'opco') return 'avant';
  return 'pendant';
}

/**
 * Ce qui déclenche l'envoi, en une phrase.
 *
 * Écrit ici et non dans l'écran : la même phrase doit se lire au même endroit
 * que le modèle, sans quoi on découvre le comportement réel en le subissant.
 * `null` = rien ne le déclenche tout seul, il s'envoie à la main.
 */
export function declencheurDuModele(modele: { kind: string; code?: string | null }): string | null {
  const code = modele.code ?? '';
  if (code === 'positionnement_default') {
    return 'À l’inscription d’un stagiaire sur un dossier. Un filet repasse dans les 48 h.';
  }
  if (code === 'satisfaction_formateur_default') {
    return 'Le lendemain d’un dossier passé en « terminé ».';
  }
  if (modele.kind === 'satisfaction_chaud' && code !== 'satisfaction_entreprise_default') {
    return 'À la fin de la formation, selon le délai réglé dans Automatisations.';
  }
  return null;
}
