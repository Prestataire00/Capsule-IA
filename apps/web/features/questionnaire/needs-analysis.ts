import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, createHash } from 'node:crypto';
import { env } from '@/env.mjs';
import { sendEmail } from '@/shared/lib/email/resend';
import { needsAnalysisEmail } from '@/shared/lib/email/templates';
import { generateNeedsAnalysisUrl } from '@/shared/lib/needs-analysis-token';

// « Fiche besoin » = questionnaire de positionnement (analyse des besoins) envoyé
// automatiquement à l'apprenant dès qu'il est rattaché à un dossier. Réutilise
// l'infra questionnaire (template système + assignment + token + page publique).

const POSITIONNEMENT_TEMPLATE_CODE = 'positionnement_default';

type Sb = ReturnType<typeof admin>;

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** Crée (idempotent) le template système « fiche besoin » et renvoie son id. */
export async function ensureNeedsAnalysisTemplate(sb: Sb): Promise<string> {
  const { data: existing } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('id')
    .is('organization_id', null)
    .eq('code', POSITIONNEMENT_TEMPLATE_CODE)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: created } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .insert({
      organization_id: null,
      kind: 'positionnement',
      code: POSITIONNEMENT_TEMPLATE_CODE,
      title: 'Fiche besoin — Analyse des besoins',
      description:
        "Recueil des besoins et attentes de l'apprenant avant l'entrée en formation (Qualiopi).",
      schema: {
        version: 1,
        fields: [
          { key: 'currentLevel', kind: 'rating_5' },
          { key: 'objectives', kind: 'long_text' },
          { key: 'expectations', kind: 'long_text' },
          { key: 'constraints', kind: 'long_text' },
          { key: 'accommodations', kind: 'long_text' },
        ],
      },
      is_active: true,
    })
    .select('id')
    .single();
  return (created as { id: string }).id;
}

export type NeedsAnalysisSendResult =
  | {
      ok: true;
      status: 'sent' | 'skipped_existing' | 'no_email' | 'no_base_url' | 'not_found' | 'reused_inscription';
    }
  | { ok: false; error: string };

/** Réponses « Fiche besoin » saisies à l'inscription (étape 3), stockées sur le prospect. */
type InscriptionNeedsAnalysis = {
  currentLevel?: number | null;
  objectives?: string | null;
  expectations?: string | null;
  constraints?: string | null;
  accommodations?: string | null;
};

/**
 * Récupère l'analyse des besoins déjà remplie à l'inscription pour l'apprenant
 * d'un dossier : on privilégie le prospect converti sur ce dossier, sinon le
 * dernier prospect de même email dans l'organisation. Renvoie null si aucune
 * réponse exploitable (objectifs manquants).
 */
async function loadInscriptionNeedsAnalysis(
  sb: Sb,
  opts: { organizationId: string; dossierId: string; email: string },
): Promise<InscriptionNeedsAnalysis | null> {
  const { data } = await sb
    .schema('app')
    .from('prospects')
    .select('needs_analysis, converted_dossier_id, created_at')
    .eq('organization_id', opts.organizationId)
    .eq('email', opts.email)
    .not('needs_analysis', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);

  const rows = (data ?? []) as Array<{
    needs_analysis: InscriptionNeedsAnalysis | null;
    converted_dossier_id: string | null;
  }>;
  if (rows.length === 0) return null;

  const preferred = rows.find((r) => r.converted_dossier_id === opts.dossierId) ?? rows[0];
  const na = preferred?.needs_analysis ?? null;
  // Objectifs = champ requis de l'étape 3 ; sans lui, on ne considère pas la fiche remplie.
  if (!na || !na.objectives || !na.objectives.trim()) return null;
  return na;
}

/**
 * Envoie (idempotent) la fiche besoin à l'apprenant d'un dossier : assure le
 * template, crée l'assignment positionnement s'il n'existe pas, génère le lien
 * token et envoie l'email. Ne lève jamais — renvoie un Result.
 */
export async function sendNeedsAnalysisForDossier(opts: {
  dossierId: string;
  baseUrl?: string | null;
  sb?: Sb;
}): Promise<NeedsAnalysisSendResult> {
  const baseUrl = (opts.baseUrl ?? env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const sb = opts.sb ?? admin();

  const { data: dossierRow } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, organization_id, learner_id, learner:learners!dossiers_learner_id_fkey(first_name, last_name, email), formation:formations(title)',
    )
    .eq('id', opts.dossierId)
    .maybeSingle();
  if (!dossierRow) return { ok: true, status: 'not_found' };

  const dossier = dossierRow as unknown as {
    id: string;
    organization_id: string;
    learner_id: string | null;
    learner: { first_name: string; last_name: string; email: string | null } | null;
    formation: { title: string } | null;
  };
  if (!dossier.learner_id || !dossier.learner?.email) return { ok: true, status: 'no_email' };

  const templateId = await ensureNeedsAnalysisTemplate(sb);

  // Réponses d'inscription (étape 3 « Fiche besoin ») déjà saisies pour cet apprenant.
  const inscriptionNa = await loadInscriptionNeedsAnalysis(sb, {
    organizationId: dossier.organization_id,
    dossierId: dossier.id,
    email: dossier.learner.email,
  });
  const answersFromInscription = (na: InscriptionNeedsAnalysis) => ({
    currentLevel: na.currentLevel ?? null,
    objectives: na.objectives ?? null,
    expectations: na.expectations ?? null,
    constraints: na.constraints ?? null,
    accommodations: na.accommodations ?? null,
  });

  // Anti-doublon : une seule fiche besoin par (template, dossier, apprenant).
  const { data: existing } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, status')
    .eq('template_id', templateId)
    .eq('dossier_id', dossier.id)
    .eq('recipient_kind', 'learner')
    .maybeSingle();

  if (existing) {
    const ex = existing as { id: string; status: string };
    if (ex.status === 'completed') return { ok: true, status: 'skipped_existing' };
    // Fiche en attente : si l'inscription contient déjà les réponses, on la
    // complète automatiquement (backfill) plutôt que d'attendre l'apprenant —
    // couvre les dossiers créés avant cette logique.
    if (!inscriptionNa) return { ok: true, status: 'skipped_existing' };
    const { data: hasResp } = await sb
      .schema('app')
      .from('questionnaire_responses')
      .select('id')
      .eq('assignment_id', ex.id)
      .maybeSingle();
    if (!hasResp) {
      const { error: respErr } = await sb
        .schema('app')
        .from('questionnaire_responses')
        .insert({
          organization_id: dossier.organization_id,
          assignment_id: ex.id,
          template_id: templateId,
          dossier_id: dossier.id,
          answers: answersFromInscription(inscriptionNa),
        });
      if (respErr) return { ok: false, error: respErr.message };
    }
    await sb
      .schema('app')
      .from('questionnaire_assignments')
      .update({ status: 'completed' })
      .eq('id', ex.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any).rpc('recompute_qualiopi_checklist', { p_dossier_id: dossier.id });
    return { ok: true, status: 'reused_inscription' };
  }

  // Pas d'assignation : si l'inscription contient les réponses, on crée le
  // questionnaire de positionnement DÉJÀ complété à partir de ces réponses —
  // aucun renvoi à l'apprenant, et l'indicateur Qualiopi d'entrée (positionnement,
  // I5/I10) est satisfait immédiatement.
  if (inscriptionNa) {
    const reusedTokenHash = createHash('sha256').update(randomBytes(24)).digest('hex');
    const { data: reusedAssign, error: reusedErr } = await sb
      .schema('app')
      .from('questionnaire_assignments')
      .insert({
        organization_id: dossier.organization_id,
        template_id: templateId,
        dossier_id: dossier.id,
        recipient_kind: 'learner',
        recipient_learner_id: dossier.learner_id,
        recipient_email: dossier.learner.email,
        recipient_name: `${dossier.learner.first_name} ${dossier.learner.last_name}`.trim(),
        token_hash: reusedTokenHash,
        status: 'completed',
      })
      .select('id')
      .single();
    if (reusedErr || !reusedAssign) return { ok: false, error: reusedErr?.message ?? 'assignment_failed' };

    const { error: respErr } = await sb
      .schema('app')
      .from('questionnaire_responses')
      .insert({
        organization_id: dossier.organization_id,
        assignment_id: (reusedAssign as { id: string }).id,
        template_id: templateId,
        dossier_id: dossier.id,
        answers: answersFromInscription(inscriptionNa),
      });
    if (respErr) return { ok: false, error: respErr.message };

    // Rafraîchit la checklist Qualiopi pour refléter immédiatement le
    // positionnement satisfait (la page lit la checklist stockée). Best-effort.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any).rpc('recompute_qualiopi_checklist', { p_dossier_id: dossier.id });

    return { ok: true, status: 'reused_inscription' };
  }

  if (!baseUrl) return { ok: true, status: 'no_base_url' };

  const tokenHash = createHash('sha256').update(randomBytes(24)).digest('hex');
  const { data: created, error: assignErr } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .insert({
      organization_id: dossier.organization_id,
      template_id: templateId,
      dossier_id: dossier.id,
      recipient_kind: 'learner',
      recipient_learner_id: dossier.learner_id,
      recipient_email: dossier.learner.email,
      recipient_name: `${dossier.learner.first_name} ${dossier.learner.last_name}`.trim(),
      token_hash: tokenHash,
      status: 'pending',
    })
    .select('id')
    .single();
  if (assignErr || !created) return { ok: false, error: assignErr?.message ?? 'assignment_failed' };

  const assignmentId = (created as { id: string }).id;
  const { url } = await generateNeedsAnalysisUrl(
    {
      assignmentId,
      dossierId: dossier.id,
      organizationId: dossier.organization_id,
      learnerId: dossier.learner_id,
    },
    baseUrl,
  );

  const email = needsAnalysisEmail({
    firstName: dossier.learner.first_name,
    formationTitle: dossier.formation?.title ?? null,
    formUrl: url,
    durationMinutes: 10,
  });
  const r = await sendEmail({
    to: dossier.learner.email,
    subject: email.subject,
    html: email.html,
    replyTo: env.OF_NOTIFICATION_EMAIL,
    kind: 'fiche_besoin',
    dossierId: dossier.id,
    organizationId: dossier.organization_id,
  });
  if (!r.ok && r.reason !== 'no_api_key') return { ok: false, error: 'send_failed' };

  return { ok: true, status: 'sent' };
}

/**
 * Envoie (idempotent) la fiche besoin à un apprenant créé hors dossier (dashboard).
 * Crée une assignation positionnement sans dossier_id. Ne lève jamais.
 */
export async function sendNeedsAnalysisForLearner(opts: {
  learnerId: string;
  baseUrl?: string | null;
  sb?: Sb;
}): Promise<NeedsAnalysisSendResult> {
  const baseUrl = (opts.baseUrl ?? env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const sb = opts.sb ?? admin();

  const { data: learnerRow } = await sb
    .schema('app')
    .from('learners')
    .select('id, organization_id, first_name, last_name, email')
    .eq('id', opts.learnerId)
    .maybeSingle();
  if (!learnerRow) return { ok: true, status: 'not_found' };

  const learner = learnerRow as unknown as {
    id: string;
    organization_id: string;
    first_name: string;
    last_name: string;
    email: string | null;
  };
  if (!learner.email) return { ok: true, status: 'no_email' };

  const templateId = await ensureNeedsAnalysisTemplate(sb);

  // Anti-doublon : une fiche besoin hors dossier par apprenant.
  const { data: existing } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id')
    .eq('template_id', templateId)
    .eq('recipient_learner_id', learner.id)
    .is('dossier_id', null)
    .maybeSingle();
  if (existing) return { ok: true, status: 'skipped_existing' };

  if (!baseUrl) return { ok: true, status: 'no_base_url' };

  const tokenHash = createHash('sha256').update(randomBytes(24)).digest('hex');
  const { data: created, error: assignErr } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .insert({
      organization_id: learner.organization_id,
      template_id: templateId,
      dossier_id: null,
      recipient_kind: 'learner',
      recipient_learner_id: learner.id,
      recipient_email: learner.email,
      recipient_name: `${learner.first_name} ${learner.last_name}`.trim(),
      token_hash: tokenHash,
      status: 'pending',
    })
    .select('id')
    .single();
  if (assignErr || !created) return { ok: false, error: assignErr?.message ?? 'assignment_failed' };

  const assignmentId = (created as { id: string }).id;
  const { url } = await generateNeedsAnalysisUrl(
    {
      assignmentId,
      dossierId: null,
      organizationId: learner.organization_id,
      learnerId: learner.id,
    },
    baseUrl,
  );

  const email = needsAnalysisEmail({
    firstName: learner.first_name,
    formationTitle: null,
    formUrl: url,
    durationMinutes: 10,
  });
  const r = await sendEmail({
    to: learner.email,
    subject: email.subject,
    html: email.html,
    replyTo: env.OF_NOTIFICATION_EMAIL,
    kind: 'fiche_besoin',
    organizationId: learner.organization_id,
  });
  if (!r.ok && r.reason !== 'no_api_key') return { ok: false, error: 'send_failed' };

  return { ok: true, status: 'sent' };
}
