export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  onzio: {
    Tables: {
      about_page_content: {
        Row: {
          closing_cta_href: string
          closing_cta_label: string
          closing_text: string
          club_id: string
          feature_image_asset_id: string | null
          feature_image_url: string
          hero_title: string
          story_paragraphs: Json
          updated_at: string
          values: Json
          values_heading: string
        }
        Insert: {
          closing_cta_href?: string
          closing_cta_label?: string
          closing_text?: string
          club_id: string
          feature_image_asset_id?: string | null
          feature_image_url?: string
          hero_title?: string
          story_paragraphs?: Json
          updated_at?: string
          values?: Json
          values_heading?: string
        }
        Update: {
          closing_cta_href?: string
          closing_cta_label?: string
          closing_text?: string
          club_id?: string
          feature_image_asset_id?: string | null
          feature_image_url?: string
          hero_title?: string
          story_paragraphs?: Json
          updated_at?: string
          values?: Json
          values_heading?: string
        }
        Relationships: [
          {
            foreignKeyName: "about_page_content_club_id_feature_image_asset_id_fkey"
            columns: ["club_id", "feature_image_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
          {
            foreignKeyName: "about_page_content_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_type: string
          actor_user_id: string | null
          club_id: string | null
          created_at: string
          id: number
          operation: string
          payload: Json
          request_id: string | null
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          actor_type?: string
          actor_user_id?: string | null
          club_id?: string | null
          created_at?: string
          id?: never
          operation: string
          payload?: Json
          request_id?: string | null
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          actor_type?: string
          actor_user_id?: string | null
          club_id?: string | null
          created_at?: string
          id?: never
          operation?: string
          payload?: Json
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      behind_the_rose_section: {
        Row: {
          caption: string
          club_id: string
          description: string
          eyebrow: string
          title: string
          updated_at: string
          video_title: string
          video_url: string
          visible: boolean
        }
        Insert: {
          caption?: string
          club_id: string
          description?: string
          eyebrow?: string
          title?: string
          updated_at?: string
          video_title?: string
          video_url?: string
          visible?: boolean
        }
        Update: {
          caption?: string
          club_id?: string
          description?: string
          eyebrow?: string
          title?: string
          updated_at?: string
          video_title?: string
          video_url?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "behind_the_rose_section_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_domains: {
        Row: {
          active: boolean
          club_id: string
          created_at: string
          environment: string
          hostname: string
          id: string
          is_primary: boolean
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          active?: boolean
          club_id: string
          created_at?: string
          environment: string
          hostname: string
          id?: string
          is_primary?: boolean
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          active?: boolean
          club_id?: string
          created_at?: string
          environment?: string
          hostname?: string
          id?: string
          is_primary?: boolean
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_domains_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_exports: {
        Row: {
          checksum_sha256: string
          club_id: string
          club_slug: string
          created_at: string
          created_by: string
          id: string
          object_count: number
          purged_at: string | null
          row_count: number
          status: string
          storage_reference: string
        }
        Insert: {
          checksum_sha256: string
          club_id: string
          club_slug: string
          created_at?: string
          created_by: string
          id: string
          object_count: number
          purged_at?: string | null
          row_count: number
          status?: string
          storage_reference: string
        }
        Update: {
          checksum_sha256?: string
          club_id?: string
          club_slug?: string
          created_at?: string
          created_by?: string
          id?: string
          object_count?: number
          purged_at?: string | null
          row_count?: number
          status?: string
          storage_reference?: string
        }
        Relationships: []
      }
      club_identity: {
        Row: {
          city: string
          club_id: string
          contact_address: string
          created_at: string
          division: string
          founded_year: number
          highlights: Json
          identity_heading_em: string
          identity_heading_top: string
          initials: string
          league: string
          mission: string
          short_name: string
          slideshow_heading_em: string
          slideshow_heading_top: string
          state: string
          story_heading_em: string
          story_heading_top: string
          time_zone: string
          updated_at: string
          venue: string
        }
        Insert: {
          city?: string
          club_id: string
          contact_address?: string
          created_at?: string
          division?: string
          founded_year: number
          highlights?: Json
          identity_heading_em?: string
          identity_heading_top?: string
          initials: string
          league?: string
          mission?: string
          short_name: string
          slideshow_heading_em?: string
          slideshow_heading_top?: string
          state?: string
          story_heading_em?: string
          story_heading_top?: string
          time_zone?: string
          updated_at?: string
          venue?: string
        }
        Update: {
          city?: string
          club_id?: string
          contact_address?: string
          created_at?: string
          division?: string
          founded_year?: number
          highlights?: Json
          identity_heading_em?: string
          identity_heading_top?: string
          initials?: string
          league?: string
          mission?: string
          short_name?: string
          slideshow_heading_em?: string
          slideshow_heading_top?: string
          state?: string
          story_heading_em?: string
          story_heading_top?: string
          time_zone?: string
          updated_at?: string
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_identity_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_logo_page_content: {
        Row: {
          annotated_image_asset_id: string | null
          annotated_image_url: string
          club_id: string
          color_cards: Json
          features: Json
          map_image_asset_id: string | null
          map_image_url: string
          updated_at: string
        }
        Insert: {
          annotated_image_asset_id?: string | null
          annotated_image_url?: string
          club_id: string
          color_cards?: Json
          features?: Json
          map_image_asset_id?: string | null
          map_image_url?: string
          updated_at?: string
        }
        Update: {
          annotated_image_asset_id?: string | null
          annotated_image_url?: string
          club_id?: string
          color_cards?: Json
          features?: Json
          map_image_asset_id?: string | null
          map_image_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_logo_page_content_club_id_annotated_image_asset_id_fkey"
            columns: ["club_id", "annotated_image_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
          {
            foreignKeyName: "club_logo_page_content_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_logo_page_content_club_id_map_image_asset_id_fkey"
            columns: ["club_id", "map_image_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      club_members: {
        Row: {
          club_id: string
          created_at: string
          removed_at: string | null
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          removed_at?: string | null
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          removed_at?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_stripe_connect: {
        Row: {
          charges_enabled: boolean
          club_id: string
          created_at: string
          details_submitted: boolean
          environment: string
          payouts_enabled: boolean
          stripe_account_id: string
          updated_at: string
        }
        Insert: {
          charges_enabled?: boolean
          club_id: string
          created_at?: string
          details_submitted?: boolean
          environment: string
          payouts_enabled?: boolean
          stripe_account_id: string
          updated_at?: string
        }
        Update: {
          charges_enabled?: boolean
          club_id?: string
          created_at?: string
          details_submitted?: boolean
          environment?: string
          payouts_enabled?: boolean
          stripe_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_stripe_connect_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          club_id: string
          created_at: string
          grace_ends_at: string | null
          last_applied_stripe_event_created_at: string | null
          last_applied_stripe_event_id: string | null
          paid_through: string | null
          price_id: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          club_id: string
          created_at?: string
          grace_ends_at?: string | null
          last_applied_stripe_event_created_at?: string | null
          last_applied_stripe_event_id?: string | null
          paid_through?: string | null
          price_id?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          club_id?: string
          created_at?: string
          grace_ends_at?: string | null
          last_applied_stripe_event_created_at?: string | null
          last_applied_stripe_event_id?: string | null
          paid_through?: string | null
          price_id?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_subscriptions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          accent_color: string | null
          archived_at: string | null
          created_at: string
          id: string
          kind: string
          lifecycle: string
          name: string
          primary_color: string | null
          public_access: string
          secondary_color: string | null
          slug: string
          store_enabled: boolean
          stripe_price_id: string | null
          tier: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          archived_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          lifecycle?: string
          name: string
          primary_color?: string | null
          public_access?: string
          secondary_color?: string | null
          slug: string
          store_enabled?: boolean
          stripe_price_id?: string | null
          tier?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          archived_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          lifecycle?: string
          name?: string
          primary_color?: string | null
          public_access?: string
          secondary_color?: string | null
          slug?: string
          store_enabled?: boolean
          stripe_price_id?: string | null
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      contact_page_content: {
        Row: {
          club_id: string
          eyebrow: string
          headline: string
          hero_media_asset_id: string | null
          intro: string
          updated_at: string
        }
        Insert: {
          club_id: string
          eyebrow?: string
          headline?: string
          hero_media_asset_id?: string | null
          intro?: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          eyebrow?: string
          headline?: string
          hero_media_asset_id?: string | null
          intro?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_page_content_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_page_content_club_id_hero_media_asset_id_fkey"
            columns: ["club_id", "hero_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      contact_profile: {
        Row: {
          club_id: string
          hours: string
          public_email: string
          public_phone: string
          service_area: string
          updated_at: string
        }
        Insert: {
          club_id: string
          hours?: string
          public_email?: string
          public_phone?: string
          service_area?: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          hours?: string
          public_email?: string
          public_phone?: string
          service_area?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_profile_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_delivery_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          occurred_at: string
          payload_digest: string
          provider_email_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id: string
          occurred_at: string
          payload_digest: string
          provider_email_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          occurred_at?: string
          payload_digest?: string
          provider_email_id?: string
        }
        Relationships: []
      }
      goalkeeper_match_stats: {
        Row: {
          clean_sheets: number
          club_id: string
          created_at: string
          goals_against: number
          id: string
          match_id: string
          mins: number
          player_id: string
          rating: number | null
          red: number
          saves: number
          starts: boolean
          updated_at: string
          yellow: number
        }
        Insert: {
          clean_sheets?: number
          club_id: string
          created_at?: string
          goals_against?: number
          id?: string
          match_id: string
          mins?: number
          player_id: string
          rating?: number | null
          red?: number
          saves?: number
          starts?: boolean
          updated_at?: string
          yellow?: number
        }
        Update: {
          clean_sheets?: number
          club_id?: string
          created_at?: string
          goals_against?: number
          id?: string
          match_id?: string
          mins?: number
          player_id?: string
          rating?: number | null
          red?: number
          saves?: number
          starts?: boolean
          updated_at?: string
          yellow?: number
        }
        Relationships: [
          {
            foreignKeyName: "goalkeeper_match_stats_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goalkeeper_match_stats_club_id_match_id_fkey"
            columns: ["club_id", "match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["club_id", "id"]
          },
          {
            foreignKeyName: "goalkeeper_match_stats_club_id_player_id_fkey"
            columns: ["club_id", "player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      goalkeeper_season_stats: {
        Row: {
          clean_sheets: number
          club_id: string
          goals_against: number
          mins: number
          player_id: string
          red: number
          saves: number
          season_id: string
          starts: number
          updated_at: string
          yellow: number
        }
        Insert: {
          clean_sheets?: number
          club_id: string
          goals_against?: number
          mins?: number
          player_id: string
          red?: number
          saves?: number
          season_id: string
          starts?: number
          updated_at?: string
          yellow?: number
        }
        Update: {
          clean_sheets?: number
          club_id?: string
          goals_against?: number
          mins?: number
          player_id?: string
          red?: number
          saves?: number
          season_id?: string
          starts?: number
          updated_at?: string
          yellow?: number
        }
        Relationships: [
          {
            foreignKeyName: "goalkeeper_season_stats_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goalkeeper_season_stats_club_id_player_id_fkey"
            columns: ["club_id", "player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["club_id", "id"]
          },
          {
            foreignKeyName: "goalkeeper_season_stats_club_id_season_id_fkey"
            columns: ["club_id", "season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      homepage_hero_content: {
        Row: {
          club_id: string
          eyebrow: string
          headline_line_one: string
          headline_line_two: string
          intro: string
          primary_cta_href: string
          primary_cta_label: string
          secondary_cta_href: string
          secondary_cta_label: string
          updated_at: string
        }
        Insert: {
          club_id: string
          eyebrow?: string
          headline_line_one?: string
          headline_line_two?: string
          intro?: string
          primary_cta_href?: string
          primary_cta_label?: string
          secondary_cta_href?: string
          secondary_cta_label?: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          eyebrow?: string
          headline_line_one?: string
          headline_line_two?: string
          intro?: string
          primary_cta_href?: string
          primary_cta_label?: string
          secondary_cta_href?: string
          secondary_cta_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homepage_hero_content_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_slideshow_photos: {
        Row: {
          alt: string
          club_id: string
          created_at: string
          id: string
          media_asset_id: string | null
          sort_order: number
          url: string
        }
        Insert: {
          alt?: string
          club_id: string
          created_at?: string
          id?: string
          media_asset_id?: string | null
          sort_order?: number
          url: string
        }
        Update: {
          alt?: string
          club_id?: string
          created_at?: string
          id?: string
          media_asset_id?: string | null
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "homepage_slideshow_photos_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homepage_slideshow_photos_club_id_media_asset_id_fkey"
            columns: ["club_id", "media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      homepage_slideshow_settings: {
        Row: {
          club_id: string
          season_label: string
          updated_at: string
        }
        Insert: {
          club_id: string
          season_label?: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          season_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homepage_slideshow_settings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_story_section: {
        Row: {
          body_primary: string
          body_secondary: string
          club_id: string
          cta_label: string
          heading: string
          updated_at: string
          visible: boolean
        }
        Insert: {
          body_primary?: string
          body_secondary?: string
          club_id: string
          cta_label?: string
          heading?: string
          updated_at?: string
          visible?: boolean
        }
        Update: {
          body_primary?: string
          body_secondary?: string
          club_id?: string
          cta_label?: string
          heading?: string
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "homepage_story_section_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      league_standings: {
        Row: {
          club_id: string
          created_at: string
          draws: number
          goal_difference: number
          id: string
          is_club: boolean
          logo_asset_id: string | null
          logo_url: string | null
          losses: number
          played: number
          points: number
          sort_order: number
          team_abbreviation: string | null
          team_name: string
          updated_at: string
          wins: number
        }
        Insert: {
          club_id: string
          created_at?: string
          draws?: number
          goal_difference?: number
          id?: string
          is_club?: boolean
          logo_asset_id?: string | null
          logo_url?: string | null
          losses?: number
          played?: number
          points?: number
          sort_order?: number
          team_abbreviation?: string | null
          team_name: string
          updated_at?: string
          wins?: number
        }
        Update: {
          club_id?: string
          created_at?: string
          draws?: number
          goal_difference?: number
          id?: string
          is_club?: boolean
          logo_asset_id?: string | null
          logo_url?: string | null
          losses?: number
          played?: number
          points?: number
          sort_order?: number
          team_abbreviation?: string | null
          team_name?: string
          updated_at?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_standings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_standings_club_id_logo_asset_id_fkey"
            columns: ["club_id", "logo_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      league_standings_settings: {
        Row: {
          club_id: string
          eyebrow: string
          intro: string
          title: string
          updated_at: string
        }
        Insert: {
          club_id: string
          eyebrow?: string
          intro?: string
          title?: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          eyebrow?: string
          intro?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_standings_settings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          address: string | null
          attendance: number | null
          city: string | null
          club_id: string
          competition: string | null
          created_at: string
          date: string
          home: boolean
          id: string
          opponent: string
          opponent_logo_asset_id: string | null
          opponent_logo_url: string | null
          opponent_score: number | null
          opponent_short_name: string | null
          rose_city_score: number | null
          scorers: Json
          season_id: string
          sponsor_link: string | null
          sponsor_logo_asset_id: string | null
          sponsor_logo_url: string | null
          sponsor_name: string | null
          state: string | null
          time: string
          updated_at: string
          venue: string
        }
        Insert: {
          address?: string | null
          attendance?: number | null
          city?: string | null
          club_id: string
          competition?: string | null
          created_at?: string
          date: string
          home?: boolean
          id?: string
          opponent: string
          opponent_logo_asset_id?: string | null
          opponent_logo_url?: string | null
          opponent_score?: number | null
          opponent_short_name?: string | null
          rose_city_score?: number | null
          scorers?: Json
          season_id: string
          sponsor_link?: string | null
          sponsor_logo_asset_id?: string | null
          sponsor_logo_url?: string | null
          sponsor_name?: string | null
          state?: string | null
          time: string
          updated_at?: string
          venue?: string
        }
        Update: {
          address?: string | null
          attendance?: number | null
          city?: string | null
          club_id?: string
          competition?: string | null
          created_at?: string
          date?: string
          home?: boolean
          id?: string
          opponent?: string
          opponent_logo_asset_id?: string | null
          opponent_logo_url?: string | null
          opponent_score?: number | null
          opponent_short_name?: string | null
          rose_city_score?: number | null
          scorers?: Json
          season_id?: string
          sponsor_link?: string | null
          sponsor_logo_asset_id?: string | null
          sponsor_logo_url?: string | null
          sponsor_name?: string | null
          state?: string | null
          time?: string
          updated_at?: string
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_club_id_opponent_logo_asset_id_fkey"
            columns: ["club_id", "opponent_logo_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
          {
            foreignKeyName: "matches_club_id_season_id_fkey"
            columns: ["club_id", "season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["club_id", "id"]
          },
          {
            foreignKeyName: "matches_club_id_sponsor_logo_asset_id_fkey"
            columns: ["club_id", "sponsor_logo_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      media_assets: {
        Row: {
          byte_size: number
          checksum_sha256: string
          club_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          height: number
          id: string
          media_kind: string
          mime_type: string
          published_at: string | null
          status: string
          storage_bucket: string
          storage_path: string
          surface: string
          width: number
        }
        Insert: {
          byte_size: number
          checksum_sha256: string
          club_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          height: number
          id?: string
          media_kind: string
          mime_type: string
          published_at?: string | null
          status?: string
          storage_bucket: string
          storage_path: string
          surface: string
          width: number
        }
        Update: {
          byte_size?: number
          checksum_sha256?: string
          club_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          height?: number
          id?: string
          media_kind?: string
          mime_type?: string
          published_at?: string | null
          status?: string
          storage_bucket?: string
          storage_path?: string
          surface?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      media_cleanup_queue: {
        Row: {
          attempts: number
          club_id: string
          completed_at: string | null
          created_at: string
          id: number
          last_error: string | null
          next_attempt_at: string
          reason: string
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          attempts?: number
          club_id: string
          completed_at?: string | null
          created_at?: string
          id?: never
          last_error?: string | null
          next_attempt_at?: string
          reason: string
          storage_bucket: string
          storage_path: string
        }
        Update: {
          attempts?: number
          club_id?: string
          completed_at?: string | null
          created_at?: string
          id?: never
          last_error?: string | null
          next_attempt_at?: string
          reason?: string
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_cleanup_queue_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      player_match_stats: {
        Row: {
          assists: number
          club_id: string
          created_at: string
          fouls: number
          fouls_suffered: number
          goals: number
          id: string
          match_id: string
          mins: number
          offsides: number
          player_id: string
          rating: number | null
          red: number
          starts: boolean
          tackles: number
          updated_at: string
          yellow: number
        }
        Insert: {
          assists?: number
          club_id: string
          created_at?: string
          fouls?: number
          fouls_suffered?: number
          goals?: number
          id?: string
          match_id: string
          mins?: number
          offsides?: number
          player_id: string
          rating?: number | null
          red?: number
          starts?: boolean
          tackles?: number
          updated_at?: string
          yellow?: number
        }
        Update: {
          assists?: number
          club_id?: string
          created_at?: string
          fouls?: number
          fouls_suffered?: number
          goals?: number
          id?: string
          match_id?: string
          mins?: number
          offsides?: number
          player_id?: string
          rating?: number | null
          red?: number
          starts?: boolean
          tackles?: number
          updated_at?: string
          yellow?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_match_stats_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_stats_club_id_match_id_fkey"
            columns: ["club_id", "match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["club_id", "id"]
          },
          {
            foreignKeyName: "player_match_stats_club_id_player_id_fkey"
            columns: ["club_id", "player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      player_photos: {
        Row: {
          club_id: string
          created_at: string
          id: string
          media_asset_id: string | null
          player_id: string
          sort_order: number
          url: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          media_asset_id?: string | null
          player_id: string
          sort_order?: number
          url: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          media_asset_id?: string | null
          player_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_photos_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_photos_club_id_media_asset_id_fkey"
            columns: ["club_id", "media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
          {
            foreignKeyName: "player_photos_club_id_player_id_fkey"
            columns: ["club_id", "player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      player_season_stats: {
        Row: {
          assists: number
          club_id: string
          fouls: number
          fouls_suffered: number
          goals: number
          mins: number
          offsides: number
          player_id: string
          red: number
          season_id: string
          starts: number
          tackles: number
          updated_at: string
          yellow: number
        }
        Insert: {
          assists?: number
          club_id: string
          fouls?: number
          fouls_suffered?: number
          goals?: number
          mins?: number
          offsides?: number
          player_id: string
          red?: number
          season_id: string
          starts?: number
          tackles?: number
          updated_at?: string
          yellow?: number
        }
        Update: {
          assists?: number
          club_id?: string
          fouls?: number
          fouls_suffered?: number
          goals?: number
          mins?: number
          offsides?: number
          player_id?: string
          red?: number
          season_id?: string
          starts?: number
          tackles?: number
          updated_at?: string
          yellow?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_season_stats_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_season_stats_club_id_player_id_fkey"
            columns: ["club_id", "player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["club_id", "id"]
          },
          {
            foreignKeyName: "player_season_stats_club_id_season_id_fkey"
            columns: ["club_id", "season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      players: {
        Row: {
          active: boolean
          age: number
          bio: string | null
          caption: string | null
          club_id: string
          created_at: string
          foot: string | null
          height: string
          hometown: string
          id: string
          name: string
          nationality: string
          number: number
          photo_asset_id: string | null
          photo_url: string
          position: string
          previous_club: string | null
          pronunciation: string | null
          school: string | null
          updated_at: string
          weight: string
        }
        Insert: {
          active?: boolean
          age: number
          bio?: string | null
          caption?: string | null
          club_id: string
          created_at?: string
          foot?: string | null
          height?: string
          hometown?: string
          id?: string
          name: string
          nationality?: string
          number: number
          photo_asset_id?: string | null
          photo_url?: string
          position: string
          previous_club?: string | null
          pronunciation?: string | null
          school?: string | null
          updated_at?: string
          weight?: string
        }
        Update: {
          active?: boolean
          age?: number
          bio?: string | null
          caption?: string | null
          club_id?: string
          created_at?: string
          foot?: string | null
          height?: string
          hometown?: string
          id?: string
          name?: string
          nationality?: string
          number?: number
          photo_asset_id?: string | null
          photo_url?: string
          position?: string
          previous_club?: string | null
          pronunciation?: string | null
          school?: string | null
          updated_at?: string
          weight?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_club_id_photo_asset_id_fkey"
            columns: ["club_id", "photo_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      presentation_documents: {
        Row: {
          club_id: string
          configuration: Json
          configuration_digest: string
          created_at: string
          created_by: string
          id: string
          schema_version: number
          template_id: string
          template_version: number
          version: number
        }
        Insert: {
          club_id: string
          configuration: Json
          configuration_digest: string
          created_at?: string
          created_by: string
          id?: string
          schema_version: number
          template_id: string
          template_version: number
          version: number
        }
        Update: {
          club_id?: string
          configuration?: Json
          configuration_digest?: string
          created_at?: string
          created_by?: string
          id?: string
          schema_version?: number
          template_id?: string
          template_version?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "presentation_documents_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      presentation_publications: {
        Row: {
          action: string
          club_id: string
          created_at: string
          created_by: string
          id: string
          next_configuration_digest: string
          next_document_id: string
          override_reason: string | null
          previous_document_id: string | null
          validation_result: Json
        }
        Insert: {
          action: string
          club_id: string
          created_at?: string
          created_by: string
          id?: string
          next_configuration_digest: string
          next_document_id: string
          override_reason?: string | null
          previous_document_id?: string | null
          validation_result: Json
        }
        Update: {
          action?: string
          club_id?: string
          created_at?: string
          created_by?: string
          id?: string
          next_configuration_digest?: string
          next_document_id?: string
          override_reason?: string | null
          previous_document_id?: string | null
          validation_result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "presentation_publications_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presentation_publications_next_fkey"
            columns: ["club_id", "next_document_id"]
            isOneToOne: false
            referencedRelation: "presentation_documents"
            referencedColumns: ["club_id", "id"]
          },
          {
            foreignKeyName: "presentation_publications_previous_fkey"
            columns: ["club_id", "previous_document_id"]
            isOneToOne: false
            referencedRelation: "presentation_documents"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      presentation_state: {
        Row: {
          club_id: string
          draft_document_id: string | null
          published_document_id: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          club_id: string
          draft_document_id?: string | null
          published_document_id?: string | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          club_id?: string
          draft_document_id?: string | null
          published_document_id?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "presentation_state_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presentation_state_draft_fkey"
            columns: ["club_id", "draft_document_id"]
            isOneToOne: false
            referencedRelation: "presentation_documents"
            referencedColumns: ["club_id", "id"]
          },
          {
            foreignKeyName: "presentation_state_published_fkey"
            columns: ["club_id", "published_document_id"]
            isOneToOne: false
            referencedRelation: "presentation_documents"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      program_media: {
        Row: {
          alt: string
          club_id: string
          created_at: string
          id: string
          media_asset_id: string | null
          program_id: string
          sort_order: number
          updated_at: string
          url: string
        }
        Insert: {
          alt?: string
          club_id: string
          created_at?: string
          id?: string
          media_asset_id?: string | null
          program_id: string
          sort_order?: number
          updated_at?: string
          url?: string
        }
        Update: {
          alt?: string
          club_id?: string
          created_at?: string
          id?: string
          media_asset_id?: string | null
          program_id?: string
          sort_order?: number
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_media_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_media_club_id_media_asset_id_fkey"
            columns: ["club_id", "media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
          {
            foreignKeyName: "program_media_club_id_program_id_fkey"
            columns: ["club_id", "program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      programs: {
        Row: {
          body: string
          club_id: string
          created_at: string
          detail_media_asset_id: string | null
          display_title: string
          external_cta_href: string
          external_cta_label: string
          hero_media_asset_id: string | null
          highlights: Json
          id: string
          kicker: string
          layout_variant: string
          nav_label: string
          registration_body: string
          registration_enabled: boolean
          registration_eyebrow: string
          registration_form_id: string | null
          registration_headline: string
          registration_pending_body: string
          registration_pending_label: string
          slug: string
          sort_order: number
          status: string
          summary: string
          updated_at: string
        }
        Insert: {
          body?: string
          club_id: string
          created_at?: string
          detail_media_asset_id?: string | null
          display_title: string
          external_cta_href?: string
          external_cta_label?: string
          hero_media_asset_id?: string | null
          highlights?: Json
          id?: string
          kicker?: string
          layout_variant?: string
          nav_label?: string
          registration_body?: string
          registration_enabled?: boolean
          registration_eyebrow?: string
          registration_form_id?: string | null
          registration_headline?: string
          registration_pending_body?: string
          registration_pending_label?: string
          slug: string
          sort_order?: number
          status?: string
          summary?: string
          updated_at?: string
        }
        Update: {
          body?: string
          club_id?: string
          created_at?: string
          detail_media_asset_id?: string | null
          display_title?: string
          external_cta_href?: string
          external_cta_label?: string
          hero_media_asset_id?: string | null
          highlights?: Json
          id?: string
          kicker?: string
          layout_variant?: string
          nav_label?: string
          registration_body?: string
          registration_enabled?: boolean
          registration_eyebrow?: string
          registration_form_id?: string | null
          registration_headline?: string
          registration_pending_body?: string
          registration_pending_label?: string
          slug?: string
          sort_order?: number
          status?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_club_id_detail_media_asset_id_fkey"
            columns: ["club_id", "detail_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
          {
            foreignKeyName: "programs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_club_id_hero_media_asset_id_fkey"
            columns: ["club_id", "hero_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
          {
            foreignKeyName: "programs_registration_form_tenant_fkey"
            columns: ["club_id", "registration_form_id"]
            isOneToOne: false
            referencedRelation: "registration_forms"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      programs_page_content: {
        Row: {
          closing_body: string
          closing_cta_label: string
          closing_heading_line_one: string
          closing_heading_line_two: string
          club_id: string
          hero_eyebrow: string
          hero_headline_line_one: string
          hero_headline_line_two: string
          hero_intro: string
          pathway_eyebrow: string
          pathway_heading: string
          pathway_intro: string
          updated_at: string
        }
        Insert: {
          closing_body?: string
          closing_cta_label?: string
          closing_heading_line_one?: string
          closing_heading_line_two?: string
          club_id: string
          hero_eyebrow?: string
          hero_headline_line_one?: string
          hero_headline_line_two?: string
          hero_intro?: string
          pathway_eyebrow?: string
          pathway_heading?: string
          pathway_intro?: string
          updated_at?: string
        }
        Update: {
          closing_body?: string
          closing_cta_label?: string
          closing_heading_line_one?: string
          closing_heading_line_two?: string
          club_id?: string
          hero_eyebrow?: string
          hero_headline_line_one?: string
          hero_headline_line_two?: string
          hero_intro?: string
          pathway_eyebrow?: string
          pathway_heading?: string
          pathway_intro?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_page_content_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_form_fields: {
        Row: {
          club_id: string
          created_at: string
          field_key: string
          field_type: string
          form_id: string
          id: string
          is_core: boolean
          label: string
          options: Json
          participant_scope: string
          position: number
          required: boolean
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          field_key: string
          field_type: string
          form_id: string
          id?: string
          is_core?: boolean
          label: string
          options?: Json
          participant_scope?: string
          position?: number
          required?: boolean
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          field_key?: string
          field_type?: string
          form_id?: string
          id?: string
          is_core?: boolean
          label?: string
          options?: Json
          participant_scope?: string
          position?: number
          required?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_form_fields_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_form_fields_club_id_form_id_fkey"
            columns: ["club_id", "form_id"]
            isOneToOne: false
            referencedRelation: "registration_forms"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      registration_forms: {
        Row: {
          closed_at: string | null
          club_id: string
          created_at: string
          description: string
          id: string
          participant_mode: string
          slug: string
          status: string
          title: string
          updated_at: string
          waiver_text: string
        }
        Insert: {
          closed_at?: string | null
          club_id: string
          created_at?: string
          description?: string
          id?: string
          participant_mode?: string
          slug: string
          status?: string
          title: string
          updated_at?: string
          waiver_text?: string
        }
        Update: {
          closed_at?: string | null
          club_id?: string
          created_at?: string
          description?: string
          id?: string
          participant_mode?: string
          slug?: string
          status?: string
          title?: string
          updated_at?: string
          waiver_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_forms_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_price_options: {
        Row: {
          active: boolean
          amount_cents: number
          club_id: string
          created_at: string
          form_id: string
          id: string
          label: string
          position: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_cents: number
          club_id: string
          created_at?: string
          form_id: string
          id?: string
          label: string
          position?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_cents?: number
          club_id?: string
          created_at?: string
          form_id?: string
          id?: string
          label?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_price_options_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_price_options_club_id_form_id_fkey"
            columns: ["club_id", "form_id"]
            isOneToOne: false
            referencedRelation: "registration_forms"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      registrations: {
        Row: {
          admin_email_status: string
          amount_cents: number
          amount_refunded_cents: number
          answers: Json
          club_id: string
          email_error: string | null
          expires_at: string
          form_id: string
          id: string
          paid_at: string | null
          participant_type: string
          payment_recovery_detected_at: string | null
          payment_recovery_reason: string | null
          payment_recovery_required: boolean
          price_label: string
          price_option_id: string
          refunded_at: string | null
          registrant_email: string
          registrant_email_status: string
          status: string
          status_token_hash: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          submitted_at: string
          waiver_accepted_at: string
        }
        Insert: {
          admin_email_status?: string
          amount_cents: number
          amount_refunded_cents?: number
          answers: Json
          club_id: string
          email_error?: string | null
          expires_at?: string
          form_id: string
          id?: string
          paid_at?: string | null
          participant_type: string
          payment_recovery_detected_at?: string | null
          payment_recovery_reason?: string | null
          payment_recovery_required?: boolean
          price_label: string
          price_option_id: string
          refunded_at?: string | null
          registrant_email: string
          registrant_email_status?: string
          status?: string
          status_token_hash: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          submitted_at?: string
          waiver_accepted_at: string
        }
        Update: {
          admin_email_status?: string
          amount_cents?: number
          amount_refunded_cents?: number
          answers?: Json
          club_id?: string
          email_error?: string | null
          expires_at?: string
          form_id?: string
          id?: string
          paid_at?: string | null
          participant_type?: string
          payment_recovery_detected_at?: string | null
          payment_recovery_reason?: string | null
          payment_recovery_required?: boolean
          price_label?: string
          price_option_id?: string
          refunded_at?: string | null
          registrant_email?: string
          registrant_email_status?: string
          status?: string
          status_token_hash?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          submitted_at?: string
          waiver_accepted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registrations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_club_id_form_id_fkey"
            columns: ["club_id", "form_id"]
            isOneToOne: false
            referencedRelation: "registration_forms"
            referencedColumns: ["club_id", "id"]
          },
          {
            foreignKeyName: "registrations_club_id_form_id_price_option_id_fkey"
            columns: ["club_id", "form_id", "price_option_id"]
            isOneToOne: false
            referencedRelation: "registration_price_options"
            referencedColumns: ["club_id", "form_id", "id"]
          },
        ]
      }
      seasons: {
        Row: {
          active: boolean
          club_id: string
          created_at: string
          end_year: number
          id: string
          label: string
          start_year: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          club_id: string
          created_at?: string
          end_year: number
          id?: string
          label: string
          start_year: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          club_id?: string
          created_at?: string
          end_year?: number
          id?: string
          label?: string
          start_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_carousel_photos: {
        Row: {
          club_id: string
          created_at: string
          id: string
          kit_variant: string
          media_asset_id: string | null
          sort_order: number
          url: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          kit_variant: string
          media_asset_id?: string | null
          sort_order?: number
          url: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          kit_variant?: string
          media_asset_id?: string | null
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_carousel_photos_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_carousel_photos_club_id_media_asset_id_fkey"
            columns: ["club_id", "media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      shop_kit_photos: {
        Row: {
          club_id: string
          created_at: string
          id: string
          kit_variant: string
          media_asset_id: string | null
          sort_order: number
          surface: string
          url: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          kit_variant: string
          media_asset_id?: string | null
          sort_order?: number
          surface: string
          url: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          kit_variant?: string
          media_asset_id?: string | null
          sort_order?: number
          surface?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_kit_photos_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_kit_photos_club_id_media_asset_id_fkey"
            columns: ["club_id", "media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      shop_kit_section: {
        Row: {
          bullet_points: Json
          club_id: string
          cta_label: string
          cta_link: string
          description: string
          eyebrow: string
          id: string
          kit_variant: string
          store_note: string
          surface: string
          title: string
          updated_at: string
        }
        Insert: {
          bullet_points?: Json
          club_id: string
          cta_label?: string
          cta_link?: string
          description?: string
          eyebrow?: string
          id?: string
          kit_variant: string
          store_note?: string
          surface: string
          title?: string
          updated_at?: string
        }
        Update: {
          bullet_points?: Json
          club_id?: string
          cta_label?: string
          cta_link?: string
          description?: string
          eyebrow?: string
          id?: string
          kit_variant?: string
          store_note?: string
          surface?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_kit_section_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_purchase_details: {
        Row: {
          cards: Json
          club_id: string
          cta_eyebrow: string
          cta_label: string
          cta_link: string
          cta_text: string
          heading: string
          updated_at: string
        }
        Insert: {
          cards?: Json
          club_id: string
          cta_eyebrow?: string
          cta_label?: string
          cta_link?: string
          cta_text?: string
          heading?: string
          updated_at?: string
        }
        Update: {
          cards?: Json
          club_id?: string
          cta_eyebrow?: string
          cta_label?: string
          cta_link?: string
          cta_text?: string
          heading?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_purchase_details_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      site_branding: {
        Row: {
          club_id: string
          club_logo_asset_id: string | null
          club_logo_path: string
          footer_tagline: string
          inverse_logo_asset_id: string | null
          inverse_logo_path: string
          updated_at: string
        }
        Insert: {
          club_id: string
          club_logo_asset_id?: string | null
          club_logo_path?: string
          footer_tagline?: string
          inverse_logo_asset_id?: string | null
          inverse_logo_path?: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          club_logo_asset_id?: string | null
          club_logo_path?: string
          footer_tagline?: string
          inverse_logo_asset_id?: string | null
          inverse_logo_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_branding_club_id_club_logo_asset_id_fkey"
            columns: ["club_id", "club_logo_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
          {
            foreignKeyName: "site_branding_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_branding_club_id_inverse_logo_asset_id_fkey"
            columns: ["club_id", "inverse_logo_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      site_social_links: {
        Row: {
          club_id: string
          href: string
          icon: string
          id: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          club_id: string
          href: string
          icon: string
          id: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          club_id?: string
          href?: string
          icon?: string
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_social_links_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      site_sponsor_logos: {
        Row: {
          club_id: string
          created_at: string
          id: string
          logo_url: string
          media_asset_id: string | null
          name: string
          placement: string
          sort_order: number
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          logo_url: string
          media_asset_id?: string | null
          name: string
          placement: string
          sort_order?: number
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          logo_url?: string
          media_asset_id?: string | null
          name?: string
          placement?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_sponsor_logos_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_sponsor_logos_club_id_media_asset_id_fkey"
            columns: ["club_id", "media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      staff: {
        Row: {
          active: boolean
          bio: string | null
          club_id: string
          created_at: string
          hometown: string
          id: string
          initials: string
          name: string
          nationality: string
          photo_asset_id: string | null
          photo_url: string
          role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          bio?: string | null
          club_id: string
          created_at?: string
          hometown?: string
          id?: string
          initials?: string
          name: string
          nationality?: string
          photo_asset_id?: string | null
          photo_url?: string
          role: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          bio?: string | null
          club_id?: string
          created_at?: string
          hometown?: string
          id?: string
          initials?: string
          name?: string
          nationality?: string
          photo_asset_id?: string | null
          photo_url?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_club_id_photo_asset_id_fkey"
            columns: ["club_id", "photo_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          applied_at: string | null
          club_id: string | null
          created_at: string
          environment: string
          event_type: string
          id: string
          outcome: string
          payload_digest: string
          rejection_code: string | null
          stripe_created_at: string
        }
        Insert: {
          applied_at?: string | null
          club_id?: string | null
          created_at?: string
          environment: string
          event_type: string
          id: string
          outcome?: string
          payload_digest: string
          rejection_code?: string | null
          stripe_created_at: string
        }
        Update: {
          applied_at?: string | null
          club_id?: string | null
          created_at?: string
          environment?: string
          event_type?: string
          id?: string
          outcome?: string
          payload_digest?: string
          rejection_code?: string | null
          stripe_created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      tryouts: {
        Row: {
          closed_message: string
          club_id: string
          cost_text: string
          created_at: string
          cta_label: string
          eligibility_copy: string
          event_date: string | null
          eyebrow: string
          headline: string
          hero_media_asset_id: string | null
          id: string
          intro: string
          location: string
          preparation_copy: string
          program_id: string | null
          registration_form_id: string | null
          registration_href: string
          sort_order: number
          status: string
          updated_at: string
          what_to_expect_copy: string
        }
        Insert: {
          closed_message?: string
          club_id: string
          cost_text?: string
          created_at?: string
          cta_label?: string
          eligibility_copy?: string
          event_date?: string | null
          eyebrow?: string
          headline?: string
          hero_media_asset_id?: string | null
          id?: string
          intro?: string
          location?: string
          preparation_copy?: string
          program_id?: string | null
          registration_form_id?: string | null
          registration_href?: string
          sort_order?: number
          status?: string
          updated_at?: string
          what_to_expect_copy?: string
        }
        Update: {
          closed_message?: string
          club_id?: string
          cost_text?: string
          created_at?: string
          cta_label?: string
          eligibility_copy?: string
          event_date?: string | null
          eyebrow?: string
          headline?: string
          hero_media_asset_id?: string | null
          id?: string
          intro?: string
          location?: string
          preparation_copy?: string
          program_id?: string | null
          registration_form_id?: string | null
          registration_href?: string
          sort_order?: number
          status?: string
          updated_at?: string
          what_to_expect_copy?: string
        }
        Relationships: [
          {
            foreignKeyName: "tryouts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tryouts_club_id_hero_media_asset_id_fkey"
            columns: ["club_id", "hero_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["club_id", "id"]
          },
          {
            foreignKeyName: "tryouts_club_id_program_id_fkey"
            columns: ["club_id", "program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["club_id", "id"]
          },
          {
            foreignKeyName: "tryouts_registration_form_tenant_fkey"
            columns: ["club_id", "registration_form_id"]
            isOneToOne: false
            referencedRelation: "registration_forms"
            referencedColumns: ["club_id", "id"]
          },
        ]
      }
      tryouts_page_content: {
        Row: {
          club_id: string
          intro_no_tryouts: string
          intro_with_tryouts: string
          updated_at: string
        }
        Insert: {
          club_id: string
          intro_no_tryouts?: string
          intro_with_tryouts?: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          intro_no_tryouts?: string
          intro_with_tryouts?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tryouts_page_content_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_registration_checkout_event: {
        Args: {
          p_amount_total: number
          p_checkout_session_id: string
          p_club_id: string
          p_environment: string
          p_event_id: string
          p_event_type: string
          p_payload_digest: string
          p_payment_intent_id: string
          p_registration_id: string
          p_stripe_created_at: string
        }
        Returns: Json
      }
      apply_registration_connect_event: {
        Args: {
          p_charges_enabled: boolean
          p_club_id: string
          p_details_submitted: boolean
          p_environment: string
          p_event_id: string
          p_event_type: string
          p_payload_digest: string
          p_payouts_enabled: boolean
          p_stripe_account_id: string
          p_stripe_created_at: string
        }
        Returns: Json
      }
      apply_registration_refund_event: {
        Args: {
          p_amount_refunded: number
          p_club_id: string
          p_environment: string
          p_event_id: string
          p_event_type: string
          p_payload_digest: string
          p_payment_intent_id: string
          p_registration_id: string
          p_stripe_created_at: string
        }
        Returns: Json
      }
      apply_stripe_projection: {
        Args: {
          p_cancel_at_period_end: boolean
          p_club_id: string
          p_customer_id: string
          p_environment: string
          p_event_id: string
          p_event_type: string
          p_grace_ends_at: string
          p_paid_through: string
          p_payload_digest: string
          p_price_id: string
          p_public_access: string
          p_status: string
          p_stripe_created_at: string
          p_subscription_id: string
        }
        Returns: Json
      }
      attach_registration_checkout: {
        Args: {
          p_checkout_created_at: string
          p_checkout_session_id: string
          p_club_id: string
          p_registration_id: string
        }
        Returns: undefined
      }
      create_pending_registration: {
        Args: {
          p_answers: Json
          p_club_id: string
          p_environment: string
          p_form_id: string
          p_participant_type: string
          p_price_option_id: string
          p_registrant_email: string
          p_status_token_hash: string
          p_waiver_accepted_at: string
        }
        Returns: string
      }
      expire_registration: {
        Args: { p_club_id: string; p_registration_id: string }
        Returns: undefined
      }
      get_club_runtime_access: { Args: { p_club_id: string }; Returns: string }
      mark_free_registration_paid: {
        Args: { p_club_id: string; p_registration_id: string }
        Returns: undefined
      }
      record_stripe_rejection: {
        Args: {
          p_club_id: string
          p_environment: string
          p_event_id: string
          p_event_type: string
          p_payload_digest: string
          p_rejection_code: string
          p_stripe_created_at: string
        }
        Returns: undefined
      }
      resolve_verified_tenant: {
        Args: { p_environment: string; p_hostname: string }
        Returns: {
          id: string
          lifecycle: string
          public_access: string
          slug: string
        }[]
      }
      run_billing_lifecycle: {
        Args: {
          p_now: string
          p_reconciliation_enabled: boolean
          p_suspension_enabled: boolean
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
  onzio: {
    Enums: {},
  },
} as const

