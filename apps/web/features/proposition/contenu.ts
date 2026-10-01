// ARCHETYPE: shared
// La proposition commerciale d'une demande : sa forme, son cadre, son prix.
// Module pur.
//
// La forme reprend celle des propositions que Laurie rédigeait à la main à
// partir du programme d'Isma : présentation, vue d'ensemble, informations
// générales, objectifs, compétences, modules par session, livrables, méthodes,
// évaluation, accueil, tarif. L'IA la remplit ; le code, lui, fait les
// comptes — un total de devis ne se confie pas à un modèle de langage.

export type LigneLibelle = { libelle: string; valeur: string };
export type Objectif = { verbe: string; texte: string };
export type Module = {
  numero: number;
  titre: string;
  duree_minutes: number;
  objectifs: string[];
  contenus: string[];
  livrables: string;
};
export type SessionProposition = { titre: string; duree_heures: number; modules: Module[] };
export type ModeTarif = 'heure_apprenant' | 'par_apprenant' | 'forfait';

export type ContenuProposition = {
  titre: string;
  sous_titre: string;
  bandeau: string;
  presentation: string[];
  duree_totale_heures: number;
  rythme: string;
  fil_rouge_titre: string;
  fil_rouge: Array<{ brique: string; definition: string; exemple: string }>;
  informations: LigneLibelle[];
  objectifs: Objectif[];
  competences: Objectif[];
  sessions: SessionProposition[];
  intersession: string;
  adaptation: string[];
  livrables: string[];
  methodes: string[];
  moyens: string[];
  encadrement: string;
  evaluation: LigneLibelle[];
  accueil: LigneLibelle[];
  tarif: {
    mode: ModeTarif;
    prix_unitaire_cents: number;
    heures: number;
    participants: number;
    scenarios_participants: number[];
    financement: string;
  };
  points_a_valider: string[];
  /**
   * Proposition finale : le tarif ne montre que la ligne retenue, telle
   * qu'elle figure au devis, sans le tableau des scénarios. Choisi par
   * l'équipe, jamais par l'IA ; absent = proposition normale.
   */
  finale?: boolean;
};

const TEXTE = { type: 'string' } as const;
const LISTE_TEXTE = { type: 'array', items: TEXTE } as const;
const objet = (props: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  properties: props,
  required: Object.keys(props),
});

/**
 * Ce que l'IA rend : une forme APLATIE de la proposition. La sortie contrainte
 * refuse les schémas trop imbriqués (« compiled grammar is too large », vérifié
 * contre l'API le 28/09/2026) : les tableaux libellé/valeur et les objectifs
 * y sont des lignes de texte, les modules ne sont pas numérotés. `depuisSortie`
 * reconstruit la forme riche.
 */
export type SortieIA = Omit<ContenuProposition, 'informations' | 'objectifs' | 'competences' | 'evaluation' | 'accueil' | 'sessions'> & {
  informations: string[];
  objectifs: string[];
  competences: string[];
  evaluation: string[];
  accueil: string[];
  sessions: Array<{ titre: string; duree_heures: number; modules: Array<Omit<Module, 'numero'>> }>;
};

/** Schéma de sortie structurée : l'IA ne peut rendre que cette forme. */
export const SCHEMA_PROPOSITION = objet({
  titre: TEXTE,
  sous_titre: TEXTE,
  bandeau: TEXTE,
  presentation: LISTE_TEXTE,
  duree_totale_heures: { type: 'number' },
  rythme: TEXTE,
  fil_rouge_titre: TEXTE,
  fil_rouge: { type: 'array', items: objet({ brique: TEXTE, definition: TEXTE, exemple: TEXTE }) },
  informations: LISTE_TEXTE,
  objectifs: LISTE_TEXTE,
  competences: LISTE_TEXTE,
  sessions: {
    type: 'array',
    items: objet({
      titre: TEXTE,
      duree_heures: { type: 'number' },
      modules: {
        type: 'array',
        items: objet({ titre: TEXTE, duree_minutes: { type: 'integer' }, objectifs: LISTE_TEXTE, contenus: LISTE_TEXTE, livrables: TEXTE }),
      },
    }),
  },
  intersession: TEXTE,
  adaptation: LISTE_TEXTE,
  livrables: LISTE_TEXTE,
  methodes: LISTE_TEXTE,
  moyens: LISTE_TEXTE,
  encadrement: TEXTE,
  evaluation: LISTE_TEXTE,
  accueil: LISTE_TEXTE,
  tarif: objet({
    mode: { type: 'string', enum: ['heure_apprenant', 'par_apprenant', 'forfait'] },
    prix_unitaire_cents: { type: 'integer' },
    heures: { type: 'number' },
    participants: { type: 'integer' },
    scenarios_participants: { type: 'array', items: { type: 'integer' } },
    financement: TEXTE,
  }),
  points_a_valider: LISTE_TEXTE,
});

/** « Public cible : Encadrement… » → { libelle, valeur }. Sans « : », la ligne entière est la valeur. */
export function enLibelle(ligne: string): LigneLibelle {
  const i = ligne.indexOf(':');
  if (i <= 0 || i > 40) return { libelle: '', valeur: ligne.trim() };
  return { libelle: ligne.slice(0, i).trim(), valeur: ligne.slice(i + 1).trim() };
}

/** « Expliquer ce qu'est… » → { verbe: 'Expliquer', texte: "ce qu'est…" }. */
export function enObjectif(ligne: string): Objectif {
  const t = ligne.trim().replace(/^[-•✓\d.)\s]+/, '');
  const i = t.indexOf(' ');
  return i < 0 ? { verbe: t, texte: '' } : { verbe: t.slice(0, i), texte: t.slice(i + 1) };
}

export function depuisSortie(s: SortieIA): ContenuProposition {
  let n = 0;
  return {
    ...s,
    informations: s.informations.map(enLibelle),
    evaluation: s.evaluation.map(enLibelle),
    accueil: s.accueil.map(enLibelle),
    objectifs: s.objectifs.map(enObjectif),
    competences: s.competences.map(enObjectif),
    sessions: s.sessions.map((se) => ({ ...se, modules: se.modules.map((m) => ({ ...m, numero: ++n })) })),
  };
}

/** L'inverse, pour redonner à l'IA la version à réviser dans SA forme. */
export function versSortie(c: ContenuProposition): SortieIA {
  const lib = (l: LigneLibelle) => (l.libelle ? `${l.libelle} : ${l.valeur}` : l.valeur);
  const obj = (o: Objectif) => `${o.verbe} ${o.texte}`.trim();
  return {
    ...c,
    informations: c.informations.map(lib),
    evaluation: c.evaluation.map(lib),
    accueil: c.accueil.map(lib),
    objectifs: c.objectifs.map(obj),
    competences: c.competences.map(obj),
    sessions: c.sessions.map((se) => ({ ...se, modules: se.modules.map(({ numero: _n, ...m }) => m) })),
  };
}

// ── Le cadre : une action de formation, pas du coaching ──────────────────────

/**
 * Ce qui fait basculer une proposition hors du champ de la formation
 * professionnelle (art. L6313-1) : un financeur refuse de prendre en charge du
 * coaching, du conseil ou un accompagnement individuel, et un programme dit
 * « personnalisé » laisse croire que chaque participant suit le sien.
 *
 * Adapter les cas pratiques au métier du client reste permis : c'est la
 * contextualisation d'un programme commun, pas un programme par personne.
 */
const HORS_CADRE: ReadonlyArray<{ motif: RegExp; pourquoi: string }> = [
  { motif: /\bcoach(?:ing|s)?\b/i, pourquoi: 'le mot « coaching » fait basculer la prestation hors de la formation' },
  { motif: /\bmentor(?:at|ing)?\b/i, pourquoi: '« mentorat » décrit un accompagnement, pas une formation' },
  { motif: /accompagnement(?:s)?\s+individuel/i, pourquoi: '« accompagnement individuel » n’est pas une action de formation' },
  { motif: /(programme|parcours|formation)s?\s+(?:100\s*%\s*)?(personnalis|individualis)/i, pourquoi: 'un programme « personnalisé » laisse croire que chacun suit le sien' },
  { motif: /sur[-\s]mesure\s+(?:pour\s+chaque|individuel)/i, pourquoi: '« sur-mesure individuel » décrit un programme par personne' },
  { motif: /séances?\s+individuelles?/i, pourquoi: 'des séances individuelles ne sont pas une action collective' },
  { motif: /\bconseil\s+(?:stratégique|en\s+organisation)\b|\bmission\s+de\s+conseil\b/i, pourquoi: 'le conseil n’est pas de la formation' },
  { motif: /\bconsulting\b/i, pourquoi: 'le consulting n’est pas de la formation' },
];

/** Tout le texte de la proposition, pour le contrôle. */
export function texteIntegral(c: ContenuProposition): string {
  const bouts: string[] = [
    c.titre, c.sous_titre, c.bandeau, ...c.presentation, c.rythme, c.fil_rouge_titre,
    ...c.fil_rouge.flatMap((f) => [f.brique, f.definition, f.exemple]),
    ...c.informations.flatMap((i) => [i.libelle, i.valeur]),
    ...c.objectifs.map((o) => `${o.verbe} ${o.texte}`),
    ...c.competences.map((o) => `${o.verbe} ${o.texte}`),
    ...c.sessions.flatMap((s) => [s.titre, ...s.modules.flatMap((m) => [m.titre, ...m.objectifs, ...m.contenus, m.livrables])]),
    c.intersession, ...c.adaptation, ...c.livrables, ...c.methodes, ...c.moyens, c.encadrement,
    ...c.evaluation.flatMap((i) => [i.libelle, i.valeur]),
    ...c.accueil.flatMap((i) => [i.libelle, i.valeur]),
    c.tarif.financement,
  ];
  return bouts.join('\n');
}

/** Les passages hors cadre, avec la raison. Vide = la proposition est une action de formation. */
export function controlerCadre(c: ContenuProposition): string[] {
  const texte = texteIntegral(c);
  const alertes: string[] = [];
  for (const { motif, pourquoi } of HORS_CADRE) {
    const m = motif.exec(texte);
    if (m) alertes.push(`« ${m[0]} » : ${pourquoi}.`);
  }
  // Une action de formation se définit par des objectifs évaluables et un
  // programme séquencé : sans eux, ce n'en est pas une.
  if (c.objectifs.length === 0) alertes.push('Aucun objectif pédagogique : une action de formation en exige.');
  if (c.sessions.every((s) => s.modules.length === 0)) alertes.push('Aucun module : le programme doit être séquencé.');
  if (c.evaluation.length === 0) alertes.push('Aucune modalité d’évaluation des acquis.');
  return alertes;
}

// ── Le prix ──────────────────────────────────────────────────────────────────

export const euros = (cents: number): string =>
  `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })} €`;

const heuresFr = (h: number): string => `${h.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h`;

/** Le total HT pour un nombre de participants — calculé ici, jamais par l'IA. */
export function totalHtCents(t: ContenuProposition['tarif'], participants = t.participants): number {
  switch (t.mode) {
    case 'heure_apprenant':
      return Math.round(t.prix_unitaire_cents * t.heures * participants);
    case 'par_apprenant':
      return Math.round(t.prix_unitaire_cents * participants);
    default:
      return Math.round(t.prix_unitaire_cents);
  }
}

export function baseTarifaire(t: ContenuProposition['tarif']): string {
  if (t.mode === 'heure_apprenant') return `${euros(t.prix_unitaire_cents)} HT par heure et par apprenant`;
  if (t.mode === 'par_apprenant') return `${euros(t.prix_unitaire_cents)} HT par apprenant`;
  return `${euros(t.prix_unitaire_cents)} HT, forfait pour le groupe`;
}

/** « 12 participants × 6 h × 35 € = 2 520 € HT ». */
export function formuleTarif(t: ContenuProposition['tarif']): string {
  const total = euros(totalHtCents(t));
  if (t.mode === 'heure_apprenant') return `${t.participants} participants × ${heuresFr(t.heures)} × ${euros(t.prix_unitaire_cents)} = ${total} HT`;
  if (t.mode === 'par_apprenant') return `${t.participants} participants × ${euros(t.prix_unitaire_cents)} = ${total} HT`;
  return `Forfait groupe (${t.participants} participants, ${heuresFr(t.heures)}) = ${total} HT`;
}

/** Les scénarios du tableau de tarif, dédoublonnés et triés, avec la formule retenue. */
export function scenarios(t: ContenuProposition['tarif']): Array<{ participants: number; totalCents: number; retenu: boolean }> {
  const n = [...new Set([...t.scenarios_participants, t.participants].filter((x) => Number.isInteger(x) && x > 0))].sort((a, b) => a - b);
  return n.map((p) => ({ participants: p, totalCents: totalHtCents(t, p), retenu: p === t.participants }));
}

export type LigneDevis = { description: string; details: string; quantite: number; prixUnitaireCents: number };

/** La ligne du devis, tirée du tarif : quantité × prix unitaire = le total annoncé. */
export function lignesDevis(c: ContenuProposition): LigneDevis[] {
  const t = c.tarif;
  if (t.mode === 'heure_apprenant') {
    return [{
      description: c.titre,
      details: `${t.participants} participants × ${heuresFr(t.heures)} — ${baseTarifaire(t)}`,
      quantite: Math.round(t.participants * t.heures * 100) / 100,
      prixUnitaireCents: t.prix_unitaire_cents,
    }];
  }
  if (t.mode === 'par_apprenant') {
    return [{ description: c.titre, details: `${heuresFr(t.heures)} — ${baseTarifaire(t)}`, quantite: t.participants, prixUnitaireCents: t.prix_unitaire_cents }];
  }
  return [{ description: c.titre, details: `${t.participants} participants, ${heuresFr(t.heures)} — forfait groupe`, quantite: 1, prixUnitaireCents: t.prix_unitaire_cents }];
}

/**
 * Bornes de sécurité sur ce que l'IA rend : le schéma garantit la forme, pas
 * le bon sens. Un prix négatif ou 400 participants ne passent pas au devis.
 */
export function normaliser(c: ContenuProposition): ContenuProposition {
  const t = c.tarif;
  const entier = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number.isFinite(v) ? v : min)));
  const heures = Math.min(1000, Math.max(0, Number.isFinite(t.heures) ? t.heures : 0));
  return {
    ...c,
    duree_totale_heures: Math.min(1000, Math.max(0, Number.isFinite(c.duree_totale_heures) ? c.duree_totale_heures : 0)),
    tarif: {
      ...t,
      prix_unitaire_cents: entier(t.prix_unitaire_cents, 0, 100_000_000),
      heures,
      participants: entier(t.participants, 1, 500),
      scenarios_participants: t.scenarios_participants.map((p) => entier(p, 1, 500)).slice(0, 6),
    },
  };
}
