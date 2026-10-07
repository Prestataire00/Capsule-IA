import { Download, FileText, Receipt, Tag } from 'lucide-react';
import type { FactureEntreprise } from '@/features/espace-entreprise/load';
import type { DevisEspace, PrixConvenu } from '@/features/espace-entreprise/espace-complet';
import { KpiCard } from '@/shared/ui/kpi-card';
import { BOUTON, CARTE, date, euros } from './format';

const NATURE: Record<FactureEntreprise['nature'], string> = { facture: 'Facture', acompte: 'Acompte', solde: 'Facture de solde', avoir: 'Avoir' };
const STATUT: Record<FactureEntreprise['statut'], { libelle: string; ton: string }> = {
  payee: { libelle: 'Réglée', ton: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
  emise: { libelle: 'À régler', ton: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' },
  partielle: { libelle: 'Réglée en partie', ton: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' },
  en_retard: { libelle: 'En retard', ton: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300' },
};
const STATUT_DEVIS: Record<string, { libelle: string; ton: string }> = {
  sent: { libelle: 'En attente de signature', ton: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' },
  signed: { libelle: 'Signé', ton: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
  accepted: { libelle: 'Accepté', ton: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
  refused: { libelle: 'Refusé', ton: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
  expired: { libelle: 'Expiré', ton: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
};

/** Ses devis et propositions, puis ses factures et ce qu'il reste à régler. */
export function VueFacturation({
  factures,
  devis,
  prix,
  token,
}: {
  factures: readonly FactureEntreprise[];
  devis: readonly DevisEspace[];
  prix: readonly PrixConvenu[];
  token: string;
}) {
  const reste = factures.reduce((t, f) => t + f.resteCents, 0);
  const totalConvenu = prix.reduce((t, p) => t + p.montantHtCents, 0);
  return (
    <div className="space-y-6">
      <section aria-labelledby="prix" className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 id="prix" className="text-[13px] font-medium uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">Prix convenu</h2>
          {prix.length > 1 && (
            <span className="text-[13px] text-zinc-600 dark:text-zinc-400">
              Total : <strong className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{euros(totalConvenu)} HT</strong>
            </span>
          )}
        </div>
        {prix.length === 0 ? (
          <p className={`${CARTE} px-5 py-4 text-[13px] text-zinc-500 dark:text-zinc-400`}>Le prix de votre formation n’est pas encore fixé.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {prix.map((p) => (
              <KpiCard
                key={p.dossierId}
                icon={Tag}
                accent="emerald"
                label={p.formation ?? 'Formation'}
                value={`${euros(p.montantHtCents)} HT`}
                hint={`Dossier ${p.reference} · repris par le devis et les factures`}
              />
            ))}
          </div>
        )}
      </section>

      <section className={`${CARTE} overflow-hidden`} aria-labelledby="devis">
        <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
          <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
            <FileText className="w-4 h-4" />
          </span>
          <h2 id="devis" className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Devis et propositions</h2>
        </div>
        {devis.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-zinc-500 dark:text-zinc-400">Aucun devis émis pour votre entreprise.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {devis.map((q) => {
              const s = STATUT_DEVIS[q.statut] ?? { libelle: q.statut, ton: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' };
              return (
                <li key={q.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-zinc-900 dark:text-zinc-100">
                      Devis <span className="font-mono text-[12px]">{q.reference}</span>
                      {q.objet && <span className="text-zinc-500 dark:text-zinc-400"> · {q.objet}</span>}
                    </span>
                    <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                      {q.emisLe ? `Émis le ${date(q.emisLe)}` : 'Non daté'}
                      {q.validite && q.statut === 'sent' ? ` · valable jusqu’au ${date(q.validite)}` : ''}
                    </span>
                  </span>
                  <span className="text-[13px] tabular-nums text-zinc-900 dark:text-zinc-100">{euros(q.totalCents)}</span>
                  <span className={`inline-flex items-center h-6 px-2 rounded-full text-[12px] font-medium ${s.ton}`}>{s.libelle}</span>
                  {q.aUnPdf && (
                    <a href={`/api/espace-entreprise/${token}/devis/${q.id}`} className={BOUTON}>
                      <Download className="w-3.5 h-3.5" /> PDF
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={`${CARTE} overflow-hidden`} aria-labelledby="factures">
        <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap">
          <span className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <Receipt className="w-4 h-4" />
            </span>
            <h2 id="factures" className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Factures</h2>
          </span>
          {factures.length > 0 && (
            <span className="text-[13px] text-zinc-600 dark:text-zinc-400">
              {reste > 0 ? (
                <>
                  Reste à payer : <strong className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{euros(reste)}</strong>
                </>
              ) : (
                'Tout est réglé'
              )}
            </span>
          )}
        </div>
        {factures.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-zinc-500 dark:text-zinc-400">Aucune facture pour l’instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[620px]">
              <thead>
                <tr className="text-left text-[12px] text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                  <th className="px-5 py-2.5 font-medium">Pièce</th>
                  <th className="px-3 py-2.5 font-medium">Émise le</th>
                  <th className="px-3 py-2.5 font-medium">Échéance</th>
                  <th className="px-3 py-2.5 font-medium text-right">Montant</th>
                  <th className="px-3 py-2.5 font-medium">Statut</th>
                  <th className="px-5 py-2.5" aria-label="PDF" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {factures.map((f) => (
                  <tr key={f.id}>
                    <td className="px-5 py-3">
                      <span className="block text-zinc-900 dark:text-zinc-100">
                        {NATURE[f.nature]} <span className="font-mono text-[12px]">{f.reference}</span>
                      </span>
                      <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
                        Dossier <span className="font-mono">{f.dossierReference}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">{date(f.emiseLe) ?? '—'}</td>
                    <td className="px-3 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">{date(f.echeance) ?? '—'}</td>
                    <td className="px-3 py-3 tabular-nums text-right text-zinc-900 dark:text-zinc-100">
                      {euros(f.totalCents)}
                      {f.resteCents > 0 && f.resteCents < f.totalCents && <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">reste {euros(f.resteCents)}</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center h-6 px-2 rounded-full text-[12px] font-medium ${STATUT[f.statut].ton}`}>{STATUT[f.statut].libelle}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <a href={`/api/espace-entreprise/${token}/facture/${f.id}`} className={BOUTON}>
                        <Download className="w-3.5 h-3.5" /> PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
