# HU-IA-03 — Reglas de handoff: cuándo la IA transfiere a un humano (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`.

**Estado:** implementado

## Objetivo

Que un **Administrador** defina en qué situaciones Sofi deja de contestar y le pasa la conversación
a una persona. Cuando se cumple una de esas condiciones, la conversación sube a la bandeja con un
responsable, la IA se calla en ese hilo y el cliente recibe un aviso de que lo van a atender.

El valor no está en "poder configurar reglas": está en que el cliente que pide hablar con alguien
deje de chocar contra un bot, y en que la empresa no pierda una intención de compra por dejarla en
manos de un modelo.

## Punto de partida: qué ya existe

Verificado en el código, no asumido. Todo lo de esta tabla se **reutiliza**; nada se rehace.

| Pieza | Dónde vive hoy |
|---|---|
| Apagar Sofi en un hilo | `Cliente.iaHabilitada` (`cliente.model.ts:35`, default `true`) + `setIaHabilitada()` (`conversation.service.ts:328`) |
| Guarda que respeta ese flag | `ai-reply.processor.ts:44-45` (re-chequeo dentro del job) y `inbound-message.processor.ts:131` (no encola nada si está apagado) |
| Asignar responsable con auditoría y realtime | `assignConversation()` (`conversation.service.ts:399`) |
| Validar que el destino es un admin activo del tenant | `assertAssignableAdmin()` (`users/user.service.ts`) |
| Listar candidatos a destino | `listTenantUsers(tenantId, { rol: 'admin', activo: true })` y `GET /api/users` |
| Subir la conversación a la bandeja sin apagar la IA | `marcarParaAsesor()` (`conversation.service.ts:503`, HU-IA-02) |
| Hablarle al cliente como Sofi | `replyFromIa()` (`conversation.service.ts:257`) |
| Copy de cara al cliente en un solo sitio | `workers/ai-reply.messages.ts` (`MENSAJE_FALLO`, `MENSAJE_SOLO_TEXTO`) |
| Notificar en vivo al responsable | `publishRealtime({ type: 'conversation:assigned', targetUserId })` → room `asesor:<id>` |
| Bitácora tenant-scoped | `recordAuditEvent()` (`audit/audit.service.ts:31`), colección `audit_events` |
| Punto donde se genera la respuesta | `processAiReplyJob()` (`ai-reply.processor.ts:38`), función pura y ya testeada |
| Señal de que el RAG no encontró nada | `AiResult.retrievedChunks` de `chat()`, ya prefiltrado por `KB_MIN_SCORE` |
| Clasificación de intención | `AIService.classify()` (`ai.service.ts:144`) → `{ nivelInteres, objecion }`, cacheada 2 h |
| Molde de pantalla de configuración | `apps/frontend/src/features/ai-assistant/` (`api` + `types` + `hooks` + `pages` + `components`) |
| Molde de franja de aviso en el hilo | `apps/frontend/src/features/inbox/components/WindowClosedBanner.tsx` |
| Selector de asesor | `apps/frontend/src/features/users/hooks/useTenantUsers.ts` + `inbox/components/AssignMenu.tsx` |

## Los huecos reales (verificados en el código)

No hay **nada** de handoff escrito: `grep -rn "handoff" apps/` no devuelve una sola línea. Pero el
hueco no es solo "falta el feature": hay cinco supuestos que parecen ciertos y no lo son, y que
deciden el diseño.

1. **`AIService.classify()` hoy lanza 500 en todos los tenants.** `resolveTemplate` exige una
   plantilla activa para el método, y `seed-prompt-templates.ts` solo siembra `chat`, `summary` y
   `extract`: **no hay plantilla global `classify`**. Nadie la llama en producción, así que nadie se
   ha dado cuenta. Sin sembrarla, el disparador de intención de compra es inejecutable.
   > El método del *servicio* se llama `classify()`. `classifyLead()` es el método del **provider**
   > (`ILlmProvider`), no del servicio: son dos cosas distintas y confundirlas no compila.

2. **"Baja confianza" no se puede medir con el score del RAG.** `kb.retrieval.service.ts:33` ya
   filtra por `KB_MIN_SCORE` (0.75): todo fragmento que llega a `chat()` supera el umbral, así que
   comparar contra un umbral más bajo no dispara nunca. La única señal real es que **no sobreviva
   ninguno**. Tampoco hay score de confianza del modelo: `chat()` no devuelve ninguno.

3. **"Sin fragmentos" a secas produciría falsos positivos en cascada.** `chat()` devuelve
   `retrievedChunks: []` también cuando responde desde la caché de Redis (`ai.service.ts:85`) y
   cuando corta por FAQ (`ai.service.ts:98`) — dos caminos en los que la respuesta es *buena*. Y
   desde HU-IA-02 la plantilla `chat` v1.1.0 contesta un "gracias" con naturalidad, sin contexto y
   **sin derivar a nadie**: eso también da cero fragmentos. Un `low_confidence` ingenuo transferiría
   a un asesor a quien solo dijo gracias, que es justo el error que HU-IA-02 acaba de arreglar.

4. **El handoff automático no tiene actor humano, y todo el camino actual lo exige.**
   `assignConversation(tenantId, actorId: string, …)` resuelve el nombre del actor con
   `findUsersByIds` y lo audita; `AuditEvent.actorId` es `required: true` con `ref: 'User'`; y
   `RealtimeEvent['conversation:assigned'].actor.id` es `string`, sin `null`. Encadenar
   `assignConversation` + `setIaHabilitada` + `replyFromIa` además emitiría **tres** eventos de
   tiempo real con un estado intermedio inconsistente: asignada pero con Sofi todavía encendida.

5. **No hay dónde leer "esta conversación la transfirió la IA".** Ni `Cliente` ni
   `IConversationResponse` tienen campo alguno, y resolverlo por `audit_events` en cada fila de la
   bandeja es inviable. Sin un campo persistido, el aviso en la bandeja no se puede pintar.

Dos supuestos menores que también hay que corregir: **no existe el rol `asesor`** (los roles son
`superadmin | admin` con subrol, `user.model.ts`), y **no existe noción de disponibilidad ni de
carga** de un asesor, así que "el primero disponible" solo puede significar "el primer admin activo
del tenant".

## Alcance

Incluye:

**Backend — configuración**
- Modelo `HandoffSettings`: **un documento por tenant** (índice único `{ tenantId: 1 }`), con un
  bloque tipado por disparador, un asesor destino y el mensaje de transición. No es una colección de
  reglas sueltas: los disparadores son cuatro y fijos, así que un documento por empresa es la forma
  exacta del problema y encaja literal con el `GET/PUT` que pide la historia.
- `GET /api/ai/handoff-rules` → configuración vigente (la del tenant, o los valores de fábrica si
  todavía no ha guardado ninguna).
- `PUT /api/ai/handoff-rules` → guarda la configuración completa. Sin `POST`, sin `DELETE`, sin `id`.
- Slice de 6 archivos en `features/ai/` (`ai-handoff.*`), junto a `ai-assistant.*`.

**Backend — motor de evaluación**
- Cuatro disparadores: `explicit_request`, `keyword`, `low_confidence`, `intent_purchase`.
- **Dos puntos de evaluación**, no uno:
  - *Antes* de generar: `explicit_request` → `keyword`. Se deciden con el último mensaje del cliente,
    así que disparar aquí evita pagar embedding y generación de una respuesta que se iba a tirar.
  - *Después* de generar: `low_confidence` (gratis, con el resultado ya en mano) → `intent_purchase`
    (cuesta un `classify()`; solo se invoca si está activo y ningún disparador anterior saltó).
- Ese orden fijo **es** la prioridad: el primero que dispara gana y no se evalúa nada más.

**Backend — ejecución del handoff**
- `handoffConversation()` en `conversation.service.ts`: una sola escritura que apaga la IA, marca el
  handoff, sube el contador de no leídos y asigna responsable; un solo evento de tiempo real; una
  sola entrada de auditoría (`conversation.handoff`, con actor de sistema).
- `Cliente` gana `handoffAt` y `handoffMotivo`; `IConversationResponse` los expone en `handoff`.
- Plantilla global `classify` sembrada, sin la cual el disparador de intención no arranca.

**Frontend**
- Sub-página «Transferencia a un asesor» dentro de *Asistente IA* (`/settings/assistant/handoff`):
  una tarjeta por disparador con su interruptor y sus parámetros, más el asesor destino y el mensaje
  de transición.
- Aviso en la bandeja: franja sobre el compositor en la conversación transferida, e indicador en la
  fila de la lista, ambos desde el campo `handoff` del DTO.

Fuera de alcance:
- Reglas por horario de atención → futuro.
- Reparto por carga o round-robin entre asesores → futuro; hoy no hay dónde leer la carga.
- Notificación push o por correo al asesor fuera de la sesión web → futuro.
- Devolver la conversación a Sofi automáticamente: se reactiva a mano con el interruptor de Sofi,
  que ya existe.
- Score de confianza del propio modelo: Gemini no lo expone y `chat()` no lo propaga.
- Transcribir audio para poder evaluar un disparador sobre una nota de voz → HU de multimedia.

## Criterios de aceptación

1. **Configuración por empresa.** El admin ve y guarda la configuración de handoff desde
   `/settings/assistant/handoff` con `GET`/`PUT /api/ai/handoff-rules`. Un tenant que nunca ha
   guardado recibe los valores de fábrica y el `GET` no falla.
2. **Aislamiento multi-tenant.** La configuración de un tenant es invisible para otro y no se evalúa
   nunca contra sus conversaciones. Toda lectura y escritura pasa por el repositorio `*Scoped` y el
   `tenantId` nace del token. Test de aislamiento en verde.
3. **Interruptor maestro.** Con la configuración desactivada, o con los cuatro disparadores
   apagados, el comportamiento actual no cambia: Sofi responde y la conversación sigue igual. Es
   también el estado de fábrica, para que la historia no altere a nadie hasta que lo pidan.
4. **Petición explícita.** Un mensaje del tipo "quiero hablar con una persona" dispara el handoff
   **antes** de generar respuesta: no se llama a `chat()`.
5. **Palabra clave.** Igual que el anterior, con la lista que escriba el admin. La comparación es
   insensible a mayúsculas y a acentos (normalización NFD) y busca coincidencia por palabra completa,
   no por subcadena: "asesor" no puede dispararse dentro de "asesoría" si el admin no lo pidió.
6. **Baja confianza, sin falsos positivos.** Solo dispara cuando la respuesta **no** vino de la caché
   ni de una FAQ y, además, el RAG no aportó ningún fragmento **y** la respuesta generada es la frase
   de derivación de la plantilla `chat`. Un "gracias", una respuesta cacheada y una FAQ **no**
   disparan. Cada uno de esos tres casos tiene su test.
7. **Intención de compra.** Dispara cuando `AIService.classify()` devuelve un `nivelInteres` igual o
   superior al mínimo configurado (`tibio` o `caliente`, sobre la escala `frio | tibio | caliente`).
   `classify()` se invoca **solo** si el disparador está activo y ninguno anterior saltó.
8. **La plantilla `classify` existe.** Tras el seed hay una plantilla global `classify` activa, de
   modo que `classify()` deja de lanzar 500. Es requisito del criterio anterior, no un extra.
9. **Prioridad determinista.** Si varias condiciones se cumplen en el mismo turno se ejecuta **un
   solo** handoff, el del primer disparador según el orden fijo `explicit_request → keyword →
   low_confidence → intent_purchase`, y ese orden queda registrado en el motivo.
10. **La conversación queda atendible.** Al disparar: `iaHabilitada` pasa a `false`, se registran
    `handoffAt` y `handoffMotivo`, sube el contador de no leídos y se asigna el asesor destino
    configurado (o el primer admin activo del tenant si no hay ninguno configurado).
11. **No le quita la conversación a quien ya la lleva.** Si la conversación ya tenía responsable, el
    handoff **no** lo cambia: solo apaga la IA, marca el handoff y avisa.
12. **El asesor se entera en vivo.** Se publica el evento de asignación al room del destinatario, con
    Sofi como actor. Si no hay a quién asignar, la conversación sube igual a la bandeja y queda sin
    asignar en vez de perderse.
13. **El cliente se entera.** Recibe el mensaje de transición configurado. Cuando el disparador es de
    intención de compra, la respuesta generada **sí** se le envía, unida al aviso en un **único**
    mensaje de WhatsApp; en los demás casos el aviso sustituye a la respuesta.
14. **Sofi se calla de verdad.** Tras el handoff, un mensaje nuevo del cliente en ese hilo no genera
    respuesta automática ni acuse de no-texto: las guardas de `iaHabilitada` que ya existen bastan, y
    hay un test que lo fija.
15. **Idempotencia.** Un segundo handoff sobre una conversación ya transferida no escribe, no
    reasigna, no vuelve a auditar y no manda otro mensaje.
16. **Auditoría.** Queda un evento `conversation.handoff` en `audit_events` con el motivo, el asesor
    destino y el estado anterior. El actor es el sistema, no una persona inventada.
17. **Aviso en la bandeja.** La conversación transferida se distingue de un vistazo en la lista y
    muestra en el hilo por qué y cuándo se transfirió. Reactivar a Sofi limpia ese estado.
18. **Backend en verde.** `pnpm --filter @sofiapp/api typecheck` y `pnpm --filter @sofiapp/api test`
    sin errores ni regresiones.
19. **Frontend en verde.** `pnpm --filter @sofiapp/web build` y `pnpm --filter @sofiapp/web lint`
    sin errores, y la pantalla nueva terminada en claro y oscuro con los tokens del proyecto.

## Definition of Done

Un cliente escribe "quiero hablar con un asesor" por WhatsApp. Sofi no genera respuesta: le contesta
que ya lo están atendiendo, la conversación aparece asignada y sin leer en la bandeja del asesor
—que ve la notificación en vivo—, marcada como transferida por Sofi y con el bot apagado en ese
hilo. Todo lo que escriba a partir de ahí lo lee una persona. El admin decidió que eso pasara desde
*Asistente IA → Transferencia a un asesor*, sin tocar código.

## Dependencias

- `HU-IA-01` — `AIService.chat()`, cola `ai-reply`, `replyFromIa` → **implementado** en `feat/HU-IA-01`.
- `HU-IA-02` — `processAiReplyJob` como función pura, agrupación de ráfagas, `marcarParaAsesor` y la
  plantilla `chat` v1.1.0 → **implementado**; esta HU se construye encima, en la misma rama.
- `HU-OMNI-01` — `Cliente.iaHabilitada`, `noLeidos`, gateway de tiempo real → **cerrada**.
- `HU-OMNI-02` — `assignConversation()`, `assertAssignableAdmin()`, `audit_events`,
  `conversation:assigned` → **cerrada**.
- `HT-AI-01` — `AIService`, `ILlmProvider`, caché de Redis → **cerrado**.
