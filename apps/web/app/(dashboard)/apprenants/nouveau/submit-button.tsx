'use client';

import { useFormStatus } from 'react-dom';
import { Check, Loader2 } from 'lucide-react';

export function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
    >
      {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      {pending ? 'Création…' : "Créer l'apprenant"}
    </button>
  );
}
