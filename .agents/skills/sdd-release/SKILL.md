---
name: sdd-release
description: Prepara y ejecuta el release consolidado de SofiApp (todos los features mergeados a develop desde la última release, revisión vs criterios, semver, CHANGELOG, tag y merge develop → main). Úsala con /sdd-release [<ID>-<slug> ...].
argument-hint: "[<ID>-<slug> ...] (opcional, informativo)"
disable-model-invocation: true
allowed-tools: Read, Edit(docs/specs/**), Bash(git status *), Bash(git diff *), Bash(git log *), Bash(pnpm *)
---

# SDD · Release

Entrada: `$ARGUMENTS` = lista opcional de `<ID>-<slug>` a destacar en el CHANGELOG. No es
obligatoria: el skill igual descubre qué specs están `implementado` revisando `docs/specs/*/spec.md`
y el log de `develop`. La rama actual debe ser **`develop`** — este skill libera lo acumulado en
`develop`, no un `feat/<ID>` individual (eso ya se mergeó a `develop` por PR antes de llegar aquí).

## Pasos
1. **Revisión:** identifica todos los `docs/specs/<ID>-<slug>/spec.md` con `**Estado:** implementado`
   que ya estén en `develop` (compara con `git log main..develop`). Verifica que cada uno cubre sus
   criterios de aceptación. Sugiere `/code-review` para una pasada de calidad/bugs si no se hizo antes.
2. **Tests:** `pnpm --filter backend test` (incluye **aislamiento**) y `pnpm --filter frontend build && lint`.
   No liberes en rojo.
3. **Versión y docs:**
   - `package.json` raíz (o el paquete afectado si el release es de un solo dominio): sube versión
     por **semver** según el conjunto de cambios (feat → minor, fix → patch, breaking → major).
   - `CHANGELOG.md`: entrada nueva con resumen de **todos** los features incluidos en este release
     (uno por spec liberado, con su ID).
   - Actualiza docs/README si cambian flujos o contratos.
4. **Tag y merge** (confirma cada paso con el usuario antes):
   - Commit `chore: prepare release v{version}` (en inglés) en `develop`.
   - Tag `Release v{version}`.
   - Merge `develop` → `main`.
5. Actualiza `**Estado:** implementado` a `**Estado:** liberado` en el `spec.md` de cada feature
   incluido en el release.

## Antes de cerrar
- [ ] Rama actual verificada como `develop`.
- [ ] Criterios de cada `spec.md` incluido verificados.
- [ ] Tests (con aislamiento) en verde; build/lint de web en verde.
- [ ] `package.json` y `CHANGELOG.md` actualizados con todos los features del release.
- [ ] Tag creado y `develop` fusionada a `main`.
- [ ] `spec.md` de cada feature incluido con `**Estado:** liberado`.
