import type { ServerSupabase } from '@/shared/lib/supabase/client-type';
import type { TrainerCompetencyRepository } from '../application/ports';
import { TrainerCompetency, type CompetencyKind } from '../domain/trainer-competency';
import { CompetencyId, TrainerId } from '@/features/dossier/domain/ids';

type Row = {
  id: string;
  trainer_id: string;
  kind: string;
  title: string;
  issuer: string | null;
  obtained_at: string | null;
  expires_at: string | null;
  document_path: string | null;
  organization_id: string;
};

export class SupabaseTrainerCompetencyRepository implements TrainerCompetencyRepository {
  constructor(private supabase: ServerSupabase) {}

  async findById(id: CompetencyId): Promise<TrainerCompetency | null> {
    const { data, error } = await (this.supabase as any)
      .schema('app')
      .from('trainer_competencies')
      .select('id, trainer_id, kind, title, issuer, obtained_at, expires_at, document_path, organization_id')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? this.toDomain(data as Row) : null;
  }

  async listByTrainer(trainerId: TrainerId): Promise<TrainerCompetency[]> {
    const { data, error } = await (this.supabase as any)
      .schema('app')
      .from('trainer_competencies')
      .select('id, trainer_id, kind, title, issuer, obtained_at, expires_at, document_path, organization_id')
      .eq('trainer_id', trainerId)
      .order('obtained_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return ((data ?? []) as Row[]).map((r) => this.toDomain(r));
  }

  async insertMany(competencies: TrainerCompetency[]): Promise<void> {
    if (competencies.length === 0) return;
    // organization_id requis par la table - recupere depuis trainer.
    const rows = await Promise.all(
      competencies.map(async (c) => {
        const { data, error } = await (this.supabase as any)
          .schema('app')
          .from('trainers')
          .select('organization_id')
          .eq('id', c.trainerId)
          .single();
        if (error) throw error;
        return {
          ...c.toPersistence(),
          organization_id: (data as { organization_id: string }).organization_id,
        };
      }),
    );
    const { error } = await (this.supabase as any)
      .schema('app')
      .from('trainer_competencies')
      .insert(rows);
    if (error) throw error;
  }

  async remove(id: CompetencyId): Promise<void> {
    const { error } = await (this.supabase as any)
      .schema('app')
      .from('trainer_competencies')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  private toDomain(row: Row): TrainerCompetency {
    return TrainerCompetency.hydrate({
      id: CompetencyId(row.id),
      trainerId: TrainerId(row.trainer_id),
      kind: row.kind as CompetencyKind,
      title: row.title,
      issuer: row.issuer,
      obtainedAt: row.obtained_at ? new Date(row.obtained_at) : null,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      documentPath: row.document_path,
    });
  }
}
