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
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          organization_id: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          organization_id: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          organization_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "my_org_permissions"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_email: string | null
          actor_id: string | null
          created_at: string
          id: number
          ip_address: unknown
          metadata: Json
          organization_id: string
          resource_id: string | null
          resource_name: string | null
          resource_type: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: number
          ip_address?: unknown
          metadata?: Json
          organization_id: string
          resource_id?: string | null
          resource_name?: string | null
          resource_type?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: number
          ip_address?: unknown
          metadata?: Json
          organization_id?: string
          resource_id?: string | null
          resource_name?: string | null
          resource_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "my_org_permissions"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clusters: {
        Row: {
          aws_role_arn: string | null
          cloud_provider: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          k8s_version: string | null
          kubeconfig_encrypted: string | null
          labels: Json
          last_scan_at: string | null
          last_scan_critical: number | null
          last_scan_high: number | null
          last_scan_score: number | null
          name: string
          node_count: number | null
          organization_id: string
          region: string | null
          status: Database["public"]["Enums"]["cluster_status"]
          updated_at: string
        }
        Insert: {
          aws_role_arn?: string | null
          cloud_provider?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          k8s_version?: string | null
          kubeconfig_encrypted?: string | null
          labels?: Json
          last_scan_at?: string | null
          last_scan_critical?: number | null
          last_scan_high?: number | null
          last_scan_score?: number | null
          name: string
          node_count?: number | null
          organization_id: string
          region?: string | null
          status?: Database["public"]["Enums"]["cluster_status"]
          updated_at?: string
        }
        Update: {
          aws_role_arn?: string | null
          cloud_provider?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          k8s_version?: string | null
          kubeconfig_encrypted?: string | null
          labels?: Json
          last_scan_at?: string | null
          last_scan_critical?: number | null
          last_scan_high?: number | null
          last_scan_score?: number | null
          name?: string
          node_count?: number | null
          organization_id?: string
          region?: string | null
          status?: Database["public"]["Enums"]["cluster_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clusters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "my_org_permissions"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "clusters_organization_id_fkey"
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
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "my_org_permissions"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          id: string
          invited_by: string | null
          joined_at: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "my_org_permissions"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          max_clusters: number
          max_members: number
          name: string
          plan: Database["public"]["Enums"]["org_plan"]
          slug: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          max_clusters?: number
          max_members?: number
          name: string
          plan?: Database["public"]["Enums"]["org_plan"]
          slug: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          max_clusters?: number
          max_members?: number
          name?: string
          plan?: Database["public"]["Enums"]["org_plan"]
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      scan_results: {
        Row: {
          cluster_id: string
          critical_count: number
          duration_ms: number | null
          findings: Json
          graph_data: Json | null
          high_count: number
          id: string
          low_count: number
          medium_count: number
          organization_id: string
          scanned_at: string
          security_score: number
          triggered_by: string | null
        }
        Insert: {
          cluster_id: string
          critical_count?: number
          duration_ms?: number | null
          findings?: Json
          graph_data?: Json | null
          high_count?: number
          id?: string
          low_count?: number
          medium_count?: number
          organization_id: string
          scanned_at?: string
          security_score?: number
          triggered_by?: string | null
        }
        Update: {
          cluster_id?: string
          critical_count?: number
          duration_ms?: number | null
          findings?: Json
          graph_data?: Json | null
          high_count?: number
          id?: string
          low_count?: number
          medium_count?: number
          organization_id?: string
          scanned_at?: string
          security_score?: number
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_results_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_results_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "my_org_permissions"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "scan_results_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      my_org_permissions: {
        Row: {
          can_add_cluster: boolean | null
          can_delete_cluster: boolean | null
          can_manage_api_keys: boolean | null
          can_manage_members: boolean | null
          can_trigger_scan: boolean | null
          can_view_findings: boolean | null
          joined_at: string | null
          organization_id: string | null
          organization_name: string | null
          plan: Database["public"]["Enums"]["org_plan"] | null
          role: Database["public"]["Enums"]["org_role"] | null
          slug: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_my_org_ids: { Args: never; Returns: string[] }
      get_my_role: {
        Args: { p_org_id: string }
        Returns: Database["public"]["Enums"]["org_role"]
      }
      has_org_role: {
        Args: {
          p_min_role: Database["public"]["Enums"]["org_role"]
          p_org_id: string
        }
        Returns: boolean
      }
      submit_scan:
        | {
            Args: {
              p_api_key: string
              p_cluster_name: string
              p_critical_count?: number
              p_duration_ms?: number
              p_findings?: Json
              p_graph_data: Json
              p_high_count?: number
              p_low_count?: number
              p_medium_count?: number
              p_security_score?: number
            }
            Returns: string
          }
        | {
            Args: {
              p_api_key: string
              p_cluster_name: string
              p_critical_count?: number
              p_duration_ms?: number
              p_findings?: Json
              p_graph_data: Json
              p_high_count?: number
              p_k8s_version?: string
              p_low_count?: number
              p_medium_count?: number
              p_node_count?: number
              p_region?: string
              p_security_score?: number
            }
            Returns: string
          }
    }
    Enums: {
      audit_action:
        | "cluster.created"
        | "cluster.updated"
        | "cluster.deleted"
        | "cluster.scanned"
        | "member.invited"
        | "member.joined"
        | "member.role_changed"
        | "member.removed"
        | "org.created"
        | "org.updated"
        | "api_key.created"
        | "api_key.revoked"
      cluster_status: "active" | "paused" | "error" | "pending"
      org_plan: "free" | "pro" | "enterprise"
      org_role: "admin" | "developer" | "readonly"
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
  public: {
    Enums: {
      audit_action: [
        "cluster.created",
        "cluster.updated",
        "cluster.deleted",
        "cluster.scanned",
        "member.invited",
        "member.joined",
        "member.role_changed",
        "member.removed",
        "org.created",
        "org.updated",
        "api_key.created",
        "api_key.revoked",
      ],
      cluster_status: ["active", "paused", "error", "pending"],
      org_plan: ["free", "pro", "enterprise"],
      org_role: ["admin", "developer", "readonly"],
    },
  },
} as const

export type Cluster          = Tables<"clusters">
export type ScanResult       = Tables<"scan_results">
export type Organization     = Tables<"organizations">
export type OrgMember        = Tables<"organization_members">
export type ApiKey           = Tables<"api_keys">
export type AuditLog         = Tables<"audit_logs">
export type Invitation       = Tables<"invitations">
export type UserProfile      = Tables<"user_profiles">
export type OrgPermissions   = Database["public"]["Views"]["my_org_permissions"]["Row"]
