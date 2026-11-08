# HU-FLOW-05 — Captura estructurada de datos y editor de flujos (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Hace que lo que el cliente responde en un flujo termine en la **ficha del contacto**
> con claves uniformes, corrige un fallo del motor que descartaba mensajes y acciones, y mejora el
> editor de flujos: guardar con errores sin poder activar, estado de error en vivo, borrado de
> enlaces con teclado y nombres propios para los nodos.

**Estado:** implementado

## Contexto (por qué existe)

Hoy el nodo `captura` guarda lo extraído **solo** en `FlowState.variables[campo]`, un `Mixed` libre
por cliente y flujo (`flow.model.ts`). Tres consecuencias:

1. **Nada llega a la ficha.** Ningún código copia esas variables a `Cliente`. El nombre que el cliente
   dictó en el flujo no aparece en la bandeja, ni en el lead, ni sirve para segmentar campañas.
2. **Claves sin control.** El `campo` lo teclea quien diseña cada flujo: un flujo usa `nombre`, otro
   `nombre_cliente` y otro `name` para el mismo dato. Los atributos personalizados de la ficha
   (HU-CRM-02) tienen el mismo problema: su `key` es un slug del label que escribe cada asesor en
   cada contacto, así que "Colegio" en uno e "Institución" en otro son dos atributos distintos, y la
   segmentación de campañas por atributo (HU-MARK-01, `filtros.atributos[].key`) no los junta.
3. **Se vuelve a preguntar lo que ya se sabe.** El flujo no consulta la ficha, así que pide el nombre
   a un contacto que ya lo tiene registrado.

Además, auditando el motor se encontró un **bug de ejecución** (ver criterio 1): en un mismo turno,
todo lo que hace un nodo **antes** de llegar a un nodo que consulta la IA se pierde.

**Editor de flujos** (auditado en el código actual):

4. **No se puede guardar a medias.** `flow.validation.ts` rechaza con `400` cualquier grafo con nodos
   huérfanos o destinos rotos, también en borrador. Y no hay una regla propia para activar: la
   validación es la misma al guardar y al activar.
5. **El rojo solo se quita guardando.** `nodeErrors` se llena únicamente con la respuesta `400` del
   servidor (`useSaveFlow.ts`) y se limpia solo tras un guardado exitoso: el nodo corregido sigue en
   rojo hasta volver a guardar.
6. **Los enlaces no se borran con `Supr`.** `FlowCanvas.tsx` no define `deleteKeyCode`; React Flow usa
   solo `Retroceso`.
7. **Los nodos no tienen nombre.** El editor los rotula con el tipo y un resumen, lo que vuelve
   ilegibles los flujos con varios nodos del mismo tipo (varios «IA» o varios «Captura»).

## Objetivo

1. El nodo `captura` decide **dónde guardar** el dato: en un **campo fijo del contacto** (`nombre`,
   `correo`, `documento`, `rolContacto`), en un **campo personalizado** del catálogo de la empresa, o
   solo en una **variable del flujo** (comportamiento actual).
2. Los campos personalizados dejan de ser texto libre por contacto y pasan a ser un **catálogo por
   empresa** (clave, etiqueta, tipo, sensible) que comparten el nodo `captura` y la ficha del
   contacto. Así cada dato tiene **una sola clave** en Mongo.
3. Por nodo se configura si **se salta la pregunta** cuando el contacto ya tiene el dato y si **se
   sobrescribe** el valor guardado.
4. Corregir el motor para que ningún efecto de un turno se pierda.
5. **Guardar con errores de conexión, pero no activar** un flujo hasta corregirlos.
6. **Estado de error en vivo** en el editor: el nodo pasa de rojo a verde apenas se corrige, sin
   guardar.
7. **Borrar enlaces con `Supr` y `Retroceso`.**
8. **Nombre opcional por nodo**, visible en el lienzo, los destinos y los errores.

## Alcance

Incluye:

- **Backend**
  - **Corrección del motor** (`flow.runtime.service.ts` → `correrMotor`): los efectos de todas las
    rondas de un turno se ejecutan, en orden, no solo los de la última.
  - **Captura fallida sin bucle**: si la IA no extrae el dato, el nodo queda esperando tras **una**
    llamada, en vez de reintentar la extracción hasta agotar el tope de 5 en el mismo mensaje.
  - Feature nuevo **`contact-field`** (patrón de 6 archivos) sobre la colección `contact_fields`:
    catálogo de campos personalizados por tenant. `GET/POST /api/campos-contacto`,
    `PATCH/DELETE /api/campos-contacto/:id` (el borrado **archiva**).
  - `captura` gana `destino`, `saltarSiExiste` y `sobrescribir`. Los flujos existentes sin `destino`
    siguen funcionando igual (destino = variable).
  - Efecto nuevo `guardar_dato` y servicio `guardarDatoDesdeFlujo` en `cliente`, con auditoría.
  - `PATCH /api/clientes/:id` exige que cada atributo use una `key` del catálogo; etiqueta y
    `sensible` los fija el catálogo, no el body.
  - **Backfill idempotente** al arrancar: los atributos que ya existen en contactos se registran en
    el catálogo de su tenant.
  - Efecto de prueba `dato_guardado` en el chat de prueba (HU-IA-08).
  - **Validación del grafo en dos niveles**: errores de forma (bloquean guardar) y de conexión
    (advertencias al guardar, bloquean **activar**). Función pura `analizarGrafo` en
    `packages/shared`, compartida con el editor.
  - `nombre` opcional en cada nodo.
- **Frontend**
  - Inspector del nodo `captura`: selector **"Guardar en"** (variable del flujo · dato del contacto ·
    campo personalizado) e interruptores *Saltar si ya existe* / *Sobrescribir*.
  - Gestor del catálogo **Campos personalizados** (crear, renombrar, cambiar tipo/sensible,
    archivar), abrible desde el inspector y desde la ficha del contacto.
  - `AtributosEditor` de la ficha: elige el campo del catálogo en vez de teclear el nombre.
  - Tarjeta del efecto `dato_guardado` en el chat de prueba.
  - Editor: errores calculados en vivo (rojo → verde), indicador de errores y botón *Activar*
    deshabilitado con motivo, borrado de enlaces y nodos con `Supr`/`Retroceso`, campo *Nombre del
    nodo* en el inspector y nombres en los desplegables de destino.
- **Documentación**
  - `docs/data-model.md`: `contact_fields`, nueva config de `captura`, regla de `atributos`.
  - `docs/domain.md`: glosario (*Campo del contacto*, *Campo personalizado*, *Destino de captura*).
  - `docs/api-contract.md`: endpoints de `/api/campos-contacto` y el `400` nuevo del PATCH.
  - `docs/adr/0013-catalogo-campos-contacto.md`: claves canónicas por tenant.
  - `docs/data-model.md` / `docs/api-contract.md`: `nombre` del nodo, `advertencias` al guardar y el
    `400 FLOW_CON_ERRORES` al activar.
  - `.test-chat/00-flows-documentation.md` §7 (huérfano deja de ser error de guardado).

Fuera de alcance:

- **Nuevas columnas fijas** en `Cliente` (ciudad, fecha de nacimiento, teléfono alterno). Se decidió
  ofrecer solo las que ya existen; lo demás va como campo personalizado.
- **Capturar `telefono`** como campo fijo: el webhook lo reescribe en cada mensaje entrante
  (HU-CRM-02, criterio 17).
- **Repreguntar** cuando la extracción falla (`captura.reintentos` sigue sin efecto). Esta historia
  solo evita el bucle de llamadas; el reintento con nueva pregunta es otra historia.
- **Interpolar** variables o datos del contacto en el texto de un `mensaje` (`{{nombre}}`).
- Condiciones que lean la ficha directamente (`cliente:<campo>`). Se cubre porque el dato capturado
  **o encontrado** queda también en `var:<campo>`.
- Unificar `datosExtraidos` (extracción por IA bajo demanda, HU-OMNI-03) con este mecanismo.
- Retirar `customFields` del schema de `Cliente`.
- Deshacer/rehacer en el editor, autocorrección de enlaces rotos y exigir nombres **únicos** de nodo.
- Asignar las salidas del nodo `ia` arrastrando (se sigue haciendo desde el inspector).

## Criterios de aceptación

### A. Corrección del motor

1. **Ningún efecto de un turno se pierde.** Si en un mismo mensaje el flujo pasa por nodos que
   envían o actúan (`mensaje`, `kb`, `accion`) y después llega a un nodo que requiere la IA
   (`intencion`, `kb`, `ia`, `captura` al extraer), **todos** los efectos se ejecutan, en el orden de
   los nodos. Casos que deben quedar cubiertos por test:
   - `kb → ia` en el mismo turno: el cliente recibe la respuesta del KB **y luego** la del nodo IA.
   - `accion (aplicar_etiquetas) → ia`: la etiqueta se aplica.
   - Si se alcanza el tope de 5 resoluciones con una petición pendiente, los efectos acumulados
     igual se ejecutan y el estado queda persistido en el nodo pendiente.
2. **Una captura fallida cuesta una sola llamada.** Si la IA no devuelve el dato, el nodo sigue
   esperando la siguiente respuesta del cliente con **una** llamada de extracción en ese mensaje (hoy
   gasta 5).

### B. Catálogo de campos personalizados

3. `contact_fields` guarda por tenant: `key` (slug estable, no cambia al renombrar), `label`,
   `tipoDato` (`texto` · `numero` · `fecha` · `booleano`), `sensible`, `orden` y `activo`. `key` es
   **única por tenant**, y `label` también, comparando sin mayúsculas ni tildes.
4. Las claves de los campos fijos (`nombre`, `correo`, `documento`, `telefono`, `rolContacto`,
   `nivelInteres`, `objecionPrincipal` y sus equivalentes sin mayúsculas/tildes) están
   **reservadas**: crear un campo personalizado con esa clave o esa etiqueta normalizada → `400`, con
   un mensaje que indica usar el campo fijo.
5. `DELETE /api/campos-contacto/:id` **archiva** (`activo: false`): deja de ofrecerse para elegir,
   pero los contactos que ya tienen ese atributo lo conservan y lo siguen mostrando con su etiqueta.
6. **Backfill:** al arrancar, por cada tenant, cada `key` distinta presente en `Cliente.atributos`
   que no esté en el catálogo se registra con el primer `label` encontrado y `sensible: true` si lo
   fue en algún contacto. Es idempotente: correrlo dos veces no duplica ni modifica nada.

### C. Nodo `captura`

7. La config de `captura` acepta `destino`:
   - `{ tipo: 'variable' }` — solo `FlowState.variables[campo]` (comportamiento actual).
   - `{ tipo: 'contacto', campo: 'nombre' | 'correo' | 'documento' | 'rolContacto' }`.
   - `{ tipo: 'atributo', key }` — una `key` **activa** del catálogo del tenant.

   Un flujo guardado **sin** `destino` se trata como `variable`: ningún flujo existente cambia de
   comportamiento ni falla al cargarse.
8. **Clave canónica.** Con destino `contacto` o `atributo`, el servicio fija `campo` = el campo fijo
   o la `key` del catálogo (ignora lo que venga en el body). Así una condición siempre lee
   `var:nombre` o `var:institucion`, nunca un sinónimo. Con destino `atributo`, `tipoDato` lo fija
   el catálogo.
9. Guardar un flujo con destino `atributo` cuya `key` no existe o está archivada en el catálogo
   **del tenant del token** → `400`, indicando el nodo.
10. `saltarSiExiste` (por defecto `true`) y `sobrescribir` (por defecto `false`) solo aplican a los
    destinos `contacto` y `atributo`:
    - Si `saltarSiExiste` y el contacto **ya tiene** el dato, el nodo **no pregunta**: copia el valor
      guardado a `var:<campo>` y continúa en el mismo turno.
    - Si se pregunta y se extrae un valor: con `sobrescribir: false` solo se escribe si el contacto
      no tenía ese dato; con `true` se reemplaza. En **ambos** casos el valor extraído queda en
      `var:<campo>` para las condiciones del flujo.
11. **Validación del valor antes de escribir en la ficha:**
    - `correo` debe ser un email válido; `documento` y `nombre`, texto no vacío (máx. 120).
    - `rolContacto`: la extracción recibe las opciones **activas** del catálogo de rol del tenant y
      debe devolver una de sus claves. Un valor que no corresponde a ninguna opción **no** se
      escribe en la ficha.
    - Atributo: se valida contra el `tipoDato` del catálogo (`numero` numérico, `fecha` ISO,
      `booleano` sí/no) y se guarda como texto en `atributos[].valor`.
    - Un valor inválido no se escribe en la ficha, pero el flujo **no se rompe**: queda en la
      variable y se registra en el log.
12. La escritura en la ficha **fusiona por `key`**: agrega o actualiza ese atributo y no toca los
    demás. `label` y `sensible` salen del catálogo.
13. Cada escritura en la ficha genera un `AuditEvent` `cliente.update` con actor **sistema (flujo)**,
    con el mismo enmascarado de HU-CRM-02: los valores de `correo`, `documento` y atributos sensibles
    se guardan como `'[oculto]'`.
14. En el chat de prueba, cada dato escrito en la ficha aparece como tarjeta **"Dato guardado"**
    (etiqueta del campo y valor; enmascarado si es sensible), igual que hoy aparecen lead, etiquetas
    o estado.

### D. Ficha del contacto

15. `PATCH /api/clientes/:id` con un atributo cuya `key` no está en el catálogo del tenant → `400`.
    `label` y `sensible` del body se ignoran y se toman del catálogo. Un atributo **archivado** que
    el contacto ya tenía se puede conservar, pero no agregar a un contacto nuevo.
16. **UI ficha:** `AtributosEditor` ofrece un selector de campos del catálogo (activos y no usados ya
    en ese contacto) con la opción **"Crear campo…"**, que abre el gestor. Ya no se teclea el nombre
    del atributo.

### E. UI del flujo

17. **Inspector de `captura`:** selector **"Guardar en"** con tres grupos (*Solo en el flujo* ·
    *Dato del contacto* · *Campo personalizado*). Con destino de contacto o atributo, el nombre de la
    variable se muestra de solo lectura (`var:nombre`) y aparecen los dos interruptores con su
    explicación. Para `rolContacto`, el inspector muestra las opciones que reconocerá la IA.
18. **Gestor "Campos personalizados":** lista con etiqueta, clave, tipo y candado de sensible; crear,
    renombrar, cambiar tipo/sensible y archivar. La clave se ve pero no se edita. Los errores de
    duplicado o reservado se muestran en el campo antes de enviar.
19. Toda la UI nueva o tocada sigue la regla 7 del `CLAUDE.md` raíz: skills de diseño, componentes
    shadcn/ui y prolija en **claro y oscuro** con los tokens semánticos; estados de carga, vacío,
    error y foco visible.

### F. Estado de errores del grafo y activación

20. **Dos niveles de validación.**
    - **Errores de forma** (bloquean guardar, `400`): nombre del flujo vacío, ids de nodo repetidos,
      `entrada` que no es un nodo del flujo, tipos de dato o enums inválidos, campos no permitidos,
      topes numéricos fuera de rango.
    - **Errores de conexión** (no bloquean guardar): nodo huérfano; rama, salida o `ramaPorDefecto` sin
      destino; arista o rama que apunta a un nodo inexistente.
    - **Errores de contenido** (no bloquean guardar): nodo con configuración **incompleta** — pregunta,
      descripción o nombre del dato vacíos en `captura`; `mensaje` sin texto ni plantilla; `condicion`
      sin ramas o con una rama sin valor; `intencion` sin etiquetas o con una sin descripción; `ia` con
      objetivo de menos de 10 caracteres o sin salidas; `kb` sin pregunta o sin texto de respaldo;
      `accion` con efecto incompleto (sin etiquetas o sin asesor).
21. **Un nodo a medias se puede guardar.** Los campos de contenido y los destinos se aceptan **vacíos**
    al guardar (`''`, listas vacías); se reportan como errores de conexión o de contenido, pero no
    como `400`. Ya no se exigen con `min(1)` en el esquema de guardado.
22. **Guardar con errores de conexión o de contenido → `200`** con
    `advertencias: [{ nodoId, codigo, mensaje }]` (`NODO_HUERFANO`, `DESTINO_VACIO`,
    `DESTINO_INEXISTENTE`, `CONTENIDO_INCOMPLETO`). Un flujo con advertencias nunca queda activo.
23. **Activar exige un grafo sin errores de conexión ni de contenido.** `activo: true` (al crear o actualizar) con
    algún error → `400` con código `FLOW_CON_ERRORES` y `errores: [{ nodoId, codigo, mensaje }]`; no se
    modifica nada y el flujo activo anterior sigue activo. **Editar un flujo ya activo** y guardarlo con errores no es automático: sin confirmación
    explícita el servidor responde `409 FLOW_ACTIVO_CON_ERRORES` con la lista de `errores` y no
    guarda nada. Con `confirmarDesactivar: true` guarda los cambios, deja el flujo **inactivo** y la
    respuesta lo indica (`desactivado: true`). Mientras tanto la empresa queda **sin flujo activo**: los
    mensajes nuevos los atiende Sofi (la IA general con el prompt de *Comportamiento*) hasta que se
    corrija y se active de nuevo.
24. **Compatibilidad.** Los flujos guardados siguen cargando igual. En el chat de prueba (que corre
    flujos en borrador), una rama sin destino **termina el flujo** sin romperlo; en WhatsApp real no
    puede ocurrir, porque un flujo con errores no se puede activar.
25. **Una sola fuente de reglas.** `analizarGrafo(nodos, aristas, entrada)` es una función pura en
    `packages/shared` que devuelve los errores de conexión y de contenido por nodo. La usan el backend
    (al guardar y activar) y el editor (en vivo); no hay dos implementaciones. Un test fija que lo que
    `analizarGrafo` da por completo es exactamente lo que el esquema estricto de activación acepta.

### G. Editor: estado de errores en vivo

26. **Rojo → verde al instante.** El editor recalcula los errores con `analizarGrafo` en cada cambio de
    nodos, enlaces o configuración, **sin esperar a guardar**. Un nodo con error se ve en rojo con su
    mensaje; al corregirlo pasa a verde en el mismo momento. El estado se comunica también con icono
    y texto, no solo con color.
27. Las advertencias del servidor al guardar coinciden con el cálculo local; el servidor no es la
    fuente del estado visible.
28. **Barra del editor:** contador de errores del flujo («3 nodos con errores» / «Sin errores»).
    **Guardar** está siempre disponible (salvo errores de forma, que se muestran en el inspector).
    **Activar** está deshabilitado mientras haya errores, con un tooltip que explica por qué; al pulsar
    el contador se centra y selecciona el primer nodo con error.
29. Si el servidor responde `FLOW_CON_ERRORES` (p. ej. otro usuario editó el flujo), el editor marca y
    selecciona los nodos de `errores`.
    **Guardar un flujo activo con errores abre un modal de confirmación** (nunca guarda en silencio):
    - Título claro («Este flujo está en producción y tiene errores»), la lista de nodos con error (por
      su nombre) y el efecto: «Si guardas, el flujo quedará **inactivo** y la atención de la empresa
      volverá a Sofi (IA general) hasta que corrijas los errores y lo actives».
    - Tres acciones: **Guardar y desactivar** (envía `confirmarDesactivar: true`), **No guardar** (sale
      del editor sin enviar nada; el flujo activo queda como estaba y los cambios se conservan en el
      borrador local, con aviso de que se pueden recuperar) y **Cancelar** (cierra el modal y sigue
      editando). `Esc` equivale a Cancelar; la acción por defecto con foco es Cancelar, no Guardar.
    - Tras *Guardar y desactivar*, el editor muestra el estado *Inactivo* con un aviso fijo («Corrige
      los errores y activa el flujo para volver a producción») y un toast de confirmación.
    - El modal solo aparece si el flujo **está activo** y hay errores; con un flujo inactivo, guardar
      con errores es directo (solo el aviso de advertencias).

30. **Sin conexión no se pierde el trabajo.** Si guardar falla por red o por un error del servidor, el
    editor conserva todo en pantalla y avisa «No se pudo guardar. Tus cambios siguen aquí» con
    *Reintentar*. Mientras hay cambios sin guardar se mantiene un **borrador local** del flujo
    (`localStorage`, por flujo y tenant); al reabrir el editor, si el borrador es más reciente que lo
    guardado, se ofrece **Recuperar** o **Descartar**. El borrador se borra al guardar con éxito. El
    borrador local es solo una red de seguridad: nunca se activa ni se envía solo.

### H. Editor: borrado de enlaces y nodos

31. Un enlace seleccionado se elimina con **`Supr`** (`Delete`) **y** con **`Retroceso`**
    (`Backspace`). No actúa si el foco está en un campo de texto del inspector.
32. Borrar un enlace que representa una **rama o salida** de `condicion`, `intencion` o `ia` deja ese
    destino vacío y marca el nodo en error; al recargar el flujo no reaparece. Borrar un enlace
    lineal deja el nodo sin salida (fin del flujo), como hoy.
33. Borrar un **nodo** (tecla o botón) elimina sus enlaces y deja vacías las ramas de otros nodos que
    apuntaban a él, marcándolos en error. **El nodo de entrada no se puede borrar** mientras haya
    otros nodos: aviso para marcar antes otro como inicio.

### I. Nombres de nodo

34. Cada nodo acepta un `nombre` **opcional** (texto recortado, 1–60 caracteres). Sin nombre se
    muestra el título por tipo de hoy; los flujos existentes no cambian.
35. El nombre se edita en el inspector (campo *Nombre del nodo*, arriba) y se guarda con el flujo.
36. El nombre aparece en el nodo del lienzo, en **todos** los desplegables de destino
    (`DestinoSelect`), en el indicador de errores y en los mensajes de error («“Captura grado” no
    tiene conexión de entrada»). No se exige unicidad.

### J. Calidad

37. **Aislamiento multi-tenant:** un campo del catálogo del tenant A no se lista, edita ni archiva
    desde el B (`404`, indistinguible de inexistente); un flujo del tenant B no puede guardar un
    destino con una `key` que solo existe en A (`400`); `guardar_dato` solo escribe en el `Cliente`
    del tenant del flujo; el backfill de un tenant no crea campos en otro. **Test de aislamiento en
    verde.**
38. `pnpm --filter @sofiapp/api typecheck` y `test` en verde; `pnpm --filter @sofiapp/web build`,
    `lint` y `test` sin errores; `pnpm --filter @sofiapp/shared typecheck`.

## Dependencias

- `packages/shared` — alojará `analizarGrafo`; el backend y el frontend lo consumen.
- `INF-02` — repositorio tenant-safe (`*Scoped`); todo lo nuevo pasa por ahí.
- `HU-FLOW-01` / `HU-FLOW-01-V2` / `HU-FLOW-03` — motor (`avanzar`), runtime (`correrMotor`) y nodo
  `ia`, que esta historia corrige y extiende.
- `HU-CRM-02` — `Cliente.atributos`, `updateCliente`, auditoría enmascarada, catálogo de rol
  (`contact_options`, `assertOpcionesValidas`) y `AtributosEditor`.
- `HU-MARK-01` — segmentación por `atributos[].key`, que se beneficia de las claves canónicas.
- `HU-IA-08` — chat de prueba y `SandboxEfecto`, donde se agrega `dato_guardado`.
- `DSN-03` — UI kit shadcn (`select`, `switch`, `dialog`, `command`/`popover` si hace falta un combo).
