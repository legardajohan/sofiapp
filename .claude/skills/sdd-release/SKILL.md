---
name: sdd-release
description: Prepara el release de un feature SDD ya implementado de SofiApp (revisión vs criterios, semver, CHANGELOG, tag y merge a main). Úsala con /sdd-release <ID>-<slug>.
argument-hint: <ID>-<slug>
disable-model-invocation: true
allowed-tools: Read, Bash(git status *), Bash(git diff *), Bash(git log *), Bash(pnpm *)
---

# SDD · Release

Entrada: `$ARGUMENTS` = `<ID>-<slug>`. La rama actual debe ser `feat/<ID>`.

## Pasos
1. **Revisión:** el código cubre los criterios de aceptación del `spec.md`. Sugiere `/code-review` para una pasada de calidad/bugs.
2. **Tests:** `pnpm --filter backend test` (incluye **aislamiento**) y, si aplica, `pnpm --filter frontend build && lint`. No liberes en rojo.
3. **Versión y docs:**
   - `package.json` del paquete afectado (`@sofiapp/api|web|shared`): sube versión por **semver**.
   - `CHANGELOG.md`: entrada nueva.
   - Actualiza docs/README si cambian flujos o contratos.
4. **Tag y merge** (confirma cada paso con el usuario antes):
   - Commit `chore: prepare release v{version}` (en inglés).
   - Tag `Release v{version}`.
   - Merge `feat/<ID>` → `main`.
5. Marca en el `spec.md` que quedó liberado.

## Antes de cerrar
- [ ] Criterios del `spec.md` verificados.
- [ ] Tests (con aislamiento) en verde; build/lint de web si aplica.
- [ ] `package.json` y `CHANGELOG.md` actualizados.
- [ ] Tag creado y `feat/<ID>` fusionada a `main`.
