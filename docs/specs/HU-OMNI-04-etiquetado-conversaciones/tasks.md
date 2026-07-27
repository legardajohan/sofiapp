# HU-OMNI-04 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Rama: `feat/HU-OMNI-04` (creada desde `develop`).

## Implementación — Backend

Orden del patrón de 6 archivos (`docs/../apps/backend/CLAUDE.md`).

- [x] `features/tag/tag.types.ts`: `SemaforoSlug`, `ITag`, `ITagDocument`, `CreateTagDTO`,
      `UpdateTagDTO`, `ITagResponse`.
- [x] `features/tag/tag.model.ts`: schema con `tenantId` requerido + indexado, `nombre`, `color`,
      `semaforo?`, `{ timestamps: true }`; índices `{ tenantId, nombre }` único con
      `collation { locale: 'es', strength: 2 }` y `{ tenantId, semaforo }` único.
      **Corregido durante la implementación:** el segundo índice usa `partialFilterExpression`,
      no `sparse`. En un índice compuesto, `sparse` incluye el documento si existe *cualquiera* de
      sus campos, y `tenantId` existe siempre — con `sparse` el índice pasaba a significar "una
      sola etiqueta sin semáforo por tenant". Lo detectaron los tests.
- [x] `features/tag/tag.validation.ts`: `listTagsSchema`, `createTagSchema`, `updateTagSchema`,
      `deleteTagSchema`. `color` con regex `/^#[0-9A-Fa-f]{6}$/`, `nombre` 1–30 con `trim`.
- [x] `features/tag/tag.service.ts`:
  - [x] `listTags` (orden por nombre), `createTag`, `updateTag`, `deleteTag`.
  - [x] `createTag` / `updateTag` traducen `E11000` a `AppError(409)` con mensaje accionable.
  - [x] `deleteTag` rechaza con `AppError(409)` si el tag tiene `semaforo`.
  - [x] `deleteTag` hace además `$pull` de `tagIds` en todos los `Cliente` del tenant.
  - [x] `findTagsByIds(tenantId, ids): Map<string, ITagResponse>` — mismo patrón que
        `findUsersByIds` (`features/users/user.service.ts:38`).
- [x] `features/tag/tag.controller.ts`: delgado, `tenantId` del token, sin `try/catch`.
- [x] `features/tag/tag.routes.ts`: cadena fija `authenticateJWT → requireTenant →
      authorize(['admin']) → validate → asyncHandler`.
- [x] Montar en `app.ts`: `app.use('/api/tags', tagRoutes)`.

### Relación con la conversación

- [x] `cliente.model.ts`: `+ tagIds` (`[{ type: ObjectId, ref: 'Tag' }]`), `+ índice
      { tenantId: 1, tagIds: 1 }`, `− tags: [{ type: String }]`.
- [x] `cliente.types.ts`: `tagIds` en `ICliente`; retirar `tags: string[]`.
- [x] `conversation.types.ts`: `IConversationResponse.tags: ITagResponse[]`.
- [x] `conversation.mapper.ts`: `toConversationResponse` proyecta las etiquetas hidratadas.
- [x] `conversation.validation.ts`: `etiqueta` (objectId, opcional) en el query de bandeja;
      `tagsSchema` con `body { tagIds: string[] }` y `params { id }`.
- [x] `conversation.service.ts`:
  - [x] `buildFiltro(..., etiqueta?)` → `f.tagIds = new Types.ObjectId(etiqueta)`.
  - [x] `listConversations` hidrata las etiquetas **en lote** con `findTagsByIds`.
  - [x] `setConversationTags`: 404 si el cliente no es del tenant · deduplica ids · valida que
        **todos** pertenezcan al tenant (`countScoped` === `tagIds.length`) o `AppError(422)` sin
        escribir · actualiza · publica `conversation:updated`.
- [x] `conversation.controller.ts` + `conversation.routes.ts`: `PATCH /:id/tags`.

### Semilla y migración

- [x] `seed/seed-semaforo-tags.ts`: `seedSemaforoTags(tenantId)` idempotente
      (`$setOnInsert` + `upsert` sobre `{ tenantId, semaforo }`) con los 4 colores de `plan.md`,
      y `backfillSemaforoTags()` para los tenants existentes.
- [x] Llamar `seedSemaforoTags` al crear un tenant (`features/tenant/tenant.service.ts`).
- [x] Llamar `backfillSemaforoTags()` en el arranque de `app.ts`, junto a `seedPlans()`.
- [x] `scripts/migrate-cliente-tags.ts`: por tenant, strings distintos → `Tag`, rellena `tagIds`,
      `$unset tags`. Con `--dry-run` que solo imprime el recuento. Idempotente.

## Implementación — Frontend

> Regla §7 del `CLAUDE.md` raíz: invocar `emil-design-eng`, `frontend-design` e `impeccable`
> **antes** de escribir cada componente. Sus decisiones ya están recogidas en `plan.md`.
> Usar shadcn (`badge`, `dropdown-menu`, `select`, `dialog`, `popover`, `input`) en vez de
> controles a mano. Todo terminado en claro y oscuro.

- [x] `features/tags/types.ts` + `api.ts` (rutas **sin** prefijo `/api`: `apiClient.get('/tags')`).
- [x] `features/tags/lib/tag-color.ts`: `tagColors(hex, theme)` pura, con fallback a `muted` si el
      hex es inválido.
- [x] `features/tags/hooks/useTags.ts`: `useTags`, `useCreateTag`, `useUpdateTag`, `useDeleteTag`
      (invalidan `['tags']` y `['conversations']`).
- [x] `features/tags/components/TagChip.tsx`: único punto con `style` inline de color.
- [x] `features/tags/components/TagColorPicker.tsx`: 4 presets de semáforo + entrada hex libre.
- [x] `features/tags/components/TagFormDialog.tsx`: crear y editar.
- [x] `features/tags/components/TagSelector.tsx`: `DropdownMenu` de shadcn (portalizado) con
      checkboxes; confirma el conjunto completo vía `PATCH /conversations/:id/tags`.
- [x] `features/tags/pages/TagsPage.tsx`: lista, crear, editar, borrar. Las de semáforo sin acción
      de borrado (no un botón deshabilitado sin explicación: se omite y se indica por qué).
- [x] `nav-config.ts`: entrada "Etiquetas" con `roles: ['admin']`; ruta `/etiquetas` en `router.tsx`.
- [x] `inbox/types.ts`: `tags: TagDTO[]` en `ConversationDTO`; `etiqueta?: string` en `InboxFiltros`.
- [x] `inbox/api.ts`: `setConversationTags(conversationId, tagIds)`.
- [x] `inbox/components/InboxFilters.tsx`: tercer `Select` "Etiqueta", mismo estilo que los de
      HU-OMNI-02.
- [x] `inbox/components/ConversationList.tsx`: fila de `TagChip` bajo el preview, sin romper el
      `truncate` del texto.
- [x] `inbox/pages/InboxPage.tsx`: `TagSelector` en la cabecera del hilo, junto al `SofiToggle`.

## Tests (Vitest)

### Aislamiento multi-tenant (obligatorio)

- [x] `tests/isolation/tag.isolation.test.ts`:
  - [x] `GET /api/tags` del tenant B no lista las etiquetas del tenant A.
  - [x] `PATCH` / `DELETE /api/tags/:id` sobre un tag del tenant A desde B → `404`.
  - [x] `PATCH /api/conversations/:id/tags` con un `tagId` del tenant A sobre un cliente del
        tenant B → `422` **y** el cliente queda sin cambios (verificar en base, no solo el status).
  - [x] `GET /api/conversations?etiqueta=<tagId de A>` desde B → lista vacía.

### Casos funcionales

- [x] `tag.service.test.ts`:
  - [x] Crear dos etiquetas con el mismo nombre en distinta caja ("Urgente"/"urgente") → `409`.
  - [x] Mismo nombre en **distinto** tenant → permitido.
  - [x] `deleteTag` retira el id de los `Cliente` que lo tenían.
  - [x] `deleteTag` sobre una etiqueta con `semaforo` → `409`.
  - [x] `updateTag` permite renombrar y recolorear una de semáforo sin perder el campo `semaforo`.
- [x] `conversation.tags.test.ts` (archivo nuevo, en vez de ampliar el existente):
  - [x] `setConversationTags` reemplaza el conjunto (aplica y quita en una sola llamada).
  - [x] `setConversationTags([])` deja la conversación sin etiquetas.
  - [x] `listConversations` con `etiqueta` combinada con `filtro` + `asignadoA` + `estado`.
  - [x] La hidratación de etiquetas es **una** consulta para toda la página (no N+1).
- [x] Semilla idempotente: correr dos veces no duplica ni pisa un renombrado previo
      (cubierto dentro de `tag.service.test.ts`, no en un archivo aparte).

### Frontend

- [x] `tag-color.test.ts`: para `#000000`, `#FFFFFF`, `#1E3A8A`, `#FFFF00` y `#16A34A`, el ratio de
      contraste texto/fondo es **≥4.5:1** en `light` y en `dark` (criterio 9 del spec).
- [x] `tag-color.test.ts`: hex inválido → colores de fallback, sin excepción.
- [x] `TagSelector.test.tsx`: marcar y desmarcar envía el conjunto completo esperado.
- [x] `InboxFilters.test.tsx`: elegir una etiqueta llama al API con ese `tagId`; "Todas" lo omite.

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde (incluidos los de aislamiento).
- [x] `pnpm --filter @sofiapp/web build` · `lint` · `test` en verde.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 completo.
- [x] `docs/data-model.md` y `docs/domain.md` actualizados (colección `tags`, `clientes.tagIds`,
      glosario de semaforización).
- [ ] **Pendiente:** migración corrida con `--dry-run` y revisada antes de la real. El script está
      escrito y tipado (`pnpm --filter @sofiapp/api migrate:tags -- --dry-run`), pero **no se ha
      ejecutado**: es una escritura sobre datos reales y la decide quien despliega. En la base
      actual no hay ningún `Cliente` con `tags`, así que sería un no-op.
- [ ] **Pendiente:** revisión visual en claro y oscuro por una persona. El contraste está cubierto
      por tests automáticos (`tag-color.test.ts`, 4.5:1 en ambos temas) y el recorte del dropdown
      se evita usando el portal de Radix, pero nadie ha mirado la pantalla todavía.
- [x] `spec.md` pasa a `**Estado:** implementado`.

## Definición de "hecho"

Un administrador crea una etiqueta con su color, la aplica a varias conversaciones desde la
cabecera del hilo, filtra la bandeja por ella y obtiene exactamente esas conversaciones, con los
chips legibles en ambos temas. Las cuatro etiquetas de semaforización existen en todos los tenants
con un identificador estable, listas para que CRM-04, IA-05 y MARK-01 las consuman. Ninguna
etiqueta cruza de un tenant a otro, y los tests de aislamiento lo demuestran.
