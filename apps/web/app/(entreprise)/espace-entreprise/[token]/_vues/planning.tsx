import Link from 'next/link';
import { CalendarDays, Clock, Download, GraduationCap, LayoutList, MapPin, Table2, Users, Video } from 'lucide-react';
import { planning } from '@/features/espace-entreprise/espace-calculs';
import type { SeanceEspace } from '@/features/espace-entreprise/espace-complet';
import { CARTE, MODALITE, heure, heures, jourLong } from './format';

/** Les séances de ses apprenants : à venir d'abord, puis l'historique — en liste ou en tableau. */
export function VuePlanning({ seances, token, vue }: { seances: readonly SeanceEspace[]; token: string; vue: 'liste' | 'tableau' }) {
  const p = planning(seances, new Date());
  if (seances.length === 0) {
    return <p className={`${CARTE} px-5 py-10 text-center text-[13px] text-zinc-500 dark:text-zinc-400`}>Aucune séance planifiée pour l’instant.</p>;
  }
  return (
    <div className="space-y-6">
      <div className="flex justify-end items-center gap-2 flex-wrap">
        {p.aVenir.length > 0 && (
          <a
            href={`/api/espace-entreprise/${token}/convocation`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <Download className="w-3.5 h-3.5" aria-hidden /> Convocation générale (PDF)
          </a>
        )}
        <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden" role="group" aria-label="Affichage du planning">
          {(
            [
              { cle: 'liste', libelle: 'Liste', icone: LayoutList },
              { cle: 'tableau', libelle: 'Tableau', icone: Table2 },
            ] as const
          ).map((o) => (
            <Link
              key={o.cle}
              href={`/espace-entreprise/${token}?onglet=planning&vue=${o.cle}`}
              aria-current={vue === o.cle ? 'true' : undefined}
              className={`h-8 px-3 inline-flex items-center gap-1.5 text-[12px] ${
                vue === o.cle
                  ? 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 font-medium'
                  : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              <o.icone className="w-3.5 h-3.5" aria-hidden /> {o.libelle}
            </Link>
          ))}
        </div>
      </div>
      {vue === 'tableau' ? (
        <>
          <Tableau titre="À venir" seances={p.aVenir.flatMap((g) => g.seances)} vide="Aucune séance à venir." />
          {p.passees.length > 0 && <Tableau titre="Séances passées" seances={p.passees.flatMap((g) => g.seances)} vide="" />}
        </>
      ) : (
        <>
          <Bloc titre="À venir" groupes={p.aVenir} vide="Aucune séance à venir." />
          {p.passees.length > 0 && <Bloc titre="Séances passées" groupes={p.passees} vide="" passees />}
        </>
      )}
    </div>
  );
}

const jourTableau = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

/** Une ligne par séance, pour tout voir d'un coup d'œil, l'imprimer ou le comparer. */
function Tableau({ titre, seances, vide }: { titre: string; seances: readonly SeanceEspace[]; vide: string }) {
  return (
    <section aria-label={titre} className="space-y-2">
      <h2 className="text-[13px] font-medium uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">{titre}</h2>
      {seances.length === 0 ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{vide}</p>
      ) : (
        <div className={`${CARTE} overflow-x-auto`}>
          <table className="w-full min-w-[860px] text-[13px] border-collapse">
            <thead className="bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800">
              <tr className="text-left text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Horaires</th>
                <th className="px-4 py-2.5">Formation</th>
                <th className="px-4 py-2.5">Lieu</th>
                <th className="px-4 py-2.5">Formateur</th>
                <th className="px-4 py-2.5">Participants</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {seances.map((s) => (
                <tr key={s.id} className="align-top">
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-zinc-800 dark:text-zinc-200 first-letter:uppercase">{jourTableau.format(new Date(s.debut))}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-zinc-700 dark:text-zinc-300">
                    {heure.format(new Date(s.debut))} – {heure.format(new Date(s.fin))}
                    {s.dureeHeures > 0 && <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">{heures(s.dureeHeures)}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[color:var(--sess)]">{s.formation}</span>
                    {s.groupe && (
                      <span className="block mt-1">
                        <span className="inline-flex items-center h-5 px-1.5 rounded-full text-[11px] bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">{s.groupe}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300 max-w-[220px]">
                    {MODALITE[s.modalite] ?? s.modalite}
                    {s.lieu && <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">{s.lieu}</span>}
                    {s.visio && !s.passee && (
                      <a href={s.visio} target="_blank" rel="noopener noreferrer" className="block text-[12px] text-blue-700 dark:text-blue-300 hover:underline">
                        Lien de connexion
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{s.formateurs.join(', ') || '—'}</td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300 max-w-[320px]">
                    <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">{s.participants.length}</span>
                    {s.participants.length > 0 && <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">{s.participants.join(', ')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
