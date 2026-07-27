# HU-OMNI-04 — Plan técnico (CÓMO)

## Archivos a crear

```
apps/backend/src/
├── features/tag/
│   ├── tag.types.ts        # ITag, ITagDocument, SemaforoSlug, CreateTagDTO, UpdateTagDTO, ITagResponse
│   ├── tag.model.ts        # schema + índices { tenantId, nombre } unique (collation) y { tenantId, semaforo }
│   ├── tag.validation.ts   # Zod { body, params, query }
│   ├── tag.service.ts      # CRUD scoped + findTagsByIds (hidratación en lote)
│   ├── tag.controller.ts   # capa HTTP delgada
│   └── tag.routes.ts       # GET/POST /  ·  PATCH/DELETE /:id
├── seed/
│   └── seed-semaforo-tags.ts   # seedSemaforoTags(tenantId) + backfillSemaforoTags()
└── scripts/
    └── migrate-cliente-tags.ts # tags:[String] → tagIds, con --dry-run

apps/frontend/src/features/tags/
├── types.ts · api.ts
├── hooks/useTags.ts             # useTags, useCreateTag, useUpdateTag, useDeleteTag
├── lib/tag-color.ts             # hex → { bg, fg, border } legibles por tema
├── components/TagChip.tsx       # ÚNICO punto que aplica el color del dato
├── components/TagColorPicker.tsx
├── components/TagSelector.tsx   # multi-select portalizado
├── components/TagFormDialog.tsx
└── pages/TagsPage.tsx
```

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `features/cliente/cliente.model.ts` | `+ tagIds: [{ type: ObjectId, ref: 'Tag' }]`, `+ index { tenantId: 1, tagIds: 1 }`, `− tags: [{ type: String }]` |
| `features/cliente/cliente.types.ts` | `tagIds: Types.ObjectId[]` en `ICliente`; fuera `tags: string[]` |
| `features/conversation/conversation.types.ts` | `IConversationResponse.tags: ITagResponse[]` |
| `features/conversation/conversation.mapper.ts` | `toConversationResponse` recibe y proyecta las etiquetas hidratadas |
| `features/conversation/conversation.validation.ts` | `etiqueta` en el query de bandeja; `tagsSchema` para el PATCH |
| `features/conversation/conversation.service.ts` | `buildFiltro(..., etiqueta?)`; hidratación en lote; `setConversationTags` |
| `features/conversation/conversation.controller.ts` · `.routes.ts` | `PATCH /:id/tags` |
| `features/tenant/tenant.service.ts` | llamar `seedSemaforoTags` al crear un tenant |
| `app.ts` | `app.use('/api/tags', tagRoutes)` + `backfillSemaforoTags()` en el arranque |
| `frontend/src/features/inbox/types.ts` · `api.ts` | `tags` en `ConversationDTO`; `etiqueta` en `InboxFiltros`; `setConversationTags` |
| `frontend/src/features/inbox/components/InboxFilters.tsx` | tercer `Select`: "Etiqueta" |
| `frontend/src/features/inbox/components/ConversationList.tsx` | fila de `TagChip` |
| `frontend/src/features/inbox/pages/InboxPage.tsx` | `TagSelector` en la cabecera del hilo |
| `frontend/src/components/layout/nav-config.ts` | entrada "Etiquetas", `roles: ['admin']` |
| `frontend/src/router.tsx` | ruta `/etiquetas` bajo `AppLayout` |
| `docs/data-model.md` · `docs/domain.md` | colección `tags`; glosario de semaforización |

## Contratos

### `tag.types.ts`

```ts
export type SemaforoSlug = 'azul' | 'rojo' | 'naranja' | 'verde';

export interface ITag {
  tenantId: Types.ObjectId;
  nombre: string;
  color: string;              // '#RRGGBB'
  /** Solo en las 4 sembradas. Handle estable para CRM-04 / IA-05 / MARK-01. */
  semaforo?: SemaforoSlug;
}
export interface ITagDocument extends ITag, Document {}

export interface ITagResponse {
  id: string;
  nombre: string;
  color: string;
  semaforo: SemaforoSlug | null;
}
```

### `tag.model.ts` — índices

```ts
TagSchema.index({ tenantId: 1, nombre: 1 }, { unique: true, collation: { locale: 'es', strength: 2 } });
TagSchema.index({ tenantId: 1, semaforo: 1 }, { unique: true, sparse: true });
```

`strength: 2` hace la unicidad insensible a mayúsculas y acentos: "Urgente", "urgente" y "URGENTE"
colisionan, que es lo que el usuario espera. Las consultas que dependan de esa unicidad deben
ejecutarse con la misma collation.

### `tag.validation.ts`

```ts
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color inválido: usa formato #RRGGBB.');
const nombre = z.string().trim().min(1).max(30);

createTagSchema  → body { nombre, color }
updateTagSchema  → body { nombre?, color? } (al menos uno), params { id }
deleteTagSchema  → params { id }
listTagsSchema   → todo vacío
```

### Endpoints

| Método | Ruta | Cadena de middlewares |
|---|---|---|
| GET | `/api/tags` | `authenticateJWT → requireTenant → authorize(['admin']) → validate → asyncHandler` |
| POST | `/api/tags` | idem |
| PATCH | `/api/tags/:id` | idem |
| DELETE | `/api/tags/:id` | idem |
| PATCH | `/api/conversations/:id/tags` | idem (misma cadena que el resto de `conversations`) |
| GET | `/api/conversations?etiqueta=<tagId>` | ya existente, +1 query param |

### `tag.service.ts` — puntos no obvios

- `deleteTag` es **dos operaciones**: borra el `Tag` y hace
  `updateMany({ tenantId, tagIds: id }, { $pull: { tagIds: id } })` sobre `Cliente`. Sin lo
  segundo quedan referencias colgadas que rompen la hidratación. Si el tag tiene `semaforo`,
  lanza `AppError(409)` antes de tocar nada.
- `findTagsByIds(tenantId, ids): Promise<Map<string, ITagResponse>>` — copia literal del patrón de
  `findUsersByIds` (`features/users/user.service.ts:38`), que HU-OMNI-02 ya usa en
  `conversation.service.ts:114` para los responsables. Una consulta por página de bandeja, no N.
- El índice único devuelve `E11000` en carrera; el service lo traduce a `AppError(409)` en vez de
  dejar escapar el error de Mongo.

### `setConversationTags` — validación antes de escribir

```
1. findByIdScoped(Cliente, tenantId, clienteId) → 404 si no es del tenant
2. tagIds únicos; si viene [] se limpian todas
3. countScoped(Tag, tenantId, { _id: { $in: tagIds } }) === tagIds.length  → si no, AppError(422)
4. findOneAndUpdateScoped(Cliente, ..., { tagIds })
5. publishRealtime('conversation:updated')
```

El paso 3 es el que impide que un `tagId` de otro tenant entre por el body. Es el criterio 10 del
spec y el único punto donde un id ajeno podría colarse.

### `buildFiltro` — extensión

```ts
function buildFiltro(filtro, asesorId, asignadoA?, estado?, etiqueta?) {
  // ... lo existente
  if (etiqueta) f.tagIds = new Types.ObjectId(etiqueta);   // match en array = "contiene"
  return f;
}
```

Un `ObjectId` suelto contra un campo array significa "contiene" en Mongo: no hace falta `$in`.
El índice `{ tenantId: 1, tagIds: 1 }` lo cubre. `findScoped` sigue anteponiendo el `tenantId`,
así que filtrar por una etiqueta ajena devuelve vacío por construcción.

### `lib/tag-color.ts` — el contrato de contraste

```ts
export interface TagColors { bg: string; fg: string; border: string }
export function tagColors(hex: string, theme: 'light' | 'dark'): TagColors;
```

- Convierte hex → HSL y **fija la luminancia del texto** a un rango legible: en tema claro se
  oscurece hasta cumplir ≥4.5:1 contra el fondo del chip; en oscuro se aclara.
- Fondo: el mismo tono con alfa baja (~12–18%), no un gris. Un gris sobre color se ve deslavado.
- Borde: el mismo tono con alfa media, para que el chip no flote sobre fondos claros.
- Si el hex es inválido (dato corrupto), cae a los tokens `muted` en vez de romper el render.

Es una función pura: el criterio 9 se verifica con un test de ratio de contraste WCAG sobre una
batería de hex extremos (`#000000`, `#FFFFFF`, `#1E3A8A`, `#FFFF00`).

## Notas

- **Semaforización (documentar en `docs/domain.md`).** Cuatro etiquetas de sistema con significado
  fijo, base para CRM-04, IA-05 y MARK-01:

  | `semaforo` | Nombre sembrado | Color | Significado |
  |---|---|---|---|
  | `verde` | Avanza | `#16A34A` | Interesado, la conversación progresa |
  | `naranja` | Requiere atención | `#EA580C` | Estancada o con objeción pendiente |
  | `rojo` | En riesgo | `#DC2626` | Bloqueada, a punto de perderse |
  | `azul` | Informativo | `#2563EB` | Consulta general, sin intención comercial aún |

  El nombre y el color son editables; `semaforo` no. Esa es la garantía de que el resto de módulos
  puedan referirse a "el verde" aunque el tenant lo llame de otra forma.

- **Semilla por tenant, no global.** `seed-plans.ts` puede ser global porque los planes son de la
  plataforma. Las etiquetas son del tenant, así que `seedSemaforoTags(tenantId)` se llama al crear
  un tenant, y `backfillSemaforoTags()` recorre los existentes al arrancar. Ambas con
  `updateOne(..., { $setOnInsert }, { upsert: true })` sobre `{ tenantId, semaforo }`, de modo que
  no pisan renombrados del administrador.

- **Migración.** `migrate-cliente-tags.ts` agrupa por tenant, crea un `Tag` por string distinto
  (color asignado por rotación de una paleta), rellena `tagIds` y hace `$unset: { tags: '' }`.
  Con `--dry-run` imprime el recuento sin escribir. Debe correr **antes** de desplegar el frontend
  que ya no lee `tags`.

- **Frontend — decisiones de las skills de diseño (regla §7 del `CLAUDE.md` raíz).**
  Aplicadas `emil-design-eng` y `frontend-design`; `impeccable` está en el marketplace pero **no
  instalado como plugin**, así que se aplicaron sus reglas leyendo su `SKILL.md` (contraste,
  z-index semántico, portales, bans). Conviene instalarlo para futuros features.

  | Decisión | Motivo |
  |---|---|
  | `TagSelector` con `DropdownMenu` de shadcn (Radix, portalizado) | Un dropdown `absolute` dentro de los contenedores `overflow-hidden` de la bandeja se recorta. Radix portaliza y resuelve el stacking |
  | Chips sin animación de entrada | Se ven decenas de veces al día; animarlos hace la lista pesada |
  | Marcar/desmarcar etiqueta: sin transición | Acción repetida; cualquier retardo se percibe como lentitud |
  | Quitar un chip: `transition` 150ms `ease-out`, no keyframes | Se alternan rápido; los keyframes reinician desde cero al interrumpirse |
  | Dropdown: 150–200ms `ease-out`, `transform-origin` del trigger | Popover anclado al disparador, no modal |
  | Botones: `active:scale-[0.98]` | Reutiliza el patrón `pressable` ya presente en el feature `inbox` |
  | Hover de chips tras `@media (hover: hover) and (pointer: fine)` | Evita el falso hover al tocar en móvil |
  | Sin borde lateral de color en los chips | `impeccable` lo prohíbe explícitamente; el color va en fondo + texto |
  | `prefers-reduced-motion` en todo lo anterior | Accesibilidad, no opcional |

  Estado vacío de `TagsPage`: es una invitación a actuar, no un cartel de "no hay datos" — explica
  para qué sirven las etiquetas y ofrece el botón de crear. Las 4 de semáforo ya están, así que la
  pantalla nunca aparece realmente vacía: ese estado es solo para el caso degradado.

- **Copy de interfaz.** Verbos en activo y consistentes de principio a fin: el botón dice
  "Crear etiqueta" y el toast confirma "Etiqueta creada". El error de nombre duplicado dice qué
  pasó y cómo arreglarlo ("Ya existe una etiqueta con ese nombre. Elige otro."), no se disculpa.

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint && pnpm --filter @sofiapp/web test
```

> El filtro correcto del workspace es `@sofiapp/api` / `@sofiapp/web`. El `CLAUDE.md` raíz dice
> `pnpm --filter backend`, que falla con `No projects matched the filters in ...`. Deuda del doc raíz.

Cierre manual (DoD de la historia): crear una etiqueta, aplicarla a dos conversaciones, filtrar la
bandeja por ella y comprobar que devuelve exactamente esas dos y que el color se conserva en claro
y en oscuro.
