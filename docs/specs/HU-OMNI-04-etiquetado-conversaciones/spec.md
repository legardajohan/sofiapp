# HU-OMNI-04 — Etiquetado de conversaciones (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Da al administrador una forma de clasificar la bandeja y establece el vocabulario
> de **semaforización** que reutilizarán CRM-04, IA-05 y MARK-01.

**Estado:** implementado

## Objetivo

Permitir que un **Administrador** cree etiquetas propias de su empresa (nombre + color), aplique
varias a una conversación de la bandeja y filtre la bandeja por ellas. Sobre esta base se define
el concepto de **semaforización**: cuatro etiquetas de sistema (Azul, Rojo, Naranja, Verde) con
significado fijo y compartido entre módulos.

## Contexto de dominio (importante)

En SofiApp **no existe una colección `Conversation`**: una conversación **es** un `Cliente`
(ver `docs/domain.md` y la spec de HU-OMNI-03). Por tanto:

- La "relación Tag ↔ Conversation" del backlog se materializa como `Cliente.tagIds: ObjectId[]`.
- El endpoint `PATCH /api/conversations/:id/tags` recibe en `:id` un **`clienteId`**, igual que el
  resto de rutas de `conversations` ya montadas.

El modelo `Cliente` ya tiene un campo `tags: [String]` (texto libre, sin color, sin gestión en la
UI). Este feature lo **sustituye**: se migran esos valores a `Tag` reales y se elimina el campo.

## Alcance

Incluye:

- **Backend**
  - Feature `tag` completo (patrón de 6 archivos): `GET`/`POST /api/tags`,
    `PATCH`/`DELETE /api/tags/:id`. Todo por tenant.
  - `Cliente.tagIds` + índice `{ tenantId, tagIds }`; retirada de `Cliente.tags: [String]`.
  - `PATCH /api/conversations/:id/tags` para fijar el conjunto de etiquetas de una conversación.
  - Filtro `?etiqueta=<tagId>` en `GET /api/conversations`, combinable con los ya existentes
    (`filtro`, `asignadoA`, `estado`) de HU-OMNI-01/02.
  - Semilla de las 4 etiquetas de semaforización **por tenant**, idempotente.
  - Script de migración de `tags: [String]` → `tagIds`.
- **Frontend**
  - Pantalla de gestión de etiquetas (crear, renombrar, recolorear, borrar).
  - Selector multi-etiqueta en la cabecera de la conversación activa.
  - Chips de color en la lista de conversaciones y filtro por etiqueta en la bandeja.
- **Documentación**
  - `docs/domain.md`: definición de **semaforización** y significado de cada color.
  - `docs/data-model.md`: colección `tags` y cambio de `clientes.tags` → `clientes.tagIds`.

Fuera de alcance (otros features / fases):

- Asignación **automática** de semáforo por IA → `IA-05`.
- Etiquetado masivo (seleccionar varias conversaciones y etiquetarlas de una vez).
- Métricas y reportes por etiqueta → `CRM-04`.
- Segmentación de campañas por etiqueta → `MARK-01`.
- Jerarquías o grupos de etiquetas.

## Criterios de aceptación

1. `POST /api/tags` crea una etiqueta con `nombre` (1–30 caracteres) y `color` hex `#RRGGBB` en el
   tenant del token. `GET /api/tags` lista las del tenant ordenadas por nombre. Dos etiquetas del
   mismo tenant **no** pueden llamarse igual ignorando mayúsculas ("Urgente" y "urgente" colisionan);
   el intento devuelve `AppError(409)`.
2. `PATCH /api/tags/:id` permite cambiar nombre y color. `DELETE /api/tags/:id` la elimina **y** la
   retira de todas las conversaciones del tenant que la tuvieran (sin dejar referencias colgadas).
3. `PATCH /api/conversations/:id/tags` recibe `{ tagIds: string[] }` y **reemplaza** el conjunto de
   etiquetas de la conversación (permite aplicar y quitar varias en una sola operación). Si algún
   `tagId` no pertenece al tenant, la operación **falla entera** con `AppError(422)` sin escribir
   nada. Emite `conversation:updated` por realtime.
4. `GET /api/conversations?etiqueta=<tagId>` devuelve solo las conversaciones que tengan esa
   etiqueta, y se combina con `filtro`, `asignadoA` y `estado` sin romperlos.
5. Cada conversación devuelta por `GET /api/conversations` incluye sus etiquetas ya hidratadas
   (`tags: [{ id, nombre, color }]`), resueltas **en lote** — sin una consulta por conversación.
6. Existen 4 etiquetas de **semaforización** por tenant, identificadas por un campo estable
   `semaforo: 'azul' | 'rojo' | 'naranja' | 'verde'`. Se siembran al crear un tenant y por backfill
   idempotente en los existentes. El administrador puede renombrarlas y recolorearlas, pero
   **no borrarlas** (`AppError(409)`). Otros módulos las resuelven por `semaforo`, nunca por nombre.
7. Los `tags: [String]` existentes se migran a `Tag` reales del tenant y el campo desaparece del
   modelo; el script es idempotente y admite `--dry-run`.
8. **UI:** la bandeja muestra chips de color por conversación, la cabecera de la conversación tiene
   un selector multi-etiqueta y la bandeja un filtro por etiqueta. Todo legible en **claro y
   oscuro**, con estados de carga, vacío y error resueltos.
9. **Contraste:** el texto de un chip alcanza **≥4.5:1** contra su fondo para cualquier hex que el
   administrador elija, en ambos temas. Es verificable con test unitario sobre la función de color.
10. **Aislamiento multi-tenant:** una etiqueta del tenant A no se lista, edita ni borra desde el
    tenant B (`AppError(404)`); aplicar un `tagId` del tenant A a una conversación del tenant B falla;
    filtrar por una etiqueta ajena devuelve vacío. **Test de aislamiento en verde** para los tres casos.
11. `pnpm --filter @sofiapp/api typecheck` y `test` en verde;
    `pnpm --filter @sofiapp/web build`, `lint` y `test` sin errores.

## Nota sobre el color libre (decisión de producto)

El color es **hex libre**, elegido por el administrador. Esto es una excepción consciente a INF-03
("cero utilidades de color arbitrarias"): un color de etiqueta es **dato del tenant**, no un token
de diseño. Se acota así:

- Un único componente (`TagChip`) aplica el color, vía `style` inline — nunca clases `bg-[#...]`.
- El texto del chip **no** usa el hex crudo: se deriva con la luminancia corregida según el tema,
  para cumplir el criterio 9. Un `#1E3A8A` se aclara en modo oscuro en lugar de desaparecer.
- El picker ofrece los 4 colores de semáforo como presets, además de la entrada libre.

## Dependencias

- `INF-02` — repositorio tenant-safe (`*Scoped`) y `requireTenant`.
- `HU-OMNI-01` — bandeja de WhatsApp, features `conversation` / `cliente` / `message`.
- `HU-OMNI-02` — filtros combinables de bandeja (`asignadoA`, `estado`) e hidratación en lote de
  responsables, patrón que este feature replica para las etiquetas.
- `HU-SAAS-01` — creación de tenants, punto donde se siembran las etiquetas de semáforo.
- `DSN-03` — UI kit shadcn (`badge`, `dropdown-menu`, `select`, `dialog`, `popover`).
