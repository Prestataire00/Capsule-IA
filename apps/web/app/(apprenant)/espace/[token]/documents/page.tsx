// ARCHETYPE: command
import { notFound } from 'next/navigation';
import { FileText, Download, BookOpen, Award } from 'lucide-react';
import { resolveApprenantContext, MOCK_SUPPORTS_BY_MODULE } from '../_lib';

export const dynamic = 'force-dynamic';

type AdminDoc = {
  id: string;
  title: string;
  type: string;
  size: string;
  status: 'signed' | 'available' | 'pending';
  date: string;
  href: string | null;
  icon: React.ComponentType<{ className?: string }>;
};

function buildAdminDocs(dossierId: string, dossierStatus: string, isReal: boolean): AdminDoc[] {
  const dossierCompleted = dossierStatus === 'completed' || dossierStatus === 'closed';

  const conventionHref = isReal ? `/api/dossiers/${dossierId}/convention.pdf` : null;
  const attestationHref = isReal && dossierCompleted ? `/api/dossiers/${dossierId}/attestation.pdf` : null;
  const certificatHref = isReal && dossierCompleted ? `/api/dossiers/${dossierId}/certificat.pdf` : null;

  return [
    {
      id: 'doc-convention',
      title: 'Convention de formation signée',
      type: 'PDF',
      size: '—',
      status: 'signed',
      date: 'à la signature',
      href: conventionHref,
      icon: FileText,
    },
    {
      id: 'doc-programme',
      title: 'Programme détaillé',
      type: 'PDF',
      size: '—',
      status: 'available',
      date: 'à la souscription',
      href: null,
      icon: FileText,
    },
    {
      id: 'doc-accueil',
      title: "Livret d'accueil",
      type: 'PDF',
      size: '—',
      status: 'available',
      date: 'à la souscription',
      href: null,
      icon: FileText,
    },
    {
      id: 'doc-reglement',
      title: 'Règlement intérieur',
      type: 'PDF',
      size: '—',
      status: 'available',
      date: 'à la souscription',
      href: null,
      icon: FileText,
    },
    {
      id: 'doc-attestation',
      title: 'Attestation de réalisation',
      type: 'PDF',
      size: '—',
      status: dossierCompleted ? 'available' : 'pending',
      date: dossierCompleted ? 'disponible' : 'à la fin de la formation',
      href: attestationHref,
      icon: Award,
    },
    {
      id: 'doc-certificat',
      title: 'Certificat de réalisation',
      type: 'PDF',
      size: '—',
      status: dossierCompleted ? 'available' : 'pending',
      date: dossierCompleted ? 'disponible' : 'à la fin de la formation',
      href: certificatHref,
      icon: Award,
    },
  ];
}

export default async function EspaceDocumentsPage({ params }: { params: { token: string } }) {
  const ctx = await resolveApprenantContext(params.token);
  if (!ctx) return notFound();

  const adminDocs = buildAdminDocs(ctx.dossier.id, ctx.dossier.status, ctx.isReal);

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
            const Icon = doc.icon;

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
                {isPending ? (
                  <span className="text-[10px] text-zinc-400 flex-shrink-0">en attente</span>
                ) : (
                  <Download className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                )}
              </>
            );

            return (
              <li key={doc.id}>
                {isClickable && doc.href ? (
                  <a
                    href={doc.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 px-3 py-3 -mx-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
                  >
                    {inner}
                  </a>
                ) : (
                  <div
                    className={`flex items-center justify-between gap-3 px-3 py-3 -mx-3 rounded-lg ${
                      isPending ? 'opacity-60' : ''
                    }`}
                  >
                    {inner}
                  </div>
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

        {ctx.modules.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            Aucun module disponible pour le moment.
          </p>
        ) : (
          <div className="space-y-5">
            {ctx.modules.map((mod) => {
              const supports = MOCK_SUPPORTS_BY_MODULE[mod.id] ?? [];
              return (
                <div key={mod.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-md bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 flex items-center justify-center text-[11px] font-medium">
                      {mod.position + 1}
                    </span>
                    <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{mod.title}</p>
                    <span className="text-[10px] text-zinc-400 font-mono">{mod.durationHours} h</span>
                  </div>
                  {supports.length === 0 ? (
                    <p className="text-[11px] text-zinc-400 ml-8">Aucun support disponible pour le moment.</p>
                  ) : (
                    <ul className="space-y-1 ml-8">
                      {supports.map((s, i) => (
                        <li key={i}>
                          <a
                            href="#"
                            className="flex items-center justify-between gap-3 px-3 py-2 -mx-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                              <span className="text-[12px] text-zinc-900 dark:text-zinc-100 truncate">{s.title}</span>
                              <span className="text-[10px] text-zinc-400 font-mono">
                                {s.type} · {s.size}
                              </span>
                            </div>
                            <Download className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
