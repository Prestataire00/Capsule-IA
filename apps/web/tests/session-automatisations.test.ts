// Automatisations par séance (0156) : chaque envoi se coupe pour une séance,
// et les crons respectent ce réglage.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('migration 0156', () => {
  const sql = lire('../../../supabase/migrations/0156_session_automatisations.sql');

  it('un réglage par séance et par envoi', () => {
    expect(sql).toContain('UNIQUE (session_id, key)');
  });

  it('absence de réglage = envoi actif', () => {
    expect(sql).toContain('COALESCE(');
    expect(sql).toContain('true\n  );');
  });

  it('lecture par l’organisation, écriture réservée au service role', () => {
    expect(sql).toContain('USING (organization_id = app.current_organization_id())');
    expect(sql).toContain('FOR ALL TO service_role');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
  });
});

describe('réglages partagés', () => {
  const src = lire('../features/automation/session-automations.ts');

  it('couvre les envois intégrés', () => {
    for (const k of [
      'convocation',
      'emargement_liens',
      'satisfaction',
      'fin_formation',
      'retour_formateur',
      'attestation_entree',
      'alerte_emargement',
    ]) {
      expect(src).toContain(`key: '${k}'`);
    }
  });

  it('un dossier n’est coupé que si TOUTES ses séances le sont', () => {
    expect(src).toContain('seances.size > 0 && [...seances].every((id) => coupees.has(id))');
  });

  it('ne coupe que sur une ligne explicite `enabled = false`', () => {
    expect(src).toContain(".eq('enabled', false)");
  });
});

describe('crons respectant le réglage', () => {
  const cron = lire('../app/api/cron/transactional-emails/route.ts');
  const liens = lire('../app/api/cron/emargement-liens/route.ts');

  it('convocation J-7', () => {
    expect(cron).toContain("'convocation',\n  );");
    expect(cron).toContain('toutes.filter((s) => !convocationCoupee.has(s.id))');
  });

  it('satisfaction et e-mail de fin, par dossier', () => {
    expect(cron).toContain("dossiersAutomationOff(sb, dossierIdsFin, 'satisfaction')");
    expect(cron).toContain("dossiersAutomationOff(sb, dossierIdsFin, 'fin_formation')");
    // Depuis 0178 la condition porte aussi le jour réglé par l'organisme ; la
    // coupure par séance reste le second verrou, et c'est ce qu'on vérifie ici.
    expect(cron).toContain('!satisfactionOff.has(d.id)) try {');
    expect(cron).toContain('!finOff.has(d.id)) try {');
  });

  it('respecte le réglage de l’organisme (0178), pas un délai figé', () => {
    // Sans ce câblage, l'écran de programmation serait décoratif : il
    // enregistrerait un délai que le cron n'irait jamais lire.
    expect(cron).toContain("loadReglesParOrganisme(sb, 'convocation_j7')");
    expect(cron).toContain("loadReglesParOrganisme(sb, 'satisfaction_chaud')");
    expect(cron).toContain("loadReglesParOrganisme(sb, 'fin_de_formation')");
    expect(cron).toContain("loadReglesParOrganisme(sb, 'certificat_entreprise')");
    expect(cron).toContain('doitPartirAujourdhui(');
    // Les anciennes bornes figées ne doivent plus décider de rien.
    expect(cron).not.toContain('getUTCDate() + 7');
  });

  it('retour formateur', () => {
    expect(cron).toContain("'retour_formateur')");
    expect(cron).toContain('if (retourOff.has(d.id)) continue;');
  });

  it('attestation d’entrée, sur la séance qui a recueilli la signature', () => {
    expect(cron).toContain("'attestation_entree',");
    expect(cron).toContain('if (ctx.sessionId && entreeOff.has(ctx.sessionId)) continue;');
  });

  it('alerte émargement manquant', () => {
    expect(cron).toContain("sessionsAutomationOff(sb, sessionIds, 'alerte_emargement')");
    expect(cron).toContain('!alerteOff.has(sh.session_id)');
  });

  it('programmations de l’organisme', () => {
    expect(cron).toContain('dossiersAutomationOff(sb, dossierIds, kind)');
    expect(cron).toContain('dossierIds.filter((id) => !coupes.has(id))');
  });

  it('liens d’émargement', () => {
    expect(liens).toContain("'emargement_liens'");
    expect(liens).toContain('if (coupees.has(s.id)) continue;');
  });
});

describe('onglet Automatisations', () => {
  const page = lire('../app/(dashboard)/sessions/[id]/automatisations/page.tsx');
  const actions = lire('../app/(dashboard)/sessions/[id]/automatisations/actions.ts');

  it('interrupteurs réservés aux rôles qui gèrent les dossiers', () => {
    expect(page).toContain("canManageSection('dossiers')");
    expect(page).toContain('AutomationToggle');
    expect(actions).toContain("can(membre.role, 'dossiers') !== 'manage'");
    expect(actions).toContain('getCurrentMember');
  });

  it('l’écriture est bornée à la séance de l’organisme du membre', () => {
    expect(actions).toContain(".eq('organization_id', membre.organizationId)");
    expect(actions).toContain("onConflict: 'session_id,key'");
  });

  it('les programmations de l’organisme se coupent aussi séance par séance', () => {
    expect(page).toContain('scheduleKey(r.id)');
  });
});
