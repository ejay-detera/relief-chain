export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
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
      areas: {
        Row: {
          city_id: number | null
          id: number
          name: string
        }
        Insert: {
          city_id?: number | null
          id?: number
          name: string
        }
        Update: {
          city_id?: number | null
          id?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_identifier: string
          actor_kind: string
          actor_user_id: string | null
          correlation_id: string
          id: string
          metadata: Json
          occurred_at: string
          organization_id: string
          sensitive_data_access: boolean
        }
        Insert: {
          action: string
          actor_identifier: string
          actor_kind: string
          actor_user_id?: string | null
          correlation_id: string
          id?: string
          metadata?: Json
          occurred_at?: string
          organization_id: string
          sensitive_data_access?: boolean
        }
        Update: {
          action?: string
          actor_identifier?: string
          actor_kind?: string
          actor_user_id?: string | null
          correlation_id?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          sensitive_data_access?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      barangays: {
        Row: {
          area_id: number | null
          id: number
          name: string
        }
        Insert: {
          area_id?: number | null
          id?: number
          name: string
        }
        Update: {
          area_id?: number | null
          id?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "barangays_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      beneficiary_balance_projection: {
        Row: {
          aid_type: Database["public"]["Enums"]["program_aid_type"]
          allocated_stroops: number
          as_of_ledger: number
          asset_code: string
          asset_issuer: string
          available_balance_stroops: number
          beneficiary_identity_id: string
          confirmed_transaction_count: number
          distributed_stroops: number
          id: string
          is_quarantined: boolean
          is_stale: boolean
          latest_contract_event_id: string | null
          latest_ledger_transaction_id: string | null
          latest_transaction_hash: string | null
          network: Database["public"]["Enums"]["wallet_network"]
          organization_id: string
          program_id: string
          projection_version: number
          quarantine_issue_id: string | null
          reconciled_at: string
          reconciliation_run_id: string
          redeemed_stroops: number
          refunded_stroops: number
          stale_after: string
          stale_since: string | null
          updated_at: string
        }
        Insert: {
          aid_type: Database["public"]["Enums"]["program_aid_type"]
          allocated_stroops?: number
          as_of_ledger: number
          asset_code?: string
          asset_issuer: string
          available_balance_stroops?: number
          beneficiary_identity_id: string
          confirmed_transaction_count?: number
          distributed_stroops?: number
          id?: string
          is_quarantined?: boolean
          is_stale?: boolean
          latest_contract_event_id?: string | null
          latest_ledger_transaction_id?: string | null
          latest_transaction_hash?: string | null
          network?: Database["public"]["Enums"]["wallet_network"]
          organization_id: string
          program_id: string
          projection_version?: number
          quarantine_issue_id?: string | null
          reconciled_at: string
          reconciliation_run_id: string
          redeemed_stroops?: number
          refunded_stroops?: number
          stale_after: string
          stale_since?: string | null
          updated_at?: string
        }
        Update: {
          aid_type?: Database["public"]["Enums"]["program_aid_type"]
          allocated_stroops?: number
          as_of_ledger?: number
          asset_code?: string
          asset_issuer?: string
          available_balance_stroops?: number
          beneficiary_identity_id?: string
          confirmed_transaction_count?: number
          distributed_stroops?: number
          id?: string
          is_quarantined?: boolean
          is_stale?: boolean
          latest_contract_event_id?: string | null
          latest_ledger_transaction_id?: string | null
          latest_transaction_hash?: string | null
          network?: Database["public"]["Enums"]["wallet_network"]
          organization_id?: string
          program_id?: string
          projection_version?: number
          quarantine_issue_id?: string | null
          reconciled_at?: string
          reconciliation_run_id?: string
          redeemed_stroops?: number
          refunded_stroops?: number
          stale_after?: string
          stale_since?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "beneficiary_balance_projectio_latest_ledger_transaction_id_fkey"
            columns: ["latest_ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiary_balance_projection_beneficiary_identity_id_fkey"
            columns: ["beneficiary_identity_id"]
            isOneToOne: false
            referencedRelation: "beneficiary_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiary_balance_projection_latest_contract_event_id_fkey"
            columns: ["latest_contract_event_id"]
            isOneToOne: false
            referencedRelation: "contract_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiary_balance_projection_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiary_balance_projection_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiary_balance_projection_quarantine_issue_id_fkey"
            columns: ["quarantine_issue_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiary_balance_projection_reconciliation_run_id_fkey"
            columns: ["reconciliation_run_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      beneficiary_identities: {
        Row: {
          anonymized_at: string | null
          created_at: string
          data_status: Database["public"]["Enums"]["identity_data_status"]
          disposition_request_id: string | null
          id: string
          updated_at: string
          user_id: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          anonymized_at?: string | null
          created_at?: string
          data_status?: Database["public"]["Enums"]["identity_data_status"]
          disposition_request_id?: string | null
          id?: string
          updated_at?: string
          user_id?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          anonymized_at?: string | null
          created_at?: string
          data_status?: Database["public"]["Enums"]["identity_data_status"]
          disposition_request_id?: string | null
          id?: string
          updated_at?: string
          user_id?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beneficiary_identities_disposition_request_fkey"
            columns: ["disposition_request_id"]
            isOneToOne: false
            referencedRelation: "identity_disposition_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      beneficiary_identity_reverifications: {
        Row: {
          beneficiary_identity_id: string
          correlation_id: string
          created_at: string
          evidence_digest: string
          expires_at: string
          id: string
          organization_id: string
          verification_method: string
          verified_at: string
          verified_by: string
        }
        Insert: {
          beneficiary_identity_id: string
          correlation_id: string
          created_at?: string
          evidence_digest: string
          expires_at: string
          id?: string
          organization_id: string
          verification_method: string
          verified_at?: string
          verified_by: string
        }
        Update: {
          beneficiary_identity_id?: string
          correlation_id?: string
          created_at?: string
          evidence_digest?: string
          expires_at?: string
          id?: string
          organization_id?: string
          verification_method?: string
          verified_at?: string
          verified_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "beneficiary_identity_reverificatio_beneficiary_identity_id_fkey"
            columns: ["beneficiary_identity_id"]
            isOneToOne: false
            referencedRelation: "beneficiary_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiary_identity_reverifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cashout_requests: {
        Row: {
          amount_stroops: number
          asset_code: string
          completed_at: string | null
          correlation_id: string
          failed_at: string | null
          failure_code: string | null
          id: string
          is_simulated: boolean
          merchant_id: string
          organization_id: string
          partner_request_reference: string | null
          processing_at: string | null
          requested_at: string
          requested_by: string
          settlement_wallet_id: string
          status: Database["public"]["Enums"]["cashout_request_status"]
          updated_at: string
        }
        Insert: {
          amount_stroops: number
          asset_code?: string
          completed_at?: string | null
          correlation_id: string
          failed_at?: string | null
          failure_code?: string | null
          id?: string
          is_simulated?: boolean
          merchant_id: string
          organization_id: string
          partner_request_reference?: string | null
          processing_at?: string | null
          requested_at?: string
          requested_by: string
          settlement_wallet_id: string
          status?: Database["public"]["Enums"]["cashout_request_status"]
          updated_at?: string
        }
        Update: {
          amount_stroops?: number
          asset_code?: string
          completed_at?: string | null
          correlation_id?: string
          failed_at?: string | null
          failure_code?: string | null
          id?: string
          is_simulated?: boolean
          merchant_id?: string
          organization_id?: string
          partner_request_reference?: string | null
          processing_at?: string | null
          requested_at?: string
          requested_by?: string
          settlement_wallet_id?: string
          status?: Database["public"]["Enums"]["cashout_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashout_requests_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashout_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashout_requests_settlement_wallet_id_fkey"
            columns: ["settlement_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      contract_events: {
        Row: {
          contract_id: string
          correlation_id: string
          created_at: string
          event_index: number
          event_payload: Json
          event_sha256: string
          event_topics: Json
          event_type: string
          event_xdr: string
          id: string
          ledger_sequence: number
          ledger_transaction_id: string
          network: Database["public"]["Enums"]["wallet_network"]
          observed_at: string
          organization_id: string
          program_id: string | null
          transaction_hash: string
        }
        Insert: {
          contract_id: string
          correlation_id: string
          created_at?: string
          event_index: number
          event_payload?: Json
          event_sha256: string
          event_topics?: Json
          event_type: string
          event_xdr: string
          id?: string
          ledger_sequence: number
          ledger_transaction_id: string
          network?: Database["public"]["Enums"]["wallet_network"]
          observed_at?: string
          organization_id: string
          program_id?: string | null
          transaction_hash: string
        }
        Update: {
          contract_id?: string
          correlation_id?: string
          created_at?: string
          event_index?: number
          event_payload?: Json
          event_sha256?: string
          event_topics?: Json
          event_type?: string
          event_xdr?: string
          id?: string
          ledger_sequence?: number
          ledger_transaction_id?: string
          network?: Database["public"]["Enums"]["wallet_network"]
          observed_at?: string
          organization_id?: string
          program_id?: string | null
          transaction_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_events_ledger_evidence_fkey"
            columns: [
              "ledger_transaction_id",
              "organization_id",
              "network",
              "transaction_hash",
              "ledger_sequence",
            ]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: [
              "id",
              "organization_id",
              "network",
              "transaction_hash",
              "ledger_sequence",
            ]
          },
          {
            foreignKeyName: "contract_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_events_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      disaster_response_campaigns: {
        Row: {
          code: string
          created_at: string
          ends_at: string | null
          id: string
          name: string
          organization_id: string
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          ends_at?: string | null
          id?: string
          name: string
          organization_id: string
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disaster_response_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      disaster_types: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      disbursements: {
        Row: {
          amount: number
          created_at: string | null
          disaster_event: string | null
          id: string
          program_id: string | null
          program_name: string
          recipients_count: number
          tx_hash: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          disaster_event?: string | null
          id?: string
          program_id?: string | null
          program_name: string
          recipients_count: number
          tx_hash?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          disaster_event?: string | null
          id?: string
          program_id?: string | null
          program_name?: string
          recipients_count?: number
          tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disbursements_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_evidence: {
        Row: {
          content_digest: string
          created_at: string
          dispute_id: string
          evidence_kind: string
          id: string
          metadata: Json
          storage_reference: string | null
          submitted_by: string
        }
        Insert: {
          content_digest: string
          created_at?: string
          dispute_id: string
          evidence_kind: string
          id?: string
          metadata?: Json
          storage_reference?: string | null
          submitted_by: string
        }
        Update: {
          content_digest?: string
          created_at?: string
          dispute_id?: string
          evidence_kind?: string
          id?: string
          metadata?: Json
          storage_reference?: string | null
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_evidence_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          correlation_id: string
          id: string
          opened_at: string
          opened_by: string
          organization_id: string
          payment_intent_id: string
          reason: string
          refund_id: string | null
          resolution: string | null
          resolved_at: string | null
          settlement_id: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
        }
        Insert: {
          correlation_id: string
          id?: string
          opened_at?: string
          opened_by: string
          organization_id: string
          payment_intent_id: string
          reason: string
          refund_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          settlement_id?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Update: {
          correlation_id?: string
          id?: string
          opened_at?: string
          opened_by?: string
          organization_id?: string
          payment_intent_id?: string
          reason?: string
          refund_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          settlement_id?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_job_projection: {
        Row: {
          as_of_ledger: number
          cancelled_count: number
          confirmed_amount_stroops: number
          confirmed_count: number
          confirmed_transaction_count: number
          distribution_job_id: string
          failed_amount_stroops: number
          failed_count: number
          is_quarantined: boolean
          is_stale: boolean
          latest_ledger_transaction_id: string | null
          latest_transaction_hash: string | null
          organization_id: string
          pending_count: number
          program_id: string
          projection_version: number
          quarantine_issue_id: string | null
          recipient_count: number
          reconciled_at: string
          reconciliation_run_id: string
          stale_after: string
          stale_since: string | null
          status: Database["public"]["Enums"]["distribution_job_status"]
          submitted_count: number
          total_amount_stroops: number
          updated_at: string
        }
        Insert: {
          as_of_ledger: number
          cancelled_count?: number
          confirmed_amount_stroops?: number
          confirmed_count?: number
          confirmed_transaction_count?: number
          distribution_job_id: string
          failed_amount_stroops?: number
          failed_count?: number
          is_quarantined?: boolean
          is_stale?: boolean
          latest_ledger_transaction_id?: string | null
          latest_transaction_hash?: string | null
          organization_id: string
          pending_count?: number
          program_id: string
          projection_version?: number
          quarantine_issue_id?: string | null
          recipient_count?: number
          reconciled_at: string
          reconciliation_run_id: string
          stale_after: string
          stale_since?: string | null
          status: Database["public"]["Enums"]["distribution_job_status"]
          submitted_count?: number
          total_amount_stroops?: number
          updated_at?: string
        }
        Update: {
          as_of_ledger?: number
          cancelled_count?: number
          confirmed_amount_stroops?: number
          confirmed_count?: number
          confirmed_transaction_count?: number
          distribution_job_id?: string
          failed_amount_stroops?: number
          failed_count?: number
          is_quarantined?: boolean
          is_stale?: boolean
          latest_ledger_transaction_id?: string | null
          latest_transaction_hash?: string | null
          organization_id?: string
          pending_count?: number
          program_id?: string
          projection_version?: number
          quarantine_issue_id?: string | null
          recipient_count?: number
          reconciled_at?: string
          reconciliation_run_id?: string
          stale_after?: string
          stale_since?: string | null
          status?: Database["public"]["Enums"]["distribution_job_status"]
          submitted_count?: number
          total_amount_stroops?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_job_projection_distribution_job_id_fkey"
            columns: ["distribution_job_id"]
            isOneToOne: true
            referencedRelation: "distribution_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_job_projection_latest_ledger_transaction_id_fkey"
            columns: ["latest_ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_job_projection_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_job_projection_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_job_projection_quarantine_issue_id_fkey"
            columns: ["quarantine_issue_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_job_projection_reconciliation_run_id_fkey"
            columns: ["reconciliation_run_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_jobs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          batch_size: number
          cancelled_at: string | null
          cancelled_count: number
          completed_at: string | null
          confirmed_count: number
          correlation_id: string
          created_at: string
          created_by: string
          failed_count: number
          id: string
          idempotency_key_id: string
          next_recipient_offset: number
          organization_id: string
          pending_count: number
          program_id: string
          recipient_count: number
          started_at: string | null
          status: Database["public"]["Enums"]["distribution_job_status"]
          submitted_count: number
          total_amount_stroops: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          batch_size?: number
          cancelled_at?: string | null
          cancelled_count?: number
          completed_at?: string | null
          confirmed_count?: number
          correlation_id: string
          created_at?: string
          created_by: string
          failed_count?: number
          id?: string
          idempotency_key_id: string
          next_recipient_offset?: number
          organization_id: string
          pending_count?: number
          program_id: string
          recipient_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["distribution_job_status"]
          submitted_count?: number
          total_amount_stroops: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          batch_size?: number
          cancelled_at?: string | null
          cancelled_count?: number
          completed_at?: string | null
          confirmed_count?: number
          correlation_id?: string
          created_at?: string
          created_by?: string
          failed_count?: number
          id?: string
          idempotency_key_id?: string
          next_recipient_offset?: number
          organization_id?: string
          pending_count?: number
          program_id?: string
          recipient_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["distribution_job_status"]
          submitted_count?: number
          total_amount_stroops?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_jobs_idempotency_key_id_fkey"
            columns: ["idempotency_key_id"]
            isOneToOne: true
            referencedRelation: "idempotency_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_jobs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_recipients: {
        Row: {
          amount_stroops: number
          beneficiary_identity_id: string
          cancelled_at: string | null
          confirmed_at: string | null
          confirmed_ledger: number | null
          correlation_id: string
          created_at: string
          destination_wallet_id: string
          distribution_job_id: string
          enrollment_id: string
          failure_code: string | null
          failure_reason: string | null
          id: string
          idempotency_key_id: string
          organization_id: string
          program_id: string
          status: Database["public"]["Enums"]["distribution_recipient_status"]
          submitted_at: string | null
          transaction_hash: string | null
          updated_at: string
        }
        Insert: {
          amount_stroops: number
          beneficiary_identity_id: string
          cancelled_at?: string | null
          confirmed_at?: string | null
          confirmed_ledger?: number | null
          correlation_id: string
          created_at?: string
          destination_wallet_id: string
          distribution_job_id: string
          enrollment_id: string
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key_id: string
          organization_id: string
          program_id: string
          status?: Database["public"]["Enums"]["distribution_recipient_status"]
          submitted_at?: string | null
          transaction_hash?: string | null
          updated_at?: string
        }
        Update: {
          amount_stroops?: number
          beneficiary_identity_id?: string
          cancelled_at?: string | null
          confirmed_at?: string | null
          confirmed_ledger?: number | null
          correlation_id?: string
          created_at?: string
          destination_wallet_id?: string
          distribution_job_id?: string
          enrollment_id?: string
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key_id?: string
          organization_id?: string
          program_id?: string
          status?: Database["public"]["Enums"]["distribution_recipient_status"]
          submitted_at?: string | null
          transaction_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_recipients_beneficiary_identity_id_fkey"
            columns: ["beneficiary_identity_id"]
            isOneToOne: false
            referencedRelation: "beneficiary_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_recipients_destination_wallet_id_fkey"
            columns: ["destination_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_recipients_distribution_job_id_fkey"
            columns: ["distribution_job_id"]
            isOneToOne: false
            referencedRelation: "distribution_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_recipients_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_recipients_idempotency_key_id_fkey"
            columns: ["idempotency_key_id"]
            isOneToOne: true
            referencedRelation: "idempotency_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_recipients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_recipients_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          allocation_amount_stroops: number
          allocation_correlation_id: string | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          beneficiary_id: string | null
          beneficiary_identity_id: string
          campaign_id: string | null
          category: string
          created_at: string | null
          expires_at: string | null
          id: string
          program_id: string
          voucher_balance: number
        }
        Insert: {
          allocation_amount_stroops?: number
          allocation_correlation_id?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          beneficiary_id?: string | null
          beneficiary_identity_id: string
          campaign_id?: string | null
          category: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          program_id: string
          voucher_balance?: number
        }
        Update: {
          allocation_amount_stroops?: number
          allocation_correlation_id?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          beneficiary_id?: string | null
          beneficiary_identity_id?: string
          campaign_id?: string | null
          category?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          program_id?: string
          voucher_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_beneficiary_id_fkey"
            columns: ["beneficiary_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_beneficiary_identity_id_fkey"
            columns: ["beneficiary_identity_id"]
            isOneToOne: false
            referencedRelation: "beneficiary_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "disaster_response_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_intents: {
        Row: {
          amount_stroops: number | null
          asset_code: string | null
          asset_issuer: string | null
          beneficiary_identity_id: string | null
          correlation_id: string
          created_at: string
          distribution_job_id: string | null
          distribution_recipient_id: string | null
          id: string
          idempotency_key_id: string
          operation_type: Database["public"]["Enums"]["financial_operation_type"]
          organization_id: string
          payload_hash: string
          program_id: string | null
          request_metadata: Json
          requested_by: string | null
        }
        Insert: {
          amount_stroops?: number | null
          asset_code?: string | null
          asset_issuer?: string | null
          beneficiary_identity_id?: string | null
          correlation_id: string
          created_at?: string
          distribution_job_id?: string | null
          distribution_recipient_id?: string | null
          id?: string
          idempotency_key_id: string
          operation_type: Database["public"]["Enums"]["financial_operation_type"]
          organization_id: string
          payload_hash: string
          program_id?: string | null
          request_metadata?: Json
          requested_by?: string | null
        }
        Update: {
          amount_stroops?: number | null
          asset_code?: string | null
          asset_issuer?: string | null
          beneficiary_identity_id?: string | null
          correlation_id?: string
          created_at?: string
          distribution_job_id?: string | null
          distribution_recipient_id?: string | null
          id?: string
          idempotency_key_id?: string
          operation_type?: Database["public"]["Enums"]["financial_operation_type"]
          organization_id?: string
          payload_hash?: string
          program_id?: string | null
          request_metadata?: Json
          requested_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_intents_beneficiary_identity_id_fkey"
            columns: ["beneficiary_identity_id"]
            isOneToOne: false
            referencedRelation: "beneficiary_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_intents_distribution_job_id_fkey"
            columns: ["distribution_job_id"]
            isOneToOne: false
            referencedRelation: "distribution_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_intents_distribution_recipient_id_fkey"
            columns: ["distribution_recipient_id"]
            isOneToOne: false
            referencedRelation: "distribution_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_intents_idempotency_key_id_fkey"
            columns: ["idempotency_key_id"]
            isOneToOne: true
            referencedRelation: "idempotency_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_intents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_intents_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_sources: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          correlation_id: string
          first_seen_at: string
          id: string
          idempotency_key: string
          last_seen_at: string
          operation_type: Database["public"]["Enums"]["financial_operation_type"]
          organization_id: string
          payload_hash: string
          program_id: string | null
          scope: string
        }
        Insert: {
          correlation_id: string
          first_seen_at?: string
          id?: string
          idempotency_key: string
          last_seen_at?: string
          operation_type: Database["public"]["Enums"]["financial_operation_type"]
          organization_id: string
          payload_hash: string
          program_id?: string | null
          scope: string
        }
        Update: {
          correlation_id?: string
          first_seen_at?: string
          id?: string
          idempotency_key?: string
          last_seen_at?: string
          operation_type?: Database["public"]["Enums"]["financial_operation_type"]
          organization_id?: string
          payload_hash?: string
          program_id?: string | null
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idempotency_keys_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_disposition_requests: {
        Row: {
          beneficiary_identity_id: string
          completed_at: string | null
          completed_by: string | null
          correlation_id: string
          created_at: string
          decision_reason: string | null
          eligible_after: string | null
          external_deletion_reference: string | null
          id: string
          legal_hold_reason: string | null
          legal_hold_until: string | null
          method: Database["public"]["Enums"]["identity_disposition_method"]
          organization_id: string
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["identity_disposition_status"]
          subject_user_id: string | null
          updated_at: string
        }
        Insert: {
          beneficiary_identity_id: string
          completed_at?: string | null
          completed_by?: string | null
          correlation_id: string
          created_at?: string
          decision_reason?: string | null
          eligible_after?: string | null
          external_deletion_reference?: string | null
          id?: string
          legal_hold_reason?: string | null
          legal_hold_until?: string | null
          method: Database["public"]["Enums"]["identity_disposition_method"]
          organization_id: string
          requested_at?: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["identity_disposition_status"]
          subject_user_id?: string | null
          updated_at?: string
        }
        Update: {
          beneficiary_identity_id?: string
          completed_at?: string | null
          completed_by?: string | null
          correlation_id?: string
          created_at?: string
          decision_reason?: string | null
          eligible_after?: string | null
          external_deletion_reference?: string | null
          id?: string
          legal_hold_reason?: string | null
          legal_hold_until?: string | null
          method?: Database["public"]["Enums"]["identity_disposition_method"]
          organization_id?: string
          requested_at?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["identity_disposition_status"]
          subject_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_disposition_requests_beneficiary_identity_id_fkey"
            columns: ["beneficiary_identity_id"]
            isOneToOne: false
            referencedRelation: "beneficiary_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_disposition_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      implementing_agencies: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_stroops: number
          asset_code: string
          asset_issuer: string
          asset_sac_address: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          canonical_payload: string
          category: string | null
          consumed_at: string | null
          consumed_by_payment_intent_id: string | null
          created_at: string
          expires_at: string
          id: string
          invoice_signer_address: string
          issued_at: string
          kind: Database["public"]["Enums"]["invoice_kind"]
          merchant_id: string
          merchant_signature: string
          network: Database["public"]["Enums"]["wallet_network"]
          nonce: string
          organization_id: string
          payload_hash: string
          program_id: string | null
          receipt_digest: string | null
          settlement_address: string
          settlement_wallet_id: string
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
          voucher_contract_address: string | null
        }
        Insert: {
          amount_stroops: number
          asset_code: string
          asset_issuer: string
          asset_sac_address?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          canonical_payload: string
          category?: string | null
          consumed_at?: string | null
          consumed_by_payment_intent_id?: string | null
          created_at?: string
          expires_at: string
          id?: string
          invoice_signer_address: string
          issued_at: string
          kind: Database["public"]["Enums"]["invoice_kind"]
          merchant_id: string
          merchant_signature: string
          network?: Database["public"]["Enums"]["wallet_network"]
          nonce: string
          organization_id: string
          payload_hash: string
          program_id?: string | null
          receipt_digest?: string | null
          settlement_address: string
          settlement_wallet_id: string
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
          voucher_contract_address?: string | null
        }
        Update: {
          amount_stroops?: number
          asset_code?: string
          asset_issuer?: string
          asset_sac_address?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          canonical_payload?: string
          category?: string | null
          consumed_at?: string | null
          consumed_by_payment_intent_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invoice_signer_address?: string
          issued_at?: string
          kind?: Database["public"]["Enums"]["invoice_kind"]
          merchant_id?: string
          merchant_signature?: string
          network?: Database["public"]["Enums"]["wallet_network"]
          nonce?: string
          organization_id?: string
          payload_hash?: string
          program_id?: string | null
          receipt_digest?: string | null
          settlement_address?: string
          settlement_wallet_id?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
          voucher_contract_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_consumed_by_payment_intent_fkey"
            columns: ["consumed_by_payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_settlement_wallet_id_fkey"
            columns: ["settlement_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_transactions: {
        Row: {
          correlation_id: string
          created_at: string
          envelope_sha256: string
          envelope_xdr: string
          error_code: string | null
          error_details: Json
          error_message: string | null
          financial_intent_id: string | null
          id: string
          ledger_closed_at: string
          ledger_sequence: number
          network: Database["public"]["Enums"]["wallet_network"]
          observed_at: string
          organization_id: string
          program_id: string | null
          result_code: string | null
          result_xdr: string | null
          successful: boolean
          transaction_attempt_id: string | null
          transaction_hash: string
        }
        Insert: {
          correlation_id: string
          created_at?: string
          envelope_sha256: string
          envelope_xdr: string
          error_code?: string | null
          error_details?: Json
          error_message?: string | null
          financial_intent_id?: string | null
          id?: string
          ledger_closed_at: string
          ledger_sequence: number
          network?: Database["public"]["Enums"]["wallet_network"]
          observed_at?: string
          organization_id: string
          program_id?: string | null
          result_code?: string | null
          result_xdr?: string | null
          successful: boolean
          transaction_attempt_id?: string | null
          transaction_hash: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          envelope_sha256?: string
          envelope_xdr?: string
          error_code?: string | null
          error_details?: Json
          error_message?: string | null
          financial_intent_id?: string | null
          id?: string
          ledger_closed_at?: string
          ledger_sequence?: number
          network?: Database["public"]["Enums"]["wallet_network"]
          observed_at?: string
          organization_id?: string
          program_id?: string | null
          result_code?: string | null
          result_xdr?: string | null
          successful?: boolean
          transaction_attempt_id?: string | null
          transaction_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_transactions_financial_intent_fkey"
            columns: ["financial_intent_id"]
            isOneToOne: false
            referencedRelation: "financial_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_transactions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_transactions_transaction_attempt_fkey"
            columns: ["transaction_attempt_id"]
            isOneToOne: false
            referencedRelation: "transaction_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_accreditations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          category: string
          created_at: string
          id: string
          merchant_id: string
          organization_id: string
          status: Database["public"]["Enums"]["merchant_accreditation_status"]
          updated_at: string
          valid_from: string
          valid_until: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          category: string
          created_at?: string
          id?: string
          merchant_id: string
          organization_id: string
          status?: Database["public"]["Enums"]["merchant_accreditation_status"]
          updated_at?: string
          valid_from: string
          valid_until: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          created_at?: string
          id?: string
          merchant_id?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["merchant_accreditation_status"]
          updated_at?: string
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_accreditations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_accreditations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_balance_projection: {
        Row: {
          as_of_ledger: number
          asset_code: string
          asset_issuer: string
          completed_cashout_stroops: number
          confirmed_settlement_count: number
          gross_settled_stroops: number
          id: string
          is_quarantined: boolean
          is_stale: boolean
          latest_contract_event_id: string | null
          latest_ledger_transaction_id: string | null
          latest_transaction_hash: string | null
          merchant_id: string
          network: Database["public"]["Enums"]["wallet_network"]
          organization_id: string
          pending_cashout_stroops: number
          program_id: string | null
          projection_version: number
          quarantine_issue_id: string | null
          reconciled_at: string
          reconciliation_run_id: string
          refunded_stroops: number
          settled_balance_stroops: number
          stale_after: string
          stale_since: string | null
          updated_at: string
        }
        Insert: {
          as_of_ledger: number
          asset_code?: string
          asset_issuer: string
          completed_cashout_stroops?: number
          confirmed_settlement_count?: number
          gross_settled_stroops?: number
          id?: string
          is_quarantined?: boolean
          is_stale?: boolean
          latest_contract_event_id?: string | null
          latest_ledger_transaction_id?: string | null
          latest_transaction_hash?: string | null
          merchant_id: string
          network?: Database["public"]["Enums"]["wallet_network"]
          organization_id: string
          pending_cashout_stroops?: number
          program_id?: string | null
          projection_version?: number
          quarantine_issue_id?: string | null
          reconciled_at: string
          reconciliation_run_id: string
          refunded_stroops?: number
          settled_balance_stroops?: number
          stale_after: string
          stale_since?: string | null
          updated_at?: string
        }
        Update: {
          as_of_ledger?: number
          asset_code?: string
          asset_issuer?: string
          completed_cashout_stroops?: number
          confirmed_settlement_count?: number
          gross_settled_stroops?: number
          id?: string
          is_quarantined?: boolean
          is_stale?: boolean
          latest_contract_event_id?: string | null
          latest_ledger_transaction_id?: string | null
          latest_transaction_hash?: string | null
          merchant_id?: string
          network?: Database["public"]["Enums"]["wallet_network"]
          organization_id?: string
          pending_cashout_stroops?: number
          program_id?: string | null
          projection_version?: number
          quarantine_issue_id?: string | null
          reconciled_at?: string
          reconciliation_run_id?: string
          refunded_stroops?: number
          settled_balance_stroops?: number
          stale_after?: string
          stale_since?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_balance_projection_latest_contract_event_id_fkey"
            columns: ["latest_contract_event_id"]
            isOneToOne: false
            referencedRelation: "contract_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_balance_projection_latest_ledger_transaction_id_fkey"
            columns: ["latest_ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_balance_projection_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_balance_projection_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_balance_projection_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_balance_projection_quarantine_issue_id_fkey"
            columns: ["quarantine_issue_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_balance_projection_reconciliation_run_id_fkey"
            columns: ["reconciliation_run_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_entities: {
        Row: {
          created_at: string
          display_name: string
          id: string
          profile_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          profile_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          profile_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      merchant_metrics: {
        Row: {
          merchant_id: string
          total_sales: number
          updated_at: string
          vouchers_processed: number
        }
        Insert: {
          merchant_id: string
          total_sales?: number
          updated_at?: string
          vouchers_processed?: number
        }
        Update: {
          merchant_id?: string
          total_sales?: number
          updated_at?: string
          vouchers_processed?: number
        }
        Relationships: [
          {
            foreignKeyName: "merchant_metrics_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          is_active: boolean
          organization_id: string
          role: Database["public"]["Enums"]["organization_membership_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          role: Database["public"]["Enums"]["organization_membership_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          role?: Database["public"]["Enums"]["organization_membership_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_intents: {
        Row: {
          amount_stroops: number
          beneficiary_identity_id: string
          beneficiary_wallet_id: string
          confirmed_at: string | null
          confirmed_ledger: number | null
          contract_event_id: string | null
          contract_event_index: number | null
          contract_id: string | null
          correlation_id: string
          created_at: string
          enrollment_id: string | null
          failed_at: string | null
          failure_code: string | null
          financial_intent_id: string
          funding_source: Database["public"]["Enums"]["payment_funding_source"]
          id: string
          idempotency_key: string
          invoice_id: string
          ledger_transaction_id: string | null
          merchant_id: string
          organization_id: string
          payload_hash: string
          program_id: string | null
          settlement_wallet_id: string
          status: Database["public"]["Enums"]["payment_intent_status"]
          submitted_at: string | null
          transaction_hash: string | null
          updated_at: string
        }
        Insert: {
          amount_stroops: number
          beneficiary_identity_id: string
          beneficiary_wallet_id: string
          confirmed_at?: string | null
          confirmed_ledger?: number | null
          contract_event_id?: string | null
          contract_event_index?: number | null
          contract_id?: string | null
          correlation_id: string
          created_at?: string
          enrollment_id?: string | null
          failed_at?: string | null
          failure_code?: string | null
          financial_intent_id: string
          funding_source: Database["public"]["Enums"]["payment_funding_source"]
          id?: string
          idempotency_key: string
          invoice_id: string
          ledger_transaction_id?: string | null
          merchant_id: string
          organization_id: string
          payload_hash: string
          program_id?: string | null
          settlement_wallet_id: string
          status?: Database["public"]["Enums"]["payment_intent_status"]
          submitted_at?: string | null
          transaction_hash?: string | null
          updated_at?: string
        }
        Update: {
          amount_stroops?: number
          beneficiary_identity_id?: string
          beneficiary_wallet_id?: string
          confirmed_at?: string | null
          confirmed_ledger?: number | null
          contract_event_id?: string | null
          contract_event_index?: number | null
          contract_id?: string | null
          correlation_id?: string
          created_at?: string
          enrollment_id?: string | null
          failed_at?: string | null
          failure_code?: string | null
          financial_intent_id?: string
          funding_source?: Database["public"]["Enums"]["payment_funding_source"]
          id?: string
          idempotency_key?: string
          invoice_id?: string
          ledger_transaction_id?: string | null
          merchant_id?: string
          organization_id?: string
          payload_hash?: string
          program_id?: string | null
          settlement_wallet_id?: string
          status?: Database["public"]["Enums"]["payment_intent_status"]
          submitted_at?: string | null
          transaction_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_beneficiary_identity_id_fkey"
            columns: ["beneficiary_identity_id"]
            isOneToOne: false
            referencedRelation: "beneficiary_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_beneficiary_wallet_id_fkey"
            columns: ["beneficiary_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_contract_event_id_fkey"
            columns: ["contract_event_id"]
            isOneToOne: false
            referencedRelation: "contract_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_financial_intent_id_fkey"
            columns: ["financial_intent_id"]
            isOneToOne: true
            referencedRelation: "financial_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_ledger_transaction_id_fkey"
            columns: ["ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_settlement_wallet_id_fkey"
            columns: ["settlement_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          area_id: number | null
          barangay_id: number | null
          birthdate: string | null
          city_id: number | null
          civil_status: string | null
          complete_address: string | null
          created_at: string | null
          first_name: string | null
          full_name: string | null
          gov_id: string | null
          gov_id_url: string | null
          id: string
          identity_data_locked: boolean
          last_name: string | null
          location: string | null
          middle_initial: string | null
          mobile_number: string | null
          municipality_city: string | null
          role: string
          sex: string | null
          stellar_pubkey: string | null
          verification_status: string | null
        }
        Insert: {
          area_id?: number | null
          barangay_id?: number | null
          birthdate?: string | null
          city_id?: number | null
          civil_status?: string | null
          complete_address?: string | null
          created_at?: string | null
          first_name?: string | null
          full_name?: string | null
          gov_id?: string | null
          gov_id_url?: string | null
          id: string
          identity_data_locked?: boolean
          last_name?: string | null
          location?: string | null
          middle_initial?: string | null
          mobile_number?: string | null
          municipality_city?: string | null
          role: string
          sex?: string | null
          stellar_pubkey?: string | null
          verification_status?: string | null
        }
        Update: {
          area_id?: number | null
          barangay_id?: number | null
          birthdate?: string | null
          city_id?: number | null
          civil_status?: string | null
          complete_address?: string | null
          created_at?: string | null
          first_name?: string | null
          full_name?: string | null
          gov_id?: string | null
          gov_id_url?: string | null
          id?: string
          identity_data_locked?: boolean
          last_name?: string | null
          location?: string | null
          middle_initial?: string | null
          mobile_number?: string | null
          municipality_city?: string | null
          role?: string
          sex?: string | null
          stellar_pubkey?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_barangay_id_fkey"
            columns: ["barangay_id"]
            isOneToOne: false
            referencedRelation: "barangays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      program_areas: {
        Row: {
          area_id: number
          program_id: string
        }
        Insert: {
          area_id: number
          program_id: string
        }
        Update: {
          area_id?: number
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_areas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_areas_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_barangays: {
        Row: {
          barangay_id: number
          program_id: string
        }
        Insert: {
          barangay_id: number
          program_id: string
        }
        Update: {
          barangay_id?: number
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_barangays_barangay_id_fkey"
            columns: ["barangay_id"]
            isOneToOne: false
            referencedRelation: "barangays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_barangays_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_financial_projection: {
        Row: {
          aid_type: Database["public"]["Enums"]["program_aid_type"]
          allocated_stroops: number
          as_of_ledger: number
          asset_code: string
          asset_issuer: string
          budget_stroops: number
          confirmed_transaction_count: number
          contract_id: string | null
          distributed_stroops: number
          escrow_balance_stroops: number
          funded_stroops: number
          funding_status: Database["public"]["Enums"]["program_funding_status"]
          is_quarantined: boolean
          is_stale: boolean
          latest_contract_event_id: string | null
          latest_ledger_transaction_id: string | null
          latest_transaction_hash: string | null
          network: Database["public"]["Enums"]["wallet_network"]
          organization_id: string
          program_id: string
          program_status: string
          projection_version: number
          quarantine_issue_id: string | null
          reconciled_at: string
          reconciliation_run_id: string
          redeemed_stroops: number
          refunded_stroops: number
          returned_stroops: number
          stale_after: string
          stale_since: string | null
          updated_at: string
        }
        Insert: {
          aid_type: Database["public"]["Enums"]["program_aid_type"]
          allocated_stroops?: number
          as_of_ledger: number
          asset_code?: string
          asset_issuer: string
          budget_stroops?: number
          confirmed_transaction_count?: number
          contract_id?: string | null
          distributed_stroops?: number
          escrow_balance_stroops?: number
          funded_stroops?: number
          funding_status: Database["public"]["Enums"]["program_funding_status"]
          is_quarantined?: boolean
          is_stale?: boolean
          latest_contract_event_id?: string | null
          latest_ledger_transaction_id?: string | null
          latest_transaction_hash?: string | null
          network?: Database["public"]["Enums"]["wallet_network"]
          organization_id: string
          program_id: string
          program_status: string
          projection_version?: number
          quarantine_issue_id?: string | null
          reconciled_at: string
          reconciliation_run_id: string
          redeemed_stroops?: number
          refunded_stroops?: number
          returned_stroops?: number
          stale_after: string
          stale_since?: string | null
          updated_at?: string
        }
        Update: {
          aid_type?: Database["public"]["Enums"]["program_aid_type"]
          allocated_stroops?: number
          as_of_ledger?: number
          asset_code?: string
          asset_issuer?: string
          budget_stroops?: number
          confirmed_transaction_count?: number
          contract_id?: string | null
          distributed_stroops?: number
          escrow_balance_stroops?: number
          funded_stroops?: number
          funding_status?: Database["public"]["Enums"]["program_funding_status"]
          is_quarantined?: boolean
          is_stale?: boolean
          latest_contract_event_id?: string | null
          latest_ledger_transaction_id?: string | null
          latest_transaction_hash?: string | null
          network?: Database["public"]["Enums"]["wallet_network"]
          organization_id?: string
          program_id?: string
          program_status?: string
          projection_version?: number
          quarantine_issue_id?: string | null
          reconciled_at?: string
          reconciliation_run_id?: string
          redeemed_stroops?: number
          refunded_stroops?: number
          returned_stroops?: number
          stale_after?: string
          stale_since?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_financial_projection_latest_contract_event_id_fkey"
            columns: ["latest_contract_event_id"]
            isOneToOne: false
            referencedRelation: "contract_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_financial_projection_latest_ledger_transaction_id_fkey"
            columns: ["latest_ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_financial_projection_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_financial_projection_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: true
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_financial_projection_quarantine_issue_id_fkey"
            columns: ["quarantine_issue_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_financial_projection_reconciliation_run_id_fkey"
            columns: ["reconciliation_run_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_merchants: {
        Row: {
          authorized_at: string
          authorized_by: string
          category: string
          correlation_id: string
          created_at: string
          id: string
          merchant_id: string
          program_id: string
          reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: Database["public"]["Enums"]["program_merchant_status"]
          updated_at: string
        }
        Insert: {
          authorized_at?: string
          authorized_by: string
          category: string
          correlation_id: string
          created_at?: string
          id?: string
          merchant_id: string
          program_id: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["program_merchant_status"]
          updated_at?: string
        }
        Update: {
          authorized_at?: string
          authorized_by?: string
          category?: string
          correlation_id?: string
          created_at?: string
          id?: string
          merchant_id?: string
          program_id?: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["program_merchant_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_merchants_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_merchants_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_policy_events: {
        Row: {
          actor_id: string
          allocation_amount_stroops: number | null
          beneficiary_identity_id: string | null
          correlation_id: string
          created_at: string
          event_type: Database["public"]["Enums"]["program_policy_event_type"]
          id: string
          merchant_id: string | null
          metadata: Json
          organization_id: string
          program_id: string
          reason: string | null
        }
        Insert: {
          actor_id: string
          allocation_amount_stroops?: number | null
          beneficiary_identity_id?: string | null
          correlation_id: string
          created_at?: string
          event_type: Database["public"]["Enums"]["program_policy_event_type"]
          id?: string
          merchant_id?: string | null
          metadata?: Json
          organization_id: string
          program_id: string
          reason?: string | null
        }
        Update: {
          actor_id?: string
          allocation_amount_stroops?: number | null
          beneficiary_identity_id?: string | null
          correlation_id?: string
          created_at?: string
          event_type?: Database["public"]["Enums"]["program_policy_event_type"]
          id?: string
          merchant_id?: string | null
          metadata?: Json
          organization_id?: string
          program_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_policy_events_beneficiary_identity_id_fkey"
            columns: ["beneficiary_identity_id"]
            isOneToOne: false
            referencedRelation: "beneficiary_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_policy_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_policy_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_policy_events_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          activation_correlation_id: string | null
          aid_type: Database["public"]["Enums"]["program_aid_type"]
          allocation_rules: Json
          amount_per_beneficiary: number
          asset_code: string
          asset_issuer: string | null
          asset_sac_address: string | null
          auto_distribute_toggle: boolean | null
          budget_stroops: number
          campaign_id: string | null
          closed_at: string | null
          contract_version: number | null
          created_at: string | null
          created_by: string | null
          daily_limit_stroops: number | null
          default_allocation_stroops: number | null
          disaster_event: string | null
          disaster_type_id: number | null
          distribution_end: string | null
          distribution_method: string | null
          distribution_start: string | null
          eligibility_criteria: string[] | null
          expires_at: string | null
          expiry_policy: Database["public"]["Enums"]["program_expiry_policy"]
          funded_at: string | null
          funded_budget_stroops: number
          funding_ledger: number | null
          funding_source_id: number | null
          funding_status: Database["public"]["Enums"]["program_funding_status"]
          funding_transaction_hash: string | null
          id: string
          implementing_agency_id: number | null
          name: string
          organization_id: string
          per_beneficiary_limit_stroops: number | null
          per_transaction_limit_stroops: number | null
          policy_expires_at: string | null
          policy_locked_at: string | null
          policy_version: number
          purpose: string | null
          redemption_type: string | null
          refund_policy: Database["public"]["Enums"]["program_refund_policy"]
          refund_window_ends_at: string | null
          registration_close: string | null
          registration_open: string | null
          selected_merchants: Json | null
          start_date: string | null
          status: string | null
          supersedes_program_id: string | null
          supporting_documents: Json | null
          total_budget: number
          treasury_wallet_id: string | null
          voucher_contract_address: string | null
          voucher_expiration: string | null
          voucher_quantity: number | null
          voucher_type: string | null
          voucher_types: string[] | null
          voucher_value: number | null
          wallet_type_toggle: boolean | null
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          activation_correlation_id?: string | null
          aid_type?: Database["public"]["Enums"]["program_aid_type"]
          allocation_rules?: Json
          amount_per_beneficiary?: number
          asset_code?: string
          asset_issuer?: string | null
          asset_sac_address?: string | null
          auto_distribute_toggle?: boolean | null
          budget_stroops?: number
          campaign_id?: string | null
          closed_at?: string | null
          contract_version?: number | null
          created_at?: string | null
          created_by?: string | null
          daily_limit_stroops?: number | null
          default_allocation_stroops?: number | null
          disaster_event?: string | null
          disaster_type_id?: number | null
          distribution_end?: string | null
          distribution_method?: string | null
          distribution_start?: string | null
          eligibility_criteria?: string[] | null
          expires_at?: string | null
          expiry_policy?: Database["public"]["Enums"]["program_expiry_policy"]
          funded_at?: string | null
          funded_budget_stroops?: number
          funding_ledger?: number | null
          funding_source_id?: number | null
          funding_status?: Database["public"]["Enums"]["program_funding_status"]
          funding_transaction_hash?: string | null
          id?: string
          implementing_agency_id?: number | null
          name: string
          organization_id: string
          per_beneficiary_limit_stroops?: number | null
          per_transaction_limit_stroops?: number | null
          policy_expires_at?: string | null
          policy_locked_at?: string | null
          policy_version?: number
          purpose?: string | null
          redemption_type?: string | null
          refund_policy?: Database["public"]["Enums"]["program_refund_policy"]
          refund_window_ends_at?: string | null
          registration_close?: string | null
          registration_open?: string | null
          selected_merchants?: Json | null
          start_date?: string | null
          status?: string | null
          supersedes_program_id?: string | null
          supporting_documents?: Json | null
          total_budget?: number
          treasury_wallet_id?: string | null
          voucher_contract_address?: string | null
          voucher_expiration?: string | null
          voucher_quantity?: number | null
          voucher_type?: string | null
          voucher_types?: string[] | null
          voucher_value?: number | null
          wallet_type_toggle?: boolean | null
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          activation_correlation_id?: string | null
          aid_type?: Database["public"]["Enums"]["program_aid_type"]
          allocation_rules?: Json
          amount_per_beneficiary?: number
          asset_code?: string
          asset_issuer?: string | null
          asset_sac_address?: string | null
          auto_distribute_toggle?: boolean | null
          budget_stroops?: number
          campaign_id?: string | null
          closed_at?: string | null
          contract_version?: number | null
          created_at?: string | null
          created_by?: string | null
          daily_limit_stroops?: number | null
          default_allocation_stroops?: number | null
          disaster_event?: string | null
          disaster_type_id?: number | null
          distribution_end?: string | null
          distribution_method?: string | null
          distribution_start?: string | null
          eligibility_criteria?: string[] | null
          expires_at?: string | null
          expiry_policy?: Database["public"]["Enums"]["program_expiry_policy"]
          funded_at?: string | null
          funded_budget_stroops?: number
          funding_ledger?: number | null
          funding_source_id?: number | null
          funding_status?: Database["public"]["Enums"]["program_funding_status"]
          funding_transaction_hash?: string | null
          id?: string
          implementing_agency_id?: number | null
          name?: string
          organization_id?: string
          per_beneficiary_limit_stroops?: number | null
          per_transaction_limit_stroops?: number | null
          policy_expires_at?: string | null
          policy_locked_at?: string | null
          policy_version?: number
          purpose?: string | null
          redemption_type?: string | null
          refund_policy?: Database["public"]["Enums"]["program_refund_policy"]
          refund_window_ends_at?: string | null
          registration_close?: string | null
          registration_open?: string | null
          selected_merchants?: Json | null
          start_date?: string | null
          status?: string | null
          supersedes_program_id?: string | null
          supporting_documents?: Json | null
          total_budget?: number
          treasury_wallet_id?: string | null
          voucher_contract_address?: string | null
          voucher_expiration?: string | null
          voucher_quantity?: number | null
          voucher_type?: string | null
          voucher_types?: string[] | null
          voucher_value?: number | null
          wallet_type_toggle?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "disaster_response_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_campaign_organization_fkey"
            columns: ["campaign_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "disaster_response_campaigns"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "programs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_disaster_type_id_fkey"
            columns: ["disaster_type_id"]
            isOneToOne: false
            referencedRelation: "disaster_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_funding_source_id_fkey"
            columns: ["funding_source_id"]
            isOneToOne: false
            referencedRelation: "funding_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_implementing_agency_id_fkey"
            columns: ["implementing_agency_id"]
            isOneToOne: false
            referencedRelation: "implementing_agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_supersedes_program_id_fkey"
            columns: ["supersedes_program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_treasury_wallet_id_fkey"
            columns: ["treasury_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      public_program_aggregate_projection: {
        Row: {
          aid_type: Database["public"]["Enums"]["program_aid_type"]
          as_of_ledger: number
          asset_code: string
          budget_stroops: number
          confirmed_transaction_count: number
          contract_id: string | null
          distributed_stroops: number
          funded_stroops: number
          is_quarantined: boolean
          is_stale: boolean
          latest_ledger_transaction_id: string | null
          latest_transaction_hash: string | null
          network: Database["public"]["Enums"]["wallet_network"]
          organization_id: string
          organization_name: string
          program_id: string
          program_name: string
          program_status: string
          projection_version: number
          quarantine_issue_id: string | null
          reconciled_at: string
          reconciliation_run_id: string
          redeemed_stroops: number
          refunded_stroops: number
          returned_stroops: number
          stale_after: string
          stale_since: string | null
          updated_at: string
        }
        Insert: {
          aid_type: Database["public"]["Enums"]["program_aid_type"]
          as_of_ledger: number
          asset_code?: string
          budget_stroops?: number
          confirmed_transaction_count?: number
          contract_id?: string | null
          distributed_stroops?: number
          funded_stroops?: number
          is_quarantined?: boolean
          is_stale?: boolean
          latest_ledger_transaction_id?: string | null
          latest_transaction_hash?: string | null
          network?: Database["public"]["Enums"]["wallet_network"]
          organization_id: string
          organization_name: string
          program_id: string
          program_name: string
          program_status: string
          projection_version?: number
          quarantine_issue_id?: string | null
          reconciled_at: string
          reconciliation_run_id: string
          redeemed_stroops?: number
          refunded_stroops?: number
          returned_stroops?: number
          stale_after: string
          stale_since?: string | null
          updated_at?: string
        }
        Update: {
          aid_type?: Database["public"]["Enums"]["program_aid_type"]
          as_of_ledger?: number
          asset_code?: string
          budget_stroops?: number
          confirmed_transaction_count?: number
          contract_id?: string | null
          distributed_stroops?: number
          funded_stroops?: number
          is_quarantined?: boolean
          is_stale?: boolean
          latest_ledger_transaction_id?: string | null
          latest_transaction_hash?: string | null
          network?: Database["public"]["Enums"]["wallet_network"]
          organization_id?: string
          organization_name?: string
          program_id?: string
          program_name?: string
          program_status?: string
          projection_version?: number
          quarantine_issue_id?: string | null
          reconciled_at?: string
          reconciliation_run_id?: string
          redeemed_stroops?: number
          refunded_stroops?: number
          returned_stroops?: number
          stale_after?: string
          stale_since?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_program_aggregate_proj_latest_ledger_transaction_id_fkey"
            columns: ["latest_ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_program_aggregate_projection_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_program_aggregate_projection_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: true
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_program_aggregate_projection_quarantine_issue_id_fkey"
            columns: ["quarantine_issue_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_program_aggregate_projection_reconciliation_run_id_fkey"
            columns: ["reconciliation_run_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_cursors: {
        Row: {
          correlation_id: string
          created_at: string
          cursor_value: string | null
          id: string
          last_ledger_closed_at: string | null
          last_ledger_sequence: number
          network: Database["public"]["Enums"]["wallet_network"]
          stream_name: string
          updated_at: string
          version: number
        }
        Insert: {
          correlation_id: string
          created_at?: string
          cursor_value?: string | null
          id?: string
          last_ledger_closed_at?: string | null
          last_ledger_sequence?: number
          network?: Database["public"]["Enums"]["wallet_network"]
          stream_name: string
          updated_at?: string
          version?: number
        }
        Update: {
          correlation_id?: string
          created_at?: string
          cursor_value?: string | null
          id?: string
          last_ledger_closed_at?: string | null
          last_ledger_sequence?: number
          network?: Database["public"]["Enums"]["wallet_network"]
          stream_name?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      reconciliation_issues: {
        Row: {
          alert_acknowledged_at: string | null
          alert_error_code: string | null
          alert_last_attempt_at: string | null
          alert_sent_at: string | null
          alert_state: Database["public"]["Enums"]["reconciliation_alert_state"]
          contract_event_id: string | null
          correlation_id: string
          expected_state: Json
          first_detected_at: string
          id: string
          issue_type: Database["public"]["Enums"]["reconciliation_issue_type"]
          last_detected_at: string
          ledger_transaction_id: string | null
          mismatch_fingerprint: string
          network: Database["public"]["Enums"]["wallet_network"]
          observed_state: Json
          occurrence_count: number
          organization_id: string
          program_id: string | null
          projection_key: Json
          projection_table: string | null
          quarantine_state: Database["public"]["Enums"]["reconciliation_quarantine_state"]
          quarantined_at: string
          reconciliation_run_id: string
          released_at: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["reconciliation_issue_severity"]
          status: Database["public"]["Enums"]["reconciliation_issue_status"]
          subject_identifier: string
          subject_type: string
        }
        Insert: {
          alert_acknowledged_at?: string | null
          alert_error_code?: string | null
          alert_last_attempt_at?: string | null
          alert_sent_at?: string | null
          alert_state?: Database["public"]["Enums"]["reconciliation_alert_state"]
          contract_event_id?: string | null
          correlation_id: string
          expected_state?: Json
          first_detected_at?: string
          id?: string
          issue_type: Database["public"]["Enums"]["reconciliation_issue_type"]
          last_detected_at?: string
          ledger_transaction_id?: string | null
          mismatch_fingerprint: string
          network?: Database["public"]["Enums"]["wallet_network"]
          observed_state?: Json
          occurrence_count?: number
          organization_id: string
          program_id?: string | null
          projection_key?: Json
          projection_table?: string | null
          quarantine_state?: Database["public"]["Enums"]["reconciliation_quarantine_state"]
          quarantined_at?: string
          reconciliation_run_id: string
          released_at?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["reconciliation_issue_severity"]
          status?: Database["public"]["Enums"]["reconciliation_issue_status"]
          subject_identifier: string
          subject_type: string
        }
        Update: {
          alert_acknowledged_at?: string | null
          alert_error_code?: string | null
          alert_last_attempt_at?: string | null
          alert_sent_at?: string | null
          alert_state?: Database["public"]["Enums"]["reconciliation_alert_state"]
          contract_event_id?: string | null
          correlation_id?: string
          expected_state?: Json
          first_detected_at?: string
          id?: string
          issue_type?: Database["public"]["Enums"]["reconciliation_issue_type"]
          last_detected_at?: string
          ledger_transaction_id?: string | null
          mismatch_fingerprint?: string
          network?: Database["public"]["Enums"]["wallet_network"]
          observed_state?: Json
          occurrence_count?: number
          organization_id?: string
          program_id?: string | null
          projection_key?: Json
          projection_table?: string | null
          quarantine_state?: Database["public"]["Enums"]["reconciliation_quarantine_state"]
          quarantined_at?: string
          reconciliation_run_id?: string
          released_at?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["reconciliation_issue_severity"]
          status?: Database["public"]["Enums"]["reconciliation_issue_status"]
          subject_identifier?: string
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_issues_contract_event_id_fkey"
            columns: ["contract_event_id"]
            isOneToOne: false
            referencedRelation: "contract_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_issues_ledger_transaction_id_fkey"
            columns: ["ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_issues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_issues_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_issues_reconciliation_run_id_fkey"
            columns: ["reconciliation_run_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_runs: {
        Row: {
          completed_at: string | null
          confirmed_intent_count: number
          correlation_id: string
          cursor_after: string | null
          cursor_before: string | null
          end_ledger_sequence: number | null
          error_code: string | null
          error_details: Json
          error_message: string | null
          failed_intent_count: number
          id: string
          mismatch_count: number
          network: Database["public"]["Enums"]["wallet_network"]
          observed_event_count: number
          observed_transaction_count: number
          organization_id: string | null
          program_id: string | null
          quarantined_count: number
          reconciliation_lag_seconds: number | null
          start_ledger_sequence: number | null
          started_at: string
          status: Database["public"]["Enums"]["reconciliation_run_status"]
          stream_name: string
        }
        Insert: {
          completed_at?: string | null
          confirmed_intent_count?: number
          correlation_id: string
          cursor_after?: string | null
          cursor_before?: string | null
          end_ledger_sequence?: number | null
          error_code?: string | null
          error_details?: Json
          error_message?: string | null
          failed_intent_count?: number
          id?: string
          mismatch_count?: number
          network?: Database["public"]["Enums"]["wallet_network"]
          observed_event_count?: number
          observed_transaction_count?: number
          organization_id?: string | null
          program_id?: string | null
          quarantined_count?: number
          reconciliation_lag_seconds?: number | null
          start_ledger_sequence?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["reconciliation_run_status"]
          stream_name: string
        }
        Update: {
          completed_at?: string | null
          confirmed_intent_count?: number
          correlation_id?: string
          cursor_after?: string | null
          cursor_before?: string | null
          end_ledger_sequence?: number | null
          error_code?: string | null
          error_details?: Json
          error_message?: string | null
          failed_intent_count?: number
          id?: string
          mismatch_count?: number
          network?: Database["public"]["Enums"]["wallet_network"]
          observed_event_count?: number
          observed_transaction_count?: number
          organization_id?: string | null
          program_id?: string | null
          quarantined_count?: number
          reconciliation_lag_seconds?: number | null
          start_ledger_sequence?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["reconciliation_run_status"]
          stream_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_runs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      redemptions: {
        Row: {
          amount: number
          beneficiary_id: string
          category: string | null
          enrollment_id: string
          id: string
          merchant_name: string | null
          redeemed_at: string | null
          remaining_balance: number | null
          status: string | null
          tx_hash: string | null
        }
        Insert: {
          amount: number
          beneficiary_id: string
          category?: string | null
          enrollment_id: string
          id?: string
          merchant_name?: string | null
          redeemed_at?: string | null
          remaining_balance?: number | null
          status?: string | null
          tx_hash?: string | null
        }
        Update: {
          amount?: number
          beneficiary_id?: string
          category?: string | null
          enrollment_id?: string
          id?: string
          merchant_name?: string | null
          redeemed_at?: string | null
          remaining_balance?: number | null
          status?: string | null
          tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "redemptions_beneficiary_id_fkey"
            columns: ["beneficiary_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount_stroops: number
          approved_at: string | null
          beneficiary_identity_id: string
          confirmed_at: string | null
          contract_event_id: string | null
          contract_event_index: number | null
          contract_id: string | null
          correlation_id: string
          created_at: string
          exception_reason: string | null
          failed_at: string | null
          failure_code: string | null
          id: string
          ledger: number | null
          ledger_transaction_id: string | null
          merchant_authorization_hash: string | null
          merchant_id: string
          organization_id: string
          original_payment_intent_id: string
          original_settlement_id: string
          program_id: string | null
          refund_nonce: string
          requested_at: string
          returns_to_entitlement: boolean
          status: Database["public"]["Enums"]["refund_status"]
          submitted_at: string | null
          transaction_hash: string | null
          updated_at: string
          voucher_redemption_id: string | null
        }
        Insert: {
          amount_stroops: number
          approved_at?: string | null
          beneficiary_identity_id: string
          confirmed_at?: string | null
          contract_event_id?: string | null
          contract_event_index?: number | null
          contract_id?: string | null
          correlation_id: string
          created_at?: string
          exception_reason?: string | null
          failed_at?: string | null
          failure_code?: string | null
          id?: string
          ledger?: number | null
          ledger_transaction_id?: string | null
          merchant_authorization_hash?: string | null
          merchant_id: string
          organization_id: string
          original_payment_intent_id: string
          original_settlement_id: string
          program_id?: string | null
          refund_nonce: string
          requested_at?: string
          returns_to_entitlement?: boolean
          status?: Database["public"]["Enums"]["refund_status"]
          submitted_at?: string | null
          transaction_hash?: string | null
          updated_at?: string
          voucher_redemption_id?: string | null
        }
        Update: {
          amount_stroops?: number
          approved_at?: string | null
          beneficiary_identity_id?: string
          confirmed_at?: string | null
          contract_event_id?: string | null
          contract_event_index?: number | null
          contract_id?: string | null
          correlation_id?: string
          created_at?: string
          exception_reason?: string | null
          failed_at?: string | null
          failure_code?: string | null
          id?: string
          ledger?: number | null
          ledger_transaction_id?: string | null
          merchant_authorization_hash?: string | null
          merchant_id?: string
          organization_id?: string
          original_payment_intent_id?: string
          original_settlement_id?: string
          program_id?: string | null
          refund_nonce?: string
          requested_at?: string
          returns_to_entitlement?: boolean
          status?: Database["public"]["Enums"]["refund_status"]
          submitted_at?: string | null
          transaction_hash?: string | null
          updated_at?: string
          voucher_redemption_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refunds_beneficiary_identity_id_fkey"
            columns: ["beneficiary_identity_id"]
            isOneToOne: false
            referencedRelation: "beneficiary_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_contract_event_id_fkey"
            columns: ["contract_event_id"]
            isOneToOne: false
            referencedRelation: "contract_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_ledger_transaction_id_fkey"
            columns: ["ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_original_payment_intent_id_fkey"
            columns: ["original_payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_original_settlement_id_fkey"
            columns: ["original_settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_voucher_redemption_id_fkey"
            columns: ["voucher_redemption_id"]
            isOneToOne: false
            referencedRelation: "voucher_redemptions"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_policies: {
        Row: {
          correlation_id: string
          counsel_reference: string | null
          created_at: string
          created_by: string | null
          effective_at: string
          id: string
          organization_id: string
          policy_version: number
          record_type: Database["public"]["Enums"]["retention_record_type"]
          retention_period: string
          review_status: Database["public"]["Enums"]["retention_policy_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          superseded_at: string | null
        }
        Insert: {
          correlation_id: string
          counsel_reference?: string | null
          created_at?: string
          created_by?: string | null
          effective_at?: string
          id?: string
          organization_id: string
          policy_version: number
          record_type: Database["public"]["Enums"]["retention_record_type"]
          retention_period?: string
          review_status?: Database["public"]["Enums"]["retention_policy_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          superseded_at?: string | null
        }
        Update: {
          correlation_id?: string
          counsel_reference?: string | null
          created_at?: string
          created_by?: string | null
          effective_at?: string
          id?: string
          organization_id?: string
          policy_version?: number
          record_type?: Database["public"]["Enums"]["retention_record_type"]
          retention_period?: string
          review_status?: Database["public"]["Enums"]["retention_policy_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          superseded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retention_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_records: {
        Row: {
          correlation_id: string
          created_at: string
          disposed_at: string | null
          disposed_by: string | null
          disposition_reference: string | null
          disposition_status: Database["public"]["Enums"]["retention_disposition_status"]
          id: string
          legal_hold_reason: string | null
          legal_hold_until: string | null
          organization_id: string
          policy_id: string
          policy_version: number
          program_id: string
          record_type: Database["public"]["Enums"]["retention_record_type"]
          retain_until: string
          retention_period: string
          retention_started_at: string
          subject_id: string
          subject_table: string
        }
        Insert: {
          correlation_id: string
          created_at?: string
          disposed_at?: string | null
          disposed_by?: string | null
          disposition_reference?: string | null
          disposition_status?: Database["public"]["Enums"]["retention_disposition_status"]
          id?: string
          legal_hold_reason?: string | null
          legal_hold_until?: string | null
          organization_id: string
          policy_id: string
          policy_version: number
          program_id: string
          record_type: Database["public"]["Enums"]["retention_record_type"]
          retain_until: string
          retention_period: string
          retention_started_at: string
          subject_id: string
          subject_table: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          disposed_at?: string | null
          disposed_by?: string | null
          disposition_reference?: string | null
          disposition_status?: Database["public"]["Enums"]["retention_disposition_status"]
          id?: string
          legal_hold_reason?: string | null
          legal_hold_until?: string | null
          organization_id?: string
          policy_id?: string
          policy_version?: number
          program_id?: string
          record_type?: Database["public"]["Enums"]["retention_record_type"]
          retain_until?: string
          retention_period?: string
          retention_started_at?: string
          subject_id?: string
          subject_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_records_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "retention_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_records_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          amount_stroops: number
          confirmed_at: string | null
          contract_event_id: string | null
          contract_event_index: number | null
          contract_id: string | null
          correlation_id: string
          created_at: string
          failed_at: string | null
          failure_code: string | null
          id: string
          kind: Database["public"]["Enums"]["settlement_kind"]
          ledger: number | null
          ledger_transaction_id: string | null
          merchant_id: string
          organization_id: string
          payment_intent_id: string
          program_id: string | null
          settlement_wallet_id: string
          status: Database["public"]["Enums"]["settlement_status"]
          transaction_hash: string
          updated_at: string
          voucher_redemption_id: string | null
        }
        Insert: {
          amount_stroops: number
          confirmed_at?: string | null
          contract_event_id?: string | null
          contract_event_index?: number | null
          contract_id?: string | null
          correlation_id: string
          created_at?: string
          failed_at?: string | null
          failure_code?: string | null
          id?: string
          kind: Database["public"]["Enums"]["settlement_kind"]
          ledger?: number | null
          ledger_transaction_id?: string | null
          merchant_id: string
          organization_id: string
          payment_intent_id: string
          program_id?: string | null
          settlement_wallet_id: string
          status?: Database["public"]["Enums"]["settlement_status"]
          transaction_hash: string
          updated_at?: string
          voucher_redemption_id?: string | null
        }
        Update: {
          amount_stroops?: number
          confirmed_at?: string | null
          contract_event_id?: string | null
          contract_event_index?: number | null
          contract_id?: string | null
          correlation_id?: string
          created_at?: string
          failed_at?: string | null
          failure_code?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["settlement_kind"]
          ledger?: number | null
          ledger_transaction_id?: string | null
          merchant_id?: string
          organization_id?: string
          payment_intent_id?: string
          program_id?: string | null
          settlement_wallet_id?: string
          status?: Database["public"]["Enums"]["settlement_status"]
          transaction_hash?: string
          updated_at?: string
          voucher_redemption_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlements_contract_event_id_fkey"
            columns: ["contract_event_id"]
            isOneToOne: false
            referencedRelation: "contract_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_ledger_transaction_id_fkey"
            columns: ["ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: true
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_settlement_wallet_id_fkey"
            columns: ["settlement_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_voucher_redemption_id_fkey"
            columns: ["voucher_redemption_id"]
            isOneToOne: true
            referencedRelation: "voucher_redemptions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_attempts: {
        Row: {
          attempt_number: number
          authorization_payload: Json | null
          beneficiary_identity_id: string | null
          correlation_id: string
          created_at: string
          distribution_job_id: string | null
          envelope_xdr: string | null
          error_code: string | null
          error_detail: string | null
          financial_intent_id: string
          id: string
          intent_payload_hash: string
          max_ledger: number | null
          min_ledger: number | null
          network: Database["public"]["Enums"]["wallet_network"]
          observed_at: string | null
          organization_id: string
          prepared_payload_hash: string
          program_id: string | null
          result_code: string | null
          status: Database["public"]["Enums"]["transaction_attempt_status"]
          submitted_at: string | null
          transaction_hash: string | null
          updated_at: string
        }
        Insert: {
          attempt_number: number
          authorization_payload?: Json | null
          beneficiary_identity_id?: string | null
          correlation_id: string
          created_at?: string
          distribution_job_id?: string | null
          envelope_xdr?: string | null
          error_code?: string | null
          error_detail?: string | null
          financial_intent_id: string
          id?: string
          intent_payload_hash: string
          max_ledger?: number | null
          min_ledger?: number | null
          network?: Database["public"]["Enums"]["wallet_network"]
          observed_at?: string | null
          organization_id: string
          prepared_payload_hash: string
          program_id?: string | null
          result_code?: string | null
          status?: Database["public"]["Enums"]["transaction_attempt_status"]
          submitted_at?: string | null
          transaction_hash?: string | null
          updated_at?: string
        }
        Update: {
          attempt_number?: number
          authorization_payload?: Json | null
          beneficiary_identity_id?: string | null
          correlation_id?: string
          created_at?: string
          distribution_job_id?: string | null
          envelope_xdr?: string | null
          error_code?: string | null
          error_detail?: string | null
          financial_intent_id?: string
          id?: string
          intent_payload_hash?: string
          max_ledger?: number | null
          min_ledger?: number | null
          network?: Database["public"]["Enums"]["wallet_network"]
          observed_at?: string | null
          organization_id?: string
          prepared_payload_hash?: string
          program_id?: string | null
          result_code?: string | null
          status?: Database["public"]["Enums"]["transaction_attempt_status"]
          submitted_at?: string | null
          transaction_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_attempts_beneficiary_identity_id_fkey"
            columns: ["beneficiary_identity_id"]
            isOneToOne: false
            referencedRelation: "beneficiary_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_attempts_distribution_job_id_fkey"
            columns: ["distribution_job_id"]
            isOneToOne: false
            referencedRelation: "distribution_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_attempts_financial_intent_id_fkey"
            columns: ["financial_intent_id"]
            isOneToOne: false
            referencedRelation: "financial_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_attempts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_redemptions: {
        Row: {
          amount_stroops: number
          beneficiary_identity_id: string
          confirmed_at: string | null
          contract_event_id: string | null
          contract_event_index: number | null
          contract_id: string
          correlation_id: string
          created_at: string
          failed_at: string | null
          failure_code: string | null
          id: string
          invoice_id: string
          ledger: number | null
          ledger_transaction_id: string | null
          merchant_id: string
          organization_id: string
          payment_intent_id: string
          program_id: string
          status: Database["public"]["Enums"]["redemption_status"]
          submitted_at: string
          transaction_hash: string
          updated_at: string
        }
        Insert: {
          amount_stroops: number
          beneficiary_identity_id: string
          confirmed_at?: string | null
          contract_event_id?: string | null
          contract_event_index?: number | null
          contract_id: string
          correlation_id: string
          created_at?: string
          failed_at?: string | null
          failure_code?: string | null
          id?: string
          invoice_id: string
          ledger?: number | null
          ledger_transaction_id?: string | null
          merchant_id: string
          organization_id: string
          payment_intent_id: string
          program_id: string
          status?: Database["public"]["Enums"]["redemption_status"]
          submitted_at?: string
          transaction_hash: string
          updated_at?: string
        }
        Update: {
          amount_stroops?: number
          beneficiary_identity_id?: string
          confirmed_at?: string | null
          contract_event_id?: string | null
          contract_event_index?: number | null
          contract_id?: string
          correlation_id?: string
          created_at?: string
          failed_at?: string | null
          failure_code?: string | null
          id?: string
          invoice_id?: string
          ledger?: number | null
          ledger_transaction_id?: string | null
          merchant_id?: string
          organization_id?: string
          payment_intent_id?: string
          program_id?: string
          status?: Database["public"]["Enums"]["redemption_status"]
          submitted_at?: string
          transaction_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_redemptions_beneficiary_identity_id_fkey"
            columns: ["beneficiary_identity_id"]
            isOneToOne: false
            referencedRelation: "beneficiary_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_contract_event_id_fkey"
            columns: ["contract_event_id"]
            isOneToOne: false
            referencedRelation: "contract_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_ledger_transaction_id_fkey"
            columns: ["ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: true
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_rotation_intents: {
        Row: {
          approved_at: string | null
          beneficiary_identity_id: string
          confirmed_at: string | null
          correlation_id: string
          created_at: string
          current_wallet_id: string
          failure_code: string | null
          financial_intent_id: string | null
          id: string
          idempotency_key: string
          identity_reverification_id: string
          organization_id: string
          replacement_wallet_id: string
          requested_by: string
          status: Database["public"]["Enums"]["wallet_rotation_status"]
          step_up_verified_at: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          beneficiary_identity_id: string
          confirmed_at?: string | null
          correlation_id: string
          created_at?: string
          current_wallet_id: string
          failure_code?: string | null
          financial_intent_id?: string | null
          id?: string
          idempotency_key: string
          identity_reverification_id: string
          organization_id: string
          replacement_wallet_id: string
          requested_by: string
          status?: Database["public"]["Enums"]["wallet_rotation_status"]
          step_up_verified_at: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          beneficiary_identity_id?: string
          confirmed_at?: string | null
          correlation_id?: string
          created_at?: string
          current_wallet_id?: string
          failure_code?: string | null
          financial_intent_id?: string | null
          id?: string
          idempotency_key?: string
          identity_reverification_id?: string
          organization_id?: string
          replacement_wallet_id?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["wallet_rotation_status"]
          step_up_verified_at?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_rotation_intents_beneficiary_identity_id_fkey"
            columns: ["beneficiary_identity_id"]
            isOneToOne: false
            referencedRelation: "beneficiary_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_rotation_intents_current_wallet_id_fkey"
            columns: ["current_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_rotation_intents_financial_intent_id_fkey"
            columns: ["financial_intent_id"]
            isOneToOne: true
            referencedRelation: "financial_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_rotation_intents_identity_reverification_id_fkey"
            columns: ["identity_reverification_id"]
            isOneToOne: true
            referencedRelation: "beneficiary_identity_reverifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_rotation_intents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_rotation_intents_replacement_wallet_id_fkey"
            columns: ["replacement_wallet_id"]
            isOneToOne: true
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          address: string
          created_at: string
          id: string
          is_active: boolean
          network: Database["public"]["Enums"]["wallet_network"]
          owner_id: string
          owner_type: Database["public"]["Enums"]["wallet_owner_type"]
          proof_challenge_digest: string | null
          proof_challenge_expires_at: string | null
          proof_challenge_issued_at: string | null
          proof_signature_digest: string | null
          purpose: Database["public"]["Enums"]["wallet_purpose"]
          superseded_at: string | null
          superseded_by: string | null
          superseded_by_wallet_id: string | null
          updated_at: string
          verification_status: Database["public"]["Enums"]["wallet_verification_status"]
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          is_active?: boolean
          network?: Database["public"]["Enums"]["wallet_network"]
          owner_id: string
          owner_type: Database["public"]["Enums"]["wallet_owner_type"]
          proof_challenge_digest?: string | null
          proof_challenge_expires_at?: string | null
          proof_challenge_issued_at?: string | null
          proof_signature_digest?: string | null
          purpose: Database["public"]["Enums"]["wallet_purpose"]
          superseded_at?: string | null
          superseded_by?: string | null
          superseded_by_wallet_id?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["wallet_verification_status"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          is_active?: boolean
          network?: Database["public"]["Enums"]["wallet_network"]
          owner_id?: string
          owner_type?: Database["public"]["Enums"]["wallet_owner_type"]
          proof_challenge_digest?: string | null
          proof_challenge_expires_at?: string | null
          proof_challenge_issued_at?: string | null
          proof_signature_digest?: string | null
          purpose?: Database["public"]["Enums"]["wallet_purpose"]
          superseded_at?: string | null
          superseded_by?: string | null
          superseded_by_wallet_id?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["wallet_verification_status"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallets_superseded_by_wallet_fkey"
            columns: ["superseded_by_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_financial_transparency: {
        Row: {
          aid_type: Database["public"]["Enums"]["program_aid_type"] | null
          as_of_ledger: number | null
          asset_code: string | null
          budget_stroops: number | null
          confirmed_transaction_count: number | null
          contract_id: string | null
          distributed_stroops: number | null
          funded_stroops: number | null
          is_stale: boolean | null
          latest_transaction_hash: string | null
          network: Database["public"]["Enums"]["wallet_network"] | null
          organization_id: string | null
          organization_name: string | null
          program_id: string | null
          program_name: string | null
          program_status: string | null
          reconciled_at: string | null
          redeemed_stroops: number | null
          refunded_stroops: number | null
          returned_stroops: number | null
          stale_after: string | null
        }
        Insert: {
          aid_type?: Database["public"]["Enums"]["program_aid_type"] | null
          as_of_ledger?: number | null
          asset_code?: string | null
          budget_stroops?: number | null
          confirmed_transaction_count?: number | null
          contract_id?: string | null
          distributed_stroops?: number | null
          funded_stroops?: number | null
          is_stale?: never
          latest_transaction_hash?: string | null
          network?: Database["public"]["Enums"]["wallet_network"] | null
          organization_id?: string | null
          organization_name?: string | null
          program_id?: string | null
          program_name?: string | null
          program_status?: string | null
          reconciled_at?: string | null
          redeemed_stroops?: number | null
          refunded_stroops?: number | null
          returned_stroops?: number | null
          stale_after?: string | null
        }
        Update: {
          aid_type?: Database["public"]["Enums"]["program_aid_type"] | null
          as_of_ledger?: number | null
          asset_code?: string | null
          budget_stroops?: number | null
          confirmed_transaction_count?: number | null
          contract_id?: string | null
          distributed_stroops?: number | null
          funded_stroops?: number | null
          is_stale?: never
          latest_transaction_hash?: string | null
          network?: Database["public"]["Enums"]["wallet_network"] | null
          organization_id?: string | null
          organization_name?: string | null
          program_id?: string | null
          program_name?: string | null
          program_status?: string | null
          reconciled_at?: string | null
          redeemed_stroops?: number | null
          refunded_stroops?: number | null
          returned_stroops?: number | null
          stale_after?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_program_aggregate_projection_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_program_aggregate_projection_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: true
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      advance_reconciliation_cursor: {
        Args: {
          p_correlation_id: string
          p_cursor_value: string
          p_last_ledger_closed_at: string
          p_last_ledger_sequence: number
          p_network: Database["public"]["Enums"]["wallet_network"]
          p_stream_name: string
        }
        Returns: {
          correlation_id: string
          created_at: string
          cursor_value: string | null
          id: string
          last_ledger_closed_at: string | null
          last_ledger_sequence: number
          network: Database["public"]["Enums"]["wallet_network"]
          stream_name: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "reconciliation_cursors"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      append_audit_event: {
        Args: {
          p_action: string
          p_actor_user_id: string
          p_correlation_id: string
          p_metadata?: Json
          p_organization_id: string
          p_sensitive_data_access?: boolean
        }
        Returns: string
      }
      claim_financial_idempotency_key: {
        Args: {
          p_correlation_id: string
          p_idempotency_key: string
          p_operation_type: Database["public"]["Enums"]["financial_operation_type"]
          p_organization_id: string
          p_payload_hash: string
          p_program_id: string
          p_scope: string
        }
        Returns: {
          correlation_id: string
          first_seen_at: string
          id: string
          idempotency_key: string
          last_seen_at: string
          operation_type: Database["public"]["Enums"]["financial_operation_type"]
          organization_id: string
          payload_hash: string
          program_id: string | null
          scope: string
        }
        SetofOptions: {
          from: "*"
          to: "idempotency_keys"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_wallet_proof: {
        Args: {
          p_challenge_digest: string
          p_signature_digest: string
          p_verified_by: string
          p_wallet_id: string
        }
        Returns: {
          address: string
          created_at: string
          id: string
          is_active: boolean
          network: Database["public"]["Enums"]["wallet_network"]
          owner_id: string
          owner_type: Database["public"]["Enums"]["wallet_owner_type"]
          proof_challenge_digest: string | null
          proof_challenge_expires_at: string | null
          proof_challenge_issued_at: string | null
          proof_signature_digest: string | null
          purpose: Database["public"]["Enums"]["wallet_purpose"]
          superseded_at: string | null
          superseded_by: string | null
          superseded_by_wallet_id: string | null
          updated_at: string
          verification_status: Database["public"]["Enums"]["wallet_verification_status"]
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "wallets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      deactivate_organization_membership: {
        Args: {
          p_actor_id: string
          p_organization_id: string
          p_user_id: string
        }
        Returns: {
          granted_at: string
          granted_by: string | null
          id: string
          is_active: boolean
          organization_id: string
          role: Database["public"]["Enums"]["organization_membership_role"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dispose_retention_record: {
        Args: {
          p_actor_id: string
          p_correlation_id: string
          p_disposition_reference: string
          p_retention_record_id: string
        }
        Returns: {
          correlation_id: string
          created_at: string
          disposed_at: string | null
          disposed_by: string | null
          disposition_reference: string | null
          disposition_status: Database["public"]["Enums"]["retention_disposition_status"]
          id: string
          legal_hold_reason: string | null
          legal_hold_until: string | null
          organization_id: string
          policy_id: string
          policy_version: number
          program_id: string
          record_type: Database["public"]["Enums"]["retention_record_type"]
          retain_until: string
          retention_period: string
          retention_started_at: string
          subject_id: string
          subject_table: string
        }
        SetofOptions: {
          from: "*"
          to: "retention_records"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      execute_identity_disposition: {
        Args: {
          p_actor_id: string
          p_correlation_id: string
          p_request_id: string
        }
        Returns: {
          beneficiary_identity_id: string
          completed_at: string | null
          completed_by: string | null
          correlation_id: string
          created_at: string
          decision_reason: string | null
          eligible_after: string | null
          external_deletion_reference: string | null
          id: string
          legal_hold_reason: string | null
          legal_hold_until: string | null
          method: Database["public"]["Enums"]["identity_disposition_method"]
          organization_id: string
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["identity_disposition_status"]
          subject_user_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "identity_disposition_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_identity_deletion: {
        Args: {
          p_actor_id: string
          p_correlation_id: string
          p_external_deletion_reference: string
          p_request_id: string
        }
        Returns: {
          beneficiary_identity_id: string
          completed_at: string | null
          completed_by: string | null
          correlation_id: string
          created_at: string
          decision_reason: string | null
          eligible_after: string | null
          external_deletion_reference: string | null
          id: string
          legal_hold_reason: string | null
          legal_hold_until: string | null
          method: Database["public"]["Enums"]["identity_disposition_method"]
          organization_id: string
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["identity_disposition_status"]
          subject_user_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "identity_disposition_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_or_create_merchant_metrics: {
        Args: never
        Returns: {
          merchant_id: string
          total_sales: number
          updated_at: string
          vouchers_processed: number
        }
        SetofOptions: {
          from: "*"
          to: "merchant_metrics"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_lgu: { Args: { user_id: string }; Returns: boolean }
      issue_wallet_proof_challenge: {
        Args: {
          p_address: string
          p_challenge_digest: string
          p_expires_at: string
          p_owner_id: string
          p_owner_type: Database["public"]["Enums"]["wallet_owner_type"]
          p_purpose: Database["public"]["Enums"]["wallet_purpose"]
          p_wallet_id: string
        }
        Returns: {
          address: string
          created_at: string
          id: string
          is_active: boolean
          network: Database["public"]["Enums"]["wallet_network"]
          owner_id: string
          owner_type: Database["public"]["Enums"]["wallet_owner_type"]
          proof_challenge_digest: string | null
          proof_challenge_expires_at: string | null
          proof_challenge_issued_at: string | null
          proof_signature_digest: string | null
          purpose: Database["public"]["Enums"]["wallet_purpose"]
          superseded_at: string | null
          superseded_by: string | null
          superseded_by_wallet_id: string | null
          updated_at: string
          verification_status: Database["public"]["Enums"]["wallet_verification_status"]
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "wallets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_beneficiary_identity_reverification: {
        Args: {
          p_beneficiary_identity_id: string
          p_correlation_id: string
          p_evidence_digest: string
          p_expires_at: string
          p_organization_id: string
          p_verification_method: string
          p_verified_by: string
        }
        Returns: {
          beneficiary_identity_id: string
          correlation_id: string
          created_at: string
          evidence_digest: string
          expires_at: string
          id: string
          organization_id: string
          verification_method: string
          verified_at: string
          verified_by: string
        }
        SetofOptions: {
          from: "*"
          to: "beneficiary_identity_reverifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_demo_merchant_redemption: {
        Args: never
        Returns: {
          merchant_id: string
          total_sales: number
          updated_at: string
          vouchers_processed: number
        }
        SetofOptions: {
          from: "*"
          to: "merchant_metrics"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_reconciliation_issue: {
        Args: {
          p_contract_event_id: string
          p_correlation_id: string
          p_detected_at: string
          p_expected_state: Json
          p_issue_type: Database["public"]["Enums"]["reconciliation_issue_type"]
          p_ledger_transaction_id: string
          p_mismatch_fingerprint: string
          p_network: Database["public"]["Enums"]["wallet_network"]
          p_observed_state: Json
          p_organization_id: string
          p_program_id: string
          p_projection_key: Json
          p_projection_table: string
          p_reconciliation_run_id: string
          p_severity: Database["public"]["Enums"]["reconciliation_issue_severity"]
          p_subject_identifier: string
          p_subject_type: string
        }
        Returns: string
      }
      replace_program_geography: {
        Args: {
          p_area_ids?: number[]
          p_barangay_ids?: number[]
          p_program_id: string
        }
        Returns: undefined
      }
      replace_retention_policy: {
        Args: {
          p_actor_id: string
          p_correlation_id: string
          p_counsel_reference: string
          p_organization_id: string
          p_record_type: Database["public"]["Enums"]["retention_record_type"]
          p_retention_period: string
          p_review_status: Database["public"]["Enums"]["retention_policy_review_status"]
        }
        Returns: {
          correlation_id: string
          counsel_reference: string | null
          created_at: string
          created_by: string | null
          effective_at: string
          id: string
          organization_id: string
          policy_version: number
          record_type: Database["public"]["Enums"]["retention_record_type"]
          retention_period: string
          review_status: Database["public"]["Enums"]["retention_policy_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          superseded_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "retention_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_identity_disposition: {
        Args: {
          p_actor_id: string
          p_beneficiary_identity_id: string
          p_correlation_id: string
          p_method: Database["public"]["Enums"]["identity_disposition_method"]
          p_organization_id: string
        }
        Returns: {
          beneficiary_identity_id: string
          completed_at: string | null
          completed_by: string | null
          correlation_id: string
          created_at: string
          decision_reason: string | null
          eligible_after: string | null
          external_deletion_reference: string | null
          id: string
          legal_hold_reason: string | null
          legal_hold_until: string | null
          method: Database["public"]["Enums"]["identity_disposition_method"]
          organization_id: string
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["identity_disposition_status"]
          subject_user_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "identity_disposition_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_wallet_rotation: {
        Args: {
          p_beneficiary_identity_id: string
          p_correlation_id: string
          p_current_wallet_id: string
          p_idempotency_key: string
          p_identity_reverification_id: string
          p_organization_id: string
          p_replacement_wallet_id: string
        }
        Returns: {
          approved_at: string | null
          beneficiary_identity_id: string
          confirmed_at: string | null
          correlation_id: string
          created_at: string
          current_wallet_id: string
          failure_code: string | null
          financial_intent_id: string | null
          id: string
          idempotency_key: string
          identity_reverification_id: string
          organization_id: string
          replacement_wallet_id: string
          requested_by: string
          status: Database["public"]["Enums"]["wallet_rotation_status"]
          step_up_verified_at: string
          submitted_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "wallet_rotation_intents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_identity_disposition: {
        Args: {
          p_actor_id: string
          p_approve: boolean
          p_correlation_id: string
          p_reason: string
          p_request_id: string
        }
        Returns: {
          beneficiary_identity_id: string
          completed_at: string | null
          completed_by: string | null
          correlation_id: string
          created_at: string
          decision_reason: string | null
          eligible_after: string | null
          external_deletion_reference: string | null
          id: string
          legal_hold_reason: string | null
          legal_hold_until: string | null
          method: Database["public"]["Enums"]["identity_disposition_method"]
          organization_id: string
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["identity_disposition_status"]
          subject_user_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "identity_disposition_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      schedule_retention_record: {
        Args: {
          p_correlation_id: string
          p_organization_id: string
          p_program_id: string
          p_record_type: Database["public"]["Enums"]["retention_record_type"]
          p_subject_id: string
          p_subject_table: string
        }
        Returns: {
          correlation_id: string
          created_at: string
          disposed_at: string | null
          disposed_by: string | null
          disposition_reference: string | null
          disposition_status: Database["public"]["Enums"]["retention_disposition_status"]
          id: string
          legal_hold_reason: string | null
          legal_hold_until: string | null
          organization_id: string
          policy_id: string
          policy_version: number
          program_id: string
          record_type: Database["public"]["Enums"]["retention_record_type"]
          retain_until: string
          retention_period: string
          retention_started_at: string
          subject_id: string
          subject_table: string
        }
        SetofOptions: {
          from: "*"
          to: "retention_records"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_identity_disposition_hold: {
        Args: {
          p_actor_id: string
          p_correlation_id: string
          p_hold_until: string
          p_reason: string
          p_request_id: string
        }
        Returns: {
          beneficiary_identity_id: string
          completed_at: string | null
          completed_by: string | null
          correlation_id: string
          created_at: string
          decision_reason: string | null
          eligible_after: string | null
          external_deletion_reference: string | null
          id: string
          legal_hold_reason: string | null
          legal_hold_until: string | null
          method: Database["public"]["Enums"]["identity_disposition_method"]
          organization_id: string
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["identity_disposition_status"]
          subject_user_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "identity_disposition_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_retention_legal_hold: {
        Args: {
          p_actor_id: string
          p_correlation_id: string
          p_hold_until: string
          p_reason: string
          p_retention_record_id: string
        }
        Returns: {
          correlation_id: string
          created_at: string
          disposed_at: string | null
          disposed_by: string | null
          disposition_reference: string | null
          disposition_status: Database["public"]["Enums"]["retention_disposition_status"]
          id: string
          legal_hold_reason: string | null
          legal_hold_until: string | null
          organization_id: string
          policy_id: string
          policy_version: number
          program_id: string
          record_type: Database["public"]["Enums"]["retention_record_type"]
          retain_until: string
          retention_period: string
          retention_started_at: string
          subject_id: string
          subject_table: string
        }
        SetofOptions: {
          from: "*"
          to: "retention_records"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_wallet_rotation_intent: {
        Args: {
          p_actor_id: string
          p_failure_code?: string
          p_financial_intent_id?: string
          p_status: Database["public"]["Enums"]["wallet_rotation_status"]
          p_wallet_rotation_intent_id: string
        }
        Returns: {
          approved_at: string | null
          beneficiary_identity_id: string
          confirmed_at: string | null
          correlation_id: string
          created_at: string
          current_wallet_id: string
          failure_code: string | null
          financial_intent_id: string | null
          id: string
          idempotency_key: string
          identity_reverification_id: string
          organization_id: string
          replacement_wallet_id: string
          requested_by: string
          status: Database["public"]["Enums"]["wallet_rotation_status"]
          step_up_verified_at: string
          submitted_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "wallet_rotation_intents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_organization_membership: {
        Args: {
          p_actor_id: string
          p_is_active?: boolean
          p_organization_id: string
          p_role: Database["public"]["Enums"]["organization_membership_role"]
          p_user_id: string
        }
        Returns: {
          granted_at: string
          granted_by: string | null
          id: string
          is_active: boolean
          organization_id: string
          role: Database["public"]["Enums"]["organization_membership_role"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      cashout_request_status:
        | "requested"
        | "processing"
        | "completed"
        | "failed"
      dispute_status: "open" | "under_review" | "resolved" | "rejected"
      distribution_job_status:
        | "draft"
        | "validating"
        | "awaiting_approval"
        | "queued"
        | "submitting"
        | "reconciling"
        | "completed"
        | "partial_failed"
        | "cancelled"
      distribution_recipient_status:
        | "pending"
        | "prepared"
        | "submitted"
        | "confirmed"
        | "failed"
        | "cancelled"
      financial_operation_type:
        | "program_activation"
        | "cash_distribution"
        | "voucher_allocation"
        | "cash_payment"
        | "voucher_redemption"
        | "refund"
        | "wallet_rotation"
        | "fee_sponsorship"
      identity_data_status:
        | "active"
        | "anonymized"
        | "deletion_pending"
        | "deleted"
      identity_disposition_method: "anonymize" | "delete"
      identity_disposition_status:
        | "requested"
        | "reviewing"
        | "approved"
        | "awaiting_external_deletion"
        | "completed"
        | "rejected"
        | "cancelled"
      invoice_kind: "cash" | "voucher"
      invoice_status:
        | "issued"
        | "presented"
        | "authorization_pending"
        | "submitted"
        | "consumed"
        | "expired"
        | "cancelled"
      merchant_accreditation_status:
        | "pending"
        | "active"
        | "suspended"
        | "expired"
        | "revoked"
      organization_membership_role:
        | "organization_administrator"
        | "program_manager"
        | "beneficiary_verifier"
        | "finance_approver"
        | "auditor"
      payment_funding_source: "cash" | "voucher"
      payment_intent_status:
        | "requested"
        | "prepared"
        | "signed"
        | "submitted"
        | "confirmed"
        | "failed"
        | "expired"
      program_aid_type: "cash" | "voucher"
      program_expiry_policy: "none" | "fixed"
      program_funding_status:
        | "unreserved"
        | "reserving"
        | "funded"
        | "failed"
        | "returned"
      program_merchant_status: "authorized" | "revoked"
      program_policy_event_type:
        | "beneficiary_added"
        | "merchant_authorized"
        | "merchant_revoked"
      program_refund_policy:
        | "not_applicable"
        | "return_to_entitlement"
        | "exception_after_expiry"
      reconciliation_alert_state:
        | "pending"
        | "sent"
        | "acknowledged"
        | "resolved"
        | "suppressed"
      reconciliation_issue_severity: "warning" | "critical"
      reconciliation_issue_status:
        | "open"
        | "investigating"
        | "resolved"
        | "dismissed"
      reconciliation_issue_type:
        | "transaction_missing"
        | "transaction_mismatch"
        | "contract_event_missing"
        | "contract_event_mismatch"
        | "balance_mismatch"
        | "projection_mismatch"
        | "cursor_gap"
      reconciliation_quarantine_state: "quarantined" | "released"
      reconciliation_run_status: "running" | "completed" | "partial" | "failed"
      redemption_status: "submitted" | "confirmed" | "failed"
      refund_status:
        | "requested"
        | "approved"
        | "signed"
        | "submitted"
        | "confirmed"
        | "failed"
        | "exception_required"
      retention_disposition_status: "retained" | "eligible" | "disposed"
      retention_policy_review_status:
        | "provisional"
        | "pending_counsel"
        | "approved"
        | "rejected"
      retention_record_type:
        | "financial_approval"
        | "receipt"
        | "dispute"
        | "audit_evidence"
      sensitive_financial_action:
        | "program_activation"
        | "disbursement_authorization"
        | "wallet_rotation"
        | "merchant_wallet_change"
        | "refund"
        | "emergency_control"
        | "cash_out"
      settlement_kind: "cash_payment" | "voucher_redemption"
      settlement_status: "pending" | "confirmed" | "failed"
      transaction_attempt_status:
        | "accepted"
        | "submitted"
        | "observed_success"
        | "observed_failure"
        | "unknown"
      wallet_network: "stellar_testnet"
      wallet_owner_type:
        | "user"
        | "beneficiary_identity"
        | "organization"
        | "merchant_entity"
        | "platform"
      wallet_purpose:
        | "beneficiary"
        | "merchant_settlement"
        | "organization_treasury"
        | "cash_program_treasury"
        | "issuer"
        | "distribution"
        | "fee_sponsor"
        | "contract_deployer"
      wallet_rotation_status:
        | "proof_verified"
        | "approved"
        | "submitted"
        | "confirmed"
        | "rejected"
        | "expired"
        | "failed"
      wallet_verification_status:
        | "pending"
        | "challenge_issued"
        | "verified"
        | "rejected"
        | "expired"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      cashout_request_status: [
        "requested",
        "processing",
        "completed",
        "failed",
      ],
      dispute_status: ["open", "under_review", "resolved", "rejected"],
      distribution_job_status: [
        "draft",
        "validating",
        "awaiting_approval",
        "queued",
        "submitting",
        "reconciling",
        "completed",
        "partial_failed",
        "cancelled",
      ],
      distribution_recipient_status: [
        "pending",
        "prepared",
        "submitted",
        "confirmed",
        "failed",
        "cancelled",
      ],
      financial_operation_type: [
        "program_activation",
        "cash_distribution",
        "voucher_allocation",
        "cash_payment",
        "voucher_redemption",
        "refund",
        "wallet_rotation",
        "fee_sponsorship",
      ],
      identity_data_status: [
        "active",
        "anonymized",
        "deletion_pending",
        "deleted",
      ],
      identity_disposition_method: ["anonymize", "delete"],
      identity_disposition_status: [
        "requested",
        "reviewing",
        "approved",
        "awaiting_external_deletion",
        "completed",
        "rejected",
        "cancelled",
      ],
      invoice_kind: ["cash", "voucher"],
      invoice_status: [
        "issued",
        "presented",
        "authorization_pending",
        "submitted",
        "consumed",
        "expired",
        "cancelled",
      ],
      merchant_accreditation_status: [
        "pending",
        "active",
        "suspended",
        "expired",
        "revoked",
      ],
      organization_membership_role: [
        "organization_administrator",
        "program_manager",
        "beneficiary_verifier",
        "finance_approver",
        "auditor",
      ],
      payment_funding_source: ["cash", "voucher"],
      payment_intent_status: [
        "requested",
        "prepared",
        "signed",
        "submitted",
        "confirmed",
        "failed",
        "expired",
      ],
      program_aid_type: ["cash", "voucher"],
      program_expiry_policy: ["none", "fixed"],
      program_funding_status: [
        "unreserved",
        "reserving",
        "funded",
        "failed",
        "returned",
      ],
      program_merchant_status: ["authorized", "revoked"],
      program_policy_event_type: [
        "beneficiary_added",
        "merchant_authorized",
        "merchant_revoked",
      ],
      program_refund_policy: [
        "not_applicable",
        "return_to_entitlement",
        "exception_after_expiry",
      ],
      reconciliation_alert_state: [
        "pending",
        "sent",
        "acknowledged",
        "resolved",
        "suppressed",
      ],
      reconciliation_issue_severity: ["warning", "critical"],
      reconciliation_issue_status: [
        "open",
        "investigating",
        "resolved",
        "dismissed",
      ],
      reconciliation_issue_type: [
        "transaction_missing",
        "transaction_mismatch",
        "contract_event_missing",
        "contract_event_mismatch",
        "balance_mismatch",
        "projection_mismatch",
        "cursor_gap",
      ],
      reconciliation_quarantine_state: ["quarantined", "released"],
      reconciliation_run_status: ["running", "completed", "partial", "failed"],
      redemption_status: ["submitted", "confirmed", "failed"],
      refund_status: [
        "requested",
        "approved",
        "signed",
        "submitted",
        "confirmed",
        "failed",
        "exception_required",
      ],
      retention_disposition_status: ["retained", "eligible", "disposed"],
      retention_policy_review_status: [
        "provisional",
        "pending_counsel",
        "approved",
        "rejected",
      ],
      retention_record_type: [
        "financial_approval",
        "receipt",
        "dispute",
        "audit_evidence",
      ],
      sensitive_financial_action: [
        "program_activation",
        "disbursement_authorization",
        "wallet_rotation",
        "merchant_wallet_change",
        "refund",
        "emergency_control",
        "cash_out",
      ],
      settlement_kind: ["cash_payment", "voucher_redemption"],
      settlement_status: ["pending", "confirmed", "failed"],
      transaction_attempt_status: [
        "accepted",
        "submitted",
        "observed_success",
        "observed_failure",
        "unknown",
      ],
      wallet_network: ["stellar_testnet"],
      wallet_owner_type: [
        "user",
        "beneficiary_identity",
        "organization",
        "merchant_entity",
        "platform",
      ],
      wallet_purpose: [
        "beneficiary",
        "merchant_settlement",
        "organization_treasury",
        "cash_program_treasury",
        "issuer",
        "distribution",
        "fee_sponsor",
        "contract_deployer",
      ],
      wallet_rotation_status: [
        "proof_verified",
        "approved",
        "submitted",
        "confirmed",
        "rejected",
        "expired",
        "failed",
      ],
      wallet_verification_status: [
        "pending",
        "challenge_issued",
        "verified",
        "rejected",
        "expired",
      ],
    },
  },
} as const

