# HU-IA-05 — Plan técnico (CÓMO)

> Se construye **sobre `feat/HU-IA-01`**, sin rama nueva.
>
> **El slice `ai-semaforo` no tiene `model.ts`.** Escribe sobre `Cliente` y lee de `audit_events`;
> no le corresponde colección propia. Es la misma desviación consciente del patrón de 6 archivos que
> ya documentó HU-IA-04 («una conversación es un `Cliente` proyectado»). Por coherencia del espacio
> de URLs, los dos controllers y las dos rutas viven en `conversation.*`, junto a `/overview` y
> `/assignments`, y la validación en `conversation.validation.ts`. **Ningún modelo nuevo, ningún
> índice nuevo.**

## Archivos a crear

```
apps/backend/src/features/ai/
├── ai-semaforo.types.ts             # [CREAR] semaforoDeClasificacion, ISemaforoIA, DTOs
├── ai-semaforo.service.ts           # [CREAR] clasificar / aplicar / listar bitácora
├── ai-semaforo.service.test.ts      # [CREAR] mapeo, umbral, guardas, auditoría
└── ai-semaforo.isolation.test.ts    # [CREAR] la clasificación no cruza de tenant

apps/backend/src/scripts/
└── migrate-classify-template.ts     # [CREAR] sube la plantilla classify a v2.0.0 (molde: migrate-chat-template.ts)

apps/frontend/src/features/inbox/
├── components/IntentStrip.tsx       # [CREAR] la franja de intención
├── components/IntentStrip.test.tsx  # [CREAR] aplicado / propuesta / sin dato
└── hooks/useAplicarSemaforo.ts      # [CREAR] mutación + invalidaciones
```

## Archivos a modificar

```
apps/backend/src/
├── integrations/llm/
│   ├── llm-provider.types.ts        # [MODIFICAR] classifyLead: +instrucciones, +confianza, +motivo
│   └── gemini.provider.ts           # [MODIFICAR] CLASSIFY_SCHEMA ampliado + systemInstruction
├── services/ai/
│   ├── ai-service.types.ts          # [MODIFICAR] ClassifyResult
│   └── ai.service.ts                # [MODIFICAR] classify() pasa el systemPrompt y sanea la salida
├── seed/seed-prompt-templates.ts    # [MODIFICAR] plantilla classify v2.0.0 + CLASSIFY_TEMPLATE_VERSION
├── config/env.ts                    # [MODIFICAR] SEMAFORO_AUTO / _MIN_CONFIANZA / _MIN_TURNOS_CLIENTE
├── features/tag/tag.service.ts      # [MODIFICAR] findSemaforoTags()
├── features/cliente/
│   ├── cliente.types.ts             # [MODIFICAR] ISemaforoIA en ICliente
│   └── cliente.model.ts             # [MODIFICAR] subdocumento semaforoIA
├── features/audit/
│   ├── audit.types.ts               # [MODIFICAR] AuditAccion += 'cliente.semaforo'
│   └── audit.service.ts             # [MODIFICAR] filtro opcional por accion
├── features/ai/ai-handoff.service.ts # [MODIFICAR] se adapta al ClassifyResult ampliado (sin cambio de conducta)
├── features/conversation/
│   ├── conversation.types.ts        # [MODIFICAR] SemaforoIADTO, IClasificacionResponse, overview
│   ├── conversation.validation.ts   # [MODIFICAR] aplicarSemaforoSchema, classificationsSchema
│   ├── conversation.service.ts      # [MODIFICAR] overview expone semaforoIA
│   ├── conversation.controller.ts   # [MODIFICAR] 2 controllers nuevos
│   └── conversation.routes.ts       # [MODIFICAR] 2 rutas nuevas
└── workers/ai-reply.processor.ts    # [MODIFICAR] extrae ejecutarAutoReply + engancha la clasificación

apps/frontend/src/features/inbox/
├── types.ts                         # [MODIFICAR] SemaforoIADTO en ConversationOverviewDTO
├── api.ts                           # [MODIFICAR] aplicarSemaforo(conversationId)
└── pages/InboxPage.tsx              # [MODIFICAR] monta IntentStrip bajo la tira de resumen

docs/
├── domain.md                        # [MODIFICAR] §5: cómo consume IA-05 el semáforo + el mapeo
├── data-model.md                    # [MODIFICAR] clientes.semaforoIA + cliente.semaforo auditado
└── api-contract.md                  # [MODIFICAR] §6: los dos endpoints nuevos
```

---

## 1. El contrato de clasificación

### 1.1 `llm-provider.types.ts` — el puerto

```ts
export interface ClassifyLeadOutput {
  nivelInteres: NivelInteres;
  objecion: Objecion | null;
  /** Seguridad del modelo en su propia clasificación, en `[0, 1]`. */
  confianza: number;
  /** Una frase en español que justifica el nivel, citando lo que el cliente pidió. */
  motivo: string;
}

export interface ILlmProvider {
  // …
  classifyLead(input: {
    historial: ChatTurn[];
    /** `systemPrompt` de la plantilla activa. Ver la nota de abajo: hasta hoy no llegaba. */
    instrucciones: string;
  }): Promise<LlmCallResult<ClassifyLeadOutput>>;
}
```

> **Por qué `instrucciones` es obligatorio y no opcional.** Hacerlo opcional dejaría vivo el mismo
> agujero que esta historia cierra: un llamador que lo olvide vuelve a un clasificador sin prompt,
> y el fallo es silencioso (el modelo responde igual, solo que peor). Obligatorio, el compilador lo
> exige en cada llamada.

### 1.2 `gemini.provider.ts` — la salida estructurada

```ts
const CLASSIFY_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    nivelInteres: { type: SchemaType.STRING, format: 'enum', enum: ['frio', 'tibio', 'caliente'] },
    objecion: {
      type: SchemaType.STRING, format: 'enum', nullable: true,
      enum: ['precio', 'tiempo', 'confianza', 'otra'],
    },
    confianza: { type: SchemaType.NUMBER },
    motivo: { type: SchemaType.STRING },
  },
  required: ['nivelInteres', 'confianza', 'motivo'],
};
```

y en la llamada, lo que faltaba (mismo patrón que `generateReply`, línea 114):

```ts
const model = this.genAI.getGenerativeModel({
  model: env.GEMINI_MODEL,
  systemInstruction: input.instrucciones,
  generationConfig: { responseMimeType: 'application/json', responseSchema: CLASSIFY_SCHEMA },
});
```

### 1.3 `ai.service.ts` — `classify()`

Dos cambios, ambos de una línea larga:

```ts
const { result, usage } = await this.provider.classifyLead({
  historial: params.historial,
  instrucciones: template.systemPrompt,   // ← antes `template` solo servía para la cache key
});
```

y el saneado antes de cachear, porque un modelo puede devolver `confianza: 1.4` o un `motivo` de
mil caracteres:

```ts
const classifyResult: ClassifyResult = {
  nivelInteres: result.nivelInteres,
  objecion: result.objecion ?? null,
  confianza: Math.min(1, Math.max(0, Number(result.confianza) || 0)),
  motivo: (result.motivo ?? '').trim().slice(0, MOTIVO_MAX),   // MOTIVO_MAX = 240
};
```

> `Number(x) || 0` cubre `undefined`, `null` y `NaN` de una vez, y el `0` resultante nunca alcanza el
> umbral: ante una salida rara, **no se toca el semáforo**. Es el default seguro.

`ClassifyResult` en `ai-service.types.ts` pasa a `ClassifyLeadOutput` (mismo shape; se reexporta para
no duplicar el tipo).

**La caché no necesita nada.** `buildCacheKey` ya incluye `template.version`
(`ai.service.ts:149`), así que subir la plantilla a `2.0.0` invalida sola las entradas viejas y
ninguna puede volver sin `confianza`.

### 1.4 La plantilla `classify` v2.0.0

`seed-prompt-templates.ts` gana `export const CLASSIFY_TEMPLATE_VERSION = '2.0.0';` (gemelo de
`CHAT_TEMPLATE_VERSION`) y el `systemPrompt` conserva lo que ya decía sobre los tres niveles y la
objeción, más dos bloques:

- **Confianza.** Alta cuando el cliente lo dice explícitamente («quiero pagar», «¿dónde me
  inscribo?»); media cuando se infiere del contexto; baja con uno o dos mensajes, mensajes
  ambiguos, o cuando el hilo es casi todo de la empresa. Ante la duda, **bajarla**: una confianza
  inflada mueve una etiqueta que después alguien tiene que corregir a mano.
- **Motivo.** Una sola frase, en español, en tercera persona, de menos de 200 caracteres, que diga
  **qué dijo el cliente** para merecer ese nivel. **Prohibido citar nombre, teléfono, correo,
  documento o cualquier dato de contacto**: este texto va a `audit_events`, que no tiene control de
  acceso por subrol (`docs/data-model.md`).

**Migración obligatoria.** `seedPromptTemplates` usa `$setOnInsert`, así que la plantilla no se
actualiza sola en bases ya sembradas. `scripts/migrate-classify-template.ts` copia el molde de
`migrate-chat-template.ts`: `--dry-run` por defecto, actualiza `systemPrompt` + `version` de la
plantilla global `{ tenantId: null, method: 'classify' }`, e informa de cuántas plantillas de tenant
quedaron en la versión vieja (no las pisa: son personalizaciones del cliente).

### 1.5 `ai-handoff.service.ts`

`disparaIntencionDeCompra` sigue leyendo solo `data.nivelInteres`; el campo nuevo no le afecta. Es un
cambio de compilación, no de conducta, y sus tests actuales deben seguir pasando sin tocarlos salvo
por los dobles de `classify`, que ahora devuelven dos campos más.

---

## 2. El mapeo y las guardas

### 2.1 `ai-semaforo.types.ts`

```ts
/**
 * El nivel manda; la objeción solo desempata donde discrimina.
 *
 * Encaja literal con `docs/domain.md` §5: azul es «consulta general, sin intención comercial aún»
 * —un frío que solo pregunta— y rojo es «bloqueada, a punto de perderse» —ese mismo frío cuando ya
 * planteó una objeción—. En caliente y tibio la objeción no cambia el color: un cliente que pide
 * comprar sigue avanzando aunque mencione el precio, y pintarlo de naranja escondería la
 * oportunidad detrás de un matiz.
 */
export function semaforoDeClasificacion(
  nivelInteres: NivelInteres,
  objecion: Objecion | null,
): SemaforoSlug {
  if (nivelInteres === 'caliente') return 'verde';
  if (nivelInteres === 'tibio') return 'naranja';
  return objecion ? 'rojo' : 'azul';
}
```

| `nivelInteres` | `objecion === null` | `objecion !== null` |
|---|---|---|
| `caliente` | **verde** (Avanza) | **verde** |
| `tibio` | **naranja** (Requiere atención) | **naranja** |
| `frio` | **azul** (Informativo) | **rojo** (En riesgo) |

```ts
/** Última lectura del clasificador sobre esta conversación (HU-IA-05). */
export interface ISemaforoIA {
  slug: SemaforoSlug;
  confianza: number;
  motivo: string;
  nivelInteres: NivelInteres;
  objecion: Objecion | null;
  at: Date;
  /**
   * Slug que la IA llegó a escribir en `tagIds`. `null` = solo propuesta.
   *
   * Es también el detector de override humano: si el semáforo vigente de la conversación no es
   * este, lo cambió una persona, y la IA deja de escribir sola (regla 6 de §2.2).
   */
  aplicado: SemaforoSlug | null;
}
```

### 2.2 Cuándo escribe la IA

`clasificarYAplicarSemaforo` escribe el semáforo **solo** si se cumplen las seis:

1. `env.SEMAFORO_AUTO === 'on'`.
2. La etiqueta del slug destino **existe** en el tenant. El admin puede borrarlas
   (`docs/domain.md` §5) y hay que tolerarlo, no asumir que las cuatro están.
3. `confianza >= env.SEMAFORO_MIN_CONFIANZA`.
4. Hay al menos `env.SEMAFORO_MIN_TURNOS_CLIENTE` turnos con `role: 'user'` en el historial.
5. El slug destino no es el que la conversación ya tiene.
6. No hay override humano: la conversación no lleva semáforo, **o** el que lleva es
   `semaforoIA.aplicado`.

En cualquier otro caso guarda la **propuesta** (`semaforoIA` con `aplicado: null`) y no toca
`tagIds`. Las guardas 4 y 6 son el «no degradar»: una conversación recién abierta —un «hola» suelto
clasificaría como frío y pintaría de azul cada hilo nuevo— y una que un asesor ya coloreó a mano
quedan intactas.

> **Por qué la guarda 5 también evita ruido de auditoría.** Sin ella, cada mensaje de una
> conversación estable escribiría el mismo slug y dejaría un evento idéntico. Un evento por mensaje
> inunda `audit_events` y vuelve inútil la bitácora que el CA-15 promete.

### 2.3 Escribir el semáforo sin borrar las etiquetas libres

```ts
// NUNCA `setConversationTags`: reemplaza el conjunto entero (conversation.service.ts:412) y se
// llevaría por delante las etiquetas que el asesor puso a mano.
await updateManyScoped(Cliente, tenantId, { _id: oid }, { $pull: { tagIds: { $in: idsSemaforo } } });
const doc = await findOneAndUpdateScoped(
  Cliente, tenantId, { _id: oid }, { $addToSet: { tagIds: idDestino }, $set: { semaforoIA } },
  { new: true },
);
```

Dos updates y no uno: Mongo no admite `$pull` y `$addToSet` sobre el mismo campo en la misma
operación. Recalcular el array en JS sería un update, pero perdería una edición manual concurrente
—el worker lee, alguien etiqueta, el worker escribe— y el operador atómico no.

### 2.4 `tag.service.ts` — resolver por slug

```ts
/**
 * Las etiquetas de semaforización que EXISTEN en el tenant, indexadas por slug.
 *
 * Devuelve un mapa y no las cuatro: el administrador puede borrarlas (`docs/domain.md` §5), así que
 * quien consuma tiene que preguntar por la que necesita y aceptar un `undefined`. Una consulta
 * indexada por `{ tenantId, semaforo }`, que ya existe.
 */
export async function findSemaforoTags(
  tenantId: TenantId,
): Promise<Map<SemaforoSlug, ITagResponse>>;
```

---

## 3. El slice `ai-semaforo`

```ts
/**
 * Clasifica la conversación y aplica —o propone— el semáforo resultante.
 *
 * **Nunca lanza.** Se invoca al final del ciclo de auto-reply, cuando la respuesta al cliente ya
 * salió; propagar un fallo del clasificador marcaría como fallido un job que hizo su trabajo. Mismo
 * criterio que `disparaIntencionDeCompra` (`ai-handoff.service.ts:230`).
 */
export async function clasificarYAplicarSemaforo(
  tenantId: string,
  clienteId: string,
  historial: ChatTurn[],
): Promise<void>;

/** Aplica la propuesta pendiente. `AppError(409)` si no hay ninguna. */
export async function aplicarSemaforoSugerido(
  tenantId: string,
  clienteId: string,
  actorId: string,
): Promise<IConversationResponse>;

/** Bitácora de clasificaciones de una conversación. Molde exacto de `listAssignments`. */
export async function listClasificaciones(
  tenantId: string,
  clienteId: string,
  query: ClassificationsQuery,
): Promise<IPaginated<IClasificacionResponse>>;
```

Secuencia de `clasificarYAplicarSemaforo`:

1. `if (env.SEMAFORO_AUTO !== 'on') return;` — antes de cualquier llamada, para que el interruptor
   ahorre también el coste del modelo.
2. Contar turnos `user` del historial; por debajo de `SEMAFORO_MIN_TURNOS_CLIENTE`, salir sin llamar
   al modelo (el CA-9 y el ahorro coinciden aquí).
3. `getAIService().classify({ tenantId, historial })` dentro de `try/catch` → `logger.warn` y salir.
4. `slug = semaforoDeClasificacion(nivelInteres, objecion)`.
5. `findByIdScoped(Cliente, tenantId, clienteId).lean()` y `findSemaforoTags(tenantId)` en paralelo.
6. Resolver el semáforo vigente cruzando `cliente.tagIds` con el mapa.
7. Evaluar las seis condiciones → `aplicar: boolean`.
8. Escribir (§2.3) o solo `$set: { semaforoIA }` con `aplicado: null`.
9. `recordAuditEvent` **solo si `slug !== vigente`**.
10. Si se aplicó, `publishRealtime({ type: 'conversation:updated', ... })` — el mismo evento que ya
    usa `setConversationTags`, así que el frontend no necesita nada nuevo.

### Auditoría

```ts
await recordAuditEvent(tenantId, {
  actorId: null,                       // el sistema; `actorId` real cuando alguien pulsa «Aplicar»
  accion: 'cliente.semaforo',
  entidad: 'cliente',
  entidadId: clienteId,
  antes: { semaforo: vigente ?? null },
  despues: { semaforo: slug, aplicado, confianza, motivo, nivelInteres, objecion },
});
```

`audit.types.ts` suma `'cliente.semaforo'` a `AuditAccion`. `audit.service.ts` gana un parámetro
opcional, aditivo:

```ts
export function listAuditEventsQuery(
  tenantId: TenantId, entidad: AuditEntidad, entidadId: string, accion?: AuditAccion,
): Query<IAuditEventDocument[], IAuditEventDocument>;
```

Sin `accion`, el comportamiento es exactamente el de hoy y `listAssignments` no cambia.

---

## 4. Endpoints

| Método | Ruta | Cadena de middlewares | Controller |
|---|---|---|---|
| `POST` | `/api/conversations/:id/semaforo` | `authenticateJWT, requireTenant, bandejaRoles, validate(aplicarSemaforoSchema)` | `aplicarSemaforoController` |
| `GET` | `/api/conversations/:id/classifications` | `authenticateJWT, requireTenant, bandejaRoles, validate(classificationsSchema)` | `listClassificationsController` |

```ts
export const aplicarSemaforoSchema = z.object({
  body: empty, params: z.object({ id: objectId }), query: empty,
});
export const classificationsSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});
```

> **El `POST` no lleva cuerpo a propósito.** El destino es el que la IA ya guardó en `semaforoIA`;
> aceptar un slug del cliente convertiría este endpoint en un segundo camino para etiquetar a mano,
> que ya existe (`PATCH /:id/tags`) y con otra semántica. Aquí solo se confirma una propuesta.

`GET /:id/overview` (HU-IA-04) gana un campo; ningún endpoint nuevo para leer la sugerencia:

```ts
export interface IConversationOverviewResponse {
  conversation: IConversationResponse;
  resumen: IResumenResponse | null;
  /** Última clasificación por IA (HU-IA-05). `null` si nunca se clasificó. */
  semaforoIA: ISemaforoIAResponse | null;
  permisos: IPermisosConversacion;
}
```

> **`semaforoIA` no se cierra por subrol.** A diferencia del resumen (ADR-0006, enmienda de
> HU-IA-04), no es prosa libre sobre el transcript: es una frase acotada que la plantilla obliga a
> escribir **sin datos de contacto**, exactamente por el mismo criterio con el que la bitácora los
> excluye. Si esa restricción se relajara alguna vez, este campo tendría que entrar en el gate.

**Montaje: ninguno.** `conversationRoutes` ya está en `app.ts` bajo `/api/conversations`.

---

## 5. El enganche en el worker

`processAiReplyJob` se parte en dos, sin cambiar nada de lo que hace hoy:

```ts
/**
 * Todo el ciclo de auto-reply de HU-IA-01/02/03. Devuelve el `historial` que llegó a usar, o `null`
 * si no hubo nada que responder (Sofi apagada, último mensaje no es del cliente, historial vacío).
 */
async function ejecutarAutoReply(data: AiReplyJobData): Promise<ChatTurn[] | null>;

export async function processAiReplyJob(data: AiReplyJobData): Promise<void> {
  const historial = await ejecutarAutoReply(data);
  if (historial) {
    await clasificarYAplicarSemaforo(data.tenantId, data.clienteId, historial);
  }
}
```

Un único punto de enganche en vez de una llamada antes de cada `return` del cuerpo actual, que son
seis. Va **después** de la decisión de handoff a propósito: cuando la regla `intentPurchase` está
activa, `evaluarDespuesDeGenerar` ya llamó a `classify()` con ese mismo `historial` → misma cache
key → **acierto de caché, coste cero**. Cuando no lo está, es una llamada extra **por ráfaga
agrupada** (`AI_REPLY_WINDOW_MS`), no por mensaje.

`ejecutarAutoReply` devuelve el historial **también** cuando disparó un handoff: un handoff por
`intent_purchase` es exactamente el caso en que la conversación merece ponerse verde, y saltárselo
dejaría fuera el escenario más valioso de la historia.

---

## 6. Variables de entorno

```ts
// Semaforización automática por intención de compra (HU-IA-05).
// Interruptor como enum y NO como booleano: `z.coerce.boolean()` convierte la cadena "false" en
// `true`, que es justo el fallo que un kill-switch no se puede permitir. `env.ts` no tiene hoy
// ningún booleano; esto no abre el precedente.
SEMAFORO_AUTO: z.enum(['on', 'off']).default('on'),
// Confianza mínima para que la IA ESCRIBA el semáforo. Por debajo solo propone y la franja ofrece
// aplicarlo a mano. Escala propia del modelo, sin relación con KB_MIN_SCORE ni FAQ_MATCH_THRESHOLD
// (esas son similitudes de coseno normalizadas). Calibrar mirando la bitácora de
// GET /conversations/:id/classifications, nunca a ojo.
SEMAFORO_MIN_CONFIANZA: z.coerce.number().min(0).max(1).default(0.7),
// Turnos del CLIENTE que tiene que haber antes de tocar el semáforo. Con 1, un "hola" suelto
// clasifica como frío y pinta de azul cada conversación nueva: ruido en toda la bandeja.
SEMAFORO_MIN_TURNOS_CLIENTE: z.coerce.number().int().positive().default(2),
```

---

## 7. Frontend — `IntentStrip`

### Skills de diseño (regla §7 del `CLAUDE.md` raíz)

Antes de escribir el componente hay que invocar `emil-design-eng`, `impeccable:impeccable` y
`frontend-design:frontend-design`. En este entorno **solo la tercera está registrada**; las otras dos
devuelven `Unknown skill`. Se invocan igualmente y queda constancia en `tasks.md`, aplicando sus
criterios desde conocimiento propio — igual que hizo HU-IA-04.

### Sitio y forma

Va en la columna central de `InboxPage.tsx`, **bajo** `ConversationSummaryStrip` y sobre el hilo:

```
cabecera (avatar · Sofi · TagSelector · lead · asignar · ficha)
franja de #etiquetas                                    ← ya existe
✦ Resumen IA                              [Ver más]     ← HU-IA-04
◎ [Avanza] pide instrucciones de pago…    [Aplicar]     ← NUEVO
────────────────────────────────────────────────────────
hilo de mensajes
```

Molde exacto de banda, el mismo de `ConversationSummaryStrip`:
`flex items-start gap-2 border-b border-border bg-muted/40 px-4 py-2`.

**Tres bandas apiladas serían demasiado**, así que esta se gana el sitio con restricción: es de
**una sola línea** (`cn(BANDA, 'items-center')`) y **no se renderiza cuando `semaforoIA` es `null`**.
La tira de resumen merece cuatro estados porque el usuario la dispara; esta es ambiente, así que no
tiene estado vacío, ni skeleton, ni invitación a actuar. Dos estados y nada más:

| Estado | Qué se ve |
|---|---|
| **Aplicado** (`aplicado === slug`) | `TagChip` de la etiqueta + el motivo (truncado, completo en `title`) + la hora en `text-[11px] text-muted-foreground`. Es un hecho, no una acción. |
| **Propuesta** (`aplicado !== slug`) | Lo mismo, más `Button variant="outline" size="sm" className="h-6 shrink-0 text-xs"` **«Aplicar»** — gemelo exacto del «Generar resumen» de la banda de arriba. |

Decisiones de forma:

- **La confianza no se pinta como porcentaje.** «72 %» es falsa precisión y no le dice nada a un
  asesor sobre qué hacer a continuación; el número vive en el `title` del chip y en la bitácora. Es
  el accesorio que se quita.
- **El motivo es la justificación del CA-2 puesta donde se usa**, al lado de la etiqueta que
  explica, y no escondida en una pantalla de auditoría que nadie abre.
- **El color viene de la BD, así que pasa solo por `TagChip`** → `tagColors()`, que garantiza 4.5:1
  en claro y oscuro. Cero `bg-[#...]`; todo lo demás, tokens semánticos.
- **Icono de acento**: uno de `lucide-react` en `text-primary`, la misma identidad de IA que el
  `Sparkles` del resumen, pero distinto glifo para que las dos bandas no se confundan de un vistazo.
- **Sin animación de entrada del chip** (mismo criterio que `TagChip`: se ve decenas de veces al
  día) y `motion-reduce` en la transición del botón.
- **Copy en español, verbo que coincide con el resultado**: «Aplicar» y la etiqueta queda aplicada.
- `aria-label` del botón nombra la etiqueta destino («Aplicar la etiqueta Avanza»), no un genérico.

### Datos

```ts
// api.ts — ruta SIN el prefijo `/api`: lo aporta el baseURL del apiClient.
export async function aplicarSemaforo(conversationId: string): Promise<ConversationDTO>;

// hooks/useAplicarSemaforo.ts
useMutation({
  mutationFn: () => aplicarSemaforo(conversationId as string),
  onSuccess: () => {
    void qc.invalidateQueries({ queryKey: ['conversations'] });
    void qc.invalidateQueries({ queryKey: ['conversation-overview', conversationId] });
  },
  onError: (e) => toast.error(motivo(e, 'No se pudo aplicar el semáforo.')),
});
```

**Tiempo real: cero cambios.** Tanto el worker como `aplicarSemaforoSugerido` publican
`conversation:updated`, que `useInboxRealtime` ya traduce a invalidar
`['conversation-overview', id]` y `['conversations']`. La regla de «dos puntos de invalidación por
query» queda cubierta con el `onSuccess` de arriba y el handler que ya existe.

---

## Notas

- **Cero modelos y cero índices nuevos.** `{ tenantId, semaforo }` (único parcial) ya cubre
  `findSemaforoTags`; `{ tenantId, entidad, entidadId, createdAt }` ya cubre la bitácora; `semaforoIA`
  se proyecta, no se busca.
- **La historia arregla un bug latente de paso** (hueco 2): la plantilla `classify` existía desde
  HU-IA-03 y nunca llegaba al modelo. Va aquí y no en un fix aparte porque sin ella no hay dónde
  pedir el `motivo`, que es la mitad de esta HU.
- **`Cliente.nivelInteres` no se toca.** Decisión con su porqué en el `spec.md` (fuera de alcance):
  es una clave del catálogo `contact_options` que el asesor edita a mano, y `assertOpcionesValidas`
  lanza 422 si el admin la archivó. El dato crudo queda en `semaforoIA` y en la bitácora.
- **La clasificación solo corre con Sofi encendida.** Es consecuencia del enganche elegido y está
  declarada como limitación en el `spec.md`, no descubierta después.
- **Los docs van por detrás del código** en `Cliente.resumenIA`, `handoffAt`/`handoffMotivo`, la
  acción `conversation.handoff` y los endpoints de HU-IA-03/04. Esta historia actualiza lo que
  toca y **anota** el resto sin ampliar su alcance a una puesta al día completa.

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
pnpm --filter @sofiapp/web build
pnpm --filter @sofiapp/web lint
pnpm --filter @sofiapp/web test
```

> Los filtros son `@sofiapp/api` y `@sofiapp/web`; los nombres `backend`/`frontend` del `CLAUDE.md`
> raíz no matchean ningún paquete y pnpm no ejecuta nada.

Manual, con un tenant real y Sofi encendida en la conversación:

1. Escribir «quiero matricularme, ¿cómo pago?» → tras la ventana de agrupación, la conversación
   aparece con la etiqueta **Avanza** en la lista, sin abrirla, y la franja muestra el motivo.
2. `GET /api/conversations/:id/classifications` devuelve el evento con `antes`, `despues`,
   `confianza` y `motivo`, y `actorId: null`.
3. Bajar `SEMAFORO_MIN_CONFIANZA` a `0.99` y repetir → la franja muestra la propuesta con «Aplicar»;
   al pulsarlo la etiqueta se aplica y queda un segundo evento, esta vez con el `actorId` del admin.
4. Borrar la etiqueta de semáforo destino desde `/etiquetas` y repetir → nada se rompe, el
   auto-reply sale igual y queda la propuesta.
5. `SEMAFORO_AUTO=off` → no se escribe nada y el `ai_usage_logs` no registra un `classify` extra.
6. Cambiar el semáforo a mano y escribir otro mensaje → la IA no lo pisa; pasa a proponer.
