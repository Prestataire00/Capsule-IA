import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { zipStore, type ZipEntry } from '@/shared/lib/zip/store-zip';
import { loadOrgEvidence } from './evidence';
import { jourParis, versions, VERSION_LABELS, type VersionRow } from './referentiel';
import { preuvesParNumero, statutEffectif, statutsParNumero, type OrgStatutRow } from './statut';
import { safeFileName } from './status';
import { renderDossiersCsv, renderSynthese, type DossierCsvRow, type LigneAudit } from './audit-synthese';

/**
 * Dossier de préparation à l'audit Qualiopi d'un organisme, en une archive :
 *  · synthese.html — chaque indicateur du référentiel en vigueur, son statut,
 *    ce que Capsule produit, les preuves déposées (liens vers les fichiers) ;
 *  · dossiers.csv — les dossiers suivis et leur conformité ;
 *  · preuves/I{n}/… — les fichiers déposés, rangés par indicateur.
 *
 * Toute lecture en erreur interrompt l'export : un dossier d'audit incomplet
 * présenté comme complet serait pire que pas d'export.
 */

const BUCKET = 'qualiopi-proofs';
/** Au-delà, les fichiers restants sont listés dans la synthèse sans être joints. */
const PLAFOND_OCTETS = 150 * 1024 * 1024;
const STATUTS_AUDITES = ['scheduled', 'active', 'completed', 'closed', 'archived'];
const STATUT_DOSSIER: Record<string, string> = {
  scheduled: 'Planifié',
  active: 'En cours',
  completed: 'Terminé',
  closed: 'Clôturé',
  archived: 'Archivé',
};

type Res = { data: unknown; error: { message: string } | null };
type Compte = { count: number | null; error: { message: string } | null };

async function lire<T>(nom: string, requete: PromiseLike<Res>): Promise<T[]> {
  const { data, error } = await requete;
  if (error) throw new Error(`export audit : ${nom} illisible — ${error.message}`);
  return (data ?? []) as T[];
}

async function compter(nom: string, requete: PromiseLike<Compte>): Promise<number> {
  const { count, error } = await requete;
  if (error) throw new Error(`export audit : ${nom} illisible — ${error.message}`);
  return count ?? 0;
}

type IndicateurRow = VersionRow & {
  id: string;
  number: number;
  criterion: number;
  criterion_label: string | null;
  title: string;
  requirement: string | null;
  applies_to: string[] | null;
  certifying_only: boolean;
  condition: string | null;
};

type PreuveRow = {
  id: string;
  indicator_id: string;
  title: string;
  valid_until: string | null;
  external_path: string | null;
  metadata: { original_name?: string } | null;
};

type Checklist = { total_indicators: number; satisfied_indicators: number; blocking_missing: number };
type DossierRow = {
  reference: string;
  status: string;
  qualiopi_ready: boolean | null;
  learner: { first_name: string; last_name: string } | null;
  formation: { title: string } | null;
  checklist: Checklist | Checklist[] | null;
};

/** Sans accents : tous les décompresseurs ne lisent pas les noms UTF-8. */
const sansAccents = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const slug = (s: string): string =>
  sansAccents(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'organisme';

export async function buildAuditExport(organizationId: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; filename: string }> {
  const sb = supabaseAdmin();
  const org = organizationId;
  const app = () => sb.schema('app');

  const [orgs, tous, statuts, preuves, evidence, nbApprentissage, formations, nbExternes, dossiers] = await Promise.all([
    lire<{ name: string }>('organisme', app().from('organizations').select('name').eq('id', org)),
    lire<IndicateurRow>(
      'référentiel',
      app()
        .from('qualiopi_indicators')
        .select(
          'id, number, criterion, criterion_label, title, requirement, applies_to, certifying_only, condition, referential_version, effective_from, effective_until' as never,
        )
        .eq('is_active', true)
        .neq('referential_version' as never, 'legacy' as never),
    ),
    lire<OrgStatutRow>(
      'statuts',
      app().from('qualiopi_org_indicator_status' as never).select('indicator_id, status, note, updated_at').eq('organization_id' as never, org as never),
    ),
    lire<PreuveRow>(
      'preuves',
      app()
        .from('qualiopi_proofs')
        .select('id, indicator_id, title, valid_until, external_path, metadata')
        .eq('organization_id', org)
        .eq('scope', 'organization')
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
    ),
    loadOrgEvidence(org),
    compter(
      'dossiers en apprentissage',
      app().from('dossiers').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('action_type' as never, 'apprentissage' as never),
    ),
    lire<{ rncp_code: string | null; rs_code: string | null }>(
      'formations',
      app().from('formations').select('rncp_code, rs_code').eq('organization_id', org).is('deleted_at', null),
    ),
    compter(
      'intervenants externes',
      app().from('trainers').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('is_internal', false).is('deleted_at', null),
    ),
    lire<DossierRow>(
      'dossiers',
      app()
        .from('dossiers')
        .select(
          `reference, status, qualiopi_ready,
           learner:learners(first_name, last_name),
           formation:formations(title),
           checklist:qualiopi_dossier_checklists(total_indicators, satisfied_indicators, blocking_missing)`,
        )
        .eq('organization_id', org)
        .is('deleted_at', null)
        .in('status', STATUTS_AUDITES as never)
        .order('reference', { ascending: true }),
    ),
  ]);

  const jour = jourParis();
  const { courante } = versions(tous, jour);
  if (!courante) throw new Error('export audit : aucun référentiel en vigueur (migration 0139 non appliquée ?)');
  const indicateurs = tous.filter((i) => i.referential_version === courante).sort((a, b) => a.number - b.number);
  const numeroParId = new Map(tous.map((i) => [i.id, i.number]));
  const statutParNumero = statutsParNumero(statuts, numeroParId);
  const preuvesDe = preuvesParNumero(preuves, numeroParId);
  const profil = {
    apprentissage: nbApprentissage > 0,
    certifiant: formations.some((f) => (f.rncp_code ?? '').trim() || (f.rs_code ?? '').trim()),
    sousTraitance: nbExternes > 0,
  };

  // Fichiers des preuves, rangés par indicateur.
  const fichiers: ZipEntry[] = [];
  const cheminDe = new Map<string, string>();
  let total = 0;
  for (const ind of indicateurs) {
    for (const [k, p] of (preuvesDe.get(ind.number) ?? []).entries()) {
      if (!p.external_path) continue;
      const { data, error } = await sb.storage.from(BUCKET).download(p.external_path);
      if (error || !data) {
        console.error(`[qualiopi/export] preuve ${p.id} indisponible`, error);
        continue;
      }
      const octets = new Uint8Array(await data.arrayBuffer());
      if (total + octets.length > PLAFOND_OCTETS) continue;
      total += octets.length;
      const chemin = `preuves/I${ind.number}/${k + 1}-${safeFileName(sansAccents(p.metadata?.original_name ?? p.title))}`;
      fichiers.push({ name: chemin, data: octets });
      cheminDe.set(p.id, chemin);
    }
  }

  const lignes: LigneAudit[] = indicateurs.map((ind) => {
    const ev = evidence[ind.number] ?? [];
    const saisi = statutParNumero.get(ind.number);
    const { status, auto } = statutEffectif(ind, saisi?.status, ev, profil);
    return {
      number: ind.number,
      criterion: ind.criterion,
      criterionLabel: ind.criterion_label,
      title: ind.title,
      requirement: ind.requirement,
      status,
      auto,
      note: saisi?.note ?? null,
      evidence: ev.map((e) => ({ label: e.label, ok: e.ok })),
      preuves: (preuvesDe.get(ind.number) ?? []).map((p) => ({
        title: p.title,
        chemin: cheminDe.get(p.id) ?? null,
        validUntil: p.valid_until,
        expiree: p.valid_until !== null && p.valid_until < jour,
      })),
    };
  });

  const lignesCsv: DossierCsvRow[] = dossiers.map((d) => {
    const c = Array.isArray(d.checklist) ? d.checklist[0] : d.checklist;
    return {
      reference: d.reference,
      apprenant: d.learner ? `${d.learner.first_name} ${d.learner.last_name}`.trim() : '',
      formation: d.formation?.title ?? '',
      statut: STATUT_DOSSIER[d.status] ?? d.status,
      satisfaits: c?.satisfied_indicators ?? 0,
      applicables: c?.total_indicators ?? 0,
      bloquants: c?.blocking_missing ?? 0,
      pret: d.qualiopi_ready ?? false,
    };
  });

  const organisme = orgs[0]?.name ?? 'Organisme';
  const enc = new TextEncoder();
  const html = renderSynthese({
    organisme,
    jour,
    referentiel: VERSION_LABELS[courante] ?? courante,
    lignes,
    dossiers: { total: lignesCsv.length, prets: lignesCsv.filter((d) => d.pret).length },
  });

  const bytes = zipStore([
    { name: 'synthese.html', data: enc.encode(html) },
    { name: 'dossiers.csv', data: enc.encode(renderDossiersCsv(lignesCsv)) },
    ...fichiers,
  ]);
  return { bytes, filename: `audit-qualiopi-${slug(organisme)}-${jour}.zip` };
}
