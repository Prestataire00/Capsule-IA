// ARCHETYPE: shared
// Les champs de la fiche besoin, définis une seule fois.
//
// Ils existaient en trois exemplaires qui divergeaient : le tunnel
// d'inscription (`app/inscription/schema.ts`), le formulaire public par jeton
// (champs en dur dans la page), et le modèle enregistré en base — ce dernier
// sous une forme (`fields`) que l'écran de saisie interne ne savait pas lire,
// au point de tomber sur `undefined.map`.
//
// Une seule définition, donc, partagée par les trois — et le contexte de
// typologie, jusqu'ici perdu au passage d'une représentation à l'autre.

import type { Question } from './schema';

export const CHAMPS_FICHE_BESOIN = [
  {
    cle: 'currentLevel',
    label: 'Niveau actuel sur le sujet de la formation',
    type: 'rating' as const,
    max: 5,
    requis: true,
  },
  {
    cle: 'objectives',
    label: 'Objectifs visés par cette formation',
    type: 'text' as const,
    requis: true,
  },
  { cle: 'expectations', label: 'Attentes particulières', type: 'text' as const, requis: false },
  {
    cle: 'constraints',
    label: 'Contraintes éventuelles (planning, organisation…)',
    type: 'text' as const,
    requis: false,
  },
  {
    cle: 'accommodations',
    label: 'Besoin d’aménagement (situation de handicap)',
    type: 'text' as const,
    requis: false,
  },
  {
    cle: 'typologyContext',
    label: 'Contexte et motivations',
    type: 'text' as const,
    requis: false,
  },
] as const;

export type CleFicheBesoin = (typeof CHAMPS_FICHE_BESOIN)[number]['cle'];

export type ReponsesFicheBesoin = Partial<Record<CleFicheBesoin, string | number>>;

/**
 * Vrai dès qu'une réponse utile a été donnée.
 *
 * Longtemps : « objectives est rempli ». Ce champ est le pivot du modèle
 * intégré, mais un organisme qui pose ses propres questions n'en a aucune qui
 * s'appelle ainsi — sa fiche, pourtant remplie, aurait été comptée vide, et le
 * système la lui aurait redemandée indéfiniment.
 *
 * On garde la primauté d'`objectives` pour le modèle intégré, et on accepte
 * toute autre réponse de texte pour les modèles d'organisme. Le niveau seul ne
 * suffit toujours pas : une note sur cinq ne dit pas un besoin.
 */
export const ficheBesoinRemplie = (r: ReponsesFicheBesoin | null | undefined): boolean => {
  if (!r) return false;
  if (String(r.objectives ?? '').trim() !== '') return true;
  return Object.entries(r as Record<string, unknown>).some(
    ([cle, v]) => cle !== 'currentLevel' && typeof v === 'string' && v.trim() !== '',
  );
};

/**
 * Questions à afficher pour un modèle enregistré, quelle que soit sa forme.
 *
 * Deux formes coexistent en base : `{ questions: [...] }` pour les modèles
 * créés depuis l'éditeur, et `{ fields: [{ key, kind }] }` pour la fiche besoin
 * posée par le code. L'écran de saisie ne lisait que la première : la fiche
 * besoin y était donc inutilisable.
 */
export function questionsDuSchema(schema: unknown): Question[] {
  const s = (schema ?? {}) as { questions?: unknown; fields?: unknown };

  if (Array.isArray(s.questions)) return s.questions as Question[];

  if (Array.isArray(s.fields)) {
    const out: Question[] = [];
    for (const f of s.fields as Array<{ key?: string; kind?: string; label?: string }>) {
      const connu = CHAMPS_FICHE_BESOIN.find((c) => c.cle === f.key);
      const id = f.key ?? '';
      if (id === '') continue;
      const label = f.label ?? connu?.label ?? id;
      const required = connu?.requis ?? false;
      if (f.kind === 'nps') out.push({ id, type: 'nps', label, required });
      else if (f.kind === 'rating_5' || f.kind === 'rating') out.push({ id, type: 'rating', label, required, max: 5 });
      else out.push({ id, type: 'text', label, required });
    }
    return out;
  }

  return [];
}

export type EnregistrerResult = { ok: true } | { ok: false; error: string };

/**
 * Ne garde que des champs bornés : l'entrée vient du dehors.
 *
 * Les six champs intégrés d'abord, puis les questions propres à l'organisme
 * quand il en pose — sans cette seconde passe, les réponses d'un modèle
 * personnalisé étaient silencieusement jetées ici : le stagiaire répondait à
 * neuf questions, cinq arrivaient, quatre disparaissaient sans un mot.
 *
 * `clesSupplementaires` vient du modèle en cours, jamais du formulaire : une
 * liste ouverte laisserait écrire n'importe quelle clé dans la colonne JSON.
 *
 * Vit ici et non dans le module `'use server'` qui l'utilisait : un fichier de
 * Server Actions ne peut exporter que des fonctions asynchrones, et Next refuse
 * de compiler dès qu'il y trouve un type ou une fonction pure.
 */
export function nettoyerReponses(
  brut: ReponsesFicheBesoin,
  clesSupplementaires: readonly string[] = [],
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const c of CHAMPS_FICHE_BESOIN) {
    const v = brut[c.cle];
    if (v === undefined || v === null || v === '') continue;
    if (c.type === 'rating') {
      const n = Math.round(Number(v));
      if (Number.isFinite(n) && n >= 1 && n <= 5) out[c.cle] = n;
    } else {
      out[c.cle] = String(v).trim().slice(0, 2000);
    }
  }

  const connues = new Set<string>(CHAMPS_FICHE_BESOIN.map((c) => c.cle));
  // Quarante questions au plus : au-delà, ce n'est plus une fiche besoin.
  for (const cle of clesSupplementaires.slice(0, 40)) {
    if (connues.has(cle)) continue;
    const v = (brut as Record<string, unknown>)[cle];
    if (v === undefined || v === null || v === '') continue;
    out[cle] = typeof v === 'number' ? v : String(v).trim().slice(0, 2000);
  }
  return out;
}
