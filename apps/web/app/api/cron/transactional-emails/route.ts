// ARCHETYPE: command (cron endpoint)
// Justification: tick quotidien qui envoie convocations J-7, satisfaction et fin de formation.
// Protégé par CRON_SECRET — invoqué par Railway cron / cron-job.org / pg_cron.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, createHash } from 'crypto';
import { env } from '@/env.mjs';
import { sendEmail } from '@/shared/lib/email/resend';
import {
  sessionConvocationEmail,
  satisfactionSurveyEmail,
  endOfTrainingEmail,
  startOfTrainingEmail,
} from '@/shared/lib/email/templates';
import { generateSatisfactionUrl } from '@/shared/lib/satisfaction-token';
import { attendanceSignatureMissingEmail, halfDayLabel } from '@/shared/lib/email/attendance-reminder';
import { generateTrainerSatisfactionUrl } from '@/shared/lib/trainer-satisfaction-token';
import { trainerSatisfactionEmail } from '@/shared/lib/email/trainer-satisfaction-email';
import { computeDossierAttendanceRate } from '@/features/attendance/attendance-rate';
import {
  sendNeedsAnalysisForDossier,
  sendNeedsAnalysisForLearner,
} from '@/features/questionnaire/needs-analysis';
import { sendConvocationsRecap } from '@/features/sessions/send-convocations-recap';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — cron peut être long si beaucoup d'emails

type SessionRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  modality: string;
  location: string | null;
  remote_url: string | null;
  dossier_id: string;
};

type DossierRow = {
  id: string;
  reference: string;
  status: string;
  end_date: string;
  total_hours: number;
  learner_id: string;
  formation_id: string;
};

type LearnerRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
};

type FormationRow = {
  id: string;
  title: string;
};

type TrainerRow = {
  id: string;
  first_name: string;
  last_name: string;
};

function admin() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const SATISFACTION_TEMPLATE_CODE = 'satisfaction_chaud_default';

async function ensureSatisfactionTemplate(sb: ReturnType<typeof admin>): Promise<string> {
  const { data: existing } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('id')
    .is('organization_id', null)
    .eq('code', SATISFACTION_TEMPLATE_CODE)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: created } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .insert({
      organization_id: null,
      kind: 'satisfaction_chaud',
      code: SATISFACTION_TEMPLATE_CODE,
      title: 'Satisfaction à chaud — Qualiopi',
      schema: {
        version: 1,
        fields: [
          { key: 'nps', kind: 'nps' },
          { key: 'overallRating', kind: 'rating_5' },
          { key: 'pedagogyRating', kind: 'rating_5' },
          { key: 'organizationRating', kind: 'rating_5' },
          { key: 'whatWorked', kind: 'long_text' },
          { key: 'whatToImprove', kind: 'long_text' },
        ],
      },
      is_active: true,
    })
    .select('id')
    .single();
  return (created as { id: string }).id;
}

async function ensureSatisfactionAssignment(
  sb: ReturnType<typeof admin>,
  templateId: string,
  dossierId: string,
  organizationId: string,
  learnerId: string,
): Promise<string> {
  const { data: existing } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id')
    .eq('template_id', templateId)
    .eq('dossier_id', dossierId)
    .eq('recipient_kind', 'learner')
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const tokenRaw = randomBytes(24).toString('hex');
  const tokenHash = createHash('sha256').update(tokenRaw).digest('hex');

  const { data: created } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .insert({
      organization_id: organizationId,
      template_id: templateId,
      dossier_id: dossierId,
      recipient_kind: 'learner',
      recipient_learner_id: learnerId,
      token_hash: tokenHash,
      status: 'pending',
    })
    .select('id')
    .single();
  return (created as { id: string }).id;
}

function isAuthorized(req: Request): boolean {
  const headerAuth = req.headers.get('Authorization');
  if (headerAuth === `Bearer ${env.CRON_SECRET}`) return true;
  // Supporte aussi ?secret= pour les crons HTTP simples (cron-job.org)
  const url = new URL(req.url);
  return url.searchParams.get('secret') === env.CRON_SECRET;
}

function formatHHMM(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function espaceUrlFor(_learnerId: string): string | null {
  // En prod : JWT signé apprenant. En attendant : null (le lien sera ajouté
  // quand verifyApprenantToken/signApprenantToken seront branchés ici.)
  return null;
}

async function runConvocationsJ7(): Promise<{ candidates: number; sent: number; errors: string[] }> {
  const sb = admin();

  // Sessions qui démarrent dans exactement 7 jours (fenêtre 00:00–23:59 UTC).
  const j7 = new Date();
  j7.setUTCDate(j7.getUTCDate() + 7);
  const j7Start = new Date(j7);
  j7Start.setUTCHours(0, 0, 0, 0);
  const j7End = new Date(j7);
  j7End.setUTCHours(23, 59, 59, 999);

  const { data: sessions, error: sErr } = await sb
    .schema('app')
    .from('sessions')
    .select('id, starts_at, ends_at, modality, location, remote_url, dossier_id')
    .gte('starts_at', j7Start.toISOString())
    .lte('starts_at', j7End.toISOString())
    .eq('status', 'planned');

  if (sErr) {
    console.error('[cron] sessions query failed', sErr);
    return { candidates: 0, sent: 0, errors: [sErr.message] };
  }

  const sessionRows = (sessions ?? []) as unknown as SessionRow[];
  if (sessionRows.length === 0) {
    return { candidates: 0, sent: 0, errors: [] };
  }

  let sent = 0;
  const errors: string[] = [];

  for (const session of sessionRows) {
    // Participants apprenants de la session
    const { data: participants } = await sb
      .schema('app')
      .from('session_participants')
      .select('learner_id, trainer_id, participant_kind')
      .eq('session_id', session.id);

    const learnerIds = (participants ?? [])
      .filter((p: { participant_kind: string; learner_id: string | null }) => p.participant_kind === 'learner' && p.learner_id)
      .map((p: { learner_id: string }) => p.learner_id);
    const trainerIds = (participants ?? [])
      .filter((p: { participant_kind: string; trainer_id: string | null }) => p.participant_kind === 'trainer' && p.trainer_id)
      .map((p: { trainer_id: string }) => p.trainer_id);

    if (learnerIds.length === 0) continue;

    // Dossier + formation
    const { data: dossierRow } = await sb
      .schema('app')
      .from('dossiers')
      .select('id, formation_id')
      .eq('id', session.dossier_id)
      .maybeSingle();
    const dossier = dossierRow as { formation_id: string } | null;
    if (!dossier) continue;

    const { data: formationRow } = await sb
      .schema('app')
      .from('formations')
      .select('title')
      .eq('id', dossier.formation_id)
      .maybeSingle();
    const formationTitle = (formationRow as { title: string } | null)?.title ?? 'Votre formation';

    // Formateur (1er du dossier)
    let trainerName: string | null = null;
    if (trainerIds.length > 0) {
      const { data: tRow } = await sb
        .schema('app')
        .from('trainers')
        .select('first_name, last_name')
        .eq('id', trainerIds[0])
        .maybeSingle();
      const t = tRow as { first_name: string; last_name: string } | null;
      if (t) trainerName = `${t.first_name} ${t.last_name}`;
    }

    // Apprenants
    const { data: learnersRow } = await sb
      .schema('app')
      .from('learners')
      .select('id, first_name, last_name, email')
      .in('id', learnerIds);
    const learners = (learnersRow ?? []) as unknown as LearnerRow[];

    for (const learner of learners) {
      try {
        const tpl = sessionConvocationEmail({
          firstName: learner.first_name,
          formationTitle,
          sessionDate: session.starts_at,
          sessionStartTime: formatHHMM(session.starts_at),
          sessionEndTime: formatHHMM(session.ends_at),
          modality: session.modality,
          location: session.location,
          remoteUrl: session.remote_url,
          trainerName,
          espaceUrl: espaceUrlFor(learner.id),
        });
        const r = await sendEmail({ to: learner.email, subject: tpl.subject, html: tpl.html });
        if (r.ok) sent++;
        else if (r.reason !== 'no_api_key') errors.push(`convocation ${session.id} / ${learner.email}: send_failed`);
      } catch (e) {
        errors.push(`convocation ${session.id} / ${learner.email}: ${(e as Error).message}`);
      }
    }
  }

  // Récap aux entreprises clientes : une fois les convocations individuelles
  // parties, le responsable de chaque société reçoit celles de ses salariés en
  // un seul envoi. Il ne recevait rien jusqu'ici.
  for (const s of sessionRows as unknown as { id: string }[]) {
    try {
      const recap = await sendConvocationsRecap(s.id);
      sent += recap.envoyes;
      errors.push(...recap.erreurs);
    } catch (e) {
      errors.push(`recap ${s.id}: ${e instanceof Error ? e.message : 'échec'}`);
    }
  }

  return { candidates: sessionRows.length, sent, errors };
}

async function runDossierEnd(): Promise<{ candidates: number; satisfactionSent: number; certificateSent: number; errors: string[] }> {
  const sb = admin();

  // Dossiers terminés hier (end_date = yesterday, status = completed)
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayISO = yesterday.toISOString().slice(0, 10);

  const { data: dossiers, error: dErr } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, reference, status, end_date, total_hours, learner_id, formation_id')
    .eq('end_date', yesterdayISO)
    .eq('status', 'completed');

  if (dErr) {
    console.error('[cron] dossiers query failed', dErr);
    return { candidates: 0, satisfactionSent: 0, certificateSent: 0, errors: [dErr.message] };
  }

  const rows = (dossiers ?? []) as unknown as DossierRow[];
  if (rows.length === 0) {
    return { candidates: 0, satisfactionSent: 0, certificateSent: 0, errors: [] };
  }

  let satisfactionSent = 0;
  let certificateSent = 0;
  const errors: string[] = [];

  for (const d of rows) {
    const [{ data: learnerRow }, { data: formationRow }] = await Promise.all([
      sb.schema('app').from('learners').select('first_name, last_name, email').eq('id', d.learner_id).maybeSingle(),
      sb.schema('app').from('formations').select('title').eq('id', d.formation_id).maybeSingle(),
    ]);
    const learner = learnerRow as LearnerRow | null;
    if (!learner) continue;
    const formationTitle = (formationRow as { title: string } | null)?.title ?? 'Votre formation';

    // Satisfaction — JWT signed URL
    try {
      const baseUrl = env.PUBLIC_APP_URL ?? 'http://localhost:3000';
      const templateId = await ensureSatisfactionTemplate(sb);

      // Récup org_id du dossier
      const { data: dossierRow } = await sb
        .schema('app')
        .from('dossiers')
        .select('organization_id')
        .eq('id', d.id)
        .maybeSingle();
      const orgId = (dossierRow as { organization_id: string } | null)?.organization_id;
      if (!orgId) throw new Error('dossier org_id missing');

      const assignmentId = await ensureSatisfactionAssignment(sb, templateId, d.id, orgId, d.learner_id);
      const signed = await generateSatisfactionUrl(
        { assignmentId, dossierId: d.id, organizationId: orgId, learnerId: d.learner_id },
        baseUrl,
      );

      const sat = satisfactionSurveyEmail({
        firstName: learner.first_name,
        formationTitle,
        surveyUrl: signed.url,
        durationMinutes: 5,
      });
      const r = await sendEmail({ to: learner.email, subject: sat.subject, html: sat.html });
      if (r.ok) satisfactionSent++;
      else if (r.reason !== 'no_api_key') errors.push(`satisfaction ${d.id}: send_failed`);
    } catch (e) {
      errors.push(`satisfaction ${d.id}: ${(e as Error).message}`);
    }

    // Fin de formation : attestation de fin (apprenant) + certificat de réalisation
    // (administratif) — les deux pour tous les dossiers terminés.
    try {
      const base = env.PUBLIC_APP_URL ? env.PUBLIC_APP_URL.replace(/\/$/, '') : null;
      const attestationUrl = base ? `${base}/api/dossiers/${d.id}/attestation.pdf` : null;
      const certificateUrl = base ? `${base}/api/dossiers/${d.id}/certificat.pdf` : null;
      const eot = endOfTrainingEmail({
        firstName: learner.first_name,
        formationTitle,
        endDate: d.end_date,
        totalHours: d.total_hours,
        attendanceRate: await computeDossierAttendanceRate(sb, d.id),
        attestationUrl,
        certificateUrl,
        espaceUrl: espaceUrlFor(d.learner_id),
      });
      const r = await sendEmail({ to: learner.email, subject: eot.subject, html: eot.html });
      if (r.ok) certificateSent++;
      else if (r.reason !== 'no_api_key') errors.push(`certificate ${d.id}: send_failed`);
    } catch (e) {
      errors.push(`certificate ${d.id}: ${(e as Error).message}`);
    }
  }

  return { candidates: rows.length, satisfactionSent, certificateSent, errors };
}

// F-EMA-08 — Alerte signature manquante : feuilles d'émargement non finalisées
// dont la session est terminée → notification in-app (formateur/admin) + email.
// Dédup via app.notifications (template_code + related_aggregate) → une alerte
// par feuille. Le cron étant quotidien, idempotent par construction.
async function runMissingSignatureAlerts(): Promise<{ candidates: number; alerted: number; errors: string[] }> {
  const sb = admin();
  const nowISO = new Date().toISOString();
  const errors: string[] = [];

  const { data: sheetsRaw, error: shErr } = await sb
    .schema('app')
    .from('attendance_sheets')
    .select('id, half_day, organization_id, session_id, status')
    .in('status', ['open', 'partial']);
  if (shErr) return { candidates: 0, alerted: 0, errors: [shErr.message] };
  const sheets = (sheetsRaw ?? []) as unknown as {
    id: string; half_day: string; organization_id: string; session_id: string; status: string;
  }[];
  if (sheets.length === 0) return { candidates: 0, alerted: 0, errors: [] };

  // Sessions terminées (ends_at < now, non annulées)
  const sessionIds = [...new Set(sheets.map((s) => s.session_id))];
  const { data: sessRaw } = await sb
    .schema('app')
    .from('sessions')
    .select('id, starts_at, ends_at, status, dossier_id')
    .in('id', sessionIds);
  const sessById = new Map(
    ((sessRaw ?? []) as unknown as { id: string; starts_at: string; ends_at: string; status: string; dossier_id: string }[])
      .map((s) => [s.id, s] as const),
  );

  const candidates = sheets.filter((sh) => {
    const sess = sessById.get(sh.session_id);
    return !!sess && sess.status !== 'cancelled' && sess.ends_at < nowISO;
  });
  if (candidates.length === 0) return { candidates: 0, alerted: 0, errors: [] };

  // Dédup : feuilles déjà alertées
  const candIds = candidates.map((s) => s.id);
  const { data: notifRaw } = await sb
    .schema('app')
    .from('notifications')
    .select('related_aggregate_id')
    .eq('related_aggregate_type', 'attendance_sheet')
    .eq('template_code', 'attendance_signature_missing')
    .in('related_aggregate_id', candIds);
  const alreadyAlerted = new Set(((notifRaw ?? []) as { related_aggregate_id: string }[]).map((n) => n.related_aggregate_id));
  const todo = candidates.filter((s) => !alreadyAlerted.has(s.id));
  if (todo.length === 0) return { candidates: candidates.length, alerted: 0, errors: [] };

  // Dossiers + formations (batch)
  const dossierIds = [...new Set(todo.map((s) => sessById.get(s.session_id)!.dossier_id))];
  const { data: dossRaw } = await sb.schema('app').from('dossiers').select('id, reference, formation_id').in('id', dossierIds);
  const dossById = new Map(((dossRaw ?? []) as { id: string; reference: string; formation_id: string }[]).map((d) => [d.id, d] as const));
  const formationIds = [...new Set(((dossRaw ?? []) as { formation_id: string }[]).map((d) => d.formation_id))];
  const { data: formRaw } = formationIds.length
    ? await sb.schema('app').from('formations').select('id, title').in('id', formationIds)
    : { data: [] };
  const formById = new Map(((formRaw ?? []) as { id: string; title: string }[]).map((f) => [f.id, f] as const));

  // Formateurs par session (batch)
  const { data: partsRaw } = await sb
    .schema('app')
    .from('session_participants')
    .select('session_id, trainer_id, participant_kind')
    .in('session_id', sessionIds)
    .eq('participant_kind', 'trainer');
  const trainerIdsBySession = new Map<string, string[]>();
  for (const p of (partsRaw ?? []) as { session_id: string; trainer_id: string | null }[]) {
    if (!p.trainer_id) continue;
    const arr = trainerIdsBySession.get(p.session_id) ?? [];
    arr.push(p.trainer_id);
    trainerIdsBySession.set(p.session_id, arr);
  }
  const allTrainerIds = [...new Set([...trainerIdsBySession.values()].flat())];
  const { data: trainersRaw } = allTrainerIds.length
    ? await sb.schema('app').from('trainers').select('id, first_name, last_name, email').in('id', allTrainerIds)
    : { data: [] };
  const trainerById = new Map(
    ((trainersRaw ?? []) as { id: string; first_name: string; last_name: string; email: string }[]).map((t) => [t.id, t] as const),
  );

  const baseUrl = env.PUBLIC_APP_URL ? env.PUBLIC_APP_URL.replace(/\/$/, '') : null;
  let alerted = 0;

  for (const sh of todo) {
    try {
      const sess = sessById.get(sh.session_id)!;
      const doss = dossById.get(sess.dossier_id);
      const formationTitle = doss ? formById.get(doss.formation_id)?.title ?? 'Formation' : 'Formation';
      const dossierReference = doss?.reference ?? '—';
      const sessionDateLabel = new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris',
      }).format(new Date(sess.starts_at));
      const dashboardUrl = baseUrl ? `${baseUrl}/dossiers/${sess.dossier_id}/emargements` : null;

      // Marqueur in-app (dédup) — une notif par feuille
      await sb.schema('app').from('notifications').insert({
        organization_id: sh.organization_id,
        channel: 'in_app',
        template_code: 'attendance_signature_missing',
        subject: `Émargement manquant — ${formationTitle} (${halfDayLabel(sh.half_day)})`,
        payload: { attendance_sheet_id: sh.id, session_id: sh.session_id, dossier_id: sess.dossier_id, half_day: sh.half_day },
        status: 'sent',
        sent_at: new Date().toISOString(),
        related_aggregate_type: 'attendance_sheet',
        related_aggregate_id: sh.id,
      });

      // Emails formateur(s) + admin
      const recipients: { email: string; name: string | null }[] = [];
      for (const tid of trainerIdsBySession.get(sh.session_id) ?? []) {
        const t = trainerById.get(tid);
        if (t?.email) recipients.push({ email: t.email, name: `${t.first_name} ${t.last_name}` });
      }
      if (env.OF_NOTIFICATION_EMAIL) recipients.push({ email: env.OF_NOTIFICATION_EMAIL, name: null });

      for (const r of recipients) {
        const tpl = attendanceSignatureMissingEmail({
          recipientName: r.name,
          formationTitle,
          dossierReference,
          sessionDateLabel,
          halfDay: sh.half_day,
          dashboardUrl,
        });
        const res = await sendEmail({ to: r.email, subject: tpl.subject, html: tpl.html });
        if (!res.ok && res.reason !== 'no_api_key') errors.push(`alert ${sh.id} / ${r.email}: send_failed`);
      }
      alerted++;
    } catch (e) {
      errors.push(`alert ${sh.id}: ${(e as Error).message}`);
    }
  }

  return { candidates: candidates.length, alerted, errors };
}

const TRAINER_SAT_TEMPLATE_CODE = 'satisfaction_formateur_default';

async function ensureTrainerSatisfactionTemplate(sb: ReturnType<typeof admin>): Promise<string> {
  const { data: existing } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('id')
    .is('organization_id', null)
    .eq('code', TRAINER_SAT_TEMPLATE_CODE)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: created } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .insert({
      organization_id: null,
      kind: 'satisfaction_formateur',
      code: TRAINER_SAT_TEMPLATE_CODE,
      title: 'Satisfaction formateur — fin de formation',
      schema: {
        version: 1,
        fields: [
          { key: 'nps', kind: 'nps' },
          { key: 'overallRating', kind: 'rating_5' },
          { key: 'organizationRating', kind: 'rating_5' },
          { key: 'groupRating', kind: 'rating_5' },
          { key: 'whatWorked', kind: 'long_text' },
          { key: 'whatToImprove', kind: 'long_text' },
        ],
      },
      is_active: true,
    })
    .select('id')
    .single();
  return (created as { id: string }).id;
}

// F-FOR-10 — satisfaction formateur : à la fin d'un dossier, chaque formateur du
// dossier reçoit son propre questionnaire (assignation recipient_kind='trainer').
async function runTrainerSatisfaction(): Promise<{ candidates: number; sent: number; errors: string[] }> {
  const sb = admin();
  const errors: string[] = [];

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayISO = yesterday.toISOString().slice(0, 10);

  const { data: dossiers, error } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, organization_id, formation_id, end_date, status')
    .eq('end_date', yesterdayISO)
    .eq('status', 'completed');
  if (error) return { candidates: 0, sent: 0, errors: [error.message] };
  const rows = (dossiers ?? []) as unknown as { id: string; organization_id: string; formation_id: string }[];
  if (rows.length === 0) return { candidates: 0, sent: 0, errors: [] };

  const baseUrl = env.PUBLIC_APP_URL ?? 'http://localhost:3000';
  const templateId = await ensureTrainerSatisfactionTemplate(sb);
  let sent = 0;

  for (const d of rows) {
    const [{ data: formationRow }, { data: dtRows }] = await Promise.all([
      sb.schema('app').from('formations').select('title').eq('id', d.formation_id).maybeSingle(),
      sb.schema('app').from('dossier_trainers').select('trainer_id').eq('dossier_id', d.id),
    ]);
    const formationTitle = (formationRow as { title: string } | null)?.title ?? 'la formation';
    const trainerIds = ((dtRows ?? []) as { trainer_id: string }[]).map((r) => r.trainer_id);
    if (trainerIds.length === 0) continue;

    const { data: trainersRow } = await sb
      .schema('app')
      .from('trainers')
      .select('id, first_name, email')
      .in('id', trainerIds);
    const trainers = (trainersRow ?? []) as { id: string; first_name: string; email: string }[];

    for (const t of trainers) {
      try {
        // Anti-doublon : une assignation par (template, dossier, formateur)
        const { data: existing } = await sb
          .schema('app')
          .from('questionnaire_assignments')
          .select('id')
          .eq('template_id', templateId)
          .eq('dossier_id', d.id)
          .eq('recipient_kind', 'trainer')
          .eq('recipient_trainer_id', t.id)
          .maybeSingle();

        let assignmentId = (existing as { id: string } | null)?.id ?? null;
        if (!assignmentId) {
          const tokenHash = createHash('sha256').update(randomBytes(24)).digest('hex');
          const { data: createdAssign } = await sb
            .schema('app')
            .from('questionnaire_assignments')
            .insert({
              organization_id: d.organization_id,
              template_id: templateId,
              dossier_id: d.id,
              recipient_kind: 'trainer',
              recipient_trainer_id: t.id,
              token_hash: tokenHash,
              status: 'pending',
            })
            .select('id')
            .single();
          assignmentId = (createdAssign as { id: string } | null)?.id ?? null;
        }
        if (!assignmentId) {
          errors.push(`trainer_sat ${d.id}/${t.id}: assignment_failed`);
          continue;
        }

        const signed = await generateTrainerSatisfactionUrl(
          { assignmentId, dossierId: d.id, organizationId: d.organization_id, trainerId: t.id },
          baseUrl,
        );
        const tpl = trainerSatisfactionEmail({ firstName: t.first_name, formationTitle, surveyUrl: signed.url });
        const r = await sendEmail({ to: t.email, subject: tpl.subject, html: tpl.html });
        if (r.ok) sent++;
        else if (r.reason !== 'no_api_key') errors.push(`trainer_sat ${d.id}/${t.id}: send_failed`);
      } catch (e) {
        errors.push(`trainer_sat ${d.id}/${t.id}: ${(e as Error).message}`);
      }
    }
  }

  return { candidates: rows.length, sent, errors };
}

// Filet de sécurité : fiche besoin (positionnement) pour les dossiers récents
// dont l'apprenant n'a pas encore reçu sa fiche (idempotent via le helper).
async function runNeedsAnalysisOnEnrollment(): Promise<{ candidates: number; sent: number; errors: string[] }> {
  const sb = admin();
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 48h
  const { data, error } = await sb
    .schema('app')
    .from('dossiers')
    .select('id')
    .gte('created_at', cutoff);
  if (error) return { candidates: 0, sent: 0, errors: [error.message] };
  const rows = (data ?? []) as { id: string }[];

  let sent = 0;
  const errors: string[] = [];
  for (const d of rows) {
    try {
      const r = await sendNeedsAnalysisForDossier({ dossierId: d.id, sb });
      if (r.ok && r.status === 'sent') sent++;
      else if (!r.ok) errors.push(`needs ${d.id}: ${r.error}`);
    } catch (e) {
      errors.push(`needs ${d.id}: ${(e as Error).message}`);
    }
  }
  return { candidates: rows.length, sent, errors };
}

// Filet : fiche besoin pour les apprenants créés récemment sans dossier
// (création directe au dashboard) — idempotent via le helper.
async function runNeedsAnalysisForNewLearners(): Promise<{ candidates: number; sent: number; errors: string[] }> {
  const sb = admin();
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 48h
  const { data, error } = await sb
    .schema('app')
    .from('learners')
    .select('id')
    .gte('created_at', cutoff);
  if (error) return { candidates: 0, sent: 0, errors: [error.message] };
  const rows = (data ?? []) as { id: string }[];

  let sent = 0;
  const errors: string[] = [];
  for (const l of rows) {
    try {
      const r = await sendNeedsAnalysisForLearner({ learnerId: l.id, sb });
      if (r.ok && r.status === 'sent') sent++;
      else if (!r.ok) errors.push(`needs_learner ${l.id}: ${r.error}`);
    } catch (e) {
      errors.push(`needs_learner ${l.id}: ${(e as Error).message}`);
    }
  }
  return { candidates: rows.length, sent, errors };
}

// Attestation de démarrage : envoyée aux apprenants PRÉSENTS (ayant émargé au
// moins une fois) qui ne l'ont pas encore reçue. Idempotent via email_log
// (kind='attestation_demarrage' + dossier_id).
async function runStartAttestation(): Promise<{ candidates: number; sent: number; errors: string[] }> {
  const sb = admin();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: sigs, error } = await sb
    .schema('app')
    .from('attendance_signatures')
    .select('learner_id, signed_at, sheet:attendance_sheets(dossier_id, organization_id)')
    .eq('participant_kind', 'learner')
    .not('signed_at', 'is', null)
    .gte('signed_at', cutoff);
  if (error) return { candidates: 0, sent: 0, errors: [error.message] };

  // Un présent unique par dossier (le dossier porte 1 apprenant).
  const byDossier = new Map<string, { learnerId: string; organizationId: string }>();
  for (const s of (sigs ?? []) as unknown as Array<{
    learner_id: string | null;
    sheet: { dossier_id: string | null; organization_id: string } | null;
  }>) {
    const dossierId = s.sheet?.dossier_id;
    if (!dossierId || !s.learner_id || !s.sheet) continue;
    if (!byDossier.has(dossierId)) {
      byDossier.set(dossierId, { learnerId: s.learner_id, organizationId: s.sheet.organization_id });
    }
  }

  let sent = 0;
  const errors: string[] = [];
  const base = env.PUBLIC_APP_URL ? env.PUBLIC_APP_URL.replace(/\/$/, '') : null;

  for (const [dossierId, ctx] of byDossier) {
    try {
      // Dédup : déjà envoyée pour ce dossier ?
      const { data: already } = await sb
        .schema('app')
        .from('email_log')
        .select('id')
        .eq('dossier_id', dossierId)
        .eq('kind', 'attestation_demarrage')
        .limit(1)
        .maybeSingle();
      if (already) continue;

      const [{ data: dossierRow }, { data: learnerRow }] = await Promise.all([
        sb
          .schema('app')
          .from('dossiers')
          .select('start_date, formation:formations(title)')
          .eq('id', dossierId)
          .maybeSingle(),
        sb.schema('app').from('learners').select('first_name, email').eq('id', ctx.learnerId).maybeSingle(),
      ]);
      const dossier = dossierRow as { start_date: string; formation: { title: string } | null } | null;
      const learner = learnerRow as { first_name: string; email: string } | null;
      if (!dossier || !learner?.email) continue;

      const tpl = startOfTrainingEmail({
        firstName: learner.first_name,
        formationTitle: dossier.formation?.title ?? 'Votre formation',
        startDate: dossier.start_date,
        attestationUrl: base ? `${base}/api/dossiers/${dossierId}/attestation-entree.pdf` : null,
        espaceUrl: espaceUrlFor(ctx.learnerId),
      });
      const r = await sendEmail({
        to: learner.email,
        subject: tpl.subject,
        html: tpl.html,
        organizationId: ctx.organizationId,
        dossierId,
        kind: 'attestation_demarrage',
      });
      if (r.ok) sent++;
      else if (r.reason !== 'no_api_key') errors.push(`start_attestation ${dossierId}: send_failed`);
    } catch (e) {
      errors.push(`start_attestation ${dossierId}: ${(e as Error).message}`);
    }
  }

  return { candidates: byDossier.size, sent, errors };
}

// ── Programmation personnalisée (app.email_schedules) ───────────────────────
// Règles paramétrables par l'organisme. Pour chaque règle active, on cherche les
// dossiers dont l'ancre (1ère session / début / fin) + offset_days == aujourd'hui,
// et on envoie l'email (variables {prenom} {nom} {formation} {date}).
// Anti-doublon via email_log kind = 'schedule:<ruleId>' + dossier_id.

type ScheduleRow = {
  id: string;
  organization_id: string;
  name: string;
  anchor:
    | 'first_session_start'
    | 'dossier_start'
    | 'dossier_end'
    | 'last_session_end'
    | 'dossier_created'
    | 'devis_signed'
    | 'convention_signed'
    | 'invoice_paid';
  offset_days: number;
  recipient_kind: 'learner' | 'trainer';
  subject: string;
  body: string;
  attachment_kind: string | null;
};

function applyScheduleVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(prenom|nom|formation|date)\}/g, (_m, k: string) => vars[k] ?? '');
}

function scheduleBodyToHtml(body: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paragraphs = body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="color:#3f3f46;font-size:14px;line-height:1.6;margin:0 0 14px;">${esc(p).replace(/\n/g, '<br>')}</p>`,
    )
    .join('');
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;padding:32px;">
<div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;">
${paragraphs}
</div></body></html>`;
}

async function runCustomSchedules(): Promise<{ candidates: number; sent: number; errors: string[] }> {
  const sb = admin();

  const { data: rules, error: rErr } = await sb
    .schema('app')
    .from('email_schedules')
    .select('id, organization_id, name, anchor, offset_days, recipient_kind, subject, body, attachment_kind')
    .eq('enabled', true)
    .is('deleted_at', null);

  if (rErr) {
    // Table absente (migration non appliquée) ou erreur : on ne bloque pas le cron.
    console.error('[cron] email_schedules query failed', rErr);
    return { candidates: 0, sent: 0, errors: [rErr.message] };
  }

  const ruleRows = (rules ?? []) as unknown as ScheduleRow[];
  if (ruleRows.length === 0) return { candidates: 0, sent: 0, errors: [] };

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let candidates = 0;
  let sent = 0;
  const errors: string[] = [];

  for (const rule of ruleRows) {
    // On veut : ancre + offset_days == aujourd'hui  →  ancre == aujourd'hui - offset_days
    const wanted = new Date(today);
    wanted.setUTCDate(wanted.getUTCDate() - rule.offset_days);
    const wantedStart = new Date(wanted);
    const wantedEnd = new Date(wanted);
    wantedEnd.setUTCHours(23, 59, 59, 999);
    const wantedDate = wanted.toISOString().slice(0, 10); // pour colonnes DATE
    const dateLabel = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(wanted);

    // Résout les dossiers dont l'ancre tombe le jour voulu.
    let dossierIds: string[] = [];
    try {
      if (rule.anchor === 'first_session_start') {
        const { data: sess } = await sb
          .schema('app')
          .from('sessions')
          .select('dossier_id, starts_at')
          .gte('starts_at', wantedStart.toISOString())
          .lte('starts_at', wantedEnd.toISOString())
          .neq('status', 'cancelled');
        for (const s of (sess ?? []) as { dossier_id: string; starts_at: string }[]) {
          // Vérifie que c'est bien la PREMIÈRE session (non annulée) du dossier.
          const { data: earliest } = await sb
            .schema('app')
            .from('sessions')
            .select('starts_at')
            .eq('dossier_id', s.dossier_id)
            .neq('status', 'cancelled')
            .order('starts_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          if ((earliest as { starts_at: string } | null)?.starts_at === s.starts_at) {
            dossierIds.push(s.dossier_id);
          }
        }
      } else if (rule.anchor === 'last_session_end') {
        const { data: sess } = await sb
          .schema('app')
          .from('sessions')
          .select('dossier_id, ends_at')
          .gte('ends_at', wantedStart.toISOString())
          .lte('ends_at', wantedEnd.toISOString())
          .neq('status', 'cancelled');
        for (const s of (sess ?? []) as { dossier_id: string; ends_at: string }[]) {
          // Seule la DERNIÈRE session (non annulée) du dossier déclenche.
          const { data: latest } = await sb
            .schema('app')
            .from('sessions')
            .select('ends_at')
            .eq('dossier_id', s.dossier_id)
            .neq('status', 'cancelled')
            .order('ends_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if ((latest as { ends_at: string } | null)?.ends_at === s.ends_at) {
            dossierIds.push(s.dossier_id);
          }
        }
      } else if (rule.anchor === 'dossier_created') {
        const { data: dos } = await sb
          .schema('app')
          .from('dossiers')
          .select('id')
          .eq('organization_id', rule.organization_id)
          .gte('created_at', wantedStart.toISOString())
          .lte('created_at', wantedEnd.toISOString());
        dossierIds = ((dos ?? []) as { id: string }[]).map((d) => d.id);
      } else if (rule.anchor === 'devis_signed' || rule.anchor === 'convention_signed') {
        // Ancre événementielle : la date de signature du document du type visé.
        const kind = rule.anchor === 'devis_signed' ? 'devis' : 'convention';
        const { data: docs } = await sb
          .schema('app')
          .from('documents')
          .select('id, dossier_id')
          .eq('organization_id', rule.organization_id)
          .eq('kind', kind)
          .not('dossier_id', 'is', null)
          .is('deleted_at', null);
        const docRows = (docs ?? []) as { id: string; dossier_id: string }[];
        if (docRows.length > 0) {
          const { data: signs } = await sb
            .schema('app')
            .from('document_signatures')
            .select('document_id, signed_at')
            .in('document_id', docRows.map((d) => d.id))
            .gte('signed_at', wantedStart.toISOString())
            .lte('signed_at', wantedEnd.toISOString());
          const byDoc = new Map(docRows.map((d) => [d.id, d.dossier_id]));
          for (const sig of (signs ?? []) as { document_id: string }[]) {
            const dossierId = byDoc.get(sig.document_id);
            if (dossierId) dossierIds.push(dossierId);
          }
        }
      } else if (rule.anchor === 'invoice_paid') {
        const { data: inv } = await sb
          .schema('app')
          .from('invoices')
          .select('dossier_id, paid_at')
          .eq('organization_id', rule.organization_id)
          .eq('status', 'paid')
          .not('dossier_id', 'is', null)
          .gte('paid_at', wantedStart.toISOString())
          .lte('paid_at', wantedEnd.toISOString());
        dossierIds = ((inv ?? []) as { dossier_id: string }[]).map((i) => i.dossier_id);
      } else {
        const col = rule.anchor === 'dossier_start' ? 'start_date' : 'end_date';
        const { data: dos } = await sb
          .schema('app')
          .from('dossiers')
          .select('id')
          .eq('organization_id', rule.organization_id)
          .eq(col, wantedDate);
        dossierIds = ((dos ?? []) as { id: string }[]).map((d) => d.id);
      }
    } catch (e) {
      errors.push(`schedule ${rule.id}: resolve ${(e as Error).message}`);
      continue;
    }

    dossierIds = [...new Set(dossierIds)];
    candidates += dossierIds.length;
    const kind = `schedule:${rule.id}`;

    for (const dossierId of dossierIds) {
      const { data: dRow } = await sb
        .schema('app')
        .from('dossiers')
        .select('id, organization_id, formation_id, learner_id')
        .eq('id', dossierId)
        .maybeSingle();
      const d = dRow as { organization_id: string; formation_id: string; learner_id: string } | null;
      if (!d || d.organization_id !== rule.organization_id) continue;

      // Anti-doublon : déjà envoyé pour ce dossier + cette règle ?
      const { data: already } = await sb
        .schema('app')
        .from('email_log')
        .select('id')
        .eq('dossier_id', dossierId)
        .eq('kind', kind)
        .limit(1)
        .maybeSingle();
      if (already) continue;

      const { data: fRow } = await sb
        .schema('app')
        .from('formations')
        .select('title')
        .eq('id', d.formation_id)
        .maybeSingle();
      const formationTitle = (fRow as { title: string } | null)?.title ?? 'votre formation';

      // Pièce jointe optionnelle : dernier document du type demandé pour ce dossier.
      // Calculée une fois par dossier (réutilisée pour tous les destinataires).
      let attachments: { filename: string; content: string }[] | undefined;
      if (rule.attachment_kind) {
        try {
          const { data: docRow } = await sb
            .schema('app')
            .from('documents')
            .select('title, storage_path')
            .eq('dossier_id', dossierId)
            .eq('kind', rule.attachment_kind)
            .not('storage_path', 'is', null)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          const doc = docRow as { title: string | null; storage_path: string } | null;
          if (doc?.storage_path) {
            const { data: file } = await sb.storage.from('documents').download(doc.storage_path);
            if (file) {
              const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
              const safe = `${(doc.title || rule.attachment_kind).replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'document'}.pdf`;
              attachments = [{ filename: safe, content: base64 }];
            }
          }
          // Document absent : on envoie quand même l'email (le corps se suffit).
          if (!attachments) errors.push(`schedule ${rule.id} / dossier ${dossierId}: pièce jointe '${rule.attachment_kind}' introuvable`);
        } catch (e) {
          errors.push(`schedule ${rule.id} / dossier ${dossierId}: attachment ${(e as Error).message}`);
        }
      }

      // Destinataires
      const recipients: { email: string; firstName: string; lastName: string }[] = [];
      if (rule.recipient_kind === 'learner') {
        const { data: lRow } = await sb
          .schema('app')
          .from('learners')
          .select('first_name, last_name, email')
          .eq('id', d.learner_id)
          .maybeSingle();
        const l = lRow as { first_name: string; last_name: string; email: string } | null;
        if (l?.email) recipients.push({ email: l.email, firstName: l.first_name, lastName: l.last_name });
      } else {
        const { data: dtRows } = await sb
          .schema('app')
          .from('dossier_trainers')
          .select('trainer:trainers(first_name, last_name, email)')
          .eq('dossier_id', dossierId);
        for (const row of (dtRows ?? []) as {
          trainer:
            | { first_name: string; last_name: string; email: string }
            | { first_name: string; last_name: string; email: string }[]
            | null;
        }[]) {
          const t = Array.isArray(row.trainer) ? row.trainer[0] : row.trainer;
          if (t?.email) recipients.push({ email: t.email, firstName: t.first_name, lastName: t.last_name });
        }
      }

      for (const rcp of recipients) {
        try {
          const vars = { prenom: rcp.firstName, nom: rcp.lastName, formation: formationTitle, date: dateLabel };
          const subject = applyScheduleVars(rule.subject, vars).trim() || rule.name;
          const html = scheduleBodyToHtml(applyScheduleVars(rule.body, vars));
          const r = await sendEmail({
            to: rcp.email,
            subject,
            html,
            attachments,
            organizationId: rule.organization_id,
            dossierId,
            kind,
          });
          if (r.ok) sent++;
          else if (r.reason !== 'no_api_key') errors.push(`schedule ${rule.id} / ${rcp.email}: send_failed`);
        } catch (e) {
          errors.push(`schedule ${rule.id} / ${rcp.email}: ${(e as Error).message}`);
        }
      }
    }
  }

  return { candidates, sent, errors };
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const [
    convocations,
    dossierEnd,
    missingSignatures,
    trainerSatisfaction,
    needsAnalysis,
    needsAnalysisLearners,
    startAttestation,
    customSchedules,
  ] = await Promise.all([
    runConvocationsJ7(),
    runDossierEnd(),
    runMissingSignatureAlerts(),
    runTrainerSatisfaction(),
    runNeedsAnalysisOnEnrollment(),
    runNeedsAnalysisForNewLearners(),
    runStartAttestation(),
    runCustomSchedules(),
  ]);
  const durationMs = Date.now() - startedAt;

  return NextResponse.json({
    ok: true,
    durationMs,
    convocationsJ7: convocations,
    dossierEnd,
    missingSignatures,
    trainerSatisfaction,
    needsAnalysis,
    needsAnalysisLearners,
    startAttestation,
    customSchedules,
  });
}

// GET autorisé aussi pour faciliter le ping manuel / cron-job.org en GET
export async function GET(req: Request) {
  return POST(req);
}
