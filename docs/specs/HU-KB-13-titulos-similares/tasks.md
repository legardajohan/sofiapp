# HU-KB-13 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. **Un solo commit**: los cuatro archivos cuentan la misma historia y separarlos
> dejaría un commit intermedio con los tests en rojo (la aserción de `normalizeTitulo` cambia en el
> mismo paso que la función).

## Antes de empezar

- [x] **Decisiones cerradas por el usuario, no rediseñar:** normalización NFD, Levenshtein propio sin
      dependencias, los dos umbrales (≤20 → 3, >20 → 5), el copy del aviso y que **no bloquea** el
      guardado.
- [x] **Dos preguntas abiertas resueltas antes de tocar código:**
      1. *¿Documentación SDD?* → `spec.md` + `tasks.md`, **sin `plan.md`** (el CÓMO ya venía cerrado).
      2. *¿Cuándo aparece el aviso?* → **al salir del campo (blur)**, no en cada tecla.
- [x] **Decisiones tomadas por Claude y declaradas en el spec** (criterios 10 y 15-16): los `oculto`
      quedan fuera de la sugerencia, `dark:border-amber-900/60` añadido a las clases dictadas, y
      `role="status"` en el aviso.

## Rama

- [x] **NO crear `feat/HU-KB-13`** — instrucción explícita. Se trabaja y se commitea sobre
      **`feat/HU-KB-05`**, igual que HU-KB-06…12.

## Skills obligatorias (regla §7 del `CLAUDE.md` raíz)

- [x] Invocar las skills de diseño **antes** de escribir el componente.
      **Parcial, y queda declarado:** `frontend-design:frontend-design` **sí** está registrada y se
      invocó antes de tocar `KnowledgeUploadEditor`. De ahí salieron tres decisiones: separar
      sugerencia de error por el **color del texto** (`text-muted-foreground` vs `text-destructive`)
      y no solo por el tinte de la caja; **no** añadir icono al aviso, para que no gane peso visual
      frente al error; y reusar el idioma de aparición de `ConditionalReveal`
      (`motion-safe:animate-in fade-in slide-in-from-top-1 duration-200`) en vez de inventar uno.
      `emil-design-eng` e `impeccable:impeccable` **siguen sin estar registradas en este entorno**
      (igual que en HU-KB-08…12); sus criterios se aplicaron de memoria y quedan **pendientes de
      verificación** cuando estén disponibles.
- [x] Aplicar `typescript-strict-mode`: cero `any`, tipo de retorno explícito en lo exportado y
      `?? 0` en los índices de la matriz de Levenshtein en vez de `!` (`noUncheckedIndexedAccess`
      está activo en `tsconfig.base.json`).

---

## Paso 1 — `lib/kb-presets.ts`

- [x] **`normalizeTitulo`**: `.normalize('NFD').replace(/[̀-ͯ]/g, '')` entre el `trim` y el
      `toLocaleLowerCase('es')`. Docblock explicando que NFD separa la letra de su diacrítico y por
      qué eso resuelve la clase de duplicado más común del español sin gastar distancia de edición.
- [x] **Verificar uno por uno los 3 consumidores existentes** antes de dar el cambio por seguro:
      `esPresetProtegido` (`:43`, `:53`), `schemaParaTitulo` (`kb-schemas.ts:175-186`) y
      `filterKbGrid` (`:357-360`). Los tres normalizan **ambos lados**; ninguno se rompe.
- [x] **Bloque nuevo «Títulos parecidos (HU-KB-13)»**, justo después de `isTitleTaken`:
  - [x] `umbralSimilitud(longitudMinima)` → `3` si ≤ 20, si no `5`. El comentario dice **por qué**
        escala con la longitud, no solo qué devuelve.
  - [x] `levenshtein(a, b)` privada, dos filas rodantes, con los cortes triviales (`a === b`, cadena
        vacía) al principio.
  - [x] `findSimilarTitle(titulo, documents)` exportada: candidatos = `PRESET_META` + documentos
        **no ocultos**, conserva el título original, corta con `undefined` en coincidencia exacta,
        poda por diferencia de longitud antes de calcular, y se queda con la **distancia mínima**.
- [x] Actualizar el docblock de `isTitleTaken`: ahora también bloquea variantes por **tildes**, y
      apunta a `findSimilarTitle` para lo que se le parece sin ser igual.

## Paso 2 — `components/KnowledgeUploadEditor.tsx`

- [x] Importar `findSimilarTitle` junto a `esPresetProtegido` / `isTitleTaken` / `isVirtualPresetId`.
- [x] Estado `tituloVisitado`, con el comentario que explica por qué la sugerencia espera al blur y
      el error de duplicado no.
- [x] `onChange` del input: además de `setTitulo`, `setTituloVisitado(false)` — volver a escribir
      retira el aviso.
- [x] `onBlur` del input: `setTituloVisitado(true)`.
- [x] Derivado `tituloSimilar`, guardado por `tituloEditable && tituloVisitado && !tituloDuplicado`.
      Sin `useMemo`: solo corre tras el blur y contra unas decenas de candidatos.
- [x] Derivado `tituloDescritoPor` para el `aria-describedby` (error > sugerencia > nada).
- [x] **Comprobar que `puedeGuardar` NO cambia** y dejarlo dicho en un comentario: es el punto entero
      de la HU.
- [x] El `<p>` ámbar, antes del `<p>` rojo, con la clase ámbar en light y dark, la animación de
      entrada y el copy exacto del criterio 13, envuelto en un `<div role="status">` **que se monta
      siempre**: una región viva que nace junto a su contenido no se anuncia de forma fiable.

## Paso 3 — Tests

- [x] `lib/kb-presets.test.ts`:
  - [x] Importar `findSimilarTitle`.
  - [x] **Actualizar la aserción que el cambio de NFD rompe** (`normalizeTitulo('  Políticas Y
        Términos ')` ya no devuelve `'políticas y términos'`) y añadir
        `normalizeTitulo('Politicas') === normalizeTitulo('Políticas')`.
  - [x] En `isTitleTaken`: un título sin tildes ahora colisiona con su preset acentuado.
  - [x] `describe('findSimilarTitle — títulos parecidos, sin bloquear (HU-KB-13)')` con 8 casos: el
        caso real que motivó la HU, el tramo largo (≤5), el tramo corto (≤3) **y su frontera** (4
        ediciones sobre 8 caracteres no sugiere), elegir el más parecido y no el primero, callar ante
        coincidencia exacta, título vacío / sin parecido, devolver el título original con tildes, e
        ignorar los ocultos **contrastándolo con `isTitleTaken`** en la misma aserción.
- [x] `pages/KnowledgeBasePage.test.tsx`:
  - [x] En «modal de creación»: un título sin tildes tampoco pasa (cubre el NFD de punta a punta).
  - [x] `describe` nuevo con 4 casos: avisa al blur y **deja guardar** (se comprueba que `mockCreate`
        se llama de verdad), no aparece mientras se teclea, se retira al volver a escribir, y un
        título sin parecido no genera fricción.
  - [x] Localizar el aviso por `getByRole('status')` dentro del `dialog`, no por texto: el copy está
        partido en varios nodos por la interpolación del título. «No hay sugerencia» se comprueba con
        `toBeEmptyDOMElement()`, porque la región viva existe siempre.

## Paso 4 — Documentación

- [x] `docs/specs/HU-KB-13-titulos-similares/spec.md` con `**Estado:** implementado`.
- [x] `docs/specs/HU-KB-13-titulos-similares/tasks.md` (este archivo).

## Verificación

- [x] `pnpm --filter @sofiapp/web test` — la suite completa en verde, salvo los fallos preexistentes
      y ajenos de `TagSelector.test.tsx` ya declarados en HU-KB-12.
- [x] `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`).
- [x] `pnpm --filter @sofiapp/web lint` (`--max-warnings 0`).
- [ ] **Comprobación visual en `/knowledge-base`, light y dark**, con «Agregar nuevo conocimiento»:

  | Se teclea | Al salir del campo |
  |---|---|
  | `Horarios y la ubicación` | aviso ámbar hacia «Horarios y ubicación»; botón **activo**; guarda |
  | `Politicas y terminos` | error rojo **sin esperar al blur**; botón deshabilitado |
  | `Horarios y ubicación` | error rojo; botón deshabilitado |
  | `Testimonios de egresados` | nada; botón activo |

- [ ] Si se toman capturas, van a `.playwright-mcp/` y **se borran** antes de cualquier `git add`
      (`CLAUDE.md` raíz). Revisar `git status` en busca de `*.png` sueltos antes de commitear.

## Commit

- [ ] Un commit sobre `feat/HU-KB-05`:
      `feat(web): sugerir títulos parecidos al crear conocimiento (HU-KB-13)`.
- [ ] Anotar aquí el hash al cerrarlo.
