/**
 * L'émargement est-il en cours ? Entre une heure avant la première
 * demi-journée ouverte et deux heures après la dernière.
 *
 * Module ordinaire (pas « use client ») : les pages serveur l'appellent pour
 * décider d'afficher le rafraîchissement automatique. Exportée depuis un
 * module client, la fonction faisait planter ces pages au rendu.
 */
export function emargementEnCours(sheets: readonly { windowStart: string; windowEnd: string; finalized: boolean }[], now = Date.now()): boolean {
  return sheets.some(
    (s) => !s.finalized && now >= new Date(s.windowStart).getTime() - 60 * 60_000 && now <= new Date(s.windowEnd).getTime() + 120 * 60_000,
  );
}
