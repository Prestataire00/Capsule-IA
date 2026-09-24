/**
 * SIRET, SIREN, et la clé qui les valide.
 *
 * La facturation électronique fait du SIREN du client une mention obligatoire :
 * c'est par lui que l'administration rapproche les flux. Un numéro mal saisi ne
 * se voit pas à l'œil — il se voit au rejet de la facture, donc à l'impayé.
 * D'où le contrôle de clé ici, plutôt qu'un simple comptage de chiffres.
 */

/** Ne garde que les chiffres : les utilisateurs collent « 123 456 789 00012 ». */
export const normaliserSiret = (v: string): string => v.replace(/\D/g, '');

/**
 * Clé de Luhn. Un SIRET valide a une somme pondérée multiple de 10.
 *
 * La Poste fait exception : son SIREN 356000000 échappe à la règle depuis que
 * ses établissements ont dépassé ce que la clé pouvait porter. Ses SIRET sont
 * valides quand la somme simple des chiffres est un multiple de 5.
 */
function cleValide(chiffres: string): boolean {
  if (chiffres.startsWith('356000000') && chiffres.length === 14) {
    return [...chiffres].reduce((n, c) => n + Number(c), 0) % 5 === 0;
  }
  // On double un chiffre sur deux EN PARTANT DE LA DROITE, le chiffre-clé
  // n'étant jamais doublé.
  //
  // Le compte se faisait depuis la gauche, à rang pair. Juste sur un SIREN,
  // faux sur un SIRET : à quatorze chiffres, le rang pair depuis la gauche
  // tombe sur le chiffre-clé, que Luhn laisse justement intact. Huit SIRET
  // réels sur dix étaient refusés — dont celui de la demande du 24/09/2026,
  // pourtant bien celui de SOLUTIONS TERRAIN. Le test ne l'avait pas vu : son
  // exemple « réel » était un numéro inventé, qui satisfaisait la règle fausse.
  //
  // Compter depuis la droite couvre les deux longueurs sans les distinguer :
  // sur neuf chiffres cela revient au rang pair depuis la gauche, sur quatorze
  // au rang impair.
  let somme = 0;
  for (let i = 0; i < chiffres.length; i++) {
    let n = Number(chiffres[i]);
    if ((chiffres.length - i) % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    somme += n;
  }
  return somme % 10 === 0;
}

/** 14 chiffres et une clé juste. */
export const siretValide = (v: string): boolean => {
  const c = normaliserSiret(v);
  return c.length === 14 && cleValide(c);
};

/** 9 chiffres et une clé juste. */
export const sirenValide = (v: string): boolean => {
  const c = normaliserSiret(v);
  return c.length === 9 && cleValide(c);
};

/** Le SIREN est la tête du SIRET : ses neuf premiers chiffres. */
export const sirenDeSiret = (v: string | null | undefined): string | null => {
  const c = normaliserSiret(v ?? '');
  return c.length >= 9 ? c.slice(0, 9) : null;
};

/** « 123456789 » → « 123 456 789 ». */
export const formaterSiren = (v: string | null | undefined): string | null => {
  const c = normaliserSiret(v ?? '');
  return c.length === 9 ? `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6)}` : null;
};

/** « 12345678900012 » → « 123 456 789 00012 ». */
export const formaterSiret = (v: string | null | undefined): string | null => {
  const c = normaliserSiret(v ?? '');
  return c.length === 14 ? `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6, 9)} ${c.slice(9)}` : null;
};
