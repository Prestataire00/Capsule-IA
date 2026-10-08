import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { questionsDuSchema } from './fiche-besoin';

/**
 * Fiches besoin (analyse des besoins) des participants d'une séance.
 *
 * Deux sources, dans cet ordre : la réponse au questionnaire de positionnement
 * (`questionnaire_responses`), sinon les réponses saisies à l'inscription et
 * restées sur le prospect (`prospects.needs_analysis`) — un dossier créé avant
 * la reprise automatique de l'inscription n'a pas de réponse en base mais la
 * fiche existe bel et bien. Lecture seule, partagée par la session (côté
 * organisme) et l'espace formateur.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type NeedsAnswers = {
  currentLevel?: number | null;
  objectives?: string | null;
  expectations?: string | null;
  constraints?: string | null;
  accommodations?: string | null;
  typologyContext?: string | null;
};

export type NeedsParticipant = {
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly email: string | null;
  /** null : stagiaire inscrit directement à la séance, sans dossier. */
  readonly dossierId: string | null;
  readonly companyName?: string | null;
};

/** Une question de la fiche, telle que posée au stagiaire. */
export type QuestionFiche = { readonly id: string; readonly label: string; readonly type: string; readonly max?: number };

export type FicheBesoin = {
  readonly learnerId: string;
  readonly dossierId: string | null;
  readonly name: string;
  readonly companyName: string | null;
  /** `recue` : réponses disponibles · `envoyee` : questionnaire parti, sans réponse · `absente` : rien d'envoyé. */
  readonly statut: 'recue' | 'envoyee' | 'absente';
  readonly source: 'questionnaire' | 'inscription' | null;
  readonly dateIso: string | null;
  readonly answers: NeedsAnswers & Record<string, unknown>;
  /** Les questions du modèle auquel il a répondu ; null = celles du modèle intégré. */
  readonly questions: readonly QuestionFiche[] | null;
};

export const NIVEAUX: Record<number, string> = {
  1: 'Débutant',
  2: 'Bases',
  3: 'Intermédiaire',
  4: 'Avancé',
  5: 'Expert',
};

export const CHAMPS_BESOIN = [
  { cle: 'objectives', label: 'Objectifs' },
  { cle: 'expectations', label: 'Attentes' },
  { cle: 'constraints', label: 'Contraintes' },
  { cle: 'accommodations', label: 'Adaptations (handicap, accessibilité)' },
  { cle: 'typologyContext', label: 'Situation (contexte professionnel)' },
] as const satisfies ReadonlyArray<{ cle: keyof NeedsAnswers; label: string }>;

/**
 * Remplie dès qu'une question a une réponse. Ne regarder que les champs de la
 * fiche d'origine laissait « en attente » toute fiche adaptée à la formation,
 * dont les questions sont autres (constat du 2026-10-08).
 */
const remplie = (a: (NeedsAnswers & Record<string, unknown>) | null | undefined): boolean =>
  Boolean(a && Object.values(a).some((v) => v !== null && v !== undefined && String(v).trim() !== ''));

export async function loadSessionNeeds(
  sb: Client,
  opts: { organizationId: string; participants: readonly NeedsParticipant[]; dossierIds: readonly string[] },
): Promise<FicheBesoin[]> {
  const { participants, dossierIds } = opts;
  if (participants.length === 0) return [];

  const { data: modeles } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('id')
    .eq('kind', 'positionnement');
  const modeleIds = ((modeles ?? []) as { id: string }[]).map((m) => m.id);

  // Fiches « sans dossier » de tous les participants : une fiche remplie avant
  // qu'on rattache la personne à son dossier y a été enregistrée (2026-10-08).
  const sansDossier = participants.map((p) => p.id);
  const colonnes = 'id, dossier_id, recipient_learner_id, status, created_at, template_id';
  const [{ data: aff }, { data: affSans }] = await Promise.all([
    modeleIds.length && dossierIds.length
      ? sb.schema('app').from('questionnaire_assignments').select(colonnes).in('template_id', modeleIds).in('dossier_id', [...dossierIds])
      : Promise.resolve({ data: [] }),
    modeleIds.length && sansDossier.length
      ? sb
          .schema('app')
          .from('questionnaire_assignments')
          .select(colonnes)
          .in('template_id', modeleIds)
          .is('dossier_id', null)
          .in('recipient_learner_id', sansDossier)
      : Promise.resolve({ data: [] }),
  ]);
  const affectations = [...(aff ?? []), ...(affSans ?? [])] as {
    id: string;
    dossier_id: string | null;
    recipient_learner_id: string | null;
    status: string;
    created_at: string;
    template_id: string;
  }[];

  const { data: rep } = affectations.length
    ? await sb
        .schema('app')
        .from('questionnaire_responses')
        .select('assignment_id, answers, submitted_at')
        .in(
          'assignment_id',
          affectations.map((a) => a.id),
        )
    : { data: [] };
  const reponses = new Map(
    ((rep ?? []) as { assignment_id: string; answers: (NeedsAnswers & Record<string, unknown>) | null; submitted_at: string | null }[]).map((r) => [
      r.assignment_id,
      r,
    ]),
  );

  // Les questions de chaque modèle répondu : une fiche adaptée à la formation
  // pose les siennes, et ses réponses doivent se lire avec leur libellé.
  const modelesRepondus = [...new Set(affectations.filter((a) => reponses.has(a.id)).map((a) => a.template_id))];
  const { data: schemas } = modelesRepondus.length
    ? await sb.schema('app').from('questionnaire_templates').select('id, schema').in('id', modelesRepondus)
    : { data: [] };
  const questionsDuModele = new Map(
    ((schemas ?? []) as Array<{ id: string; schema: unknown }>).map((t) => [
      t.id,
      questionsDuSchema(t.schema).map((q) => ({ id: q.id, label: q.label, type: q.type, ...('max' in q && q.max ? { max: q.max } : {}) })),
    ]),
  );

  // Repli inscription : prospects de l'organisme, par email d'apprenant.
  const emails = [...new Set(participants.map((p) => p.email).filter((e): e is string => Boolean(e)))];
  const { data: prosp } = emails.length
    ? await sb
        .schema('app')
        .from('prospects')
        .select('email, needs_analysis, converted_dossier_id, created_at')
        .eq('organization_id', opts.organizationId)
        .in('email', emails)
        .not('needs_analysis', 'is', null)
        .order('created_at', { ascending: false })
    : { data: [] };
  const prospects = (prosp ?? []) as {
    email: string;
    needs_analysis: NeedsAnswers | null;
    converted_dossier_id: string | null;
    created_at: string | null;
  }[];

  return participants.map((p) => {
    // Sa fiche sur son dossier, ou à défaut sans dossier ; une fiche remplie avant une fiche en attente.
    const a = affectations
      .filter((x) => x.recipient_learner_id === p.id && (x.dossier_id === p.dossierId || x.dossier_id === null))
      .sort(
        (x, y) =>
          Number(Boolean(reponses.get(y.id))) - Number(Boolean(reponses.get(x.id))) ||
          Number(y.dossier_id === p.dossierId) - Number(x.dossier_id === p.dossierId) ||
          y.created_at.localeCompare(x.created_at),
      )[0];
    const r = a ? reponses.get(a.id) : undefined;
    if (r && remplie(r.answers)) {
      return {
        learnerId: p.id,
        dossierId: p.dossierId,
        name: `${p.first_name} ${p.last_name}`.trim(),
        companyName: p.companyName ?? null,
        statut: 'recue' as const,
        source: 'questionnaire' as const,
        dateIso: r.submitted_at ?? a?.created_at ?? null,
        answers: r.answers ?? {},
        questions: a ? (questionsDuModele.get(a.template_id) ?? null) : null,
      };
    }

    const duProspect =
      prospects.find((x) => x.email === p.email && x.converted_dossier_id === p.dossierId) ??
      prospects.find((x) => x.email === p.email);
    if (duProspect && remplie(duProspect.needs_analysis)) {
      return {
        learnerId: p.id,
        dossierId: p.dossierId,
        name: `${p.first_name} ${p.last_name}`.trim(),
        companyName: p.companyName ?? null,
        statut: 'recue' as const,
        source: 'inscription' as const,
        dateIso: duProspect.created_at,
        answers: duProspect.needs_analysis ?? {},
        questions: null,
      };
    }

    return {
      learnerId: p.id,
      dossierId: p.dossierId,
      name: `${p.first_name} ${p.last_name}`.trim(),
      companyName: p.companyName ?? null,
      statut: a ? ('envoyee' as const) : ('absente' as const),
      source: null,
      dateIso: a?.created_at ?? null,
      answers: {},
      questions: null,
    };
  });
}
