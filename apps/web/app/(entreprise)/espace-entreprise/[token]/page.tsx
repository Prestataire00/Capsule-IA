// ARCHETYPE: command
// Justification: l'espace du référent d'un client — ses dossiers, les
// documents que l'organisme lui a rendus visibles et ses factures. Lecture seule, pas de
// signature : les documents y arrivent déjà signés.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Building2, CalendarDays, Download, Eye, FileText, FolderOpen, MessageSquareWarning, PlayCircle, Receipt } from 'lucide-react';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { chargerEspaceEntreprise, facturesDuReferent, type FactureEntreprise } from '@/features/espace-entreprise/load';
import { TEMPLATE_KIND_LABELS } from '@/app/(dashboard)/documents/modeles/schema';

export const dynamic = 'force-dynamic';

const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
const date = (iso: string | null) => (iso ? jour.format(new Date(iso)) : null);
const euros = (c: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(c / 100);
const NATURE: Record<FactureEntreprise['nature'], string> = { facture: 'Facture', acompte: 'Acompte', solde: 'Facture de solde', avoir: 'Avoir' };
const STATUT: Record<FactureEntreprise['statut'], { libelle: string; ton: string }> = {
  payee: { libelle: 'Réglée', ton: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
  emise: { libelle: 'À régler', ton: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' },
  partielle: { libelle: 'Réglée en partie', ton: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' },
  en_retard: { libelle: 'En retard', ton: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300' },
};

export default async function EspaceEntreprisePage({ params }: { params: { token: string } }) {
  const lien = await verifyEntrepriseToken(params.token);
  if (!lien.ok) {
    return (
      <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 grid place-items-center px-4">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-[20px] font-semibold text-zinc-900 dark:text-zinc-100">Ce lien n’est plus valable</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            {lien.error === 'expired_token' ? 'Il a expiré.' : 'Il a été remplacé ou retiré.'} Demandez un nouveau lien à
            votre organisme de formation.
          </p>
        </div>
      </main>
    );
  }
  const [espace, factures] = await Promise.all([
    chargerEspaceEntreprise(lien.value.contactId, lien.value.organizationId),
    facturesDuReferent(lien.value.contactId, lien.value.organizationId),
  ]);
  if (!espace) notFound();
  const resteAPayer = factures.reduce((t, f) => t + f.resteCents, 0);

  const total = espace.dossiers.reduce((n, d) => n + d.documents.length, 0);

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="rounded-2xl border border-orange-100 dark:border-orange-900/40 bg-gradient-to-br from-orange-50 via-white to-white dark:from-orange-950/30 dark:via-zinc-900 dark:to-zinc-900 p-5 shadow-sm flex items-center gap-4">
          {espace.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={espace.logo} alt="" className="w-14 h-14 rounded-xl object-contain bg-white" />
          ) : (
            <span className="w-14 h-14 rounded-xl grid place-items-center bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
              <Building2 className="w-6 h-6" />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{espace.organisme} · Espace entreprise</p>
            <h1 className="text-[24px] font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">Bonjour {espace.referent}</h1>
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1">
              {espace.entreprise ? `${espace.entreprise} · ` : ''}
              <span className="tabular-nums">{total}</span> document{total > 1 ? 's' : ''} à votre disposition
            </p>
          </div>
        </header>

        {espace.dossiers.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 text-center py-12">Aucune formation en cours pour l’instant.</p>
        ) : (
          espace.dossiers.map((d) => (
            <section key={d.id} className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                  <FolderOpen className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">{d.formation ?? 'Formation'}</h2>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 flex items-center gap-2 flex-wrap">
                    <span className="font-mono">{d.reference}</span>
                    {d.debut && (
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <CalendarDays className="w-3 h-3" /> {date(d.debut)}
                        {d.fin && d.fin !== d.debut ? ` – ${date(d.fin)}` : ''}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {d.documents.length === 0 ? (
                <p className="px-5 py-4 text-[13px] text-zinc-500 dark:text-zinc-400">Pas encore de document pour cette formation.</p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {d.documents.map((doc) => (
                    <li key={doc.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                      <span className="min-w-0 flex items-center gap-3">
                        <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-[13px] text-zinc-900 dark:text-zinc-100 truncate">{doc.title}</span>
                          <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                            {TEMPLATE_KIND_LABELS[doc.kind as keyof typeof TEMPLATE_KIND_LABELS] ?? 'Document'} · {date(doc.createdAt)}
                          </span>
                        </span>
                      </span>
                      <a
                        href={
                          doc.aUnFichier
                            ? `/api/espace-entreprise/${params.token}/document/${doc.id}`
                            : `/espace-entreprise/${params.token}/document/${doc.id}`
                        }
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        {doc.aUnFichier ? <Download className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {doc.aUnFichier ? 'Télécharger' : 'Consulter'}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {d.replays.length > 0 && (
                <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800">
                  <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Replays</p>
                  <ul className="space-y-1">
                    {d.replays.map((r) => (
                      <li key={r.id}>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] text-blue-700 dark:text-blue-300 hover:underline">
                          <PlayCircle className="w-3.5 h-3.5" /> {r.titre} <span className="text-zinc-500 dark:text-zinc-400">· {r.source}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))
        )}

        {factures.length > 0 && (
          <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden" aria-labelledby="facturation">
            <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap">
              <span className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <Receipt className="w-4 h-4" />
                </span>
                <h2 id="facturation" className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Facturation</h2>
              </span>
              <span className="text-[13px] text-zinc-600 dark:text-zinc-400">
                {resteAPayer > 0 ? (
                  <>
                    Reste à payer : <strong className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{euros(resteAPayer)}</strong>
                  </>
                ) : (
                  'Tout est réglé'
                )}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
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
                        {f.resteCents > 0 && f.resteCents < f.totalCents && (
                          <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">reste {euros(f.resteCents)}</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center h-6 px-2 rounded-full text-[12px] font-medium ${STATUT[f.statut].ton}`}>{STATUT[f.statut].libelle}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <a
                          href={`/api/espace-entreprise/${params.token}/facture/${f.id}`}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        >
                          <Download className="w-3.5 h-3.5" /> PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <Link
          href={`/espace-entreprise/${params.token}/reclamation`}
          className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md px-5 py-4 flex items-center gap-3"
        >
          <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <MessageSquareWarning className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Faire une réclamation</span>
            <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">Un souci avec une formation ? Signalez-le à l’organisme.</span>
          </span>
        </Link>

        <p className="text-[11px] text-zinc-400 text-center">
          Ce lien vous est personnel. Une question ? Répondez à l’e-mail qui vous l’a transmis.
        </p>
      </div>
    </main>
  );
}
