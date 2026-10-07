// ARCHETYPE: command
// Justification: une réponse à un questionnaire, en entier — là où mène la
// notification « Questionnaire complété » (fiche besoin, satisfaction…).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowUpRight, ClipboardCheck } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { questionsDuSchema } from '@/features/questionnaire/fiche-besoin';
import { valeurLisible } from '@/features/questionnaire/reponses-seance';
import type { Question } from '@/features/questionnaire/schema';

export const dynamic = 'force-dynamic';

const quand = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' });

/** Les clés de l'ancienne fiche besoin, quand le modèle ne les décrit plus. */
const ANCIENNES: Record<string, string> = {
  currentLevel: 'Niveau actuel',
  objectives: 'Objectifs',
  expectations: 'Attentes',
  constraints: 'Contraintes',
  accommodations: 'Besoin d’aménagement',
};

type Ligne = {
  id: string;
  answers: Record<string, unknown> | null;
  submitted_at: string | null;
  dossier_id: string | null;
  template: { title: string | null; schema: unknown } | null;
  assignment: {
    recipient_name: string | null;
    recipient_email: string | null;
    session_id: string | null;
    learner: { first_name: string | null; last_name: string | null } | null;
  } | null;
  dossier: { reference: string | null; formation: { title: string | null } | null } | null;
};

const un = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export default async function ReponseQuestionnairePage({ params }: { params: { id: string } }) {
  // Lecture sous RLS : l'équipe de l'organisme seulement.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabaseServer() as unknown as SupabaseClient<any, any, any>;
  const { data, error } = await sb
    .schema('app')
    .from('questionnaire_responses')
    .select(
      'id, answers, submitted_at, dossier_id, template:questionnaire_templates(title, schema), assignment:questionnaire_assignments(recipient_name, recipient_email, session_id, learner:learners(first_name, last_name)), dossier:dossiers(reference, formation:formations(title))',
    )
    .eq('id', params.id)
    .maybeSingle();
  if (error) throw new Error(`[questionnaire] réponse illisible : ${error.message}`);
  const r = data as unknown as Ligne | null;
  if (!r) notFound();

  const modele = un(r.template);
  const affectation = un(r.assignment);
  const apprenant = un(affectation?.learner);
  const dossier = un(r.dossier);
  const qui = (apprenant ? `${apprenant.first_name ?? ''} ${apprenant.last_name ?? ''}`.trim() : '') || affectation?.recipient_name || affectation?.recipient_email || 'Répondant';
  const reponses = r.answers ?? {};
  const questions: Question[] = questionsDuSchema(modele?.schema);
  const connues = new Set(questions.map((q) => q.id));
  const lignes = [
    ...questions.map((q) => ({ cle: q.id, libelle: q.label, valeur: valeurLisible(q, reponses[q.id]) })),
    ...Object.entries(reponses)
      .filter(([k, v]) => !connues.has(k) && v !== null && v !== '' && v !== undefined)
      .map(([k, v]) => ({
        cle: k,
        libelle: ANCIENNES[k] ?? k,
        valeur: valeurLisible({ id: k, type: 'text', label: k, required: false }, v),
      })),
  ];
  const repondues = lignes.filter((l) => l.valeur);

  return (
    <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
      <header className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
          <ClipboardCheck className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold text-zinc-900 dark:text-zinc-100">{modele?.title ?? 'Questionnaire'}</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 tabular-nums">
            <span className="text-rose-700 dark:text-rose-300 font-medium">{qui}</span>
            {r.submitted_at ? ` · répondu le ${quand.format(new Date(r.submitted_at))}` : ''}
            {dossier?.formation?.title ? ` · ${dossier.formation.title}` : ''}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {r.dossier_id && (
          <Lien href={`/dossiers/${r.dossier_id}/questionnaires`}>
            Dossier <span className="font-mono">{dossier?.reference}</span>
          </Lien>
        )}
        {affectation?.session_id && <Lien href={`/sessions/${affectation.session_id}/fiches-besoin`}>Fiches besoin de la séance</Lien>}
        <Lien href="/questionnaires/fiches-besoin">Toutes les fiches besoin</Lien>
      </div>

      <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden" aria-label="Réponses">
        {repondues.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-zinc-500 dark:text-zinc-400">Le questionnaire a été envoyé sans réponse détaillée.</p>
        ) : (
          <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {lignes.map((l, i) => (
              <div key={l.cle} className="px-5 py-3.5">
                <dt className="text-[12px] text-zinc-500 dark:text-zinc-400">
                  <span className="tabular-nums mr-1">{i + 1}.</span>
                  {l.libelle}
                </dt>
                <dd className={`mt-0.5 text-[14px] whitespace-pre-wrap break-words ${l.valeur ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 italic'}`}>
                  {l.valeur ?? 'Sans réponse'}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}

function Lien({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
    >
      {children} <ArrowUpRight className="w-3.5 h-3.5" />
    </Link>
  );
}
