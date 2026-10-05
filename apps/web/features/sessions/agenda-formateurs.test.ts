import { describe, expect, it } from 'vitest';
import { agendaAvecFormateurs, type SeanceAgenda } from './agenda-formateurs';
import type { CalEvent } from '@/shared/lib/integrations/google-calendar-client';

const evt = (id: string, title: string, start: string): CalEvent => ({
  id, title, start, end: null, allDay: false, location: null, htmlLink: null, hangoutLink: 'https://meet', colorId: null, bgColor: null, fgColor: null,
});
const seance = (p: Partial<SeanceAgenda> & { id: string }): SeanceAgenda => ({
  titre: 'Acculturation IA', debut: '2026-10-12T09:00:00Z', fin: '2026-10-12T12:00:00Z', lieu: null, formateurs: [], evenementId: null, ...p,
});

describe('agenda : le formateur de chaque séance', () => {
  it('le Meet d’une séance affiche son formateur actuel', () => {
    const r = agendaAvecFormateurs([evt('g1', 'ancien titre', '2026-10-12T09:00:00Z')], [seance({ id: 's1', evenementId: 'g1', formateurs: ['Faouzi Fieve'] })]);
    expect(r).toHaveLength(1);
    expect(r[0]?.title).toBe('Acculturation IA · Formateur : Faouzi Fieve');
    expect(r[0]?.hangoutLink).toBe('https://meet');
  });

  it('une séance sans évènement Google apparaît quand même', () => {
    const r = agendaAvecFormateurs([evt('g2', 'Rendez-vous', '2026-10-12T08:00:00Z')], [seance({ id: 's2', lieu: 'Paris' })]);
    expect(r.map((e) => e.title)).toEqual(['Rendez-vous', 'Acculturation IA · Formateur à désigner']);
    expect(r[1]?.htmlLink).toBe('/sessions/s2');
  });
});
