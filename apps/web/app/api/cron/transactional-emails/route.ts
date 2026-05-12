// ARCHETYPE: command (cron endpoint)
// Justification: tick quotidien qui envoie convocations J-7, satisfaction et fin de formation.
// Protégé par CRON_SECRET — invoqué par Railway cron / cron-job.org / pg_cron.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { sendEmail } from '@/shared/lib/email/resend';
import {
  sessionConvocationEmail,
  satisfactionSurveyEmail,
  endOfTrainingEmail,
} from '@/shared/lib/email/templates';

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

    // Satisfaction
    try {
      const surveyUrl = env.PUBLIC_APP_URL
        ? `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/questionnaire/satisfaction/${d.id}`
        : `https://example.com/satisfaction/${d.id}`;
      const sat = satisfactionSurveyEmail({
        firstName: learner.first_name,
        formationTitle,
        surveyUrl,
        durationMinutes: 5,
      });
      const r = await sendEmail({ to: learner.email, subject: sat.subject, html: sat.html });
      if (r.ok) satisfactionSent++;
      else if (r.reason !== 'no_api_key') errors.push(`satisfaction ${d.id}: send_failed`);
    } catch (e) {
      errors.push(`satisfaction ${d.id}: ${(e as Error).message}`);
    }

    // End-of-training (attestation)
    try {
      const certificateUrl = env.PUBLIC_APP_URL
        ? `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/api/dossiers/${d.id}/attestation.pdf`
        : null;
      const eot = endOfTrainingEmail({
        firstName: learner.first_name,
        formationTitle,
        endDate: d.end_date,
        totalHours: d.total_hours,
        attendanceRate: 95, // TODO: calculer depuis attendance_signatures
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

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const [convocations, dossierEnd] = await Promise.all([runConvocationsJ7(), runDossierEnd()]);
  const durationMs = Date.now() - startedAt;

  return NextResponse.json({
    ok: true,
    durationMs,
    convocationsJ7: convocations,
    dossierEnd,
  });
}

// GET autorisé aussi pour faciliter le ping manuel / cron-job.org en GET
export async function GET(req: Request) {
  return POST(req);
}
