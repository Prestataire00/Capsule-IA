import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { SidebarRail, type SidebarCounts } from './sidebar-rail';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { getRecentDossiers } from '@/features/reports/recent-dossiers.query';
import { getCurrentMember, roleLabel } from '@/shared/lib/auth/current-member';

async function fetchSidebarCounts(): Promise<SidebarCounts> {
  try {
    const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [complaints, signatures, responses, invoices, demandes] = await Promise.all([
      sb
        .schema('app')
        .from('complaints')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress']),
      sb
        .schema('app')
        .from('attendance_signatures')
        .select('id', { count: 'exact', head: true })
        .is('signed_at', null),
      sb
        .schema('app')
        .from('questionnaire_responses')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'in_progress']),
      sb
        .schema('app')
        .from('invoices')
        // Badge « à traiter » : uniquement les factures EN RETARD. Une facture
        // simplement émise (en attente de paiement normal) ne fait pas clignoter
        // le badge en permanence.
        .select('id', { count: 'exact', head: true })
        .eq('status', 'overdue'),
      sb
        .schema('app')
        .from('prospects')
        .select('id', { count: 'exact', head: true })
        .eq('validation_status', 'pending_validation')
        .is('converted_dossier_id', null)
        .is('deleted_at', null),
    ]);

    return {
      reclamationsActive: complaints.count ?? 0,
      emargementsPending: signatures.count ?? 0,
      questionnairesActive: responses.count ?? 0,
      invoicesOverdue: invoices.count ?? 0,
      demandesPending: demandes.count ?? 0,
    };
  } catch (err) {
    console.error('[sidebar-rail-server] unexpected', err);
    return {};
  }
}

export async function SidebarRailServer() {
  const [counts, me] = await Promise.all([fetchSidebarCounts(), getCurrentMember()]);
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
