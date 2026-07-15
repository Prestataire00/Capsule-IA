'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { ImagePlus, Loader2 } from 'lucide-react';
import { uploadFormationCover } from './cover-actions';

// Image de couverture d'une formation, affichée dans le catalogue.
export function FormationCover({
  formationId,
  coverUrl,
}: {
  formationId: string;
  coverUrl: string | null;
}) {
  const router = useRouter();
  const { executeAsync } = useAction(uploadFormationCover);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = String(reader.result).split(',')[1] ?? '';
      setLoading(true);
      const res = await executeAsync({ formationId, pngBase64: base64 });
      setLoading(false);
      if (res?.data?.ok) router.refresh();
      else setError("Échec de l'envoi de l'image.");
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <label className="relative block w-full aspect-[16/6] rounded-lg overflow-hidden cursor-pointer group border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="w-full h-full flex flex-col items-center justify-center gap-1 text-zinc-400 text-[12px]">
            <ImagePlus className="w-5 h-5" />
            Ajouter une image de couverture
          </span>
        )}
        <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-[12px] gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
          {coverUrl ? "Changer l'image" : ''}
        </span>
        <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={onFile} disabled={loading} />
      </label>
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
    </div>
  );
}
