/**
 * Réglage des envois automatiques par l'organisme (0178). Module pur.
 *
 * Trois règles portent tout le reste :
 *
 *  1. **Pas de réglage = le défaut du code.** Une ligne absente n'est pas un
 *     envoi coupé ni un délai nul : c'est « je n'ai rien demandé de spécial ».
 *     Sans cela, poser la table aurait éteint les envois de tout le monde.
 *  2. **Le sens du délai appartient au type d'envoi**, jamais au réglage. Une
 *     convocation part avant, un questionnaire de satisfaction après. Stocker
 *     un signe autoriserait « convoquer trois jours après la séance ».
 *  3. **Un délai ne se règle que là où il veut dire quelque chose.** « Dès
 *     l'inscription » ou « au début de la demi-journée » n'ont pas de nombre de
 *     jours à offrir ; proposer un champ vide y serait un piège.
 */

export type SensDelai = 'avant' | 'apres';

export type DelaiReglable = {
  /** Ce que fait le code quand l'organisme n'a rien réglé. */
  readonly defaut: number;
  readonly min: number;
  readonly max: number;
  readonly sens: SensDelai;
  /** Complète la phrase « … 7 jours <libelle> ». */
  readonly libelle: string;
};

export type Reglable = {
  /** L'organisme peut-il couper cet envoi pour tout l'organisme ? */
  readonly coupable: boolean;
  /** `null` quand le moment de l'envoi n'a pas de délai à régler. */
  readonly delai: DelaiReglable | null;
};

/**
 * Ce qui est réglable, envoi par envoi. Les délais repris ici sont ceux que le
 * code applique réellement aujourd'hui : c'est la condition pour que ne rien
 * toucher ne change rien.
 */
export const REGLABLES: Readonly<Record<string, Reglable>> = {
  fiche_besoin: { coupable: false, delai: null },
  // Alerte interne : elle part au moment où le client répond, il n'y a rien à
  // décaler. La couper reviendrait à ne pas être prévenu du tout.
  fiche_besoin_completee: { coupable: false, delai: null },
  nouvelle_demande: { coupable: false, delai: null },
  convocation_j7: {
    coupable: true,
    delai: { defaut: 7, min: 1, max: 60, sens: 'avant', libelle: 'avant le début de la séance' },
  },
  // Le récapitulatif suit les convocations individuelles : lui donner son
  // propre délai le ferait partir un jour où rien n'a été convoqué.
  convocation_recap_entreprise: { coupable: true, delai: null },
  emargement_lien: { coupable: true, delai: null },
  attestation_demarrage: { coupable: true, delai: null },
  alerte_emargement: { coupable: true, delai: null },
  satisfaction_chaud: {
    coupable: true,
    delai: { defaut: 1, min: 0, max: 30, sens: 'apres', libelle: 'après la fin du dossier' },
  },
  fin_de_formation: {
    coupable: true,
    delai: { defaut: 1, min: 0, max: 30, sens: 'apres', libelle: 'après la fin du dossier' },
  },
  // Pièce due à l'entreprise qui finance : le moment se règle, l'envoi non.
  certificat_entreprise: {
    coupable: false,
    delai: { defaut: 1, min: 0, max: 30, sens: 'apres', libelle: 'après la fin du dossier' },
  },
  satisfaction_formateur: {
    coupable: true,
    delai: { defaut: 1, min: 0, max: 30, sens: 'apres', libelle: 'après la fin du dossier' },
  },
  quote_sent: { coupable: false, delai: null },
  invoice_reminder_auto: { coupable: false, delai: null },
};

export type Reglage = {
  readonly actif: boolean;
  readonly delaiJours: number;
};

/** Ligne de `app.email_automation_rules`, telle que la base la rend. */
export type RegleEnregistree = {
  readonly kind: string;
  readonly enabled: boolean;
  readonly delayDays: number;
};

export function estReglable(kind: string): boolean {
  return Object.prototype.hasOwnProperty.call(REGLABLES, kind);
}

export function reglableDe(kind: string): Reglable | null {
  return REGLABLES[kind] ?? null;
}

/** Le réglage d'origine du code, pour un type d'envoi. */
export function reglageParDefaut(kind: string): Reglage {
  return { actif: true, delaiJours: reglableDe(kind)?.delai?.defaut ?? 0 };
}

/**
 * Ce qui s'applique réellement : la règle enregistrée quand il y en a une, le
 * défaut du code sinon.
 *
 * Un délai enregistré hors bornes est ignoré au profit du défaut. La base le
 * borne déjà (0 à 90), mais les bornes utiles sont propres à chaque envoi et
 * peuvent se resserrer avec le temps : mieux vaut retomber sur un défaut
 * connu que d'envoyer une convocation soixante jours avant.
 */
export function reglageEffectif(kind: string, regle: RegleEnregistree | null | undefined): Reglage {
  const defaut = reglageParDefaut(kind);
  if (!regle) return defaut;
  const reglable = reglableDe(kind);
  const actif = reglable?.coupable === false ? true : regle.enabled;
  if (!reglable?.delai) return { actif, delaiJours: defaut.delaiJours };
  const dansLesBornes = regle.delayDays >= reglable.delai.min && regle.delayDays <= reglable.delai.max;
  return { actif, delaiJours: dansLesBornes ? regle.delayDays : reglable.delai.defaut };
}

/** Ce qu'un écran refuse d'enregistrer, et pourquoi. */
export function problemesDuReglage(
  kind: string,
  saisie: { actif: boolean; delaiJours: number },
): string[] {
  const reglable = reglableDe(kind);
  if (!reglable) return [`Type d’envoi inconnu : ${kind}`];
  const problemes: string[] = [];
  if (!saisie.actif && !reglable.coupable) {
    problemes.push('Cet envoi ne peut pas être coupé pour tout l’organisme.');
  }
  if (reglable.delai) {
    if (!Number.isInteger(saisie.delaiJours)) {
      problemes.push('Le délai doit être un nombre entier de jours.');
    } else if (saisie.delaiJours < reglable.delai.min || saisie.delaiJours > reglable.delai.max) {
      problemes.push(
        `Le délai doit être compris entre ${reglable.delai.min} et ${reglable.delai.max} jours.`,
      );
    }
  }
  return problemes;
}

/** Phrase affichée sous un envoi : « 7 jours avant le début de la séance ». */
export function phraseDuDelai(kind: string, reglage: Reglage): string | null {
  const delai = reglableDe(kind)?.delai;
  if (!delai) return null;
  if (reglage.delaiJours === 0) {
    return delai.sens === 'apres' ? `Le jour même, ${delai.libelle}` : `Le jour même ${delai.libelle}`;
  }
  const jours = `${reglage.delaiJours} jour${reglage.delaiJours > 1 ? 's' : ''}`;
  return `${jours} ${delai.libelle}`;
}

/**
 * Tous les délais que le cron doit examiner aujourd'hui pour un type d'envoi :
 * le défaut, plus chaque délai réglé par un organisme.
 *
 * C'est ce qui permet d'interroger la base une seule fois, sur une fenêtre qui
 * couvre tout le monde, au lieu d'une requête par organisme.
 */
export function delaisAConsiderer(
  kind: string,
  regles: ReadonlyMap<string, RegleEnregistree>,
): number[] {
  const delais = new Set<number>([reglageParDefaut(kind).delaiJours]);
  for (const [, regle] of regles) delais.add(reglageEffectif(kind, regle).delaiJours);
  return [...delais].sort((a, b) => a - b);
}

/**
 * Cet envoi doit-il partir aujourd'hui, pour cet organisme, sachant l'écart en
 * jours entre aujourd'hui et la date pivot de la ligne examinée ?
 *
 * `ecartJours` est toujours positif : le sens est porté par le type d'envoi.
 */
export function doitPartirAujourdhui(input: {
  kind: string;
  organizationId: string;
  regles: ReadonlyMap<string, RegleEnregistree>;
  ecartJours: number;
}): boolean {
  const reglage = reglageEffectif(input.kind, input.regles.get(input.organizationId));
  return reglage.actif && reglage.delaiJours === input.ecartJours;
}

/** Les organismes qui ont coupé ce type d'envoi — rien d'autre à leur envoyer. */
export function organisationsQuiOntCoupe(
  kind: string,
  regles: ReadonlyMap<string, RegleEnregistree>,
): Set<string> {
  const coupees = new Set<string>();
  for (const [organizationId, regle] of regles) {
    if (!reglageEffectif(kind, regle).actif) coupees.add(organizationId);
  }
  return coupees;
}
