# HU-KB-01-V2 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que TODO
> esté en verde. Antes de empezar, `/sdd-implement` crea la rama `feat/HU-KB-01-V2` desde `develop`.

## 1. Backend — Bloque 1 (límite 3.000)
- [x] `kb.validation.ts`: bajar el `max` de `contenido` de `100_000` a
      `3000` con mensaje `'El contenido no puede superar los 3,000 caracteres.'` en
      `createDocumentSchema` (constantes `CONTENIDO_MAX`/`CONTENIDO_MAX_MSG` reutilizadas en update).

## 2. Backend — Bloque 2 (editar con re-indexado), patrón de 6 archivos
- [x] `kb.types.ts`: `UpdateKbDocumentDTO { contenido }`; agregar `isPreset: boolean` y
      `proposito?: string` a `IKbDocument` e `IKbDocumentResponse`; agregar `contenido: string` a
      `IKbDocumentResponse`.
- [x] `kb-document.model.ts`: campos `isPreset` (default `false`) y `proposito` (opcional).
      _(Además: `contenido` pasó de `required:true` a `default:''` — Mongoose rechaza string vacío
      en un campo `required` durante `save()`, y los presets nacen vacíos; el borde Zod sigue
      exigiendo contenido al crear vía HTTP.)_
- [x] `kb.validation.ts`: `updateDocumentSchema` con `params.id` (regex ObjectId de `delete`) +
      `body.contenido` (tope 3.000, permite vacío).
- [x] `kb.service.ts`:
  - [x] `mapKbDocumentToResponse`: incluir `contenido`, `isPreset` (`?? false`), `proposito`.
  - [x] `updateDocument(tenantId, id, contenido)`: `findByIdScoped` → 404; `findOneAndUpdateScoped`
        (`$set` contenido/`pendiente`/`chunkCount:0`, `$inc version`, `$unset error`, `{new:true}`);
        `deleteManyScoped(KbChunk, …)`; encolar `kb-index` solo si `contenido.trim()` no vacío;
        retornar mapeado.
- [x] `kb.controller.ts`: `updateDocumentController` delgado (sin try/catch; `tenantId` del token).
- [x] `kb.routes.ts`: `PATCH /documents/:id` con cadena
      `authenticateJWT → requireTenant → authorize(['admin']) → validate(updateDocumentSchema) →
      asyncHandler(updateDocumentController)`.

## 3. Backend — Bloque 3 (presets)
- [x] `kb.service.ts`: constante `PRESET_DOCUMENTS` (5 títulos + propósitos) y
      `seedPresetDocuments(tenantId)` que crea los 5 con `createScoped` (`contenido:''`,
      `isPreset:true`, `version:1`, `estadoIndexacion:'pendiente'`, `chunkCount:0`). No encola nada.
- [x] `tenant.service.ts`: tras confirmar la transacción de `createTenant`, invocar
      `seedPresetDocuments(tenant._id)` **fuera** de la sesión, en `try/catch` que solo
      `logger.error` (no revierte ni propaga).

## 4. Frontend — Bloque 1 + 2 + 3
- [x] `api/knowledge-base.ts`: `updateKbDocument(id, payload)` → `apiClient.patch('/kb/documents/:id')`.
- [x] `types/domain.ts`: `IKbDocument` gana `contenido`, `isPreset`, `proposito?`.
- [x] `types/api.ts`: `UpdateKbDocumentPayload { contenido }`; `types/index.ts` re-exporta.
- [x] `components/KnowledgeUploadEditor.tsx`: props `document?`/`onDone?`; formulario dual; reset por
      `useEffect([document?.id])`; placeholder = `proposito` cuando aplica; `maxLength={3000}` +
      contador `… / 3 000 caracteres`; en editar el título va deshabilitado. _(Feedback de edición
      por toast `sonner` + botón "Cancelar", porque al guardar se vuelve a modo creación.)_
- [x] `components/KnowledgeDocumentTable.tsx`: prop `onEdit`; iconos `Pencil`/`Trash2` de
      `lucide-react` con `aria-label`/`title` y loading por fila (`deletingId`); badge "Predefinido"
      (shadcn `Badge` `secondary`) en filas `isPreset`.
- [x] `pages/KnowledgeBasePage.tsx`: estado `editingDocument`; cablear props al editor y a la tabla;
      al editar, `scrollIntoView` al formulario (respeta `prefers-reduced-motion`) + foco al textarea.
- [x] Skill `frontend-design` aplicada: señal de modo edición (eyebrow "Editando" + ring `primary`),
      iconos con affordances, badge que codifica origen — todo con tokens semánticos de INF-03.

## 5. Tests (Vitest)
- [x] `kb.service.test.ts`: `updateDocument` re-versiona, limpia chunks y encola job cuando hay
      contenido; **no** encola cuando el contenido es vacío; 404 si el doc no existe.
- [x] `kb.service.test.ts`: `seedPresetDocuments` inserta 5 docs con `isPreset:true`/contenido vacío
      y **no** encola jobs.
- [x] **Aislamiento:** un tenant B no puede editar un documento del tenant A (`updateDocument` →
      404, contenido/versión intactos) ni ver sus presets en el listado.
- [x] `kb.routes.test.ts`: `PATCH /api/kb/documents/:id` exige `admin` (403 superadmin), valida `id`
      y el tope de 3.000 (400), documento de otro tenant → 404, y 200 con el documento actualizado.
- [x] `tenant.service.test.ts`: crear tenant siembra 5 presets; si `seedPresetDocuments` falla
      (`vi.spyOn` que rechaza), la creación del tenant **sí** se completa. _(Se mockeó
      `config/queues.js` para evitar la conexión a Redis por la nueva cadena de imports.)_

## 6. Verificación final
- [x] `pnpm --filter @sofiapp/api typecheck` ✅
- [x] `pnpm --filter @sofiapp/api test` ✅ (138 tests, 23 archivos)
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` ✅
- [x] Checklist PR de aislamiento (`docs/multi-tenancy.md` §9): sin `Model.find/create` directos en
      el código nuevo; `tenantId` siempre del token; todo por el repositorio scoped.
- [~] Manual E2E en navegador: crear tenant → 5 presets con badge → editar → indexar → eliminar.
      _(No ejecutado en esta sesión: requiere Mongo Atlas + Redis + worker en vivo. La ruta PATCH y
      el aislamiento quedan cubiertos por los tests de integración con Mongo en memoria; el flujo de
      indexación reutiliza el job `kb-index` de HU-KB-01, ya verificado contra Atlas.)_

## Definición de "hecho"
El admin puede corregir cualquier documento y la KB se re-indexa sin chunks obsoletos; los tenants
nuevos nacen con 5 documentos guía listos para llenar; el límite de 3.000 caracteres es coherente en
todo el stack; el aislamiento multi-tenant está probado; y typecheck, tests y build/lint están en
verde. Queda listo para `/sdd-release` (semver, CHANGELOG, tag y merge).
