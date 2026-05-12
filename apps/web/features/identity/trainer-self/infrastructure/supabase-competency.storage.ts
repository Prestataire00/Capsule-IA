import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/shared/types/database';
import type { CompetencyStorage } from '../application/ports';

const BUCKET = 'trainer-cvs';

export class SupabaseCompetencyStorage implements CompetencyStorage {
  constructor(private supabase: SupabaseClient<Database>) {}

  async upload(
    orgId: string,
    trainerId: string,
    competencyId: string,
    fileName: string,
    body: ArrayBuffer,
    contentType: string,
  ): Promise<string> {
    const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : 'pdf';
    const path = `${orgId}/${trainerId}/${competencyId}.${ext}`;
    const { error } = await this.supabase.storage.from(BUCKET).upload(path, body, {
      contentType,
      upsert: false,
    });
    if (error) throw error;
    return path;
  }

  async remove(path: string): Promise<void> {
    const { error } = await this.supabase.storage.from(BUCKET).remove([path]);
    if (error) throw error;
  }
}
