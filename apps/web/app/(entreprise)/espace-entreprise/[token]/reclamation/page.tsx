// ARCHETYPE: workflow
// Justification: le référent d'un client dépose une réclamation (Qualiopi,
// indicateur 31) — c'est l'entreprise qui la fait, plus le stagiaire.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Check, MessageSquareWarning } from 'lucide-react';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { chargerEspaceEntreprise } from '@/features/espace-entreprise/load';
import { CATEGORY_LABELS, COMPLAINT_CATEGORIES } from '@/features/complaints/categories';
import { deposerReclamationEntreprise } from './actions';

export const dynamic = 'force-dynamic';

const champ =
  'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40';

export default async function ReclamationEntreprisePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { erreur?: string; envoyee?: string };
}) {
  const lien = await verifyEntrepriseToken(params.token);
  if (!lien.ok) notFound();
  const espace = await chargerEspaceEntreprise(lien.value.contactId, lien.value.organizationId);
  if (!espace) notFound();
  const retour = `/espace-entreprise/${params.token}`;

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <Link href={retour} className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5" /> Retour à l’espace entreprise
        </Link>

        {searchParams.envoyee ? (
          <section className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-white dark:bg-zinc-900 shadow-sm p-6 text-center space-y-2">
            <span className="mx-auto w-10 h-10 rounded-full grid place-items-center bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <Check className="w-5 h-5" />
            </span>
            <h1 className="text-[20px] font-semibold text-zinc-900 dark:text-zinc-100">Réclamation transmise</h1>
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
              Référence <span className="font-mono">{searchParams.envoyee}</span>. {espace.organisme} vous répondra par e-mail.
            </p>
          </section>
        ) : (
          <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-6 space-y-5">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                <MessageSquareWarning className="w-4 h-4" />
              </span>
              <div>
                <h1 className="text-[20px] font-semibold text-zinc-900 dark:text-zinc-100">Faire une réclamation</h1>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
                  Un souci avec une formation, pour vous ou l’un de vos stagiaires ? Décrivez-le : {espace.organisme} la traite et vous
                  répond par e-mail.
                </p>
              </div>
            </div>

            {searchParams.erreur && (
              <p className="rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-[13px] px-3 py-2">{searchParams.erreur}</p>
            )}

            <form action={deposerReclamationEntreprise} className="space-y-4">
              <input type="hidden" name="token" value={params.token} />
              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Formation concernée</span>
                <select name="dossierId" defaultValue={espace.dossiers.length === 1 ? espace.dossiers[0]?.id : ''} className={champ}>
                  <option value="">Aucune en particulier</option>
                  {espace.dossiers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.formation ?? 'Formation'} · {d.reference}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Sujet</span>
                <select name="category" required defaultValue="pedagogie" className={champ}>
                  {COMPLAINT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Objet</span>
                <input name="subject" required minLength={3} maxLength={200} className={champ} />
              </label>
              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Description</span>
                <textarea name="description" required minLength={10} maxLength={5000} rows={6} className={champ} />
              </label>
              <button
                type="submit"
                className="h-10 px-5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium shadow-sm"
              >
                Envoyer la réclamation
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
