// ARCHETYPE: command
// Justification: page Documents — tabs par statut, table dense avec actions au survol.

import Link from 'next/link';
import { Plus, FileText, Search, Download } from 'lucide-react';
import { IdPill } from '@/shared/ui/id-pill';
import { documentsByDossier, dossiers, learnerFullName } from '@/shared/mock/data';

const tabs = [
  { id: 'a-signer', label: 'À signer', active: true },
  { id: 'a-transmettre', label: 'À transmettre' },
  { id: 'generes', label: 'Générés' },
  { id: 'archives', label: 'Archivés' },
];

const statusStyles: Record<string, string> = {
  'À signer': 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  'À transmettre': 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  'Généré': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  'Archivé': 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
};

export default function DocumentsPage() {
  // Aplatir tous les documents avec leur dossier
  const allDocs = Object.entries(documentsByDossier).flatMap(([dossierId, list]) => {
    const dossier = dossiers.find((d) => d.id === dossierId);
    return list.map((d) => ({
      ...d,
      dossier,
      learner: dossier ? learnerFullName(dossier.learnerId) : '—',
      statusLabel: d.status === 'pending' ? 'À transmettre' : d.signed ? 'Généré' : 'À signer',
    }));
  });

  // Counts par tab
  const counts = {
    'a-signer': allDocs.filter((d) => d.statusLabel === 'À signer').length + 14,
    'a-transmettre': allDocs.filter((d) => d.statusLabel === 'À transmettre').length + 11,
    'generes': allDocs.filter((d) => d.statusLabel === 'Généré').length + 130,
    'archives': 47,
  };

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Documents</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
            Conventions, attestations, certificats — générés depuis vos templates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input
              type="search"
              placeholder="Rechercher un document…"
              className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-[13px] w-72 focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700 placeholder:text-zinc-400"
            />
          </div>
          <Link
            href="/dossiers"
            className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            Générer un document
          </Link>
        </div>
      </header>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 pt-3 border-b border-zinc-200/60 dark:border-zinc-800">
          <ul className="flex items-center gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/documents?tab=${t.id}`}
                  className={
                    t.active
                      ? 'text-[13px] font-medium text-violet-700 dark:text-violet-400 border-b-2 border-violet-600 px-3 py-2 -mb-px transition whitespace-nowrap inline-block'
                      : 'text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-3 py-2 transition whitespace-nowrap inline-block'
                  }
                >
                  {t.label}
                  <span className={t.active ? 'ml-1.5 text-[11px] bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 px-1.5 py-0.5 rounded' : 'ml-1.5 text-[11px] text-zinc-400'}>
                    {counts[t.id as keyof typeof counts]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-[28px_1.5fr_140px_1.2fr_120px_120px_100px] gap-3 px-5 py-2.5 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
          <div />
          <div>Document</div>
          <div>Dossier</div>
          <div>Apprenant</div>
          <div>Type</div>
          <div>Statut</div>
          <div>Action</div>
        </div>

        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {allDocs.slice(0, 8).map((d, i) => (
            <li key={d.id + i}>
              <Link
                href="/dossiers"
                className="grid grid-cols-[28px_1.5fr_140px_1.2fr_120px_120px_100px] gap-3 px-5 py-3 items-center text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-950 transition group"
              >
                <span className="w-7 h-7 rounded-md bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-3.5 h-3.5" />
                </span>
                <span className="text-zinc-900 dark:text-zinc-100 truncate">{d.title}</span>
                {d.dossier ? <IdPill className="!text-[10px]">{d.dossier.reference}</IdPill> : <span className="text-zinc-400">—</span>}
                <span className="text-zinc-700 dark:text-zinc-300 truncate">{d.learner}</span>
                <span className="text-zinc-500 dark:text-zinc-400 truncate capitalize">{d.kind.replace('_', ' ')}</span>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full inline-flex items-center w-fit ${statusStyles[d.statusLabel] ?? 'bg-zinc-100'}`}>
                  {d.statusLabel}
                </span>
                <span className="text-[12px] font-medium text-violet-600 dark:text-violet-400 group-hover:text-violet-700 dark:group-hover:text-violet-300 transition text-right inline-flex items-center gap-1 justify-end group-hover:underline">
                  {d.statusLabel === 'À signer' ? 'Signer' : d.statusLabel === 'À transmettre' ? 'Envoyer' : 'Télécharger'}
                  {d.statusLabel === 'Généré' && <Download className="w-3 h-3" />}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="px-5 py-3 border-t border-zinc-200/60 dark:border-zinc-800 flex items-center justify-between text-[12px] text-zinc-500">
          <span>{allDocs.length} documents au total</span>
          <Link href="/dossiers" className="text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition">
            Voir par dossier →
          </Link>
        </div>
      </div>
    </div>
  );
}
