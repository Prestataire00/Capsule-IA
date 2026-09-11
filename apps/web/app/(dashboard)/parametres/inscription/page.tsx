// ARCHETYPE: command
// Justification: lien d'inscription public au niveau organisme à intégrer sur le site de l'OF.

import { Link2 } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { InscriptionLink } from './inscription-link';

export const dynamic = 'force-dynamic';

export default async function ParametresInscriptionPage() {
  const sb = supabaseServer();
  // Organisation courante (RLS-scopé : un seul OF accessible par l'utilisateur).
  const { data } = await sb
    .schema('app')
    .from('organizations')
    .select('id, name')
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  const org = (data as { id: string; name: string } | null) ?? null;

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-start gap-3">
        <Link2 className="w-5 h-5 mt-0.5 text-zinc-400" />
        <div>
          <h1 className="text-[20px] leading-tight font-extrabold text-zinc-900 dark:text-zinc-100">Lien d'inscription</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
            Un lien public vers votre catalogue, à mettre derrière un bouton sur votre site.
          </p>
        </div>
      </div>

      {!org ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Organisme introuvable.</p>
      ) : (
        <>
          <SectionLabel>Votre lien</SectionLabel>
          <InscriptionLink orgId={org.id} />
        </>
      )}
    </div>
  );
}
