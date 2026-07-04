'use client';

import { useState } from 'react';
import { Upload, Plus, Link2, Loader2 } from 'lucide-react';
import { uploadStandaloneDocument, attachDocumentToDossier } from './actions';

const KIND_OPTIONS = [
  { value: 'autre', label: 'Autre' },
  { value: 'convention', label: 'Convention' },
  { value: 'devis', label: 'Devis' },
  { value: 'facture', label: 'Facture' },
  { value: 'attestation_fin', label: 'Attestation de fin' },
  { value: 'certificat_realisation', label: 'Certificat de réalisation' },
  { value: 'reglement_interieur', label: 'Règlement intérieur' },
  { value: 'livret_accueil', label: "Livret d'accueil" },
  { value: 'programme', label: 'Programme' },
  { value: 'questionnaire', label: 'Questionnaire' },
];

const inputCls =
  'w-full bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-orange-300 dark:focus:border-orange-700';

export function DocumentUploadButton() {
  const [pending, setPending] = useState(false);
  return (
    <details className="relative">
      <summary className="list-none cursor-pointer bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2">
        <Plus className="w-3.5 h-3.5" /> Téléverser un document
      </summary>
      <form
        action={uploadStandaloneDocument}
        onSubmit={() => setPending(true)}
        className="absolute right-0 z-20 mt-2 w-96 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-lg p-4 space-y-3 text-left"
      >
        <p className="text-[11px] tracking-wider uppercase text-zinc-400 font-semibold">Document libre (sans dossier)</p>
        <label className="block">
          <span className="text-[12px] text-zinc-600 dark:text-zinc-300 block mb-1">Titre *</span>
          <input type="text" name="title" required placeholder="Ex : Règlement intérieur 2026" className={inputCls} />
        </label>
        <label className="block">
          <span className="text-[12px] text-zinc-600 dark:text-zinc-300 block mb-1">Type</span>
          <select name="kind" defaultValue="autre" className={inputCls}>
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[12px] text-zinc-600 dark:text-zinc-300 block mb-1">Fichier *</span>
          <input
            type="file"
            name="file"
            required
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
            className="block w-full text-[12px] text-zinc-500 file:mr-3 file:rounded-md file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-orange-700 hover:file:bg-orange-100 dark:file:bg-orange-950/40 dark:file:text-orange-300"
          />
          <span className="text-[11px] text-zinc-400 mt-1 block">PDF, image, Word, Excel — 20 Mo max.</span>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="w-full inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[13px] font-medium px-3 py-2 rounded-lg"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Téléverser
        </button>
      </form>
    </details>
  );
}

export type DossierOption = { id: string; reference: string; learner: string | null };

export function AttachToDossier({
  documentId,
  dossiers,
}: {
  documentId: string;
  dossiers: DossierOption[];
}) {
  const [pending, setPending] = useState(false);
  return (
    <form action={attachDocumentToDossier} onSubmit={() => setPending(true)} className="flex items-center gap-1.5">
      <input type="hidden" name="documentId" value={documentId} />
      <select
        name="dossierId"
        defaultValue=""
        required
        className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-2 py-1 text-[11px] max-w-[150px] focus:outline-none"
      >
        <option value="" disabled>
          Rattacher à…
        </option>
        {dossiers.map((d) => (
          <option key={d.id} value={d.id}>
            {d.reference}
            {d.learner ? ` · ${d.learner}` : ''}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        title="Rattacher à ce dossier"
        className="text-[11px] text-orange-600 hover:text-orange-700 inline-flex items-center gap-0.5 disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
      </button>
    </form>
  );
}
