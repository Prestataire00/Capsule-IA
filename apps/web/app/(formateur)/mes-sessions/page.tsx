// ARCHETYPE: command
// Justification: tout le temps du formateur en une rubrique — ce qu'il a à faire,
// quand il est pris, quand il est libre. « Planning » et « Mes séances » étaient
// deux entrées pour les mêmes séances : elles deviennent trois vues d'un écran.

import { cookies } from 'next/headers';
import { CalendarPlus } from 'lucide-react';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { calendarToken } from '@/features/trainer-space/calendar-token';
import { dayKey, mondayKey } from '@/features/trainer-space/dates';
import { loadSessionsByIds, mySessionIds } from '@/features/trainer-space/my-sessions';
import { unreadCounts } from '@/features/trainer-space/session-messages';
import { loadMesDisponibilites, jourParis } from '@/features/trainer-space/availability-store';
import { CalendarSubscribe } from '../mon-planning/calendar-subscribe';
import { Disponibilites, type JourAffiche, type SemaineAffichee } from '../mon-planning/disponibilites.client';
import { BasculeVue, VueCalendrier, VueListe, estVue, type Vue } from './vues';

export const dynamic = 'force-dynamic';

const JOUR_MS = 24 * 60 * 60 * 1000;
/** Cinq semaines calendaires : au-delà, un formateur ne sait pas s'il est libre. */
const SEMAINES_DECLARABLES = 5;

const jourCourtFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });
const jourSemaineFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short' });
const semaineFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' });

const INTRO: Record<Vue, string> = {
  liste: 'Ouvrez une séance pour la préparer, faire émarger, répondre à vos participants.',
  calendrier: 'Vos séances semaine par semaine. Le calendrier se met à jour tout seul : dès qu’une séance vous est confiée, elle apparaît ici.',
  disponibilites: 'Dites quand vous êtes libre : votre organisme le voit au moment où il planifie une séance.',
};

export default async function MesSeancesPage({ searchParams }: { searchParams: { vue?: string } }) {
  const vue: Vue = estVue(searchParams.vue) ? searchParams.vue : 'liste';

  const sb = supabaseServer();
  const focus = cookies().get('of_focus')?.value ?? 'all';
  const [memberships, ids, { data: auth }] = await Promise.all([
    new SupabaseMembershipReader(sb as never).list(),
    mySessionIds(sb),
    sb.auth.getUser(),
  ]);

  const now = new Date();
  const maintenant = now.getTime();
  const lundi = mondayKey(now);

  const toutes = (
    await loadSessionsByIds(
      sb,
      ids,
      { from: new Date(maintenant - 30 * JOUR_MS), to: new Date(maintenant + 180 * JOUR_MS) },
      focus === 'all' ? null : focus,
    )
  ).filter((s) => s.status !== 'cancelled');

  const aujourdhui = dayKey(now);
  const duJour = toutes.filter(
    (s) => dayKey(s.startsAt) === aujourdhui || (Date.parse(s.startsAt) <= maintenant && Date.parse(s.endsAt) >= maintenant),
  );
  const aVenir = toutes.filter((s) => !duJour.includes(s) && Date.parse(s.startsAt) > maintenant);
  const terminees = toutes.filter((s) => !duJour.includes(s) && Date.parse(s.endsAt) < maintenant).reverse();

  const noms = memberships.length > 1 ? new Map(memberships.map((m) => [m.organizationId as string, m.organizationName])) : null;
  const nonLus = auth.user
    ? await unreadCounts(toutes.map((s) => s.id), auth.user.id, 'formateur')
    : new Map<string, number>();

  // Les disponibilités se déclarent par fiche formateur : celle de l'organisme
  // affiché, ou la première quand le formateur n'en a qu'une.
  const fiche = (focus === 'all' ? memberships[0] : memberships.find((m) => m.organizationId === focus)) ?? memberships[0];

  let semainesDispo: SemaineAffichee[] = [];
  if (vue === 'disponibilites' && fiche) {
    const premierLundi = new Date(`${lundi}T12:00:00Z`);
    const declarations = await loadMesDisponibilites(
      fiche.trainerId,
      jourParis(premierLundi),
      jourParis(new Date(premierLundi.getTime() + (SEMAINES_DECLARABLES * 7 - 1) * JOUR_MS)),
    );

    const seancesParJour = new Map<string, number>();
    for (const s of toutes) seancesParJour.set(dayKey(s.startsAt), (seancesParJour.get(dayKey(s.startsAt)) ?? 0) + 1);

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
        passe: day < aujourdhui,
        aujourdhui: day === aujourdhui,
      };
    };

    semainesDispo = Array.from({ length: SEMAINES_DECLARABLES }, (_, semaine) => {
      const debutSemaine = new Date(premierLundi.getTime() + semaine * 7 * JOUR_MS);
      const cle = jourParis(debutSemaine);
      return {
        cle,
        titre: `Semaine du ${semaineFmt.format(new Date(`${cle}T12:00:00Z`))}${cle === lundi ? ' · cette semaine' : ''}`,
        jours: Array.from({ length: 7 }, (_, i) => construisJour(new Date(debutSemaine.getTime() + i * JOUR_MS))),
      };
    });
  }

  const base = (env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const flux = auth.user && base ? `${base}/api/formateur/calendrier/${calendarToken(env.TOKEN_SIGNING_KEY, auth.user.id)}` : null;

  return (
    <div className="max-w-3xl w-full mx-auto px-4 py-6 space-y-5">
      <header className="relative overflow-hidden rounded-2xl border border-sky-100/70 dark:border-sky-900/30 bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/30 dark:to-zinc-900 p-5 shadow-sm">
        <h1 className="text-[22px] font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">Mes séances</h1>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1.5">{INTRO[vue]}</p>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Compteur
            valeur={duJour.length}
            label="aujourd’hui"
            ton="bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300"
          />
          <Compteur
            valeur={aVenir.length}
            label="à venir"
            ton="bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
          />
          <Compteur
            valeur={terminees.length}
            label="terminées"
            ton="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
          />
        </div>
      </header>

      <BasculeVue active={vue} />

      {vue === 'liste' && (
        <VueListe duJour={duJour} aVenir={aVenir} terminees={terminees} noms={noms} nonLus={nonLus} />
      )}

      {vue === 'calendrier' && (
        <>
          <VueCalendrier seances={toutes} lundi={lundi} noms={noms} nonLus={nonLus} />
          {/* L'abonnement ICS reste offert, mais replié : le calendrier ci-dessus
              est la source, et il n'a besoin d'aucun agenda extérieur. */}
          {flux && (
            <details className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900">
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
        </>
      )}

      {vue === 'disponibilites' &&
        (fiche ? (
          <Disponibilites trainerId={fiche.trainerId} semaines={semainesDispo} />
        ) : (
          <p className="text-[13px] text-zinc-400 text-center py-8">
            Aucune fiche formateur ouverte : vos disponibilités ne peuvent pas être enregistrées.
          </p>
        ))}
    </div>
  );
}

/** Pastille de comptage de l'en-tête : le formateur situe sa charge d'un regard. */
function Compteur({ valeur, label, ton }: { valeur: number; label: string; ton: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-semibold ${ton}`}>
      <span className="text-[15px] font-extrabold tabular-nums">{valeur}</span>
      {label}
    </span>
  );
}
