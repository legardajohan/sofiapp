# HU-IA-05 — Identificar intención de compra (semaforización) (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Cierra el círculo que abrió HU-OMNI-04: el vocabulario de semaforización existe
> desde entonces y `docs/domain.md` §5 ya nombra a «IA-05 clasificación automática» como uno de sus
> consumidores. Esta historia es ese consumidor.

**Estado:** implementado

## Objetivo

Que una conversación con intención de compra clara **suba su semáforo sola**, con una justificación
legible, sin que nadie la abra. Y que ese movimiento quede trazado: quién lo hizo (la IA), cuándo,
desde qué color, hacia cuál y **por qué**.

El valor no está en «clasificar»: la IA ya clasifica. Está en que el resultado deje de evaporarse.
Hoy un cliente puede escribir «quiero matricularme, ¿cómo pago?» y la empresa solo se entera si un
asesor abre el hilo — el modelo lo detectó, lo usó para decidir un handoff y tiró el dato.

## Punto de partida: qué ya existe

Verificado en el código, no asumido. Todo lo de esta tabla se **reutiliza**; nada se rehace.

| Pieza | Dónde vive hoy |
|---|---|
| Vocabulario de semaforización (4 slugs estables) | `Tag.semaforo` (`tag.types.ts:6`), `SEMAFORO_SLUGS`, índice único parcial `{ tenantId, semaforo }` |
| Las 4 etiquetas sembradas por tenant | `seed/seed-semaforo-tags.ts` + `Tenant.semaforoTagsSeeded` + `backfillSemaforoTags()` en `app.ts:98` |
| Significado de cada color | `docs/domain.md` §5 (tabla `verde`/`naranja`/`rojo`/`azul`) |
| Semáforo aplicado a una conversación | `Cliente.tagIds` (`cliente.model.ts:46`), índice `{ tenantId, tagIds }` |
| Clasificación por IA | `AIService.classify()` (`ai.service.ts:144`) devuelve `{ nivelInteres, objecion }`, cacheada `AI_CACHE_TTL_CLASSIFY_S` (2 h) |
| Escala del modelo | `NivelInteres = 'frio' \| 'tibio' \| 'caliente'` y `Objecion` (`llm-provider.types.ts`) |
| Salida estructurada de Gemini | `CLASSIFY_SCHEMA` + `responseSchema` (`gemini.provider.ts:79,147`) |
| Plantilla `classify` global | `seed-prompt-templates.ts:87` (v1.0.0), resuelta por `resolveTemplate` |
| Orden de la escala, ya escrito | `ORDEN_INTERES` (`ai-handoff.service.ts:40`) |
| Bitácora tenant-scoped | `recordAuditEvent` / `listAuditEvents` (`audit.service.ts:31,58`), índice `{ tenantId, entidad, entidadId, createdAt }` |
| Molde de bitácora expuesta por HTTP | `listAssignments` (`conversation.service.ts:520`) → `GET /conversations/:id/assignments` |
| Actor «sistema» en auditoría | `IAuditEvent.actorId: null`, ya usado por el handoff automático de HU-IA-03 |
| Ciclo donde engancha la clasificación | `processAiReplyJob` (`ai-reply.processor.ts:49`), con el historial ya construido |
| Agrupación de ráfagas | `ventanaJobId` + `AI_REPLY_WINDOW_MS` (HU-IA-02): una ejecución por ráfaga, no por mensaje |
| Tiempo real de la bandeja | `publishRealtime({ type: 'conversation:updated' })` + `useInboxRealtime` |
| Transporte al frontend | `GET /conversations/:id/overview` (HU-IA-04) y su hook `useConversationOverview` |
| Único componente que pinta color de BD | `TagChip` + `tagColors()` (contraste 4.5:1 garantizado en claro y oscuro) |
| Molde de franja sobre el hilo | `ConversationSummaryStrip` (constante `BANDA`) |
| Molde de umbral configurable | `KB_MIN_SCORE` / `FAQ_MATCH_THRESHOLD` (`config/env.ts:69,75`) |
| Molde de migración de plantilla | `CHAT_TEMPLATE_VERSION` + `scripts/migrate-chat-template.ts` |

## Los huecos reales (verificados en el código)

1. **El resultado de `classify()` no se persiste en ningún sitio.**
   `disparaIntencionDeCompra()` (`ai-handoff.service.ts:219-239`) lo colapsa a un booleano
   (`ORDEN_INTERES.indexOf(...) >= ...`), **descarta `data.objecion`** y no escribe nada. Es
   información ya pagada al modelo que se tira en cada mensaje. Ese es el hueco central.

2. **`classify()` resuelve su plantilla pero nunca se la envía al modelo.** `ai.service.ts:146`
   llama a `resolveTemplate(tenantId, 'classify')` y usa `template` **solo** para versionar la cache
   key (línea 148). `ILlmProvider.classifyLead()` no admite instrucciones — contrástese con
   `generateReply`, que sí pasa `systemInstruction` (`gemini.provider.ts:114`). **El `systemPrompt`
   sembrado por HU-IA-03 es texto muerto:** hoy el clasificador funciona solo por el
   `responseSchema`. Sin arreglarlo no hay dónde pedirle al modelo una justificación con criterio.

3. **`classify()` no devuelve confianza ni justificación.** `ClassifyResult` es
   `{ nivelInteres, objecion }` (`ai-service.types.ts:84`). La historia pide
   `{ semaforo, confianza, motivo }` con umbral, y ninguna de las dos piezas existe.

4. **No hay forma de resolver una etiqueta por su slug.** `tag.service.ts` expone `listTags`,
   `findTagsByIds`, `createTag`, `updateTag`, `deleteTag` y `assertTagsDelTenant`. Nada busca por
   `semaforo`, que es justo como `docs/domain.md` §5 obliga a resolverlas.

5. **Aplicar etiquetas hoy es un reemplazo total.** `setConversationTags`
   (`conversation.service.ts:412-444`) pisa el conjunto entero de `tagIds`. Usarlo para mover el
   semáforo borraría las etiquetas libres que el asesor puso a mano.

6. **`AuditAccion` no tiene un valor para esto.** Los seis existentes son `conversation.assign`,
   `conversation.handoff`, `cliente.update`, `contact-note.create`, `lead.create` y `lead.delete`.
   Además `listAuditEvents` **no filtra por acción**, así que una bitácora de clasificaciones
   devolvería también las asignaciones.

7. **`Cliente.nivelInteres` NO es el `NivelInteres` del modelo.** Es `OpcionContactoKey = string`,
   una clave del catálogo `contact_options` del tenant (HU-CRM-02), renombrable y archivable,
   validada por `assertOpcionesValidas`, que lanza **422** (`contact-option.service.ts:127`). El
   comentario de `cliente.types.ts:42-54` lo advierte literalmente. Que las claves de fábrica
   (`frio`/`tibio`/`caliente`) coincidan con la escala del modelo es una coincidencia del seed, no
   un contrato: escribir ahí desde un worker es un 500 esperando.

8. **El frontend no tiene widget de semáforo.** Solo lo pinta como una etiqueta más, vía `TagChip`
   en `ConversationList` y en la franja de etiquetas de `InboxPage`. No hay dónde mostrar una
   sugerencia con su justificación.

9. **El seed usa `$setOnInsert`** (`seed-prompt-templates.ts:129-140`): cambiar el `systemPrompt` de
   `classify` **no se propaga** a bases ya sembradas. Cualquier cambio de la plantilla necesita
   migración explícita.

## Alcance

Incluye:

**Backend — la clasificación**
- `classifyLead()` del proveedor gana `instrucciones` y devuelve además `confianza` y `motivo`
  (misma llamada, `CLASSIFY_SCHEMA` ampliado). `classify()` le pasa el `systemPrompt` de la
  plantilla resuelta como instrucción del sistema, cerrando el hueco 2.
- Plantilla `classify` v2.0.0 con las reglas de calibración de `confianza` y de redacción del
  `motivo`, más su script de migración (molde: `migrate-chat-template.ts`).
- Tres variables de entorno: interruptor, umbral de confianza y mínimo de turnos del cliente.

**Backend — la semaforización**
- Mapeo `nivelInteres` × `objecion` hacia `SemaforoSlug`, como función pura y testeada aparte.
- `findSemaforoTags(tenantId)` en `tag.service.ts`: una lectura scoped que devuelve las etiquetas de
  semáforo que **existan**, tolerando que falten (el admin pudo borrarlas).
- Slice `ai-semaforo` en `features/ai/`: clasificar-y-aplicar, aplicar una propuesta a mano, y
  listar la bitácora.
- `Cliente` gana `semaforoIA`: la última lectura del modelo (slug, confianza, motivo, nivel,
  objeción, fecha) y si llegó a aplicarse.
- Escritura del semáforo que **no** pisa las etiquetas libres: `$pull` de los slugs de semáforo más
  `$addToSet` del destino, nunca `setConversationTags`.
- `AuditAccion` gana `cliente.semaforo`; `listAuditEvents` gana un filtro opcional por acción.
- Enganche en `processAiReplyJob`, al final del ciclo, con el `historial` que ya se construyó.

**Backend — endpoints**
- `POST /api/conversations/:id/semaforo` — aplica la propuesta pendiente.
- `GET /api/conversations/:id/classifications` — bitácora paginada, molde de `/assignments`.
- `GET /api/conversations/:id/overview` (HU-IA-04) expone `semaforoIA`: sin endpoint nuevo para leer.

**Frontend**
- `IntentStrip`: franja de una línea bajo la tira de resumen, con la etiqueta sugerida (vía
  `TagChip`), el motivo y —cuando es propuesta— un botón «Aplicar».

**Documentación**
- `docs/domain.md` §5: cómo consume IA-05 el semáforo y el mapeo elegido.
- `docs/data-model.md`: `clientes.semaforoIA` y `cliente.semaforo` en la lista de acciones auditadas.
- `docs/api-contract.md` §6: los dos endpoints nuevos.

Fuera de alcance:
- **Escribir `Cliente.nivelInteres` / `objecionPrincipal`.** Son campos del catálogo que el asesor
  edita a mano (hueco 7); un worker por mensaje revirtiendo lo que una persona escribió es una
  regresión en HU-CRM-02. Los valores crudos quedan en `semaforoIA` y en la bitácora, así que no se
  pierde nada y una HU posterior puede promoverlos.
- **Clasificar con Sofi apagada.** El enganche vive en el ciclo de auto-reply, que solo corre con
  `iaHabilitada: true`. Tras un handoff, el semáforo vuelve a ser de la persona que tomó la
  conversación. Es coherente, pero es una limitación y queda dicha aquí, no descubierta después.
- **Reclasificar el histórico.** No hay backfill: la semaforización empieza a moverse con el
  siguiente mensaje de cada conversación.
- **Pintar la sugerencia no aplicada en `ConversationList`.** Duplicaría el peso visual de cada fila
  por una señal sobre la que no se puede actuar desde la lista.
- **Pantalla de configuración por tenant** del umbral o del mapeo. Hoy es `.env`, como `KB_MIN_SCORE`.
- Métricas agregadas de semáforo por tenant (eso es CRM-04) y segmentación de campañas (MARK-01).

## Criterios de aceptación

1. **`classify()` devuelve el contrato completo.** Su resultado incluye `confianza` (número en
   `[0,1]`) y `motivo` (texto en español), además de `nivelInteres` y `objecion`. Un `motivo` vacío o
   una `confianza` ausente se sanean a `''` y `0` en lugar de romper.
2. **La plantilla `classify` llega al modelo.** `classify()` pasa el `systemPrompt` de la plantilla
   resuelta como instrucción del sistema; un test lo comprueba sobre el doble del proveedor. Cierra
   el hueco 2, que hasta hoy dejaba la plantilla sin efecto.
3. **La versión de la plantilla sube a `2.0.0`** y existe un script de migración que la actualiza en
   bases ya sembradas. Como la cache key incluye `template.version`, ninguna entrada cacheada con el
   formato viejo puede volver sin `confianza`.
4. **El mapeo es el acordado y está testeado en sus seis combinaciones:**
   `caliente` → `verde` (con y sin objeción) · `tibio` → `naranja` (con y sin objeción) ·
   `frio` **sin** objeción → `azul` · `frio` **con** objeción → `rojo`.
5. **Una conversación con intención de compra clara eleva su semáforo sola.** Con
   `nivelInteres: 'caliente'` y confianza sobre el umbral, la conversación queda con la etiqueta de
   `semaforo: 'verde'` en `tagIds`, sin intervención humana.
6. **Aplicar el semáforo no borra las demás etiquetas.** Una conversación con etiquetas libres
   conserva todas tras la clasificación; solo se sustituye la de semáforo.
7. **Se resuelve por `semaforo`, nunca por nombre, y se tolera que falte.** Si el admin borró la
   etiqueta del slug destino, la clasificación **no escribe nada, no lanza y no rompe el
   auto-reply**; queda registrada como propuesta.
8. **Umbral configurable.** Con `confianza < SEMAFORO_MIN_CONFIANZA` el semáforo **no** se toca: se
   guarda la sugerencia con su motivo y la UI la ofrece para aplicar a mano.
9. **No degradar.** La clasificación no escribe cuando la conversación tiene menos de
   `SEMAFORO_MIN_TURNOS_CLIENTE` mensajes del cliente, cuando no hay historial, o cuando el slug
   sugerido es el que la conversación ya tiene.
10. **No pisa a una persona.** Si el semáforo vigente no es el que la IA aplicó —lo cambió alguien a
    mano—, la IA pasa a **proponer** y deja de escribir sola en esa conversación.
11. **Interruptor.** Con `SEMAFORO_AUTO=off` no se llama al clasificador ni se escribe nada, y el
    auto-reply se comporta exactamente como antes de esta historia.
12. **Coste acotado.** La clasificación corre **una vez por ráfaga agrupada** (`AI_REPLY_WINDOW_MS`),
    no una por mensaje, y va después de la evaluación de handoff: con la regla `intentPurchase`
    activa reutiliza el mismo `historial` y por tanto la misma entrada de caché.
13. **Nunca rompe el auto-reply.** Un fallo del clasificador (timeout, 500 del proveedor, plantilla
    ausente) se registra como warn y la respuesta al cliente sale igual. Test explícito.
14. **La clasificación es auditable, con justificación.** Cada cambio de slug deja un evento
    `cliente.semaforo` en `audit_events` con `actorId: null` (el sistema), `antes.semaforo`,
    `despues.semaforo`, `aplicado`, `confianza`, `motivo`, `nivelInteres` y `objecion`. Se registra
    **solo cuando el slug sugerido difiere del vigente**, para no inundar la colección con un evento
    por mensaje.
15. **La bitácora se puede consultar.** `GET /api/conversations/:id/classifications` devuelve
    `{ data, page, limit, total }` con **solo** los eventos `cliente.semaforo` de esa conversación,
    más recientes primero.
16. **La bitácora no filtra datos personales.** El `motivo` se recorta a 240 caracteres y la
    plantilla prohíbe citar correo, documento o cualquier dato de contacto: `audit_events` no tiene
    control de acceso por subrol, como ya fija `docs/data-model.md`.
17. **Aplicar a mano funciona y queda auditado.** `POST /api/conversations/:id/semaforo` aplica la
    propuesta pendiente, registra el evento con el `actorId` de quien pulsó, y responde `409` si no
    hay ninguna propuesta que aplicar.
18. **La sugerencia llega a la UI sin endpoint nuevo.** `GET /conversations/:id/overview` incluye
    `semaforoIA` (o `null`), y la tira se refresca en vivo por `conversation:updated`, que ya
    invalida `['conversation-overview', id]`.
19. **La franja muestra la etiqueta y el porqué.** Con una sugerencia aplicada, `IntentStrip` muestra
    el chip de la etiqueta y el motivo. Con una propuesta pendiente muestra además «Aplicar». Sin
    `semaforoIA` **no se renderiza**: no hay estado vacío que ocupe una tercera banda.
20. **Aislamiento multi-tenant.** Los dos endpoints de una conversación de tenantA responden 404 con
    un token de tenantB; la clasificación de un tenant no lee ni escribe etiquetas, clientes ni
    eventos de otro. Toda lectura y escritura nueva pasa por el repositorio `*Scoped` y el `tenantId`
    nace del token (o del job, que lo resolvió por `MetaIntegration`). Test de aislamiento añadido y
    en verde.
21. **Backend en verde:** `pnpm --filter @sofiapp/api typecheck` (`tsc --noEmit`) y
    `pnpm --filter @sofiapp/api test` sin errores ni regresiones.
22. **Frontend en verde:** `pnpm --filter @sofiapp/web build`, `lint` y `test` sin errores, con la
    franja terminada en claro y oscuro usando los tokens semánticos del proyecto y sin utilidades de
    color arbitrarias.

## Definition of Done

Un cliente escribe por WhatsApp «quiero matricularme, ¿cómo pago?». Sofi le responde, y **sin que
nadie abra el hilo** la conversación aparece en la bandeja marcada como *Avanza*. Al abrirla, sobre
el hilo se lee la etiqueta y una frase que la explica: «pide instrucciones de pago para
matricularse». En `GET /api/conversations/:id/classifications` queda el evento: de *Informativo* a
*Avanza*, por el sistema, con su confianza y su motivo. Si la confianza no hubiera alcanzado el
umbral, la misma franja mostraría la sugerencia con un botón «Aplicar» en vez de haberla aplicado
sola — y si un asesor ya había puesto otro color a mano, la IA no se lo habría tocado.

## Dependencias

- `HU-OMNI-04` — `Tag.semaforo`, las 4 etiquetas sembradas, `TagChip`, `Cliente.tagIds` y la regla
  «resolver por slug, tolerar que falte» de `docs/domain.md` §5 → **cerrada**.
- `HT-AI-01` — `AIService`, `ILlmProvider`, `GeminiProvider`, caché de Redis, `prompt_templates` →
  **cerrado**.
- `HU-IA-01` / `HU-IA-02` — cola `ai-reply`, `processAiReplyJob` como función pura, agrupación de
  ráfagas → **implementado** en `feat/HU-IA-01`.
- `HU-IA-03` — la plantilla `classify`, `ORDEN_INTERES` y el precedente de auditoría con
  `actorId: null` → **implementado**. Esta historia **modifica** el contrato de `classify()`, así que
  `disparaIntencionDeCompra` se adapta sin cambiar su comportamiento.
- `HU-IA-04` — `GET /conversations/:id/overview`, `useConversationOverview` y el molde `BANDA` de
  `ConversationSummaryStrip` → **implementado**; esta HU se construye encima, en la misma rama.
- `HU-OMNI-02` — `audit_events`, `recordAuditEvent`, `listAuditEvents` y el molde `listAssignments` →
  **cerrada**.
- `HU-CRM-02` — el catálogo `contact_options` y `assertOpcionesValidas`, que es **por qué** esta
  historia no escribe `Cliente.nivelInteres` → **cerrada**.
