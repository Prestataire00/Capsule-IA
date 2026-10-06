// ARCHETYPE: workflow
// Justification: la discussion de l'équipe pédagogique, dossier par dossier —
// formateurs, validateurs, copie — où l'on mentionne la personne concernée.

import { redirect } from 'next/navigation';
import { SectionLabel } from '@/shared/ui/section-label';
import { accesEquipe } from '@/features/discussions/acces';
import { dossiersEnCours, equipeDuFil, libellesFils } from '@/features/discussions/equipe';
import { loadFils, loadMessagesEquipe, marquerFilLu } from '@/features/discussions/store';
import { Messagerie } from '@/features/discussions/ui/messagerie';
import { infosDuFil } from '@/features/discussions/infos-fil';
import { accesConversation, interlocuteursDe, loadConversations, loadMessagesDirects, marquerConversationLue } from '@/features/discussions/directs-store';
import { envoyerMessageDirectEquipe, envoyerMessageEquipe, ouvrirConversationEquipe } from './actions';

export const dynamic = 'force-dynamic';

export default async function MessageriePage({ searchParams }: { searchParams: { dossier?: string; direct?: string; q?: string; vue?: string } }) {
  const moi = await accesEquipe(null);
  if (!moi.ok) redirect('/');
  const choisi = searchParams.dossier && (await accesEquipe(searchParams.dossier)).ok ? searchParams.dossier : null;

  const fils = await loadFils({ organizationId: moi.organizationId, dossierIds: null, userId: moi.userId });
  const recents = await dossiersEnCours(moi.organizationId);
  const avecFil = new Set(fils.map((f) => f.dossier.id));
  const libelles = await libellesFils(
    [...recents, ...(choisi ? [choisi] : [])].filter((id) => !avecFil.has(id) || id === choisi),
  );

  const [directs, joignables] = await Promise.all([
    loadConversations(moi.userId, [moi.organizationId]),
    interlocuteursDe(moi.organizationId, { avecFormateurs: true }),
  ]);
  let direct = null;
  if (searchParams.direct && !choisi) {
    const acces = await accesConversation(searchParams.direct, moi.userId);
    const conversation = directs.find((c) => c.id === searchParams.direct);
    if (acces.ok && acces.organizationId === moi.organizationId && conversation) {
      const messagesDirects = await loadMessagesDirects(conversation.id);
      await marquerConversationLue(conversation.id, moi.userId);
      direct = { conversation, messages: messagesDirects };
    }
  }

  let ouvert = null;
  if (choisi) {
    const dossier = fils.find((f) => f.dossier.id === choisi)?.dossier ?? libelles.get(choisi);
    if (dossier) {
      const [messages, equipe, infos] = await Promise.all([loadMessagesEquipe(choisi), equipeDuFil(moi.organizationId, choisi), infosDuFil(choisi)]);
      await marquerFilLu(moi.userId, choisi);
      ouvert = { dossier, messages, equipe, infos, lien: `/dossiers/${choisi}` };
    }
  }

  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6">
      <header className="mb-4 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <SectionLabel className="mb-1">Équipe pédagogique</SectionLabel>
          <h1 className="text-[24px] leading-none font-semibold text-zinc-900 dark:text-zinc-100">Messagerie</h1>
        </div>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 max-w-md">
          Une discussion par dossier, avec ses formateurs et l&apos;équipe, et des messages directs avec qui vous voulez. La
          personne mentionnée avec @, ou destinataire d&apos;un message direct, est prévenue dans sa cloche et par e-mail.
        </p>
      </header>
      <Messagerie
        chemin="/messagerie"
        fils={fils}
        aOuvrir={[...libelles.values()].filter((d) => !avecFil.has(d.id))}
        ouvert={ouvert}
        envoyer={envoyerMessageEquipe}
        meId={moi.userId}
        recherche={searchParams.q ?? ''}
        pourMoi={searchParams.vue === 'moi'}
        directs={directs}
        joignables={joignables.filter((j) => j.userId !== moi.userId)}
        direct={direct}
        envoyerDirect={envoyerMessageDirectEquipe}
        ouvrirDirect={ouvrirConversationEquipe}
      />
    </div>
  );
}
