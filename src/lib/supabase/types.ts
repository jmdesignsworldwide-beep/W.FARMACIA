/**
 * Tipos de la base de datos. Espejan las migraciones en supabase/migrations.
 * Cuando se generen tipos automáticos con `supabase gen types`, este archivo
 * se reemplaza; por ahora se mantiene a mano y sincronizado con el esquema.
 */

export type AppRole = 'dueno' | 'administrador' | 'farmaceutico' | 'cajero' | 'motorista';

// Unidades de concentración — enum cerrado (Adenda III §2). Cada unidad trae su
// factor de conversión conocido; por eso es enum y no catálogo gestionable.
export type UnidadConcentracion = 'mg' | 'g' | 'mcg' | 'UI' | '%' | 'mEq' | 'mmol';
export type UnidadVolumen = 'ml' | 'g';

export interface Database {
  public: {
    Tables: {
      sucursal: {
        Row: {
          id: string;
          nombre: string;
          codigo: string | null;
          direccion: string | null;
          telefono: string | null;
          es_principal: boolean;
          activa: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          codigo?: string | null;
          direccion?: string | null;
          telefono?: string | null;
          es_principal?: boolean;
          activa?: boolean;
        };
        Update: Partial<Database['public']['Tables']['sucursal']['Insert']>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          nombre: string;
          role: AppRole;
          sucursal_id: string;
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
          sucursal_id?: string;
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
      // ── Tanda 2 · Modelo de producto y equivalencia (0007, Adenda III) ──
      principio_activo: {
        Row: {
          id: string;
          nombre: string;
          nombre_normalizado: string; // generada
          sinonimos: string[];
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          sinonimos?: string[];
          activo?: boolean;
        };
        Update: Partial<Database['public']['Tables']['principio_activo']['Insert']>;
        Relationships: [];
      };
      forma_farmaceutica: {
        Row: {
          id: string;
          nombre: string;
          nombre_normalizado: string; // generada
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; nombre: string; activo?: boolean };
        Update: Partial<Database['public']['Tables']['forma_farmaceutica']['Insert']>;
        Relationships: [];
      };
      via_administracion: {
        Row: {
          id: string;
          nombre: string;
          nombre_normalizado: string; // generada
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; nombre: string; activo?: boolean };
        Update: Partial<Database['public']['Tables']['via_administracion']['Insert']>;
        Relationships: [];
      };
      producto: {
        Row: {
          id: string;
          nombre: string;
          nombre_normalizado: string; // generada
          forma_farmaceutica_id: string | null;
          via_administracion_id: string | null;
          laboratorio_id: string | null;
          presentacion_id: string | null;
          unidad_base: string | null;
          unidad_caja: string | null;
          factor_caja: number | null;
          precio_venta: number | null;
          precio_caja: number | null;
          margen_objetivo: number | null;
          es_controlado: boolean;
          requiere_receta: boolean;
          exento_itbis: boolean;
          codigo_barras: string | null;
          firma_equivalencia: string | null; // mantenida por trigger
          firma_molecula: string | null; // mantenida por trigger (0011): principios+forma+vía, sin concentración
          activo: boolean;
          eliminado_en: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          forma_farmaceutica_id?: string | null;
          via_administracion_id?: string | null;
          laboratorio_id?: string | null;
          presentacion_id?: string | null;
          unidad_base?: string | null;
          unidad_caja?: string | null;
          factor_caja?: number | null;
          precio_venta?: number | null;
          precio_caja?: number | null;
          margen_objetivo?: number | null;
          es_controlado?: boolean;
          requiere_receta?: boolean;
          exento_itbis?: boolean;
          codigo_barras?: string | null;
          activo?: boolean;
          eliminado_en?: string | null;
        };
        Update: Partial<Database['public']['Tables']['producto']['Insert']>;
        Relationships: [];
      };
      producto_principio_activo: {
        Row: {
          id: string;
          producto_id: string;
          principio_activo_id: string;
          concentracion_valor: number;
          concentracion_unidad: UnidadConcentracion;
          concentracion_volumen_valor: number | null;
          concentracion_volumen_unidad: UnidadVolumen | null;
          concentracion_normalizada: number | null; // generada
          unidad_base: string; // generada (unidad base de la concentración)
          orden: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          producto_id: string;
          principio_activo_id: string;
          concentracion_valor: number;
          concentracion_unidad: UnidadConcentracion;
          concentracion_volumen_valor?: number | null;
          concentracion_volumen_unidad?: UnidadVolumen | null;
          orden?: number;
        };
        Update: Partial<Database['public']['Tables']['producto_principio_activo']['Insert']>;
        Relationships: [];
      };
      laboratorio: {
        Row: {
          id: string;
          nombre: string;
          nombre_normalizado: string; // generada
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; nombre: string; activo?: boolean };
        Update: Partial<Database['public']['Tables']['laboratorio']['Insert']>;
        Relationships: [];
      };
      presentacion: {
        Row: {
          id: string;
          nombre: string;
          nombre_normalizado: string; // generada
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; nombre: string; activo?: boolean };
        Update: Partial<Database['public']['Tables']['presentacion']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      app_role: AppRole;
      unidad_concentracion: UnidadConcentracion;
      unidad_volumen: UnidadVolumen;
    };
  };
}
