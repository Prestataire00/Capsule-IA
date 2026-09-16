// ARCHETYPE: workflow
// Justification: le formateur prépare ce qu'il donnera — quiz, exercices — sur un
// dossier qui lui est confié, et relit les rendus.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ListChecks, PenLine, Users, BookOpen, Trophy, Sparkles } from 'lucide-react';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { requireMyTrainerDossier } from '@/features/trainer-space/my-dossiers';
import { loadTravaux, loadRendus } from '@/features/pedagogie/store';
import { baremeTotal } from '@/features/pedagogie/quiz';
import { FORME_LABELS } from '@/features/pedagogie/kinds';
import { CreerTravail } from './creer-travail.client';
import { TravailActions } from './travail-actions.client';

export const dynamic = 'force-dynamic';

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const jourFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });

export default async function PreparerCoursPage({ params }: { params: { id: string } }) {
  const acces = await requireMyTrainerDossier(params.id);
  if (!acces.ok) notFound();

  const admin = supabaseAdmin();

  // Séances du dossier, pour rattacher un quiz à une journée précise.
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
  const seances = ((seancesData ?? []) as Array<{ id: string; title: string | null; starts_at: string }>).map((s) => ({
    id: s.id,
    label: `${s.title ?? 'Séance'} — ${jourFmt.format(new Date(s.starts_at))}`,
  }));
  const titreSeance = new Map(seances.map((s) => [s.id, s.label]));

  const travaux = await loadTravaux(params.id);
  const rendusParTravail = new Map(
    await Promise.all(travaux.map(async (t) => [t.id, await loadRendus(t.id)] as const)),
  );

  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
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
            Préparer mon cours
          </p>
          <h1 className="text-[22px] font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight mt-1">
            Quiz et exercices
          </h1>
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1.5">
            Quiz, texte à trou, cartes mémoire, vidéo ou exercice à rendre — l&apos;IA peut vous en proposer un
            brouillon à partir de votre programme. Ce que vous publiez part en validation : la direction ouvre le
            contenu aux stagiaires.
          </p>
          <Link
            href={`/mes-dossiers/${params.id}`}
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-orange-600 dark:text-orange-400 hover:underline"
          >
            <BookOpen className="w-3.5 h-3.5" /> Les supports de cours se déposent sur chaque séance
          </Link>
        </div>
      </header>

      <CreerTravail dossierId={params.id} seances={seances} />

      {travaux.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-12 text-center">
          <span className="mx-auto mb-3 w-12 h-12 rounded-xl grid place-items-center bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <ListChecks className="h-6 w-6" />
          </span>
          <p className="text-[13px] text-zinc-400">
            Rien de préparé pour l&apos;instant. Un quiz de dix questions se monte en quelques minutes.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {travaux.map((t) => {
            const rendus = rendusParTravail.get(t.id) ?? [];
            const notes = rendus.filter((r) => r.grade !== null);
            const moyenne =
              notes.length > 0
                ? Math.round(
                    (notes.reduce((s, r) => s + (r.grade ?? 0), 0) / notes.length) * 10,
                  ) / 10
                : null;
            const bareme = t.kind === 'quiz' ? baremeTotal(t.questions) : null;

            return (
              <li
                key={t.id}
                className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex items-start gap-3">
                    <span
                      className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${
                        t.kind === 'quiz'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                          : 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                      }`}
                    >
                      {t.kind === 'quiz' ? <ListChecks className="w-4 h-4" /> : <PenLine className="w-4 h-4" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{t.title}</p>
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                        {t.kind === 'quiz'
                          ? `${t.questions.length} question${t.questions.length > 1 ? 's' : ''} · ${bareme} point${(bareme ?? 0) > 1 ? 's' : ''}`
                          : 'Rendu libre, noté à la main'}
                        {t.passScore !== null && ` · réussite à ${t.passScore} %`}
                        {t.sessionId && titreSeance.has(t.sessionId) && ` · ${titreSeance.get(t.sessionId)}`}
                        {t.dueAt && ` · à rendre avant le ${dateFmt.format(new Date(t.dueAt))}`}
                      </p>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center h-5 px-1.5 rounded text-[11px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                          {FORME_LABELS[t.kind]}
                        </span>
                        {!t.isPublished ? (
                          <span className="inline-flex items-center h-5 px-1.5 rounded text-[11px] font-semibold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            Brouillon
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center h-5 px-1.5 rounded text-[11px] font-semibold ${
                              t.validationStatus === 'valide'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : t.validationStatus === 'refuse'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}
                          >
                            {t.validationStatus === 'valide'
                              ? 'Validé, visible'
                              : t.validationStatus === 'refuse'
                                ? 'Refusé'
                                : 'En attente de validation'}
                          </span>
                        )}
                        {t.aiAssisted && (
                          <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-semibold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            <Sparkles className="w-3 h-3" /> brouillon IA
                          </span>
                        )}
                      </span>
                      {t.validationStatus === 'refuse' && t.rejectionReason && (
                        <p className="text-[12px] text-red-600 dark:text-red-400 mt-1 whitespace-pre-wrap">
                          Motif : {t.rejectionReason}
                        </p>
                      )}
                    </div>
                  </div>

                  <TravailActions
                    dossierId={params.id}
                    travailId={t.id}
                    titre={t.title}
                    publie={t.isPublished}
                    rendus={t.rendus}
                  />
                </div>

                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-2.5">
                  {rendus.length === 0 ? (
                    <p className="text-[12px] text-zinc-400">
                      {t.isPublished ? 'Aucun rendu pour l’instant.' : 'Non publié : les stagiaires ne le voient pas.'}
                    </p>
                  ) : (
                    <>
                      <p className="text-[12px] text-zinc-600 dark:text-zinc-400 inline-flex items-center gap-1.5 mb-1.5">
                        <Users className="w-3.5 h-3.5" />
                        <span className="tabular-nums">{rendus.length}</span> rendu{rendus.length > 1 ? 's' : ''}
                        {moyenne !== null && (
                          <span className="inline-flex items-center gap-1 ml-2 text-emerald-600 dark:text-emerald-400">
                            <Trophy className="w-3.5 h-3.5" />
                            moyenne <span className="tabular-nums font-semibold">{moyenne}</span>
                            {bareme ? <span className="tabular-nums"> / {bareme}</span> : null}
                          </span>
                        )}
                      </p>
                      <ul className="space-y-0.5">
                        {rendus.map((r) => (
                          <li
                            key={r.learnerId}
                            className="flex items-center justify-between gap-3 text-[12px] py-0.5"
                          >
                            <span className="text-zinc-700 dark:text-zinc-300 truncate">{r.nom}</span>
                            <span className="text-zinc-500 dark:text-zinc-400 tabular-nums shrink-0">
                              {r.grade !== null ? (
                                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                                  {r.grade}
                                  {r.maxGrade !== null ? ` / ${r.maxGrade}` : ''}
                                </span>
                              ) : (
                                'à corriger'
                              )}
                              {' · '}
                              {dateFmt.format(new Date(r.submittedAt))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
