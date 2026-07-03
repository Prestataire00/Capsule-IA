// ARCHETYPE: command
// Justification: vue de lecture de l'agenda Google synchronisé de l'utilisateur courant (événements à venir, groupés par jour).

import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { CalendarDays, Video, MapPin, ExternalLink, Plug } from 'lucide-react';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { loadGoogleCredsForUser } from '@/shared/lib/integrations/google-calendar-store';
import { listAgenda, type CalEvent } from '@/shared/lib/integrations/google-calendar-client';

export const dynamic = 'force-dynamic';

const TZ = 'Europe/Paris';
const DAYS_AHEAD = 60;

function admin() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayLabelFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

function dayKey(iso: string): string {
  // Pour une journée entière (YYYY-MM-DD), pas de décalage de fuseau.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return dayKeyFmt.format(new Date(iso));
}

function timeRange(e: CalEvent): string {
  if (e.allDay) return 'Journée';
  const start = timeFmt.format(new Date(e.start));
  if (!e.end) return start;
  return `${start} – ${timeFmt.format(new Date(e.end))}`;
}

export default async function AgendaPage() {
  const { data: auth } = await supabaseServer().auth.getUser();
  const userId = auth?.user?.id ?? null;

  const sb = admin();
  const [creds, integRow] = await Promise.all([
    userId ? loadGoogleCredsForUser(sb, userId) : Promise.resolve(null),
    userId
      ? sb.schema('app').from('user_integrations').select('account_email').eq('user_id', userId).eq('kind', 'google_calendar').maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const accountEmail = (integRow?.data as { account_email: string | null } | null)?.account_email ?? null;

  const header = (
    <header>
      <SectionLabel className="mb-1">Mon espace</SectionLabel>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Agenda</h1>
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
        {accountEmail
          ? `Synchronisé avec votre Google Agenda — ${accountEmail}`
          : 'Vos événements Google Agenda, synchronisés dans Capsule IA.'}
      </p>
    </header>
  );

  // Pas connecté → CTA vers les réglages d'intégration.
  if (!creds) {
    return (
      <div className="space-y-6">
        {header}
        <div className="border border-zinc-200/60 dark:border-zinc-800 rounded-2xl px-6 py-10 text-center bg-zinc-50/40 dark:bg-zinc-950/40">
          <CalendarDays className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-[15px] font-medium text-zinc-800 dark:text-zinc-200">Aucun agenda connecté</p>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
            Connectez votre compte Google pour voir vos événements ici et créer automatiquement les liens Meet de vos sessions.
          </p>
          <Link
            href="/parametres/integrations/google-calendar"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 shadow-sm transition"
          >
            <Plug className="w-4 h-4" /> Connecter Google Agenda
          </Link>
        </div>
      </div>
    );
  }

  const now = new Date();
  // Depuis le début de la journée (pour ne pas masquer les événements plus tôt aujourd'hui).
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const timeMin = startOfToday.toISOString();
  const timeMax = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000).toISOString();
  const result = await listAgenda(creds, { timeMin, timeMax });

  if (!result.ok) {
    return (
      <div className="space-y-6">
        {header}
        <div className="border border-amber-200/70 dark:border-amber-900/50 rounded-2xl px-6 py-8 text-center bg-amber-50/60 dark:bg-amber-950/30">
          <p className="text-[14px] font-medium text-amber-800 dark:text-amber-200">Agenda momentanément indisponible</p>
          <p className="text-[13px] text-amber-700/80 dark:text-amber-300/70 mt-1">
            Impossible de récupérer vos événements. L'accès a peut-être été révoqué côté Google.
          </p>
          <Link
            href="/parametres/integrations/google-calendar"
            className="mt-3 inline-flex items-center gap-2 text-[13px] font-medium text-amber-800 dark:text-amber-200 hover:underline"
          >
            <Plug className="w-4 h-4" /> Reconnecter
          </Link>
        </div>
      </div>
    );
  }

  // Regroupement par jour (fuseau Europe/Paris).
  const groups = new Map<string, CalEvent[]>();
  for (const e of result.value) {
    const k = dayKey(e.start);
    const arr = groups.get(k) ?? [];
    arr.push(e);
    groups.set(k, arr);
  }
  const orderedDays = Array.from(groups.keys()).sort();

  return (
    <div className="space-y-6">
      {header}

      {result.value.length === 0 ? (
        <div className="border border-zinc-200/60 dark:border-zinc-800 rounded-2xl px-6 py-10 text-center bg-zinc-50/40 dark:bg-zinc-950/40">
          <CalendarDays className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-[14px] text-zinc-600 dark:text-zinc-300">Aucun événement dans les {DAYS_AHEAD} prochains jours.</p>
          <p className="text-[12px] text-zinc-400 dark:text-zinc-500 mt-1 max-w-md mx-auto">
            Si votre agenda contient bien des événements, déconnectez puis reconnectez Google Agenda pour autoriser la lecture de tous vos agendas.
          </p>
          <Link
            href="/parametres/integrations/google-calendar"
            className="mt-3 inline-flex items-center gap-2 text-[13px] font-medium text-violet-600 dark:text-violet-400 hover:underline"
          >
            <Plug className="w-4 h-4" /> Reconnecter Google Agenda
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {orderedDays.map((k) => {
            const list = groups.get(k)!;
            const label = dayLabelFmt.format(new Date(`${k}T12:00:00`));
            return (
              <section key={k}>
                <h2 className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 capitalize mb-2">{label}</h2>
                <ul className="border border-zinc-200/60 dark:border-zinc-800 rounded-xl divide-y divide-zinc-200/60 dark:divide-zinc-800 overflow-hidden">
                  {list.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition">
                      <span className="w-24 shrink-0 text-[12px] font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">{timeRange(e)}</span>
                      <span className="flex-1 min-w-0">
                        <span className="text-[13px] text-zinc-900 dark:text-zinc-100 truncate block">{e.title}</span>
                        {e.location && (
                          <span className="text-[11px] text-zinc-400 inline-flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" /> {e.location}
                          </span>
                        )}
                      </span>
                      {e.hangoutLink && (
                        <a
                          href={e.hangoutLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
                        >
                          <Video className="w-3.5 h-3.5" /> Visio
                        </a>
                      )}
                      {e.htmlLink && (
                        <a
                          href={e.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-zinc-400 hover:text-violet-600 transition"
                          aria-label="Ouvrir dans Google Agenda"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
