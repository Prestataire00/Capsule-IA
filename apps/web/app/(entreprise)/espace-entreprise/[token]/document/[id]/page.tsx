// ARCHETYPE: command
// Justification: lire un document produit dans la plateforme (sans fichier),
// depuis l'espace entreprise.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { documentDuReferent } from '@/features/espace-entreprise/load';

export const dynamic = 'force-dynamic';

export default async function DocumentEntreprisePage({ params }: { params: { token: string; id: string } }) {
  const lien = await verifyEntrepriseToken(params.token);
  if (!lien.ok) notFound();
  const doc = await documentDuReferent(lien.value.contactId, lien.value.organizationId, params.id);
  if (!doc?.contentHtml) notFound();

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <Link
          href={`/espace-entreprise/${params.token}`}
          className="text-[12px] text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          <ArrowLeft className="w-3 h-3" /> Mes documents
        </Link>
        <h1 className="text-[20px] font-semibold text-zinc-900 dark:text-zinc-100">{doc.title}</h1>
        {/* Isolé dans un cadre sans script : le contenu est montré, rien de plus. */}
        <iframe
          title={doc.title}
          sandbox=""
          srcDoc={doc.contentHtml}
          className="w-full h-[80vh] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white"
        />
      </div>
    </main>
  );
}
