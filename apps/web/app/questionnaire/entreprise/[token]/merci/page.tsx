// ARCHETYPE: workflow
// La page de remerciement de l'entreprise, servie par celle du financeur.
// Sans ce chemin, répondre menait à une adresse qui n'existe pas : le client
// aurait vu une page d'erreur juste après avoir pris le temps de répondre.
export { default } from '../../../financeur/[token]/merci/page';
