import { Download, Eye, FileText, Mail, MailX } from 'lucide-react';
import type { ApprenantEspace } from '@/features/espace-entreprise/espace-complet';
import { TEMPLATE_KIND_LABELS } from '@/app/(dashboard)/documents/modeles/schema';
import { CARTE, DEMI_JOURNEE, STATUT_EMARGEMENT, date, heures, jourCourt } from './format';

/** Ses apprenants : heures, émargements, documents — chacun se déplie. */
export function VueApprenants({ apprenants, token }: { apprenants: readonly ApprenantEspace[]; token: string }) {
  if (apprenants.length === 0) {
    return <p className={`${CARTE} px-5 py-10 text-center text-[13px] text-zinc-500 dark:text-zinc-400`}>Aucun apprenant inscrit pour l’instant.</p>;
  }
  return (
    <ul className="space-y-2">
      {apprenants.map((a) => {
        const taux = a.heures.prevues > 0 ? Math.round((a.heures.realisees / a.heures.prevues) * 100) : null;
        return (
          <li key={a.id} className={CARTE}>
            <details className="group">
              <summary className="list-none cursor-pointer px-5 py-4 flex items-center gap-3 flex-wrap">
                <span className="w-9 h-9 rounded-full grid place-items-center shrink-0 text-[12px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  {a.nom.split(/\s+/).map((m) => m[0]).slice(0, 2).join('').toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium text-zinc-900 dark:text-zinc-100">{a.nom}</span>
                  <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                    {a.formation ?? 'Formation'} · <span className="font-mono">{a.dossierReference}</span>
                  </span>
                </span>
                <span className="text-[12px] text-zinc-600 dark:text-zinc-300 tabular-nums text-right">
                  <span className="block">
                    <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{heures(a.heures.realisees)}</strong> / {heures(a.heures.prevues)}
                  </span>
                  <span className="block text-zinc-500 dark:text-zinc-400">{taux === null ? 'heures réalisées' : `${taux} % réalisé`}</span>
                </span>
                <span className="w-24 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden" aria-hidden>
                  <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, taux ?? 0)}%` }} />
                </span>
                <span className="text-[12px] text-orange-600 dark:text-orange-400 group-open:hidden">Détail</span>
                <span className="text-[12px] text-orange-600 dark:text-orange-400 hidden group-open:inline">Replier</span>
              </summary>
              <div className="px-5 pb-5 grid gap-5 md:grid-cols-2 border-t border-zinc-100 dark:border-zinc-800 pt-4">
                <div className="space-y-2">
                  <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">Coordonnées</p>
                  <p className="text-[13px] text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-1.5">
                    {a.joignable ? <Mail className="w-3.5 h-3.5" aria-hidden /> : <MailX className="w-3.5 h-3.5 text-amber-600" aria-hidden />}
                    {a.joignable ? a.email : 'Pas d’adresse e-mail : il reçoit ses documents par vous.'}
                  </p>
                  {a.prochaineSeance && (
                    <p className="text-[13px] text-zinc-600 dark:text-zinc-300 tabular-nums">Prochaine séance : {jourCourt.format(new Date(a.prochaineSeance))}</p>
                  )}
                  <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 pt-2">Documents</p>
                  {a.documents.length === 0 ? (
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Ses documents (attestations, certificat) apparaîtront ici dès qu’ils sont émis.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {a.documents.map((d) => (
                        <li key={d.id}>
                          <a
                            href={d.aUnFichier ? `/api/espace-entreprise/${token}/document/${d.id}` : `/espace-entreprise/${token}/document/${d.id}`}
                            className="inline-flex items-center gap-1.5 text-[13px] text-zinc-800 dark:text-zinc-200 hover:text-orange-600 dark:hover:text-orange-400"
                          >
                            <FileText className="w-3.5 h-3.5 text-zinc-400" aria-hidden />
                            {d.title}
                            <span className="text-[11px] text-zinc-500">
                              · {TEMPLATE_KIND_LABELS[d.kind as keyof typeof TEMPLATE_KIND_LABELS] ?? 'Document'} · {date(d.createdAt)}
                            </span>
                            {d.aUnFichier ? <Download className="w-3 h-3" aria-hidden /> : <Eye className="w-3 h-3" aria-hidden />}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                    Émargements · <span className="tabular-nums">{a.heures.presences} présence{a.heures.presences > 1 ? 's' : ''}</span>
                    {a.heures.absences > 0 && <span className="tabular-nums"> · {a.heures.absences} absence{a.heures.absences > 1 ? 's' : ''}</span>}
                  </p>
                  {a.emargements.length === 0 ? (
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Aucune feuille d’émargement pour l’instant.</p>
                  ) : (
                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 text-[12px]">
                      {a.emargements.map((e, i) => {
                        const passe = new Date(e.debut).getTime() < Date.now();
                        const s = e.statut ? STATUT_EMARGEMENT[e.statut] : null;
                        return (
                          <li key={`${e.sessionId}-${e.demiJournee}-${i}`} className="py-1.5 flex items-center justify-between gap-2">
                            <span className="text-zinc-700 dark:text-zinc-300 tabular-nums">
                              {jourCourt.format(new Date(e.debut))} · {DEMI_JOURNEE[e.demiJournee] ?? e.demiJournee}
                            </span>
                            {s ? (
                              <span className={`inline-flex items-center h-5 px-1.5 rounded-full text-[11px] font-medium ${s.ton}`}>{s.libelle}</span>
                            ) : (
                              <span className="text-zinc-400">{passe ? 'Non émargé' : 'À venir'}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {a.heures.seancesSansFeuille > 0 && (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {a.heures.seancesSansFeuille} séance{a.heures.seancesSansFeuille > 1 ? 's' : ''} passée{a.heures.seancesSansFeuille > 1 ? 's' : ''} sans feuille d’émargement : non comptée{a.heures.seancesSansFeuille > 1 ? 's' : ''} dans les heures réalisées.
                    </p>
                  )}
                </div>
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
