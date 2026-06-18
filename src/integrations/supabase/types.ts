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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_activity_logs: {
        Row: {
          action_type: string
          admin_email: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          target_user_email: string | null
          target_user_id: string | null
        }
        Insert: {
          action_type: string
          admin_email: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_user_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          action_type?: string
          admin_email?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_user_email?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      ai_signals: {
        Row: {
          asset: string
          close_price: number | null
          closed_at: string | null
          confidence: number | null
          created_at: string
          entry: number | null
          id: string
          market_session: string | null
          result_pips: number | null
          signal: string
          sl: number | null
          sl_pips: number | null
          status: string
          tp: number | null
          tp_pips: number | null
        }
        Insert: {
          asset: string
          close_price?: number | null
          closed_at?: string | null
          confidence?: number | null
          created_at?: string
          entry?: number | null
          id?: string
          market_session?: string | null
          result_pips?: number | null
          signal: string
          sl?: number | null
          sl_pips?: number | null
          status?: string
          tp?: number | null
          tp_pips?: number | null
        }
        Update: {
          asset?: string
          close_price?: number | null
          closed_at?: string | null
          confidence?: number | null
          created_at?: string
          entry?: number | null
          id?: string
          market_session?: string | null
          result_pips?: number | null
          signal?: string
          sl?: number | null
          sl_pips?: number | null
          status?: string
          tp?: number | null
          tp_pips?: number | null
        }
        Relationships: []
      }
      bot_logs: {
        Row: {
          bot_id: string
          created_at: string
          id: string
          level: string
          message: string
          user_id: string
        }
        Insert: {
          bot_id: string
          created_at?: string
          id?: string
          level?: string
          message: string
          user_id: string
        }
        Update: {
          bot_id?: string
          created_at?: string
          id?: string
          level?: string
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_logs_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_notifications: {
        Row: {
          bot_id: string | null
          created_at: string
          id: string
          message: string
          pnl: number | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          bot_id?: string | null
          created_at?: string
          id?: string
          message: string
          pnl?: number | null
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          bot_id?: string | null
          created_at?: string
          id?: string
          message?: string
          pnl?: number | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_notifications_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_trades: {
        Row: {
          amount: number
          bot_id: string
          close_reason: Database["public"]["Enums"]["trade_close_reason"] | null
          closed_at: string | null
          direction: Database["public"]["Enums"]["trade_direction"]
          entry_price: number
          exit_price: number | null
          id: string
          opened_at: string
          pnl: number | null
          pnl_pct: number | null
          result: Database["public"]["Enums"]["trade_result"] | null
          sl_price: number
          status: Database["public"]["Enums"]["trade_status"]
          symbol: string
          tp_price: number
          user_id: string
        }
        Insert: {
          amount: number
          bot_id: string
          close_reason?:
            | Database["public"]["Enums"]["trade_close_reason"]
            | null
          closed_at?: string | null
          direction: Database["public"]["Enums"]["trade_direction"]
          entry_price: number
          exit_price?: number | null
          id?: string
          opened_at?: string
          pnl?: number | null
          pnl_pct?: number | null
          result?: Database["public"]["Enums"]["trade_result"] | null
          sl_price: number
          status?: Database["public"]["Enums"]["trade_status"]
          symbol: string
          tp_price: number
          user_id: string
        }
        Update: {
          amount?: number
          bot_id?: string
          close_reason?:
            | Database["public"]["Enums"]["trade_close_reason"]
            | null
          closed_at?: string | null
          direction?: Database["public"]["Enums"]["trade_direction"]
          entry_price?: number
          exit_price?: number | null
          id?: string
          opened_at?: string
          pnl?: number | null
          pnl_pct?: number | null
          result?: Database["public"]["Enums"]["trade_result"] | null
          sl_price?: number
          status?: Database["public"]["Enums"]["trade_status"]
          symbol?: string
          tp_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_trades_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bots: {
        Row: {
          amount: number
          asset_class: string
          auto_paused: boolean
          consecutive_losses: number
          created_at: string
          id: string
          last_scan_at: string | null
          name: string
          pause_reason: string | null
          pause_reason_at: string | null
          sl_pct: number
          status: Database["public"]["Enums"]["bot_status"]
          strategy: Database["public"]["Enums"]["bot_strategy"]
          symbol: string
          timeframe: string
          total_pnl: number
          tp_pct: number
          trades_count: number
          updated_at: string
          user_id: string
          wins_count: number
        }
        Insert: {
          amount?: number
          asset_class: string
          auto_paused?: boolean
          consecutive_losses?: number
          created_at?: string
          id?: string
          last_scan_at?: string | null
          name: string
          pause_reason?: string | null
          pause_reason_at?: string | null
          sl_pct?: number
          status?: Database["public"]["Enums"]["bot_status"]
          strategy?: Database["public"]["Enums"]["bot_strategy"]
          symbol: string
          timeframe?: string
          total_pnl?: number
          tp_pct?: number
          trades_count?: number
          updated_at?: string
          user_id: string
          wins_count?: number
        }
        Update: {
          amount?: number
          asset_class?: string
          auto_paused?: boolean
          consecutive_losses?: number
          created_at?: string
          id?: string
          last_scan_at?: string | null
          name?: string
          pause_reason?: string | null
          pause_reason_at?: string | null
          sl_pct?: number
          status?: Database["public"]["Enums"]["bot_status"]
          strategy?: Database["public"]["Enums"]["bot_strategy"]
          symbol?: string
          timeframe?: string
          total_pnl?: number
          tp_pct?: number
          trades_count?: number
          updated_at?: string
          user_id?: string
          wins_count?: number
        }
        Relationships: []
      }
      cigarettes: {
        Row: {
          alert_level: number
          box_price: number
          boxes: number
          created_at: string
          extra_packs: number
          id: string
          month_key: string
          name: string
          pack_price: number
          packs_per_box: number
          unit_type: string
          user_id: string
        }
        Insert: {
          alert_level?: number
          box_price?: number
          boxes?: number
          created_at?: string
          extra_packs?: number
          id?: string
          month_key: string
          name: string
          pack_price?: number
          packs_per_box?: number
          unit_type?: string
          user_id: string
        }
        Update: {
          alert_level?: number
          box_price?: number
          boxes?: number
          created_at?: string
          extra_packs?: number
          id?: string
          month_key?: string
          name?: string
          pack_price?: number
          packs_per_box?: number
          unit_type?: string
          user_id?: string
        }
        Relationships: []
      }
      demo_accounts: {
        Row: {
          balance: number
          created_at: string
          realized_pnl: number
          starting_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          realized_pnl?: number
          starting_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          realized_pnl?: number
          starting_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      economic_events: {
        Row: {
          created_at: string
          currency: string | null
          event_time: string | null
          ext_key: string | null
          forecast: string | null
          id: string
          impact: string | null
          previous: string | null
          title: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          event_time?: string | null
          ext_key?: string | null
          forecast?: string | null
          id?: string
          impact?: string | null
          previous?: string | null
          title: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          event_time?: string | null
          ext_key?: string | null
          forecast?: string | null
          id?: string
          impact?: string | null
          previous?: string | null
          title?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          created_at: string
          day: number
          description: string
          expense_type: string
          id: string
          month_key: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          day: number
          description: string
          expense_type?: string
          id?: string
          month_key: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          day?: number
          description?: string
          expense_type?: string
          id?: string
          month_key?: string
          user_id?: string
        }
        Relationships: []
      }
      incomes: {
        Row: {
          card: number
          cash: number
          created_at: string
          day: number
          id: string
          month_key: string
          note: string | null
          user_id: string
        }
        Insert: {
          card?: number
          cash?: number
          created_at?: string
          day: number
          id?: string
          month_key: string
          note?: string | null
          user_id: string
        }
        Update: {
          card?: number
          cash?: number
          created_at?: string
          day?: number
          id?: string
          month_key?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      market_alert_state: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      market_news: {
        Row: {
          assets: string[] | null
          bias: string | null
          created_at: string
          hash: string | null
          id: string
          impact: string | null
          published_at: string | null
          source: string | null
          summary: string | null
          title: string
          title_ku: string | null
          url: string | null
        }
        Insert: {
          assets?: string[] | null
          bias?: string | null
          created_at?: string
          hash?: string | null
          id?: string
          impact?: string | null
          published_at?: string | null
          source?: string | null
          summary?: string | null
          title: string
          title_ku?: string | null
          url?: string | null
        }
        Update: {
          assets?: string[] | null
          bias?: string | null
          created_at?: string
          hash?: string | null
          id?: string
          impact?: string | null
          published_at?: string | null
          source?: string | null
          summary?: string | null
          title?: string
          title_ku?: string | null
          url?: string | null
        }
        Relationships: []
      }
      market_prices: {
        Row: {
          change_pct: number
          price: number
          signal: string | null
          symbol: string
          trend: string | null
          updated_at: string
        }
        Insert: {
          change_pct?: number
          price: number
          signal?: string | null
          symbol: string
          trend?: string | null
          updated_at?: string
        }
        Update: {
          change_pct?: number
          price?: number
          signal?: string | null
          symbol?: string
          trend?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          cigarette_id: string | null
          cigarette_name: string
          created_at: string
          day: number
          id: string
          month_key: string
          pack_price: number
          packs: number
          profit: number
          total_sale: number
          user_id: string
        }
        Insert: {
          cigarette_id?: string | null
          cigarette_name: string
          created_at?: string
          day: number
          id?: string
          month_key: string
          pack_price?: number
          packs?: number
          profit?: number
          total_sale?: number
          user_id: string
        }
        Update: {
          cigarette_id?: string | null
          cigarette_name?: string
          created_at?: string
          day?: number
          id?: string
          month_key?: string
          pack_price?: number
          packs?: number
          profit?: number
          total_sale?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_cigarette_id_fkey"
            columns: ["cigarette_id"]
            isOneToOne: false
            referencedRelation: "cigarettes"
            referencedColumns: ["id"]
          },
        ]
      }
      sent_news_log: {
        Row: {
          asset: string | null
          content_hash: string
          event_keyword: string | null
          headline: string | null
          id: string
          kind: string
          sent_at: string
          urgency: string | null
        }
        Insert: {
          asset?: string | null
          content_hash: string
          event_keyword?: string | null
          headline?: string | null
          id?: string
          kind?: string
          sent_at?: string
          urgency?: string | null
        }
        Update: {
          asset?: string | null
          content_hash?: string
          event_keyword?: string | null
          headline?: string | null
          id?: string
          kind?: string
          sent_at?: string
          urgency?: string | null
        }
        Relationships: []
      }
      session_posts_log: {
        Row: {
          id: string
          kind: string
          posted_at: string
          region: string
          session_date: string
        }
        Insert: {
          id?: string
          kind: string
          posted_at?: string
          region: string
          session_date: string
        }
        Update: {
          id?: string
          kind?: string
          posted_at?: string
          region?: string
          session_date?: string
        }
        Relationships: []
      }
      telegram_logs: {
        Row: {
          attempts: number
          chat_id: string | null
          created_at: string
          error: string | null
          id: string
          kind: string | null
          payload: Json | null
          status: string
        }
        Insert: {
          attempts?: number
          chat_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: string | null
          payload?: Json | null
          status?: string
        }
        Update: {
          attempts?: number
          chat_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: string | null
          payload?: Json | null
          status?: string
        }
        Relationships: []
      }
      telegram_signals: {
        Row: {
          chat_id: string | null
          confidence: number | null
          created_at: string
          entry: string | null
          error: string | null
          headline: string | null
          horizon_days: number | null
          id: string
          price: number | null
          recommendation: string | null
          risk_level: string | null
          sent_by: string | null
          status: string
          stop_loss: string | null
          symbol: string | null
          targets: string[] | null
          telegram_message_id: number | null
          timeframe: string | null
        }
        Insert: {
          chat_id?: string | null
          confidence?: number | null
          created_at?: string
          entry?: string | null
          error?: string | null
          headline?: string | null
          horizon_days?: number | null
          id?: string
          price?: number | null
          recommendation?: string | null
          risk_level?: string | null
          sent_by?: string | null
          status?: string
          stop_loss?: string | null
          symbol?: string | null
          targets?: string[] | null
          telegram_message_id?: number | null
          timeframe?: string | null
        }
        Update: {
          chat_id?: string | null
          confidence?: number | null
          created_at?: string
          entry?: string | null
          error?: string | null
          headline?: string | null
          horizon_days?: number | null
          id?: string
          price?: number | null
          recommendation?: string | null
          risk_level?: string | null
          sent_by?: string | null
          status?: string
          stop_loss?: string | null
          symbol?: string | null
          targets?: string[] | null
          telegram_message_id?: number | null
          timeframe?: string | null
        }
        Relationships: []
      }
      user_approvals: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_name: string | null
          created_at: string
          email: string
          expires_at: string | null
          id: string
          is_active: boolean
          is_approved: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_name?: string | null
          created_at?: string
          email: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_approved?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_name?: string | null
          created_at?: string
          email?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_approved?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_approval_status: {
        Args: { _user_id: string }
        Returns: {
          expires_at: string
          is_approved: boolean
          is_expired: boolean
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_user_approved: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
      bot_status: "idle" | "running" | "stopped"
      bot_strategy: "conservative" | "balanced" | "aggressive"
      trade_close_reason: "tp" | "sl" | "manual"
      trade_direction: "buy" | "sell"
      trade_result: "win" | "loss"
      trade_status: "open" | "closed"
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
      app_role: ["admin", "user"],
      bot_status: ["idle", "running", "stopped"],
      bot_strategy: ["conservative", "balanced", "aggressive"],
      trade_close_reason: ["tp", "sl", "manual"],
      trade_direction: ["buy", "sell"],
      trade_result: ["win", "loss"],
      trade_status: ["open", "closed"],
    },
  },
} as const
