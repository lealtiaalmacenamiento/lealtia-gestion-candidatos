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
        Row: { id_candidato: number; candidato: string; ct: string | null; mes: string | null; efc: string | null; eliminado: boolean; usuario_creador: string };
        Insert: { id_candidato?: number; candidato: string; ct?: string | null; mes?: string | null; efc?: string | null; eliminado?: boolean; usuario_creador: string };
        Update: { id_candidato?: number; candidato?: string; ct?: string | null; mes?: string | null; efc?: string | null; eliminado?: boolean; usuario_creador?: string };
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
          meeting_provider: 'google_meet' | 'zoom'
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
          meeting_provider: 'google_meet' | 'zoom'
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
          meeting_provider?: 'google_meet' | 'zoom'
          external_event_id?: string | null
          estado?: 'confirmada' | 'cancelada'
          created_at?: string | null
          updated_at?: string | null
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
