import type { ContenuProposition } from '../contenu';

/** La proposition Solutions Terrain, telle que Laurie l'a rédigée (PDF de référence). */
export const propositionSolutionsTerrain = (): ContenuProposition => ({
  titre: "Construire l'écosystème IA de Solutions Terrain",
  sous_titre: "De l'usage isolé de ChatGPT à un « deuxième cerveau » partagé au service de la collecte de données",
  bandeau: '6 heures (2 sessions de 3 h) · Distanciel synchrone, intra-entreprise',
  presentation: ['Capsule IA est un organisme de formation spécialisé…'],
  duree_totale_heures: 6,
  rythme: "2 sessions de 3 h espacées d'une semaine",
  fil_rouge_titre: "Le fil rouge : l'écosystème IA de Solutions Terrain",
  fil_rouge: [{ brique: '1. Le socle', definition: 'Un ou deux LLM choisis', exemple: 'Fin des comptes dispersés' }],
  informations: [{ libelle: 'Public cible', valeur: 'Encadrement de Solutions Terrain' }],
  objectifs: [{ verbe: 'Expliquer', texte: "ce qu'est un écosystème IA" }],
  competences: [{ verbe: 'Rédiger', texte: 'des consignes structurées' }],
  sessions: [
    {
      titre: "Session 1 – Poser les fondations de l'écosystème",
      duree_heures: 3,
      modules: [{ numero: 1, titre: 'Positionnement', duree_minutes: 20, objectifs: ['Situer son niveau'], contenus: ['Tour de table par pôle'], livrables: '' }],
    },
  ],
  intersession: '',
  adaptation: ['Sous-groupes par pôle pendant les sessions.'],
  livrables: ["La cartographie de l'écosystème IA"],
  methodes: ['Expositive', 'Active'],
  moyens: ['Classe virtuelle (Teams)'],
  encadrement: 'Formateur expert en intelligence artificielle',
  evaluation: [{ libelle: 'Évaluation des acquis', valeur: 'QCM et mise en situation' }],
  accueil: [{ libelle: 'Accueil', valeur: 'Email de bienvenue' }],
  tarif: { mode: 'heure_apprenant', prix_unitaire_cents: 3500, heures: 6, participants: 12, scenarios_participants: [10, 15], financement: 'OPCO Atlas' },
  points_a_valider: [],
});
