import { describe, it, expect } from 'vitest';
import {
  ETATS_TERMINAUX,
  automatisationApplicable,
  estEtatTerminal,
  estFormationDejaTerminee,
  jour,
  motifDuBlocage,
  statutALaCreation,
} from '../saisie-retroactive';

describe('états qui éteignent les automatisations', () => {
  it('reconnaît les états terminaux', () => {
    for (const s of ETATS_TERMINAUX) expect(estEtatTerminal(s), s).toBe(true);
  });

  it('laisse vivre les états de travail', () => {
    for (const s of ['draft', 'pending_validation', 'scheduled', 'active', 'completed']) {
      expect(estEtatTerminal(s), s).toBe(false);
    }
  });

  it('ne prend pas l’absence de statut pour un état terminal', () => {
    expect(estEtatTerminal(null)).toBe(false);
    expect(estEtatTerminal(undefined)).toBe(false);
  });
});

describe('une automatisation doit-elle partir ?', () => {
  it('part pour un évènement à venir', () => {
    expect(
      automatisationApplicable({ statut: 'active', datePivot: '2026-10-15', creeLe: '2026-09-21' }),
    ).toBe(true);
  });

  it('NE part PAS pour un évènement antérieur à la saisie', () => {
    // Le cas d'Ismael : formation de juin saisie en septembre.
    expect(
      automatisationApplicable({ statut: 'completed', datePivot: '2026-06-30', creeLe: '2026-09-21' }),
    ).toBe(false);
  });

  it('part pour un évènement le jour même de la saisie', () => {
    // Saisir le dernier jour de formation et interroger le lendemain est normal.
    expect(
      automatisationApplicable({ statut: 'active', datePivot: '2026-09-21', creeLe: '2026-09-21' }),
    ).toBe(true);
  });

  it('ignore l’heure : seul le jour compte', () => {
    expect(
      automatisationApplicable({
        statut: 'active',
        datePivot: '2026-09-21',
        creeLe: '2026-09-21T23:59:00.000Z',
      }),
    ).toBe(true);
  });

  it('ne part jamais pour un dossier archivé, même si l’évènement est à venir', () => {
    expect(
      automatisationApplicable({ statut: 'archived', datePivot: '2026-12-01', creeLe: '2026-09-21' }),
    ).toBe(false);
  });

  it('ne part ni pour un dossier clôturé ni pour un dossier annulé', () => {
    for (const statut of ['closed', 'cancelled']) {
      expect(
        automatisationApplicable({ statut, datePivot: '2026-12-01', creeLe: '2026-09-21' }),
        statut,
      ).toBe(false);
    }
  });

  it('laisse passer quand une date manque plutôt que de tout éteindre', () => {
    // Une donnée absente ne doit pas couper des envois légitimes en silence.
    expect(automatisationApplicable({ statut: 'active', datePivot: null, creeLe: '2026-09-21' })).toBe(true);
    expect(automatisationApplicable({ statut: 'active', datePivot: '2026-10-01', creeLe: null })).toBe(true);
  });
});

describe('motif du blocage', () => {
  it('nomme l’état terminal', () => {
    expect(motifDuBlocage({ statut: 'archived', datePivot: '2026-12-01', creeLe: '2026-09-21' })).toBe(
      'dossier archived',
    );
  });

  it('dit quand c’est une saisie rétroactive', () => {
    expect(motifDuBlocage({ statut: 'completed', datePivot: '2026-06-30', creeLe: '2026-09-21' })).toBe(
      'saisi après la formation',
    );
  });

  it('ne donne aucun motif quand l’envoi est légitime', () => {
    expect(motifDuBlocage({ statut: 'active', datePivot: '2026-12-01', creeLe: '2026-09-21' })).toBeNull();
  });
});

describe('statut à la création', () => {
  it('archive d’emblée une formation déjà terminée', () => {
    expect(
      statutALaCreation({ statutDemande: 'draft', finFormation: '2026-06-30', aujourdhui: '2026-09-21' }),
    ).toBe('archived');
  });

  it('laisse son statut à une formation à venir', () => {
    expect(
      statutALaCreation({ statutDemande: 'draft', finFormation: '2026-12-01', aujourdhui: '2026-09-21' }),
    ).toBe('draft');
  });

  it('n’archive pas une formation qui se termine aujourd’hui', () => {
    // Elle vient de finir : les envois de fin ont encore un sens.
    expect(
      statutALaCreation({ statutDemande: 'active', finFormation: '2026-09-21', aujourdhui: '2026-09-21' }),
    ).toBe('active');
    expect(estFormationDejaTerminee('2026-09-21', '2026-09-21')).toBe(false);
  });
});

describe('réduction au jour', () => {
  it('coupe l’horodatage', () => {
    expect(jour('2026-09-21T14:32:11.000Z')).toBe('2026-09-21');
    expect(jour('2026-09-21')).toBe('2026-09-21');
  });

  it('accepte un objet Date', () => {
    expect(jour(new Date('2026-09-21T10:00:00.000Z'))).toBe('2026-09-21');
  });
});
