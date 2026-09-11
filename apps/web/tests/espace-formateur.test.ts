// Espace formateur (phase 1) : accès à ses séances sans être membre, planning, agenda, robustesse.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildIcs, echapperIcs, plierLigne } from '@/features/trainer-space/ics';
import { calendarToken, readCalendarToken } from '@/features/trainer-space/calendar-token';
import { dayKey, mondayKey } from '@/features/trainer-space/dates';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const SQL = lire('../../../supabase/migrations/0150_espace_formateur_acces.sql');
const CLE = 'cle-de-test-cle-de-test-cle-de-test';
const U = '00000000-0000-4000-8000-0000000000a1';

describe('agenda iCalendar', () => {
  const ics = buildIcs('Mes séances', [
    { uid: 's1@capsule-ia', start: new Date('2026-09-14T07:00:00Z'), end: new Date('2026-09-14T10:30:00Z'), summary: 'Excel, niveau 2; groupe A', location: 'Salle 3', cancelled: true },
  ], new Date('2026-09-11T12:00:00Z'));

  it('respecte le format : CRLF, horaires UTC, texte échappé, séance annulée', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20260914T070000Z');
    expect(ics).toContain('SUMMARY:Excel\\, niveau 2\\; groupe A');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(echapperIcs('a\nb')).toBe('a\\nb');
  });

  it('plie les lignes à 75 octets au plus', () => {
    const plie = plierLigne(`DESCRIPTION:${'é'.repeat(80)}`);
    for (const l of plie.split('\r\n')) expect(Buffer.byteLength(l)).toBeLessThanOrEqual(75);
  });
});

describe('jeton du calendrier', () => {
  it('se relit, et refuse un jeton modifié', () => {
    const t = calendarToken(CLE, U);
    expect(readCalendarToken(CLE, t)).toBe(U);
    expect(readCalendarToken(CLE, t.replace(U, '00000000-0000-4000-8000-0000000000a2'))).toBeNull();
    expect(readCalendarToken('autre-cle-autre-cle-autre-cle-autre', t)).toBeNull();
  });
});

describe('dates au fuseau de Paris', () => {
  it('jour et lundi de la semaine', () => {
    expect(dayKey('2026-09-11T23:30:00Z')).toBe('2026-09-12');
    expect(mondayKey('2026-09-11T10:00:00Z')).toBe('2026-09-07');
    expect(mondayKey('2026-09-13T21:00:00Z')).toBe('2026-09-07');
  });
});

describe('accès du formateur (0150)', () => {
  it('ajoute des lectures sans toucher aux politiques existantes', () => {
    expect(SQL).toContain('CREATE POLICY sessions_formateur_espace ON app.sessions');
    expect(SQL).toContain('CREATE POLICY learners_formateur_espace ON app.learners');
    expect(SQL).toContain('CREATE POLICY attendance_sheets_formateur_espace ON app.attendance_sheets');
    expect(SQL).not.toMatch(/DROP POLICY IF EXISTS (sessions|learners|dossiers|attendance_sheets)_select\b/);
    expect(SQL).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/);
  });

  it('les séances d’un autre utilisateur ne s’interrogent que côté serveur', () => {
    expect(SQL).toContain('REVOKE ALL ON FUNCTION app.trainer_session_ids(UUID) FROM PUBLIC, anon, authenticated');
  });

  it('la liaison des fiches ne dépend plus de citext et respecte l’unicité', () => {
    const fn = SQL.slice(SQL.indexOf('FUNCTION app.link_my_trainer_rows'));
    expect(fn).not.toMatch(/CITEXT/i);
    expect(fn).toContain('email_confirmed_at IS NOT NULL');
    expect(fn).toContain('o.organization_id = t.organization_id');
  });

  it('l’émargement accepte le formateur de la séance, et seulement pour ses séances', () => {
    const access = lire('../features/attendance/access.ts');
    expect(access).toContain('hasTrainerSpace(user.id)');
    expect(access).toContain('role.formateur && !(await seanceDuFormateur(');
  });

  it('« Mes sessions » ne montre que les séances du formateur, même à un administrateur', () => {
    expect(lire('../features/trainer-space/my-sessions.ts')).toContain("rpc('my_trainer_session_ids')");
    expect(lire('../app/(formateur)/mes-sessions/page.tsx')).toContain('mySessionIds(sb)');
  });

  it('l’espace ne plante plus sur la liaison, et affiche une page d’erreur utile', () => {
    const layout = lire('../app/(formateur)/layout.tsx');
    expect(layout).toContain('await reader.linkOrphans();');
    expect(layout).toContain("console.error('[espace formateur] liaison des fiches impossible'");
    expect(fs.existsSync(path.resolve(__dirname, '../app/error.tsx'))).toBe(true);
    expect(fs.existsSync(path.resolve(__dirname, '../app/(formateur)/error.tsx'))).toBe(true);
  });
});
