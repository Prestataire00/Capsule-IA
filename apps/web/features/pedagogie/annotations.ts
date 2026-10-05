/**
 * Annotations d'un contenu déposé par le formateur (0204). Module pur.
 *
 * Le validateur ne se contente pas de « refusé, motif : … » : il marque en
 * couleur ce qui ne va pas, là où ça ne va pas — tout le contenu, une
 * question, ou un passage cité qui est alors surligné dans sa couleur.
 */

export const COULEURS = ['a_revoir', 'a_preciser', 'suggestion', 'bien'] as const;
export type Couleur = (typeof COULEURS)[number];

export const COULEUR_LABELS: Record<Couleur, string> = {
  a_revoir: 'À revoir',
  a_preciser: 'À préciser',
  suggestion: 'Suggestion',
  bien: 'Très bien',
};

/** Classes Tailwind par couleur : pastille, surlignage, filet. */
export const COULEUR_TONS: Record<Couleur, { pastille: string; surligne: string; filet: string }> = {
  a_revoir: {
    pastille: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
    surligne: 'bg-red-200/70 dark:bg-red-900/60',
    filet: 'border-red-400',
  },
  a_preciser: {
    pastille: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    surligne: 'bg-amber-200/70 dark:bg-amber-900/60',
    filet: 'border-amber-400',
  },
  suggestion: {
    pastille: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    surligne: 'bg-blue-200/70 dark:bg-blue-900/60',
    filet: 'border-blue-400',
  },
  bien: {
    pastille: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    surligne: 'bg-emerald-200/70 dark:bg-emerald-900/60',
    filet: 'border-emerald-400',
  },
};

export const estCouleur = (v: unknown): v is Couleur =>
  typeof v === 'string' && (COULEURS as readonly string[]).includes(v);

export type Segment = { readonly texte: string; readonly couleur: Couleur | null };

/**
 * Découpe un texte pour en surligner les extraits annotés. Un extrait absent
 * du texte (le formateur l'a corrigé depuis) ne surligne rien ; deux extraits
 * qui se chevauchent : le premier posé l'emporte.
 */
export function surligner(
  texte: string,
  extraits: ReadonlyArray<{ extrait: string; couleur: Couleur }>,
): Segment[] {
  const plages: Array<{ debut: number; fin: number; couleur: Couleur }> = [];
  const bas = texte.toLowerCase();
  for (const e of extraits) {
    const cherche = e.extrait.trim().toLowerCase();
    if (!cherche) continue;
    const debut = bas.indexOf(cherche);
    if (debut < 0) continue;
    const fin = debut + cherche.length;
    if (plages.some((p) => debut < p.fin && fin > p.debut)) continue;
    plages.push({ debut, fin, couleur: e.couleur });
  }
  plages.sort((a, b) => a.debut - b.debut);

  const segments: Segment[] = [];
  let curseur = 0;
  for (const p of plages) {
    if (p.debut > curseur) segments.push({ texte: texte.slice(curseur, p.debut), couleur: null });
    segments.push({ texte: texte.slice(p.debut, p.fin), couleur: p.couleur });
    curseur = p.fin;
  }
  if (curseur < texte.length) segments.push({ texte: texte.slice(curseur), couleur: null });
  return segments;
}
