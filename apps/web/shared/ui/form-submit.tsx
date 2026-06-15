'use client';

import { useFormStatus } from 'react-dom';
import { Check, Loader2 } from 'lucide-react';

// Bouton de soumission générique avec état de chargement (useFormStatus).
export function FormSubmit({
  label,
  pendingLabel,
  className = 'bg-violet-600 hover:bg-violet-700',
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
      className={`${className} disabled:opacity-50 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2`}
    >
      {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      {pending ? pendingLabel ?? 'Enregistrement…' : label}
    </button>
  );
}
