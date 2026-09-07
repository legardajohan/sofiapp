# HU-PIPE-01 — Plan técnico (CÓMO)

> El QUÉ está en `spec.md`; la ejecución en `tasks.md`. Este documento no repite las reglas del
> proyecto: da por sentados el `CLAUDE.md` raíz (aislamiento multi-tenant, `tenantId` del token),
> el patrón de 6 archivos de `apps/backend/CLAUDE.md` y las skills de diseño obligatorias de
> `apps/frontend/CLAUDE.md` §7.

## Nota de rama (leer antes de escribir código)

La rama sale de `origin/develop`, que está a la altura de **HU-CRM-03**. Dos consecuencias:

- **No existe `features/semaforo/` ni `Lead.semaforo`** (son de HU-CRM-04, aún sin mergear). La
  proyección de la tabla en esta base expone `semaforos: TagDTO[]` —las etiquetas de la
  conversación—, y la tarjeta del tablero pinta **esa** forma. Si HU-CRM-04 entra a `develop` antes
  que esta historia, la tarjeta pasa a leer `semaforo: SemaforoDTO | null`; es un cambio de una
  línea en `PipelineCard`, no un rediseño.
- **`listAuditEvents` todavía no acepta `accion?`** (también es de HU-CRM-04). Hay que añadirlo
  aquí. **Escribirlo con la misma forma exacta que en `feat/HU-CRM-04`** —`buildAuditFilter`
  compartido por la página y el conteo— para que el merge posterior resuelva de forma trivial en
  vez de convertirse en un conflicto a mano.

## Archivos a crear / tocar

### Backend — `apps/backend/src/`

```
features/estado/
├── estado.types.ts          # TOCAR  esSalida en IEstado e IEstadoResponse
├── estado.model.ts          # TOCAR  campo esSalida (Boolean, required, default false)
└── estado.service.ts        # TOCAR  esSalida en toResponse; + findEstadoByKey, existeEstadoActivo

features/pipeline/           # NUEVO — slice de LECTURA: sin .model.ts, no estrena colección
├── pipeline.types.ts
├── pipeline.validation.ts
├── pipeline.service.ts
├── pipeline.controller.ts
└── pipeline.routes.ts

features/lead/
├── lead.types.ts            # TOCAR  IHistorialEstadoResponse
├── lead.validation.ts       # TOCAR  updateLeadStageSchema, historialEstadoSchema
├── lead.service.ts          # TOCAR  updateLeadEstado (etapa archivada, lead.estado, realtime)
│                            #        + listHistorialEstado
├── lead.controller.ts       # TOCAR  updateLeadStageController, historialEstadoController
└── lead.routes.ts           # TOCAR  PATCH /:id/stage y GET /:id/historial-etapa antes de /:id

features/audit/
├── audit.types.ts           # TOCAR  acción 'lead.estado'
└── audit.service.ts         # TOCAR  accion? opcional + buildAuditFilter compartido

realtime/realtime.types.ts   # TOCAR  evento 'lead:stage-changed'
seed/seed-estados.ts         # TOCAR  declinado + esSalida + backfillEstadoDeclinado()
app.ts                       # TOCAR  montaje /api/pipeline + backfillEstadoDeclinado() al arranque
```

**No se toca `lead.model.ts`.** El campo `estado` ya existe con el índice
`{ tenantId, estado, createdAt: -1 }` que el pipeline necesita: agrupa por `estado` y ordena por
`createdAt` descendente, que es exactamente lo que hace ese índice. **El feature no añade ni un
índice nuevo.**

### Frontend — `apps/frontend/src/`

```
features/pipeline/                        # NUEVO
├── types.ts                              # PipelineColumnDTO, PipelineDTO, PipelineFiltros
├── api.ts                                # fetchPipeline, moveLeadStage  (rutas SIN /api)
├── index.ts                              # barrel
├── hooks/
│   ├── usePipeline.ts                    # query ['pipeline', filtros]
│   ├── useMoveLeadStage.ts               # mutación OPTIMISTA con rollback
│   └── usePipelineRealtime.ts            # socket 'lead:stage-changed' → invalidate
└── components/
    ├── PipelineBoard.tsx                 # DndContext + sensores + DragOverlay + announcements
    ├── PipelineColumn.tsx                # useDroppable + cabecera + ScrollArea
    ├── PipelineCard.tsx                  # useDraggable
    └── PipelineSkeleton.tsx

features/leads/pages/LeadsPage.tsx        # TOCAR  Tabs Tabla|Embudo + ?vista= en la URL
features/estados/types.ts                 # TOCAR  esSalida en EstadoDTO
```

**Sin componentes shadcn nuevos:** `tabs`, `scroll-area`, `card`, `badge`, `skeleton`, `tooltip` y
`dropdown-menu` ya están vendorizados en `src/components/ui/`. Lo único que se instala son las tres
dependencias de `@dnd-kit`.

### Documentación

```
docs/adr/0007-tablero-kanban-pipeline.md          # NUEVO
docs/adr/README.md                                # + fila 0007, y las de 0004/0005 que faltan
docs/product.md                                   # §5 M02 y "Módulos eliminados"
docs/data-model.md                                # estados.esSalida, declinado, lead.estado
docs/domain.md                                    # etapa de salida
docs/api-contract.md                              # §6: las tres rutas
README.md                                         # la línea "(sin Kanban)"
apps/frontend/CLAUDE.md                           # §Vistas núcleo + endpoint obsoleto
docs/specs/HU-CRM-01-*/spec.md                    # nota de supersesión
docs/specs/HU-CRM-03-listado-leads/spec.md        # nota de supersesión
```

## Contratos

### `estado.types.ts` — la etapa de salida

```ts
export interface IEstado {
  // … campos existentes: tenantId, key, label, color, orden, activo, esDefecto
  /**
   * Etapa terminal del embudo: el recorrido acaba aquí. `perdido` y `declinado` nacen en `true`.
   *
   * Es **descriptivo, no restrictivo**: no bloquea ninguna transición (las etapas activas son
   * libremente alcanzables entre sí), solo le dice a la UI qué columnas cierran el embudo para que
   * pueda señalarlas. Convertirlo en una regla de permisos sería reintroducir por la puerta de
   * atrás la máquina de transiciones que la historia descarta.
   */
  esSalida: boolean;
}
```

`IEstadoResponse` gana el mismo campo. `toResponse` lo mapea con `?? false`, para que un documento
anterior a esta historia —sin el campo— no salga como `undefined`.

Funciones nuevas en `estado.service.ts`:

```ts
/** El estado del catálogo del tenant, o `null`. La usa el cambio de etapa para leer `activo`. */
export async function findEstadoByKey(tenantId: TenantId, key: string): Promise<IEstadoResponse | null>;

/**
 * `true` solo si la clave existe en el catálogo del tenant **y** está activa. No basta con
 * `existeEstado`: mover un lead a una etapa archivada la resucitaría en el tablero, que solo
 * pinta las activas — la tarjeta desaparecería sin explicación.
 */
export async function existeEstadoActivo(tenantId: TenantId, key: string): Promise<boolean>;
```

`existeEstado` **se conserva** tal cual: la usa el filtro `?estado=` del listado, que sí debe
admitir archivadas (un lead puede llevar grabada una etapa que ya no se ofrece).

### `pipeline.types.ts`

```ts
/** Una columna del tablero: la etapa y su primera página de leads. */
export interface IPipelineColumnResponse {
  /** La etapa, tal cual la devuelve `GET /api/estados` (incluye `color` y `esSalida`). */
  etapa: IEstadoResponse;
  /**
   * Cuántos leads del tenant hay en esta etapa **con los filtros aplicados**. No es
   * `leads.length`: la columna trae como mucho `limit` tarjetas y el conteo es del total, que es
   * lo que la cabecera necesita para no mentir.
   */
  total: number;
  /** Primera página de la columna, ordenada por `createdAt: -1` como la tabla. */
  leads: ILeadListItemResponse[];
}

export interface IPipelineResponse {
  columnas: IPipelineColumnResponse[];
  /** El tope por columna que se aplicó. La UI lo necesita para saber si hay más de lo que muestra. */
  limit: number;
}

/** Filtros ya validados y coercidos. Es `ListLeadsQuery` sin `page` y **sin `estado`**. */
export interface PipelineQuery {
  limit: number;
  asesor?: string;
  semaforo?: string;
  desde?: Date;
  hasta?: Date;
}
```

### `pipeline.validation.ts`

```ts
/**
 * Mismos filtros que el listado menos `page` y `estado`. `estado` no se admite **a propósito**:
 * el tablero agrupa por etapa, y filtrar por una sola devolvería un tablero de una columna que la
 * tabla ya sabe dibujar. `.strict()` en la query lo convierte en un `400` explícito en vez de
 * ignorarlo en silencio.
 *
 * `limit` es POR COLUMNA, no del total: con diez etapas, `limit=50` son hasta 500 leads.
 * De ahí el techo de 50, más bajo que el 100 del listado.
 */
export const getPipelineSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z
    .object({
      limit: z.coerce.number().int().positive().max(50).default(20),
      asesor: objectId.optional(),
      semaforo: z.string().trim().min(1).max(40).optional(),
      desde: z.coerce.date({ invalid_type_error: 'Fecha «desde» inválida.' }).optional(),
      hasta: z.coerce.date({ invalid_type_error: 'Fecha «hasta» inválida.' }).optional(),
    })
    .strict()
    .refine((q) => !q.desde || !q.hasta || q.desde <= q.hasta, {
      message: 'El rango está invertido: «desde» no puede ser posterior a «hasta».',
      path: ['desde'],
    }),
});

export type GetPipelineQuery = z.infer<typeof getPipelineSchema>['query'];
```

### `pipeline.service.ts` — reutilizar, no reescribir

```ts
export async function getPipeline(
  tenantId: TenantId,
  query: PipelineQuery,
): Promise<IPipelineResponse>;
```

Cómo:

1. `listEstados(tenantId)` y quedarse con las **activas**, ya ordenadas por `orden`.
2. Por cada etapa, en paralelo (`Promise.all`), la página y el conteo con el filtro común más
   `{ estado: etapa.key }`, apoyado en el índice `{ tenantId, estado, createdAt: -1 }` que ya
   existe.
3. Mapear cada lead con **la misma función que usa la tabla**.

Dos exigencias que no son negociables:

- **`buildLeadFilter` y `toLeadListItemResponse` se reutilizan desde `lead.service.ts`** —
  exportándolas si hoy son privadas. Escribir una proyección paralela para la tarjeta garantizaría
  que fila y tarjeta divergieran en la primera modificación del listado.
- **La resolución de responsables va en lote para TODO el tablero**, no por columna: un
  `findUsersByIds` con la unión de los `responsableId` de todas las columnas. Resolverlos columna a
  columna serían N consultas para pintar los mismos nombres.

> **Sin `aggregate`.** `base.repository` no expone `aggregateScoped`, y una agregación con
> `$group` obligaría a escribir el `$match: { tenantId }` a mano — exactamente la clase de query
> que las reglas del proyecto sacan del alcance del programador. N consultas `countScoped` +
> `findScoped` sobre un índice que ya existe son baratas y **imposibles de escribir mal**.

### `lead.service.ts` — el cambio de etapa

`updateLeadEstado` conserva su firma. Cambia por dentro:

```ts
export async function updateLeadEstado(
  tenantId: TenantId,
  actorId: string,
  leadId: string,
  estado: string,
): Promise<ILeadResponse> {
  const lead = await findByIdScoped(Lead, tenantId, leadId).lean<ILeadLean>();
  if (!lead) throw new AppError('Lead no encontrado.', 404);

  // Activa, no solo existente: mover a una etapa archivada haría desaparecer la tarjeta del
  // tablero —que solo pinta las activas— sin que nadie pudiera explicar dónde fue a parar.
  if (!(await existeEstadoActivo(tenantId, estado))) {
    throw new AppError('Esa etapa no existe o está archivada en el catálogo de la empresa.', 400);
  }

  // Soltar la tarjeta en la columna de la que salió: ni escritura, ni historial, ni evento.
  if (lead.estado === estado) return getLeadById(tenantId, leadId);

  await findOneAndUpdateScoped(Lead, tenantId, { _id: lead._id }, { $set: { estado } });

  await recordAuditEvent(tenantId, {
    actorId,
    accion: 'lead.estado',          // acción propia: el historial de etapa no debe mezclar
    entidad: 'lead',                // `lead.create` ni `lead.delete`
    entidadId: String(lead._id),
    antes: { estado: lead.estado },
    despues: { estado },
  });

  const actualizado = await getLeadById(tenantId, leadId);

  // Después de persistir y auditar: `publishRealtime` nunca lanza, pero el orden deja claro que
  // el evento es una consecuencia del cambio, no parte de él.
  await publishRealtime({
    type: 'lead:stage-changed',
    tenantId: String(tenantId),
    leadId: String(lead._id),
    de: lead.estado,
    a: estado,
    lead: actualizado,
  });

  return actualizado;
}
```

> **`accion: 'lead.estado'` en lugar de `'lead.update'`.** Los cambios anteriores a esta historia
> quedaron grabados como `lead.update`, y **no se migran**: reescribir una bitácora de auditoría es
> peor que tener dos nombres para lo mismo. `listHistorialEstado` consulta **ambas** acciones, de
> modo que el historial de un lead antiguo se sigue viendo entero.

El historial:

```ts
/**
 * Historial de cambios de etapa. Sale de `audit_events` filtrando por acción — `lead.estado` y el
 * `lead.update` histórico —, no de una colección propia: es el uso para el que esa bitácora se
 * creó. El filtro va DENTRO de la consulta paginada, no después: filtrar sobre la página ya
 * traída rompería el `total`.
 */
export async function listHistorialEstado(
  tenantId: TenantId,
  leadId: string,
  page: number,
  limit: number,
): Promise<IPaginated<IHistorialEstadoResponse>>;
```

Antes de leer el historial comprueba que el lead **es del tenant** (`findByIdScoped` → `404`); si
no, un id ajeno devolvería una página vacía en vez de decir que no existe.

```ts
export interface IHistorialEstadoResponse {
  id: string;
  /** `key` de la etapa anterior. */
  de: string | null;
  a: string | null;
  actor: IRefResponse | null;
  at: string;
}
```

### `audit.service.ts` — filtro por acción

`listAuditEvents` gana un sexto parámetro opcional `accion?: AuditAccion | AuditAccion[]`, y la
construcción del filtro se extrae a un `buildAuditFilter` **compartido por la consulta paginada y
por `countScoped`**. Sin compartirlo, el `total` contaría eventos que la página no devuelve.

`AuditAccion` gana `'lead.estado'`.

### `realtime.types.ts` — el evento

```ts
| {
    type: 'lead:stage-changed';
    tenantId: string;
    leadId: string;
    /** `key` de la etapa de origen y de destino: la UI sabe qué dos columnas refrescar. */
    de: string;
    a: string;
    lead: ILeadResponse;
  }
```

No hace falta tocar `realtime.publisher.ts`: `subscribeRealtime` ya reemite genéricamente con
`io.to('tenant:' + evt.tenantId).emit(evt.type, evt)` para todo evento que no sea
`conversation:assigned`. El aislamiento por room sale gratis, y por eso el criterio 11 se cumple sin
código nuevo de fan-out.

### `lead.validation.ts` / `lead.routes.ts`

```ts
/**
 * Cambio de etapa (HU-PIPE-01). `.strict()` porque el body tiene UNA llave: colar `semaforo` o
 * `responsableId` por aquí debe ser un `400` explícito, no un cambio por la puerta de atrás.
 */
export const updateLeadStageSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({ estado: z.string().trim().min(1).max(40) }).strict(),
});

export const historialEstadoSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});
```

Rutas nuevas, **antes** de las genéricas `/:id`, con la cadena canónica
(`authenticateJWT → requireTenant → authorize(['admin']) → validate → asyncHandler`):

| Método | Ruta | Schema | Controller |
|---|---|---|---|
| `PATCH` | `/api/leads/:id/stage` | `updateLeadStageSchema` | `updateLeadStageController` |
| `GET` | `/api/leads/:id/historial-etapa` | `historialEstadoSchema` | `historialEstadoController` |
| `GET` | `/api/pipeline` | `getPipelineSchema` | `getPipelineController` |

`PATCH /api/leads/:id` **se conserva intacto**: mismo schema, mismo controller, mismo service.

### `seed-estados.ts`

```ts
export const ESTADOS_DEFECTO: { key: string; label: string; color: string; esSalida: boolean }[] = [
  { key: 'nuevo',          label: 'Nuevo',          color: '#64748B', esSalida: false },
  { key: 'en_gestion',     label: 'En gestión',     color: '#2563EB', esSalida: false },
  { key: 'pago_pendiente', label: 'Pago pendiente', color: '#D97706', esSalida: false },
  { key: 'pagado',         label: 'Pagado',         color: '#16A34A', esSalida: false },
  { key: 'perdido',        label: 'Perdido',        color: '#DC2626', esSalida: true  },
  { key: 'declinado',      label: 'Declinado',      color: '#B91C1C', esSalida: true  },
];

/**
 * Añade `declinado` a los tenants **ya sembrados**. `seedEstados` no sirve para esto: sale antes de
 * tiempo con `estadosSeeded: true`, que es justo lo que tienen todos los tenants existentes.
 *
 * Es un `updateOne` con `upsert` y `$setOnInsert`, así que **no pisa** el renombrado ni el
 * recoloreado si el administrador ya había creado su propio "Declinado"; y `orden` va al final del
 * pipeline de cada tenant, no en una posición fija — cada empresa tiene el suyo.
 */
export async function backfillEstadoDeclinado(): Promise<void>;
```

`seedEstados` también persiste `esSalida`. Es `$setOnInsert`, así que un tenant que ya tenga
`perdido` no lo ve cambiar; a esos los cubre el mismo backfill, que marca `esSalida: true` en
`perdido` y en `declinado` **solo si el campo no está definido** — nunca contra una elección
posterior del administrador.

### Frontend — contratos

```ts
// features/pipeline/types.ts
export interface PipelineColumnDTO {
  etapa: EstadoDTO;             // gana `esSalida`
  total: number;
  leads: LeadListItemDTO[];     // el mismo DTO que la tabla; nada paralelo
}
export interface PipelineDTO { columnas: PipelineColumnDTO[]; limit: number; }

/** Los filtros del listado menos `page` y `estado`. La vista comparte los demás con la tabla. */
export type PipelineFiltros = Omit<LeadsFiltros, 'page' | 'estado'>;
```

```ts
// features/pipeline/api.ts  — rutas SIN el prefijo /api (lo aporta el baseURL)
export async function fetchPipeline(filtros: PipelineFiltros): Promise<PipelineDTO>;
export async function moveLeadStage(id: string, estado: string): Promise<LeadDTO>;
//   → apiClient.patch(`/leads/${id}/stage`, { estado })
```

**`useMoveLeadStage` — la primera mutación optimista del feature.** Hoy `useUpdateLeadEstado` es
`invalidate`-on-success, y ese patrón no sirve aquí: soltar una tarjeta y verla volver a su sitio
durante el round-trip se lee como un fallo. La forma:

```ts
onMutate: async ({ id, estado }) => {
  await qc.cancelQueries({ queryKey: ['pipeline'] });      // sin esto, un refetch en vuelo pisa
  const previo = qc.getQueryData<PipelineDTO>(clave);      //   el optimismo al aterrizar
  qc.setQueryData<PipelineDTO>(clave, mover(previo, id, estado));  // + ajustar los dos `total`
  return { previo };
},
onError: (error, _vars, ctx) => {
  if (ctx?.previo) qc.setQueryData(clave, ctx.previo);     // la tarjeta vuelve a su columna
  toast.error(motivo(error, 'No se pudo mover la oportunidad.'));  // el mensaje del backend
},
onSettled: () => { void qc.invalidateQueries({ queryKey: ['pipeline'] }); },
```

`motivo()` ya existe en `features/leads/hooks/useUpdateLeadEstado.ts`: extrae
`error.response.data.message`, que es lo que convierte «no se pudo» en «esa etapa está archivada».
Se mueve a `features/leads/lib/errors.ts` para no tenerlo copiado en tres hooks.

**`usePipelineRealtime`** se calca de `features/inbox/hooks/useInboxRealtime.ts`: `getSocket()`,
`socket.on('lead:stage-changed', …)` → `invalidateQueries(['pipeline'])` y `(['leads'])`, y `off`
en el cleanup. **Una diferencia deliberada:** *no* llama a `disconnectSocket()` al desmontar, como
sí hace la bandeja — si el usuario alterna entre pestaña Tabla y Embudo, tirar el socket en cada
cambio provocaría una reconexión por clic.

**Accesibilidad del tablero (criterio 13).** `DndContext` con `PointerSensor` **y**
`KeyboardSensor`; el `announcements` de dnd-kit traducido al español (`onDragStart`, `onDragOver`,
`onDragEnd`, `onDragCancel`) para que un lector de pantalla narre el movimiento. La tarjeta es un
`button` con `aria-roledescription`, no un `div` con handlers.

**Color de la etapa.** Se pinta con `tagColors(etapa.color, resolvedTheme)` de
`features/tags/lib/tag-color.ts` —el motor de contraste que ya usa `LeadsTable`—, aplicado por
`style`. Un hex elegido por el tenant no puede ir crudo al fondo: en oscuro sería ilegible.

## Notas

- **`limit` es por columna.** Con diez etapas y `limit=50` el backend devuelve hasta 500 leads en
  una respuesta. De ahí el techo de 50 (el listado permite 100) y el default de 20.
- **El tablero no pagina.** Cuando una columna tiene más de `limit`, la cabecera lo dice
  (`20 de 137`) y se ofrece «Ver en tabla» con el filtro de esa etapa aplicado — la tabla sí pagina,
  y es la herramienta correcta para recorrer 137 leads. Reimplementar paginación dentro de una
  columna sería duplicar lo que ya funciona.
- **El aislamiento del evento de tiempo real es gratis** y por eso no aparece como trabajo: viaja
  por el room `tenant:<id>` que `subscribeRealtime` ya aplica a toda la unión de eventos. Lo que sí
  hay que hacer es **probarlo** (criterio 11).
- **Regla §7 de diseño.** Antes de escribir cualquiera de los cuatro componentes hay que invocar
  `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`. En este entorno
  las dos primeras del listado disponible son `emil-design-eng` y `frontend-design:frontend-design`;
  **`impeccable:impeccable` no está instalada** — se anota en `tasks.md`, no se simula.

## Verificación

- `pnpm --filter @sofiapp/api typecheck` — `tsc --noEmit` en verde.
- `pnpm --filter @sofiapp/api test` — incluidos los dos tests de aislamiento nuevos.
- `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`) y `lint` sin warnings.
- `pnpm --filter @sofiapp/web test`.
- Checklist de PR de `docs/multi-tenancy.md` §9.
- Verificación manual por HTTP y en el navegador: el detalle está en `tasks.md`.
