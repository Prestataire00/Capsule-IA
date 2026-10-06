// Suivi des questionnaires d'un dossier : ce qui est parti, à qui, et si l'on
// a eu réponse. Les e-mails sont suivis à part, car un même e-mail au référent
// porte souvent les liens de plusieurs stagiaires.

export type Destinataire = 'learner' | 'company_rep' | 'trainer' | 'funder';

export type Ton = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export type EnvoiQuestionnaire = {
  readonly id: string;
  readonly questionnaire: string;
  readonly modeleId: string;
  readonly destinataire: Destinataire;
  readonly nom: string;
  readonly email: string | null;
  readonly envoyeLe: string;
  readonly relances: number;
  readonly derniereRelance: string | null;
  readonly echeance: string | null;
  readonly status: string;
  readonly reponduLe: string | null;
};

export type Courriel = {
  readonly id: string;
  readonly kind: string | null;
  readonly destinataire: string;
  readonly sujet: string | null;
  readonly status: string | null;
  readonly envoyeLe: string | null;
  readonly delivreLe: string | null;
  readonly ouvertLe: string | null;
  readonly cliqueLe: string | null;
  readonly rebondLe: string | null;
};

const TYPE_QUESTIONNAIRE: Record<string, string> = {
  positionnement: 'Positionnement',
  satisfaction_chaud: 'Satisfaction à chaud',
  satisfaction_froid: 'Satisfaction à froid',
  evaluation_acquis: 'Évaluation des acquis',
  satisfaction_formateur: 'Satisfaction formateur',
  opco: 'OPCO',
};

/** Le nom à afficher : le type quand il est connu, sinon le titre du modèle. */
export const libelleQuestionnaire = (kind: string | null, titre: string | null): string =>
  (kind ? TYPE_QUESTIONNAIRE[kind] : undefined) ?? titre?.trim() ?? 'Questionnaire';

export const LIBELLE_DESTINATAIRE: Record<Destinataire, string> = {
  learner: 'Apprenant',
  company_rep: 'Entreprise',
  trainer: 'Formateur',
  funder: 'Financeur',
};

export const estDestinataire = (v: string): v is Destinataire => v in LIBELLE_DESTINATAIRE;

/**
 * L'état d'un questionnaire. Passé l'échéance sans réponse, il est « en
 * retard » : c'est celui qu'il faut relancer.
 */
export function etatEnvoi(e: Pick<EnvoiQuestionnaire, 'status' | 'echeance'>, maintenant: Date): { libelle: string; ton: Ton } {
  if (e.status === 'completed') return { libelle: 'Répondu', ton: 'success' };
  if (e.status === 'expired') return { libelle: 'Expiré', ton: 'danger' };
  if (e.echeance && new Date(e.echeance).getTime() < maintenant.getTime()) return { libelle: 'En retard', ton: 'warning' };
  if (e.status === 'in_progress') return { libelle: 'Commencé', ton: 'info' };
  return { libelle: 'En attente', ton: 'neutral' };
}

/** Les envois les plus récents d'abord ; à date égale, l'ordre des destinataires. */
export function trierEnvois(envois: readonly EnvoiQuestionnaire[]): EnvoiQuestionnaire[] {
  const ordre: Destinataire[] = ['learner', 'company_rep', 'trainer', 'funder'];
  return [...envois].sort(
    (a, b) => b.envoyeLe.localeCompare(a.envoyeLe) || ordre.indexOf(a.destinataire) - ordre.indexOf(b.destinataire),
  );
}

export function compterEnvois(envois: readonly EnvoiQuestionnaire[]): {
  envoyes: number;
  repondus: number;
  enAttente: number;
  tauxReponse: number | null;
} {
  const repondus = envois.filter((e) => e.status === 'completed').length;
  const envoyes = envois.length;
  return {
    envoyes,
    repondus,
    enAttente: envois.filter((e) => e.status !== 'completed' && e.status !== 'expired').length,
    tauxReponse: envoyes === 0 ? null : Math.round((repondus / envoyes) * 100),
  };
}

/** Les e-mails qui portent un questionnaire, une fiche besoin ou leur relance. */
export const KINDS_COURRIEL_QUESTIONNAIRE = [
  'fiche_besoin',
  'positionnement',
  'satisfaction_chaud',
  'satisfaction_froid',
  'satisfaction_formateur',
  'satisfaction_entreprise',
  'evaluation_acquis',
  'evaluations_fin',
  'questionnaire_invitation',
  'questionnaire_entreprise',
  'questionnaire_financeur',
  'relance_questionnaire',
  'relance_satisfaction',
  'relance_satisfaction_referent',
] as const;

const LIBELLE_COURRIEL: Record<string, string> = {
  fiche_besoin: 'Fiche besoin',
  positionnement: 'Positionnement',
  satisfaction_chaud: 'Satisfaction à chaud',
  satisfaction_froid: 'Satisfaction à froid',
  satisfaction_formateur: 'Satisfaction formateur',
  satisfaction_entreprise: 'Satisfaction entreprise',
  evaluation_acquis: 'Évaluation des acquis',
  evaluations_fin: 'Évaluations de fin',
  questionnaire_invitation: 'Questionnaire du formateur',
  questionnaire_entreprise: 'Questionnaire entreprise',
  questionnaire_financeur: 'Questionnaire financeur',
  relance_questionnaire: 'Relance',
  relance_satisfaction: 'Relance automatique',
  relance_satisfaction_referent: 'Relance au référent',
};

export const libelleCourriel = (kind: string | null): string => (kind ? LIBELLE_COURRIEL[kind] : undefined) ?? 'Questionnaire';

/**
 * Ce que l'on sait de l'e-mail, du plus parlant au moins parlant. Un rebond
 * l'emporte sur tout : l'adresse est fausse et la personne n'a rien reçu.
 */
export function etatCourriel(c: Courriel): { libelle: string; ton: Ton } {
  if (c.rebondLe) return { libelle: 'Adresse en échec', ton: 'danger' };
  if (c.status === 'failed') return { libelle: 'Non parti', ton: 'danger' };
  if (c.cliqueLe) return { libelle: 'Lien ouvert', ton: 'success' };
  if (c.ouvertLe) return { libelle: 'Lu', ton: 'success' };
  if (c.delivreLe) return { libelle: 'Délivré', ton: 'info' };
  if (c.status === 'pending') return { libelle: 'En cours d’envoi', ton: 'neutral' };
  return { libelle: 'Envoyé', ton: 'neutral' };
}
