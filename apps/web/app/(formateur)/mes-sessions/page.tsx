// ARCHETYPE: command
// Justification: séances du formateur — aujourd'hui, à venir, terminées — et accès direct à l'émargement.

import { cookies } from 'next/headers';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { dayKey } from '@/features/trainer-space/dates';
import { loadSessionsByIds, mySessionIds, type MySession } from '@/features/trainer-space/my-sessions';
import { SessionCard } from '@/features/trainer-space/session-card';
import { unreadCounts } from '@/features/trainer-space/session-messages';

export const dynamic = 'force-dynamic';

const JOUR_MS = 24 * 60 * 60 * 1000;

function Section({
  titre,
  sessions,
  noms,
  vide,
  emphasize,
  nonLus,
}: {
  titre: string;
  sessions: MySession[];
  noms: Map<string, string> | null;
  vide?: string;
  emphasize?: boolean;
  nonLus: Map<string, number>;
}) {
  if (sessions.length === 0 && !vide) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-[13px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
        {titre} <span className="tabular-nums">({sessions.length})</span>
      </h2>
      {sessions.length === 0 ? (
        <p className="text-[13px] text-zinc-400 py-3">{vide}</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <SessionCard
                s={s}
                organizationName={noms?.get(s.organizationId) ?? null}
                emphasize={emphasize}
                unread={nonLus.get(s.id) ?? 0}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function MesSessionsPage() {
  const sb = supabaseServer();
  const focus = cookies().get('of_focus')?.value ?? 'all';
  const [memberships, ids] = await Promise.all([new SupabaseMembershipReader(sb as never).list(), mySessionIds(sb)]);

  const now = Date.now();
  const toutes = (
    await loadSessionsByIds(sb, ids, { from: new Date(now - 30 * JOUR_MS), to: new Date(now + 180 * JOUR_MS) }, focus === 'all' ? null : focus)
  ).filter((s) => s.status !== 'cancelled');

  const aujourdhui = dayKey(new Date(now));
  const duJour = toutes.filter((s) => dayKey(s.startsAt) === aujourdhui || (Date.parse(s.startsAt) <= now && Date.parse(s.endsAt) >= now));
  const aVenir = toutes.filter((s) => !duJour.includes(s) && Date.parse(s.startsAt) > now);
  const terminees = toutes.filter((s) => !duJour.includes(s) && Date.parse(s.endsAt) < now).reverse();
  const noms = memberships.length > 1 ? new Map(memberships.map((m) => [m.organizationId as string, m.organizationName])) : null;

  const {
    data: { user },
  } = await sb.auth.getUser();
  const nonLus = user ? await unreadCounts(toutes.map((s) => s.id), user.id, 'formateur') : new Map<string, number>();

  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Sessions & émargement</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Ouvrez une séance pour faire émarger, projeter le QR code, marquer les absences et clôturer la feuille.
        </p>
      </header>

      <Section titre="Aujourd’hui" sessions={duJour} noms={noms} nonLus={nonLus} vide="Aucune séance aujourd’hui." emphasize />
      <Section titre="À venir" sessions={aVenir} noms={noms} nonLus={nonLus} vide="Aucune séance à venir pour l’instant." />
      <Section titre="Terminées (30 derniers jours)" sessions={terminees} noms={noms} nonLus={nonLus} />
    </div>
  );
}
