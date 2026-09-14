// ARCHETYPE: command
// Justification: séances du formateur — aujourd'hui, à venir, terminées — et accès direct à l'émargement.

import { cookies } from 'next/headers';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { dayKey } from '@/features/trainer-space/dates';
import { loadSessionsByIds, mySessionIds, type MySession } from '@/features/trainer-space/my-sessions';
import { SessionCard } from '@/features/trainer-space/session-card';
import { unreadCounts } from '@/features/trainer-space/session-messages';
import { CalendarClock, CalendarCheck2, Sun } from 'lucide-react';

export const dynamic = 'force-dynamic';

const JOUR_MS = 24 * 60 * 60 * 1000;

function Section({
  titre,
  icone: Icone,
  ton,
  sessions,
  noms,
  vide,
  emphasize,
  nonLus,
}: {
  titre: string;
  icone: React.ComponentType<{ className?: string }>;
  ton: { texte: string; carre: string };
  sessions: MySession[];
  noms: Map<string, string> | null;
  vide?: string;
  emphasize?: boolean;
  nonLus: Map<string, number>;
}) {
  if (sessions.length === 0 && !vide) return null;
  return (
    <section className="space-y-2.5">
      <h2 className={`text-[13px] font-bold uppercase tracking-[0.06em] flex items-center gap-2 ${ton.texte}`}>
        <span className={`w-6 h-6 rounded-md grid place-items-center ${ton.carre}`}>
          <Icone className="w-3.5 h-3.5" />
        </span>
        {titre} <span className="tabular-nums opacity-70">({sessions.length})</span>
      </h2>
      {sessions.length === 0 ? (
        <p className="text-[13px] text-zinc-400 py-3 pl-8">{vide}</p>
      ) : (
        <ul className="space-y-2.5">
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
      <header className="relative overflow-hidden rounded-2xl border border-sky-100/70 dark:border-sky-900/30 bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/30 dark:to-zinc-900 p-5 shadow-sm">
        <h1 className="text-[22px] font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">Sessions &amp; émargement</h1>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1.5">
          Ouvrez une séance pour faire émarger, projeter le QR code, marquer les absences et clôturer la feuille.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Compteur valeur={duJour.length} label="aujourd’hui" ton="bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300" />
          <Compteur valeur={aVenir.length} label="à venir" ton="bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300" />
          <Compteur valeur={terminees.length} label="terminées" ton="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" />
        </div>
      </header>

      <Section
        titre="Aujourd’hui"
        icone={Sun}
        ton={{ texte: 'text-orange-600 dark:text-orange-400', carre: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300' }}
        sessions={duJour}
        noms={noms}
        nonLus={nonLus}
        vide="Aucune séance aujourd’hui."
        emphasize
      />
      <Section
        titre="À venir"
        icone={CalendarClock}
        ton={{ texte: 'text-sky-600 dark:text-sky-400', carre: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300' }}
        sessions={aVenir}
        noms={noms}
        nonLus={nonLus}
        vide="Aucune séance à venir pour l’instant."
      />
      <Section
        titre="Terminées (30 derniers jours)"
        icone={CalendarCheck2}
        ton={{ texte: 'text-emerald-600 dark:text-emerald-400', carre: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' }}
        sessions={terminees}
        noms={noms}
        nonLus={nonLus}
      />
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
