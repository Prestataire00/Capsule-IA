// ARCHETYPE: command
// Justification: factures d'honoraires et notes de frais des formateurs — contrôle, validation, paiement.

import Link from 'next/link';
import { ArrowLeft, FileText, Paperclip } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { canManageSection, requireAccess } from '@/shared/lib/auth/require-access';
import { libre } from '@/features/trainer-space/billing';
import { CATEGORIES_FRAIS, CLASSES_TON, STATUT_FACTURE, STATUT_FRAIS, formatEuros } from '@/features/trainer-space/billing-rules';
import { jourLong } from '@/features/trainer-space/dates';
import { loadSessionsByIds } from '@/features/trainer-space/my-sessions';
import { BillingDecision } from './billing-decision';

export const dynamic = 'force-dynamic';

type Facture = {
  id: string;
  trainer_id: string;
  source: string;
  number: string;
  issue_date: string;
  due_date: string | null;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  expected_subtotal_cents: number | null;
  status: string;
  decision_note: string | null;
  pdf_path: string | null;
  issuer_snapshot: { iban?: string | null; bic?: string | null; legal_name?: string | null };
};
type Frais = {
  id: string;
  trainer_id: string;
  session_id: string;
  expense_date: string;
  category: string;
  label: string;
  amount_cents: number;
  status: string;
  decision_note: string | null;
};

const ORDRE: Record<string, number> = { soumise: 0, validee: 1, refusee: 3, payee: 2, remboursee: 2 };
const date = (iso: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(`${iso}T12:00:00Z`));

export default async function FacturationFormateursPage({ searchParams }: { searchParams: { formateur?: string } }) {
  await requireAccess('billing', 'read');
  const gerer = await canManageSection('billing');
  const sb = libre(supabaseServer());
  const filtre = searchParams.formateur && /^[0-9a-f-]{36}$/i.test(searchParams.formateur) ? searchParams.formateur : null;

  let qf = sb
    .schema('app')
    .from('trainer_invoices')
    .select('id, trainer_id, source, number, issue_date, due_date, subtotal_cents, vat_cents, total_cents, expected_subtotal_cents, status, decision_note, pdf_path, issuer_snapshot')
    .order('created_at', { ascending: false })
    .limit(200);
  let qd = sb
    .schema('app')
    .from('trainer_expenses')
    .select('id, trainer_id, session_id, expense_date, category, label, amount_cents, status, decision_note')
    .order('created_at', { ascending: false })
    .limit(200);
  if (filtre) {
    qf = qf.eq('trainer_id', filtre);
    qd = qd.eq('trainer_id', filtre);
  }
  const [{ data: fData }, { data: dData }] = await Promise.all([qf, qd]);
  const factures = ((fData ?? []) as Facture[]).sort((a, b) => (ORDRE[a.status] ?? 9) - (ORDRE[b.status] ?? 9));
  const frais = ((dData ?? []) as Frais[]).sort((a, b) => (ORDRE[a.status] ?? 9) - (ORDRE[b.status] ?? 9));

  const trainerIds = [...new Set([...factures.map((f) => f.trainer_id), ...frais.map((f) => f.trainer_id)])];
  const [{ data: tData }, seances] = await Promise.all([
    trainerIds.length ? sb.schema('app').from('trainers').select('id, first_name, last_name').in('id', trainerIds) : Promise.resolve({ data: [] }),
    loadSessionsByIds(sb, [...new Set(frais.map((f) => f.session_id))], { from: new Date(0), to: new Date('2100-01-01') }),
  ]);
  const nom = new Map(((tData ?? []) as { id: string; first_name: string; last_name: string }[]).map((t) => [t.id, `${t.first_name} ${t.last_name}`.trim()]));
  const seance = new Map(seances.map((s) => [s.id, s]));
  const aTraiter = factures.filter((f) => f.status === 'soumise').length + frais.filter((f) => f.status === 'soumise').length;

  return (
    <div className="max-w-5xl w-full mx-auto px-8 py-9 space-y-8">
      <header>
        <div className="flex items-center gap-2 mb-2">
          <Link href="/formateurs" className="text-[12px] text-zinc-500 hover:text-orange-600 dark:hover:text-orange-400 inline-flex items-center gap-1 transition">
            <ArrowLeft className="w-3.5 h-3.5" /> Formateurs
          </Link>
          <span className="text-zinc-300 dark:text-zinc-700" aria-hidden>
            ·
          </span>
          <SectionLabel>Relations</SectionLabel>
        </div>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Factures & frais des formateurs</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3 tabular-nums">
          {aTraiter > 0 ? `${aTraiter} élément${aTraiter > 1 ? 's' : ''} à traiter.` : 'Rien à traiter pour le moment.'}
          {filtre && nom.get(filtre) ? ` Filtré sur ${nom.get(filtre)} — ` : ' '}
          {filtre && <Link href="/formateurs/facturation" className="underline">tout afficher</Link>}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Factures d’honoraires</h2>
        {factures.length === 0 ? (
          <p className="text-[13px] text-zinc-400">Aucune facture reçue.</p>
        ) : (
          <ul className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
            {factures.map((f) => {
              const statut = STATUT_FACTURE[f.status] ?? { label: f.status, ton: 'info' as const };
              const ecart = f.expected_subtotal_cents !== null && Number(f.expected_subtotal_cents) !== Number(f.subtotal_cents);
              return (
                <li key={f.id} className="px-4 py-3 grid gap-3 md:grid-cols-[1fr_auto]">
                  <div className="space-y-1 min-w-0">
                    <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                      {nom.get(f.trainer_id) ?? 'Formateur'} · <span className="font-mono text-[13px]">{f.number}</span>
                      <span className={`ml-2 text-[11px] px-2 py-0.5 rounded-full ${CLASSES_TON[statut.ton]}`}>{statut.label}</span>
                    </p>
                    <p className="text-[12px] text-zinc-500 tabular-nums">
                      {date(f.issue_date)}
                      {f.due_date ? ` · échéance ${date(f.due_date)}` : ''} · {f.source === 'generee' ? 'générée dans Capsule' : 'déposée par le formateur'}
                    </p>
                    <p className="text-[13px] text-zinc-800 dark:text-zinc-200 tabular-nums">
                      {formatEuros(Number(f.subtotal_cents))} HT
                      {Number(f.vat_cents) > 0 ? ` + ${formatEuros(Number(f.vat_cents))} TVA` : ''} = <strong>{formatEuros(Number(f.total_cents))}</strong>
                    </p>
                    {ecart && (
                      <p className="text-[12px] text-amber-700 dark:text-amber-300 tabular-nums">
                        Montant attendu d’après son tarif : {formatEuros(Number(f.expected_subtotal_cents))} HT
                      </p>
                    )}
                    {f.issuer_snapshot?.iban && (
                      <p className="text-[12px] text-zinc-500">
                        IBAN <span className="font-mono">{f.issuer_snapshot.iban}</span>
                        {f.issuer_snapshot.bic ? <> · BIC <span className="font-mono">{f.issuer_snapshot.bic}</span></> : null}
                      </p>
                    )}
                    {f.decision_note && <p className="text-[12px] text-zinc-600 dark:text-zinc-400">Motif : {f.decision_note}</p>}
                  </div>
                  <div className="flex flex-col items-start md:items-end gap-2">
                    {f.pdf_path && (
                      <a href={`/api/formateurs/fichier/facture/${f.id}`} target="_blank" rel="noopener" className="text-[12px] text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1 hover:underline">
                        <FileText className="w-3.5 h-3.5" /> Ouvrir le PDF
                      </a>
                    )}
                    {gerer && <BillingDecision kind="facture" id={f.id} status={f.status} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Notes de frais</h2>
        {frais.length === 0 ? (
          <p className="text-[13px] text-zinc-400">Aucune note de frais reçue.</p>
        ) : (
          <ul className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
            {frais.map((d) => {
              const statut = STATUT_FRAIS[d.status] ?? { label: d.status, ton: 'info' as const };
              const s = seance.get(d.session_id);
              return (
                <li key={d.id} className="px-4 py-3 grid gap-3 md:grid-cols-[1fr_auto]">
                  <div className="space-y-1 min-w-0">
                    <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                      {nom.get(d.trainer_id) ?? 'Formateur'} · {CATEGORIES_FRAIS[d.category] ?? d.category}
                      <span className={`ml-2 text-[11px] px-2 py-0.5 rounded-full ${CLASSES_TON[statut.ton]}`}>{statut.label}</span>
                    </p>
                    <p className="text-[13px] text-zinc-800 dark:text-zinc-200">
                      {d.label} · <strong className="tabular-nums">{formatEuros(Number(d.amount_cents))}</strong>
                    </p>
                    <p className="text-[12px] text-zinc-500 tabular-nums">
                      Dépense du {date(d.expense_date)}
                      {s ? ` · séance du ${jourLong(s.startsAt)} (${s.title})` : ''}
                    </p>
                    {d.decision_note && <p className="text-[12px] text-zinc-600 dark:text-zinc-400">Motif : {d.decision_note}</p>}
                  </div>
                  <div className="flex flex-col items-start md:items-end gap-2">
                    <a href={`/api/formateurs/fichier/frais/${d.id}`} target="_blank" rel="noopener" className="text-[12px] text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1 hover:underline">
                      <Paperclip className="w-3.5 h-3.5" /> Justificatif
                    </a>
                    {gerer && <BillingDecision kind="frais" id={d.id} status={d.status} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
