// ARCHETYPE: workflow
// Justification: saisie d'une demande reçue hors formulaire public (téléphone, mail, visite).

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { DemandeForm, type FormationOption } from './demande-form.client';

export const dynamic = 'force-dynamic';

export default async function NouvelleDemandePage() {
  await requireAccess('crm', 'manage');
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('formations')
    .select('id, title, code, default_price_cents, default_duration_hours')
    .is('deleted_at', null)
    .order('title', { ascending: true })
    .limit(300);

  const formations: FormationOption[] = (
    (data ?? []) as Array<{
      id: string;
      title: string;
      code: string | null;
      default_price_cents: number | null;
      default_duration_hours: number | null;
    }>
  ).map((f) => ({
    id: f.id,
    title: f.title,
    code: f.code,
    priceCents: Number(f.default_price_cents ?? 0),
    hours: Number(f.default_duration_hours ?? 0),
  }));

  return (
    <div className="max-w-4xl w-full mx-auto px-8 py-9">
      <Link
        href="/prospects"
        className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Toutes les demandes
      </Link>

      <header className="mb-7">
        <SectionLabel className="mb-2">Relations</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Nouvelle demande</h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3 max-w-2xl">
          Pour une demande reçue par téléphone, par mail ou en direct. La formation est facultative : choisissez-la au
          catalogue, décrivez un besoin spécifique, ou laissez-la à définir.
        </p>
      </header>

      <DemandeForm formations={formations} />
    </div>
  );
}
