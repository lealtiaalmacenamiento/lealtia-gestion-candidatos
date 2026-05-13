// Minimal Database type placeholder. Replace with full generated types if available.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      usuarios: {
  Row: {
    id: number
    email: string
    rol: string
    activo: boolean
    nombre?: string | null
    must_change_password?: boolean | null
    id_auth?: string | null
    is_desarrollador?: boolean | null
  };
  Insert: {
    id?: number
    email: string
    rol: string
    activo?: boolean
    nombre?: string | null
    must_change_password?: boolean | null
    id_auth?: string | null
    is_desarrollador?: boolean | null
  };
  Update: {
    id?: number
    email?: string
    rol?: string
    activo?: boolean
    nombre?: string | null
    must_change_password?: boolean | null
    id_auth?: string | null
    is_desarrollador?: boolean | null
  };
        Relationships: [];
      };
      candidatos: {
        Row: {
          id_candidato: number
          candidato: string
          fecha_nacimiento: string | null
          ct: string | null
          mes: string | null
          efc: string | null
          eliminado: boolean
          usuario_creador: string
          mes_conexion: string | null
        };
        Insert: {
          id_candidato?: number
          candidato: string
          fecha_nacimiento?: string | null
          ct?: string | null
          mes?: string | null
          efc?: string | null
          eliminado?: boolean
          usuario_creador: string
          mes_conexion?: string | null
        };
        Update: {
          id_candidato?: number
          candidato?: string
          fecha_nacimiento?: string | null
          ct?: string | null
          mes?: string | null
          efc?: string | null
          eliminado?: boolean
          usuario_creador?: string
          mes_conexion?: string | null
        };
        Relationships: [];
      };
      tokens_integracion: {
        Row: {
          id: number
          usuario_id: string
          proveedor: string
          access_token: string
          refresh_token: string | null
          expires_at: string | null
          scopes: string[] | null
          meta: Record<string, unknown> | null
          created_at: string | null
          updated_at: string | null
        };
        Insert: {
          id?: number
          usuario_id: string
          proveedor: string
          access_token: string
          refresh_token?: string | null
          expires_at?: string | null
          scopes?: string[] | null
          meta?: Record<string, unknown> | null
          created_at?: string | null
          updated_at?: string | null
        };
        Update: {
          id?: number
          usuario_id?: string
          proveedor?: string
          access_token?: string
          refresh_token?: string | null
          expires_at?: string | null
          scopes?: string[] | null
          meta?: Record<string, unknown> | null
          created_at?: string | null
          updated_at?: string | null
        };
        Relationships: [];
      };
      citas: {
        Row: {
          id: number
          prospecto_id: number | null
          agente_id: string
          supervisor_id: string | null
          inicio: string
          fin: string
          meeting_url: string
          meeting_provider: 'google_meet' | 'zoom' | 'teams'
          external_event_id: string | null
          estado: 'confirmada' | 'cancelada'
          created_at: string | null
          updated_at: string | null
        };
        Insert: {
          id?: number
          prospecto_id?: number | null
          agente_id: string
          supervisor_id?: string | null
          inicio: string
          fin: string
          meeting_url: string
          meeting_provider: 'google_meet' | 'zoom' | 'teams'
          external_event_id?: string | null
          estado?: 'confirmada' | 'cancelada'
          created_at?: string | null
          updated_at?: string | null
        };
        Update: {
          id?: number
          prospecto_id?: number | null
          agente_id?: string
          supervisor_id?: string | null
          inicio?: string
          fin?: string
          meeting_url?: string
          meeting_provider?: 'google_meet' | 'zoom' | 'teams'
          external_event_id?: string | null
          estado?: 'confirmada' | 'cancelada'
          created_at?: string | null
          updated_at?: string | null
        };
        Relationships: [];
      };
      sp_campanas: {
        Row: {
          id: string
          nombre: string
          descripcion: string | null
          sendpilot_campaign_id: string
          calcom_linkedin_identifier: string
          estado: 'activa' | 'pausada' | 'terminada'
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          nombre: string
          descripcion?: string | null
          sendpilot_campaign_id: string
          calcom_linkedin_identifier?: string
          estado?: 'activa' | 'pausada' | 'terminada'
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          nombre?: string
          descripcion?: string | null
          sendpilot_campaign_id?: string
          calcom_linkedin_identifier?: string
          estado?: 'activa' | 'pausada' | 'terminada'
          created_at?: string
          updated_at?: string
        };
        Relationships: [];
      };
      sp_campana_reclutadores: {
        Row: {
          id: string
          campana_id: string
          reclutador_id: string
          calcom_event_type_id: number | null
          calcom_scheduling_url: string | null
          activo: boolean
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          campana_id: string
          reclutador_id: string
          calcom_event_type_id?: number | null
          calcom_scheduling_url?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          campana_id?: string
          reclutador_id?: string
          calcom_event_type_id?: number | null
          calcom_scheduling_url?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        };
        Relationships: [];
      };
      sp_precandidatos: {
        Row: {
          id: string
          campana_id: string
          reclutador_id: string | null
          sp_contact_id: string | null
          nombre: string
          apellido: string | null
          linkedin_url: string | null
          linkedin_urn: string | null
          linkedin_slug: string | null
          email: string | null
          empresa: string | null
          cargo: string | null
          estado: 'en_secuencia' | 'respondio' | 'link_enviado' | 'cita_agendada' | 'promovido' | 'descartado'
          calcom_booking_uid: string | null
          candidato_id: number | null
          notas: string | null
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          campana_id: string
          reclutador_id?: string | null
          sp_contact_id?: string | null
          nombre: string
          apellido?: string | null
          linkedin_url?: string | null
          linkedin_urn?: string | null
          linkedin_slug?: string | null
          email?: string | null
          empresa?: string | null
          cargo?: string | null
          estado?: 'en_secuencia' | 'respondio' | 'link_enviado' | 'cita_agendada' | 'promovido' | 'descartado'
          calcom_booking_uid?: string | null
          candidato_id?: number | null
          notas?: string | null
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          campana_id?: string
          reclutador_id?: string | null
          sp_contact_id?: string | null
          nombre?: string
          apellido?: string | null
          linkedin_url?: string | null
          linkedin_urn?: string | null
          linkedin_slug?: string | null
          email?: string | null
          empresa?: string | null
          cargo?: string | null
          estado?: 'en_secuencia' | 'respondio' | 'link_enviado' | 'cita_agendada' | 'promovido' | 'descartado'
          calcom_booking_uid?: string | null
          candidato_id?: number | null
          notas?: string | null
          created_at?: string
          updated_at?: string
        };
        Relationships: [];
      };
      sp_actividades: {
        Row: {
          id: number
          precandidato_id: string
          campana_id: string | null
          tipo: string
          descripcion: string | null
          metadata: Record<string, unknown> | null
          sendpilot_event_id: string | null
          created_at: string
        };
        Insert: {
          precandidato_id: string
          campana_id?: string | null
          tipo: string
          descripcion?: string | null
          metadata?: Record<string, unknown> | null
          sendpilot_event_id?: string | null
          created_at?: string
        };
        Update: {
          precandidato_id?: string
          campana_id?: string | null
          tipo?: string
          descripcion?: string | null
          metadata?: Record<string, unknown> | null
          sendpilot_event_id?: string | null
        };
        Relationships: [];
      };
      sp_citas: {
        Row: {
          id: string
          precandidato_id: string | null
          reclutador_id: string
          campana_id: string | null
          calcom_booking_uid: string
          inicio: string
          fin: string
          meeting_url: string | null
          estado: 'confirmada' | 'cancelada'
          notas: string | null
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          precandidato_id?: string | null
          reclutador_id: string
          campana_id?: string | null
          calcom_booking_uid: string
          inicio: string
          fin: string
          meeting_url?: string | null
          estado?: 'confirmada' | 'cancelada'
          notas?: string | null
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          precandidato_id?: string | null
          reclutador_id?: string
          campana_id?: string | null
          calcom_booking_uid?: string
          inicio?: string
          fin?: string
          meeting_url?: string | null
          estado?: 'confirmada' | 'cancelada'
          notas?: string | null
          created_at?: string
          updated_at?: string
        };
        Relationships: [];
      };
    };
  Views: Record<string, never>;
  Functions: Record<string, never>;
  Enums: Record<string, never>;
  CompositeTypes: Record<string, never>;
  };
}
