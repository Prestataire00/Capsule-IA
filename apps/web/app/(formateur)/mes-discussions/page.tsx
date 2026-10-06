// ARCHETYPE: workflow
// Justification: le formateur échange avec l'équipe de l'organisme, dossier par
// dossier, en mentionnant la personne concernée.

import { notFound } from 'next/navigation';
import { accesFormateur, mesDossiersFormateur, moiFormateur } from '@/features/discussions/acces';
import { accesConversation, interlocuteursDe, loadConversations, loadMessagesDirects, marquerConversationLue } from '@/features/discussions/directs-store';
import { equipeDuFil, libellesFils } from '@/features/discussions/equipe';
import { loadFils, loadMessagesEquipe, marquerFilLu } from '@/features/discussions/store';
import { Messagerie } from '@/features/discussions/ui/messagerie';
import { infosDuFil } from '@/features/discussions/infos-fil';
import { envoyerMessageDirectFormateur, envoyerMessageFormateur, ouvrirConversationFormateur } from './actions';

export const dynamic = 'force-dynamic';

export default async function MesDiscussionsPage({ searchParams }: { searchParams: { dossier?: string; direct?: string; q?: string; vue?: string } }) {
  const [mesDossiers, identite] = await Promise.all([mesDossiersFormateur(), moiFormateur()]);
  if (!identite.ok) {
    return (
      <div className="max-w-5xl w-full mx-auto px-6 py-8">
        <h1 className="text-[24px] font-semibold text-zinc-900 dark:text-zinc-100">Discussions</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3">Aucun organisme ne vous a encore confié de formation.</p>
      </div>
    );
  }

  const choisi = searchParams.dossier && mesDossiers.includes(searchParams.dossier) ? searchParams.dossier : null;
  const acces = choisi ? await accesFormateur(choisi) : null;
  if (choisi && !acces?.ok) notFound();

  const [fils, libelles, directs, equipes] = await Promise.all([
    mesDossiers.length ? loadFils({ organizationId: null, dossierIds: mesDossiers, userId: identite.userId }) : Promise.resolve([]),
    libellesFils(mesDossiers),
    loadConversations(identite.userId, identite.organizationIds),
    Promise.all(identite.organizationIds.map((org) => interlocuteursDe(org, { avecFormateurs: false }))),
  ]);
  const avecFil = new Set(fils.map((f) => f.dossier.id));
  const vus = new Set<string>();
  const joignables = equipes.flat().filter((j) => j.userId !== identite.userId && !vus.has(j.userId) && vus.add(j.userId));

  let ouvert = null;
  if (choisi && acces?.ok) {
    const dossier = libelles.get(choisi);
    if (dossier) {
      const [messages, equipe, infos] = await Promise.all([loadMessagesEquipe(choisi), equipeDuFil(acces.organizationId, choisi), infosDuFil(choisi)]);
      await marquerFilLu(acces.userId, choisi);
      // Un dossier n'a pas de page dans l'espace formateur.
      ouvert = { dossier, messages, equipe, infos, lien: null };
    }
  }

  let direct = null;
  if (searchParams.direct && !choisi) {
    const a = await accesConversation(searchParams.direct, identite.userId);
    const conversation = directs.find((c) => c.id === searchParams.direct);
    if (a.ok && conversation) {
      const messagesDirects = await loadMessagesDirects(conversation.id);
      await marquerConversationLue(conversation.id, identite.userId);
      direct = { conversation, messages: messagesDirects };
    }
  }

  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 space-y-4">
      <header>
        <h1 className="text-[24px] font-semibold text-zinc-900 dark:text-zinc-100">Discussions</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2 max-w-2xl">
          Une discussion par dossier avec l&apos;équipe de l&apos;organisme, et des messages directs avec l&apos;équipe pour le
          reste. Mentionnez la personne concernée avec @ : elle est prévenue.
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
        meId={identite.userId}
        directs={directs}
        joignables={joignables}
        direct={direct}
        envoyerDirect={envoyerMessageDirectFormateur}
        ouvrirDirect={ouvrirConversationFormateur}
      />
    </div>
  );
}
