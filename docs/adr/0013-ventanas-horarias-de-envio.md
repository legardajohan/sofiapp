# ADR 0013 — Ventanas horarias de envío: control único en `sendOutbound` y comportamiento fijo por categoría

**Estado:** aceptado · **Fecha:** 2026-11-03 · **Contexto:** HU-CONF-01 (horarios de envío)

## Contexto

Hasta HU-CONF-01 el único filtro temporal de los envíos salientes era la ventana de 24 h de Meta.
Una campaña programada por error a las 3 a. m., un recordatorio o un flujo diferido podían escribir
a un cliente a cualquier hora. Los envíos nacen en trece puntos distintos (bandeja, plantillas, IA,
acuses, flujos, recordatorios, campañas), repartidos en dos procesos (web y worker).

## Decisión

1. **Un único punto de control.** Todos los envíos pasan ya por `sendOutbound`; ahí, después de la
   cuota y antes de Meta, se evalúa la ventana. `ContextoEnvio.categoria` es **obligatoria**: un
   llamador nuevo que no la declare no compila.
2. **Seis categorías con comportamiento FIJO fuera de franja** (bloquear, descartar y escalar,
   reprogramar, omitir, retener; ver `docs/domain.md` §4ter). Lo único configurable es *cuándo* sale
   cada categoría, no *qué pasa* fuera: dos empresas con la misma franja se comportan igual, y la
   pantalla no tiene que explicar combinaciones que nadie pidió.
3. **423 Locked** como señal del bloqueo, con `{ categoria, motivo, siguienteApertura }` en el cuerpo
   (vía `AppError.details`). Es distinto del 422 de la ventana de 24 h y del 429 de la cuota, así que
   cada llamador lo reconoce sin mirar el texto.
4. **Política pura** (`send-window.policy.ts`) sobre `Intl.DateTimeFormat`, sin dependencias: respeta
   el horario de verano de cada zona. El frontend usa un espejo de ella para validar y avisar antes
   de guardar o programar; el servidor siempre decide.
5. **Caché por proceso, 60 s, clave `tenantId`**, invalidada por Redis (`send-window:invalidate`) en
   web y worker al guardar. Coste en el camino caliente: una lectura de memoria por envío.
6. **Nace desactivada.** Desplegar no cambia ningún envío hasta que un admin la encienda.

## Alternativas

- **Control en cada llamador.** Trece sitios que mantener en paralelo; el primero que se olvide
  escribe de madrugada. Descartado.
- **Comportamiento configurable por categoría.** Más superficie de UI y de pruebas sin una necesidad
  real; se puede abrir más adelante sin romper el modelo (un campo más en la regla).
- **Encolar las respuestas del asesor para la apertura.** Fuera de alcance: un asesor que escribe a
  las 22:00 quiere saber que no sale, no que saldrá sin él mañana.

## Consecuencias

- Una franja que cierra a mitad de lote corta la campaña sin marcar fallidos y la retiene.
- Un flujo reprogramado puede llegar fuera de la ventana de 24 h: aplica la regla de siempre
  (`modo: 'auto'` con plantilla de respaldo o 422).
- Si la invalidación por Redis no llega a un proceso, un cambio tarda como mucho 60 s en aplicarse ahí.
- El espejo de la política en el frontend (`features/send-window/lib/politica.ts`) se mantiene a
  mano: si cambia el backend, cambia allí.
