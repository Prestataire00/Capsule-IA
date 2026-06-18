// Modèles HTML par défaut, insérés à la demande pour un organisme.
// Le `kind` doit respecter le CHECK de app.document_templates (cf. 0009).

export type DefaultTemplate = {
  kind: string;
  code: string;
  title: string;
  contentHtml: string;
};

const HEADER = `
<header class="doc-header">
  <strong>{organisme_nom}</strong><br/>
  SIRET {organisme_siret} · Déclaration d'activité n° {organisme_nda}<br/>
  {organisme_adresse}
</header>`;

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    kind: 'convention',
    code: 'convention-defaut',
    title: 'Convention de formation professionnelle',
    contentHtml: `${HEADER}
<h1>Convention de formation professionnelle</h1>
<p>(Articles L.6353-1 et suivants du Code du travail)</p>

<h2>Entre les soussignés</h2>
<p><strong>L'organisme de formation :</strong> {organisme_nom}, SIRET {organisme_siret}, déclaration d'activité n° {organisme_nda}, {organisme_adresse}, représenté par {organisme_representant}.</p>
<p><strong>Le bénéficiaire :</strong> {apprenant_nom_complet} — {apprenant_email}{entreprise_nom}, {entreprise_nom} (SIRET {entreprise_siret}), {entreprise_adresse}.</p>

<h2>Article 1 — Objet</h2>
<p>L'organisme organise l'action de formation suivante : <strong>{formation_titre}</strong> (dossier {dossier_reference}).</p>
<p><strong>Objectifs :</strong></p>
{formation_objectifs}

<h2>Article 2 — Nature et durée</h2>
<p>Modalité : {dossier_modalite}. Durée totale : {dossier_duree_heures} heures, du {dossier_date_debut} au {dossier_date_fin}.</p>
<p><strong>Programme / modules :</strong></p>
{formation_modules}

<h2>Article 3 — Dispositions financières</h2>
<p>Montant total HT de l'action : <strong>{dossier_montant_ht}</strong>.</p>

<h2>Article 4 — Modalités d'évaluation</h2>
<p>{formation_methode_evaluation}</p>

<p class="signatures">Fait le {date_du_jour}.<br/><br/>
Pour l'organisme : {organisme_representant} &nbsp;&nbsp;&nbsp; Le bénéficiaire : {apprenant_nom_complet}</p>`,
  },
  {
    kind: 'convocation',
    code: 'convocation-defaut',
    title: 'Convocation à la formation',
    contentHtml: `${HEADER}
<h1>Convocation</h1>
<p>{date_du_jour}</p>
<p>Madame, Monsieur {apprenant_nom_complet},</p>
<p>Nous avons le plaisir de vous convoquer à la formation <strong>{formation_titre}</strong> (dossier {dossier_reference}).</p>
<ul>
  <li><strong>Dates :</strong> du {dossier_date_debut} au {dossier_date_fin}</li>
  <li><strong>Durée :</strong> {dossier_duree_heures} heures</li>
  <li><strong>Modalité :</strong> {dossier_modalite}</li>
  <li><strong>Formateur :</strong> {formateur_nom_complet}</li>
</ul>
<p>Nous vous remercions de bien vouloir vous présenter muni de cette convocation.</p>
<p>{organisme_nom}<br/>{organisme_representant}</p>`,
  },
  {
    kind: 'programme',
    code: 'programme-defaut',
    title: 'Programme de formation',
    contentHtml: `${HEADER}
<h1>Programme — {formation_titre}</h1>
<p>Dossier {dossier_reference} · {dossier_duree_heures} h · {dossier_modalite}</p>

<h2>Public visé</h2>
<p>{formation_public}</p>

<h2>Prérequis</h2>
{formation_prerequis}

<h2>Objectifs pédagogiques</h2>
{formation_objectifs}

<h2>Contenu / modules</h2>
{formation_modules}

<h2>Méthodes pédagogiques</h2>
<p>{formation_methode_pedagogique}</p>

<h2>Modalités d'évaluation</h2>
<p>{formation_methode_evaluation}</p>`,
  },
  {
    kind: 'attestation_fin',
    code: 'attestation-fin-defaut',
    title: 'Attestation de fin de formation',
    contentHtml: `${HEADER}
<h1>Attestation de fin de formation</h1>
<p>Je soussigné(e) {organisme_representant}, représentant l'organisme {organisme_nom}, atteste que :</p>
<p style="text-align:center;font-size:18px;"><strong>{apprenant_nom_complet}</strong></p>
<p>a suivi la formation <strong>{formation_titre}</strong> d'une durée de {dossier_duree_heures} heures, du {dossier_date_debut} au {dossier_date_fin} ({dossier_modalite}).</p>
<p><strong>Objectifs de la formation :</strong></p>
{formation_objectifs}
<p class="signatures">Fait le {date_du_jour}, pour valoir ce que de droit.<br/><br/>{organisme_representant}</p>`,
  },
  {
    kind: 'reglement_interieur',
    code: 'reglement-interieur-defaut',
    title: 'Règlement intérieur',
    contentHtml: `${HEADER}
<h1>Règlement intérieur applicable aux stagiaires</h1>
<p>(Articles L.6352-3 à L.6352-5 et R.6352-1 à R.6352-15 du Code du travail)</p>
<h2>Article 1 — Objet</h2>
<p>Le présent règlement s'applique à tous les stagiaires de {organisme_nom} pendant la durée de la formation suivie.</p>
<h2>Article 2 — Discipline</h2>
<p>Il est formellement interdit aux stagiaires d'introduire des boissons alcoolisées, de se présenter en état d'ébriété, et de fumer dans les locaux.</p>
<h2>Article 3 — Assiduité</h2>
<p>Les stagiaires sont tenus de suivre l'ensemble des séquences programmées et de signer les feuilles d'émargement.</p>
<h2>Article 4 — Hygiène et sécurité</h2>
<p>Chaque stagiaire doit respecter les consignes de sécurité affichées dans les locaux.</p>
<p>{organisme_nom} — {date_du_jour}</p>`,
  },
];
