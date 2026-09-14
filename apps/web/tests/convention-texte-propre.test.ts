// Les champs « riches » du catalogue sont stockés en HTML. Passés tels quels à
// pdf-lib, ils imprimaient `<p><strong>Méthodes pédagogiques :</strong>…` en
// toutes lettres sur la convention remise au client (constaté le 2026-09-14).
// Ces garde-fous vérifient la réduction en blocs, et qu'aucune balise ne
// ressort dans le PDF produit.
import { inflateSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import { richTextBlocks, richTextToPlain } from '@/features/documents/rich-text';
import { generateConventionPDF, type ConventionInput } from '@/features/documents/generate-convention-pdf';

const HTML_REEL =
  '<p><strong>Méthodes pédagogiques :</strong> Apports théoriques</p>' +
  '<p>Mise en pratique, Études de cas concrets.</p>' +
  '<ul><li>Exercices individuels</li><li>Support numérique remis en fin de formation</li></ul>';

describe('richTextBlocks', () => {
  it('rend des paragraphes et des puces, sans une seule balise', () => {
    const blocs = richTextBlocks(HTML_REEL);
    expect(blocs).toEqual([
      { kind: 'p', text: 'Méthodes pédagogiques : Apports théoriques' },
      { kind: 'p', text: 'Mise en pratique, Études de cas concrets.' },
      { kind: 'li', text: 'Exercices individuels' },
      { kind: 'li', text: 'Support numérique remis en fin de formation' },
    ]);
    expect(richTextToPlain(HTML_REEL)).not.toMatch(/<|>/);
  });

  it('décode les entités et coupe sur les <br>', () => {
    expect(richTextToPlain('Devis&nbsp;&amp; facture<br>Deuxi&egrave;me ligne')).toBe(
      'Devis & facture\nDeuxième ligne',
    );
  });

  it('laisse le texte brut intact et ne rend rien pour un champ vide', () => {
    expect(richTextToPlain('Tout public')).toBe('Tout public');
    expect(richTextBlocks('<p></p><p>  </p>')).toEqual([]);
    expect(richTextBlocks(null)).toEqual([]);
  });
});

const base: ConventionInput = {
  organization: {
    name: 'Capsule IA',
    siret: '98953111600014',
    nda: '11756789012',
    address: '25 rue Romain Rolland, 45100 Orléans',
    representativeName: null,
    contactEmail: 'contact@capsule-ia.fr',
  },
  signaturePng: null,
  stampPng: null,
  logoPng: null,
  representativeTitle: 'Gérant',
  place: 'Orléans',
  learner: {
    firstName: 'Léa',
    lastName: 'Zola',
    email: 'lea@acme.fr',
    birthDate: '1991-03-02',
    address: null,
  },
  company: { name: 'Acme', siret: '55203253400646', address: null, representative: 'Paul Client' },
  funder: null,
  formation: {
    title: "Usage de l'IA générative",
    description: null,
    objectives: ['<p>Poser un cadre commun</p>'],
    targetAudience: '<p>Tout collaborateur</p>',
    prerequisites: [],
    evaluationMethod: "<p>Quiz d'auto-évaluation et exercice final.</p>",
    pedagogicalMethod: HTML_REEL,
  },
  dossier: {
    reference: 'DOS-2026-5B372565',
    startDate: '2026-09-14',
    endDate: '2026-10-12',
    totalHours: 5,
    modality: 'presentiel',
    totalAmountCents: 144000,
    currency: 'EUR',
    accessibilityNotes: null,
  },
  generatedAt: new Date('2026-09-14T09:00:00Z'),
};

/** pdf-lib écrit le texte tracé en chaînes hexadécimales : `<45786...> Tj`. */
const decodeHex = (flux: string): string =>
  flux.replace(/<([0-9A-Fa-f]{2,})>/g, (tout, hex: string) =>
    hex.length % 2 === 0 ? Buffer.from(hex, 'hex').toString('latin1') : tout,
  );

/**
 * pdf-lib compresse ses flux de contenu : lire les octets bruts ne montre rien.
 * On décompresse chaque `stream … endstream` pour retrouver le texte tracé
 * (encodé WinAnsi, donc les mots recherchés ici restent en ASCII).
 */
const texteDuPdf = (bytes: Uint8Array): string => {
  const brut = Buffer.from(bytes);
  let sortie = brut.toString('latin1');
  let i = 0;
  for (;;) {
    const mot = brut.indexOf('stream', i);
    if (mot < 0) break;
    const fin = brut.indexOf('endstream', mot + 6);
    if (fin < 0) break;
    // Le mot-clé `stream` est suivi d'un saut de ligne qui ne fait pas partie du flux.
    let debut = mot + 'stream'.length;
    while (brut[debut] === 0x0d || brut[debut] === 0x0a) debut += 1;
    try {
      sortie += decodeHex(inflateSync(brut.subarray(debut, fin)).toString('latin1'));
    } catch {
      // Flux non compressé (image, xref) : rien à en tirer, on passe.
    }
    i = fin + 'endstream'.length;
  }
  return sortie;
};

describe('generateConventionPDF', () => {
  it("n'imprime plus de balises HTML", async () => {
    const pdf = texteDuPdf(await generateConventionPDF(base));
    // Le contenu, lui, est bien là : c'est le balisage qui a disparu.
    expect(pdf).toContain('Apports th');
    expect(pdf).toContain('Exercices individuels');
    expect(pdf).not.toContain('<strong>');
    expect(pdf).not.toContain('</p>');
  });

  it("l'exemplaire du stagiaire ne nomme que lui, celui de l'entreprise les liste tous", async () => {
    const participants = [
      { firstName: 'Léa', lastName: 'Zola', email: 'lea@acme.fr', birthDate: null },
      { firstName: 'Sam', lastName: 'Abel', email: 'sam@acme.fr', birthDate: null },
    ];

    const stagiaire = texteDuPdf(
      await generateConventionPDF({ ...base, participants, audience: 'stagiaire' }),
    );
    expect(stagiaire).toContain('Exemplaire du stagiaire');
    expect(stagiaire).not.toContain('Abel');

    const entreprise = texteDuPdf(
      await generateConventionPDF({ ...base, participants, audience: 'entreprise' }),
    );
    expect(entreprise).toContain("Exemplaire de l'entreprise");
    expect(entreprise).toContain('Abel');
  });

  it("sans participants, le document reste l'exemplaire du stagiaire", async () => {
    const pdf = texteDuPdf(await generateConventionPDF(base));
    expect(pdf).toContain('Exemplaire du stagiaire');
  });
});
