// Dossier de préparation à l'audit : synthèse HTML et CSV des dossiers.
import { describe, it, expect } from 'vitest';
import { renderDossiersCsv, renderSynthese, type LigneAudit } from '@/features/qualiopi/audit-synthese';

const base: LigneAudit = {
  number: 23,
  criterion: 6,
  criterionLabel: 'Inscription dans l’environnement professionnel',
  title: 'Veille légale et réglementaire',
  requirement: 'Le prestataire réalise une veille légale et réglementaire…',
  status: 'conforme',
  auto: false,
  note: null,
  evidence: [{ label: '3 entrées de veille', ok: true }],
  preuves: [],
};

describe('synthèse d’audit', () => {
  it('compte les indicateurs applicables et conformes', () => {
    const html = renderSynthese({
      organisme: 'Capsule',
      jour: '2026-09-11',
      referentiel: 'guide de lecture V9',
      lignes: [base, { ...base, number: 24, status: 'a_traiter' }, { ...base, number: 20, status: 'non_applicable' }],
      dossiers: { total: 4, prets: 3 },
    });
    expect(html).toContain('<strong>1/2</strong> indicateurs applicables conformes');
    expect(html).toContain('1 non applicables');
    expect(html).toContain('3/4 dossiers prêts');
  });

  it('échappe tout texte saisi', () => {
    const html = renderSynthese({
      organisme: '<script>alert(1)</script>',
      jour: '2026-09-11',
      referentiel: 'V9',
      lignes: [{ ...base, note: '<img src=x onerror=alert(1)>' }],
      dossiers: { total: 0, prets: 0 },
    });
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('relie les preuves jointes et signale les autres', () => {
    const html = renderSynthese({
      organisme: 'Capsule',
      jour: '2026-09-11',
      referentiel: 'V9',
      lignes: [
        {
          ...base,
          preuves: [
            { title: 'Abonnement Centre Inffo', chemin: 'preuves/I23/1-abonnement.pdf', validUntil: '2026-01-01', expiree: true },
            { title: 'Compte rendu', chemin: null, validUntil: null, expiree: false },
          ],
        },
      ],
      dossiers: { total: 0, prets: 0 },
    });
    expect(html).toContain('<a href="preuves/I23/1-abonnement.pdf">Abonnement Centre Inffo</a>');
    expect(html).toContain('(expirée)');
    expect(html).toContain('Compte rendu <em>(fichier non joint)</em>');
  });
});

describe('CSV des dossiers', () => {
  it('s’ouvre dans Excel (BOM, point-virgule) et neutralise les formules', () => {
    const csv = renderDossiersCsv([
      { reference: 'D-001', apprenant: '=HYPERLINK("x")', formation: 'Make; niveau 1', statut: 'Terminé', satisfaits: 9, applicables: 10, bloquants: 1, pret: false },
    ]);
    expect(csv.startsWith('﻿Référence;Apprenant')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"Make; niveau 1"');
    expect(csv).toContain(';9;10;1;non');
  });
});
