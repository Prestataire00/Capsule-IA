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
        className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-4 h-10 inline-flex items-center gap-2 transition"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        Importer les questionnaires Qualiopi
      </button>
      {msg && <span className="text-[12px] text-zinc-500">{msg}</span>}
    </div>
  );
}
