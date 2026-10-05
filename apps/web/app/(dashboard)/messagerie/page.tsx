// ARCHETYPE: workflow
// Justification: la discussion de l'équipe pédagogique, dossier par dossier —
// formateurs, validateurs, copie — où l'on mentionne la personne concernée.

import { redirect } from 'next/navigation';
import { SectionLabel } from '@/shared/ui/section-label';
import { accesEquipe } from '@/features/discussions/acces';
import { dossiersEnCours, equipeDuFil, libellesFils } from '@/features/discussions/equipe';
import { loadFils, loadMessagesEquipe, marquerFilLu } from '@/features/discussions/store';
import { Messagerie } from '@/features/discussions/ui/messagerie';
import { envoyerMessageEquipe } from './actions';

export const dynamic = 'force-dynamic';

export default async function MessageriePage({ searchParams }: { searchParams: { dossier?: string } }) {
  const moi = await accesEquipe(null);
  if (!moi.ok) redirect('/');
  const choisi = searchParams.dossier && (await accesEquipe(searchParams.dossier)).ok ? searchParams.dossier : null;

  const fils = await loadFils({ organizationId: moi.organizationId, dossierIds: null, userId: moi.userId });
  const recents = await dossiersEnCours(moi.organizationId);
  const avecFil = new Set(fils.map((f) => f.dossier.id));
  const libelles = await libellesFils(
    [...recents, ...(choisi ? [choisi] : [])].filter((id) => !avecFil.has(id) || id === choisi),
  );

  let ouvert = null;
  if (choisi) {
    const dossier = fils.find((f) => f.dossier.id === choisi)?.dossier ?? libelles.get(choisi);
    if (dossier) {
      const [messages, equipe] = await Promise.all([loadMessagesEquipe(choisi), equipeDuFil(moi.organizationId, choisi)]);
      await marquerFilLu(moi.userId, choisi);
      ouvert = { dossier, messages, equipe };
    }
  }

  return (
    <div className="max-w-6xl w-full mx-auto px-8 py-9">
      <header className="mb-7">
        <SectionLabel className="mb-2">Équipe pédagogique</SectionLabel>
        <h1 className="text-[30px] leading-none font-semibold text-zinc-900 dark:text-zinc-100">Messagerie</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3 max-w-2xl">
          Une discussion par dossier (ou par séance sans dossier), entre ses formateurs et l&apos;équipe. Mentionnez la personne concernée avec @ :
          elle est prévenue dans sa cloche et par e-mail.
        </p>
      </header>
      <Messagerie
        chemin="/messagerie"
        fils={fils}
        aOuvrir={[...libelles.values()].filter((d) => !avecFil.has(d.id))}
        ouvert={ouvert}
        envoyer={envoyerMessageEquipe}
        meId={moi.userId}
      />
    </div>
  );
}
