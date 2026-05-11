// ARCHETYPE: command
// Justification: liste des documents générés du dossier avec statut signature.

import { notFound } from 'next/navigation';
import { Plus, FileText, Download, Eye, FileSignature, Sparkles } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { dossiers, documentsByDossier } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';

export default function DocumentsPage({ params }: { params: { id: string } }) {
  const dossier = dossiers.find((d) => d.id === params.id);
  if (!dossier) notFound();
  const docs = documentsByDossier[params.id] ?? [];

  return (
    <div>
      <section className="bg-gradient-to-br from-violet-50 to-violet-50/60 dark:from-violet-950/40 dark:to-violet-950/20 border border-violet-200/60 dark:border-violet-900/40 rounded-xl p-4 mb-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="w-10 h-10 rounded-lg bg-white dark:bg-zinc-900 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">Convention de formation</p>
            <p className="text-[12px] text-zinc-600 dark:text-zinc-400 mt-0.5">
              Générée automatiquement depuis les données du dossier. Conforme article L.6353-1 (Code du Travail) et Qualiopi I27.
            </p>
          </div>
        </div>
        <a
          href={`/api/dossiers/${params.id}/convention.pdf`}
          target="_blank"
          rel="noreferrer"
          className="bg-violet-600 hover:bg-violet-700 text-white text-[12px] font-medium px-3 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-1.5 flex-shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          Télécharger PDF
        </a>
      </section>

      <header className="flex items-center justify-between mb-4">
        <div>
          <SectionLabel className="mb-1">Documents</SectionLabel>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            {docs.length} document{docs.length > 1 ? 's' : ''} générés ·{' '}
            <span className="text-emerald-600">{docs.filter((d) => d.signed).length} signés</span>
          </p>
        </div>
        <button
          type="button"
          className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Générer un document
        </button>
      </header>

      <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
        {docs.map((doc) => (
          <li key={doc.id} className="grid grid-cols-[24px_1fr_140px_120px_140px] gap-3 py-3 px-1 items-center text-[13px] group">
            <FileText className="w-4 h-4 text-zinc-400" />
            <div className="min-w-0">
              <p className="text-zinc-900 dark:text-zinc-100 truncate">{doc.title}</p>
              <p className="font-mono text-[10px] text-zinc-400 mt-0.5">{doc.kind}</p>
            </div>
            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {doc.generatedAt ? format(parseISO(doc.generatedAt), 'dd/MM HH:mm', { locale: fr }) : '—'}
            </span>
            <StatusPill tone={doc.status === 'pending' ? 'neutral' : doc.status === 'failed' ? 'danger' : doc.signed ? 'success' : 'warning'}>
              {doc.status === 'pending' ? 'en attente' : doc.signed ? 'signé' : doc.signers > 0 ? `${doc.signedCount}/${doc.signers} signé` : 'à signer'}
            </StatusPill>
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
              <button type="button" aria-label="Aperçu" className="w-7 h-7 rounded text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center justify-center">
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button type="button" aria-label="Télécharger" className="w-7 h-7 rounded text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center justify-center">
                <Download className="w-3.5 h-3.5" />
              </button>
              {!doc.signed && doc.status === 'ready' && (
                <button type="button" aria-label="Demander signature" className="w-7 h-7 rounded text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center justify-center">
                  <FileSignature className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
