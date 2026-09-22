'use client';

import { useRouter } from 'next/navigation';
import { DemandeForm, type FormationOption, type ValeursDemande } from '../../nouvelle/demande-form.client';
import { modifierDemande } from './actions';

/**
 * Pont entre l'écran serveur et le formulaire partagé : ce dernier reçoit une
 * action de remplacement, ce qui évite d'avoir deux formulaires à maintenir.
 */
export function ModifierDemande({
  prospectId,
  formations,
  valeurs,
}: {
  prospectId: string;
  formations: FormationOption[];
  valeurs: ValeursDemande;
}) {
  const router = useRouter();

  return (
    <DemandeForm
      formations={formations}
      valeurs={valeurs}
      libelleBouton="Enregistrer les modifications"
      enregistrer={async (v) => {
        const heures = v.customHours.trim() ? Number(v.customHours.replace(',', '.')) : null;
        const prixCents = v.customPrice.trim() ? Math.round(Number(v.customPrice.replace(',', '.')) * 100) : null;
        const r = await modifierDemande(prospectId, {
          civility: v.civility,
          firstName: v.firstName,
          lastName: v.lastName,
          email: v.email,
          phone: v.phone,
          birthDate: v.birthDate,
          rqth: v.rqth,
          candidateIsLearner: v.candidateIsLearner,
          situation: v.situation,
          funderKind: v.funderKind,
          companyName: v.companyName,
          companySiret: v.companySiret,
          conventionCollective: v.conventionCollective,
          referentName: v.referentName,
          referentEmail: v.referentEmail,
          referentPhone: v.referentPhone,
          formationId: v.formationMode === 'catalogue' ? v.formationId : '',
          customFormationTitle: v.formationMode === 'sur-mesure' ? v.customTitle : '',
          customFormationHours: v.formationMode === 'sur-mesure' ? heures : null,
          customFormationPriceCents: v.formationMode === 'sur-mesure' ? prixCents : null,
          preferredModality: v.preferredModality,
          preferredStartDate: v.preferredStartDate,
          message: v.message,
        });
        if (r.ok) router.push(`/prospects/${prospectId}`);
        return r;
      }}
    />
  );
}
