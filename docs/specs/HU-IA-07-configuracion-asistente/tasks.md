# HU-IA-07 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde.
>
> Se trabaja **sobre `feat/HU-IA-01`**, sin rama nueva. No ejecutar `git checkout -b`.
>
> El orden no es el de las cinco modificaciones del enunciado, es el de las dependencias:
> `aggregateScoped` (§1) primero porque de él cuelgan las modificaciones 4 y 5; el borrado del
> frontend (§2) va suelto y temprano porque no depende de nada; luego el handoff de dentro hacia
> fuera (§3-§8), y el frontend al final (§9-§12), cuando el backend ya responde.
>
> **No hay slice nuevo ni colección nueva.** Todo son ampliaciones sobre `features/ai/`,
> `features/cliente/`, `features/conversation/` y dos features del frontend.

## 1. El repositorio gana la agregación (`repositories/base.repository.ts`)

> Va primero y solo. Es el archivo que sostiene la regla número uno del proyecto, así que sus tests
> entran **antes** de que exista el primer llamador.

- [x] `aggregateScoped<R>(model, tenantId, pipeline)`: antepone `{ $match: { tenantId } }` al
      pipeline recibido.
  - [x] **El `$match` del tenant va PRIMERO y el pipeline del llamador después**, nunca al revés: así
        un `$match` propio no puede ampliar el conjunto, solo reducirlo.
  - [x] **`new Types.ObjectId(tenantId)` dentro del helper.** `find` castea el filtro contra el
        schema; un pipeline de agregación **no**. Un `tenantId` string devolvería `[]` sin error:
        falla cerrado, pero en silencio. Comentarlo en el archivo — es el hueco 5 del spec.
- [x] `base.repository.test.ts`: los dos invariantes.
  - [x] Un pipeline con su propio `$match` **no** ve documentos de otro tenant (AC19).
  - [x] El mismo id como `string` y como `ObjectId` devuelven lo mismo (AC19).
- [x] `docs/multi-tenancy.md`: `aggregateScoped` en la lista de funciones del repositorio.

## 2. Quitar «Así lo recibe el modelo» (`features/ai-assistant/`)

- [x] **Borrar** `components/SystemPromptPreview.tsx` entero.
  - [x] **El archivo, no solo su uso**: es un `export` con un único consumidor, así que dejarlo sería
        código muerto que el lint no marca.
- [x] `AssistantConfigForm.tsx`: quitar el import (L7) y el render (L93). Nada más.
- [x] `AssistantConfigPage.test.tsx`: quitar el test `la vista previa refleja en vivo…` (L108-118) y
      la mención de la cabecera (L3).
- [x] Comprobar que los otros siete tests de esa página siguen pasando sin tocarlos (AC2).

## 3. Los tipos del handoff (`features/ai/ai-handoff.types.ts`)

- [x] `MOTIVOS_HANDOFF` gana `'custom'`, entre `'keyword'` y `'low_confidence'` — el array **es** el
      orden de prioridad, así que la posición no es cosmética.
- [x] `ICondicionExtra { key, nombre, activa, palabras }`.
  - [x] **Sin discriminante `tipo` todavía**: hoy solo hay uno. Dejar dicho en el comentario que la
        forma admite ganarlo sin migrar, y que cada tipo nuevo es un evaluador nuevo en el worker.
  - [x] **`key` derivada del nombre al crearla y estable al renombrar.** Molde: `contact_options.key`
        y `Cliente.atributos.key`.
- [x] `EstrategiaDestino = 'primero' | 'menor_carga' | 'fijo'`.
- [x] `IHandoffSettings` y `HandoffSettingsDTO` ganan `condicionesExtras` y `estrategiaDestino`.
- [x] `HandoffDecision` gana `condicion?: { key, nombre }` en la rama `dispara: true`.
  - [x] **Un solo motivo `custom`, no un motivo por condición:** `HandoffMotivo` lo consumen
        `Cliente.handoffMotivo`, la auditoría, el DTO de la bandeja y `MOTIVO_LABEL`; una unión
        abierta haría que ese `Record` dejara de ser exhaustivo y el compilador dejaría de avisar.

## 4. El modelo (`features/ai/ai-handoff.model.ts`)

- [x] `condicionesExtras`: array de subdocumentos con **`_id: false`**, `default: []`.
  - [x] Sin `_id` porque la identidad es la `key`; un `_id` de Mongo sería un segundo identificador
        que nadie usa y que el DTO tendría que ocultar. Igual que `semaforoIA` y `atributos`.
- [x] `estrategiaDestino`: `enum` de los tres valores, `default: 'primero'`.
- [x] **Ningún índice nuevo.** El único de esta colección sigue siendo `{ tenantId }` único.
- [x] **Ningún script de migración**, y comprobarlo: `toDTO` rellena
      `condicionesExtras ?? []` y `estrategiaDestino ?? (asesorDestinoId ? 'fijo' : 'primero')`.

## 5. La validación (`features/ai/ai-handoff.validation.ts`)

- [x] `condicionExtra`: `key` (slug, máx. 40), `nombre` (2..40 tras `trim`), `activa`, `palabras`.
  - [x] `palabras` reutiliza `listaTerminos` **y le añade `.min(1)`**: una condición sin palabras no
        puede dispararse nunca, así que guardarla dejaría al admin creyendo que configuró algo. Mismo
        criterio que el umbral de `lowConfidence`.
- [x] `condicionesExtras`: array `.max(10)` con `superRefine` que rechaza `key` repetida y nombre
      repetido **normalizado** (sin mayúsculas ni tildes), con la ruta del error por índice. Molde
      exacto: `atributosSchema` en `cliente.validation.ts`.
  - [x] **Máximo 10 y no más**: cada condición es una tarjeta en una página que ya tiene cuatro.
- [x] `estrategiaDestino: z.enum([...])` en el cuerpo del `PUT`.
- [x] `superRefine` de coherencia: `'fijo'` exige `asesorDestinoId`; cualquier otra estrategia lo
      exige `null` (AC15).
  - [x] **En el borde, no en el servicio**: un cuerpo con estrategia `menor_carga` y un asesor puesto
        describe dos destinos a la vez. Es una petición mal formada, no una regla de negocio.

## 6. El motor de evaluación (`features/ai/ai-handoff.service.ts`)

- [x] `settingsDeFabrica()` añade `condicionesExtras: []` y `estrategiaDestino: 'primero'`.
      `REGLAS_DE_FABRICA` **no** cambia.
- [x] `toDTO` deriva los dos campos para los documentos guardados antes de esta historia (AC12).
- [x] `evaluarAntesDeGenerar`: bucle sobre `condicionesExtras` **después** de `keyword`, saltando las
      apagadas, devolviendo `{ dispara: true, motivo: 'custom', condicion: { key, nombre } }`.
  - [x] **Reutilizar `algunTermino`, no copiarla** (AC8): es la que garantiza palabra completa sin
        mayúsculas ni tildes. Una copia dejaría que las condiciones del admin se comportaran distinto
        de las de fábrica ante «asesoría» vs «asesor».
  - [x] **Después de las dos fijas de texto y antes de las dos caras.** Delante de `lowConfidence` e
        `intentPurchase` porque son gratis —no llaman al modelo— y detrás de `explicitRequest` y
        `keyword` porque la prioridad entre las de fábrica la fija el producto (`ai-handoff.types.ts:4-9`).

## 7. El reparto por carga (`features/ai/ai-handoff.service.ts` + `conversation.service.ts`)

- [x] `const ESTADOS_ACTIVOS = ['nuevo', 'en_gestion', 'pago_pendiente'] as const`, con el porqué:
      `pagado` y `perdido` son cierres en `docs/domain.md` §3.
  - [x] **Una sola definición** para el reparto y para el dashboard: si divergen, el modal enseñaría
        un número distinto del que decide.
- [x] `cargaPorAsesor(tenantId)` → `Map<string, number>` con **una** llamada a `aggregateScoped`
      (`$match` de estados + `$group` por `asesorId`).
  - [x] Se apoya en `{ tenantId, asesorId }` y `{ tenantId, estadoComercial }`, ya existentes.
- [x] `asesorConMenorCarga(tenantId)`: recorre `listTenantUsers({ rol:'admin', activo:true })` —que ya
      viene ordenado por nombre— y devuelve el de menor cuenta.
  - [x] **Empate → el primero por nombre** (AC16): el reparto tiene que poder explicársele a quien
        pregunte por qué le llegó a él, y un desempate aleatorio no se puede explicar.
  - [x] Un admin sin conversaciones cuenta **0** y por tanto gana: es a quien queremos mandarle la
        siguiente.
- [x] `resolverDestino(tenantId, estrategia, asesorDestinoId)` en `conversation.service.ts`, con la
      cascada: `fijo` → `menor_carga` → `primerAdminActivo` → `null`.
  - [x] `menor_carga` dentro de `try/catch`: si el agregado falla, `logger.warn` y **se sigue** (AC18).
        Un handoff que no asigna es un cliente esperando; uno que asigna al primero en vez de al de
        menos carga es solo un reparto subóptimo.
- [x] Los llamadores de `resolverDestino` / `handoffConversation` pasan la estrategia del settings.

## 8. El motivo llega a la bandeja (`features/cliente/` + `features/conversation/` + worker)

- [x] `cliente.types.ts` / `cliente.model.ts`: `handoffCondicion: { key, nombre } | null`, subdoc con
      `_id: false`, `default: null`.
  - [x] **Se guarda el NOMBRE, no solo la clave** (AC11): el banner no puede leer la configuración de
        handoff para pintar una línea, y si el admin renombra o borra la condición, esa conversación
        debe seguir diciendo por qué se transfirió **entonces**. Mismo criterio que `lead.delete`.
- [x] Añadirlo al `$unset` que ya limpia `handoffAt`/`handoffMotivo` al reactivar a Sofi
      (`conversation.service.ts:435`).
- [x] `handoffConversation` acepta y escribe la condición; el `despues` de la auditoría la arrastra.
  - [x] **Sin acción de auditoría nueva**: sigue siendo `conversation.handoff`, el mismo hecho.
- [x] `ai-reply.processor.ts`: `ejecutarHandoff` pasa `decision.condicion` hasta `handoffConversation`.
- [x] `conversation.types.ts` / `conversation.mapper.ts`: el DTO `handoff` gana `condicion`.

## 9. Exposición HTTP de las métricas (`features/ai/`)

- [x] `AsesorMetricasDTO { asesorId, nombre, activas, porEstado }` en `ai-handoff.types.ts`.
- [x] `metricasPorAsesor(tenantId)` en el service: parte de los **admins activos** y rellena desde el
      agregado.
  - [x] **Fila también para los que tienen cero** (AC20): un asesor sin trabajo asignado es justo el
        que hay que ver.
  - [x] **Solo admins activos**: un usuario desactivado no puede recibir conversaciones, listarlo
        sería ofrecer un destino imposible.
  - [x] `porEstado` trae los cinco estados, con 0 donde no haya nada — que la UI no tenga que
        distinguir «cero» de «ausente».
- [x] `ai-handoff.validation.ts`: schema sin cuerpo, params ni query.
- [x] `ai-handoff.controller.ts`: `tenantId` del token, sin `try/catch`, sin lógica.
- [x] `ai-handoff.routes.ts`: `GET /asesores/metricas` con la cadena fija
      `authenticateJWT · requireTenant · handoffRoles · validate · asyncHandler`.
  - [x] Misma ruta y mismos roles que la configuración que se está editando: es información **para**
        decidir el destino, no un módulo de reportes. Cuando exista CRM-04, esto se mueve allí.

## 10. Frontend — datos (`features/handoff/`)

- [x] `types.ts`: `CondicionExtra`, `EstrategiaDestino`, `AsesorMetricasDTO`; `HandoffSettings` gana
      los dos campos; `HandoffMotivo` gana `'custom'`.
- [x] `MOTIVO_LABEL` gana `custom: 'Cumplió una de tus condiciones'`.
  - [x] Es el fallback para una conversación transferida antes de que el nombre se guardara, y lo que
        mantiene el `Record` exhaustivo.
- [x] `api.ts`: `fetchAsesorMetricas()` → `GET /ai/handoff-rules/asesores/metricas`.
  - [x] **Ruta SIN el prefijo `/api`** (lo aporta el `baseURL`). Es el bug de HU-OMNI-02.
- [x] `hooks/useAsesorMetricas.ts`: `enabled: abierto`, `staleTime: 0`.
  - [x] Cada apertura vuelve a pedir: los datos cambian con cada handoff, y leer una foto de hace
        media hora para decidir el reparto de ahora sería peor que no enseñarla.
- [x] `index.ts`: exports nuevos.

## 11. Frontend — las condiciones extra

> Antes de escribir cada componente, invocar las tres skills de diseño (regla §7) y anotar el resultado.

- [x] Invocar `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`.
      **En este entorno solo la tercera está registrada**; las otras dos devuelven `Unknown skill`.
      Se aplican igualmente sus criterios desde conocimiento propio, como en HU-IA-04/05/06.
- [x] `TriggerCard` gana `acciones?: React.ReactNode` a la derecha del interruptor.
  - [x] **Un slot, no un componente bifurcado**: una condición extra **es** un disparador, solo que
        además se puede editar y borrar.
- [x] `CondicionDialog.tsx`: `Dialog` de shadcn con nombre + `TermList`.
  - [x] **`TermList` se reutiliza tal cual**: ya resuelve chips, Enter, duplicados y el tope de 30.
        Un segundo editor de listas sería inconsistencia visual, no una decisión de diseño.
  - [x] La `key` se deriva con `slugificar` (el de `ContactEditDialog`) **solo al crear**; al editar
        viaja intacta, y el campo nombre lo advierte.
  - [x] Sirve para crear y para editar: cambian el título y el verbo del botón.
  - [x] **No guarda contra el servidor**: devuelve la condición al formulario y se persiste con el
        `Guardar cambios` que ya existe. Guardar por su cuenta rompería el «Descartar cambios».
- [x] `HandoffSettingsForm.tsx`: pinta una `TriggerCard` por condición extra, con editar y eliminar,
      y el botón «Añadir condición» al final de «Cuándo transferir».
- [x] La validación de guardado (`listasNoVacias`) cubre también las condiciones extra encendidas.
- [x] `HandoffBanner.tsx`: si llega `condicion`, pinta su `nombre`; si no, `MOTIVO_LABEL[motivo]`.
- [x] Tokens semánticos, claro y oscuro, cero `bg-[#...]`.

## 12. Frontend — el título, la estrategia y el modal de asignación

- [x] `HandoffSettingsForm.tsx:241`: «Qué pasa al transferir» → **«Asignación y aviso»**. Conservar la
      sub-línea: con el título más corto es la que explica, y ya está en los términos del admin.
- [x] El `Select` de «Asesor que la recibe» pasa a tres opciones: `__primero__`, `__menor_carga__` y
      los ids de usuario; el `onValueChange` fija `estrategiaDestino` **y** `asesorDestinoId` juntos.
  - [x] Copy: «El primero del equipo» (y la ayuda pasa a decir que es por orden alfabético — hoy no lo
        dice y es información que cambia la decisión) y «Quien tenga menos conversaciones activas».
  - [x] **No «menor carga»**: se nombra la misma unidad que el admin acaba de ver en el modal.
- [x] `CargaBar.tsx`: barra proporcional **al máximo**, `bg-primary` sobre `bg-muted`, `aria-hidden`.
  - [x] **Proporcional al máximo y no al total**: la pregunta es comparativa entre asesores; contra el
        total, con diez asesores todas las barras serían igual de cortas.
  - [x] **Decorativa**: el valor accesible es el número de al lado, no la longitud de un `div`.
- [x] `AsignacionDialog.tsx`: `Table` de shadcn, ordenada por `activas` **descendente**.
  - [x] El orden es información: quien abre esto busca al saturado, y ponerlo primero es la respuesta.
  - [x] **La barra codifica solo `activas`.** Resultado de la pasada de diseño: la barra apilada por
        estado se descartó porque (a) no hay cinco tokens de color accesibles en el proyecto y
        `tagColors` es para colores de base de datos, y (b) la pregunta del modal es «quién está más
        cargado», que es una sola variable.
  - [x] `pagado` en su propia columna al final, separada de la cartera viva: es la única métrica de
        desempeño y mezclarla invitaría a sumarlas.
  - [x] Se dice que son **totales, sin rango**: `estadoComercial` no guarda fecha de cierre, y callarlo
        dejaría leer «31 pagadas» como «este mes».
  - [x] Tres estados: cargando (`Skeleton` con la forma de la tabla, `aria-busy`), vacío («Todavía no
        hay asesores activos…» + qué hacer) y error (`role="alert"` + «Reintentar») (AC22).
  - [x] **Cero dependencias nuevas** en `package.json` (AC21).
- [x] Botón «Ver asignación» (`variant="outline" size="sm"`) junto al `Select`, en la misma fila.

## 13. Documentación

- [x] `docs/data-model.md`: `handoff_settings.condicionesExtras` y `estrategiaDestino`;
      `clientes.handoffCondicion` con la nota de que el nombre se denormaliza **a propósito**.
- [x] `docs/api-contract.md` §6: `GET /api/ai/handoff-rules/asesores/metricas` y el cuerpo ampliado
      del `PUT`, con sus `400`.
- [x] `docs/domain.md`: la prioridad de los disparadores con las condiciones extra dentro.
- [x] `docs/multi-tenancy.md`: `aggregateScoped` en la lista del repositorio y como regla 3bis.
- [x] **Extra no planeado:** `listConversations` tenia la unica agregacion cruda del proyecto, con
      un comentario que decia «no hay helper de aggregate scoped». Migrada a `aggregateScoped` y
      comentario corregido: dejarlo habria sido documentacion falsa a partir de esta HU.

## Tests (Vitest)

Backend, `apps/backend/src/`:

- [x] `repositories/base.repository.test.ts`: los dos invariantes de `aggregateScoped` (AC19).
- [x] `features/ai/ai-handoff.service.test.ts`:
  - [x] Una condición extra encendida dispara con `motivo: 'custom'` y devuelve `{ key, nombre }` (AC6).
  - [x] **Sin llamar al modelo**: el doble de `AIService` no recibe ninguna llamada (AC6).
  - [x] Apagada no dispara; con el interruptor maestro apagado, ninguna (AC9).
  - [x] Prioridad completa en un mensaje que cumple varias a la vez: gana la fija (AC7).
  - [x] Coincidencia por palabra completa: «facturación» no activa la palabra «factura» (AC8).
  - [x] `toDTO` sobre un documento **sin** los campos nuevos devuelve `[]` y la estrategia derivada,
        y el comportamiento es idéntico al anterior (AC12).
  - [x] `asesorConMenorCarga` elige al de menos, y en empate al primero por nombre (AC16).
  - [x] Cuentan `nuevo`/`en_gestion`/`pago_pendiente`; no cuentan `pagado`/`perdido` (AC17).
  - [x] Sin admins activos → `null`, sin lanzar (AC18).
- [x] `features/ai/ai-handoff.metricas.test.ts` (crear):
  - [x] Una fila por admin activo, incluidos los de cero; los desactivados no aparecen (AC20).
  - [x] `activas` coincide con la suma de los tres estados vivos (AC17).
  - [x] **Aislamiento**: las conversaciones de tenantB no suman en las métricas de tenantA (AC23).
- [x] `features/ai/ai-handoff.routes.test.ts`:
  - [x] El `PUT` acepta `condicionesExtras` y `estrategiaDestino` y los devuelve.
  - [x] `400` con nombre corto, sin palabras, `key` repetida, nombre repetido o más de 10 (AC5).
  - [x] `400` con `'fijo'` sin asesor y con `'menor_carga'` + asesor (AC15).
  - [x] La `key` no cambia al renombrar la condición (AC4).
- [x] `features/ai/ai-handoff.isolation.test.ts`: el endpoint de métricas con token de otro tenant; el
      `PUT` con un `asesorDestinoId` ajeno sigue respondiendo `404` (AC23).
- [x] `features/conversation/`: `resolverDestino` con `'menor_carga'` asigna al de menos carga, y ante
      un fallo del agregado cae a `primerAdminActivo` sin lanzar (AC16, AC18).
- [x] `workers/ai-reply.processor.test.ts`: un handoff por condición extra guarda
      `handoffCondicion` en el `Cliente` (AC10).

Frontend, `apps/frontend/src/features/`:

- [x] `ai-assistant/pages/AssistantConfigPage.test.tsx`: sin el test de la vista previa; los otros
      siete siguen en verde (AC1, AC2).
- [x] `handoff/components/HandoffSettingsForm.test.tsx` (crear):
  - [x] «Añadir condición» abre el modal y la condición creada aparece como tarjeta (AC3).
  - [x] La sección se titula «Asignación y aviso» (AC13).
  - [x] El `Select` ofrece las tres opciones y guardar «menos conversaciones activas» envía
        `estrategiaDestino: 'menor_carga'` con `asesorDestinoId: null` (AC14).
- [x] `handoff/components/AsignacionDialog.test.tsx` (crear): tabla ordenada por activas descendente;
      los tres estados de carga/vacío/error (AC22).
- [x] `inbox/`: `HandoffBanner` pinta el nombre de la condición cuando llega, y `MOTIVO_LABEL` cuando
      no (AC10).

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` en verde.
- [x] `pnpm --filter @sofiapp/api test` en verde: **850 pasan, 86 archivos** (eran 808 en 85).
- [x] `pnpm --filter @sofiapp/web build` en verde.
- [x] `pnpm --filter @sofiapp/web lint` en verde, **sin imports ni exports sin usar** (AC1).
- [x] `pnpm --filter @sofiapp/web test` en verde: **570 pasan, 34 archivos** (eran 556 en 32).
- [x] `git diff apps/frontend/package.json` vacío: **ninguna dependencia de gráficos** (AC21).
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 completo, con atención especial a
      `aggregateScoped`.
- [x] Repaso cruzado spec ↔ tests: los 25 criterios de aceptación tienen su verificación.
- [x] Cero `any` y tipos de retorno explícitos en todo lo exportado.
- [x] `git status` sin `*.png`/`*.jpg` colados.
- [x] `spec.md` pasa a `**Estado:** implementado`.

### Manual (tenant real, transferencia encendida)

- [ ] Crear «Facturación» con `factura`, `recibo`, `nit`; guardar; recargar y comprobar que persiste.
- [ ] Escribir «necesito la factura» por WhatsApp → se transfiere y el banner dice «facturación».
- [ ] Renombrar la condición a «Cobros» → esa conversación **sigue** diciendo «facturación».
- [ ] «Ver asignación» con tres admins de carteras distintas: el más cargado arriba, barra más larga.
- [ ] Cambiar a «Quien tenga menos conversaciones activas», guardar y provocar un handoff → llega al
      de la barra más corta.
- [ ] Desactivar a ese asesor y repetir → llega a otro, sin error en el log.
- [ ] Un tenant sin configuración guardada: abre en fábrica, sin condiciones extra y con «El primero
      del equipo».
- [ ] Los dos modales, en claro y oscuro, y navegables solo con teclado.

> **Pendientes, y por que.** El bloque manual exige un tenant real con WhatsApp conectado, Redis y
> un worker vivo: nada de eso existe en este entorno, asi que queda sin marcar en vez de darlo por
> bueno. Lo que si esta cubierto por tests automaticos es cada regla que ese bloque comprobaria a
> mano — la prioridad de los disparadores, el nombre grabado de la condicion, el desempate del
> reparto, la derivacion sin migracion y los dos invariantes de `aggregateScoped`.

## Definición de "hecho"

Un admin puede escribir sus propias condiciones de transferencia con el nombre que usa su empresa, y
cuando una de ellas transfiere, la bandeja dice ese nombre — y lo sigue diciendo aunque la condición
se renombre después. Puede ver de un vistazo quién está cargado y quién no, y elegir que Sofi reparta
por eso en vez de por orden alfabético. Un tenant que no abra esta pantalla se comporta exactamente
igual que antes. Y ninguna de las consultas nuevas puede ver una conversación de otra empresa.
