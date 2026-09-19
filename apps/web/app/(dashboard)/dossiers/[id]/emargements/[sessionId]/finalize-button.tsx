'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, FileText, Loader2, AlertCircle, Download } from 'lucide-react';
import { finalizeAttendanceSheet, getDocumentDownloadUrl } from './actions';
import { attendanceErrorLabel } from '@/features/attendance/schemas';

type Props = {
  sheetId: string;
  initialFinalized: boolean;
  initialDocumentId: string | null;
  ready: boolean;
  /** Participants attendus encore à traiter. */
  remaining: number;
};

export function FinalizeButton({ sheetId, initialFinalized, initialDocumentId, ready, remaining }: Props) {
  const [finalized, setFinalized] = useState(initialFinalized);
  const [documentId, setDocumentId] = useState<string | null>(initialDocumentId);
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [downloading, setDownloading] = useState(false);

  const handleFinalize = () => {
    setError(null);
    startTransition(async () => {
      const r = await finalizeAttendanceSheet({ sheetId });
      if (!r.ok) {
        setError(attendanceErrorLabel(r.error));
        return;
      }
      setFinalized(true);
      setDocumentId(r.documentId);
      setHash(r.hash);
    });
  };

  const handleDownload = async () => {
    if (!documentId) return;
    setDownloading(true);
    try {
      const r = await getDocumentDownloadUrl({ documentId });
      if (r.ok) window.open(r.url, '_blank', 'noopener,noreferrer');
      else setError(attendanceErrorLabel(r.error));
    } finally {
      setDownloading(false);
    }
  };

  if (finalized && documentId) {
    return (
      <section className="mt-6 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 rounded-lg p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[13px] font-semibold text-emerald-900 dark:text-emerald-200">
                Feuille d&apos;émargement finalisée
              </p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                Le PDF est immuable et archivé pour audit Qualiopi.
              </p>
              {hash && (
                <p className="text-[11px] font-mono text-emerald-700/70 dark:text-emerald-300/70 mt-1 break-all">
                  SHA-256: {hash.slice(0, 32)}…
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 bg-white dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[12px] font-medium px-3 py-1.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/50 transition disabled:opacity-60"
          >
            {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            Télécharger PDF
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2">
          <FileText className="w-5 h-5 text-zinc-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
              Finaliser la feuille d&apos;émargement
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {ready
                ? 'Génère le PDF signé, immuable, archivé pour audit Qualiopi.'
                : `Encore ${remaining} participant${remaining > 1 ? 's' : ''} à faire signer ou à marquer absent.`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleFinalize}
          disabled={pending || !ready}
          title={!ready ? 'Chaque participant doit avoir signé ou être marqué absent' : undefined}
          className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-[12px] font-medium px-3 py-1.5 rounded transition shrink-0"
        >
          {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
          {pending ? 'Génération PDF…' : 'Finaliser'}
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          <p className="text-[12px] text-red-900 dark:text-red-200">{error}</p>
        </div>
      )}
    </section>
  );
}
