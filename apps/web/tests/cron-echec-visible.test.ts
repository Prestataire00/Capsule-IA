// Les crons accumulaient leurs erreurs dans `errors` puis renvoyaient
// `{ ok: true }` en HTTP 200. Une convocation Qualiopi qui ne partait pas ne
// réveillait personne : ni un superviseur qui regarde le code HTTP, ni pg_cron,
// qui voit la réponse.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { compterErreurs, reponseCron } from '@/shared/lib/http/cron-response';

const CRONS = path.resolve(__dirname, '../app/api/cron');

describe('détection des erreurs dans un corps de réponse', () => {
  it('trouve les erreurs imbriquées', () => {
    expect(compterErreurs({ convocations: { sent: 3, errors: ['a', 'b'] }, quotes: { errors: [] } })).toBe(2);
  });

  it('comprend la forme de la synchronisation Zoom', () => {
    expect(compterErreurs({ results: [{ status: 'error', errorDetail: 'api 429' }, { status: 'success' }] })).toBe(1);
  });

  it('ne voit pas d’erreur là où il n’y en a pas', () => {
    expect(compterErreurs({ sent: 12, errors: [], summary: { error: '' } })).toBe(0);
  });
});

describe('réponse HTTP d’un cron', () => {
  it('répond 500 dès la première erreur, en gardant le détail', async () => {
    const r = reponseCron('test', { sent: 4, errors: ['convocation 123: sans destinataire'] });
    expect(r.status).toBe(500);
    const corps = await r.json();
    expect(corps.ok).toBe(false);
    expect(corps.errorCount).toBe(1);
    // Le détail de ce qui a marché reste lisible : il sert à savoir quoi reprendre.
    expect(corps.sent).toBe(4);
  });

  it('répond 200 quand tout est passé', async () => {
    const r = reponseCron('test', { sent: 4, errors: [] });
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
  });
});

describe('les quatre crons sont branchés dessus', () => {
  const fichiers = fs
    .readdirSync(CRONS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(CRONS, e.name, 'route.ts'))
    .filter((p) => fs.existsSync(p));

  it('le dépôt a bien plusieurs crons', () => {
    expect(fichiers.length).toBeGreaterThanOrEqual(4);
  });

  for (const p of fichiers) {
    const nom = path.basename(path.dirname(p));
    it(`${nom} ne se déclare plus sain en échouant`, () => {
      const src = fs.readFileSync(p, 'utf-8');
      expect(src).toContain('reponseCron(');
      // Plus aucun `ok: true` en dur dans la réponse finale.
      expect(src).not.toMatch(/NextResponse\.json\(\{\s*\n?\s*ok: true,/);
    });
  }
});
