'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Loader2, Sparkles } from 'lucide-react';
import { seedDefaultQuestionnaires } from './actions';

export function SeedQuestionnairesButton() {
  const router = useRouter();
  const { executeAsync } = useAction(seedDefaultQuestionnaires);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setMsg(null);
    const res = await executeAsync();
    setLoading(false);
    const out = res?.data;
    if (out?.ok) {
      setMsg(out.created > 0 ? `${out.created} questionnaire(s) ajouté(s).` : 'Déjà présents.');
      router.refresh();
    } else {
      setMsg("Échec de l'import.");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="text-[13px] text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 inline-flex items-center gap-2 transition"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        Importer les questionnaires Qualiopi
      </button>
      {msg && <span className="text-[12px] text-zinc-500">{msg}</span>}
    </div>
  );
}
