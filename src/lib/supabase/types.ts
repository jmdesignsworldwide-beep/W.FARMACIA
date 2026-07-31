/**
 * Tipos de la base de datos. Espejan las migraciones en supabase/migrations.
 * Cuando se generen tipos automáticos con `supabase gen types`, este archivo
 * se reemplaza; por ahora se mantiene a mano y sincronizado con el esquema.
 */

export type AppRole = 'dueno' | 'gerente' | 'farmaceutico' | 'cajero';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          nombre: string;
          role: AppRole;
          telefono: string | null;
          activo: boolean;
          eliminado_en: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          nombre: string;
          role?: AppRole;
          telefono?: string | null;
          activo?: boolean;
          eliminado_en?: string | null;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          tabla: string;
          operacion: 'INSERT' | 'UPDATE' | 'DELETE';
          registro_id: string | null;
          actor_id: string | null;
          datos: Record<string, unknown>;
          ocurrido_en: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      app_role: AppRole;
    };
  };
}
