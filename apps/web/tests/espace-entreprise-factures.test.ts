import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('factures dans l’espace entreprise', () => {
  const route = lire('../app/api/espace-entreprise/[token]/facture/[id]/route.ts');
  const load = lire('../features/espace-entreprise/load.ts');

  it('le PDF exige le lien du référent et une facture qui est la sienne, avant toute génération', () => {
    expect(route.indexOf('verifyEntrepriseToken')).toBeLessThan(route.indexOf('factureDuReferent'));
    expect(route.indexOf('factureDuReferent')).toBeLessThan(route.indexOf('buildInvoicePdf('));
  });

  it('seulement les factures émises de ses dossiers, adressées à l’entreprise', () => {
    expect(load).toContain(".eq('contact_id' as never, contactId as never)");
    expect(load).toContain(".is('funder_id', null)");
    expect(load).toContain(".not('status', 'in', '(draft,cancelled)')");
  });

  it('la page les affiche', () => {
    expect(lire('../app/(entreprise)/espace-entreprise/[token]/page.tsx')).toContain('facturesDuReferent(');
  });
});
