# HU-IA-06 — Extraer nombre, teléfono, correo e interés (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Completa lo que HU-OMNI-03 dejó a medias: la extracción existe desde entonces,
> pero el dato extraído nunca llega a la ficha. Esta historia es el puente que faltaba, y el que
> `docs/integrations/llm-provider.md` lleva prometiendo desde HT-AI-01.

**Estado:** implementado

## Objetivo

Que los datos que el cliente ya dijo por WhatsApp **dejen de vivir aparte de su ficha**. Hoy la IA
los encuentra, los guarda en un subdocumento y ahí se quedan: `Cliente.nombre` sigue vacío aunque el
cliente se haya presentado en el segundo mensaje.

El valor no está en «extraer» — eso ya funciona. Está en tres cosas que no:

1. Que la extracción ocurra **sin que nadie pulse un botón**, porque nadie lo pulsa.
2. Que lo extraído se pueda **confirmar** y pase a ser dato real del contacto, con una sola acción.
3. Que confirmar **jamás pise** lo que escribió una persona, y que volver a extraer no borre lo que
   la pasada anterior encontró.

Y un cuarto campo: **qué quiere comprar el cliente**. Hoy se extraen nombre, correo y teléfono; el
interés comercial —el producto o servicio concreto por el que pregunta— no se captura en ninguna
parte, ni siquiera como texto.

## Punto de partida: qué ya existe

Verificado en el código, no asumido. Todo lo de esta tabla se **reutiliza**; nada se rehace.

| Pieza | Dónde vive hoy |
|---|---|
| Puerto de extracción del LLM | `ILlmProvider.extractSlots()` (`llm-provider.types.ts:51-54`), tipo `SlotSpec` (L11-16) |
| Salida estructurada de Gemini | `slotSpecToSchema()` + `responseSchema` (`gemini.provider.ts:57-78`, 127-150) |
| Reintentos y timeout del proveedor | `callWithRetry` (`gemini.provider.ts:213-230`), 3 intentos, `AbortSignal.timeout(LLM_TIMEOUT_MS)` |
| Servicio genérico de extracción | `AIService.extract<T>()` con parseo Zod (`ai.service.ts:133-149`) |
| Turno de tarea que Gemini exige | `conTurnoDeTarea()` (`ai.service.ts:59-67`) |
| Resolución de plantilla tenant → global | `resolveTemplate()` (`ai.service.ts:226-241`) |
| Plantilla `extract` global sembrada | `seed-prompt-templates.ts:145-156` (v1.0.0), siembra idempotente con `$setOnInsert` |
| Molde de migración de plantilla | `CLASSIFY_TEMPLATE_VERSION` + `scripts/migrate-classify-template.ts` (HU-IA-05) |
| Los tres slots actuales | `DATOS_CONTACTO_SLOTS` (`cliente.service.ts:397-422`) |
| Saneamiento de la salida del modelo | `SIN_DATO` + `textoLlm` + `datosExtraidosSchema` (`cliente.service.ts:424-450`) |
| Extracción completa, bajo demanda | `extractContactData()` (`cliente.service.ts:457-513`) |
| Fallback de teléfono y su origen | `TelefonoOrigen` (`cliente.types.ts:41`), lógica en `cliente.service.ts:486-490` |
| Subdocumento persistido | `Cliente.datosExtraidos` (`cliente.model.ts:97-113`), tipos en `cliente.types.ts:29-38` |
| Enmascarado del correo por subrol | `toDatosExtraidosResponse()` (`cliente.service.ts:180-194`) + `maskCorreo` (`mask.util.ts:15-25`) |
| Gate por campo, no por ruta | `updateCliente()` con `CAMPOS_SENSIBLES` y `SENSIBLE_MARKER` (`cliente.service.ts:242-258`, 330-340) |
| Atributos personalizados del contacto | `IAtributoPersonalizado`, `atributos` (`cliente.model.ts:62`), `AtributosEditor` + `slugificar` en el frontend |
| Endpoint de extracción | `POST /api/clientes/:id/extract` (`cliente.routes.ts:28-35`), `extractSchema` (`cliente.validation.ts:18-22`) |
| Bitácora tenant-scoped | `recordAuditEvent()` (`audit.service.ts:32`), `AuditAccion` (`audit.types.ts:3-12`), `actorId: null` = el sistema |
| Molde de servicio de IA que nunca lanza | `clasificarYAplicarSemaforo()` (`ai-semaforo.service.ts:68-166`) con sus guardas y su `logger.warn` |
| Molde de interruptor y umbrales por `.env` | `SEMAFORO_AUTO` / `SEMAFORO_MIN_TURNOS_CLIENTE` (`config/env.ts`) |
| Punto de enganche en el worker | `processAiReplyJob` (`ai-reply.processor.ts:145-152`), una ejecución por ráfaga agrupada |
| Tiempo real hacia la ficha | `publishRealtime({ type: 'conversation:updated' })` → `useInboxRealtime` ya invalida `['contact-history', id]` (L29-35) |
| Tarjeta de extracción en la ficha | `ContactExtractCard` (`inbox/components/ContactExtractCard.tsx`), montada en `ContactPanel.tsx:117-126` |
| Hook de extracción | `useExtractContactData` (`inbox/hooks/useContactHistory.ts:31-37`) |
| Merge local de sugerencias | `sugerir()` + `PistaIA` (`contacts/components/ContactEditDialog.tsx:82-92`, 442-451) |
| Badge con variante propia | `components/ui/badge.tsx` (variante `success`, añadida por el proyecto) |

## Los huecos reales (verificados en el código)

1. **No hay cuarto campo.** `DATOS_CONTACTO_SLOTS` (`cliente.service.ts:397-422`) tiene tres slots:
   `nombreCompleto`, `correo`, `telefono`. El interés comercial no se pide, no se guarda y no se
   muestra.

2. **La plantilla `extract` es texto muerto.** `ai.service.ts:135` llama a
   `resolveTemplate(params.tenantId, 'extract')` y **descarta el resultado** (`await` sin asignar);
   `ILlmProvider.extractSlots` (`llm-provider.types.ts:51-54`) no admite instrucciones y el
   `getGenerativeModel` de `gemini.provider.ts:133-136` no manda `systemInstruction`. El prompt sembrado en
   `seed-prompt-templates.ts:149-154` **nunca llega al modelo**. Es el mismo agujero que HU-IA-05
   cerró en `classify` — el propio código lo admite en `cliente.service.ts:393-395`: «las
   descripciones SON el prompt efectivo». Consecuencia: ningún tenant puede afinar su extracción.

3. **Re-extraer borra lo encontrado.** `cliente.service.ts:502-508` escribe `{ datosExtraidos }`
   **entero**. Si la primera pasada encontró el correo y la segunda no, el correo se pierde. Es un
   reemplazo donde el AC1 de la historia pide un merge.

4. **No existe el estado «sugerido / confirmado».** `IDatosExtraidos` (`cliente.types.ts:29-38`) no
   tiene ninguna marca de confirmación, y no hay endpoint que mueva un dato extraído a
   `Cliente.nombre` / `correoEnc`. El único puente es `ContactEditDialog.sugerir()`
   (`ContactEditDialog.tsx:82-92`), un merge **local** que ni persiste ni marca nada: si el asesor
   cierra el diálogo sin guardar, la sugerencia se evapora.

5. **`mergeClienteSlots()` está documentado pero no existe.**
   `docs/integrations/llm-provider.md:32-33` promete un «merge parcial que NO sobrescribe campos ya
   completados». `grep` sobre `apps/` no lo encuentra. La doc describe una función que nadie escribió.

6. **La extracción nunca corre sola.** El único disparador es el botón de la tarjeta. El
   «automáticamente» de la historia no se cumple: si nadie abre la ficha y pulsa, el correo que el
   cliente dictó sigue sin existir para el CRM.

7. **El transcript no está acotado.** `cliente.service.ts:465-467` carga **todos** los mensajes del
   hilo, sin límite. En una conversación larga eso es coste y ventana de contexto sin techo.

8. **La extracción no se audita.** A diferencia de `updateCliente` (`cliente.service.ts:369-376`),
   escribir `datosExtraidos` no deja `AuditEvent`. Es una mutación de datos del contacto sin rastro,
   contra la regla del proyecto.

9. **`interesItemId` y `CatalogItem` son documentación sin implementación.** `docs/domain.md:57` y
   `docs/data-model.md:116,199-214` los describen; en `apps/` solo hay dos declaraciones muertas
   (`cliente.model.ts:56`, con `ref: 'CatalogItem'` a un modelo **no registrado**, y
   `cliente.types.ts:135`). Nada los escribe ni los lee. Cualquier lectura de «interés» que dependa
   de ese catálogo está bloqueada por un slice que no existe.

## Qué es «interés», y por qué

La historia pide extraer «interés» como cuarto campo. En el repositorio ese nombre está ocupado tres
veces, y ninguna de las tres es lo que pide la historia:

| Candidato | Qué es en realidad | Por qué no sirve aquí |
|---|---|---|
| `Cliente.nivelInteres` | La **temperatura** del prospecto. Es una `key` del catálogo `contact_options` de tipo `interes`, cuyos colores de fábrica son un semáforo térmico frío/tibio/caliente (`docs/data-model.md:530`) | Ya la produce HU-IA-05 en `semaforoIA.nivelInteres`, y HU-IA-05 decidió **a conciencia** no escribirla: es un campo de catálogo que edita una persona. Además `slotSpecToSchema` (`gemini.provider.ts:57-78`) **no soporta `enum`**, así que el modelo no puede devolver una clave cerrada |
| `Cliente.objecionPrincipal` | Por qué **no** compra | Es lo contrario de un interés, y vive en el mismo catálogo con la misma decisión de HU-IA-05 detrás |
| `Cliente.interesItemId` | El ítem del catálogo de productos del tenant | El modelo `CatalogItem` **no existe** (hueco 9). Atarse a él bloquearía esta historia detrás de un slice completo sin planear |

Lo que la historia pide, leído junto a `nombre`, `teléfono` y `correo`, es **un dato de contacto
más**: qué producto o servicio concreto está pidiendo el cliente, tal como lo dice. Por eso:

> **El «interés» de esta historia es texto libre** («curso pre-ICFES sabatino», «apartamento de dos
> habitaciones en Laureles»), extraído literalmente de la conversación, de como mucho 120
> caracteres. Al confirmarse aterriza como **atributo personalizado** del contacto
> (`{ key: 'interes', label: 'Interés', sensible: false }`).

Los `atributos` de HU-CRM-02 son el mecanismo de extensión que el proyecto ya eligió para los «datos
verticales específicos del tenant», y superan explícitamente a `customFields`
(`docs/data-model.md`). Usarlos aquí no añade ni un campo a `Cliente`, ni una migración, ni una
columna a `IContactCardResponse`: el `AtributosEditor` y el `PATCH /api/clientes/:id` que ya existen
lo editan y lo borran sin tocar nada. Y el día que exista `CatalogItem`, una HU posterior puede
resolver ese texto contra el catálogo sin haber inventado antes un campo que estorbe.

## Alcance

Incluye:

**Backend — cerrar el hueco de la plantilla**
- `extractSlots()` gana `instrucciones` **obligatorio** y `GeminiProvider` lo pasa como
  `systemInstruction`. `AIService.extract()` deja de descartar la plantilla que ya resuelve.
- Plantilla `extract` **v2.0.0** con las reglas del cuarto campo y la prohibición de deducir, más su
  script de migración (molde exacto: `migrate-classify-template.ts`).

**Backend — el cuarto campo y el merge**
- Slot `interes` en `DATOS_CONTACTO_SLOTS` y su saneamiento en `datosExtraidosSchema`.
- `IDatosExtraidos` gana `interes`, `confirmados`, `confirmadoAt` y `confirmadoPor`.
- La extracción pasa a **fusionar**: un `null` nuevo no borra un valor viejo, y un campo confirmado
  conserva su valor confirmado.
- El transcript se acota a los `EXTRACT_MAX_MENSAJES` más recientes, en los dos caminos.
- La extracción deja `AuditEvent` `cliente.extract`, **solo cuando algún valor cambia**.

**Backend — la confirmación**
- `confirmarDatosExtraidos()`: merge **no destructivo** hacia la ficha, con el gate por campo del
  correo, el interés como atributo y el teléfono que nunca pisa la identidad del canal.
- `POST /api/clientes/:id/extract/confirm` con la cadena de middlewares fija.
- `AuditAccion` gana `cliente.extract` y `cliente.extract-confirm`.

**Backend — la extracción automática**
- Slice `ai-extract` en `features/ai/`: `extraerDatosSiHaceFalta()`, hermano de
  `clasificarYAplicarSemaforo()`, con sus guardas y su promesa de no lanzar nunca.
- Tres variables de entorno: interruptor, mínimo de turnos del cliente y tope de mensajes.
- Enganche en `processAiReplyJob`, después de la clasificación de HU-IA-05.

**Frontend**
- `ContactExtractCard` reescrita: cuatro campos, estado **sugerido / confirmado** por campo,
  «Confirmar» por campo, «Confirmar todo» y «Volver a extraer».

**Documentación**
- `docs/data-model.md`: los campos nuevos de `datosExtraidos` y las dos acciones auditadas.
- `docs/api-contract.md` §6: el endpoint de confirmación y el de extracción, **que hoy no está
  documentado**.
- `docs/domain.md` §4: qué captura la IA, y que `interesItemId`/`CatalogItem` siguen sin implementar.
- `docs/integrations/llm-provider.md`: corregir la promesa de `mergeClienteSlots()`.

Fuera de alcance:

- **Implementar `CatalogItem` / `interesItemId`.** Es un slice completo —modelo, CRUD, pantalla— que
  el data-model especifica y el backend no tiene. Atar el interés a un catálogo inexistente
  convertiría esta historia en otra. Queda dicho aquí, no descubierto después.
- **Promover `nivelInteres` / `objecionPrincipal`** desde `semaforoIA` hacia la ficha. HU-IA-05 lo
  dejó fuera a conciencia («un worker por mensaje revirtiendo lo que una persona escribió es una
  regresión en HU-CRM-02») y esa razón sigue en pie: son claves de catálogo validadas por
  `assertOpcionesValidas`, no texto libre. Es su propia historia.
- **Extraer el documento de identidad.** Ningún criterio lo pide y es el dato más sensible de la
  ficha; el coste de un falso positivo no lo compensa.
- **Escribir `Cliente.telefono`.** Es la identidad del canal y `upsertByMetaUser` lo resincroniza
  desde Meta en cada mensaje entrante (`docs/api-contract.md:91`): escribirlo sería una corrección
  que el siguiente mensaje deshace.
- **Caché Redis para `extract`.** Las guardas ya acotan el gasto, y una clave sobre el transcript
  completo casi nunca acertaría dos veces.
- **Backfill del histórico.** No hay reproceso: la extracción automática empieza a correr con el
  siguiente mensaje de cada conversación.
- **Extraer con Sofi apagada.** El enganche vive en el ciclo de auto-reply, que solo corre con
  `iaHabilitada: true`. El botón sigue disponible para esas conversaciones. Misma limitación
  declarada que HU-IA-05, y por el mismo motivo.
- **Configurar los slots por tenant.** `extractSchema` sigue sin cuerpo: qué se extrae es producto,
  no dato del cliente. Lo que sí gana el tenant es el prompt, vía plantilla.

## Criterios de aceptación

1. **Existe el cuarto campo y está acotado.** `DATOS_CONTACTO_SLOTS` incluye `interes`; la salida se
   recorta a 120 caracteres y pasa por el mismo `textoLlm`/`SIN_DATO` que los demás, de modo que
   «no especificado» y sus variantes se guardan como `null`, no como texto.
2. **«Interés» no es «nivel de interés».** La descripción del slot y la plantilla dicen
   explícitamente que se pide el producto o servicio que el cliente menciona, **no** cómo de
   interesado está. Un test comprueba que la descripción del slot lo declara.
3. **La plantilla `extract` llega al modelo.** `extract()` pasa el `systemPrompt` de la plantilla
   resuelta como instrucción del sistema y `extractSlots` la exige como parámetro **obligatorio**;
   un test lo comprueba sobre el doble del proveedor. Cierra el hueco 2.
4. **La versión de la plantilla sube a `2.0.0`** y existe un script de migración que la actualiza en
   bases ya sembradas, sin pisar las plantillas personalizadas por un tenant.
5. **Volver a extraer no borra lo encontrado.** Si la extracción anterior halló el correo y la nueva
   devuelve `null`, el correo **se conserva**. Cierra el hueco 3.
6. **Un campo confirmado no se re-sugiere ni se pisa.** Una nueva extracción sobre un campo que ya
   está en `confirmados` deja intacto el valor confirmado y la marca.
7. **Confirmar escribe en la ficha sin pisar datos guardados.** `confirmarDatosExtraidos` escribe
   `Cliente.nombre` **solo si está vacío**. Si ya había un nombre, no lo toca y lo devuelve en
   `omitidos`. Es el AC1 de la historia, verificado en las dos direcciones.
8. **El correo confirmado respeta el gate por subrol.** Confirmar `correo` sin permiso para datos
   sensibles responde `403` **sin escribir nada** del resto de campos pedidos — todo o nada, igual
   que `updateCliente`.
9. **El interés confirmado aterriza como atributo.** Queda como
   `{ key: 'interes', label: 'Interés', valor, sensible: false }`, y si el contacto ya tiene un
   atributo con esa `key`, no se duplica ni se sobrescribe: se omite.
10. **El teléfono nunca escribe `Cliente.telefono`.** Un teléfono dictado en la conversación
    (`telefonoOrigen: 'conversacion'`) se confirma como atributo `telefono-alterno`; uno de origen
    `whatsapp` **no es confirmable** y el endpoint lo rechaza con `400`.
11. **Confirmar dice qué hizo.** La respuesta trae `aplicados` y `omitidos`, de forma que la UI puede
    explicar por qué un campo no se escribió en vez de mentir con un éxito silencioso.
12. **La extracción automática corre con guardas.** El worker extrae solo si `EXTRACT_AUTO` está en
    `on`, hay al menos `EXTRACT_MIN_TURNOS_CLIENTE` mensajes del cliente, **falta** algún campo por
    encontrar y **hay mensajes nuevos** desde `extraidoAt`. Cada guarda tiene su test.
13. **Interruptor.** Con `EXTRACT_AUTO=off` no se llama al modelo ni se escribe nada, y el
    auto-reply se comporta exactamente como antes de esta historia.
14. **Coste acotado.** El transcript se limita a `EXTRACT_MAX_MENSAJES`; la extracción corre **una
    vez por ráfaga agrupada** (`AI_REPLY_WINDOW_MS`), no una por mensaje; y cuando nombre, correo e
    interés ya están encontrados, **no vuelve a correr sola nunca más**.
15. **Nunca rompe el auto-reply.** Un fallo de la extracción (timeout, 500 del proveedor, plantilla
    ausente) se registra como `warn` y la respuesta al cliente sale igual. Test explícito.
16. **La extracción es auditable.** Deja `AuditEvent` `cliente.extract` con `actorId` real cuando la
    dispara el botón y `null` cuando la dispara el worker, y **solo cuando algún valor cambia**
    respecto de la extracción anterior — para no inundar `audit_events` con un evento por ráfaga.
17. **La confirmación es auditable.** Deja `AuditEvent` `cliente.extract-confirm` con el `actorId` de
    quien confirmó, los campos aplicados y los omitidos.
18. **La bitácora no filtra el correo.** En los dos eventos el correo viaja como `[oculto]`
    (`SENSIBLE_MARKER`), nunca en claro: `audit_events` no tiene control de acceso por subrol, como
    ya fija `docs/data-model.md`.
19. **La tarjeta distingue sugerido de confirmado.** Cada campo con valor muestra su estado y, si
    está sugerido, la acción para confirmarlo; un campo sin dato mantiene el texto actual «No aparece
    en la conversación» y no ofrece nada que pulsar.
20. **El teléfono de WhatsApp no se ofrece para confirmar.** Cuando `telefonoOrigen` es `whatsapp`,
    el campo se pinta como informativo: confirmarlo no aportaría nada que el contacto no tenga ya.
21. **La ficha se refresca sola.** Tras una extracción automática, el panel abierto muestra los datos
    nuevos sin recargar, por `conversation:updated` — que `useInboxRealtime` ya invalida contra
    `['contact-history', id]`. **Sin cambios en el frontend de tiempo real.**
22. **Aislamiento multi-tenant.** El endpoint de confirmación de un contacto de tenantA responde
    `404` con un token de tenantB; la extracción automática de un tenant no lee ni escribe clientes,
    mensajes ni eventos de otro. Toda lectura y escritura nueva pasa por el repositorio `*Scoped` y
    el `tenantId` nace del token (o del job, que lo resolvió por `MetaIntegration`). Test de
    aislamiento añadido y en verde.
23. **Backend en verde:** `pnpm --filter @sofiapp/api typecheck` (`tsc --noEmit`) y
    `pnpm --filter @sofiapp/api test` sin errores ni regresiones.
24. **Frontend en verde:** `pnpm --filter @sofiapp/web build`, `lint` y `test` sin errores, con la
    tarjeta terminada en claro y oscuro usando los tokens semánticos del proyecto y sin utilidades
    de color arbitrarias.

## Definition of Done

Un cliente escribe por WhatsApp: «Hola, soy Diego Ramírez, me interesa el curso pre-ICFES sabatino;
me escriben a diego@empresa.com». Sofi le responde y, **sin que nadie abra el hilo**, la ficha del
contacto queda con cuatro datos extraídos y marcados como sugeridos.

Cuando un asesor abre la ficha, ve los cuatro con su estado. Pulsa «Confirmar todo»: el nombre entra
en la ficha, el correo también (porque su subrol se lo permite), el interés queda como atributo
«Interés: curso pre-ICFES sabatino», y el teléfono se deja como está porque es el mismo número desde
el que escribe. Los tres confirmables pasan a *Confirmado*.

Si el contacto **ya tenía** un nombre escrito a mano, ese nombre no se toca: la tarjeta lo dice
—«Ya había un nombre registrado; no se sobrescribió»— en vez de fingir que lo aplicó. Y si mañana el
cliente da un teléfono alterno y la extracción vuelve a correr, el correo y el nombre confirmados
siguen exactamente donde estaban.

## Dependencias

- `HT-AI-01` — `AIService`, `ILlmProvider`, `GeminiProvider`, `prompt_templates` y `resolveTemplate`
  → **cerrado**. Esta historia **modifica** el contrato de `extractSlots()`, igual que HU-IA-05 hizo
  con `classifyLead()`.
- `HU-OMNI-03` — `extractContactData()`, `Cliente.datosExtraidos`, `ContactExtractCard` y
  `GET /clientes/:id/history` → **cerrada**. Es la base que esta historia completa.
- `HU-CRM-02` — `atributos`, el gate por subrol de los datos sensibles, `SENSIBLE_MARKER`,
  `PATCH /api/clientes/:id` y `ContactEditDialog` → **cerrada**. De aquí sale dónde aterriza el
  interés y cómo se protege el correo.
- `HU-IA-01` / `HU-IA-02` — cola `ai-reply`, `processAiReplyJob` como función pura y la agrupación de
  ráfagas por `ventanaJobId` → **implementado** en `feat/HU-IA-01`.
- `HU-IA-05` — el molde entero: cerrar el hueco de la plantilla, el servicio de IA que nunca lanza,
  las guardas por `.env`, el enganche al final del worker y el criterio de auditar solo cuando algo
  cambia → **implementado**; esta historia se construye encima, en la misma rama.
- `HU-OMNI-02` — `audit_events`, `recordAuditEvent` y el actor `null` para el sistema → **cerrada**.
- `HU-OMNI-04` — `publishRealtime` / `useInboxRealtime`, que ya invalida la ficha → **cerrada**.
