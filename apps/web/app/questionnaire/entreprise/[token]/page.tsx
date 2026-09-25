// ARCHETYPE: workflow
// Le questionnaire d'une entreprise cliente, servi par la même page que celui
// d'un financeur : même jeton, même rendu, même enregistrement — seul le
// libellé change, et il se déduit du destinataire de l'assignation.
//
// Une adresse à part malgré tout : recevoir un lien « /questionnaire/financeur »
// quand on est le client, et non son financeur, sème un doute au pire moment.
export { default, dynamic } from '../../financeur/[token]/page';
