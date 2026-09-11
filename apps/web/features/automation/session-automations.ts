import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Réglages d'envoi automatique d'une séance (0156).
 *
 * La séance listait ses automatisations sans pouvoir en couper une seule : le
 * seul recours était de désactiver la règle pour tout l'organisme. Ici, chaque
 * envoi se coupe séance par séance, et les crons respectent ce réglage.
 *
 * Règle de lecture : pas de ligne = envoi actif. Couper est donc un acte
 * explicite, et rien ne change pour les séances existantes.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export const AUTOMATION_KEYS = [
  {
    key: 'convocation',
    label: 'Convocation',
    quand: '7 jours avant la séance, aux apprenants (et le récapitulatif aux entreprises)',
  },
  {
    key: 'emargement_liens',
    label: 'Liens d’émargement',
    quand: 'Au début de chaque demi-journée, si l’envoi automatique est activé dans les paramètres',
  },
  { key: 'satisfaction', label: 'Questionnaire de satisfaction à chaud', quand: 'À la fin de la formation, aux apprenants' },
  { key: 'fin_formation', label: 'E-mail de fin (attestation et certificat)', quand: 'À la fin de la formation, aux apprenants' },
  { key: 'retour_formateur', label: 'Retour du formateur', quand: 'À la fin de la formation, au formateur' },
  { key: 'attestation_entree', label: 'Attestation d’entrée', quand: 'Après la première signature d’émargement, à l’apprenant' },
  { key: 'alerte_emargement', label: 'Alerte émargement manquant', quand: 'Séance terminée sans feuille finalisée, en interne' },
] as const;

export type AutomationKey = (typeof AUTOMATION_KEYS)[number]['key'];

/** Clé d'une programmation de l'organisme (app.email_schedules). */
export const scheduleKey = (ruleId: string) => `schedule:${ruleId}`;

const CLE_VALIDE = /^[a-z_]+(:[0-9a-f-]{36})?$/;
export const isAutomationKey = (v: string): boolean => CLE_VALIDE.test(v);

/** Réglages explicites d'une séance : clé → actif. Les clés absentes sont actives. */
export async function loadSessionAutomations(sb: Client, sessionId: string): Promise<Map<string, boolean>> {
  const { data } = await sb
    .schema('app')
    .from('session_automation_settings')
    .select('key, enabled')
    .eq('session_id', sessionId);
  return new Map(((data ?? []) as { key: string; enabled: boolean }[]).map((r) => [r.key, r.enabled]));
}

/** Séances où cet envoi a été coupé. Une séance absente du résultat reste active. */
export async function sessionsAutomationOff(
  sb: Client,
  sessionIds: readonly string[],
  key: string,
): Promise<Set<string>> {
  if (sessionIds.length === 0) return new Set();
  const { data } = await sb
    .schema('app')
    .from('session_automation_settings')
    .select('session_id')
    .in('session_id', [...sessionIds])
    .eq('key', key)
    .eq('enabled', false);
  return new Set(((data ?? []) as { session_id: string }[]).map((r) => r.session_id));
}

/**
 * Dossiers dont l'envoi est coupé : un dossier suit ses séances, et n'est coupé
 * que si TOUTES les séances qui le portent l'ont coupé — couper une séance sur
 * trois ne doit pas priver l'apprenant d'un envoi de fin de formation.
 */
export async function dossiersAutomationOff(
  sb: Client,
  dossierIds: readonly string[],
  key: string,
): Promise<Set<string>> {
  if (dossierIds.length === 0) return new Set();

  const [{ data: directes }, { data: liens }] = await Promise.all([
    sb.schema('app').from('sessions').select('id, dossier_id').in('dossier_id', [...dossierIds]).neq('status', 'cancelled'),
    sb.schema('app').from('session_dossiers').select('session_id, dossier_id').in('dossier_id', [...dossierIds]),
  ]);

  const parDossier = new Map<string, Set<string>>();
  const ajoute = (dossierId: string, sessionId: string) => {
    const set = parDossier.get(dossierId) ?? new Set<string>();
    set.add(sessionId);
    parDossier.set(dossierId, set);
  };
  for (const s of (directes ?? []) as { id: string; dossier_id: string | null }[]) {
    if (s.dossier_id) ajoute(s.dossier_id, s.id);
  }
  for (const l of (liens ?? []) as { session_id: string; dossier_id: string }[]) ajoute(l.dossier_id, l.session_id);

  const toutesLesSeances = [...new Set([...parDossier.values()].flatMap((s) => [...s]))];
  const coupees = await sessionsAutomationOff(sb, toutesLesSeances, key);

  const off = new Set<string>();
  for (const [dossierId, seances] of parDossier) {
    if (seances.size > 0 && [...seances].every((id) => coupees.has(id))) off.add(dossierId);
  }
  return off;
}
