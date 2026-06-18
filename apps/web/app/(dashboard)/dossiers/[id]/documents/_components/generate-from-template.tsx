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
      <p className="text-[12px] text-zinc-400">
        Aucun modèle disponible.{' '}
        <Link href="/documents/modeles" className="text-violet-600 hover:underline">
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
          className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px]"
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
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-[13px] font-medium px-4 py-2 rounded-md inline-flex items-center gap-2 shadow-sm flex-shrink-0"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
          Générer
        </button>
      </div>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
