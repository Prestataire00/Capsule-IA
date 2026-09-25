/**
 * Ce qui mérite votre attention aujourd'hui. Module pur.
 *
 * L'accueil affiche quatre chiffres, et la vérité est éparpillée sur dix
 * écrans : un OPCO qui ne répond pas vit sur la fiche financeur, des heures qui
 * dérivent sur l'onglet Heures, une convocation jamais ouverte dans le journal
 * des e-mails. Il faut aller voir, donc on ne voit pas.
 *
 * Ce module ne va rien chercher : on lui donne des lignes, il rend des signaux
 * datés, expliqués et classés. Il s'y tient à la règle de l'organisme — **ne
 * rien calculer, prendre ce qui est écrit**. Un signal n'invente pas un risque :
 * il constate un fait daté (déposé le, expire le, non ouvert depuis) et dit ce
 * qu'il implique.
 *
 * Trois choses qu'un signal doit toujours porter, sans quoi il devient du
 * bruit : POURQUOI il se déclenche, QUAND ça devient un problème, et OÙ agir.
 */

export type Gravite = 'bloquant' | 'urgent' | 'a_surveiller';

export const GRAVITE_LABELS: Record<Gravite, string> = {
  bloquant: 'Bloquant',
  urgent: 'Urgent',
  a_surveiller: 'À surveiller',
};

export type Signal = {
  /** Identifie le détecteur — sert au regroupement et aux tests. */
  readonly code: string;
  readonly titre: string;
  /** Le fait constaté, en une phrase. Jamais un conseil vague. */
  readonly detail: string;
  readonly gravite: Gravite;
  /** Jour où l'affaire devient un problème. `null` si elle l'est déjà. */
  readonly echeance: string | null;
  /** Argent en jeu, quand il est connu. Départage à gravité égale. */
  readonly montantCents: number | null;
  readonly href: string;
};

const JOUR_MS = 86_400_000;

export const jour = (v: string | Date): string =>
  typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);

/** Jours entre deux dates. Négatif quand `date` est déjà passée. */
export function joursAvant(date: string, aujourdhui: string | Date): number {
  const a = Date.parse(`${jour(date)}T00:00:00Z`);
  const b = Date.parse(`${jour(aujourdhui)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((a - b) / JOUR_MS);
}

const ORDRE_GRAVITE: Record<Gravite, number> = { bloquant: 0, urgent: 1, a_surveiller: 2 };

/**
 * Classe les signaux : d'abord ce qui bloque, puis ce qui arrive le plus vite,
 * puis ce qui coûte le plus cher.
 *
 * L'échéance passe avant l'argent volontairement. Un gros dossier dont
 * l'échéance est dans un mois attend ; un petit dossier dont le devis expire
 * demain, non. Trier par montant d'abord ferait manquer les petites urgences,
 * qui sont les plus nombreuses.
 */
export function classer(signaux: readonly Signal[], aujourdhui: string | Date): Signal[] {
  return [...signaux].sort((a, b) => {
    const g = ORDRE_GRAVITE[a.gravite] - ORDRE_GRAVITE[b.gravite];
    if (g !== 0) return g;

    // Sans échéance = déjà en retard : ça passe devant.
    const ea = a.echeance === null ? -Infinity : joursAvant(a.echeance, aujourdhui);
    const eb = b.echeance === null ? -Infinity : joursAvant(b.echeance, aujourdhui);
    if (ea !== eb) return ea - eb;

    return (b.montantCents ?? 0) - (a.montantCents ?? 0);
  });
}

/** Combien de signaux par gravité — l'en-tête de l'écran. */
export function compterParGravite(signaux: readonly Signal[]): Record<Gravite, number> {
  return signaux.reduce(
    (acc, s) => ({ ...acc, [s.gravite]: acc[s.gravite] + 1 }),
    { bloquant: 0, urgent: 0, a_surveiller: 0 } as Record<Gravite, number>,
  );
}

// ── Détecteurs ──────────────────────────────────────────────────────────────
// Un par signal, tous purs : on leur donne les lignes, ils rendent des signaux.

export type LigneFinanceur = {
  readonly dossierId: string;
  readonly reference: string;
  readonly financeur: string;
  readonly statut: string;
  readonly deposeLe: string | null;
  readonly montantCents: number | null;
};

/**
 * Un financeur qui n'a pas répondu depuis trop longtemps.
 *
 * Le délai n'est pas une norme, c'est un seuil d'attention : passé trois
 * semaines, une demande OPCO se relance. On le rend paramétrable plutôt que de
 * le figer, parce qu'il dépend du financeur.
 */
export function financeursSansReponse(
  lignes: readonly LigneFinanceur[],
  aujourdhui: string | Date,
  seuilJours = 21,
): Signal[] {
  return lignes
    .filter((l) => l.statut === 'submitted' && l.deposeLe !== null)
    .map((l) => {
      const depuis = -joursAvant(l.deposeLe!, aujourdhui);
      return { l, depuis };
    })
    .filter(({ depuis }) => depuis >= seuilJours)
    .map(({ l, depuis }) => ({
      code: 'financeur_sans_reponse',
      titre: `${l.financeur} n’a pas répondu — ${l.reference}`,
      detail: `Demande déposée il y a ${depuis} jours, toujours sans décision.`,
      gravite: 'urgent' as const,
      echeance: null,
      montantCents: l.montantCents,
      href: `/dossiers/${l.dossierId}/financeurs`,
    }));
}

/**
 * En dessous, le volume « financé » est le minimum que la base exige
 * (`total_hours > 0`), pas une donnée saisie. Les dossiers créés sans durée
 * connue s'y retrouvent tous.
 */
const VOLUME_PLANCHER = 1;

export type LigneHeures = {
  readonly dossierId: string;
  readonly reference: string;
  readonly heuresFinancees: number;
  readonly heuresProjetees: number;
  readonly aRisque: boolean;
  readonly finLe: string | null;
};

/**
 * Un dossier qui va délivrer moins d'heures que ce qui est financé.
 *
 * C'est de l'argent à rendre, et ça se voit au dernier moment. Le drapeau est
 * déjà calculé en base ; il ne servait qu'à afficher un bandeau sur une page
 * qu'il faut penser à ouvrir.
 */
export function heuresSousLeVolume(
  lignes: readonly LigneHeures[],
  aujourdhui: string | Date,
): Signal[] {
  return lignes
    .filter(
      (l) =>
        l.aRisque &&
        l.heuresProjetees < l.heuresFinancees &&
        // Un dossier à 1 h porte le minimum que la base exige, pas un volume
        // financé : annoncer « 1 h manquante sur 1 h » ne dit rien de vrai.
        l.heuresFinancees > VOLUME_PLANCHER &&
        // Sous la demi-heure, l'écart relève de l'arrondi.
        l.heuresFinancees - l.heuresProjetees >= 0.5,
    )
    .map((l) => {
      const manque = Math.round((l.heuresFinancees - l.heuresProjetees) * 100) / 100;
      const reste = l.finLe ? joursAvant(l.finLe, aujourdhui) : null;
      return {
        code: 'heures_sous_volume',
        titre: `Heures sous le volume financé — ${l.reference}`,
        detail:
          `${manque} h manquantes sur ${l.heuresFinancees} h financées` +
          (reste !== null && reste >= 0 ? `, ${reste} jour(s) pour rattraper.` : '.'),
        // Après la fin, il n'y a plus rien à rattraper : ça devient bloquant.
        gravite: reste !== null && reste < 0 ? ('bloquant' as const) : ('urgent' as const),
        echeance: l.finLe,
        montantCents: null,
        href: `/dossiers/${l.dossierId}/heures`,
      };
    });
}

export type LigneConvocation = {
  readonly dossierId: string;
  readonly sessionId: string;
  readonly intitule: string;
  readonly destinataire: string;
  readonly envoyeeLe: string;
  readonly ouverte: boolean;
  readonly seanceLe: string;
};

/**
 * Une convocation partie mais jamais ouverte, à la veille de la séance.
 *
 * Le suivi d'ouverture existe et ne sert qu'à afficher un pourcentage. C'est
 * pourtant le seul moyen de rattraper un stagiaire avant qu'il ne manque sa
 * formation — et la seule preuve, en cas de litige, qu'on a vu venir.
 */
export function convocationsNonOuvertes(
  lignes: readonly LigneConvocation[],
  aujourdhui: string | Date,
  fenetreJours = 3,
): Signal[] {
  return lignes
    .filter((l) => !l.ouverte)
    .map((l) => ({ l, avant: joursAvant(l.seanceLe, aujourdhui) }))
    .filter(({ avant }) => avant >= 0 && avant <= fenetreJours)
    .map(({ l, avant }) => ({
      code: 'convocation_non_ouverte',
      titre: `Convocation non ouverte — ${l.destinataire}`,
      detail:
        `Envoyée le ${jour(l.envoyeeLe)}, jamais ouverte. ` +
        (avant === 0 ? 'La séance est aujourd’hui.' : `Séance dans ${avant} jour(s).`),
      gravite: avant <= 1 ? ('urgent' as const) : ('a_surveiller' as const),
      echeance: jour(l.seanceLe),
      montantCents: null,
      href: `/sessions/${l.sessionId}`,
    }));
}

export type LigneDevis = {
  readonly devisId: string;
  readonly reference: string;
  readonly client: string;
  readonly statut: string;
  readonly valideJusquau: string;
  readonly totalCents: number;
};

/** Un devis envoyé qui va expirer sans signature. */
export function devisQuiExpirent(
  lignes: readonly LigneDevis[],
  aujourdhui: string | Date,
  fenetreJours = 7,
): Signal[] {
  return lignes
    .filter((l) => l.statut === 'sent')
    .map((l) => ({ l, avant: joursAvant(l.valideJusquau, aujourdhui) }))
    .filter(({ avant }) => avant <= fenetreJours)
    .map(({ l, avant }) => ({
      code: 'devis_expire',
      titre:
        avant < 0
          ? `Devis expiré — ${l.client}`
          : `Devis bientôt expiré — ${l.client}`,
      detail:
        avant < 0
          ? `${l.reference} a expiré il y a ${-avant} jour(s) sans signature.`
          : `${l.reference} expire ${avant === 0 ? 'aujourd’hui' : `dans ${avant} jour(s)`}, toujours non signé.`,
      gravite: avant < 0 ? ('bloquant' as const) : ('urgent' as const),
      echeance: l.valideJusquau,
      montantCents: l.totalCents,
      href: `/devis/${l.devisId}`,
    }));
}

export type LigneSeance = {
  readonly sessionId: string;
  readonly intitule: string;
  readonly debutLe: string;
  readonly aUnFormateur: boolean;
  readonly aDesParticipants: boolean;
};

/**
 * Une séance qui approche sans formateur, ou sans personne à former.
 *
 * Les deux empêchent la séance d'avoir lieu, et les deux se découvrent
 * d'ordinaire la veille.
 */
export function seancesIncompletes(
  lignes: readonly LigneSeance[],
  aujourdhui: string | Date,
  fenetreJours = 10,
): Signal[] {
  return lignes
    .map((l) => ({ l, avant: joursAvant(l.debutLe, aujourdhui) }))
    .filter(({ l, avant }) => avant >= 0 && avant <= fenetreJours && (!l.aUnFormateur || !l.aDesParticipants))
    .map(({ l, avant }) => {
      const manques = [
        !l.aUnFormateur ? 'aucun formateur désigné' : null,
        !l.aDesParticipants ? 'aucun participant inscrit' : null,
      ].filter(Boolean);
      return {
        code: 'seance_incomplete',
        titre: `Séance incomplète — ${l.intitule}`,
        detail: `${manques.join(', ')}. Séance ${avant === 0 ? 'aujourd’hui' : `dans ${avant} jour(s)`}.`,
        gravite: avant <= 3 ? ('bloquant' as const) : ('urgent' as const),
        echeance: jour(l.debutLe),
        montantCents: null,
        href: `/sessions/${l.sessionId}`,
      };
    });
}

export type LigneQualiopi = {
  readonly dossierId: string;
  readonly reference: string;
  readonly bloquantsManquants: number;
  readonly debutLe: string | null;
};

/**
 * Un dossier dont des indicateurs Qualiopi bloquants manquent, alors que la
 * formation démarre bientôt. Après le démarrage, la preuve devient une
 * reconstitution — c'est exactement ce qu'un audit sanctionne.
 */
export function qualiopiBloquant(
  lignes: readonly LigneQualiopi[],
  aujourdhui: string | Date,
  fenetreJours = 14,
  /**
   * Au-delà, le dossier n'est plus une urgence du jour mais un arriéré : il
   * relève de l'écran Qualiopi, pas de la liste du matin. Sans cette borne,
   * une formation de mars réapparaissait chaque jour pendant six mois et
   * noyait tout le reste — constaté sur les données réelles le 25/09/2026.
   */
  arriereJours = 30,
): Signal[] {
  return lignes
    .filter((l) => l.bloquantsManquants > 0 && l.debutLe !== null)
    .map((l) => ({ l, avant: joursAvant(l.debutLe!, aujourdhui) }))
    .filter(({ avant }) => avant <= fenetreJours && avant >= -arriereJours)
    .map(({ l, avant }) => ({
      code: 'qualiopi_bloquant',
      titre: `${l.bloquantsManquants} indicateur(s) bloquant(s) — ${l.reference}`,
      detail:
        avant < 0
          ? `La formation a démarré il y a ${-avant} jour(s) : la preuve devra être reconstituée.`
          : `Démarrage ${avant === 0 ? 'aujourd’hui' : `dans ${avant} jour(s)`}.`,
      // Tant que la formation n'a pas commencé, la preuve se constitue encore :
      // c'est bloquant. Après, elle se reconstitue — ennuyeux, plus urgent.
      gravite: avant >= 0 ? ('bloquant' as const) : ('a_surveiller' as const),
      echeance: l.debutLe,
      montantCents: null,
      href: `/dossiers/${l.dossierId}/qualiopi`,
    }));
}

/**
 * Ce que la liste du jour laisse volontairement de côté : les dossiers dont la
 * conformité est en retard depuis trop longtemps. Un chiffre, pas vingt lignes
 * — à afficher comme un rappel, avec un lien vers l'écran Qualiopi.
 */
export function arriereQualiopi(
  lignes: readonly LigneQualiopi[],
  aujourdhui: string | Date,
  arriereJours = 30,
): { dossiers: number; indicateurs: number } {
  const vieux = lignes.filter(
    (l) =>
      l.bloquantsManquants > 0 &&
      l.debutLe !== null &&
      joursAvant(l.debutLe, aujourdhui) < -arriereJours,
  );
  return {
    dossiers: vieux.length,
    indicateurs: vieux.reduce((t, l) => t + l.bloquantsManquants, 0),
  };
}
