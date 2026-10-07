import { CalendarDays, Clock, GraduationCap, MapPin, Users, Video } from 'lucide-react';
import { planning } from '@/features/espace-entreprise/espace-calculs';
import type { SeanceEspace } from '@/features/espace-entreprise/espace-complet';
import { CARTE, MODALITE, heure, heures, jourLong } from './format';

/** Les séances de ses apprenants : à venir d'abord, puis l'historique. */
export function VuePlanning({ seances }: { seances: readonly SeanceEspace[] }) {
  const p = planning(seances, new Date());
  if (seances.length === 0) {
    return <p className={`${CARTE} px-5 py-10 text-center text-[13px] text-zinc-500 dark:text-zinc-400`}>Aucune séance planifiée pour l’instant.</p>;
  }
  return (
    <div className="space-y-6">
      <Bloc titre="À venir" groupes={p.aVenir} vide="Aucune séance à venir." />
      {p.passees.length > 0 && <Bloc titre="Séances passées" groupes={p.passees} vide="" passees />}
    </div>
  );
}

function Bloc({ titre, groupes, vide, passees = false }: { titre: string; groupes: ReturnType<typeof planning<SeanceEspace>>['aVenir']; vide: string; passees?: boolean }) {
  return (
    <section aria-label={titre} className="space-y-3">
      <h2 className="text-[13px] font-medium uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">{titre}</h2>
      {groupes.length === 0 ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{vide}</p>
      ) : (
        groupes.map((g) => (
          <div key={g.mois} className="space-y-2">
            <p className="text-[12px] font-medium text-zinc-600 dark:text-zinc-300 first-letter:uppercase">{g.mois}</p>
            <ul className="space-y-2">
              {g.seances.map((s) => (
                <li key={s.id} className={`${CARTE} p-4 flex gap-4 ${passees ? 'opacity-80' : ''}`}>
                  <div className="w-14 shrink-0 text-center rounded-lg bg-blue-50 dark:bg-blue-950/40 py-1.5">
                    <p className="text-[11px] uppercase text-blue-700 dark:text-blue-300">
                      {new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short' }).format(new Date(s.debut))}
                    </p>
                    <p className="text-[20px] leading-none font-semibold text-blue-700 dark:text-blue-300 tabular-nums">
                      {new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric' }).format(new Date(s.debut))}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-[14px] font-medium text-[color:var(--sess)]">
                      {s.formation}
                      {s.groupe && <span className="ml-2 inline-flex items-center h-5 px-1.5 rounded-full text-[11px] bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">{s.groupe}</span>}
                    </p>
                    <p className="text-[12px] text-zinc-600 dark:text-zinc-300 flex flex-wrap gap-x-4 gap-y-1">
                      <span className="inline-flex items-center gap-1 tabular-nums first-letter:uppercase">
                        <CalendarDays className="w-3.5 h-3.5" aria-hidden /> {jourLong.format(new Date(s.debut))}
                      </span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Clock className="w-3.5 h-3.5" aria-hidden /> {heure.format(new Date(s.debut))} – {heure.format(new Date(s.fin))}
                        {s.dureeHeures > 0 && ` · ${heures(s.dureeHeures)}`}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {s.visio ? <Video className="w-3.5 h-3.5" aria-hidden /> : <MapPin className="w-3.5 h-3.5" aria-hidden />}
                        {MODALITE[s.modalite] ?? s.modalite}
                        {s.lieu ? ` · ${s.lieu}` : ''}
                      </span>
                      {s.formateurs.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <GraduationCap className="w-3.5 h-3.5" aria-hidden /> {s.formateurs.join(', ')}
                        </span>
                      )}
                    </p>
                    {s.participants.length > 0 && (
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 inline-flex items-start gap-1">
                        <Users className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden /> {s.participants.join(', ')}
                      </p>
                    )}
                    {s.visio && !s.passee && (
                      <a href={s.visio} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-blue-700 dark:text-blue-300 hover:underline">
                        <Video className="w-3.5 h-3.5" aria-hidden /> Lien de connexion
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
