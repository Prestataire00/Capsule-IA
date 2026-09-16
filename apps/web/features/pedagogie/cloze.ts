/**
 * Texte à trou (0172). Module pur.
 *
 * Le formateur écrit son texte et entoure de crochets ce qu'il veut masquer :
 * « L'[intelligence] artificielle ». Pas de syntaxe à apprendre, pas d'éditeur
 * séparé — c'est ce qui décide un formateur pressé à en faire un.
 */

export type Segment =
  | { readonly type: 'texte'; readonly valeur: string }
  | { readonly type: 'trou'; readonly index: number; readonly reponse: string };

export type TexteATrou = {
  readonly segments: readonly Segment[];
  /** Réponses attendues, dans l'ordre des trous. */
  readonly reponses: readonly string[];
};

const MARQUEUR = /\[([^\[\]]+)\]/g;

export function parseTexteATrou(texte: string): TexteATrou {
  const segments: Segment[] = [];
  const reponses: string[] = [];
  let curseur = 0;

  for (const trouve of texte.matchAll(MARQUEUR)) {
    const debut = trouve.index ?? 0;
    const reponse = (trouve[1] ?? '').trim();
    // Des crochets vides ne masquent rien : on les laisse tels quels.
    if (reponse.length === 0) continue;

    if (debut > curseur) segments.push({ type: 'texte', valeur: texte.slice(curseur, debut) });
    segments.push({ type: 'trou', index: reponses.length, reponse });
    reponses.push(reponse);
    curseur = debut + trouve[0].length;
  }

  if (curseur < texte.length) segments.push({ type: 'texte', valeur: texte.slice(curseur) });
  return { segments, reponses };
}

/**
 * Comparaison tolérante : ni la casse, ni les accents, ni les espaces en trop
 * ne font la connaissance. « Elève », « élève » et « ÉLÈVE » valent la même
 * réponse — sanctionner l'accent serait noter le clavier, pas le stagiaire.
 */
export function memeReponse(attendue: string, donnee: string): boolean {
  const normalise = (v: string) =>
    v
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('fr-FR');
  return normalise(attendue) === normalise(donnee) && normalise(attendue).length > 0;
}

export type CorrectionTexte = {
  readonly note: number;
  readonly bareme: number;
  readonly pourcentage: number;
  readonly parTrou: ReadonlyArray<{ index: number; juste: boolean; attendue: string; donnee: string }>;
};

/** Un point par trou : le barème d'un texte à trou n'a pas à être réglable. */
export function corrigerTexteATrou(reponsesAttendues: readonly string[], donnees: readonly string[]): CorrectionTexte {
  const parTrou = reponsesAttendues.map((attendue, index) => {
    const donnee = donnees[index] ?? '';
    return { index, juste: memeReponse(attendue, donnee), attendue, donnee };
  });
  const note = parTrou.filter((t) => t.juste).length;
  const bareme = reponsesAttendues.length;
  return {
    note,
    bareme,
    pourcentage: bareme > 0 ? Math.round((note / bareme) * 100) : 0,
    parTrou,
  };
}
