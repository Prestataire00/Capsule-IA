// ARCHETYPE: command
// Justification: page unique « Demandes » — triage des demandes/pré-inscriptions,
// validation des pièces (→ conversion auto en dossier) et conversion manuelle.

import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { Inbox, UserPlus, FolderCheck, ClipboardCheck, ArrowUpRight, Eye, FolderOpen, Building2, Plus } from 'lucide-react';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { KpiCard } from '@/shared/ui/kpi-card';
import { ConvertButton } from './convert-button';
import { AnonymizeAction } from '../rgpd/anonymize-action';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { ManageOnly } from '@/shared/components/auth/manage-only';
import { DeleteEntityButton } from '@/features/corbeille/ui/delete-entity-button.client';

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

const dateFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });

const ROW_GRID = 'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_120px_104px_150px_minmax(200px,1fr)] gap-4 px-5';

const ICON_BUTTON =
  'w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition';

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

const AVATARS = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
] as const;

function avatarTone(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % AVATARS.length;
  return AVATARS[h] ?? AVATARS[0];
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
    <div className="max-w-7xl w-full mx-auto px-8 py-9">
      <header className="mb-7 flex items-start justify-between gap-4 flex-wrap">
        <div>
        <SectionLabel className="mb-2">Relations</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Demandes &amp; pré-inscriptions</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3 max-w-2xl">
          <span className="tabular-nums">
            {prospects.length} demande{prospects.length > 1 ? 's' : ''}
          </span>
          {' · '}Vérifiez les pièces : une demande validée est{' '}
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">automatiquement convertie en dossier</span>. Tout se passe ici.
        </p>
        </div>
        <Link
          href="/prospects/nouvelle"
          className="h-10 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 rounded-lg shadow-sm shadow-orange-600/30 transition inline-flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nouvelle demande
        </Link>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-7">
        <KpiCard icon={ClipboardCheck} label="À valider (pièces)" value={toValidate.length} accent="amber" />
        <KpiCard icon={UserPlus} label="À convertir" value={toConvert.length} accent="rose" />
        <KpiCard icon={FolderCheck} label="Converties en dossier" value={converted.length} accent="emerald" />
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
        <div className="min-w-[1000px]">
          <div
            className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}
          >
            <div>Candidat</div>
            <div>Entreprise</div>
            <div>Financement</div>
            <div>Reçue le</div>
            <div>État</div>
            <div className="text-right">Actions</div>
          </div>
          {prospects.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <span className="mx-auto mb-3 w-12 h-12 rounded-xl grid place-items-center bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                <Inbox className="h-6 w-6" />
              </span>
              <p className="text-[13px] text-zinc-400">Aucune demande pour le moment.</p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {prospects.map((p) => {
                const pendingValidation = p.validation_status === 'pending_validation' && !p.converted_dossier_id;
                const name = `${p.first_name} ${p.last_name}`;
                return (
                  <li
                    key={p.id}
                    className={`${ROW_GRID} py-3.5 items-center text-[13px] transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 ${
                      pendingValidation ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''
                    }`}
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <span className={`w-9 h-9 rounded-full grid place-items-center text-[12px] font-bold flex-shrink-0 ${avatarTone(name)}`}>
                        {`${p.first_name[0] ?? ''}${p.last_name[0] ?? ''}`.toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <a
                          href={`/prospects/${p.id}`}
                          className="block truncate text-[15px] font-bold text-zinc-900 dark:text-zinc-100 hover:underline"
                        >
                          {name}
                        </a>
                        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{p.email}</p>
                      </div>
                    </div>
                    <div className="min-w-0 text-zinc-700 dark:text-zinc-300">
                      {p.company_name ? (
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-6 h-6 rounded-md grid place-items-center shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                            <Building2 className="w-3.5 h-3.5" />
                          </span>
                          <span className="truncate">{p.company_name}</span>
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </div>
                    <div>
                      <span className="inline-flex items-center h-6 px-2 rounded-md text-[12px] font-semibold uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {p.funder_kind}
                      </span>
                    </div>
                    <div className="tabular-nums text-zinc-700 dark:text-zinc-300">{dateFmt.format(new Date(p.created_at))}</div>
                    <div>
                      {p.converted_dossier_id ? (
                        <StatusPill tone="success">convertie</StatusPill>
                      ) : pendingValidation ? (
                        <StatusPill tone="warning">pièces à valider</StatusPill>
                      ) : p.validation_status === 'rejected' ? (
                        <StatusPill tone="danger">rejetée</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">validée</StatusPill>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {pendingValidation ? (
                          <a
                            href={`/prospects/${p.id}`}
                            className="h-7 px-2.5 rounded-md text-[12px] font-bold inline-flex items-center gap-1 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-950/50 dark:text-orange-300 transition"
                          >
                            Vérifier les pièces <ArrowUpRight className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <a
                            href={`/prospects/${p.id}`}
                            aria-label={`Voir la demande — ${name}`}
                            title="Voir la demande"
                            className={ICON_BUTTON}
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                        )}
                        {p.converted_dossier_id ? (
                          <a
                            href={`/dossiers/${p.converted_dossier_id}`}
                            aria-label={`Voir le dossier — ${name}`}
                            title="Voir le dossier"
                            className={ICON_BUTTON}
                          >
                            <FolderOpen className="h-4 w-4" />
                          </a>
                        ) : (
                          !pendingValidation && <ConvertButton prospectId={p.id} />
                        )}
                        <ManageOnly section="crm">
                          <DeleteEntityButton entite="demande" id={p.id} nom={name} article="cette demande" />
                        </ManageOnly>
                      </div>
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
    </div>
  );
}
