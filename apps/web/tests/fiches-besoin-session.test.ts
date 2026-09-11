// Fiches besoin visibles dans la séance (organisme) et dans l'espace formateur.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('chargement des fiches besoin d’une séance', () => {
  const src = lire('../features/questionnaire/session-needs.ts');

  it('lit les réponses au positionnement puis, à défaut, celles de l’inscription', () => {
    expect(src).toContain("eq('kind', 'positionnement')");
    expect(src).toContain("from('questionnaire_responses')");
    expect(src).toContain("from('prospects')");
    expect(src).toContain('needs_analysis');
  });

  it('borne le repli inscription à l’organisme et aux e-mails des participants', () => {
    expect(src).toContain(".eq('organization_id', opts.organizationId)");
    expect(src).toContain(".in('email', emails)");
  });

  it('préfère le prospect converti sur le dossier du participant', () => {
    expect(src).toContain('x.converted_dossier_id === p.dossierId');
  });

  it('distingue fiche reçue, envoyée sans réponse, et absente', () => {
    for (const s of ["'recue'", "'envoyee'", "'absente'"]) expect(src).toContain(s);
  });

  it('restitue la situation professionnelle saisie à l’inscription', () => {
    expect(src).toContain('typologyContext');
  });
});

describe('onglet Fiches besoin de la séance', () => {
  const page = lire('../app/(dashboard)/sessions/[id]/fiches-besoin/page.tsx');

  it('utilise le chargeur partagé et la carte partagée', () => {
    expect(page).toContain('loadSessionNeeds');
    expect(page).toContain('NeedsCard');
  });

  it('lit avec le client de la requête (RLS), jamais en service role', () => {
    expect(page).toContain('supabaseServer()');
    expect(page).not.toContain('supabaseAdmin');
  });
});

describe('fiches besoin dans l’espace formateur', () => {
  const page = lire('../app/(formateur)/seance/[id]/fiches-besoin/page.tsx');

  it('garde la séance du formateur avant toute lecture en service role', () => {
    expect(page).toContain('requireMyTrainerSession');
    expect(page.indexOf('requireMyTrainerSession')).toBeLessThan(page.indexOf('supabaseAdmin()'));
    expect(page).toContain('if (!acces.ok) notFound();');
  });

  it('affiche les mêmes fiches que la séance côté organisme', () => {
    expect(page).toContain('loadSessionNeeds');
    expect(page).toContain('NeedsCard');
  });

  it('est accessible depuis la carte de séance du formateur', () => {
    expect(lire('../features/trainer-space/session-card.tsx')).toContain('/fiches-besoin');
  });
});
