import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const lire = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

/**
 * Un dossier saisi après la formation ne doit rien déclencher (demande Ismael
 * du 2026-09-21). La règle vit dans `features/dossier/saisie-retroactive.ts` et
 * ses tests ; ici on vérifie qu'elle est effectivement BRANCHÉE — sans quoi
 * elle serait juste une fonction correcte que personne n'appelle.
 */
describe('les automatisations écartent les dossiers saisis après coup', () => {
  const cron = lire('../app/api/cron/transactional-emails/route.ts');

  it('le cron importe la règle', () => {
    expect(cron).toContain("from '@/features/dossier/saisie-retroactive'");
  });

  it('l’applique à chacune des automatisations qui peuvent rattraper le passé', () => {
    // Fin de dossier, retour formateur, fiche besoin, attestation d'entrée,
    // alerte émargement, règles personnalisées : six points d'entrée.
    const appels = cron.match(/automatisationApplicable\(/g) ?? [];
    expect(appels.length).toBeGreaterThanOrEqual(6);
  });

  it('lit created_at là où elle en a besoin', () => {
    // Sans cette colonne, la règle ne peut pas distinguer l'histoire du planning.
    expect(cron).toContain('created_at');
  });
});

describe('un dossier dont la formation est finie naît archivé', () => {
  const action = lire('../app/(dashboard)/dossiers/nouveau/actions.ts');

  it('calcule le statut au lieu de le figer à « draft »', () => {
    expect(action).toContain('statutALaCreation(');
    expect(action).toContain('status: statut,');
  });

  it('ne lui envoie pas de fiche besoin', () => {
    // L'envoi direct de la création ne passe pas par le cron : il a besoin de
    // sa propre garde.
    expect(action).toContain("if (statut !== 'archived')");
  });
});
