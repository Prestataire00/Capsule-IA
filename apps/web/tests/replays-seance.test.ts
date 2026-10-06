import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('replays tl;dv / Lexi sur la séance', () => {
  it('l’équipe : séance de son organisme ; le formateur : sa séance', () => {
    expect(lire('../app/(dashboard)/sessions/[id]/replay-actions.ts')).toContain("guardAction('dossiers')");
    expect(lire('../app/(formateur)/seance/[id]/replay-actions.ts')).toContain('requireMyTrainerSession(p.data.sessionId)');
  });
  it('seule une adresse web est enregistrée', () => {
    expect(lire('../features/sessions/replays-store.ts')).toContain('const lien = lienDeReplay(args.url);');
  });
  it('l’entreprise retrouve les replays de ses dossiers', () => {
    expect(lire('../features/espace-entreprise/load.ts')).toContain('replays: replaysDe(d.id)');
    expect(lire('../app/(entreprise)/espace-entreprise/[token]/page.tsx')).toContain('d.replays.map');
  });
});
