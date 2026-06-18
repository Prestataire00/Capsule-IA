import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { SidebarRail, type SidebarCounts } from './sidebar-rail';
import { getCurrentMember, roleLabel } from '@/shared/lib/auth/current-member';

async function fetchSidebarCounts(): Promise<SidebarCounts> {
  try {
    const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [complaints, signatures, responses, invoices] = await Promise.all([
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
        .select('id', { count: 'exact', head: true })
        .in('status', ['issued', 'partially_paid', 'overdue']),
    ]);

    return {
      reclamationsActive: complaints.count ?? 0,
      emargementsPending: signatures.count ?? 0,
      questionnairesActive: responses.count ?? 0,
      invoicesUnpaid: invoices.count ?? 0,
    };
  } catch (err) {
    console.error('[sidebar-rail-server] unexpected', err);
    return {};
  }
}

export async function SidebarRailServer() {
  const [counts, me] = await Promise.all([fetchSidebarCounts(), getCurrentMember()]);
  const user = me ? { fullName: me.fullName, roleLabel: roleLabel(me.role) } : undefined;
  return <SidebarRail counts={counts} user={user} />;
}
