// Réunion du 21/09/2026 : « ajout de statuts de validation du financement
// afin de stopper les processus et les e-mails automatiques en cas d'arrêt ».
//
// Le statut existait depuis le 22/09, mais aucune automatisation ne le lisait :
// un dossier dont l'OPCO avait dit non continuait d'envoyer convocations, liens
// d'émargement, questionnaires de satisfaction et attestations. Le seul moyen
// d'arrêter était de passer le DOSSIER en annulé — un geste distinct, que rien
// ne reliait à la décision du financeur.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { financementArrete, estHorsJeu, STATUTS_FINANCEMENT } from '../features/funders/prise-en-charge';
import { automatisationApplicable, motifDuBlocage } from '../features/dossier/saisie-retroactive';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');
const CRON = lire('app/api/cron/transactional-emails/route.ts');
const ECRAN = lire('app/(dashboard)/dossiers/[id]/financeurs/page.tsx');
const MIGRATION = lire('../../supabase/migrations/0192_financement_annule_coupe_les_envois.sql');

describe('« Annulé » rejoint les statuts', () => {
  it('et la base l’accepte', () => {
    expect(STATUTS_FINANCEMENT.some((s) => s.valeur === 'cancelled')).toBe(true);
    expect(MIGRATION).toContain("'refused', 'paid', 'cancelled'");
  });

  it('sans se confondre avec « Refusé »', () => {
    // « Refusé » est la réponse du financeur, « Annulé » l'abandon de la
    // demande. Les confondre rendrait illisible le suivi des refus, qui sert à
    // savoir ce qui reste à facturer au client.
    expect(estHorsJeu('refused')).toBe(true);
    expect(estHorsJeu('cancelled')).toBe(true);
    expect(STATUTS_FINANCEMENT.find((s) => s.valeur === 'cancelled')?.label).toBe('Annulé');
  });
});

describe('quand le financement est-il arrêté', () => {
  it('quand plus aucune ligne n’est en jeu', () => {
    expect(financementArrete(['refused'])).toBe(true);
    expect(financementArrete(['refused', 'cancelled'])).toBe(true);
  });

  it('pas si un financeur répond encore', () => {
    // Un OPCO qui refuse pendant que l'employeur paie n'arrête rien : la
    // formation a lieu. Couper sur ce seul refus laisserait les stagiaires
    // sans convocation ni lien d'émargement, sans que personne s'en aperçoive
    // avant le jour J.
    expect(financementArrete(['refused', 'approved'])).toBe(false);
    expect(financementArrete(['refused', 'pending'])).toBe(false);
    expect(financementArrete(['paid'])).toBe(false);
  });

  it('pas non plus sans aucun financeur', () => {
    // Rien n'a été décidé : il n'y a rien à interrompre. Sans cette garde,
    // tout dossier autofinancé aurait cessé d'envoyer.
    expect(financementArrete([])).toBe(false);
  });
});

describe('l’arrêt vaut pour les automatisations', () => {
  const vivant = { statut: 'active', datePivot: '2026-10-01', creeLe: '2026-09-01' };

  it('un dossier au financement arrêté ne déclenche plus rien', () => {
    expect(automatisationApplicable(vivant)).toBe(true);
    expect(automatisationApplicable({ ...vivant, financementArrete: true })).toBe(false);
  });

  it('et le rapport du cron dit pourquoi', () => {
    // Sans motif, on chercherait la panne ailleurs.
    expect(motifDuBlocage({ ...vivant, financementArrete: true })).toBe('financement refusé ou annulé');
    expect(motifDuBlocage(vivant)).toBeNull();
  });

  it('la règle est branchée sur les six envois, pas seulement définie', () => {
    // Le défaut d'origine était exactement celui-là : un statut que personne ne
    // lisait.
    expect(CRON.match(/financementArrete:/g)?.length).toBe(6);
    expect(CRON).toContain('dossiersAuFinancementArrete');
  });
});

describe('l’arrêt se voit', () => {
  it('sur l’écran où il se décide', () => {
    // Sans cela, on constaterait des semaines plus tard que plus rien ne part,
    // sans pouvoir le relier au financement.
    expect(ECRAN).toContain('Envois automatiques arrêtés');
    expect(ECRAN).toContain('Rouvrir un financement les rétablit');
  });

  it('et rien n’est stocké : revenir sur le statut rend les envois', () => {
    // Un drapeau en base aurait pu rester posé après coup.
    expect(ECRAN).toContain('financementArrete(lignes.map((l) => l.status))');
  });
});
