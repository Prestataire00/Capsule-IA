/**
 * Questions proposées à l'ouverture de l'assistant.
 *
 * Elles vivaient dans `mock-responses.ts`, aux côtés d'un jeu de réponses
 * fabriquées citant des dossiers et des apprenants inventés. L'assistant
 * interroge en réalité une vraie action (`askAssistant`) : ces réponses étaient
 * du code mort, mais du code mort dangereux — il aurait suffi d'un import pour
 * afficher « Vous avez 3 dossiers bloquants » à un organisme qui n'en a aucun
 * (audit CAP-28).
 */
export const initialSuggestions = [
  'Quels dossiers Qualiopi sont bloqués ?',
  'Récap de la semaine',
  'Documents à signer',
  "Combien d'heures réalisées ce mois ?",
];
