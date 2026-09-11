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
  hasLogo: boolean;
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

  const upload = (kind: 'signature' | 'stamp' | 'logo') => (e: React.ChangeEvent<HTMLInputElement>) => {
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
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4">
      <div>
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Logo, signature & cachet</h2>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
          Le logo apparaît en en-tête de tous les documents ; signature et cachet sont apposés automatiquement
          (convention, attestation, certificat, facture).
        </p>
      </div>

      <label className="flex items-center gap-2 text-[13px] font-medium text-zinc-700 dark:text-zinc-300 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-3 cursor-pointer hover:border-orange-300 dark:hover:border-orange-800 hover:bg-orange-50/40 dark:hover:bg-orange-950/20 transition">
        <UploadCloud className="w-4 h-4 text-zinc-400" />
        <span>
          Logo de l&apos;organisme (PNG)
          {props.hasLogo && <Check className="inline w-3.5 h-3.5 text-emerald-500 ml-1" />}
        </span>
        <input type="file" accept="image/png" className="hidden" onChange={upload('logo')} disabled={pending} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">
          Nom du représentant
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 transition placeholder:text-zinc-400" />
        </label>
        <label className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">
          Qualité
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="mt-1.5 w-full h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 transition placeholder:text-zinc-400" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(['signature', 'stamp'] as const).map((kind) => (
          <label key={kind} className="flex items-center gap-2 text-[13px] font-medium text-zinc-700 dark:text-zinc-300 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-3 cursor-pointer hover:border-orange-300 dark:hover:border-orange-800 hover:bg-orange-50/40 dark:hover:bg-orange-950/20 transition">
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
        className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-9 rounded-lg shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 transition disabled:opacity-50">
        {saved ? 'Enregistré' : 'Enregistrer le représentant'}
      </button>
    </section>
  );
}
