// ARCHETYPE: command
// Justification: questionnaires d'une séance du formateur — envoi aux apprenants et suivi des réponses.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { requireMyTrainerSession } from '@/features/trainer-space/guard';
import { loadSessionsByIds } from '@/features/trainer-space/my-sessions';
import { heure, jourLong } from '@/features/trainer-space/dates';
import { KIND_LABELS, STATUS_LABELS, TRAINER_SENDABLE_KINDS, isSatisfactionKind } from '@/features/trainer-space/questionnaires';
import type { Question } from '@/features/questionnaire/schema';
import { SendQuestionnaireForm } from './send-form';
import { SeanceNav } from '../_components/seance-nav';

export const dynamic = 'force-dynamic';

type Suivi = {
  assignment_id: string;
  template_id: string;
  template_title: string;
  kind: string;
  learner_name: string | null;
  status: string;
  submitted_at: string | null;
  score: number | null;
  answers: Record<string, string | number> | null;
  questions: Question[] | null;
};

const TON: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  expired: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
};

export default async function SeanceQuestionnairesPage({ params }: { params: { id: string } }) {
  const acces = await requireMyTrainerSession(params.id);
  if (!acces.ok) notFound();
  const admin = supabaseAdmin();

  const [[seance], suivi, { data: modeles }] = await Promise.all([
    loadSessionsByIds(admin, [params.id], { from: new Date(0), to: new Date('2100-01-01') }),
    supabaseServer().schema('app').rpc('my_session_questionnaires' as never, { p_session_id: params.id } as never),
    admin
      .schema('app')
      .from('questionnaire_templates')
      .select('id, title, kind, organization_id')
      .or(`organization_id.is.null,organization_id.eq.${acces.session.organization_id}`)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('title'),
  ]);
  if (!seance) notFound();

  const envoyables = ((modeles ?? []) as { id: string; title: string; kind: string }[]).filter((m) =>
    (TRAINER_SENDABLE_KINDS as readonly string[]).includes(m.kind),
  );
  const lignes = ((suivi.data ?? []) as Suivi[]);
  const parModele = new Map<string, Suivi[]>();
  for (const l of lignes) parModele.set(l.template_id, [...(parModele.get(l.template_id) ?? []), l]);

  return (
    <div className="max-w-5xl w-full mx-auto px-6 py-8 space-y-6">
      <SeanceNav
        sessionId={params.id}
        quand={`${jourLong(seance.startsAt)} · ${heure(seance.startsAt)} – ${heure(seance.endsAt)}`}
        titre={seance.title}
        sousTitre="Questionnaires envoyés aux participants de cette séance."
        actif="questionnaires"
      />

      <SendQuestionnaireForm sessionId={params.id} templates={envoyables} />

      {parModele.size === 0 ? (
        <p className="text-[13px] text-zinc-400 text-center py-8">Aucun questionnaire envoyé pour cette séance.</p>
      ) : (
        [...parModele.values()].map((groupe) => {
          const premier = groupe[0]!;
          const repondus = groupe.filter((g) => g.status === 'completed').length;
          const anonyme = isSatisfactionKind(premier.kind);
          return (
            <section key={premier.template_id} className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 overflow-hidden">
              <header className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900/60 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{premier.template_title}</p>
                  <p className="text-[11px] text-zinc-500">{KIND_LABELS[premier.kind] ?? premier.kind}</p>
                </div>
                <span className="text-[12px] text-zinc-600 dark:text-zinc-300 tabular-nums">
                  {repondus} / {groupe.length} réponse{groupe.length > 1 ? 's' : ''}
                </span>
              </header>
              {anonyme ? (
                <p className="px-4 py-3 text-[12px] text-zinc-500">
                  Réponses anonymes : les moyennes et commentaires apparaissent dans « Évaluations », à partir de trois réponses.
                </p>
              ) : (
                <ul className="divide-y divide-zinc-200/60 dark:divide-zinc-800">
                  {groupe.map((g) => (
                    <li key={g.assignment_id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-3 text-[13px]">
                        <span className="text-zinc-900 dark:text-zinc-100 truncate">{g.learner_name}</span>
                        <span className="flex items-center gap-2 flex-shrink-0">
                          {g.score !== null && <span className="text-[12px] tabular-nums text-zinc-600 dark:text-zinc-300">{Math.round(Number(g.score))} / 100</span>}
                          <span className={`text-[11px] px-2 py-0.5 rounded-full ${TON[g.status] ?? TON.pending}`}>{STATUS_LABELS[g.status] ?? g.status}</span>
                        </span>
                      </div>
                      {g.answers && g.questions && (
                        <details className="mt-1.5">
                          <summary className="text-[12px] text-orange-600 dark:text-orange-400 cursor-pointer">Voir les réponses</summary>
                          <dl className="mt-2 space-y-1.5">
                            {g.questions.map((q) => (
                              <div key={q.id} className="text-[12px]">
                                <dt className="text-zinc-500">{q.label}</dt>
                                <dd className="text-zinc-900 dark:text-zinc-100 tabular-nums">
                                  {g.answers?.[q.id] === undefined || g.answers[q.id] === '' ? '—' : String(g.answers[q.id])}
                                  {q.type === 'rating' && g.answers?.[q.id] !== undefined ? ` / ${q.max}` : ''}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
