import { CalendarDays, Download, Eye, FileText, FolderOpen, PlayCircle, Users } from 'lucide-react';
import type { DossierEntreprise } from '@/features/espace-entreprise/load';
import { TEMPLATE_KIND_LABELS } from '@/app/(dashboard)/documents/modeles/schema';
import { CARTE, date } from './format';

/** Les documents rendus visibles, formation par formation, et les replays. */
export function VueDocuments({ dossiers, token, seancesAVenir }: { dossiers: readonly DossierEntreprise[]; token: string; seancesAVenir: number }) {
  if (dossiers.length === 0) {
    return <p className={`${CARTE} px-5 py-10 text-center text-[13px] text-zinc-500 dark:text-zinc-400`}>Aucune formation en cours pour l’instant.</p>;
  }
  return (
    <div className="space-y-4">
      {seancesAVenir > 0 && (
        <section className={`${CARTE} px-5 py-4 flex items-center gap-3 flex-wrap`} aria-label="Convocation générale">
          <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
            <Users className="w-4 h-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium text-zinc-900 dark:text-zinc-100">Convocation générale</span>
            <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
              Vos {seancesAVenir} séance{seancesAVenir > 1 ? 's' : ''} à venir et tous vos participants, à jour, à transmettre à vos équipes.
            </span>
          </span>
          <a
            href={`/api/espace-entreprise/${token}/convocation`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <Download className="w-3.5 h-3.5" /> Télécharger
          </a>
        </section>
      )}
      {dossiers.map((d) => (
        <section key={d.id} className={`${CARTE} overflow-hidden`}>
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-start gap-3">
            <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <FolderOpen className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">{d.formation ?? 'Formation'}</h2>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 flex items-center gap-2 flex-wrap">
                <span className="font-mono">{d.reference}</span>
                {d.debut && (
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <CalendarDays className="w-3 h-3" /> {date(d.debut)}
                    {d.fin && d.fin !== d.debut ? ` – ${date(d.fin)}` : ''}
                  </span>
                )}
              </p>
            </div>
          </div>
          {d.documents.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-zinc-500 dark:text-zinc-400">Pas encore de document pour cette formation.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {d.documents.map((doc) => (
                <li key={doc.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                  <span className="min-w-0 flex items-center gap-3">
                    <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-[13px] text-zinc-900 dark:text-zinc-100 truncate">{doc.title}</span>
                      <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                        {TEMPLATE_KIND_LABELS[doc.kind as keyof typeof TEMPLATE_KIND_LABELS] ?? 'Document'} · {date(doc.createdAt)}
                      </span>
                    </span>
                  </span>
                  <a
                    href={doc.aUnFichier ? `/api/espace-entreprise/${token}/document/${doc.id}` : `/espace-entreprise/${token}/document/${doc.id}`}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    {doc.aUnFichier ? <Download className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {doc.aUnFichier ? 'Télécharger' : 'Consulter'}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {d.replays.length > 0 && (
            <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800">
              <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Replays</p>
              <ul className="space-y-1">
                {d.replays.map((r) => (
                  <li key={r.id}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] text-blue-700 dark:text-blue-300 hover:underline">
                      <PlayCircle className="w-3.5 h-3.5" /> {r.titre} <span className="text-zinc-500 dark:text-zinc-400">· {r.source}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
