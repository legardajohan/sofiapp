---
name: commit-changes
description: Confirma (commit) los cambios pendientes de SofiApp en git, agrupados de forma lógica y con Conventional Commits. Úsala cuando se pida hacer commit de cambios en el repositorio.
---

# Confirmar cambios

> **Idioma:** los mensajes de commit van **siempre en inglés** (tipo, descripción, cuerpo, pie), aunque la conversación sea en español.
> **Si no hay repo git:** `git init` (+ `.gitignore`) antes de seguir. Ramas de feature: `feat/<ID>` (ej. `feat/AUTH-01`), igual que `sdd-implement`.

## Pasos
1. `git status` para ver lo pendiente.
2. **Agrupa** por intención: un commit por cambio lógico.
3. `git add` por grupo.
4. **Mensaje (Conventional Commits):** `<tipo>(alcance): <descripción>` + cuerpo/pie opcionales.
   - Tipos: `feat`, `fix`, `test`, `perf`, `refactor`/`style`, `docs`, `chore`/`build`/`ci`. Breaking con `!` o `BREAKING CHANGE`.
   - Alcances del monorepo: `api`, `web`, `shared`, `docs`, `infra` (ej. `feat(api): add cliente CRUD scoped by tenant`).
   - Descripción ≤ ~50 chars; cuerpo/pie ≤ ~72/línea. Referencia el ID del feature cuando aplique.

## Reglas
- No mezcles backend + frontend + docs en un commit salvo que sean inseparables.
- Antes de commitear código: `pnpm --filter backend typecheck` (y tests de aislamiento) en verde. No commitees con el typecheck roto.
- Commitea/pushea **solo cuando el usuario lo pida**; si estás en la rama por defecto, crea rama de feature primero.
