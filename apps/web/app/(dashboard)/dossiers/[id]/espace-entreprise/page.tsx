// ARCHETYPE: workflow
// Justification: ouvrir au référent du client son espace entreprise — ses
// documents de formation, sans compte à créer.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Building2, FileText, UserRound } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { exigerLecture } from '@/shared/lib/supabase/echec-lecture';
import { SectionLabel } from '@/shared/ui/section-label';
import { referentPropose } from '@/features/espace-entreprise/referent-dossier';
import { EspaceEntrepriseClient } from './client';

export const dynamic = 'force-dynamic';

export default async function EspaceEntreprisePage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data, error } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, company:companies(name)')
    .eq('id', params.id)
    .maybeSingle();
  exigerLecture('dossier', error);
  if (!data) notFound();
  const dossier = data as unknown as {
    company: { name: string | null } | Array<{ name: string | null }> | null;
  };
  const entreprise = Array.isArray(dossier.company) ? dossier.company[0]?.name : dossier.company?.name;

  const [referent, { count: visibles }, { count: internes }] = await Promise.all([
    referentPropose(sb as never, params.id),
    sb
      .schema('app')
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('dossier_id', params.id)
      .eq('visible_entreprise' as never, true as never)
      .is('deleted_at', null),
    sb
      .schema('app')
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('dossier_id', params.id)
      .eq('visible_entreprise' as never, false as never)
      .is('deleted_at', null),
  ]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div>
        <SectionLabel className="mb-2">Espace entreprise</SectionLabel>
        <h2 className="text-[20px] leading-tight font-semibold text-zinc-900 dark:text-zinc-100">
          Les documents du client, dans son espace
        </h2>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
          Le référent reçoit un lien personnel (valable un an) vers un espace où il retrouve les documents de tous ses
          dossiers que vous avez rendus visibles. Rien à signer : il consulte et télécharge.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm flex items-start gap-3">
          <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
            <UserRound className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Référent{entreprise ? ` · ${entreprise}` : ''}</p>
            {referent ? (
              <>
                <p className="text-[14px] text-zinc-900 dark:text-zinc-100 truncate">{referent.nom}</p>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{referent.email ?? 'Pas d’adresse e-mail'}</p>
                {referent.source === 'client' && (
                  <p className="text-[11px] text-zinc-400 mt-1">Contact référent du client, repris de sa fiche entreprise.</p>
                )}
              </>
            ) : (
              <p className="text-[13px] text-zinc-600 dark:text-zinc-300">
                Aucun contact référent pour ce client.{' '}
                <Link href={`/dossiers/${params.id}`} className="text-orange-600 dark:text-orange-400 hover:underline">
                  Le désigner sur la fiche
                </Link>
              </p>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm flex items-start gap-3">
          <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <FileText className="w-4 h-4" />
          </span>
          <div>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Documents de ce dossier</p>
            <p className="text-[14px] text-zinc-900 dark:text-zinc-100 tabular-nums">
              {visibles ?? 0} visible{(visibles ?? 0) > 1 ? 's' : ''} · {internes ?? 0} interne{(internes ?? 0) > 1 ? 's' : ''}
            </p>
            <Link href={`/dossiers/${params.id}/documents`} className="text-[12px] text-orange-600 dark:text-orange-400 hover:underline">
              Choisir ce qui est visible
            </Link>
          </div>
        </div>
      </div>

      {referent ? (
        <EspaceEntrepriseClient dossierId={params.id} aUnEmail={Boolean(referent.email)} />
      ) : (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-2">
          <Building2 className="w-4 h-4" /> L’espace s’ouvre au référent du client : désignez-le d’abord.
        </p>
      )}
    </div>
  );
}
