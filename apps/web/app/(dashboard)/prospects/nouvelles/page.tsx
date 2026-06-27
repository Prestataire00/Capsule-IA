// ARCHETYPE: command
// Justification: inbox des nouvelles demandes à valider (vérification des pièces).

import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { Inbox, Users } from 'lucide-react';
import { env } from '@/env.mjs';
import { requireAccess } from '@/shared/lib/auth/require-access';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company_name: string | null;
  funder_kind: string;
  company_batch_id: string | null;
  created_at: string;
};

type Demande = {
  id: string; // prospect représentant
  title: string;
  subtitle: string;
  funder: string;
  count: number;
  createdAt: string;
};

async function loadDemandes(): Promise<Demande[]> {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb
    .schema('app')
    .from('prospects' as never)
    .select('id, first_name, last_name, email, company_name, funder_kind, company_batch_id, created_at')
    .eq('validation_status', 'pending_validation')
    .is('converted_dossier_id', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as unknown as Row[];

  const batches = new Map<string, Row[]>();
  const demandes: Demande[] = [];
  for (const r of rows) {
    if (r.company_batch_id) {
      const arr = batches.get(r.company_batch_id) ?? [];
      arr.push(r);
      batches.set(r.company_batch_id, arr);
    } else {
      demandes.push({
        id: r.id,
        title: `${r.first_name} ${r.last_name}`,
        subtitle: r.company_name ?? r.email,
        funder: r.funder_kind,
        count: 1,
        createdAt: r.created_at,
      });
    }
  }
  for (const [, arr] of batches) {
    const rep = arr[arr.length - 1]!; // plus ancien = représentant
    demandes.push({
      id: rep.id,
      title: rep.company_name ?? `${rep.first_name} ${rep.last_name}`,
      subtitle: `${arr.length} salarié(s) à former`,
      funder: rep.funder_kind,
      count: arr.length,
      createdAt: rep.created_at,
    });
  }
  demandes.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return demandes;
}

export default async function NouvellesDemandesPage() {
  await requireAccess('crm');
  const demandes = await loadDemandes();

  return (
    <div className="max-w-5xl w-full mx-auto px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight inline-flex items-center gap-2">
          <Inbox className="w-5 h-5 text-violet-600" /> Nouvelles demandes
        </h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
          {demandes.length} demande(s) en attente de validation · vérifiez les pièces justificatives.
        </p>
      </header>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        {demandes.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-zinc-400">
            Aucune demande en attente. 🎉
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {demandes.map((d) => (
              <li key={d.id} className="px-5 py-3.5 flex items-center justify-between gap-3 text-[13px]">
                <span className="min-w-0">
                  <span className="text-zinc-900 dark:text-zinc-100 block truncate inline-flex items-center gap-2">
                    {d.count > 1 && <Users className="w-3.5 h-3.5 text-violet-500" />}
                    {d.title}
                  </span>
                  <span className="text-[11px] text-zinc-500 truncate">{d.subtitle}</span>
                </span>
                <span className="flex items-center gap-4 flex-shrink-0">
                  <span className="text-[11px] text-zinc-400 uppercase">{d.funder}</span>
                  <span className="text-[11px] text-zinc-400">{new Date(d.createdAt).toLocaleDateString('fr-FR')}</span>
                  <Link href={`/prospects/${d.id}`} className="text-[12px] text-violet-600 hover:underline">
                    Vérifier
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
