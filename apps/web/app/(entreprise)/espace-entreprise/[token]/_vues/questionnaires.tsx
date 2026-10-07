import { CheckCircle2, ClipboardList, Lock } from 'lucide-react';
import type { QuestionnaireEspace } from '@/features/espace-entreprise/questionnaires-entreprise';
import { CARTE } from './format';

const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' });
const jourCourt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });

/** Ses questionnaires : à remplir, à venir (débloqués le jour dit), déjà répondus. */
export function VueQuestionnaires({ questionnaires }: { questionnaires: readonly QuestionnaireEspace[] }) {
  if (questionnaires.length === 0) {
    return <p className={`${CARTE} px-5 py-10 text-center text-[13px] text-zinc-500 dark:text-zinc-400`}>Aucun questionnaire pour l’instant.</p>;
  }
  const blocs = [
    { titre: 'À remplir', liste: questionnaires.filter((q) => q.statut === 'disponible') },
    { titre: 'À venir', liste: questionnaires.filter((q) => q.statut === 'a_venir') },
    { titre: 'Répondus', liste: questionnaires.filter((q) => q.statut === 'repondu') },
  ].filter((b) => b.liste.length > 0);
  return (
    <div className="space-y-6">
      {blocs.map((b) => (
        <section key={b.titre} aria-label={b.titre} className="space-y-2">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">{b.titre}</h2>
          <ul className={`${CARTE} divide-y divide-zinc-100 dark:divide-zinc-800`}>
            {b.liste.map((q) => (
              <li key={q.cle} className="px-5 py-3.5 flex items-center gap-3 flex-wrap">
                <span
                  className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${
                    q.statut === 'disponible'
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                      : q.statut === 'a_venir'
                        ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                  }`}
                >
                  {q.statut === 'disponible' ? <ClipboardList className="w-4 h-4" /> : q.statut === 'a_venir' ? <Lock className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium text-zinc-900 dark:text-zinc-100">{q.titre}</span>
                  <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {q.formation && <span className="text-[color:var(--sess)]">{q.formation}</span>}
                    {q.formation && ' · '}
                    {q.statut === 'a_venir' && q.date
                      ? `À venir — disponible à partir du ${jour.format(new Date(q.date))}`
                      : q.statut === 'repondu'
                        ? `Répondu${q.date ? ` le ${jourCourt.format(new Date(q.date))}` : ''}`
                        : 'Disponible — quelques minutes'}
                  </span>
                </span>
                {q.statut === 'disponible' && q.lien && (
                  <a
                    href={q.lien}
                    className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium inline-flex items-center shadow-sm"
                  >
                    Répondre
                  </a>
                )}
                {q.statut === 'a_venir' && (
                  <span className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" aria-hidden /> Bientôt
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
