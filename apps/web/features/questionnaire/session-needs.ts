import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

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
  readonly email: string;
  readonly dossierId: string;
  readonly companyName?: string | null;
};

export type FicheBesoin = {
  readonly learnerId: string;
  readonly dossierId: string;
  readonly name: string;
  readonly companyName: string | null;
  /** `recue` : réponses disponibles · `envoyee` : questionnaire parti, sans réponse · `absente` : rien d'envoyé. */
  readonly statut: 'recue' | 'envoyee' | 'absente';
  readonly source: 'questionnaire' | 'inscription' | null;
  readonly dateIso: string | null;
  readonly answers: NeedsAnswers;
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

const remplie = (a: NeedsAnswers | null | undefined): boolean =>
  Boolean(a && (a.currentLevel || a.objectives || a.expectations || a.constraints || a.accommodations || a.typologyContext));

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

  const { data: aff } =
    modeleIds.length && dossierIds.length
      ? await sb
          .schema('app')
          .from('questionnaire_assignments')
          .select('id, dossier_id, recipient_learner_id, status, created_at')
          .in('template_id', modeleIds)
          .in('dossier_id', [...dossierIds])
      : { data: [] };
  const affectations = (aff ?? []) as {
    id: string;
    dossier_id: string | null;
    recipient_learner_id: string | null;
    status: string;
    created_at: string;
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
    ((rep ?? []) as { assignment_id: string; answers: NeedsAnswers | null; submitted_at: string | null }[]).map((r) => [
      r.assignment_id,
      r,
    ]),
  );

  // Repli inscription : prospects de l'organisme, par email d'apprenant.
  const emails = [...new Set(participants.map((p) => p.email).filter(Boolean))];
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
    const a = affectations
      .filter((x) => x.recipient_learner_id === p.id && x.dossier_id === p.dossierId)
      .sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
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
    };
  });
}
