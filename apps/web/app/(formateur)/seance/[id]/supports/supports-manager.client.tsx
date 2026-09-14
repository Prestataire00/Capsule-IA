'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload, Link2, Eye, EyeOff, Trash2, FileText, ExternalLink, RotateCcw } from 'lucide-react';
import type { SessionResource } from '@/features/trainer-space/session-resources';
import { SUPPORT_STATUS_LABELS, peutResoumettre } from '@/features/trainer-space/support-status';
import { addSupportLink, toggleSupportPublished, removeSupport, resubmitSupport } from '../actions';

const ACCEPT_ATTR =
  '.pdf,.pptx,.xlsx,.docx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg';

const ERREURS: Record<string, string> = {
  missing_file: 'Choisissez un fichier.',
  empty_file: 'Le fichier est vide.',
  file_too_large: 'Fichier trop lourd (50 Mo maximum).',
  invalid_file_type: 'Format non accepté (PDF, PPTX, XLSX, DOCX, PNG, JPEG).',
  invalid_title: 'Donnez un titre (200 caractères maximum).',
  upload_failed: "Le dépôt a échoué, réessayez.",
  insert_failed: "Le support n'a pas été enregistré.",
  forbidden: "Cette séance n'est pas la vôtre.",
  unauthenticated: 'Votre session a expiré, reconnectez-vous.',
};

const poids = (octets: number | null): string => {
  if (octets === null) return '';
  const mo = octets / (1024 * 1024);
  return mo >= 1 ? `${mo.toFixed(1)} Mo` : `${Math.max(1, Math.round(octets / 1024))} Ko`;
};

const STATUT_TON: Record<string, string> = {
  en_attente: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  valide: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  refuse: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
};

const CHAMP =
  'w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400';

export function SupportsManager({ sessionId, supports }: { sessionId: string; supports: readonly SessionResource[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<'fichier' | 'lien'>('fichier');
  const [titre, setTitre] = useState('');
  const [url, setUrl] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTitre('');
    setUrl('');
    setFichier(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const deposer = async () => {
    setErreur(null);
    if (mode === 'lien') {
      if (!titre.trim() || !url.trim()) return setErreur('Un titre et un lien sont nécessaires.');
      startTransition(async () => {
        const res = await addSupportLink({ sessionId, title: titre.trim(), url: url.trim() });
        if (!res.ok) return setErreur(res.error);
        reset();
        router.refresh();
      });
      return;
    }

    if (!fichier) return setErreur('Choisissez un fichier.');
    setEnvoi(true);
    try {
      const fd = new FormData();
      fd.append('file', fichier);
      fd.append('title', titre.trim() || fichier.name.replace(/\.[^.]+$/, ''));
      const rep = await fetch(`/seance/${sessionId}/supports/api/upload`, { method: 'POST', body: fd });
      const json = (await rep.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setErreur(ERREURS[json.error ?? ''] ?? "Le dépôt a échoué.");
        return;
      }
      reset();
      router.refresh();
    } catch {
      setErreur('Le dépôt a échoué, vérifiez votre connexion.');
    } finally {
      setEnvoi(false);
    }
  };

  const basculer = (resourceId: string, isPublished: boolean) => {
    startTransition(async () => {
      const res = await toggleSupportPublished({ sessionId, resourceId, isPublished });
      if (!res.ok) setErreur(res.error);
      router.refresh();
    });
  };

  const resoumettre = (resourceId: string) => {
    startTransition(async () => {
      const res = await resubmitSupport({ sessionId, resourceId });
      if (!res.ok) setErreur(res.error);
      router.refresh();
    });
  };

  const supprimer = (resourceId: string, titreSupport: string) => {
    if (!window.confirm(`Retirer « ${titreSupport} » ? Les participants ne le verront plus.`)) return;
    startTransition(async () => {
      const res = await removeSupport({ sessionId, resourceId });
      if (!res.ok) setErreur(res.error);
      router.refresh();
    });
  };

  const occupe = envoi || pending;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
        <div className="flex items-center gap-1 text-[13px]">
          {(['fichier', 'lien'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setErreur(null);
              }}
              className={`px-3 py-1.5 rounded-lg transition ${
                mode === m
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium'
                  : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {m === 'fichier' ? 'Déposer un fichier' : 'Ajouter un lien'}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Titre du support (ex. Diaporama module 1)"
          maxLength={200}
          className={CHAMP}
        />

        {mode === 'fichier' ? (
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTR}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFichier(f);
              setErreur(null);
              if (f && !titre) setTitre(f.name.replace(/\.[^.]+$/, '').slice(0, 200));
            }}
            className="block w-full text-[13px] text-zinc-600 dark:text-zinc-300 file:mr-3 file:h-8 file:px-3 file:rounded-lg file:border-0 file:text-[12px] file:font-medium file:bg-zinc-100 dark:file:bg-zinc-800 file:text-zinc-700 dark:file:text-zinc-200"
          />
        ) : (
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…  (vidéo, quiz, dossier partagé)"
            className={CHAMP}
          />
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            {mode === 'fichier' ? 'PDF, PPTX, XLSX, DOCX, PNG, JPEG — 50 Mo maximum.' : 'Le lien s’ouvre dans un nouvel onglet.'}
            <br />
            Votre dépôt part en validation : il devient visible une fois accepté par l’administration.
          </p>
          <button
            type="button"
            onClick={deposer}
            disabled={occupe}
            className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {occupe ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : mode === 'fichier' ? (
              <Upload className="w-3.5 h-3.5" />
            ) : (
              <Link2 className="w-3.5 h-3.5" />
            )}
            Ajouter
          </button>
        </div>

        {erreur && <p className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
      </section>

      {supports.length === 0 ? (
        <p className="text-[13px] text-zinc-400 text-center py-8">
          Aucun support pour l’instant. Déposez votre diaporama, vos exercices, vos liens.
        </p>
      ) : (
        <ul className="space-y-2">
          {supports.map((s) => (
            <li
              key={s.id}
              className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 flex items-start justify-between gap-3 flex-wrap"
            >
              <div className="min-w-0 flex items-start gap-3">
                <span
                  className={`w-8 h-8 rounded-md grid place-items-center flex-shrink-0 ${
                    s.kind === 'lien'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                  }`}
                >
                  {s.kind === 'lien' ? <Link2 className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{s.title}</p>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {s.kind === 'lien' ? 'Lien externe' : poids(s.fileSizeBytes)}
                    {!s.isPublished && ' · retiré par vous'}
                  </p>
                  <span className={`mt-1 inline-flex items-center h-5 px-1.5 rounded text-[11px] font-semibold ${STATUT_TON[s.validationStatus]}`}>
                    {SUPPORT_STATUS_LABELS[s.validationStatus]}
                  </span>
                  {s.validationStatus === 'refuse' && s.rejectionReason && (
                    <p className="text-[12px] text-red-600 dark:text-red-400 mt-1 whitespace-pre-wrap">
                      Motif : {s.rejectionReason}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-8 px-2.5 rounded-md text-[12px] inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Ouvrir
                  </a>
                )}
                {peutResoumettre(s.validationStatus) && (
                  <button
                    type="button"
                    onClick={() => resoumettre(s.id)}
                    disabled={occupe}
                    className="h-8 px-2.5 rounded-md text-[12px] font-medium inline-flex items-center gap-1.5 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 hover:bg-orange-100"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Soumettre à nouveau
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => basculer(s.id, !s.isPublished)}
                  disabled={occupe}
                  title={s.isPublished ? 'Retirer des participants' : 'Remettre aux participants'}
                  className="h-8 w-8 rounded-md grid place-items-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                >
                  {s.isPublished ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => supprimer(s.id, s.title)}
                  disabled={occupe}
                  title="Retirer"
                  className="h-8 w-8 rounded-md grid place-items-center text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
