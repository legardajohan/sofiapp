# HU-KB-03 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Rama: **se trabaja sobre `feat/HU-KB-02`**, no se crea rama nueva para esta HU.

## Implementación

- [x] `features/tenant/tenant.model.ts`: añadir `kbVersion: { type: Number, default: 1 }` al
      `TenantSchema`, junto a `semaforoTagsSeeded`.
- [x] `features/tenant/tenant.types.ts`: añadir `kbVersion?: number` a `ITenant`.
- [x] `features/kb/kb.service.ts`:
  - [x] Importar `Tenant` desde `../tenant/tenant.model.js`.
  - [x] Función privada `bumpKbVersion(tenantId)` con `Tenant.updateOne({ _id }, { $inc: { kbVersion: 1 } })`.
  - [x] `updateDocument`: llamar `bumpKbVersion` cuando `hadContent || hasContentNow` (ver `plan.md`).
  - [x] `deleteDocument`: llamar `bumpKbVersion` siempre, tras el borrado.
- [x] `services/ai/ai.service.ts`:
  - [x] Importar `Tenant` desde `../../features/tenant/tenant.model.js`.
  - [x] Método privado `getTenantKbVersion(tenantId)` con `Tenant.findById(tenantId, { kbVersion: 1 }).lean()` y fallback `?? 1`.
  - [x] `chat()`: combinar `template.version` + `kbVersion` en un solo string para `buildCacheKey` (p. ej. `` `${template.version}:${kbVersion}` ``).
  - [x] Confirmar que `classify()` y `summarize()` quedan intactos (no leen `kbVersion`).
- [x] `docs/data-model.md`: documentar `kbVersion` en la ficha `tenants`.

## Tests (Vitest)

- [x] `kb.service.test.ts`:
  - [x] `updateDocument` con contenido real → bumpea `Tenant.kbVersion` en 1.
  - [x] `updateDocument` que vacía un documento que tenía contenido → bumpea.
  - [x] `updateDocument` primer llenado de un preset vacío (contenido `'' → texto`) → bumpea (aunque `version` del documento no suba).
  - [x] `updateDocument` de vacío a vacío (caso borde) → **no** bumpea.
  - [x] `deleteDocument` de un documento con contenido → bumpea.
  - [x] `deleteDocument` de un documento vacío (preset sin llenar) → bumpea igual (incondicional).
  - [x] **Aislamiento:** editar/borrar un documento de `tenantA` no toca `kbVersion` de `tenantB`.
- [x] `ai.service.test.ts`:
  - [x] Dos llamadas a `chat()` con el mismo `historial` y el mismo `kbVersion` → segunda es cache-hit (comportamiento actual, no debe romperse).
  - [x] Bump de `kbVersion` entre dos llamadas idénticas → la segunda es cache-miss.
  - [x] Tenant sin campo `kbVersion` en el documento Mongo (insertado directo, sin pasar por el schema) → `chat()` no lanza error, trata la versión como `1`.
  - [x] **Aislamiento:** bump de `kbVersion` en `tenantA` no invalida la caché de `tenantB` (cache-hit intacto en B).

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde (369/369, incluye los tests nuevos arriba).
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado (el bump usa `_id` directo sobre
      `Tenant`, no `*Scoped` — justificado en `plan.md`; sigue siendo la única excepción de este
      cambio, ya presente en el código como precedente vía `tenant.service.ts`/`seed-semaforo-tags.ts`).
- [x] `spec.md` actualizado a `**Estado:** implementado` al cerrar.

## Definición de "hecho"

`Tenant.kbVersion` sube en cada edición o borrado de contenido real de la KB, la clave de caché
exacta de `AIService.chat()` lo incorpora, y los tests demuestran que el bump invalida la caché
del tenant correcto sin afectar a otros tenants. La verificación end-to-end sobre una conversación
real de WhatsApp queda fuera de esta HU (ver "Fuera de alcance" en `spec.md`).
