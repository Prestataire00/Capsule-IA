import { AccesApprenantClient } from './client';

export const dynamic = 'force-dynamic';

export default function AccesApprenantPage({ params }: { params: { id: string } }) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-wider text-violet-600 dark:text-violet-400 font-semibold mb-1">
          Accès apprenant
        </p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          Inviter l&apos;apprenant à son espace
        </h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Génère un lien signé personnel (valide 90 jours) que tu peux envoyer par email ou copier-coller.
        </p>
      </div>
      <AccesApprenantClient dossierId={params.id} />
    </div>
  );
}
