export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  app: {
    Tables: {
      attendance_sheets: {
        Row: {
          created_at: string
          document_id: string | null
          dossier_id: string | null
          finalized_at: string | null
          finalized_by: string | null
          half_day: string | null
          id: string
          organization_id: string
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          dossier_id?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          half_day?: string | null
          id?: string
          organization_id: string
          session_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          dossier_id?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          half_day?: string | null
          id?: string
          organization_id?: string
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sheets_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sheets_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sheets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sheets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_attendance_sheets_document"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_signatures: {
        Row: {
          attendance_sheet_id: string
          created_at: string
          evidence_payload: Json | null
          evidence_source: string
          id: string
          learner_id: string | null
          notes: string | null
          organization_id: string
          participant_id: string | null
          participant_kind: string
          signature_hash: string | null
          signature_image_path: string | null
          signed_at: string | null
          signer_country: string | null
          signer_ip: unknown
          signer_user_agent: string | null
          status: Database["app"]["Enums"]["attendance_status"]
          token_id: string | null
          trainer_id: string | null
        }
        Insert: {
          attendance_sheet_id: string
          created_at?: string
          evidence_payload?: Json | null
          evidence_source?: string
          id?: string
          learner_id?: string | null
          notes?: string | null
          organization_id: string
          participant_id?: string | null
          participant_kind: string
          signature_hash?: string | null
          signature_image_path?: string | null
          signed_at?: string | null
          signer_country?: string | null
          signer_ip?: unknown
          signer_user_agent?: string | null
          status: Database["app"]["Enums"]["attendance_status"]
          token_id?: string | null
          trainer_id?: string | null
        }
        Update: {
          attendance_sheet_id?: string
          created_at?: string
          evidence_payload?: Json | null
          evidence_source?: string
          id?: string
          learner_id?: string | null
          notes?: string | null
          organization_id?: string
          participant_id?: string | null
          participant_kind?: string
          signature_hash?: string | null
          signature_image_path?: string | null
          signed_at?: string | null
          signer_country?: string | null
          signer_ip?: unknown
          signer_user_agent?: string | null
          status?: Database["app"]["Enums"]["attendance_status"]
          token_id?: string | null
          trainer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_signatures_attendance_sheet_id_fkey"
            columns: ["attendance_sheet_id"]
            isOneToOne: false
            referencedRelation: "attendance_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_signatures_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "learners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_signatures_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["learner_id"]
          },
          {
            foreignKeyName: "attendance_signatures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_signatures_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_token_jtis: {
        Row: {
          attendance_sheet_id: string
          consumed_at: string | null
          consumed_ip: unknown
          expires_at: string
          issued_at: string
          jti: string
          organization_id: string
          signer_id: string
          signer_kind: string
          status: string
        }
        Insert: {
          attendance_sheet_id: string
          consumed_at?: string | null
          consumed_ip?: unknown
          expires_at: string
          issued_at?: string
          jti: string
          organization_id: string
          signer_id: string
          signer_kind: string
          status?: string
        }
        Update: {
          attendance_sheet_id?: string
          consumed_at?: string | null
          consumed_ip?: unknown
          expires_at?: string
          issued_at?: string
          jti?: string
          organization_id?: string
          signer_id?: string
          signer_kind?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_token_jtis_attendance_sheet_id_fkey"
            columns: ["attendance_sheet_id"]
            isOneToOne: false
            referencedRelation: "attendance_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_token_jtis_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: Json
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          legal_name: string | null
          metadata: Json
          naf_code: string | null
          name: string
          notes: string | null
          organization_id: string
          siret: string | null
          tags: string[]
          updated_at: string
          updated_by: string | null
          vat_number: string | null
          website: string | null
        }
        Insert: {
          address?: Json
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          legal_name?: string | null
          metadata?: Json
          naf_code?: string | null
          name: string
          notes?: string | null
          organization_id: string
          siret?: string | null
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          address?: Json
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          legal_name?: string | null
          metadata?: Json
          naf_code?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          siret?: string | null
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
          vat_number?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_events: {
        Row: {
          actor_user_id: string | null
          complaint_id: string
          id: string
          kind: string
          occurred_at: string
          organization_id: string
          payload: Json
        }
        Insert: {
          actor_user_id?: string | null
          complaint_id: string
          id?: string
          kind: string
          occurred_at?: string
          organization_id: string
          payload: Json
        }
        Update: {
          actor_user_id?: string | null
          complaint_id?: string
          id?: string
          kind?: string
          occurred_at?: string
          organization_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "complaint_events_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          assigned_to: string | null
          channel: string | null
          closed_at: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          dossier_id: string | null
          id: string
          learner_id: string | null
          metadata: Json
          organization_id: string
          reference: string
          reporter_email: string | null
          reporter_name: string | null
          resolution: string | null
          resolved_at: string | null
          severity: string
          source: string
          status: Database["app"]["Enums"]["complaint_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          channel?: string | null
          closed_at?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          dossier_id?: string | null
          id?: string
          learner_id?: string | null
          metadata?: Json
          organization_id: string
          reference: string
          reporter_email?: string | null
          reporter_name?: string | null
          resolution?: string | null
          resolved_at?: string | null
          severity?: string
          source: string
          status?: Database["app"]["Enums"]["complaint_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          channel?: string | null
          closed_at?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          dossier_id?: string | null
          id?: string
          learner_id?: string | null
          metadata?: Json
          organization_id?: string
          reference?: string
          reporter_email?: string | null
          reporter_name?: string | null
          resolution?: string | null
          resolved_at?: string | null
          severity?: string
          source?: string
          status?: Database["app"]["Enums"]["complaint_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "complaints_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "learners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["learner_id"]
          },
          {
            foreignKeyName: "complaints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company_id: string
          created_at: string
          deleted_at: string | null
          email: string | null
          first_name: string
          id: string
          is_primary: boolean
          last_name: string
          metadata: Json
          organization_id: string
          phone: string | null
          position: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          is_primary?: boolean
          last_name: string
          metadata?: Json
          organization_id: string
          phone?: string | null
          position?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_primary?: boolean
          last_name?: string
          metadata?: Json
          organization_id?: string
          phone?: string | null
          position?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_access_log: {
        Row: {
          action: string
          actor_kind: string
          actor_user_id: string | null
          document_id: string
          id: string
          ip: unknown
          occurred_at: string
          organization_id: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_kind: string
          actor_user_id?: string | null
          document_id: string
          id?: string
          ip?: unknown
          occurred_at?: string
          organization_id: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_kind?: string
          actor_user_id?: string | null
          document_id?: string
          id?: string
          ip?: unknown
          occurred_at?: string
          organization_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_access_log_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signatures: {
        Row: {
          created_at: string
          decline_reason: string | null
          document_hash_at_signature: string | null
          document_id: string
          id: string
          organization_id: string
          request_expires_at: string | null
          request_token_hash: string | null
          signature_image_path: string | null
          signed_at: string | null
          signer_email: string | null
          signer_ip: unknown
          signer_kind: string
          signer_learner_id: string | null
          signer_name: string | null
          signer_trainer_id: string | null
          signer_user_agent: string | null
          signer_user_id: string | null
          status: Database["app"]["Enums"]["signature_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          decline_reason?: string | null
          document_hash_at_signature?: string | null
          document_id: string
          id?: string
          organization_id: string
          request_expires_at?: string | null
          request_token_hash?: string | null
          signature_image_path?: string | null
          signed_at?: string | null
          signer_email?: string | null
          signer_ip?: unknown
          signer_kind: string
          signer_learner_id?: string | null
          signer_name?: string | null
          signer_trainer_id?: string | null
          signer_user_agent?: string | null
          signer_user_id?: string | null
          status?: Database["app"]["Enums"]["signature_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          decline_reason?: string | null
          document_hash_at_signature?: string | null
          document_id?: string
          id?: string
          organization_id?: string
          request_expires_at?: string | null
          request_token_hash?: string | null
          signature_image_path?: string | null
          signed_at?: string | null
          signer_email?: string | null
          signer_ip?: unknown
          signer_kind?: string
          signer_learner_id?: string | null
          signer_name?: string | null
          signer_trainer_id?: string | null
          signer_user_agent?: string | null
          signer_user_id?: string | null
          status?: Database["app"]["Enums"]["signature_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_signatures_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signatures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signatures_signer_learner_id_fkey"
            columns: ["signer_learner_id"]
            isOneToOne: false
            referencedRelation: "learners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signatures_signer_learner_id_fkey"
            columns: ["signer_learner_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["learner_id"]
          },
          {
            foreignKeyName: "document_signatures_signer_trainer_id_fkey"
            columns: ["signer_trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      document_template_versions: {
        Row: {
          created_at: string
          created_by: string | null
          file_hash: string
          id: string
          notes: string | null
          organization_id: string | null
          storage_path: string
          template_id: string
          variables_schema: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_hash: string
          id?: string
          notes?: string | null
          organization_id?: string | null
          storage_path: string
          template_id: string
          variables_schema: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_hash?: string
          id?: string
          notes?: string | null
          organization_id?: string | null
          storage_path?: string
          template_id?: string
          variables_schema?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_template_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          code: string
          created_at: string
          current_version: number
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean | null
          kind: string
          organization_id: string | null
          title: string
          updated_at: string
          variables_schema: Json
        }
        Insert: {
          code: string
          created_at?: string
          current_version?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean | null
          kind: string
          organization_id?: string | null
          title: string
          updated_at?: string
          variables_schema?: Json
        }
        Update: {
          code?: string
          created_at?: string
          current_version?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean | null
          kind?: string
          organization_id?: string | null
          title?: string
          updated_at?: string
          variables_schema?: Json
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dossier_id: string | null
          expires_at: string | null
          file_hash: string | null
          file_size_bytes: number | null
          generated_at: string | null
          generation_error: string | null
          generation_input: Json | null
          id: string
          kind: string
          metadata: Json
          mime_type: string | null
          organization_id: string
          parent_document_id: string | null
          status: Database["app"]["Enums"]["document_status"]
          storage_path: string | null
          template_id: string | null
          template_version_id: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dossier_id?: string | null
          expires_at?: string | null
          file_hash?: string | null
          file_size_bytes?: number | null
          generated_at?: string | null
          generation_error?: string | null
          generation_input?: Json | null
          id?: string
          kind: string
          metadata?: Json
          mime_type?: string | null
          organization_id: string
          parent_document_id?: string | null
          status?: Database["app"]["Enums"]["document_status"]
          storage_path?: string | null
          template_id?: string | null
          template_version_id?: string | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dossier_id?: string | null
          expires_at?: string | null
          file_hash?: string | null
          file_size_bytes?: number | null
          generated_at?: string | null
          generation_error?: string | null
          generation_input?: Json | null
          id?: string
          kind?: string
          metadata?: Json
          mime_type?: string | null
          organization_id?: string
          parent_document_id?: string | null
          status?: Database["app"]["Enums"]["document_status"]
          storage_path?: string | null
          template_id?: string | null
          template_version_id?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_parent_document_id_fkey"
            columns: ["parent_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "document_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_drafts: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          payload: Json
          step: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          payload: Json
          step?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          payload?: Json
          step?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossier_drafts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_funder_tasks: {
        Row: {
          created_at: string
          dossier_id: string
          draft_html: string | null
          draft_subject: string | null
          due_date: string | null
          funder_id: string
          id: string
          notes: string | null
          organization_id: string
          playbook_step_id: string
          resend_message_id: string | null
          resolved_attachments: Json
          sent_at: string | null
          sent_by: string | null
          status: Database["app"]["Enums"]["funder_task_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          dossier_id: string
          draft_html?: string | null
          draft_subject?: string | null
          due_date?: string | null
          funder_id: string
          id?: string
          notes?: string | null
          organization_id: string
          playbook_step_id: string
          resend_message_id?: string | null
          resolved_attachments?: Json
          sent_at?: string | null
          sent_by?: string | null
          status?: Database["app"]["Enums"]["funder_task_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          dossier_id?: string
          draft_html?: string | null
          draft_subject?: string | null
          due_date?: string | null
          funder_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          playbook_step_id?: string
          resend_message_id?: string | null
          resolved_attachments?: Json
          sent_at?: string | null
          sent_by?: string | null
          status?: Database["app"]["Enums"]["funder_task_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossier_funder_tasks_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_funder_tasks_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_funder_tasks_funder_id_fkey"
            columns: ["funder_id"]
            isOneToOne: false
            referencedRelation: "funders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_funder_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_funder_tasks_playbook_step_id_fkey"
            columns: ["playbook_step_id"]
            isOneToOne: false
            referencedRelation: "funder_playbook_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_funders: {
        Row: {
          agreement_path: string | null
          amount_cents: number
          created_at: string
          dossier_id: string
          external_file_number: string | null
          funder_id: string
          id: string
          organization_id: string
          share_percent: number | null
          status: string
          updated_at: string
        }
        Insert: {
          agreement_path?: string | null
          amount_cents: number
          created_at?: string
          dossier_id: string
          external_file_number?: string | null
          funder_id: string
          id?: string
          organization_id: string
          share_percent?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          agreement_path?: string | null
          amount_cents?: number
          created_at?: string
          dossier_id?: string
          external_file_number?: string | null
          funder_id?: string
          id?: string
          organization_id?: string
          share_percent?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossier_funders_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_funders_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_funders_funder_id_fkey"
            columns: ["funder_id"]
            isOneToOne: false
            referencedRelation: "funders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_funders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_modules: {
        Row: {
          attendance_split_strategy: string
          created_at: string
          dossier_id: string
          duration_hours: number
          end_date: string | null
          id: string
          module_id: string
          organization_id: string
          position: number
          start_date: string | null
          title_snapshot: string
          updated_at: string
        }
        Insert: {
          attendance_split_strategy?: string
          created_at?: string
          dossier_id: string
          duration_hours: number
          end_date?: string | null
          id?: string
          module_id: string
          organization_id: string
          position: number
          start_date?: string | null
          title_snapshot: string
          updated_at?: string
        }
        Update: {
          attendance_split_strategy?: string
          created_at?: string
          dossier_id?: string
          duration_hours?: number
          end_date?: string | null
          id?: string
          module_id?: string
          organization_id?: string
          position?: number
          start_date?: string | null
          title_snapshot?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossier_modules_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_modules_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_modules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_status_history: {
        Row: {
          dossier_id: string
          from_status: Database["app"]["Enums"]["dossier_status"] | null
          id: string
          metadata: Json
          occurred_at: string
          organization_id: string
          reason: string | null
          to_status: Database["app"]["Enums"]["dossier_status"]
          triggered_by: string | null
        }
        Insert: {
          dossier_id: string
          from_status?: Database["app"]["Enums"]["dossier_status"] | null
          id?: string
          metadata?: Json
          occurred_at?: string
          organization_id: string
          reason?: string | null
          to_status: Database["app"]["Enums"]["dossier_status"]
          triggered_by?: string | null
        }
        Update: {
          dossier_id?: string
          from_status?: Database["app"]["Enums"]["dossier_status"] | null
          id?: string
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          reason?: string | null
          to_status?: Database["app"]["Enums"]["dossier_status"]
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dossier_status_history_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_status_history_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_status_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_trainers: {
        Row: {
          created_at: string
          dossier_id: string
          hourly_rate_cents: number | null
          is_lead: boolean
          organization_id: string
          trainer_id: string
        }
        Insert: {
          created_at?: string
          dossier_id: string
          hourly_rate_cents?: number | null
          is_lead?: boolean
          organization_id: string
          trainer_id: string
        }
        Update: {
          created_at?: string
          dossier_id?: string
          hourly_rate_cents?: number | null
          is_lead?: boolean
          organization_id?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossier_trainers_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_trainers_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_trainers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_trainers_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      dossiers: {
        Row: {
          accessibility_notes: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          closed_at: string | null
          company_id: string | null
          context: Json
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          end_date: string
          formation_id: string
          formation_snapshot: Json
          id: string
          learner_id: string
          metadata: Json
          modality: Database["app"]["Enums"]["training_modality"]
          notes: string | null
          organization_id: string
          qualiopi_readiness: Json
          qualiopi_ready: boolean
          reference: string
          start_date: string
          status: Database["app"]["Enums"]["dossier_status"]
          total_amount_cents: number | null
          total_hours: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accessibility_notes?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          closed_at?: string | null
          company_id?: string | null
          context?: Json
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          end_date: string
          formation_id: string
          formation_snapshot: Json
          id?: string
          learner_id: string
          metadata?: Json
          modality: Database["app"]["Enums"]["training_modality"]
          notes?: string | null
          organization_id: string
          qualiopi_readiness?: Json
          qualiopi_ready?: boolean
          reference: string
          start_date: string
          status?: Database["app"]["Enums"]["dossier_status"]
          total_amount_cents?: number | null
          total_hours: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accessibility_notes?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          closed_at?: string | null
          company_id?: string | null
          context?: Json
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          end_date?: string
          formation_id?: string
          formation_snapshot?: Json
          id?: string
          learner_id?: string
          metadata?: Json
          modality?: Database["app"]["Enums"]["training_modality"]
          notes?: string | null
          organization_id?: string
          qualiopi_readiness?: Json
          qualiopi_ready?: boolean
          reference?: string
          start_date?: string
          status?: Database["app"]["Enums"]["dossier_status"]
          total_amount_cents?: number | null
          total_hours?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dossiers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "dossiers_formation_id_fkey"
            columns: ["formation_id"]
            isOneToOne: false
            referencedRelation: "formations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_formation_id_fkey"
            columns: ["formation_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["formation_id"]
          },
          {
            foreignKeyName: "dossiers_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "learners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["learner_id"]
          },
          {
            foreignKeyName: "dossiers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          key: string
          org_scope: string | null
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          key: string
          org_scope?: string | null
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          key?: string
          org_scope?: string | null
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      formation_modules: {
        Row: {
          duration_hours: number
          formation_id: string
          is_optional: boolean
          module_id: string
          position: number
        }
        Insert: {
          duration_hours: number
          formation_id: string
          is_optional?: boolean
          module_id: string
          position: number
        }
        Update: {
          duration_hours?: number
          formation_id?: string
          is_optional?: boolean
          module_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "formation_modules_formation_id_fkey"
            columns: ["formation_id"]
            isOneToOne: false
            referencedRelation: "formations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formation_modules_formation_id_fkey"
            columns: ["formation_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["formation_id"]
          },
          {
            foreignKeyName: "formation_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      formations: {
        Row: {
          certificateur: string | null
          code: string
          created_at: string
          created_by: string | null
          default_duration_hours: number
          default_modality: Database["app"]["Enums"]["training_modality"]
          default_price_cents: number
          deleted_at: string | null
          description: string | null
          evaluation_method: string | null
          id: string
          is_published: boolean
          metadata: Json
          objectives: string[]
          organization_id: string
          pedagogical_method: string | null
          prerequisites: string[]
          published_at: string | null
          rncp_code: string | null
          rs_code: string | null
          slug: string
          summary: string | null
          target_audience: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          certificateur?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          default_duration_hours: number
          default_modality?: Database["app"]["Enums"]["training_modality"]
          default_price_cents?: number
          deleted_at?: string | null
          description?: string | null
          evaluation_method?: string | null
          id?: string
          is_published?: boolean
          metadata?: Json
          objectives?: string[]
          organization_id: string
          pedagogical_method?: string | null
          prerequisites?: string[]
          published_at?: string | null
          rncp_code?: string | null
          rs_code?: string | null
          slug: string
          summary?: string | null
          target_audience?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          certificateur?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          default_duration_hours?: number
          default_modality?: Database["app"]["Enums"]["training_modality"]
          default_price_cents?: number
          deleted_at?: string | null
          description?: string | null
          evaluation_method?: string | null
          id?: string
          is_published?: boolean
          metadata?: Json
          objectives?: string[]
          organization_id?: string
          pedagogical_method?: string | null
          prerequisites?: string[]
          published_at?: string | null
          rncp_code?: string | null
          rs_code?: string | null
          slug?: string
          summary?: string | null
          target_audience?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "formations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      funder_playbook_steps: {
        Row: {
          anchor: Database["app"]["Enums"]["funder_step_anchor"]
          created_at: string
          email_body_template: string
          email_subject_template: string
          id: string
          is_required: boolean
          notes: string | null
          offset_days: number
          organization_id: string | null
          playbook_id: string
          reference_document_codes: string[]
          required_document_kinds: string[]
          step_order: number
          updated_at: string
        }
        Insert: {
          anchor: Database["app"]["Enums"]["funder_step_anchor"]
          created_at?: string
          email_body_template: string
          email_subject_template: string
          id?: string
          is_required?: boolean
          notes?: string | null
          offset_days?: number
          organization_id?: string | null
          playbook_id: string
          reference_document_codes?: string[]
          required_document_kinds?: string[]
          step_order: number
          updated_at?: string
        }
        Update: {
          anchor?: Database["app"]["Enums"]["funder_step_anchor"]
          created_at?: string
          email_body_template?: string
          email_subject_template?: string
          id?: string
          is_required?: boolean
          notes?: string | null
          offset_days?: number
          organization_id?: string | null
          playbook_id?: string
          reference_document_codes?: string[]
          required_document_kinds?: string[]
          step_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funder_playbook_steps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funder_playbook_steps_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "funder_playbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      funder_playbooks: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          description: string | null
          funder_kind: Database["app"]["Enums"]["funder_kind"]
          id: string
          is_active: boolean
          is_system: boolean | null
          organization_id: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          funder_kind: Database["app"]["Enums"]["funder_kind"]
          id?: string
          is_active?: boolean
          is_system?: boolean | null
          organization_id?: string | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          funder_kind?: Database["app"]["Enums"]["funder_kind"]
          id?: string
          is_active?: boolean
          is_system?: boolean | null
          organization_id?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "funder_playbooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      funders: {
        Row: {
          address: Json
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          deleted_at: string | null
          external_id: string | null
          id: string
          kind: Database["app"]["Enums"]["funder_kind"]
          metadata: Json
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          address?: Json
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          kind: Database["app"]["Enums"]["funder_kind"]
          metadata?: Json
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          address?: Json
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          kind?: Database["app"]["Enums"]["funder_kind"]
          metadata?: Json
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          role: Database["app"]["Enums"]["member_role"]
          status: Database["app"]["Enums"]["invitation_status"]
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          organization_id: string
          role: Database["app"]["Enums"]["member_role"]
          status?: Database["app"]["Enums"]["invitation_status"]
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          role?: Database["app"]["Enums"]["member_role"]
          status?: Database["app"]["Enums"]["invitation_status"]
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          description: string
          id: string
          invoice_id: string
          organization_id: string
          position: number
          quantity: number
          total_cents: number | null
          unit_amount_cents: number
          vat_rate: number
        }
        Insert: {
          description: string
          id?: string
          invoice_id: string
          organization_id: string
          position: number
          quantity?: number
          total_cents?: number | null
          unit_amount_cents: number
          vat_rate?: number
        }
        Update: {
          description?: string
          id?: string
          invoice_id?: string
          organization_id?: string
          position?: number
          quantity?: number
          total_cents?: number | null
          unit_amount_cents?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          company_id: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          document_id: string | null
          dossier_id: string | null
          due_at: string | null
          external_id: string | null
          funder_id: string | null
          id: string
          issued_at: string | null
          metadata: Json
          organization_id: string
          paid_at: string | null
          payment_terms: string | null
          reference: string
          status: Database["app"]["Enums"]["invoice_status"]
          subtotal_cents: number
          total_cents: number
          updated_at: string
          vat_cents: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          document_id?: string | null
          dossier_id?: string | null
          due_at?: string | null
          external_id?: string | null
          funder_id?: string | null
          id?: string
          issued_at?: string | null
          metadata?: Json
          organization_id: string
          paid_at?: string | null
          payment_terms?: string | null
          reference: string
          status?: Database["app"]["Enums"]["invoice_status"]
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
          vat_cents?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          document_id?: string | null
          dossier_id?: string | null
          due_at?: string | null
          external_id?: string | null
          funder_id?: string | null
          id?: string
          issued_at?: string | null
          metadata?: Json
          organization_id?: string
          paid_at?: string | null
          payment_terms?: string | null
          reference?: string
          status?: Database["app"]["Enums"]["invoice_status"]
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
          vat_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "invoices_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_funder_id_fkey"
            columns: ["funder_id"]
            isOneToOne: false
            referencedRelation: "funders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      learners: {
        Row: {
          accessibility_notes: string | null
          address: Json
          anonymized_at: string | null
          birth_date: string | null
          birth_place: string | null
          company_id: string | null
          cpf_number: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          education_level: string | null
          email: string
          first_name: string
          gender: string | null
          id: string
          last_name: string
          metadata: Json
          nationality: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          position: string | null
          rqth: boolean
          tags: string[]
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          accessibility_notes?: string | null
          address?: Json
          anonymized_at?: string | null
          birth_date?: string | null
          birth_place?: string | null
          company_id?: string | null
          cpf_number?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          education_level?: string | null
          email: string
          first_name: string
          gender?: string | null
          id?: string
          last_name: string
          metadata?: Json
          nationality?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          position?: string | null
          rqth?: boolean
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          accessibility_notes?: string | null
          address?: Json
          anonymized_at?: string | null
          birth_date?: string | null
          birth_place?: string | null
          company_id?: string | null
          cpf_number?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          education_level?: string | null
          email?: string
          first_name?: string
          gender?: string | null
          id?: string
          last_name?: string
          metadata?: Json
          nationality?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          position?: string | null
          rqth?: boolean
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learners_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learners_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "learners_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          invited_by: string | null
          is_default_org: boolean
          joined_at: string
          last_active_at: string | null
          organization_id: string
          role: Database["app"]["Enums"]["member_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          invited_by?: string | null
          is_default_org?: boolean
          joined_at?: string
          last_active_at?: string | null
          organization_id: string
          role: Database["app"]["Enums"]["member_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          invited_by?: string | null
          is_default_org?: boolean
          joined_at?: string
          last_active_at?: string | null
          organization_id?: string
          role?: Database["app"]["Enums"]["member_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          code: string
          created_at: string
          default_duration_hours: number
          deleted_at: string | null
          description: string | null
          id: string
          metadata: Json
          objectives: string[]
          organization_id: string
          resources: Json
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_duration_hours: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          objectives?: string[]
          organization_id: string
          resources?: Json
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_duration_hours?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          objectives?: string[]
          organization_id?: string
          resources?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          external_id: string | null
          id: string
          organization_id: string
          payload: Json
          recipient_email: string | null
          recipient_phone: string | null
          recipient_user_id: string | null
          related_aggregate_id: string | null
          related_aggregate_type: string | null
          sent_at: string | null
          status: string
          subject: string | null
          template_code: string
        }
        Insert: {
          channel: string
          created_at?: string
          error?: string | null
          external_id?: string | null
          id?: string
          organization_id: string
          payload?: Json
          recipient_email?: string | null
          recipient_phone?: string | null
          recipient_user_id?: string | null
          related_aggregate_id?: string | null
          related_aggregate_type?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_code: string
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          external_id?: string | null
          id?: string
          organization_id?: string
          payload?: Json
          recipient_email?: string | null
          recipient_phone?: string | null
          recipient_user_id?: string | null
          related_aggregate_id?: string | null
          related_aggregate_type?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: Json
          brand: Json
          contact_email: string
          contact_phone: string | null
          created_at: string
          declaration_activite: string | null
          deleted_at: string | null
          feature_flags: Json
          id: string
          legal_name: string | null
          logo_path: string | null
          naf_code: string | null
          name: string
          qualiopi_certificate_path: string | null
          qualiopi_certified_at: string | null
          security_settings: Json
          siret: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          address?: Json
          brand?: Json
          contact_email: string
          contact_phone?: string | null
          created_at?: string
          declaration_activite?: string | null
          deleted_at?: string | null
          feature_flags?: Json
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          naf_code?: string | null
          name: string
          qualiopi_certificate_path?: string | null
          qualiopi_certified_at?: string | null
          security_settings?: Json
          siret?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          address?: Json
          brand?: Json
          contact_email?: string
          contact_phone?: string | null
          created_at?: string
          declaration_activite?: string | null
          deleted_at?: string | null
          feature_flags?: Json
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          naf_code?: string | null
          name?: string
          qualiopi_certificate_path?: string | null
          qualiopi_certified_at?: string | null
          security_settings?: Json
          siret?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          external_id: string | null
          id: string
          invoice_id: string
          method: string
          notes: string | null
          organization_id: string
          paid_at: string
          reference: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          external_id?: string | null
          id?: string
          invoice_id: string
          method: string
          notes?: string | null
          organization_id: string
          paid_at: string
          reference?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          external_id?: string | null
          id?: string
          invoice_id?: string
          method?: string
          notes?: string | null
          organization_id?: string
          paid_at?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          email: string
          full_name: string
          locale: string
          phone: string | null
          preferences: Json
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          email: string
          full_name: string
          locale?: string
          phone?: string | null
          preferences?: Json
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          email?: string
          full_name?: string
          locale?: string
          phone?: string | null
          preferences?: Json
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prospects: {
        Row: {
          assigned_user_id: string | null
          birth_date: string | null
          civility: string | null
          company_name: string | null
          converted_dossier_id: string | null
          created_at: string
          deleted_at: string | null
          documents: Json
          email: string
          first_name: string
          formation_id: string | null
          funder_kind: Database["app"]["Enums"]["funder_kind"]
          id: string
          internal_notes: string | null
          ip_address: unknown
          last_name: string
          message: string | null
          organization_id: string | null
          phone: string | null
          preferred_modality:
            | Database["app"]["Enums"]["training_modality"]
            | null
          preferred_start_date: string | null
          rqth: boolean
          situation: Database["app"]["Enums"]["prospect_situation"]
          source: string | null
          status: Database["app"]["Enums"]["prospect_status"]
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          assigned_user_id?: string | null
          birth_date?: string | null
          civility?: string | null
          company_name?: string | null
          converted_dossier_id?: string | null
          created_at?: string
          deleted_at?: string | null
          documents?: Json
          email: string
          first_name: string
          formation_id?: string | null
          funder_kind: Database["app"]["Enums"]["funder_kind"]
          id?: string
          internal_notes?: string | null
          ip_address?: unknown
          last_name: string
          message?: string | null
          organization_id?: string | null
          phone?: string | null
          preferred_modality?:
            | Database["app"]["Enums"]["training_modality"]
            | null
          preferred_start_date?: string | null
          rqth?: boolean
          situation: Database["app"]["Enums"]["prospect_situation"]
          source?: string | null
          status?: Database["app"]["Enums"]["prospect_status"]
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          assigned_user_id?: string | null
          birth_date?: string | null
          civility?: string | null
          company_name?: string | null
          converted_dossier_id?: string | null
          created_at?: string
          deleted_at?: string | null
          documents?: Json
          email?: string
          first_name?: string
          formation_id?: string | null
          funder_kind?: Database["app"]["Enums"]["funder_kind"]
          id?: string
          internal_notes?: string | null
          ip_address?: unknown
          last_name?: string
          message?: string | null
          organization_id?: string | null
          phone?: string | null
          preferred_modality?:
            | Database["app"]["Enums"]["training_modality"]
            | null
          preferred_start_date?: string | null
          rqth?: boolean
          situation?: Database["app"]["Enums"]["prospect_situation"]
          source?: string | null
          status?: Database["app"]["Enums"]["prospect_status"]
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospects_converted_dossier_id_fkey"
            columns: ["converted_dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_converted_dossier_id_fkey"
            columns: ["converted_dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_formation_id_fkey"
            columns: ["formation_id"]
            isOneToOne: false
            referencedRelation: "formations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_formation_id_fkey"
            columns: ["formation_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["formation_id"]
          },
          {
            foreignKeyName: "prospects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      qualiopi_dossier_checklists: {
        Row: {
          blocking_missing: number
          closing_blocking_missing: number
          computed_at: string
          details: Json
          dossier_id: string
          entry_blocking_missing: number
          is_ready: boolean | null
          organization_id: string
          satisfied_indicators: number
          total_indicators: number
        }
        Insert: {
          blocking_missing?: number
          closing_blocking_missing?: number
          computed_at?: string
          details?: Json
          dossier_id: string
          entry_blocking_missing?: number
          is_ready?: boolean | null
          organization_id: string
          satisfied_indicators: number
          total_indicators: number
        }
        Update: {
          blocking_missing?: number
          closing_blocking_missing?: number
          computed_at?: string
          details?: Json
          dossier_id?: string
          entry_blocking_missing?: number
          is_ready?: boolean | null
          organization_id?: string
          satisfied_indicators?: number
          total_indicators?: number
        }
        Relationships: [
          {
            foreignKeyName: "qualiopi_dossier_checklists_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: true
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualiopi_dossier_checklists_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: true
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualiopi_dossier_checklists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      qualiopi_indicator_rules: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          indicator_id: string
          is_active: boolean
          is_blocking: boolean
          is_system: boolean | null
          organization_id: string | null
          satisfaction_source: Database["app"]["Enums"]["qualiopi_satisfaction_source"]
          stage: Database["app"]["Enums"]["qualiopi_gate_stage"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          indicator_id: string
          is_active?: boolean
          is_blocking?: boolean
          is_system?: boolean | null
          organization_id?: string | null
          satisfaction_source?: Database["app"]["Enums"]["qualiopi_satisfaction_source"]
          stage?: Database["app"]["Enums"]["qualiopi_gate_stage"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          indicator_id?: string
          is_active?: boolean
          is_blocking?: boolean
          is_system?: boolean | null
          organization_id?: string | null
          satisfaction_source?: Database["app"]["Enums"]["qualiopi_satisfaction_source"]
          stage?: Database["app"]["Enums"]["qualiopi_gate_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualiopi_indicator_rules_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "qualiopi_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualiopi_indicator_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      qualiopi_indicators: {
        Row: {
          code: string
          criterion: number
          description: string | null
          expected_proofs: string[]
          id: string
          is_active: boolean
          number: number
          scope: Database["app"]["Enums"]["qualiopi_indicator_scope"]
          title: string
        }
        Insert: {
          code: string
          criterion: number
          description?: string | null
          expected_proofs?: string[]
          id?: string
          is_active?: boolean
          number: number
          scope: Database["app"]["Enums"]["qualiopi_indicator_scope"]
          title: string
        }
        Update: {
          code?: string
          criterion?: number
          description?: string | null
          expected_proofs?: string[]
          id?: string
          is_active?: boolean
          number?: number
          scope?: Database["app"]["Enums"]["qualiopi_indicator_scope"]
          title?: string
        }
        Relationships: []
      }
      qualiopi_proofs: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          document_id: string | null
          dossier_id: string | null
          external_path: string | null
          id: string
          indicator_id: string
          metadata: Json
          organization_id: string
          scope: Database["app"]["Enums"]["qualiopi_indicator_scope"]
          title: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          document_id?: string | null
          dossier_id?: string | null
          external_path?: string | null
          id?: string
          indicator_id: string
          metadata?: Json
          organization_id: string
          scope: Database["app"]["Enums"]["qualiopi_indicator_scope"]
          title: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          document_id?: string | null
          dossier_id?: string | null
          external_path?: string | null
          id?: string
          indicator_id?: string
          metadata?: Json
          organization_id?: string
          scope?: Database["app"]["Enums"]["qualiopi_indicator_scope"]
          title?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qualiopi_proofs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualiopi_proofs_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualiopi_proofs_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualiopi_proofs_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "qualiopi_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualiopi_proofs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaire_assignments: {
        Row: {
          created_at: string
          dossier_id: string
          due_at: string | null
          id: string
          last_reminder_at: string | null
          organization_id: string
          recipient_email: string | null
          recipient_kind: string
          recipient_learner_id: string | null
          recipient_name: string | null
          recipient_trainer_id: string | null
          reminders_sent: number
          status: Database["app"]["Enums"]["questionnaire_response_status"]
          template_id: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dossier_id: string
          due_at?: string | null
          id?: string
          last_reminder_at?: string | null
          organization_id: string
          recipient_email?: string | null
          recipient_kind: string
          recipient_learner_id?: string | null
          recipient_name?: string | null
          recipient_trainer_id?: string | null
          reminders_sent?: number
          status?: Database["app"]["Enums"]["questionnaire_response_status"]
          template_id: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dossier_id?: string
          due_at?: string | null
          id?: string
          last_reminder_at?: string | null
          organization_id?: string
          recipient_email?: string | null
          recipient_kind?: string
          recipient_learner_id?: string | null
          recipient_name?: string | null
          recipient_trainer_id?: string | null
          reminders_sent?: number
          status?: Database["app"]["Enums"]["questionnaire_response_status"]
          template_id?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_assignments_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_assignments_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_assignments_recipient_learner_id_fkey"
            columns: ["recipient_learner_id"]
            isOneToOne: false
            referencedRelation: "learners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_assignments_recipient_learner_id_fkey"
            columns: ["recipient_learner_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["learner_id"]
          },
          {
            foreignKeyName: "questionnaire_assignments_recipient_trainer_id_fkey"
            columns: ["recipient_trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "questionnaire_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaire_responses: {
        Row: {
          answers: Json
          assignment_id: string
          dossier_id: string
          id: string
          metadata: Json
          nps: number | null
          organization_id: string
          score: number | null
          submitted_at: string
          submitter_ip: unknown
          submitter_user_agent: string | null
          template_id: string
        }
        Insert: {
          answers: Json
          assignment_id: string
          dossier_id: string
          id?: string
          metadata?: Json
          nps?: number | null
          organization_id: string
          score?: number | null
          submitted_at?: string
          submitter_ip?: unknown
          submitter_user_agent?: string | null
          template_id: string
        }
        Update: {
          answers?: Json
          assignment_id?: string
          dossier_id?: string
          id?: string
          metadata?: Json
          nps?: number | null
          organization_id?: string
          score?: number | null
          submitted_at?: string
          submitter_ip?: unknown
          submitter_user_agent?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_responses_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "questionnaire_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_responses_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_responses_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_responses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_responses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "questionnaire_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaire_templates: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean | null
          kind: Database["app"]["Enums"]["questionnaire_kind"]
          organization_id: string | null
          schema: Json
          thank_you_message: string | null
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean | null
          kind: Database["app"]["Enums"]["questionnaire_kind"]
          organization_id?: string | null
          schema: Json
          thank_you_message?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean | null
          kind?: Database["app"]["Enums"]["questionnaire_kind"]
          organization_id?: string | null
          schema?: Json
          thank_you_message?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      session_dossiers: {
        Row: {
          created_at: string
          dossier_id: string
          organization_id: string
          session_id: string
        }
        Insert: {
          created_at?: string
          dossier_id: string
          organization_id: string
          session_id: string
        }
        Update: {
          created_at?: string
          dossier_id?: string
          organization_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_dossiers_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_dossiers_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_dossiers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_dossiers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_participants: {
        Row: {
          is_required: boolean
          learner_id: string | null
          organization_id: string
          participant_id: string
          participant_kind: string
          session_id: string
          source: Database["app"]["Enums"]["participant_source"]
          trainer_id: string | null
        }
        Insert: {
          is_required?: boolean
          learner_id?: string | null
          organization_id: string
          participant_id?: string
          participant_kind: string
          session_id: string
          source?: Database["app"]["Enums"]["participant_source"]
          trainer_id?: string | null
        }
        Update: {
          is_required?: boolean
          learner_id?: string | null
          organization_id?: string
          participant_id?: string
          participant_kind?: string
          session_id?: string
          source?: Database["app"]["Enums"]["participant_source"]
          trainer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_participants_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "learners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_participants_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["learner_id"]
          },
          {
            foreignKeyName: "session_participants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_participants_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          cancellation_reason: string | null
          created_at: string
          dossier_id: string
          dossier_module_id: string | null
          duration_hours: number | null
          ends_at: string
          id: string
          location: string | null
          modality: Database["app"]["Enums"]["training_modality"]
          notes: string | null
          organization_id: string
          remote_url: string | null
          starts_at: string
          status: Database["app"]["Enums"]["session_status"]
          title: string | null
          updated_at: string
          zoom_join_url: string | null
          zoom_meeting_id: string | null
          zoom_metadata: Json | null
        }
        Insert: {
          cancellation_reason?: string | null
          created_at?: string
          dossier_id: string
          dossier_module_id?: string | null
          duration_hours?: number | null
          ends_at: string
          id?: string
          location?: string | null
          modality: Database["app"]["Enums"]["training_modality"]
          notes?: string | null
          organization_id: string
          remote_url?: string | null
          starts_at: string
          status?: Database["app"]["Enums"]["session_status"]
          title?: string | null
          updated_at?: string
          zoom_join_url?: string | null
          zoom_meeting_id?: string | null
          zoom_metadata?: Json | null
        }
        Update: {
          cancellation_reason?: string | null
          created_at?: string
          dossier_id?: string
          dossier_module_id?: string | null
          duration_hours?: number | null
          ends_at?: string
          id?: string
          location?: string | null
          modality?: Database["app"]["Enums"]["training_modality"]
          notes?: string | null
          organization_id?: string
          remote_url?: string | null
          starts_at?: string
          status?: Database["app"]["Enums"]["session_status"]
          title?: string | null
          updated_at?: string
          zoom_join_url?: string | null
          zoom_meeting_id?: string | null
          zoom_metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_dossier_module_id_fkey"
            columns: ["dossier_module_id"]
            isOneToOne: false
            referencedRelation: "dossier_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_integrations: {
        Row: {
          config_encrypted: string
          config_key_id: string
          config_nonce: string | null
          created_at: string
          kind: string
          last_test_at: string | null
          last_test_error: string | null
          last_test_status: string | null
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          config_encrypted: string
          config_key_id: string
          config_nonce?: string | null
          created_at?: string
          kind: string
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          config_encrypted?: string
          config_key_id?: string
          config_nonce?: string | null
          created_at?: string
          kind?: string
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_competencies: {
        Row: {
          created_at: string
          document_path: string | null
          expires_at: string | null
          id: string
          issuer: string | null
          kind: string
          notes: string | null
          obtained_at: string | null
          organization_id: string
          title: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_path?: string | null
          expires_at?: string | null
          id?: string
          issuer?: string | null
          kind: string
          notes?: string | null
          obtained_at?: string | null
          organization_id: string
          title: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_path?: string | null
          expires_at?: string | null
          id?: string
          issuer?: string | null
          kind?: string
          notes?: string | null
          obtained_at?: string | null
          organization_id?: string
          title?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_competencies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_competencies_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainers: {
        Row: {
          bio: string | null
          created_at: string
          deleted_at: string | null
          email: string
          first_name: string
          hourly_rate_cents: number | null
          id: string
          is_internal: boolean
          last_name: string
          metadata: Json
          organization_id: string
          phone: string | null
          siret: string | null
          specialties: string[]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          first_name: string
          hourly_rate_cents?: number | null
          id?: string
          is_internal?: boolean
          last_name: string
          metadata?: Json
          organization_id: string
          phone?: string | null
          siret?: string | null
          specialties?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          first_name?: string
          hourly_rate_cents?: number | null
          id?: string
          is_internal?: boolean
          last_name?: string
          metadata?: Json
          organization_id?: string
          phone?: string | null
          siret?: string | null
          specialties?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trainers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      zoom_import_unmatched: {
        Row: {
          attendance_sheet_id: string
          created_at: string
          duration_minutes: number | null
          id: string
          join_time: string | null
          leave_time: string | null
          organization_id: string
          raw_email: string | null
          raw_name: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_learner_id: string | null
          source: string
        }
        Insert: {
          attendance_sheet_id: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          join_time?: string | null
          leave_time?: string | null
          organization_id: string
          raw_email?: string | null
          raw_name?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_learner_id?: string | null
          source: string
        }
        Update: {
          attendance_sheet_id?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          join_time?: string | null
          leave_time?: string | null
          organization_id?: string
          raw_email?: string | null
          raw_name?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_learner_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoom_import_unmatched_attendance_sheet_id_fkey"
            columns: ["attendance_sheet_id"]
            isOneToOne: false
            referencedRelation: "attendance_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_import_unmatched_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_import_unmatched_resolved_learner_id_fkey"
            columns: ["resolved_learner_id"]
            isOneToOne: false
            referencedRelation: "learners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_import_unmatched_resolved_learner_id_fkey"
            columns: ["resolved_learner_id"]
            isOneToOne: false
            referencedRelation: "v_dossiers_overview"
            referencedColumns: ["learner_id"]
          },
        ]
      }
      zoom_sync_logs: {
        Row: {
          attendance_sheet_id: string | null
          error_detail: string | null
          fetched_at: string
          id: string
          matched_count: number
          meeting_id: string
          organization_id: string
          participants_count: number
          payload_size_bytes: number | null
          session_id: string | null
          status: string
          unmatched_count: number
        }
        Insert: {
          attendance_sheet_id?: string | null
          error_detail?: string | null
          fetched_at?: string
          id?: string
          matched_count?: number
          meeting_id: string
          organization_id: string
          participants_count?: number
          payload_size_bytes?: number | null
          session_id?: string | null
          status: string
          unmatched_count?: number
        }
        Update: {
          attendance_sheet_id?: string | null
          error_detail?: string | null
          fetched_at?: string
          id?: string
          matched_count?: number
          meeting_id?: string
          organization_id?: string
          participants_count?: number
          payload_size_bytes?: number | null
          session_id?: string | null
          status?: string
          unmatched_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "zoom_sync_logs_attendance_sheet_id_fkey"
            columns: ["attendance_sheet_id"]
            isOneToOne: false
            referencedRelation: "attendance_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_sync_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_sync_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_dossiers_overview: {
        Row: {
          company_id: string | null
          company_name: string | null
          created_at: string | null
          documents_count: number | null
          end_date: string | null
          formation_code: string | null
          formation_id: string | null
          formation_title: string | null
          id: string | null
          learner_email: string | null
          learner_full_name: string | null
          learner_id: string | null
          modality: Database["app"]["Enums"]["training_modality"] | null
          modules_count: number | null
          organization_id: string | null
          qualiopi_ready: boolean | null
          questionnaires_pending: number | null
          reference: string | null
          sessions_count: number | null
          start_date: string | null
          status: Database["app"]["Enums"]["dossier_status"] | null
          total_amount_cents: number | null
          total_hours: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dossiers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      before_token_emit: { Args: { event: Json }; Returns: Json }
      consume_attendance_token: {
        Args: {
          p_attendance_sheet_id: string
          p_consumed_ip: unknown
          p_jti: string
          p_signer_id: string
          p_signer_kind: string
        }
        Returns: undefined
      }
      current_actor_ip: { Args: never; Returns: unknown }
      current_actor_user_agent: { Args: never; Returns: string }
      current_member_id: { Args: never; Returns: string }
      current_organization_id: { Args: never; Returns: string }
      current_role: { Args: never; Returns: string }
      current_user_id: { Args: never; Returns: string }
      derive_session_attendees: {
        Args: { p_session_id: string }
        Returns: {
          learner_id: string
        }[]
      }
      eval_qualiopi_counts: {
        Args: { p_dossier_id: string }
        Returns: Record<string, unknown>
      }
      get_apprenant_dashboard: { Args: { p_learner_id: string }; Returns: Json }
      get_learner_complaints: { Args: { p_learner_id: string }; Returns: Json }
      get_signature_context: {
        Args: {
          p_attendance_sheet_id: string
          p_signer_id: string
          p_signer_kind: string
        }
        Returns: {
          already_signed: boolean
          attendance_sheet_id: string
          dossier_id: string
          dossier_reference: string
          formation_title: string
          organization_id: string
          organization_name: string
          session_ends_at: string
          session_id: string
          session_modality: string
          session_starts_at: string
          signed_at: string
          signer_email: string
          signer_full_name: string
          signer_id: string
          signer_kind: string
        }[]
      }
      has_role: { Args: { roles: string[] }; Returns: boolean }
      is_admin_or_owner: { Args: never; Returns: boolean }
      is_dossier_trainer: { Args: { p_dossier_id: string }; Returns: boolean }
      is_org_member: { Args: { org: string }; Returns: boolean }
      is_session_trainer: { Args: { p_session_id: string }; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      link_my_trainer_rows: { Args: never; Returns: number }
      list_my_trainer_memberships: {
        Args: never
        Returns: {
          first_name: string
          is_internal: boolean
          last_name: string
          organization_id: string
          organization_name: string
          trainer_id: string
        }[]
      }
      materialize_funder_tasks: {
        Args: { p_dossier_id: string; p_funder_id: string }
        Returns: number
      }
      materialize_session_participants: {
        Args: { p_session_id: string }
        Returns: number
      }
      recompute_qualiopi_checklist: {
        Args: { p_dossier_id: string }
        Returns: undefined
      }
      record_attendance_signature: {
        Args: {
          p_attendance_sheet_id: string
          p_evidence_payload: Json
          p_evidence_source: string
          p_image_path: string
          p_signature_hash: string
          p_signer_country: string
          p_signer_id: string
          p_signer_ip: unknown
          p_signer_kind: string
          p_signer_user_agent: string
          p_token_jti: string
        }
        Returns: string
      }
      submit_learner_complaint: {
        Args: {
          p_category: string
          p_category_label: string
          p_description: string
          p_dossier_id: string
          p_ip: unknown
          p_learner_id: string
          p_organization_id: string
          p_reporter_email: string
          p_reporter_name: string
          p_subject: string
          p_user_agent: string
        }
        Returns: Json
      }
    }
    Enums: {
      attendance_status:
        | "present"
        | "absent"
        | "absent_justified"
        | "late"
        | "remote"
      complaint_status: "open" | "in_progress" | "resolved" | "closed"
      document_status:
        | "pending"
        | "generating"
        | "ready"
        | "failed"
        | "archived"
      dossier_status:
        | "draft"
        | "pending_validation"
        | "scheduled"
        | "active"
        | "completed"
        | "closed"
        | "archived"
        | "cancelled"
      funder_kind:
        | "opco"
        | "cpf"
        | "pole_emploi"
        | "region"
        | "autofinancement"
        | "entreprise"
        | "autre"
        | "faf_ca"
        | "agefiph"
      funder_step_anchor:
        | "dossier_created"
        | "session_start"
        | "session_end"
        | "manual"
      funder_task_status:
        | "pending"
        | "ready"
        | "drafted"
        | "sent"
        | "done"
        | "skipped"
      invitation_status: "pending" | "accepted" | "expired" | "revoked"
      invoice_status:
        | "draft"
        | "issued"
        | "paid"
        | "partially_paid"
        | "overdue"
        | "cancelled"
      member_role:
        | "owner"
        | "admin"
        | "gestionnaire"
        | "comptable"
        | "formateur"
      participant_source: "derived" | "manual_add" | "manual_remove"
      prospect_situation:
        | "salarie"
        | "demandeur"
        | "independant"
        | "particulier"
      prospect_status:
        | "new"
        | "contacted"
        | "qualified"
        | "converted"
        | "archived"
      qualiopi_gate_stage: "entry" | "closing" | "none"
      qualiopi_indicator_scope: "organization" | "dossier"
      qualiopi_satisfaction_source:
        | "proof"
        | "questionnaire_positionnement"
        | "questionnaire_evaluation"
        | "attendance_signed"
        | "document_signed"
      questionnaire_kind:
        | "positionnement"
        | "satisfaction_chaud"
        | "satisfaction_froid"
        | "opco"
        | "evaluation_acquis"
        | "custom"
      questionnaire_response_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "expired"
      session_status: "planned" | "in_progress" | "done" | "cancelled"
      signature_status: "pending" | "signed" | "declined" | "expired"
      training_modality: "presentiel" | "distanciel" | "hybride" | "afest"
      workflow_run_status:
        | "pending"
        | "running"
        | "success"
        | "failed"
        | "dead_letter"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  audit: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_ip: unknown
          actor_user_agent: string | null
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          diff: Json | null
          id: string
          occurred_at: string
          organization_id: string | null
          row_id: string | null
          schema_name: string
          table_name: string
        }
        Insert: {
          action: string
          actor_ip?: unknown
          actor_user_agent?: string | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          diff?: Json | null
          id?: string
          occurred_at?: string
          organization_id?: string | null
          row_id?: string | null
          schema_name: string
          table_name: string
        }
        Update: {
          action?: string
          actor_ip?: unknown
          actor_user_agent?: string | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          diff?: Json | null
          id?: string
          occurred_at?: string
          organization_id?: string | null
          row_id?: string | null
          schema_name?: string
          table_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  infra: {
    Tables: {
      domain_events: {
        Row: {
          actor_user_id: string | null
          aggregate_id: string
          aggregate_type: string
          attempts: number
          causation_id: string | null
          correlation_id: string | null
          dispatched_at: string | null
          id: string
          last_error: string | null
          next_retry_at: string | null
          occurred_at: string
          organization_id: string
          payload: Json
          type: string
          version: number
        }
        Insert: {
          actor_user_id?: string | null
          aggregate_id: string
          aggregate_type: string
          attempts?: number
          causation_id?: string | null
          correlation_id?: string | null
          dispatched_at?: string | null
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          occurred_at?: string
          organization_id: string
          payload: Json
          type: string
          version?: number
        }
        Update: {
          actor_user_id?: string | null
          aggregate_id?: string
          aggregate_type?: string
          attempts?: number
          causation_id?: string | null
          correlation_id?: string | null
          dispatched_at?: string | null
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          occurred_at?: string
          organization_id?: string
          payload?: Json
          type?: string
          version?: number
        }
        Relationships: []
      }
      event_dead_letter: {
        Row: {
          error: string
          event_id: string
          failed_attempts: number
          handler_name: string
          id: string
          moved_at: string
          payload_snapshot: Json | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          error: string
          event_id: string
          failed_attempts: number
          handler_name: string
          id?: string
          moved_at?: string
          payload_snapshot?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          error?: string
          event_id?: string
          failed_attempts?: number
          handler_name?: string
          id?: string
          moved_at?: string
          payload_snapshot?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_dead_letter_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "domain_events"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_events: {
        Row: {
          event_id: string
          handler_name: string
          processed_at: string
          result: Json | null
        }
        Insert: {
          event_id: string
          handler_name: string
          processed_at?: string
          result?: Json | null
        }
        Update: {
          event_id?: string
          handler_name?: string
          processed_at?: string
          result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "processed_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "domain_events"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          organization_id: string
          started_at: string | null
          status: Database["app"]["Enums"]["workflow_run_status"]
          steps: Json
          triggered_by_event_id: string | null
          workflow_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          organization_id: string
          started_at?: string | null
          status?: Database["app"]["Enums"]["workflow_run_status"]
          steps?: Json
          triggered_by_event_id?: string | null
          workflow_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          organization_id?: string
          started_at?: string | null
          status?: Database["app"]["Enums"]["workflow_run_status"]
          steps?: Json
          triggered_by_event_id?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_triggered_by_event_id_fkey"
            columns: ["triggered_by_event_id"]
            isOneToOne: false
            referencedRelation: "domain_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          trigger_event_type: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          trigger_event_type: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          trigger_event_type?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      pg_all_foreign_keys: {
        Row: {
          fk_columns: unknown[] | null
          fk_constraint_name: unknown
          fk_schema_name: unknown
          fk_table_name: unknown
          fk_table_oid: unknown
          is_deferrable: boolean | null
          is_deferred: boolean | null
          match_type: string | null
          on_delete: string | null
          on_update: string | null
          pk_columns: unknown[] | null
          pk_constraint_name: unknown
          pk_index_name: unknown
          pk_schema_name: unknown
          pk_table_name: unknown
          pk_table_oid: unknown
        }
        Relationships: []
      }
      tap_funky: {
        Row: {
          args: string | null
          is_definer: boolean | null
          is_strict: boolean | null
          is_visible: boolean | null
          kind: unknown
          langoid: unknown
          name: unknown
          oid: unknown
          owner: unknown
          returns: string | null
          returns_set: boolean | null
          schema: unknown
          volatility: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _cleanup: { Args: never; Returns: boolean }
      _contract_on: { Args: { "": string }; Returns: unknown }
      _currtest: { Args: never; Returns: number }
      _db_privs: { Args: never; Returns: unknown[] }
      _extensions: { Args: never; Returns: unknown[] }
      _get: { Args: { "": string }; Returns: number }
      _get_latest: { Args: { "": string }; Returns: number[] }
      _get_note: { Args: { "": string }; Returns: string }
      _is_verbose: { Args: never; Returns: boolean }
      _prokind: { Args: { p_oid: unknown }; Returns: unknown }
      _query: { Args: { "": string }; Returns: string }
      _refine_vol: { Args: { "": string }; Returns: string }
      _retval: { Args: { "": string }; Returns: string }
      _table_privs: { Args: never; Returns: unknown[] }
      _temptypes: { Args: { "": string }; Returns: string }
      _todo: { Args: never; Returns: string }
      claim_events_for_dispatch: {
        Args: { p_batch?: number }
        Returns: Database["infra"]["Tables"]["domain_events"]["Row"][]
        SetofOptions: {
          from: "*"
          to: "domain_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      col_is_null:
        | {
            Args: {
              column_name: unknown
              description?: string
              schema_name: unknown
              table_name: unknown
            }
            Returns: string
          }
        | {
            Args: {
              column_name: unknown
              description?: string
              table_name: unknown
            }
            Returns: string
          }
      col_not_null:
        | {
            Args: {
              column_name: unknown
              description?: string
              schema_name: unknown
              table_name: unknown
            }
            Returns: string
          }
        | {
            Args: {
              column_name: unknown
              description?: string
              table_name: unknown
            }
            Returns: string
          }
      diag:
        | {
            Args: { msg: unknown }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.diag(msg => text), public.diag(msg => anyelement). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { msg: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.diag(msg => text), public.diag(msg => anyelement). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      diag_test_name: { Args: { "": string }; Returns: string }
      do_tap:
        | { Args: never; Returns: string[] }
        | { Args: { "": string }; Returns: string[] }
      fail:
        | { Args: never; Returns: string }
        | { Args: { "": string }; Returns: string }
      findfuncs: { Args: { "": string }; Returns: string[] }
      finish: { Args: { exception_on_failure?: boolean }; Returns: string[] }
      format_type_string: { Args: { "": string }; Returns: string }
      has_unique: { Args: { "": string }; Returns: string }
      in_todo: { Args: never; Returns: boolean }
      is_empty: { Args: { "": string }; Returns: string }
      isnt_empty: { Args: { "": string }; Returns: string }
      lives_ok: { Args: { "": string }; Returns: string }
      materialize_funder_tasks: {
        Args: { p_dossier_id: string; p_funder_id: string }
        Returns: number
      }
      materialize_session_participants: {
        Args: { p_session_id: string }
        Returns: number
      }
      no_plan: { Args: never; Returns: boolean[] }
      num_failed: { Args: never; Returns: number }
      os_name: { Args: never; Returns: string }
      pass:
        | { Args: never; Returns: string }
        | { Args: { "": string }; Returns: string }
      pg_version: { Args: never; Returns: string }
      pg_version_num: { Args: never; Returns: number }
      pgtap_version: { Args: never; Returns: number }
      recompute_qualiopi_checklist: {
        Args: { p_dossier_id: string }
        Returns: undefined
      }
      runtests:
        | { Args: never; Returns: string[] }
        | { Args: { "": string }; Returns: string[] }
      save_dossier: {
        Args: { p_dossier: Json; p_events: Json[] }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      skip:
        | { Args: { "": string }; Returns: string }
        | { Args: { how_many: number; why: string }; Returns: string }
      throws_ok: { Args: { "": string }; Returns: string }
      todo:
        | { Args: { how_many: number }; Returns: boolean[] }
        | { Args: { how_many: number; why: string }; Returns: boolean[] }
        | { Args: { why: string }; Returns: boolean[] }
        | { Args: { how_many: number; why: string }; Returns: boolean[] }
      todo_end: { Args: never; Returns: boolean[] }
      todo_start:
        | { Args: never; Returns: boolean[] }
        | { Args: { "": string }; Returns: boolean[] }
      uuidv7: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      _time_trial_type: {
        a_time: number | null
      }
    }
  }
  reports: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      mv_org_kpis: {
        Row: {
          dossiers_active: number | null
          dossiers_closed_this_month: number | null
          dossiers_qualiopi_blocking: number | null
          nps_avg: number | null
          organization_id: string | null
          revenue_in_progress_cents: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  app: {
    Enums: {
      attendance_status: [
        "present",
        "absent",
        "absent_justified",
        "late",
        "remote",
      ],
      complaint_status: ["open", "in_progress", "resolved", "closed"],
      document_status: ["pending", "generating", "ready", "failed", "archived"],
      dossier_status: [
        "draft",
        "pending_validation",
        "scheduled",
        "active",
        "completed",
        "closed",
        "archived",
        "cancelled",
      ],
      funder_kind: [
        "opco",
        "cpf",
        "pole_emploi",
        "region",
        "autofinancement",
        "entreprise",
        "autre",
        "faf_ca",
        "agefiph",
      ],
      funder_step_anchor: [
        "dossier_created",
        "session_start",
        "session_end",
        "manual",
      ],
      funder_task_status: [
        "pending",
        "ready",
        "drafted",
        "sent",
        "done",
        "skipped",
      ],
      invitation_status: ["pending", "accepted", "expired", "revoked"],
      invoice_status: [
        "draft",
        "issued",
        "paid",
        "partially_paid",
        "overdue",
        "cancelled",
      ],
      member_role: ["owner", "admin", "gestionnaire", "comptable", "formateur"],
      participant_source: ["derived", "manual_add", "manual_remove"],
      prospect_situation: [
        "salarie",
        "demandeur",
        "independant",
        "particulier",
      ],
      prospect_status: [
        "new",
        "contacted",
        "qualified",
        "converted",
        "archived",
      ],
      qualiopi_gate_stage: ["entry", "closing", "none"],
      qualiopi_indicator_scope: ["organization", "dossier"],
      qualiopi_satisfaction_source: [
        "proof",
        "questionnaire_positionnement",
        "questionnaire_evaluation",
        "attendance_signed",
        "document_signed",
      ],
      questionnaire_kind: [
        "positionnement",
        "satisfaction_chaud",
        "satisfaction_froid",
        "opco",
        "evaluation_acquis",
        "custom",
      ],
      questionnaire_response_status: [
        "pending",
        "in_progress",
        "completed",
        "expired",
      ],
      session_status: ["planned", "in_progress", "done", "cancelled"],
      signature_status: ["pending", "signed", "declined", "expired"],
      training_modality: ["presentiel", "distanciel", "hybride", "afest"],
      workflow_run_status: [
        "pending",
        "running",
        "success",
        "failed",
        "dead_letter",
      ],
    },
  },
  audit: {
    Enums: {},
  },
  infra: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  reports: {
    Enums: {},
  },
} as const
