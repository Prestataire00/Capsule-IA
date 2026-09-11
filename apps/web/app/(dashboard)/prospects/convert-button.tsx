'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { ArrowRightCircle, AlertTriangle } from 'lucide-react';
import { convertProspect } from './actions';

export function ConvertButton({
  prospectId,
  label = 'Convertir en dossier',
  variant = 'compact',
}: {
  prospectId: string;
  label?: string;
  /** `primary` : bouton pleine largeur de la colonne d'action. */
  variant?: 'compact' | 'primary';
}) {
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
    <div className={variant === 'primary' ? 'w-full space-y-1' : 'flex flex-col items-end gap-1'}>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={
          variant === 'primary'
            ? 'w-full inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 transition disabled:opacity-50'
            : 'inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-semibold px-3 h-8 rounded-lg shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 transition disabled:opacity-50'
        }
      >
        <ArrowRightCircle className="w-3.5 h-3.5" />
        {pending ? 'Conversion…' : label}
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
