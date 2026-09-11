// ARCHETYPE: command
// Justification: factures d'honoraires du formateur — préparer, déposer, suivre leur statut.

import Link from 'next/link';
import { FileText, FileUp, Receipt, Settings2 } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { libre, loadBillingProfile, profilComplet } from '@/features/trainer-space/billing';
import { CLASSES_TON, STATUT_FACTURE, formatEuros } from '@/features/trainer-space/billing-rules';

export const dynamic = 'force-dynamic';

type Facture = {
  id: string;
  organization_id: string;
  source: string;
  number: string;
  issue_date: string;
  total_cents: number;
  status: string;
  decision_note: string | null;
  pdf_path: string | null;
};

const date = (iso: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(`${iso}T12:00:00Z`));

export default async function MesFacturesPage() {
  const sb = supabaseServer();
  const [{ data: { user } }, memberships] = await Promise.all([sb.auth.getUser(), new SupabaseMembershipReader(sb as never).list()]);
  if (!user) return null;
  const [profil, { data }] = await Promise.all([
    loadBillingProfile(user.id),
    libre(sb)
      .schema('app')
      .from('trainer_invoices')
      .select('id, organization_id, source, number, issue_date, total_cents, status, decision_note, pdf_path')
      .order('created_at', { ascending: false }),
  ]);
  const factures = (data ?? []) as Facture[];
  const noms = new Map(memberships.map((m) => [m.organizationId as string, m.organizationName]));

  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Mes factures</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
            Facturez vos séances terminées : calculées d’après le tarif fixé par l’organisme, ou en déposant votre propre facture.
          </p>
        </div>
        <Link href="/profil-facturation" className="text-[12px] text-zinc-600 dark:text-zinc-300 inline-flex items-center gap-1 hover:underline flex-shrink-0">
          <Settings2 className="w-3.5 h-3.5" /> Profil de facturation
        </Link>
      </header>

      {!profilComplet(profil) && (
        <p className="text-[13px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/40 rounded-lg px-3 py-2.5">
          Complétez d’abord votre <Link href="/profil-facturation" className="underline">profil de facturation</Link> (nom, adresse, SIRET) pour générer vos factures.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-2">
        {memberships.map((m) => (
          <Link
            key={m.organizationId}
            href={`/mes-factures/nouvelle?org=${m.organizationId}`}
            className="rounded-xl border border-orange-200 dark:border-orange-900/50 bg-orange-50/40 dark:bg-orange-950/10 px-4 py-3 hover:shadow-md transition"
          >
            <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-orange-600" /> Préparer ma facture
            </span>
            <span className="block text-[12px] text-zinc-500 mt-0.5">{m.organizationName}</span>
          </Link>
        ))}
        <Link
          href="/mes-factures/deposer"
          className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 px-4 py-3 hover:shadow-md transition bg-white dark:bg-zinc-900"
        >
          <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-1.5">
            <FileUp className="w-4 h-4" /> Déposer une facture
          </span>
          <span className="block text-[12px] text-zinc-500 mt-0.5">Faite avec votre propre logiciel (PDF)</span>
        </Link>
      </div>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">Historique</h2>
        {factures.length === 0 ? (
          <p className="text-[13px] text-zinc-400 py-6 text-center">Aucune facture pour l’instant.</p>
        ) : (
          <ul className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
            {factures.map((f) => {
              const statut = STATUT_FACTURE[f.status] ?? { label: f.status, ton: 'info' as const };
              return (
                <li key={f.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        <span className="font-mono">{f.number}</span> · {noms.get(f.organization_id) ?? 'Organisme'}
                      </p>
                      <p className="text-[12px] text-zinc-500 tabular-nums">
                        {date(f.issue_date)} · {formatEuros(Number(f.total_cents))} · {f.source === 'generee' ? 'générée' : 'déposée'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {f.pdf_path && (
                        <a href={`/api/formateur/fichier/facture/${f.id}`} target="_blank" rel="noopener" className="text-[12px] text-zinc-600 dark:text-zinc-300 inline-flex items-center gap-1 hover:underline">
                          <FileText className="w-3.5 h-3.5" /> PDF
                        </a>
                      )}
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${CLASSES_TON[statut.ton]}`}>{statut.label}</span>
                    </div>
                  </div>
                  {f.decision_note && <p className="text-[12px] text-zinc-600 dark:text-zinc-400">Motif : {f.decision_note}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
