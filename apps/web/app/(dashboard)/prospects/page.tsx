// ARCHETYPE: command
// Justification: triage des pré-inscriptions + conversion en dossier (anti double-saisie).

import { createClient } from '@supabase/supabase-js';
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
  created_at: string;
  converted_dossier_id: string | null;
  anonymized_at: string | null;
};

// Lecture en service_role (comme factures/page.tsx) : contourne la RLS et liste TOUS
// les prospects, y compris non assignés. Acceptable pour OF unique ; à durcir
// (supabaseServer() + RLS) si le multi-tenant strict devient requis sur cet écran.
async function loadProspects(): Promise<ProspectRow[]> {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb
    .schema('app')
    .from('prospects' as never)
    .select(
      'id, organization_id, first_name, last_name, email, company_name, funder_kind, status, created_at, converted_dossier_id, anonymized_at',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  return (data ?? []) as unknown as ProspectRow[];
}

export default async function ProspectsPage() {
  await requireAccess('crm');
  const prospects = await loadProspects();
  const pending = prospects.filter((p) => p.status === 'new' || p.status === 'qualified');

  // Rôle de l'utilisateur courant (owner/admin) pour autoriser l'anonymisation RGPD.
  // La liste est chargée en service_role ; le rôle se résout via le client RLS-scopé.
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
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          Pré-inscriptions
        </h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
          {pending.length} à traiter · convertir en dossier sans ressaisie.
        </p>
      </header>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_120px_120px_200px] gap-3 px-5 py-2.5 text-[10px] tracking-wider uppercase text-zinc-400 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
          <div>Candidat</div>
          <div>Entreprise</div>
          <div>Financement</div>
          <div>Statut</div>
          <div></div>
        </div>
        {prospects.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-zinc-400">
            Aucune pré-inscription.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {prospects.map((p) => (
              <li
                key={p.id}
                className="grid grid-cols-[1fr_1fr_120px_120px_200px] gap-3 px-5 py-3 items-center text-[13px]"
              >
                <span className="min-w-0">
                  <span className="text-zinc-900 dark:text-zinc-100 block truncate">
                    {p.first_name} {p.last_name}
                  </span>
                  <span className="text-[11px] text-zinc-500 truncate">{p.email}</span>
                  {p.organization_id === null && (
                    <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                      non assigné
                    </span>
                  )}
                </span>
                <span className="text-zinc-600 dark:text-zinc-300 truncate">
                  {p.company_name ?? '—'}
                </span>
                <span className="text-zinc-500 text-[12px] uppercase">{p.funder_kind}</span>
                <StatusPill
                  tone={
                    p.status === 'converted'
                      ? 'success'
                      : p.status === 'archived'
                        ? 'neutral'
                        : 'warning'
                  }
                >
                  {p.status}
                </StatusPill>
                <div className="flex flex-col items-end gap-2">
                  <a
                    href={`/prospects/${p.id}`}
                    className="text-[12px] text-violet-600 hover:underline"
                  >
                    Voir la demande
                  </a>
                  {p.converted_dossier_id ? (
                    <a
                      href={`/dossiers/${p.converted_dossier_id}`}
                      className="text-[12px] text-violet-600 hover:underline"
                    >
                      Voir le dossier
                    </a>
                  ) : (
                    <ConvertButton prospectId={p.id} />
                  )}
                  {isOwnerAdmin && !p.anonymized_at && (
                    <div className="space-y-1 w-full">
                      {p.converted_dossier_id && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          Converti en apprenant — anonymiser aussi la fiche apprenant si demandé.
                        </p>
                      )}
                      <AnonymizeAction subject={{ kind: 'prospect', id: p.id, lastName: p.last_name }} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
