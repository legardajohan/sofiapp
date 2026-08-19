# HU-CRM-01 — Plan técnico (CÓMO)

## Archivos a crear

```
apps/backend/src/
└── features/lead/
    ├── lead.types.ts            # ILead, ILeadDocument, ILeadLean, IOrigenLead, CreateLeadDTO, ILeadResponse
    ├── lead.model.ts            # schema Lead + índices { tenantId, telefono } unique · { tenantId, clienteId }
    ├── lead.validation.ts       # createLeadSchema, getLeadSchema
    ├── lead.service.ts          # createLeadFromConversation, getLeadById
    ├── lead.controller.ts       # createLeadController (201), getLeadController (200)
    ├── lead.routes.ts           # POST / · GET /:id  (default export)
    ├── lead.service.test.ts     # casos funcionales
    └── lead.isolation.test.ts   # invariante multi-tenant

apps/frontend/src/
└── features/leads/
    ├── api.ts                   # createLead, fetchLead  (rutas SIN prefijo /api)
    ├── types.ts                 # LeadDTO, CreateLeadPayload, LeadDuplicadoError
    ├── index.ts                 # barrel
    ├── lib/errors.ts            # leadIdDeConflicto(error) → string | null
    ├── hooks/useCreateLead.ts   # mutación + toast + manejo del 409
    ├── hooks/useLead.ts         # query ['lead', leadId]
    └── components/
        ├── ConvertToLeadDialog.tsx        # formulario pre-rellenado
        ├── ConvertToLeadDialog.test.tsx
        └── LeadCard.tsx                   # tarjeta en la ficha del contacto
```

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `apps/backend/src/app.ts` | `+ import leadRoutes from './features/lead/lead.routes.js'` · `+ app.use('/api/leads', leadRoutes)` junto a `/api/tags`, **antes** de `errorHandler` |
| `apps/backend/src/features/audit/audit.types.ts` | `AuditAccion` `+ 'lead.create'` · `AuditEntidad` `+ 'lead'` |
| `apps/backend/src/utils/AppError.ts` | `+ details?: Record<string, unknown>` como 3.er parámetro opcional |
| `apps/backend/src/middlewares/error-handler.middleware.ts` | El caso `AppError` difunde `details` en el JSON |
| `apps/backend/src/features/cliente/cliente.types.ts` | `IContactCardResponse` `+ leadId: string \| null` |
| `apps/backend/src/features/cliente/cliente.service.ts` | `getContactHistory` resuelve el `leadId` del contacto |
| `apps/backend/src/features/conversation/conversation.types.ts` | `IConversationResponse` `+ leadId: string \| null` |
| `apps/backend/src/features/conversation/conversation.mapper.ts` | `toConversationResponse` recibe y proyecta el `leadId` |
| `apps/backend/src/features/conversation/conversation.service.ts` | `listConversations` hidrata los `leadId` **en lote** |
| `apps/frontend/src/features/inbox/types.ts` | `ConversationDTO` y `ContactCardDTO` `+ leadId: string \| null` |
| `apps/frontend/src/features/inbox/pages/InboxPage.tsx` | Acción "Convertir en lead" en la fila de controles de la cabecera (`:155`) + `<ConvertToLeadDialog>` montado fuera de cualquier menú |
| `apps/frontend/src/features/inbox/components/ContactPanel.tsx` | `<LeadCard>` entre `ContactCard` y `ContactExtractCard` (`:81-91`) |
| `docs/data-model.md` | Nueva sección `## leads` |
| `docs/domain.md` | §1 glosario, §2 entidades, §6 invariante |
| `docs/api-contract.md` | §4 variante de error con `details`, §6 los dos endpoints |

## Contratos

### `lead.types.ts`

```ts
import type { Document, Types } from 'mongoose';
import type { EstadoComercial } from '../cliente/cliente.types.js';

export interface IOrigenLead {
  tipo: 'conversacion';
  conversacionId: Types.ObjectId;   // hoy == clienteId; responde "¿de dónde salió?"
  convertidoPor: Types.ObjectId;    // ref User
  convertidoAt: Date;
}

export interface ILead {
  tenantId: Types.ObjectId;
  nombre: string;
  telefono: string;
  correo?: string;
  clienteId: Types.ObjectId;        // ref Cliente; responde "¿con quién hablo?"
  origen: IOrigenLead;
  responsableId: Types.ObjectId;    // ref User
  estado: EstadoComercial;
}

export interface ILeadDocument extends ILead, Document {}
export interface ILeadLean extends ILead { _id: Types.ObjectId; createdAt: Date; updatedAt: Date }

export interface CreateLeadDTO {
  nombre: string; telefono: string; correo?: string; clienteId: string;
}

/** Referencia mínima ya resuelta: la tarjeta muestra nombres, nunca ObjectIds. */
export interface IRefResponse { id: string; nombre: string | null }

export interface ILeadResponse {
  id: string; nombre: string; telefono: string; correo: string | null;
  estado: EstadoComercial;
  contacto: { id: string; nombre: string | null; telefono: string };
  responsable: IRefResponse | null;
  origen: { conversacionId: string; convertidoPor: IRefResponse | null; convertidoAt: string };
  createdAt: string;
}
```

`contacto`, `responsable` y `origen.convertidoPor` van **resueltos** (criterio 6). Devolver ids
sueltos obligaría a la tarjeta a hacer dos llamadas más para pintar "Convertido por Ana", y la línea
de trazabilidad es justo el elemento destacado del diseño.

`estado` **reutiliza `EstadoComercial`** importado de `cliente.types.ts`; no se redefine la unión ni se
introduce una `etapa` propia (`spec.md` → Nota sobre `Lead` vs `Cliente`).

### `lead.model.ts` — índices

```ts
leadSchema.index({ tenantId: 1, telefono: 1 }, { unique: true });
leadSchema.index({ tenantId: 1, clienteId: 1 });
```

El primero es la **única defensa real** contra dos conversiones simultáneas del mismo teléfono; la
comprobación previa del service solo existe para dar un mensaje mejor en el caso normal. El subdoc
`origen` se declara con `{ _id: false }` (mismo patrón que `Cliente.resumenIA` y `datosExtraidos`).

`telefono` se normaliza antes de guardar (solo dígitos) para que la unicidad no dependa del formato:
`+57 300 111 2233` y `573001112233` son el mismo teléfono.

### `lead.validation.ts`

```
createLeadSchema  → body { nombre: 1..120, telefono: 7..20 (dígitos tras normalizar),
                           correo?: email, clienteId: ObjectId }
                    params {} · query {}
getLeadSchema     → params { id: ObjectId }
```

Las partes vacías van como `z.object({})` — no `.optional()` — según la nota de
`conversation.validation.ts:4-6`: el middleware `validate` ya normaliza `req.body ?? {}`.

### Endpoints

| Método | Ruta | Cadena de middlewares |
|---|---|---|
| `POST` | `/api/leads` | `authenticateJWT → requireTenant → authorize(['admin']) → validate(createLeadSchema) → asyncHandler(createLeadController)` |
| `GET` | `/api/leads/:id` | `authenticateJWT → requireTenant → authorize(['admin']) → validate(getLeadSchema) → asyncHandler(getLeadController)` |

### `createLeadFromConversation` — validar antes de escribir

```
createLeadFromConversation(tenantId, actorId, dto) → ILeadResponse
```

1. `findByIdScoped(Cliente, tenantId, dto.clienteId).lean()` → si `null`, `AppError(404,
   'Conversación no encontrada.')`. Cubre a la vez "no existe" y "es de otro tenant", que son
   indistinguibles por diseño (criterio 3).
2. Normalizar `telefono`.
3. `findOneScoped(Lead, tenantId, { telefono }).lean()` → si existe,
   `AppError('Ya existe un lead con ese teléfono.', 409, { leadId: String(doc._id) })`.
4. `createScoped(Lead, tenantId, { nombre, telefono, correo, clienteId, estado: 'nuevo',
   responsableId: actorId, origen: { tipo: 'conversacion', conversacionId: dto.clienteId,
   convertidoPor: actorId, convertidoAt: new Date() } })`.
5. `catch` de `E11000` → el mismo `AppError(409)`, releyendo el lead existente para adjuntar su
   `leadId`. Cierra la carrera que el paso 3 no puede cubrir.
6. `recordAuditEvent(tenantId, { actorId, accion: 'lead.create', entidad: 'lead', entidadId,
   antes: {}, despues: { clienteId, telefono } })` — `audit.service.ts` ya garantiza que no lanza.
7. Resolver el responsable con `findUsersByIds` (patrón de HU-OMNI-02) y mapear a `ILeadResponse`.

`getLeadById(tenantId, id)`: `findByIdScoped(Lead, tenantId, id).lean()` → `404` si `null`; resuelve
el `Cliente` con `findByIdScoped` y los dos usuarios (`responsableId` y `origen.convertidoPor`) con
**una sola** llamada a `findUsersByIds(tenantId, [responsableId, convertidoPor])`
(`features/users/user.service.ts:38`, devuelve `Map<string, IUserResponse>`). **Sin `populate()`** —
rompería el aislamiento (`docs/multi-tenancy.md`).

### `findLeadIdsByClientes` — saber si una conversación ya se convirtió

```
findLeadIdsByClientes(tenantId, clienteIds: string[]) → Map<string, string>   // clienteId → leadId
```

`findScoped(Lead, tenantId, { clienteId: { $in: … } })` proyectando solo `{ _id, clienteId }`. Es el
mismo patrón en lote de `findTagsByIds` / `findUsersByIds`: **una** consulta por página de bandeja, no
una por conversación. Se apoya en el índice `{ tenantId, clienteId }`.

Lo consumen `listConversations` (para la cabecera) y `getContactHistory` (para la ficha). Sin este
campo el criterio 10 no es implementable: `GET /api/leads/:id` necesita un `leadId` que hoy nadie
sabría de dónde sacar, y el listado de leads está fuera de alcance (`HU-CRM-02`).

### `AppError` con datos adjuntos

```ts
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>,
  ) { /* … */ }
}
```

```ts
// error-handler.middleware.ts
if (err instanceof AppError) {
  // `details` primero: así un `details.message` accidental no puede pisar el mensaje real.
  res.status(err.statusCode).json({ ...err.details, message: err.message });
  return;
}
```

Los ~57 usos existentes de `AppError` no se tocan: el parámetro es opcional y sin él la respuesta
sigue siendo exactamente `{ message }`.

### Frontend — decisiones de las skills de diseño (regla §7 del `CLAUDE.md` raíz)

Invocadas `emil-design-eng` y `frontend-design:frontend-design`.
**`impeccable:impeccable` no está instalada en el entorno**; su eje (jerarquía, copy, estados
vacíos/error, a11y) se cubre a mano abajo y queda anotado como deuda.

| Decisión | Motivo |
|---|---|
| **No se añade animación al diálogo.** Se usa `Dialog` de shadcn tal cual | Ya cumple las reglas: entra desde `zoom-in-95` (nunca `scale(0)`), `duration-200` (<300ms) y origen centrado, que es lo correcto para un modal — un modal no está anclado a su disparador, así que no lleva `transform-origin` del trigger |
| El aviso de duplicado aparece **dentro** del diálogo, con transición de opacidad, sin desplazamiento | Aparece donde el usuario ya está mirando; un `slide` lo leería como un elemento nuevo que llega. Al animar solo opacidad, `prefers-reduced-motion` queda satisfecho sin una rama aparte |
| `LeadCard` entra con fade + 8px de subida, 200ms, `cubic-bezier(0.23, 1, 0.32, 1)`. Sin stagger | Es un evento ocasional (una vez por conversación), así que la animación se justifica. Una sola tarjeta no necesita cascada, y la curva fuerte evita la blandura de los `ease` nativos |
| **No se toca `ui/button.tsx`** para añadir `active:scale-[0.97]` | El `:active` con escala es correcto, pero la cva base no lo tiene y añadirlo ahí cambiaría **todos** los botones de la app. Es una tarea de diseño transversal (DSN), no de este feature. Anotado como deuda |
| La acción es un botón con texto (`UserPlus` + "Convertir en lead"), no un icono suelto | La cabecera ya aloja cuatro controles, tres de ellos solo-icono. Un quinto icono sería indescifrable; el texto es lo que hace la acción encontrable la primera vez |
| Si la conversación **ya** tiene lead, la cabecera muestra el estado en vez de repetir la acción | Ofrecer "Convertir en lead" en algo ya convertido invita a un `409` evitable (criterio 10) |
| La línea de trazabilidad ("Convertido por X desde esta conversación · <fecha>") es el elemento destacado de `LeadCard`, no una fila de metadatos al pie | La trazabilidad **es** la Definición de Hecho de la historia; enterrarla contradiría el objetivo del feature |
| Sin marcadores numerados (01 / 02 / 03) ni divisores decorativos | No hay secuencia que comunicar: la estructura debe codificar algo verdadero del contenido, no decorarlo |
| Cero color nuevo: solo tokens semánticos (`text-destructive` para el aviso, `Badge` para el estado) | INF-03; el sistema de tokens y la identidad visual ya están fijados y este feature no es el lugar para abrirlos |

**Copy de interfaz** (verbo constante en todo el flujo, voz activa, sentence case):

| Momento | Texto |
|---|---|
| Acción | `Convertir en lead` |
| Título del diálogo | `Convertir en lead` |
| Descripción | `Revisa los datos antes de crear el lead. Puedes editarlos.` |
| Botón de envío | `Crear lead` / mientras envía `Creando…` |
| Éxito | `Lead creado` |
| Duplicado (409) | `Ya existe un lead con ese teléfono.` + acción `Ver lead existente` |
| Error de red | `No se pudo crear el lead. Intenta de nuevo en unos segundos.` |

El error no se disculpa ni es vago: dice qué pasó y qué hacer.

### Frontend — convenciones a respetar

- `apiClient` **sin** el prefijo `/api`: `apiClient.post('/leads', payload)`. Repetirlo pega contra
  `/api/api/leads` → 404 (bug real de HU-OMNI-02).
- Query keys planas: `['lead', leadId]`. Tras crear, invalidar `['conversations']` y
  `['contact-history', clienteId]`.
- Formulario con `useState` + `<form onSubmit>` dentro de `Dialog` + booleano `puedeGuardar`
  derivado, copiando `src/features/tags/components/TagFormDialog.tsx`. **No hay `react-hook-form` ni
  `zod` en el frontend** y `ui/form.tsx` no está vendorizado: introducirlos sería una dependencia
  nueva y una desviación de todos los formularios existentes.
- Cerrar el diálogo con el callback por llamada — `mutate(v, { onSuccess: () => setOpen(false) })` —
  para que el `409` lo deje abierto (criterio 9).
- `toast` de `sonner` con `action: { label: 'Ver lead existente', onClick }`, patrón de
  `useInboxRealtime.ts:35`. El `Toaster` ya está montado en `AppLayout`: **no** montar otro.
- Terminado en claro y oscuro, con foco visible por teclado.

## Notas

- **`AppError` gana un parámetro (cambio transversal).** Hoy `AppError(message, statusCode)` produce
  solo `{ message }`, así que el criterio 4 — un `409` que lleve el `leadId` existente — **no es
  expresable**. La alternativa era que el controller interceptara el error, lo que devolvería
  `try/catch` a la capa HTTP y rompería la regla §3 del `CLAUDE.md` raíz. Se añade un tercer
  argumento opcional; hay que documentar la variante en `docs/api-contract.md` §4.
- **Colisión de nombres con la métrica de cuota.** `Plan.limites.leads` y `QuotaMetric = 'leads'`
  siguen contando `Cliente` vía `countScoped`. Este feature **no** los toca. Conviene dejarlo escrito
  en `docs/data-model.md` para que nadie "arregle" la métrica apuntándola a la colección nueva.
- **El `leadId` cuesta una consulta por página de bandeja.** Es el precio de que la cabecera sepa que
  la conversación ya se convirtió (criterio 10) en vez de descubrirlo con un `409`. Es exactamente el
  trato que HU-OMNI-04 aceptó para hidratar las etiquetas, y va contra el índice
  `{ tenantId, clienteId }`. La alternativa —resolverlo solo en la ficha— dejaría en la cabecera un
  botón que falla de forma predecible.
- **Normalización del teléfono.** Sin ella la unicidad es decorativa: el mismo número entra dos veces
  con distinto formato. Se normaliza en el service, antes de la búsqueda y del `create`, para que la
  comprobación y el índice vean el mismo valor.
- **`conversacionId` y `clienteId` con el mismo valor hoy.** No es redundancia por descuido: responden
  preguntas distintas y el día que la conversación deje de ser un `Cliente`, el origen sobrevive.
  Documentado en `spec.md` → Contexto de dominio.
- **Sin transacción.** El `AuditEvent` no es crítico y `recordAuditEvent` no lanza; el lead es una
  sola escritura. Meter una sesión de Mongo aquí sería complejidad sin beneficio.
- **Deuda anotada:** `impeccable:impeccable` no instalada; `active:scale-[0.97]` global en
  `ui/button.tsx` pendiente de una tarea DSN.

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
pnpm --filter @sofiapp/web build
pnpm --filter @sofiapp/web lint
pnpm --filter @sofiapp/web test
```

> Los filtros correctos del workspace son `@sofiapp/api` / `@sofiapp/web`. El `CLAUDE.md` raíz dice
> `pnpm --filter backend`, que falla con `No projects matched the filters`. Deuda del doc raíz, ya
> anotada por HU-OMNI-04.

**Cierre manual (DoD de la historia):** desde una conversación de la bandeja, convertir en lead y
comprobar en Mongo que el documento creado lleva `clienteId`, `origen.conversacionId`,
`origen.convertidoPor` y `origen.convertidoAt` correctos; repetir la conversión y verificar que el
aviso ofrece abrir el lead ya existente en vez de crear un segundo.
