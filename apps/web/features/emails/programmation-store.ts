import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import {
  problemesDuReglage,
  reglageEffectif,
  type Reglage,
  type RegleEnregistree,
} from './programmation-envois';

/**
 * Lecture et écriture des réglages d'envoi (0178).
 *
 * Deux lectures, deux besoins : l'écran veut les réglages d'UN organisme, le
 * cron veut ceux de TOUS pour un type d'envoi donné — une requête, pas une par
 * organisme.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

type Row = { organization_id: string; kind: string; enabled: boolean; delay_days: number };

const versRegle = (r: Row): RegleEnregistree => ({
  kind: r.kind,
  enabled: r.enabled,
  delayDays: r.delay_days,
});

/** Réglages d'un organisme, par type d'envoi. */
export async function loadReglesOrganisme(organizationId: string): Promise<Map<string, RegleEnregistree>> {
  const { data, error } = await supabaseAdmin()
    .schema('app')
    .from('email_automation_rules' as never)
    .select('organization_id, kind, enabled, delay_days')
    .eq('organization_id', organizationId);
  if (error) {
    // Le réglage est une surcouche : sans lui, les défauts du code s'appliquent
    // et les envois continuent. On le dit, on ne bloque pas l'écran.
    console.error('[programmation] lecture impossible', organizationId, error.message);
    return new Map();
  }
  return new Map(((data ?? []) as unknown as Row[]).map((r) => [r.kind, versRegle(r)]));
}

/** Réglages de TOUS les organismes pour un type d'envoi — la lecture du cron. */
export async function loadReglesParOrganisme(
  sb: Client,
  kind: string,
): Promise<Map<string, RegleEnregistree>> {
  const { data, error } = await sb
    .schema('app')
    .from('email_automation_rules' as never)
    .select('organization_id, kind, enabled, delay_days')
    .eq('kind', kind);
  if (error) {
    // Même parti pris : un réglage illisible ne doit pas éteindre les envois de
    // tout le monde. On retombe sur les défauts, bruyamment.
    console.error('[programmation] lecture cron impossible', kind, error.message);
    return new Map();
  }
  return new Map(((data ?? []) as unknown as Row[]).map((r) => [r.organization_id, versRegle(r)]));
}

/** Le réglage qui s'applique à un organisme pour un type d'envoi. */
export async function reglagePourOrganisme(organizationId: string, kind: string): Promise<Reglage> {
  const regles = await loadReglesOrganisme(organizationId);
  return reglageEffectif(kind, regles.get(kind));
}

export type ResultatEnregistrement = { ok: true } | { ok: false; erreur: string };

/**
 * Enregistre un réglage. Les règles métier sont vérifiées ici aussi, et pas
 * seulement dans le formulaire : une Server Action n'est pas protégée par
 * l'écran qui l'appelle.
 */
export async function enregistrerReglage(input: {
  organizationId: string;
  kind: string;
  actif: boolean;
  delaiJours: number;
  parUtilisateur: string | null;
}): Promise<ResultatEnregistrement> {
  const problemes = problemesDuReglage(input.kind, { actif: input.actif, delaiJours: input.delaiJours });
  if (problemes.length > 0) return { ok: false, erreur: problemes.join(' ') };

  const { error } = await supabaseAdmin()
    .schema('app')
    .from('email_automation_rules' as never)
    .upsert(
      {
        organization_id: input.organizationId,
        kind: input.kind,
        enabled: input.actif,
        delay_days: input.delaiJours,
        updated_at: new Date().toISOString(),
        updated_by: input.parUtilisateur,
      } as never,
      { onConflict: 'organization_id,kind' },
    );

  // Le vrai message de la base, pas un « échec » qui n'apprend rien.
  if (error) return { ok: false, erreur: error.message };
  return { ok: true };
}

/** Efface le réglage : l'organisme repasse au défaut du code. */
export async function retablirDefaut(organizationId: string, kind: string): Promise<ResultatEnregistrement> {
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('email_automation_rules' as never)
    .delete()
    .eq('organization_id', organizationId)
    .eq('kind', kind);
  if (error) return { ok: false, erreur: error.message };
  return { ok: true };
}
