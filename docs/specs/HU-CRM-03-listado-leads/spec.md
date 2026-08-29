# HU-CRM-03 — Visualizar todos los leads generados desde WhatsApp (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Le da al módulo M02 su puerta de entrada: hasta hoy un lead solo se veía desde la
> conversación que lo originó, nunca como cartera.

**Estado:** implementado

## Objetivo

Permitir que un **Administrador** vea, en una pantalla propia (`/leads`), **todos los leads de su
empresa** en una tabla paginada, los acote por estado, semáforo, responsable y rango de fechas, y
abra desde ahí el detalle de cualquiera con el **resumen IA** de su conversación y un enlace directo
a esa conversación en la bandeja.

Con esto el módulo **M02 — Gestión de prospectos por ESTADOS** (`docs/product.md` §5) deja de
depender de la bandeja: HU-CRM-01 abrió la conversión desde el canal, y esta historia es la vista
que responde "¿cuántos leads tengo, en qué estado están, de quién son y cuáles llevan días sin
moverse?".

## Contexto de dominio (importante)

Cuatro cosas que hay que tener presentes antes de leer los criterios:

- **El "semáforo" no es un campo del lead.** Es un vocabulario visual sobre la **conversación**,
  materializado como cuatro etiquetas de sistema (`Tag.semaforo`: `verde | naranja | rojo | azul`,
  `docs/domain.md` §5) aplicadas a `Cliente.tagIds`. Filtrar leads por semáforo obliga a pasar por
  la conversación; ver el criterio 4 y la nota de rendimiento del `plan.md`. Además, el
  administrador **puede borrar** esas etiquetas: una de semáforo **puede no existir**, y el listado
  tiene que tolerarlo en vez de asumir que las cuatro están siempre.

- **El "resumen" tampoco vive en el lead.** Es `Cliente.resumenIA` (HU-OMNI-03), y su marca
  `desactualizado` se deriva comparando `ultimoMensajeAt` con `resumenIA.mensajesHasta`. El listado
  lo hidrata desde el `Cliente`; no se duplica el campo ni se recalcula la regla.

- **No existe el rol "Asesor".** Todo usuario de un tenant es `admin` (`AUTH-02`,
  `docs/product.md` §3); "asesor" es una función, no un rol de login. El `?asesor=` de la historia
  se materializa sobre **`Lead.responsableId`**, que es quien lleva el lead.

- **Una conversación ES un `Cliente`** (`docs/domain.md`; misma advertencia en HU-CRM-01 y
  HU-CRM-02). El "acceso a su conversación" se resuelve con `Lead.origen.conversacionId`, que es un
  `clienteId`.

**Este feature no crea colección ni feature nuevos.** Extiende el feature `lead` de HU-CRM-01 con
una operación de lectura más; el patrón de 6 archivos ya está montado y `/api/leads` ya está en
`app.ts`.

## Alcance

Incluye:

- **Backend**
  - `GET /api/leads` — listado paginado del tenant, ordenado por `createdAt` descendente, con los
    filtros `estado`, `asesor`, `semaforo`, `desde` y `hasta`, todos combinables y opcionales.
  - Proyección de listado propia (`ILeadListItemResponse`), distinta del detalle: la tabla no
    necesita el `origen` completo pero sí el semáforo, el resumen y el `ultimoMensajeAt`, que el
    detalle de HU-CRM-01 no trae.
  - Hidratación **en lote** del responsable, del semáforo y del resumen: una consulta por
    colección y página, nunca N+1 ni `populate`.
  - Tres índices nuevos sobre `leads` para que el orden y los filtros no recorran la colección
    entera.
- **Frontend**
  - Página `/leads` con la tabla, sus filtros y su paginación, en el menú lateral (Operación).
  - Barra de filtros con estado, semáforo, responsable y rango de fechas por presets, con el estado
    **en la URL** para que la vista se comparta y sobreviva al refresco.
  - `Sheet` de detalle con los datos clave, el resumen IA y el enlace a la conversación.
  - Enlace profundo `?conversacion=<clienteId>` en la bandeja, que es lo que hace real ese enlace.
- **Documentación**
  - `docs/api-contract.md`: el endpoint y sus query params.
  - `docs/data-model.md`: los índices nuevos de `leads`.
  - `docs/specs/HU-CRM-01-…/spec.md`: corregir la referencia obsoleta a `HU-CRM-02` (deuda que la
    propia spec de HU-CRM-02 dejó anotada).

Fuera de alcance (otros features / fases):

- Editar el lead y **la transición de su `estado`** (`PATCH /api/leads/:id`) → `HU-CRM-04`.
- Sincronizar `Lead.estado` con `Cliente.estadoComercial`, que HU-CRM-01 dejó explícitamente
  desacoplados → `HU-CRM-04`.
- Métricas y reportes de conversión → `CRM-05`.
- Exportar el listado a CSV, y las acciones en lote sobre la selección.
- Búsqueda por texto libre (nombre / teléfono): no está en los criterios de la historia.
- Tablero Kanban y drag&drop: descartados por producto (`docs/product.md` §5).

## Criterios de aceptación

1. `GET /api/leads` devuelve los leads **del tenant del token**, paginados con la forma canónica
   `{ data, page, limit, total }` (`docs/api-contract.md` §5), ordenados por `createdAt`
   descendente. `page` por defecto 1, `limit` por defecto 20 y como máximo 100; un `limit` mayor
   → `400`.
2. Cada elemento del listado trae **datos clave y referencias ya resueltas, no ids sueltos**:
   `nombre`, `telefono`, `correo`, `estado`, `responsable { id, nombre }`, `semaforo` (la etiqueta
   completa con su color), `resumen { texto, generadoAt, desactualizado }`, `ultimoMensajeAt`,
   `conversacionId` y `createdAt`. Lo que la tabla no puede pintar, no viaja.
3. `?estado=` y `?asesor=` acotan por `estado` y por `responsableId`. `?desde=` y `?hasta=` acotan
   por `createdAt`, y **`hasta` es inclusive**: un lead creado hoy a las 18:00 entra en
   `?hasta=<hoy>`. `desde` posterior a `hasta` → `400`. Todos los filtros son combinables y el
   `total` refleja el filtro aplicado, no el total del tenant.
4. `?semaforo=verde|naranja|rojo|azul` filtra por la etiqueta de sistema de la **conversación** del
   lead, resuelta **por slug y nunca por nombre** (el administrador puede renombrarla). Si esa
   etiqueta **no existe en el tenant** —porque la borró— el listado responde una **página vacía**,
   no un `500` ni el listado sin filtrar.
5. El resumen se hidrata desde `Cliente.resumenIA` reutilizando la regla ya existente de
   `desactualizado`; un lead cuya conversación nunca generó resumen devuelve `resumen: null`, y eso
   no rompe la fila.
6. El listado **no hace N+1 ni usa `populate`**: responsables, etiquetas y clientes de la página se
   resuelven en una consulta por colección, con los helpers en lote que ya existen
   (`findUsersByIds`, `findTagsByIds`).
7. **UI:** `/leads` está en el menú (Operación), protegida por `RequireRole(['admin'])`, y muestra
   la tabla con **los cuatro estados resueltos**: cargando (skeleton), error con "Reintentar",
   vacío inicial y **vacío por filtros** — que es un mensaje distinto y ofrece limpiar los filtros.
   Confundir los dos vacíos le hace creer al administrador que no tiene leads.
8. **UI:** los filtros viven en la **URL** (`useSearchParams`). Cambiar cualquiera devuelve la
   paginación a la página 1 —seguir en la página 5 de un listado que ahora tiene 2 es un callejón
   sin salida— y recargar el navegador reconstruye exactamente la misma vista.
9. **UI:** hacer clic en una fila abre un `Sheet` con el detalle del lead, su origen y el resumen
   IA, marcando visiblemente cuando está **desactualizado**. Si no hay resumen, el panel explica
   cómo se genera en vez de dejar un hueco. La fila es alcanzable y accionable **por teclado**.
10. **UI:** el `Sheet` ofrece "Abrir conversación", que lleva a la bandeja con esa conversación ya
    seleccionada (`/inbox?conversacion=<clienteId>`). Sin ese enlace profundo el criterio de la
    historia —"acceso a su conversación"— quedaría en un botón que solo abre la bandeja.
11. **UI:** los colores del semáforo salen del `Tag` que devuelve la API, nunca hardcodeados, y la
    vista queda prolija en **claro y oscuro** con los tokens semánticos. A ancho móvil la tabla
    scrollea en su propio contenedor: el `body` nunca scrollea en horizontal.
12. **Aislamiento multi-tenant:** el listado del tenant B **no devuelve ni cuenta** ningún lead del
    tenant A, con filtros o sin ellos; un `?asesor=` con el userId de otro tenant devuelve página
    vacía, nunca datos ajenos; y el filtro por semáforo no arrastra clientes de otro tenant al
    resolver la etiqueta. **Test de aislamiento en verde** para los cuatro casos.
13. `pnpm --filter @sofiapp/api typecheck` y `test` en verde; `pnpm --filter @sofiapp/web build`,
    `lint` y `test` sin errores.

## Nota: HU-CRM-04 supersede la parte del semáforo

Los criterios **2, 4 y 6** de arriba describen el semáforo como una etiqueta de la
**conversación** (`Cliente.tagIds`), hidratada en lote con `findTagsByIds` y filtrada pasando
por el cliente. **HU-CRM-04 lo cambió**: el semáforo pasó a ser un campo del lead
(`Lead.semaforo`) resuelto contra un catálogo por tenant (`semaforos`), el listado devuelve
`semaforo` (uno) en lugar de `semaforos` (varios), y `?semaforo=` filtra por un campo indexado
en vez de por dos consultas encadenadas. Lo demás de esta spec sigue vigente.

## Nota sobre la proyección de listado

Se añade `ILeadListItemResponse` en vez de reutilizar el `ILeadResponse` de HU-CRM-01. No es
duplicación: son dos preguntas distintas.

- `ILeadResponse` responde "cuéntame todo de **este** lead": incluye `origen.convertidoPor` y el
  `contacto` resuelto, y se paga una vez.
- `ILeadListItemResponse` responde "dame **veinte** leads que pueda escanear": necesita el semáforo,
  el resumen y el `ultimoMensajeAt` —que el detalle no trae— y no necesita el origen completo, que
  costaría una resolución de usuarios extra por página para pintar algo que la tabla no muestra.

Servir el detalle completo en el listado haría el endpoint más caro para mostrar menos.

## Nota sobre el orden fijo

El listado ordena siempre por `createdAt` descendente y **no** acepta `?sort=`. La historia no lo
pide, y cada orden nuevo es un índice nuevo: mejor añadirlos cuando se sepa cuáles se usan de
verdad. `docs/api-contract.md` §5 contempla `sort` como convención general, no como obligación de
cada endpoint.

## Dependencias

- `INF-02` — repositorio tenant-safe (`*Scoped`) y `requireTenant`.
- `AUTH-01` / `AUTH-02` — `tenantId` y `rol` en el token; `authorize(['admin'])`.
- `HU-CRM-01` — el feature `lead`, la colección `leads` y su modelo. Esta historia lo extiende.
- `HU-OMNI-01` — la bandeja, a la que enlaza el detalle, y el feature `cliente`.
- `HU-OMNI-02` — `findUsersByIds`, el patrón de hidratación en lote que reutiliza el listado.
- `HU-OMNI-03` — `Cliente.resumenIA` y `toResumenResponse`, de donde sale el resumen.
- `HU-OMNI-04` — las etiquetas de semáforo (`Tag.semaforo`) y `findTagsByIds`.
- `DSN-03` — UI kit shadcn (`table`, `select`, `sheet`, `badge`, `skeleton`, `button`, `input`).
