# HU-IA-06 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde.
>
> Se trabaja **sobre `feat/HU-IA-01`**, sin rama nueva. No ejecutar `git checkout -b`.
>
> El orden va de dentro hacia fuera: primero el contrato del proveedor (§1-3), después los tipos y el
> modelo (§4-5), el servicio (§6-7), el borde HTTP (§8-9), el worker (§10-11) y por último el
> frontend (§12-13). Así cada paso compila con el anterior y `tsc --noEmit` no acumula errores en
> cascada.
>
> El slice `ai-extract` **no tiene `model.ts`, ni controller, ni routes**: escribe sobre `Cliente` y
> solo lo llama el worker. Los dos endpoints viven en `features/cliente/`, junto al `extract` que ya
> existe. Misma desviación consciente del patrón de 6 archivos que documentaron HU-IA-04 y HU-IA-05.

## 1. El puerto del LLM (`integrations/llm/`)

- [x] `llm-provider.types.ts`: `extractSlots` recibe además `instrucciones: string`.
  - [x] **Obligatorio, no opcional.** Opcional dejaría vivo el mismo agujero que esta HU cierra: un
        llamador que lo olvide vuelve a un extractor sin prompt, y el fallo es silencioso. Copiar la
        nota que HU-IA-05 dejó en `classifyLead` (L57-63).
- [x] `gemini.provider.ts`: `extractSlots` pasa `systemInstruction: input.instrucciones` al
      `getGenerativeModel`. Mismo patrón que `generateReply` (L119) y `classifyLead` (L166).
      **Este es el hueco 2 del spec.**
- [x] **No tocar `slotSpecToSchema`**: el cuarto campo es texto; añadir `enum`/`nullable` sería
      alcance que nadie pidió.

## 2. El servicio de IA (`services/ai/ai.service.ts`)

- [x] `extract()`: `const template = await this.resolveTemplate(params.tenantId, 'extract');`
      (hoy L135 lo descarta) y pasar `instrucciones: template.systemPrompt`.
- [x] **No hay caché que invalidar**: `extract()` es el único método que no cachea, así que el bump
      de versión no puede arrastrar entradas viejas. Comprobarlo antes de dar el paso por bueno.

## 3. La plantilla `extract` v2.0.0 (`seed/` + `scripts/`)

- [x] `seed-prompt-templates.ts`: `export const EXTRACT_TEMPLATE_VERSION = '2.0.0'` (gemelo de
      `CHAT_TEMPLATE_VERSION` y `CLASSIFY_TEMPLATE_VERSION`) y usarlo en la plantilla.
- [x] Ampliar el `systemPrompt` conservando lo que ya dice (roles `user`/`model`, no deducir):
  - [x] **Qué es el interés:** el producto, servicio, plan o programa **concreto** que el cliente
        pide, con sus palabras y en una frase corta.
  - [x] **Qué NO es:** «muy interesado», «caliente» o «quiere comprar» no son respuestas válidas.
        Eso es `semaforoIA.nivelInteres` y lo produce HU-IA-05.
  - [x] **Uno solo:** si menciona varios, el más reciente y específico.
  - [x] **Literal:** correo y teléfono se copian tal cual, sin reformatear.
- [x] `scripts/migrate-extract-template.ts` (crear), molde de `migrate-classify-template.ts`:
  - [x] `--dry-run` por defecto; actualiza `systemPrompt` + `version` de
        `{ tenantId: null, method: 'extract' }`.
  - [x] Informa de cuántas plantillas **de tenant** quedaron en la versión vieja y **no las pisa**:
        son personalizaciones del cliente.
  - [x] Sin esto, el seed (`$setOnInsert`, L160-167) no actualiza nada en bases ya sembradas.
- [x] `migrate:extract-template` en `apps/backend/package.json`, junto a los otros dos.

## 4. Variables de entorno (`config/env.ts`)

- [x] Bloque comentado `// Extracción automática de datos de contacto (HU-IA-06)`.
- [x] `EXTRACT_AUTO: z.enum(['on', 'off']).default('on')`.
  - [x] **Enum y no booleano**: `z.coerce.boolean()` convierte `"false"` en `true`, justo el fallo
        que un kill-switch no se puede permitir. Comentarlo en el archivo, como `SEMAFORO_AUTO`.
- [x] `EXTRACT_MIN_TURNOS_CLIENTE: z.coerce.number().int().positive().default(2)`, con el porqué:
      con 1, un «hola» suelto dispara una extracción que no puede encontrar nada.
- [x] `EXTRACT_MAX_MENSAJES: z.coerce.number().int().positive().default(60)`, con el porqué: más que
      los 10 del auto-reply (aquí importa no perder un dato dicho al principio) y mucho menos que un
      hilo real de meses.
- [x] Documentar las tres en `.env.example`. Se añadieron `EXTRACT_AUTO`, `EXTRACT_MIN_TURNOS_CLIENTE`
      y `EXTRACT_MAX_MENSAJES` con sus comentarios (enum `on|off` no booleano y porqué). Se
      aprovechó para documentar también `AI_REPLY_WINDOW_MS` (HU-IA-02) y las dos variables de
      semaforización que faltaban (`SEMAFORO_AUTO`, `SEMAFORO_MIN_CONFIANZA`,
      `SEMAFORO_MIN_TURNOS_CLIENTE`), que comparten el mismo patrón.

## 5. `Cliente` gana el cuarto campo y el estado (`features/cliente/`)

- [x] `cliente.types.ts`: `export type CampoExtraido = 'nombreCompleto' | 'correo' | 'telefono' | 'interes'`.
- [x] `IDatosExtraidos` gana `interes: string | null`, `confirmados: CampoExtraido[]`,
      `confirmadoAt?: Date | null` y `confirmadoPor?: Types.ObjectId | null`.
  - [x] **`confirmados` es una lista, no un booleano por campo:** un `boolean` por campo serían
        cuatro campos nuevos en el subdocumento y cuatro en el DTO, y no escalaría a un quinto campo.
  - [x] **`confirmadoAt`/`confirmadoPor` guardan la última confirmación, no una por campo:** el
        detalle campo a campo ya vive en `audit_events`, que es donde se consulta un histórico.
- [x] `IDatosExtraidosResponse` gana `interes` y `confirmados`.
- [x] `IConfirmarExtraccionResponse` nuevo: `{ contacto, datosExtraidos, aplicados, omitidos }`.
- [x] `cliente.model.ts`: el subdoc `datosExtraidos` (L99-113) gana `interes` (`default: null`),
      `confirmados` (`[String]`, `default: []`), `confirmadoAt` y `confirmadoPor` (`ref: 'User'`).
  - [x] **`confirmados` sin `enum`**, por coherencia con `semaforoIA` (L81-96): el tipo lo garantiza
        `CampoExtraido` y el único productor es `cliente.service`.
  - [x] Sigue **sin índice**: se proyecta al abrir la ficha, nadie filtra la bandeja por esto.

## 6. El cuarto slot y su saneamiento (`cliente.service.ts`)

- [x] `DATOS_CONTACTO_SLOTS` gana `interes` (`tipo: 'texto'`, `requerido: false`) con la descripción
      que declara explícitamente que **no** es el nivel de interés (AC2).
- [x] Corregir el comentario de L393-395: ya **no** es cierto que «las descripciones SON el prompt
      efectivo» — desde §2 conviven con la plantilla del tenant.
- [x] `const INTERES_MAX_LEN = 120;` junto a las constantes del módulo.
- [x] `datosExtraidosSchema` gana `interes: textoLlm.transform((v) => v === null ? null : v.slice(0, INTERES_MAX_LEN))`.
  - [x] **Nada que añadir a `SIN_DATO`**: `textoLlm` ya convierte `''`, `'N/A'` y las muletillas en `null`.

## 7. Acotar, fusionar y auditar la extracción (`cliente.service.ts`)

- [x] Extraer `historialParaExtraccion(tenantId, clienteId)`: los `EXTRACT_MAX_MENSAJES` mensajes de
      texto más recientes, en orden cronológico. Mismo patrón que `construirHistorial`
      (`ai-reply.processor.ts:222-237`): `sort({ createdAt: -1, _id: -1 })`, `.limit()`, `.reverse()`.
  - [x] **Es el hueco 7**: hoy L465-467 carga el hilo entero sin techo.
- [x] Extraer `ejecutarExtraccion(tenantId, clienteId, actorId)` → `IDatosExtraidos`. Lo comparten el
      botón y el worker, así que los dos caminos dan **exactamente** el mismo resultado.
  - [x] **El worker NO reutiliza su `historial`**: son los últimos 10 (`HISTORIAL_MAX`), y un correo
        dictado en el mensaje 3 de un hilo de 40 se perdería.
- [x] `fusionar(anterior, nuevo, telefonoWhatsapp)`, en este orden por campo:
  - [x] Campo en `anterior.confirmados` → **se conserva el valor confirmado** (AC6).
  - [x] Si no → `nuevo[campo] ?? anterior?.[campo] ?? null`: un `null` nuevo **nunca borra** (AC5).
  - [x] `telefono`: se recalcula `telefonoOrigen` como hoy, salvo que estuviera confirmado.
  - [x] `confirmados` se arrastra; `extraidoAt` y `modelo` se actualizan siempre.
  - [x] **Es el hueco 3**: hoy L502-508 escribe `{ datosExtraidos }` entero.
- [x] `recordAuditEvent` acción `cliente.extract`, **solo si algún valor cambió** respecto de
      `anterior`.
  - [x] `actorId` real desde el botón, `null` desde el worker (el sistema).
  - [x] El correo va como `SENSIBLE_MARKER` (`'[oculto]'`) en `antes` y en `despues`:
        **`audit_events` no tiene gate por subrol** (`docs/data-model.md`), igual que ya hace
        `updateCliente` (L336-337) y que exigió el AC16 de HU-IA-05.
  - [x] El `interes` **sí va en claro**: es un dato comercial, no personal.
  - [x] **Solo cuando cambia**, calcado de `ai-semaforo.service.ts:139`: con la extracción automática
        por ráfaga, auditar siempre llenaría la colección de eventos idénticos.
- [x] `extractContactData` pasa a recibir `actorId` y delega en `ejecutarExtraccion`.
- [x] `toDatosExtraidosResponse` devuelve además `interes` y `confirmados`.

## 8. `confirmarDatosExtraidos()` — el puente que faltaba (`cliente.service.ts`)

- [x] Firma: `(tenantId, actorId, clienteId, campos: CampoExtraido[], puedeVerSensibles) => Promise<IConfirmarExtraccionResponse>`.
- [x] `findByIdScoped(...).lean()` → `404`. **Esta guarda es el aislamiento**: nada más se lee sin
      pasar por ella.
- [x] `409` si el contacto no tiene `datosExtraidos`.
- [x] `400` si algún campo pedido no tiene valor, o si es `telefono` con `telefonoOrigen: 'whatsapp'` (AC10).
- [x] `403` si `campos` incluye `correo` y `!puedeVerSensibles`, **sin escribir nada del resto** —
      todo o nada, igual que `updateCliente` (L302-304).
- [x] Las cuatro validaciones van **antes** de cualquier escritura.
- [x] Merge no destructivo:
  - [x] `nombreCompleto` → `Cliente.nombre`, **solo si está vacío**.
  - [x] `correo` → `Cliente.correoEnc` vía `toStoredValue`, **solo si está vacío**.
  - [x] `interes` → atributo `{ key: 'interes', label: 'Interés', valor, sensible: false }`, solo si
        no hay ya uno con esa `key`.
  - [x] `telefono` de origen `conversacion` → atributo
        `{ key: 'telefono-alterno', label: 'Teléfono alterno', … }`, solo si no hay ya uno con esa `key`.
  - [x] **Nunca `Cliente.telefono`:** lo resincroniza `upsertByMetaUser` desde Meta en cada mensaje
        entrante (`docs/api-contract.md:91`), y el formato extraído (>= 7 dígitos, libre) choca con el
        `^\d{7,15}$` de `updateClienteSchema` (L116-120).
  - [x] Respetar el tope de **30 atributos** de HU-CRM-02: si se alcanzó, el campo va a `omitidos` en
        vez de fallar la confirmación entera.
- [x] Lo no escrito por haber dato guardado va a `omitidos`; lo demás a `aplicados` (AC7, AC11).
- [x] **Una sola escritura** con `findOneAndUpdateScoped`: campos de ficha + `atributos` +
      `datosExtraidos.confirmados` + `confirmadoAt` + `confirmadoPor`.
  - [x] `confirmados` se une con los **aplicados**, no con los pedidos: marcar un campo omitido sería
        mentir, y la próxima extracción debe poder volver a proponerlo.
- [x] `recordAuditEvent` acción `cliente.extract-confirm` con el `actorId` real, los aplicados y los
      omitidos. Correo `[oculto]` en `antes` y `despues`.
- [x] Devuelve reusando `toContactCardResponse` y `toDatosExtraidosResponse` con el mismo
      `puedeVerSensibles`.

## 9. Exposición HTTP (`features/cliente/` + `features/audit/`)

- [x] `audit.types.ts`: `AuditAccion` += `'cliente.extract'` y `'cliente.extract-confirm'`.
- [x] `cliente.validation.ts`: `confirmarExtraccionSchema` con `body.campos` (array de
      `CampoExtraido`, 1..4, **sin repetidos**, `.strict()`), `params.id` objectId, `query` vacío.
  - [x] **`extractSchema` no se toca**: sigue sin cuerpo. Qué se extrae es producto, no dato del
        cliente HTTP.
- [x] `cliente.controller.ts`: `confirmarExtraccionController`, `tenantId` de `req.user!.tenantId`,
      actor de `req.user!.sub`, permiso de `puedeVerDatosSensibles(req.user!)`. Sin `try/catch`, sin
      lógica.
- [x] `extractContactDataController` pasa el `req.user!.sub` que ahora pide el service.
- [x] `cliente.routes.ts`: `POST /:id/extract/confirm` con la cadena fija
      `authenticateJWT · requireTenant · bandejaRoles · validate · asyncHandler`.
  - [x] **Sin `authorizeSubrol` en la ruta**, por el motivo que ya documenta L37-38 para el `PATCH`:
        el gate de los datos sensibles es **por campo**, dentro del service, para no quitarle al
        `coordinator` la confirmación de los campos no sensibles.

## 10. El slice `ai-extract` (`features/ai/`)

- [x] `ai-extract.service.ts` con `extraerDatosSiHaceFalta(tenantId, clienteId, historial): Promise<void>`.
      **Nunca lanza.**
- [x] Guardas, en orden, **antes de gastar el modelo**:
  - [x] 1. `env.EXTRACT_AUTO !== 'on'` → return.
  - [x] 2. `turnosDelCliente(historial) < env.EXTRACT_MIN_TURNOS_CLIENTE` → return.
  - [x] 3. `faltaAlgo`: `!datos || CAMPOS_AUTO.some((c) => datos[c] === null)`.
    - [x] `const CAMPOS_AUTO = ['nombreCompleto', 'correo', 'interes'] as const;`
    - [x] **`telefono` excluido a propósito:** nunca es `null` (cae al número de WhatsApp), así que
          incluirlo haría `faltaAlgo` siempre `false` y la extracción automática **no correría
          jamás**. Es el bug silencioso más fácil de introducir aquí.
  - [x] 4. `hayNovedad`: `!datos || cliente.ultimoMensajeAt > datos.extraidoAt`.
  - [x] Guardas 3 y 4 juntas son el techo de coste: una a tres llamadas en toda la vida de un hilo.
- [x] `try/catch` → `logger.warn('Extracción: falló la lectura de datos de contacto', …)`, sin propagar.
- [x] Al escribir, `publishConversationUpdated(tenantId, clienteId)`.
  - [x] **Sin evento nuevo:** `useInboxRealtime` (L29-35) ya invalida `['contact-history', id]` con
        `conversation:updated`. Cero cambios en el frontend de tiempo real (AC21).
- [x] Reutilizar `turnosDelCliente` de `ai-semaforo.service.ts`: se movió a `features/ai/ai-shared.ts`,
      que ahora comparten los dos servicios que el worker engancha. **No duplicada.**

## 11. El worker (`workers/ai-reply.processor.ts`)

- [x] En `processAiReplyJob` (L145-152), llamar a `extraerDatosSiHaceFalta` **después** de
      `clasificarYAplicarSemaforo`, con el mismo `historial`.
  - [x] **Después, no antes:** si el proceso muere entre las dos, es preferible perder la extracción
        (recuperable en la siguiente ráfaga o con el botón) que la clasificación, que mueve el
        semáforo de la bandeja.
  - [x] **Sigue sin `try/catch`, por diseño:** las dos funciones prometen no lanzar y esa promesa
        tiene test. Un `try/catch` aquí escondería la regresión en vez de romper el test.

## 12. Frontend — datos (`features/inbox/`)

- [x] `types.ts`: `CampoExtraido`; `DatosExtraidosDTO` gana `interes` y `confirmados`;
      `ConfirmarExtraccionDTO` nuevo.
- [x] `api.ts`: `confirmarDatosExtraidos(clienteId, campos)` → `POST /clientes/:id/extract/confirm`.
  - [x] **Ruta SIN el prefijo `/api`** (el `baseURL` ya lo aporta). Es el bug de HU-OMNI-02.
  - [x] **Sin `timeout: TIMEOUT_IA_MS`**: confirmar no llama al modelo, es una escritura en Mongo.
- [x] `hooks/useConfirmarExtraccion.ts`: mutación que invalida `['contact-history', clienteId]` y
      `['conversations']` (el nombre confirmado se pinta en la bandeja). Molde: `useUpdateContact.ts:12-24`.

## 13. Frontend — la tarjeta (`inbox/components/ContactExtractCard.tsx`)

> Antes de escribir el componente, invocar las tres skills de diseño (regla §7) y anotar el resultado.

- [x] Invocar `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`.
      **En este entorno solo la tercera está registrada**; las otras dos devuelven `Unknown skill`.
      Se aplican igualmente sus criterios desde conocimiento propio, como en HU-IA-04 y HU-IA-05.
- [x] Aplicar el resultado de la pasada de diseño (ver `plan.md` §4): **una** insignia en la cabecera
      («3 sin confirmar») en vez de cuatro por campo, y solo lo confirmado lleva marca.
- [x] Mantener el `<dl>` con `dt`/`dd`: es literalmente una lista de descripciones.
- [x] Cuatro campos: nombre completo, correo, teléfono, **interés**.
- [x] Estados por campo:
  - [x] **Sugerido** → valor + `Button variant="ghost" size="sm"` «Confirmar», con `aria-label` que
        nombra el campo («Confirmar el nombre completo»), no un genérico.
  - [x] **Confirmado** → valor + `Check` en `text-success` con `<span className="sr-only">Confirmado</span>`.
        Sin acción: es un hecho.
  - [x] **Sin dato** → «No aparece en la conversación» en cursiva (ya existe, L43). Sin acción.
  - [x] **Teléfono de WhatsApp** (`telefonoOrigen === 'whatsapp'`) → valor + la pista de
        `ORIGEN_LABEL`, **sin acción** (AC20).
- [x] **La ranura de la acción se reserva siempre**, aunque esté vacía: confirmar un campo no debe
      desplazar los de abajo.
- [x] **La acción está siempre visible, no en `hover`**: esconderla la haría invisible en táctil.
- [x] Pie: «Confirmar todo» (`default`) a la izquierda de «Volver a extraer» (`outline`, con su
      `RefreshCw` giratorio).
  - [x] «Confirmar todo» **solo si hay más de un campo sugerido**: con uno, duplicaría el botón que
        está tres líneas más arriba.
- [x] Copy, mismo verbo de principio a fin: botón «Confirmar» → `toast` «Nombre confirmado».
- [x] Omitidos: un **solo** `toast` que los nombre, nunca uno por campo. Texto que dice qué pasó sin
      disculparse: «Ya había un nombre registrado; no se sobrescribió.»
- [x] Sin animación de entrada (mismo criterio que `TagChip`); la única transición es la del `Check`,
      con `motion-reduce` respetado.
- [x] Conservar `pressable`, `shortTime`, `ORIGEN_LABEL`, los `Skeleton` con
      `aria-live="polite" aria-busy="true"` y el `<p role="alert">` de error.
- [x] shadcn ya vendorizado y suficiente: `badge` (variante `success` propia), `button`, `skeleton`,
      `tooltip`. **No instalar nada.**
- [x] Tokens semánticos, terminado en **claro y oscuro**, cero `bg-[#...]`.
- [x] **No tocar `ContactEditDialog`**: al confirmar, `Cliente.nombre`/`correoEnc` quedan escritos y
      `sugerir()` (L82-92) deja de marcar «Propuesto por la IA» solo. Dos fuentes de verdad para el
      mismo estado serían el error.

## 14. Documentación

- [x] `docs/data-model.md`: `clientes.datosExtraidos` con `interes`, `confirmados`, `confirmadoAt` y
      `confirmadoPor`, y la nota de que `confirmados` lista los campos **aplicados a la ficha**.
- [x] `docs/data-model.md`: `cliente.extract` y `cliente.extract-confirm` en la lista de acciones
      auditadas, con la nota de que el correo viaja como `[oculto]`.
- [x] `docs/api-contract.md` §6: documentar `POST /api/clientes/:id/extract` (**hoy no aparece**) y
      `POST /api/clientes/:id/extract/confirm` con sus códigos `400` / `403` / `404` / `409`.
- [x] `docs/domain.md` §4: los cuatro campos que captura la IA; el interés es texto libre que aterriza
      como atributo; `interesItemId` / `CatalogItem` **siguen sin implementar**.
- [x] `docs/integrations/llm-provider.md` L32-33: corregir la promesa de `mergeClienteSlots()`, que
      nunca existió — el merge es `confirmarDatosExtraidos()` y es **explícito**, no automático.

## Tests (Vitest)

Backend, `apps/backend/src/`:

- [x] `integrations/llm/gemini.provider.test.ts`: `extractSlots` pasa `systemInstruction` (AC3).
- [x] `services/ai/ai.service.test.ts`: `extract()` llama al proveedor con
      `instrucciones === template.systemPrompt` (AC3).
- [x] `scripts/migrate-extract-template.test.ts`: `--dry-run` no escribe; la global sube a `2.0.0`;
      una plantilla de tenant **no** se pisa (AC4).
- [x] `features/cliente/cliente.extract.test.ts`:
  - [x] El slot `interes` existe y su descripción declara que no es el nivel de interés (AC2).
  - [x] `interes` se recorta a 120 y las muletillas caen a `null` (AC1).
  - [x] Re-extraer con `correo: null` **conserva** el correo anterior (AC5).
  - [x] Un campo en `confirmados` conserva su valor pese a una extracción nueva distinta (AC6).
  - [x] El transcript se acota a `EXTRACT_MAX_MENSAJES` (AC14).
  - [x] `cliente.extract` se registra al cambiar un valor y **no** se registra si no cambió nada,
        con el correo como `[oculto]` (AC16, AC18).
  - [x] Confirmar `nombreCompleto` con la ficha vacía escribe `Cliente.nombre` (AC7).
  - [x] Confirmar `nombreCompleto` con nombre ya guardado **no lo pisa** y lo devuelve en `omitidos`
        (AC7, AC11).
  - [x] Confirmar `correo` sin subrol → `403` y **nada escrito**, ni siquiera el nombre pedido en el
        mismo lote (AC8).
  - [x] Confirmar `interes` crea el atributo `interes`; con el atributo ya presente, se omite (AC9).
  - [x] Confirmar `telefono` de origen `whatsapp` → `400`; de origen `conversacion` → atributo
        `telefono-alterno` (AC10).
  - [x] `confirmados` solo recoge los **aplicados**, nunca los omitidos.
  - [x] `cliente.extract-confirm` se registra con el actor real y el correo como `[oculto]`
        (AC17, AC18).
  - [x] Sin `datosExtraidos` → `409`; contacto inexistente → `404`.
- [x] `features/ai/ai-extract.service.test.ts`:
  - [x] `EXTRACT_AUTO=off` → no llama al modelo ni escribe (AC13).
  - [x] Menos de `EXTRACT_MIN_TURNOS_CLIENTE` turnos del cliente → no corre (AC12).
  - [x] Con nombre, correo e interés ya encontrados → **no vuelve a correr** (AC12, AC14).
  - [x] **Con solo el teléfono lleno sí corre**: el test que blinda el fallo de `CAMPOS_AUTO`.
  - [x] Sin mensajes nuevos desde `extraidoAt` → no corre (AC12).
  - [x] Un fallo del proveedor se registra como `warn` y **no propaga** (AC15).
  - [x] Al escribir, publica `conversation:updated` (AC21).
- [x] `features/ai/ai-extract.isolation.test.ts`: la extracción automática de tenantA no lee ni
      escribe clientes ni mensajes de tenantB (AC22).
- [x] `features/cliente/` (aislamiento): `POST /clientes/:id/extract/confirm` de un contacto de
      tenantA responde `404` con un token de tenantB (AC22).
- [x] `workers/ai-reply.processor.test.ts`: `extraerDatosSiHaceFalta` se llama tras
      `clasificarYAplicarSemaforo` y su fallo no rompe el auto-reply (AC15).

Frontend, `apps/frontend/src/features/inbox/components/ContactExtractCard.test.tsx`:

- [x] Un campo sugerido muestra «Confirmar»; uno confirmado muestra la marca y **no** la acción (AC19).
- [x] El teléfono de origen `whatsapp` **no** ofrece «Confirmar» (AC20).
- [x] Un campo sin dato muestra «No aparece en la conversación» y nada que pulsar (AC19).
- [x] La cabecera cuenta los pendientes; con cero pendientes la insignia no se pinta.
- [x] «Confirmar todo» no aparece con un solo campo sugerido.
- [x] Un campo omitido dispara un `toast` que lo explica.

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` en verde.
- [x] `pnpm --filter @sofiapp/api test` en verde: **808 pasan, 85 archivos** (eran 758 en 81).
- [x] `pnpm --filter @sofiapp/web build` en verde.
- [x] `pnpm --filter @sofiapp/web lint` en verde.
- [x] `pnpm --filter @sofiapp/web test` en verde: **556 pasan, 32 archivos**.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 completo.
- [x] Repaso cruzado spec ↔ tests: los 24 criterios de aceptación tienen su verificación.
- [x] Cero `any` y tipos de retorno explícitos en todo lo exportado.
- [x] `git status` sin `*.png`/`*.jpg` colados (capturas de verificación borradas).
- [x] `spec.md` pasa a `**Estado:** implementado`.

### Manual (tenant real, Sofi encendida en la conversación)

- [ ] Escribir por WhatsApp un mensaje con nombre, correo e interés; sin abrir la ficha, comprobar
      que `datosExtraidos` aparece con los cuatro campos tras la respuesta de Sofi.
- [ ] Abrir la ficha: los tres confirmables muestran su acción; el teléfono, no.
- [ ] Confirmar el nombre → entra en la ficha y en la bandeja, y el campo pasa a *Confirmado*.
- [ ] Escribir a mano un correo distinto y confirmar el extraído → se omite y el `toast` lo dice.
- [ ] «Volver a extraer» sobre un hilo donde el correo ya no se menciona → el correo sigue ahí.
- [ ] `EXTRACT_AUTO=off` y reiniciar el worker → ninguna extracción, y la respuesta de Sofi sale igual.
- [ ] Con un usuario `coordinator`: el correo se ve enmascarado, confirmarlo devuelve `403` y
      confirmar el nombre funciona.
- [ ] La tarjeta, revisada en **claro y oscuro**.

> **Pendientes, y por qué.** El bloque manual exige un tenant real con WhatsApp conectado, Redis y
> un worker vivo: nada de eso existe en este entorno, así que queda sin marcar en vez de darlo por
> bueno. Lo que sí está cubierto por tests automáticos es cada regla que ese bloque comprobaría a
> mano —las cuatro guardas, el merge, los cuatro códigos de error de la confirmación, el gate por
> subrol y el aislamiento—, así que lo manual verifica la integración, no la lógica.

## Definición de "hecho"

Un cliente se presenta por WhatsApp y dice qué quiere. Sofi le responde y, sin que nadie abra el
hilo, su ficha queda con los cuatro datos leídos de la conversación y marcados como sugeridos. El
asesor entra, pulsa «Confirmar todo» y el nombre, el correo y el interés pasan a ser datos reales del
contacto — salvo los que ya estaban escritos a mano, que no se tocan y se dicen en voz alta. Volver a
extraer mañana no borra nada de eso. Y si la extracción falla o se apaga, el cliente recibe su
respuesta igual.
