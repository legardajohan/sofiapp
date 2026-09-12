# HU-IA-03 — Plan técnico (CÓMO)

> Se construye **sobre `feat/HU-IA-01`**, sin rama nueva, encima de lo que dejaron HU-IA-01 y
> HU-IA-02. Nada del mecanismo de auto-reply se reescribe: se le añade una decisión antes de generar
> y otra después, y una función de handoff que sustituye a tres llamadas encadenadas.

## Archivos a crear

```
apps/backend/src/features/ai/
├── ai-handoff.types.ts            # [CREAR] HandoffSettings, motivos, DTOs, resultado de evaluación
├── ai-handoff.model.ts            # [CREAR] Schema con tenantId único
├── ai-handoff.validation.ts       # [CREAR] Zod del PUT (+ GET vacío)
├── ai-handoff.service.ts          # [CREAR] get/upsert + motor de evaluación (funciones puras)
├── ai-handoff.controller.ts       # [CREAR] 2 RequestHandler delgados
├── ai-handoff.routes.ts           # [CREAR] GET / y PUT /
├── ai-handoff.service.test.ts     # [CREAR] evaluación, disparador por disparador
├── ai-handoff.isolation.test.ts   # [CREAR] invariante multi-tenant
└── ai-handoff.routes.test.ts      # [CREAR] contrato HTTP con supertest

apps/backend/src/features/conversation/
└── conversation.handoff.test.ts   # [CREAR] handoffConversation(): idempotencia, no reasignar, aislamiento

apps/frontend/src/features/handoff/
├── api.ts                         # [CREAR] GET/PUT, rutas SIN prefijo /api
├── types.ts                       # [CREAR] espejo del DTO + límites
├── index.ts                       # [CREAR] barrel: página + tipos
├── hooks/useHandoffSettings.ts    # [CREAR] useQuery + useMutation (siembra la caché, no invalida)
├── pages/HandoffSettingsPage.tsx  # [CREAR] pending / error+Reintentar / contenido
├── components/HandoffSettingsForm.tsx  # [CREAR] useState + validación derivada
└── components/TriggerCard.tsx     # [CREAR] una tarjeta por disparador
```

## Archivos a modificar

```
apps/backend/src/
├── app.ts                                   # [MODIFICAR] montar ANTES de '/api/ai'
├── features/audit/audit.types.ts            # [MODIFICAR] AuditAccion += 'conversation.handoff'; actorId nullable
├── features/audit/audit.model.ts            # [MODIFICAR] actorId required: false
├── features/audit/audit.service.ts          # [MODIFICAR] toAuditEventResponse con actor nulo
├── features/cliente/cliente.model.ts        # [MODIFICAR] handoffAt, handoffMotivo
├── features/cliente/cliente.types.ts        # [MODIFICAR] idem en ICliente
├── features/conversation/conversation.service.ts   # [MODIFICAR] handoffConversation() + limpiar handoff al reactivar
├── features/conversation/conversation.mapper.ts    # [MODIFICAR] handoff en toConversationResponse + IConversationSource
├── features/conversation/conversation.types.ts     # [MODIFICAR] IConversationResponse.handoff
├── realtime/realtime.types.ts               # [MODIFICAR] actor.id: string | null
├── seed/seed-prompt-templates.ts            # [MODIFICAR] plantilla global `classify` + CHAT_FRASE_DERIVACION
├── workers/ai-reply.messages.ts             # [MODIFICAR] MENSAJE_HANDOFF
├── workers/ai-reply.processor.ts            # [MODIFICAR] los dos puntos de evaluación
└── workers/ai-reply.processor.test.ts       # [MODIFICAR] extender el mock y añadir casos

apps/frontend/src/
├── router.tsx                               # [MODIFICAR] ruta /settings/assistant/handoff (NO existe App.tsx)
├── components/layout/nav-config.ts          # [MODIFICAR] children de "Asistente IA"
├── features/inbox/types.ts                  # [MODIFICAR] ConversationDTO.handoff
├── features/inbox/pages/InboxPage.tsx       # [MODIFICAR] franja de aviso sobre el compositor
├── features/inbox/components/ConversationList.tsx      # [MODIFICAR] indicador por fila
└── features/inbox/components/ConversationList.test.tsx # [MODIFICAR] factory makeConversation
```

---

## 1. `HandoffSettings`: un documento por tenant

### `ai-handoff.types.ts`

```ts
/** Orden de evaluación fijo. El primero que dispara gana; es la prioridad del AC9. */
export const MOTIVOS_HANDOFF = [
  'explicit_request',
  'keyword',
  'low_confidence',
  'intent_purchase',
] as const;
export type HandoffMotivo = (typeof MOTIVOS_HANDOFF)[number];

export interface IHandoffSettings {
  tenantId: Types.ObjectId;
  /** Interruptor maestro. `false` de fábrica: esta HU no cambia el comportamiento de nadie
   *  hasta que un admin lo encienda a propósito. */
  activo: boolean;
  /** `null` = el primer admin activo del tenant. No hay noción de disponibilidad ni de carga. */
  asesorDestinoId: Types.ObjectId | null;
  mensajeTransicion: string;
  reglas: {
    explicitRequest: { activa: boolean; frases: string[] };
    keyword: { activa: boolean; palabras: string[] };
    lowConfidence: { activa: boolean; umbral: number | null };
    intentPurchase: { activa: boolean; nivelMinimo: 'tibio' | 'caliente' };
  };
}
export interface IHandoffSettingsDocument extends IHandoffSettings, Document {}

/** Lo que ve el frontend. Sin `tenantId`: nace del token y no viaja nunca. */
export interface HandoffSettingsDTO {
  activo: boolean;
  asesorDestinoId: string | null;
  mensajeTransicion: string;
  reglas: IHandoffSettings['reglas'];
  /** `true` mientras la empresa no haya guardado nada y esté viendo los valores de fábrica. */
  heredado: boolean;
}
export type UpdateHandoffSettingsDTO = Omit<HandoffSettingsDTO, 'heredado'>;

/** Resultado de evaluar. Función pura donde se puede: sin I/O, trivial de testear. */
export type HandoffDecision =
  | { dispara: false }
  | { dispara: true; motivo: HandoffMotivo };

/** Qué hacer con la respuesta ya generada cuando el disparador es post-generación. */
export type EfectoRespuesta = 'sustituir' | 'anexar';
```

**Frases por defecto de `explicitRequest`** (constante exportada, se siembran en el DTO de fábrica):
`['hablar con una persona', 'hablar con alguien', 'hablar con un asesor', 'quiero un asesor',
'atencion al cliente', 'me pueden llamar', 'necesito ayuda humana']`.

### `ai-handoff.model.ts`

```ts
const HandoffSettingsSchema = new Schema<IHandoffSettingsDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    activo: { type: Boolean, default: false },
    asesorDestinoId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    mensajeTransicion: { type: String, required: true, trim: true },
    reglas: {
      explicitRequest: { activa: { type: Boolean, default: false }, frases: { type: [String], default: [] } },
      keyword:         { activa: { type: Boolean, default: false }, palabras: { type: [String], default: [] } },
      lowConfidence:   { activa: { type: Boolean, default: false }, umbral: { type: Number, default: null } },
      intentPurchase:  { activa: { type: Boolean, default: false }, nivelMinimo: { type: String, default: 'caliente' } },
    },
  },
  { timestamps: true, collection: 'handoff_settings' },
);

// Único por tenant: es configuración, no una colección de reglas.
HandoffSettingsSchema.index({ tenantId: 1 }, { unique: true });
```

### `ai-handoff.validation.ts`

Zod sobre `{ body }`, con dos validaciones que no son cosméticas:

```ts
// El umbral propio SOLO tiene sentido por encima del global: searchKnowledge ya descarta todo lo
// que esté por debajo de KB_MIN_SCORE, así que un umbral menor no puede disparar nunca. Se rechaza
// en el borde en vez de dejar al admin configurar una regla muerta.
umbral: z.number().min(env.KB_MIN_SCORE).max(1).nullable(),

// `asesorDestinoId` llega del body, así que el service lo valida contra el tenant del token con
// assertAssignableAdmin(). Zod solo comprueba la forma.
asesorDestinoId: objectId.nullable(),
```

Más: `mensajeTransicion` `.min(1).max(500)`, `palabras`/`frases` como `z.array(z.string().min(2)).max(30)`,
`nivelMinimo: z.enum(['tibio', 'caliente'])`.

### Endpoints

| Método | Ruta | Cadena de middlewares | Controller |
|---|---|---|---|
| `GET` | `/api/ai/handoff-rules` | `authenticateJWT, requireTenant, authorize(['admin'])` | `getHandoffSettingsController` |
| `PUT` | `/api/ai/handoff-rules` | + `validate(updateHandoffSettingsSchema)` | `updateHandoffSettingsController` |

Montaje en `app.ts`, **antes** de `app.use('/api/ai', aiAssistantRoutes)` (línea 77), por el mismo
motivo que ya documenta el comentario de la línea 76 para `/api/ai/responses`: el prefijo más
específico tiene que resolverse primero.

```ts
app.use('/api/ai/responses', aiRoutes);
app.use('/api/ai/handoff-rules', aiHandoffRoutes);   // ← nuevo, antes del genérico
app.use('/api/ai', aiAssistantRoutes);
```

Controllers, con el patrón exacto de `ai-assistant.controller.ts`:

```ts
export const getHandoffSettingsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await getHandoffSettings(tenantId));
};
```

---

## 2. Motor de evaluación: dos puntos, no uno

El plan anterior evaluaba todo después de generar. Pero `explicit_request` y `keyword` se deciden
mirando el último mensaje del cliente: generar primero para tirar la respuesta paga un embedding y
una generación para nada, y añade segundos de latencia a una conversación que ya se va a un humano.

```ts
/**
 * Disparadores que se deciden con lo que escribió el cliente, sin llamar al modelo.
 * Función PURA: sin Mongo, sin Redis, sin LLM. Todo su test es una tabla de entradas y salidas.
 */
export function evaluarAntesDeGenerar(
  settings: HandoffSettingsDTO,
  ultimoMensajeCliente: string,
): HandoffDecision;

/**
 * Disparadores que necesitan la respuesta. `lowConfidence` va primero porque es gratis —usa el
 * AiResult que ya está en mano—; `intentPurchase` cuesta una llamada a classify() y solo se paga
 * si está activo y nada anterior disparó.
 */
export async function evaluarDespuesDeGenerar(
  settings: HandoffSettingsDTO,
  tenantId: string,
  historial: ChatTurn[],
  resultado: AiResult<string>,
): Promise<HandoffDecision>;
```

### `explicit_request` y `keyword`: un solo comparador

Son el mismo mecanismo; lo que cambia es de dónde salen los términos (frases de fábrica vs. lista
del admin). Comparten normalizador:

```ts
/** Minúsculas + NFD sin diacríticos, para que "asesoría" y "asesoria" comparen igual. */
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Coincidencia por palabra completa, no por subcadena. Con `includes` a secas, la palabra clave
 * "asesor" dispararía dentro de "asesoría", "asesorarme" o "asesoramiento": el admin escribió una
 * palabra, no un prefijo. Los términos de varias palabras siguen funcionando porque el límite se
 * pone en los extremos del término, no entre sus palabras.
 */
function contieneTermino(textoNormalizado: string, termino: string): boolean {
  const t = normalizar(termino).trim();
  if (!t) return false;
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(t)}(?:[^\\p{L}\\p{N}]|$)`, 'u')
    .test(textoNormalizado);
}
```

### `low_confidence`: la definición que sí distingue algo

```ts
/**
 * Baja confianza REAL. Tres guardas, y cada una tapa un falso positivo verificado:
 *
 *  - `cacheHit`: la respuesta salió de Redis y `retrievedChunks` viene vacío por construcción
 *    (ai.service.ts:85). La respuesta es buena; solo no se recuperó nada esta vez.
 *  - `fromFaq`: cortocircuito por FAQ, también con chunks vacíos (ai.service.ts:98). Es la
 *    respuesta que escribió el propio admin: lo contrario de baja confianza.
 *  - frase de derivación: desde HU-IA-02 la plantilla `chat` v1.1.0 responde un "gracias" o un
 *    "ok" con naturalidad, sin contexto y SIN derivar. Ese caso también da cero fragmentos, así
 *    que sin esta comprobación transferiríamos a un asesor a quien solo dio las gracias — el
 *    error que HU-IA-02 acaba de corregir en el prompt.
 *
 * El `umbral` propio es la vía estricta y opcional: solo puede exigir MÁS que KB_MIN_SCORE, porque
 * searchKnowledge (kb.retrieval.service.ts:33) ya descartó todo lo que estaba por debajo.
 */
function disparaLowConfidence(regla, resultado: AiResult<string>): boolean {
  if (resultado.cacheHit || resultado.fromFaq) return false;
  const chunks = resultado.retrievedChunks ?? [];

  if (chunks.length === 0) {
    return normalizar(resultado.data).includes(normalizar(CHAT_FRASE_DERIVACION));
  }
  if (regla.umbral === null) return false;
  const mejor = Math.max(...chunks.map((c) => c.score ?? 0));
  return mejor < regla.umbral;
}
```

`CHAT_FRASE_DERIVACION` se extrae en `seed-prompt-templates.ts` y `CHAT_SYSTEM_PROMPT` se compone
con ella. **El texto resultante no cambia ni un carácter**, así que `CHAT_TEMPLATE_VERSION` se queda
en `1.1.0` y no hace falta migración: es solo dejar de tener la frase escrita en dos sitios.

> Acoplamiento asumido y visible: un admin que reescriba su `systemPrompt` y borre esa frase pierde
> el disparador. La UI lo dice en el texto de ayuda de la tarjeta, y es el precio de tener una señal
> fiable en vez de una heurística que confunda "gracias" con "no sé responder".

### `intent_purchase`

```ts
const ORDEN_INTERES: NivelInteres[] = ['frio', 'tibio', 'caliente'];

// Se llama a classify() SOLO aquí, y solo si la regla está activa: es una llamada extra al modelo
// por mensaje. Está cacheada 2 h en Redis por historial (AI_CACHE_TTL_CLASSIFY_S), así que una
// ráfaga o un reintento no la vuelven a pagar, pero una conversación viva sí.
const { data } = await getAIService().classify({ tenantId: new Types.ObjectId(tenantId), historial });
return ORDEN_INTERES.indexOf(data.nivelInteres) >= ORDEN_INTERES.indexOf(regla.nivelMinimo);
```

Si `classify()` lanza, **no se propaga**: se registra `logger.warn` y se devuelve "no dispara". Un
fallo del clasificador no puede tumbar una respuesta que ya está generada y lista para enviarse.

---

## 3. Ejecución del handoff: una función, no tres llamadas

### `conversation.service.ts` — `handoffConversation()`

```ts
/**
 * Transfiere la conversación a una persona y calla a Sofi en ese hilo (HU-IA-03).
 *
 * Va en UNA escritura y no encadenando assignConversation + setIaHabilitada + marcarParaAsesor por
 * dos motivos concretos: esa cadena publicaría TRES eventos de tiempo real, y el intermedio dejaría
 * la bandeja mostrando una conversación ya asignada con Sofi todavía encendida; y `assignConversation`
 * exige un `actorId` de un usuario real (lo resuelve con findUsersByIds y lo audita), que en un
 * handoff automático no existe.
 *
 * `asesorId` solo se fija si la conversación estaba SIN asignar: si ya la lleva alguien, el handoff
 * no se la quita — apaga la IA y avisa, que es lo que hacía falta.
 */
export async function handoffConversation(
  tenantId: string,
  clienteId: string,
  motivo: HandoffMotivo,
  asesorDestinoId: string | null,
): Promise<void>;
```

Cuerpo, en orden:

1. `findByIdScoped(Cliente, tenantId, clienteId).lean()`. Si no existe, salir en silencio (mismo
   criterio que `marcarParaAsesor` y `notifyInboundMessage`: el worker no debe romperse por una
   conversación borrada a mitad del job).
2. **Idempotencia:** si `iaHabilitada === false`, `return` sin escribir, auditar ni publicar (AC15).
3. Resolver destino: `asesorDestinoId ?? primerAdminActivo(tenantId)`. Si el configurado ya no es un
   admin activo del tenant (`assertAssignableAdmin` lanza), se cae al primer admin activo y se
   registra `logger.warn`; si tampoco hay ninguno, el handoff sigue **sin** asignar (AC12).
4. Una sola escritura:
   ```ts
   await findOneAndUpdateScoped(
     Cliente, tenantId, { _id: new Types.ObjectId(clienteId) },
     {
       $set: { iaHabilitada: false, handoffAt: new Date(), handoffMotivo: motivo,
               ...(yaTeniaAsesor ? {} : { asesorId: destino }) },
       $inc: { noLeidos: 1 },
     },
     { new: true },
   ).lean();
   ```
5. `recordAuditEvent(tenantId, { actorId: null, accion: 'conversation.handoff', entidad: 'cliente',
   entidadId: clienteId, antes: { iaHabilitada: true, asignadoA: antes },
   despues: { iaHabilitada: false, asignadoA: destino, motivo } })`.
6. Un solo `publishRealtime`: `conversation:assigned` con `targetUserId: destino` y
   `actor: { id: null, nombre: 'Sofi' }` cuando hay destino nuevo; `conversation:updated` si no lo
   hay (nadie a quien notificar). Se reutilizan `resolveAsignado` / `resolveTags` / `resolveLeadMap`
   / `toConversationResponse`, igual que `markRead` y `setIaHabilitada`.

### `setIaHabilitada` — reactivar a Sofi cierra el handoff

Al pasar `habilitada: true` se añade `$unset` de `handoffAt` y `handoffMotivo`: si el asesor
devuelve el hilo al bot, la bandeja no puede seguir diciendo "transferido por Sofi" (AC17).

---

## 4. Cambios de contrato que arrastra (todos obligatorios para compilar)

| Archivo | Cambio | Por qué |
|---|---|---|
| `audit/audit.types.ts` | `AuditAccion` += `'conversation.handoff'` | Unión cerrada de 5 valores; sin esto no compila |
| `audit/audit.types.ts` | `IAuditEvent.actorId`, `RecordAuditInput.actorId`, `IAuditEventResponse.actorId` → `... \| null` | El handoff no tiene actor humano |
| `audit/audit.model.ts` | `actorId: { …, required: false, default: null }` | Hoy es `required: true` con `ref: 'User'` |
| `audit/audit.service.ts` | `toAuditEventResponse`: `doc.actorId?.toString() ?? null` | Evita el `.toString()` sobre `null` |
| `conversation.mapper.ts` | `toAssignmentResponse`: `actorNombre` cae a `'Sofi'` con actor nulo | El historial de asignaciones ya existente lo pinta |
| `realtime/realtime.types.ts` | `conversation:assigned` → `actor: { id: string \| null; nombre: string \| null }` | Sofi no es un `User` |
| `cliente.model.ts` / `cliente.types.ts` | `handoffAt: Date \| null`, `handoffMotivo: HandoffMotivo \| null` | Sin campo persistido no hay aviso en bandeja |
| `conversation.mapper.ts` | `IConversationSource` + `toConversationResponse` → `handoff: { at, motivo } \| null` | Lo consume la bandeja |
| `conversation.types.ts` | `IConversationResponse.handoff` | Idem |
| `frontend/src/features/inbox/types.ts` | `ConversationDTO.handoff` | Espejo del DTO |

> **No** se añade índice nuevo a `Cliente`: nadie filtra la bandeja por handoff en esta HU. El campo
> se lee, no se busca. Si más adelante aparece un filtro "transferidas", ese será su momento.

---

## 5. Integración en `ai-reply.processor.ts`

El punto de inserción de la evaluación posterior es entre `finGeneracion` (hoy línea 67) y
`replyFromIa` (línea 69). El anterior va justo después de la guarda del historial (línea 53).

```ts
  const ultimo = historial[historial.length - 1];
  if (!ultimo || ultimo.role !== 'user') return;

  // ── Handoff, punto 1: lo que se decide sin llamar al modelo ────────────────────────────────
  // Se lee la configuración UNA vez y se reutiliza en los dos puntos de evaluación.
  const handoff = await getHandoffSettings(tenantId);
  if (handoff.activo) {
    const previa = evaluarAntesDeGenerar(handoff, ultimo.content);
    if (previa.dispara) {
      // Sin generar: la conversación se va a una persona, así que pagar un embedding y una
      // generación para tirar la respuesta sería gasto y latencia puros.
      await ejecutarHandoff(tenantId, clienteId, handoff, previa.motivo, null);
      return;
    }
  }

  let resultado: AiResult<string>;
  try {
    resultado = await getAIService().chat({ tenantId: new Types.ObjectId(tenantId), historial });
  } catch (err: unknown) { /* … sin cambios … */ }
  const finGeneracion = Date.now();

  // ── Handoff, punto 2: lo que necesita la respuesta ─────────────────────────────────────────
  let texto = resultado.data;
  if (handoff.activo) {
    const posterior = await evaluarDespuesDeGenerar(handoff, tenantId, historial, resultado);
    if (posterior.dispara) {
      await ejecutarHandoff(tenantId, clienteId, handoff, posterior.motivo, texto);
      return;
    }
  }

  try { await replyFromIa(tenantId, clienteId, texto); } /* … sin cambios … */
```

> **Ojo con `chat()`**: hoy la línea 57 desecha todo salvo `.data` (`(await …chat(…)).data`). Hay que
> capturar el `AiResult<string>` completo para poder leer `retrievedChunks`, `cacheHit` y `fromFaq`.

### `ejecutarHandoff` — helper privado del worker

```ts
/**
 * Envía el aviso al cliente y transfiere. El efecto sobre la respuesta generada depende del motivo,
 * y no es configurable a propósito:
 *
 *  - Sin respuesta (disparó antes de generar): se manda solo el aviso.
 *  - `low_confidence`: la respuesta era "no tengo información suficiente"; repetírsela al cliente
 *    justo antes de decirle que lo transferimos es ruido. Se SUSTITUYE.
 *  - `intent_purchase`: la respuesta sí le sirve —le contestamos lo que preguntó— y encima está
 *    comprando. Se ANEXA al aviso en UN SOLO mensaje de WhatsApp: dos mensajes gastarían dos
 *    unidades de cuota (`incrementUsage`) y llegarían como dos notificaciones para nada.
 *
 * El orden importa: primero se avisa al cliente, después se transfiere. Si el envío falla por
 * ventana de 24 h cerrada o cuota agotada, se transfiere IGUAL — de hecho ahí es cuando más falta
 * hace que lo vea una persona. Mismo criterio que `avisarDeFalloYEscalar` (HU-IA-02).
 */
async function ejecutarHandoff(
  tenantId: string, clienteId: string,
  settings: HandoffSettingsDTO, motivo: HandoffMotivo,
  respuestaGenerada: string | null,
): Promise<void> {
  const texto = motivo === 'intent_purchase' && respuestaGenerada
    ? `${respuestaGenerada}\n\n${settings.mensajeTransicion}`
    : settings.mensajeTransicion;

  try {
    await replyFromIa(tenantId, clienteId, texto);
  } catch (err: unknown) {
    if (err instanceof AppError) logger.warn('Aviso de handoff no enviado', { tenantId, clienteId, motivo: err.message });
    else throw err;
  }
  await handoffConversation(tenantId, clienteId, motivo, settings.asesorDestinoId);
  logger.info('Handoff ejecutado', { tenantId, clienteId, motivo });
}
```

> **Nota para quien escriba los tests:** `ai-reply.processor.test.ts` mockea
> `../features/conversation/conversation.service.js` **entero** con un factory explícito. Importar
> `handoffConversation` desde el worker obliga a añadirla a ese factory, o el import queda `undefined`
> y los tests existentes rompen con un error que no señala la causa.

### Sofi se calla de verdad (AC14) — sin código nuevo

`inbound-message.processor.ts:131` ya evita encolar y ya evita el acuse de no-texto cuando
`iaHabilitada` es `false`, y `ai-reply.processor.ts:44-45` vuelve a comprobarlo dentro del job. El
handoff apaga ese flag, así que el silencio de Sofi sale gratis. Lo que falta no es código: es un
test que fije el comportamiento, porque hoy nada impide que alguien mueva esa guarda.

---

## 6. Plantilla global `classify`

Sin ella `AIService.classify()` lanza `AppError(500)` y `intent_purchase` es inejecutable. Se añade
a `GLOBAL_TEMPLATES` en `seed-prompt-templates.ts`:

```ts
{
  tenantId: null,
  method: 'classify',
  version: '1.0.0',
  systemPrompt: [
    'Clasificas conversaciones comerciales de WhatsApp entre una empresa y un cliente potencial.',
    'Los mensajes con rol "user" son del cliente; los de rol "model" son de la empresa.',
    '',
    'Devuelve el nivel de interés de compra del cliente:',
    '- "frio": pregunta por curiosidad, no menciona intención de contratar ni de comprar.',
    '- "tibio": compara, pide precios o condiciones, o muestra interés sin comprometerse.',
    '- "caliente": pide comprar, matricularse, pagar, reservar, agendar o hablar con alguien para cerrar.',
    '',
    'Devuelve además la objeción principal si la hay ("precio", "tiempo", "confianza" u "otra"), y',
    'null si el cliente no ha planteado ninguna. Clasifica solo con lo que aparece en la',
    'conversación: no supongas intención que el cliente no haya expresado.',
  ].join('\n'),
  isActive: true,
}
```

**No hace falta script de migración.** `seedPromptTemplates` usa
`updateOne({ tenantId: null, method }, { $setOnInsert: tpl }, { upsert: true })`: para un `method`
que todavía no existe en la colección, el filtro no encuentra nada y el upsert **inserta**. El caso
de HU-IA-02 era distinto —había que *modificar* una `chat` ya sembrada, y `$setOnInsert` no pisa lo
existente—, por eso allí sí hubo `migrate-chat-template.ts` y aquí no.

---

## 7. Frontend

### Ruta y navegación

`apps/frontend/src/router.tsx` (**no existe `App.tsx`**), con el molde exacto de `/settings/assistant`:

```tsx
const HandoffSettingsPage = lazy(() =>
  import('./features/handoff/index.js').then((m) => ({ default: m.HandoffSettingsPage })),
);
// …
{
  path: '/settings/assistant/handoff',
  element: (
    <RequireRole roles={['admin']}>
      <Suspense fallback={<Loading />}><HandoffSettingsPage /></Suspense>
    </RequireRole>
  ),
},
```

`nav-config.ts`: el ítem «Asistente IA» pasa a tener `children` (mecanismo ya usado por
«Conocimiento»). `subActive` compara pathname + query exacto, así que ambos hijos se resaltan bien
sin tocar `AppSidebar`.

```ts
{
  label: 'Asistente IA', to: '/settings/assistant', icon: Bot, roles: ['admin'],
  children: [
    { label: 'Comportamiento', to: '/settings/assistant', icon: Bot },
    { label: 'Transferencia a un asesor', to: '/settings/assistant/handoff', icon: UserRoundCheck },
  ],
},
```

### La pantalla

Calcada de `ai-assistant`, que es el precedente del proyecto para una configuración por tenant:

- `api.ts`: `fetchHandoffSettings()` / `saveHandoffSettings(payload)`. **Rutas sin `/api`**: lo
  aporta el `baseURL` del `apiClient` (fue un bug real de HU-OMNI-02).
- `hooks/useHandoffSettings.ts`: `useQuery(['handoff-settings'])` y `useMutation` que **siembra** la
  caché con `setQueryData` en vez de invalidar — el `PUT` ya devuelve la configuración completa.
  Toast en `onSuccess`/`onError`.
- `pages/HandoffSettingsPage.tsx`: los tres estados desacoplados de `AssistantConfigPage`
  (`isPending` → skeletons, `isError` → tarjeta con «Reintentar», datos → contenido).
- `components/HandoffSettingsForm.tsx`: `useState` por campo + `useEffect([settings])` para
  resincronizar tras guardar + `hayCambios` / `esValido` / `puedeGuardar` derivados. **No hay zod ni
  react-hook-form en el frontend**, y no se introducen aquí.
- `components/TriggerCard.tsx`: una tarjeta por disparador, con `Switch` (shadcn, ya vendorizado),
  título, una línea de ayuda que dice **qué le pasa al cliente**, y los parámetros propios
  deshabilitados mientras el interruptor esté apagado.

**Jerarquía de la pantalla**, de arriba abajo: (1) interruptor maestro, que gobierna todo lo demás;
(2) las cuatro tarjetas de disparador; (3) a quién se transfiere y qué se le dice al cliente. El
destino va al final a propósito: solo importa una vez que hay algún disparador encendido.

**Copy.** Nada de vocabulario de implementación de cara al admin: se lee «Cuando el cliente pide
hablar con una persona», no «explicit_request»; «Cuando Sofi no encuentra la respuesta», no
«low_confidence». El botón dice «Guardar cambios» y el toast «Cambios guardados», el mismo verbo en
los dos sitios. La tarjeta de baja confianza avisa en su texto de ayuda de que depende de la frase
de derivación del prompt, para que quien reescriba el prompt sepa lo que se lleva por delante.

Sin componente nuevo en `components/ui/`: bastan `Switch`, `Input`, `Textarea`, `Label`, `Select`,
`Button` y `Skeleton`, todos ya vendorizados.

### Aviso en la bandeja

`ConversationDTO` gana `handoff: { at: string; motivo: HandoffMotivo } | null`.

- **Franja en el hilo** (`InboxPage.tsx`, encima del compositor, junto a `WindowClosedBanner`):
  molde de `WindowClosedBanner` pero con el par **neutro** `bg-muted/40` + `text-secondary-foreground`
  y `ArrowRightLeft`, **no** `destructive-subtle`: un handoff es información, no un error, y el
  proyecto no tiene tokens `warning`. Dice el motivo en lenguaje llano y cuándo pasó.
- **Indicador por fila** (`ConversationList.tsx`): donde hoy va el `Sparkles` de «Sofi activa».
  Son mutuamente excluyentes —el handoff apaga `iaHabilitada`—, así que no compiten por el sitio:
  `handoff ? <ArrowRightLeft aria-label="Transferida por Sofi" /> : iaHabilitada && <Sparkles … />`.
- El evento `conversation:assigned` ya llega al room del asesor y `useInboxRealtime` ya lo maneja
  con toast + invalidación; solo hay que tolerar `evt.actor.nombre` nulo (cae a «Sofi»).
- Actualizar el factory `makeConversation` de `ConversationList.test.tsx`: si `ConversationDTO` gana
  un campo y el factory no, los tests existentes dejan de compilar.

### Skills de diseño (regla §7 del `CLAUDE.md` raíz)

Antes de escribir cualquier componente hay que invocar `emil-design-eng`, `impeccable:impeccable` y
`frontend-design:frontend-design`. En este entorno **solo la tercera está registrada**; las otras dos
devuelven `Unknown skill`. Se invocan igualmente y se deja constancia en `tasks.md`, aplicando sus
criterios desde conocimiento propio. Todo componente nuevo o tocado queda terminado en claro y
oscuro con los tokens semánticos del proyecto, sin utilidades de color arbitrarias.

---

## Notas

- **De fábrica todo está apagado** (`activo: false`). Esta HU no cambia el comportamiento de ningún
  tenant hasta que un admin lo encienda: no hay migración de datos ni sorpresas en producción.
- **El coste de `intent_purchase` es real.** Es una llamada extra al modelo por mensaje evaluado,
  cacheada 2 h por historial. Por eso se evalúa el último y solo si está activo, y por eso la
  tarjeta lo dice en la UI.
- **Un handoff no toca el `estadoComercial`.** Es una decisión comercial del asesor, no del bot.
- **Un handoff no crea un lead.** `HU-CRM-01` sigue siendo una acción explícita de una persona.
- **La ventana de 24 h manda igual.** El aviso de transición es un saliente normal: consume cuota y
  puede fallar por ventana cerrada. Cuando falla, se transfiere igual (ver `ejecutarHandoff`).

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
pnpm --filter @sofiapp/web build
pnpm --filter @sofiapp/web lint
```

> Los filtros son `@sofiapp/api` y `@sofiapp/web`. Los nombres `backend`/`frontend` del `CLAUDE.md`
> raíz no matchean ningún paquete y pnpm no ejecuta nada (verificado en HU-IA-02).

Manual, contra un tenant real con Redis levantado y el canal de Meta conectado:

1. Encender el disparador de petición explícita y escribir «quiero hablar con un asesor» → llega el
   aviso, la conversación queda asignada y sin leer, Sofi apagada, franja visible en el hilo.
2. Escribir otro mensaje en ese hilo → **no** llega respuesta de Sofi ni acuse.
3. Reactivar Sofi con el interruptor → la franja desaparece.
4. Con el disparador de baja confianza encendido, escribir «gracias» → **no** se transfiere.
5. Preguntar algo que no está en la KB → sí se transfiere.
6. Revisar `audit_events`: un solo evento `conversation.handoff` con actor nulo y el motivo correcto.
