// ARCHETYPE: command
// Justification : catalogue de formations PUBLIC imprimable (prospection).
// Page de garde + une formation par page + logo en en-tête de chaque page.
// Barre d'action masquée à l'impression pour un export PDF propre.

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CatalogueDocument } from '@/features/formations/programme/catalogue-document';
import { PrintProgrammeButton } from '@/features/formations/programme/print-button.client';
import { getPublicCatalogue } from '@/features/formations/programme/load-catalogue';

export const dynamic = 'force-dynamic';

export default async function CatalogueImprimerPage({
  searchParams,
}: {
  searchParams: { org?: string };
}) {
  const org = (searchParams.org ?? '').trim();
  const data = await getPublicCatalogue(org);
  const year = Number(new Date().toISOString().slice(0, 4));

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
          {data.items.length > 0 && <PrintProgrammeButton />}
        </div>
      </div>

      <div className="py-6 print:py-0">
        {data.items.length === 0 ? (
          <div className="mx-auto max-w-[820px] rounded-xl border border-zinc-200 bg-white p-10 text-center">
            <p className="text-[15px] font-medium text-zinc-800">Aucune formation publiée</p>
            <p className="mt-1 text-[13px] text-zinc-500">
              Publiez au moins une formation pour générer votre catalogue.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-[820px] bg-white shadow-sm print:max-w-none print:shadow-none">
            <CatalogueDocument orgName={data.orgName} logoUrl={data.logoUrl} items={data.items} year={year} />
          </div>
        )}
      </div>
    </main>
  );
}
