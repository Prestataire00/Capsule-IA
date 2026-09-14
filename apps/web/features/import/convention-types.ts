// ARCHETYPE: shared
// Ce que l'on sait lire d'une convention de formation et de ses programmes
// annexés. Types partagés entre l'extraction (serveur), l'écran de relecture
// (client) et la création dans le CRM.

export const MODALITIES = ['presentiel', 'distanciel', 'hybride'] as const;
export type ImportModality = (typeof MODALITIES)[number];

export type ImportClient = {
  /** Raison sociale du bénéficiaire (jamais l'organisme de formation). */
  name: string;
  legalName: string;
  siret: string;
  address: string;
  representativeFirstName: string;
  representativeLastName: string;
  representativeRole: string;
  contactEmail: string;
  contactPhone: string;
};

export type ImportModule = {
  code: string;
  title: string;
  durationLabel: string;
  contenu: string[];
  objectifs: string[];
};

export type ImportFormation = {
  title: string;
  subtitle: string;
  /** Durée totale en heures, en chiffres ("5", "9"). */
  durationHours: string;
  modality: ImportModality;
  objectives: string[];
  prerequisites: string[];
  targetAudience: string;
  programContent: string;
  pedagogicalMethod: string;
  evaluationMethod: string;
  accessibilityInfo: string;
  accessDelay: string;
  teachingTeam: string;
  modules: ImportModule[];
};

export type ImportSession = {
  /** Intitulé lisible de la séance (« Groupe A (matin) — 14/09/2026 »). */
  label: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  modality: ImportModality;
  location: string;
};

export type ImportPricing = {
  totalHtCents: number | null;
  vatRate: number | null;
  /** Échéancier tel qu'écrit (« 30 % à la signature, 70 % en fin de formation »). */
  paymentTerms: string;
};

export type ImportParticipants = {
  count: number | null;
  /** Répartition annoncée (« 2 groupes de 8 »). */
  groups: string;
  /** Participants nommés, quand la convention les liste. */
  named: Array<{ firstName: string; lastName: string; email: string }>;
};

export type ConventionImport = {
  client: ImportClient;
  formations: ImportFormation[];
  sessions: ImportSession[];
  pricing: ImportPricing;
  participants: ImportParticipants;
  /** Ce que le lecteur n'a pas su rattacher, à l'attention de l'utilisateur. */
  notes: string;
};

/** Ce que la création a réellement fait — rendu à l'écran, donc type partagé. */
export type ImportSummary = {
  companyId: string | null;
  companyCreated: boolean;
  contactCreated: boolean;
  /** Dossier du client : la vue qui rassemble formation, séances et documents. */
  dossierId: string | null;
  dossierReference: string | null;
  formations: Array<{ id: string; title: string }>;
  sessions: number;
  learners: number;
  taskCreated: boolean;
  documents: number;
  warnings: string[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const texte = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const liste = (v: unknown, max = 60): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean).slice(0, max)
    : [];

const modalite = (v: unknown): ImportModality =>
  (MODALITIES as readonly string[]).includes(String(v)) ? (v as ImportModality) : 'presentiel';

const entier = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  // Champ absent ou vide : « non renseigné », surtout pas 0 — un tarif à zéro
  // se propagerait à la formation et à toutes ses séances.
  const s = String(v ?? '').replace(/[^\d.-]/g, '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

/** Le schéma garantit les clés, pas leur propreté : on borne avant de créer quoi que ce soit. */
export function normalizeImport(raw: unknown): ConventionImport {
  const r = (raw ?? {}) as Record<string, unknown>;
  const c = (r.client ?? {}) as Record<string, unknown>;
  const p = (r.pricing ?? {}) as Record<string, unknown>;
  const part = (r.participants ?? {}) as Record<string, unknown>;

  const formations = (Array.isArray(r.formations) ? r.formations : []).slice(0, 10).map((f) => {
    const o = (f ?? {}) as Record<string, unknown>;
    const heures = texte(o.durationHours, 10).replace(',', '.');
    return {
      title: texte(o.title, 200),
      subtitle: texte(o.subtitle, 300),
      durationHours: Number.isFinite(Number(heures)) && Number(heures) > 0 ? heures : '',
      modality: modalite(o.modality),
      objectives: liste(o.objectives),
      prerequisites: liste(o.prerequisites),
      targetAudience: texte(o.targetAudience, 5000),
      programContent: texte(o.programContent, 50000),
      pedagogicalMethod: texte(o.pedagogicalMethod, 10000),
      evaluationMethod: texte(o.evaluationMethod, 10000),
      accessibilityInfo: texte(o.accessibilityInfo, 10000),
      accessDelay: texte(o.accessDelay, 5000),
      teachingTeam: texte(o.teachingTeam, 10000),
      modules: (Array.isArray(o.modules) ? o.modules : []).slice(0, 40).map((m) => {
        const mo = (m ?? {}) as Record<string, unknown>;
        return {
          code: texte(mo.code, 20),
          title: texte(mo.title, 200),
          durationLabel: texte(mo.durationLabel, 30),
          contenu: liste(mo.contenu, 30),
          objectifs: liste(mo.objectifs, 30),
        };
      }),
    } satisfies ImportFormation;
  });

  const sessions = (Array.isArray(r.sessions) ? r.sessions : [])
    .slice(0, 100)
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return {
        label: texte(o.label, 200),
        date: texte(o.date, 10),
        startTime: texte(o.startTime, 5),
        endTime: texte(o.endTime, 5),
        modality: modalite(o.modality),
        location: texte(o.location, 200),
      } satisfies ImportSession;
    })
    // Une séance sans date ni horaires n'est pas planifiable : on la laisse de côté.
    .filter((s) => DATE_RE.test(s.date) && TIME_RE.test(s.startTime) && TIME_RE.test(s.endTime) && s.startTime < s.endTime);

  return {
    client: {
      name: texte(c.name, 200),
      legalName: texte(c.legalName, 200),
      siret: texte(c.siret, 20).replace(/\D/g, '').slice(0, 14),
      address: texte(c.address, 300),
      representativeFirstName: texte(c.representativeFirstName, 100),
      representativeLastName: texte(c.representativeLastName, 100),
      representativeRole: texte(c.representativeRole, 100),
      contactEmail: texte(c.contactEmail, 200).toLowerCase(),
      contactPhone: texte(c.contactPhone, 40),
    },
    formations,
    sessions,
    pricing: {
      totalHtCents: entier(p.totalHtCents),
      vatRate: entier(p.vatRate),
      paymentTerms: texte(p.paymentTerms, 2000),
    },
    participants: {
      count: entier(part.count),
      groups: texte(part.groups, 200),
      named: (Array.isArray(part.named) ? part.named : []).slice(0, 200).map((n) => {
        const o = (n ?? {}) as Record<string, unknown>;
        return {
          firstName: texte(o.firstName, 100),
          lastName: texte(o.lastName, 100),
          email: texte(o.email, 200).toLowerCase(),
        };
      }),
    },
    notes: texte(r.notes, 4000),
  };
}
