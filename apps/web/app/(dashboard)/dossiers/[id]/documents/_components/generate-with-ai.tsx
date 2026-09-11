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
        className="text-[13px] font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 inline-flex items-center gap-1.5"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Générer un document avec l&apos;IA
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <div className="space-y-2 bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-4">
      <div className="flex items-center gap-2">
        <label className="text-[12px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Type de document</label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as (typeof TEMPLATE_KINDS)[number])}
          className="flex-1 h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 placeholder:text-zinc-400"
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
        className="w-full h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 placeholder:text-zinc-400"
      />
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={3}
        placeholder="Décrivez ce que l'IA doit rédiger (ex : un protocole individuel de formation adapté à l'apprenant, mentionnant les objectifs et l'accessibilité)."
        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px] transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 placeholder:text-zinc-400"
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
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-[13px] font-semibold px-4 h-9 rounded-lg inline-flex items-center gap-2 transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {loading ? 'Génération…' : 'Générer'}
        </button>
      </div>
      {error && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
