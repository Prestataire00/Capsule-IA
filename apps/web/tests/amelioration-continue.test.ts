// Amélioration continue (0144) : schémas partagés et cloisonnement des écritures.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  actionSchema,
  axisSchema,
  formToObject,
  incidentSchema,
  moveAxisSchema,
  resolveIncidentSchema,
} from '@/features/amelioration/schemas';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('schémas de l’amélioration continue', () => {
  it('ignore les champs laissés vides', () => {
    const fd = new FormData();
    fd.set('title', 'Salle indisponible');
    fd.set('description', '   ');
    expect(formToObject(fd)).toEqual({ title: 'Salle indisponible' });
  });

  it('déclare un incident avec une gravité par défaut', () => {
    const r = incidentSchema.parse({ kind: 'alea', title: 'Formateur absent' });
    expect(r.severity).toBe('moyenne');
    expect(incidentSchema.safeParse({ kind: 'panne', title: 'x' }).success).toBe(false);
  });

  it('exige de dire comment un incident a été traité', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(resolveIncidentSchema.safeParse({ id, resolution: '  ' }).success).toBe(false);
    expect(resolveIncidentSchema.safeParse({ id, resolution: 'Séance reprogrammée' }).success).toBe(true);
  });

  it('suit un axe en trois temps et le relie à un indicateur', () => {
    expect(axisSchema.parse({ title: 'Mieux accueillir', indicatorNumber: '26' }).indicatorNumber).toBe(26);
    expect(axisSchema.safeParse({ title: 'x', indicatorNumber: '40' }).success).toBe(false);
    expect(moveAxisSchema.safeParse({ id: '00000000-0000-4000-8000-000000000001', status: 'optimise' }).success).toBe(true);
    expect(moveAxisSchema.safeParse({ id: '00000000-0000-4000-8000-000000000001', status: 'termine' }).success).toBe(false);
  });

  it('accepte une action corrective née d’un incident', () => {
    const r = actionSchema.parse({ title: 'Salle de repli', origin: 'incident', incidentId: '00000000-0000-4000-8000-000000000002' });
    expect(r).toMatchObject({ origin: 'incident', priority: 'medium' });
  });
});

describe('cloisonnement des écritures', () => {
  const actions = lire('../app/(dashboard)/amelioration-continue/actions.ts');

  it('garde chaque action serveur', () => {
    const exportees = actions.match(/export async function \w+/g) ?? [];
    expect(exportees.length).toBeGreaterThan(0);
    expect(actions.match(/await garde\(/g)?.length).toBe(exportees.length);
  });

  it('borne chaque mise à jour à l’organisation du membre', () => {
    const maj = actions.split('.update(').slice(1);
    expect(maj.length).toBeGreaterThan(0);
    for (const bloc of maj) expect(bloc.split(';')[0]).toContain(".eq('organization_id', orgId)");
  });

  it('pose la RLS sur les nouvelles tables', () => {
    const sql = lire('../../../supabase/migrations/0144_amelioration_continue_incidents_axes.sql');
    for (const t of ['quality_incidents', 'improvement_axes']) {
      expect(sql).toContain(`ALTER TABLE app.${t} ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`ALTER TABLE app.${t} FORCE ROW LEVEL SECURITY;`);
    }
  });
});
