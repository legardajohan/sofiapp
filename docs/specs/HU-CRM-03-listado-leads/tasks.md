# HU-CRM-03 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Rama: `feat/HU-CRM-03`, sacada de `origin/develop` (que ya trae HU-CRM-01).

## Implementación — Backend

> Se **extiende** el feature `lead` de HU-CRM-01. No hay colección ni feature nuevos, y `app.ts`
> no se toca. Orden del patrón de 6 archivos: `types → model → validation → service → controller
> → routes`.

- [x] `lead.types.ts`: añadir `ListLeadsQuery` e `ILeadListItemResponse`, importando `SemaforoSlug`
      e `ITagResponse` de `tag.types.js` y `IResumenResponse` de `cliente.types.js`.
- [x] `lead.model.ts`: añadir los tres índices `{ tenantId, createdAt: -1 }`,
      `{ tenantId, estado, createdAt: -1 }` y `{ tenantId, responsableId, createdAt: -1 }`.
- [x] `lead.validation.ts`: `listLeadsSchema` con `page`/`limit`/`estado`/`asesor`/`semaforo`/
      `desde`/`hasta` y el `.refine` que rechaza el rango invertido. Exportar el tipo inferido.
- [x] `lead.service.ts`: `buildLeadFilter` (privada), `aplicarFiltroSemaforo` (privada) y
      `listLeads` exportada.
      _Añadido sobre el plan:_ `toResumenResponse` se movió de `cliente.service.ts` a un
      `cliente.mapper.ts` nuevo (re-exportado desde el service para no romper a nadie). El plan
      lo importaba del service, pero `cliente.service` ya importa `findLeadIdsByClientes` de
      `lead.service`: habría cerrado un ciclo de imports en tiempo de ejecución. Reutilizar `findUsersByIds`, `findTagsByIds` y `toResumenResponse`;
      cero `populate`, cero `aggregate`, todo por `*Scoped`.
- [x] `lead.controller.ts`: `listLeadsController`, leyendo `req.validatedQuery` (no `req.query`).
- [x] `lead.routes.ts`: `router.get('/', …)` con la cadena completa, registrado antes de `/:id`.

## Implementación — Frontend

> Antes de escribir cualquier componente: skills de diseño (`emil-design-eng`,
> `frontend-design`). `impeccable:impeccable` no está instalado en este entorno — queda anotado.
> Usar los primitivos de `src/components/ui/`; no reinventar controles a mano.

- [x] `features/leads/types.ts`: `LeadListItemDTO`, `LeadsFiltros`, `SemaforoSlug`, `Paginated<T>`.
- [x] `features/leads/api.ts`: `fetchLeads(filtros)` → `GET /leads` (sin el prefijo `/api`).
- [x] `features/leads/hooks/useLeads.ts`: `useQuery(['leads', filtros])` con `keepPreviousData`.
- [x] `features/leads/useLeadsStore.ts`: `selectedId` + `select(id)`. Solo UI.
- [x] `features/leads/lib/format.ts`: `ESTADO_LABEL`, `RANGOS_FECHA` (presets) y formateo de fechas.
- [x] `features/leads/components/LeadsFilters.tsx`: estado · semáforo · responsable · rango, con
      "Limpiar filtros" cuando hay alguno activo.
- [x] `features/leads/components/LeadsTable.tsx`: tabla, los cuatro estados y la paginación.
- [x] `features/leads/components/LeadDetailSheet.tsx`: detalle + resumen + "Abrir conversación".
- [x] `features/leads/pages/LeadsPage.tsx`: filtros en la URL (`useSearchParams`), reset de página.
- [x] `features/leads/index.ts`: exportar `LeadsPage` y los tipos nuevos.
- [x] `router.tsx`: ruta `/leads` con `lazy` + `RequireRole(['admin'])` + `Suspense`.
- [x] `components/layout/nav-config.ts`: ítem "Leads" en el grupo Operación.
- [x] `features/inbox/pages/InboxPage.tsx`: leer `?conversacion=<clienteId>` y seleccionarla.

## Tests (Vitest)

### Aislamiento multi-tenant (obligatorio)

- [x] `listLeads(tenantB)` no devuelve ningún lead del tenant A, sin filtros y con ellos.
- [x] El `total` del tenant B no cuenta leads del tenant A.
- [x] `?asesor=<userId del tenant A>` desde el tenant B → página vacía, nunca datos ajenos.
- [x] `?semaforo=verde` desde el tenant B no arrastra clientes del tenant A por el `$in`.

### Casos funcionales (`lead.service.test.ts`)

- [x] Paginación: `page`, `limit` y `total` coherentes; la segunda página no repite la primera.
- [x] Orden por `createdAt` descendente.
- [x] Cada filtro por separado (`estado`, `asesor`, `semaforo`, `desde`, `hasta`) y combinados.
- [x] `hasta` es **inclusive**: un lead creado ese mismo día entra en el rango.
- [x] Semáforo cuya etiqueta no existe en el tenant → página vacía, sin excepción.
- [x] Conversación sin resumen → `resumen: null`; con mensajes posteriores → `desactualizado: true`.
- [x] `responsable` y `semaforo` llegan resueltos, no como ids.

### Contrato HTTP (`lead.routes.test.ts`)

- [x] `200` con la forma `{ data, page, limit, total }`.
- [x] `limit=999` → `400`; `semaforo=morado` → `400`; `desde > hasta` → `400`.
- [x] Sin cookie de sesión → `401`.

### Frontend

- [x] `LeadsTable.test.tsx`: cargando, error con "Reintentar", vacío inicial, vacío por filtros,
      filas pintadas y clic que selecciona.
- [x] `LeadsFilters.test.tsx`: cambiar un filtro lo escribe en la URL y resetea la página;
      "Limpiar filtros" los quita todos.
- [x] `LeadDetailSheet.test.tsx`: pinta el resumen, marca el desactualizado, y "Abrir conversación"
      enlaza a `/inbox?conversacion=…`.

## Añadido tras la revisión del usuario

### Semáforo: se veía una sola etiqueta

- [x] `lead.service.ts`: `.find()` → `.filter()`. Devolvía **solo la primera** etiqueta de semáforo
      y escondía el resto; que las cuatro sean excluyentes es una convención, no algo que el modelo
      imponga (`Cliente.tagIds` es un array).
- [x] `ILeadListItemResponse.semaforo` → `semaforos: ITagResponse[]`, **la aplicada más
      recientemente primero** (se invierte el orden de `tagIds`). Se renombró el campo a propósito
      para que el compilador marcara todos los consumidores.
      _Salvedad:_ `setConversationTags` reemplaza el conjunto entero, así que ese orden es el que
      mandó la UI, no un histórico real de cuándo se aplicó cada etiqueta.
- [x] `LeadsTable`: la celda pinta la principal y un `+N` que abre un **popover** con las demás
      (`ui/popover` instalado con la CLI de shadcn). El `+N` frena la propagación: sin eso abriría
      además el panel del lead, porque la fila entera es un botón.
- [x] Se descartó el carrusel dentro de la celda: con 20 filas serían 20 carruseles con controles
      diminutos, y obligaría a interactuar para leer un dato que se escanea.

### Estados: catálogo configurable por tenant

> El usuario pidió poder crear estados propios. Se advirtió que excede el alcance de HU-CRM-03
> (listado de solo lectura) y lo reafirmó, así que se implementó en esta rama.

- [x] Feature `estado` completo (6 archivos + montaje en `app.ts`), calcado del patrón de
      `contact-option`, que ya resolvió este mismo problema para la ficha del contacto.
- [x] `estados`: colección por tenant con `key` estable, `label`, `color`, `orden`, `activo`
      (archivado) y `esDefecto`. Índice único `{ tenantId, key }`.
- [x] `seed-estados.ts`: siembra los cinco de fábrica con **las claves exactas del enum anterior**,
      así que **no hace falta migrar ningún documento**. Con `backfillEstados()` en el arranque para
      los tenants que ya existían.
- [x] `Lead.estado` deja de tener `enum` en el schema: guarda el `key` y lo valida el service contra
      el catálogo del tenant.
- [x] `?estado=` deja de ser `z.enum`. Una clave que no está en el catálogo del tenant devuelve
      **página vacía**, no `400` — mismo criterio que el semáforo cuya etiqueta se borró, y cierra
      el paso a colar la clave de otra empresa.
- [x] Frontend: feature `estados` (`api`, `useEstados`, `useCreateEstado`), filtros alimentados por
      el catálogo (los archivados no se ofrecen) y `NuevoEstadoDialog` para dar de alta.
- [x] El color del estado sale del catálogo y pasa por `tagColors`, el mismo motor de contraste que
      los chips de etiqueta: un hex desafortunado sigue siendo legible en claro y en oscuro.
- [x] Tests: `estado.isolation.test.ts` (3) y `estado.service.test.ts` (8); en frontend, el filtro
      alimentado por catálogo y el archivado que no se ofrece.

### Asignar estado a un lead

> Cerraba el círculo: se podían crear estados pero no asignarlos a nada — no existía ningún
> `PATCH /api/leads/:id`. El spec lo dejaba para HU-CRM-04; se implementa aquí a petición expresa.

- [x] `PATCH /api/leads/:id` con `{ estado }`. Valida contra el **catálogo del tenant**: una clave
      desconocida es `400` y no un guardado silencioso — al revés que en el filtro del listado,
      donde solo significa "no hay nada que mostrar".
- [x] Auditoría `lead.update` con `antes`/`despues`: saber quién movió un lead a "pagado" —y
      cuándo— es justo lo que se pregunta cuando las cuentas no cuadran. Se añadió la acción a
      `AuditAccion`.
- [x] Cambiar al estado que ya tiene no escribe ni audita.
- [x] Test de aislamiento: el tenant B no puede mover un lead del tenant A → `404` y el lead
      **no se toca**.
- [x] UI: selector en el `Sheet` del lead, no un desplegable por fila — en la tabla serían veinte
      controles idénticos compitiendo por atención, y cambiar de etapa es una decisión sobre UN
      lead. Ofrece los activos más el propio del lead aunque esté archivado.
- [x] La mutación invalida `['leads']` en vez de parchear la fila: con un filtro por estado activo,
      un lead que deja de cumplirlo tiene que desaparecer y el `total` bajar.

### Eliminar, rango personalizado y vuelta desde la conversación

- [x] **Eliminar el lead** desde el panel, con icono `Trash2`. Reutiliza el `DeleteLeadDialog` y el
      `useDeleteLead` que ya existían de HU-CRM-02, así que sigue exigiendo motivo y confirmación.
      Discreto a propósito (`ghost` + color destructivo, no ancho completo): no debe competir con
      la acción real del panel. Al borrar se cierra el panel — mostrar un lead que ya no existe es
      un estado imposible.
- [x] `useDeleteLead` invalida además `['leads']`: le faltaba, así que el listado se quedaba con la
      fila borrada y el `total` sin bajar.
- [x] **"Personalizado" del rango de fechas: estaba muerto.** `cambiarRango('personalizado')`
      reemitía los mismos valores, y como el modo se deducía de las fechas (`fechasARango`), sin
      fechas puestas volvía a `'todo'` y los dos campos no llegaban a aparecer nunca. Ahora la
      elección se recuerda aparte y se suelta al elegir un preset o al limpiar filtros. Elegirlo
      **no emite** ningún cambio: hacerlo resetearía la paginación por un clic que aún no filtra.
- [x] **Vuelta de la conversación al lead.** "Abrir conversación" ahora lleva `?volverA=`, y la
      bandeja pinta un "Volver al lead" en la cabecera del hilo cuando ese parámetro llega. Se
      vuelve a la MISMA vista —mismos filtros, misma página— y con el lead reabierto vía `?lead=`,
      que `LeadsPage` lee con guard por id para que cerrar el panel no lo reabra en cada render.
- [x] `volverA` se valida como ruta **interna** (empieza por `/` y no por `//`): sale de la barra
      de direcciones, así que sin ese filtro cualquiera podría convertir el botón en un salto a un
      dominio ajeno.

## Documentación

- [x] `docs/api-contract.md` §6: fila de `GET /api/leads` con sus query params.
- [x] `docs/data-model.md`: los tres índices nuevos de `leads`.
- [x] `docs/specs/HU-CRM-01-…/spec.md`: corregir `HU-CRM-02` → `HU-CRM-03` en *Fuera de alcance*.

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde.
- [x] `pnpm --filter @sofiapp/web build` y `lint` sin errores; `test` de `src/features/leads` en verde.
      _Verificado:_ la suite **completa** de web (`pnpm --filter @sofiapp/web test`) muere con
      `RangeError: Maximum call stack size exceeded` en un bucle de `PromiseRejectCallback` (475k
      repeticiones, log de 72 MB) justo después de `PlanTable`. Se corrió `origin/develop` limpio
      en un worktree aparte: **falla igual**, así que es deuda previa, no regresión de HU-CRM-03.
      Los 12 tests de `LeadsTable`, los de `LeadsFilters` y los de `LeadDetailSheet` pasan al
      correrlos por separado. Queda pendiente diagnosticar el bucle (es infraestructura de vitest,
      no una aserción).
      _Corregido:_ una nota anterior daba por "pre-existentes en develop" 8 fallos en
      `conversation.tags.test.ts` y `tests/isolation/tag.isolation.test.ts`. Es falso: esos
      tests **pasan en develop y en esta rama**. Los fallos eran timeouts de 30s en `createTag`
      provocados por correr la suite con build/lint/tests compitiendo por CPU y disco; son
      tests sensibles al tiempo, no una regresión ni una deuda previa. Con la máquina libre la
      suite queda entera en verde (64 archivos, 555 tests, 129s frente a los 368s bajo carga).
      Si vuelven a fallar, no los des por rotos: repite la corrida sin nada más en paralelo.
- [x] Repaso visual en **claro y oscuro** y a ancho móvil; el `body` no scrollea en horizontal.
      _Hallazgos y arreglos:_ (1) `LeadsPage` duplicaba el padding — el `<main>` de `AppLayout`
      ya aplica `p-6` y la página añadía otro, 48px por lado (96px de 375px en móvil), a
      diferencia de sus hermanas `AiContextPage`/`KnowledgeFaqsPage`; se quitó el `p-6` de la
      página. (2) En `LeadDetailSheet` el `Correo` podía desbordar la ficha: un correo largo no
      tiene dónde partir y el `min-width: auto` por defecto de un item de grid lo sacaba fuera;
      se añadió `min-w-0` + `break-words`. Verificado además que todos los tokens usados
      (`foreground`, `muted-foreground`, `secondary-foreground`, `card`, `border`,
      `destructive`, `success`, `ring`) están definidos en `:root` **y** en `.dark`, y que el
      scroll horizontal queda contenido: `overflow-x-auto` en la tabla sobre un `<main
      className="min-w-0 …">`, que es lo que impide que el `body` scrollee.
- [x] Capturas de verificación borradas (`CLAUDE.md` → *Capturas de pantalla*); `git status` sin
      `*.png`/`*.jpg` colados.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado.
- [x] `spec.md` pasa a `**Estado:** implementado`.

## Definición de "hecho"

El administrador entra a `/leads` y ve la cartera completa de su empresa —y solo la de su empresa—
paginada y ordenada por lo más reciente. Puede acotarla por estado, semáforo, responsable y fecha,
con los filtros reflejados en la URL, y desde cualquier fila abrir el detalle con el resumen de la
conversación y saltar a esa conversación en la bandeja. El listado refleja con exactitud los leads
del tenant, y el test de aislamiento lo demuestra.
