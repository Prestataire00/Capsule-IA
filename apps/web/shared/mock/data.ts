// Mock data — simule la base de données pour la VF visuelle.
// À remplacer progressivement par des queries Supabase via les Server Components.

export const currentOrg = {
  id: 'org-acme',
  slug: 'acme-of',
  name: 'Acme Formation',
  legal_name: 'Acme Formation SAS',
  siret: '12345678900012',
  declaration_activite: '11 75 12345 75',
  qualiopi_certified_at: '2024-03-15',
} as const;

export const currentUser = {
  id: 'user-ismael',
  full_name: 'Ismaël Lepennec',
  email: 'ismael@acme-of.fr',
  role: 'owner' as const,
};

export type Modality = 'presentiel' | 'distanciel' | 'hybride' | 'afest';
export type DossierStatus =
  | 'draft' | 'pending_validation' | 'scheduled' | 'active'
  | 'completed' | 'closed' | 'archived' | 'cancelled';

export const learners = [
  { id: 'l-1', firstName: 'Alice', lastName: 'Martin', email: 'alice.martin@acme-sas.fr', companyId: 'c-1', rqth: false, position: 'Comptable' },
  { id: 'l-2', firstName: 'Bob', lastName: 'Durand', email: 'bob.durand@gmail.com', companyId: null, rqth: false, position: 'Indépendant' },
  { id: 'l-3', firstName: 'Cécile', lastName: 'Da Silva', email: 'c.dasilva@techcorp.fr', companyId: 'c-2', rqth: true, position: 'Développeuse' },
  { id: 'l-4', firstName: 'David', lastName: 'Léon', email: 'david.leon@techcorp.fr', companyId: 'c-2', rqth: false, position: 'Manager' },
  { id: 'l-5', firstName: 'Eva', lastName: 'Pérez', email: 'eva.perez@horizon.fr', companyId: 'c-3', rqth: false, position: 'Chef de projet' },
  { id: 'l-6', firstName: 'Farouk', lastName: 'Benali', email: 'f.benali@gmail.com', companyId: null, rqth: false, position: 'Auto-entrepreneur' },
  { id: 'l-7', firstName: 'Gabrielle', lastName: 'Roux', email: 'g.roux@acme-sas.fr', companyId: 'c-1', rqth: false, position: 'Assistante RH' },
  { id: 'l-8', firstName: 'Hugo', lastName: 'Petit', email: 'h.petit@horizon.fr', companyId: 'c-3', rqth: false, position: 'Développeur' },
];

export const companies = [
  { id: 'c-1', name: 'Acme SAS', siret: '11122233344455', email: 'contact@acme-sas.fr', city: 'Paris' },
  { id: 'c-2', name: 'TechCorp', siret: '55566677788899', email: 'rh@techcorp.fr', city: 'Lyon' },
  { id: 'c-3', name: 'Horizon Group', siret: '99988877766655', email: 'formation@horizon.fr', city: 'Bordeaux' },
];

export const formations = [
  { id: 'f-1', code: 'F-001', title: 'Comptabilité Niveau 2', defaultHours: 70, modality: 'presentiel' as Modality, isPublished: true },
  { id: 'f-2', code: 'F-002', title: 'JavaScript Avancé', defaultHours: 35, modality: 'distanciel' as Modality, isPublished: true },
  { id: 'f-3', code: 'F-003', title: 'Management de projet agile', defaultHours: 21, modality: 'hybride' as Modality, isPublished: true },
  { id: 'f-4', code: 'F-004', title: "Anglais des affaires B2", defaultHours: 40, modality: 'distanciel' as Modality, isPublished: true },
  { id: 'f-5', code: 'F-005', title: 'Excel pour les RH', defaultHours: 14, modality: 'presentiel' as Modality, isPublished: false },
];

export const trainers = [
  { id: 't-1', firstName: 'Marc', lastName: 'Dupont', email: 'marc@acme-of.fr', isInternal: true, specialties: ['Comptabilité', 'Fiscalité'] },
  { id: 't-2', firstName: 'Léa', lastName: 'Bernard', email: 'lea@acme-of.fr', isInternal: true, specialties: ['Développement', 'JS'] },
  { id: 't-3', firstName: 'Pierre', lastName: 'Garcia', email: 'p.garcia@freelance.fr', isInternal: false, specialties: ['Management', 'Agile'] },
];

export const funders = [
  { id: 'fd-1', kind: 'opco' as const, name: 'OPCO Atlas' },
  { id: 'fd-2', kind: 'opco' as const, name: 'OPCO 2i' },
  { id: 'fd-3', kind: 'cpf' as const, name: 'Mon Compte Formation' },
  { id: 'fd-4', kind: 'autofinancement' as const, name: 'Autofinancement' },
  { id: 'fd-5', kind: 'pole_emploi' as const, name: 'France Travail' },
];

export const dossiers = [
  {
    id: 'd-1', reference: 'DOS-2026-0001',
    learnerId: 'l-1', companyId: 'c-1', formationId: 'f-1',
    trainerIds: ['t-1'], funderId: 'fd-1',
    status: 'active' as DossierStatus, modality: 'presentiel' as Modality,
    startDate: '2026-09-01', endDate: '2026-12-15',
    totalHours: 70, totalAmountCents: 350_000,
    qualiopiReady: false, qualiopiSatisfied: 18, qualiopiTotal: 24, qualiopiBlocking: 3,
    documentsCount: 5, sessionsCount: 12, sessionsDone: 8,
  },
  {
    id: 'd-2', reference: 'DOS-2026-0002',
    learnerId: 'l-2', companyId: null, formationId: 'f-2',
    trainerIds: ['t-2'], funderId: 'fd-3',
    status: 'scheduled' as DossierStatus, modality: 'distanciel' as Modality,
    startDate: '2026-10-15', endDate: '2026-11-30',
    totalHours: 35, totalAmountCents: 180_000,
    qualiopiReady: true, qualiopiSatisfied: 24, qualiopiTotal: 24, qualiopiBlocking: 0,
    documentsCount: 4, sessionsCount: 10, sessionsDone: 0,
  },
  {
    id: 'd-3', reference: 'DOS-2026-0003',
    learnerId: 'l-3', companyId: 'c-2', formationId: 'f-2',
    trainerIds: ['t-2'], funderId: 'fd-2',
    status: 'active' as DossierStatus, modality: 'distanciel' as Modality,
    startDate: '2026-09-15', endDate: '2026-11-15',
    totalHours: 35, totalAmountCents: 200_000,
    qualiopiReady: false, qualiopiSatisfied: 22, qualiopiTotal: 24, qualiopiBlocking: 1,
    documentsCount: 6, sessionsCount: 10, sessionsDone: 6,
  },
  {
    id: 'd-4', reference: 'DOS-2026-0004',
    learnerId: 'l-4', companyId: 'c-2', formationId: 'f-3',
    trainerIds: ['t-3'], funderId: 'fd-2',
    status: 'draft' as DossierStatus, modality: 'hybride' as Modality,
    startDate: '2026-11-15', endDate: '2027-01-30',
    totalHours: 21, totalAmountCents: 150_000,
    qualiopiReady: false, qualiopiSatisfied: 4, qualiopiTotal: 24, qualiopiBlocking: 6,
    documentsCount: 1, sessionsCount: 0, sessionsDone: 0,
  },
  {
    id: 'd-5', reference: 'DOS-2026-0005',
    learnerId: 'l-5', companyId: 'c-3', formationId: 'f-4',
    trainerIds: ['t-2'], funderId: 'fd-1',
    status: 'completed' as DossierStatus, modality: 'distanciel' as Modality,
    startDate: '2026-04-01', endDate: '2026-08-30',
    totalHours: 40, totalAmountCents: 220_000,
    qualiopiReady: true, qualiopiSatisfied: 24, qualiopiTotal: 24, qualiopiBlocking: 0,
    documentsCount: 7, sessionsCount: 12, sessionsDone: 12,
  },
  {
    id: 'd-6', reference: 'DOS-2026-0006',
    learnerId: 'l-6', companyId: null, formationId: 'f-1',
    trainerIds: ['t-1'], funderId: 'fd-3',
    status: 'closed' as DossierStatus, modality: 'presentiel' as Modality,
    startDate: '2026-02-01', endDate: '2026-05-30',
    totalHours: 70, totalAmountCents: 320_000,
    qualiopiReady: true, qualiopiSatisfied: 24, qualiopiTotal: 24, qualiopiBlocking: 0,
    documentsCount: 8, sessionsCount: 14, sessionsDone: 14,
  },
];

export const sessionsByDossier: Record<string, Array<{
  id: string; startsAt: string; endsAt: string; modality: Modality;
  status: 'planned' | 'in_progress' | 'done' | 'cancelled';
  location: string | null; trainerId: string;
  attendanceCount: number; attendanceTotal: number;
}>> = {
  'd-1': [
    { id: 's-1-1', startsAt: '2026-09-01T09:00:00+02:00', endsAt: '2026-09-01T12:30:00+02:00', modality: 'presentiel', status: 'done', location: 'Salle Lavoisier', trainerId: 't-1', attendanceCount: 1, attendanceTotal: 1 },
    { id: 's-1-2', startsAt: '2026-09-01T14:00:00+02:00', endsAt: '2026-09-01T17:30:00+02:00', modality: 'presentiel', status: 'done', location: 'Salle Lavoisier', trainerId: 't-1', attendanceCount: 1, attendanceTotal: 1 },
    { id: 's-1-3', startsAt: '2026-09-08T09:00:00+02:00', endsAt: '2026-09-08T12:30:00+02:00', modality: 'presentiel', status: 'done', location: 'Salle Lavoisier', trainerId: 't-1', attendanceCount: 1, attendanceTotal: 1 },
    { id: 's-1-4', startsAt: '2026-09-15T09:00:00+02:00', endsAt: '2026-09-15T12:30:00+02:00', modality: 'presentiel', status: 'in_progress', location: 'Salle Lavoisier', trainerId: 't-1', attendanceCount: 0, attendanceTotal: 1 },
    { id: 's-1-5', startsAt: '2026-09-22T09:00:00+02:00', endsAt: '2026-09-22T12:30:00+02:00', modality: 'presentiel', status: 'planned', location: 'Salle Lavoisier', trainerId: 't-1', attendanceCount: 0, attendanceTotal: 1 },
  ],
  'd-2': [
    { id: 's-2-1', startsAt: '2026-10-15T09:00:00+02:00', endsAt: '2026-10-15T12:30:00+02:00', modality: 'distanciel', status: 'planned', location: null, trainerId: 't-2', attendanceCount: 0, attendanceTotal: 1 },
    { id: 's-2-2', startsAt: '2026-10-22T09:00:00+02:00', endsAt: '2026-10-22T12:30:00+02:00', modality: 'distanciel', status: 'planned', location: null, trainerId: 't-2', attendanceCount: 0, attendanceTotal: 1 },
  ],
};

export const modulesByDossier: Record<string, Array<{
  id: string; position: number; title: string; durationHours: number;
  startDate: string | null; endDate: string | null;
}>> = {
  'd-1': [
    { id: 'm-1-1', position: 0, title: 'Comptabilité générale', durationHours: 14, startDate: '2026-09-01', endDate: '2026-09-15' },
    { id: 'm-1-2', position: 1, title: 'TVA & cas spéciaux', durationHours: 21, startDate: '2026-09-22', endDate: '2026-10-20' },
    { id: 'm-1-3', position: 2, title: 'Bilan & liasse fiscale', durationHours: 21, startDate: '2026-10-27', endDate: '2026-11-24' },
    { id: 'm-1-4', position: 3, title: 'Synthèse & cas pratique', durationHours: 14, startDate: '2026-12-01', endDate: '2026-12-15' },
  ],
};

export const documentsByDossier: Record<string, Array<{
  id: string; kind: string; title: string;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  signed: boolean; signers: number; signedCount: number;
  generatedAt: string;
}>> = {
  'd-1': [
    { id: 'doc-1-1', kind: 'convention', title: 'Convention de formation', status: 'ready', signed: true, signers: 2, signedCount: 2, generatedAt: '2026-08-25T14:30:00Z' },
    { id: 'doc-1-2', kind: 'convocation', title: 'Convocation apprenant', status: 'ready', signed: true, signers: 1, signedCount: 1, generatedAt: '2026-08-25T14:31:00Z' },
    { id: 'doc-1-3', kind: 'programme', title: 'Programme détaillé', status: 'ready', signed: false, signers: 0, signedCount: 0, generatedAt: '2026-08-25T14:32:00Z' },
    { id: 'doc-1-4', kind: 'reglement_interieur', title: 'Règlement intérieur', status: 'ready', signed: true, signers: 1, signedCount: 1, generatedAt: '2026-08-25T14:33:00Z' },
    { id: 'doc-1-5', kind: 'attestation_fin', title: 'Attestation de fin', status: 'pending', signed: false, signers: 0, signedCount: 0, generatedAt: '' },
  ],
};

export const questionnairesByDossier: Record<string, Array<{
  id: string; kind: 'positionnement' | 'satisfaction_chaud' | 'satisfaction_froid';
  recipient: string;
  status: 'pending' | 'in_progress' | 'completed' | 'expired';
  dueAt: string; submittedAt: string | null;
  nps: number | null;
}>> = {
  'd-1': [
    { id: 'q-1-1', kind: 'positionnement', recipient: 'Alice Martin', status: 'completed', dueAt: '2026-08-31T23:59:59Z', submittedAt: '2026-08-30T16:42:00Z', nps: null },
    { id: 'q-1-2', kind: 'satisfaction_chaud', recipient: 'Alice Martin', status: 'pending', dueAt: '2026-12-22T23:59:59Z', submittedAt: null, nps: null },
    { id: 'q-1-3', kind: 'satisfaction_froid', recipient: 'Alice Martin', status: 'pending', dueAt: '2027-03-15T23:59:59Z', submittedAt: null, nps: null },
  ],
};

export const qualiopiIndicators = [
  { code: 'I1', criterion: 1, scope: 'organization', title: 'Information du public sur les prestations' },
  { code: 'I2', criterion: 1, scope: 'organization', title: 'Information sur taux de réussite' },
  { code: 'I3', criterion: 1, scope: 'organization', title: 'Présentation des modalités d\'évaluation' },
  { code: 'I4', criterion: 2, scope: 'dossier', title: 'Identification des objectifs' },
  { code: 'I5', criterion: 2, scope: 'dossier', title: 'Adaptation du parcours' },
  { code: 'I6', criterion: 2, scope: 'dossier', title: 'Définition des modalités pédagogiques' },
  { code: 'I7', criterion: 2, scope: 'dossier', title: 'Programme détaillé' },
  { code: 'I8', criterion: 2, scope: 'dossier', title: 'Modalités d\'évaluation' },
  { code: 'I9', criterion: 2, scope: 'dossier', title: 'Adaptation pédagogique' },
  { code: 'I10', criterion: 2, scope: 'dossier', title: 'Positionnement de l\'apprenant' },
  { code: 'I11', criterion: 3, scope: 'dossier', title: 'Accueil des publics spécifiques' },
  { code: 'I12', criterion: 3, scope: 'dossier', title: 'Accompagnement de l\'apprenant' },
  { code: 'I20', criterion: 6, scope: 'dossier', title: 'Locaux et matériel' },
  { code: 'I21', criterion: 6, scope: 'dossier', title: 'Compétences des formateurs' },
  { code: 'I22', criterion: 6, scope: 'dossier', title: 'Traçabilité des présences' },
  { code: 'I23', criterion: 6, scope: 'dossier', title: 'Évaluation des acquis' },
  { code: 'I26', criterion: 7, scope: 'dossier', title: 'Recueil satisfaction à chaud' },
  { code: 'I27', criterion: 7, scope: 'dossier', title: 'Recueil satisfaction à froid' },
  { code: 'I30', criterion: 7, scope: 'dossier', title: 'Identification des dysfonctionnements' },
  { code: 'I31', criterion: 7, scope: 'organization', title: 'Recueil et traitement des réclamations' },
];

export const qualiopiByDossier: Record<string, Array<{
  code: string; satisfied: boolean; blocking: boolean;
  proofs: Array<{ kind: 'document' | 'questionnaire' | 'manual'; title: string }>;
}>> = {
  'd-1': [
    { code: 'I7',  satisfied: true,  blocking: false, proofs: [{ kind: 'document', title: 'Programme détaillé v1' }] },
    { code: 'I8',  satisfied: true,  blocking: false, proofs: [{ kind: 'document', title: 'Modalités évaluation' }] },
    { code: 'I9',  satisfied: true,  blocking: false, proofs: [] },
    { code: 'I10', satisfied: false, blocking: true,  proofs: [] },
    { code: 'I20', satisfied: true,  blocking: false, proofs: [] },
    { code: 'I21', satisfied: true,  blocking: false, proofs: [{ kind: 'document', title: 'CV Marc Dupont' }] },
    { code: 'I22', satisfied: false, blocking: true,  proofs: [] },
    { code: 'I23', satisfied: true,  blocking: false, proofs: [] },
    { code: 'I26', satisfied: false, blocking: false, proofs: [] },
    { code: 'I27', satisfied: false, blocking: true,  proofs: [] },
  ],
};

export const complaints = [
  { id: 'rec-1', reference: 'REC-2026-0008', subject: 'Salle inadaptée RQTH', severity: 'high' as const, source: 'email' as const, status: 'in_progress' as const, dossierId: 'd-1', daysOpen: 4, createdAt: '2026-05-06T09:12:00Z', assignedTo: 'Sophie Dubois' },
  { id: 'rec-2', reference: 'REC-2026-0007', subject: 'Formateur en retard de 30 min', severity: 'medium' as const, source: 'phone' as const, status: 'open' as const, dossierId: 'd-3', daysOpen: 2, createdAt: '2026-05-08T14:30:00Z', assignedTo: null },
  { id: 'rec-3', reference: 'REC-2026-0006', subject: 'Café manquant à la pause', severity: 'low' as const, source: 'in_person' as const, status: 'resolved' as const, dossierId: null, daysOpen: 0, createdAt: '2026-04-18T10:00:00Z', assignedTo: 'Sophie Dubois' },
];

export const invoices = [
  { id: 'inv-1', reference: 'FAC-2026-0014', dossierId: 'd-5', status: 'paid' as const, totalCents: 220_000, issuedAt: '2026-08-30', dueAt: '2026-09-30', paidAt: '2026-09-12' },
  { id: 'inv-2', reference: 'FAC-2026-0015', dossierId: 'd-3', status: 'issued' as const, totalCents: 200_000, issuedAt: '2026-09-15', dueAt: '2026-10-15', paidAt: null },
  { id: 'inv-3', reference: 'FAC-2026-0016', dossierId: 'd-1', status: 'draft' as const, totalCents: 350_000, issuedAt: null, dueAt: null, paidAt: null },
  { id: 'inv-4', reference: 'FAC-2026-0013', dossierId: 'd-6', status: 'paid' as const, totalCents: 320_000, issuedAt: '2026-05-30', dueAt: '2026-06-30', paidAt: '2026-06-25' },
  { id: 'inv-5', reference: 'FAC-2026-0011', dossierId: null, status: 'overdue' as const, totalCents: 80_000, issuedAt: '2026-03-15', dueAt: '2026-04-15', paidAt: null },
];

export const auditLog = [
  { id: 'a-1', action: 'update' as const, table: 'dossiers', rowRef: 'DOS-2026-0001', actor: 'Ismaël Lepennec', occurredAt: '2026-05-10T15:42:00Z', summary: 'status: completed → closed' },
  { id: 'a-2', action: 'insert' as const, table: 'documents', rowRef: 'Convention de formation', actor: 'Sophie Dubois', occurredAt: '2026-05-10T11:23:00Z', summary: 'document généré · v1' },
  { id: 'a-3', action: 'update' as const, table: 'document_signatures', rowRef: 'Convention DOS-2026-0001', actor: 'Apprenant (token)', occurredAt: '2026-05-09T14:08:00Z', summary: 'pending → signed' },
  { id: 'a-4', action: 'insert' as const, table: 'complaints', rowRef: 'REC-2026-0008', actor: 'Ismaël Lepennec', occurredAt: '2026-05-06T09:12:00Z', summary: 'réclamation ouverte' },
];

// Helpers
export const getById = <T extends { id: string }>(arr: readonly T[], id: string) =>
  arr.find((x) => x.id === id);

export const formatEuros = (cents: number | null) =>
  cents == null ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(cents / 100);

export const learnerFullName = (id: string) => {
  const l = learners.find((x) => x.id === id);
  return l ? `${l.firstName} ${l.lastName}` : '—';
};
export const trainerFullName = (id: string) => {
  const t = trainers.find((x) => x.id === id);
  return t ? `${t.firstName} ${t.lastName}` : '—';
};
export const companyName = (id: string | null) => companies.find((c) => c.id === id)?.name ?? null;
export const formationTitle = (id: string) => formations.find((f) => f.id === id)?.title ?? '—';
export const funderName = (id: string) => funders.find((f) => f.id === id)?.name ?? '—';
