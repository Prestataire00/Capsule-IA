import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml } from './render-template';

type AddressJson = {
  line1?: string;
  line2?: string;
  city?: string;
  postal_code?: string;
  country?: string;
};

function composeAddress(addr: AddressJson | null | undefined): string {
  if (!addr || typeof addr !== 'object') return '';
  const parts = [
    [addr.line1, addr.line2].filter(Boolean).join(' '),
    [addr.postal_code, addr.city].filter(Boolean).join(' '),
    addr.country,
  ].filter((p) => p && p.trim().length > 0);
  return parts.join(', ');
}

function formatDateFr(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(d);
}

function formatEuros(cents: number | null | undefined): string {
  if (cents == null) return '';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function listHtml(items: string[]): string {
  const clean = items.filter((i) => i && i.trim().length > 0);
  if (clean.length === 0) return '—';
  return `<ul>${clean.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
}

const MODALITY_LABELS: Record<string, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
};

// Construit la map de variables {slug → valeur} pour un dossier donné.
// Renvoie null si le dossier est introuvable (RLS / id invalide).
export async function resolveDossierVariables(
  sb: SupabaseClient,
  dossierId: string,
): Promise<{ organizationId: string; variables: Record<string, string> } | null> {
  const { data: dRow } = await sb
    .schema('app')
    .from('dossiers')
    .select(
      `reference, start_date, end_date, total_hours, modality, total_amount_cents, currency,
       organization_id,
       learner:learners(first_name, last_name, email, birth_date, address),
       company:companies(name, siret, address),
       formation:formations(title, objectives, prerequisites, target_audience, evaluation_method, pedagogical_method)`,
    )
    .eq('id', dossierId)
    .maybeSingle();

  if (!dRow) return null;
  const d = dRow as unknown as {
    reference: string;
    start_date: string;
    end_date: string;
    total_hours: number;
    modality: string;
    total_amount_cents: number | null;
    currency: string;
    organization_id: string;
    learner:
      | { first_name: string; last_name: string; email: string; birth_date: string | null; address: AddressJson | null }
      | { first_name: string; last_name: string; email: string; birth_date: string | null; address: AddressJson | null }[]
      | null;
    company:
      | { name: string; siret: string | null; address: AddressJson | null }
      | { name: string; siret: string | null; address: AddressJson | null }[]
      | null;
    formation:
      | { title: string; objectives: string[] | null; prerequisites: string[] | null; target_audience: string | null; evaluation_method: string | null; pedagogical_method: string | null }
      | { title: string; objectives: string[] | null; prerequisites: string[] | null; target_audience: string | null; evaluation_method: string | null; pedagogical_method: string | null }[]
      | null;
  };

  const learner = Array.isArray(d.learner) ? d.learner[0] : d.learner;
  const company = Array.isArray(d.company) ? d.company[0] : d.company;
  const formation = Array.isArray(d.formation) ? d.formation[0] : d.formation;

  const [{ data: orgData }, { data: modulesData }, { data: trainersData }] = await Promise.all([
    sb
      .schema('app')
      .from('organizations')
      .select('name, siret, declaration_activite, address, contact_email, legal_name')
      .eq('id', d.organization_id)
      .maybeSingle(),
    sb
      .schema('app')
      .from('dossier_modules')
      .select('title_snapshot, duration_hours, position')
      .eq('dossier_id', dossierId)
      .order('position', { ascending: true }),
    sb
      .schema('app')
      .from('dossier_trainers')
      .select('is_lead, trainer:trainers(first_name, last_name)')
      .eq('dossier_id', dossierId),
  ]);

  const org = (orgData as {
    name: string;
    siret: string | null;
    declaration_activite: string | null;
    address: AddressJson | null;
    contact_email: string | null;
    legal_name: string | null;
  } | null) ?? null;

  const modules =
    (modulesData as unknown as Array<{ title_snapshot: string; duration_hours: number }>) ?? [];
  const moduleLines = modules.map(
    (m) => `${m.title_snapshot} (${m.duration_hours} h)`,
  );

  const trainers =
    (trainersData as unknown as Array<{
      is_lead: boolean;
      trainer: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
    }>) ?? [];
  const lead = trainers.find((t) => t.is_lead) ?? trainers[0];
  const leadTrainer = lead ? (Array.isArray(lead.trainer) ? lead.trainer[0] : lead.trainer) : null;

  const e = escapeHtml;
  const variables: Record<string, string> = {
    apprenant_nom_complet: learner ? e(`${learner.first_name} ${learner.last_name}`) : '',
    apprenant_prenom: learner ? e(learner.first_name) : '',
    apprenant_nom: learner ? e(learner.last_name) : '',
    apprenant_email: learner ? e(learner.email) : '',
    apprenant_date_naissance: formatDateFr(learner?.birth_date),
    apprenant_adresse: e(composeAddress(learner?.address)),

    entreprise_nom: company ? e(company.name) : '',
    entreprise_siret: company?.siret ? e(company.siret) : '',
    entreprise_adresse: e(composeAddress(company?.address)),

    formation_titre: formation ? e(formation.title) : '',
    formation_objectifs: listHtml(formation?.objectives ?? []),
    formation_prerequis: listHtml(formation?.prerequisites ?? []),
    formation_public: e(formation?.target_audience ?? ''),
    formation_methode_pedagogique: e(formation?.pedagogical_method ?? ''),
    formation_methode_evaluation: e(formation?.evaluation_method ?? ''),
    formation_modules: listHtml(moduleLines),

    dossier_reference: e(d.reference),
    dossier_date_debut: formatDateFr(d.start_date),
    dossier_date_fin: formatDateFr(d.end_date),
    dossier_duree_heures: String(d.total_hours ?? ''),
    dossier_modalite: MODALITY_LABELS[d.modality] ?? e(d.modality),
    dossier_montant_ht: formatEuros(d.total_amount_cents),

    formateur_nom_complet: leadTrainer ? e(`${leadTrainer.first_name} ${leadTrainer.last_name}`) : '',

    organisme_nom: e(org?.legal_name || org?.name || ''),
    organisme_siret: e(org?.siret ?? ''),
    organisme_nda: e(org?.declaration_activite ?? ''),
    organisme_adresse: e(composeAddress(org?.address)),
    organisme_representant: e(org?.contact_email ?? ''),

    date_du_jour: formatDateFr(new Date().toISOString()),
  };

  return { organizationId: d.organization_id, variables };
}
