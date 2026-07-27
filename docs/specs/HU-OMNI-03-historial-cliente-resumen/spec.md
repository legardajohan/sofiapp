# HU-OMNI-03 — Historial completo del cliente + resumen IA (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Da al asesor contexto de atención sin salir de la bandeja: quién es el contacto,
> qué se ha hablado y un resumen al instante.

**Estado:** implementado

## Objetivo

Permitir que un **Administrador**, desde una conversación de la bandeja, abra la **ficha del
contacto** con su **historial completo de mensajes** y **genere o actualice bajo demanda un resumen
por IA** de la conversación. El resumen refleja el contenido real de la conversación y se marca como
desactualizado cuando llegan mensajes nuevos, para regenerarlo con un clic.

## Contexto de dominio (importante)

En SofiApp **no existe una colección `Conversation`**: una conversación **es** un `Cliente`, y los
mensajes se ligan por `Message.clienteId` (no hay `conversationId`). La identidad de un contacto es
`(tenantId, metaUserId)` **por canal**. Por eso el alcance MVP de "historial completo del cliente"
es el **historial de un único `Cliente`** (todos sus mensajes). La unificación cross-canal (agrupar
varios `Cliente` con el mismo `telefono`) queda **fuera de alcance** y documentada como fase futura.

## Alcance

Incluye:
- **Backend**
  - `GET /api/clientes/:id/history`: ficha del contacto + historial de mensajes paginado + estado del
    resumen (`null` si no se ha generado). Rellena el feature `cliente` (hoy con controller/routes/
    validation *placeholder*).
  - `POST /api/conversations/:id/summary`: genera/actualiza el resumen de la conversación de forma
    **síncrona** (llama a la IA en línea y responde) y lo **persiste** en `Cliente.resumenIA`.
  - Subdoc `resumenIA` en el modelo `Cliente`; "desactualizado" se **deriva** de
    `ultimoMensajeAt > resumenIA.mensajesHasta` (invalidación automática al llegar entrantes).
  - `AIService.summarize()` sobre la capa IA existente (HT-AI-01), reutilizando `provider.generateReply`
    y `resolveTemplate` con una plantilla global nueva `method:'summary'` (seed).
  - Singleton `getAIService()` para inyectar el cliente Redis una sola vez (patrón de `realtime.publisher`).
- **Frontend** (`apps/frontend/src/features/inbox/`)
  - Panel lateral (drawer con la primitiva `ui/sheet`) accesible desde la conversación activa: ficha
    del contacto, historial y tarjeta de resumen con botón "Generar/Actualizar resumen" y badge
    "desactualizado".
  - Invalidación del historial en tiempo real al recibir `message:new` del cliente activo.

Fuera de alcance (otros features / fases):
- **Unificación cross-canal** de contactos por `telefono` (varios `Cliente`) → fase futura.
- **Resumen asíncrono / automático** vía BullMQ y auto-resumen al llegar mensajes → fuera de MVP
  (este es *bajo demanda* y síncrono).
- Cache semántica de embeddings (excluida del MVP por el `CLAUDE.md` raíz).
- Edición/CRUD de la ficha del contacto (solo lectura del historial + acción de resumen).

## Criterios de aceptación

1. `GET /api/clientes/:id/history` devuelve la **ficha** del contacto (nombre, teléfono, canal,
   `estadoComercial`, `nivelInteres`, `objecionPrincipal`, `rolContacto`, `tags`, `asesorId`,
   `ultimoMensajeAt`, `createdAt`), el **resumen** (`{ texto, generadoAt, desactualizado }` o `null`)
   y los **mensajes paginados** del cliente (orden ascendente para pintar el hilo).
2. `POST /api/conversations/:id/summary` genera un resumen **síncrono** que refleja el contenido de
   la conversación y lo **persiste** en `Cliente.resumenIA` (`texto`, `generadoAt`, `mensajesHasta`,
   `modelo`). Devuelve `IResumenResponse`. Si la conversación no tiene mensajes de texto, lanza
   `AppError(422)`.
3. Tras nuevos mensajes entrantes (que actualizan `ultimoMensajeAt`), el historial marca el resumen
   como **desactualizado** (`ultimoMensajeAt > resumenIA.mensajesHasta`); una nueva llamada a
   `summary` lo regenera y limpia la marca.
4. Existe una **plantilla global** `method:'summary'` (`tenantId:null`) en el seed, y
   `AIService.summarize()` la resuelve (tenant-específica > global), registra uso (`AiUsageLog`) y
   devuelve `AiResult<string>`.
5. El **panel lateral** abre desde la conversación activa y muestra la ficha + historial + tarjeta de
   resumen con el botón de generar/actualizar y estados de carga/vacío/error impecables.
6. **Aislamiento multi-tenant:** un `clienteId` del tenant A **no** es accesible ni resumible desde el
   tenant B (`findByIdScoped` → `AppError(404)`); ni el historial ni el resumen cruzan tenants; el
   `tenantId` de toda operación nace del token. **Test de aislamiento en verde** para ambos endpoints.
7. `pnpm --filter backend typecheck` (`tsc --noEmit`) en verde y
   `pnpm --filter frontend build && pnpm --filter frontend lint` sin errores.

## Dependencias

- `HT-AI-01` — capa `AIService`/`GeminiProvider`/`ai-cache`/`PromptTemplate` (base del resumen).
- `HU-OMNI-01` — bandeja de WhatsApp y features `conversation`/`message`/`cliente`.
- `INF-02` — repositorio tenant-safe (`*Scoped`) y `requireTenant`.
- `HT-WA-01` — envío/recepción de WhatsApp que mantiene `ultimoMensajeAt` (base de la invalidación).
