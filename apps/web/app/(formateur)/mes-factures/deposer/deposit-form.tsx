'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload } from 'lucide-react';
import { eurosEnCentimes, formatEuros } from '@/features/trainer-space/billing-rules';

export type OrganismeDepot = { id: string; nom: string; seances: { id: string; label: string; attenduCents: number | null }[] };

const ERREURS: Record<string, string> = {
  invalid_payload: 'Vérifiez les champs du formulaire.',
  sessions_invalid: 'Choisissez au moins une séance terminée, pas encore facturée.',
  amount_invalid: 'Montant invalide.',
  number_used: 'Vous avez déjà une facture portant ce numéro.',
  file_invalid: 'Joignez la facture au format PDF (10 Mo au plus).',
  forbidden: 'Vous n’êtes pas formateur actif de cet organisme.',
  unauthenticated: 'Session expirée — reconnectez-vous.',
};

const champ =
  'w-full text-[13px] px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100';

export function DepositInvoiceForm({ organismes, aujourdhui }: { organismes: OrganismeDepot[]; aujourdhui: string }) {
  const router = useRouter();
  const [orgId, setOrgId] = useState(organismes[0]?.id ?? '');
  const [choisies, setChoisies] = useState<string[]>([]);
  const [numero, setNumero] = useState('');
  const [date, setDate] = useState(aujourdhui);
  const [ht, setHt] = useState('');
  const [tva, setTva] = useState('0');
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const organisme = organismes.find((o) => o.id === orgId);
  const attendu = useMemo(() => {
    const s = organisme?.seances.filter((x) => choisies.includes(x.id)) ?? [];
    return s.length && s.every((x) => x.attenduCents !== null) ? s.reduce((t, x) => t + (x.attenduCents ?? 0), 0) : null;
  }, [organisme, choisies]);

  if (organismes.length === 0) return <p className="text-[13px] text-zinc-500">Aucun organisme actif.</p>;

  const envoyer = async () => {
    setErreur(null);
    if (!fichier) return setErreur(ERREURS.file_invalid ?? null);
    if (eurosEnCentimes(ht) === null || eurosEnCentimes(tva || '0') === null) return setErreur(ERREURS.amount_invalid ?? null);
    setEnvoi(true);
    const corps = new FormData();
    corps.set('organizationId', orgId);
    corps.set('sessionIds', JSON.stringify(choisies));
    corps.set('number', numero);
    corps.set('issueDate', date);
    corps.set('subtotal', ht);
    corps.set('vat', tva || '0');
    corps.set('file', fichier);
    try {
      const res = await fetch('/api/formateur/factures', { method: 'POST', body: corps });
      const r = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && r.ok) {
        router.push('/mes-factures');
        router.refresh();
        return;
      }
      setErreur(ERREURS[r.error ?? ''] ?? 'Le dépôt a échoué. Réessayez.');
    } catch {
      setErreur('Connexion perdue. Réessayez.');
    }
    setEnvoi(false);
  };

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Organisme</span>
        <select
          value={orgId}
          onChange={(e) => {
            setOrgId(e.target.value);
            setChoisies([]);
          }}
          className={champ}
        >
          {organismes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nom}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-1.5">
        <legend className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">Séances facturées</legend>
        {organisme?.seances.length ? (
          organisme.seances.map((s) => (
            <label key={s.id} className="flex items-start gap-2 text-[13px] text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={choisies.includes(s.id)}
                onChange={(e) => setChoisies((c) => (e.target.checked ? [...c, s.id] : c.filter((x) => x !== s.id)))}
              />
              {s.label}
            </label>
          ))
        ) : (
          <p className="text-[12px] text-zinc-500">Aucune séance terminée à facturer pour cet organisme.</p>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">N° de votre facture</span>
          <input value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={40} className={`${champ} font-mono`} />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={champ} />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Montant HT (€)</span>
          <input value={ht} onChange={(e) => setHt(e.target.value)} inputMode="decimal" className={`${champ} tabular-nums`} placeholder="0,00" />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">TVA (€)</span>
          <input value={tva} onChange={(e) => setTva(e.target.value)} inputMode="decimal" className={`${champ} tabular-nums`} />
        </label>
      </div>
      {attendu !== null && (
        <p className="text-[12px] text-zinc-500 tabular-nums">Montant attendu d’après votre tarif : {formatEuros(attendu)} HT.</p>
      )}

      <label className="block space-y-1">
        <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Facture (PDF, 10 Mo au plus)</span>
        <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} className="block text-[12px]" />
      </label>

      {erreur && <p role="alert" className="text-[13px] text-red-700 dark:text-red-300">{erreur}</p>}
      <button
        type="button"
        disabled={envoi || !numero || !ht || choisies.length === 0 || !fichier}
        onClick={() => void envoyer()}
        className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-lg shadow-sm disabled:opacity-40"
      >
        {envoi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        Envoyer la facture
      </button>
    </div>
  );
}
