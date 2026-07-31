# W.FARMACIA — Guía de trabajo con Claude

Proyecto de JM Nexus Designs (ADN JM NEXUS). Cliente: Marien. Documentos que
gobiernan: `docs/ARQUITECTURA-MAESTRA-FARMACIA.md` y las Adendas.

## Cómo se reporta el trabajo

- **Al concluir un trabajo, siempre cerrar con un RESUMEN BREVE**, redactado
  para reenviar tal cual al chat de Claude: qué se hizo, número medido si lo
  hay, estado (listo para revisión / en preview) y lo que queda pendiente de
  Marien. Corto y autoexplicativo, sin jerga interna.
- Reportar **punto por punto y con honestidad**: si algo no queda en verde, se
  dice tal cual — nunca maquillado. Se enumera también lo que NO está hecho.
- **Marien cierra las tandas**, no Claude. Claude reporta "listo para revisión";
  ella lo prueba con sus manos y lo cierra.

## Ritmo de entrega — un PR por pieza (regla permanente, todos los proyectos)

**Nunca dejar un PR en borrador si ya está listo para revisión.** Un borrador
no se puede mergear; dejarlo así acumula commits colgando y mantiene producción
atrás. En cuanto una pieza esté lista, se saca de borrador y se avisa.

El ciclo, sin excepción:

1. Se termina **una pieza entregable**.
2. Se **saca el PR de borrador** y se avisa a Marien que está listo para revisión.
3. Marien revisa en el preview, con sus manos.
4. Marien aprueba y mergea.
5. Se **reinicia la rama desde `main` limpio** y arranca la siguiente pieza.

**Un PR por pieza entregable.** No acumular medio módulo en una sola rama: si se
mergea de un golpe, se pierde la revisión pieza por pieza, que es toda la
metodología de Marien.

## Reglas no negociables

- **Secretos nunca en el chat, ni en logs, ni en commits — ni parciales ni
  truncados.** Esto incluye el PAT de Supabase: al referirse a él se dice "el
  PAT" y nada más, jamás un carácter de su valor. Vive solo en memoria durante
  su ventana; Marien lo revoca al terminar.
- **Artefactos de prueba** (usuarios `@wfarmacia-test.local`, datos con prefijo
  `PRUEBA`) se registran en `docs/ARTEFACTOS-DE-PRUEBA.md` en el mismo commit
  que los crea, y se purgan en la misma sesión — salvo que Marien pida dejarlos
  vivos para revisar. El `audit_log` es inviolable: su corte se marca, no se
  borra.
- **Migraciones a producción** solo por el protocolo de PAT (Management API),
  nunca con un `DATABASE_URL`. Antes de pedir el PAT, la migración se prueba en
  un Postgres local con todas las migraciones aplicadas.

## Cuando bloquea una condición pendiente

Si hay una condición sin resolver, no se construye por encima: se dice "estoy
bloqueado en X" y se espera. No se avanza fingiendo que el gate pasó.
