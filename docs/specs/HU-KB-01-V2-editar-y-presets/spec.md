# HU-KB-01-V2 — Editar documentos + Conocimientos predefinidos (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución en
> `tasks.md`. Esta V2 amplía HU-KB-01: permite corregir un documento sin dejar chunks obsoletos y
> siembra 5 documentos base en cada tenant nuevo para que la KB no arranque vacía.

**Estado:** implementado

## Historia

> Como **Administrador** quiero **editar el contenido de un documento de la KB y arrancar con una
> base de documentos predefinidos** para que **pueda corregir la información que entrena a la IA sin
> chunks obsoletos y sepa desde el primer día qué información cargar sobre mi negocio.**

## Objetivo

1. Reducir el límite de contenido de 100.000 a **3.000 caracteres** para todos los documentos
   (presets y personalizados por igual), coherente entre backend y frontend.
2. Permitir **editar** el contenido de un documento existente, re-versionándolo y **re-indexándolo**,
   sin dejar chunks viejos apuntando a texto que ya no existe.
3. Sembrar **5 documentos predefinidos** (solo título + propósito guía, contenido vacío) al crear un
   tenant, para que el admin sepa qué llenar. `isPreset` es etiqueta de origen, no impone
   restricciones.

## Alcance

### Incluye
- Nuevo límite de 3.000 caracteres en `createDocumentSchema` y en el nuevo `updateDocumentSchema`,
  y en el `maxLength` del textarea del editor.
- Endpoint `PATCH /api/kb/documents/:id` (rol `admin`) que actualiza contenido, incrementa `version`,
  pone `estadoIndexacion` en `'pendiente'`, borra los chunks viejos y re-encola el job `kb-index`
  **solo si** el contenido no está vacío.
- Campos nuevos `isPreset: boolean` y `proposito?: string` en el modelo y en la respuesta; y
  exposición de `contenido` en `IKbDocumentResponse` (la tabla ya trae el contenido para precargar
  el editor de edición).
- `seedPresetDocuments(tenantId)` en el servicio de KB, invocado desde `tenant.service.ts` tras
  crear el tenant, de forma **no bloqueante** (su fallo no revierte la creación del tenant).
- Frontend: editor dual (crear/editar), iconos `Pencil`/`Trash2` en la columna Acciones, badge
  "Predefinido" en filas `isPreset`, placeholder guía basado en `proposito`.

### Fuera de alcance
- Editar el **título** de un documento (evita colisión con el índice único `{tenantId, titulo}`).
- Contador de progreso de presets, plantillas de contenido, o cualquier restricción especial sobre
  presets (se editan y eliminan como cualquier documento).
- Cambios en el mecanismo de embeddings, chunking o `$vectorSearch` (se reutiliza tal cual HU-KB-01).
- Caché semántica (no va en el MVP).

## Criterios de aceptación

1. **Límite 3.000 caracteres:** `createDocumentSchema` y `updateDocumentSchema` rechazan contenido
   `> 3000` con `'El contenido no puede superar los 3,000 caracteres.'`; el textarea del editor usa
   `maxLength={3000}` y el contador muestra `… / 3 000 caracteres`.
2. **Edición con re-indexado:** `PATCH /api/kb/documents/:id` (solo `admin`) verifica pertenencia con
   `findByIdScoped` (404 `AppError('No se encontró el documento.', 404)` si no existe), hace `$set`
   de `contenido`/`estadoIndexacion:'pendiente'`/`chunkCount:0`, `$inc: { version:1 }`,
   `$unset: { error:1 }`, borra chunks con `deleteManyScoped(KbChunk, tenantId, { documentId })` y
   re-encola `kb-index` con `{ tenantId, documentId, version }`.
3. **Contenido vacío no se indexa:** si al editar (o al sembrar) el contenido está vacío, **no** se
   encola el job; el documento queda en `estadoIndexacion: 'pendiente'`.
4. **Editor dual sin fugas:** el `KnowledgeUploadEditor` opera en modo crear (prop `document`
   ausente) o editar (con `document`); al cambiar de documento o volver a crear, resetea contenido,
   mensajes de éxito/error y estado de la mutación. Si el documento en edición tiene `proposito` y su
   contenido está vacío, ese `proposito` es el `placeholder` del textarea.
5. **Tabla con iconos y badge:** la columna Acciones usa `Pencil` (dispara `onEdit(doc)`) y `Trash2`
   (mantiene `window.confirm` + la mutación de borrado existente), ambos con `aria-label` y
   `disabled`/loading durante mutaciones; las filas con `isPreset === true` muestran un badge
   "Predefinido". El estado lleno/vacío lo sigue comunicando `IndexingStatusBadge`, no el badge.
6. **Seeding de presets:** al crear un tenant se insertan los 5 documentos base (`isPreset: true`,
   `contenido: ''`, `estadoIndexacion: 'pendiente'`, `version: 1`) con su `proposito`; el seeding
   **no** llama a Gemini ni encola jobs. Si `seedPresetDocuments` falla, se registra el error y la
   creación del tenant **no** se revierte ni propaga el fallo.
7. **Aislamiento multi-tenant (severidad máxima):** `updateDocument`, el borrado de chunks y
   `seedPresetDocuments` acceden a Mongo **solo** vía el repositorio scoped (`findByIdScoped`,
   `findOneAndUpdateScoped`, `deleteManyScoped`, `createScoped`); el `tenantId` nace del token
   (`req.user!.tenantId`), nunca del body/params. **Test de aislamiento:** un tenant no puede editar
   ni ver el `contenido` de un documento de otro tenant (responde 404).
8. `pnpm --filter @sofiapp/api typecheck` (`tsc --noEmit`) y `pnpm --filter @sofiapp/api test` en
   verde; `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde.

## Dependencias

- **Depende de:** HU-KB-01 (KB base: modelos `KbDocument`/`KbChunk`, `createDocument`,
  `deleteManyScoped`, job `kb-index`), INF-02 (middleware de tenant + repositorio scoped).
- **Bloqueante de:** —
