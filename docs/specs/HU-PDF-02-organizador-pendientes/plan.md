# HU-PDF-02 — Plan técnico

> El CÓMO de `spec.md`. Respeta el `CLAUDE.md` raíz (aislamiento multi-tenant, `tenantId` del
> token, controllers delgados, Zod en el borde, `strict` sin `any`), el patrón de 6 archivos de
> `apps/backend/CLAUDE.md`, las reglas de `apps/frontend/CLAUDE.md` y `docs/multi-tenancy.md`.
> Rama: `feat/HU-PDF-02` (sale de `develop`).

## Archivos a crear / tocar

```
apps/backend/src/
├── config/queues.ts                                ← ORGANIZADOR_SWEEP_JOB / _SCHEDULER_ID (cola flow-runtime)
├── config/env.ts                                   ← ORGANIZADOR_SWEEP_EVERY_MS (default 60000)
├── worker.ts                                       ← despachar el job + upsertJobScheduler
├── app.ts                                          ← app.use('/api/organizador', organizadorRoutes)
├── realtime/realtime.types.ts                      ← + 'pendiente:vencido' (asesor) · 'pendiente:updated' (tenant)
├── realtime/realtime.publisher.ts                  ← enrutar 'pendiente:vencido' al room asesor:<targetUserId>
├── workers/organizador-sweep.processor.ts          ← NUEVO: barrido + backfill
├── workers/organizador-sweep.processor.test.ts     ← NUEVO
└── features/
    ├── contact-note/
    │   ├── contact-note.types.ts                   ← recordatorioAt, programadoTz, notificadoPara, vecesPospuesto
    │   ├── contact-note.model.ts                   ← campos + índice parcial del barrido
    │   └── contact-note.service.ts                 ← calcular recordatorio + eventos programado/reprogramado
    ├── pendiente/
    │   ├── pendiente.fechas.ts                     ← + instanteEnZona(dia, hora, tz): Date (puro)
    │   └── pendiente.service.ts                    ← cerrar/reabrir escriben evento; reabrir limpia notificadoPara
    ├── conversation/conversation.service.ts        ← + addTagsToCliente(tenantId, clienteId, tagIds)
    └── organizador/                                ← NUEVO
        ├── organizador.types.ts
        ├── organizador.model.ts                    ← PendienteEvento · MotivoCierre · OrganizadorPreferencia
        ├── organizador.validation.ts
        ├── organizador.estado.ts                   ← derivarEstado / filtroPorEstado (puros)
        ├── organizador.eventos.ts                  ← registrarEvento (usado también por contact-note y pendiente)
        ├── organizador.service.ts
        ├── organizador.controller.ts
        ├── organizador.routes.ts
        ├── organizador.estado.test.ts
        ├── organizador.service.test.ts
        ├── organizador.routes.test.ts
        └── organizador.isolation.test.ts

apps/frontend/src/
├── components/layout/nav-config.ts                 ← ítem «Organizador» tras «Etapas del embudo»
├── components/layout/AppLayout.tsx                 ← <RecordatoriosStack/> + useOrganizadorRealtime()
├── router.tsx                                      ← /organizador (RequireRole admin, lazy)
├── features/notifications/components/NotificationBell.tsx ← conteo + sección «Recordatorios»
├── features/contacts/hooks/useNotas.ts             ← invalidar ['organizador']
├── features/pipeline/hooks/usePendientes.ts        ← invalidar ['organizador']
├── features/pipeline/components/PendienteCard.tsx  ← «Cerrar pendiente» abre CerrarPendienteDialog
└── features/organizador/                           ← NUEVO
    ├── types.ts · api.ts
    ├── lib/motivos.ts                              ← MOTIVOS_PREDEFINIDOS (espejo del backend) · etiquetas de estado
    ├── hooks/
    │   ├── usePreferenciaOrganizador.ts
    │   ├── useOrganizadorPendientes.ts
    │   ├── useRecordatoriosActivos.ts
    │   ├── useHistorialPendiente.ts · useActividad.ts
    │   ├── useMotivosCierre.ts
    │   ├── useCerrarPendiente.ts · usePosponerPendiente.ts
    │   └── useOrganizadorRealtime.ts
    ├── components/
    │   ├── OrganizadorSwitch.tsx
    │   ├── OrganizadorFilters.tsx
    │   ├── OrganizadorTable.tsx
    │   ├── EstadoPendienteBadge.tsx
    │   ├── HistorialPendienteSheet.tsx
    │   ├── ActividadFeed.tsx
    │   ├── CerrarPendienteDialog.tsx
    │   ├── PosponerPendienteDialog.tsx
    │   ├── RecordatorioCard.tsx
    │   └── RecordatoriosStack.tsx
    ├── pages/OrganizadorPage.tsx
    └── *.test.tsx (ver tasks)

docs/
├── data-model.md · api-contract.md · domain.md
└── adr/0016-recordatorios-por-barrido.md + README.md
```

## Contratos — backend

### `contact_notes` (campos nuevos, todos opcionales para compatibilidad)

```ts
// contact-note.types.ts — IContactNote
/** HU-PDF-02: instante UTC del aviso = programadoDia + (programadoHora ?? '08:00') en programadoTz. */
recordatorioAt?: Date | null;
/** Zona IANA con que se agendó (la `tz` del request). Legado sin valor → Tenant.zonaHoraria. */
programadoTz?: string | null;
/** recordatorioAt para el que ya se emitió el aviso. ≠ recordatorioAt ⇒ falta avisar. */
notificadoPara?: Date | null;
/** Número de aplazamientos. > 0 y futuro ⇒ POSPUESTO. */
vecesPospuesto?: number;
```

```ts
// contact-note.model.ts
recordatorioAt: { type: Date, default: null },
programadoTz:   { type: String, default: null },
notificadoPara: { type: Date, default: null },
vecesPospuesto: { type: Number, default: 0 },

// Barrido y listados del Organizador por instante. Parcial: solo pendientes.
ContactNoteSchema.index(
  { tenantId: 1, estadoPendiente: 1, recordatorioAt: 1, _id: 1 },
  { partialFilterExpression: { pendiente: true } },
);
// «activos» del usuario: sus vencidos abiertos.
ContactNoteSchema.index(
  { tenantId: 1, autorId: 1, estadoPendiente: 1, recordatorioAt: 1 },
  { partialFilterExpression: { pendiente: true } },
);
```

`INotaResponse` **no cambia** (HU-PDF-01 intacta). Las respuestas del Organizador tienen su propio DTO.

### `pendiente.fechas.ts`

```ts
export const HORA_AVISO_TODO_EL_DIA = '08:00';
/** Día civil + hora de reloj en una zona IANA → instante UTC. Con Intl, sin dependencias. */
export function instanteEnZona(dia: string, hora: string, tz: string): Date;
export function instanteRecordatorio(dia: string, hora: string | null, tz: string): Date;
```

Implementación: estimar `Date.UTC(...)`, calcular el offset de la zona en ese instante con
`Intl.DateTimeFormat(…, { timeZone, hourCycle: 'h23', … }).formatToParts` y corregir (dos pasadas
para cubrir cambios de horario). Test con `America/Bogota` (sin DST) y `Europe/Madrid` (con DST).

### Sincronía en `contact-note.service.ts`

- `createNota` con `pendiente`: `programadoTz = tz`, `recordatorioAt = instanteRecordatorio(...)`,
  `notificadoPara = null`, `vecesPospuesto = 0`; evento `programado`.
- `updateNota`: si cambia `programadoDia`/`programadoHora` (o se enciende el pendiente) →
  recalcular con la `tz` del request, `notificadoPara = null`, evento `reprogramado` (o
  `programado`) con `antes/despues`. **Mismo documento** → nunca dos recordatorios por nota.
- `pendiente: false` (RN9) → `recordatorioAt`, `programadoTz`, `notificadoPara` a `null` y
  `vecesPospuesto = 0`. `deleteNota` no toca eventos (el historial se conserva; el feed muestra
  «nota eliminada» al no poder hidratarla).
- `pendiente.service.cerrarPendiente/reabrirPendiente` (endpoint rápido de HU-PDF-01, conservado):
  escriben `cerrado` (sin motivo, `origen: 'rapido'`) / `reabierto`. Reabrir pone
  `notificadoPara = null`: si ya venció, vuelve a avisar (acción explícita del usuario).

### `organizador.types.ts`

```ts
export const ESTADOS_ORGANIZADOR = ['pendiente', 'vencido', 'pospuesto', 'cerrado'] as const;
export type EstadoOrganizador = (typeof ESTADOS_ORGANIZADOR)[number];

export const MOTIVOS_PREDEFINIDOS = [
  { key: 'contactado', nombre: 'Cliente contactado exitosamente' },
  { key: 'gestion-realizada', nombre: 'Gestión realizada' },
  { key: 'venta', nombre: 'Venta concretada' },
  { key: 'info-enviada', nombre: 'Información enviada al cliente' },
  { key: 'solucionada', nombre: 'Solicitud solucionada' },
  { key: 'no-interesado', nombre: 'Cliente no interesado' },
  { key: 'no-respondio', nombre: 'Cliente no respondió' },
  { key: 'cancelada', nombre: 'Actividad cancelada' },
  { key: 'sin-seguimiento', nombre: 'No se requiere seguimiento adicional' },
] as const;  // «Otros motivos» no es una key: es `otro: { texto }`.
export type MotivoKey = (typeof MOTIVOS_PREDEFINIDOS)[number]['key'];

export const TIPOS_EVENTO = ['programado', 'reprogramado', 'vencido', 'pospuesto', 'cerrado', 'reabierto'] as const;

export interface IProgramacionSnapshot { dia: string | null; hora: string | null; recordatorioAt: Date | null }
export interface IMotivoSnapshot { key: MotivoKey | null; motivoId: Types.ObjectId | null; nombre: string }

export interface IPendienteEvento {           // colección `pendiente_eventos`, append-only
  tenantId: Types.ObjectId;
  notaId: Types.ObjectId;
  clienteId: Types.ObjectId;
  tipo: (typeof TIPOS_EVENTO)[number];
  actorId: Types.ObjectId | null;            // null = sistema (barrido)
  at: Date;
  antes: IProgramacionSnapshot | null;
  despues: IProgramacionSnapshot | null;
  motivo: string | null;                     // justificación del aplazamiento
  motivos: IMotivoSnapshot[];                // cierre: snapshot del nombre (sobrevive a renombres)
  otroMotivo: string | null;
  comentario: string | null;
  tagIds: Types.ObjectId[];
  origen: 'organizador' | 'rapido' | 'nota' | 'sistema';
}
export interface IMotivoCierre { tenantId; nombre: string; creadoPorId: Types.ObjectId }
export interface IOrganizadorPreferencia { tenantId; userId: Types.ObjectId; activo: boolean }

export interface IOrganizadorPendienteResponse {
  id: string; clienteId: string;
  cliente: { nombre: string | null; telefono: string };
  descripcion: string;                       // texto de la nota
  programadoDia: string; programadoHora: string | null; recordatorioAt: string;
  estado: EstadoOrganizador;
  vecesPospuesto: number;
  responsable: { id: string; nombre: string | null };
  cerradoAt: string | null; cerradoPor: { id: string; nombre: string | null } | null;
  version: string;                           // = recordatorioAt ISO (control optimista)
}
export interface IPendienteEventoResponse { id; notaId; clienteId; tipo; actor: { id; nombre } | null; at;
  antes; despues; motivo; motivos: { key; motivoId; nombre }[]; otroMotivo; comentario;
  tags: { id; nombre; color }[]; cliente: { nombre; telefono } | null }
```

### `organizador.model.ts` — índices (todos con `tenantId` delante)

```ts
PendienteEventoSchema.index({ tenantId: 1, notaId: 1, at: 1, _id: 1 });   // historial de un pendiente
PendienteEventoSchema.index({ tenantId: 1, at: -1, _id: -1 });            // feed de actividad
// Idempotencia del barrido: un solo `vencido` por nota e instante, aunque dos workers lleguen a la vez.
PendienteEventoSchema.index(
  { tenantId: 1, notaId: 1, 'despues.recordatorioAt': 1 },
  { unique: true, partialFilterExpression: { tipo: 'vencido' } },
);
MotivoCierreSchema.index({ tenantId: 1, nombre: 1 }, { unique: true, collation: { locale: 'es', strength: 2 } });
OrganizadorPreferenciaSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
```

Colecciones: `pendiente_eventos`, `motivos_cierre`, `organizador_preferencias`.

### `organizador.estado.ts` (puro, testeable sin Mongo)

```ts
export function derivarEstado(n: { estadoPendiente; recordatorioAt: Date | null; vecesPospuesto }, now: Date): EstadoOrganizador;
/** Filtro Mongo equivalente para listar por estado (lo usa el service con findScoped). */
export function filtroPorEstado(estado: EstadoOrganizador, now: Date): FilterQuery<IContactNote>;
//   vencido   → { estadoPendiente: 'abierto', recordatorioAt: { $lte: now } }
//   pospuesto → { estadoPendiente: 'abierto', recordatorioAt: { $gt: now }, vecesPospuesto: { $gt: 0 } }
//   pendiente → { estadoPendiente: 'abierto', recordatorioAt: { $gt: now }, vecesPospuesto: { $in: [0, null] } }
//   cerrado   → { estadoPendiente: 'cerrado' }
```

### `organizador.validation.ts`

```ts
const motivoTexto = z.string().trim().min(3).max(500);
listOrganizadorSchema.query = {
  estado: z.enum(ESTADOS_ORGANIZADOR).optional(),          // sin estado = todos
  desde/hasta: dia civil opcional, tz: zona IANA default,  // filtran por programadoDia
  clienteId: objectId.optional(), responsableId: objectId.optional(),
  page: ≥1 = 1, limit: 1..50 = 20,
};  // orden: abiertos por recordatorioAt asc; cerrados por cerradoAt desc
cerrarSchema.body = z.object({
  motivoKeys: z.array(z.enum(motivoKeys)).max(9).default([]),
  motivoIds: z.array(objectId).max(20).default([]),
  otro: z.object({ texto: motivoTexto }).optional(),
  comentario: z.string().trim().max(1000).optional(),
  tagIds: z.array(objectId).max(20).default([]),
  version: z.string().datetime(),
}).refine(b => b.motivoKeys.length + b.motivoIds.length > 0 || b.otro !== undefined,
          { message: 'Elige al menos un motivo de cierre.', path: ['motivoKeys'] });
posponerSchema.body = z.object({
  motivo: motivoTexto,
  nuevoDia: dia civil, nuevaHora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  tz: zona IANA default 'America/Bogota',
  tagIds: z.array(objectId).max(20).default([]),
  version: z.string().datetime(),
});  // «instante > now» se valida en el service (depende del reloj), → AppError 400
preferenciasSchema.body = z.object({ activo: z.boolean() });
crearMotivoSchema.body = z.object({ nombre: z.string().trim().min(3).max(80) });
historialSchema.params = { id: objectId };  actividadSchema.query = { page, limit, clienteId?, responsableId? }
```

### `organizador.service.ts`

```ts
getPreferencia(tenantId, userId): Promise<{ activo: boolean }>         // sin doc → true
setPreferencia(tenantId, userId, activo): Promise<{ activo: boolean }> // upsert findOneAndUpdateScoped
listOrganizador(tenantId, query, now = new Date()): Promise<IPaginated<IOrganizadorPendienteResponse>>
listActivos(tenantId, userId, now = new Date()): Promise<{ items; total }>  // autorId = userId, vencidos, tope 50
historialPendiente(tenantId, notaId): Promise<IPendienteEventoResponse[]>  // 404 si la nota no existe y no hay eventos
listActividad(tenantId, query): Promise<IPaginated<IPendienteEventoResponse>>
cerrarConMotivo(tenantId, actorId, notaId, body): Promise<IOrganizadorPendienteResponse>
posponer(tenantId, actorId, notaId, body, now = new Date()): Promise<IOrganizadorPendienteResponse>
listMotivos(tenantId): Promise<{ predefinidos; personalizados: { id; nombre }[] }>
crearMotivo(tenantId, actorId, nombre): Promise<{ id; nombre }>       // E11000 → AppError 409
```

**Cerrar** (orden importa; la escritura condicional es la puerta):
1. Validar `motivoIds` contra `motivos_cierre` del tenant (`findScoped`, todos deben existir → si no
   `404`) y `tagIds` con `assertTagsDelTenant` **antes** de escribir.
2. `findOneAndUpdateScoped(ContactNote, tenantId, { _id, pendiente: true, estadoPendiente: 'abierto',
   recordatorioAt: new Date(version) }, { $set: { estadoPendiente: 'cerrado', cerradoAt: now,
   cerradoPorId: actorId } }, { new: true })`.
3. `null` → segunda lectura: no existe en el tenant → `404`; existe → `409 'Este pendiente ya fue
   gestionado.'`.
4. `registrarEvento('cerrado', …)` con snapshot de nombres; `addTagsToCliente` si hay tags;
   `recordAuditEvent('contact-note.pendiente-cerrar', …)` sin texto;
   `publishRealtime({ type: 'pendiente:updated', tenantId, notaId })`.

**Posponer:** `nuevo = instanteEnZona(nuevoDia, nuevaHora, tz)`; `nuevo ≤ now` → `400 'La nueva
fecha y hora deben ser posteriores a la actual.'`; `assertTagsDelTenant`; escritura condicional con
el mismo filtro y `{ $set: { programadoDia, programadoHora, programadoTz: tz, recordatorioAt: nuevo,
notificadoPara: null }, $inc: { vecesPospuesto: 1 } }` con `new: false` para tener el `antes`;
404/409 igual; evento `pospuesto` con `antes`/`despues`/`motivo`; tags; auditoría
`contact-note.pendiente-posponer`; `pendiente:updated`.

`hidratar` reutiliza el patrón de `hidratarPendientes`: en lote `findScoped(Cliente, {_id:$in})`,
`findUsersByIds`, y para eventos `findScoped(Tag, {_id:$in})`. Sin `$lookup`.

### `organizador.eventos.ts`

```ts
export async function registrarEvento(tenantId: TenantId, e: NuevoEvento): Promise<boolean>;
// createScoped(PendienteEvento, ...). E11000 en `vencido` → false (otro worker ganó); el resto relanza.
```

Vive en `organizador/` y lo importan `contact-note.service`, `pendiente.service` y el barrido:
dirección de dependencia hacia el feature dueño del historial; no crea ciclo (organizador no importa
contact-note.service, solo el modelo).

### Barrido — `workers/organizador-sweep.processor.ts`

```ts
export async function processOrganizadorSweep(now = new Date()): Promise<{ avisados: number; rellenados: number }>;
```

1. **Backfill perezoso (legado):** `ContactNote.find({ pendiente: true, estadoPendiente: 'abierto',
   programadoDia: { $ne: null }, recordatorioAt: null }).select('_id tenantId programadoDia programadoHora').limit(500)`;
   por tenant lee `zonaHoraria` y hace `findOneAndUpdateScoped({ _id, recordatorioAt: null }, { $set:
   { recordatorioAt, programadoTz } })`.
2. **Vencidos:** `ContactNote.find({ pendiente: true, estadoPendiente: 'abierto', recordatorioAt:
   { $lte: now }, $expr: { $ne: ['$notificadoPara', '$recordatorioAt'] } }).select('_id tenantId').limit(500)`.
   Por cada uno, `findOneAndUpdateScoped(tenantId, { _id, estadoPendiente: 'abierto', recordatorioAt: r,
   notificadoPara: { $ne: r } }, { $set: { notificadoPara: r } })` — solo un worker gana —, luego
   `registrarEvento('vencido', origen 'sistema')` (red de seguridad: índice único) y
   `publishRealtime({ type: 'pendiente:vencido', tenantId, targetUserId: autorId, notaId })`.

Las dos lecturas globales solo proyectan `{_id, tenantId, …programación}` — mismo patrón que
`processCampaignSweep` — y toda escritura es `*Scoped` (documentar en `docs/multi-tenancy.md` como
excepción ya existente de «barrido del worker»). El barrido **no** consulta preferencias: la
preferencia solo gobierna la presentación (CA-13), así el historial registra el vencimiento igual.

`worker.ts`: en el worker de `flow-runtime` añadir `if (job.name === ORGANIZADOR_SWEEP_JOB)`;
`flowRuntimeQueue.upsertJobScheduler(ORGANIZADOR_SWEEP_SCHEDULER_ID, { every: env.ORGANIZADOR_SWEEP_EVERY_MS },
{ name: ORGANIZADOR_SWEEP_JOB, opts: { removeOnComplete: 100, removeOnFail: 100 } })`.

### Realtime

```ts
| { type: 'pendiente:vencido'; tenantId: string; targetUserId: string; notaId: string }   // → asesor:<targetUserId>
| { type: 'pendiente:updated'; tenantId: string; notaId: string }                          // → tenant:<id>
```

Sin payload sensible (nunca el texto): el cliente refetchea con su propio permiso.

### Endpoints

Todos: `authenticateJWT → requireTenant → authorize(['admin']) → authorizeSubrol(SUBROLES_DATOS_SENSIBLES) → validate(schema) → asyncHandler(controller)`.

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/organizador/preferencias` | 200 `{ activo }` |
| PUT | `/api/organizador/preferencias` | 200 `{ activo }` |
| GET | `/api/organizador/pendientes` | 200 `IPaginated<IOrganizadorPendienteResponse>` |
| GET | `/api/organizador/activos` | 200 `{ items, total }` (solo del usuario del token) |
| GET | `/api/organizador/pendientes/:id/historial` | 200 `IPendienteEventoResponse[]` · 404 |
| GET | `/api/organizador/historial` | 200 `IPaginated<IPendienteEventoResponse>` |
| POST | `/api/organizador/pendientes/:id/cerrar` | 200 · 400 · 404 · 409 |
| POST | `/api/organizador/pendientes/:id/posponer` | 200 · 400 · 404 · 409 |
| GET | `/api/organizador/motivos-cierre` | 200 `{ predefinidos, personalizados }` |
| POST | `/api/organizador/motivos-cierre` | 201 · 409 |

`addTagsToCliente(tenantId, clienteId, tagIds)` en `conversation.service.ts`, al lado de
`setConversationTags`: `assertTagsDelTenant` → `findOneAndUpdateScoped(Cliente, { _id }, { $addToSet:
{ tagIds: { $each } } })` → `publishRealtime('conversation:updated')`. Tope total de 20 etiquetas por
contacto igual que `setConversationTags` (si se supera → `422`).

## Contratos — frontend

```ts
// organizador/types.ts — espejo de los DTO del backend
export type EstadoOrganizador = 'pendiente' | 'vencido' | 'pospuesto' | 'cerrado';
export interface OrganizadorPendienteDTO { … } ; export interface PendienteEventoDTO { … }
export interface CerrarPendienteInput { motivoKeys; motivoIds; otro?: { texto }; comentario?; tagIds; version }
export interface PosponerPendienteInput { motivo; nuevoDia; nuevaHora; tz; tagIds; version }
```

- `api.ts` vía `apiClient` (sin `/api`): `getPreferencia`, `setPreferencia`, `fetchOrganizador(filtros)`,
  `fetchActivos`, `fetchHistorial(id)`, `fetchActividad`, `cerrarPendiente`, `posponerPendiente`,
  `fetchMotivos`, `crearMotivo`. `posponer` añade `tz: zonaDelNavegador()`.
- Query keys bajo `['organizador', …]`: `['organizador','preferencia']`,
  `['organizador','lista',filtros]`, `['organizador','activos']`, `['organizador','historial',id]`,
  `['organizador','actividad',filtros]`, `['organizador','motivos']`.
- `useRecordatoriosActivos(habilitado)`: `enabled = preferencia.activo && puedeVerSensibles`,
  `refetchInterval: 60_000`, `refetchOnWindowFocus: true`, `refetchOnReconnect: true`.
- Mutaciones cerrar/posponer: `onSuccess` invalidan `['organizador']`, `['pendientes']`,
  `['contact-notas', clienteId]`, `['conversations']` (etiquetas). `onError` 409 → toast «Este
  pendiente ya fue gestionado» + invalidar; no se trata como error rojo.
- `useOrganizadorRealtime` (montado en `AppLayout` junto a `useNotificationsRealtime`, mismo
  socket): `pendiente:vencido` y `pendiente:updated` → invalidar `['organizador']` y `['pendientes']`.
  Sin toast de sonner (los toasts caducan; el aviso persistente es la pila).
- `useNotas` / `usePendientes`: sus mutaciones también invalidan `['organizador']` (CA-12).

### Componentes (shadcn primero)

- **`OrganizadorPage`** — cabecera con título y `OrganizadorSwitch` (`Switch` + `Label`
  «Activar Organizador y recordatorios», texto de ayuda «Con el organizador apagado no verás avisos;
  tus pendientes se conservan.»). `Tabs` Próximos · Vencidos · Pospuestos · Cerrados · Historial con
  contador `tabular-nums`; filtros en URL (patrón `LeadsPage`: `useSearchParams`, `replace: true`,
  reset de página). Contenido: `OrganizadorTable` o `ActividadFeed`.
- **`OrganizadorFilters`** — `DateRangeFilter` existente (programadoDia), cliente (`Command` en
  `Popover` con búsqueda sobre los clientes presentes o `Input` con debounce), responsable
  (`Select` con usuarios del tenant — reutilizar el listado de admins asignables de la bandeja).
- **`OrganizadorTable`** — `Table`: Cliente (nombre + teléfono, enlace a
  `/inbox?conversacion=<clienteId>&volverA=/organizador`), Nota (`line-clamp-2`), Programado
  (`etiquetaProgramacion` de `lib/agenda.ts`), Estado (`EstadoPendienteBadge`), Responsable,
  acciones (Cerrar / Posponer en abiertos; «Ver historial» en todos → `HistorialPendienteSheet`).
  Estados skeleton / error con «Reintentar» / vacío por pestaña / paginación.
- **`EstadoPendienteBadge`** — Pendiente (neutro), Vencido (`destructive`), Pospuesto (tono
  `warning`/ámbar del token existente), Cerrado (verde/`success` del token existente).
- **`HistorialPendienteSheet`** — `Sheet` lateral con línea de tiempo: icono por tipo, actor
  («Sistema» si `null`), «de 12/11 10:00 a 14/11 09:00», motivo/motivos/otro, comentario,
  `TagChip`s.
- **`CerrarPendienteDialog`** — `Dialog`: resumen del pendiente; `Checkbox` por motivo
  predefinido + personalizados; «Otros motivos» (checkbox que revela `Textarea` obligatoria);
  «Crear nuevo motivo» (`Input` inline + «Guardar», añade y marca); `TagSelector` en modo controlado
  con estado local (no persiste hasta confirmar); `Textarea` de comentario opcional; botón
  «Confirmar cierre» deshabilitado sin motivo válido, `Loader2` mientras envía.
- **`PosponerPendienteDialog`** — `Dialog`: `Textarea` «¿Por qué desea posponer este pendiente?»;
  `ProgramacionPendiente` con hora **obligatoria** (prop nueva opcional `horaObligatoria`, sin
  cambiar su comportamiento por defecto) arrancando en mañana; validación «posterior a la actual»
  con `role="alert"`; etiquetas; «Confirmar aplazamiento».
- **`RecordatorioCard`** — cliente, nota (`line-clamp-3`), «Venció hace 5 min» (`haceRelativo`),
  «Abrir conversación», **Cerrar pendiente**, **Posponer pendiente**.
- **`RecordatoriosStack`** — `aside` fijo abajo a la derecha (`z` por debajo de los `Dialog`),
  `role="region" aria-label="Recordatorios pendientes" aria-live="polite"`. Muestra la primera
  tarjeta y «+N más» desplegable (`ScrollArea` máx. 60vh) para no tapar el CRM. Botón
  «Minimizar» → píldora con `BellRing` + contador que reabre al clic; minimizado se recuerda en
  `sessionStorage` (no la resolución). Sin `onInteractOutside`, sin temporizador, sin «X» de
  descartar. Oculto si `activo: false`, si no hay recordatorios o si no hay permiso. Las tarjetas
  nuevas entran con fundido + `translateY(8px)` 200 ms ease-out (`motion-safe`); al gestionarse
  salen con 150 ms.
- **`NotificationBell`** — `NotificationBellButton` recibe `count = unread + activos.total` (cuando
  el organizador está activo). `NotificationPanel` antepone sección «Recordatorios» (si hay) con
  `RecordatorioCard` compacta; la animación `bell-ring` existente se dispara cuando sube el total.
- **`PendienteCard`** (embudo) — el botón «Cerrar pendiente» abre `CerrarPendienteDialog` (D3); se
  retira el toast «Deshacer» del cierre rápido (reabrir sigue en Historial).

### Criterios de diseño (emil-design-eng + frontend-design)

- **Persistente pero no invasivo:** la pila es una región, no un modal; nunca bloquea el foco ni el
  scroll; se puede minimizar, no descartar. Las tarjetas de la pila son lo único con animación de
  entrada (son eventos, no contenido que se ve decenas de veces); tabla y pestañas sin animación.
- **Movimiento:** solo `transform`/`opacity`, ≤ 200 ms ease-out, `motion-safe`; `Dialog`/`Sheet`
  con sus transiciones de shadcn; `pressable` existente en botones; nunca `transition: all`; hover
  tras `@media (hover:hover)`.
- **Jerarquía:** en los modales la acción primaria («Confirmar cierre» / «Confirmar aplazamiento»)
  es la única con `variant="default"`; las acciones de la tarjeta «Cerrar» (primaria) y «Posponer»
  (`outline`). El rojo solo para Vencido.
- **Copy:** sentence case y voz activa en la UI («Cerrar pendiente», «Posponer pendiente»; el texto
  de la historia en MAYÚSCULAS se traduce a sentence case por consistencia con el CRM). Errores
  directos sin disculpas.
- **Calidad base:** foco visible y trampa de foco en `Dialog`; `aria-label` en iconos; teclado
  completo; contraste light/dark con tokens semánticos (`bg-card`, `text-muted-foreground`,
  `border-border`, `text-destructive`), sin `bg-[#…]`.
- `impeccable:impeccable` no estaba instalada al planear (igual que en HU-PDF-01): invocarla si
  existe al implementar; si no, anotarlo en `tasks.md`.

## Notas

- **Por qué estado derivado y no un enum nuevo en `estadoPendiente`:** HU-PDF-01 filtra
  `estadoPendiente: 'abierto'` en la columna, el PDF y las transiciones; un `vencido`/`pospuesto`
  almacenado rompería esas consultas y obligaría a un proceso que cambie el estado a tiempo. Derivar
  de `recordatorioAt` + `now` es exacto aunque el worker esté caído.
- **Por qué barrido y no un job con `delay` por recordatorio:** reprogramar es solo escribir un
  campo (no hay que cancelar/reencolar jobs), sobrevive a pérdidas de Redis y a reinicios, y el
  coste es una consulta indexada por minuto. Precisión ≤ 60 s, suficiente para compromisos
  comerciales. Detalle en ADR 0016.
- **Por qué no se crean documentos `notifications`:** tendrían su propio leído/no leído, que se
  desincronizaría del estado del pendiente (un aviso «leído» pero sin gestionar). La campana se
  reutiliza como **superficie**; la verdad es la nota.
- **Instantes en UTC, días civiles intactos:** `recordatorioAt` es `Date` (UTC en Mongo);
  `programadoDia`/`programadoHora` siguen siendo la fuente que leen el embudo y el PDF. La UI
  muestra en la zona del navegador.
- **Doble envío / varias pestañas:** el filtro de escritura incluye estado **y** `version`; nunca hay
  dos transiciones. Cada pestaña lista desde el servidor por `notaId`, así que no hay avisos
  duplicados en pantalla.
- **Permisos:** el gate de notas en todo el router. Un usuario sin acceso a notas no ve el ítem,
  no monta la pila (la consulta da 403 y la UI la trata como «sin recordatorios», mismo patrón que
  `usePendientes`).
- Actualizar `docs/data-model.md` (campos de `contact_notes` + 3 colecciones + índices),
  `docs/api-contract.md` (endpoints + códigos), `docs/domain.md` (estados del pendiente y
  transiciones), `docs/multi-tenancy.md` (barrido del worker), ADR 0016 + `docs/adr/README.md`.

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint
pnpm --filter @sofiapp/web test
```

Manual (con `pnpm dev` + `pnpm dev:worker`): crear en la bandeja una nota pendiente para dentro de
2 min → aparece en Próximos; al vencer, pila + campana sin recargar; recargar y cerrar sesión → sigue;
abrir dos pestañas y cerrar en una → desaparece en ambas; cerrar con «Otros motivos» y etiqueta →
etiqueta visible en la bandeja; posponer 2 veces → historial con ambas; editar la hora desde la
bandeja → un solo recordatorio; apagar el switch → sin avisos, encender → reaparecen; nota sin
pendiente → nada; columna Pendientes y PDF de HU-PDF-01 siguen igual. Light/dark con capturas en
`.playwright-mcp/`, borradas al terminar.

---

## Ampliación A1 — Recordar 5 o 10 minutos antes

- `contact_notes`: `avisoAntesMin: 0|5|10` (default 0) y `avisoAt: Date|null` (= `recordatorioAt −
  avisoAntesMin`). Índices parciales `{ tenantId, estadoPendiente, avisoAt }` (barrido) y
  `{ tenantId, autorId, estadoPendiente, avisoAt }` («activos», sustituye al de `recordatorioAt`).
- Zod (`contact-note.validation.ts`): `avisoAntesMin` opcional en alta y edición, solo con pendiente.
- `contact-note.service.ts`: `pendienteNuevo` y `cambiosDePendiente` calculan `avisoAt`; solo si
  cambia se limpia `notificadoPara`. `INotaResponse.avisoAntesMin`.
- `organizador.estado.ts`: `filtroAvisoDisparado(now)` (abiertos con `avisoAt ≤ now`, o sin `avisoAt`
  y `recordatorioAt ≤ now`) para `listActivos`. `derivarEstado` no cambia.
- `posponer`: conserva `avisoAntesMin` y fija el nuevo `avisoAt`.
- Barrido: avisa por `avisoAt`; `rellenarAvisos` pone `avisoAt` a los pendientes que aún no lo
  tienen. El evento sigue siendo `vencido` (la UI lo rotula «Aviso enviado»).
- Frontend: `ProgramacionPendiente` gana `aviso`/`onAvisoChange` opcionales (`Checkbox` + `ToggleGroup`
  5/10 min); los usan `ContactNotesCard` y `NotaItem`, no el modal de posponer. `RecordatorioCard`
  usa `momentoAviso`: «Vence en N min» antes de la hora, «Venció hace…» después.
