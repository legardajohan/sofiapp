# AUTH-06 — Plan técnico

> **CÓMO** implementar `spec.md`. Se construye sobre AUTH-05 en la rama `feat/AUTH-03`, sin rama
> propia. La regla de oro: **un único resolvedor** decide quién recibe una conversación; transferencia
> IA y nodos de flujo lo llaman, nunca reimplementan el reparto.

## Flujo del resolvedor

```
resolverDestinoAsignacion(tenantId, destino)
  ├─ modo 'usuario' → assertAssignableAdmin(usuarioId) ── ok → usuarioId
  │                                                    └─ falla → reserva
  └─ modo 'grupo'   → miembrosDelGrupo(grupo)
                       → soloEnLinea ? filtrarEnLinea(miembros) : miembros
                       → vacío ? reserva : aplicarCriterio(criterio, candidatos)

reserva:
  cualquiera   → aplicarCriterio('menor_carga', miembrosDelGrupo({ tipo: 'todos' }))
  grupo        → aplicarCriterio('menor_carga', miembrosDelGrupo(grupoReserva)) → vacío ? cualquiera
  sin_asignar  → null
```

`aplicarCriterio('primero')` = `candidatos[0]` (ya vienen por nombre). `aplicarCriterio('menor_carga')`
= recorrido estable con `<` (empate → primero por nombre), el mismo algoritmo de `asesorConMenorCarga`.

## Archivos a crear

| Ruta | Propósito |
|---|---|
| `packages/shared/src/destino-usuarios.ts` | Tipos `GrupoUsuarios`, `DestinoAsignacion`, `ReservaDestino`, `CriterioDestino`; `DESTINO_POR_DEFECTO`; `etiquetaGrupo`, `destinoCompleto`, `serializarGrupoQuery` / `parsearGrupoQuery` (sintaxis de `?grupo=`). Puras. |
| `apps/backend/src/features/users/user.grupos.ts` | Zod (`grupoUsuariosSchema`, `destinoAsignacionSchema`, `grupoQuerySchema`), `filtroGrupo`, `miembrosDelGrupo`, `validarDestino`. |
| `apps/backend/src/features/users/user.destino.ts` | `ESTADOS_ACTIVOS`, `cargaPorUsuario`, `idsEnLinea`, `EN_LINEA_MS`, `resolverDestinoAsignacion`, `destinoDesdeLegado`. |
| `apps/backend/src/features/users/user.grupos.test.ts` · `user.destino.test.ts` · `user.destino.isolation.test.ts` | Tests (criterios 2–5, 11, 13). |
| `apps/frontend/src/lib/grupos-usuarios.ts` | `agruparPorRol(users, { incluirInactivos })` → secciones con el principal primero y marcado. |
| `apps/frontend/src/components/users/UserGroupSelect.tsx` | Select agrupado por rol (usuarios), reutilizado por filtros y asignación. |
| `apps/frontend/src/components/users/DestinoSelector.tsx` | Editor de `DestinoAsignacion`: modo, criterio, grupo (rol / equipo + coordinador / sin principal), solo en línea, reserva. |
| `docs/adr/0019-destinos-por-rol.md` | Decisión: grupo de usuarios + resolvedor único + compatibilidad. |

## Archivos a tocar

| Ruta | Cambio |
|---|---|
| `packages/shared/src/index.ts` | Exportar `destino-usuarios`. |
| `packages/shared/src/flow-graph.ts` | `asignar_asesor` y `handoff` con `destino?`; completitud vía `destinoCompleto` (y `asesorId` legado). |
| `apps/backend/src/features/users/user.service.ts` | Exportar `assertCoordinadorValido`. |
| `apps/backend/src/features/ai/ai-handoff.types.ts` | `destino?: DestinoAsignacion` en `IHandoffSettings`; `destino` en el DTO; `AsesorMetricasDTO` + `rolEmpresa`, `coordinadorId`, `esPrincipal`, `enLinea`. |
| `apps/backend/src/features/ai/ai-handoff.model.ts` | Subdocumento `destino` (`Mixed` validado por Zod en el borde, `default: undefined`). |
| `apps/backend/src/features/ai/ai-handoff.validation.ts` | `destino` opcional; `estrategiaDestino`/`asesorDestinoId` opcionales; refine: al menos uno de los dos formatos. |
| `apps/backend/src/features/ai/ai-handoff.service.ts` | `toDTO` deriva `destino`; `updateHandoffSettings` valida con `validarDestino` y escribe ambos formatos; `primerAdminActivo`/`asesorConMenorCarga` se retiran (o quedan como envoltorios si tienen otros usos); `metricasPorAsesor` con campos nuevos; `ESTADOS_ACTIVOS` re-exportado desde `user.destino`. |
| `apps/backend/src/features/conversation/conversation.service.ts` | `handoffConversation(tenantId, clienteId, motivo, destino, condicion)`; `resolverDestino` → `resolverDestinoAsignacion`. |
| `apps/backend/src/workers/ai-reply.processor.ts` | Pasa `settings.destino`. |
| `apps/backend/src/features/flow/flow.types.ts` · `flow.validation.ts` | Ramas con `destino` (estricta: completa) además de `asesorId` / `notificarAsesorId`. |
| `apps/backend/src/features/flow/flow.service.ts` | Al publicar: `validarDestino` sobre los destinos de los nodos. |
| `apps/backend/src/features/flow/flow.runtime.service.ts` | `asignar_asesor`: `resolverDestinoAsignacion(destino del nodo)` → `assignConversation`. `handoff`: destino del nodo o el general (`getHandoffSettings`) → asignar si hay destino. |
| `apps/backend/src/features/reports/reports.{types,validation,service}.ts` | `grupo` en `advisorReportQuerySchema` y `advisorActivityQuerySchema`; filtro por miembros; campos de rol en las filas. |
| `apps/frontend/src/features/handoff/components/HandoffSettingsForm.tsx` · `AsignacionDialog.tsx` · `types` | `DestinoSelector`; métricas agrupadas. |
| `apps/frontend/src/features/flows/components/NodeInspector.tsx` | Nodos `handoff` y `asignar_asesor` con `DestinoSelector` (en `handoff`, opción "Usar la configuración de transferencia"). |
| `apps/frontend/src/features/inbox/components/AssignMenu.tsx` · `InboxFilters.tsx` · `features/leads/components/LeadsFilters.tsx` | `UserGroupSelect` / secciones por rol. |
| `apps/frontend/src/features/users/hooks/useTenantUsers.ts` | Opción `{ alAbrir?: boolean }` → `refetchOnMount: 'always'`. |
| `apps/frontend/src/features/reports/*` | Filtro de grupo en `AdvisorReportPage` y `use-activity-params.ts` (`?grupo=`); segmentación por rol en `AdvisorBarsChart` / `AdvisorTable`; tipos. |
| `docs/domain.md` · `data-model.md` · `api-contract.md` · `docs/adr/README.md` | Grupo de usuarios, `HandoffSettings.destino`, nodos, `?grupo=`. |

## Contratos

### Compartido (`packages/shared/src/destino-usuarios.ts`)

```ts
export type RolEmpresaDestino = 'administrador' | 'coordinador' | 'asesor';

export type GrupoUsuarios =
  | { tipo: 'todos' }
  | { tipo: 'rol'; rol: RolEmpresaDestino; excluirPrincipal?: boolean }
  | { tipo: 'equipo'; coordinadorId: string; incluirCoordinador?: boolean };

/** `round_robin` queda reservado para la iteración 2 (no se acepta todavía). */
export type CriterioDestino = 'primero' | 'menor_carga';

export type ReservaDestino =
  | { tipo: 'cualquiera' }
  | { tipo: 'grupo'; grupo: GrupoUsuarios }
  | { tipo: 'sin_asignar' };

export type DestinoAsignacion =
  | { modo: 'usuario'; usuarioId: string; reserva: ReservaDestino }
  | { modo: 'grupo'; grupo: GrupoUsuarios; criterio: CriterioDestino; soloEnLinea: boolean; reserva: ReservaDestino };

export const RESERVA_POR_DEFECTO: ReservaDestino = { tipo: 'cualquiera' };
export function destinoCompleto(d: DestinoAsignacion): boolean;      // usuarioId / coordinadorId no vacíos
export function etiquetaGrupo(g: GrupoUsuarios, nombres?: ReadonlyMap<string, string>): string;
export function serializarGrupoQuery(g: GrupoUsuarios | { tipo: 'usuario'; usuarioId: string }): string;
export function parsearGrupoQuery(s: string): GrupoUsuarios | { tipo: 'usuario'; usuarioId: string } | null;
```

Sintaxis de `?grupo=`: `todos` · `rol:asesor` · `rol:coordinador` · `rol:administrador` ·
`rol:administrador:sin-principal` · `equipo:<id>` · `equipo:<id>:con-coordinador` · `usuario:<id>`.

### Backend — `user.grupos.ts`

```ts
export const grupoUsuariosSchema: z.ZodType<GrupoUsuarios>;      // excluirPrincipal solo con rol administrador (refine)
export const destinoAsignacionSchema: z.ZodType<DestinoAsignacion>;
export const grupoQuerySchema;                                   // string → parsearGrupoQuery, error 400 si null

export function filtroGrupo(grupo: GrupoUsuarios): FilterQuery<IUserDocument>;
//   base { rol: 'admin', activo: true, eliminado: { $ne: true } }
//   rol → { rolEmpresa }, + { esPrincipal: { $ne: true } } si excluirPrincipal
//   equipo → { $or: [{ rolEmpresa: 'asesor', coordinadorId: X }, ...(incluir ? [{ _id: X }] : [])] }

export async function miembrosDelGrupo(tenantId: TenantId, grupo: GrupoUsuarios): Promise<IMiembroGrupo[]>;
//   equipo: comprueba primero que X sea coordinador activo del tenant; si no → [] (worker: no lanza)
//   findScoped(User, tenantId, filtroGrupo(grupo)).sort({ nombre: 1 })
//   IMiembroGrupo = { id, nombre, rolEmpresa, coordinadorId, esPrincipal }

export async function validarDestino(tenantId: TenantId, destino: DestinoAsignacion): Promise<void>;
//   usuario → assertAssignableAdmin (404); equipo (en grupo o reserva) → assertCoordinadorValido (404)
```

### Backend — `user.destino.ts`

```ts
export const ESTADOS_ACTIVOS = ['nuevo', 'en_gestion', 'pago_pendiente'] as const;   // movido desde ai-handoff
export const EN_LINEA_MS = 5 * 60 * 1000;

export async function cargaPorUsuario(tenantId: TenantId): Promise<Map<string, number>>;  // aggregateScoped(Cliente)
export async function idsEnLinea(tenantId: TenantId, ids: string[], ahora?: Date): Promise<Set<string>>;
//   findScoped(ActividadCursor, tenantId, { userId: { $in }, ultimoLatido: { $gte: ahora - EN_LINEA_MS } })

export async function resolverDestinoAsignacion(
  tenantId: TenantId,
  destino: DestinoAsignacion,
  ahora?: Date,
): Promise<string | null>;

export function destinoDesdeLegado(
  estrategia: 'primero' | 'menor_carga' | 'fijo' | undefined,
  usuarioId: string | null,
): DestinoAsignacion;
```

### Transferencia IA

```ts
// IHandoffSettings
destino?: DestinoAsignacion;              // ausente en documentos previos → toDTO usa destinoDesdeLegado

// HandoffSettingsDTO
destino: DestinoAsignacion;               // siempre presente
estrategiaDestino: EstrategiaDestino;     // se mantiene un release (derivado de destino al guardar)
asesorDestinoId: string | null;

// AsesorMetricasDTO (+)
rolEmpresa: RolEmpresa | null; coordinadorId: string | null; esPrincipal: boolean; enLinea: boolean;
```

Escritura de compatibilidad al guardar `destino`: `usuario` → `estrategiaDestino: 'fijo'`,
`asesorDestinoId: usuarioId`; `grupo todos + primero|menor_carga` → esa estrategia; cualquier otro grupo
→ `estrategiaDestino: 'menor_carga'` / `'primero'` según criterio (el binario anterior, al volver atrás,
repartiría entre todos: degradación aceptable y documentada en el ADR).

### Nodos de flujo

```ts
// efecto
| { tipo: 'asignar_asesor'; asesorId?: string; destino?: DestinoAsignacion }   // al menos uno
// nodo
| { tipo: 'handoff'; motivo?: string; notificarAsesorId?: string; destino?: DestinoAsignacion }
```

Ejecución: `destinoDelNodo = destino ?? (asesorId|notificarAsesorId ? { modo: 'usuario', … } : null)`.
`handoff` sin destino del nodo → `(await getHandoffSettings(tenantId)).destino`. El resultado se asigna
con `assignConversation(tenantId, ACTOR_SISTEMA_FLUJO, clienteId, id)`; los errores se registran y no
rompen el flujo (comportamiento actual).

### Reportes

```ts
advisorReportQuerySchema   = rango + { grupo?: grupoQuerySchema }
advisorActivityQuerySchema = rango + tz + granularidad + { asesorId?, grupo? }    // asesorId ≡ usuario:<id>

// IAdvisorRow / IActivityAsesor (+)
rolEmpresa: RolEmpresa | null; coordinadorId: string | null; esPrincipal: boolean;
```

Con `grupo`, el service resuelve los ids con `miembrosDelGrupo` **sin** exigir `activo` (los reportes
muestran también a inactivos con cifras) y filtra filas; un coordinador o usuario de otro tenant → 404
(`validarGrupoReporte`). Sin `grupo`, la respuesta es idéntica a la actual más los campos nuevos.

## Frontend

- `agruparPorRol` devuelve `[{ rol, etiqueta, usuarios }]` en orden Administradores → Coordinadores →
  Asesores, el principal primero con insignia; con `incluirInactivos`, sección final "Inactivos".
- `UserGroupSelect` envuelve `Select` + `SelectGroup` + `SelectLabel`; reemplaza las listas planas en
  `AssignMenu`, `InboxFilters`, `LeadsFilters` y el selector de usuario del `DestinoSelector`.
- `DestinoSelector`:
  - `RadioGroup` "Un usuario concreto" / "Un grupo".
  - Grupo: `Select` agrupado (Asesores, Coordinadores, Administradores, Administradores excepto el
    principal, Equipo de… → segundo `Select` de coordinador con `Switch` "Incluir al coordinador",
    Cualquier usuario).
  - Criterio: "El primero por nombre" / "Quien tenga menos conversaciones activas".
  - `Switch` "Solo si está en línea".
  - Reserva: "Si no hay nadie disponible" → Cualquier usuario activo / Otro grupo / Dejarla sin asignar.
  - Resumen en una línea con `etiquetaGrupo`.
- Reportes: filtro de grupo (mismo `Select` de grupos + usuario) sincronizado con `?grupo=`;
  `AdvisorBarsChart` y `AdvisorTable` agrupan por rol (pestañas o secciones), totales de empresa intactos.
- Invocar `frontend-design:frontend-design` antes de cada componente; criterios de `emil-design-eng` e
  `impeccable` aplicados a mano (no instaladas) y anotados en `tasks.md`.

## Notas

- **Sin migración.** `destino` ausente se deriva al leer; nodos viejos validan y se ejecutan como
  `usuario`. Los campos viejos se retiran en una spec posterior, tras un release.
- **El worker no lanza por grupos vacíos:** `miembrosDelGrupo` devuelve `[]` y la reserva decide.
  Solo `validarDestino` (rutas HTTP) responde 404.
- **Cambio de rol:** no se tocan asignaciones existentes; el resolvedor lee `rolEmpresa` en cada
  ejecución, así que el rol nuevo aplica a la siguiente asignación.
- **Coste:** una consulta de miembros + una agregación de carga + (si `soloEnLinea`) una de cursores
  por resolución; los índices `{ tenantId, asesorId }`, `{ tenantId, estadoComercial }` y
  `{ tenantId, userId }` del cursor ya existen.
- **Round-robin (iteración 2):** añadirá `'round_robin'` a `CriterioDestino` y un `ultimoAsignadoId`
  por destino con actualización atómica; el esquema de esta spec no lo impide.

## Verificación

- `pnpm --filter @sofiapp/api typecheck` · `pnpm --filter @sofiapp/api test` (incluye
  `user.destino.isolation.test.ts` y los isolation de reports / ai-handoff / flow).
- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint`; vitest en `apps/frontend`
  (`--exclude "**/KnowledgeBasePage.test.tsx"`).
- Arrancar `app.ts` y `worker.ts`: cero errores en consola.
- Revisión manual light/dark: transferencia, nodos de flujo, asignación y filtros de bandeja, leads,
  reportes.
- Checklist PR de `docs/multi-tenancy.md` §9.
