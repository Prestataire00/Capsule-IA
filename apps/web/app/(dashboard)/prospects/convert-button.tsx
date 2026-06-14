'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { ArrowRightCircle, AlertTriangle } from 'lucide-react';
import { convertProspect } from './actions';

export function ConvertButton({ prospectId }: { prospectId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [signals, setSignals] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { executeAsync } = useAction(convertProspect);

  const run = () =>
    start(async () => {
      setError(null);
      const res = await executeAsync({ prospectId });
      const data = res?.data;
      if (!data || data.ok === false) {
        const message = data && 'error' in data ? String(data.error) : null;
        setError(message ?? res?.serverError ?? 'conversion_failed');
        return;
      }
      setSignals(data.report.signals.map((s) => `${s.reason} : ${s.label}`));
      router.push(`/dossiers/${data.dossierId}`);
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-50"
      >
        <ArrowRightCircle className="w-3.5 h-3.5" />
        {pending ? 'Conversion…' : 'Convertir en dossier'}
      </button>
      {error && <span className="text-[11px] text-rose-600">{error}</span>}
      {signals.map((s) => (
        <span key={s} className="text-[11px] text-amber-600 inline-flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {s}
        </span>
      ))}
    </div>
  );
}
