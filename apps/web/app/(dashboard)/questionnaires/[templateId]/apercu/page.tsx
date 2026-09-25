// ARCHETYPE: command
// Justification: lire un questionnaire en entier, tel que son destinataire le
// reçoit — avant de l'envoyer, et non après.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { questionsDuSchema } from '@/features/questionnaire/fiche-besoin';
import {
  INTERLOCUTEURS,
  ETAPES,
  interlocuteurDuModele,
  etapeDuModele,
  declencheurDuModele,
} from '@/features/questionnaire/cartographie';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  nps: 'Note de 0 à 10',
  rating: 'Note de 1 à 5',
  text: 'Réponse libre',
  choice: 'Choix dans une liste',
};

export default async function ApercuQuestionnairePage({ params }: { params: { templateId: string } }) {
  const sb = supabaseServer();
  const { data, error: erreurLecture } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('id, title, description, kind, code, organization_id, schema, thank_you_message')
    .eq('id', params.templateId)
    .is('deleted_at', null)
    .maybeSingle();
  // Une requête en échec n'est pas un modèle absent : sans cette distinction,
  // toute panne s'affiche en 404 (incident du 21/09/2026).
  if (erreurLecture) {
    console.error('[aperçu questionnaire] lecture impossible', erreurLecture.code, erreurLecture.message);
    throw new Error(`Lecture impossible (aperçu du questionnaire) : ${erreurLecture.message}`);
  }
  if (!data) notFound();

  const m = data as unknown as {
    id: string;
    title: string;
    description: string | null;
    kind: string;
    code: string | null;
    organization_id: string | null;
    schema: unknown;
    thank_you_message: string | null;
  };

  // Les deux formes de schéma coexistent en base — `{questions}` et `{fields}`.
  // Les normaliser ici, c'est montrer ce que le destinataire verra vraiment,
  // quelle que soit la façon dont le modèle a été écrit.
  const questions = questionsDuSchema(m.schema);
  const qui = INTERLOCUTEURS.find((i) => i.cle === interlocuteurDuModele(m))!;
  const etape = ETAPES.find((e) => e.cle === etapeDuModele(m))!;
  const declencheur = declencheurDuModele(m);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          href="/questionnaires/catalogue"
          className="text-[12px] text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          <ArrowLeft className="w-3 h-3" /> Tous les questionnaires
        </Link>
        <SectionLabel className="mt-3 mb-2">Aperçu</SectionLabel>
        <h1 className="text-[24px] font-extrabold text-zinc-900 dark:text-zinc-100">{m.title}</h1>
        {m.description && (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">{m.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${ACCENTS[qui.accent as keyof typeof ACCENTS].soft}`}>
            {qui.label}
          </span>
          <span className="rounded-full px-2.5 py-1 text-[12px] font-semibold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {etape.label}
          </span>
          <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
            {m.organization_id ? 'Modèle de votre organisme' : 'Modèle livré avec le logiciel'}
          </span>
          <Link
            href={`/questionnaires/${m.id}`}
            className="ml-auto h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <Pencil className="w-3.5 h-3.5" /> Modifier
          </Link>
        </div>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-2">
          {declencheur ?? 'Ce questionnaire ne part pas tout seul : il s’envoie depuis un dossier.'}
        </p>
      </div>

      {questions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-amber-300 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 p-5">
          <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">
            Ce modèle ne contient aucune question lisible.
          </p>
          <p className="text-[12px] text-amber-700 dark:text-amber-400 mt-1">
            Envoyé tel quel, le destinataire verrait un formulaire vide. Ouvrez-le pour y ajouter des questions.
          </p>
        </div>
      ) : (
        <ol className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80">
          {questions.map((q, i) => (
            <li key={q.id} className="px-5 py-4 flex items-start gap-3">
              <span className="w-6 h-6 rounded-md grid place-items-center shrink-0 text-[12px] font-bold tabular-nums bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] text-zinc-900 dark:text-zinc-100">
                  {q.label}
                  {q.required && <span className="text-orange-600 dark:text-orange-400"> *</span>}
                </span>
                <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {TYPE_LABEL[q.type] ?? q.type}
                  {q.type === 'choice' && q.options.length > 0 && ` — ${q.options.join(' · ')}`}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {m.thank_you_message && (
        <div className="rounded-xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-emerald-700 dark:text-emerald-400 mb-1">
            Après l’envoi, le destinataire lit
          </p>
          <p className="text-[13px] text-zinc-800 dark:text-zinc-200">{m.thank_you_message}</p>
        </div>
      )}
    </div>
  );
}
