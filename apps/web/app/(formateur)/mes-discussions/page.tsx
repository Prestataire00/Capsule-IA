// ARCHETYPE: workflow
// Justification: le formateur échange avec l'équipe de l'organisme, dossier par
// dossier, en mentionnant la personne concernée.

import { notFound } from 'next/navigation';
import { accesFormateur, mesDossiersFormateur } from '@/features/discussions/acces';
import { equipeDuFil, libellesFils } from '@/features/discussions/equipe';
import { loadFils, loadMessagesEquipe, marquerFilLu } from '@/features/discussions/store';
import { Messagerie } from '@/features/discussions/ui/messagerie';
import { infosDuFil } from '@/features/discussions/infos-fil';
import { envoyerMessageFormateur } from './actions';

export const dynamic = 'force-dynamic';

export default async function MesDiscussionsPage({ searchParams }: { searchParams: { dossier?: string; q?: string; vue?: string } }) {
  const mesDossiers = await mesDossiersFormateur();
  if (mesDossiers.length === 0 && !searchParams.dossier) {
    return (
      <div className="max-w-5xl w-full mx-auto px-6 py-8">
        <h1 className="text-[24px] font-semibold text-zinc-900 dark:text-zinc-100">Discussions</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3">Aucun dossier ne vous est encore confié.</p>
      </div>
    );
  }

  const choisi = searchParams.dossier && mesDossiers.includes(searchParams.dossier) ? searchParams.dossier : null;
  const acces = choisi ? await accesFormateur(choisi) : null;
  if (choisi && !acces?.ok) notFound();

  const premier = mesDossiers[0]!;
  const moi = acces?.ok ? acces : await accesFormateur(premier);
  if (!moi.ok) notFound();

  const fils = await loadFils({ organizationId: null, dossierIds: mesDossiers, userId: moi.userId });
  const avecFil = new Set(fils.map((f) => f.dossier.id));
  const libelles = await libellesFils(mesDossiers);

  let ouvert = null;
  if (choisi && acces?.ok) {
    const dossier = libelles.get(choisi);
    if (dossier) {
      const [messages, equipe, infos] = await Promise.all([loadMessagesEquipe(choisi), equipeDuFil(acces.organizationId, choisi), infosDuFil(choisi)]);
      await marquerFilLu(acces.userId, choisi);
      // Le formateur ouvre sa séance ; un dossier n'a pas de page dans son espace.
      ouvert = { dossier, messages, equipe, infos, lien: infos?.kind === 'seance' ? `/seance/${choisi}` : null };
    }
  }

  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 space-y-4">
      <header>
        <h1 className="text-[24px] font-semibold text-zinc-900 dark:text-zinc-100">Discussions</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2 max-w-2xl">
          Une discussion par dossier avec l&apos;équipe de l&apos;organisme. Mentionnez la personne concernée avec @ : elle
          est prévenue.
        </p>
      </header>
      <Messagerie
        chemin="/mes-discussions"
        fils={fils}
        aOuvrir={[...libelles.values()].filter((d) => !avecFil.has(d.id))}
        ouvert={ouvert}
        recherche={searchParams.q ?? ''}
        pourMoi={searchParams.vue === 'moi'}
        envoyer={envoyerMessageFormateur}
        meId={moi.userId}
      />
    </div>
  );
}
