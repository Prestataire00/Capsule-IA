'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Loader2, Save } from 'lucide-react';
import { updateTrainerBio } from './profile-actions';

export function TrainerProfileEdit({
  trainerId,
  photoUrl,
  initials,
  bio,
}: {
  trainerId: string;
  photoUrl: string | null;
  initials: string;
  bio: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);

  const [bioValue, setBioValue] = useState(bio);
  const [savingBio, startSaveBio] = useTransition();
  const [bioSaved, setBioSaved] = useState(false);
  const [bioErr, setBioErr] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoErr(null);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setPhotoErr('Image PNG, JPG ou WebP uniquement.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoErr('Image trop lourde (max 2 Mo).');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch(`/formateurs/${trainerId}/photo/upload`, { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.ok) setPhotoErr(json.error === 'forbidden' ? 'Réservé aux administrateurs.' : "Échec de l'envoi.");
      else router.refresh();
    } catch {
      setPhotoErr("Échec de l'envoi.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function saveBio() {
    setBioErr(null);
    setBioSaved(false);
    startSaveBio(async () => {
      const res = await updateTrainerBio(trainerId, bioValue);
      if (res.ok) {
        setBioSaved(true);
        router.refresh();
      } else {
        setBioErr("L'enregistrement a échoué.");
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Photo */}
      <div className="flex items-center gap-4">
        <span className="relative w-16 h-16 rounded-full overflow-hidden flex-shrink-0 shadow-sm">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="w-full h-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center justify-center text-[18px] font-medium">
              {initials}
            </span>
          )}
        </span>
        <div>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPick} className="hidden" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-950 disabled:opacity-50 transition"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            {photoUrl ? 'Changer la photo' : 'Ajouter une photo'}
          </button>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">Affichée dans la liste des formateurs. PNG/JPG/WebP, max 2 Mo.</p>
          {photoErr && <p className="text-[12px] text-red-600 mt-1">{photoErr}</p>}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium mb-1.5">
          Description
        </label>
        <textarea
          value={bioValue}
          onChange={(e) => {
            setBioValue(e.target.value);
            setBioSaved(false);
          }}
          rows={4}
          placeholder="Parcours, spécialités, expérience du formateur…"
          className="w-full rounded-lg border border-zinc-200/70 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-y"
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            onClick={saveBio}
            disabled={savingBio}
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-[13px] font-medium px-3.5 py-1.5 rounded-md shadow-sm transition"
          >
            {savingBio ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Enregistrer
          </button>
          {bioSaved && <span className="text-[12px] text-emerald-600 dark:text-emerald-400">Enregistré.</span>}
          {bioErr && <span className="text-[12px] text-red-600">{bioErr}</span>}
        </div>
      </div>
    </div>
  );
}
