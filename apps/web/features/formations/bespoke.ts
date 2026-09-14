// Formations « sur mesure » : montées pour UN client précis, hors catalogue,
// au tarif que l'organisme fixe lui-même. BtoB = entreprise cliente,
// BtoC = apprenant particulier (migration 0162).
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const CLIENT_KINDS = ['company', 'individual'] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

export const CLIENT_KIND_LABEL: Record<ClientKind, string> = {
  company: 'Entreprise',
  individual: 'Particulier',
};

export const MODALITIES = ['presentiel', 'distanciel', 'hybride'] as const;
export const MODALITY_LABEL: Record<string, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
};

export const bespokeFormationSchema = z.object({
  clientKind: z.enum(CLIENT_KINDS),
  clientId: z.string().uuid(),
  title: z.string().trim().min(3, 'Donnez un intitulé (3 caractères minimum).').max(160),
  summary: z.string().trim().max(500).optional(),
  durationHours: z.number().positive('La durée doit être supérieure à 0.').max(2000),
  modality: z.enum(MODALITIES),
  /** Tarif HT libre, en euros : c'est l'organisme qui le fixe pour ce client. */
  priceEuros: z.number().min(0, 'Tarif invalide.').max(1_000_000),
});

export type BespokeFormationInput = z.infer<typeof bespokeFormationSchema>;

export type ClientFormation = {
  id: string;
  code: string;
  title: string;
  summary: string | null;
  durationHours: number;
  modality: string;
  priceCents: number;
  createdAt: string | null;
  sessionsCount: number;
  dossiersCount: number;
};

type Row = {
  id: string;
  code: string;
  title: string;
  summary: string | null;
  default_duration_hours: number | string;
  default_modality: string;
  default_price_cents: number | string;
  created_at: string | null;
};

/**
 * Formations sur mesure d'un client. La table n'étant pas encore dans les types
 * générés (colonnes 0162), la lecture passe par un client non typé — elle reste
 * sous RLS, bornée à l'organisation.
 */
export async function loadClientFormations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  kind: ClientKind,
  clientId: string,
): Promise<ClientFormation[]> {
  const colonne = kind === 'company' ? 'client_company_id' : 'client_learner_id';
  const { data, error } = await sb
    .schema('app')
    .from('formations')
    .select('id, code, title, summary, default_duration_hours, default_modality, default_price_cents, created_at')
    .eq(colonne, clientId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // Colonnes absentes (migration 0162 non appliquée) : on n'affiche rien plutôt
  // que de casser la fiche client.
  if (error) {
    if (!/column .* does not exist/i.test(error.message)) {
      console.error('[formations sur mesure] lecture impossible :', error.message);
    }
    return [];
  }

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [{ data: sessionRows }, { data: dossierRows }] = await Promise.all([
    sb.schema('app').from('sessions').select('formation_id').in('formation_id', ids).neq('status', 'cancelled'),
    sb.schema('app').from('dossiers').select('formation_id').in('formation_id', ids).is('deleted_at', null),
  ]);

  const compte = (list: unknown, id: string) =>
    ((list as { formation_id: string | null }[] | null) ?? []).filter((r) => r.formation_id === id).length;

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    summary: r.summary,
    durationHours: Number(r.default_duration_hours ?? 0),
    modality: r.default_modality,
    priceCents: Number(r.default_price_cents ?? 0),
    createdAt: r.created_at,
    sessionsCount: compte(sessionRows, r.id),
    dossiersCount: compte(dossierRows, r.id),
  }));
}
