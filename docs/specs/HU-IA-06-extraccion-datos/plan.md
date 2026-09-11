# HU-IA-06 — Plan técnico (CÓMO)

> Se construye **sobre `feat/HU-IA-01`**, sin rama nueva.
>
> **El slice `ai-extract` no tiene `model.ts`, ni controller, ni routes.** Escribe sobre `Cliente`
> y solo lo llama el worker; no le corresponde colección propia ni espacio de URL. Es la misma
> desviación consciente del patrón de 6 archivos que ya documentaron HU-IA-04 y HU-IA-05, y por el
> mismo motivo. Los dos endpoints de esta historia viven en `features/cliente/`, junto al `extract`
> que ya existe. **Ningún modelo nuevo, ninguna colección nueva, ningún índice nuevo.**

## Archivos a crear

```
apps/backend/src/features/ai/
├── ai-extract.service.ts             # [CREAR] extraerDatosSiHaceFalta(): guardas + delegación
├── ai-extract.service.test.ts        # [CREAR] las cuatro guardas, el fallo silencioso
└── ai-extract.isolation.test.ts      # [CREAR] la extracción automática no cruza de tenant

apps/backend/src/features/cliente/
└── cliente.extract.test.ts           # [CREAR] merge, confirmación, gate por subrol, auditoría

apps/backend/src/scripts/
├── migrate-extract-template.ts       # [CREAR] sube la plantilla extract a v2.0.0
└── migrate-extract-template.test.ts  # [CREAR] molde: migrate-classify-template.test.ts

apps/frontend/src/features/inbox/
├── components/ContactExtractCard.test.tsx  # [CREAR] estados sugerido/confirmado/vacío/omitido
└── hooks/useConfirmarExtraccion.ts         # [CREAR] mutación + invalidaciones
```

## Archivos a modificar

```
apps/backend/src/
├── integrations/llm/
│   ├── llm-provider.types.ts        # [MODIFICAR] extractSlots: +instrucciones (obligatorio)
│   └── gemini.provider.ts           # [MODIFICAR] extractSlots pasa systemInstruction
├── services/ai/
│   └── ai.service.ts                # [MODIFICAR] extract() deja de descartar la plantilla
├── seed/seed-prompt-templates.ts    # [MODIFICAR] plantilla extract v2.0.0 + EXTRACT_TEMPLATE_VERSION
├── config/env.ts                    # [MODIFICAR] EXTRACT_AUTO / _MIN_TURNOS_CLIENTE / _MAX_MENSAJES
├── features/cliente/
│   ├── cliente.types.ts             # [MODIFICAR] CampoExtraido, IDatosExtraidos, DTOs de confirmación
│   ├── cliente.model.ts             # [MODIFICAR] subdoc datosExtraidos: interes + confirmados + quién/cuándo
│   ├── cliente.service.ts           # [MODIFICAR] 4.º slot, merge, auditoría, confirmarDatosExtraidos
│   ├── cliente.validation.ts        # [MODIFICAR] confirmarExtraccionSchema
│   ├── cliente.controller.ts        # [MODIFICAR] confirmarExtraccionController
│   └── cliente.routes.ts            # [MODIFICAR] POST /:id/extract/confirm
├── features/audit/audit.types.ts    # [MODIFICAR] AuditAccion += cliente.extract, cliente.extract-confirm
└── workers/ai-reply.processor.ts    # [MODIFICAR] engancha la extracción tras la clasificación

apps/backend/package.json            # [MODIFICAR] script migrate:extract-template

apps/frontend/src/features/inbox/
├── types.ts                         # [MODIFICAR] CampoExtraido, DatosExtraidosDTO, ConfirmarExtraccionDTO
├── api.ts                           # [MODIFICAR] confirmarDatosExtraidos(clienteId, campos)
└── components/ContactExtractCard.tsx # [MODIFICAR] cuatro campos con estado y acción por campo

docs/
├── data-model.md                    # [MODIFICAR] clientes.datosExtraidos + 2 acciones auditadas
├── api-contract.md                  # [MODIFICAR] §6: /extract (sin documentar hoy) y /extract/confirm
├── domain.md                        # [MODIFICAR] §4: qué captura la IA; CatalogItem sigue sin existir
└── integrations/llm-provider.md     # [MODIFICAR] corregir la promesa de mergeClienteSlots()
```

---

## 1. El puerto del LLM: que la plantilla llegue al modelo

### 1.1 `llm-provider.types.ts`

```ts
export interface ILlmProvider {
  extractSlots(input: {
    historial: ChatTurn[];
    camposObjetivo: SlotSpec[];
    /**
     * `systemPrompt` de la plantilla `extract` activa. **Obligatorio, no opcional**: hasta HU-IA-06
     * este parámetro no existía y la plantilla que `extract()` resolvía nunca llegaba al modelo
     * (era texto muerto, igual que pasó con `classify` antes de HU-IA-05). Hacerlo opcional dejaría
     * vivo ese mismo agujero, y el fallo es silencioso — el modelo responde igual, solo que sin criterio.
     */
    instrucciones: string;
  }): Promise<LlmCallResult<SlotResult>>;
  // …el resto sin cambios
}
```

> **Por qué obligatorio.** Es literalmente la nota que HU-IA-05 dejó en `classifyLead`
> (`llm-provider.types.ts:57-63`). Copiar el criterio, no reinventarlo.

### 1.2 `gemini.provider.ts`

En `extractSlots` (hoy L133-136), añadir `systemInstruction` al `getGenerativeModel`, exactamente
como ya hacen `generateReply` (L119) y `classifyLead` (L166):

```ts
const model = this.genAI.getGenerativeModel({
  model: env.GEMINI_MODEL,
  systemInstruction: input.instrucciones,
  generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
});
```

> **`slotSpecToSchema` no se toca.** Sigue soportando solo STRING/NUMBER/BOOLEAN, y el cuarto campo
> es texto, así que no hace falta añadir `enum` ni `nullable`. Ampliarlo «por si acaso» sería
> alcance que nadie pidió; el día que un slot necesite una unión cerrada, esa HU lo añade con su test.

### 1.3 `ai.service.ts` — `extract()`

```ts
async extract<T>(params: AiExtractParams): Promise<AiResult<T>> {
  const start = Date.now();
  const template = await this.resolveTemplate(params.tenantId, 'extract');   // ← ya no se descarta

  const { result, usage } = await this.provider.extractSlots({
    historial: conTurnoDeTarea(params.historial, TAREA_EXTRACT),
    camposObjetivo: params.camposObjetivo,
    instrucciones: template.systemPrompt,
  });
  // …resto igual
}
```

> **Un solo cambio de una línea y media.** El `await` sin asignar de `ai.service.ts:135` ya pagaba la
> lectura de Mongo; solo faltaba usar el resultado. No hay caché que invalidar aquí: `extract()`
> **no cachea** (a diferencia de `chat` y `classify`), así que el bump de versión no arrastra
> entradas viejas.

### 1.4 La plantilla `extract` v2.0.0

`seed-prompt-templates.ts`: `export const EXTRACT_TEMPLATE_VERSION = '2.0.0';`, gemelo de
`CHAT_TEMPLATE_VERSION` (L16) y `CLASSIFY_TEMPLATE_VERSION` (L45), y usarlo en la plantilla.

El `systemPrompt` conserva lo que ya dice (roles `user`/`model`, no deducir, dejar vacío lo que no
aparezca) y añade:

- **Qué es el interés:** el producto, servicio, plan o programa **concreto** que el cliente pide o
  por el que pregunta, con sus palabras y como mucho una frase corta. **No** es cómo de interesado
  está: «muy interesado», «caliente» o «quiere comprar» **no** son respuestas válidas.
- **Un solo interés:** el más reciente y específico. Si menciona varios, el que esté negociando.
- **Nada de inventar:** si la conversación solo tiene saludos, los cuatro campos van vacíos.
- **Nada de reformular el correo ni el teléfono:** se copian literalmente.

`scripts/migrate-extract-template.ts`, molde exacto de `migrate-classify-template.ts`:

- `--dry-run` por defecto; actualiza `systemPrompt` + `version` de `{ tenantId: null, method: 'extract' }`.
- Informa de cuántas plantillas **de tenant** quedaron en la versión vieja y **no las pisa**: son
  personalizaciones del cliente.
- Sin esto el seed (`$setOnInsert`, L160-167) no actualiza nada en bases ya sembradas.
- Script `migrate:extract-template` en `apps/backend/package.json`, junto a los otros dos.

---

## 2. El cuarto campo, el merge y la auditoría (`features/cliente/`)

### 2.1 `cliente.types.ts`

```ts
/** Los cuatro campos que la IA extrae. El orden es el de la tarjeta. */
export type CampoExtraido = 'nombreCompleto' | 'correo' | 'telefono' | 'interes';

export interface IDatosExtraidos {
  nombreCompleto: string | null;
  correo: string | null;
  /** Nunca es `null`: si la conversación no dicta ninguno, cae al número de WhatsApp del contacto. */
  telefono: string;
  telefonoOrigen?: TelefonoOrigen;
  /**
   * Qué pide el cliente, con sus palabras («curso pre-ICFES sabatino»). Texto libre de <= 120
   * caracteres, NO el nivel de interés: eso es `semaforoIA.nivelInteres` (HU-IA-05) y vive aparte.
   * Opcional en lectura por las extracciones guardadas antes de existir este campo.
   */
  interes: string | null;
  /**
   * Campos ya aplicados a la ficha. Vacío = todo sugerido. Un campo aquí no vuelve a proponerse ni
   * se pisa en la siguiente extracción.
   */
  confirmados: CampoExtraido[];
  confirmadoAt?: Date | null;
  confirmadoPor?: Types.ObjectId | null;
  extraidoAt: Date;
  modelo: string;
}

export interface IDatosExtraidosResponse {
  nombreCompleto: string | null;
  correo: string | null;
  telefono: string;
  telefonoOrigen: TelefonoOrigen;
  interes: string | null;
  confirmados: CampoExtraido[];
  extraidoAt: string;
}

/** Resultado de confirmar: qué se escribió en la ficha y qué se dejó como estaba. */
export interface IConfirmarExtraccionResponse {
  contacto: IContactCardResponse;
  datosExtraidos: IDatosExtraidosResponse;
  aplicados: CampoExtraido[];
  omitidos: CampoExtraido[];
}
```

> **`confirmados` es una lista, no un booleano por campo.** Un `boolean` por campo obligaría a
> cuatro campos nuevos en el subdocumento y a repetirlos en el DTO; la lista dice lo mismo, escala
> si mañana hay un quinto campo, y el frontend la consume con un `includes`.

> **`confirmadoAt`/`confirmadoPor` guardan la última confirmación, no una por campo.** El detalle
> campo a campo ya queda en `audit_events`, que es donde se consulta un histórico. Duplicarlo en el
> documento sería un segundo registro de auditoría peor.

### 2.2 `cliente.model.ts`

El subdocumento `datosExtraidos` (L99-113) gana:

```ts
interes: { type: String, default: null },
confirmados: { type: [String], default: [] },
confirmadoAt: { type: Date, default: null },
confirmadoPor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
```

> **`confirmados` sin `enum`**, por coherencia con `semaforoIA` (L81-96): el tipo lo garantiza
> `CampoExtraido` y el único productor es `cliente.service`. Sigue **sin índice**: se proyecta al
> abrir la ficha, nadie filtra la bandeja por esto.

### 2.3 `cliente.service.ts` — el slot y su saneamiento

`DATOS_CONTACTO_SLOTS` gana un cuarto elemento:

```ts
{
  campo: 'interes',
  tipo: 'texto',
  requerido: false,
  descripcion:
    'Producto, servicio, plan o programa CONCRETO por el que el cliente pregunta o que dice ' +
    'querer, con sus propias palabras y en una frase corta. NO es el nivel de interés: ' +
    '"muy interesado", "caliente" o "quiere comprar" no son respuestas válidas. ' +
    'Cadena vacía si no menciona ninguno.',
}
```

> Sigue siendo el prompt más específico que ve el modelo, pero **ya no es el único**: a partir de
> §1.3 convive con la plantilla del tenant. El comentario de `cliente.service.ts:393-395` que decía
> lo contrario hay que corregirlo en el mismo commit.

`datosExtraidosSchema` gana:

```ts
interes: textoLlm.transform((v) => (v === null ? null : v.slice(0, INTERES_MAX_LEN))),
```

con `const INTERES_MAX_LEN = 120;` junto a las demás constantes del módulo. `textoLlm` ya convierte
`''`, `'N/A'` y las muletillas de `SIN_DATO` en `null`, así que no hay nada que añadir ahí.

### 2.4 `extractContactData()` — acotar, fusionar y auditar

Tres cambios sobre `cliente.service.ts:457-513`, y una extracción de función para que el worker no
duplique nada:

```ts
/** El transcript del que se extrae: los N mensajes de texto más recientes, en orden cronológico. */
async function historialParaExtraccion(tenantId: string, clienteId: string): Promise<ChatTurn[]>;

/** El motor. Lo comparten el botón (`extractContactData`) y el worker (`extraerDatosSiHaceFalta`). */
export async function ejecutarExtraccion(
  tenantId: string,
  clienteId: string,
  actorId: string | null,
): Promise<IDatosExtraidos>;

export async function extractContactData(
  tenantId: string,
  clienteId: string,
  actorId: string,
  puedeVerSensibles = false,
): Promise<IDatosExtraidosResponse>;
```

1. **Transcript acotado.** `historialParaExtraccion` ordena `{ createdAt: -1, _id: -1 }`, aplica
   `.limit(env.EXTRACT_MAX_MENSAJES)` y hace `.reverse()` — el mismo patrón exacto de
   `construirHistorial` en `ai-reply.processor.ts:222-237`. Hoy `cliente.service.ts:465-467` carga el
   hilo entero sin techo (hueco 7).

   > **Por qué el worker no reutiliza su `historial`.** El del worker son los últimos 10 mensajes
   > (`HISTORIAL_MAX`), suficiente para responder pero no para extraer: un correo dictado en el
   > mensaje 3 de un hilo de 40 se perdería. Los dos caminos leen el mismo transcript acotado, así
   > que el botón y la extracción automática dan **exactamente** el mismo resultado. El coste es una
   > lectura más a Mongo, despreciable al lado de la llamada al modelo.

2. **Merge, no reemplazo** (hoy `{ datosExtraidos }` entero, L502-508):

   ```ts
   function fusionar(
     anterior: IDatosExtraidos | undefined,
     nuevo: DatosExtraidosLlm,
     telefonoWhatsapp: string,
   ): IDatosExtraidos;
   ```

   Regla por campo, en este orden:
   - Si el campo está en `anterior.confirmados` → **se conserva el valor confirmado** (AC6).
   - Si no, `nuevo[campo] ?? anterior?.[campo] ?? null` → un `null` nuevo **nunca borra** (AC5).
   - `telefono`: se recalcula igual que hoy (`telefonoOrigen` `conversacion` si el modelo lo dictó,
     `whatsapp` si no), pero si estaba confirmado se conserva con su origen.
   - `confirmados` se arrastra tal cual; `extraidoAt` y `modelo` se actualizan siempre.

3. **Auditoría `cliente.extract`**, solo si algún valor cambió respecto de `anterior`:

   ```ts
   await recordAuditEvent(tenantId, {
     actorId,                       // el usuario desde el botón, null desde el worker
     accion: 'cliente.extract',
     entidad: 'cliente',
     entidadId: clienteId,
     antes:   { nombreCompleto, correo: '[oculto]' | null, telefono, interes },
     despues: { nombreCompleto, correo: '[oculto]' | null, telefono, interes },
   });
   ```

   > **El correo va como `SENSIBLE_MARKER`.** `audit_events` no tiene gate por subrol
   > (`docs/data-model.md`); es la misma regla que ya aplica `updateCliente`
   > (`cliente.service.ts:336-337`) y el mismo criterio que HU-IA-05 impuso sobre el `motivo`.
   > El `interes` **sí va en claro**: es un dato comercial, no personal.

   > **Solo cuando cambia**, calcado del criterio de `ai-semaforo.service.ts:139`. Con la extracción
   > automática corriendo por ráfaga, auditar siempre llenaría la colección de eventos idénticos.

`extractContactData` pasa a recibir `actorId` (viene del controller, `req.user!.sub`) y sigue
devolviendo el DTO enmascarado por `toDatosExtraidosResponse`, que gana `interes` y `confirmados`.

### 2.5 `confirmarDatosExtraidos()` — el puente que faltaba

```ts
export async function confirmarDatosExtraidos(
  tenantId: string,
  actorId: string,
  clienteId: string,
  campos: CampoExtraido[],
  puedeVerSensibles: boolean,
): Promise<IConfirmarExtraccionResponse>;
```

Orden exacto:

1. `findByIdScoped(Cliente, tenantId, clienteId).lean()` → `404` si no está. **Esta guarda es el
   aislamiento**: nada más se lee sin pasar por ella.
2. `409` si el contacto no tiene `datosExtraidos` («No hay datos extraídos que confirmar.»).
3. `400` si algún campo pedido no tiene valor, o si es `telefono` con `telefonoOrigen: 'whatsapp'`
   (AC10). Se valida **antes** de escribir nada.
4. `403` si `campos` incluye `correo` y `!puedeVerSensibles` — **sin escribir nada del resto**, todo
   o nada, igual que `updateCliente` (`cliente.service.ts:302-304`).
5. Merge no destructivo, campo por campo:

   | Campo | Destino | Se escribe |
   |---|---|---|
   | `nombreCompleto` | `Cliente.nombre` | solo si está vacío |
   | `correo` | `Cliente.correoEnc` (vía `toStoredValue`) | solo si está vacío |
   | `interes` | `atributos` += `{ key: 'interes', label: 'Interés', valor, sensible: false }` | solo si no hay ya un atributo con esa `key` |
   | `telefono` (origen `conversacion`) | `atributos` += `{ key: 'telefono-alterno', label: 'Teléfono alterno', valor, sensible: false }` | solo si no hay ya un atributo con esa `key` |

   Lo que no se escribe por tener dato guardado va a `omitidos`; lo demás a `aplicados`.

   > **Por qué el teléfono no toca `Cliente.telefono`.** Es la identidad del canal:
   > `upsertByMetaUser` lo resincroniza desde Meta en cada mensaje entrante
   > (`docs/api-contract.md:91`), así que escribirlo sería una corrección que el siguiente mensaje
   > deshace. Encima el formato no encaja: el saneamiento del LLM acepta cualquier cadena con >= 7
   > dígitos (`cliente.service.ts:445-447`) y `updateClienteSchema` exige `^\d{7,15}$` (L116-120).
   > Como atributo es un dato útil y sin conflicto.

   > **Por qué el interés es un atributo y no un campo.** Ver el spec, §«Qué es interés». Aquí basta
   > con que el tope de 30 atributos de HU-CRM-02 se respeta: si el contacto ya llegó al límite, el
   > campo se omite en vez de fallar la confirmación entera.

6. **Una sola escritura** con `findOneAndUpdateScoped`: `$set` de los campos de ficha + `atributos`
   completo + `datosExtraidos.confirmados` (unión con los campos **aplicados**, no con los pedidos),
   `confirmadoAt` y `confirmadoPor`.

   > **Solo se marca confirmado lo aplicado.** Marcar un campo omitido sería mentir: el dato no está
   > en la ficha, y la próxima extracción debería poder volver a proponerlo si el guardado se borra.

7. `recordAuditEvent` acción `cliente.extract-confirm`, con `actorId` real, `antes` = los valores de
   la ficha antes del merge y `despues` = los aplicados. El correo, `[oculto]` en ambos.
8. Devuelve `{ contacto, datosExtraidos, aplicados, omitidos }` reusando `toContactCardResponse` y
   `toDatosExtraidosResponse` con el mismo `puedeVerSensibles`.

### 2.6 `cliente.validation.ts`

```ts
const campoExtraido = z.enum(['nombreCompleto', 'correo', 'telefono', 'interes']);

export const confirmarExtraccionSchema = z.object({
  body: z
    .object({
      campos: z.array(campoExtraido).min(1).max(4).refine(
        (c) => new Set(c).size === c.length,
        'No repitas campos.',
      ),
    })
    .strict(),
  params: z.object({ id: objectId }),
  query: empty,
});
```

> **`extractSchema` no se toca**: sigue sin cuerpo. Qué se extrae es decisión de producto, no del
> cliente HTTP (spec, «fuera de alcance»).

### 2.7 `cliente.controller.ts` y `cliente.routes.ts`

```ts
export const confirmarExtraccionController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const { campos } = req.body as { campos: CampoExtraido[] };
  const resultado = await confirmarDatosExtraidos(
    tenantId, req.user!.sub, id, campos, puedeVerDatosSensibles(req.user!),
  );
  res.status(200).json(resultado);
};
```

```ts
router.post(
  '/:id/extract/confirm',
  authenticateJWT, requireTenant, bandejaRoles,
  validate(confirmarExtraccionSchema),
  asyncHandler(confirmarExtraccionController),
);
```

> **Sin `authorizeSubrol` en la ruta**, exactamente por el motivo que ya documenta
> `cliente.routes.ts:37-38` para el `PATCH`: el gate de los datos sensibles es **por campo**, dentro
> del service, para no quitarle al `coordinator` la confirmación de los campos no sensibles.

> `extractContactDataController` gana el `req.user!.sub` que ahora pide el service. Un argumento más,
> sin lógica: el controller sigue delgado.

### 2.8 `audit.types.ts`

```ts
export type AuditAccion =
  | 'conversation.assign' | 'conversation.handoff' | 'cliente.update'
  | 'cliente.semaforo'
  | 'cliente.extract'          // HU-IA-06 — la IA escribió datosExtraidos
  | 'cliente.extract-confirm'  // HU-IA-06 — una persona los pasó a la ficha
  | 'contact-note.create' | 'lead.create' | 'lead.delete';
```

---

## 3. La extracción automática (`features/ai/ai-extract.service.ts`)

Hermano exacto de `ai-semaforo.service.ts`. **Nunca lanza.**

```ts
/**
 * Extrae datos de contacto al final del ciclo de auto-reply, si hace falta y si sale a cuenta.
 * No lanza nunca: un fallo aquí no puede tumbar la respuesta al cliente.
 */
export async function extraerDatosSiHaceFalta(
  tenantId: string,
  clienteId: string,
  historial: ChatTurn[],
): Promise<void>;
```

Guardas, **antes de gastar el modelo**, en este orden:

```ts
if (env.EXTRACT_AUTO !== 'on') return;                                  // 1
if (turnosDelCliente(historial) < env.EXTRACT_MIN_TURNOS_CLIENTE) return; // 2

const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean<IClienteLean>();
if (!cliente) return;

const datos = cliente.datosExtraidos;
const faltaAlgo = !datos || CAMPOS_AUTO.some((c) => datos[c] === null);   // 3
const hayNovedad = !datos || (cliente.ultimoMensajeAt ?? new Date(0)) > datos.extraidoAt; // 4
if (!faltaAlgo || !hayNovedad) return;

try {
  await ejecutarExtraccion(tenantId, clienteId, null);   // actorId null = el sistema
  await publishConversationUpdated(tenantId, clienteId);
} catch (err) {
  logger.warn('Extracción: falló la lectura de datos de contacto', { tenantId, clienteId, err });
}
```

con `const CAMPOS_AUTO = ['nombreCompleto', 'correo', 'interes'] as const;`

> **`CAMPOS_AUTO` excluye `telefono` a propósito.** Nunca es `null` (cae al número de WhatsApp), así
> que incluirlo haría que `faltaAlgo` fuese siempre `false` y la extracción automática no correría
> jamás. Es el bug silencioso más fácil de introducir aquí; por eso tiene su propio test.

> **Guarda 3 = el techo de coste.** Cuando los tres campos están encontrados, la conversación deja de
> pagar extracciones para siempre. Guarda 4 = no repetir sobre el mismo transcript. Juntas, el gasto
> típico de un hilo es de una a tres llamadas en toda su vida.

> **`turnosDelCliente` se reutiliza** de `ai-semaforo.service.ts:23-25`. Se mueve a un módulo común
> (`features/ai/ai-shared.ts`) o se exporta desde donde está — lo que salga más limpio al
> implementar, sin duplicar la función.

> **Por qué `publishConversationUpdated` y no un evento nuevo.** `useInboxRealtime` (L29-35) ya
> invalida `['contact-history', id]` con `conversation:updated`. Cero cambios en el frontend de
> tiempo real (AC21).

### 3.1 `config/env.ts`

```ts
// Extracción automática de datos de contacto (HU-IA-06)
EXTRACT_AUTO: z.enum(['on', 'off']).default('on'),
EXTRACT_MIN_TURNOS_CLIENTE: z.coerce.number().int().positive().default(2),
EXTRACT_MAX_MENSAJES: z.coerce.number().int().positive().default(60),
```

> **Enum y no booleano**, con la misma nota que `SEMAFORO_AUTO`: `z.coerce.boolean()` convierte
> `"false"` en `true`, justo el fallo que un kill-switch no se puede permitir.

> **`EXTRACT_MIN_TURNOS_CLIENTE = 2`**: con 1, un «hola» suelto dispara una extracción que no puede
> encontrar nada. **`EXTRACT_MAX_MENSAJES = 60`**: bastante más que los 10 del auto-reply, porque
> aquí lo que importa es no perder un dato dicho al principio, y bastante menos que un hilo real de
> meses.

### 3.2 `workers/ai-reply.processor.ts`

En `processAiReplyJob` (L145-152), después de la clasificación:

```ts
const historial = await ejecutarAutoReply(job);
if (!historial) return;
await clasificarYAplicarSemaforo(job.data.tenantId, job.data.clienteId, historial);
await extraerDatosSiHaceFalta(job.data.tenantId, job.data.clienteId, historial);
```

> **Sigue sin `try/catch`, por diseño.** Las dos funciones prometen no lanzar, y esa promesa tiene
> test. Un `try/catch` aquí escondería una regresión en esa promesa en vez de fallar ruidosamente en
> el test.

> **Después de la clasificación, no antes.** La clasificación es la que puede mover el semáforo de la
> bandeja: si el proceso muere entre las dos, es mejor haber perdido la extracción (recuperable en la
> siguiente ráfaga o con el botón) que la clasificación.

---

## 4. Frontend — `ContactExtractCard`

### Skills de diseño (regla §7 del `CLAUDE.md` raíz)

Antes de escribir el componente hay que invocar `emil-design-eng`, `impeccable:impeccable` y
`frontend-design:frontend-design`. En este entorno **solo la tercera está registrada**; las otras dos
devuelven `Unknown skill`. Se invocan igualmente y queda constancia en `tasks.md`, aplicando sus
criterios desde conocimiento propio — igual que hicieron HU-IA-04 y HU-IA-05.

**Lo que cambió por la pasada de `frontend-design`.** El primer boceto ponía un `Badge` de estado en
cada uno de los cuatro campos. Cuatro insignias en una columna de 384 px, bajo otras tres tarjetas,
son ruido: repiten en cuatro sitios lo que la cabecera «Datos de contacto (IA)» ya dice una vez. Se
aplicó la regla de quitar un accesorio:

- **«Sugerido» deja de tener insignia propia.** Es el estado por defecto de todo lo que hay en esta
  tarjeta; lo que informa es la **acción** disponible al lado del valor.
- **Solo lo confirmado se marca**, con un `Check` pequeño en `text-success` y su `sr-only`
  «Confirmado». Es un estado terminal y silencioso.
- **Las cuatro insignias se colapsan en una**, en la cabecera: `Badge` con «3 sin confirmar». Es el
  dato que un asesor escanea de verdad, y ocupa una línea en vez de cuatro.

### Sitio y forma

Mismo sitio: tercera columna del inbox, `ContactPanel.tsx:117-126`, entre `ContactNotesCard` y
`ContactSummaryCard`. Mismo contenedor y misma cabecera con `IdCard`.

```
┌ ⬚ Datos de contacto (IA)        [3 sin confirmar] ┐
│                                                    │
│ Nombre completo                                    │
│   Diego Ramírez                       [Confirmar]  │
│ Correo                                             │
│   diego@empresa.com                  ✓             │
│ Teléfono                                           │
│   3001112233                                       │
│   número de WhatsApp                               │
│ Interés                                            │
│   curso pre-ICFES sabatino            [Confirmar]  │
│                                                    │
│ Extraído 14:32                                     │
├────────────────────────────────────────────────────┤
│ [Confirmar todo]              [Volver a extraer]   │
└────────────────────────────────────────────────────┘
```

Estados por campo (la lista sigue siendo un `<dl>` con `dt`/`dd`: es literalmente una lista de
descripciones, y esa semántica ya la tiene el componente):

| Estado | Cuándo | Qué se ve |
|---|---|---|
| **Sugerido** | hay valor y el campo no está en `confirmados` | valor + `Button variant="ghost" size="sm"` **«Confirmar»**, `aria-label` nombrando el campo |
| **Confirmado** | el campo está en `confirmados` | valor + `Check` en `text-success` con `<span className="sr-only">Confirmado</span>`. Sin acción: es un hecho |
| **Sin dato** | el valor es `null` | «No aparece en la conversación» en cursiva y `text-muted-foreground`. Sin acción (ya existe, L43) |
| **Teléfono de WhatsApp** | `telefonoOrigen === 'whatsapp'` | valor + la pista «número de WhatsApp» que ya existe (`ORIGEN_LABEL`). **Sin acción**: confirmarlo no aportaría nada que el contacto no tenga (AC20) |

Decisiones de forma:

- **La ranura de la acción se reserva siempre**, aunque esté vacía: así confirmar un campo no
  desplaza los de abajo. Nada salta bajo el cursor.
- **La acción está siempre visible, no en `hover`.** Esconderla tras el puntero la haría invisible en
  táctil y difícil de descubrir en escritorio. `ghost` la deja discreta sin esconderla.
- **«Confirmar todo» solo aparece si hay más de un campo sugerido.** Con uno solo, duplicaría el
  botón que está tres líneas más arriba.
- **El pie de acciones no cambia de sitio.** «Volver a extraer» conserva su `RefreshCw` giratorio y
  su `variant="outline"`; «Confirmar todo» entra a su izquierda como `default`.
- **Copy: el mismo verbo de principio a fin.** El botón dice «Confirmar», el `toast` dice
  «Nombre confirmado». Un campo omitido se explica sin disculparse y diciendo qué pasó:
  «Ya había un nombre registrado; no se sobrescribió.»
- **Los omitidos se cuentan, no se apilan.** Si la confirmación en lote omite varios, un solo `toast`
  los nombra; nunca cuatro `toast` seguidos.
- **Sin animación de entrada de la tarjeta.** Se ve decenas de veces al día (mismo criterio que
  `TagChip`). La única transición es la del `Check` al aparecer, con `motion-reduce` respetado.
- Se conservan `pressable`, `shortTime`, `ORIGEN_LABEL`, los `Skeleton` con
  `aria-live="polite" aria-busy="true"` y el `<p role="alert">` de error que el componente ya tiene.
- **shadcn ya vendorizado y suficiente**: `badge` (con su variante `success` propia), `button`,
  `skeleton`, `tooltip`. **No hay que instalar nada.**
- Tokens semánticos, terminado en claro y oscuro, cero `bg-[#...]`.

### Datos

```ts
// inbox/types.ts
export type CampoExtraido = 'nombreCompleto' | 'correo' | 'telefono' | 'interes';

export interface DatosExtraidosDTO {
  nombreCompleto: string | null;
  correo: string | null;
  telefono: string;
  telefonoOrigen: TelefonoOrigen;
  interes: string | null;
  confirmados: CampoExtraido[];
  extraidoAt: string;
}

export interface ConfirmarExtraccionDTO {
  contacto: ContactCardDTO;
  datosExtraidos: DatosExtraidosDTO;
  aplicados: CampoExtraido[];
  omitidos: CampoExtraido[];
}
```

```ts
// inbox/api.ts — ruta SIN el prefijo `/api`: lo aporta el baseURL del apiClient.
export async function confirmarDatosExtraidos(
  clienteId: string,
  campos: CampoExtraido[],
): Promise<ConfirmarExtraccionDTO> {
  const { data } = await apiClient.post<ConfirmarExtraccionDTO>(
    `/clientes/${clienteId}/extract/confirm`,
    { campos },
  );
  return data;
}
```

```ts
// inbox/hooks/useConfirmarExtraccion.ts
export function useConfirmarExtraccion(clienteId: string | null): UseMutationResult<...>;
// invalida ['contact-history', clienteId] y ['conversations'] — el nombre confirmado
// se pinta en la bandeja. Molde: useUpdateContact.ts:12-24.
```

> **Sin `timeout: TIMEOUT_IA_MS`.** Confirmar no llama al modelo: es una escritura en Mongo. El
> timeout de 60 s es para `extract` y `summary`, que sí esperan a Gemini.

> **`ContactEditDialog` no se toca.** Al confirmar, `Cliente.nombre`/`correoEnc` quedan escritos, así
> que `sugerir()` (L82-92) devuelve el guardado y deja de marcar «Propuesto por la IA» **solo**. El
> camino manual sigue funcionando exactamente igual, y no aparecen dos fuentes de verdad para el
> mismo estado.

---

## 5. Documentación

- **`docs/data-model.md`** — en `clientes`, documentar `datosExtraidos` con `interes`, `confirmados`,
  `confirmadoAt` y `confirmadoPor`, y la nota de que la lista es de campos aplicados a la ficha.
  Añadir `cliente.extract` y `cliente.extract-confirm` a la lista de acciones auditadas, con la nota
  de que el correo viaja como `[oculto]`.
- **`docs/api-contract.md` §6** — `POST /api/clientes/:id/extract` (**hoy no está documentado**, solo
  se menciona de refilón en la fila de `/history`) y `POST /api/clientes/:id/extract/confirm`, con
  sus códigos: `400` campo sin valor o teléfono de WhatsApp, `403` correo sin subrol, `404` contacto
  de otro tenant, `409` sin datos extraídos.
- **`docs/domain.md` §4** — qué captura hoy la IA (los cuatro campos), que el «interés» es texto libre
  y aterriza como atributo, y que `interesItemId` / `CatalogItem` **siguen sin implementar**, con el
  enlace a esta spec.
- **`docs/integrations/llm-provider.md`** — corregir L32-33: `mergeClienteSlots()` nunca existió; el
  merge es `confirmarDatosExtraidos()` y es **explícito**, no automático.

## Notas

- **La extracción sigue sin caché.** `extract()` es el único método de `AIService` que no cachea, y
  esta historia no lo cambia: las guardas de §3 acotan el gasto mucho mejor que una clave sobre un
  transcript que crece con cada mensaje.
- **`SlotResult.incompletos` sigue descartándose** (`ai.service.ts:145`). Con los cuatro slots en
  `requerido: false`, siempre sale `[]`. No merece un cambio de contrato en esta historia; queda
  anotado como deuda conocida.
- **Aislamiento.** Todo lo nuevo lee y escribe con `findByIdScoped`, `findScoped`,
  `findOneAndUpdateScoped` y `createScoped`. El `tenantId` del endpoint nace del token; el del worker,
  del job, que lo resolvió por `MetaIntegration` en el webhook. Ninguna función nueva acepta
  `tenantId` desde un body.
- **Orden de implementación.** De dentro hacia fuera: puerto del LLM (§1) → tipos y modelo (§2.1-2.2)
  → servicio (§2.3-2.5) → borde HTTP (§2.6-2.8) → worker (§3) → frontend (§4) → docs (§5). Así
  `tsc --noEmit` no acumula errores en cascada.

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
pnpm --filter @sofiapp/web build
pnpm --filter @sofiapp/web lint
pnpm --filter @sofiapp/web test
```

> **Los filtros son `@sofiapp/api` y `@sofiapp/web`.** Los nombres `backend`/`frontend` del
> `CLAUDE.md` raíz no matchean ningún paquete del workspace.

Manual, con un tenant real y Sofi encendida en la conversación:

1. Escribir por WhatsApp un mensaje con nombre, correo e interés. Sin abrir la ficha, esperar la
   respuesta de Sofi y comprobar que `datosExtraidos` aparece con los cuatro campos.
2. Abrir la ficha: los tres confirmables se ven con su acción; el teléfono, sin ella.
3. Confirmar el nombre → entra en la ficha y en la bandeja, y el campo pasa a *Confirmado*.
4. Escribir a mano un correo distinto en la ficha y después confirmar el correo extraído → se omite
   sin pisar el que escribió la persona, y el `toast` lo dice.
5. «Volver a extraer» sobre un hilo donde el correo ya no se menciona → el correo **sigue ahí**.
6. `EXTRACT_AUTO=off` y reiniciar el worker → un mensaje nuevo no dispara ninguna extracción, y la
   respuesta de Sofi sale igual.
7. Con un usuario `coordinator`: la tarjeta muestra el correo enmascarado y confirmarlo devuelve
   `403`, mientras que confirmar el nombre funciona.
