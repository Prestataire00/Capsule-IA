'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { CATEGORIES_FRAIS, eurosEnCentimes } from '@/features/trainer-space/billing-rules';
import { JUSTIFICATION_ACCEPT } from '@/features/attendance/justification-rules';

const ERREURS: Record<string, string> = {
  invalid_payload: 'Vérifiez les champs du formulaire.',
  amount_invalid: 'Montant invalide.',
  receipt_invalid: 'Joignez le justificatif : PDF ou photo (JPG, PNG, WEBP, HEIC), 10 Mo au plus.',
  forbidden: 'Cette séance ne fait pas partie des vôtres.',
  unauthenticated: 'Session expirée — reconnectez-vous.',
};

const champ =
  'w-full text-[13px] px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100';

export function ExpenseForm({ seances }: { seances: { id: string; label: string; jour: string }[] }) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState(seances[0]?.id ?? '');
  const [date, setDate] = useState(seances[0]?.jour ?? '');
  const [categorie, setCategorie] = useState('transport');
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  if (seances.length === 0) {
    return <p className="text-[13px] text-zinc-500">Aucune séance récente à laquelle rattacher une dépense.</p>;
  }

  const envoyer = async () => {
    setErreur(null);
    setOk(false);
    if (eurosEnCentimes(montant) === null) return setErreur(ERREURS.amount_invalid ?? null);
    if (!fichier) return setErreur(ERREURS.receipt_invalid ?? null);
    setEnvoi(true);
    const corps = new FormData();
    corps.set('sessionId', sessionId);
    corps.set('expenseDate', date);
    corps.set('category', categorie);
    corps.set('label', libelle);
    corps.set('amount', montant);
    corps.set('file', fichier);
    try {
      const res = await fetch('/api/formateur/frais', { method: 'POST', body: corps });
      const r = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && r.ok) {
        setOk(true);
        setLibelle('');
        setMontant('');
        setFichier(null);
        router.refresh();
      } else setErreur(ERREURS[r.error ?? ''] ?? 'L’envoi a échoué. Réessayez.');
    } catch {
      setErreur('Connexion perdue. Réessayez.');
    }
    setEnvoi(false);
  };

  return (
    <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 p-4 space-y-3 bg-white dark:bg-zinc-900">
      <h2 className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">Nouvelle dépense</h2>
      <label className="block space-y-1">
        <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Séance</span>
        <select
          value={sessionId}
          onChange={(e) => {
            setSessionId(e.target.value);
            setDate(seances.find((s) => s.id === e.target.value)?.jour ?? date);
          }}
          className={champ}
        >
          {seances.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Nature</span>
          <select value={categorie} onChange={(e) => setCategorie(e.target.value)} className={champ}>
            {Object.entries(CATEGORIES_FRAIS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Date de la dépense</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={champ} />
        </label>
      </div>
      <div className="grid grid-cols-[1fr_140px] gap-3">
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Description</span>
          <input value={libelle} onChange={(e) => setLibelle(e.target.value)} maxLength={200} className={champ} placeholder="Ex. Train Paris – Lyon aller-retour" />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Montant TTC (€)</span>
          <input value={montant} onChange={(e) => setMontant(e.target.value)} inputMode="decimal" className={`${champ} tabular-nums`} placeholder="0,00" />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Justificatif (obligatoire)</span>
        <input type="file" accept={JUSTIFICATION_ACCEPT} onChange={(e) => setFichier(e.target.files?.[0] ?? null)} className="block text-[12px]" />
      </label>
      {erreur && <p role="alert" className="text-[13px] text-red-700 dark:text-red-300">{erreur}</p>}
      {ok && <p role="status" className="text-[13px] text-emerald-700 dark:text-emerald-400">Dépense envoyée à l’organisme.</p>}
      <button
        type="button"
        disabled={envoi || !libelle || !montant || !fichier || !date}
        onClick={() => void envoyer()}
        className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-lg shadow-sm disabled:opacity-40"
      >
        {envoi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        Envoyer la dépense
      </button>
    </section>
  );
}
