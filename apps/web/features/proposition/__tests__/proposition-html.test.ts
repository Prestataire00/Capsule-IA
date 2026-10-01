import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { propositionHtml } from '../proposition-html';
import { propositionSolutionsTerrain } from './fixture';

describe('le document de la proposition', () => {
  it('reprend les sections de la proposition de référence et le tarif calculé', () => {
    const html = propositionHtml(propositionSolutionsTerrain(), { version: 2, organisme: 'Capsule IA' });
    for (const titre of ['Présentation', 'Informations générales', 'Objectifs globaux', 'Récapitulatif des modules', 'Détail des modules', 'Tarif']) {
      expect(html).toContain(titre);
    }
    expect(html).toContain('Proposition V2 — Capsule IA');
    expect(html).toMatch(/Formule proposée : 12 participants × 6 h × 35 € = 2\s520 € HT/);
    expect(html).toMatch(/2\s100 € HT/);
  });

  it('finale : le tarif ne montre que la ligne du devis, sans les scénarios', () => {
    const html = propositionHtml({ ...propositionSolutionsTerrain(), finale: true }, { version: 3, organisme: 'Capsule IA' });
    expect(html).not.toContain('Nombre de participants');
    expect(html).not.toContain('Formule proposée');
    expect(html).toContain('Désignation');
    // 12 participants × 6 h = 72 heures-apprenant à 35 € : la ligne du devis.
    expect(html).toMatch(/>72</);
    expect(html).toMatch(/Total : 2\s520 € HT/);
    expect(html).not.toMatch(/2\s100 € HT/);
  });

  it('échappe ce que l’IA écrit : aucun HTML injecté', () => {
    const c = propositionSolutionsTerrain();
    const html = propositionHtml({ ...c, titre: '<script>alert(1)</script>' }, { version: 1, organisme: 'X' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('le circuit devis signé → client', () => {
  const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

  it('la signature du devis accepte la proposition avant de facturer', () => {
    const service = lire('../../billing/quotes/quote-service.ts');
    const i = service.indexOf('accepterPropositionDuDevis(sb, quoteId)');
    expect(i).toBeGreaterThan(0);
    // La facture part des dossiers couverts : le dossier doit exister avant.
    expect(i).toBeLessThan(service.indexOf('await applyQuoteAmountToDossiers(sb, quoteId);'));
  });

  it('convertir à la main rattache aussi le devis de la proposition', () => {
    expect(lire('../../crm/prospect-conversion/convert-core.ts')).toContain('await rattacherDevisDeProposition(sb, prospectId, dossierId)');
  });

  it('une nouvelle version annule le devis de la précédente', () => {
    expect(lire('../service.ts')).toContain("setQuoteStatus(sb, a.quote_id, p.organization_id, 'cancelled')");
  });
});
