// ARCHETYPE: command
// Justification: planning du formateur sur neuf semaines, et abonnement à son agenda.

import { cookies } from 'next/headers';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { calendarToken } from '@/features/trainer-space/calendar-token';
import { dayKey, jourLong, mondayKey, semaineDu } from '@/features/trainer-space/dates';
import { loadSessionsByIds, mySessionIds, type MySession } from '@/features/trainer-space/my-sessions';
import { SessionCard } from '@/features/trainer-space/session-card';
import { CalendarSubscribe } from './calendar-subscribe';

export const dynamic = 'force-dynamic';

const JOUR_MS = 24 * 60 * 60 * 1000;

export default async function MonPlanningPage() {
  const sb = supabaseServer();
  const focus = cookies().get('of_focus')?.value ?? 'all';
  const [{ data: { user } }, memberships, ids] = await Promise.all([
    sb.auth.getUser(),
    new SupabaseMembershipReader(sb as never).list(),
    mySessionIds(sb),
  ]);

  const now = new Date();
  const lundi = mondayKey(now);
  const seances = (
    await loadSessionsByIds(sb, ids, { from: new Date(now.getTime() - 7 * JOUR_MS), to: new Date(now.getTime() + 63 * JOUR_MS) }, focus === 'all' ? null : focus)
  ).filter((s) => s.status !== 'cancelled' && dayKey(s.startsAt) >= lundi);

  const semaines = new Map<string, Map<string, MySession[]>>();
  for (const s of seances) {
    const sem = mondayKey(s.startsAt);
    const jour = dayKey(s.startsAt);
    const jours = semaines.get(sem) ?? new Map<string, MySession[]>();
    jours.set(jour, [...(jours.get(jour) ?? []), s]);
    semaines.set(sem, jours);
  }
  const noms = memberships.length > 1 ? new Map(memberships.map((m) => [m.organizationId as string, m.organizationName])) : null;
  const base = (env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const flux = user && base ? `${base}/api/formateur/calendrier/${calendarToken(env.TOKEN_SIGNING_KEY, user.id)}` : null;

  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Mon planning</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Vos séances de cette semaine et des huit suivantes{memberships.length > 1 && focus === 'all' ? ', tous organismes confondus' : ''}.
        </p>
      </header>

      {flux && <CalendarSubscribe url={flux} />}

      {semaines.size === 0 ? (
        <p className="text-[13px] text-zinc-400 text-center py-12 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
          Aucune séance planifiée sur les neuf prochaines semaines.
        </p>
      ) : (
        [...semaines.entries()].map(([sem, jours]) => (
          <section key={sem} className="space-y-3">
            <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
              {semaineDu(sem)}
              {sem === lundi && <span className="ml-2 text-[11px] font-normal text-orange-600">cette semaine</span>}
            </h2>
            {[...jours.entries()].map(([jour, liste]) => (
              <div key={jour} className="space-y-2">
                <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 capitalize">{jourLong(liste[0]!.startsAt)}</p>
                <ul className="space-y-2">
                  {liste.map((s) => (
                    <li key={s.id}>
                      <SessionCard s={s} organizationName={noms?.get(s.organizationId) ?? null} emphasize={jour === dayKey(now)} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
