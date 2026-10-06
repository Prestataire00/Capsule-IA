import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { filDe } from './equipe';

/**
 * Les infos rapides du dossier, à côté de sa discussion : ce qu'on vérifie
 * avant de répondre (dates, client, formation, montant).
 */

export type InfosFil = {
  readonly lignes: ReadonlyArray<{ libelle: string; valeur: string }>;
};

const un = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
const euros = (c: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(c / 100);
const MODALITE: Record<string, string> = { presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' };
const STATUT: Record<string, string> = {
  draft: 'Brouillon',
  pending: 'En attente',
  ready: 'Prêt',
  in_progress: 'En cours',
  completed: 'Terminé',
  closed: 'Clôturé',
  cancelled: 'Annulé',
  archived: 'Archivé',
  planned: 'Planifiée',
  done: 'Terminée',
};
const date = (iso: string | null | undefined) => (iso ? jour.format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)) : null);

export async function infosDuFil(filId: string): Promise<InfosFil | null> {
  const fil = await filDe(filId);
  if (!fil) return null;
  const admin = supabaseAdmin();

    const { data } = await admin
      .schema('app')
      .from('dossiers')
      .select(
        'reference, status, start_date, end_date, total_hours, total_amount_cents, modality, company:companies(name), learner:learners!dossiers_learner_id_fkey(first_name, last_name), formation:formations(title)',
      )
      .eq('id', filId)
      .maybeSingle();
    const d = data as unknown as {
      reference: string;
      status: string;
      start_date: string | null;
      end_date: string | null;
      total_hours: number | null;
      total_amount_cents: number | null;
      modality: string | null;
      company: { name: string | null } | Array<{ name: string | null }> | null;
      learner: { first_name: string | null; last_name: string | null } | Array<{ first_name: string | null; last_name: string | null }> | null;
      formation: { title: string | null } | Array<{ title: string | null }> | null;
    } | null;
    if (!d) return null;
    const learner = un(d.learner);
    const client = un(d.company)?.name ?? (`${learner?.first_name ?? ''} ${learner?.last_name ?? ''}`.trim() || null);
    const lignes = [
      { libelle: 'Référence', valeur: d.reference },
      { libelle: 'Statut', valeur: STATUT[d.status] ?? d.status },
      { libelle: 'Client', valeur: client },
      { libelle: 'Formation', valeur: un(d.formation)?.title ?? null },
      { libelle: 'Modalité', valeur: d.modality ? (MODALITE[d.modality] ?? d.modality) : null },
      { libelle: 'Début', valeur: date(d.start_date) },
      { libelle: 'Fin', valeur: date(d.end_date) },
      { libelle: 'Durée', valeur: d.total_hours ? `${d.total_hours} h` : null },
      { libelle: 'Montant', valeur: d.total_amount_cents ? `${euros(d.total_amount_cents)} HT` : null },
    ];
    return { lignes: lignes.filter((l): l is { libelle: string; valeur: string } => Boolean(l.valeur)) };
}
