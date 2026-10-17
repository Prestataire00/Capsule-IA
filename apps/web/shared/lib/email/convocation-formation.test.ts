import { describe, expect, it } from 'vitest';
import { sessionConvocationEmail } from './templates';

const base = {
  firstName: 'Léa',
  formationTitle: 'Excel',
  sessionDate: '2026-10-20T07:00:00Z',
  sessionStartTime: '09:00',
  sessionEndTime: '12:30',
  modality: 'presentiel',
  location: 'Lyon',
  remoteUrl: null,
  trainerName: 'Ismael',
};

describe('convocation du stagiaire', () => {
  it('une seule convocation pour toute la formation, toutes les dates', () => {
    const { subject, html } = sessionConvocationEmail({
      ...base,
      seances: [
        { debut: '2026-10-27T07:00:00Z', fin: '2026-10-27T10:30:00Z', modality: 'presentiel', location: 'Lyon', remoteUrl: null },
        { debut: '2026-10-20T07:00:00Z', fin: '2026-10-20T10:30:00Z', modality: 'presentiel', location: 'Lyon', remoteUrl: null },
      ],
    });
    expect(subject).toContain('2 séances dès le mardi 20 octobre 2026');
    expect(html.indexOf('20 octobre')).toBeLessThan(html.indexOf('27 octobre'));
  });
  it('une séance seule garde sa convocation habituelle', () => {
    expect(sessionConvocationEmail(base).subject).toBe('Convocation — Excel le mardi 20 octobre 2026');
  });
});
