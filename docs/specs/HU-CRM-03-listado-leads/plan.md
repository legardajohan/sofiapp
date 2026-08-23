# HU-CRM-03 — Plan técnico (CÓMO)

## Archivos a crear

```
apps/frontend/src/features/leads/
├── hooks/useLeads.ts                    # useQuery(['leads', filtros]) con keepPreviousData
├── useLeadsStore.ts                     # Zustand de UI: selectedId + select(id) → abre el Sheet
├── lib/format.ts                        # ESTADO_LABEL, fechaCorta, fechaRelativa, RANGOS_FECHA
├── pages/LeadsPage.tsx                  # cabecera + filtros + tabla + sheet; filtros en la URL
├── components/LeadsFilters.tsx          # estado · semáforo · responsable · rango de fechas
├── components/LeadsFilters.test.tsx
├── components/LeadsTable.tsx            # tabla + 4 estados + paginación
├── components/LeadsTable.test.tsx
├── components/LeadDetailSheet.tsx       # detalle + resumen IA + "Abrir conversación"
└── components/LeadDetailSheet.test.tsx

docs/specs/HU-CRM-03-listado-leads/      # esta tríada
```

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `apps/backend/src/features/lead/lead.types.ts` | `ListLeadsQuery`, `ILeadListItemResponse` |
| `apps/backend/src/features/lead/lead.model.ts` | 3 índices nuevos |
| `apps/backend/src/features/lead/lead.validation.ts` | `listLeadsSchema` + `ListLeadsQueryInput` |
| `apps/backend/src/features/lead/lead.service.ts` | `listLeads` + helpers privados |
| `apps/backend/src/features/lead/lead.controller.ts` | `listLeadsController` |
| `apps/backend/src/features/lead/lead.routes.ts` | `GET /` antes de `GET /:id` |
| `apps/backend/src/features/lead/lead.isolation.test.ts` | 4 casos del criterio 12 |
| `apps/backend/src/features/lead/lead.service.test.ts` | casos funcionales |
| `apps/backend/src/features/lead/lead.routes.test.ts` | contrato HTTP del listado |
| `apps/frontend/src/features/leads/api.ts` | `fetchLeads` |
| `apps/frontend/src/features/leads/types.ts` | `LeadListItemDTO`, `LeadsFiltros`, `SemaforoSlug`, `Paginated` |
| `apps/frontend/src/features/leads/index.ts` | exporta `LeadsPage` y los tipos nuevos |
| `apps/frontend/src/router.tsx` | ruta `/leads` (lazy + `RequireRole(['admin'])` + `Suspense`) |
| `apps/frontend/src/components/layout/nav-config.ts` | ítem "Leads" en el grupo Operación |
| `apps/frontend/src/features/inbox/pages/InboxPage.tsx` | enlace profundo `?conversacion=` |
| `docs/api-contract.md` | fila de `GET /api/leads` |
| `docs/data-model.md` | índices nuevos de `leads` |
| `docs/specs/HU-CRM-01-…/spec.md` | `HU-CRM-02` → `HU-CRM-03` en *Fuera de alcance* |

`app.ts` **no se toca**: `app.use('/api/leads', leadRoutes)` ya existe desde HU-CRM-01.

## Contratos

### `lead.types.ts`

```ts
import type { SemaforoSlug, ITagResponse } from '../tag/tag.types.js';
import type { EstadoComercial, IResumenResponse } from '../cliente/cliente.types.js';

export interface ListLeadsQuery {
  page: number;
  limit: number;
  estado?: EstadoComercial;
  /** userId → `Lead.responsableId`. "Asesor" es función, no rol (AUTH-02). */
  asesor?: string;
  /** Slug de la etiqueta de sistema de la CONVERSACIÓN, no un campo del lead. */
  semaforo?: SemaforoSlug;
  desde?: Date;
  hasta?: Date;
}

/**
 * Proyección de listado. NO es `ILeadResponse`: ver la nota de la spec. Trae lo que la tabla
 * pinta (semáforo, resumen, último mensaje) y omite el `origen` completo, que costaría una
 * resolución de usuarios extra por página para algo que no se muestra.
 */
export interface ILeadListItemResponse {
  id: string;
  nombre: string;
  telefono: string;
  correo: string | null;
  estado: EstadoComercial;
  responsable: IRefResponse | null;
  /** `Lead.origen.conversacionId` — con esto la UI abre la conversación en la bandeja. */
  conversacionId: string;
  semaforo: ITagResponse | null;
  resumen: IResumenResponse | null;
  ultimoMensajeAt: string | null;
  createdAt: string;
}
```

### `lead.model.ts` — índices

```ts
LeadSchema.index({ tenantId: 1, createdAt: -1 });                   // orden por defecto del listado
LeadSchema.index({ tenantId: 1, estado: 1, createdAt: -1 });        // ?estado=
LeadSchema.index({ tenantId: 1, responsableId: 1, createdAt: -1 }); // ?asesor=
```

Los tres llevan `createdAt: -1` como última clave para que el filtro y el orden se resuelvan con el
mismo índice y Mongo no tenga que ordenar en memoria. El filtro por semáforo no lleva índice propio:
resuelve por `clienteId`, que ya está cubierto por `{ tenantId, clienteId }` de HU-CRM-01.

### `lead.validation.ts`

```ts
export const listLeadsSchema = z.object({
  body: empty,
  params: empty,
  query: z
    .object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
      estado: z.enum(ESTADOS_COMERCIALES).optional(),
      asesor: objectId.optional(),
      semaforo: z.enum(SEMAFORO_SLUGS_TUPLE).optional(),
      desde: z.coerce.date().optional(),
      hasta: z.coerce.date().optional(),
    })
    .refine((q) => !q.desde || !q.hasta || q.desde <= q.hasta, {
      message: 'El rango de fechas está invertido: «desde» no puede ser posterior a «hasta».',
      path: ['desde'],
    }),
});
```

`desde`/`hasta` llegan como `YYYY-MM-DD` y `z.coerce.date()` los interpreta a medianoche UTC. El
service estira `hasta` al **final del día** (criterio 3); hacerlo en el service y no en el schema
mantiene la validación describiendo la entrada y no la semántica de la consulta.

### `lead.service.ts`

```ts
export async function listLeads(
  tenantId: TenantId,
  query: ListLeadsQuery,
): Promise<IPaginated<ILeadListItemResponse>>
```

Pasos, calcados de `listConversations` (`conversation.service.ts:105`) y sin `aggregate`:

1. `buildLeadFilter(query)` → `estado`, `responsableId` y
   `createdAt: { $gte: desde, $lte: finDelDia(hasta) }`.
2. Si viene `semaforo`, `aplicarFiltroSemaforo(tenantId, filter, slug)`:
   `findOneScoped(Tag, tenantId, { semaforo: slug })`; si no existe → `null`, y `listLeads`
   devuelve `{ data: [], page, limit, total: 0 }` sin tocar `leads`. Si existe,
   `findScoped(Cliente, tenantId, { tagIds: tag._id }).select({ _id: 1 })` y
   `filter.clienteId = { $in: ids }`. Ambas consultas van por el repositorio scoped, así que el
   `$in` **solo puede contener clientes del propio tenant** — es lo que sostiene el criterio 12.
3. `findScoped(Lead, tenantId, filter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit).lean()`
   \+ `countScoped(Lead, tenantId, filter)` con **el mismo filtro**.
4. Hidratación en lote (una consulta por colección, sin `populate`):
   - `findUsersByIds(tenantId, responsableIds)` → `Map<string, IUserResponse>`.
   - `findScoped(Cliente, tenantId, { _id: { $in: clienteIds } }).select({ _id: 1, tagIds: 1, resumenIA: 1, ultimoMensajeAt: 1 })`.
   - `findTagsByIds(tenantId, todosLosTagIdsDeLaPágina)` y, por cliente, la primera etiqueta cuyo
     `semaforo` no sea `null`.
   - `toResumenResponse(cliente)` — **se reutiliza** la ya exportada en `cliente.service.ts`; la
     regla de `desactualizado` tiene un solo dueño.

### `lead.controller.ts` / `lead.routes.ts`

```ts
export const listLeadsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  // `validatedQuery`, no `req.query`: en Express 5 el getter re-parsea el query string crudo
  // y perdería defaults y coerciones de Zod (ver `validate.middleware.ts`).
  const query = req.validatedQuery as unknown as ListLeadsQuery;
  res.status(200).json(await listLeads(tenantId, query));
};
```

| Método | Ruta | Cadena de middlewares |
|---|---|---|
| `GET` | `/api/leads` | `authenticateJWT → requireTenant → authorize(['admin']) → validate(listLeadsSchema) → asyncHandler(listLeadsController)` |

`GET /` se registra **antes** de `GET /:id` por higiene de orden, aunque Express no los confunda.

### Frontend — `types.ts` y `api.ts`

```ts
export interface LeadsFiltros {
  page: number;
  estado?: EstadoComercial;
  asesor?: string;
  semaforo?: SemaforoSlug;
  desde?: string;   // YYYY-MM-DD
  hasta?: string;
}

export async function fetchLeads(f: LeadsFiltros): Promise<Paginated<LeadListItemDTO>> {
  const { data } = await apiClient.get<Paginated<LeadListItemDTO>>('/leads', { params: f });
  return data;
}
```

Ruta **sin** el prefijo `/api`: lo aporta el `baseURL` del `apiClient` (regla del CLAUDE.md del
frontend; repetirlo produce `/api/api/...` → 404).

## Decisiones de diseño (frontend)

| Decisión | Motivo |
|---|---|
| Los filtros viven en `useSearchParams`, no en el store | La vista se comparte por enlace y sobrevive al refresco. Es lo que ya hace `InboxPage` con `?filtro` |
| El store de Zustand guarda **solo** `selectedId` | Estado de UI. Los datos del listado son estado de servidor y viven en TanStack Query — no se mezclan los dos roles |
| `keepPreviousData` en el `useQuery` | Al cambiar de página la tabla no parpadea a skeleton; se mantiene la anterior mientras llega la nueva. Es lo que hace `useAiResponses` |
| Cambiar cualquier filtro resetea `page` a 1 | Seguir en la página 5 de un listado que ahora tiene 2 deja al usuario en un callejón sin salida |
| Vacío inicial y vacío por filtros son **mensajes distintos** | Ver "no tienes leads" cuando en realidad el filtro no casa es desinformar. El segundo ofrece "Limpiar filtros" |
| Fechas por presets + `<input type="date">` nativo | Popover/Calendar no están instalados y traerían `react-day-picker` + `date-fns`. El nativo es accesible por teclado y correcto en ambos temas. Los presets cubren el caso frecuente sin abrir nada |
| Color del semáforo desde `tag.color`, nunca hardcodeado | El administrador puede recolorear las etiquetas (`docs/domain.md` §5) |
| Sin animación en cambio de filtro ni de página | Son acciones repetidas; animarlas solo las haría sentir lentas (criterio de `emil-design-eng`). La única transición es la del `Sheet`, que ya trae el kit |

### Copy

| Momento | Texto |
|---|---|
| Título de la página | Leads |
| Subtítulo | Todo lo que se convirtió desde una conversación. |
| Contador | `{n} leads` · `1 lead` · `Ninguno todavía` |
| Vacío inicial | **Todavía no hay leads.** En cuanto conviertas una conversación en lead, aparece aquí. |
| Vacío por filtros | **Ningún lead coincide con estos filtros.** Prueba a ampliar el rango de fechas o a quitar alguno. → *Limpiar filtros* |
| Error | No se pudo cargar el listado de leads. → *Reintentar* |
| Resumen ausente (Sheet) | Esta conversación todavía no tiene resumen. Se genera desde la bandeja, en la conversación. |
| Resumen desactualizado | Desactualizado — llegaron mensajes después de generarlo. |
| Acción del Sheet | Abrir conversación |

## Notas

- **El `$in` del filtro por semáforo crece con el tenant.** Es el precio de que el semáforo viva en
  la conversación y no en el lead. A escala MVP (miles de clientes) es correcto y sigue siendo una
  sola consulta indexada por `{ tenantId, tagIds }`. Si algún día molesta, la salida no es paginar
  el `$in` sino **denormalizar el slug sobre `Lead`** y mantenerlo al aplicar etiquetas; se deja
  anotado aquí para no redescubrirlo.
- **La etiqueta de semáforo puede no existir.** El administrador puede borrarla, y `docs/domain.md`
  §5 obliga a tolerarlo. Devolver el listado *sin filtrar* cuando el slug no existe sería peor que
  devolver vacío: el usuario pidió acotar y recibiría todo.
- **`hasta` inclusive** se resuelve estirando la fecha al final del día en el service. Sin eso,
  "hasta hoy" no incluiría nada de hoy, que es justo lo que el usuario espera ver.
- **Nada de `populate`.** Saltaría el repositorio scoped y con él la garantía de aislamiento. Toda
  referencia se resuelve con los helpers en lote que ya existen.
- **El enlace profundo de la bandeja** (`?conversacion=`) es un cambio de ~5 líneas en `InboxPage`,
  pero es lo que convierte "Abrir conversación" en algo útil; sin él el botón solo abriría la
  bandeja por su primera conversación.

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
pnpm --filter @sofiapp/web build
pnpm --filter @sofiapp/web lint
pnpm --filter @sofiapp/web test
```

> Los filtros del workspace son `@sofiapp/api` y `@sofiapp/web`. El `pnpm --filter backend` que
> aparece en el CLAUDE.md raíz falla con `No projects matched the filters` (deuda documentada).
