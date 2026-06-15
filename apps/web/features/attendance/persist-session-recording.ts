import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ZoomRecording } from './zoom-api-client';

export type PersistSessionRecordingArgs = {
  organizationId: string;
  sessionId: string;
  recording: ZoomRecording;
  createdBy?: string;
};

export type PersistSessionRecordingResult =
  | { ok: true }
  | { ok: false; error: string };

export async function persistSessionRecording(
  sb: SupabaseClient,
  args: PersistSessionRecordingArgs,
): Promise<PersistSessionRecordingResult> {
  const { organizationId, sessionId, recording, createdBy } = args;

  const { error } = await sb
    .schema('app')
    .from('session_recordings' as never)
    .upsert(
      {
        organization_id: organizationId,
        session_id: sessionId,
        source: 'zoom',
        external_id: recording.externalId,
        play_url: recording.playUrl,
        passcode: recording.passcode,
        duration_seconds: recording.durationSeconds,
        recorded_at: recording.recordedAt,
        created_by: createdBy ?? null,
      },
      { onConflict: 'session_id,external_id' },
    );

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
