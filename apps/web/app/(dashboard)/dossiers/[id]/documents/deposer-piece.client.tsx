'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Paperclip, Upload } from 'lucide-react';

/**
 * Dépôt d'une pièce dans le dossier : le fichier, son type, et l'indicateur
 * Qualiopi qu'il justifie le cas échéant.
 *
 * Envoi direct à une route dédiée : une Server Action plafonne à 5 Mo, et une
 * attestation scannée les dépasse vite.
 */
export function DeposerPiece({
  dossierId,
  types,
  indicateurs,
}: {
  dossierId: string;
  types: { valeur: string; label: string }[];
  indicateurs: { id: string; numero: number; libelle: string }[];
}) {
  const router = useRouter();
  const champFichier = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [kind, setKind] = useState('autre');
  const [titre, setTitre] = useState('');
  const [indicateur, setIndicateur] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const ERREURS: Record<string, string> = {
    file_too_large: 'Fichier trop lourd (20 Mo maximum).',
    invalid_file_type: 'Ce type de fichier n’est pas accepté (PDF, image, Word, Excel, PowerPoint, texte).',
    missing_file: 'Choisissez un fichier.',
    forbidden: 'Votre rôle ne permet pas de déposer une pièce.',
    upload_failed: 'Le dépôt a échoué. Réessayez.',
    db_failed: 'La pièce n’a pas pu être enregistrée.',
  };

  const deposer = async () => {
    if (!fichier) {
      setErreur('Choisissez un fichier.');
      return;
    }
    setErreur(null);
    setMessage(null);
    setEnvoi(true);
    try {
      const fd = new FormData();
      fd.set('file', fichier);
      fd.set('kind', kind);
      fd.set('title', titre);
      if (indicateur) fd.set('indicatorId', indicateur);
      const r = await fetch(`/api/dossiers/${dossierId}/documents/upload`, { method: 'POST', body: fd });
      const corps = (await r.json()) as { ok: boolean; error?: string; indicateurRattache?: boolean };
      if (!corps.ok) {
        setErreur(ERREURS[corps.error ?? ''] ?? 'Le dépôt a échoué.');
        return;
      }
      setMessage(
        corps.indicateurRattache
          ? 'Pièce déposée et rattachée à l’indicateur Qualiopi.'
          : 'Pièce déposée.',
      );
      setFichier(null);
      setTitre('');
      setIndicateur('');
      if (champFichier.current) champFichier.current.value = '';
      router.refresh();
    } catch {
      setErreur('Le dépôt a échoué. Vérifiez votre connexion.');
    } finally {
      setEnvoi(false);
    }
  };

  const champ =
    'w-full h-9 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-400/40';

  return (
    <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
      <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2 mb-1">
        <Paperclip className="w-4 h-4 text-zinc-400" aria-hidden /> Déposer une pièce
      </p>
      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-4">
        Tout document reçu du client ou d’un financeur. Précisez son type — et l’indicateur Qualiopi qu’il justifie,
        s’il en justifie un.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 sm:col-span-2">
          Fichier
          <input
            ref={champFichier}
            type="file"
            onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.pptx,.txt"
            className="mt-1 block w-full text-[13px] file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border-0 file:bg-zinc-100 dark:file:bg-zinc-800 file:text-[13px] file:font-medium file:text-zinc-700 dark:file:text-zinc-300"
          />
        </label>

        <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
          De quel document s’agit-il ?
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${champ} mt-1`}>
            {types.map((t) => (
              <option key={t.valeur} value={t.valeur}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
          Intitulé <span className="font-normal text-zinc-400">(facultatif)</span>
          <input
            type="text"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder={fichier?.name ?? 'Nom du fichier'}
            maxLength={200}
            className={`${champ} mt-1`}
          />
        </label>

        {indicateurs.length > 0 && (
          <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 sm:col-span-2">
            Justifie l’indicateur Qualiopi <span className="font-normal text-zinc-400">(facultatif)</span>
            <select value={indicateur} onChange={(e) => setIndicateur(e.target.value)} className={`${champ} mt-1`}>
              <option value="">Aucun</option>
              {indicateurs.map((i) => (
                <option key={i.id} value={i.id}>
                  Indicateur {i.numero} — {i.libelle}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {erreur && <p className="text-[12px] text-red-600 dark:text-red-400 mt-3">{erreur}</p>}
      {message && <p className="text-[12px] text-emerald-700 dark:text-emerald-400 mt-3">{message}</p>}

      <button
        type="button"
        onClick={deposer}
        disabled={envoi || !fichier}
        className="mt-4 inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-orange-500 text-white text-[13px] font-medium hover:bg-orange-600 disabled:opacity-50 shadow-sm shadow-orange-600/20"
      >
        {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Déposer
      </button>
    </div>
  );
}
