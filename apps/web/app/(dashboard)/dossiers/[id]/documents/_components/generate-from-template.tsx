'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAction } from 'next-safe-action/hooks';
import { Loader2, Wand2 } from 'lucide-react';
import { generateFromTemplate } from '../generate-actions';

export type TemplateChoice = { id: string; title: string };

export function GenerateFromTemplate({
  dossierId,
  templates,
}: {
  dossierId: string;
  templates: TemplateChoice[];
}) {
  const router = useRouter();
  const { executeAsync } = useAction(generateFromTemplate);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (templates.length === 0) {
    return (
      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
        Aucun modèle disponible.{' '}
        <Link href="/documents/modeles" className="font-semibold text-orange-600 dark:text-orange-400 hover:underline">
          Créer / importer des modèles
        </Link>
      </p>
    );
  }

  async function handleGenerate() {
    if (!templateId) return;
    setLoading(true);
    setError(null);
    const res = await executeAsync({ dossierId, templateId });
    setLoading(false);
    const out = res?.data;
    if (out?.ok) {
      router.push(`/documents/${out.documentId}/apercu`);
      return;
    }
    setError("La génération a échoué.");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="flex-1 h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 placeholder:text-zinc-400"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-[13px] font-semibold px-4 h-9 rounded-lg inline-flex items-center gap-2 transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 flex-shrink-0"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
          Générer
        </button>
      </div>
      {error && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
