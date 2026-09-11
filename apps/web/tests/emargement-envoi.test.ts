// Émargement, étape 3 : envoi des liens (manuel et automatique), QR, réglage.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { autoSendDue, linkRecipients, type LinkCandidate } from '@/features/attendance/link-recipients';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const c = (id: string, state: LinkCandidate['state'], email: string | null = `${id}@exemple.fr`): LinkCandidate => ({ id, name: id, email, state });

describe('destinataires des liens', () => {
  const liste = [c('a', 'a_signer'), c('b', 'entree_seule'), c('c', 'complet'), c('d', 'absent'), c('e', 'a_signer', null)];

  it('envoi manuel : tous ceux qui n’ont pas fini de signer', () => {
    const r = linkRecipients(liste, 'manuel', new Set());
    expect(r.envoyer.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r.sansEmail).toEqual(['e']);
  });

  it('envoi automatique : une seule fois, à qui n’a rien signé', () => {
    expect(linkRecipients(liste, 'auto', new Set()).envoyer.map((x) => x.id)).toEqual(['a']);
    expect(linkRecipients(liste, 'auto', new Set(['a@exemple.fr'])).envoyer).toEqual([]);
  });
});

describe('fenêtre de l’envoi automatique', () => {
  const debut = new Date('2026-09-14T07:00:00Z');
  it('part de 30 minutes avant à 10 minutes après le début', () => {
    expect(autoSendDue(debut, new Date('2026-09-14T06:25:00Z'))).toBe(false);
    expect(autoSendDue(debut, new Date('2026-09-14T06:35:00Z'))).toBe(true);
    expect(autoSendDue(debut, new Date('2026-09-14T07:09:00Z'))).toBe(true);
    expect(autoSendDue(debut, new Date('2026-09-14T07:11:00Z'))).toBe(false);
  });
});

describe('garde-fous', () => {
  it('protège la tâche programmée par CRON_SECRET et ne sert que les organismes volontaires', () => {
    const route = lire('../app/api/cron/emargement-liens/route.ts');
    expect(route).toContain('CRON_SECRET');
    expect(route).toContain(".eq('attendance_auto_send' as never, true as never)");
  });

  it('laisse l’envoi automatique désactivé par défaut', () => {
    expect(lire('../../../supabase/migrations/0145_emargement_entree_sortie.sql')).toContain(
      'ADD COLUMN IF NOT EXISTS attendance_auto_send BOOLEAN NOT NULL DEFAULT false',
    );
  });

  it('réserve le réglage aux gestionnaires des paramètres', () => {
    expect(lire('../app/(dashboard)/parametres/organisation/attendance-settings-actions.ts')).toContain("guardAction('settings')");
  });

  it('journalise chaque lien avec sa feuille, pour ne jamais l’envoyer deux fois', () => {
    const envoi = lire('../features/attendance/send-links.ts');
    expect(envoi).toContain("kind: 'emargement_lien'");
    expect(envoi).toContain('metadata: { attendance_sheet_id: sheetId');
  });

  it('borne la planche de QR à la séance accessible', () => {
    expect(lire('../app/api/attendance/sessions/[sessionId]/qr-cards/route.ts')).toContain('accessibleSession(params.sessionId)');
  });
});
