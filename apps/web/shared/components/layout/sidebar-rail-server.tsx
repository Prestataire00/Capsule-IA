import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { SidebarRail, type SidebarCounts } from './sidebar-rail';

async function fetchSidebarCounts(): Promise<SidebarCounts> {
  try {
    const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { count, error } = await sb
      .schema('app')
      .from('complaints')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress']);

    if (error) {
      console.error('[sidebar-rail-server] complaints count failed', error);
      return {};
    }

    return { reclamationsActive: count ?? 0 };
  } catch (err) {
    console.error('[sidebar-rail-server] unexpected', err);
    return {};
  }
}

export async function SidebarRailServer() {
  const counts = await fetchSidebarCounts();
  return <SidebarRail counts={counts} />;
}
