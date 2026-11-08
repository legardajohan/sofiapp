# HU-CONF-01 — Plan técnico (CÓMO)

## Archivos a crear / tocar

```
apps/backend/src/
├── utils/zona-horaria.util.ts (+ .test.ts)        # NUEVO: momentoLocal (movido), localAUtc, fechaLocal
├── features/flow/flow.trigger.ts                  # importa momentoLocal desde utils (sin cambio de conducta)
├── features/send-window/                          # NUEVO feature (6 archivos + puras)
│   ├── send-window.types.ts                       # CategoriaEnvio, IFranja, IRegla, IExcepcion, ISendWindowConfig, DTOs, defaults
│   ├── send-window.model.ts                       # SendWindowConfig (colección send_window_configs)
│   ├── send-window.validation.ts                  # updateSendWindowSchema, holidaysPreviewSchema
│   ├── send-window.policy.ts                      # PURO: normalizarFranjas, validarSolapes, evaluarVentana, siguienteApertura
│   ├── send-window.holidays.ts                    # PURO: festivosColombia(anio)
│   ├── send-window.service.ts                     # get/update config, caché, consultarVentana, assertVentanaEnvio, getStatus
│   ├── send-window.controller.ts
│   ├── send-window.routes.ts
│   ├── send-window.policy.test.ts
│   ├── send-window.holidays.test.ts
│   ├── send-window.routes.test.ts
│   └── send-window.isolation.test.ts
├── realtime/realtime.types.ts                     # + evento interno 'send-window:invalidate'; campaign:progress + retenidaHasta
├── features/message/message.types.ts              # ContextoEnvio.categoria obligatoria
├── features/message/message.service.ts            # control tras assertWithinQuota; sendMessage recibe categoría
├── features/message/message.controller.ts         # categorías asesor / plantilla_manual
├── features/conversation/conversation.service.ts  # enviarYNotificar pasa categoría (agent→asesor, bot→ia)
├── features/media/media.service.ts                # categoría asesor en media y voz
├── features/flow/flow.runtime.service.ts          # categoría según origen (inbound→ia, resume→flujo) + reprogramación
├── features/flow/flow.reminder.service.ts         # consultarVentana antes de marcar; 423 en el catch
├── features/campaign/campaign.model.ts / .types.ts # + retenidaHasta
├── features/campaign/campaign.service.ts          # scheduleCampaign / rescheduleCampaign → 422 fuera de franja
├── workers/campaign-broadcast.processor.ts        # consultarVentana antes del lote → retener
├── workers/ai-reply.processor.ts                  # 423 → descartar + marcarParaAsesor + auditoría
├── workers/inbound-message.processor.ts           # acuse con categoría ia; 423 → descartar
├── features/audit/audit.types.ts                  # nuevas acciones
└── app.ts                                         # app.use('/api/send-window', sendWindowRoutes)

apps/frontend/src/
├── features/send-window/
│   ├── api.ts · types.ts · lib/validacion.ts (espejo de las reglas Zod) · lib/formato.ts
│   ├── hooks/useSendWindowConfig.ts · hooks/useSendWindowStatus.ts
│   ├── components/CategoriaReglaCard.tsx · FranjasSemanaEditor.tsx · ExcepcionesTable.tsx
│   │   · ImportarFestivosDialog.tsx · EstadoActualStrip.tsx
│   └── pages/SendWindowPage.tsx (+ .test.tsx)
├── router.tsx                                     # /settings/send-hours (RequireRole admin)
├── components/layout/nav-config.ts                # «Horarios de envío» (CalendarClock) en Configuración
├── features/inbox/components/SendWindowBanner.tsx # NUEVO, mismo patrón que WindowClosedBanner
├── features/inbox/components/MessageComposer.tsx  # muestra el banner y trata el 423
├── features/inbox/components/SendTemplateDialog.tsx # trata el 423 de plantilla_manual
├── features/campaigns/components/CampaignStatusBadge.tsx / CampaignProgress.tsx # «Retenida por horario hasta …»
└── features/campaigns/components/CampaignScheduler.tsx / RescheduleDialog.tsx   # aviso + «usar siguiente apertura»
```

## Contratos

### `send-window.types.ts`
```ts
export const CATEGORIAS_ENVIO = ['asesor', 'plantilla_manual', 'ia', 'flujo', 'recordatorio', 'campana'] as const;
export type CategoriaEnvio = (typeof CATEGORIAS_ENVIO)[number];
export type ModoRegla = 'libre' | 'restringido';
export interface IFranja { dias: number[] /* 0=dom … 6=sáb */; desde: string; hasta: string /* HH:mm, 24:00 solo fin */ }
export interface IRegla { categoria: CategoriaEnvio; modo: ModoRegla; franjas: IFranja[] }
export interface IExcepcion {
  fecha: string; /* YYYY-MM-DD en la zona del tenant */
  tipo: 'cerrado' | 'franjas';
  franjas?: Array<Pick<IFranja, 'desde' | 'hasta'>>;
  categorias?: CategoriaEnvio[]; /* vacío/ausente = todas */
  motivo?: string; origen?: 'manual' | 'festivo';
}
export interface ISendWindowConfig {
  tenantId: Types.ObjectId; activo: boolean; zonaHoraria: string;
  reglas: IRegla[]; excepciones: IExcepcion[];
  actualizadoPor?: Types.ObjectId | null; version: number;
}
export type ResultadoVentana =
  | { permitido: true; siguienteCierre: Date | null }
  | { permitido: false; siguienteApertura: Date | null; motivo: 'fuera_de_franja' | 'excepcion' };
export const CONFIG_DEFECTO: Omit<ISendWindowConfig, 'tenantId'>; // activo:false, America/Bogota, tabla del spec
```

### `send-window.model.ts`
`tenantId: { type: ObjectId, ref: 'Tenant', required: true, unique: true, index: true }`,
subdocumentos sin `_id`, `{ timestamps: true, collection: 'send_window_configs' }`, `version` con `$inc`.

### `send-window.policy.ts` (puro, sin Mongo ni reloj)
- `aMinutos('HH:mm') → 0..1440`.
- `normalizarFranjas(franjas) → Array<[ini, fin]>` en minutos de la semana (0..10080); una franja con
  `desde > hasta` se parte en `[día+desde, día+1440)` y `[día+1+0, día+1+hasta)` con vuelta del
  sábado al domingo.
- `validarSolapes(regla) → string[]` (errores legibles) — lo usa el refine de Zod.
- `evaluarVentana(config, categoria, ahora)`: `!activo` o regla `libre` → permitido. Si no, toma la
  fecha local (`fechaLocal(ahora, zona)`); si hay excepción aplicable a la categoría, manda la
  excepción (cerrado → bloqueado; franjas → solo esas franjas ese día); si no, las franjas semanales.
- `siguienteApertura(config, categoria, ahora)`: recorre los inicios de franja candidatos de los
  14 días siguientes en hora local, los convierte con `localAUtc` y devuelve el primero > `ahora`
  que `evaluarVentana` acepte (o `null`). `siguienteCierre` análogo para el estado.

### `utils/zona-horaria.util.ts`
`momentoLocal(ahora, zona)` (movido tal cual), `fechaLocal(ahora, zona) → 'YYYY-MM-DD'`,
`localAUtc(fecha, 'HH:mm', zona) → Date` (dos pasadas con `Intl.DateTimeFormat` para hallar el
offset; en el hueco del cambio a verano, la siguiente hora válida). Sin dependencias nuevas.

### `send-window.holidays.ts`
`festivosColombia(anio) → Array<{ fecha; motivo }>`: fijos, trasladables a lunes (Ley Emiliani) y
los derivados de Pascua (algoritmo de computus anónimo gregoriano).

### `send-window.service.ts`
```ts
export async function getSendWindowConfig(tenantId: string): Promise<ISendWindowResponse>;
export async function updateSendWindowConfig(tenantId: string, actorId: string, dto: UpdateSendWindowDTO): Promise<ISendWindowResponse>;
export async function consultarVentana(tenantId: TenantId, categoria: CategoriaEnvio, ahora?: Date): Promise<ResultadoVentana>;
/** Lanza AppError 423 con `siguienteApertura` si está fuera de franja. */
export async function assertVentanaEnvio(tenantId: TenantId, categoria: CategoriaEnvio, ahora?: Date): Promise<void>;
export async function getSendWindowStatus(tenantId: string): Promise<ISendWindowStatusResponse>;
export async function registrarRetencion(tenantId: TenantId, input: IRetencionInput): Promise<void>; // log + audit
```
- Lecturas con `findOneScoped(SendWindowConfig, tenantId, {})`; escritura con
  `findOneAndUpdateScoped(…, { upsert: true, new: true })` + `recordAuditEvent('send-window.update')`.
- Caché: `Map<tenantId, { config, expira }>` con TTL 60 s; `updateSendWindowConfig` borra la entrada
  local y publica `send-window:invalidate` por el canal Redis existente; worker y web se suscriben.
- El 423 necesita llevar `siguienteApertura`: se añade un campo opcional `detalles` a `AppError`
  (retrocompatible) que `errorHandler` serializa en el cuerpo. Si se prefiere no tocar `AppError`,
  una subclase `VentanaCerradaError extends AppError`.

### Control en `sendOutbound`
```ts
export interface ContextoEnvio { categoria: CategoriaEnvio; campaignId?: string; mediaCabecera?: IArchivoImagen }
export async function sendOutbound(tenantId, clienteId, contenido, sender, contexto: ContextoEnvio): Promise<IMessageDocument> {
  await assertWithinQuota(tenantId, 'mensajesMes');
  await assertVentanaEnvio(tenantId, contexto.categoria);   // NUEVO
  …
}
```
`contexto` deja de tener default `{}`; `sendMessage(tenantId, dto, categoria)` igual.
Mapeo: `replyMessage`/media/voz/`/messages/send` → `asesor`; `/messages/template` → `plantilla_manual`;
`replyFromIa` (respuesta, handoff, fallo, acuse) → `ia`; `ejecutarEfecto` recibe la categoría de
`correrMotor`: `ejecutarFlujo` (inbound) → `ia`, `reanudarFlujo` → `flujo`; recordatorio →
`recordatorio`; campañas → `campana`.

### Comportamientos por llamador
- **Campañas** (`processCampaignJob`): tras comprobar `en_curso` y antes del presupuesto,
  `consultarVentana(tenantId, 'campana')`. Si está cerrado: `encolarLote(…, lote + 1, delay)` con
  `delay = siguienteApertura - ahora` (o 1 h si es `null`, para reevaluar), `$set retenidaHasta`,
  `emitirProgreso`, `registrarRetencion` solo si `retenidaHasta` era `null` (transición). Al pasar
  la ventana, `$set retenidaHasta: null`. Dentro del bucle, un 423 a mitad de lote (cierre de franja
  durante el lote) corta el bucle sin marcar `fallido` y re-encola igual.
- **Programación** (`scheduleCampaign`, `rescheduleCampaign`): si `evaluarVentana(cfg, 'campana',
  programadaPara)` bloquea → `AppError(422, { siguienteApertura })`.
- **Flujo diferido** (`reanudarFlujo`): antes de `correrMotor`, `consultarVentana(…, 'flujo')`; si
  bloquea, `flowRuntimeQueue.add(FLOW_RESUME_JOB, mismo data, { delay, ...RESUME_JOB_OPTS })` y
  `registrarRetencion`. Se re-encola **antes** de avanzar el motor, así el `FlowState` no cambia.
- **Recordatorio** (`enviarRecordatorio`): `consultarVentana(…, 'recordatorio')` justo antes del
  marcado de idempotencia; si bloquea, `registrarRetencion` y `return`. El `catch` pasa a `[422, 423, 429]`.
- **IA** (`ai-reply.processor.ts`, `inbound-message.processor.ts`, efecto de flujo reactivo): un
  `AppError` 423 → `registrarRetencion` + `marcarParaAsesor(tenantId, clienteId)`; en
  `ejecutarHandoff` ya se transfiere igual. No se relanza.

### Endpoints (`/api/send-window`)
| Método | Ruta | Cadena | Respuesta |
|---|---|---|---|
| GET | `/` | `authenticateJWT → requireTenant → authorize(['admin']) → validate → asyncHandler` | `ISendWindowResponse` (defaults si no hay doc) |
| PUT | `/` | ídem | `ISendWindowResponse` |
| GET | `/status` | ídem | `{ activo, zonaHoraria, categorias: Record<CategoriaEnvio, { permitido, siguienteApertura?, siguienteCierre? }> }` |
| POST | `/holidays/preview` | ídem (`{ anio: 2020..2100 }`) | `Array<{ fecha, motivo }>` |

### Auditoría y realtime
- `AuditAccion` += `send-window.update` (entidad `send-window`, `entidadId` = `_id` del config),
  `campaign.retenida-horario` (entidad `campaign`), `mensaje.retenido-horario` (entidad `cliente`,
  `actorId: null`, `despues: { categoria, siguienteApertura }`).
- `campaign:progress` += `retenidaHasta: string | null`.
- Log: `logger.info('send_window.retenido', { tenantId, categoria, accion: 'bloqueado'|'reprogramado'|'descartado'|'omitido'|'retenido', clienteId?, campaignId?, siguienteApertura })`.

### Frontend
- `SendWindowPage`: cabecera con `Switch` de activación y `Select` de zona; `EstadoActualStrip`
  (estado por categoría de `/status`, con refetch cada minuto); `Accordion` con una
  `CategoriaReglaCard` por categoría (`RadioGroup` Libre/Restringido, `FranjasSemanaEditor` con filas
  por día, añadir/quitar franja, «copiar a todos los días», aviso de franja que cruza medianoche y de
  regla restringida sin franjas, y el comportamiento fijo explicado en una línea); `ExcepcionesTable`
  (`Table` + `Calendar` en `Popover`, tipo cerrado/franjas, categorías con `Checkbox`);
  `ImportarFestivosDialog` (`Dialog` con año, vista previa y fusión sin duplicados). Guardado con
  `Button` y `sonner`; errores del backend mapeados a sus campos.
- `SendWindowBanner` en el composer cuando `/status` dice `asesor` cerrado; deshabilita el envío y
  muestra «Podrás responder desde {siguienteApertura}». Un 423 inesperado muestra el mismo mensaje.
- Campañas: badge «Retenida por horario · reanuda {hora}» desde `retenidaHasta` (en vivo por
  `campaign:progress`); el programador avisa si la hora elegida está cerrada y ofrece «Usar
  {siguienteApertura}».
- Skills `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design` antes de
  escribir componentes.

## Notas

- **Orden por etapas** (cada una deja el sistema estable):
  1. Puras: util de zona, política, festivos y sus tests. Sin efecto en producción.
  2. CRUD de configuración + página de Configuración, **sin control activo**.
  3. `categoria` obligatoria en `ContextoEnvio` y clasificación de los 13 puntos. Solo tipos.
  4. Encender `assertVentanaEnvio` en `sendOutbound` + 423 en `AppError`/`errorHandler`.
  5. Comportamientos: campañas, programación, flujo diferido, recordatorio, IA.
  6. Auditoría, realtime y pantallas (banner, badge, programador).
- La política nace `activo: false`: desplegar no cambia nada hasta que el admin la active.
- El barrido de campañas (`processCampaignSweep`) sigue arrancando programadas a su hora; si la
  ventana cambió después de programar, la retención del lote lo cubre.
- Coste: una lectura de caché por envío; ningún acceso extra a Mongo en el camino caliente.
- Actualizar `docs/data-model.md` (colección `send_window_configs`, `Campaign.retenidaHasta`),
  `docs/domain.md` (categorías y comportamiento) y `docs/integrations/meta-whatsapp.md` (punto de control).

## Verificación

- `pnpm --filter @sofiapp/api typecheck` · `pnpm --filter @sofiapp/api test`
- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` · tests de Vitest del front.
- Manual con número de pruebas de Meta: franja que cierra en 5 min → lanzar campaña → se retiene al
  cierre y se reanuda en la apertura; respuesta de asesor con `asesor` restringido → banner y 423.
- Verificación visual light/dark en `.playwright-mcp/` (borrar capturas al terminar).
