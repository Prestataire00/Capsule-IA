// Domaine pur (zéro import next/react/zod/supabase) : aide au pré-remplissage de
// l'effectif à partir de la « tranche d'effectif salarié » INSEE renvoyée par
// l'API recherche-entreprises.api.gouv.fr. Le code est une fourchette ; on en
// déduit un effectif représentatif (médiane approximative), éditable ensuite.

// Codes officiels « Tranche d'effectif salarié » de l'établissement (INSEE).
const RANGE_MIDPOINT: Record<string, number> = {
  NN: 0, // non employeuse
  '00': 0, // 0 salarié
  '01': 1, // 1 ou 2
  '02': 4, // 3 à 5
  '03': 7, // 6 à 9
  '11': 14, // 10 à 19
  '12': 34, // 20 à 49
  '21': 74, // 50 à 99
  '22': 149, // 100 à 199
  '31': 224, // 200 à 249
  '32': 374, // 250 à 499
  '41': 749, // 500 à 999
  '42': 1499, // 1000 à 1999
  '51': 3499, // 2000 à 4999
  '52': 7499, // 5000 à 9999
  '53': 10000, // 10000 et plus
};

/**
 * Effectif représentatif pour un code de tranche INSEE, ou `undefined` si le code
 * est absent/inconnu (l'utilisateur saisira alors la valeur manuellement).
 */
export function headcountRangeToNumber(code: string | null | undefined): number | undefined {
  if (!code) return undefined;
  const midpoint = RANGE_MIDPOINT[code.trim()];
  return midpoint;
}
