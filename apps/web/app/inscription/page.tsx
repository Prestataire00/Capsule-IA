// ARCHETYPE: workflow
// Justification: page publique (anon) — résout le catalogue publié de l'OF du lien
// via RPC SECURITY DEFINER, puis délègue le tunnel au formulaire client.

import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { ThemeToggle } from '@/shared/ui/theme-toggle';
import { Logo } from '@/shared/ui/logo';
import { InscriptionForm, type FormationOption, type FormationCategory } from './_components/inscription-form';

type RpcFormation = {
  id: string;
  organization_id: string;
  code: string;
  title: string;
  default_modality: string;
  default_duration_hours: number;
  category: string | null;
};

const CATS = ['accounting', 'tech', 'management', 'languages', 'office', 'other'] as const;

function toOption(r: RpcFormation): FormationOption {
  const cat = (CATS as readonly string[]).includes(r.category ?? '') ? (r.category as FormationCategory) : 'other';
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    defaultHours: Number(r.default_duration_hours),
    modality: r.default_modality,
    isPublished: true,
    category: cat,
  };
}

export default async function InscriptionPage({ searchParams }: { searchParams: { formation?: string } }) {
  const preselectedId = (searchParams.formation ?? '').trim();
  const sb = supabaseServer();

  let formations: FormationOption[] = [];
  if (preselectedId) {
    // Résout la formation du lien (publiée uniquement) → détermine l'OF.
    const { data: pre } = await sb.rpc('get_published_formation' as never, { p_id: preselectedId } as never);
    const row = (Array.isArray(pre) ? pre[0] : pre) as unknown as RpcFormation | undefined;
    if (row) {
      // Catalogue publié de CET OF (org-scopé, pas d'inter-OF).
      const { data: list } = await sb.rpc('list_published_formations' as never, { p_org: row.organization_id } as never);
      const rows = ((list as unknown as RpcFormation[] | null) ?? []);
      formations = rows.map(toOption);
      // Garantit la présence de la formation présélectionnée même si filtrée.
      if (!formations.some((f) => f.id === row.id)) formations = [toOption(row), ...formations];
    }
  }

  if (formations.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-200/60 dark:border-zinc-800">
          <Logo />
          <ThemeToggle />
        </header>
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-md text-center">
            <span className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-300 flex items-center justify-center mx-auto mb-5 shadow-sm">
              <GraduationCap className="w-6 h-6" />
            </span>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Inscription à une formation</h1>
            <p className="text-[14px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Pour démarrer une pré-inscription, ouvrez le lien d'inscription d'une formation publiée
              de l'organisme. Ce lien vous amène directement au bon catalogue.
            </p>
            <Link
              href="/"
              className="inline-block mt-6 text-[13px] text-violet-600 dark:text-violet-400 hover:underline"
            >
              Retour à l'accueil
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return <InscriptionForm formations={formations} preselectedId={preselectedId} />;
}
