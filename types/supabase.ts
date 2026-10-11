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
      users: {
        Row: {
          id: string;
          wallet_address: string;
          display_name: string;
          created_at: string;
          updated_at: string;
          last_login_at: string;
        };
        Insert: {
          id?: string;
          wallet_address: string;
          display_name: string;
          created_at?: string;
          updated_at?: string;
          last_login_at?: string;
        };
        Update: {
          id?: string;
          wallet_address?: string;
          display_name?: string;
          created_at?: string;
          updated_at?: string;
          last_login_at?: string;
        };
      };
      agreements: {
        Row: {
          id: string;
          client_wallet: string;
          freelancer_wallet: string;
          title: string;
          status: string;
          total_stroops: string;
          escrowed_stroops?: string;
          released_stroops?: string;
          refunded_stroops?: string;
          milestone_count?: number;
          funded_at: string | null;
          closed_at: string | null;
          created_at: string;
          updated_at: string;
          create_tx_hash: string | null;
          fund_tx_hash: string | null;
          funding_tx?: string | null;
        };
        Insert: {
          id: string;
          client_wallet: string;
          freelancer_wallet: string;
          title: string;
          status?: string;
          total_stroops?: string | number;
          escrowed_stroops?: string | number;
          released_stroops?: string | number;
          refunded_stroops?: string | number;
          milestone_count?: number;
          funded_at?: string | null;
          closed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          create_tx_hash?: string | null;
          fund_tx_hash?: string | null;
          funding_tx?: string | null;
        };
        Update: {
          id?: string;
          client_wallet?: string;
          freelancer_wallet?: string;
          title?: string;
          status?: string;
          total_stroops?: string | number;
          escrowed_stroops?: string | number;
          released_stroops?: string | number;
          refunded_stroops?: string | number;
          milestone_count?: number;
          funded_at?: string | null;
          closed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          create_tx_hash?: string | null;
          fund_tx_hash?: string | null;
          funding_tx?: string | null;
        };
      };
      milestones: {
        Row: {
          id: string;
          agreement_id: string;
          idx: number;
          amount_stroops: string;
          description: string;
          due_at: string | null;
          status: string;
          evidence: string | null;
          submit_tx_hash: string | null;
          release_tx_hash: string | null;
          created_at: string;
          updated_at: string;
          tx_hash?: string | null;
        };
        Insert: {
          id: string;
          agreement_id: string;
          idx: number;
          amount_stroops: string | number;
          description: string;
          due_at?: string | null;
          status?: string;
          evidence?: string | null;
          submit_tx_hash?: string | null;
          release_tx_hash?: string | null;
          created_at?: string;
          updated_at?: string;
          tx_hash?: string | null;
        };
        Update: {
          id?: string;
          agreement_id?: string;
          idx?: number;
          amount_stroops?: string | number;
          description?: string;
          due_at?: string | null;
          status?: string;
          evidence?: string | null;
          submit_tx_hash?: string | null;
          release_tx_hash?: string | null;
          created_at?: string;
          updated_at?: string;
          tx_hash?: string | null;
        };
      };
      revoked_tokens: {
        Row: {
          jti: string;
          wallet_address: string;
          expires_at: string;
          revoked_at: string;
        };
        Insert: {
          jti: string;
          wallet_address: string;
          expires_at: string;
          revoked_at?: string;
        };
        Update: {
          jti?: string;
          wallet_address?: string;
          expires_at?: string;
          revoked_at?: string;
        };
      };
      revoked_wallets: {
        Row: {
          wallet_address: string;
          revoked_before: string;
          expires_at: string;
        };
        Insert: {
          wallet_address: string;
          revoked_before: string;
          expires_at: string;
        };
        Update: {
          wallet_address?: string;
          revoked_before?: string;
          expires_at?: string;
        };
      };
      auth_nonces: {
        Row: {
          nonce: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          nonce: string;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          nonce?: string;
          expires_at?: string;
          created_at?: string;
        };
      };
      auth_rate_limits: {
        Row: {
          key: string;
          hits: number;
          reset_at: string;
        };
        Insert: {
          key: string;
          hits: number;
          reset_at: string;
        };
        Update: {
          key?: string;
          hits?: number;
          reset_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      belay_token_revoked: {
        Args: {
          p_jti: string;
          p_wallet_address: string;
          p_issued_at: number;
        };
        Returns: boolean;
      };
      belay_wallet: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      belay_revoke_token: {
        Args: {
          p_jti: string;
          p_wallet_address: string;
          p_expires_at: string;
        };
        Returns: undefined;
      };
      belay_revoke_wallet: {
        Args: { p_wallet_address: string };
        Returns: number;
      };
      belay_purge_revoked_tokens: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      resolve_user_profile: {
        Args: { p_wallet_address: string };
        Returns: { wallet_address: string; display_name: string }[];
      };
      auth_consume_nonce: {
        Args: { p_nonce: string; p_expires_at: string };
        Returns: boolean;
      };
      auth_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_ms: number };
        Returns: { allowed: boolean; retry_after: number }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
