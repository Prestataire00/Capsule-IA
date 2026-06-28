// ARCHETYPE: command
// Justification: page unique « Demandes » — triage des demandes/pré-inscriptions,
// validation des pièces (→ conversion auto en dossier) et conversion manuelle.

import { createClient } from '@supabase/supabase-js';
import { Inbox, UserPlus, FolderCheck, ClipboardCheck, ArrowUpRight, Sparkles } from 'lucide-react';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { StatusPill } from '@/shared/ui/status-pill';
import { ConvertButton } from './convert-button';
import { AnonymizeAction } from '../rgpd/anonymize-action';
import { requireAccess } from '@/shared/lib/auth/require-access';

export const dynamic = 'force-dynamic';

type ProspectRow = {
  id: string;
  organization_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  company_name: string | null;
  funder_kind: string;
  status: string;
  validation_status: string;
  created_at: string;
  converted_dossier_id: string | null;
  anonymized_at: string | null;
};

const FUNDER_TONE: Record<string, string> = {
  opco: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  cpf: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  pole_emploi: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  region: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  entreprise: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  autofinancement: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
};

async function loadProspects(): Promise<ProspectRow[]> {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb
    .schema('app')
    .from('prospects' as never)
    .select(
      'id, organization_id, first_name, last_name, email, company_name, funder_kind, status, validation_status, created_at, converted_dossier_id, anonymized_at',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  return (data ?? []) as unknown as ProspectRow[];
}

function StatCard({
  icon: Icon,
  label,
  value,
  gradient,
}: {
  icon: typeof Inbox;
  label: string;
  value: number;
  gradient: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
      <div className={`absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 ${gradient}`} />
      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm ${gradient}`}>
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-3 text-[28px] font-semibold leading-none tracking-tight text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
      <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">{label}</p>
    </div>
  );
}

export default async function ProspectsPage() {
  await requireAccess('crm');
  const prospects = await loadProspects();

  const toValidate = prospects.filter((p) => p.validation_status === 'pending_validation' && !p.converted_dossier_id);
  const toConvert = prospects.filter(
    (p) => p.validation_status === 'validated' && !p.converted_dossier_id && p.status !== 'archived',
  );
  const converted = prospects.filter((p) => p.converted_dossier_id);

  const sb = supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  const { data: memberData } = auth.user
    ? await sb
        .schema('app')
        .from('members')
        .select('role')
        .eq('user_id', auth.user.id)
        .is('deleted_at', null)
        .order('is_default_org', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const role = (memberData as { role: string } | null)?.role;
  const isOwnerAdmin = role === 'owner' || role === 'admin';

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      {/* Hero coloré */}
      <header className="mb-7 rounded-3xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 p-6 sm:p-8 text-white shadow-md">
        <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wider text-white/80">
          <Sparkles className="h-4 w-4" /> Demandes
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Demandes &amp; pré-inscriptions</h1>
        <p className="mt-1.5 text-[14px] text-white/85 max-w-xl">
          Vérifiez les pièces : une demande validée est <strong>automatiquement convertie en dossier</strong>.
          Tout se passe ici.
        </p>
      </header>

      {/* KPIs colorés */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-7">
        <StatCard icon={ClipboardCheck} label="À valider (pièces)" value={toValidate.length} gradient="bg-gradient-to-br from-amber-500 to-orange-500" />
        <StatCard icon={UserPlus} label="À convertir" value={toConvert.length} gradient="bg-gradient-to-br from-violet-500 to-fuchsia-500" />
        <StatCard icon={FolderCheck} label="Converties en dossier" value={converted.length} gradient="bg-gradient-to-br from-emerald-500 to-teal-500" />
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_130px_150px_200px] gap-3 px-5 py-3 text-[10px] font-semibold tracking-wider uppercase text-zinc-400 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40">
          <div>Candidat</div>
          <div>Entreprise</div>
          <div>Financement</div>
          <div>État</div>
          <div></div>
        </div>
        {prospects.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Inbox className="mx-auto mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-700" />
            <p className="text-[13px] text-zinc-400">Aucune demande pour le moment.</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {prospects.map((p) => {
              const pendingValidation = p.validation_status === 'pending_validation' && !p.converted_dossier_id;
              return (
                <li
                  key={p.id}
                  className={`grid grid-cols-[1fr_1fr_130px_150px_200px] gap-3 px-5 py-3.5 items-center text-[13px] transition hover:bg-zinc-50/60 dark:hover:bg-zinc-950/40 ${
                    pendingValidation ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''
                  }`}
                >
                  <span className="min-w-0">
                    <span className="text-zinc-900 dark:text-zinc-100 font-medium block truncate">
                      {p.first_name} {p.last_name}
                    </span>
                    <span className="text-[11px] text-zinc-500 truncate">{p.email}</span>
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-300 truncate">{p.company_name ?? '—'}</span>
                  <span>
                    <span
                      className={`inline-block text-[10px] font-medium uppercase px-2 py-0.5 rounded-full ${
                        FUNDER_TONE[p.funder_kind] ?? FUNDER_TONE.autofinancement
                      }`}
                    >
                      {p.funder_kind}
                    </span>
                  </span>
                  <span>
                    {p.converted_dossier_id ? (
                      <StatusPill tone="success">convertie</StatusPill>
                    ) : pendingValidation ? (
                      <StatusPill tone="warning">pièces à valider</StatusPill>
                    ) : p.validation_status === 'rejected' ? (
                      <StatusPill tone="danger">rejetée</StatusPill>
                    ) : (
                      <StatusPill tone="neutral">validée</StatusPill>
                    )}
                  </span>
                  <div className="flex flex-col items-end gap-1.5">
                    <a
                      href={`/prospects/${p.id}`}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-violet-600 dark:text-violet-400 hover:gap-1.5 transition-all"
                    >
                      {pendingValidation ? 'Vérifier les pièces' : 'Voir la demande'}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                    {p.converted_dossier_id ? (
                      <a
                        href={`/dossiers/${p.converted_dossier_id}`}
                        className="text-[12px] text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        Voir le dossier →
                      </a>
                    ) : (
                      !pendingValidation && <ConvertButton prospectId={p.id} />
                    )}
                    {isOwnerAdmin && !p.anonymized_at && (
                      <AnonymizeAction subject={{ kind: 'prospect', id: p.id, lastName: p.last_name }} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
