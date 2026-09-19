// Un e-mail transactionnel qui part deux fois, c'est une convocation en double
// chez l'apprenant et chez l'entreprise cliente. La déduplication doit être
// arbitrée par la base — une lecture préalable ne résiste ni au rejeu HTTP, ni
// à deux passages du cron, ni à deux instances en parallèle.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('contrainte d’unicité en base', () => {
  const sql = lire('../../../supabase/migrations/0180_email_log_idempotence.sql');

  it('email_log porte enfin une clé unique', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS idempotency_key');
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS ux_email_log_idempotency/);
  });

  it('l’unicité ne s’applique qu’aux envois qui la demandent', () => {
    // Les notifications ponctuelles et les envois manuels doivent rester
    // répétables : sans index partiel, deux envois sans clé entreraient en
    // collision sur NULL selon le moteur.
    expect(sql).toContain('WHERE idempotency_key IS NOT NULL');
  });

  it('le statut intermédiaire de réservation est autorisé', () => {
    expect(sql).toContain("CHECK (status IN ('pending', 'sent', 'failed'))");
  });
});

describe('réservation avant envoi', () => {
  const src = lire('../shared/lib/email/resend.ts');

  it('la clé est réservée AVANT d’envoyer, pas journalisée après', () => {
    const reservation = src.indexOf('const reservation = await reserverEnvoi(input)');
    expect(reservation).toBeGreaterThan(-1);
    expect(reservation).toBeLessThan(src.indexOf('transport.sendMail'));
    expect(reservation).toBeLessThan(src.indexOf('c.emails.send'));
  });

  it('une clé déjà prise arrête l’envoi', () => {
    expect(src).toContain("if (reservation.deja) return { ok: false, reason: 'duplicate' }");
    expect(src).toContain("const DEJA_RESERVE = '23505'");
  });

  it('un envoi en échec libère la clé, pour qu’une reprise reste possible', () => {
    expect(src).toContain('idempotency_key: result.ok ? input.idempotencyKey : null');
  });

  it('l’absence de transporteur ne laisse pas de réservation bloquée', () => {
    // Sinon la clé resterait « pending » pour toujours, et l'envoi ne
    // repartirait jamais une fois la configuration corrigée.
    expect(src).toMatch(/if \(!c\) \{[\s\S]{0,400}logEmailSend\(input, echec, reservation\.id\)/);
  });

  it('sans clé, rien ne change : l’envoi reste répétable', () => {
    expect(src).toContain('if (!input.idempotencyKey) return { deja: false, id: null }');
  });

  it('une base indisponible n’empêche pas une convocation de partir', () => {
    expect(src).toContain('réservation impossible, envoi sans garde');
  });
});

describe('les envois du cron qui ne vérifiaient rien', () => {
  const src = lire('../app/api/cron/transactional-emails/route.ts');

  it('convocation, satisfaction et fin de formation portent une clé', () => {
    expect(src).toContain('idempotencyKey: `convocation_j7:${session.id}:${learner.id}`');
    expect(src).toContain('idempotencyKey: `satisfaction_chaud:${d.id}:${d.learner_id}`');
    expect(src).toContain('idempotencyKey: `fin_de_formation:${d.id}:${d.learner_id}`');
  });

  it('la clé de satisfaction et de fin lit l’identifiant réellement disponible', () => {
    // À cet endroit `learner` est sélectionné sans sa colonne `id` : écrire
    // `learner.id` aurait produit « …:undefined » — une clé unique pour tout
    // le monde, donc un seul envoi au premier dossier et plus rien ensuite.
    expect(src).toContain(".select('first_name, last_name, email')");
    expect(src).not.toContain('satisfaction_chaud:${d.id}:${learner.id}');
    expect(src).not.toContain('fin_de_formation:${d.id}:${learner.id}');
  });
});
