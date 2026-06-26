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
  | { ok: true; status: 'sent' | 'skipped_existing' | 'no_email' | 'no_base_url' | 'not_found' }
  | { ok: false; error: string };

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
    .select(
      'id, organization_id, learner_id, learner:learners(first_name, last_name, email), formation:formations(title)',
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

  // Anti-doublon : une seule fiche besoin par (template, dossier, apprenant).
  const { data: existing } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id')
    .eq('template_id', templateId)
    .eq('dossier_id', dossier.id)
    .eq('recipient_kind', 'learner')
    .maybeSingle();
  if (existing) return { ok: true, status: 'skipped_existing' };

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
  });
  if (!r.ok && r.reason !== 'no_api_key') return { ok: false, error: 'send_failed' };

  return { ok: true, status: 'sent' };
}
