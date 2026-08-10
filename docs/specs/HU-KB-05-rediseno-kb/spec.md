# HU-KB-05 — Rediseño de la vista de documentos de la base de conocimiento (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. HU **100 % frontend**: unifica las tres zonas que hoy compiten en "Entrenar la IA"
> en una sola grilla de tarjetas con edición y creación por modal.

**Estado:** implementado

## Historia

Como **admin** de un tenant, quiero ver **todo** mi conocimiento cargado —las 5 categorías
predefinidas y los documentos que yo mismo creé— en **una sola grilla de tarjetas**, y poder editar
o crear cualquiera desde un modal, para no tener que saltar entre una barra de presets, un
formulario suelto y una tabla inferior para entender qué le falta a mi IA.

## Contexto: qué está mal hoy

`apps/frontend/src/features/knowledge-base/pages/KnowledgeBasePage.tsx` renderiza **tres zonas que
compiten** por la misma información:

| Zona | Qué muestra | Problema |
|---|---|---|
| `PresetKnowledgeBar` | Grilla de 5 tarjetas (presets, incluidos los virtuales `__preset_*`) | No muestra los documentos libres del usuario, ni versión/estado/fecha |
| `KnowledgeUploadEditor` | Formulario siempre visible | Ocupa espacio permanente; editar dispara un `scrollIntoView` hacia él |
| `KnowledgeDocumentTable` | Tabla con versión, fragmentos, estado y fecha | Es el **único** sitio donde viven los documentos libres |

El admin tiene que reconciliar mentalmente barra y tabla, y el contador superior dice "X/5" con un
denominador fijo que ignora los documentos que él mismo creó.

## Objetivo técnico

Reemplazar la barra + el formulario embebido + la tabla por:

1. Una **grilla única de 2 columnas** que fusiona los 5 presets (incluidos los virtuales) con los
   documentos libres, con toda la información que hoy vive en la tabla trasladada a cada tarjeta.
2. Un **modal de edición** (clic sobre cualquier tarjeta) y un **modal de creación** (tarjeta
   "Agregar nuevo conocimiento"), ambos reutilizando `KnowledgeUploadEditor` dentro del `Dialog`
   de shadcn.
3. Un **contador partido en dos**: obligatorios con denominador fijo (2) y documentos indexados con
   denominador **dinámico** (5 presets + documentos libres).

Sin tocar una sola línea de backend ni del cliente HTTP.

## Alcance

### Incluye

- `apps/frontend/src/features/knowledge-base/lib/kb-presets.ts` — helpers nuevos (`buildKbGrid`,
  `isTitleTaken`, `normalizeTitulo`, `nextVersion`) y extensión de `KbProgress`.
- Componentes nuevos: `KnowledgeCard`, `KnowledgeGrid`, `KnowledgeDocumentDialog`.
- Refactor de `KnowledgeUploadEditor` (pasa a ser el cuerpo del modal, con borrado y regla de
  colisión de títulos), `PresetProgress` y `RequiredPresetsBanner`.
- Eliminación de `PresetKnowledgeBar`, `KnowledgeDocumentTable` y `KnowledgeEmptyState`.
- Reescritura de `KnowledgeBasePage` (estado del modal, sin `formRef` ni `scrollIntoView`).
- Migración del test de progreso de KB a Vitest dentro de `src/`, con cobertura nueva.

### Fuera de alcance

- **Cualquier cambio en `apps/backend/**`.** El contrato `POST/GET/PATCH/DELETE /api/kb/documents`,
  el versionado (`isFirstFill`), el troceado y la indexación quedan exactamente como están.
- `apps/frontend/src/api/knowledge-base.ts` (las cuatro funciones ya cubren todo lo necesario).
- La vista de FAQs: `KnowledgeFaqsPage`, `FaqTable`, `FaqFormDialog`, `FaqTester`.
- El *drift* de `proposito` entre `PRESET_DOCUMENTS` (backend) y `PRESET_META` (frontend): se
  documenta como deuda en `plan.md`, no se corrige aquí.
- Los primitivos de `src/components/ui/**` (`dialog` y `alert-dialog` ya están vendorizados; no hace
  falta `shadcn add`).
- La suite roja preexistente `TagSelector.test.tsx` (le falta un `TooltipProvider`), ajena a esta HU.

## Criterios de aceptación

1. **Una sola grilla.** `KnowledgeDocumentTable.tsx`, `PresetKnowledgeBar.tsx` y
   `KnowledgeEmptyState.tsx` ya no existen y ningún archivo los importa.
2. La grilla es de **2 columnas** en `sm`+ (1 en móvil) y contiene, en este orden: los 5 presets
   fusionados en orden `PRESET_ORDER`, los documentos libres por `createdAt` ascendente, y la
   tarjeta "Agregar nuevo conocimiento" al final.
3. Cada tarjeta muestra el **título completo sin truncar**, el estado de indexación
   (`IndexingStatusBadge`), `v{version}`, el número de fragmentos y la fecha de actualización — es
   decir, la información que hasta ahora solo existía en la tabla.
4. Una tarjeta de preset **virtual** (`__preset_*`) muestra "Sin contenido todavía" en lugar de
   versión/fragmentos/fecha: en su caso esos valores los inventa el merge y mostrarlos sería mentir.
5. **No hay formulario embebido.** `KnowledgeUploadEditor` solo se renderiza dentro de un `Dialog`, y
   `KnowledgeBasePage` ya no tiene `formRef` ni el `useEffect` de `scrollIntoView`.
6. Un clic sobre **cualquier** tarjeta existente abre el modal de edición, con el título como
   encabezado **fijo** (no editable) y el contenido precargado (nunca se sobrescribe a ciegas).
7. El modal de edición indica la versión actual y la de destino, replicando el `isFirstFill` del
   backend: documento con contenido vacío → se guarda en la misma versión (v1); con contenido previo
   → v+1; preset virtual → se creará en v1.
8. La tarjeta "Agregar nuevo conocimiento" usa el token **`bg-primary` / `text-primary-foreground`**
   (cero `bg-[#...]`) y abre el modal de creación con **Título editable** + Contenido, y los botones
   **Cancelar** y **"Guardar e indexar"**. Al guardar aparece una tarjeta nueva con ese título,
   tratada igual que las de preset.
9. **Colisión de títulos.** En creación, un título ya usado —por un documento real o reservado por
   `PRESET_META`, aunque ese preset siga siendo virtual— con comparación normalizada (`trim` +
   minúsculas) **deshabilita** "Guardar e indexar" y muestra:
   `Este conocimiento ya existe ("<título>"). Ábrelo desde su tarjeta para editarlo.`
   No se envía ninguna petición al backend.
10. El modal de edición tiene un botón **Eliminar** separado a la izquierda, con `AlertDialog` de
    confirmación (patrón vigente del proyecto). Está **ausente** cuando `doc.obligatorio === true`
    y cuando el documento es un preset virtual (no hay nada que borrar).
11. ~~Al eliminar un preset **no** obligatorio, su tarjeta reaparece en la grilla como virtual en
    estado "falta"/"opcional" — el comportamiento actual de `mergePresetsWithDocuments`, conservado.~~
    > **Superado por HU-KB-06.** Conservar la reaparición resultó ser el defecto, no la
    > característica: eliminar un preset era un no-op visual. Desde HU-KB-06 el borrado se persiste
    > como *soft-delete* (`oculto: true` en `KbDocument`), `mergePresetsWithDocuments` excluye esos
    > presets y la tarjeta **desaparece**; re-crear el título la resucita. Además, el backend ahora
    > rechaza con 400 el borrado de un obligatorio. Ver `docs/specs/HU-KB-06-mejoras-kb/`.
12. El contador superior queda **partido en dos**: `X/2 obligatorios completados` (denominador fijo)
    y `Y/Z documentos indexados`, con `Z = 5 presets + documentos libres`, recalculado dinámicamente
    por `computeKbProgress`.
13. **Manejo de errores sin tabla.** Si la query `['kb','documents']` falla, la página muestra un
    banner con "Reintentar" **en lugar de** la grilla (pintarla con 5 presets virtuales daría a
    entender que el tenant no tiene conocimiento, cuando lo que pasa es que no se pudo leer). Los
    errores de guardar y de borrar se muestran en el modal o por toast.
14. **Cero cambios de backend.** `git diff` no toca `apps/backend/**` ni
    `apps/frontend/src/api/knowledge-base.ts`. Al no haber código de servidor, esta HU **no
    introduce superficie multi-tenant nueva**: el aislamiento lo siguen garantizando los endpoints
    existentes (`authenticateJWT → requireTenant → authorize(['admin'])` + repositorio `*Scoped`),
    que no se modifican. Por eso no hay test de aislamiento en esta HU.
15. Todos los componentes tocados quedan correctos en **light y dark** con tokens semánticos, y se
    invocaron `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`
    **antes** de escribirlos (regla §7 del `CLAUDE.md` raíz). Si alguna no está registrada en el
    entorno, queda documentado en `tasks.md`.
16. `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`) y `pnpm --filter @sofiapp/web lint`
    en verde; `pnpm --filter @sofiapp/web test` con **todos** los tests de `knowledge-base` en
    verde, incluido el port a Vitest de `kb-progress` — hoy **rojo** en la rama base porque su
    constante `'Preguntas frecuentes'` quedó obsoleta al renombrarse ese preset a
    `'Información Complementaria'` (commit `4ac6670`).

## Dependencias

Depende de:

- Rama base **`feat/HU-KB-04`** (no `develop`): aporta el reemplazo de `window.confirm` por
  `AlertDialog` en la KB y los primitivos `scroll-area`/`tabs` ya vendorizados.
- `features/knowledge-base/lib/kb-presets.ts` — `PRESET_META`, `PRESET_ORDER`,
  `mergePresetsWithDocuments`, `computeKbProgress`, `isVirtualPresetId`, `presetIcon`.
- `src/api/knowledge-base.ts` — `createKbDocument`, `updateKbDocument`, `deleteKbDocument`,
  `getKbDocuments` (**sin cambios**).
- `src/components/ui/` — `dialog`, `alert-dialog`, `button`, `input`, `textarea`, `label`, `badge`,
  `skeleton` (todos ya vendorizados).

No bloquea ni la bloquea ninguna otra HU en curso.

## Definición de "hecho"

El admin abre `/settings/knowledge` y ve **una sola grilla de dos columnas** con las 5 categorías
predefinidas más sus documentos propios; cada tarjeta lleva su estado de indexación, versión,
fragmentos y fecha de actualización. Un clic abre el modal de edición con el contenido precargado y
la versión de destino correcta; "Agregar nuevo conocimiento", en `bg-primary`, abre el modal de
creación y bloquea títulos ya existentes antes de enviar nada; cualquier tarjeta no obligatoria se
puede eliminar con confirmación; y el encabezado informa por separado los obligatorios (denominador
fijo) y los documentos indexados (denominador dinámico). Todo ello sin una sola línea de backend
tocada.
