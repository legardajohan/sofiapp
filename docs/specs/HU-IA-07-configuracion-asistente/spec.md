# HU-IA-07 — Afinar la configuración del Asistente IA (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Son **cinco cambios sobre pantallas que ya existen** (HU-IA-01 y HU-IA-03), no un
> feature nuevo: tres son de producto y dos abren capacidades que el modelo de datos todavía no
> tiene. Se agrupan en una sola historia porque cuatro de los cinco tocan la misma pantalla y el
> mismo documento de configuración, y separarlos obligaría a tocar `HandoffSettingsForm` cuatro veces.

**Estado:** implementado

## Objetivo

Que la configuración de la transferencia deje de ser una lista cerrada que el admin solo puede
encender o apagar, y pase a ser algo que puede **ampliar y repartir con criterio**:

1. Que pueda añadir **sus propias condiciones** de transferencia, con nombre, además de las cuatro
   de fábrica — hoy o encaja su caso en «palabra clave» o no existe.
2. Que la conversación pueda ir **al asesor con menos carga**, no siempre al primero de la lista
   alfabética. Hoy «el primero del equipo» significa literalmente el primero por nombre, y con la
   transferencia encendida todo el volumen cae sobre la misma persona.
3. Que antes de decidir eso pueda **ver cómo está repartido el trabajo** hoy, sin salir de la
   pantalla en la que está tomando la decisión.

Y dos limpiezas: quitar un bloque que ya no aporta y renombrar una sección que no dice lo que hay
dentro.

## Punto de partida: qué ya existe

Verificado en el código, no asumido. Todo lo de esta tabla se **reutiliza**; nada se rehace.

| Pieza | Dónde vive hoy |
|---|---|
| Configuración de handoff, un documento por tenant | `HandoffSettings` (`ai-handoff.model.ts`), índice **único** `{ tenantId }` |
| Las cuatro reglas fijas y su prioridad | `IHandoffReglas` + `MOTIVOS_HANDOFF` (`ai-handoff.types.ts:14-46`) |
| Motor de evaluación en dos puntos | `evaluarAntesDeGenerar` / `evaluarDespuesDeGenerar` (`ai-handoff.service.ts`) |
| Coincidencia por palabra completa, sin tildes | `normalizar`, `contieneTermino`, `algunTermino` (`ai-handoff.service.ts`) |
| Valores de fábrica y fallback sin documento | `REGLAS_DE_FABRICA` + `settingsDeFabrica()` + `heredado: true` |
| Endpoints de configuración | `GET`/`PUT /api/ai/handoff-rules` (`ai-handoff.routes.ts`), `authorize(['admin'])` |
| Validación en el borde | `updateHandoffSettingsSchema`, con `termino` (2..80) y `listaTerminos` (máx. 30) |
| Guarda del asesor destino | `assertAssignableAdmin` (`user.service.ts`): admin **activo** del propio tenant |
| Destino de fábrica | `primerAdminActivo()` → `listTenantUsers(tenantId, { rol:'admin', activo:true })`, ordenado por nombre |
| Resolución del destino en el handoff | `resolverDestino()` (`conversation.service.ts:728-744`), con fallback si el configurado ya no es asignable |
| Ejecución del handoff | `ejecutarHandoff()` (`ai-reply.processor.ts`) + `handoffConversation()` |
| Qué se guarda del handoff en la conversación | `Cliente.handoffAt` / `handoffMotivo` (`cliente.model.ts:41-42`) |
| Cómo llega el motivo a la bandeja | `conversation.mapper.ts:77-79` → `handoff: { at, motivo }` |
| Cómo se pinta | `HandoffBanner` + `MOTIVO_LABEL` (`handoff/types.ts:36-41`) |
| Editor de listas de términos | `TermList` (chips, Enter para añadir, sin duplicados, tope 30) |
| Tarjeta de disparador | `TriggerCard` (interruptor + parámetros ocultos mientras está apagado) |
| Repositorio tenant-safe | `findScoped`, `countScoped`, `findOneAndUpdateScoped`… (`base.repository.ts`) |
| Molde de `key` estable derivada del label | `contact_options.key` y `Cliente.atributos.key` (HU-CRM-02), con `slugificar` en el frontend |
| Molde de lista validada sin duplicados | `atributosSchema` con `superRefine` (`cliente.validation.ts`) |
| Máquina de estados comerciales | `ESTADOS_COMERCIALES` y `docs/domain.md` §3; índice `{ tenantId, estadoComercial }` |
| Asignación de conversaciones | `Cliente.asesorId`, índice `{ tenantId, asesorId }` (HU-OMNI-02) |
| Vista previa del prompt | `SystemPromptPreview` (`ai-assistant/components/`), usada **solo** en `AssistantConfigForm.tsx:93` |

## Los huecos reales (verificados en el código)

1. **Las condiciones de transferencia son exactamente cuatro y no hay forma de añadir una quinta.**
   `IHandoffReglas` es un objeto de cuatro claves fijas, no una lista, y el propio código lo
   justifica: «los disparadores son cuatro y fijos, así que una colección con CRUD habría obligado a
   inventar un criterio de orden» (`ai-handoff.model.ts:5-9`). Esa decisión sigue siendo correcta
   para las cuatro de fábrica; lo que falta es un sitio para las del admin.

2. **`keyword` es una bolsa sin nombre.** Un admin que quiera escalar «facturación» y «reclamos» por
   motivos distintos solo puede meter todas las palabras en la misma lista, encenderlas o apagarlas
   juntas, y en la bandeja leer siempre «Escribió una palabra clave». No puede saber **cuál**.

3. **«El primero del equipo» es literalmente el primero por orden alfabético.**
   `primerAdminActivo` devuelve `admins[0]` de una lista ordenada por nombre
   (`ai-handoff.service.ts`, `listTenantUsers`). Con la transferencia encendida, **todo** el volumen
   automático cae sobre la misma persona hasta que alguien lo cambie a mano. El código lo admite:
   «no existe presencia ni carga por asesor».

4. **No hay ninguna consulta agregada por asesor.** No existe endpoint de reporte, y
   `base.repository` **no tiene helper de agregación**: solo `findScoped`, `countScoped` y los de
   escritura. Cualquier métrica por asesor hoy sería N consultas o una lectura completa de la
   colección.

5. **`aggregate` no castea el `tenantId`.** A diferencia de `find`, un `$match` con `tenantId` en
   forma de **string** no encuentra nada: Mongoose castea los filtros de query pero no las etapas de
   un pipeline. Es un fallo que falla cerrado (devuelve vacío) pero silencioso, y es exactamente el
   tipo de detalle que un helper del repositorio tiene que resolver una vez en lugar de en cada
   llamada.

6. **La sección «Qué pasa al transferir» no dice lo que hay dentro.** Contiene dos controles —a
   quién se asigna y qué se le escribe al cliente— y su título describe un momento, no una
   configuración. Es la única cabecera de la página que no nombra lo que gobierna.

7. **«Así lo recibe el modelo» ya no gana su sitio.** `SystemPromptPreview` reconstruye a mano el
   prompt (`Tono: … . …` + un bloque de CONTEXTO simulado) para explicar por qué tono e
   instrucciones son dos campos. Desde HU-IA-04 existe `AiResponseContextSheet`, que muestra el
   prompt **real** de una respuesta real, con su versión de plantilla y sus fragmentos. La vista
   previa dejó de ser la mejor explicación y pasó a ser una segunda fuente de verdad que hay que
   mantener en sincronía a mano cada vez que cambie la composición del prompt.

## Decisiones de diseño

### 1. Las condiciones extra son **grupos de palabras con nombre**, no un motor de reglas

`condicionesExtras: [{ key, nombre, activa, palabras[] }]` en el **mismo documento**: mismo `PUT`,
sin colección nueva, sin endpoints nuevos y sin criterio de orden que inventar (el orden es el del
array, que es el que ve el admin).

> **Por qué no un tipo discriminado** (`palabras | horario | sin_respuesta`): cada tipo nuevo es un
> evaluador nuevo en el worker, una rama nueva en el modal y un caso nuevo en Zod. Eso es un motor
> de reglas, y es otra historia. El array queda **preparado** para ese futuro —la forma no cambia,
> solo se le añadiría un discriminante— pero esta historia entrega un solo tipo.

> **Por qué `key` derivada del nombre y no un uuid:** es el patrón que el proyecto ya usó dos veces
> (`contact_options.key`, `Cliente.atributos.key`), por el mismo motivo: renombrar la condición no
> puede romper el vínculo con las conversaciones que ya se transfirieron por ella.

### 2. `HandoffMotivo` gana **un** valor, `custom`, y la conversación guarda el nombre

Un motivo por condición sería una unión dinámica, y `HandoffMotivo` es un tipo cerrado que usan
`Cliente.handoffMotivo`, la auditoría, el DTO de la bandeja y `MOTIVO_LABEL`. Se añade un único
valor y el detalle viaja aparte:

```
Cliente.handoffCondicion: { key: string, nombre: string } | null
```

> **Se guarda el nombre, no solo la clave.** El banner de la bandeja no puede depender de leer la
> configuración de handoff para pintar una línea, y sobre todo: si el admin renombra o borra la
> condición mañana, el banner debe seguir diciendo **por qué se transfirió entonces**. Es la misma
> lógica por la que `lead.delete` guarda el lead entero en `antes`. La `key` se conserva para poder
> trazar y, en el futuro, filtrar.

### 3. Prioridad: las extra van **después de las cuatro de fábrica**, en el orden del array

`explicitRequest` → `keyword` → **extras (orden del array)** → `lowConfidence` → `intentPurchase`.

> Las extra son texto, así que se evalúan en `evaluarAntesDeGenerar`, que es **gratis**: no llama al
> modelo. Que por eso queden por delante de `lowConfidence` e `intentPurchase` no es un accidente,
> es el mismo criterio que ya pone `keyword` delante de las dos: si la conversación se va a una
> persona, pagar una generación para tirarla es gasto y latencia puros. Y detrás de las cuatro de
> fábrica porque la prioridad entre ellas **la fija el producto**, como dice `ai-handoff.types.ts:4-9`.

### 4. El destino pasa a ser una **estrategia explícita**, no un `null` con dos significados

```
estrategiaDestino: 'primero' | 'menor_carga' | 'fijo'
```

Hoy `asesorDestinoId: null` significa «el primero». Meter «el de menos carga» como un segundo
centinela sobre un campo `ObjectId | null` no cabe en el tipo, y hacerlo con una cadena mágica
obligaría a que un campo de identidad dejara de ser una identidad.

> **Sin script de migración.** `toDTO` deriva la estrategia de los documentos ya guardados:
> `asesorDestinoId ? 'fijo' : 'primero'`. Un tenant que nunca abra esta pantalla se comporta
> exactamente igual que hoy.

### 5. «Asignación activa» = **conversación no cerrada**

`asesorId = X` y `estadoComercial` **no** en `['pagado', 'perdido']`, es decir `nuevo`,
`en_gestion` y `pago_pendiente`.

> Es la lectura literal de la máquina de estados de `docs/domain.md` §3: los tres primeros son
> estados vivos y los dos últimos son cierres. Sin ventana temporal: `estadoComercial` **no registra
> fecha de cierre**, así que cualquier corte por fechas mediría el último mensaje, no el trabajo. Y
> cuenta también lo asignado a mano (HU-OMNI-02): la carga de un asesor es la que tiene, venga de
> donde venga.

### 6. `aggregateScoped` entra en el repositorio base

Un helper que **antepone siempre** `{ $match: { tenantId } }` al pipeline, con el `tenantId`
convertido a `ObjectId`. Toca el archivo más sensible del proyecto, así que entra con su propio test
de aislamiento y es el único sitio donde esta historia escribe una agregación.

> **Convertir a `ObjectId` es la razón de existir del helper**, no un detalle: es el hueco 5. Cada
> llamador que lo hiciera por su cuenta podría olvidarlo y obtener una respuesta vacía sin error.

## Alcance

Incluye:

**Modificación 1 — quitar «Así lo recibe el modelo»**
- Se borra `SystemPromptPreview.tsx` **entero** (uso único) y su montaje en `AssistantConfigForm`.
- Se retira el test de la vista previa en `AssistantConfigPage.test.tsx` y su mención en la cabecera.

**Modificación 2 — condiciones de transferencia propias**
- `condicionesExtras` en tipos, modelo, DTO, validación Zod y valores de fábrica (`[]`).
- Evaluación en `evaluarAntesDeGenerar`, tras las dos reglas de texto fijas.
- `HandoffMotivo` gana `custom`; `Cliente.handoffCondicion` guarda `{ key, nombre }`.
- El DTO de la bandeja y `HandoffBanner` pintan el nombre que puso el admin.
- Botón «Añadir condición» al final de «Cuándo transferir» + modal (`Dialog` de shadcn) con nombre y
  lista de palabras; las condiciones creadas se pintan como una `TriggerCard` más, editable y
  borrable.

**Modificación 3 — renombrar la sección**
- «Qué pasa al transferir» → **«Asignación y aviso»**, con la sub-línea ajustada.

**Modificación 4 — reparto por carga**
- `estrategiaDestino` en tipos, modelo, DTO y Zod, derivada en lectura para los documentos viejos.
- `asesorConMenorCarga(tenantId)` en `ai-handoff.service.ts`, sobre `aggregateScoped`.
- `resolverDestino` pasa a recibir la estrategia; conserva su fallback actual.
- Tercera opción en el `Select` de «Asesor que la recibe».

**Modificación 5 — modal de asignación por asesor**
- `aggregateScoped` en `base.repository.ts`.
- `GET /api/ai/handoff-rules/asesores/metricas`, `authorize(['admin'])`, validación Zod.
- Modal con tabla + barras CSS proporcionales, **sin librería de gráficos**.

**Documentación**
- `docs/data-model.md`: `handoff_settings.condicionesExtras` y `estrategiaDestino`;
  `clientes.handoffCondicion`.
- `docs/api-contract.md` §6: el endpoint de métricas y el cuerpo ampliado del `PUT`.
- `docs/domain.md` §5 (o donde vive el handoff): la prioridad con las condiciones extra dentro.
- `docs/multi-tenancy.md`: `aggregateScoped` en la lista de funciones del repositorio.

Fuera de alcance:

- **Condiciones extra de otro tipo** (horario, tiempo sin respuesta, canal). El array queda listo
  para un discriminante, pero cada tipo es un evaluador nuevo en el worker: es otra historia.
- **Un motivo distinto por cada condición extra.** `HandoffMotivo` gana un solo valor; el detalle
  vive en `handoffCondicion`. Una unión dinámica rompería el tipo cerrado que usan cuatro capas.
- **Reparto por carga en la asignación manual** (HU-OMNI-02). Esta historia solo cambia a quién
  transfiere **Sofi**; el `PATCH /assign` sigue siendo una elección explícita de una persona.
- **Métricas con rango temporal.** `estadoComercial` no guarda fecha de cierre, así que «pagados
  este mes» hoy no se puede calcular sin inventar el dato. El modal muestra totales y lo dice.
- **Métricas de tiempo de respuesta o de conversión.** Exigirían recorrer `messages`; el modal es
  una ayuda para decidir el destino, no un tablero de BI. Eso es CRM-04.
- **Persistir el orden de las condiciones extra con drag & drop.** El orden es el del array y se
  edita añadiendo o quitando; reordenar es otra interacción y otro control.
- **Rehacer `AiResponseContextSheet`.** La modificación 1 solo quita la vista previa simulada; el
  visor del prompt real no se toca.

## Criterios de aceptación

1. **La vista previa desaparece por completo.** No queda `SystemPromptPreview.tsx`, ni su import, ni
   su render, ni el test que la comprobaba; `pnpm --filter @sofiapp/web lint` no reporta ningún
   import ni export sin usar.
2. **La pantalla del asistente sigue haciendo lo suyo.** Precargar, editar, validar, guardar y
   descartar siguen pasando sus tests: quitar la vista previa no toca ningún otro comportamiento.
3. **Un admin puede crear una condición propia.** Desde «Cuándo transferir», un botón abre un modal
   que pide nombre y palabras; al guardar, la condición aparece como una tarjeta más de la lista.
4. **La condición extra tiene clave estable.** La `key` se deriva del nombre al crearla y **no
   cambia al renombrarla**, igual que en `contact_options` y en los atributos del contacto.
5. **No se admiten condiciones inválidas.** Nombre de 2 a 40 caracteres; al menos una palabra;
   mismas reglas de término que las listas existentes (2 a 80, máximo 30); sin `key` ni nombre
   repetidos (comparando sin mayúsculas ni tildes); máximo 10 condiciones extra. Todo rechazado en
   el borde con `400`, no en el servicio.
6. **Una condición extra transfiere.** Con la transferencia activa y la condición encendida, un
   mensaje del cliente que contenga una de sus palabras dispara el handoff **sin llamar al modelo**.
7. **La prioridad es la acordada y está testeada.** `explicit_request` → `keyword` → extras (orden
   del array) → `low_confidence` → `intent_purchase`. Un mensaje que cumple una regla fija y una
   extra a la vez dispara **la fija**.
8. **La coincidencia es por palabra completa**, sin distinguir mayúsculas ni tildes: exactamente la
   misma función que ya usan `explicitRequest` y `keyword`, no una copia.
9. **Una condición apagada no dispara**, y con el interruptor maestro apagado no dispara ninguna.
10. **La bandeja dice qué condición fue.** La conversación transferida guarda
    `handoffCondicion: { key, nombre }` y `HandoffBanner` muestra el nombre que puso el admin, no
    «Escribió una palabra clave».
11. **El nombre sobrevive al renombrado.** Si el admin renombra o borra la condición, el banner de
    una conversación ya transferida sigue mostrando el nombre que tenía al transferirse.
12. **Sin migración de datos.** Un tenant con configuración guardada antes de esta historia la lee
    sin error, con `condicionesExtras: []` y la estrategia derivada, y se comporta **exactamente
    igual que antes**. Test explícito sobre un documento sin los campos nuevos.
13. **La sección se llama «Asignación y aviso».**
14. **Existe la estrategia «menor carga».** El `Select` ofrece tres opciones y guardar una de ellas
    persiste `estrategiaDestino`; con `'menor_carga'` y `'primero'`, `asesorDestinoId` se guarda
    como `null`.
15. **Estrategia y asesor no se contradicen.** Zod rechaza con `400` un cuerpo con
    `estrategiaDestino: 'fijo'` sin `asesorDestinoId`, y uno con `asesorDestinoId` y una estrategia
    distinta de `'fijo'`.
16. **El reparto por carga elige de verdad al de menos.** Con tres admins activos y carteras
    distintas, el handoff asigna al de menor número de conversaciones activas. Ante un empate, el
    primero por nombre — el reparto tiene que ser explicable, no aleatorio.
17. **«Activa» es lo acordado.** Cuentan `nuevo`, `en_gestion` y `pago_pendiente`; no cuentan
    `pagado` ni `perdido`. Test que lo fija estado por estado.
18. **El reparto nunca deja la conversación sin dueño.** Si no hay admins activos, o el agregado
    falla, se cae a `primerAdminActivo` y de ahí a no asignar, sin lanzar: el handoff se ejecuta
    igual. Es la misma promesa que ya cumple `resolverDestino`.
19. **`aggregateScoped` antepone el `$match` y castea el `tenantId`.** Un pipeline que llegue con su
    propio `$match` no puede saltarse el del tenant, y un `tenantId` en forma de string devuelve los
    mismos documentos que el mismo id como `ObjectId`. Los dos casos, con test.
20. **El endpoint de métricas devuelve un admin activo por fila**, con su asignación activa y su
    cartera desglosada por `estadoComercial`, incluidos los que tienen cero (un asesor sin trabajo
    es justo el que hay que ver). Un asesor desactivado no aparece.
21. **El modal se abre desde el `Select` y pinta la tabla.** Botón «Ver asignación» junto a «Asesor
    que la recibe»; el modal muestra tabla con barras proporcionales, **sin ninguna dependencia de
    gráficos nueva** en `package.json`.
22. **El modal tiene sus tres estados.** Cargando (esqueletos), vacío (ningún admin activo, con una
    frase que dice qué hacer) y error (con reintento). Se refresca al abrirlo.
23. **Aislamiento multi-tenant.** El endpoint de métricas de tenantA no cuenta ni una conversación
    de tenantB; `aggregateScoped` no devuelve documentos de otro tenant aunque el pipeline traiga su
    propio `$match`; la resolución por carga solo mira admins y clientes del tenant del job; el
    `PUT` con un `asesorDestinoId` de otra empresa sigue respondiendo `404`. Toda lectura y escritura
    nueva pasa por el repositorio `*Scoped` y el `tenantId` nace del token. Tests de aislamiento
    añadidos y en verde.
24. **Backend en verde:** `pnpm --filter @sofiapp/api typecheck` (`tsc --noEmit`) y
    `pnpm --filter @sofiapp/api test` sin errores ni regresiones.
25. **Frontend en verde:** `pnpm --filter @sofiapp/web build`, `lint` y `test` sin errores, con el
    modal y las tarjetas terminados en claro y oscuro usando los tokens semánticos del proyecto y
    sin utilidades de color arbitrarias.

## Definition of Done

Un admin abre «Transferencia a un asesor». Baja hasta el final de «Cuándo transferir», pulsa
«Añadir condición», escribe «Facturación» y las palabras `factura`, `recibo`, `nit`. La condición
aparece como una tarjeta más, encendida.

Más abajo, en **«Asignación y aviso»**, pulsa «Ver asignación» y ve en una tabla que Ana lleva 18
conversaciones activas y Carlos 3. Cierra el modal y cambia «Asesor que la recibe» a **«Quien tenga
menos conversaciones activas»**. Guarda.

Esa tarde un cliente escribe «necesito la factura de mi matrícula». Sofi no responde: transfiere. La
conversación le llega a Carlos —el de menos carga—, y sobre el hilo se lee «Sofi te pasó esta
conversación · facturación». Un mes después el admin renombra la condición a «Cobros»: esa
conversación **sigue diciendo «facturación»**, porque es lo que era cuando pasó.

## Dependencias

- `HU-IA-03` — `HandoffSettings`, el motor de evaluación, `resolverDestino`, `HandoffBanner` y
  `MOTIVO_LABEL` → **implementado**. Esta historia **amplía** el documento de configuración, el
  motor y la unión `HandoffMotivo`, así que `ai-handoff.service.test.ts` y
  `ai-handoff.routes.test.ts` se adaptan sin cambiar el comportamiento existente.
- `HU-IA-01` — `AssistantConfigForm` y `SystemPromptPreview` → **implementado**. La modificación 1
  se limita a esa pantalla.
- `HU-IA-04` — `AiResponseContextSheet`, que muestra el prompt **real** y es lo que hace prescindible
  la vista previa simulada → **implementado**.
- `HU-OMNI-02` — `Cliente.asesorId`, su índice `{ tenantId, asesorId }`, `assertAssignableAdmin` y
  `listTenantUsers` → **cerrada**. Es el baseline de las métricas.
- `HU-CRM-01` / `HU-CRM-02` — la máquina de `estadoComercial` con su índice, y el patrón de `key`
  estable derivada del label (`contact_options`, `atributos`) → **cerradas**.
- `INF-02` — el repositorio tenant-safe. Esta historia lo **amplía** con `aggregateScoped`, que es el
  único cambio de la historia sobre la regla número uno del proyecto.
