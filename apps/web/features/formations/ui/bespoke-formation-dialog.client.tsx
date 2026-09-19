// ARCHETYPE: workflow (dialogue court : monter une formation pour un client)
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Sparkles } from 'lucide-react';
import { inputClass } from '@/shared/ui/form-field';
import { createBespokeFormation } from '@/features/formations/bespoke-actions';
import { MODALITIES, MODALITY_LABEL, type ClientKind } from '@/features/formations/bespoke';

const VIDE = { title: '', summary: '', durationHours: '7', modality: 'presentiel', priceEuros: '' };

const MESSAGES: Record<string, string> = {
  invalid_input: 'Vérifiez l’intitulé, la durée et le tarif.',
  forbidden_not_admin: 'Votre rôle ne permet pas de créer une formation.',
  client_not_found: 'Ce client est introuvable dans votre organisme.',
  migration_manquante: 'Fonction en attente de migration (0162) sur cette base.',
  unauthenticated: 'Session expirée : reconnectez-vous.',
};

export function BespokeFormationDialog({
  clientKind,
  clientId,
  clientName,
}: {
  clientKind: ClientKind;
  clientId: string;
  clientName: string;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [f, setF] = useState(VIDE);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, demarrer] = useTransition();

  const fermer = () => {
    setOuvert(false);
    setF(VIDE);
    setErreur(null);
  };

  const soumettre = () => {
    setErreur(null);
    demarrer(async () => {
      const res = await createBespokeFormation({
        clientKind,
        clientId,
        title: f.title,
        summary: f.summary,
        durationHours: Number(String(f.durationHours).replace(',', '.')),
        modality: f.modality,
        priceEuros: Number(String(f.priceEuros).replace(',', '.')),
      });
      if (!res.ok) {
        setErreur(MESSAGES[res.error] ?? 'Création impossible pour le moment.');
        return;
      }
      fermer();
      router.push(`/formations/${res.id}`);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-3 h-8 rounded-lg transition inline-flex items-center gap-1.5 shadow-sm shadow-orange-600/30"
      >
        <Plus className="w-3.5 h-3.5" /> Formation sur mesure
      </button>

      {ouvert && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-900/40 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Nouvelle formation sur mesure">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-2xl shadow-lg overflow-hidden">
            <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-zinc-200/70 dark:border-zinc-800">
              <span className="w-9 h-9 rounded-lg grid place-items-center bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 shrink-0">
                <Sparkles className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[17px] font-extrabold text-zinc-900 dark:text-zinc-100">Formation sur mesure</h2>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                  Hors catalogue, pour {clientName} · tarif que vous fixez
                </p>
              </div>
              <button type="button" onClick={fermer} aria-label="Fermer" className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 grid gap-4">
              <label className="grid gap-1.5">
                <span className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-300">Intitulé</span>
                <input
                  value={f.title}
                  onChange={(e) => setF({ ...f, title: e.target.value })}
                  placeholder="Ex. Prise de parole en public — parcours individuel"
                  className={inputClass}
                  autoFocus
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-300">
                  Besoin du client <span className="font-normal text-zinc-400">(facultatif)</span>
                </span>
                <textarea
                  value={f.summary}
                  onChange={(e) => setF({ ...f, summary: e.target.value })}
                  rows={2}
                  placeholder="Ce que le client demande, en une phrase."
                  className={inputClass}
                />
              </label>

              <div className="grid grid-cols-3 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-300">Durée (h)</span>
                  <input
                    value={f.durationHours}
                    onChange={(e) => setF({ ...f, durationHours: e.target.value })}
                    inputMode="decimal"
                    className={`${inputClass} tabular-nums`}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-300">Modalité</span>
                  <select value={f.modality} onChange={(e) => setF({ ...f, modality: e.target.value })} className={inputClass}>
                    {MODALITIES.map((m) => (
                      <option key={m} value={m}>
                        {MODALITY_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-300">Tarif HT (€)</span>
                  <input
                    value={f.priceEuros}
                    onChange={(e) => setF({ ...f, priceEuros: e.target.value })}
                    inputMode="decimal"
                    placeholder="1200"
                    className={`${inputClass} tabular-nums`}
                  />
                </label>
              </div>

              {erreur && (
                <p className="text-[13px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2">
                  {erreur}
                </p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-zinc-200/70 dark:border-zinc-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={fermer}
                className="text-[13px] font-semibold px-3 h-9 rounded-lg border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={soumettre}
                disabled={envoi || f.title.trim().length < 3 || f.priceEuros.trim() === ''}
                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:pointer-events-none text-white text-[13px] font-semibold px-4 h-9 rounded-lg transition inline-flex items-center gap-2 shadow-sm shadow-orange-600/30"
              >
                {envoi ? 'Création…' : 'Créer la formation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
