---
name: merge-review
description: Revisa una rama de feature de SofiApp contra develop ANTES de fusionarla — trae la rama localmente, compara el diff/log contra develop, aplica las reglas no negociables (aislamiento multi-tenant, controllers delgados, TypeScript strict, reglas de frontend) y corre typecheck/test/build/lint solo en las áreas tocadas. Emite un veredicto por consola (APROBADA / APROBADA CON OBSERVACIONES / RECHAZADA). Nunca hace merge, push ni toca develop. Úsala con /merge-review <rama>.
argument-hint: <rama> (ej. feat/HU-SAAS-01)
disable-model-invocation: true
allowed-tools: Read, Bash(git status *), Bash(git fetch *), Bash(git branch *), Bash(git checkout *), Bash(git merge-base *), Bash(git diff *), Bash(git log *), Bash(git show *), Bash(pnpm *)
---

# Merge Review

> Solo **informa**. Este skill jamás ejecuta `git merge`, `git push`, `git rebase`, `git reset`,
> ni crea tags. No toca `develop` ni ninguna rama de destino. El único resultado es un veredicto
> impreso en consola.

- **Entrada:** `$ARGUMENTS` = `<rama>` (ej. `feat/HU-SAAS-01`).
- **Salida:** veredicto en consola, nunca archivos ni cambios en git.

## Pasos

1. **Pre-flight — árbol limpio.** `git status --porcelain`. Si hay cambios sin commitear,
   **detente** y pídele al usuario que los commitee o los guarde manualmente (`commit-changes` o
   `git stash` **por su propia mano**). Nunca stashees automáticamente: el usuario decide qué pasa
   con su trabajo en curso. Anota la rama actual (`git branch --show-current`) para volver a ella
   al cerrar.
2. **Actualiza `develop`.** `git fetch origin develop`. Trabaja siempre contra `origin/develop`
   (la referencia remota), no contra el `develop` local, así no interfieres si esa rama está
   checked out en otro sitio.
3. **Trae la rama a revisar.**
   - `git fetch origin <rama>`. Si no existe en `origin`: **detente** con error claro — `"La rama
     <rama> no existe en origin. Verifica el nombre."` No inventes ni sugieras ramas parecidas.
   - `git checkout -B <rama> origin/<rama>`. Usa siempre `-B` (exista o no localmente): fuerza al
     local a apuntar exactamente a `origin/<rama>`, sin importar si ya existía y estaba
     desactualizado o divergido. La revisión debe reflejar lo que realmente hay en `origin` (lo
     que entraría al PR), no commits locales sin pushear.
4. **Diff y log vs `develop`.**
   - `git merge-base origin/develop <rama>` para el ancestro común.
   - `git diff origin/develop...<rama>` (triple punto: solo lo que cambió en la rama desde ese
     ancestro, sin ruido de otros merges ya integrados a `develop`).
   - `git log origin/develop..<rama> --oneline` para la lista de commits a revisar.
   - `git diff --name-only origin/develop...<rama>` para clasificar el alcance: ¿toca
     `apps/backend/**`, `apps/frontend/**`, `packages/shared/**`, `docs/**`?
5. **Checklist de reglas no negociables** (referencia, no la repitas completa en la salida):
   - **Si toca backend o `packages/shared`:** aplica `docs/multi-tenancy.md` §9 y el skill
     `multi-tenancy-guard` (query siempre `*Scoped`, `tenantId` del token, modelos con `tenantId`
     required+indexado, `requireTenant` tras `authenticateJWT`, rutas Superadmin con
     `authorize(['superadmin'])`, test de aislamiento presente). Verifica también: controllers
     delgados (sin `try/catch`, sin lógica de negocio, sin Mongoose directo, errores vía
     `AppError`), validación Zod en el borde, sin fallback inseguro de `JWT_SECRET`, env vars por
     el config module con Zod, servicios con `tenantId` explícito, webhooks Meta con 200 inmediato
     + BullMQ si aplica.
   - **Si toca frontend:** aplica `apps/frontend/CLAUDE.md` y `CLAUDE.md` raíz §7 — llamadas HTTP
     solo vía `apiClient` (nunca `fetch`/`axios` crudo), rutas nunca prefijadas con `/api`,
     shadcn/ui reutilizado en vez de controles hechos a mano cuando exista equivalente, componente
     terminado en light y dark con tokens semánticos. No puedes re-invocar `emil-design-eng`,
     `impeccable:impeccable` ni `frontend-design:frontend-design` sobre código ya escrito, pero
     señala como hallazgo cualquier componente que luzca no pulido, sin dark mode o con un control
     manual donde shadcn ya resolvería el caso.
   - **Si toca ambos:** aplica ambos bloques.
   - Con **TypeScript strict** en cualquier `.ts`/`.tsx` tocado: cero `any`, tipos de retorno
     explícitos (skill `typescript-strict-mode` como referencia).
6. **Comandos de calidad — solo en las áreas tocadas:**
   - Backend o shared tocado → `pnpm --filter backend typecheck` y `pnpm --filter backend test`
     (incluye aislamiento).
   - Frontend tocado → `pnpm --filter frontend build` y `pnpm --filter frontend lint`.
   - No corras el par que no aplica. Cualquier comando en rojo es hallazgo **bloqueante**.
7. **Capturas sueltas.** Sobre el mismo `git diff --name-only origin/develop...<rama>`, busca
   `*.png`/`*.jpg` fuera de `.playwright-mcp/`. Si aparecen, es una captura de verificación que se
   coló — hallazgo bloqueante (regla de limpieza de `CLAUDE.md` raíz).
8. **Veredicto.** Formato fijo:
   ```
   VEREDICTO: APROBADA | APROBADA CON OBSERVACIONES | RECHAZADA

   Bloqueantes:
   - [ruta:línea] descripción (si no aplica: "Ninguno")

   Sugerencias:
   - [ruta:línea] descripción (si no aplica: "Ninguna")

   Resumen: <1-2 frases>
   ```
   - **RECHAZADA:** al menos un hallazgo bloqueante (regla no negociable violada, o typecheck/test/
     build/lint en rojo).
   - **APROBADA CON OBSERVACIONES:** cero bloqueantes, una o más sugerencias.
   - **APROBADA:** cero bloqueantes y cero sugerencias.
9. **Cierre.** Vuelve a la rama en la que estabas antes del paso 1 (`git checkout <rama-original>`),
   salvo que el usuario pida explícitamente quedarse en `<rama>`. No fusiones, no pushees, no
   modifiques `develop` ni `<rama>` en ningún momento.

## Antes de cerrar
- [ ] Working tree estaba limpio antes de tocar ramas (o el proceso se detuvo y no siguió).
- [ ] `origin/develop` actualizado vía fetch; `develop` local no tocado.
- [ ] `<rama>` traída localmente (o error claro si no existe en ningún lado).
- [ ] Diff/log revisados vs `origin/develop` (`merge-base`, `diff ...`, `log ..`).
- [ ] Checklist de reglas no negociables aplicado según el alcance real (backend/frontend/ambos).
- [ ] Comandos de calidad ejecutados solo en las áreas tocadas; resultado (verde/rojo) reflejado en el veredicto.
- [ ] Sin `*.png`/`*.jpg` sueltos fuera de `.playwright-mcp/`.
- [ ] Veredicto impreso con el formato fijo (APROBADA / APROBADA CON OBSERVACIONES / RECHAZADA).
- [ ] Cero `git merge`, `git push`, `git rebase`, `git reset` o tags ejecutados.
- [ ] Rama original restaurada al cerrar.
