import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { SidebarRail, type SidebarCounts } from './sidebar-rail';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { getRecentDossiers } from '@/features/reports/recent-dossiers.query';
import { getCurrentMember, roleLabel } from '@/shared/lib/auth/current-member';

// Service role : chaque compteur est borné à l'organisation du membre — sans ce
// filtre, les badges additionnaient les données de tous les organismes.
async function fetchSidebarCounts(orgId: string | null, userId: string | null): Promise<SidebarCounts> {
  if (!orgId) return {};
  try {
    const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [complaints, signatures, responses, invoices, demandes, taches, supports, coursAValider] = await Promise.all([
      sb
        .schema('app')
        .from('complaints')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .in('status', ['open', 'in_progress']),
      sb
        .schema('app')
        .from('attendance_sheets')
        // Feuilles à clôturer : séance terminée, feuille encore ouverte.
        .select('id, sessions!inner(ends_at)', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .neq('status', 'finalized')
        .lt('sessions.ends_at', new Date().toISOString()),
      sb
        .schema('app')
        .from('questionnaire_responses')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .in('status', ['pending', 'in_progress']),
      sb
        .schema('app')
        .from('invoices')
        // Badge « à traiter » : uniquement les factures EN RETARD. Une facture
        // simplement émise (en attente de paiement normal) ne fait pas clignoter
        // le badge en permanence.
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'overdue'),
      sb
        .schema('app')
        .from('prospects')
        .select('id', { count: 'exact', head: true })
        .eq('validation_status', 'pending_validation')
        .is('converted_dossier_id', null)
        .eq('organization_id', orgId)
        .is('deleted_at', null),
      // Badge « Tâches » : MES tâches ouvertes, pas celles de toute l'équipe.
      // Son échec ne doit pas emporter les autres badges (table absente si la
      // migration 0159 n'est pas encore appliquée).
      userId
        ? Promise.resolve(
            sb
              .schema('app')
              .from('tasks')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', orgId)
              .eq('assignee_user_id', userId)
              .neq('status', 'done')
              .is('deleted_at', null),
          )
            .then((r) => ({ count: r.count ?? 0 }))
            .catch(() => ({ count: 0 }))
        : Promise.resolve({ count: 0 }),
      // Badge « Supports à valider ». Comme ci-dessus, son échec ne doit pas
      // emporter les autres badges : la table n'existe pas avant la 0164.
      Promise.resolve(
        sb
          .schema('app')
          .from('session_resources')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('validation_status', 'en_attente')
          .is('deleted_at', null),
      )
        .then((r) => ({ count: r.count ?? 0 }))
        .catch(() => ({ count: 0 })),
      // Quiz et exercices en attente (0172) : même file, même badge.
      Promise.resolve(
        sb
          .schema('app')
          .from('exercises')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('validation_status', 'en_attente')
          .eq('is_published', true)
          .is('deleted_at', null),
      )
        .then((r) => ({ count: r.count ?? 0 }))
        .catch(() => ({ count: 0 })),
    ]);

    return {
      tasksOpen: taches.count ?? 0,
      reclamationsActive: complaints.count ?? 0,
      emargementsPending: signatures.count ?? 0,
      questionnairesActive: responses.count ?? 0,
      invoicesOverdue: invoices.count ?? 0,
      demandesPending: demandes.count ?? 0,
      supportsAValider: (supports.count ?? 0) + (coursAValider.count ?? 0),
    };
  } catch (err) {
    console.error('[sidebar-rail-server] unexpected', err);
    return {};
  }
}

export async function SidebarRailServer() {
  const me = await getCurrentMember();
  const counts = await fetchSidebarCounts(me?.organizationId ?? null, me?.userId ?? null);
  const user = me ? { fullName: me.fullName, roleLabel: roleLabel(me.role), role: me.role } : undefined;
  // Les « Récents » du menu Dossiers venaient du module de démonstration : trois
  // dossiers fictifs, les mêmes pour tous les organismes (audit CAP-28).
  const recents = await getRecentDossiers(supabaseServer(), 3);

  return (
    <SidebarRail
      counts={counts}
      user={user}
      recentDossiers={recents.map((d) => ({
        id: d.id,
        reference: d.reference,
        learnerName: d.learnerName,
      }))}
    />
  );
}
