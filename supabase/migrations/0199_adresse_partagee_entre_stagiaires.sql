-- Plusieurs stagiaires peuvent partager une adresse e-mail.
--
-- Demande d'Ismael le 27/09/2026 : inscrire deux salariés d'une entreprise
-- sous la même adresse ne doit pas bloquer — mais le signaler.
--
-- L'index unique (organization_id, email) interdisait une seconde personne sur
-- une adresse déjà prise. Les écrans le contournaient en réutilisant la fiche
-- existante : le second salarié devenait le premier, son nom saisi était perdu,
-- et il émargeait sous l'identité d'un autre. La conversion d'une demande, qui
-- distingue déjà deux personnes par leur nom (matching.ts), échouait elle sur
-- « learner_create_failed ».
--
-- Or la boîte du service RH, une adresse de couple, celle d'un parent servent
-- réellement à plusieurs personnes. La règle passe dans le code : même adresse
-- ET même nom = même personne (rattachée) ; autre nom = autre personne (créée),
-- avec une alerte à l'écran dans les deux cas.
--
-- Rien en base ne supposait l'unicité : aucune fonction ne cherche un
-- apprenant par son adresse. Un index simple garde la recherche rapide.

DROP INDEX IF EXISTS app.ux_learners_org_email;

CREATE INDEX IF NOT EXISTS ix_learners_org_email
  ON app.learners (organization_id, email)
  WHERE email IS NOT NULL;

COMMENT ON COLUMN app.learners.email IS
  'Adresse du stagiaire. Facultative (0176) et partageable (0199) : une boîte RH ou familiale peut servir à plusieurs personnes, distinguées par leur nom.';
