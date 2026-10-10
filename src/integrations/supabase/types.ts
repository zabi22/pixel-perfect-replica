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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      projects: {
        Row: {
          authorised_at: string
          base_url: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          authorised_at: string
          base_url: string
          created_at?: string
          id?: string
          name: string
          user_id?: string
        }
        Update: {
          authorised_at?: string
          base_url?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      run_events: {
        Row: {
          created_at: string
          data: Json | null
          id: number
          kind: string
          message: string
          run_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: never
          kind: string
          message: string
          run_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: never
          kind?: string
          message?: string
          run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          analysis: Json | null
          attempts: number
          cancel_requested: boolean
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          instruction: string
          lease_until: string | null
          parent_run_id: string | null
          plan: Json
          project_id: string
          provider: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["run_status"]
          target_url: string
          test_id: string
          user_id: string
        }
        Insert: {
          analysis?: Json | null
          attempts?: number
          cancel_requested?: boolean
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key: string
          instruction?: string
          lease_until?: string | null
          parent_run_id?: string | null
          plan: Json
          project_id: string
          provider?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          target_url: string
          test_id: string
          user_id?: string
        }
        Update: {
          analysis?: Json | null
          attempts?: number
          cancel_requested?: boolean
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          instruction?: string
          lease_until?: string | null
          parent_run_id?: string | null
          plan?: Json
          project_id?: string
          provider?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          target_url?: string
          test_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      step_results: {
        Row: {
          console_errors: Json
          duration_ms: number | null
          error_code: string | null
          expected: string | null
          finished_at: string | null
          id: string
          network_errors: Json
          observed: string | null
          page_observation: Json | null
          position: number
          run_id: string
          screenshot_path: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["step_status"]
          step: Json
          url_after: string | null
          user_id: string
        }
        Insert: {
          console_errors?: Json
          duration_ms?: number | null
          error_code?: string | null
          expected?: string | null
          finished_at?: string | null
          id?: string
          network_errors?: Json
          observed?: string | null
          page_observation?: Json | null
          position: number
          run_id: string
          screenshot_path?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["step_status"]
          step: Json
          url_after?: string | null
          user_id: string
        }
        Update: {
          console_errors?: Json
          duration_ms?: number | null
          error_code?: string | null
          expected?: string | null
          finished_at?: string | null
          id?: string
          network_errors?: Json
          observed?: string | null
          page_observation?: Json | null
          position?: number
          run_id?: string
          screenshot_path?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["step_status"]
          step?: Json
          url_after?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "step_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      test_steps: {
        Row: {
          id: string
          position: number
          step: Json
          test_id: string
          user_id: string
        }
        Insert: {
          id?: string
          position: number
          step: Json
          test_id: string
          user_id?: string
        }
        Update: {
          id?: string
          position?: number
          step?: Json
          test_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_steps_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      tests: {
        Row: {
          created_at: string
          id: string
          instruction: string
          name: string
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instruction?: string
          name: string
          project_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          instruction?: string
          name?: string
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_next_run: {
        Args: { _lease_seconds?: number }
        Returns: {
          analysis: Json | null
          attempts: number
          cancel_requested: boolean
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          instruction: string
          lease_until: string | null
          parent_run_id: string | null
          plan: Json
          project_id: string
          provider: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["run_status"]
          target_url: string
          test_id: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_run: {
        Args: { _lease_seconds?: number; _run_id: string }
        Returns: {
          analysis: Json | null
          attempts: number
          cancel_requested: boolean
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          instruction: string
          lease_until: string | null
          parent_run_id: string | null
          plan: Json
          project_id: string
          provider: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["run_status"]
          target_url: string
          test_id: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      sweep_stale_runs: { Args: never; Returns: number }
    }
    Enums: {
      run_status:
        | "queued"
        | "running"
        | "passed"
        | "failed"
        | "inconclusive"
        | "cancelled"
        | "infra_error"
      step_status:
        | "pending"
        | "running"
        | "passed"
        | "failed"
        | "skipped"
        | "inconclusive"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      run_status: [
        "queued",
        "running",
        "passed",
        "failed",
        "inconclusive",
        "cancelled",
        "infra_error",
      ],
      step_status: [
        "pending",
        "running",
        "passed",
        "failed",
        "skipped",
        "inconclusive",
      ],
    },
  },
} as const
