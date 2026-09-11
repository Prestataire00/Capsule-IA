// ARCHETYPE: command
// Justification: fiche détail d'un financeur — coordonnées, KPIs, dossiers financés + édition.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Wallet,
  Mail,
  Phone,
  Hash,
  Check,
  Trash2,
  FolderOpen,
  TrendingUp,
} from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { StatCard } from '@/shared/ui/stat-card';
import { StatusPill } from '@/shared/ui/status-pill';
import { InfoCallout } from '@/shared/ui/info-callout';
import { ManageOnly } from '@/shared/components/auth/manage-only';
import { formatEurosCents } from '@/features/funders/funders-overview';
import { updateFunder, deleteFunder } from './actions';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  opco: 'OPCO',
  cpf: 'CPF',
  pole_emploi: 'France Travail',
  region: 'Région',
  faf_ca: 'FAF-CA',
  agefiph: 'AGEFIPH',
  autofinancement: 'Autofinancement',
  entreprise: 'Entreprise',
  autre: 'Autre',
};

// Mêmes catégories que le formulaire de création (multi-sélection).
const KINDS = [
  { value: 'opco', label: 'OPCO', hint: 'Organisme paritaire' },
  { value: 'cpf', label: 'CPF', hint: 'Compte personnel de formation' },
  { value: 'pole_emploi', label: 'France Travail', hint: 'Ex-Pôle emploi' },
  { value: 'region', label: 'Région', hint: 'Conseil régional' },
  { value: 'entreprise', label: 'Entreprise', hint: 'Plan de développement' },
  { value: 'autofinancement', label: 'Autofinancement', hint: 'L’apprenant paie' },
] as const;

const DOSSIER_STATUS: Record<string, { label: string; tone: 'info' | 'success' | 'neutral' | 'warning' | 'danger' }> = {
  draft: { label: 'Brouillon', tone: 'neutral' },
  pending_validation: { label: 'À valider', tone: 'warning' },
  scheduled: { label: 'Planifié', tone: 'info' },
  active: { label: 'En cours', tone: 'success' },
  completed: { label: 'Terminé', tone: 'neutral' },
  closed: { label: 'Clos', tone: 'neutral' },
  cancelled: { label: 'Annulé', tone: 'danger' },
  archived: { label: 'Archivé', tone: 'neutral' },
};

const FUNDER_STATUS: Record<string, { label: string; tone: 'info' | 'success' | 'neutral' | 'danger' }> = {
  pending: { label: 'En attente', tone: 'info' },
  approved: { label: 'Accordé', tone: 'success' },
  refused: { label: 'Refusé', tone: 'danger' },
  paid: { label: 'Payé', tone: 'success' },
};

const ERROR_MESSAGES: Record<string, string> = {
  missing: 'Le nom du financeur est requis.',
  no_kind: 'Sélectionnez au moins un type de financeur.',
  has_dossiers: 'Impossible d’archiver : ce financeur est rattaché à des dossiers.',
};

type FunderRow = {
  id: string;
  name: string;
  kind: string;
  kinds: string[] | null;
  contact_email: string | null;
  contact_phone: string | null;
  external_id: string | null;
};

type LinkRow = {
  amount_cents: number;
  status: string;
  external_file_number: string | null;
  dossier: {
    id: string;
    reference: string;
    status: string;
    learner: { first_name: string; last_name: string } | null;
    formation: { title: string } | null;
  } | null;
};

export default async function FinanceurDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { saved?: string; error?: string };
}) {
  const sb = supabaseServer();

  const { data: funderRow } = await sb
    .schema('app')
    .from('funders')
    .select('id, name, kind, kinds, contact_email, contact_phone, external_id')
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle();
  const funder = funderRow as unknown as FunderRow | null;
  if (!funder) notFound();

  const { data: linkRows } = await sb
    .schema('app')
    .from('dossier_funders')
    .select(
      'amount_cents, status, external_file_number, ' +
        'dossier:dossiers(id, reference, status, learner:learners(first_name, last_name), formation:formations(title))',
    )
    .eq('funder_id', params.id);
  const links = ((linkRows as unknown as LinkRow[] | null) ?? []).filter((l) => l.dossier);

  const totalCents = links.reduce((s, l) => s + (l.amount_cents ?? 0), 0);
  const activeCount = links.filter(
    (l) => l.dossier && (l.dossier.status === 'active' || l.dossier.status === 'scheduled'),
  ).length;

  const kinds = funder.kinds && funder.kinds.length > 0 ? funder.kinds : [funder.kind];

  return (
    <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/financeurs"
        className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Retour aux financeurs
      </Link>

      {searchParams?.saved && <InfoCallout tone="success" className="mb-5">Financeur enregistré.</InfoCallout>}
      {searchParams?.error && (
        <InfoCallout tone="danger" className="mb-5">
          {ERROR_MESSAGES[searchParams.error] ?? 'Une erreur est survenue.'}
        </InfoCallout>
      )}

      <header className="flex items-start gap-4 mb-6">
        <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-950/60 dark:to-violet-950/30 text-violet-700 dark:text-violet-300 flex items-center justify-center shadow-sm flex-shrink-0">
          <Wallet className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight truncate">
            {funder.name}
          </h1>
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            {kinds.map((k) => (
              <span
                key={k}
                className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
              >
                {KIND_LABEL[k] ?? k}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-4 flex-wrap mt-2 text-[12px] text-zinc-500 dark:text-zinc-400">
            {funder.contact_email && (
              <a href={`mailto:${funder.contact_email}`} className="inline-flex items-center gap-1 hover:text-violet-600">
                <Mail className="w-3 h-3" /> {funder.contact_email}
              </a>
            )}
            {funder.contact_phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="w-3 h-3" /> {funder.contact_phone}
              </span>
            )}
            {funder.external_id && (
              <span className="inline-flex items-center gap-1 font-mono">
                <Hash className="w-3 h-3" /> {funder.external_id}
              </span>
            )}
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        <StatCard label="Dossiers financés" value={links.length} icon={FolderOpen} accent="violet" />
        <StatCard label="Dossiers actifs" value={activeCount} icon={FolderOpen} accent="blue" />
        <StatCard label="Total financé" value={formatEurosCents(totalCents)} icon={TrendingUp} accent="emerald" />
      </section>

      {/* Dossiers financés */}
      <section className="mb-8">
        <h2 className="text-[12px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium mb-2">
          Dossiers financés ({links.length})
        </h2>
        {links.length === 0 ? (
          <InfoCallout tone="info">
            Aucun dossier rattaché à ce financeur pour l’instant.
          </InfoCallout>
        ) : (
          <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl divide-y divide-zinc-200/60 dark:divide-zinc-800 overflow-hidden">
            {links.map((l) => {
              const d = l.dossier!;
              const ds = DOSSIER_STATUS[d.status] ?? { label: d.status, tone: 'neutral' as const };
              const fs = FUNDER_STATUS[l.status] ?? { label: l.status, tone: 'neutral' as const };
              const learner = d.learner ? `${d.learner.first_name} ${d.learner.last_name}` : '—';
              return (
                <li key={d.id} className="grid grid-cols-[1fr_130px_110px] gap-3 px-4 py-3 items-center text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-950 transition">
                  <div className="min-w-0">
                    <Link href={`/dossiers/${d.id}/facturation`} className="text-zinc-900 dark:text-zinc-100 hover:text-violet-600 font-medium truncate block">
                      {d.formation?.title ?? d.reference}
                    </Link>
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      {learner} · <span className="font-mono">{d.reference}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusPill tone={ds.tone}>{ds.label}</StatusPill>
                    <StatusPill tone={fs.tone}>{fs.label}</StatusPill>
                  </div>
                  <span className="tabular-nums text-right text-zinc-900 dark:text-zinc-100">
                    {formatEurosCents(l.amount_cents)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Édition */}
      <ManageOnly section="catalogue">
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm">
          <div className="px-6 pt-5">
            <h2 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">Modifier le financeur</h2>
          </div>
          <form action={updateFunder} className="p-6 space-y-4">
            <input type="hidden" name="id" value={funder.id} />
            <FormField label="Nom" required>
              <input type="text" name="name" required defaultValue={funder.name} className={inputClass} />
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Email de contact">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                  <input type="email" name="email" defaultValue={funder.contact_email ?? ''} className={`${inputClass} pl-9`} />
                </div>
              </FormField>
              <FormField label="Téléphone">
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                  <input type="tel" name="phone" defaultValue={funder.contact_phone ?? ''} className={`${inputClass} pl-9`} />
                </div>
              </FormField>
            </div>
            <FormField label="Identifiant externe" hint="Code ou référence dans le système du financeur.">
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input type="text" name="externalId" defaultValue={funder.external_id ?? ''} className={`${inputClass} pl-9 font-mono`} />
              </div>
            </FormField>
            <FormField label="Catégorie(s)" required hint="Plusieurs types possibles pour un même financeur.">
              <div className="grid grid-cols-2 gap-2">
                {KINDS.map((k) => (
                  <label
                    key={k.value}
                    className="flex items-start gap-2.5 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-50 dark:has-[:checked]:bg-violet-950/40 has-[:checked]:border-violet-300 dark:has-[:checked]:border-violet-800 transition"
                  >
                    <input
                      type="checkbox"
                      name="kind"
                      value={k.value}
                      defaultChecked={kinds.includes(k.value)}
                      className="mt-0.5 accent-violet-600"
                    />
                    <span className="min-w-0">
                      <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 block">{k.label}</span>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 block">{k.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </FormField>
            <div className="flex items-center justify-end pt-1">
              <button
                type="submit"
                className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
              >
                <Check className="w-3.5 h-3.5" />
                Enregistrer
              </button>
            </div>
          </form>

          {links.length === 0 && (
            <div className="px-6 py-4 border-t border-zinc-200/60 dark:border-zinc-800 flex items-center justify-between gap-3">
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                Ce financeur n’est rattaché à aucun dossier.
              </p>
              <form action={deleteFunder}>
                <input type="hidden" name="id" value={funder.id} />
                <button
                  type="submit"
                  className="text-[12px] text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-3 py-1.5 rounded-md transition inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Archiver
                </button>
              </form>
            </div>
          )}
        </section>
      </ManageOnly>
    </div>
  );
}
