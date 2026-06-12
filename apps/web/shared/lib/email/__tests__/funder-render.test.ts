import { describe, it, expect } from 'vitest';
import { renderFunderEmail } from '../funder-render';

describe('renderFunderEmail', () => {
  it('remplace les variables {{...}} dans le sujet et le corps', () => {
    const out = renderFunderEmail(
      {
        subjectTemplate: 'Dossier {{stagiaire}}',
        bodyTemplate: 'Formation du {{date_debut}} au {{date_fin}}',
      },
      { stagiaire: 'Jean Dupont', date_debut: '01/07/2026', date_fin: '10/07/2026' },
    );
    expect(out.subject).toBe('Dossier Jean Dupont');
    expect(out.bodyHtml).toBe('Formation du 01/07/2026 au 10/07/2026');
  });

  it('vide les placeholders inconnus plutôt que de laisser le littéral', () => {
    const out = renderFunderEmail({ subjectTemplate: 'X {{inconnu}}', bodyTemplate: 'Y' }, {});
    expect(out.subject).toBe('X ');
    expect(out.bodyHtml).toBe('Y');
  });

  it('convertit les sauts de ligne du corps en <br/>', () => {
    const out = renderFunderEmail({ subjectTemplate: 'S', bodyTemplate: 'Bonjour,\n\nCordialement' }, {});
    expect(out.bodyHtml).toBe('Bonjour,<br/><br/>Cordialement');
  });

  it('échappe le HTML injecté via les variables', () => {
    const out = renderFunderEmail(
      { subjectTemplate: 'S', bodyTemplate: 'Nom: {{nom}}' },
      { nom: '<script>alert(1)</script>' },
    );
    expect(out.bodyHtml).toBe('Nom: &lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
