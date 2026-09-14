// ARCHETYPE: shared
// Bornes du fil de messages, partagées par le serveur et la zone de saisie.
// Module volontairement pur : `session-messages.ts` est `server-only`, et un
// composant client qui en importait la constante cassait la compilation.
export const MESSAGE_MAX_LENGTH = 5000;
