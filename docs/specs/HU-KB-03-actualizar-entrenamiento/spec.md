# HU-KB-03 — Actualizar la información de entrenamiento (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. HU-KB-01/V2 dieron a la IA contexto editable y presets; HU-KB-03 cierra el ciclo:
> cuando el negocio cambia, el conocimiento se actualiza y **la caché de respuestas de IA deja de
> servir contestaciones basadas en contenido obsoleto**.

**Estado:** implementado

## Historia

> Como **Administrador** quiero **actualizar la información de entrenamiento cuando cambie mi
> negocio** para que **la IA deje de responder con datos viejos apenas edito o elimino
> conocimiento.**

## Objetivo técnico

Editar o eliminar conocimiento debe reindexar los embeddings afectados (ya resuelto en
HU-KB-01-V2) y, además, **invalidar la caché de respuestas de IA del tenant** mediante un
contador `kbVersion` que se incrementa en cada cambio de contenido y que pasa a formar parte de
la clave de caché exacta de Redis usada por `AIService`.

## Alcance

### Incluye

- Campo `kbVersion: number` (default `1`) en el modelo `Tenant` — contador global por tenant, no
  por documento (ver `docs/data-model.md` → `tenants`).
- Bump atómico de `kbVersion` (`$inc`) en `updateDocument` y `deleteDocument` de
  `kb.service.ts` — **solo** cuando el cambio afecta contenido real:
  - `updateDocument`: bump si el contenido nuevo o el anterior no estaban vacíos (edición real de
    texto ya indexado o vaciado de un documento con contenido). El primer llenado de un preset
    vacío (`contenido: '' → texto`) **también** cuenta como cambio real de la KB y bumpea, aunque
    (como hoy) no incremente `version` del documento — son contadores independientes con
    propósitos distintos.
  - `deleteDocument`: siempre bumpea (borrar contenido indexado siempre invalida lo servido).
- `AIService.chat()` incorpora `kbVersion` del tenant a la clave de caché exacta (junto al
  `template.version` que ya existe), de modo que un bump vuelve inalcanzables las entradas
  anteriores (expiran solas por TTL; no se hace `DEL` activo — mismo patrón ya usado con
  `template.version`).
- Test de que un tenant con `kbVersion` ausente en Mongo (tenants creados antes de este cambio)
  se trata como `1`, sin lanzar error (los documentos leídos con `.lean()` no aplican defaults de
  Mongoose).

### Fuera de alcance

- **Conectar `AIService.chat()` al flujo real de mensajes entrantes.** Sigue sin consumidor en
  producción (`TODO(Fase 3)`, documentado en `HU-KB-02-faqs-cache/spec.md`). Esta HU deja el
  mecanismo de invalidación correcto y probado a nivel de `AIService`; el impacto visible en
  conversaciones reales llega con la HU que haga ese enganche.
- **Enganchar `searchKnowledge` (RAG) dentro de `AIService.chat()`.** Sigue siendo una pieza suelta
  usada hoy solo por el script de smoke test (`kb-smoke-retrieval.ts`); no es parte de esta HU.
- Invalidar por `DEL` activo de claves Redis (`ai:{tenant}:chat:*`); se usa versionado de clave,
  igual que `template.version`.
- Cambios al cortocircuito de FAQs (`kb-faq`) o a su propio matching — ese conocimiento no pasa
  por `AIService`'s caché exacta y queda fuera.
- `kbVersion` por documento individual; es un contador **por tenant**, no granular por documento.
- Nuevos endpoints HTTP: `PATCH/DELETE /api/kb/documents/:id` ya existen (HU-KB-01-V2) y no
  cambian de forma ni de contrato; solo su efecto secundario interno cambia.

## Endpoints (sin cambios de contrato, cambia el efecto secundario)

| Método | Ruta | Rol | Efecto nuevo |
|---|---|---|---|
| PATCH | `/api/kb/documents/:id` | admin | bump condicional de `Tenant.kbVersion` |
| DELETE | `/api/kb/documents/:id` | admin | bump incondicional de `Tenant.kbVersion` |

## Criterios de aceptación

1. Editar un documento con contenido real (antes o después de la edición) incrementa
   `Tenant.kbVersion` en 1. Editar un documento vacío hacia otro contenido vacío (caso borde, no
   debería ocurrir por validación de frontend, pero el service es la última línea) **no** bumpea.
2. Eliminar un documento incrementa `Tenant.kbVersion` en 1, sin importar si tenía contenido.
3. `AIService.chat()` construye su clave de caché con `template.version` **y** `Tenant.kbVersion`
   combinados; dos llamadas idénticas con distinto `kbVersion` no comparten entrada de caché.
4. Un `kbVersion` bumpeado hace que la siguiente llamada a `chat()` con el mismo `historial` sea
   un cache-miss (no reutiliza la respuesta cacheada antes del bump).
5. Un tenant sin el campo `kbVersion` en su documento Mongo (creado antes de esta HU) no rompe
   `chat()`: se trata como `kbVersion: 1`.
6. El bump de `kbVersion` es atómico (`$inc` vía `updateOne`/`findByIdAndUpdate`), sin
   lecturas-modificaciones-escrituras que puedan perder incrementos concurrentes.
7. `classify()` y `summarize()` **no** cambian de comportamiento (no dependen de `kbVersion`; no
   consumen contenido de la KB hoy).
8. **Aislamiento multi-tenant:** el bump de `kbVersion` del tenant A nunca afecta la clave de
   caché ni el contador del tenant B; un test de aislamiento lo cubre explícitamente en
   `kb.service.test.ts` y/o `ai.service.test.ts`.
9. `pnpm --filter backend typecheck` (`tsc --noEmit`) en verde.
10. `pnpm --filter backend test` en verde, incluyendo los tests nuevos de este criterio.

## Definición de "hecho"

Tras editar o eliminar un documento de la KB, `Tenant.kbVersion` sube y la siguiente llamada a
`AIService.chat()` del mismo tenant ya no puede servir una respuesta cacheada anterior al cambio.
El comportamiento se verifica a nivel de `AIService`/`kb.service`; la verificación end-to-end
sobre una conversación real de WhatsApp queda bloqueada por la ausencia de un consumidor de
`chat()` en producción (fuera de alcance, ver arriba).

## Dependencias

- **Depende de:** HU-KB-01-V2 (reindexado incremental de `updateDocument`/`deleteDocument`, ya
  implementado), HT-AI-01 (`AIService`, caché exacta de Redis, `ai-cache.util.ts`).
- **Bloqueante de / bloqueada por:** la HU de Fase 3 que conecte `AIService.chat()` a
  `workers/inbound-message.processor.ts` — es la que hará observable este cambio en producción.

## Trabajo previo relevante (no forma parte de las tasks de esta HU)

- `updateDocument`/`deleteDocument` en `apps/backend/src/features/kb/kb.service.ts` ya reindexan
  (limpian `KbChunk` y re-encolan `kb-index`).
- `KnowledgeDocumentTable.tsx` y `KnowledgeUploadEditor.tsx` ya cubren editar/eliminar con
  confirmación en el frontend.

Esta HU **no toca frontend** — el `kbVersion` es un detalle interno del backend, invisible para
el admin.
