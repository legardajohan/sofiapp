# HU-MARK-05 — Visualización de mensajes de campañas masivas en la bandeja omnicanal (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Épica 7 — Remarketing Inteligente. Cierra la costura entre **Campañas**
> (HU-MARK-01/03/04) y la **Bandeja omnicanal** (HU-OMNI-01/06). Prioridad alta · mejora funcional
> y corrección de integración.

**Estado:** creado

> **Rebase sobre `develop` (2026-10-15).** El WIP original salía de un `develop` anterior a
> HU-MARK-04 (métricas y audiencias) y HT-WA-04 (imagen por defecto de la plantilla, imagen de
> reemplazo y `SendTemplateDialog` en la bandeja). Se trajo encima del `develop` actual y se ajustó
> esta spec en los criterios 3, 6, 11 y 12 y en el alcance (envíos sueltos de plantilla).

## Historia de usuario

Como **Administrador o Asesor**, quiero ver en la bandeja omnicanal el contenido real de los
mensajes que enviaron las campañas masivas de WhatsApp, para consultar el historial completo con
cada cliente, saber qué información recibió y continuar la conversación sin perder el contexto
comercial.

## Diagnóstico (por qué hoy sale "Mensaje sin contenido")

Cada envío de campaña **sí** crea un `Message` y por eso aparece en el hilo, pero vacío:

| Hecho | Dónde |
|---|---|
| La rama plantilla de `sendOutbound` guarda solo `{ tipo:'plantilla', sender:'bot', metaMessageId, status }`: sin `texto`, sin plantilla, sin imagen de cabecera, sin `campaignId`. | `features/message/message.service.ts:138-169` |
| `Message` no tiene campos para plantilla, origen ni campaña; `IMessageResponse` tampoco. | `message.model.ts`, `conversation.types.ts:108` |
| Nada renderiza el BODY con `{{n}}` sustituidos (`bodyTextOf` es privado y solo se cuenta/valida). | `whatsapp-template.service.ts:52` |
| La burbuja sin `texto` ni `media` cae en el fallback, y con `sender:'bot'` se firma "Sofi". | `MessageBubble.tsx:86,52` |
| El worker de campañas no llama `notificarSaliente`: no hay `message:new` ni se mueve `ultimoMensajeAt`. | `campaign-broadcast.processor.ts:141`, `conversation.service.ts:303` |
| `updateDeliveryStatus` no publica nada y deja que un `delivered` tardío pise un `read`. | `message.service.ts:206` |
| Dedupe de inbound solo en aplicación (índice `{tenantId, metaMessageId}` no único) y un reenvío de Meta vuelve a notificar e incrementar `noLeidos`. | `message.service.ts:30`, `message.model.ts:86-98` |
| Los parámetros de campaña son fijos para todos los destinatarios (`Campaign.parametros: string[]`). | `campaign.types.ts:133` |

**Mapeo con el modelo real** (la HU propone nombres genéricos): no existe una entidad
`Conversation`; la conversación es el `Cliente` proyectado (`conversationId ≡ clienteId`),
`contactId → clienteId`, `waMessageId → metaMessageId` (ya existe). No se crean endpoints nuevos.

## Objetivo

Que cada mensaje enviado por una campaña quede guardado con su **contenido final** (texto con
variables resueltas e imagen de cabecera), ligado a su cliente y campaña, identificado como
"Campaña", con su **estado de entrega al día** y visible **en vivo** en la bandeja, sin duplicados.
Y que los mensajes históricos vacíos se puedan recuperar.

## Alcance

Incluye:
- Persistir en **todo** envío por plantilla el texto renderizado (cabecera TEXT + BODY + FOOTER) y
  un snapshot de la plantilla (`templateId`, nombre, idioma, parámetros resueltos). Beneficia
  también a recordatorios (HU-FLOW-02) y flujos, que comparten `sendOutbound`.
- En los envíos de campaña: `campaignId`, `origen: 'campana'` e imagen de cabecera como `media`.
- **Envíos sueltos de plantilla desde la bandeja** (`POST /messages/template`, HT-WA-04): ganan
  `texto`, `plantilla` y `media` por el arreglo común de `sendOutbound`. Sin `origen` de campaña,
  así que no muestran la etiqueta "Campaña".
- **Variables de contacto por destinatario** en campañas (`nombre`, `telefono`) con texto de
  respaldo; configurables en el wizard. Aplica a crear, programar y reprogramar (HU-MARK-03).
- `message:new` desde el worker de campañas tras cada envío exitoso.
- `message:updated` al cambiar el estado de entrega, con orden monótono de estados.
- Idempotencia por `metaMessageId`: índice único parcial + un webhook reenviado no re-notifica.
- Bandeja: etiqueta discreta "Campaña", plantilla con imagen, fallback digno para plantillas sin
  contenido recuperable.
- Script de backfill idempotente para los mensajes históricos.

Fuera de alcance:
- Estado **pendiente** dentro del hilo: el `Message` nace cuando Meta acepta el envío. Lo pendiente
  sigue visible por destinatario en el detalle de campaña (`CampaignRecipient.estado`).
- Cabeceras VIDEO/DOCUMENT en campañas (hoy la campaña solo admite imagen). La burbuja ya sabría
  pintarlas si llegan con `media`.
- Notificar en la bandeja (`message:new`) los envíos de recordatorios y flujos: ganan `texto` por el
  arreglo común, pero su notificación es otra HU.
- Botones de la plantilla (quick replies / URL) en la burbuja.
- Variables de contacto distintas a `nombre` y `telefono` (atributos personalizados → otra HU).

## Criterios de aceptación

1. Todo envío por plantilla persiste `texto` = cabecera TEXT + BODY con `{{n}}` sustituidos +
   FOOTER, separados por línea en blanco; partes ausentes se omiten.
2. El `Message` de una campaña guarda `campaignId`, `origen: 'campana'`,
   `plantilla { templateId, nombre, idioma, parametros }` (parámetros **ya resueltos**) y
   `metaMessageId`, ligado al `clienteId` del destinatario. No se crean clientes nuevos.
3. Si la plantilla enviada lleva imagen de cabecera, el `Message` tiene `media` en estado
   `disponible` con la **imagen efectivamente enviada**. El orden es: imagen propia de la campaña
   (`Campaign.contenido.imagen`) → imagen por defecto de la plantilla (`imagenDefecto`, HT-WA-04)
   → imagen de reemplazo consumida (envío suelto desde la bandeja). La bandeja muestra la imagen
   con el texto debajo.
4. Un parámetro de campaña puede ser una variable de contacto (`nombre` | `telefono`) con texto de
   respaldo (si el dato está vacío). El worker la resuelve por destinatario. La validación lo acepta
   al crear, programar y reprogramar, y rechaza índices fuera de rango o repetidos.
5. Tras cada envío exitoso de campaña se publica `message:new` (con la conversación) y se actualiza
   `ultimoMensajeAt` del cliente. Si la notificación falla, el destinatario **sigue** como `enviado`.
6. `updateDeliveryStatus` solo avanza el estado (`sent < delivered < read`; `failed` no pisa
   `read`), publica `message:updated` cuando hubo cambio y sigue alimentando
   `applyDeliveryStatusToRecipient` (métricas HU-MARK-04) sin cambios de comportamiento. Las suites
   `campaign.metrics.*` siguen en verde.
7. `{ tenantId, metaMessageId }` es único (parcial, solo documentos con `metaMessageId`). Un
   mensaje entrante reenviado por Meta no duplica el registro, no vuelve a publicar `message:new`
   ni incrementa `noLeidos`.
8. `GET /api/conversations/:id/messages` devuelve en cada mensaje `origen`,
   `campana { id, nombre } | null` y `plantilla { nombre } | null`, en orden cronológico junto con
   los mensajes del cliente, de la IA y de los asesores.
9. En la bandeja, un mensaje de campaña muestra su texto real, una etiqueta discreta **"Campaña"**
   (con el nombre de la campaña en tooltip) en lugar de "Sofi", y sus ticks se actualizan en vivo.
   Una plantilla sin contenido recuperable se lee "Plantilla enviada · contenido no disponible";
   ningún mensaje de plantilla vuelve a mostrar "Mensaje sin contenido". Correcto en light y dark.
10. En el wizard de campañas, cada parámetro permite elegir **Texto fijo / Nombre del contacto /
    Teléfono del contacto**; en variable, el campo pide el respaldo y la vista previa muestra la
    variable de forma reconocible.
11. `pnpm --filter @sofiapp/api backfill:mensajes-campana [--dry-run]` recorre tenant por tenant,
    reconstruye texto, plantilla, `campaignId`, `origen` y media de los mensajes históricos vía
    `CampaignRecipient.metaMessageId → Campaign → plantilla`. La media sigue el orden del
    criterio 3 (si la campaña no tenía imagen propia, usa `imagenDefecto` de la plantilla). Es
    idempotente, reporta lo no
    recuperable y los `metaMessageId` duplicados que impedirían crear el índice único.
12. **Compatibilidad:** envío masivo, pacing y presupuesto de 24 h (`tipo` sigue siendo
    `'plantilla'`), respuesta de la IA, asignación de asesores, recepción de mensajes, constructor
    de audiencias y métricas (HU-MARK-04) y plantillas con imagen (HT-WA-04) sin regresiones: suites completas de backend y frontend en verde.
13. **Aislamiento multi-tenant + calidad:** estado de entrega, dedupe, `getThread` y backfill solo
    tocan documentos del tenant (test: el mismo `metaMessageId` en el tenant B no se actualiza ni se
    lee desde A). `tsc --noEmit` del backend en verde; `build` y `lint` del frontend en verde.

## Escenarios funcionales (validación manual, sandbox Meta)

1. **Campaña de texto** → el destinatario ve el texto real en su hilo.
2. **Campaña personalizada** → `{{1}}` = Nombre del contacto muestra el nombre de cada cliente.
3. **Campaña multimedia** → imagen de cabecera + texto en la burbuja.
4. **Respuesta del cliente** → mensaje de campaña y respuesta en orden cronológico.
5. **Persistencia y estados** → al reabrir, contenido intacto y último estado (entregado/leído).
6. **Duplicados** → reenviar el mismo webhook no duplica el mensaje en el historial.

## Dependencias

- `HU-MARK-01` (campañas, worker de envío), `HU-MARK-03` (programadas, imagen de cabecera),
  `HU-MARK-04` (`applyDeliveryStatusToRecipient`, métricas).
- `HT-WA-04` (imagen por defecto de la plantilla, imagen de reemplazo, `SendTemplateDialog`).
- `HU-OMNI-01` (bandeja), `HU-OMNI-06` (media en `Message`, `message:updated`).
- `HT-WA-01` (Cloud API, webhook de estados), `HT-WA-02` (catálogo de plantillas HSM).
