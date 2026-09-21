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

/** Vrai dès qu'une réponse utile a été donnée — le niveau seul ne suffit pas. */
export const ficheBesoinRemplie = (r: ReponsesFicheBesoin | null | undefined): boolean =>
  Boolean(r && String(r.objectives ?? '').trim() !== '');

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
 * Ne garde que les champs connus, bornés : l'entrée vient du dehors.
 *
 * Vit ici et non dans le module `'use server'` qui l'utilisait : un fichier de
 * Server Actions ne peut exporter que des fonctions asynchrones, et Next refuse
 * de compiler dès qu'il y trouve un type ou une fonction pure.
 */
export function nettoyerReponses(brut: ReponsesFicheBesoin): Record<string, string | number> {
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
  return out;
}
