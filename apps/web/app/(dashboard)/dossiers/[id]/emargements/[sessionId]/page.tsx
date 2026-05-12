import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { ensureAttendanceSheet } from './actions';
import { ParticipantsList, type ParticipantItem } from './participants-list';

export const dynamic = 'force-dynamic';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

type SessionRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  modality: string;
  location: string | null;
  remote_url: string | null;
  title: string | null;
  organization_id: string;
  dossier_id: string;
};

type ParticipantRow = {
  participant_kind: 'learner' | 'trainer';
  learner_id: string | null;
  trainer_id: string | null;
  learner: { first_name: string; last_name: string; email: string } | null;
  trainer: { first_name: string; last_name: string; email: string } | null;
};

type SignatureRow = {
  participant_kind: 'learner' | 'trainer';
  learner_id: string | null;
  trainer_id: string | null;
  signed_at: string | null;
  status: string;
};

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export default async function EmargementSessionPage({
  params,
}: {
  params: { id: string; sessionId: string };
}) {
  const sb = admin();

  const { data: sessionData, error: sessionErr } = await sb
    .schema('app')
    .from('sessions')
    .select('id, starts_at, ends_at, status, modality, location, remote_url, title, organization_id, dossier_id')
    .eq('id', params.sessionId)
    .maybeSingle();
  if (sessionErr || !sessionData) return notFound();
  const session = sessionData as unknown as SessionRow;

  if (session.dossier_id !== params.id) return notFound();

  const sheet = await ensureAttendanceSheet({
    sessionId: session.id,
    organizationId: session.organization_id,
    dossierId: session.dossier_id,
  });
  if (!sheet.ok) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 rounded-lg p-4">
          <p className="text-[13px] text-red-900 dark:text-red-200">
            Impossible de créer la feuille d&apos;émargement : {sheet.error}
          </p>
        </div>
      </div>
    );
  }

  const [{ data: participantsData }, { data: signaturesData }] = await Promise.all([
    sb
      .schema('app')
      .from('session_participants')
      .select('participant_kind, learner_id, trainer_id, learner:learners(first_name, last_name, email), trainer:trainers(first_name, last_name, email)')
      .eq('session_id', session.id),
    sb
      .schema('app')
      .from('attendance_signatures')
      .select('participant_kind, learner_id, trainer_id, signed_at, status')
      .eq('attendance_sheet_id', sheet.sheetId),
  ]);

  const rawParticipants = (participantsData ?? []) as unknown as ParticipantRow[];
  const signatures = (signaturesData ?? []) as unknown as SignatureRow[];

  const signedSet = new Set(
    signatures
      .filter((s) => s.signed_at != null)
      .map((s) => `${s.participant_kind}:${s.participant_kind === 'learner' ? s.learner_id : s.trainer_id}`),
  );

  const participants: ParticipantItem[] = rawParticipants.map((p) => {
    const person = p.participant_kind === 'learner' ? p.learner : p.trainer;
    const id = (p.participant_kind === 'learner' ? p.learner_id : p.trainer_id) ?? '';
    return {
      id,
      kind: p.participant_kind,
      fullName: person ? `${person.first_name} ${person.last_name}` : 'Inconnu',
      email: person?.email ?? null,
      signed: signedSet.has(`${p.participant_kind}:${id}`),
    };
  });

  const signedCount = participants.filter((p) => p.signed).length;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <p className="text-[11px] uppercase tracking-wider text-violet-600 dark:text-violet-400 font-semibold mb-1">
        Émargement
      </p>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
        {session.title ?? 'Séance de formation'}
      </h1>
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
        {fmtDate(session.starts_at)} · {fmtTime(session.starts_at)}–{fmtTime(session.ends_at)} · {session.modality}
      </p>

      <div className="mt-6 mb-6 grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">Participants</p>
          <p className="text-[18px] font-semibold text-zinc-900 dark:text-zinc-100">{participants.length}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">Signatures</p>
          <p className="text-[18px] font-semibold text-emerald-600 dark:text-emerald-400">
            {signedCount} / {participants.length}
          </p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">Statut</p>
          <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
            {signedCount === participants.length && participants.length > 0 ? '✅ Complète' : '⏳ En cours'}
          </p>
        </div>
      </div>

      <ParticipantsList sheetId={sheet.sheetId} participants={participants} />
    </div>
  );
}
