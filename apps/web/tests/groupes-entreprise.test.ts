import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('groupes d’une entreprise, avant toute séance', () => {
  const actions = lire('../app/(dashboard)/entreprises/[id]/groupes-actions.ts');

  it('réservé à qui gère les dossiers, sur une entreprise et un groupe de son organisme', () => {
    expect(actions).toContain("guardAction('dossiers')");
    expect(actions).toContain(".eq('organization_id', organizationId)");
    expect(actions).toContain(".not('company_id', 'is', null)");
  });

  it('seuls les salariés de l’entreprise entrent dans un groupe, et ses séances suivent', () => {
    expect(actions).toContain(".eq('company_id', g.companyId)");
    expect(actions).toContain("source: 'manual_add'");
    expect(actions).toContain(".neq('source', 'manual_remove')");
  });

  it('la fiche entreprise les propose', () => {
    expect(lire('../app/(dashboard)/entreprises/[id]/page.tsx')).toContain('<Groupes');
  });
});
