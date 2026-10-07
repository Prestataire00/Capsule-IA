// ARCHETYPE: command
// Justification: une évaluation de la séance — ses questions, puis la réponse de chaque destinataire.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, Pencil, QrCode } from 'lucide-react';
import { interlocuteurDuModele } from '@/features/questionnaire/cartographie';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { canManageSection } from '@/shared/lib/auth/require-access';
import { loadSession } from '@/features/sessions/load-session';
import { questionsDuSchema } from '@/features/questionnaire/fiche-besoin';
import { syntheseDesReponses, valeurLisible } from '@/features/questionnaire/reponses-seance';
import type { Question } from '@/features/questionnaire/schema';
import { StatusPill } from '@/shared/ui/status-pill';

export const dynamic = 'force-dynamic';

const DESTINATAIRE: Record<string, string> = {
  learner: 'Stagiaire',
  company_rep: 'Entreprise',
  funder: 'Financeur',
  trainer: 'Formateur',
};
const TYPE: Record<string, string> = {
  text: 'Réponse libre',
  choice: 'Choix',
  rating: 'Note',
  nps: 'Recommandation (0–10)',
};
const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'medium' });

type Assignation = {
  id: string;
  recipient_kind: string;
  recipient_name: string | null;
  recipient_email: string | null;
  status: string;
  created_at: string;
};

export default async function EvaluationDeSeancePage({
  params,
}: {
  params: { id: string; templateId: string };
}) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = sb as unknown as SupabaseClient<any, any, any>;

  const { dossierIds } = loaded;
  const [{ data: t }, { data: a }, gerer] = await Promise.all([
    db
      .schema('app')
      .from('questionnaire_templates')
      .select('id, title, schema, organization_id, kind, code, audience')
      .eq('id', params.templateId)
      .is('deleted_at', null)
      .maybeSingle(),
    db
      .schema('app')
      .from('questionnaire_assignments')
      .select('id, recipient_kind, recipient_name, recipient_email, status, created_at')
      .eq('template_id', params.templateId)
      .or(
        dossierIds.length
          ? `session_id.eq.${params.id},dossier_id.in.(${dossierIds.join(',')})`
          : `session_id.eq.${params.id}`,
      )
      .neq('status', 'expired')
      .order('recipient_name', { ascending: true }),
    canManageSection('dossiers'),
  ]);
  const modele = t as {
    id: string;
    title: string;
    schema: unknown;
    organization_id: string | null;
    kind: string;
    code: string | null;
    audience: string | null;
  } | null;
  if (!modele) notFound();
  const questions: Question[] = questionsDuSchema(modele.schema);
  const assignations = (a ?? []) as Assignation[];

  const { data: r } = assignations.length
    ? await db
        .schema('app')
        .from('questionnaire_responses')
        .select('assignment_id, answers, submitted_at')
        .in(
          'assignment_id',
          assignations.map((x) => x.id),
        )
    : { data: [] };
  const reponses = new Map(
    (
      (r ?? []) as Array<{
        assignment_id: string;
        answers: Record<string, unknown> | null;
        submitted_at: string | null;
      }>
    ).map((x) => [x.assignment_id, x]),
  );
  const synthese = syntheseDesReponses(
    questions,
    [...reponses.values()].map((x) => x.answers ?? {}),
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          href={`/sessions/${params.id}/questionnaires`}
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Évaluations de la séance
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          {interlocuteurDuModele(modele) === 'apprenant' && (
            <a
              href={`/projection/questionnaire/${params.id}/${modele.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium shadow-sm"
            >
              <QrCode className="w-4 h-4" /> Projeter en salle
            </a>
          )}
          {gerer && (
            <Link
              href={`/questionnaires/${modele.id}`}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <Pencil className="w-4 h-4" /> Modifier les questions
            </Link>
          )}
        </div>
      </div>

      <header>
        <h2 className="text-[20px] font-semibold text-zinc-900 dark:text-zinc-100">
          {modele.title}
        </h2>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1 tabular-nums">
          {questions.length} question{questions.length > 1 ? 's' : ''} · {reponses.size}/
          {assignations.length} réponse
          {reponses.size > 1 ? 's' : ''}
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
        <h3 className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
          Questions et synthèse
        </h3>
        <ol className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {questions.map((q, i) => {
            const s = synthese.get(q.id);
            return (
              <li key={q.id} className="px-5 py-3 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[13px] text-zinc-900 dark:text-zinc-100">
                    <span className="text-zinc-400 tabular-nums mr-1.5">{i + 1}.</span>
                    {q.label}
                    {q.required && <span className="text-orange-600"> *</span>}
                  </p>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                    {TYPE[q.type] ?? q.type}
                    {q.type === 'choice' ? ` · ${q.options.join(' / ')}` : ''}
                  </p>
                </div>
                {s && (
                  <p className="text-[12px] text-zinc-600 dark:text-zinc-300 tabular-nums text-right">
                    {s}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {assignations.length === 0 ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          Pas encore envoyé pour cette séance.
        </p>
      ) : (
        <ul className="space-y-3">
          {assignations.map((x) => {
            const rep = reponses.get(x.id);
            return (
              <li
                key={x.id}
                className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                      {x.recipient_name ?? x.recipient_email ?? 'Destinataire'}
                    </p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                      {DESTINATAIRE[x.recipient_kind] ?? x.recipient_kind}
                    </p>
                  </div>
                  {rep ? (
                    <StatusPill tone="success">
                      Répondu
                      {rep.submitted_at ? ` le ${jour.format(new Date(rep.submitted_at))}` : ''}
                    </StatusPill>
                  ) : (
                    <StatusPill tone="info">En attente</StatusPill>
                  )}
                </div>
                {rep && (
                  <dl className="grid sm:grid-cols-2 gap-3">
                    {questions.map((q) => {
                      const v = valeurLisible(q, rep.answers?.[q.id]);
                      return v ? (
                        <div key={q.id} className="text-[13px]">
                          <dt className="text-zinc-500 dark:text-zinc-400">{q.label}</dt>
                          <dd className="text-zinc-800 dark:text-zinc-200 whitespace-pre-line">
                            {v}
                          </dd>
                        </div>
                      ) : null;
                    })}
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
