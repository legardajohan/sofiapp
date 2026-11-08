# HU-CONF-01 — Ventanas horarias de envío de mensajes (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Por buena práctica, ninguna empresa debería escribir a sus clientes a las 3 a. m.
> Hoy no hay ninguna restricción horaria: el único filtro temporal de salida es la ventana de 24 h
> de Meta. Este feature añade una política configurable por tenant y por tipo de mensaje, aplicada
> en **un único punto** del flujo de envío.

**Estado:** creado

## Objetivo

Permitir que el admin de cada empresa defina en **Configuración → Horarios de envío** las franjas
horarias en que SofiApp puede enviar mensajes de WhatsApp, por día de la semana y por fecha
(excepciones y festivos), con reglas distintas por categoría de mensaje, y que el sistema retenga,
reprograme o bloquee cada envío fuera de franja según su categoría, dejando rastro en logs y
auditoría.

## Inventario de envíos y categorías

Todos los envíos salientes pasan por `sendOutbound` (`apps/backend/src/features/message/message.service.ts:121`).

| # | Envío | Origen | Categoría |
|---|---|---|---|
| 1 | Respuesta de texto del asesor | `conversation.controller.ts` → `replyMessage` | `asesor` |
| 2 | Imagen/video/documento del asesor | `replyMediaMessage` → `enviarMediaSaliente` (`media.service.ts`) | `asesor` |
| 3 | Nota de voz del asesor | `replyAudioMessage` → `enviarNotaDeVoz` (`media.service.ts`) | `asesor` |
| 4 | Plantilla HSM suelta | `POST /api/messages/template` (`message.controller.ts`) | `plantilla_manual` |
| 5 | Texto por API | `POST /api/messages/send` (`message.controller.ts`) | `asesor` |
| 6 | Respuesta IA de Sofi | `ai-reply.processor.ts` (`replyFromIa`) | `ia` |
| 7 | Aviso de handoff | `ai-reply.processor.ts` (`ejecutarHandoff`) | `ia` |
| 8 | Aviso de fallo de IA | `ai-reply.processor.ts` (`avisarDeFalloYEscalar`) | `ia` |
| 9 | Acuse «solo leo texto» | `inbound-message.processor.ts` (`acusarNoTexto`) | `ia` |
| 10a | Nodo `enviar_mensaje` de flujo en reacción a un entrante | `ejecutarFlujo` (`flow.runtime.service.ts`) | `ia` |
| 10b | Nodo `enviar_mensaje` tras un nodo `espera` | `reanudarFlujo` (`flow.runtime.service.ts`) | `flujo` |
| 11 | Recordatorio de ventana de 24 h | `enviarRecordatorio` (`flow.reminder.service.ts`) | `recordatorio` |
| 12 | Campañas (inmediatas y programadas) | `processCampaignJob` (`campaign-broadcast.processor.ts`) | `campana` |

Las notificaciones internas (`notification.service.ts`) no salen a clientes y quedan fuera.

### Comportamiento fuera de franja (fijo por categoría, no configurable)

| Categoría | Valor de fábrica | Fuera de franja |
|---|---|---|
| `asesor` | `libre` | **Bloquear**: HTTP 423 con `siguienteApertura`; la bandeja muestra un banner. No se encola. |
| `plantilla_manual` | `restringido` | **Bloquear**: HTTP 423 con `siguienteApertura`. |
| `ia` | `libre` | **Descartar y escalar**: no se envía y la conversación sube a un asesor (`marcarParaAsesor`). |
| `flujo` | `restringido` | **Reprogramar**: el job `resume` se re-encola con `delay` hasta la apertura, con el mismo token. |
| `recordatorio` | `restringido` | **Adelantar**: el plazo se mide contra el último momento abierto antes de que venza la ventana de 24 h; si la ventana vence fuera de horario, el recordatorio sale en el último tramo abierto. En plazo pero aún cerrado, no se envía ni se marca idempotencia hasta la apertura. *(Ajuste posterior a la implementación inicial, acordado con el equipo.)* |
| `campana` | `restringido` | **Retener**: el lote se re-encola con `delay` hasta la apertura; la campaña sigue `en_curso` con `retenidaHasta`. |

La política nace **desactivada** (`activo: false`): ningún tenant cambia de comportamiento sin
configurarla. Las franjas de fábrica sugeridas para las categorías restringidas son lun–sáb 08:00–19:00.

## Alcance

Incluye:
- Feature backend `send-window/` (6 archivos) con una configuración por tenant, más la política pura
  `send-window.policy.ts` (evaluación, `siguienteApertura`, validación de franjas) y la función pura
  de festivos de Colombia.
- `utils/zona-horaria.util.ts` extraído de `momentoLocal` (`flow.trigger.ts`), compartido por la
  política y el trigger `horario` de flujos.
- Control central en `sendOutbound` con `categoria` **obligatoria** en `ContextoEnvio`.
- Los comportamientos por categoría en campañas, flujos diferidos, recordatorios e IA.
- Rechazo (422 con `siguienteApertura`) al programar o reprogramar una campaña en hora cerrada.
- Endpoints `GET/PUT /api/send-window`, `GET /api/send-window/status` y
  `POST /api/send-window/holidays/preview`.
- Auditoría de cambios de configuración y de retenciones; log estructurado de cada retención.
- Página `/settings/send-hours` con su entrada en el menú, banner en el composer de la bandeja,
  badge «Retenida por horario» en campañas y aviso en el programador de campañas.

Fuera de alcance:
- Mensajes programados por el asesor desde la bandeja (encolar su respuesta para la apertura).
- Festivos de otros países (se cubren con excepciones manuales).
- Comportamiento configurable por categoría (es fijo, ver tabla).
- Notificaciones internas, email o push (no existen como envío a clientes).

## Criterios de aceptación

1. Existe el modelo `SendWindowConfig` con `tenantId` requerido, indexado y **único**; sin documento,
   el tenant se comporta como `activo: false`.
2. `PUT /api/send-window` (solo `admin`) valida con Zod: zona IANA conocida; `HH:mm` con `24:00`
   permitido solo como fin; `desde ≠ hasta`; `desde > hasta` = la franja cruza la medianoche y
   pertenece al día en que empieza; sin solapes dentro de una misma regla (tras normalizar sobre el
   anillo semanal, incluidas las franjas que cruzan medianoche); máx. 10 franjas por regla y 200
   excepciones; fechas de excepción `YYYY-MM-DD` válidas y sin duplicados. Cada error devuelve 400
   con la ruta del campo.
3. `evaluarVentana(config, categoria, ahora)` es pura y devuelve `permitido` para `activo: false`, para
   categorías `libre` y dentro de franja; fuera de franja devuelve `siguienteApertura` correcta
   considerando franjas que cruzan la medianoche, excepciones (día cerrado, franjas especiales,
   limitadas a algunas categorías) y zonas con horario de verano. Si no hay apertura en 14 días,
   devuelve `siguienteApertura: null`.
4. `ContextoEnvio.categoria` es obligatoria y los 13 puntos del inventario la pasan; `tsc` falla si
   un llamador nuevo la omite.
5. `sendOutbound` evalúa la ventana después de `assertWithinQuota` y antes de cualquier llamada a
   Meta; fuera de franja lanza `AppError` 423 y **no** llama a Meta ni incrementa la cuota.
6. `asesor` y `plantilla_manual` fuera de franja: los endpoints responden 423 con `siguienteApertura`
   en el cuerpo y el composer muestra el banner con la próxima apertura.
7. `ia` fuera de franja: la respuesta no se envía, la conversación queda marcada para asesor y el
   job no falla ni reintenta.
8. `flujo` fuera de franja: `reanudarFlujo` re-encola el job `resume` con `delay` hasta
   `siguienteApertura` y el mismo `esperaToken`; si el cliente responde antes, el token caduca como hoy.
9. `recordatorio` fuera de franja: no se envía y **no** se marca `recordatorioEnviadoParaVentana`; un
   barrido posterior dentro de franja lo envía si la conversación sigue elegible.
10. `campana` fuera de franja: el lote no marca destinatarios como `fallido`, se re-encola con `delay`
    hasta la apertura, la campaña guarda `retenidaHasta` y lo emite en `campaign:progress`; al
    reanudar se limpia `retenidaHasta`.
11. Programar o reprogramar una campaña con `programadaPara` fuera de franja (con la política
    activa) responde 422 con `siguienteApertura`, y la UI ofrece usar esa hora.
12. `GET /api/send-window/status` devuelve, por categoría, `permitido` y `siguienteApertura` (o
    `siguienteCierre` si está abierta) en el momento de la consulta.
13. Cada retención escribe el log `send_window.retenido` con `{ tenantId, categoria, accion,
    clienteId | campaignId, siguienteApertura }`; se auditan `send-window.update` (antes/después),
    `campaign.retenida-horario` (una vez por transición a retenida) y `mensaje.retenido-horario`
    (por conversación en `flujo`, `recordatorio` e `ia`).
14. `POST /api/send-window/holidays/preview` con `{ anio }` devuelve los festivos de Colombia de ese
    año (Ley 51 de 1983 y Pascua) para importarlos como excepciones editables.
15. La página `/settings/send-hours` permite activar la política, elegir la zona, editar las franjas
    por categoría y por día (con «copiar a todos los días»), gestionar excepciones con calendario,
    precargar festivos y ver el estado actual. Usa componentes shadcn/ui existentes, valida en línea
    con las mismas reglas del backend y queda prolija en light y dark.
16. **Aislamiento multi-tenant:** la configuración del tenant A nunca afecta los envíos del tenant B
    (incluida la caché, cuya clave es el `tenantId`), ningún endpoint lee ni escribe la configuración
    de otro tenant y el `tenantId` sale solo del token. `pnpm --filter @sofiapp/api typecheck`
    (`tsc --noEmit`) en verde y `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint`
    en verde.

## Supuestos

- La edición queda en `authorize(['admin'])`, como el resto de Configuración (sin restricción de subrol).
- Un flujo reprogramado puede llegar fuera de la ventana de 24 h: se mantiene el comportamiento
  actual de `sendOutbound` (`modo: 'auto'` con plantilla de respaldo o 422).
- La caché de configuración por proceso (60 s) puede tardar hasta ese tiempo en reflejar un cambio en
  un proceso al que no llegue la invalidación por Redis.

## Dependencias

- `HU-MARK-01`, `HU-MARK-03` (campañas y programación), `HU-FLOW-02` (esperas y recordatorios),
  `HU-IA-01`/`HU-IA-02`/`HU-IA-03` (respuestas, acuses y handoff), `HU-OMNI-06`/`HU-OMNI-07` (media y voz),
  `HT-WA-02` (plantillas HSM) liberados.
- `ADR 0004` (realtime por Redis) para la invalidación de la caché.
- Se recomienda registrar un ADR nuevo «Ventanas horarias de envío» con la tabla de comportamiento.
