// ARCHETYPE: workflow
// Justification: ouvrir l'espace entreprise aux référents des clients de la
// séance — il remplace l'espace apprenant.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight, Building2 } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { exigerLecture } from '@/shared/lib/supabase/echec-lecture';
import { loadSession } from '@/features/sessions/load-session';
import { EmptyState } from '@/shared/ui/empty-state';
import { EnvoiReferents } from './envoi.client';

export const dynamic = 'force-dynamic';

export default async function SessionEspaceEntrepriseTab({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  if (loaded.dossierIds.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
        <EmptyState icon={Building2} title="Aucun dossier" description="L’espace entreprise s’ouvre au référent d’un dossier." />
      </div>
    );
  }

  const { data, error } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, reference, company:companies(name), contact:contacts(first_name, last_name, email)' as never)
    .in('id', loaded.dossierIds);
  exigerLecture('dossiers de la séance', error);
  const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const dossiers = ((data ?? []) as unknown as Array<{
    id: string;
    reference: string;
    company: { name: string | null } | Array<{ name: string | null }> | null;
    contact: { first_name: string | null; last_name: string | null; email: string | null } | Array<{ first_name: string | null; last_name: string | null; email: string | null }> | null;
  }>).map((d) => ({ id: d.id, reference: d.reference, entreprise: un(d.company)?.name ?? null, referent: un(d.contact) }));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 max-w-2xl">
          Chaque référent client reçoit un lien vers son espace entreprise : il y retrouve les documents de ses dossiers que vous
          avez rendus visibles. Il n’y a plus d’espace apprenant.
        </p>
        <EnvoiReferents sessionId={params.id} dossierIds={dossiers.map((d) => d.id)} libelle="Envoyer à tous les référents" />
      </div>
      <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80">
        {dossiers.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3.5 text-[13px] flex-wrap">
            <div className="min-w-0">
              <p className="text-zinc-900 dark:text-zinc-100">
                {d.referent ? `${d.referent.first_name ?? ''} ${d.referent.last_name ?? ''}`.trim() || 'Référent' : 'Aucun référent'}
                {d.entreprise ? <span className="text-zinc-500"> · {d.entreprise}</span> : null}
              </p>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                {d.referent?.email ?? 'sans adresse'} · dossier <span className="font-mono">{d.reference}</span>
              </p>
            </div>
            <Link
              href={`/dossiers/${d.id}/espace-entreprise`}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[12px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition shrink-0"
            >
              Gérer l’espace <ArrowUpRight className="w-3 h-3" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
