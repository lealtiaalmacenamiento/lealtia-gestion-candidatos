// Minimal Database type placeholder. Replace with full generated types if available.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      usuarios: {
        Row: { id: number; email: string; rol: string; activo: boolean; nombre?: string | null };
        Insert: { id?: number; email: string; rol: string; activo?: boolean; nombre?: string | null };
        Update: { id?: number; email?: string; rol?: string; activo?: boolean; nombre?: string | null };
        Relationships: [];
      };
      candidatos: {
        Row: { id_candidato: number; candidato: string; ct: string | null; mes: string | null; efc: string | null; eliminado: boolean; usuario_creador: string };
        Insert: { id_candidato?: number; candidato: string; ct?: string | null; mes?: string | null; efc?: string | null; eliminado?: boolean; usuario_creador: string };
        Update: { id_candidato?: number; candidato?: string; ct?: string | null; mes?: string | null; efc?: string | null; eliminado?: boolean; usuario_creador?: string };
        Relationships: [];
      };
    };
  Views: Record<string, never>;
  Functions: Record<string, never>;
  Enums: Record<string, never>;
  CompositeTypes: Record<string, never>;
  };
}
