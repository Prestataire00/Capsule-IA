'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2, FileText, ArrowRight } from 'lucide-react';
import { generateTrainerContract } from './contract-actions';

const ERRORS: Record<string, string> = {
  ai_unavailable: 'Génération IA indisponible (clé API non configurée).',
  generation_failed: 'La génération a échoué, réessayez.',
  trainer_not_found: 'Formateur introuvable.',
  document_create_failed: 'Enregistrement du contrat impossible.',
};

export function ContractGenerate({
  trainerId,
  existingDocumentId,
}: {
  trainerId: string;
  existingDocumentId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function generate() {
    setError(null);
    start(async () => {
      const res = await generateTrainerContract(trainerId);
      if (res.ok) {
        router.push(`/documents/${res.documentId}/apercu`);
      } else {
        setError(ERRORS[res.error] ?? 'Une erreur est survenue.');
      }
    });
  }

  return (
    <div className="space-y-3">
      {existingDocumentId && (
        <a
          href={`/documents/${existingDocumentId}/apercu`}
          className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200/60 dark:border-zinc-800 px-3 py-2.5 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
        >
          <span className="inline-flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
            <FileText className="w-4 h-4 text-violet-500" />
            Contrat généré — voir / envoyer en signature
          </span>
          <ArrowRight className="w-4 h-4 text-zinc-400" />
        </a>
      )}

      <button
        type="button"
        onClick={generate}
        disabled={pending}
        className="w-full inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-[13px] font-medium px-4 py-2.5 rounded-lg shadow-sm transition"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {existingDocumentId ? 'Régénérer le contrat (IA)' : 'Générer le contrat (IA)'}
      </button>

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
        Contrat de sous-traitance rédigé à partir de l&apos;identité de l&apos;organisme et du formateur, à
        relire avant envoi. Tarif, dates et mission précise restent à compléter.
      </p>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
