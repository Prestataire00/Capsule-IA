import { describe, it, expect } from 'vitest';
import { construireDocx, docxEnBuffer } from './docx-blocs';

describe('construireDocx', () => {
  it('produit un fichier Word lisible, pages et tableau compris', async () => {
    const buffer = await docxEnBuffer(
      construireDocx({
        titre: 'Excel avancé',
        source: 'support.pdf',
        blocs: [
          { type: 'page', texte: 'Page 1', lignes: [] },
          { type: 'titre1', texte: 'Tableaux croisés', lignes: [] },
          { type: 'puce', texte: 'Insérer un TCD', lignes: [] },
          { type: 'page', texte: 'Page 2', lignes: [] },
          { type: 'tableau', texte: '', lignes: [['Fonction', 'Usage'], ['RECHERCHEX', 'Chercher une valeur']] },
        ],
      }),
    );
    // Un .docx est une archive ZIP : signature « PK ».
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
