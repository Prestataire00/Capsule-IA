/**
 * Étapes d'avancement validées à la main (0194). Module pur.
 *
 * L'avancement se déduit des données réelles, et c'était un bon parti pris :
 * rien à cocher, donc rien qui puisse mentir. Il ne tient pas jusqu'au bout —
 * une convention se signe sur papier, un règlement arrive par chèque, l'analyse
 * du besoin se fait au téléphone. Le dossier restait bloqué sur une étape
 * pourtant franchie.
 *
 * La règle qui sauve l'honnêteté du tableau : **une validation manuelle ne se
 * déguise jamais en fait constaté**. Elle s'ajoute à la déduction, garde qui l'a
 * posée, et cède le pas dès que la preuve arrive. Mieux : quand les données
 * démentent ensuite une validation manuelle, on le signale plutôt que de
 * l'effacer — c'est exactement ce qu'un auditeur voudra voir.
 */

export type EtapeDeduite = {
  readonly key: string;
  readonly done: boolean;
  readonly at: string | null;
};

export type ValidationManuelle = {
  readonly stepKey: string;
  readonly validatedAt: string;
  readonly par: string | null;
  readonly note: string | null;
};

/** D'où vient le fait qu'une étape soit franchie. */
export type Origine = 'constate' | 'manuel';

export type EtapeAvancement<T extends EtapeDeduite> = T & {
  readonly done: boolean;
  readonly at: string | null;
  readonly origine: Origine | null;
  readonly validePar: string | null;
  readonly note: string | null;
  /**
   * Validée à la main, puis constatée dans les données. Rien à corriger, mais
   * l'écran peut le dire : la preuve a fini par arriver.
   */
  readonly confirmeeDepuis: boolean;
};

/**
 * Croise les étapes déduites et les validations manuelles.
 *
 * Le constat prime sur la validation manuelle pour la date affichée : si la
 * preuve existe, c'est elle qui fait foi. La validation reste visible, parce
 * qu'elle explique pourquoi l'étape avait été franchie avant.
 */
export function fusionnerAvancement<T extends EtapeDeduite>(
  etapes: readonly T[],
  validations: readonly ValidationManuelle[],
): Array<EtapeAvancement<T>> {
  const parCle = new Map(validations.map((v) => [v.stepKey, v]));

  return etapes.map((etape) => {
    const manuelle = parCle.get(etape.key);

    if (etape.done) {
      return {
        ...etape,
        done: true,
        at: etape.at,
        origine: 'constate' as const,
        validePar: manuelle?.par ?? null,
        note: manuelle?.note ?? null,
        confirmeeDepuis: manuelle !== undefined,
      };
    }

    if (manuelle) {
      return {
        ...etape,
        done: true,
        at: manuelle.validatedAt,
        origine: 'manuel' as const,
        validePar: manuelle.par,
        note: manuelle.note,
        confirmeeDepuis: false,
      };
    }

    return {
      ...etape,
      done: false,
      at: etape.at,
      origine: null,
      validePar: null,
      note: null,
      confirmeeDepuis: false,
    };
  });
}

/** Combien d'étapes sont franchies, toutes origines confondues. */
export function nombreFranchies(etapes: readonly EtapeAvancement<EtapeDeduite>[]): number {
  return etapes.filter((e) => e.done).length;
}

/**
 * La première étape qui reste à faire. `null` quand tout est franchi.
 *
 * C'est elle que l'écran met en avant : ce sur quoi travailler maintenant.
 */
export function prochaineEtape<T extends EtapeDeduite>(
  etapes: readonly EtapeAvancement<T>[],
): EtapeAvancement<T> | null {
  return etapes.find((e) => !e.done) ?? null;
}

/**
 * Une étape peut-elle être validée à la main ?
 *
 * La création du dossier ne se valide pas : elle est vraie par construction,
 * et une case à cocher n'y ajouterait rien. Une étape déjà constatée non plus
 * — il n'y a rien à suppléer.
 */
export function peutEtreValideeALaMain(etape: EtapeDeduite, cleNonValidables: readonly string[] = ['created']): boolean {
  return !etape.done && !cleNonValidables.includes(etape.key);
}
