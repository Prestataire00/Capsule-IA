import { describe, it, expect } from 'vitest';
import { parseZoomCsv } from '../zoom-csv-parser';

const ZOOM_NATIVE = `Name (Original Name),User Email,Total Duration (Minutes),Guest,Join Time,Leave Time
Alice Martin,alice@acme.fr,150,No,2026-09-15 09:00:23,2026-09-15 11:30:08
Bob Dupont,bob@acme.fr,30,No,2026-09-15 09:45:11,2026-09-15 10:15:42`;

const TEAMS_LIKE = `Full name,Email,Duration,First Join,Last Leave
Alice Martin,alice@acme.fr,150 minutes,2026-09-15 09:00,2026-09-15 11:30
Bob Dupont,bob@acme.fr,30 minutes,2026-09-15 09:45,2026-09-15 10:15`;

describe('parseZoomCsv', () => {
  it('parses native Zoom CSV', () => {
    const r = parseZoomCsv(ZOOM_NATIVE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows).toHaveLength(2);
      expect(r.rows[0]?.email).toBe('alice@acme.fr');
      expect(r.rows[0]?.durationMinutes).toBe(150);
      expect(r.rows[1]?.email).toBe('bob@acme.fr');
      expect(r.rows[1]?.durationMinutes).toBe(30);
    }
  });

  it('parses Teams-like CSV (different column names)', () => {
    const r = parseZoomCsv(TEAMS_LIKE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows).toHaveLength(2);
      expect(r.rows[0]?.durationMinutes).toBe(150);
      expect(r.rows[1]?.durationMinutes).toBe(30);
    }
  });

  it('rejects empty input', () => {
    const r = parseZoomCsv('');
    expect(r.ok).toBe(false);
  });

  it('rejects when email column missing', () => {
    const r = parseZoomCsv(`Name,Duration\nAlice,150`);
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.code === 'missing_columns') {
      expect(r.error.missing).toContain('email');
    }
  });

  it('handles French column headers', () => {
    const csv = `Nom,Adresse e-mail,Durée totale\nAlice,alice@x.fr,120`;
    const r = parseZoomCsv(csv);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows[0]?.email).toBe('alice@x.fr');
      expect(r.rows[0]?.durationMinutes).toBe(120);
    }
  });
});
