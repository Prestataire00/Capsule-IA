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
import { envoyerMessageDirectEquipe, envoyerMessageEquipe, ouvrirConversationEquipe, repondreAuClient } from './actions';
import { piecesAffichees } from '@/features/espace-entreprise/pieces-jointes';
import { equipeJoignable, filsClients, marquerLusParLOrganisme, messagesDuFil, referentDuDossier } from '@/features/espace-entreprise/messages-store';

export const dynamic = 'force-dynamic';

export default async function MessageriePage({ searchParams }: { searchParams: { dossier?: string; direct?: string; client?: string; avec?: string; q?: string; vue?: string } }) {
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
  // Les clients qui écrivent depuis leur espace : leur fil général, et ceux qui vous sont adressés.
  const tousLesFils = await filsClients(moi.organizationId, moi.userId);
  let client = null;
  const avec = searchParams.avec ?? null;
  const filClient = searchParams.client
    ? tousLesFils.find((c) => c.contactId === searchParams.client && c.interlocuteurUserId === avec)
    : undefined;
  const dossiersClients = await libellesFils([...new Set(tousLesFils.flatMap((c) => (c.dossierId ? [c.dossierId] : [])))]);
  if (filClient && !choisi) {
    const [messagesClient, infos, equipe] = await Promise.all([
      messagesDuFil(moi.organizationId, filClient.contactId, filClient.interlocuteurUserId),
      filClient.dossierId ? infosDuFil(filClient.dossierId) : Promise.resolve(null),
      equipeJoignable(moi.organizationId),
    ]);
    if (filClient.nonLus > 0) await marquerLusParLOrganisme(moi.organizationId, filClient.contactId, filClient.interlocuteurUserId);
    client = {
      contactId: filClient.contactId,
      interlocuteurUserId: filClient.interlocuteurUserId,
      nom: filClient.nom,
      entreprise: filClient.entreprise,
      dossier: filClient.dossierId ? (dossiersClients.get(filClient.dossierId) ?? null) : null,
      infos,
      lecteurs: filClient.interlocuteurUserId ? equipe.filter((m) => m.userId === filClient.interlocuteurUserId) : equipe,
      messages: messagesClient.map((m) => ({
        id: m.id,
        authorUserId: m.auteurUserId,
        authorName: m.auteurNom,
        body: m.body,
        mentions: [],
        createdAt: m.createdAt,
        pieces: piecesAffichees(m.id, m.pieces, '/api/messagerie/piece'),
      })),
    };
  }

  let direct = null;
  if (searchParams.direct && !choisi && !client) {
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
      const [messages, equipe, infos, referent] = await Promise.all([
        loadMessagesEquipe(choisi),
        equipeDuFil(moi.organizationId, choisi),
        infosDuFil(choisi),
        referentDuDossier(moi.organizationId, choisi),
      ]);
      await marquerFilLu(moi.userId, choisi);
      // Le même dossier, côté client : le fil général de son référent (espace entreprise).
      let duClient = null;
      if (referent) {
        const echanges = await messagesDuFil(moi.organizationId, referent.contactId, null);
        if (echanges.some((m) => m.auteur === 'entreprise' && !m.luLe)) await marquerLusParLOrganisme(moi.organizationId, referent.contactId, null);
        duClient = {
          contactId: referent.contactId,
          nom: referent.nom,
          messages: echanges.map((m) => ({
            id: m.id,
            authorUserId: m.auteurUserId,
            authorName: m.auteurNom,
            body: m.body,
            mentions: [],
            createdAt: m.createdAt,
            pieces: piecesAffichees(m.id, m.pieces, '/api/messagerie/piece'),
            origine: m.auteur === 'entreprise' ? ('client' as const) : ('vers_client' as const),
          })),
        };
      }
      ouvert = { dossier, messages, equipe, infos, lien: `/dossiers/${choisi}`, client: duClient };
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
        vue={searchParams.vue === 'moi' ? 'moi' : searchParams.vue === 'client' ? 'client' : 'tout'}
        directs={directs}
        joignables={joignables.filter((j) => j.userId !== moi.userId)}
        direct={direct}
        envoyerDirect={envoyerMessageDirectEquipe}
        ouvrirDirect={ouvrirConversationEquipe}
        clients={filClient ? tousLesFils.map((c) => (c === filClient ? { ...c, nonLus: 0 } : c)) : tousLesFils}
        dossiersClients={dossiersClients}
        client={client}
        repondreClient={client ? repondreAuClient.bind(null, client.interlocuteurUserId) : ouvert?.client ? repondreAuClient.bind(null, null) : undefined}
      />
    </div>
  );
}
