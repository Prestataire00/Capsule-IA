// ARCHETYPE: command
// Justification: notes de frais du formateur — déclarer avec justificatif, suivre la validation et le remboursement.

import { Paperclip } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { libre } from '@/features/trainer-space/billing';
import { CATEGORIES_FRAIS, CLASSES_TON, STATUT_FRAIS, formatEuros } from '@/features/trainer-space/billing-rules';
import { dayKey, jourLong } from '@/features/trainer-space/dates';
import { loadSessionsByIds, mySessionIds } from '@/features/trainer-space/my-sessions';
import { ExpenseForm } from './expense-form';

export const dynamic = 'force-dynamic';

const JOUR_MS = 24 * 60 * 60 * 1000;

type Frais = {
  id: string;
  organization_id: string;
  expense_date: string;
  category: string;
  label: string;
  amount_cents: number;
  status: string;
  decision_note: string | null;
  receipt_name: string;
};

const date = (iso: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(`${iso}T12:00:00Z`));

export default async function MesFraisPage() {
  const sb = supabaseServer();
  const [memberships, ids, { data }] = await Promise.all([
    new SupabaseMembershipReader(sb as never).list(),
    mySessionIds(sb),
    libre(sb)
      .schema('app')
      .from('trainer_expenses')
      .select('id, organization_id, expense_date, category, label, amount_cents, status, decision_note, receipt_name')
      .order('expense_date', { ascending: false }),
  ]);
  const now = Date.now();
  const seances = (await loadSessionsByIds(sb, ids, { from: new Date(now - 120 * JOUR_MS), to: new Date(now + 14 * JOUR_MS) }))
    .filter((s) => s.status !== 'cancelled')
    .reverse();
  const noms = new Map(memberships.map((m) => [m.organizationId as string, m.organizationName]));
  const frais = (data ?? []) as Frais[];

  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Mes frais</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Déclarez vos dépenses liées à une séance, justificatif à l’appui : l’organisme les valide puis vous rembourse.
        </p>
      </header>

      <ExpenseForm
        seances={seances.map((s) => ({
          id: s.id,
          label: `${jourLong(s.startsAt)} — ${s.title}${memberships.length > 1 ? ` (${noms.get(s.organizationId) ?? ''})` : ''}`,
          jour: dayKey(s.startsAt),
        }))}
      />

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">Historique</h2>
        {frais.length === 0 ? (
          <p className="text-[13px] text-zinc-400 py-6 text-center">Aucune note de frais pour l’instant.</p>
        ) : (
          <ul className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
            {frais.map((f) => {
              const statut = STATUT_FRAIS[f.status] ?? { label: f.status, ton: 'info' as const };
              return (
                <li key={f.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {CATEGORIES_FRAIS[f.category] ?? f.category} · {f.label}
                      </p>
                      <p className="text-[12px] text-zinc-500 tabular-nums">
                        {date(f.expense_date)} · {formatEuros(Number(f.amount_cents))}
                        {memberships.length > 1 ? ` · ${noms.get(f.organization_id) ?? ''}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a href={`/api/formateur/fichier/frais/${f.id}`} target="_blank" rel="noopener" className="text-[12px] text-zinc-600 dark:text-zinc-300 inline-flex items-center gap-1 hover:underline" title={f.receipt_name}>
                        <Paperclip className="w-3.5 h-3.5" /> Justificatif
                      </a>
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
