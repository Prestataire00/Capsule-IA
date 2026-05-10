import { z } from 'zod';
import * as Identity from './identity.events';
import * as Crm from './crm.events';
import * as Catalog from './catalog.events';
import * as Dossier from './dossier.events';
import * as Scheduling from './scheduling.events';
import * as Attendance from './attendance.events';
import * as Documents from './documents.events';
import * as Qualiopi from './qualiopi.events';
import * as Questionnaire from './questionnaire.events';
import * as Complaint from './complaint.events';
import * as Billing from './billing.events';
import * as Automation from './automation.events';

export const allEventDefs = [
  Identity.OrganizationCreated, Identity.UserInvited, Identity.UserActivated, Identity.MemberRoleChanged,
  Crm.CompanyCreated, Crm.LearnerCreated, Crm.LearnerLinkedToCompany, Crm.LearnerAnonymized,
  Catalog.FormationPublished, Catalog.FormationArchived, Catalog.ModuleUpdated,
  Dossier.DossierCreated, Dossier.DossierModuleAdded, Dossier.DossierModuleRemoved,
  Dossier.DossierTrainerAssigned, Dossier.DossierTrainerUnassigned,
  Dossier.DossierFunderAdded, Dossier.DossierFunderRemoved,
  Dossier.DossierSubmitted, Dossier.DossierScheduled, Dossier.DossierActivated,
  Dossier.DossierCompleted, Dossier.DossierClosed, Dossier.DossierReopened,
  Dossier.DossierCancelled, Dossier.DossierArchived,
  Scheduling.SessionCreated, Scheduling.SessionUpdated,
  Scheduling.SessionCancelled, Scheduling.ZoomMeetingLinked,
  Attendance.AttendanceSheetOpened, Attendance.AttendanceSignatureCaptured,
  Attendance.AttendanceSheetCompleted, Attendance.AttendanceMissingDetected,
  Documents.DocumentTemplatePublished, Documents.DocumentGenerated,
  Documents.DocumentRegenerated, Documents.DocumentGenerationFailed,
  Documents.SignatureRequested, Documents.SignatureCompleted,
  Documents.SignatureDeclined, Documents.SignatureExpired,
  Qualiopi.QualiopiProofAttached, Qualiopi.QualiopiChecklistRecomputed,
  Qualiopi.QualiopiAuditExported,
  Questionnaire.QuestionnaireAssigned, Questionnaire.QuestionnaireCompleted,
  Questionnaire.QuestionnaireExpired,
  Complaint.ComplaintOpened, Complaint.ComplaintAssigned, Complaint.ComplaintResolved,
  Billing.InvoiceIssued, Billing.InvoicePaid, Billing.InvoiceOverdue, Billing.InvoiceCancelled,
  Automation.WorkflowTriggered, Automation.WorkflowFailed,
] as const;

export const schemaByType: Record<string, z.ZodTypeAny> = Object.fromEntries(
  allEventDefs.map((d) => [d.type, d.schema]),
);

export type DomainEvent = z.infer<(typeof allEventDefs)[number]['schema']>;

export const parseDomainEvent = (raw: unknown): DomainEvent => {
  if (typeof raw === 'object' && raw !== null && 'type' in raw) {
    const t = (raw as { type?: string }).type;
    const schema = t ? schemaByType[t] : undefined;
    if (!schema) {
      throw new Error(`Unknown event type: ${String(t)}`);
    }
    return schema.parse(raw) as DomainEvent;
  }
  throw new Error('Invalid event shape');
};
