'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Loader2, Sparkles, X } from 'lucide-react';
import { generateTemplateWithAI } from './modeles/actions';
import { TEMPLATE_KINDS } from './modeles/schema';
import { getLegalRequirement } from '@/features/documents/legal/requirements';

const KIND_OPTIONS = TEMPLATE_KINDS.map((k) => ({ value: k, label: getLegalRequirement(k).label }));

// Génère un MODÈLE (avec variables) via l'IA depuis la bibliothèque, puis ouvre
// l'éditeur pour le voir, le modifier et ajouter des variables.
export function StandaloneGenerateButton() {
  const router = useRouter();
  const { executeAsync } = useAction(generateTemplateWithAI);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof TEMPLATE_KINDS)[number]>('attestation_fin');
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setLoading(true);
    const res = await executeAsync({ kind, instruction: instruction.trim() });
    setLoading(false);
    const out = res?.data;
    if (out?.ok) {
      router.push(`/documents/modeles/${out.templateId}`);
      return;
    }
    setError(
      out?.error === 'ai_unavailable'
        ? "L'IA n'est pas configurée (ANTHROPIC_API_KEY manquante)."
        : out?.error === 'forbidden_not_admin'
          ? 'Réservé aux administrateurs.'
          : 'La génération a échoué.',
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition inline-flex items-center gap-2 shadow-sm"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Générer avec l&apos;IA
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !loading && setOpen(false)}>
          <div
            className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200/60 dark:border-zinc-800 p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Générer un modèle avec l&apos;IA</h2>
              <button type="button" onClick={() => !loading && setOpen(false)} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
              L&apos;IA rédige un <strong>modèle avec des variables</strong> pour le type choisi. Il s&apos;ouvre ensuite dans
              l&apos;éditeur où vous pouvez le modifier et ajouter des variables pour l&apos;adapter à chaque dossier.
            </p>

            <div className="flex items-center gap-2">
              <label className="text-[12px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Type</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as (typeof TEMPLATE_KINDS)[number])}
                className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px]"
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={3}
              placeholder="Consignes optionnelles (ex : ton, clauses particulières, sections à ajouter)."
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px]"
            />

            {error && <p className="text-[12px] text-red-600">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => setOpen(false)} disabled={loading} className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-3 py-2">
                Annuler
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-[13px] font-medium px-4 py-2 rounded-md inline-flex items-center gap-2 shadow-sm"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {loading ? 'Génération…' : 'Générer le modèle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
