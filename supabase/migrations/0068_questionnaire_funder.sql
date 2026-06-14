-- ============================================================================
-- 0068 — Questionnaire financeur : destinataire funder + templates système
-- ============================================================================
ALTER TABLE app.questionnaire_assignments
  DROP CONSTRAINT IF EXISTS questionnaire_assignments_recipient_kind_check;
ALTER TABLE app.questionnaire_assignments
  ADD CONSTRAINT questionnaire_assignments_recipient_kind_check
  CHECK (recipient_kind IN ('learner','trainer','company_rep','funder'));

ALTER TABLE app.questionnaire_assignments
  ADD COLUMN IF NOT EXISTS recipient_funder_id UUID REFERENCES app.funders(id);

INSERT INTO app.questionnaire_templates (organization_id, kind, code, title, schema, thank_you_message)
VALUES
 (NULL, 'positionnement', 'funder_besoins', 'Analyse des besoins — Financeur',
  '{"questions":[
     {"id":"objectifs","type":"text","label":"Quels objectifs attendez-vous de cette formation ?","required":true},
     {"id":"criteres_prise_en_charge","type":"text","label":"Critères de prise en charge à respecter ?","required":false},
     {"id":"modalite_preferee","type":"choice","label":"Modalité privilégiée","required":false,"options":["Présentiel","Distanciel","Hybride","Indifférent"]}
   ]}'::jsonb, 'Merci, vos attentes ont bien été enregistrées.'),
 (NULL, 'opco', 'funder_satisfaction', 'Satisfaction — Financeur',
  '{"questions":[
     {"id":"recommandation","type":"nps","label":"Recommanderiez-vous cet organisme de formation ?","required":true},
     {"id":"qualite_suivi","type":"rating","label":"Qualité du suivi et du reporting","required":true,"max":5},
     {"id":"commentaire","type":"text","label":"Commentaire libre","required":false}
   ]}'::jsonb, 'Merci pour votre évaluation.'),
 (NULL, 'opco', 'funder_conformite', 'Conformité du dossier — Financeur',
  '{"questions":[
     {"id":"pieces_recues","type":"choice","label":"Pièces du dossier reçues et conformes ?","required":true,"options":["Oui","Partiellement","Non"]},
     {"id":"heures_justifiees","type":"choice","label":"Heures justifiées conformes au financement ?","required":true,"options":["Oui","Non"]},
     {"id":"reserves","type":"text","label":"Réserves éventuelles","required":false}
   ]}'::jsonb, 'Merci, votre contrôle de conformité est enregistré.')
ON CONFLICT (organization_id, code) DO NOTHING;
