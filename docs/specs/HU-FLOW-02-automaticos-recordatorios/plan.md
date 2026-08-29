# HU-FLOW-02 — Plan técnico (CÓMO)

## Archivos a crear

```
apps/backend/src/
├── workers/
│   ├── flow-runtime.processor.ts       # worker de la cola flow-runtime (espera + recordatorio)
│   └── reminder-sweep.processor.ts     # barrido periódico de ventanas por vencer
├── features/flow/
│   ├── flow.reminder.service.ts        # a quién le toca recordatorio y con qué contenido
│   └── flow.reminder.test.ts
└── features/tenant/
    └── (config del recordatorio dentro del schema Tenant, sin archivo nuevo)

apps/frontend/src/features/flows/
├── components/ReminderSettings.tsx     # antelación, plantilla, activo
└── hooks/useReminderSettings.ts
```

## Archivos a modificar

```
apps/backend/src/
├── config/queues.ts                    # FLOW_RUNTIME_QUEUE_NAME + flowRuntimeQueue
├── config/env.ts                       # cadencia del barrido y antelación por defecto
├── worker.ts                           # worker real; elimina el placeholder de la línea 42
├── features/flow/flow.types.ts         # FlowJobData, IReminderConfig
├── features/flow/flow.runtime.service.ts # encolar espera; anular al llegar respuesta
├── features/cliente/cliente.model.ts   # + recordatorioEnviadoParaVentana + índice
├── features/tenant/tenant.model.ts     # + recordatorio { activo, antelacionMinutos, templateId }
└── features/tenant/tenant.validation.ts
docs/
├── data-model.md · architecture.md · api-contract.md
```

## Contratos

### `config/queues.ts`

```ts
export const FLOW_RUNTIME_QUEUE_NAME = 'flow-runtime';
export const FLOW_RESUME_JOB = 'resume';        // reanudar tras un nodo `espera`
export const FLOW_REMINDER_JOB = 'reminder';    // enviar un recordatorio de inactividad
export const REMINDER_SWEEP_JOB = 'sweep';      // barrido periódico

export const flowRuntimeQueue = new Queue(FLOW_RUNTIME_QUEUE_NAME, { connection });
```

El nombre `flow-runtime` ya está reservado en `docs/architecture.md` y en `worker.ts:42` como
placeholder. Esta spec lo convierte en real y elimina el placeholder.

### Datos de los jobs

```ts
export type FlowJobData =
  | { tipo: 'resume';   tenantId: string; clienteId: string; flowId: string; nodoId: string; token: string }
  | { tipo: 'reminder'; tenantId: string; clienteId: string; ventanaExpiraEn: string };
```

`token` es lo que resuelve el criterio 3 del `spec`: un identificador que se guarda a la vez en el
job diferido y en `FlowState.esperaToken`. Cuando el job despierta, si el token del job ya no
coincide con el del `FlowState` significa que el cliente respondió mientras tanto y el flujo siguió
por otro lado, así que el job **se descarta sin hacer nada**. Es más robusto que intentar borrar el
job de BullMQ: no hay carrera posible.

### Nodo `espera` — de decisión a job diferido

En `flow.runtime.service.ts`, al recibir del motor un efecto de espera:

```ts
const token = randomUUID();
await findOneAndUpdateScoped(FlowState, tenantId, { clienteId }, { esperaToken: token, ... });
await flowRuntimeQueue.add(
  FLOW_RESUME_JOB,
  { tipo: 'resume', tenantId, clienteId, flowId, nodoId, token },
  { delay: minutos * 60_000, attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000 },
);
```

Y en el avance por respuesta del cliente, `esperaToken` se regenera (o se limpia), lo que invalida
cualquier job diferido pendiente.

### Barrido de recordatorios — Job Scheduler de BullMQ

BullMQ 5 ofrece Job Schedulers (repetibles). Se registra **una sola vez** al arrancar el worker; es
idempotente por `schedulerId`, así que reiniciar el proceso no duplica la programación:

```ts
await flowRuntimeQueue.upsertJobScheduler(
  'reminder-sweep',
  { every: env.REMINDER_SWEEP_INTERVAL_MS },
  { name: REMINDER_SWEEP_JOB, opts: { removeOnComplete: 100 } },
);
```

> Si la versión de BullMQ instalada aún no expone `upsertJobScheduler`, usar
> `add(..., { repeat: { every } , jobId: 'reminder-sweep' })`. Confirmar la API contra la versión de
> `bullmq` del `package.json` al implementar; el comportamiento requerido es el mismo.

### `flow.reminder.service.ts` — a quién le toca

```ts
export interface ICandidatoRecordatorio {
  tenantId: string; clienteId: string; telefono: string; ventanaExpiraEn: Date;
}

/** Barrido cross-tenant: única lectura sin scope de esta spec, y solo devuelve identificadores. */
export async function buscarCandidatos(ahora: Date): Promise<ICandidatoRecordatorio[]>;

/** Todo lo demás ya es tenant-safe. */
export async function enviarRecordatorio(tenantId: string, clienteId: string): Promise<void>;
```

**La consulta del barrido** (criterios 4 y 5), sobre `Cliente`:

```ts
{
  ventana24hExpiraEn: { $gt: ahora, $lte: new Date(ahora.getTime() + antelacionMs) },
  iaHabilitada: true,
  estadoComercial: { $nin: ['pagado', 'perdido'] },
  $expr: { $ne: ['$recordatorioEnviadoParaVentana', '$ventana24hExpiraEn'] },
}
```

`recordatorioEnviadoParaVentana: Date` es la marca de idempotencia (criterio 6): guarda **el valor
de `ventana24hExpiraEn` para el que ya se envió**. Como ese valor cambia con cada inbound, una
ventana nueva vuelve a ser candidata automáticamente, sin necesidad de limpiar banderas. La marca se
escribe con `findOneAndUpdateScoped` **antes** de enviar, para que dos barridos solapados no
produzcan dos envíos.

Índice necesario en `cliente.model.ts`:

```ts
ClienteSchema.index({ ventana24hExpiraEn: 1, iaHabilitada: 1 });
```

Es el único índice del proyecto que no empieza por `tenantId`, y es deliberado: el barrido es
cross-tenant por naturaleza (una sola pasada para toda la plataforma). Queda documentado junto al
índice, igual que se documentó el caso de `MetaIntegration.phoneNumberId`.

> **Por qué es aceptable.** `buscarCandidatos` solo devuelve `{tenantId, clienteId, ...}`; no
> expone datos de un tenant a otro. A partir de ahí cada job opera con su propio `tenantId` y todo
> vuelve a pasar por `*Scoped`. Es el mismo patrón que la resolución de tenant del webhook por
> `phone_number_id`, y se anota como tal en `docs/multi-tenancy.md`.

### `enviarRecordatorio` — el envío, sin reimplementar la ventana

```ts
const tenant = await findByIdScoped(Tenant, tenantId, tenantId).lean();
if (!tenant?.recordatorio?.activo) return;

await sendOutbound(tenantId, clienteId, {
  modo: 'auto',
  texto: tenant.recordatorio.texto,
  plantillaFallback: tenant.recordatorio.templateId
    ? { templateId: tenant.recordatorio.templateId, parametros: [cliente.nombre ?? ''] }
    : undefined,
}, 'bot');
```

`modo: 'auto'` es exactamente lo que pide el criterio 8: si la ventana sigue abierta sale texto
libre; si ya expiró sale la plantilla. **Esta spec no consulta `ventana24hExpiraEn` para decidir el
modo** — solo para decidir *a quién* recordarle. La decisión del modo es de `sendOutbound`.

Los dos casos degradados del `spec`:

```ts
// Criterio 9: fuera de ventana y sin plantilla utilizable → omitir, no reintentar.
// Criterio 10: cuota agotada → terminar sin enviar, registrando.
catch (err) {
  if (err instanceof AppError && [422, 429].includes(err.statusCode)) {
    logger.warn('Recordatorio omitido', { tenantId, clienteId, motivo: err.message });
    return;   // se traga el error a propósito: reintentar no lo arreglaría
  }
  throw err;  // lo transitorio sí se reintenta
}
```

### `tenant.model.ts` — configuración del recordatorio

```ts
recordatorio: {
  activo: { type: Boolean, default: false },
  antelacionMinutos: { type: Number, default: 120 },   // 2 h antes de expirar
  texto: { type: String },
  templateId: { type: Schema.Types.ObjectId, ref: 'WhatsAppTemplate' },
}
```

Va en `Tenant` y no en `Flow` porque es una política de la empresa sobre **todas** sus
conversaciones, no un paso de un flujo concreto. Arranca `activo: false`: nadie empieza a enviar
mensajes automáticos a sus clientes sin haberlo pedido.

### `config/env.ts`

```ts
REMINDER_SWEEP_INTERVAL_MS: z.coerce.number().positive().default(600_000),   // 10 min
REMINDER_SWEEP_BATCH: z.coerce.number().positive().default(200),
```

La cadencia del barrido debe ser bastante menor que la antelación por defecto (10 min vs 120 min)
para que la franja no se escape entre dos pasadas.

### `worker.ts`

- Registrar el worker real de `FLOW_RUNTIME_QUEUE_NAME` con `flow-runtime.processor.ts`, y el Job
  Scheduler del barrido tras conectar a Mongo. `worker.ts` **no** tiene hoy un placeholder de
  `flow-runtime` (sus placeholders son `llm-process`, `outbound-send` y `campaign-broadcast`); el
  nombre estaba reservado solo en `docs/architecture.md` y en `apps/backend/CLAUDE.md`. Los otros
  tres placeholders se dejan como están: son de features que aún no toca.
- Aprovechar para eliminar el bloque `TEMP DEBUG` de `GEMINI_API_KEY` (`worker.ts:13-23`), que está
  marcado para borrar y filtra un prefijo de la API key al log.
- `concurrency` explícita en el worker de `flow-runtime`: el envío pega contra la Graph API y no
  conviene ráfagas.

### Frontend

- `ReminderSettings.tsx`: activar/desactivar, antelación en minutos, texto y selector de plantilla
  (alimentado por el catálogo de `HT-WA-02`, filtrando solo las `APPROVED`).
- El nodo `espera` gana su panel en el `NodeInspector` de `HU-FLOW-01`: minutos, con una previsión
  legible ("se reanuda ~2 h después").

**Decisiones de las skills de diseño** (invocar `emil-design-eng`, `impeccable:impeccable` y
`frontend-design:frontend-design` antes de escribir):

- **Esto envía mensajes a personas reales sin que nadie mire.** La UI debe hacer evidente qué se va
  a enviar y cuándo, con una vista previa del texto y de la plantilla, antes de activar.
- **La antelación necesita contexto**, no un número desnudo: mostrar a qué hora saldría un
  recordatorio para una conversación que expira a las X.
- **Estado desactivado como estado de primera clase**: lo normal es tenerlo apagado, y apagado tiene
  que verse deliberado, no roto.
- Reusar `switch`, `input`, `select`, `card` del UI kit; nada hecho a mano.

## Notas

- **Por qué `token` y no cancelar el job.** BullMQ permite quitar un job diferido, pero hay una
  carrera real entre "el cliente responde" y "el job empieza a ejecutarse". El token se comprueba
  dentro de la ejecución, cuando ya no hay carrera posible.
- **Por qué la marca guarda una fecha y no un booleano.** Un booleano habría que limpiarlo en cada
  inbound (otra escritura, otra oportunidad de desincronizarse). Guardar el `ventana24hExpiraEn`
  para el que se envió hace que la condición sea autolimpiante.
- **Zona horaria:** todo en UTC, como el resto del proyecto. La antelación es un delta, no una hora
  del día, así que no hay que razonar sobre horarios locales del tenant.
- **Horario comercial:** enviar recordatorios de madrugada es mala idea, pero acotar el horario
  exige saber la zona del tenant y no está modelada. Queda anotado como mejora, fuera de alcance.

## Verificación

- `pnpm --filter backend typecheck` · `pnpm --filter backend test`
- `pnpm --filter frontend build && pnpm --filter frontend lint`
- Prueba manual: dejar una conversación real inactiva con la ventana a punto de expirar (ajustando
  `ventana24hExpiraEn` en la base) y comprobar que llega el recordatorio, primero con la ventana
  abierta (texto libre) y luego con la ventana ya vencida (plantilla HSM).
