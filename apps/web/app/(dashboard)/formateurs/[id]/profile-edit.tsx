'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Loader2, Save, FileText, Download } from 'lucide-react';
import { updateTrainerBio } from './profile-actions';

/** Traduit la réponse d'une route de dépôt en message lisible. */
function messageErreur(json: { error?: string; detail?: string }): string {
  switch (json.error) {
    case 'forbidden':
      return 'Réservé aux administrateurs.';
    case 'unauthenticated':
      return 'Session expirée — reconnectez-vous.';
    case 'invalid_file_type':
      return `Format non accepté${json.detail ? ` (${json.detail})` : ''}. Les photos prises sur iPhone sont souvent en HEIC : exportez-les en JPEG.`;
    case 'file_too_large':
      return 'Fichier trop lourd.';
    case 'trainer_not_found':
      return 'Formateur introuvable.';
    default:
      return `Échec de l'envoi${json.detail ? ` : ${json.detail}` : ''}.`;
  }
}


export function TrainerProfileEdit({
  trainerId,
  photoUrl,
  initials,
  bio,
  cvUrl,
}: {
  trainerId: string;
  photoUrl: string | null;
  initials: string;
  bio: string;
  /** URL signée du CV (bucket privé), null si aucun CV déposé. */
  cvUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);

  const cvInputRef = useRef<HTMLInputElement>(null);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvErr, setCvErr] = useState<string | null>(null);

  const [bioValue, setBioValue] = useState(bio);
  const [savingBio, startSaveBio] = useTransition();
  const [bioSaved, setBioSaved] = useState(false);
  const [bioErr, setBioErr] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoErr(null);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      // Les photos d'un album iPhone sont en HEIC : le dire, plutôt que de
      // laisser l'utilisateur chercher pourquoi son image est refusée.
      setPhotoErr(
        file.type === 'image/heic' || file.type === 'image/heif'
          ? 'Les photos iPhone sont en HEIC. Ouvrez-la dans Aperçu ou Photos, puis exportez-la en JPEG.'
          : `Image PNG, JPG ou WebP uniquement${file.type ? ` (reçu : ${file.type})` : ''}.`,
      );
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
      if (!json.ok) setPhotoErr(messageErreur(json));
      else router.refresh();
    } catch {
      setPhotoErr("Échec de l'envoi.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function onPickCv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCvErr(null);
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) {
      setCvErr('PDF, PNG ou JPG uniquement.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setCvErr('Fichier trop lourd (max 10 Mo).');
      return;
    }
    setCvUploading(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch(`/formateurs/${trainerId}/cv/upload`, { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.ok) setCvErr(messageErreur(json));
      else router.refresh();
    } catch {
      setCvErr("Échec de l'envoi.");
    } finally {
      setCvUploading(false);
      if (cvInputRef.current) cvInputRef.current.value = '';
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
            <span className="w-full h-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 flex items-center justify-center text-[17px] font-bold">
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

      {/* CV */}
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium mb-1.5">
          CV
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={cvInputRef} type="file" accept="application/pdf,image/png,image/jpeg" onChange={onPickCv} className="hidden" />
          <button
            type="button"
            onClick={() => cvInputRef.current?.click()}
            disabled={cvUploading}
            className="inline-flex items-center gap-2 border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-950 disabled:opacity-50 transition"
          >
            {cvUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            {cvUrl ? 'Remplacer le CV' : 'Déposer le CV'}
          </button>
          {cvUrl && (
            <a
              href={cvUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-orange-600 dark:text-orange-400 hover:underline"
            >
              <Download className="w-3.5 h-3.5" />
              Voir le CV
            </a>
          )}
        </div>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
          Preuve de compétence Qualiopi (indicateur 21). Non publié au catalogue. PDF/PNG/JPG, max 10 Mo.
        </p>
        {cvErr && <p className="text-[12px] text-red-600 mt-1">{cvErr}</p>}
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
          className="w-full rounded-lg border border-zinc-200/70 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 resize-y"
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            onClick={saveBio}
            disabled={savingBio}
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[13px] font-semibold px-3.5 h-9 rounded-lg shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 transition"
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
