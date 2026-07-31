# HU-CRM-02 — Plan técnico (CÓMO)

> El QUÉ está en `spec.md`; la ejecución en `tasks.md`. Aquí van rutas exactas, contratos y el
> orden en que hay que tocar las cosas.

## Archivos a crear

```
apps/backend/src/
├── features/contact-note/                  # feature nuevo — patrón de 6 archivos
│   ├── contact-note.types.ts               # IContactNote, IContactNoteDocument, CreateNotaDTO, INotaResponse
│   ├── contact-note.model.ts               # colección `contact_notes` + índice { tenantId, clienteId, createdAt:-1 }
│   ├── contact-note.validation.ts          # { body, params, query }
│   ├── contact-note.service.ts             # createNota / listNotas — cifra al escribir, descifra al leer
│   ├── contact-note.controller.ts
│   └── contact-note.routes.ts              # Router({ mergeParams: true })
├── middlewares/
│   ├── authorize-subrol.middleware.ts      # authorizeSubrol + puedeVerDatosSensibles + SUBROLES_DATOS_SENSIBLES
│   └── authorize-subrol.middleware.test.ts
└── utils/
    ├── field-crypto.util.ts                # encryptField / decryptField / isEncrypted
    └── mask.util.ts                        # maskCorreo / maskDocumento / MASK_VALOR

apps/backend/tests/
├── unit/field-crypto.util.test.ts
├── unit/cliente.update.service.test.ts
├── unit/contact-note.service.test.ts
├── isolation/cliente.update.isolation.test.ts
└── isolation/contact-note.isolation.test.ts

apps/frontend/src/features/contacts/        # slice nuevo — mismo precedente que features/leads/
├── api.ts
├── types.ts
├── index.ts
├── lib/errors.ts
├── hooks/{useUpdateContact,useContactNotes,useCreateNota}.ts
└── components/
    ├── ContactEditDialog.tsx     (+ .test.tsx)
    ├── AtributosEditor.tsx
    ├── ContactNotesCard.tsx      (+ .test.tsx)
    └── SensitiveValue.tsx

docs/adr/0006-subrol-datos-sensibles.md
```

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| `apps/backend/src/utils/crypto.util.ts` | Extraer `encryptWith(key, txt)` / `decryptWith(key, txt)`. `encrypt`/`decrypt` quedan como envoltorio sobre la clave de tenant: **sin cambio de firma pública**, así que `channel.service.ts` no se toca. |
| `apps/backend/src/config/env.ts` | Nueva var `DATA_ENC_KEY` (64 hex, `.optional()`, mismo regex que `TENANT_TOKEN_ENC_KEY`). |
| `apps/backend/src/features/cliente/cliente.types.ts` | `IAtributoPersonalizado`; `correoEnc?`, `documentoEnc?`, `atributos` en `ICliente`; `correo`, `documento`, `atributos`, `puedeVerSensibles` en `IContactCardResponse`; `UpdateClienteDTO`; `IAtributoResponse`. |
| `apps/backend/src/features/cliente/cliente.model.ts` | Campos nuevos + subschema `AtributoSchema` (`_id: false`). **Cero índices nuevos** (lo cifrado no se indexa ni se busca). |
| `apps/backend/src/features/cliente/cliente.validation.ts` | `updateClienteSchema` (`.strict()`) y `notasParamsSchema` si hace falta compartirlo. |
| `apps/backend/src/features/cliente/cliente.service.ts` | `updateCliente(...)`; `toContactCardResponse` recibe `puedeVerSensibles`; `toDatosExtraidosResponse` idem; `extractContactData` cifra el `correo` antes de persistir. |
| `apps/backend/src/features/cliente/cliente.controller.ts` | `updateClienteController`; `getContactHistoryController` pasa a calcular y propagar `puedeVerSensibles`. |
| `apps/backend/src/features/cliente/cliente.routes.ts` | `PATCH /:id` con la cadena canónica. |
| `apps/backend/src/features/audit/audit.types.ts` | `AuditAccion` += `'cliente.update'`, `'contact-note.create'`; `AuditEntidad` += `'contact-note'`. |
| `apps/backend/src/app.ts` | Montar `contactNoteRoutes` **antes** de `clienteRoutes`. |
| `apps/backend/tests/unit/contact-history.service.test.ts` | Adaptar a la firma nueva de los mappers. |
| `apps/frontend/src/features/inbox/types.ts` | `correo`, `documento`, `atributos`, `puedeVerSensibles` en `ContactCardDTO`. |
| `apps/frontend/src/features/inbox/components/ContactCard.tsx` | Pinta correo / documento / atributos con `<SensitiveValue>`. |
| `apps/frontend/src/features/inbox/components/ContactPanel.tsx` | Botón "Editar datos" en la cabecera + `<ContactNotesCard>` bajo `LeadCard`. |
| `apps/frontend/src/features/inbox/components/ContactPanel.test.tsx` | Fixtures con los campos nuevos. |
| `apps/frontend/src/lib/roles.ts` | `puedeVerDatosSensibles(user)` — gemelo del helper del backend. |
| `.env.example` | `DATA_ENC_KEY`. |
| `docs/data-model.md`, `docs/domain.md`, `docs/api-contract.md` | Ver §Documentación. |
| `docs/specs/HU-CRM-01-convertir-conversacion-en-lead/spec.md` | La línea "Listado y filtros de leads … → `HU-CRM-02`" pasa a `HU-CRM-03`. |

## Contratos

### `utils/field-crypto.util.ts`

El marcador de versión es lo que hace la lectura retrocompatible: un valor sin prefijo es un dato
legado en plano y se devuelve tal cual, así que no hace falta script de migración para
`datosExtraidos.correo`.

```ts
const MARKER = 'enc:v1:';

/** Cifra con `DATA_ENC_KEY`. Lanza si la clave no está configurada. */
export function encryptField(plaintext: string): string;      // → 'enc:v1:<base64(iv|authTag|ct)>'
/** Descifra si lleva el marcador; si no, devuelve el valor tal cual (dato legado en plano). */
export function decryptField(stored: string): string;
export function isEncrypted(value: string): boolean;
```

`crypto.util.ts` queda como:

```ts
export function encryptWith(key: Buffer, plaintext: string): string;   // base64(iv|authTag|ct)
export function decryptWith(key: Buffer, ciphertext: string): string;
export function encrypt(plaintext: string): string;   // = encryptWith(tenantKey, …)  — sin cambios para quien lo usa
export function decrypt(ciphertext: string): string;
```

### `utils/mask.util.ts`

```ts
export const MASK_VALOR = '••••••';
export function maskCorreo(correo: string): string;      // 'diego@empresa.com' → 'd••••@empresa.com'
export function maskDocumento(doc: string): string;      // '1085271234' → '••••1234'
```

El dominio del correo **no** se enmascara a propósito: es lo que permite a un `coordinator`
confirmar "sí, ya tenemos su correo corporativo" sin ver la cuenta. El documento conserva los
últimos 4 dígitos por la misma razón (cotejar sin exponer).

### `middlewares/authorize-subrol.middleware.ts`

```ts
export const SUBROLES_DATOS_SENSIBLES = ['director', 'manager'] as const;

/** `admin` sin `subrol` ⇒ true: los usuarios que ya existen no tienen ninguno (retrocompat AUTH-02). */
export function puedeVerDatosSensibles(user: SafeUser): boolean;

/** 403 `{ message: 'Acceso denegado.' }` — mismo cuerpo que `authorize`, para no revelar el motivo. */
export function authorizeSubrol(subroles: readonly AdminSubrol[]): RequestHandler;
```

### `cliente.types.ts`

```ts
export interface IAtributoPersonalizado {
  key: string;        // slug 1..40, /^[a-z0-9][a-z0-9_-]*$/
  label: string;      // 1..60
  valor: string;      // 1..500; cifrado (con marcador) cuando `sensible`
  sensible: boolean;
}

export interface UpdateClienteDTO {
  nombre?: string | null;
  correo?: string | null;
  documento?: string | null;
  nivelInteres?: NivelInteres | null;
  objecionPrincipal?: Objecion | null;
  rolContacto?: RolContacto | null;
  atributos?: IAtributoPersonalizado[];
}

export interface IAtributoResponse { key: string; label: string; valor: string; sensible: boolean; oculto: boolean; }
```

`IContactCardResponse` gana `correo: string | null`, `documento: string | null`,
`atributos: IAtributoResponse[]` y `puedeVerSensibles: boolean`.

### `cliente.model.ts`

```ts
const AtributoSchema = new Schema<IAtributoPersonalizado>(
  { key: { type: String, required: true },
    label: { type: String, required: true },
    valor: { type: String, required: true },
    sensible: { type: Boolean, default: false } },
  { _id: false },
);
// en ClienteSchema:
correoEnc:    { type: String },
documentoEnc: { type: String },
atributos:    { type: [AtributoSchema], default: [] },
```

Sin índices nuevos: un valor cifrado con IV aleatorio no es comparable, así que indexarlo solo
gastaría espacio.

### `cliente.validation.ts`

```ts
export const updateClienteSchema = z.object({
  body: z.object({
    nombre: z.string().trim().min(1).max(120).nullable().optional(),
    correo: z.string().trim().email().max(160).nullable().optional(),
    documento: z.string().trim().min(4).max(40).nullable().optional(),
    nivelInteres: z.enum(['frio','tibio','caliente']).nullable().optional(),
    objecionPrincipal: z.enum(['precio','tiempo','confianza','otra']).nullable().optional(),
    rolContacto: z.enum(['decisor','usuario','desconocido']).nullable().optional(),
    atributos: z.array(atributoSchema).max(30).optional(),
  }).strict()                                   // ← criterio 2: la clave desconocida falla en el borde
   .refine((b) => Object.keys(b).length > 0, 'Debes enviar al menos un campo.'),
  params: z.object({ id: objectId }),
  query: empty,
});
```

`atributos` viaja **completo** (reemplazo, no merge): es una lista corta y editable de golpe en la
UI, y un merge por `key` obligaría a inventar una semántica de borrado que el array ya resuelve.

### `cliente.service.ts` — `updateCliente`

```ts
export async function updateCliente(
  tenantId: TenantId,
  actorId: string,
  clienteId: string,
  dto: UpdateClienteDTO,
  puedeVerSensibles: boolean,
): Promise<IContactCardResponse>;
```

Orden de operaciones — **valida todo antes de escribir**, igual que `createLeadFromConversation`:

1. Si el DTO toca `correo`, `documento` o algún atributo `sensible` y `!puedeVerSensibles` →
   `AppError('No tienes permiso para editar los datos sensibles del contacto.', 403)`. Todo-o-nada:
   no se escribe ni la parte permitida (criterio 6).
2. `findByIdScoped(Cliente, tenantId, clienteId)` → `null` ⇒ `AppError('Contacto no encontrado.', 404)`.
   Un id de otro tenant es indistinguible de uno inexistente (criterio 13).
3. Construir `$set` / `$unset`: `null` ⇒ `$unset`; valor ⇒ `$set`. `correo`/`documento` se cifran a
   `correoEnc`/`documentoEnc`; los atributos `sensible` se cifran valor a valor.
4. `findOneAndUpdateScoped(Cliente, tenantId, { _id }, update, { new: true })`.
5. `recordAuditEvent(tenantId, { actorId, accion: 'cliente.update', entidad: 'cliente', entidadId,
   antes, despues })` con los sensibles reducidos a `'[cifrado]'` (criterio 8). No bloquea: el
   helper ya traga sus propios errores.
6. `toContactCardResponse(actualizado, tags, leadId, puedeVerSensibles)`.

### `contact-note`

```ts
// model — colección `contact_notes`
{ tenantId, clienteId, autorId, textoEnc }   // + timestamps
// índice: { tenantId: 1, clienteId: 1, createdAt: -1 }   ← la lista pagina por ahí

// service
export async function createNota(tenantId, autorId, clienteId, texto): Promise<INotaResponse>;
export async function listNotas(tenantId, clienteId, page, limit): Promise<IPaginated<INotaResponse>>;

// INotaResponse
{ id: string; texto: string; autor: { id: string; nombre: string | null }; createdAt: string }
```

`createNota` valida el `clienteId` contra el tenant con `findByIdScoped(Cliente, …)` **antes** de
escribir (`404` si no existe): es la única vía por la que un id ajeno podría entrar.
`listNotas` hidrata autores en lote con `findUsersByIds`, una consulta por página.

### Endpoints y cadena de middlewares

| Método | Ruta | Cadena |
|---|---|---|
| `PATCH` | `/api/clientes/:id` | `authenticateJWT → requireTenant → authorize(['admin']) → validate(updateClienteSchema) → asyncHandler` |
| `POST` | `/api/clientes/:clienteId/notas` | `authenticateJWT → requireTenant → authorize(['admin']) → authorizeSubrol(SUBROLES_DATOS_SENSIBLES) → validate → asyncHandler` |
| `GET` | `/api/clientes/:clienteId/notas` | idem |

El `PATCH` **no** lleva `authorizeSubrol`: su gate es por campo, dentro del service, para que un
`coordinator` conserve la edición de los campos no sensibles (criterio 6). Las notas sí lo llevan a
nivel de ruta, porque son sensibles enteras (criterio 7).

### Montaje en `app.ts`

```ts
app.use('/api/clientes/:clienteId/notas', contactNoteRoutes);   // ← antes
app.use('/api/clientes', clienteRoutes);
```

Mismo criterio de orden que `/api/kb/faqs` antes de `/api/kb`: la ruta más específica primero.
`contact-note.routes.ts` usa `Router({ mergeParams: true })` para que `:clienteId` llegue al
controller.

## Frontend

### `features/contacts/`

```ts
// api.ts — rutas SIN el prefijo /api (lo aporta el baseURL del apiClient)
export async function updateContact(id: string, payload: ContactPatchPayload): Promise<ContactCardDTO>;
export async function fetchNotas(clienteId: string, page: number): Promise<Paginated<NotaDTO>>;
export async function createNota(clienteId: string, texto: string): Promise<NotaDTO>;
```

Hooks TanStack Query, siguiendo el patrón de `features/leads/hooks`:

- `useUpdateContact(clienteId)` → invalida `['contact-history', clienteId]` y `['conversations']`
  (el `nombre` se pinta también en la lista de la bandeja).
- `useContactNotas(clienteId)` → `queryKey: ['contact-notas', clienteId]`, `enabled: !!clienteId`.
- `useCreateNota(clienteId)` → invalida `['contact-notas', clienteId]`.

Errores: `lib/errors.ts` con el extractor `axios.isAxiosError → response.data.message`, igual que
`features/leads/lib/errors.ts`. Un `403` en las notas **no es un error a mostrar**: la tarjeta
simplemente no se renderiza (criterio 12), así que el hook distingue ese status.

### Componentes

- **`SensitiveValue`** — recibe `{ valor, puedeVer, label }`. Con permiso, pinta el valor. Sin él,
  pinta el valor ya enmascarado que mandó el backend + `<Lock className="h-3 w-3">` + `Tooltip`
  con "Solo visible para Director y Gerente". Nunca vacía el campo (criterio 11).
- **`AtributosEditor`** — lista de filas `label` / `valor` / `Switch` "sensible" / botón quitar, más
  "Agregar atributo". La `key` se deriva del `label` (slug) al crear y no se vuelve a tocar.
- **`ContactEditDialog`** — `Dialog` de shadcn, formulario controlado con el patrón de la casa
  (`useState` por campo + `puedeGuardar` derivado + `<form onSubmit>` + `useMutation` + `sonner`).
  Se resiembra al abrir con un ref `sembrado`, igual que `ConvertToLeadDialog`, para que una
  respuesta tardía de la ficha no pise lo que el usuario está escribiendo. Los campos sensibles
  van `disabled` cuando `!puedeVerSensibles`.
- **`ContactNotesCard`** — misma anatomía que `ContactSummaryCard` / `ContactExtractCard`:
  `<section className="space-y-2.5 rounded-lg border border-border bg-card px-3.5 py-3">`, icono
  `h-4 w-4 text-primary`, `<h3 className="text-xs font-semibold">`, ramas skeleton / vacío /
  contenido, y la constante `pressable` que ya comparten esas tres tarjetas.

**No** se introduce `react-hook-form` ni `zod` en el frontend: no son dependencias del proyecto y
el patrón vigente en `FaqFormDialog`, `ConvertToLeadDialog`, `TagFormDialog` y `PlanForm` es
`useState` controlado. Todos los primitivos shadcn necesarios ya están vendorizados en
`src/components/ui/`; no hace falta `pnpm dlx shadcn add`.

### Skills de diseño (regla no negociable §7 del `CLAUDE.md` raíz)

Antes de escribir **cualquiera** de esos componentes hay que invocar `emil-design-eng` y
`frontend-design:frontend-design` y aplicar sus criterios. `impeccable:impeccable` **no aparece
instalada** en el entorno actual: hay que intentar invocarla en `/sdd-implement` y, si sigue
ausente, aplicar su criterio a mano (jerarquía visual, carga cognitiva, accesibilidad, estados
vacíos y de error, copy de interfaz) y dejarlo dicho en el reporte, no darlo por hecho en silencio.

## Documentación

- **`docs/data-model.md`** — en `## clientes`: `correoEnc`, `documentoEnc`, `atributos[]`, y la nota
  de que `customFields` queda superado por `atributos` (sin migración: hoy es `{}` en todos los
  documentos). Nueva sección `## contact_notes`. En `## audit_events`, añadir `cliente.update` y
  `contact-note.create` a la lista de acciones registradas, con la advertencia de que los valores
  sensibles se guardan como `'[cifrado]'`.
- **`docs/domain.md`** — glosario: *Nota de contacto*, *Dato sensible*. Entidades: `ContactNote`.
  Invariante nuevo: *"Una `ContactNote` pertenece a exactamente un `Tenant` y su `clienteId` es del
  mismo tenant (validado antes de escribir). Su texto se persiste cifrado y solo es legible por los
  subroles autorizados."*
- **`docs/api-contract.md`** §6 — tres filas nuevas, en el estilo de las de HU-CRM-01.
- **`docs/adr/0006-subrol-datos-sensibles.md`** — estado *aceptado*, formato inline de ADR 0005.
  Contexto: los dos únicos roles de login no bastan para "visible solo para roles autorizados"
  cuando todos los usuarios del tenant son `admin`. Decisión: el `subrol` gobierna el acceso **solo**
  a los datos sensibles del contacto; el resto de la app sigue bajo AUTH-02. Consecuencias: un
  `admin` sin `subrol` conserva acceso total (retrocompatibilidad), y asignar subroles sigue sin
  tener UI, así que en la práctica el gate solo se activa cuando alguien los siembra a mano.

## Notas

- **La clave de cifrado es una tercera capa, no la única.** Ver §"Nota sobre el alcance del
  cifrado" en `spec.md`. `DATA_ENC_KEY` se genera con `openssl rand -hex 32` y va en `.env` /
  variables del Droplet, nunca en el repo.
- **Si `DATA_ENC_KEY` falta, el arranque no revienta** (`.optional()` en el schema, como
  `TENANT_TOKEN_ENC_KEY`), pero el primer intento de escribir un campo sensible lanza. Es
  deliberado: obliga a configurarla antes de usar el feature sin bloquear entornos que no lo tocan.
- **Lo cifrado no se busca.** Ningún índice, ningún filtro, ningún `$regex` sobre `correoEnc`,
  `documentoEnc` ni `textoEnc`. Si alguna vez hace falta, será un índice ciego (HMAC determinista)
  y su propio feature.
- **La auditoría es una colección sin gate por subrol.** Por eso el criterio 8 no es opcional:
  volcar ahí el antes/después en claro reabriría el agujero por la puerta de atrás.

## Verificación

```bash
pnpm --filter backend typecheck
pnpm --filter backend test
pnpm --filter frontend build && pnpm --filter frontend lint && pnpm --filter frontend test
```

Más la comprobación manual que ningún test sustituye: leer un documento de `contact_notes` y uno de
`clientes` **en crudo** (Compass o `mongosh`) y confirmar que no aparece el texto claro de ninguna
nota, correo ni documento.
