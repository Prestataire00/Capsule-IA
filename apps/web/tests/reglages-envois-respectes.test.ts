// « Je dois pouvoir choisir mes règles » — Ismael, 28/09/2026. La page
// Envois automatiques proposait « Régler » pour des envois dont le réglage
// n'était lu nulle part : couper le récapitulatif des convocations, les liens
// d'émargement, l'attestation d'entrée, l'alerte émargement ou le retour du
// formateur ne changeait rien. Chaque envoi réglable doit lire son réglage là
// où il part.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REGLABLES } from '../features/emails/programmation-envois';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');
const CRON = lire('app/api/cron/transactional-emails/route.ts');

/** Où chaque envoi lit son réglage avant de partir. */
const LU_DANS: Record<string, { fichier: string; appel: string }> = {
  fiche_besoin: { fichier: 'features/questionnaire/needs-analysis.ts', appel: "'fiche_besoin'))" },
  nouvelle_demande: { fichier: 'shared/lib/notifications/notify-staff.ts', appel: "envoiActif(args.organizationId, 'nouvelle_demande')" },
  fiche_besoin_completee: { fichier: 'shared/lib/notifications/notify-staff.ts', appel: "envoiActif(args.organizationId, 'fiche_besoin_completee')" },
  convocation_j7: { fichier: 'app/api/cron/transactional-emails/route.ts', appel: "loadReglesParOrganisme(sb, 'convocation_j7')" },
  convocation_recap_entreprise: { fichier: 'app/api/cron/transactional-emails/route.ts', appel: "loadReglesParOrganisme(sb, 'convocation_recap_entreprise')" },
  emargement_lien: { fichier: 'features/attendance/send-links.ts', appel: "envoiActif(sheet.organization_id, 'emargement_lien')" },
  attestation_demarrage: { fichier: 'app/api/cron/transactional-emails/route.ts', appel: "loadReglesParOrganisme(sb, 'attestation_demarrage')" },
  alerte_emargement: { fichier: 'app/api/cron/transactional-emails/route.ts', appel: "loadReglesParOrganisme(sb, 'alerte_emargement')" },
  satisfaction_chaud: { fichier: 'app/api/cron/transactional-emails/route.ts', appel: "loadReglesParOrganisme(sb, 'satisfaction_chaud')" },
  fin_de_formation: { fichier: 'app/api/cron/transactional-emails/route.ts', appel: "loadReglesParOrganisme(sb, 'fin_de_formation')" },
  certificat_entreprise: { fichier: 'app/api/cron/transactional-emails/route.ts', appel: "loadReglesParOrganisme(sb, 'certificat_entreprise')" },
  satisfaction_formateur: { fichier: 'app/api/cron/transactional-emails/route.ts', appel: "loadReglesParOrganisme(sb, 'satisfaction_formateur')" },
  lien_visio_entreprise: { fichier: 'features/sessions/visio.ts', appel: "envoiActif(seance.organizationId, 'lien_visio_entreprise')" },
  rappel_seance_48h: { fichier: 'features/sessions/rappels-seances.ts', appel: "loadReglesParOrganisme(sb, 'rappel_seance_48h')" },
  rappel_seance_2h: { fichier: 'features/sessions/rappels-seances.ts', appel: "loadReglesParOrganisme(sb, 'rappel_seance_2h')" },
  relance_satisfaction_referent: { fichier: 'features/questionnaire/relance-satisfaction-referent.ts', appel: "loadReglesParOrganisme(sb, 'relance_satisfaction_referent')" },
  relance_satisfaction: { fichier: 'features/questionnaire/relancer-assignation.ts', appel: "loadReglesParOrganisme(sb, 'relance_satisfaction')" },
};

describe('chaque réglage proposé est respecté à l’envoi', () => {
  const reglables = Object.entries(REGLABLES).filter(([, r]) => r.coupable || r.delai).map(([k]) => k);

  it.each(reglables)('%s lit son réglage là où il part', (kind) => {
    const ou = LU_DANS[kind];
    expect(ou, `aucun chemin d’envoi connu pour ${kind}`).toBeDefined();
    expect(lire(ou!.fichier)).toContain(ou!.appel);
  });

  it('le retour du formateur suit son délai, il ne part plus en dur « la veille »', () => {
    expect(CRON).not.toContain(".eq('end_date', yesterdayISO)");
    expect(CRON).toContain("kind: 'satisfaction_formateur',");
  });

  it('un envoi demandé à la main part même si l’envoi automatique est coupé', () => {
    expect(lire('features/attendance/send-links.ts')).toContain("mode === 'auto' && !(await envoiActif(");
    expect(lire('app/(dashboard)/sessions/[id]/fiches-besoin/actions.ts')).toContain('manuel: true');
  });
});
