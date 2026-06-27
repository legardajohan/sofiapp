---
name: sdd-spec-quick
description: Planeación SENCILLA de un feature mecánico/CRUD de SofiApp — un solo spec.md en docs/specs/<ID>-<slug>/ con las tasks embebidas, sin tríada y sin código. Úsala con /sdd-spec-quick <ID>-<slug> — <descripción> cuando NO haya diseño que revisar. Si hay diseño, integraciones o impacto multi-tenant no trivial, usa /sdd-spec.
argument-hint: <ID>-<slug> — <descripción del requerimiento>
disable-model-invocation: true
allowed-tools: Read, Write(docs/specs/**)
model: Opus 4.8
---

# SDD · Planeación sencilla (un spec con tasks embebidas)

Camino ligero para CRUDs mecánicos: sin tríada, todo en un `spec.md`. Solo planeas, no escribes código.

- **Entrada:** `$ARGUMENTS` = `<ID>-<slug>` + descripción.
- **Salida:** solo `docs/specs/<ID>-<slug>/spec.md`.
- **Contexto:** `apps/backend/CLAUDE.md` (patrón de 6 archivos), `docs/{multi-tenancy,data-model,api-contract}.md`.

## Pasos
1. **¿Es mecánico de verdad?** Si hay diseño, integraciones (Meta/LLM/colas), runtime o impacto multi-tenant no trivial → **detente y recomienda `/sdd-spec`**.
2. ¿Falta contexto? Pregunta antes de escribir.
3. Escribe `spec.md` (plantilla abajo).
4. **Detente.** Resumen breve (objetivo + endpoints + criterios). Implementar va por `/sdd-implement`.

## Plantilla — `spec.md`
```markdown
# <ID> — <Título> (spec ligero)

> SDD camino ligero: el QUÉ y las tasks en un solo archivo. Sin plan.md ni tasks.md.

## Objetivo
<1-2 frases>

## Endpoints
| Método | Ruta | Rol |
|---|---|---|

## Criterios de aceptación
1. ...
N. **Aislamiento:** tenantA no accede a datos de tenantB.
N+1. `tsc --noEmit` en verde.

## Tasks (ejecutar con /sdd-implement)
- [ ] `types → model → validation → service → controller → routes` en `features/<feature>/`
- [ ] Modelo con `tenantId` (required, indexado); queries vía `*Scoped`
- [ ] Montar en `app.ts`: `app.use('/api/<plural>', <feature>Routes)`
- [ ] Test de aislamiento + casos del feature
- [ ] `pnpm --filter backend typecheck` y `test` en verde
```

## Antes de cerrar
- [ ] Solo existe `spec.md` (sin plan.md ni tasks.md).
- [ ] Lleva criterio de aislamiento y `tsc --noEmit`.
- [ ] Cero código.
