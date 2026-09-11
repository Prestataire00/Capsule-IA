import { SectionLabel } from '@/shared/ui/section-label';
import { AccesApprenantClient } from './client';

export const dynamic = 'force-dynamic';

export default function AccesApprenantPage({ params }: { params: { id: string } }) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <SectionLabel className="mb-2">Accès apprenant</SectionLabel>
        <h2 className="text-[20px] leading-tight font-extrabold text-zinc-900 dark:text-zinc-100">
          Inviter l&apos;apprenant à son espace
        </h2>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-2">
          Génère un lien signé personnel (valide 90 jours) que tu peux envoyer par email ou copier-coller.
        </p>
      </div>
      <AccesApprenantClient dossierId={params.id} />
    </div>
  );
}
