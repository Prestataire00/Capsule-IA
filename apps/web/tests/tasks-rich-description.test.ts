import { describe, expect, it } from 'vitest';
import { detailVide, nettoyerDetail, versHtmlSur } from '../features/tasks/rich-description';
import { ajouterJours } from '../features/tasks/dates';

describe('détail riche d’une tâche', () => {
  it('garde la mise en forme produite par l’éditeur', () => {
    const html =
      '<p><strong>Gras</strong> <u>souligné</u> ' +
      '<mark data-color="#fef08a" style="background-color: #fef08a; color: inherit">surligné</mark> ' +
      '<span style="font-family: Georgia, serif">police</span></p>' +
      '<table><tbody><tr><th colspan="1" rowspan="1"><p>A</p></th></tr>' +
      '<tr><td colspan="1" rowspan="1"><p>1</p></td></tr></tbody></table>';
    const propre = nettoyerDetail(html);
    expect(propre).toContain('<strong>Gras</strong>');
    expect(propre).toContain('<u>souligné</u>');
    expect(propre).toMatch(/background-color:\s*#fef08a/);
    expect(propre).toMatch(/font-family:\s*Georgia, serif/);
    expect(propre).toContain('<table>');
    expect(propre).toContain('<td');
  });

  it('retire scripts, gestionnaires d’événements et liens javascript', () => {
    const propre = nettoyerDetail(
      '<p onclick="alert(1)">ok</p><script>alert(1)</script>' +
        '<img src=x onerror=alert(1)><a href="javascript:alert(1)">lien</a>',
    );
    expect(propre).not.toMatch(/script|onclick|onerror|javascript:|<img/i);
    expect(propre).toContain('ok');
  });

  it('refuse les styles piégés', () => {
    const propre = nettoyerDetail(
      '<p><span style="background:url(javascript:alert(1))">a</span>' +
        '<span style="color: expression(alert(1))">b</span></p>',
    );
    expect(propre).not.toMatch(/url\(|expression/i);
  });

  it('ouvre les liens dans un nouvel onglet, sans accès à la page d’origine', () => {
    expect(nettoyerDetail('<p><a href="https://exemple.fr">lien</a></p>')).toMatch(/rel="noopener noreferrer"/);
  });

  it('traite un éditeur vide comme un détail absent', () => {
    expect(detailVide('<p></p>')).toBe(true);
    expect(nettoyerDetail('<p> </p>')).toBe('');
    expect(detailVide('<table><tbody><tr><td></td></tr></tbody></table>')).toBe(false);
  });

  it('affiche le texte brut des anciennes tâches sans l’interpréter', () => {
    expect(versHtmlSur('ligne 1\n<b>pas du HTML</b>')).toBe('<p>ligne 1</p><p>&lt;b&gt;pas du HTML&lt;/b&gt;</p>');
  });
});

describe('report d’échéance', () => {
  it('compte en jours calendaires, fins de mois et d’année comprises', () => {
    expect(ajouterJours('2026-09-14', 1)).toBe('2026-09-15');
    expect(ajouterJours('2026-09-28', 7)).toBe('2026-10-05');
    expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01');
    expect(ajouterJours('2028-02-28', 1)).toBe('2028-02-29');
  });
});
