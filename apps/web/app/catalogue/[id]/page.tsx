// ARCHETYPE: command
// Justification : page PUBLIQUE d'un programme de formation (visible par tous).
// Rend le gabarit fidèle (ProgrammeDocument) depuis les données publiées via RPC
// anon 0109. Barre d'action (retour catalogue, PDF, inscription) masquée à
// l'impression pour un export propre.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ProgrammeDocument } from '@/features/formations/programme/programme-document';
import { PrintProgrammeButton } from '@/features/formations/programme/print-button.client';
import { getPublicProgramme } from '@/features/formations/programme/load-public';

export const dynamic = 'force-dynamic';

export default async function PublicProgrammePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { org?: string };
}) {
  const result = await getPublicProgramme(params.id);
  if (!result) notFound();

  const org = (searchParams.org ?? result.organizationId).trim();

  return (
    <main className="min-h-screen bg-zinc-100">
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[820px] items-center justify-between gap-3 px-6 py-3">
          <Link
            href={`/catalogue?org=${encodeURIComponent(org)}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-600 hover:text-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" /> Catalogue
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href={`/inscription?formation=${encodeURIComponent(result.formationId)}`}
              className="rounded-lg border border-violet-200 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50"
            >
              S’inscrire
            </Link>
            <PrintProgrammeButton />
          </div>
        </div>
      </div>

      <div className="py-6 print:py-0">
        <div className="mx-auto max-w-[820px] bg-white shadow-sm print:max-w-none print:shadow-none">
          <ProgrammeDocument programme={result.programme} />
        </div>
      </div>
    </main>
  );
}
