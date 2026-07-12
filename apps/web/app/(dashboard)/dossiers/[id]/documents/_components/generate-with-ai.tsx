'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Loader2, Sparkles, ChevronDown } from 'lucide-react';
import { generateDocumentWithAI } from '../ai-actions';
import { TEMPLATE_KINDS } from '@/app/(dashboard)/documents/modeles/schema';
import { getLegalRequirement } from '@/features/documents/legal/requirements';

const KIND_OPTIONS = TEMPLATE_KINDS.map((k) => ({ value: k, label: getLegalRequirement(k).label }));

export function GenerateWithAi({ dossierId }: { dossierId: string }) {
  const router = useRouter();
  const { executeAsync } = useAction(generateDocumentWithAI);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof TEMPLATE_KINDS)[number]>('convention');
  const [title, setTitle] = useState('');
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    if (instruction.trim().length < 5) {
      setError('Décrivez en quelques mots ce que le document doit contenir.');
      return;
    }
    setLoading(true);
    const res = await executeAsync({ dossierId, kind, title: title.trim(), instruction: instruction.trim() });
    setLoading(false);
    const out = res?.data;
    if (out?.ok) {
      router.push(`/documents/${out.documentId}/apercu`);
      return;
    }
    setError(
      out?.error === 'ai_unavailable'
        ? "L'IA n'est pas configurée (ANTHROPIC_API_KEY manquante)."
        : 'La génération a échoué.',
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[13px] text-violet-600 hover:text-violet-700 dark:text-violet-400 inline-flex items-center gap-1.5"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Générer un document avec l&apos;IA
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <div className="space-y-2 border border-zinc-200/60 dark:border-zinc-800 rounded-lg p-3">
      <div className="flex items-center gap-2">
        <label className="text-[12px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Type de document</label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as (typeof TEMPLATE_KINDS)[number])}
          className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px]"
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titre (optionnel — sinon le type sera utilisé)"
        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px]"
      />
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={3}
        placeholder="Décrivez ce que l'IA doit rédiger (ex : un protocole individuel de formation adapté à l'apprenant, mentionnant les objectifs et l'accessibilité)."
        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px]"
      />
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[12px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-[13px] font-medium px-4 py-2 rounded-md inline-flex items-center gap-2 shadow-sm"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {loading ? 'Génération…' : 'Générer'}
        </button>
      </div>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
