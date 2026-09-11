'use client';

// ARCHETYPE: command — actions sur un indicateur Qualiopi : statut, dépôt et retrait de preuve.
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload, Trash2, AlertCircle, Check } from 'lucide-react';
import { setIndicatorStatus, removeProof } from './actions';
import { ORG_STATUSES, ORG_STATUS_LABELS, PROOF_MAX_BYTES, type OrgStatus } from '@/features/qualiopi/status';

const champ =
  'w-full text-[13px] px-3 py-2 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-4 focus:ring-purple-500/10 focus:border-purple-300 dark:focus:border-purple-800 placeholder:text-zinc-400 transition';

const ERREURS: Record<string, string> = {
  forbidden: 'Réservé aux personnes qui gèrent la qualité.',
  unauthenticated: 'Session expirée — reconnectez-vous.',
  file_too_large: 'Fichier trop lourd (20 Mo au maximum).',
  invalid_file_type: 'Format non accepté : PDF, image, Word, Excel, PowerPoint ou texte.',
  invalid_date: 'Date de validité invalide.',
  indicateur_inconnu: 'Indicateur introuvable.',
};

/** Statut d'auto-évaluation et note de l'organisme sur l'indicateur. */
export function IndicatorStatus({
  indicatorId,
  status,
  note,
}: {
  indicatorId: string;
  status: OrgStatus | null;
  note: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [valeur, setValeur] = useState<OrgStatus>(status ?? 'a_traiter');
  const [texte, setTexte] = useState(note ?? '');
  const [etat, setEtat] = useState<{ ok: boolean; message: string } | null>(null);

  const enregistrer = () => {
    setEtat(null);
    start(async () => {
      const res = await setIndicatorStatus({ indicatorId, status: valeur, note: texte || null });
      if (res.ok) {
        setEtat({ ok: true, message: 'Enregistré' });
        router.refresh();
      } else {
        setEtat({ ok: false, message: ERREURS[res.error] ?? res.error });
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300" htmlFor={`statut-${indicatorId}`}>
          Mon évaluation
        </label>
        <select
          id={`statut-${indicatorId}`}
          value={valeur}
          onChange={(e) => setValeur(e.target.value as OrgStatus)}
          className={`${champ} max-w-[180px]`}
        >
          {ORG_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORG_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <textarea
        rows={2}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        placeholder="Note pour l'audit : où se trouve la preuve, ce qui reste à faire…"
        className={champ}
        aria-label="Note"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={enregistrer}
          disabled={pending}
          className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-semibold px-3 h-8 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-40 inline-flex items-center gap-1.5"
        >
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Enregistrer
        </button>
        {etat && (
          <span className={`text-[12px] inline-flex items-center gap-1 ${etat.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {etat.ok ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            {etat.message}
          </span>
        )}
      </div>
    </div>
  );
}

/** Dépôt d'une preuve (fichier) rattachée à l'indicateur. */
export function ProofUpload({ indicatorId }: { indicatorId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [envoi, setEnvoi] = useState(false);
  const [titre, setTitre] = useState('');
  const [validite, setValidite] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const deposer = async (fichier: File) => {
    setErreur(null);
    if (fichier.size > PROOF_MAX_BYTES) {
      setErreur(ERREURS.file_too_large!);
      return;
    }
    setEnvoi(true);
    try {
      const fd = new FormData();
      fd.set('file', fichier);
      fd.set('indicatorId', indicatorId);
      if (titre) fd.set('title', titre);
      if (validite) fd.set('validUntil', validite);
      const res = await fetch('/api/qualiopi/proofs', { method: 'POST', body: fd });
      const json = (await res.json()) as { ok: boolean; error?: string; detail?: string };
      if (!json.ok) {
        setErreur(ERREURS[json.error ?? ''] ?? `Échec du dépôt${json.detail ? ` : ${json.detail}` : ''}.`);
      } else {
        setTitre('');
        setValidite('');
        router.refresh();
      }
    } catch {
      setErreur('Échec du dépôt.');
    } finally {
      setEnvoi(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px] gap-2">
        <input
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Intitulé de la preuve (facultatif)"
          className={champ}
          aria-label="Intitulé de la preuve"
        />
        <input
          type="date"
          value={validite}
          onChange={(e) => setValidite(e.target.value)}
          className={champ}
          aria-label="Valable jusqu'au"
          title="Valable jusqu'au (facultatif)"
        />
      </div>
      <input
        ref={input}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void deposer(f);
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={envoi}
        className="border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-[12px] font-semibold px-3 h-8 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition inline-flex items-center gap-1.5 disabled:opacity-40"
      >
        {envoi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {envoi ? 'Dépôt…' : 'Déposer une preuve'}
      </button>
      {erreur && (
        <p className="text-[12px] text-red-600 dark:text-red-400 inline-flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" /> {erreur}
        </p>
      )}
    </div>
  );
}

/** Retrait d'une preuve déposée (suppression douce, tracée). */
export function RemoveProofButton({ proofId }: { proofId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() =>
        start(async () => {
          const res = await removeProof(proofId);
          if (res.ok) router.refresh();
        })
      }
      disabled={pending}
      aria-label="Retirer la preuve"
      className="w-8 h-8 rounded-md grid place-items-center text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition disabled:opacity-40"
    >
      {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
    </button>
  );
}
