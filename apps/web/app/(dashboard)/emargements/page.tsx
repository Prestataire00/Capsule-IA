// ARCHETYPE: command
// Justification: suivi des présences et des signatures de toutes les séances, façon RFC — une ligne par
// séance, cliquable jusqu'à sa grille d'émargement.

import Link from 'next/link';
import { ArrowRight, CalendarCheck, ClipboardCheck, UserX, Users } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { StatCard } from '@/shared/ui/stat-card';
import { StatusPill } from '@/shared/ui/status-pill';
import { listSessionsAttendance, type Onglet } from '@/features/attendance/queries/list-sessions-attendance';

export const dynamic = 'force-dynamic';

const ONGLETS: { cle: Onglet; label: string; vide: string }[] = [
  { cle: 'actives', label: 'Actives', vide: 'Aucune séance en cours ni dans les sept prochains jours.' },
  { cle: 'terminees', label: 'Terminées (30 j)', vide: 'Aucune séance terminée dans les trente derniers jours.' },
  { cle: 'toutes', label: 'Toutes', vide: 'Aucune séance.' },
];
const STATUT: Record<string, { label: string; tone: 'info' | 'success' | 'neutral' | 'warning' }> = {
  planned: { label: 'Planifiée', tone: 'info' },
  in_progress: { label: 'En cours', tone: 'warning' },
  done: { label: 'Terminée', tone: 'success' },
};

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)} %`);
const couleur = (v: number | null) =>
  v === null ? 'text-zinc-400' : v >= 0.8 ? 'text-emerald-600 dark:text-emerald-400' : v >= 0.5 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
const barre = (v: number | null) => (v === null ? 'bg-zinc-300' : v >= 0.8 ? 'bg-emerald-500' : v >= 0.5 ? 'bg-amber-500' : 'bg-red-500');
const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const hm = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

export default async function EmargementsPage({ searchParams }: { searchParams: { onglet?: string } }) {
  await requireAccess('attendance');
  const onglet = (ONGLETS.find((o) => o.cle === searchParams.onglet)?.cle ?? 'actives') as Onglet;
  const { lignes, indicateurs: k } = await listSessionsAttendance(supabaseServer() as never, onglet);
  const vide = ONGLETS.find((o) => o.cle === onglet)?.vide ?? '';

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Émargement</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">Suivi des présences et des signatures sur toutes les séances de formation.</p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Taux de présence" value={pct(k.tauxPresence)} icon={CalendarCheck} accent="emerald" hint={`${k.presents} demi-journée${k.presents > 1 ? 's' : ''} présente${k.presents > 1 ? 's' : ''}`} />
        <StatCard label="Complétion émargement" value={pct(k.completion)} icon={ClipboardCheck} accent="blue" hint={`${k.remplies} / ${k.attendues} demi-journées`} />
        <StatCard label="Absences" value={k.absences} icon={UserX} accent="rose" hint={`${k.retards} retard${k.retards > 1 ? 's' : ''} · ${k.signatures} signature${k.signatures > 1 ? 's' : ''}`} />
        <StatCard label="Séances suivies" value={k.seances} icon={Users} accent="violet" hint={`${k.stagiaires} stagiaire${k.stagiaires > 1 ? 's' : ''} au total`} />
      </section>

      <nav aria-label="Filtrer les séances" className="border-b border-zinc-200/70 dark:border-zinc-800 flex gap-1 mb-4">
        {ONGLETS.map((o) => (
          <Link
            key={o.cle}
            href={`/emargements?onglet=${o.cle}`}
            aria-current={o.cle === onglet ? 'page' : undefined}
            className={`text-[13px] px-3 py-2.5 -mb-px border-b-2 transition ${
              o.cle === onglet ? 'border-orange-500 text-zinc-900 dark:text-zinc-100 font-medium' : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            {o.label}
          </Link>
        ))}
      </nav>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
        <div className="min-w-[880px]">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_110px_80px_130px_160px_24px] gap-3 px-5 py-2.5 text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-200/70 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40">
            <span>Formation</span>
            <span>Séance</span>
            <span>Statut</span>
            <span>Inscrits</span>
            <span>Présence</span>
            <span>Complétion</span>
            <span />
          </div>
          {lignes.length === 0 ? (
            <p className="px-5 py-12 text-center text-[13px] text-zinc-500">
              <span className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">Aucune séance à afficher</span>
              {vide}
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {lignes.map((l) => {
                const st = STATUT[l.statut] ?? { label: l.statut, tone: 'neutral' as const };
                return (
                  <li key={l.id}>
                    <Link
                      href={`/sessions/${l.id}/emargements`}
                      className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_110px_80px_130px_160px_24px] gap-3 px-5 py-3.5 items-center text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition group"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium text-zinc-900 dark:text-zinc-100 truncate">{l.titre}</span>
                        <span className="block text-[12px] text-zinc-500 truncate">
                          {[l.formateur, l.lieu].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </span>
                      <span className="text-zinc-700 dark:text-zinc-300 tabular-nums">
                        <span className="block first-letter:uppercase">{jour.format(new Date(l.debut))}</span>
                        <span className="block text-[12px] text-zinc-500">
                          {hm.format(new Date(l.debut))} – {hm.format(new Date(l.fin))}
                        </span>
                      </span>
                      <span>
                        <StatusPill tone={st.tone}>{st.label}</StatusPill>
                      </span>
                      <span className="tabular-nums text-zinc-700 dark:text-zinc-300">{l.inscrits}</span>
                      <span className="tabular-nums">
                        <span className={`block font-medium ${couleur(l.tauxPresence)}`}>{pct(l.tauxPresence)}</span>
                        <span className="block text-[11px] text-zinc-500">
                          {l.presents} P · {l.absents + l.excuses} A · {l.retards} R
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="flex-1 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <span className={`block h-full ${barre(l.completion)}`} style={{ width: `${Math.round((l.completion ?? 0) * 100)}%` }} />
                        </span>
                        <span className="text-[12px] tabular-nums text-zinc-600 dark:text-zinc-300 w-10 text-right">{pct(l.completion)}</span>
                      </span>
                      <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-orange-500 transition" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
