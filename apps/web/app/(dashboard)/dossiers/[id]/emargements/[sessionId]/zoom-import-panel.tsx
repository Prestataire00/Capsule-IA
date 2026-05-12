'use client';

import { useState, useTransition, useRef } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { importZoomCsv, type ImportZoomCsvResult } from './actions';

export function ZoomImportPanel({ sheetId, sessionId }: { sheetId: string; sessionId: string }) {
  const [result, setResult] = useState<ImportZoomCsvResult | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setError(null);
    setFilename(file.name);
    file
      .text()
      .then((csvContent) => {
        startTransition(async () => {
          const r = await importZoomCsv({
            sheetId,
            sessionId,
            csvContent,
            csvFilename: file.name,
          });
          if (!r.ok) {
            setError(r.error);
            setResult(null);
          } else {
            setResult(r);
          }
        });
      })
      .catch((e: unknown) => setError(`read_failed:${(e as Error).message}`));
  };

  return (
    <section className="mt-6 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">Import Zoom (distanciel)</h2>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Glissez le CSV « Participants » exporté depuis Zoom (Teams/Meet/Webex compatibles).
          </p>
        </div>
      </div>

      <label
        htmlFor="zoom-csv-upload"
        className={`block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
          pending
            ? 'border-violet-300 bg-violet-50/50 dark:bg-violet-950/20 dark:border-violet-700/40 cursor-wait'
            : 'border-zinc-300 dark:border-zinc-700 hover:border-violet-400 hover:bg-violet-50/30 dark:hover:bg-violet-950/10'
        }`}
      >
        <input
          ref={inputRef}
          id="zoom-csv-upload"
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          disabled={pending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {pending ? (
          <div className="flex items-center justify-center gap-2 text-[12px] text-violet-700 dark:text-violet-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            Import en cours…
          </div>
        ) : filename ? (
          <div className="flex items-center justify-center gap-2 text-[12px] text-zinc-700 dark:text-zinc-300">
            <FileText className="w-4 h-4" />
            <span className="font-mono">{filename}</span>
            <span className="text-zinc-400">·</span>
            <span className="text-violet-600 dark:text-violet-400 underline">Remplacer</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <Upload className="w-5 h-5" />
            <p className="text-[12px]">Cliquez ou glissez un fichier CSV</p>
          </div>
        )}
      </label>

      {error && (
        <div className="mt-3 flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          <p className="text-[12px] text-red-900 dark:text-red-200 font-mono break-all">{error}</p>
        </div>
      )}

      {result?.ok && (
        <div className="mt-3 space-y-3">
          <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 rounded-lg p-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <div className="text-[12px] text-emerald-900 dark:text-emerald-200">
              <p>
                <span className="font-semibold">{result.matched}</span> apprenant{result.matched > 1 ? 's' : ''} matché
                {result.matched > 1 ? 's' : ''} sur <span className="font-semibold">{result.totalRows}</span> lignes.
              </p>
              {result.unmatched > 0 && (
                <p className="mt-1 text-amber-700 dark:text-amber-300">
                  {result.unmatched} ligne{result.unmatched > 1 ? 's' : ''} non résolue{result.unmatched > 1 ? 's' : ''}
                  {' '}— à rattacher manuellement.
                </p>
              )}
            </div>
          </div>

          {result.unmatchedPreview.length > 0 && (
            <details className="bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200/60 dark:border-zinc-800 rounded-lg">
              <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
                Aperçu des lignes non résolues ({result.unmatchedPreview.length})
              </summary>
              <ul className="px-3 pb-3 space-y-1">
                {result.unmatchedPreview.map((u, i) => (
                  <li key={i} className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 flex gap-2">
                    <span className="w-40 truncate">{u.email ?? '—'}</span>
                    <span className="flex-1 truncate">{u.name ?? '—'}</span>
                    <span className="w-12 text-right">{u.durationMinutes} min</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
