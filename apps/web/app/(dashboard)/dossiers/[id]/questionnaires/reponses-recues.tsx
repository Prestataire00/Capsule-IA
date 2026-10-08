import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowUpRight, MessageSquareQuote } from 'lucide-react';
import { questionsDuSchema } from '@/features/questionnaire/fiche-besoin';
import { statistiquesDesReponses } from '@/features/questionnaire/reponses-seance';
import { SectionLabel } from '@/shared/ui/section-label';

type Ligne = {
  id: string;
  answers: Record<string, unknown> | null;
  submitted_at: string | null;
  template_id: string;
  template: { title: string | null; schema: unknown } | Array<{ title: string | null; schema: unknown }> | null;
  assignment:
    | { recipient_name: string | null; recipient_kind: string | null; learner: { first_name: string | null; last_name: string | null } | null }
    | Array<{ recipient_name: string | null; recipient_kind: string | null; learner: { first_name: string | null; last_name: string | null } | null }>
    | null;
};

const un = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const virgule = (n: number) => String(n).replace('.', ',');

/**
 * Les réponses reçues sur le dossier, questionnaire par questionnaire : les
 * moyennes des notes, la répartition des choix, et chaque commentaire avec
 * son auteur (demande d'Ismael, 2026-10-08).
 */
export async function ReponsesRecues({ sb, dossierId }: { sb: SupabaseClient; dossierId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = sb as unknown as SupabaseClient<any, any, any>;
  const { data, error } = await db
    .schema('app')
    .from('questionnaire_responses')
    .select(
      'id, answers, submitted_at, template_id, template:questionnaire_templates(title, schema), assignment:questionnaire_assignments(recipient_name, recipient_kind, learner:learners(first_name, last_name))',
    )
    .eq('dossier_id', dossierId)
    .order('submitted_at', { ascending: false });
  if (error) throw new Error(`[questionnaires] réponses du dossier illisibles : ${error.message}`);
  const lignes = (data ?? []) as unknown as Ligne[];

  const parModele = new Map<string, Ligne[]>();
  for (const l of lignes) parModele.set(l.template_id, [...(parModele.get(l.template_id) ?? []), l]);

  return (
    <div className="space-y-4">
      <SectionLabel>Réponses reçues</SectionLabel>
      {parModele.size === 0 ? (
        <p className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm px-5 py-8 text-center text-[13px] text-zinc-500 dark:text-zinc-400">
          Aucune réponse pour l’instant : elles apparaîtront ici, avec leurs moyennes.
        </p>
      ) : (
        [...parModele.values()].map((liste) => {
          const modele = un(liste[0]?.template);
          const questions = questionsDuSchema(modele?.schema);
          const stats = statistiquesDesReponses(
            questions,
            liste.map((l) => l.answers ?? {}),
          );
          const auteur = (l: Ligne) => {
            const a = un(l.assignment);
            const ap = un(a?.learner);
            return (ap ? `${ap.first_name ?? ''} ${ap.last_name ?? ''}`.trim() : '') || a?.recipient_name || 'Répondant';
          };
          return (
            <section key={liste[0]?.template_id} className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
              <header className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap">
                <h3 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">{modele?.title ?? 'Questionnaire'}</h3>
                <span className="h-6 px-2 rounded-full text-[12px] tabular-nums inline-flex items-center bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                  {liste.length} réponse{liste.length > 1 ? 's' : ''}
                </span>
              </header>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {stats.map((s) => (
                  <li key={s.question.id} className="px-5 py-3">
                    <p className="text-[13px] text-zinc-900 dark:text-zinc-100">{s.question.label}</p>
                    {s.genre === 'note' && (
                      <div className="mt-1.5 flex items-center gap-3">
                        <span className="w-40 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden" aria-hidden>
                          <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((s.moyenne / s.max) * 100)}%` }} />
                        </span>
                        <span className="text-[15px] font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                          {virgule(s.moyenne)} <span className="text-[12px] text-zinc-500">/ {s.max}</span>
                        </span>
                        <span className="text-[12px] text-zinc-500 tabular-nums">moyenne sur {s.n}</span>
                      </div>
                    )}
                    {s.genre === 'choix' && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {s.repartition.map(([option, n]) => (
                          <span key={option} className="h-6 px-2 rounded-full text-[12px] inline-flex items-center gap-1 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            {option} <span className="tabular-nums font-medium">{n}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {s.genre === 'texte' && (
                      <ul className="mt-1.5 space-y-1.5">
                        {liste
                          .map((l) => ({ l, v: l.answers?.[s.question.id] }))
                          .filter(({ v }) => typeof v === 'string' && v.trim())
                          .map(({ l, v }) => (
                            <li key={l.id} className="flex gap-2 text-[13px] text-zinc-700 dark:text-zinc-300">
                              <MessageSquareQuote className="w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-400" aria-hidden />
                              <span className="min-w-0">
                                <span className="whitespace-pre-wrap">{String(v)}</span>
                                <span className="text-[12px] text-rose-700 dark:text-rose-300"> — {auteur(l)}</span>
                              </span>
                            </li>
                          ))}
                        {s.n === 0 && <li className="text-[12px] text-zinc-500">Pas de commentaire.</li>}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              <footer className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap gap-2">
                {liste.map((l) => (
                  <Link
                    key={l.id}
                    href={`/questionnaires/reponse/${l.id}`}
                    className="h-7 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1"
                  >
                    {auteur(l)} <ArrowUpRight className="w-3 h-3" aria-hidden />
                  </Link>
                ))}
              </footer>
            </section>
          );
        })
      )}
    </div>
  );
}
