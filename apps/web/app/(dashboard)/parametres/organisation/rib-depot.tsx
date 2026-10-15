'use client';

import { useRef, useState, useTransition } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { Check, FileText, UploadCloud } from 'lucide-react';
import { removeOrgRibAction, uploadOrgRibAction } from './branding-actions';

const TYPE_DU_MIME: Record<string, 'pdf' | 'png' | 'jpg'> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' };

/** Dépôt du RIB : joint tel quel en dernière page de chaque facture. */
export function RibDepot({ depose }: { depose: 'pdf' | 'png' | 'jpg' | null }) {
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [actuel, setActuel] = useState(depose);
  const input = useRef<HTMLInputElement>(null);
  const deposer = useAction(uploadOrgRibAction);
  const retirer = useAction(removeOrgRibAction);

  const choisir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    const type = TYPE_DU_MIME[fichier.type];
    if (!type) return setErreur('Format accepté : PDF, PNG ou JPG.');
    if (fichier.size > 5 * 1024 * 1024) return setErreur('Le fichier dépasse 5 Mo.');
    const lecteur = new FileReader();
    lecteur.onload = () =>
      start(async () => {
        setErreur(null);
        const res = await deposer.executeAsync({ type, base64: String(lecteur.result).split(',')[1] ?? '' });
        if (res?.data?.ok) setActuel(type);
        else setErreur(res?.data && !res.data.ok ? res.data.error : 'Le RIB n’a pas pu être déposé.');
      });
    lecteur.readAsDataURL(fichier);
  };

  const enlever = () =>
    start(async () => {
      setErreur(null);
      const res = await retirer.executeAsync({});
      if (res?.data?.ok) setActuel(null);
      else setErreur(res?.data && !res.data.ok ? res.data.error : 'Le RIB n’a pas pu être retiré.');
    });

  return (
    <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-3 flex items-center gap-3">
      <span className="w-9 h-9 rounded-lg grid place-items-center bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300 shrink-0">
        {actuel ? <Check className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
          {actuel ? `RIB déposé (${actuel.toUpperCase()})` : 'Déposer votre RIB'}
        </p>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Joint tel quel en dernière page de chaque facture. PDF de votre banque, PNG ou JPG, 5 Mo au plus.
        </p>
        {erreur && <p className="text-[12px] text-red-600 dark:text-red-400 mt-1">{erreur}</p>}
      </div>
      <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={choisir} />
      {actuel && (
        <button
          type="button"
          onClick={enlever}
          disabled={pending}
          className="text-[12px] text-zinc-500 hover:text-red-600 px-2 h-8 rounded-lg transition disabled:opacity-50"
        >
          Retirer
        </button>
      )}
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={pending}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 shadow-sm transition disabled:opacity-50"
      >
        <UploadCloud className="w-3.5 h-3.5" />
        {pending ? 'Envoi…' : actuel ? 'Remplacer' : 'Déposer'}
      </button>
    </div>
  );
}
