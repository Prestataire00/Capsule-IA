// ARCHETYPE: command
// Justification: le planning du formateur — ses séances réelles sur neuf semaines,
// et la déclaration de ses disponibilités pour les quatre prochaines.

import { cookies } from 'next/headers';
import { CalendarDays, CalendarPlus } from 'lucide-react';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { calendarToken } from '@/features/trainer-space/calendar-token';
import { dayKey, jourLong, mondayKey, semaineDu } from '@/features/trainer-space/dates';
import { loadSessionsByIds, mySessionIds, type MySession } from '@/features/trainer-space/my-sessions';
import { unreadCounts } from '@/features/trainer-space/session-messages';
import { loadMesDisponibilites, jourParis } from '@/features/trainer-space/availability-store';
import { SessionCard } from '@/features/trainer-space/session-card';
import { CalendarSubscribe } from './calendar-subscribe';
import { Disponibilites, type JourAffiche, type SemaineAffichee } from './disponibilites.client';

export const dynamic = 'force-dynamic';

const JOUR_MS = 24 * 60 * 60 * 1000;
/** Cinq semaines calendaires : au-delà, un formateur ne sait pas s'il est libre. */
const SEMAINES_DECLARABLES = 5;

const jourCourtFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });
const jourSemaineFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short' });

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
    await loadSessionsByIds(
      sb,
      ids,
      { from: new Date(now.getTime() - 7 * JOUR_MS), to: new Date(now.getTime() + 63 * JOUR_MS) },
      focus === 'all' ? null : focus,
    )
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
  const nonLus = user ? await unreadCounts(seances.map((s) => s.id), user.id, 'formateur') : new Map<string, number>();

  // Les disponibilités se déclarent par fiche formateur : celle de l'organisme
  // affiché, ou la première quand le formateur n'en a qu'une.
  const fiche = (focus === 'all' ? memberships[0] : memberships.find((m) => m.organizationId === focus)) ?? memberships[0];
  // Les semaines commencent le lundi, y compris celle en cours : un formateur
  // regarde sa semaine entière, pas les sept jours qui suivent aujourd'hui.
  const premierLundi = new Date(`${lundi}T12:00:00Z`);
  const debutDecl = jourParis(premierLundi);
  const finDecl = jourParis(new Date(premierLundi.getTime() + (SEMAINES_DECLARABLES * 7 - 1) * JOUR_MS));
  const declarations = fiche ? await loadMesDisponibilites(fiche.trainerId, debutDecl, finDecl) : [];

  const seancesParJour = new Map<string, number>();
  for (const s of seances) seancesParJour.set(dayKey(s.startsAt), (seancesParJour.get(dayKey(s.startsAt)) ?? 0) + 1);

  const aujourdhuiCle = jourParis(now);
  const construisJour = (d: Date): JourAffiche => {
    const day = jourParis(d);
    const dansLeJour = declarations.filter((x) => x.day === day);
    const journee = dansLeJour.find((x) => x.creneau === 'journee');
    const matin = dansLeJour.find((x) => x.creneau === 'matin');
    const apresMidi = dansLeJour.find((x) => x.creneau === 'apres_midi');
    const jourSemaine = jourSemaineFmt.format(d).replace('.', '');
    return {
      day,
      label: jourCourtFmt.format(d),
      jourSemaine,
      weekend: ['sam', 'dim'].includes(jourSemaine.toLowerCase().slice(0, 3)),
      matin: matin?.kind ?? journee?.kind ?? null,
      apresMidi: apresMidi?.kind ?? journee?.kind ?? null,
      seances: seancesParJour.get(day) ?? 0,
      passe: day < aujourdhuiCle,
      aujourdhui: day === aujourdhuiCle,
    };
  };

  const semainesDispo: SemaineAffichee[] = Array.from({ length: SEMAINES_DECLARABLES }, (_, semaine) => {
    const debutSemaine = new Date(premierLundi.getTime() + semaine * 7 * JOUR_MS);
    const cle = jourParis(debutSemaine);
    return {
      cle,
      titre: semaineDu(cle) + (cle === lundi ? ' · cette semaine' : ''),
      jours: Array.from({ length: 7 }, (_, i) => construisJour(new Date(debutSemaine.getTime() + i * JOUR_MS))),
    };
  });

  const base = (env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const flux = user && base ? `${base}/api/formateur/calendrier/${calendarToken(env.TOKEN_SIGNING_KEY, user.id)}` : null;

  return (
    <div className="max-w-3xl w-full mx-auto px-4 py-6 space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-blue-100/70 dark:border-blue-900/30 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-zinc-900 p-5 shadow-sm">
        <h1 className="text-[22px] font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">Mon planning</h1>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1.5">
          Vos séances de cette semaine et des huit suivantes
          {memberships.length > 1 && focus === 'all' ? ', tous organismes confondus' : ''}. Il se met à jour tout seul :
          dès qu&apos;une séance vous est confiée, elle apparaît ici.
        </p>
      </header>

      {fiche && <Disponibilites trainerId={fiche.trainerId} semaines={semainesDispo} />}

      <section className="space-y-5">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-blue-600 dark:text-blue-400 flex items-center gap-2">
          <span className="w-6 h-6 rounded-md grid place-items-center bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
            <CalendarDays className="w-3.5 h-3.5" />
          </span>
          Mes séances
        </h2>

        {semaines.size === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-12 text-center">
            <span className="mx-auto mb-3 w-12 h-12 rounded-xl grid place-items-center bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <CalendarDays className="h-6 w-6" />
            </span>
            <p className="text-[13px] text-zinc-400">Aucune séance planifiée sur les neuf prochaines semaines.</p>
          </div>
        ) : (
          [...semaines.entries()].map(([sem, jourss]) => (
            <section key={sem} className="space-y-3">
              <h3 className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                {semaineDu(sem)}
                {sem === lundi && (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
                    cette semaine
                  </span>
                )}
              </h3>
              {[...jourss.entries()].map(([jour, liste]) => (
                <div key={jour} className="space-y-2">
                  <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 capitalize">
                    {jourLong(liste[0]!.startsAt)}
                  </p>
                  <ul className="space-y-2.5">
                    {liste.map((s) => (
                      <li key={s.id}>
                        <SessionCard
                          s={s}
                          organizationName={noms?.get(s.organizationId) ?? null}
                          emphasize={jour === dayKey(now)}
                          unread={nonLus.get(s.id) ?? 0}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))
        )}
      </section>

      {/* L'abonnement ICS reste offert, mais en bas : le planning ci-dessus est
          la source, et il n'a besoin d'aucun agenda extérieur pour être à jour. */}
      {flux && (
        <details className="group rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-2.5 text-[13px] text-zinc-600 dark:text-zinc-300">
            <span className="w-7 h-7 rounded-md grid place-items-center bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              <CalendarPlus className="w-4 h-4" />
            </span>
            Recopier aussi mes séances dans mon agenda personnel
            <span className="ml-auto text-[11px] text-zinc-400">facultatif</span>
          </summary>
          <div className="px-4 pb-4">
            <CalendarSubscribe url={flux} />
          </div>
        </details>
      )}
    </div>
  );
}
