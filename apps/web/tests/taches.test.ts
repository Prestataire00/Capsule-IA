// Tâches internes (0159) : création, attribution à un membre, avancement.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('migration 0159', () => {
  const sql = lire('../../../supabase/migrations/0159_taches.sql');

  it('statuts et priorités bornés en base', () => {
    expect(sql).toContain("status IN ('todo', 'in_progress', 'done')");
    expect(sql).toContain("priority IN ('low', 'medium', 'high')");
  });

  it('une tâche peut n’être attribuée à personne, et survit au départ d’un membre', () => {
    expect(sql).toContain('assignee_user_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL');
  });

  it('lecture bornée à l’organisation, écriture réservée au service role', () => {
    expect(sql).toContain('USING (organization_id = app.current_organization_id() AND deleted_at IS NULL)');
    expect(sql).toContain('FOR ALL TO service_role');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
  });
});

describe('actions de tâche', () => {
  const actions = lire('../app/(dashboard)/taches/actions.ts');

  it('exigent un compte à rôle connu', () => {
    expect(actions).toContain('getCurrentMember');
    expect(actions).toContain('roleConnu(membre.role)');
  });

  it('vérifient que la personne visée est membre de la même organisation', () => {
    expect(actions).toContain('membreDeLOrganisation');
    expect(actions).toContain("error: 'Cette personne n’est pas membre de votre équipe.'");
  });

  it('n’autorisent la modification qu’au créateur, à la personne assignée ou à un responsable', () => {
    expect(actions).toContain('RESPONSABLES.includes(membre.role)');
    expect(actions).toContain('tache.created_by === membre.userId');
    expect(actions).toContain('tache.assignee_user_id === membre.userId');
  });

  it('bornent chaque écriture à l’organisation du membre', () => {
    // Statut, attribution, suppression : filtrées sur l'organisation…
    expect(actions.match(/\.eq\('organization_id', g\.membre\.organizationId\)/g)?.length).toBe(3);
    // …et la création écrit celle du membre, jamais une valeur reçue du client.
    expect(actions).toContain('organization_id: g.membre.organizationId,');
  });

  it('la suppression reste au créateur (ou à un responsable)', () => {
    expect(actions).toContain("error: 'Seul le créateur de la tâche peut la supprimer.'");
    expect(actions).toContain("update({ deleted_at:");
  });

  it('prévient la personne assignée, sauf si elle s’attribue la tâche', () => {
    expect(actions).toContain("template_code: 'task_assigned'");
    expect(actions).toContain('if (args.assigneeUserId === args.auteurUserId) return;');
  });
});

describe('page Tâches', () => {
  const page = lire('../app/(dashboard)/taches/page.tsx');

  it('lit sous RLS, sans service role', () => {
    expect(page).toContain('supabaseServer()');
    expect(page).not.toContain('supabaseAdmin');
  });

  it('propose les vues attendues', () => {
    for (const l of ['Mes tâches', 'Celles que j’ai attribuées', 'À prendre', 'Toutes']) {
      expect(page).toContain(l);
    }
  });

  it('signale le retard sur les tâches non terminées', () => {
    expect(lire('../features/tasks/load-tasks.ts')).toContain(
      "t.status !== 'done' && !!t.dueDate && t.dueDate < aujourdHui.toISOString().slice(0, 10)",
    );
  });
});

describe('barre latérale', () => {
  const rail = lire('../shared/components/layout/sidebar-rail.tsx');
  const server = lire('../shared/components/layout/sidebar-rail-server.tsx');

  it('entrée Tâches dans le tableau de bord, badge sur MES tâches ouvertes', () => {
    expect(rail).toContain("{ href: '/taches', icon: ListChecks, label: 'Tâches' }");
    expect(rail).toContain("'/taches': { key: 'tasksOpen', tone: 'orange' }");
    expect(server).toContain(".eq('assignee_user_id', userId)");
    expect(server).toContain(".neq('status', 'done')");
  });

  it('ne touche pas l’entrée Agenda', () => {
    expect(rail).toContain("{ key: 'agenda', label: 'Agenda', icon: CalendarDays, href: '/agenda' }");
  });
});
