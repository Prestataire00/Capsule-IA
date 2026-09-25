// « Dans le dossier, je dois voir ce qui a été envoyé, visualiser les
// questionnaires, voir si ça a été envoyé et sinon les renvoyer manuellement,
// et voir si j'ai eu une réponse » — 25/09/2026. Puis, sur la façon de
// relancer : « renvoyer l'e-mail automatiquement ».
//
// Deux destinataires sur quatre ne recevaient AUCUN e-mail : l'entreprise et
// le financeur voyaient leur lien s'afficher à l'écran, à charge pour
// l'organisme de penser à le transmettre. Un questionnaire créé puis oublié
// dans un onglet ne sert à rien.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const ACTIONS = lire('../app/(dashboard)/dossiers/[id]/questionnaires/actions.ts');
const PAGE = lire('../app/(dashboard)/dossiers/[id]/questionnaires/page.tsx');
const EMAIL = lire('../shared/lib/email/questionnaire-email.ts');
const RELANCER = lire('../app/(dashboard)/dossiers/[id]/questionnaires/relancer.client.tsx');

describe('l’envoi part maintenant par e-mail', () => {
  it('pour l’entreprise comme pour le financeur', () => {
    expect(ACTIONS.match(/envoyerLienQuestionnaire\(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(ACTIONS).toContain("destinataire: 'financeur'");
    expect(ACTIONS).toContain("destinataire: 'entreprise'");
  });

  it('avec un seul modèle d’e-mail pour les deux', () => {
    // Ce qui change d'un destinataire à l'autre tient en deux phrases. Deux
    // e-mails auraient divergé — l'un gardant l'adresse de l'organisme,
    // l'autre pas, et on ne l'aurait su qu'en les recevant.
    expect(EMAIL).toContain("destinataire: DestinataireQuestionnaire");
    expect(EMAIL).toMatch(/entreprise[\s\S]{0,400}financeur/);
  });

  it('et le lien reste affiché malgré tout', () => {
    // Sans adresse, ou si l'envoi échoue, il se transmet à la main plutôt que
    // de perdre le questionnaire.
    expect(ACTIONS).toContain('sansAdresse: !c.email');
    expect(ACTIONS).toContain('return { ok: true as const, lien, envoye, sansAdresse: !c.email }');
  });

  it('jamais d’URL relative dans un e-mail', () => {
    // Un lien relatif ne mène nulle part depuis une boîte mail. Sans adresse
    // publique, on ne tente même pas l'envoi.
    expect(ACTIONS).toContain("const base = env.PUBLIC_APP_URL?.replace(/\\/$/, '') ?? ''");
    expect(ACTIONS).toContain("if (!args.email || base === '') return false;");
  });
});

describe('la relance', () => {
  it('se fait sur la ligne de celui qui n’a pas répondu', () => {
    expect(PAGE).toContain('<Relancer assignmentId={r.id}');
    expect(RELANCER).toContain('relancerQuestionnaire');
  });

  it('ne recrée pas d’assignation', () => {
    // Un second lien vivrait en parallèle du premier, et deux réponses
    // partielles se disputeraient la même case.
    expect(ACTIONS).toMatch(/L'assignation n'est pas recréée/);
    expect(ACTIONS).toContain("eq('id', p.data.assignmentId)");
  });

  it('refuse de relancer quelqu’un qui a déjà répondu', () => {
    // La meilleure façon de ne plus jamais obtenir de réponse.
    expect(ACTIONS).toContain("if (a.status === 'completed') return { ok: false, error: 'Déjà répondu");
  });

  it('se présente comme un rappel, et pas comme un doublon', () => {
    // Un second message identique au premier laisse croire à un envoi en
    // double, et se classe en indésirable aussi vite.
    expect(EMAIL).toContain('Rappel —');
    expect(EMAIL).toContain('il est toujours ouvert');
    expect(ACTIONS).toContain('relance: true');
  });

  it('et dit franchement quand elle ne sait pas faire', () => {
    // Le stagiaire répond depuis son espace : prétendre relancer sans rien
    // envoyer serait pire que de ne rien proposer.
    expect(ACTIONS).toContain('Le stagiaire répond depuis son espace');
  });

  it('le dossier et l’organisation sont vérifiés', () => {
    // L'identifiant vient de l'écran.
    expect(ACTIONS).toMatch(/eq\('dossier_id', p\.data\.dossierId\)[\s\S]{0,120}eq\('organization_id'/);
  });
});

describe('le suivi', () => {
  it('montre la date d’envoi et l’état', () => {
    expect(PAGE).toContain('Envoyé le {new Date(r.created_at).toLocaleDateString(\'fr-FR\')}');
    expect(PAGE).toContain("r.status === 'completed' ? 'répondu' : 'en attente'");
  });

  it('mène au questionnaire lui-même', () => {
    expect(PAGE).toContain('/questionnaires/${r.template_id}/apercu');
    expect(PAGE).toContain('Lire le questionnaire');
  });

  it('et à la réponse quand il y en a une', () => {
    expect(PAGE).toContain('Voir la réponse');
  });
});
