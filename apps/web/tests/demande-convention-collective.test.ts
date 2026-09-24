// La convention collective détermine l'OPCO de rattachement et le barème : la
// demander au moment de la demande évite un aller-retour sur chaque dossier
// salarié. `app.companies` portait déjà la colonne ; c'est la demande qui ne la
// captait pas.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { prospectFieldsSchema, companyEnrollmentSchema } from '@/app/inscription/schema';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('colonne de la demande', () => {
  const sql = lire('../../../supabase/migrations/0185_demande_convention_collective.sql');

  it('ajoute la colonne sans casser l’existant', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS convention_collective');
    expect(sql).toContain('length(convention_collective) <= 200');
  });

  it('reste facultative : une demande ne doit pas échouer faute de la connaître', () => {
    expect(sql).toContain('convention_collective IS NULL OR');
    expect(sql).not.toMatch(/convention_collective\s+TEXT\s+NOT NULL/);
  });
});

describe('saisie côté formulaire public', () => {
  const base = {
    firstName: 'Claire',
    lastName: 'Dubois',
    email: 'claire@exemple.fr',
    phone: '0612345678',
    rqth: false,
    situation: 'salarie' as const,
    companyName: 'Acme',
    companySiret: '12345678900012',
    funderKinds: ['opco' as const],
  };

  const salarie = { firstName: 'Claire', lastName: 'Dubois', email: 'claire@acme.fr', phone: '0612345678', rqth: false };

  it('accepte une convention désignée par son IDCC', () => {
    const r = prospectFieldsSchema.safeParse({ ...base, conventionCollective: '1486' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.conventionCollective).toBe('1486');
  });

  it('accepte aussi son intitulé en toutes lettres', () => {
    const r = prospectFieldsSchema.safeParse({ ...base, conventionCollective: 'Bureaux d’études techniques' });
    expect(r.success).toBe(true);
  });

  it('reste facultative dans les deux parcours', () => {
    expect(prospectFieldsSchema.safeParse(base).success).toBe(true);
    const entreprise = companyEnrollmentSchema.safeParse({
      companyName: 'Acme',
      companySiret: '12345678900012',
      referentName: 'Paul',
      referentEmail: 'paul@acme.fr',
      funderKinds: ['opco'],
      employees: [salarie],
    });
    expect(entreprise.success, JSON.stringify(entreprise.error?.flatten().fieldErrors)).toBe(true);
  });
});

describe('la donnée circule jusqu’au bout', () => {
  it('est enregistrée sur la demande, dans les deux parcours publics', () => {
    const src = lire('../app/inscription/actions.ts');
    expect(src.match(/convention_collective:/g)?.length).toBe(2);
    // Un particulier s'inscrit en son nom : la branche de l'employeur qu'il
    // cite ne le concerne pas, comme le SIRET.
    expect(src).toContain('convention_collective: isIndividual ? null : fields.conventionCollective || null');
  });

  it('est saisissable aussi depuis la demande créée à la main', () => {
    expect(lire('../app/(dashboard)/prospects/nouvelle/actions.ts')).toContain('convention_collective: orNull(v.conventionCollective)');
    expect(lire('../app/(dashboard)/prospects/nouvelle/demande-form.client.tsx')).toContain('Convention collective');
  });

  it('s’affiche sur la fiche de la demande dans le CRM', () => {
    const src = lire('../app/(dashboard)/prospects/[id]/page.tsx');
    expect(src).toContain('convention_collective, funder_kinds');
    // On vérifie qu'elle est affichée, pas avec quel composant : elle est
    // passée du bandeau de droite à la carte de tête le 24/09/2026, et le test
    // épinglait `<SummaryRow>` — il tombait pour un écran pourtant correct.
    expect(src).toMatch(/label="Convention collective"\s+value=\{prospect\.convention_collective/);
  });

  it('est reportée sur la fiche entreprise à la conversion', () => {
    const src = lire('../features/crm/prospect-conversion/convert-core.ts');
    expect(src).toContain('convention_collective: p.convention_collective?.trim() || null');
    // Sur une entreprise déjà connue, on complète sans écraser une saisie
    // manuelle — même règle que pour le SIRET et l'adresse.
    expect(src).toContain('if (!existing.convention_collective && p.convention_collective?.trim())');
  });

  it('figure dans le récapitulatif envoyé au demandeur', () => {
    const src = lire('../app/inscription/actions.ts');
    expect(src.match(/add\('Convention collective'/g)?.length).toBe(2);
  });
});
