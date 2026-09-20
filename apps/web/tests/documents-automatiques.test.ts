// Recette du 20/09/2026 : sur les quatre documents censés se produire tout
// seuls, un seul le faisait réellement.
//
//   · le certificat de réalisation s'archivait bien (sendCertificatToCompany) ;
//   · la convocation partait par e-mail sans qu'aucun PDF soit conservé ;
//   · l'attestation n'existait qu'au clic sur un lien… que le stagiaire ne
//     pouvait pas ouvrir : les routes /api/dossiers/... exigent un compte du
//     personnel (canAccessDossier), et l'e-mail partait à son adresse à lui.
//     Vérifié en production : HTTP 403.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const CRON = lire('../app/api/cron/transactional-emails/route.ts');
const ARCHIVE = lire('../features/documents/archiver-automatiquement.ts');

describe('les liens envoyés au stagiaire', () => {
  it('ne pointent plus vers les routes réservées au personnel', () => {
    // C'est la garde canAccessDossier qui renvoyait « interdit ».
    expect(CRON).not.toMatch(/attestationUrl[^\n]*\/api\/dossiers\//);
    expect(CRON).not.toMatch(/certificateUrl[^\n]*\/api\/dossiers\//);
  });

  it('pointent vers l’espace du stagiaire, servi par jeton', () => {
    expect(CRON).toContain('const attestationUrl = espace ? `${espace}/documents` : null');
    expect(CRON).toContain('attestationUrl: espaceEntree ? `${espaceEntree}/documents` : null');
  });

  it('le lien d’espace est réellement fabriqué, non plus laissé vide', () => {
    // `espaceUrlFor` renvoyait `null` : aucun e-mail ne portait de lien.
    expect(CRON).toContain('generateApprenantUrl');
    expect(CRON).not.toContain('// En prod : JWT signé apprenant');
    expect(CRON.match(/await espaceUrlFor\(/g)?.length).toBe(3);
  });

  it('aucun repli sur localhost pour un lien envoyé au dehors', () => {
    expect(CRON).toContain('function origineDesLiens');
    const fn = CRON.slice(CRON.indexOf('function origineDesLiens'));
    expect(fn.slice(0, 200)).not.toContain('localhost');
  });
});

describe('archivage automatique des pièces', () => {
  it('la convocation envoyée laisse un PDF archivé', () => {
    // Sans pièce archivée, l'organisme n'a rien à produire en audit Qualiopi.
    expect(CRON).toContain("type: 'convocation'");
    expect(CRON).toContain('archiverDocument');
  });

  it('l’attestation de fin est produite à l’envoi, plus au clic', () => {
    expect(CRON).toContain("type: 'attestation_fin'");
  });

  it('un archivage manqué est signalé, jamais avalé', () => {
    // Le cron répond 500 dès la première erreur depuis e11d0f0 : encore
    // faut-il que l'échec y arrive.
    expect(CRON).toContain('archivage — ${a.raison}');
    expect(CRON).toContain('archivage — ${att.raison}');
  });

  it('l’archivage est idempotent : repasser ne crée pas de doublon', () => {
    expect(ARCHIVE).toContain('sourceKey: `${args.type}:${args.dossierId}:${args.sessionId}`');
  });

  it('l’archivage ne fait jamais échouer un envoi', () => {
    // Une pièce non archivée est un problème ; un courrier retenu en est un pire.
    expect(ARCHIVE).toContain('catch (e)');
    expect(ARCHIVE).toContain("return { ok: false, raison }");
    expect(ARCHIVE).not.toContain('throw');
  });

  it('s’appuie sur le constructeur déjà utilisé par les écrans', () => {
    // Pas de seconde implémentation qui divergerait de celle des boutons.
    expect(ARCHIVE).toContain('buildLearnerDocument');
    expect(ARCHIVE).toContain('persistGeneratedDocument');
  });
});
