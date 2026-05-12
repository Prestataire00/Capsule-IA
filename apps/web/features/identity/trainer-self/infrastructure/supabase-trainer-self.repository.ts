import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/shared/types/database';
import type { TrainerSelfRepository } from '../application/ports';
import { TrainerProfile } from '../domain/trainer-profile';
import { OrganizationId, TrainerId, UserId } from '@/features/dossier/domain/ids';

type TrainerRow = {
  id: string;
  organization_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  bio: string | null;
  specialties: string[] | null;
  is_internal: boolean;
  siret: string | null;
  hourly_rate_cents: number | null;
  metadata: Record<string, unknown> | null;
};

export class SupabaseTrainerSelfRepository implements TrainerSelfRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

  async findById(id: TrainerId): Promise<TrainerProfile | null> {
    const { data, error } = await (this.supabase as any)
      .schema('app')
      .from('trainers')
      .select('id, organization_id, user_id, first_name, last_name, email, phone, bio, specialties, is_internal, siret, hourly_rate_cents, metadata')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as TrainerRow;

    const metadata = (row.metadata ?? {}) as Record<string, unknown> & { avatar_path?: string };
    return TrainerProfile.hydrate({
      id: TrainerId(row.id),
      organizationId: OrganizationId(row.organization_id),
      userId: UserId(row.user_id!),
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      bio: row.bio,
      specialties: row.specialties ?? [],
      avatarPath: typeof metadata.avatar_path === 'string' ? metadata.avatar_path : null,
      isInternal: row.is_internal,
      siret: row.siret,
      hourlyRateCents: row.hourly_rate_cents,
      metadata,
    });
  }

  async saveMany(profiles: TrainerProfile[]): Promise<void> {
    // PostgREST ne fait pas de transaction multi-row par défaut → UPDATE 1 par 1.
    // Acceptable : N petit (<=10), partiel-rollback côté domaine ok pour V1.
    for (const p of profiles) {
      const dto = p.toPersistence();
      const { error } = await (this.supabase as any)
        .schema('app')
        .from('trainers')
        .update({
          first_name: dto.first_name,
          last_name: dto.last_name,
          phone: dto.phone,
          bio: dto.bio,
          specialties: dto.specialties,
          metadata: dto.metadata,
        })
        .eq('id', dto.id);
      if (error) throw error;
    }
  }
}
