# HU-FLOW-05 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Rama: `feat/HU-FLOW-05`.

## 0. Corrección del motor primero (criterios 1–2)

> Va primero porque es un bug en producción e independiente del resto: el test de regresión debe
> fallar **antes** del fix y pasar después.

- [x] Test de regresión en `flow.runtime.service.test.ts`: `kb → ia` en el mismo turno envía ambos
      mensajes en orden (falla con el código actual).
- [x] Test: `accion (aplicar_etiquetas) → ia` aplica la etiqueta.
- [x] Test: tope de 5 resoluciones con `requiere` pendiente → se ejecutan los efectos acumulados y el
      estado queda en el nodo pendiente.
- [x] `correrMotor`: acumular `efectos` de todas las rondas y ejecutar el acumulado.
- [x] `flow.types.ts`: `resueltos.capturaFallida`. `resolverRequiere('captura')` lo devuelve cuando
      no hay valor; el motor sigue esperando sin `requiere`.
- [x] Test: captura sin dato extraído → **una** llamada a `extract` en ese mensaje.

## 0b. Validación del grafo: forma / conexión / contenido (criterios 20–25)

> Va antes de la captura: el editor nuevo necesita `analizarGrafo`. Los tests de huérfano existentes
> cambian de significado (ver Notas del plan).

- [x] `packages/shared/src/flow-graph.ts`: `analizarGrafo`, `ErrorGrafo`, `CodigoErrorGrafo`; exportar en
      `index.ts`. Mensaje con `nombre` o id. Destinos vacíos no cuentan como entrada.
- [x] `flow-graph.ts`: reglas `CONTENIDO_INCOMPLETO` por tipo de nodo, con mensaje de qué falta.
- [x] `flow-graph.test.ts` (vive en `apps/backend`, no en shared: el test de consistencia necesita Zod): huérfano · destino vacío · destino inexistente · alcanzable solo desde una
      salida de `ia` (no huérfano) · usa el nombre en el mensaje · flujo sano → `[]` · cada regla de
      contenido · **consistencia con `configNodoEstricto`** (mismo veredicto sobre un set de configs).
- [x] `pnpm --filter @sofiapp/shared build` (el resto consume `dist`).
- [x] `flow.validation.ts`: conservar `configNodoEstricto`; crear `configNodoGuardable` relajado (vacíos
      y listas vacías permitidos, destinos `''`); `superRefine` solo con forma (ids repetidos,
      `entrada` existente); sin huérfanos ni destinos. `configPorDefecto` del editor debe guardarse tal cual.
- [x] `flow.service.ts`: `assertConfigsEstrictas` al activar o guardar un flujo ya activo.
- [x] `flow.service.ts`: `analizarGrafo`; activar con errores → `400 FLOW_CON_ERRORES` + `errores`;
      guardar un flujo **ya activo** con errores → `409 FLOW_ACTIVO_CON_ERRORES` sin `confirmarDesactivar`,
      y con `confirmarDesactivar: true` guarda inactivo y responde `desactivado: true`; con errores y sin activar → guarda `activo: false` y devuelve
      `advertencias`. `desactivarFlowActivo` solo tras validar.
- [x] `AppError` con `details`/código si hace falta; `flow.controller.ts` devuelve `advertencias`.
- [x] `flow.engine.ts`: `nodoDestino` vacío = fin del flujo (test).
- [x] Tests: `flow.validation.test.ts:43` («nodo huérfano → falla») y `flow.routes.test.ts:87`
      («grafo inválido → 400») reescritos: huérfano ⇒ **guarda con advertencia** y `400` solo al activar;
      el de `flow.validation.test.ts:169` (alcanzable solo desde `ia`) pasa a `flow-graph.test.ts`;
      nuevos: guardar con
      huérfano → `200` + advertencia y `activo: false`; nodo `ia` con objetivo vacío y sin salidas →
      `200` + `CONTENIDO_INCOMPLETO` y no activable; nodo recién creado (config por defecto) se guarda; activar con error → `400 FLOW_CON_ERRORES` y el
      flujo activo anterior sigue activo; guardar un flujo activo con error sin confirmar → `409` y
      nada cambia; con `confirmarDesactivar` → guardado, `activo: false`, y el motor deja de intervenir
      (responde Sofi); flujo legado
      válido sin cambios.

## 1. Catálogo `contact-field` (criterios 3–6)

- [x] `contact-field.types.ts`: `TIPOS_DATO_CAMPO`, `CAMPOS_FIJOS_CONTACTO`, `CLAVES_RESERVADAS`,
      `IContactField(Document)`, DTOs, `IContactFieldResponse`.
- [x] `contact-field.model.ts`: `tenantId` requerido + indexado; índices únicos `{tenantId,key}` y
      `{tenantId,labelNormalizado}`; `{tenantId,activo,orden}`.
- [x] `contact-field.validation.ts`: schemas `{ body, params, query }` `.strict()`.
- [x] `contact-field.service.ts`: list / create (slug + reservadas + duplicados) / update (sin tocar
      `key`) / archive / `getCamposPorKey` / `assertKeysDelCatalogo`. Solo `*Scoped`, `AppError`, `.lean()`.
- [x] `contact-field.controller.ts`: delgado, `tenantId` del token, mapea a `IContactFieldResponse`.
- [x] `contact-field.routes.ts`: cadena fija de middlewares, `authorize(['admin'])`.
- [x] Montar `app.use('/api/campos-contacto', contactFieldRoutes)` en `app.ts`.
- [x] `seed/backfill-contact-fields.ts` + llamada al arrancar junto a `backfillContactOptions`.

## 2. Captura con destino (criterios 7–14)

- [x] `flow.types.ts`: `DestinoCaptura`, campos opcionales de `captura`, efecto `guardar_dato`,
      `EntradaMotor.contacto`.
- [x] `flow.validation.ts`: `destino` (discriminatedUnion estricta), `saltarSiExiste`, `sobrescribir`.
- [x] `flow.service.ts`: canonizar `campo`/`tipoDato`, defaults y `assertKeysDelCatalogo` en
      `createFlow`/`updateFlow` (`400` con el id del nodo).
- [x] `flow.engine.ts`: saltar si existe · efecto `guardar_dato` · variable siempre actualizada.
- [x] Mover `ACTOR_SISTEMA_FLUJO` a una constante compartida.
- [x] `cliente.service.ts`: `guardarDatoDesdeFlujo` (validación, sobrescribir, fusión por key, cifrado
      helper, máximo 30, auditoría enmascarada).
- [x] `flow.runtime.service.ts`: snapshot `contacto` por mensaje; `SlotSpec` con opciones de rol y
      `tipoDato` del catálogo; `ejecutarEfecto('guardar_dato')` + efecto de prueba.
- [x] `sandbox.types.ts`: `dato_guardado`.

## 3. Ficha del contacto (criterio 15)

- [x] `cliente.validation.ts`: `label`/`sensible` opcionales en atributos.
- [x] `updateCliente`: keys del catálogo (archivadas solo si ya estaban); `label`/`sensible` desde el
      catálogo.

## 4. Frontend (criterios 14, 16–19)

> Antes de escribir cualquier componente: invocar `emil-design-eng`, `impeccable:impeccable` y
> `frontend-design:frontend-design` (regla 7 del `CLAUDE.md` raíz). Usar shadcn/ui; revisar claro y oscuro.

- [x] `contacts/api.ts` + `types.ts` + `hooks/useContactFields.ts`.
- [x] `CamposPersonalizadosManager.tsx` (crear, renombrar, tipo, sensible, archivar; errores en línea).
- [x] Selector de campos con «Crear campo…»: quedó **integrado** en `CapturaForm` y en `AtributosEditor` (cada uno
      lleva su propio `Select` con esa opción) en vez de un componente aparte.
- [x] `AtributosEditor.tsx`: elegir del catálogo en vez de teclear el nombre.
- [x] `flows/types.ts` + `CapturaForm`: "Guardar en", variable de solo lectura, interruptores, chips de
      rol, aviso si la key está archivada.
- [x] `assistant-sandbox`: tipo + tarjeta `dato_guardado`.

## 4b. Editor de flujos (criterios 26–36)

> Misma regla: invocar `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`
> antes de tocar componentes; shadcn/ui; claro y oscuro; rojo/verde con icono y texto, no solo color.

- [x] `lib/graph.ts` (adaptador) + `hooks/useGraphErrors.ts` (`useMemo` sobre `analizarGrafo`).
- [x] `FlowNode.tsx`: estados error / correcto / neutro, nombre del nodo; sin esperar a guardar.
- [x] `useFlowStore`: `nodeErrors` solo para errores de forma del servidor; se limpia al editar el nodo.
- [x] `useSaveFlow.ts`: toast con advertencias; ya no pinta rojo desde el `400` de grafo.
- [x] `FlowEditorPage.tsx`: contador de errores (clic → centra y selecciona), *Activar* deshabilitado
      con tooltip, manejo de `FLOW_CON_ERRORES`.
- [x] `FlowEditorPage.tsx`: aristas derivadas con `deletable: true` y `data: { nodoId, handleId }`
      (hoy `deletable: false`, línea ~156).
- [x] `FlowCanvas.tsx`: `deleteKeyCode={['Delete','Backspace']}`; `onEdgesDelete` (derivada →
      `actualizarDestinoDeRama(nodoId, handleId, '')`; lineal → quitar); `onBeforeDelete` (no borrar la
      entrada).
- [x] Borrado de nodos: `onBeforeDelete` (protege la entrada), `onNodesDelete` y el botón del inspector
      comparten `limpiarReferencias` (vacía las ramas ajenas que apuntaban al nodo, hoy colgantes) y la misma
      regla de la entrada.
- [x] `ConfirmarGuardadoActivoDialog.tsx` (shadcn `AlertDialog`): Guardar y desactivar / No guardar /
      Cancelar; foco inicial en Cancelar; `Esc` = Cancelar; claro y oscuro. Estado *Inactivo* + aviso fijo
      tras desactivar. Se abre antes de llamar a la API y también ante un `409` del servidor.
- [x] `hooks/useFlowDraft.ts`: borrador local con debounce, `try/catch`, Recuperar/Descartar; toast de
      error con *Reintentar* en `useSaveFlow` (criterio 30).
- [x] `NodeInspector.tsx`: campo *Nombre del nodo* (máx. 60); botón Eliminar reutiliza la lógica de la
      tecla.
- [x] `DestinoSelect.tsx` y `IaOutputsEditor`/`ConditionEditor`: mostrar `nombreDeNodo`.
- [x] Backend `nombre`: `flow.validation.ts`, `flow.types.ts`, `flow.model.ts` y respuesta.

## 5. Tests

- [x] `contact-field.service.test.ts`: crear; slug estable al renombrar; duplicado por key y por label
      sin tildes → `409`; reservadas (`nombre`, `Email`, `Teléfono`) → `400`; archivar.
- [x] `backfill-contact-fields.test.ts`: crea las keys que faltan, `sensible` por OR, idempotente,
      omite reservadas.
- [x] `flow.validation.test.ts`: destino válido/ inválido; flujo sin destino sigue validando.
- [x] `flow.engine.test.ts`: saltar si existe (no envía pregunta, variable con el valor guardado);
      no saltar con `saltarSiExiste: false`; efecto `guardar_dato` solo con destino ≠ variable;
      config legada sin destino = comportamiento actual.
- [x] `flow.service`: canoniza `campo`; key inexistente/archivada → `400`.
- [x] `cliente.guardar-dato.test.ts`: sobrescribir `false` con dato previo → no escribe; `true` →
      escribe; correo inválido → `invalido`; rol fuera del catálogo → `invalido`; atributo
      `numero` inválido; fusión por key sin tocar otros atributos; auditoría con `'[oculto]'`.
- [x] `updateCliente`: atributo con key fuera del catálogo → `400`; label del body ignorado.
- [x] **Aislamiento** (`contact-field.isolation.test.ts`, `flow.isolation.test.ts`):
  - [x] campo del tenant A no se lista / edita / archiva desde B (`404`);
  - [x] flujo de B con key que solo existe en A → `400`;
  - [x] `guardar_dato` no escribe en un `Cliente` de otro tenant;
  - [x] el backfill de A no crea campos en B.
- [x] Frontend: `CapturaForm.test.tsx`, `CamposPersonalizadosManager.test.tsx`, ajuste de
      `ContactEditDialog.test.tsx` y `SandboxChat.test.tsx`.
- [x] Frontend modal: flujo activo + errores → abre el modal y **no** llama a la API hasta confirmar ·
      *Cancelar* y `Esc` no envían nada y siguen editando · *No guardar* sale y conserva el borrador ·
      *Guardar y desactivar* envía `confirmarDesactivar: true` y muestra *Inactivo* · flujo inactivo
      con errores guarda sin modal · un `409` del servidor abre el modal.
- [x] Frontend editor: **un nodo a medias** (IA sin objetivo) se guarda con aviso y no deja activar ·
      fallo de red al guardar conserva el estado y ofrece *Reintentar* · el borrador local se recupera
      tras recargar y se borra al guardar bien · borrar un nodo vacía las ramas que lo apuntaban ·
      un nodo huérfano pasa de rojo a verde al conectarlo, sin llamar a guardar ·
      `Delete` y `Backspace` borran el enlace seleccionado · borrar un enlace de rama deja el
      destino vacío y el nodo en rojo · no se borra el nodo de entrada · *Activar* deshabilitado con
      errores · el nombre del nodo se ve en el nodo y en `DestinoSelect`.
- [x] Aislamiento de flujos: `FLOW_CON_ERRORES` no revela nodos de otro tenant (el análisis es sobre el
      DTO recibido; sin lecturas cruzadas).

## 6. Documentación

- [x] `docs/data-model.md`: `contact_fields`; config de `captura`; nota de `atributos` (key del catálogo).
- [x] `docs/domain.md`: glosario e invariantes.
- [x] `docs/api-contract.md`: `/api/campos-contacto` y el `400` del PATCH de clientes.
- [x] `docs/adr/0013-catalogo-campos-contacto.md`.
- [x] `docs/data-model.md` / `docs/api-contract.md`: `nombre` del nodo, `advertencias`, `FLOW_CON_ERRORES`.
- [x] `.test-chat/00-flows-documentation.md`: destino de captura, fin del bug de efectos, §7 (huérfano ya
      no bloquea guardar), nombres de nodo y borrado con `Supr` (fuera de git).

## Verificación final

- [x] `pnpm --filter @sofiapp/shared typecheck` y `build` sin errores.
- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde (incluye aislamiento y regresión del motor).
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint && pnpm --filter @sofiapp/web test`.
      Build y lint limpios; **981 tests en verde**. Excepción **previa a esta historia**: `KnowledgeBasePage.test.tsx`
      entra en un bucle (`RangeError: Maximum call stack size exceeded`) también sin estos cambios; se excluyó de la corrida.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado.
- [x] `spec.md` → `**Estado:** implementado`.

## Definición de "hecho"

Se puede guardar un flujo a medias pero no activarlo hasta que todas sus conexiones estén completas;
el editor marca cada nodo en rojo o verde al instante, permite borrar enlaces con `Supr`/`Retroceso` y
da nombres propios a los nodos. Además, un flujo puede preguntar el nombre, la institución o el rol y dejarlos en la ficha del contacto con
claves únicas por empresa, sin volver a preguntar lo que ya se sabe. Los campos personalizados de la
ficha y de los flujos salen del mismo catálogo. Y el motor ya no pierde mensajes ni acciones cuando
un nodo de IA sigue a otro nodo en el mismo turno.
