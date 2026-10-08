import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const src = lire('../features/questionnaire/evaluations-de-fin.ts');

describe('évaluations de fin de formation (point Capsule IA du 05/10/2026)', () => {
  it('se lancent dans la demi-heure qui précède la fin d’une séance', () => {
    expect(src).toContain(".gt('ends_at', maintenant.toISOString())");
    expect(src).toContain(".lte('ends_at', new Date(maintenant.getTime() + 30 * 60_000).toISOString())");
  });

  it('seulement à la dernière séance du dossier', () => {
    expect(src).toContain('dossiersDontCestLaDerniere(sb, s, loaded.dossierIds)');
    expect(src).toContain(".gt('session.ends_at', seance.ends_at)");
  });

  it('satisfaction à chaud et quiz validés, liens groupés par entreprise, une fois', () => {
    expect(src).toContain('lienSatisfaction(sb, args)');
    expect(src).toContain(".eq('validation_status', 'valide')");
    expect(src).toContain('idempotencyKey: `evaluations_fin:${s.id}:${email}`');
  });

  it('le formateur est prévenu de projeter le QR, depuis la boîte des sessions', () => {
    expect(src).toContain('/projection/satisfaction/${s.id}');
    expect(src).toContain('envoyerDepuisLaBoiteDesCours(');
  });

  it('satisfaction entreprise 24 h après, une fois, sans invalider un lien déjà envoyé', () => {
    expect(src).toContain('maintenant.getTime() - 24 * 3600_000');
    expect(src).toContain(".eq('idempotency_key', cle)");
    expect(src.indexOf(".eq('idempotency_key', cle)")).toBeLessThan(src.indexOf('generateQuestionnaireToken({ assignmentId'));
  });

  it('branchées sur le passage des 15 minutes et coupables', () => {
    const cron = lire('../app/api/cron/rappels-seances/route.ts');
    expect(cron).toContain('lancerEvaluationsDeFin(sb)');
    expect(cron).toContain('envoyerSatisfactionEntreprises(sb)');
    expect(src).toContain("sessionsAutomationOff(sb, seances.map((s) => s.id), 'evaluations_fin')");
  });
});

describe('satisfaction à chaud remplie en salle : jamais redemandée (2026-10-08)', () => {
  const seance = lire('../features/questionnaire/envoyer-questionnaire-seance.ts');
  it('ni par e-mail au stagiaire, ni par les liens relayés par l’entreprise', () => {
    // Les deux passages (stagiaire avec adresse, relais par le référent) testent la réponse avant d'envoyer.
    expect(src.match(/const \{ complete \} = await assignationSatisfaction\(sb, args\);\n\s+const satisfaction = complete \? null : await lienSatisfaction\(sb, args\);/g)?.length).toBe(2);
  });
  it('ni par un autre questionnaire à chaud coché sur la séance', () => {
    expect(seance).toContain("if (modele.kind === 'satisfaction_chaud' && c.kind === 'learner' && c.learnerId)");
    expect(seance).toContain(".eq('template.kind', 'satisfaction_chaud')");
  });
});
