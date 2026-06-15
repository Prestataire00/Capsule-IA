// ARCHETYPE: command
// Justification: liste mobile-first des sessions du formateur avec gros boutons.

import Link from 'next/link';
import { cookies } from 'next/headers';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowRight, MapPin, Video } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';

export const dynamic = 'force-dynamic';

const todayLabel = (iso: string) => {
  const d = parseISO(iso);
  if (isToday(d)) return "Aujourd'hui";
  if (isTomorrow(d)) return 'Demain';
  return format(d, 'EEEE d MMMM', { locale: fr });
};

type SessionParticipantRow = {
  session: {
    id: string;
    title: string | null;
    modality: string;
    status: string;
    starts_at: string;
    ends_at: string;
    location: string | null;
    dossier_id: string;
    dossier: { formation: { title: string } | null } | null;
  } | null;
};

type TrainerSession = {
  id: string;
  title: string;
  modality: string;
  status: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  dossierId: string;
};

async function loadTrainerSessions(
  sb: ReturnType<typeof supabaseServer>,
  trainerId: string,
): Promise<TrainerSession[]> {
  const { data, error } = await sb
    .schema('app')
    .from('session_participants')
    .select(
      `
      session:sessions(
        id, title, modality, status, starts_at, ends_at, location, dossier_id,
        dossier:dossiers(formation:formations(title))
      )
    `,
    )
    .eq('participant_kind', 'trainer')
    .eq('trainer_id', trainerId);

  if (error) throw error;

  return ((data ?? []) as unknown as SessionParticipantRow[])
    .map((r) => r.session)
    .filter((s): s is NonNullable<SessionParticipantRow['session']> => s !== null)
    .map((s) => ({
      id: s.id,
      title: s.dossier?.formation?.title ?? s.title ?? 'Session',
      modality: s.modality,
      status: s.status,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      location: s.location,
      dossierId: s.dossier_id,
    }))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export default async function MesSessionsPage() {
  const sb = supabaseServer();
  const memberships = await new SupabaseMembershipReader(
    sb as never,
  ).list();
  if (memberships.length === 0) {
    return (
      <div className="max-w-md w-full mx-auto px-4 py-6">
        <p className="text-[13px] text-zinc-400 text-center py-12">
          Aucune session pour vous à venir.
        </p>
      </div>
    );
  }

  const focus = cookies().get('of_focus')?.value ?? 'all';
  const active =
    focus === 'all'
      ? memberships[0]!
      : memberships.find((m) => m.organizationId === focus) ?? memberships[0]!;

  const trainerName = `${active.firstName} ${active.lastName}`.trim();
  const sessions = await loadTrainerSessions(sb, active.trainerId as string);

  return (
    <div className="max-w-md w-full mx-auto px-4 py-6">
      <header className="mb-6">
        <SectionLabel className="mb-1">{trainerName}</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Mes sessions</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          {sessions.length} session{sessions.length > 1 ? 's' : ''} à venir ou en cours
        </p>
      </header>

      <ul className="space-y-2">
        {sessions.map((s) => {
          const tone = s.status === 'in_progress' ? 'warning' : s.status === 'done' ? 'success' : 'info';
          return (
            <li key={s.id}>
              <Link
                href={`/emarger/${s.id}`}
                className="block bg-zinc-50 dark:bg-zinc-900 rounded-lg px-4 py-3.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400">
                      {todayLabel(s.startsAt)} · {format(parseISO(s.startsAt), 'HH:mm')} – {format(parseISO(s.endsAt), 'HH:mm')}
                    </p>
                    <p className="text-[15px] font-medium mt-1 truncate">{s.title}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-400 mt-1 flex-shrink-0" />
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
                    {s.modality === 'distanciel' ? <Video className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                    {s.location ?? 'distanciel'}
                  </span>
                  <StatusPill tone={tone}>
                    {s.status === 'done' ? 'fait' : s.status === 'in_progress' ? 'en cours' : 'à venir'}
                  </StatusPill>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {sessions.length === 0 && (
        <p className="text-[13px] text-zinc-400 text-center py-12">
          Aucune session pour vous à venir.
        </p>
      )}
    </div>
  );
}
