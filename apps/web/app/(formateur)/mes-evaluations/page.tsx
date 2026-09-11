// ARCHETYPE: command
// Justification: évaluations reçues par le formateur — moyennes et commentaires anonymes par formation.

import { MessageSquareQuote, Star } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Evaluation = {
  formation_id: string | null;
  formation_title: string;
  responses: number;
  satisfaction_avg: number | null;
  trainer_avg: number | null;
  last_submitted_at: string | null;
  comments: string[] | null;
};

const note = (v: number | null) => (v === null ? '—' : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

function Chiffre({ label, valeur, sur }: { label: string; valeur: string; sur?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-[24px] font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums mt-1">
        {valeur}
        {sur && <span className="text-[13px] font-normal text-zinc-400"> {sur}</span>}
      </p>
    </div>
  );
}

export default async function MesEvaluationsPage() {
  const { data, error } = await supabaseServer().schema('app').rpc('my_trainer_evaluations' as never);
  if (error) throw error;
  const lignes = (data ?? []) as Evaluation[];
  const global = lignes.find((l) => l.formation_id === null);
  const formations = lignes.filter((l) => l.formation_id !== null);

  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Mes évaluations</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Ce que vos apprenants disent de vos formations. Réponses anonymes, affichées à partir de trois réponses.
        </p>
      </header>

      {!global ? (
        <p className="text-[13px] text-zinc-400 text-center py-12 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
          Aucune évaluation reçue pour l’instant. Envoyez le questionnaire de satisfaction depuis une séance.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Chiffre label="Réponses" valeur={String(global.responses)} />
            <Chiffre label="Satisfaction" valeur={note(global.satisfaction_avg)} sur="/ 5" />
            <Chiffre label="Note formateur" valeur={note(global.trainer_avg)} sur="/ 5" />
          </div>
          {global.satisfaction_avg === null && (
            <p className="text-[12px] text-zinc-500">Encore quelques réponses : les moyennes s’affichent dès la troisième.</p>
          )}

          <section className="space-y-3">
            <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">Par formation</h2>
            {formations.map((f) => (
              <article key={f.formation_id} className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 p-4 space-y-3 bg-white dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{f.formation_title}</p>
                    <p className="text-[12px] text-zinc-500 tabular-nums">
                      {f.responses} réponse{f.responses > 1 ? 's' : ''}
                    </p>
                  </div>
                  {f.trainer_avg !== null ? (
                    <span className="inline-flex items-center gap-1 text-[13px] text-amber-700 dark:text-amber-300 tabular-nums">
                      <Star className="w-4 h-4 fill-current" aria-hidden /> {note(f.trainer_avg)} / 5
                    </span>
                  ) : (
                    <span className="text-[11px] text-zinc-400">moins de 3 réponses</span>
                  )}
                </div>
                {f.satisfaction_avg !== null && (
                  <p className="text-[12px] text-zinc-600 dark:text-zinc-300 tabular-nums">Satisfaction générale : {note(f.satisfaction_avg)} / 5</p>
                )}
                {f.comments && f.comments.length > 0 && (
                  <ul className="space-y-2">
                    {f.comments.slice(0, 8).map((c, i) => (
                      <li key={i} className="flex gap-2 text-[13px] text-zinc-700 dark:text-zinc-300">
                        <MessageSquareQuote className="w-4 h-4 text-zinc-400 flex-shrink-0 mt-0.5" aria-hidden />
                        <span>« {c} »</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
