'use client';

import { useState, useTransition } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { UploadCloud, Check } from 'lucide-react';
import { updateOrgRepresentativeAction, uploadOrgAssetAction } from './branding-actions';

export function SignatureStampSection(props: {
  representativeName: string | null;
  representativeTitle: string | null;
  hasSignature: boolean;
  hasStamp: boolean;
}) {
  const [name, setName] = useState(props.representativeName ?? '');
  const [title, setTitle] = useState(props.representativeTitle ?? '');
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const updateRep = useAction(updateOrgRepresentativeAction);
  const uploadAsset = useAction(uploadOrgAssetAction);

  const saveRep = () =>
    start(async () => {
      await updateRep.executeAsync({
        representativeName: name || null,
        representativeTitle: title || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });

  const upload = (kind: 'signature' | 'stamp') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(',')[1] ?? '';
      start(async () => {
        await uploadAsset.executeAsync({ kind, pngBase64: base64 });
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4">
      <div>
        <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Signature & cachet</h2>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
          Apposés automatiquement sur tous les documents générés (convention, attestation, facture).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-[13px] text-zinc-700 dark:text-zinc-300">
          Nom du représentant
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px]" />
        </label>
        <label className="text-[13px] text-zinc-700 dark:text-zinc-300">
          Qualité
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px]" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(['signature', 'stamp'] as const).map((kind) => (
          <label key={kind} className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950">
            <UploadCloud className="w-4 h-4 text-zinc-400" />
            <span>{kind === 'signature' ? 'Signature' : 'Cachet'} (PNG)
              {((kind === 'signature' && props.hasSignature) || (kind === 'stamp' && props.hasStamp)) && (
                <Check className="inline w-3.5 h-3.5 text-emerald-500 ml-1" />
              )}
            </span>
            <input type="file" accept="image/png" className="hidden" onChange={upload(kind)} disabled={pending} />
          </label>
        ))}
      </div>

      <button type="button" onClick={saveRep} disabled={pending}
        className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition disabled:opacity-50">
        {saved ? 'Enregistré' : 'Enregistrer le représentant'}
      </button>
    </section>
  );
}
