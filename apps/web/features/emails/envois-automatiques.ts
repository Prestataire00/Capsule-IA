/**
 * Catalogue des e-mails que l'application envoie toute seule. Module pur.
 *
 * Ces envois étaient répartis dans le cron, la facturation et l'émargement :
 * personne ne pouvait dire ce qui partait, quand, ni à qui. Un organisme de
 * formation doit pouvoir répondre à cette question — devant un stagiaire qui
 * n'a rien reçu comme devant un auditeur Qualiopi.
 *
 * Chaque entrée décrit un envoi RÉEL du code, repéré par le `kind` écrit dans
 * `app.email_log`. Le rapprochement avec le journal se fait sur cette clé :
 * une entrée sans envoi est soit une automatisation qui n'a pas encore eu
 * l'occasion de partir, soit une automatisation en panne — et l'écran doit
 * laisser l'organisme faire la différence, pas trancher à sa place.
 */

export type Moment = 'avant' | 'pendant' | 'apres' | 'facturation';

export const MOMENT_LABELS: Record<Moment, string> = {
  avant: 'Avant la formation',
  pendant: 'Pendant la formation',
  apres: 'À la fin de la formation',
  facturation: 'Facturation',
};

export type EnvoiAutomatique = {
  /** Valeur écrite dans `email_log.kind` — la clé du rapprochement. */
  readonly kind: string;
  readonly nom: string;
  readonly moment: Moment;
  /** Ce qui déclenche l'envoi, en une phrase. */
  readonly declencheur: string;
  readonly destinataires: string;
  /** Clé de `AUTOMATION_KEYS` quand l'envoi se coupe séance par séance (0156). */
  readonly coupureKey: string | null;
  /** Pourquoi il ne se coupe pas, quand il ne se coupe pas. */
  readonly obligatoire: string | null;
};

export const ENVOIS_AUTOMATIQUES: readonly EnvoiAutomatique[] = [
  {
    kind: 'fiche_besoin',
    nom: 'Fiche besoin (positionnement)',
    moment: 'avant',
    declencheur: 'À l’inscription : dès qu’un stagiaire est rattaché à un dossier. Un filet repasse dans les 48 h.',
    destinataires: 'Le stagiaire',
    coupureKey: null,
    obligatoire: 'L’analyse du besoin est un attendu Qualiopi (indicateurs 4 et 5).',
  },
  {
    kind: 'nouvelle_demande',
    nom: 'Nouvelle demande (alerte interne)',
    moment: 'avant',
    declencheur: 'À l’arrivée d’une demande, qu’elle vienne du site ou d’une saisie au téléphone.',
    destinataires: 'Vous et les membres qui suivent les demandes — sauf celui qui vient de la saisir',
    coupureKey: null,
    obligatoire: 'Une demande que personne ne voit arriver est une demande qui attend.',
  },
  {
    kind: 'fiche_besoin_completee',
    nom: 'Fiche besoin complétée (alerte interne)',
    moment: 'avant',
    declencheur: 'Dès que le client a rempli sa fiche besoin depuis le lien reçu.',
    destinataires: 'Vous et les membres qui suivent les demandes',
    coupureKey: null,
    obligatoire: 'Sans elle, la réponse du client dort sur la demande jusqu’à ce qu’on pense à la rouvrir.',
  },
  {
    kind: 'convocation_j7',
    nom: 'Convocation',
    moment: 'avant',
    declencheur: 'Sept jours avant le début de la séance.',
    destinataires: 'Le stagiaire, et son entreprise ou le référent du dossier',
    coupureKey: 'convocation',
    obligatoire: null,
  },
  {
    kind: 'convocation_recap_entreprise',
    nom: 'Récapitulatif des convocations',
    moment: 'avant',
    declencheur: 'Juste après les convocations individuelles, pour la même séance.',
    destinataires: 'Le responsable de chaque entreprise cliente, pour tous ses inscrits',
    coupureKey: 'convocation',
    obligatoire: null,
  },
  {
    kind: 'emargement_lien',
    nom: 'Lien d’émargement',
    moment: 'pendant',
    declencheur: 'Au début de chaque demi-journée, si l’envoi automatique est activé dans les paramètres.',
    destinataires: 'Les stagiaires attendus et le formateur',
    coupureKey: 'emargement_liens',
    obligatoire: null,
  },
  {
    kind: 'attestation_demarrage',
    nom: 'Attestation d’entrée en formation',
    moment: 'pendant',
    declencheur: 'La nuit qui suit la première signature d’émargement du stagiaire.',
    destinataires: 'Le stagiaire',
    coupureKey: 'attestation_entree',
    obligatoire: null,
  },
  {
    kind: 'alerte_emargement',
    nom: 'Alerte émargement manquant',
    moment: 'pendant',
    declencheur: 'Séance terminée dont la feuille d’émargement n’a pas été finalisée.',
    destinataires: 'Le ou les formateurs de la séance, et l’adresse de notification de l’organisme',
    coupureKey: 'alerte_emargement',
    obligatoire: null,
  },
  {
    kind: 'satisfaction_chaud',
    nom: 'Questionnaire de satisfaction à chaud',
    moment: 'apres',
    declencheur: 'Le lendemain de la fin du dossier.',
    destinataires: 'Le stagiaire — son avis est personnel, l’employeur ne le reçoit pas',
    coupureKey: 'satisfaction',
    obligatoire: null,
  },
  {
    kind: 'fin_de_formation',
    nom: 'Fin de formation (attestation et certificat)',
    moment: 'apres',
    declencheur: 'Le lendemain de la fin du dossier.',
    destinataires: 'Le stagiaire',
    coupureKey: 'fin_formation',
    obligatoire: null,
  },
  {
    kind: 'certificat_entreprise',
    nom: 'Certificat de réalisation à l’entreprise',
    moment: 'apres',
    declencheur: 'Le lendemain de la fin du dossier, avec le PDF joint.',
    destinataires: 'Le responsable de l’entreprise cliente',
    coupureKey: null,
    obligatoire: 'Pièce administrative due à l’entreprise qui finance : elle part même si les autres envois sont coupés.',
  },
  {
    kind: 'satisfaction_formateur',
    nom: 'Retour du formateur',
    moment: 'apres',
    declencheur: 'Le lendemain de la fin du dossier.',
    destinataires: 'Chaque formateur du dossier',
    coupureKey: 'retour_formateur',
    obligatoire: null,
  },
  {
    kind: 'quote_sent',
    nom: 'Rappel de signature du devis',
    moment: 'facturation',
    declencheur: 'Trois jours avant l’expiration d’un devis envoyé mais non signé.',
    destinataires: 'Le client (entreprise ou particulier)',
    coupureKey: null,
    obligatoire: 'Se règle pour tout l’organisme dans Paramètres → Facturation (relances automatiques).',
  },
  {
    kind: 'invoice_reminder_auto',
    nom: 'Relance de paiement',
    moment: 'facturation',
    declencheur: 'Le lendemain de l’échéance, puis tous les quinze jours, trois relances au plus.',
    destinataires: 'Le payeur de la facture',
    coupureKey: null,
    obligatoire: 'Se règle pour tout l’organisme dans Paramètres → Facturation (relances automatiques).',
  },
];

/** Le préfixe des règles définies dans Programmation : `schedule:<id>`. */
export const PREFIXE_PROGRAMMATION = 'schedule:';

export type Compteur = {
  /** Envois réussis sur la période observée. */
  readonly envoyes: number;
  readonly echecs: number;
  /** Date du dernier envoi, réussi ou non. `null` = jamais vu partir. */
  readonly dernier: string | null;
};

export const COMPTEUR_VIDE: Compteur = { envoyes: 0, echecs: 0, dernier: null };

export type LigneEnvoi = EnvoiAutomatique & {
  readonly compteur: Compteur;
  readonly alerte: AlerteEnvoi | null;
};

export type AlerteEnvoi = 'jamais_parti' | 'en_echec';

/**
 * Ce qui mérite d'être signalé sur une ligne.
 *
 * « Jamais parti » n'est pas une panne en soi : un organisme qui n'a fini
 * aucun dossier sur la période n'a aucune raison d'avoir envoyé un certificat.
 * C'est pour cela que le libellé reste factuel et que l'échec, lui, est traité
 * à part : un envoi qui échoue est un problème, quoi qu'il arrive.
 */
export function alerteDe(compteur: Compteur): AlerteEnvoi | null {
  if (compteur.echecs > 0) return 'en_echec';
  if (compteur.envoyes === 0) return 'jamais_parti';
  return null;
}

/** Croise le catalogue et le journal. Les `kind` absents du journal valent zéro. */
export function lignesEnvois(
  compteurs: ReadonlyMap<string, Compteur>,
  catalogue: readonly EnvoiAutomatique[] = ENVOIS_AUTOMATIQUES,
): LigneEnvoi[] {
  return catalogue.map((e) => {
    const compteur = compteurs.get(e.kind) ?? COMPTEUR_VIDE;
    return { ...e, compteur, alerte: alerteDe(compteur) };
  });
}

/** Regroupe par moment du parcours, dans l'ordre où les choses arrivent. */
export function parMoment(lignes: readonly LigneEnvoi[]): Array<{ moment: Moment; lignes: LigneEnvoi[] }> {
  const ordre: Moment[] = ['avant', 'pendant', 'apres', 'facturation'];
  return ordre
    .map((moment) => ({ moment, lignes: lignes.filter((l) => l.moment === moment) }))
    .filter((g) => g.lignes.length > 0);
}

/**
 * Compte les lignes du journal par `kind`. Les envois issus d'une règle de
 * Programmation (`schedule:<id>`) sont rassemblés sous une clé unique : leur
 * détail se lit sur la page Programmation, pas ici.
 */
export function compterParKind(
  lignes: ReadonlyArray<{ kind: string | null; status: string; sent_at: string }>,
): Map<string, Compteur> {
  const compteurs = new Map<string, Compteur>();
  for (const l of lignes) {
    if (!l.kind) continue;
    const cle = l.kind.startsWith(PREFIXE_PROGRAMMATION) ? PREFIXE_PROGRAMMATION : l.kind;
    const actuel = compteurs.get(cle) ?? COMPTEUR_VIDE;
    compteurs.set(cle, {
      envoyes: actuel.envoyes + (l.status === 'sent' ? 1 : 0),
      echecs: actuel.echecs + (l.status === 'failed' ? 1 : 0),
      dernier: actuel.dernier && actuel.dernier > l.sent_at ? actuel.dernier : l.sent_at,
    });
  }
  return compteurs;
}
