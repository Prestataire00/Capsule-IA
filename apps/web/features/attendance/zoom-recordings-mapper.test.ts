import { describe, it, expect } from 'vitest';
import { mapZoomRecordings } from './zoom-api-client';

// Fixture réaliste : réponse GET /meetings/{id}/recordings
// 2 fichiers : 1 MP4 (vidéo) + 1 M4A (audio) → seul le MP4 doit être retenu
const FIXTURE_WITH_RECORDINGS = {
  uuid: 'abc123==',
  id: 123456789,
  host_id: 'host_xyz',
  topic: 'Formation React - Session 1',
  type: 8,
  start_time: '2026-06-10T09:00:00Z',
  timezone: 'Europe/Paris',
  duration: 90, // minutes
  total_size: 1234567,
  recording_count: 2,
  share_url: 'https://zoom.us/rec/share/abc',
  recording_play_passcode: 'Secret42!',
  recording_files: [
    {
      id: 'rec-file-mp4-001',
      meeting_id: 'abc123==',
      recording_start: '2026-06-10T09:02:15Z',
      recording_end: '2026-06-10T10:30:45Z',
      file_type: 'MP4',
      recording_type: 'shared_screen_with_speaker_view',
      play_url: 'https://zoom.us/rec/play/mp4-abc',
      download_url: 'https://zoom.us/rec/download/mp4-abc',
      status: 'completed',
      file_extension: 'MP4',
    },
    {
      id: 'rec-file-m4a-002',
      meeting_id: 'abc123==',
      recording_start: '2026-06-10T09:02:15Z',
      recording_end: '2026-06-10T10:30:45Z',
      file_type: 'M4A',
      recording_type: 'audio_only',
      play_url: 'https://zoom.us/rec/play/m4a-abc',
      download_url: 'https://zoom.us/rec/download/m4a-abc',
      status: 'completed',
      file_extension: 'M4A',
    },
  ],
};

describe('mapZoomRecordings', () => {
  it('ne retient que les fichiers MP4 (filtre M4A)', () => {
    const result = mapZoomRecordings(FIXTURE_WITH_RECORDINGS);
    expect(result).toHaveLength(1);
  });

  it('mappe correctement les champs du fichier MP4', () => {
    const result = mapZoomRecordings(FIXTURE_WITH_RECORDINGS);
    const rec = result[0];
    expect(rec).toBeDefined();
    expect(rec!.externalId).toBe('rec-file-mp4-001');
    expect(rec!.playUrl).toBe('https://zoom.us/rec/play/mp4-abc');
    expect(rec!.passcode).toBe('Secret42!');
    expect(rec!.recordedAt).toBe('2026-06-10T09:02:15Z');
    expect(rec!.durationSeconds).toBe(90 * 60); // 90 minutes → 5400 secondes
  });

  it('retourne [] quand recording_files est vide', () => {
    const fixture = { ...FIXTURE_WITH_RECORDINGS, recording_files: [] };
    expect(mapZoomRecordings(fixture)).toHaveLength(0);
  });

  it('utilise password en fallback si recording_play_passcode absent', () => {
    const fixture = {
      ...FIXTURE_WITH_RECORDINGS,
      recording_play_passcode: undefined,
      password: 'FallbackPass',
    };
    const result = mapZoomRecordings(fixture);
    expect(result[0]!.passcode).toBe('FallbackPass');
  });

  it('passcode est null si ni recording_play_passcode ni password', () => {
    const fixture = {
      ...FIXTURE_WITH_RECORDINGS,
      recording_play_passcode: undefined,
      password: undefined,
    };
    const result = mapZoomRecordings(fixture);
    expect(result[0]!.passcode).toBeNull();
  });

  it('durationSeconds est null si body.duration absent', () => {
    const { duration: _omitted, ...fixtureWithoutDuration } = FIXTURE_WITH_RECORDINGS;
    const result = mapZoomRecordings(fixtureWithoutDuration);
    expect(result[0]!.durationSeconds).toBeNull();
  });

  it('recordedAt est null si recording_start absent du fichier', () => {
    const fixture = {
      ...FIXTURE_WITH_RECORDINGS,
      recording_files: [
        { ...FIXTURE_WITH_RECORDINGS.recording_files[0]!, recording_start: undefined },
      ],
    };
    const result = mapZoomRecordings(fixture);
    expect(result[0]!.recordedAt).toBeNull();
  });

  it('ignore les fichiers MP4 sans play_url', () => {
    const fixture = {
      ...FIXTURE_WITH_RECORDINGS,
      recording_files: [
        { ...FIXTURE_WITH_RECORDINGS.recording_files[0]!, play_url: undefined },
      ],
    };
    const result = mapZoomRecordings(fixture);
    expect(result).toHaveLength(0);
  });

  it('retourne [] pour un body invalide (pas de recording_files)', () => {
    expect(mapZoomRecordings({})).toHaveLength(0);
    expect(mapZoomRecordings(null)).toHaveLength(0);
  });
});
