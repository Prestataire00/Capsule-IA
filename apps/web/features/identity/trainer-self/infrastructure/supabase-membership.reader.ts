import type { ServerSupabase } from '@/shared/lib/supabase/client-type';
import type { MembershipReader, TrainerMembership } from '../application/ports';
import { OrganizationId, TrainerId } from '@/features/dossier/domain/ids';

type MembershipRow = {
  organization_id: string;
  organization_name: string;
  trainer_id: string;
  first_name: string;
  last_name: string;
  is_internal: boolean;
};

export class SupabaseMembershipReader implements MembershipReader {
  constructor(private supabase: ServerSupabase) {}

  async list(): Promise<TrainerMembership[]> {
    // Les deux RPC vivent dans le schéma `app` : sans `.schema('app')`, PostgREST
    // les cherche dans `public` et renvoie PGRST202. L'erreur remontait jusqu'au
    // layout, qui plantait — un formateur invité ne pouvait jamais entrer dans
    // son espace (audit CAP-26).
    const { data, error } = await (this.supabase.schema('app').rpc as any)('list_my_trainer_memberships');
    if (error) throw error;
    return ((data ?? []) as MembershipRow[]).map((r) => ({
      organizationId: OrganizationId(r.organization_id),
      organizationName: r.organization_name,
      trainerId: TrainerId(r.trainer_id),
      firstName: r.first_name,
      lastName: r.last_name,
      isInternal: r.is_internal,
    }));
  }

  async linkOrphans(): Promise<number> {
    const { data, error } = await (this.supabase.schema('app').rpc as any)('link_my_trainer_rows');
    if (error) throw error;
    return (data as number | null) ?? 0;
  }
}
