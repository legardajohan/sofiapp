# ADR 0016 — Recordatorios del Organizador: estado derivado en la nota y barrido del worker

**Estado:** aceptado · **Fecha:** 2026-11-10 · **Contexto:** HU-PDF-02 (Organizador de pendientes)

## Contexto

HU-PDF-02 convierte las notas pendientes programadas (HU-PDF-01) en recordatorios que avisan dentro
de la app cuando llega su hora, que **no desaparecen** hasta que el usuario los cierra o los pospone,
y que reaparecen aunque haya cerrado el navegador, perdido la conexión o reiniciado el backend. Pide
además no depender de temporizadores del frontend, no duplicar avisos con varias pestañas y no usar
servicios externos de pago.

Hay tres decisiones: **dónde vive** el recordatorio, **cómo se sabe** que venció y **cómo se avisa**.

## Decisión

1. **El recordatorio es la nota.** `contact_notes` gana `recordatorioAt` (instante UTC del aviso),
   `programadoTz`, `notificadoPara` y `vecesPospuesto`. Reprogramar la nota es reprogramar el
   recordatorio en el mismo documento: no hay copia que sincronizar ni forma de duplicarlo. El
   historial, que sí crece sin techo, va aparte en `pendiente_eventos` (append-only, sin el texto).
2. **Estado derivado, no almacenado.** PENDIENTE / VENCIDO / POSPUESTO / CERRADO salen de
   `estadoPendiente` + `recordatorioAt` + `vecesPospuesto` + la hora actual. Se cumple por
   construcción que un pospuesto vuelve a VENCIDO y que nada queda desfasado si un proceso estuvo
   caído. `estadoPendiente` conserva su enum `abierto | cerrado`, así HU-PDF-01 lee lo mismo.
3. **La verdad es una consulta.** `GET /api/organizador/activos` (`recordatorioAt ≤ now`, abiertos,
   del usuario) alimenta la pila y la campana. El frontend la pide al montar, al volver a la pestaña,
   al reconectar y cada 60 s: un navegador cerrado o un evento perdido no hacen desaparecer nada.
4. **Un barrido en el worker, no un job por recordatorio.** Cada minuto (`organizador-sweep`, cola
   `flow-runtime`, `upsertJobScheduler` idempotente) busca los recién vencidos, marca
   `notificadoPara` con una escritura condicional —de dos barridos solo gana uno—, escribe un evento
   `vencido` (índice único parcial como red de seguridad) y publica `pendiente:vencido` al room del
   autor. También rellena `recordatorioAt` de los pendientes anteriores a la historia, con la zona
   horaria de la empresa.
5. **Sin documentos `notifications`.** La campana se reutiliza como superficie (su contador suma los
   recordatorios activos), pero no se crean notificaciones: tendrían un leído/no leído propio que se
   desincronizaría del estado del pendiente («leída» pero sin gestionar).
6. **Transiciones idempotentes.** Cerrar y posponer filtran la escritura por `estadoPendiente:
   'abierto'` **y** por la `version` (`recordatorioAt` que vio el cliente): un doble clic, dos
   pestañas o una reprogramación en medio producen un `409`, que la UI trata como «ya gestionado».

## Alternativas

- **Job BullMQ con `delay` por recordatorio.** Más preciso al segundo, pero reprogramar obliga a
  cancelar y reencolar, y un Redis purgado pierde avisos a días vista (el mismo motivo por el que las
  campañas programadas tienen barrido de respaldo). Descartado: la precisión de un minuto basta para
  compromisos comerciales.
- **Temporizadores en el navegador.** Mueren al cerrar la pestaña y se duplican con varias.
  Descartado por la propia historia.
- **Estados almacenados (`vencido`, `pospuesto` en el enum).** Exigirían un proceso que los cambie a
  tiempo y romperían las consultas de HU-PDF-01 (`estadoPendiente: 'abierto'`). Descartado.
- **Crear una `Notification` al vencer.** Ver punto 5.

## Consecuencias

- Precisión del aviso en vivo ≤ 1 minuto (configurable con `ORGANIZADOR_SWEEP_INTERVAL_MS`); sin
  socket, ≤ 1 minuto más por el refresco del cliente.
- Una consulta indexada por minuto (`{ tenantId, estadoPendiente, recordatorioAt }` parcial).
- El barrido es una lectura cross-tenant que solo proyecta `(_id, tenantId)`; documentado en
  `docs/multi-tenancy.md` junto a los demás barridos.
- Sin dependencias nuevas ni servicios externos.
