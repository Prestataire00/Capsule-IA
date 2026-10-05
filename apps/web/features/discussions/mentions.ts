/**
 * Mentions d'un message de discussion d'équipe (0204). Module pur.
 *
 * On ne parle pas « à la cantonade » : chaque message nomme la ou les
 * personnes concernées par `@Prénom Nom`, et elles seules en sont prévenues.
 */

export type Participant = { readonly userId: string; readonly nom: string };

const normaliser = (s: string) => s.normalize('NFC').toLowerCase();

/** Les personnes mentionnées dans le texte, sans doublon, dans l'ordre de l'équipe. */
export function mentionsDans(texte: string, participants: readonly Participant[]): string[] {
  const bas = normaliser(texte);
  // Le nom le plus long d'abord : « @Marie Curie » ne doit pas aussi valoir pour « @Marie ».
  const tries = [...participants].sort((a, b) => b.nom.length - a.nom.length);
  const pris: Array<{ debut: number; fin: number }> = [];
  const trouves = new Set<string>();
  for (const p of tries) {
    const cle = `@${normaliser(p.nom.trim())}`;
    if (cle.length < 2) continue;
    let i = bas.indexOf(cle);
    while (i >= 0) {
      const fin = i + cle.length;
      const suivant = bas[fin];
      const finDeMot = suivant === undefined || !/[\p{L}\p{N}]/u.test(suivant);
      if (finDeMot && !pris.some((r) => i < r.fin && fin > r.debut)) {
        pris.push({ debut: i, fin });
        trouves.add(p.userId);
        break;
      }
      i = bas.indexOf(cle, i + 1);
    }
  }
  return participants.filter((p) => trouves.has(p.userId)).map((p) => p.userId);
}

export type MorceauMessage = { readonly texte: string; readonly mention: boolean };

/** Découpe un message pour faire ressortir les mentions à l'affichage. */
export function morceauxDuMessage(texte: string, noms: readonly string[]): MorceauMessage[] {
  const cles = [...noms].filter((n) => n.trim()).sort((a, b) => b.length - a.length).map((n) => `@${n.trim()}`);
  const morceaux: MorceauMessage[] = [];
  let reste = texte;
  while (reste.length > 0) {
    const bas = normaliser(reste);
    let meilleur: { i: number; cle: string } | null = null;
    for (const cle of cles) {
      const i = bas.indexOf(normaliser(cle));
      if (i >= 0 && (meilleur === null || i < meilleur.i)) meilleur = { i, cle };
    }
    if (!meilleur) {
      morceaux.push({ texte: reste, mention: false });
      break;
    }
    if (meilleur.i > 0) morceaux.push({ texte: reste.slice(0, meilleur.i), mention: false });
    morceaux.push({ texte: reste.slice(meilleur.i, meilleur.i + meilleur.cle.length), mention: true });
    reste = reste.slice(meilleur.i + meilleur.cle.length);
  }
  return morceaux;
}
