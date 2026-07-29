---
name: sdd-spec
description: Planeación COMPLEJA de un feature de SofiApp — genera la tríada spec.md (QUÉ) + plan.md (CÓMO) + tasks.md (checklist) en docs/specs/<ID>-<slug>/, sin código. Úsala cuando haya diseño que revisar antes de codificar, con /sdd-spec <ID>-<slug> — <descripción>. Para CRUDs mecánicos usa /sdd-spec-quick.
argument-hint: <ID>-<slug> — <descripción del requerimiento>
disable-model-invocation: true
allowed-tools: Read, Write(docs/specs/**)
---

# SDD · Planeación compleja (spec + plan + tasks)

Solo planeas. No escribes código ni tests.

- **Entrada:** `$ARGUMENTS` = `<ID>-<slug>` (ej. `AUTH-01-login`) + descripción.
- **Salida:** `spec.md`, `plan.md` y `tasks.md` en `docs/specs/<ID>-<slug>/`.
- **Forma de referencia:** copia el estilo de `docs/specs/INF-02-tenant-middleware/`.
- **Contexto:** `docs/{product,domain,data-model,architecture}.md` + `docs/adr/`. No redefinas reglas, refiérete a ellas. Manda el `AGENTS.md` raíz (multi-tenancy, `tenantId` del token) y el patrón de 6 archivos de `apps/backend/AGENTS.md`.

## Pasos
1. ¿Falta contexto? Pregunta antes de escribir.
2. **`spec.md`** (QUÉ): línea `**Estado:** creado` justo tras el blockquote de cabecera · Objetivo · Alcance (incluye / fuera) · Criterios de aceptación numerados y verificables (siempre uno de **aislamiento multi-tenant** y `tsc --noEmit` en verde si toca backend) · Dependencias.
3. **`plan.md`** (CÓMO): árbol de archivos a crear/tocar (rutas exactas) · Contratos (tipos/DTOs, Zod, índices con `tenantId`, endpoints + middlewares, jobs BullMQ si hay trabajo pesado) · Notas · Verificación.
4. **`tasks.md`** (checklist): Implementación en orden del patrón de 6 archivos + montaje · Tests (incluye aislamiento) · Verificación final · Definición de "hecho".
5. Coherencia: cada criterio del `spec` se cubre en `plan` y se ejecuta en `tasks`.
6. **Detente.** Muestra un resumen (decisiones clave + criterios) y espera aprobación. Implementar va por `/sdd-implement`; liberar por `/sdd-release`.

## Esqueleto de cada archivo
Mira INF-02 para el detalle. La estructura mínima:

- **spec.md** → `# <ID> — <Título> (spec)` · `**Estado:** creado` · Objetivo · Alcance · Criterios de aceptación (último: test de aislamiento + `tsc --noEmit`) · Dependencias.
- **plan.md** → `# <ID> — Plan técnico` · Archivos a crear/tocar · Contratos (tipos/Zod/índices/endpoints/jobs) · Notas · Verificación (`pnpm --filter backend typecheck · test`).
- **tasks.md** → `# <ID> — Tasks` · Implementación (`types → model → validation → service → controller → routes` + montar en `app.ts`) · Tests (aislamiento + casos) · Verificación final (typecheck + test + checklist PR de `docs/multi-tenancy.md` §9) · Definición de "hecho".

## Antes de cerrar
- [ ] Los tres archivos existen en `docs/specs/<ID>-<slug>/`.
- [ ] `spec.md` lleva `**Estado:** creado`.
- [ ] El `spec` tiene criterio de aislamiento (si toca backend).
- [ ] `plan` y `tasks` cubren todos los criterios del `spec`.
- [ ] Cero código. Solo docs.
