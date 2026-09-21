'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, FolderPlus, Loader2 } from 'lucide-react';
import { rattacherAuDossier, rattacherAEntreprise } from './rattacher-actions';

export type Option = { id: string; label: string };

/**
 * Rattacher depuis la fiche de la personne : c'est là qu'on constate le
 * manque — « elle a suivi cette formation, pourquoi n'apparaît-elle nulle
 * part ? » — et non depuis le dossier.
 */
export function Rattachements({
  learnerId,
  dossiersDisponibles,
  entreprises,
  entrepriseActuelle,
}: {
  learnerId: string;
  dossiersDisponibles: Option[];
  entreprises: Option[];
  entrepriseActuelle: string | null;
}) {
  const router = useRouter();
  const [dossier, setDossier] = useState('');
  const [entreprise, setEntreprise] = useState(entrepriseActuelle ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, demarrer] = useTransition();

  const champ =
    'h-9 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-400/40';
  const bouton =
    'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-orange-500 text-white text-[13px] font-medium hover:bg-orange-600 disabled:opacity-50 shadow-sm shadow-orange-600/20';

  const agir = (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) => {
    setMessage(null);
    setErreur(null);
    demarrer(async () => {
      const r = await fn();
      if (r.ok) {
        setMessage(r.message);
        setDossier('');
        router.refresh();
      } else setErreur(r.error);
    });
  };

  return (
    <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm space-y-4">
      <div>
        <p className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5 mb-1.5">
          <FolderPlus className="w-3.5 h-3.5 text-zinc-400" aria-hidden /> Rattacher à un dossier
        </p>
        {dossiersDisponibles.length === 0 ? (
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            Cet apprenant figure déjà dans tous les dossiers ouverts.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select value={dossier} onChange={(e) => setDossier(e.target.value)} className={`${champ} min-w-[240px]`}>
              <option value="">Choisir un dossier…</option>
              {dossiersDisponibles.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={envoi || !dossier}
              onClick={() => agir(() => rattacherAuDossier(learnerId, dossier))}
              className={bouton}
            >
              {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />} Rattacher
            </button>
          </div>
        )}
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">
          Il sera aussi inscrit aux séances déjà planifiées du dossier.
        </p>
      </div>

      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
        <p className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5 mb-1.5">
          <Building2 className="w-3.5 h-3.5 text-zinc-400" aria-hidden /> Rattacher à une entreprise
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={entreprise}
            onChange={(e) => setEntreprise(e.target.value)}
            className={`${champ} min-w-[240px]`}
          >
            <option value="">Aucune entreprise</option>
            {entreprises.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={envoi || entreprise === (entrepriseActuelle ?? '')}
            onClick={() => agir(() => rattacherAEntreprise(learnerId, entreprise))}
            className={bouton}
          >
            {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />} Enregistrer
          </button>
        </div>
      </div>

      {message && <p className="text-[12px] text-emerald-700 dark:text-emerald-400">{message}</p>}
      {erreur && <p className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
    </div>
  );
}
