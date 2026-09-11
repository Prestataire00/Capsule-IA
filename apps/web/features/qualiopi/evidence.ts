import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

/**
 * Ce que Capsule produit déjà, indicateur par indicateur, pour un organisme.
 *
 * C'est le cœur du modèle Digiforma : chaque indicateur se justifie par une
 * fonctionnalité du logiciel utilisée au quotidien. Là où Digiforma se contente
 * de recommander la fonctionnalité, on montre ce qu'elle a réellement produit —
 * formations publiées, formateurs avec CV, réclamations traitées… — avec un
 * lien vers l'écran concerné (audit CAP-36).
 *
 * Chaque source est lue indépendamment : une source en erreur est journalisée
 * et son indicateur reste simplement sans preuve automatique, jamais un 500.
 */
export type Evidence = {
  readonly label: string;
  /** La preuve est-elle suffisante à elle seule ? Sinon, simple information. */
  readonly ok: boolean;
  readonly href?: string;
};

export type EvidenceMap = Record<number, Evidence[]>;

type ChecklistDetail = { number: number; applicable?: boolean; satisfied: boolean };

const pluriel = (n: number, mot: string, motPluriel = `${mot}s`): string => `${n} ${n > 1 ? motPluriel : mot}`;

async function lire<T>(nom: string, requete: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await requete;
  if (error) {
    console.error(`[qualiopi-evidence] ${nom} illisible — ignoré : ${error.message}`);
    return [];
  }
  return (data ?? []) as T[];
}

export async function loadOrgEvidence(organizationId: string): Promise<EvidenceMap> {
  const sb = supabaseAdmin();
  const org = organizationId;

  const [formations, trainers, veille, complaints, actions, checklists, dossiers, supports, incidents, axes] = await Promise.all([
    lire<{ is_published: boolean | null; rncp_code: string | null; rs_code: string | null; metadata: { catalog?: { referentHandicap?: string } } | null }>(
      'formations',
      sb.schema('app').from('formations').select('is_published, rncp_code, rs_code, metadata').eq('organization_id', org).is('deleted_at', null),
    ),
    lire<{ is_internal: boolean | null; cv_path: string | null; contract_path: string | null }>(
      'formateurs',
      sb.schema('app').from('trainers').select('is_internal, cv_path, contract_path').eq('organization_id', org).is('deleted_at', null),
    ),
    lire<{ category: string; status: string }>(
      'veille',
      sb.schema('app').from('veille_entries' as never).select('category, status').eq('organization_id' as never, org as never).is('deleted_at' as never, null),
    ),
    lire<{ status: string }>(
      'réclamations',
      sb.schema('app').from('complaints').select('status').eq('organization_id', org).is('deleted_at', null),
    ),
    lire<{ status: string }>(
      'actions d’amélioration',
      sb.schema('app').from('improvement_actions' as never).select('status').eq('organization_id' as never, org as never).is('deleted_at' as never, null),
    ),
    lire<{ details: ChecklistDetail[] | null }>(
      'check-lists',
      sb.schema('app').from('qualiopi_dossier_checklists').select('details').eq('organization_id', org),
    ),
    lire<{ id: string }>(
      'dossiers',
      sb.schema('app').from('dossiers').select('id').eq('organization_id', org).is('deleted_at', null),
    ),
    lire<{ id: string }>(
      'supports pédagogiques',
      sb.schema('app').from('module_resources' as never).select('id').eq('organization_id' as never, org as never).is('deleted_at' as never, null),
    ),
    lire<{ status: string }>(
      'incidents',
      sb.schema('app').from('quality_incidents' as never).select('status').eq('organization_id' as never, org as never).is('deleted_at' as never, null),
    ),
    lire<{ status: string }>(
      'axes d’amélioration',
      sb.schema('app').from('improvement_axes' as never).select('status').eq('organization_id' as never, org as never).is('deleted_at' as never, null),
    ),
  ]);

  // Satisfaction recueillie, via les dossiers de l'organisme.
  const dossierIds = dossiers.map((d) => d.id);
  const satisfactions = dossierIds.length
    ? await lire<{ template: { kind: string } | { kind: string }[] | null }>(
        'questionnaires',
        sb
          .schema('app')
          .from('questionnaire_assignments')
          .select('template:questionnaire_templates(kind)')
          .in('dossier_id', dossierIds)
          .eq('status', 'completed'),
      )
    : [];
  const nbSatisfaction = satisfactions.filter((a) => {
    const t = Array.isArray(a.template) ? a.template[0] : a.template;
    return t?.kind === 'satisfaction_chaud' || t?.kind === 'satisfaction_froid';
  }).length;

  // Conformité par indicateur de niveau dossier, agrégée sur tous les dossiers.
  const parIndicateur = new Map<number, { applicables: number; satisfaits: number }>();
  for (const c of checklists) {
    for (const d of c.details ?? []) {
      if (d.applicable === false) continue;
      const acc = parIndicateur.get(d.number) ?? { applicables: 0, satisfaits: 0 };
      acc.applicables += 1;
      if (d.satisfied) acc.satisfaits += 1;
      parIndicateur.set(d.number, acc);
    }
  }

  const out: EvidenceMap = {};
  const ajouter = (numero: number, e: Evidence) => {
    (out[numero] ??= []).push(e);
  };

  // Indicateurs de niveau dossier : l'état réel de chaque dossier suivi.
  for (const [numero, { applicables, satisfaits }] of parIndicateur) {
    ajouter(numero, {
      label: `${satisfaits}/${pluriel(applicables, 'dossier')} conforme${satisfaits > 1 ? 's' : ''} sur cet indicateur`,
      ok: applicables > 0 && satisfaits === applicables,
      href: '/qualiopi?onglet=dossiers',
    });
  }

  // 1 — information du public.
  const publiees = formations.filter((f) => f.is_published).length;
  ajouter(1, {
    label: `${pluriel(publiees, 'formation publiée', 'formations publiées')} au catalogue public (objectifs, programme, prix, délais, accessibilité)`,
    ok: publiees > 0,
    href: '/formations',
  });

  // 2 — indicateurs de résultats : publiés automatiquement sur les fiches.
  ajouter(2, {
    label: 'Indicateurs de résultats calculés et publiés sur chaque fiche formation',
    ok: publiees > 0,
    href: '/indicateurs',
  });

  // 3 — prestations certifiantes.
  const certifiantes = formations.filter((f) => (f.rncp_code ?? '').trim() || (f.rs_code ?? '').trim()).length;
  if (certifiantes > 0) {
    ajouter(3, {
      label: `${pluriel(certifiantes, 'formation certifiante', 'formations certifiantes')} (RNCP ou RS) — taux d'obtention à publier`,
      ok: false,
      href: '/indicateurs',
    });
  }

  // 19 — ressources pédagogiques.
  ajouter(19, {
    label: `${pluriel(supports.length, 'support pédagogique déposé', 'supports pédagogiques déposés')}, accessibles aux apprenants dans leur espace`,
    ok: supports.length > 0,
    href: '/formations',
  });

  // 21 — compétences des intervenants.
  const avecCv = trainers.filter((t) => t.cv_path).length;
  ajouter(21, {
    label: `${avecCv}/${pluriel(trainers.length, 'formateur')} avec un CV déposé`,
    ok: trainers.length > 0 && avecCv === trainers.length,
    href: '/formateurs',
  });

  // 23 à 26 — veille.
  const veilleDe = (...cats: string[]) => veille.filter((v) => cats.includes(v.category));
  const ligneVeille = (numero: number, cats: string[], sujet: string) => {
    const e = veilleDe(...cats);
    ajouter(numero, {
      label: `${pluriel(e.length, 'entrée', 'entrées')} de veille ${sujet}, dont ${e.filter((v) => v.status === 'traitee').length} traitée${e.filter((v) => v.status === 'traitee').length > 1 ? 's' : ''}`,
      ok: e.length > 0,
      href: '/amelioration-continue',
    });
  };
  ligneVeille(23, ['legale'], 'légale et réglementaire');
  ligneVeille(24, ['metier'], 'emplois et métiers');
  ligneVeille(25, ['pedagogique', 'technologique'], 'pédagogique et technologique');
  ligneVeille(26, ['handicap'], 'handicap');
  const avecReferent = formations.filter((f) => (f.metadata?.catalog?.referentHandicap ?? '').trim()).length;
  ajouter(26, {
    label: `${avecReferent}/${pluriel(formations.length, 'formation')} avec un référent handicap renseigné`,
    ok: formations.length > 0 && avecReferent === formations.length,
    href: '/formations',
  });

  // 27 — sous-traitance : intervenants externes sous contrat.
  const externes = trainers.filter((t) => t.is_internal === false);
  if (externes.length > 0) {
    const sousContrat = externes.filter((t) => t.contract_path).length;
    ajouter(27, {
      label: `${sousContrat}/${pluriel(externes.length, 'intervenant externe', 'intervenants externes')} avec un contrat de sous-traitance déposé`,
      ok: sousContrat === externes.length,
      href: '/formateurs',
    });
  }

  // 30 — appréciations.
  ajouter(30, {
    label: `${pluriel(nbSatisfaction, 'questionnaire de satisfaction complété', 'questionnaires de satisfaction complétés')}`,
    ok: nbSatisfaction > 0,
    href: '/indicateurs',
  });

  // 31 — réclamations : un dispositif de recueil ouvert, et leur traitement.
  const traitees = complaints.filter((c) => c.status === 'resolved' || c.status === 'closed').length;
  ajouter(31, {
    label:
      complaints.length === 0
        ? 'Dispositif de réclamation actif (dépôt depuis l’espace apprenant, suivi par l’équipe) — aucune réclamation reçue'
        : `${traitees}/${pluriel(complaints.length, 'réclamation')} traitée${traitees > 1 ? 's' : ''}`,
    ok: complaints.length === 0 || traitees === complaints.length,
    href: '/reclamations',
  });

  // 31 — incidents (aléas, difficultés, abandons) consignés et traités.
  if (incidents.length > 0) {
    const incidentsTraites = incidents.filter((i) => i.status === 'traite').length;
    ajouter(31, {
      label: `${incidentsTraites}/${pluriel(incidents.length, 'incident')} traité${incidentsTraites > 1 ? 's' : ''}`,
      ok: incidentsTraites === incidents.length,
      href: '/amelioration-continue?onglet=incidents',
    });
  }

  // 32 — axes d'amélioration suivis jusqu'à leur optimisation.
  const optimises = axes.filter((a) => a.status === 'optimise').length;
  ajouter(32, {
    label:
      axes.length === 0
        ? 'Aucun axe d’amélioration défini'
        : `${pluriel(axes.length, 'axe')} d’amélioration, dont ${optimises} optimisé${optimises > 1 ? 's' : ''}`,
    ok: axes.length > 0,
    href: '/amelioration-continue?onglet=axes',
  });

  // 32 — amélioration continue.
  const faites = actions.filter((a) => a.status === 'done').length;
  ajouter(32, {
    label: `${faites}/${pluriel(actions.length, 'action')} d'amélioration terminée${faites > 1 ? 's' : ''}`,
    ok: actions.length > 0,
    href: '/amelioration-continue',
  });

  return out;
}
