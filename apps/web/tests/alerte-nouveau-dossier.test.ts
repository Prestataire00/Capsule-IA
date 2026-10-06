import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('alerte de la direction à chaque nouveau dossier', () => {
  const alerte = lire('../features/dossier/alerte-nouveau-dossier.ts');

  it('prévient propriétaires et administrateurs, pas l’auteur', () => {
    expect(alerte).toContain("membresParRole(sb as never, d.organization_id, ['owner', 'admin'])");
    expect(alerte).toContain('.filter((id) => id !== auteur)');
  });

  it('une seule fois par personne, e-mail et cloche', () => {
    expect(alerte).toContain('idempotencyKey: `dossier_cree:${d.id}:${userId}`');
    expect(alerte).toContain(".eq('template_code', 'dossier.created')");
  });

  it('branchée sur les trois chemins de création et sur le passage des 15 minutes', () => {
    expect(lire('../app/(dashboard)/dossiers/nouveau/actions.ts')).toContain('alerterDirectionNouveauDossier(');
    expect(lire('../features/crm/prospect-conversion/convert-core.ts')).toContain('alerterDirectionNouveauDossier(');
    expect(lire('../features/import/apply-convention.ts')).toContain('alerterDirectionNouveauDossier(');
    expect(lire('../app/api/cron/rappels-seances/route.ts')).toContain('alerterDirectionDossiersRecents(sb)');
  });
});
