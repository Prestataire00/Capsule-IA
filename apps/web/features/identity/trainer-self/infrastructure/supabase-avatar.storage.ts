import type { ServerSupabase } from '@/shared/lib/supabase/client-type';
import type { AvatarStorage } from '../application/ports';

const BUCKET = 'avatars';

export class SupabaseAvatarStorage implements AvatarStorage {
  constructor(private supabase: ServerSupabase) {}

  async upload(
    userId: string,
    fileName: string,
    body: ArrayBuffer,
    contentType: string,
  ): Promise<string> {
    const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : 'png';
    const path = `${userId}/avatar.${ext}`;
    const { error } = await this.supabase.storage.from(BUCKET).upload(path, body, {
      contentType,
      upsert: true,
    });
    if (error) throw error;
    return path;
  }

  publicUrl(path: string): string {
    const { data } = this.supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }
}
