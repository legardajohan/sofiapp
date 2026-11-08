# HU-FLOW-05 — Plan técnico (CÓMO)

> Partes: A–F captura estructurada y motor · **G–J editor de flujos** (errores, borrado, nombres).

## Archivos a crear / tocar

```
apps/backend/src/
├── features/contact-field/                       # NUEVO (patrón de 6 archivos)
│   ├── contact-field.types.ts                    # IContactField, TipoDatoCampo, DTOs, CLAVES_RESERVADAS
│   ├── contact-field.model.ts                    # contact_fields + índices { tenantId, key } y { tenantId, labelNormalizado } únicos
│   ├── contact-field.validation.ts               # Zod { body, params, query }
│   ├── contact-field.service.ts                  # CRUD + archivar + getCamposActivosPorKey + assertKeysDelCatalogo
│   ├── contact-field.controller.ts
│   ├── contact-field.routes.ts
│   ├── contact-field.service.test.ts
│   └── contact-field.isolation.test.ts
├── seed/backfill-contact-fields.ts               # NUEVO: backfill idempotente desde Cliente.atributos
├── seed/backfill-contact-fields.test.ts          # NUEVO
├── app.ts                                         # montar /api/campos-contacto + llamar al backfill al arrancar
├── features/flow/
│   ├── flow.types.ts                              # DestinoCaptura, config captura, Efecto guardar_dato, EntradaMotor.contacto
│   ├── flow.validation.ts                         # destino / saltarSiExiste / sobrescribir (opcionales)
│   ├── flow.service.ts                            # canonizar `campo`/`tipoDato` y validar keys contra el catálogo
│   ├── flow.engine.ts                             # captura: saltarSiExiste, efecto guardar_dato, captura fallida
│   ├── flow.runtime.service.ts                    # FIX efectos acumulados; snapshot de contacto; spec de rol; ejecutar guardar_dato
│   ├── flow.engine.test.ts                        # casos nuevos de captura
│   ├── flow.runtime.service.test.ts               # regresión del bug + guardar_dato
│   ├── flow.validation.test.ts                    # destino
│   └── flow.isolation.test.ts                     # key de otro tenant
├── features/cliente/
│   ├── cliente.types.ts                           # DestinoContacto, GuardarDatoResultado
│   ├── cliente.validation.ts                      # atributos: key obligatoria (label/sensible ignorados)
│   ├── cliente.service.ts                         # guardarDatoDesdeFlujo + updateCliente valida keys del catálogo
│   └── cliente.guardar-dato.test.ts               # NUEVO
└── features/sandbox/sandbox.types.ts              # SandboxEfecto `dato_guardado`

apps/frontend/src/
├── features/contacts/
│   ├── api.ts · types.ts                          # endpoints y tipos de campos personalizados
│   ├── hooks/useContactFields.ts                  # NUEVO (TanStack Query)
│   ├── components/CamposPersonalizadosManager.tsx # NUEVO (dialog shadcn)
│   ├── components/CampoPersonalizadoSelect.tsx    # NUEVO (select/combobox con "Crear campo…")
│   ├── components/AtributosEditor.tsx             # usa el selector del catálogo
│   └── components/*.test.tsx                      # manager + editor
├── features/flows/
│   ├── types.ts                                   # DestinoCaptura en la config de captura
│   └── components/NodeInspector.tsx               # CapturaForm: "Guardar en" + interruptores
│   └── components/CapturaForm.test.tsx            # NUEVO (o extraer CapturaForm a su archivo)
└── features/assistant-sandbox/
    ├── types.ts                                   # efecto dato_guardado
    └── components/SandboxEffectCard.tsx           # tarjeta "Dato guardado"

packages/shared/src/
├── flow-graph.ts                                  # NUEVO: analizarGrafo (pura) + tipos ErrorGrafo
├── flow-graph.test.ts                             # NUEVO
└── index.ts                                       # exporta flow-graph

(backend, además) features/flow/: flow.validation.ts (dos niveles, `nombre`), flow.service.ts (advertencias /
FLOW_CON_ERRORES al activar), flow.model.ts (`nombre` en el nodo), flow.controller.ts (devuelve `advertencias`).
(frontend, además) features/flows/: lib/graph.ts (adaptador nodos/edges de React Flow → analizarGrafo),
hooks/useGraphErrors.ts, hooks/useSaveFlow.ts, components/FlowCanvas.tsx (teclas), components/nodes/FlowNode.tsx
(rojo/verde, nombre), components/NodeInspector.tsx (campo Nombre), components/DestinoSelect.tsx (nombres),
pages/FlowEditorPage.tsx (barra de errores, Activar).

docs/
├── data-model.md · domain.md · api-contract.md
└── adr/0015-catalogo-campos-contacto.md           # NUEVO
```

## Contratos

### A. Corrección del motor (`flow.runtime.service.ts` → `correrMotor`)

Hoy cada ronda reemplaza `salida`, y solo se ejecutan `salida.efectos` de la **última**. Los efectos
de las rondas que terminaron en `requiere` se pierden. `avanzar` reinicia `efectos = []` en cada
llamada y retoma desde el nodo pendiente, así que acumular **no duplica** nada:

```ts
const efectos: Efecto[] = [];
for (let ronda = 0; ronda < TOPE_RESOLUCIONES; ronda += 1) {
  salida = avanzar({ flow, state: estadoActual, mensaje, resueltos, contacto });
  efectos.push(...salida.efectos);          // ← antes solo se usaban los de la última ronda
  if (!salida.requiere) break;
  resueltos = await resolverRequiere(...);
  estadoActual = { ... };
}
// ejecutar `efectos` (no `salida.efectos`) y persistir `salida` como hoy
```

El orden de ejecución sigue siendo el de los nodos. `programar_espera` se sigue interceptando igual.

**Captura fallida.** `resolverRequiere('captura')` devuelve `capturado: undefined` cuando la IA no
extrae nada, y el motor vuelve a pedir la extracción en la siguiente ronda (bucle hasta 5). Se añade
`resueltos.capturaFallida: true`; con ella el nodo devuelve `esperandoRespuesta: true` **sin**
`requiere`. Un valor que no supera la validación del criterio 11 **no** cuenta como fallido: avanza.

### B. `contact-field`

```ts
export const TIPOS_DATO_CAMPO = ['texto', 'numero', 'fecha', 'booleano'] as const;
export type TipoDatoCampo = (typeof TIPOS_DATO_CAMPO)[number];

export const CAMPOS_FIJOS_CONTACTO = ['nombre', 'correo', 'documento', 'rolContacto'] as const;
export type CampoFijoContacto = (typeof CAMPOS_FIJOS_CONTACTO)[number];
/** Normalizadas (minúsculas, sin tildes ni separadores). Incluye sinónimos obvios. */
export const CLAVES_RESERVADAS: ReadonlySet<string>; // nombre, name, correo, email, documento, telefono, celular, rol, rolcontacto, nivelinteres, objecionprincipal…

export interface IContactField {
  tenantId: Types.ObjectId;
  key: string;               // slug del label al crear; inmutable
  label: string;
  labelNormalizado: string;  // para la unicidad sin tildes/mayúsculas
  tipoDato: TipoDatoCampo;
  sensible: boolean;
  orden: number;
  activo: boolean;
}
export interface IContactFieldResponse { id; key; label; tipoDato; sensible; orden; activo }
export interface CreateContactFieldDTO { label: string; tipoDato: TipoDatoCampo; sensible?: boolean }
export interface UpdateContactFieldDTO { label?: string; tipoDato?: TipoDatoCampo; sensible?: boolean; orden?: number }
```

Índices: `{ tenantId: 1, key: 1 }` único · `{ tenantId: 1, labelNormalizado: 1 }` único ·
`{ tenantId: 1, activo: 1, orden: 1 }`.

Servicio (todo con `*Scoped`):
- `listContactFields(tenantId, { incluirArchivados })`
- `createContactField` → slug con el helper existente de `contact-option`; `400` si la clave o el
  label normalizado son reservados; `409` si ya existen en el tenant.
- `updateContactField` (no toca `key`) · `archiveContactField` (`activo: false`).
- `getCamposPorKey(tenantId, keys)` → `Map<key, IContactField>` (para cliente y flow).
- `assertKeysDelCatalogo(tenantId, keys, { permitirArchivadas })` → `AppError 400` con la key ofensora.

Endpoints (cadena fija `authenticateJWT → requireTenant → authorize(['admin']) → validate → asyncHandler`):

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/campos-contacto?incluirArchivados=` | `200 IContactFieldResponse[]` |
| POST | `/api/campos-contacto` | `201` · `400` reservado/validación · `409` duplicado |
| PATCH | `/api/campos-contacto/:id` | `200` · `404` · `409` |
| DELETE | `/api/campos-contacto/:id` | `204` (archiva) · `404` |

**Backfill** (`seed/backfill-contact-fields.ts`): por tenant, `aggregate` sobre `clientes`
(`$match tenantId` → `$unwind atributos` → `$group` por `key` con primer `label` y `$max sensible`),
y `createScoped` de las claves que falten. Si una key choca con una reservada o un label repetido se
registra en el log y se omite. Se ejecuta al arrancar, junto a `backfillContactOptions`.

### C. `captura` en flujos

```ts
export type DestinoCaptura =
  | { tipo: 'variable' }
  | { tipo: 'contacto'; campo: CampoFijoContacto }
  | { tipo: 'atributo'; key: string };

// ConfigNodo, rama 'captura' (campos nuevos opcionales para no romper flujos guardados)
{ tipo: 'captura'; campo; descripcion; tipoDato; pregunta; reintentos;
  destino?: DestinoCaptura; saltarSiExiste?: boolean; sobrescribir?: boolean }

// Efecto nuevo
| { tipo: 'guardar_dato'; destino: Exclude<DestinoCaptura, { tipo: 'variable' }>; valor: unknown; sobrescribir: boolean }

// EntradaMotor
contacto?: Record<string, string>;   // snapshot: nombre, correo, documento, rolContacto y atributos por key
```

**Zod (`flow.validation.ts`):** `destino` como `discriminatedUnion` estricta; `saltarSiExiste` y
`sobrescribir` booleanos opcionales. El schema solo valida la forma; la existencia de la key es
del servicio (necesita `tenantId`).

**Servicio (`createFlow` / `updateFlow`):** antes de guardar, por cada `captura` con destino:
- `contacto` → `campo = destino.campo`, `tipoDato = 'texto'`.
- `atributo` → `assertKeysDelCatalogo(tenantId, keys)`; `campo = key`, `tipoDato = catalogo.tipoDato`.
- Defaults explícitos: `saltarSiExiste ?? true`, `sobrescribir ?? false`.

**Motor (`flow.engine.ts`, rama `captura`)** — sigue siendo puro:
1. Primer paso al nodo con destino ≠ variable, `saltarSiExiste` y `entrada.contacto[campo]` no vacío
   → `variables[campo] = valor guardado`, avanza por la salida lineal **sin** enviar la pregunta.
2. Capturado → `variables[campo] = valor` y, si destino ≠ variable, efecto `guardar_dato`.
3. `resueltos.capturaFallida` → sigue esperando sin `requiere`.

**Runtime (`flow.runtime.service.ts`):**
- Carga el snapshot `contacto` **una vez** por mensaje (`findByIdScoped(Cliente)` + `getCamposPorKey`)
  y lo pasa a `avanzar`. Dentro del turno el motor actualiza `variables`, que es lo que leen las
  condiciones siguientes.
- `resolverRequiere('captura')` con destino `rolContacto`: amplía la `descripcion` del `SlotSpec` con
  las opciones activas (`listContactOptionsByTipo(tenantId, 'rol')`, "devuelve exactamente una de
  estas claves: …"). Con un atributo, usa el `tipoDato` del catálogo.
- `ejecutarEfecto('guardar_dato')` → `guardarDatoDesdeFlujo(...)`; si escribió, emite el efecto de
  prueba `dato_guardado`. Como el resto, traga su error y lo registra.

### D. `cliente`

```ts
export async function guardarDatoDesdeFlujo(
  tenantId: TenantId,
  clienteId: string,
  destino: { tipo: 'contacto'; campo: CampoFijoContacto } | { tipo: 'atributo'; key: string },
  valor: unknown,
  opciones: { sobrescribir: boolean },
): Promise<{ escrito: boolean; motivo?: 'ya_existia' | 'invalido' | 'campo_archivado' }>;
```
- Valida el valor (criterio 11): email con Zod, rol con `assertOpcionesValidas`, atributo según su
  `tipoDato` (normaliza `numero`/`booleano`/`fecha` a texto).
- `correo`/`documento` → `correoEnc`/`documentoEnc` mediante el helper de `utils/field-crypto.util`
  (mismo camino que `updateCliente`).
- Atributo: `findOneAndUpdateScoped` con fusión por `key` (`$set` del elemento existente vía
  `arrayFilters`, o `$push` si no está); `label`/`sensible` del catálogo. Respeta el máximo de 30.
- `AuditEvent` `cliente.update`, actor `ACTOR_SISTEMA_FLUJO`, con el enmascarado de HU-CRM-02.
  `ACTOR_SISTEMA_FLUJO` se mueve a una constante compartida (hoy es privada del runtime).

`updateCliente`: después de la validación de permisos, `assertKeysDelCatalogo(tenantId, keys nuevas,
{ permitirArchivadas: false })` + permitir archivadas solo si ya estaban en el contacto; reescribir
`label`/`sensible` desde el catálogo. `cliente.validation.ts`: `label` y `sensible` pasan a opcionales
(se ignoran) para no romper clientes que aún los envían.

### E. Sandbox

`SandboxEfecto` gana `{ tipo: 'dato_guardado'; campo: string; valor: string; sensible: boolean }`.
El valor sensible viaja enmascarado (mismo helper de máscara de la ficha).

### F. Frontend

- `features/contacts/api.ts`: `listCamposContacto`, `createCampoContacto`, `updateCampoContacto`,
  `archiveCampoContacto` (vía el `apiClient` único). Hook `useContactFields` con invalidación tras
  mutar.
- `CamposPersonalizadosManager`: `Dialog` + tabla/lista; fila editable inline; `Select` de tipo;
  `Switch` de sensible; archivar con confirmación **en la UI** (sin `confirm()` del navegador).
- `CampoPersonalizadoSelect`: `Select`/combobox shadcn con grupo "Crear campo…".
- `CapturaForm`: `Select` "Guardar en" agrupado; campo de variable en solo lectura con destino;
  `Switch` *Saltar si ya existe* / *Sobrescribir* con texto de ayuda; para rol, chips de las opciones.
- `SandboxEffectCard`: variante `dato_guardado` con icono, etiqueta y valor.

### G. Validación del grafo en dos niveles

**`packages/shared/src/flow-graph.ts`** — pura, sin dependencias de Zod ni de React Flow:

```ts
export type CodigoErrorGrafo =
  | 'NODO_HUERFANO' | 'DESTINO_VACIO' | 'DESTINO_INEXISTENTE' | 'CONTENIDO_INCOMPLETO';
export interface ErrorGrafo { nodoId: string; codigo: CodigoErrorGrafo; mensaje: string }

export interface NodoGrafo {
  id: string;
  nombre?: string;
  config: { tipo: string; /* ramas | etiquetas | salidas | ramaPorDefecto con nodoDestino */ };
}
export function analizarGrafo(
  nodos: readonly NodoGrafo[],
  aristas: readonly { from: string; to: string }[],
  entrada: string,
): ErrorGrafo[];
```

Reglas (las mismas que hoy hay dentro del `superRefine`, ahora sin lanzar):
- `NODO_HUERFANO`: nodo distinto de `entrada` sin arista ni rama entrante.
- `DESTINO_VACIO`: `nodoDestino`/`ramaPorDefecto` igual a `''` en `condicion`, `intencion` o `ia`.
- `DESTINO_INEXISTENTE`: arista o rama que apunta a un id que no está en `nodos`.
- El mensaje usa `nombre` si existe, si no el id: «“Captura grado” no tiene conexión de entrada».
- Los destinos **vacíos no cuentan** como conexión entrante.
- `CONTENIDO_INCOMPLETO`: reglas escritas a mano por tipo de nodo (la lista del criterio 20), con un
  mensaje que dice **qué falta** («“IA Intensivo”: falta el objetivo (mínimo 10 caracteres)»).
- **Consistencia con Zod:** `flow-graph.test.ts` recorre un conjunto de configs y exige que
  `analizarGrafo` no reporte contenido ⇔ `configNodo` estricto (`flow.validation.ts`) las acepte. Así
  las dos listas no se desfasan.

**`flow.validation.ts` — dos esquemas por nodo, uno solo de contenido:**
- `configNodoEstricto` = el `configNodo` actual (con `min(1)`, `min(10)`, `.min(1)` de arrays). Se
  conserva intacto y se usa **solo al activar** (red de seguridad frente a `analizarGrafo`).
- `configNodoGuardable` = el mismo esquema **relajado**: strings sin `min`, `objetivo` solo `max(2000)`,
  `ramas`/`etiquetas`/`salidas` sin mínimo (la `ia` mantiene `max(8)`), `nodoDestino` y `ramaPorDefecto`
  `z.string()`, `tagIds` y `asesorId` aceptan vacío. Sigue `.strict()` y con los tipos/enums/topes
  numéricos (`maxTurnos` 1–10, `minutos` > 0) como errores de forma.
- El `superRefine` conserva solo lo de forma (ids repetidos, `entrada` existente) y **deja de** reportar
  huérfanos y destinos. `nodo` gana `nombre: z.string().trim().min(1).max(60).optional()`.
- El nodo nuevo del editor (`configPorDefecto`) debe ser **guardable** tal cual (campos vacíos): hoy
  habría rebotado con `400`.

**`flow.service.ts`** (`createFlow` / `updateFlow`), tras validar la forma y el catálogo de captura:

```ts
const errores = analizarGrafo(dto.nodos, dto.aristas, dto.entrada);
if (errores.length > 0 && dto.activo === true && !flowYaActivo)
  throw new AppError('El flujo tiene conexiones o nodos sin completar.', 400, { codigo: 'FLOW_CON_ERRORES', errores });
if (errores.length > 0 && flowYaActivo && dto.activo !== false) {
  if (!dto.confirmarDesactivar)                          // sin confirmación: no se guarda nada
    throw new AppError('El flujo activo tiene errores; confirma para guardarlo desactivado.', 409,
      { codigo: 'FLOW_ACTIVO_CON_ERRORES', errores });
  dto = { ...dto, activo: false };                       // con confirmación: se guarda y se desactiva
}
if (dto.activo === true || flowYaActivo) assertConfigsEstrictas(dto.nodos); // red de seguridad
// con errores y sin activar: se guarda con activo: false
return { flow, advertencias: errores };
```

- `desactivarFlowActivo` solo se llama **después** de pasar la validación, para que un `400` no deje al
  tenant sin flujo activo.
- `flowYaActivo` = el documento ya tenía `activo: true` y el DTO no lo desactiva.
- `confirmarDesactivar` es un booleano **opcional del body** (`z.boolean().optional()`, no se persiste).
  La respuesta incluye `desactivado: true` cuando se aplicó. Sin flujo activo tras esto, el motor
  simplemente no interviene (`getFlowActivo` → `null`) y responde Sofi: no hace falta tocar el runtime.
- El `409` y el `400` van antes de `desactivarFlowActivo`/escritura: un rechazo no cambia nada.
- Verificar que `AppError` admite detalles extra; si no, extenderlo en `utils` (sin romper el formato de
  `docs/api-contract.md`: `{ success:false, error:{ code, message, details } }`).
- **Motor:** `avanzar` trata un `nodoDestino` vacío como fin del flujo (criterio 24). Test.

### H. Editor: errores en vivo y activación

- `lib/graph.ts`: convierte `nodes`/`edges` de React Flow al formato de `analizarGrafo`. Las ramas de
  `condicion`/`intencion`/`ia` viven en `node.data.nodo.config`; las aristas lineales, en `edges`.
- **Borrador local** (`hooks/useFlowDraft.ts`): serializa `{ nodos, aristas, entrada, nombre, trigger,
  guardadoEn }` en `localStorage` (clave `flow-draft:<tenantId>:<flowId|nuevo>`), con *debounce* de
  ~1 s y `try/catch` en cada acceso (puede estar bloqueado). Al montar, si hay borrador más nuevo que
  `flow.updatedAt`, muestra un `Alert` con **Recuperar** / **Descartar**. Se borra al guardar bien.
  `useSaveFlow` pasa `onError` a un toast con *Reintentar*; no vacía el estado.
- `useGraphErrors(nodes, edges, entrada)`: `useMemo` sobre `analizarGrafo` → `Record<nodoId, ErrorGrafo[]>`
  y `total`. **Reemplaza** al `nodeErrors` del store como fuente del rojo; `useFlowStore.nodeErrors`
  queda solo para los errores de forma que devuelve el servidor (Zod) y se limpia al editar ese nodo.
- `FlowNode`: tres estados visuales con tokens semánticos del proyecto — **error** (borde `destructive`,
  icono y primera línea del mensaje), **correcto** (indicador verde con check) y **neutro** mientras el
  usuario no ha tocado el nodo. Pasa a verde en el mismo render en que `analizarGrafo` deja de reportarlo.
  `aria-live="polite"` en el contador, no en cada nodo.
- `useSaveFlow`: usa `advertencias` solo para un toast («Guardado con 2 advertencias») y para
  sincronizar; ya no pinta de rojo desde el `400`.
- `ConfirmarGuardadoActivoDialog.tsx` (shadcn `AlertDialog`; instalar con la CLI 3.8.5 si falta):
  lista de nodos con error (con `nombreDeNodo`), el texto del efecto y tres botones. Se abre desde
  `onGuardar` **antes** de llamar a la API cuando `flow.activo && total > 0`; si aun así el servidor
  responde `409 FLOW_ACTIVO_CON_ERRORES` (el cálculo local quedó desfasado), abre el mismo modal con
  los `errores` del servidor. *No guardar* navega a `/flows` y deja el borrador local; *Cancelar*
  devuelve el foco al botón Guardar.
- `FlowEditorPage`: barra con contador (clic → `fitView` al primer nodo con error y selección); *Activar*
  `disabled` con `Tooltip` si `total > 0`; si el servidor responde `FLOW_CON_ERRORES`, se marcan
  `error.details.errores` y se selecciona el primero.

### I. Editor: borrado con teclado

- `FlowCanvas`: `deleteKeyCode={['Delete', 'Backspace']}` (React Flow ignora la tecla con el foco en
  `input`/`textarea`).
- **Verificado en el código:** las líneas de rama se derivan de `config` en `FlowEditorPage.tsx`
  (`edgesDerivados`, ~140-161) con id `derivado_${nodoId}_${handleId}` y **`deletable: false`**, así que
  hoy ni `Supr` ni `Retroceso` pueden borrarlas; solo las aristas lineales (`edgesManuales`) se borran.
  Cambio: `deletable: true` y añadir `data: { nodoId, handleId }` a cada arista derivada.
- `onEdgesDelete(edges)`: por cada arista derivada → `actualizarDestinoDeRama(nodoId, handleId, '')`
  (ya existe, línea ~177); por cada arista lineal → la quita de `edges` (RF ya lo hace con
  `onEdgesChange`).
- **Verificado:** `eliminarNodoSeleccionado` (~234-240) quita el nodo y sus aristas **lineales**, pero
  **no limpia las ramas de otros nodos que lo apuntaban** (referencias colgantes que luego el servidor
  rechaza) y deja `entrada = ''` si era el inicio. Se reemplaza por la función única `borrarNodos(ids)`
  (limpia ramas + bloquea la entrada) usada por el botón y por `onBeforeDelete`.
- `onBeforeDelete`/`onNodesDelete`: rechaza (con toast) borrar el nodo `entrada` si hay más nodos; al
  borrar un nodo, vacía las ramas que lo apuntaban (misma utilidad `limpiarDestino(config, nodoId)`).
- El botón «Eliminar» del inspector reutiliza la misma función que la tecla.

### J. Nombres de nodo

- Backend: `nombre` en `flow.validation.ts` (nodo), `flow.types.ts` (`IFlowNode`) y `flow.model.ts`
  (campo `nombre: { type: String }` en el subesquema del nodo, no dentro de `config`) y en la respuesta.
- Frontend: `FlowNodeData.nombre?`; `NodeInspector` arriba un `Input` *Nombre del nodo* (máx. 60,
  placeholder = título por tipo); `FlowNode` muestra `nombre ?? título`; helper único
  `nombreDeNodo(nodo)` (= `nombre?.trim() || NODE_VISUALS[tipo].label`) usado por el nodo, por
  `DestinoSelect` (opciones `nombre · tipo`) y por los mensajes de `analizarGrafo`.

## Notas

- **Compatibilidad hacia atrás:** los tres campos nuevos de `captura` son opcionales en Zod y en el
  modelo (`config` es `Mixed`). Un flujo viejo se lee como `destino: variable`; no hay migración.
- **Por qué un snapshot y no una ronda de "leer contacto":** cada ronda cuenta para el tope de 5
  resoluciones y el motor debe seguir siendo puro. Leer la ficha una vez por mensaje es barato y
  determinista.
- **Por qué fusionar por `key` y no reutilizar `updateCliente`:** `updateCliente` reemplaza el arreglo
  de atributos completo y exige el flag de permisos de un humano; el flujo escribe un dato y actúa
  como sistema.
- **Sensibles:** el flujo **puede escribir** un atributo sensible (actúa como sistema, no como un
  subrol). La lectura sigue protegida por el gate de HU-CRM-02.
- **Archivado a mitad de un flujo:** si una key se archiva después de guardar el flujo, el runtime no
  escribe (motivo `campo_archivado`), deja el dato en la variable y lo registra en el log. El editor
  marca el nodo con un aviso al abrirlo.
- `.test-chat/00-flows-documentation.md` (fuera de git) se actualiza al final para reflejar el destino,
  la corrección del motor, el guardado con advertencias (§7: el huérfano deja de ser error de guardado),
  los nombres de nodo y el borrado con `Supr`.
- **Tests que cambian de significado:** `flow.validation.test.ts` («un nodo huérfano … → falla») y
  `flow.routes.test.ts:87` («grafo inválido (nodo huérfano) → 400») pasan a «→ 200 con advertencia» al
  guardar y «→ 400 `FLOW_CON_ERRORES`» al activar. El test de «alcanzable solo desde una salida de ia»
  se mueve a `flow-graph.test.ts`.
- **Decisión registrada:** guardar un flujo ya activo con errores exige confirmación explícita
  (`409 FLOW_ACTIVO_CON_ERRORES` → modal → `confirmarDesactivar: true`); al confirmar se guarda
  **inactivo**. Nunca se desactiva en silencio ni se guarda activo con errores.
- **Orden de implementación sugerido:** motor (A) → `analizarGrafo` + backend (G) → editor (H, I, J) →
  captura (B–F). Así el editor nuevo ya trae la validación antes de tocar `CapturaForm`.

## Verificación

- `pnpm --filter @sofiapp/shared typecheck` · `pnpm --filter @sofiapp/shared build` (el backend y el web consumen `dist`)
- `pnpm --filter @sofiapp/api typecheck` · `pnpm --filter @sofiapp/api test`
- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint && pnpm --filter @sofiapp/web test`
- Checklist de PR de `docs/multi-tenancy.md` §9.
