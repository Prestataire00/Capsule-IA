// apps/web/app/(formateur)/formateur/page.tsx
// ARCHETYPE: workflow
// Justification: la journée du formateur — ce qu'il a à faire maintenant.
// Volontairement sans liste des séances à venir ni grille de raccourcis : la
// barre et « Mes séances » s'en chargent, les répéter ici brouillait tout.
import Link from 'next/link';
import { cookies } from 'next/headers';
import {
  CalendarDays,
  ClipboardList,
  AlertTriangle,
  Clock,
  MessagesSquare,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { KpiCard } from '@/shared/ui/kpi-card';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { SupabaseTrainerCompetencyRepository } from '@/features/identity/trainer-self/infrastructure/supabase-trainer-competency.repository';
import { GetCompetencyAlertsQuery } from '@/features/identity/trainer-self/application/queries/get-competency-alerts';
import { loadSessionsByIds, mySessionIds } from '@/features/trainer-space/my-sessions';
import { unreadCounts } from '@/features/trainer-space/session-messages';
import { dayKey } from '@/features/trainer-space/dates';
import { SessionCard } from '@/features/trainer-space/session-card';

export const dynamic = 'force-dynamic';

const JOUR_MS = 24 * 60 * 60 * 1000;

const jourFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Bonjour le matin, bonsoir le soir : l'espace s'ouvre aussi après la séance. */
function salutation(heure: number): string {
  return heure < 18 ? 'Bonjour' : 'Bonsoir';
}

export default async function FormateurDashboard() {
  const supabase = supabaseServer();
  const reader = new SupabaseMembershipReader(supabase);
  const focus = cookies().get('of_focus')?.value ?? 'all';
  const [memberships, ids, { data: auth }] = await Promise.all([
    reader.list(),
    mySessionIds(supabase),
    supabase.auth.getUser(),
  ]);

  const visible = focus === 'all' ? memberships : memberships.filter((m) => m.organizationId === focus);

  const compRepo = new SupabaseTrainerCompetencyRepository(supabase);
  const alertsQuery = new GetCompetencyAlertsQuery(compRepo);
  const maintenant = Date.now();
  const [alerts, seances] = await Promise.all([
    Promise.all(visible.map((m) => alertsQuery.execute(m.trainerId))),
    loadSessionsByIds(
      supabase,
      ids,
      { from: new Date(maintenant - JOUR_MS), to: new Date(maintenant + 60 * JOUR_MS) },
      focus === 'all' ? null : focus,
    ),
  ]);

  const actives = seances.filter((s) => s.status !== 'cancelled');
  const aujourdhuiKey = dayKey(new Date(maintenant));
  const duJour = actives.filter(
    (s) => dayKey(s.startsAt) === aujourdhuiKey || (Date.parse(s.startsAt) <= maintenant && Date.parse(s.endsAt) >= maintenant),
  );
  const aVenir = actives.filter((s) => !duJour.includes(s) && Date.parse(s.startsAt) > maintenant);

  const nonLus = auth.user
    ? await unreadCounts(actives.map((s) => s.id), auth.user.id, 'formateur')
    : new Map<string, number>();
  const totalNonLus = [...nonLus.values()].reduce((n, v) => n + v, 0);

  const heuresAVenir = [...duJour, ...aVenir].reduce(
    (h, s) => h + Math.max(0, (Date.parse(s.endsAt) - Date.parse(s.startsAt)) / 3_600_000),
    0,
  );

  const totalExpiring = alerts.reduce((s, a) => s + a.expiringSoon, 0);
  const totalExpired = alerts.reduce((s, a) => s + a.expired, 0);
  const aVerifier = totalExpiring + totalExpired;
  const noms = memberships.length > 1 ? new Map(memberships.map((m) => [m.organizationId as string, m.organizationName])) : null;

  const firstName = visible[0]?.firstName ?? '';
  const heureParis = Number(
    new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(new Date()),
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-7">
      <section className="relative overflow-hidden rounded-2xl border border-orange-100/70 dark:border-orange-900/30 bg-gradient-to-br from-orange-50 via-rose-50 to-amber-50 dark:from-orange-950/40 dark:via-rose-950/20 dark:to-zinc-900 p-6 shadow-sm">
        <span className="absolute -right-10 -top-12 w-40 h-40 rounded-full bg-orange-200/40 dark:bg-orange-800/20 blur-2xl" aria-hidden />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-orange-600 dark:text-orange-400 tabular-nums">
            {jourFmt.format(new Date())}
          </p>
          <h1 className="text-[24px] font-extrabold text-zinc-900 dark:text-zinc-100 leading-tight mt-1.5">
            {salutation(heureParis)} {firstName}
          </h1>
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1.5">
            {duJour.length > 0 ? (
              <>
                <strong className="tabular-nums text-zinc-900 dark:text-zinc-100">{duJour.length}</strong> séance
                {duJour.length > 1 ? 's' : ''} aujourd&apos;hui.
              </>
            ) : aVenir.length > 0 ? (
              <>
                Pas de séance aujourd&apos;hui.{' '}
                <strong className="tabular-nums text-zinc-900 dark:text-zinc-100">{aVenir.length}</strong> à venir.
              </>
            ) : (
              <>Aucune séance planifiée pour l&apos;instant.</>
            )}
          </p>

          {aVerifier > 0 && (
            <Link
              href="/cv"
              className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/80 dark:bg-zinc-950/50 border border-amber-200 dark:border-amber-900/50 text-[12px] hover:border-amber-300 transition"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-zinc-700 dark:text-zinc-300">
                {totalExpired > 0 && (
                  <>
                    <strong className="text-red-700 dark:text-red-300 tabular-nums">{totalExpired}</strong> compétence
                    {totalExpired > 1 ? 's' : ''} expirée{totalExpired > 1 ? 's' : ''}
                  </>
                )}
                {totalExpiring > 0 && totalExpired > 0 && ' · '}
                {totalExpiring > 0 && (
                  <>
                    <strong className="text-amber-700 dark:text-amber-300 tabular-nums">{totalExpiring}</strong> bientôt
                    expirée{totalExpiring > 1 ? 's' : ''}
                  </>
                )}
              </span>
              <span className="font-semibold text-orange-600 dark:text-orange-400 inline-flex items-center gap-1">
                Mettre à jour <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Séances à venir"
          value={duJour.length + aVenir.length}
          icon={CalendarDays}
          accent="blue"
          href="/mes-sessions"
          hint={duJour.length > 0 ? `dont ${duJour.length} aujourd’hui` : '60 prochains jours'}
        />
        <KpiCard
          label="Heures à animer"
          value={heuresAVenir % 1 === 0 ? heuresAVenir : heuresAVenir.toFixed(1)}
          icon={Clock}
          accent="sky"
          href="/mes-sessions?vue=calendrier"
          hint="60 prochains jours"
        />
        <KpiCard
          label="Messages non lus"
          value={totalNonLus}
          icon={MessagesSquare}
          accent="emerald"
          href="/mes-sessions"
          hint={totalNonLus === 0 ? 'rien à lire' : 'de vos participants'}
        />
        <KpiCard
          label="Compétences"
          value={aVerifier === 0 ? 'OK' : aVerifier}
          icon={aVerifier === 0 ? ShieldCheck : AlertTriangle}
          accent={aVerifier === 0 ? 'purple' : 'amber'}
          href="/mon-compte"
          hint={aVerifier === 0 ? 'à jour' : 'à vérifier'}
        />
      </section>

      {duJour.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-orange-600 dark:text-orange-400">
            Aujourd&apos;hui <span className="tabular-nums">({duJour.length})</span>
          </h2>
          <ul className="space-y-2.5">
            {duJour.map((s) => (
              <li key={s.id}>
                <SessionCard s={s} organizationName={noms?.get(s.organizationId) ?? null} emphasize unread={nonLus.get(s.id) ?? 0} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href="/mes-sessions"
        className="group rounded-xl border border-sky-100 dark:border-sky-900/40 bg-sky-50/60 dark:bg-sky-950/20 px-4 py-3.5 flex items-center gap-3 hover:border-sky-300 transition"
      >
        <span className="w-9 h-9 rounded-lg grid place-items-center bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 shrink-0">
          <ClipboardList className="w-4 h-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">Mes séances</span>
          <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
            {aVenir.length === 0
              ? 'Aucune séance à venir dans les deux prochains mois.'
              : `${aVenir.length} séance${aVenir.length > 1 ? 's' : ''} à venir — préparer, émarger, échanger.`}
          </span>
        </span>
        <ArrowRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-orange-500 transition shrink-0" />
      </Link>

      {memberships.length > 1 && (
        <section className="space-y-2.5">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-rose-600 dark:text-rose-400">
            Mes organismes <span className="tabular-nums">({visible.length})</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visible.map((m, i) => {
              const ok = alerts[i]!.expired + alerts[i]!.expiringSoon === 0;
              return (
                <div
                  key={m.trainerId}
                  className="p-4 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm flex items-start gap-3"
                >
                  <span className="w-9 h-9 rounded-lg grid place-items-center text-[12px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 shrink-0">
                    {m.organizationName.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{m.organizationName}</h3>
                      <span
                        className={`text-[11px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                          m.isInternal
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}
                      >
                        {m.isInternal ? 'Interne' : 'Externe'}
                      </span>
                    </div>
                    <p
                      className={`text-[12px] mt-0.5 ${
                        ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {ok ? 'Profil à jour' : 'Compétences à vérifier'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

    </div>
  );
}

