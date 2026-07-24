---
name: sdd-implement
description: Implementa un feature SDD de SofiApp ejecutando sus tasks (de tasks.md o embebidas en spec.md), creando la rama feat/<ID> y el código en apps/* y packages/*. Úsala con /sdd-implement <ID>-<slug>.
argument-hint: <ID>-<slug>
disable-model-invocation: true
allowed-tools: Read, Edit(docs/specs/**), Skill, Bash(git status *), Bash(git branch *), Bash(git checkout *), Bash(git add *), Bash(pnpm *)
---

# SDD · Implementación

- **Entrada:** `$ARGUMENTS` = `<ID>-<slug>`. Lee `spec.md` y, si existen, `plan.md` y `tasks.md`. Si las tasks están embebidas en `spec.md` (camino `/sdd-spec-quick`), úsalas de ahí.
- **Salida:** código en `apps/backend|frontend/src/features/<feature>/` (y `packages/shared` si aplica).
- **Reglas de código (no las repito):** skills `sofiapp-feature-scaffold`, `multi-tenancy-guard`, `typescript-strict-mode`, `clean-code-solid` + los `CLAUDE.md` de cada app. Negocio/datos en `docs/{domain,data-model}.md`; decisiones en `docs/adr/`.

## Pasos
1. Lee las tasks. ¿Algo ambiguo? Pregunta antes de codear.
2. **Git:** árbol limpio + crea la rama `feat/<ID>`. Si no hay repo git, `git init` primero.
3. **Código:** ejecuta las tasks en orden — patrón de 6 archivos + montaje (backend) o `types → store → components → page → ruta` (frontend). Lo mínimo para cubrir el `spec`.
   - **Frontend (obligatorio, `CLAUDE.md` raíz §7):** antes de escribir cada componente nuevo o
     modificado, invoca `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`
     y aplica sus criterios. Usa componentes de shadcn/ui (`src/components/ui/`, o instálalos con
     la CLI si falta uno) en vez de controles hechos a mano cuando exista un equivalente. Deja cada
     componente terminado en light y dark antes de seguir.
4. Marca las casillas a medida que avanzas (en `tasks.md` o en `spec.md`).
5. **No cierres hasta verde:**
   - `pnpm --filter backend typecheck` + `test` (incluye **aislamiento multi-tenant**).
   - Frontend si aplica: `pnpm --filter frontend build && lint`.
   - Arranca `app.ts`/`worker.ts` si tocas rutas o colas: cero errores en consola.
6. Todo en verde → actualiza `**Estado:** creado` a `**Estado:** implementado` en `spec.md`.

## Antes de cerrar
- [ ] Rama `feat/<ID>` creada.
- [ ] Código conforme a las skills y los `CLAUDE.md`, con `tenantId` del token en cada operación.
- [ ] Todas las casillas marcadas.
- [ ] typecheck + tests (incl. aislamiento) en verde; build/lint de frontend si aplica.
- [ ] Checklist de PR de `docs/multi-tenancy.md` §9 revisado.
- [ ] `spec.md` con `**Estado:** implementado`.
