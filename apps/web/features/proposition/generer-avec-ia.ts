import 'server-only';
// Rédiger une proposition commerciale à partir du programme déposé.
//
// Claude lit le programme (PDF ou image tels quels, sinon son texte), avec la demande
// et les notes internes, et rend une proposition structurée par le schéma
// SCHEMA_PROPOSITION. Pour une V2, on lui redonne la version précédente et ce
// qu'il faut changer : il n'invente pas une autre proposition, il corrige
// celle-ci.

import { anthropic } from '@/shared/lib/ai/client';
import type { ProgrammeLu } from './preparer-programme';
import { SCHEMA_PROPOSITION, depuisSortie, normaliser, versSortie, type ContenuProposition, type SortieIA } from './contenu';

export const PROPOSITION_MODEL = 'claude-opus-5';

export type ContexteProposition = {
  organisme: { nom: string; raisonSociale: string | null; ville: string | null; nda: string | null; certifications: string | null };
  demande: Record<string, string | number | null>;
  notes: string[];
};

export type Revision = { precedente: ContenuProposition; consignes: string };

export type ResultatGeneration =
  | { ok: true; contenu: ContenuProposition }
  | { ok: false; raison: 'no_api_key' | 'refus' | 'tronque' | 'echec'; detail?: string };

const SYSTEME = `Tu rédiges les propositions commerciales d'un organisme de formation professionnelle français certifié Qualiopi.

Tu reçois le PROGRAMME conçu par le formateur (document ou image joint, quel qu'en soit le format d'origine), la DEMANDE du client et les NOTES INTERNES de l'équipe. Tu produis la proposition que l'organisme enverra au client, dans la forme attendue par le schéma, dans cet esprit :
- titre accrocheur centré sur le résultat pour le client, sous-titre qui dit la transformation, bandeau « durée · modalité, intra/inter-entreprise » ;
- présentation en 2 à 3 paragraphes : l'organisme, le contexte du client (tiré de la demande et des notes), ce que la formation change ;
- vue d'ensemble : durée totale et rythme ; un « fil rouge » en tableau (brique / ce que c'est / exemple chez le client) quand le programme s'y prête, sinon une liste vide ;
- informations générales : une ligne « Libellé : valeur » par information, dans cet ordre quand elle existe : Intitulé, Bénéficiaire, Public cible, Prérequis, Niveau d'entrée, Durée, Format, Effectif, Accessibilité, Délai d'accès, Encadrement, Organisme, Tarif ;
- objectifs globaux et compétences visées : une ligne par objectif, qui commence par un verbe d'action à l'infinitif (« Expliquer ce qu'est… », « Choisir l'outil… ») ;
- sessions et modules (sans numéro : l'application numérote), chacun avec sa durée en minutes — une pause n'est pas un module : elle ne figure pas dans la liste, et la durée totale est celle de formation effective, 1 à 3 objectifs pédagogiques, le contenu détaillé, et des livrables quand il y en a. La somme des modules doit faire la durée totale ;
- livrables remis à l'entreprise, méthodes, moyens, encadrement ; modalités d'évaluation et d'accueil en lignes « Libellé : valeur » (« Évaluation des acquis : … », « Suivi & satisfaction : … », « Accueil : … », « Accompagnement : … », « Après la formation : … ») ;
- tarif : le mode (heure par apprenant, par apprenant ou forfait groupe), le prix unitaire HT en centimes, les heures, le nombre de participants retenu et 2 à 3 autres effectifs pour le tableau des scénarios, la mention de financement (OPCO…). Ne calcule aucun total : l'application le fait.

Fidélité :
- Le programme fait foi pour le contenu : tu peux le réorganiser et le formuler pour le client, pas lui ajouter des modules, des durées ou des outils qu'il ne contient pas.
- Un prix indiqué dans la demande garde la base qu'elle lui donne : « par stagiaire, pour toute la formation » donne le mode par_apprenant à ce prix ; « prix global » donne le mode forfait à ce prix. Ne le convertis pas en tarif horaire.
- Le tarif, l'effectif, les dates, le financeur viennent des notes internes ou de la demande. Sans prix ni dans l'un ni dans l'autre, applique la grille tarifaire de l'organisme fournie dans la demande : mode heure par apprenant, au tarif de l'effectif retenu. Ce qui manque encore va dans points_a_valider, à 0. N'invente jamais un nom, un prix, un contact.
- Ce qui reste à compléter (référent handicap, dates, effectif exact…) va dans points_a_valider, et reste signalé « à compléter » dans le texte.

Cadre — impératif :
- C'est une ACTION DE FORMATION au sens de l'article L6313-1 du Code du travail : objectifs pédagogiques évaluables, programme séquencé, moyens, évaluation des acquis, pour un groupe de participants qui suivent le même programme.
- Ce n'est jamais du coaching, du mentorat, du conseil, du consulting, ni un accompagnement individuel. N'emploie pas ces mots, ni « séance individuelle ».
- Le programme n'est pas « personnalisé » ni « individualisé » : il est commun au groupe. Adapter les exemples et les ateliers au métier du client se dit « ateliers appliqués aux cas de l'entreprise » ou « contextualisés », jamais « programme personnalisé » ou « sur-mesure pour chacun ».

Écris en français, sans emoji, sans markdown dans les champs : du texte simple.`;

function contexteTexte(ctx: ContexteProposition): string {
  const lignes = (obj: Record<string, string | number | null>) =>
    Object.entries(obj)
      .filter(([, v]) => v !== null && String(v).trim() !== '')
      .map(([k, v]) => `- ${k} : ${v}`)
      .join('\n');
  return [
    `ORGANISME\n${lignes({
      Nom: ctx.organisme.nom,
      'Raison sociale': ctx.organisme.raisonSociale,
      Ville: ctx.organisme.ville,
      NDA: ctx.organisme.nda,
      Certifications: ctx.organisme.certifications,
    })}`,
    `DEMANDE\n${lignes(ctx.demande) || '(aucune information)'}`,
    `NOTES INTERNES (de la plus ancienne à la plus récente)\n${ctx.notes.length ? ctx.notes.map((n) => `- ${n}`).join('\n') : '(aucune note)'}`,
  ].join('\n\n');
}

export async function genererProposition(
  programme: Extract<ProgrammeLu, { ok: true }>,
  ctx: ContexteProposition,
  revision?: Revision,
  correction?: string[],
): Promise<ResultatGeneration> {
  const client = anthropic();
  if (!client) return { ok: false, raison: 'no_api_key' };

  const consigne = revision
    ? `Voici la proposition actuelle (JSON), puis ce que l'équipe veut changer. Produis la version suivante : applique ces changements, garde le reste tel quel.\n\nPROPOSITION ACTUELLE\n${JSON.stringify(versSortie(revision.precedente))}\n\nCHANGEMENTS DEMANDÉS\n${revision.consignes}`
    : 'Rédige la proposition à partir du programme joint.';
  const aCorriger = correction?.length
    ? `\n\nLa version précédente sortait du cadre d'une action de formation. Corrige ces points sans rien changer d'autre :\n${correction.map((c) => `- ${c}`).join('\n')}`
    : '';

  try {
    // Repli automatique côté serveur si le modèle décline la demande.
    const stream = client.beta.messages.stream({
      model: PROPOSITION_MODEL,
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01', ...programme.betas],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA_PROPOSITION } },
      system: SYSTEME,
      messages: [
        {
          role: 'user',
          content: [
            programme.bloc,
            { type: 'text', text: `${contexteTexte(ctx)}\n\n${consigne}${aCorriger}` },
          ],
        },
      ],
      // Paramètres récents (fallbacks, output_config) absents des types du SDK installé.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') return { ok: false, raison: 'refus' };
    if (message.stop_reason === 'max_tokens') return { ok: false, raison: 'tronque' };

    const brut = message.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (!brut.trim()) return { ok: false, raison: 'echec', detail: 'réponse vide' };
    return { ok: true, contenu: normaliser(depuisSortie(JSON.parse(brut) as SortieIA)) };
  } catch (error) {
    console.error('[proposition] génération impossible', error);
    return { ok: false, raison: 'echec', detail: error instanceof Error ? error.message : undefined };
  }
}
