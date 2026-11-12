import { describe, expect, it } from 'vitest';
import { appareil, canal, changements, connexionVisio, horodatage } from './tracabilite';

describe('traçabilité de l’émargement', () => {
  it('horodate à la seconde, heure de Paris', () => {
    expect(horodatage('2026-10-08T11:45:12Z')).toBe('08/10/2026 13:45:12');
    expect(horodatage(null)).toBe('');
  });
  it('dit comment la présence a été recueillie', () => {
    expect(canal('qr', null)).toBe('QR code projeté en salle');
    expect(canal(null, 'trainer_override')).toBe('Présence attestée par l’équipe');
  });
  it('reconnaît l’appareil', () => {
    expect(appareil('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17.0 Mobile Safari/604.1')).toBe('iPhone · Safari');
    expect(appareil('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36')).toBe('Windows · Chrome');
  });
  it('lit la connexion visio et les corrections', () => {
    expect(connexionVisio({ joinTime: '2026-10-08T07:02:00Z', leaveTime: '2026-10-08T10:31:00Z' })).toBe('08/10/2026 09:02:00 → 08/10/2026 12:31:00');
    expect(changements({ status: 'absent', notes: 'x' }, { status: 'present', notes: 'y' })).toEqual(['présence']);
  });
});
