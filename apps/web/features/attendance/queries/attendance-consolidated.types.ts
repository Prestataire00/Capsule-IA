// Une ligne brute de la vue app.attendance_consolidated (grain = feuille).
export type ConsolidatedSheetRow = {
  attendanceSheetId: string;
  organizationId: string;
  dossierId: string;
  sessionId: string;
  status: 'open' | 'partial' | 'completed' | 'finalized';
  companyId: string | null;
  companyName: string | null;
  trainerId: string | null;
  trainerName: string | null;
  sessionStartsAt: string; // ISO
  sessionEndsAt: string; // ISO
  sessionHours: number;
  modality: string;
  expectedCount: number;
  signedCount: number;
  zoomCount: number;
  manualCount: number;
  zoomLastSyncStatus: 'success' | 'partial' | 'error' | null;
};

export type Lens = 'session' | 'company' | 'trainer';

// Une ligne agrégée (groupe) telle qu'affichée dans la table.
export type ConsolidatedGroup = {
  key: string; // sheetId (lens=session) | companyId | trainerId
  label: string; // nom entreprise / formateur / libellé session
  sheetCount: number;
  expectedCount: number;
  signedCount: number;
  missingCount: number;
  zoomCount: number;
  manualCount: number;
  hasSyncError: boolean;
};

// Résumé org-wide affiché dans les StatCards.
export type ConsolidatedSummary = {
  incompleteSheets: number;
  signatureRate: number; // 0..1
  zoomCoverage: number; // 0..1 (zoom / signed)
  syncErrors: number;
  hoursAtRiskRecoverable: number; // fenêtre Zoom encore ouverte
  hoursAtRiskLost: number; // hors fenêtre
};
