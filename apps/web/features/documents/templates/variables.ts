// Catalogue des variables injectables dans les modèles de documents.
// Le slug est la clé utilisée dans le HTML sous la forme {slug}.
// Pur : aucun import next/supabase/react.

export type TemplateVariable = {
  slug: string;
  label: string;
  group: string;
};

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  // Apprenant
  { slug: 'apprenant_nom_complet', label: 'Nom complet', group: 'Apprenant' },
  { slug: 'apprenant_prenom', label: 'Prénom', group: 'Apprenant' },
  { slug: 'apprenant_nom', label: 'Nom', group: 'Apprenant' },
  { slug: 'apprenant_email', label: 'Email', group: 'Apprenant' },
  { slug: 'apprenant_date_naissance', label: 'Date de naissance', group: 'Apprenant' },
  { slug: 'apprenant_adresse', label: 'Adresse', group: 'Apprenant' },
  { slug: 'apprenant_ville', label: 'Ville', group: 'Apprenant' },
  { slug: 'apprenant_code_postal', label: 'Code postal', group: 'Apprenant' },
  // Entreprise
  { slug: 'entreprise_nom', label: 'Raison sociale', group: 'Entreprise' },
  { slug: 'entreprise_siret', label: 'SIRET', group: 'Entreprise' },
  { slug: 'entreprise_adresse', label: 'Adresse', group: 'Entreprise' },
  { slug: 'entreprise_ville', label: 'Ville', group: 'Entreprise' },
  { slug: 'entreprise_code_postal', label: 'Code postal', group: 'Entreprise' },
  // Formation
  { slug: 'formation_titre', label: 'Intitulé', group: 'Formation' },
  { slug: 'formation_objectifs', label: 'Objectifs (liste)', group: 'Formation' },
  { slug: 'formation_prerequis', label: 'Prérequis', group: 'Formation' },
  { slug: 'formation_public', label: 'Public visé', group: 'Formation' },
  { slug: 'formation_methode_pedagogique', label: 'Méthode pédagogique', group: 'Formation' },
  { slug: 'formation_methode_evaluation', label: "Méthode d'évaluation", group: 'Formation' },
  { slug: 'formation_modules', label: 'Modules (liste)', group: 'Formation' },
  // Dossier
  { slug: 'dossier_reference', label: 'Référence', group: 'Dossier' },
  { slug: 'dossier_date_debut', label: 'Date de début', group: 'Dossier' },
  { slug: 'dossier_date_fin', label: 'Date de fin', group: 'Dossier' },
  { slug: 'dossier_duree_heures', label: 'Durée (heures)', group: 'Dossier' },
  { slug: 'dossier_modalite', label: 'Modalité', group: 'Dossier' },
  { slug: 'dossier_montant_ht', label: 'Montant HT', group: 'Dossier' },
  // Formateur
  { slug: 'formateur_nom_complet', label: 'Formateur référent', group: 'Formateur' },
  // Organisme
  { slug: 'organisme_nom', label: 'Nom', group: 'Organisme' },
  { slug: 'organisme_siret', label: 'SIRET', group: 'Organisme' },
  { slug: 'organisme_nda', label: "N° de déclaration d'activité", group: 'Organisme' },
  { slug: 'organisme_adresse', label: 'Adresse', group: 'Organisme' },
  { slug: 'organisme_representant', label: 'Représentant légal', group: 'Organisme' },
  { slug: 'organisme_representant_qualite', label: 'Qualité du représentant', group: 'Organisme' },
  { slug: 'organisme_email', label: 'Email', group: 'Organisme' },
  { slug: 'organisme_telephone', label: 'Téléphone', group: 'Organisme' },
  { slug: 'organisme_logo', label: 'Logo (image)', group: 'Organisme' },
  // Conditions (drapeaux pour les blocs conditionnels : non vide = vrai)
  { slug: 'est_presentiel', label: 'Si présentiel', group: 'Conditions' },
  { slug: 'est_distanciel', label: 'Si distanciel', group: 'Conditions' },
  { slug: 'est_hybride', label: 'Si hybride', group: 'Conditions' },
  { slug: 'est_entreprise', label: 'Si financé par une entreprise', group: 'Conditions' },
  { slug: 'est_particulier', label: 'Si particulier', group: 'Conditions' },
  // Divers
  { slug: 'date_du_jour', label: 'Date du jour', group: 'Divers' },
];

export const TEMPLATE_VARIABLE_SLUGS = TEMPLATE_VARIABLES.map((v) => v.slug);
