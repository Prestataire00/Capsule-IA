// Import d'une convention : lecture des PDF, relecture, puis création dans le CRM.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeImport } from '@/features/import/convention-types';
import { parisIso } from '@/features/import/paris-time';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('horaires locaux → instants', () => {
  it('convertit une séance d’été (Paris = UTC+2)', () => {
    expect(parisIso('2026-09-14', '10:30')).toBe('2026-09-14T08:30:00.000Z');
  });

  it('convertit une séance d’hiver (Paris = UTC+1)', () => {
    expect(parisIso('2026-12-15', '09:00')).toBe('2026-12-15T08:00:00.000Z');
  });

  it('refuse une date ou une heure mal formée', () => {
    expect(parisIso('14/09/2026', '10:30')).toBeNull();
    expect(parisIso('2026-09-14', '10h30')).toBeNull();
  });
});

describe('normalisation de ce qui a été lu', () => {
  it('écarte une séance sans date ou sans horaires exploitables', () => {
    const out = normalizeImport({
      sessions: [
        { label: 'Groupe A', date: '2026-09-14', startTime: '10:30', endTime: '12:00', modality: 'presentiel', location: '' },
        { label: 'Sans date', date: '', startTime: '10:30', endTime: '12:00', modality: 'presentiel', location: '' },
        { label: 'Fin avant début', date: '2026-09-14', startTime: '12:00', endTime: '10:30', modality: 'presentiel', location: '' },
      ],
    });
    expect(out.sessions).toHaveLength(1);
    expect(out.sessions[0]?.label).toBe('Groupe A');
  });

  it('ne garde du SIRET que 14 chiffres', () => {
    expect(normalizeImport({ client: { siret: '840 330 690 000 24' } }).client.siret).toBe('84033069000024');
  });

  it('borne la modalité aux valeurs de l’application', () => {
    expect(normalizeImport({ formations: [{ title: 'X', modality: 'e-learning' }] }).formations[0]?.modality).toBe('presentiel');
  });

  it('accepte une extraction vide sans lever', () => {
    const out = normalizeImport(null);
    expect(out.formations).toEqual([]);
    expect(out.pricing.totalHtCents).toBeNull();
    expect(out.dossier.funders).toEqual([]);
    expect(out.dossier.actionType).toBe('');
  });

  it('borne le cadre BPF aux nomenclatures de l’application', () => {
    const out = normalizeImport({
      dossier: { actionType: 'formation_pro', traineeCategory: 'salarie', signedOn: '18/08/2026' },
    });
    expect(out.dossier.actionType).toBe('');
    expect(out.dossier.traineeCategory).toBe('salarie');
    // Une date au format français n'est pas exploitable : on préfère vide à faux.
    expect(out.dossier.signedOn).toBe('');
  });

  it('écarte un financeur sans nom et retombe sur « autre » si la nature est inconnue', () => {
    const out = normalizeImport({
      dossier: { funders: [{ name: '', kind: 'opco' }, { name: 'OPCO EP', kind: 'inconnu', amountCents: 50000 }] },
    });
    expect(out.dossier.funders).toEqual([{ name: 'OPCO EP', kind: 'autre', amountCents: 50000, fileNumber: '' }]);
  });
});

describe('lecture des documents', () => {
  const extract = lire('../features/import/extract-convention.ts');

  it('envoie tous les PDF dans le même appel, lus nativement', () => {
    expect(extract).toContain("type: 'document' as const");
    expect(extract).toContain("media_type: 'application/pdf'");
  });

  it('distingue le bénéficiaire de l’organisme de formation', () => {
    expect(extract).toContain('jamais l\'organisme de formation prestataire');
    expect(extract).toContain('numéro de déclaration d\'activité (NDA)');
  });

  it('interdit d’inventer un champ absent', () => {
    expect(extract).toContain("n'invente rien");
  });

  it('borne le nombre et la taille des fichiers', () => {
    expect(extract).toContain('MAX_PDF_BYTES');
    expect(extract).toContain('MAX_TOTAL_BYTES');
    expect(extract).toContain('MAX_FILES');
  });
});

describe('création dans le CRM', () => {
  const apply = lire('../features/import/apply-convention.ts');

  it('réutilise le client existant plutôt que de le dupliquer', () => {
    expect(apply).toContain(".eq('siret', siret)");
    expect(apply).toContain(".ilike('name', payload.client.name.trim())");
  });

  it('rattache la formation au client, et survit à une base sans cette colonne', () => {
    expect(apply).toContain("client_kind: 'company'");
    expect(apply).toContain('const repli = await sb.schema(\'app\').from(\'formations\').insert(ligne as never)');
  });

  // Règle posée par Ismael le 15/09/2026 : l'import ne calcule rien, il
  // enregistre ce que la convention dit. Le tarif par stagiaire était obtenu en
  // divisant le forfait de groupe par l'effectif annoncé — un chiffre inventé,
  // qui s'affichait comme un tarif contractuel et sous-facturait dès qu'un
  // stagiaire manquait.
  it('n’invente aucun tarif par stagiaire à partir du forfait', () => {
    expect(apply).not.toContain('payload.pricing.totalHtCents / nbParticipants');
    expect(apply).toContain('default_price_cents: 0');
    expect(apply).toContain('price_cents: null');
  });

  it('conserve le forfait global de la convention, tel quel', () => {
    expect(apply).toContain('total_amount_cents: payload.pricing.totalHtCents');
    expect(apply).toContain('priceEntrepriseCents: payload.pricing.totalHtCents');
  });

  it('crée la tâche de liste nominative seulement si personne n’est nommé', () => {
    expect(apply).toContain('if (learnerIds.length === 0)');
    expect(apply).toContain('Liste nominative des stagiaires');
  });

  it('n’émet aucun devis ni facture', () => {
    expect(apply).not.toContain("from('quotes')");
    expect(apply).not.toContain("from('invoices')");
  });

  it('reprend les modules dans un programme imprimable', () => {
    expect(apply).toContain("type: 'modules'");
    expect(apply).toContain('programmeDepuisImport');
  });

  it('renseigne le cadre BPF et conserve ce que le modèle ne range pas', () => {
    expect(apply).toContain('action_type: payload.dossier.actionType || null');
    expect(apply).toContain('trainee_category: payload.dossier.traineeCategory || null');
    expect(apply).toContain('retractation_days');
    expect(apply).toContain('signed_on');
  });

  it('une convention signée ouvre un dossier engagé, pas un brouillon', () => {
    expect(apply).toContain("payload.dossier.signedOn ? 'scheduled' : 'draft'");
  });

  it('rattache les financeurs nommés, en réutilisant ceux qui existent', () => {
    expect(apply).toContain("from('dossier_funders')");
    expect(apply).toContain(".ilike('name', f.name)");
  });

  it('ne crée jamais un formateur : il est reconnu ou signalé', () => {
    expect(apply).toContain("from('trainers')");
    expect(apply).toContain('non reconnu : rattachez-le à la main');
    expect(apply).not.toMatch(/from\('trainers'\)\s*\.insert/);
  });

  it('pose le formateur reconnu sur le dossier et sur chaque séance', () => {
    expect(apply).toContain("from('dossier_trainers')");
    expect(apply).toContain("from('session_trainers')");
  });

  it('inscrit les participants avec une valeur que l’énumération accepte', () => {
    // app.participant_source = 'derived' | 'manual_add' | 'manual_remove'.
    expect(apply).toContain("source: 'manual_add'");
    expect(apply).not.toMatch(/source: 'manual'/);
  });
});

describe('routes d’import', () => {
  const extraire = lire('../app/api/import/convention/route.ts');
  const appliquer = lire('../app/api/import/convention/apply/route.ts');

  it('exigent un membre habilité sur le catalogue', () => {
    for (const src of [extraire, appliquer]) {
      expect(src).toContain('getCurrentMember');
      expect(src).toContain("can(membre.role, 'catalogue') !== 'manage'");
    }
  });

  it('la création est bornée à l’organisation du membre, jamais à une valeur reçue', () => {
    expect(appliquer).toContain('organizationId: membre.organizationId');
    expect(appliquer).toContain('userId: membre.userId');
    expect(appliquer).toContain('normalizeImport(JSON.parse(brut))');
  });

  it('refuse autre chose qu’un PDF', () => {
    expect(extraire).toContain("error: 'not_pdf'");
  });
});
