'use client';

import { useFormStatus } from 'react-dom';
import { Check, Loader2 } from 'lucide-react';

// Bouton de soumission générique avec état de chargement (useFormStatus).
export function FormSubmit({
  label,
  pendingLabel,
  className = 'bg-orange-500 hover:bg-orange-600 shadow-orange-600/30 ring-1 ring-inset ring-white/10',
}: {
  label: string;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} disabled:opacity-50 text-white text-[13px] font-semibold px-4 h-9 rounded-lg transition shadow-sm inline-flex items-center gap-2`}
    >
      {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      {pending ? pendingLabel ?? 'Enregistrement…' : label}
    </button>
  );
}
