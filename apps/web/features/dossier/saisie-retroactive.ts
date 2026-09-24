/**
 * Un dossier saisi après coup ne doit rien déclencher. Module pur.
 *
 * Tous les dossiers ne naissent pas avant la formation. Il arrive qu'on entre
 * une session déjà donnée — un client hors CRM, une régularisation, une reprise
 * d'historique. L'application, elle, traitait ces dossiers comme les autres :
 * elle envoyait une fiche besoin à quelqu'un qui avait fini sa formation,
 * réclamait un émargement pour une séance passée, et expédiait un questionnaire
 * de satisfaction « à chaud » des semaines après coup.
 *
 * La règle qui sépare les deux cas ne demande aucune donnée nouvelle : **une
 * automatisation ne se déclenche que pour un évènement postérieur à la saisie du
 * dossier**. Ce qui précède la saisie est de l'histoire, pas un planning. Une
 * case à cocher aurait exigé qu'on y pense à chaque fois ; la date de création
 * est déjà là et ne ment pas.
 *
 * S'y ajoutent deux règles évidentes : un dossier archivé, clôturé ou annulé ne
 * déclenche plus rien, et un dossier dont le financement est arrêté non plus
 * (21/09/2026).
 */

/** États dans lesquels un dossier ne produit plus aucun envoi. */
export const ETATS_TERMINAUX = ['archived', 'closed', 'cancelled'] as const;

export function estEtatTerminal(statut: string | null | undefined): boolean {
  return !!statut && (ETATS_TERMINAUX as readonly string[]).includes(statut);
}

/** Ramène un horodatage ou une date au jour, pour comparer des jours entre eux. */
export function jour(valeur: string | Date): string {
  return typeof valeur === 'string' ? valeur.slice(0, 10) : valeur.toISOString().slice(0, 10);
}

export type ContexteAutomatisation = {
  readonly statut: string | null | undefined;
  /**
   * Jour de l'évènement qui déclenche l'envoi : fin du dossier, début de la
   * séance, première signature. `null` quand il est inconnu — on n'invente pas.
   */
  readonly datePivot: string | null | undefined;
  /** Jour de saisie du dossier. */
  readonly creeLe: string | null | undefined;
  /**
   * Toutes les lignes de financement sont refusées ou annulées.
   *
   * Demandé en réunion du 21/09/2026 : un financement arrêté doit stopper les
   * envois. La règle est calculée, jamais stockée — revenir sur un statut rend
   * aussitôt les envois, sans qu'un drapeau oublié ne les retienne.
   */
  readonly financementArrete?: boolean;
};

/**
 * Cette automatisation a-t-elle lieu d'être ?
 *
 * Un évènement le jour même de la saisie reste valable : entrer un dossier le
 * dernier jour de la formation et envoyer le questionnaire le lendemain est un
 * usage normal. C'est l'évènement *antérieur* à la saisie qui est de l'histoire.
 */
export function automatisationApplicable(ctx: ContexteAutomatisation): boolean {
  if (estEtatTerminal(ctx.statut)) return false;
  if (ctx.financementArrete) return false;
  if (!ctx.datePivot || !ctx.creeLe) return true;
  return jour(ctx.datePivot) >= jour(ctx.creeLe);
}

/** Pourquoi un envoi a été retenu — pour l'écrire dans le rapport du cron. */
export function motifDuBlocage(ctx: ContexteAutomatisation): string | null {
  if (estEtatTerminal(ctx.statut)) return `dossier ${ctx.statut}`;
  if (ctx.financementArrete) return 'financement refusé ou annulé';
  if (!ctx.datePivot || !ctx.creeLe) return null;
  if (jour(ctx.datePivot) < jour(ctx.creeLe)) return 'saisi après la formation';
  return null;
}

/**
 * Le dossier qu'on est en train de créer porte-t-il une formation déjà finie ?
 *
 * Sert au moment de la saisie : plutôt que de naître « brouillon » puis de
 * suivre un cycle de vie qui n'aura jamais lieu, un tel dossier naît archivé.
 * Ses documents restent produisibles — archivé n'est pas supprimé.
 */
export function estFormationDejaTerminee(finFormation: string, aujourdhui: string | Date): boolean {
  return jour(finFormation) < jour(aujourdhui);
}

/**
 * Statut à donner à un dossier qu'on crée. Une formation déjà terminée entre
 * directement en archive ; tout le reste garde le statut demandé.
 */
export function statutALaCreation(input: {
  statutDemande: string;
  finFormation: string;
  aujourdhui: string | Date;
}): string {
  return estFormationDejaTerminee(input.finFormation, input.aujourdhui) ? 'archived' : input.statutDemande;
}
