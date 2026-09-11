// Documents de la séance façon RFC : documents par stagiaire (aperçu, e-mail,
// signature), convocation PDF, aperçu PDF sur la page de signature.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('catalogue des documents du stagiaire', () => {
  const src = lire('../features/documents/learner-documents.ts');

  it('couvre les documents attendus d’une séance', () => {
    for (const t of ['convocation', 'convention', 'attestation_entree', 'attestation_fin', 'certificat', 'programme']) {
      expect(src).toContain(`'${t}'`);
    }
  });

  it('n’ouvre la signature qu’à la convocation et à la convention', () => {
    const signables = [...src.matchAll(/type: '([a-z_]+)'[^\n]*signable: (true|false)/g)].map((m) => [m[1], m[2]]);
    expect(signables).toEqual([
      ['convocation', 'true'],
      ['convention', 'true'],
      ['attestation_entree', 'false'],
      ['attestation_fin', 'false'],
      ['certificat', 'false'],
      ['programme', 'false'],
    ]);
  });

  it('l’aperçu passe par les routes dossier déjà gardées', () => {
    expect(src).toContain('/api/dossiers/${dossierId}/convocation.pdf?session=${sessionId}');
    expect(src).toContain('/api/dossiers/${dossierId}/attestation.pdf');
  });

  it('le taux de présence n’entre que dans l’attestation de fin', () => {
    expect(src).toContain("variant === 'fin' ? await computeDossierAttendanceRate");
  });
});

describe('convocation', () => {
  const pdf = lire('../features/documents/build-convocation-pdf.ts');
  const route = lire('../app/api/dossiers/[id]/convocation.pdf/route.ts');

  it('porte les mentions attendues', () => {
    for (const m of ['Date :', 'Horaires :', 'Modalité :', 'Lieu :', 'Formateur :', 'Dossier :']) {
      expect(pdf).toContain(m);
    }
  });

  it('la route est gardée et exige la séance', () => {
    expect(route).toContain('canAccessDossier');
    expect(route).toContain("error: 'session_required'");
  });
});

describe('actions documents de la séance', () => {
  const actions = lire('../app/(dashboard)/sessions/[id]/documents/actions.ts');

  it('réservées aux rôles qui gèrent les dossiers', () => {
    expect(actions).toContain("can(membre.role, 'dossiers') !== 'manage'");
    expect(actions).toContain('getCurrentMember');
  });

  it('vérifie que le dossier est rattaché à la séance avant toute génération', () => {
    expect(actions).toContain("from('session_dossiers')");
    expect(actions).toContain("error: 'dossier_not_in_session'");
    expect(actions.indexOf('dossier_not_in_session')).toBeLessThan(actions.indexOf('buildLearnerDocument(admin'));
  });

  it('borne la séance à l’organisme du membre', () => {
    expect(actions).toContain(".eq('organization_id', membre.organizationId)");
  });

  it('journalise l’envoi par type de document et archive le document', () => {
    expect(actions).toContain('kind: `document:${g.type}`');
    expect(actions).toContain('persistGeneratedDocument');
  });

  it('la mise en signature refuse les documents non signables', () => {
    expect(actions).toContain("error: 'not_signable'");
    expect(actions).toContain('request_token_hash');
  });
});

describe('statut affiché dans l’onglet', () => {
  const page = lire('../app/(dashboard)/sessions/[id]/documents/page.tsx');

  it('lit le dernier envoi dans le journal d’e-mails et la dernière signature', () => {
    expect(page).toContain("from('email_log')");
    expect(page).toContain("from('document_signatures')");
    expect(page).toContain('LearnerDocuments');
  });

  it('lit sous RLS, sans service role', () => {
    expect(page).toContain('supabaseServer()');
    expect(page).not.toContain('supabaseAdmin');
  });
});

describe('page de signature', () => {
  const page = lire('../app/(apprenant)/signer/document/[token]/page.tsx');
  const route = lire('../app/api/signer/document/[token]/fichier/route.ts');

  it('affiche le PDF du document, plus seulement le HTML', () => {
    expect(page).toContain('/api/signer/document/${params.token}/fichier');
    expect(page).toContain('storage_path');
  });

  it('le fichier n’est servi qu’au porteur d’un jeton valide, pour SON document', () => {
    expect(route).toContain('verifyDocumentSignatureToken');
    expect(route).toContain('sig.document_id !== verified.value.documentId');
  });
});
