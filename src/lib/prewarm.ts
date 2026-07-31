import type { createClient } from '@/lib/supabase/server';

type Cliente = ReturnType<typeof createClient>;

/**
 * Calentamiento de conexión (Adenda II — presupuesto de velocidad).
 *
 * El primer acceso del día a la base paga el arranque en frío: conexión al
 * pooler, páginas de la tabla que aún no están en memoria y el plan sin
 * cachear. Medido, ese primer golpe fue ~500 ms; los siguientes ~120–150 ms.
 *
 * No queremos que ese medio segundo lo viva el farmacéutico la primera vez que
 * abre el panel con un cliente esperando. Así que lo pagamos ANTES, al hacer
 * login: disparamos una consulta con la MISMA forma que la del panel
 * (producto + índice firma_molecula + los joins de laboratorio/principios),
 * con una firma que no existe → 0 filas, costo mínimo, pero deja tibio todo el
 * camino que el panel va a recorrer.
 *
 * Es best-effort: nunca bloquea ni hace fallar el login. Si tarda o falla, el
 * login sigue igual — solo perdemos el calentamiento de esta vez.
 */
const FIRMA_INEXISTENTE = '__prewarm_no_match__';
const TOPE_MS = 1200; // red de seguridad: jamás retrasar el login más que esto

export async function prewarmEquivalencia(supabase: Cliente): Promise<void> {
  const consulta = supabase
    .from('producto')
    .select(
      `id, firma_equivalencia, firma_molecula,
       laboratorio:laboratorio_id ( nombre ),
       producto_principio_activo ( concentracion_valor, principio_activo:principio_activo_id ( nombre ) )`,
    )
    .eq('firma_molecula', FIRMA_INEXISTENTE)
    .is('eliminado_en', null)
    .limit(1);

  const tope = new Promise<void>((resolve) => setTimeout(resolve, TOPE_MS));
  try {
    await Promise.race([Promise.resolve(consulta).then(() => undefined), tope]);
  } catch {
    // best-effort: el calentamiento nunca rompe el login.
  }
}
