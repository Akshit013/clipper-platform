// ============================================================
// Database type definitions matching the Supabase schema
// ============================================================

export type UserRole = 'clipper' | 'admin';
export type ClipStatus = 'pending' | 'reviewing' | 'approved' | 'rejected';
export type PayoutStatus = 'pending' | 'approved' | 'paid' | 'rejected';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          role: UserRole;
          display_name: string | null;
          instagram_handle: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role?: UserRole;
          display_name?: string | null;
          instagram_handle?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: UserRole;
          display_name?: string | null;
          instagram_handle?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          rate_per_1000: number;
          start_date: string;
          end_date: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          rate_per_1000: number;
          start_date: string;
          end_date: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          rate_per_1000?: number;
          start_date?: string;
          end_date?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      clips: {
        Row: {
          id: string;
          user_id: string;
          campaign_id: string;
          instagram_url: string;
          shortcode: string;
          status: ClipStatus;
          submitted_at: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          campaign_id: string;
          instagram_url: string;
          shortcode: string;
          status?: ClipStatus;
          submitted_at?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          campaign_id?: string;
          instagram_url?: string;
          shortcode?: string;
          status?: ClipStatus;
          submitted_at?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
        };
        Relationships: [];
      };
      metric_snapshots: {
        Row: {
          id: string;
          clip_id: string;
          observed_views: number | null;
          eligible_views: number | null;
          source: string;
          fetched_at: string;
        };
        Insert: {
          id?: string;
          clip_id: string;
          observed_views?: number | null;
          eligible_views?: number | null;
          source?: string;
          fetched_at?: string;
        };
        Update: {
          id?: string;
          clip_id?: string;
          observed_views?: number | null;
          eligible_views?: number | null;
          source?: string;
          fetched_at?: string;
        };
        Relationships: [];
      };
      earnings: {
        Row: {
          id: string;
          clip_id: string;
          user_id: string;
          campaign_id: string;
          eligible_views: number;
          rate_per_1000: number;
          amount: number;
          calculated_at: string;
        };
        Insert: {
          id?: string;
          clip_id: string;
          user_id: string;
          campaign_id: string;
          eligible_views?: number;
          rate_per_1000: number;
          amount?: number;
          calculated_at?: string;
        };
        Update: {
          id?: string;
          clip_id?: string;
          user_id?: string;
          campaign_id?: string;
          eligible_views?: number;
          rate_per_1000?: number;
          amount?: number;
          calculated_at?: string;
        };
        Relationships: [];
      };
      payout_requests: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          status: PayoutStatus;
          payment_reference: string | null;
          requested_at: string;
          processed_at: string | null;
          processed_by: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          status?: PayoutStatus;
          payment_reference?: string | null;
          requested_at?: string;
          processed_at?: string | null;
          processed_by?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          amount?: number;
          status?: PayoutStatus;
          payment_reference?: string | null;
          requested_at?: string;
          processed_at?: string | null;
          processed_by?: string | null;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          admin_id: string;
          action: string;
          target_table: string;
          target_id: string | null;
          old_values: Json | null;
          new_values: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id: string;
          action: string;
          target_table: string;
          target_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string;
          action?: string;
          target_table?: string;
          target_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      get_available_balance: {
        Args: { p_user_id: string };
        Returns: number;
      };
      approve_clip_with_earnings: {
        Args: {
          p_clip_id: string;
          p_eligible_views: number;
          p_admin_id: string;
        };
        Returns: Json;
      };
      reject_clip: {
        Args: {
          p_clip_id: string;
          p_admin_id: string;
        };
        Returns: undefined;
      };
      request_payout: {
        Args: {
          p_user_id: string;
          p_amount: number;
        };
        Returns: string;
      };
      process_payout: {
        Args: {
          p_request_id: string;
          p_admin_id: string;
          p_new_status: string;
          p_payment_reference?: string | null;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// ============================================================
// Convenience types
// ============================================================
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Campaign = Database['public']['Tables']['campaigns']['Row'];
export type Clip = Database['public']['Tables']['clips']['Row'];
export type MetricSnapshot = Database['public']['Tables']['metric_snapshots']['Row'];
export type Earning = Database['public']['Tables']['earnings']['Row'];
export type PayoutRequest = Database['public']['Tables']['payout_requests']['Row'];
export type AuditLog = Database['public']['Tables']['audit_logs']['Row'];

// Extended types with joins
export type ClipWithCampaign = Clip & {
  campaigns: Campaign;
};

export type ClipWithDetails = Clip & {
  campaigns?: Campaign | null;
  earnings?: Earning | null;
  metric_snapshots?: MetricSnapshot[];
  profiles?: Pick<Profile, 'display_name' | 'instagram_handle'> | null;
};

export type PayoutRequestWithProfile = PayoutRequest & {
  profiles?: Pick<Profile, 'display_name' | 'instagram_handle'> | null;
};

export type AuditLogWithAdmin = AuditLog & {
  profiles?: Pick<Profile, 'display_name'> | null;
};

// Dashboard stat types
export interface ClipperStats {
  totalClips: number;
  observedViews: number;
  eligibleViews: number;
  approvedEarnings: number;
  pendingPayouts: number;
  availableBalance: number;
}

export interface AdminStats {
  totalClips: number;
  pendingClips: number;
  totalViews: number;
  totalEarnings: number;
  pendingPayouts: number;
  activeCampaigns: number;
}
