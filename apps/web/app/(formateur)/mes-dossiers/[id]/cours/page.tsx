// ARCHETYPE: command
// Justification: vue d'ensemble — ce qui est préparé sur chaque séance du dossier.
// La préparation elle-même se fait sur la séance (0174).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, ListChecks, CalendarClock } from 'lucide-react';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { requireMyTrainerDossier } from '@/features/trainer-space/my-dossiers';
import { loadTravaux } from '@/features/pedagogie/store';
import { FORME_LABELS } from '@/features/pedagogie/kinds';

export const dynamic = 'force-dynamic';

const jourFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  day: '2-digit',
  month: 'long',
});

export default async function CoursDuDossierPage({ params }: { params: { id: string } }) {
  const acces = await requireMyTrainerDossier(params.id);
  if (!acces.ok) notFound();

  const admin = supabaseAdmin();

  // Les séances du dossier, par ses deux chemins.
  const [liens, directes] = await Promise.all([
    admin.schema('app').from('session_dossiers').select('session_id').eq('dossier_id', params.id),
    admin.schema('app').from('sessions').select('id').eq('dossier_id', params.id).neq('status', 'cancelled'),
  ]);
  const sessionIds = [
    ...new Set([
      ...(((liens.data ?? []) as Array<{ session_id: string }>).map((l) => l.session_id)),
      ...(((directes.data ?? []) as Array<{ id: string }>).map((s) => s.id)),
    ]),
  ];

  const { data: seancesData } = sessionIds.length
    ? await admin
        .schema('app')
        .from('sessions')
        .select('id, title, starts_at')
        .in('id', sessionIds)
        .order('starts_at', { ascending: true })
    : { data: [] };
  const seances = (seancesData ?? []) as Array<{ id: string; title: string | null; starts_at: string }>;

  const parSeance = await Promise.all(
    seances.map(async (s) => ({ seance: s, travaux: await loadTravaux({ type: 'seance', id: s.id }) })),
  );
  // Exercices restés attachés au dossier lui-même (travail individuel, ou
  // contenus créés avant que le cours ne se rattache à la séance).
  const auDossier = await loadTravaux({ type: 'dossier', id: params.id });

  return (
    <div className="max-w-5xl w-full mx-auto px-6 py-8 space-y-6">
      <Link
        href={`/mes-dossiers/${params.id}`}
        className="text-[12px] font-medium text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-800 dark:hover:text-zinc-200 transition"
      >
        <ArrowLeft className="w-3 h-3" /> Le dossier
      </Link>

      <header className="relative overflow-hidden rounded-2xl border border-amber-100/70 dark:border-amber-900/30 bg-gradient-to-br from-amber-50 via-white to-white dark:from-amber-950/25 dark:via-zinc-900 dark:to-zinc-900 p-5 shadow-sm">
        <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-500" aria-hidden />
        <div className="pl-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-amber-600 dark:text-amber-400">
            Vue d&apos;ensemble
          </p>
          <h1 className="text-[22px] font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight mt-1">
            Le cours, séance par séance
          </h1>
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1.5">
            Chaque séance porte son propre cours : c&apos;est là qu&apos;on le prépare. Cette page récapitule ce qui
            est prêt pour l&apos;ensemble du dossier.
          </p>
        </div>
      </header>

      {seances.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-12 text-center">
          <span className="mx-auto mb-3 w-12 h-12 rounded-xl grid place-items-center bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
            <CalendarClock className="h-6 w-6" />
          </span>
          <p className="text-[13px] text-zinc-400">
            Aucune séance planifiée : il n&apos;y a pas encore de journée à préparer.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {parSeance.map(({ seance, travaux }) => {
            const publies = travaux.filter((t) => t.isPublished && t.validationStatus === 'valide').length;
            const attente = travaux.filter((t) => t.isPublished && t.validationStatus === 'en_attente').length;
            return (
              <li key={seance.id}>
                <Link
                  href={`/seance/${seance.id}/cours`}
                  className="group rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3.5 flex items-center gap-3 hover:border-orange-300 dark:hover:border-orange-900/60 hover:shadow-sm transition"
                >
                  <span className="w-9 h-9 rounded-lg grid place-items-center bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 shrink-0">
                    <ListChecks className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {seance.title ?? 'Séance'}
                    </span>
                    <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 capitalize tabular-nums">
                      {jourFmt.format(new Date(seance.starts_at))}
                      {' · '}
                      {travaux.length === 0
                        ? 'rien de préparé'
                        : `${travaux.length} contenu${travaux.length > 1 ? 's' : ''}, ${publies} visible${publies > 1 ? 's' : ''}`}
                      {attente > 0 && ` · ${attente} en attente de validation`}
                    </span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-orange-500 transition shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {auDossier.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
            Rattachés au dossier <span className="tabular-nums">({auDossier.length})</span>
          </h2>
          <ul className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden">
            {auDossier.map((t) => (
              <li key={t.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {t.title}
                  </span>
                  <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">{FORME_LABELS[t.kind]}</span>
                </span>
                <span className="text-[12px] text-zinc-400 shrink-0">
                  {t.isPublished ? (t.validationStatus === 'valide' ? 'Visible' : 'En attente') : 'Brouillon'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
