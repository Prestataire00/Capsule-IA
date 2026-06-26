// ARCHETYPE: command
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileText, Download, BookOpen, Award, PenLine } from 'lucide-react';
import { resolveApprenantContext } from '../_lib';
import { resolveApprenantResources, logResourceAccess } from '../resources';

export const dynamic = 'force-dynamic';

const SIGNABLE_KINDS = new Set(['convention']);

type AdminDoc = {
  id: string;
  title: string;
  type: string;
  size: string;
  status: 'signed' | 'available' | 'pending';
  date: string;
  href: string | null;
  signHref: string | null;
  icon: React.ComponentType<{ className?: string }>;
};

export default async function EspaceDocumentsPage({ params }: { params: { token: string } }) {
  const ctx = await resolveApprenantContext(params.token);
  if (!ctx) return notFound();

  const resources = await resolveApprenantResources(params.token);

  if (resources) {
    await logResourceAccess({ token: params.token, targetKind: 'document', targetId: ctx.dossier.id, action: 'view' });
  }

  const adminDocs: AdminDoc[] = (resources?.documents ?? []).map((doc) => ({
    id: doc.id,
    title: doc.title,
    type: 'PDF',
    size: doc.fileSizeBytes ? `${Math.round(doc.fileSizeBytes / 1024)} Ko` : '—',
    status: doc.displayStatus,
    date: doc.generatedAt ? new Date(doc.generatedAt).toLocaleDateString('fr-FR') : 'à venir',
    href:
      doc.kind === 'convention' ||
      doc.kind === 'attestation_fin' ||
      doc.kind === 'certificat_realisation'
        ? `/api/espace/${params.token}/document/${doc.id}`
        : null,
    signHref:
      SIGNABLE_KINDS.has(doc.kind) && doc.displayStatus !== 'signed'
        ? `/espace/${params.token}/documents/${doc.id}/signer`
        : null,
    icon: doc.kind === 'attestation_fin' || doc.kind === 'certificat_realisation' ? Award : FileText,
  }));

  return (
    <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
      <header className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-950/60 dark:to-blue-950/30 text-blue-700 dark:text-blue-300 flex items-center justify-center shadow-sm">
          <FileText className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Documents</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Conventions, attestations, supports pédagogiques.
          </p>
        </div>
      </header>

      {/* Documents administratifs */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-5">
        <p className="text-[11px] uppercase tracking-wider text-violet-600 dark:text-violet-400 font-semibold mb-4">
          Documents administratifs
        </p>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 -my-1">
          {adminDocs.map((doc) => {
            const isPending = doc.status === 'pending';
            const isClickable = !isPending && doc.href !== null;
            const canSign = doc.signHref !== null;
            const Icon = doc.icon;

            const right = canSign ? (
              <span className="text-[11px] font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 px-2.5 py-1 rounded-md inline-flex items-center gap-1 flex-shrink-0">
                <PenLine className="w-3 h-3" /> Signer
              </span>
            ) : isPending ? (
              <span className="text-[10px] text-zinc-400 flex-shrink-0">en attente</span>
            ) : (
              <Download className="w-4 h-4 text-zinc-400 flex-shrink-0" />
            );

            const inner = (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      doc.status === 'signed'
                        ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : isPending
                        ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                        : 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{doc.title}</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {doc.type} · {doc.date}
                    </p>
                  </div>
                </div>
                {right}
              </>
            );

            const rowClass = 'flex items-center justify-between gap-3 px-3 py-3 -mx-3 rounded-lg transition';

            return (
              <li key={doc.id}>
                {canSign && doc.signHref ? (
                  <Link href={doc.signHref} className={`${rowClass} hover:bg-violet-50/60 dark:hover:bg-violet-950/20`}>
                    {inner}
                  </Link>
                ) : isClickable && doc.href ? (
                  <a
                    href={doc.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${rowClass} hover:bg-zinc-50 dark:hover:bg-zinc-950`}
                  >
                    {inner}
                  </a>
                ) : (
                  <div className={`${rowClass} ${isPending ? 'opacity-60' : ''}`}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Supports pédagogiques */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-3.5 h-3.5 text-violet-500" />
          <p className="text-[11px] uppercase tracking-wider text-violet-600 dark:text-violet-400 font-semibold">
            Supports & ressources par module
          </p>
        </div>

        {(resources?.supports ?? []).length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            Aucun module disponible pour le moment.
          </p>
        ) : (
          <div className="space-y-5">
            {(resources?.supports ?? []).map((mod) => (
              <div key={mod.moduleId}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-md bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 flex items-center justify-center text-[11px] font-medium">
                    {mod.modulePosition + 1}
                  </span>
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{mod.moduleTitle}</p>
                </div>
                {mod.resources.length === 0 ? (
                  <p className="text-[11px] text-zinc-400 ml-8">Aucun support disponible pour le moment.</p>
                ) : (
                  <ul className="space-y-1 ml-8">
                    {mod.resources.map((s) => (
                      <li key={s.id}>
                        <a
                          href={`/api/espace/${params.token}/resource/${s.id}`}
                          className="flex items-center justify-between gap-3 px-3 py-2 -mx-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                            <span className="text-[12px] text-zinc-900 dark:text-zinc-100 truncate">{s.title}</span>
                            {s.fileSizeBytes && (
                              <span className="text-[10px] text-zinc-400 font-mono">
                                {Math.round(s.fileSizeBytes / 1024)} Ko
                              </span>
                            )}
                          </div>
                          <Download className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
