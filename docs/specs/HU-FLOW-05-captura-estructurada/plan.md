# HU-FLOW-05 — Plan técnico (CÓMO)

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

docs/
├── data-model.md · domain.md · api-contract.md
└── adr/0013-catalogo-campos-contacto.md           # NUEVO
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
- `.test-chat/00-flows-documentation.md` (fuera de git) se actualiza al final para reflejar el destino
  y la corrección del motor.

## Verificación

- `pnpm --filter @sofiapp/api typecheck` · `pnpm --filter @sofiapp/api test`
- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint && pnpm --filter @sofiapp/web test`
- Checklist de PR de `docs/multi-tenancy.md` §9.
