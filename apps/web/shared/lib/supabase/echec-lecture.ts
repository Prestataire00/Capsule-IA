import 'server-only';

/**
 * Une requête en échec n'est pas une ligne absente.
 *
 * Les pages disaient déjà la différence (incident du 21/09/2026) ; les
 * chargeurs, non. `loadSession`, les gardes de l'espace formateur et les
 * contextes de l'espace apprenant rendaient `null` aussi bien pour « cette
 * séance n'existe pas » que pour « la base a refusé la lecture », et l'appelant
 * n'avait plus de quoi trancher : il affichait un 404. Une cinquantaine de
 * pages héritaient du défaut sans le porter.
 *
 * D'où cette convention, désormais tenue par tous les chargeurs : `null` ne
 * veut plus dire que l'absence, et une panne remonte. Elle remonte même depuis
 * une garde — refuser l'accès parce que la base est tombée reviendrait à dire
 * au formateur que la séance n'est pas la sienne.
 */
export function exigerLecture(
  quoi: string,
  error: { code?: string | null; message: string } | null | undefined,
): void {
  if (!error) return;
  console.error(`[${quoi}] lecture impossible`, error.code, error.message);
  throw new Error(`Lecture impossible (${quoi}) : ${error.message}`);
}
