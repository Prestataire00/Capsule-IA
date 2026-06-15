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
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-100 to-orange-50 dark:from-orange-950/60 dark:to-orange-950/30 text-orange-700 dark:text-orange-300 flex items-center justify-center shadow-sm">
          <Link2 className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Lien d'inscription</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
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
