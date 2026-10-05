import { describe, it, expect } from 'vitest';
import { mentionsDans, morceauxDuMessage } from './mentions';

const equipe = [
  { userId: 'laurie', nom: 'Laurie Martin' },
  { userId: 'faouzi', nom: 'Faouzi Ben' },
  { userId: 'marie', nom: 'Marie' },
  { userId: 'marie-c', nom: 'Marie Curie' },
];

describe('mentionsDans', () => {
  it('trouve les personnes nommées, sans tenir compte de la casse', () => {
    expect(mentionsDans('@laurie martin peux-tu relire ? cc @Faouzi Ben', equipe)).toEqual(['laurie', 'faouzi']);
  });
  it('sans @, personne n’est mentionné', () => {
    expect(mentionsDans('Laurie Martin, tu peux relire ?', equipe)).toEqual([]);
  });
  it('le nom le plus long l’emporte, et un nom ne vaut pas pour un mot plus long', () => {
    expect(mentionsDans('@Marie Curie bonjour', equipe)).toEqual(['marie-c']);
    expect(mentionsDans('@Mariette bonjour', equipe)).toEqual([]);
    expect(mentionsDans('@Marie, bonjour', equipe)).toEqual(['marie']);
  });
});

describe('morceauxDuMessage', () => {
  it('isole les mentions pour les faire ressortir', () => {
    expect(morceauxDuMessage('Merci @Laurie Martin !', ['Laurie Martin'])).toEqual([
      { texte: 'Merci ', mention: false },
      { texte: '@Laurie Martin', mention: true },
      { texte: ' !', mention: false },
    ]);
  });
});
