import { describe, expect, it } from 'vitest';
import { etapesVers, statutAttendu } from './avancement-automatique';

const maintenant = new Date('2026-10-09T15:00:00Z');
const base = { premierDebut: '2026-10-08T07:00:00Z', derniereFin: '2026-10-09T15:30:00Z', presences: 0, maintenant };

describe('le statut suit les séances', () => {
  it('planifié : en cours dès la première séance commencée', () => {
    expect(statutAttendu({ ...base, statut: 'scheduled' })).toBe('active');
  });
  it('terminé une fois la dernière séance finie', () => {
    expect(statutAttendu({ ...base, statut: 'active', derniereFin: '2026-10-09T14:00:00Z' })).toBe('completed');
    expect(statutAttendu({ ...base, statut: 'scheduled', derniereFin: '2026-10-09T14:00:00Z' })).toBe('completed');
  });
  it('brouillon : seulement si quelqu’un a émargé présent', () => {
    expect(statutAttendu({ ...base, statut: 'draft' })).toBeNull();
    expect(statutAttendu({ ...base, statut: 'draft', presences: 3 })).toBe('active');
    expect(statutAttendu({ ...base, statut: 'pending_validation', presences: 1, derniereFin: '2026-10-09T14:00:00Z' })).toBe('completed');
  });
  it('rien avant la première séance, rien sans séance, rien pour un dossier clos ou annulé', () => {
    expect(statutAttendu({ ...base, statut: 'scheduled', premierDebut: '2026-10-10T07:00:00Z', derniereFin: '2026-10-10T15:00:00Z' })).toBeNull();
    expect(statutAttendu({ ...base, statut: 'scheduled', premierDebut: null, derniereFin: null })).toBeNull();
    expect(statutAttendu({ ...base, statut: 'closed', derniereFin: '2026-10-09T14:00:00Z' })).toBeNull();
    expect(statutAttendu({ ...base, statut: 'cancelled', presences: 5 })).toBeNull();
    expect(statutAttendu({ ...base, statut: 'active' })).toBeNull();
  });
  it('les étapes respectent les transitions de la base', () => {
    expect(etapesVers('draft', 'completed')).toEqual(['active', 'completed']);
    expect(etapesVers('active', 'completed')).toEqual(['completed']);
    expect(etapesVers('scheduled', 'active')).toEqual(['active']);
  });
});
