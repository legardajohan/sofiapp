# HU-IA-04 — Plan técnico (CÓMO)

> Se construye **sobre `feat/HU-IA-01`**, sin rama nueva.
>
> **No hay slice nuevo.** El patrón de 6 archivos de `apps/backend/CLAUDE.md` describe cómo nace un
> feature; aquí el feature `conversation` ya existe y esta historia le añade una lectura. El orden
> de trabajo es el mismo (`types → validation → service → controller → routes → montaje`), pero
> `conversation.model.ts` no aparece: una conversación es un `Cliente` proyectado y no tiene
> colección propia. **Ningún modelo nuevo, ningún índice nuevo.**

## Archivos a crear

```
apps/backend/src/features/conversation/
└── conversation.overview.test.ts        # [CREAR] overview + gate del resumen + aislamiento

apps/frontend/src/features/inbox/
├── hooks/useConversationOverview.ts     # [CREAR] useQuery(['conversation-overview', id])
└── components/ConversationSummaryStrip.tsx  # [CREAR] la tira colapsable de la columna central
    components/ConversationSummaryStrip.test.tsx  # [CREAR] con permiso, sin permiso, sin resumen
```

## Archivos a modificar

```
apps/backend/src/
├── features/conversation/
│   ├── conversation.types.ts        # [MODIFICAR] IConversationOverviewResponse, IPermisosConversacion
│   ├── conversation.validation.ts   # [MODIFICAR] overviewSchema
│   ├── conversation.service.ts      # [MODIFICAR] getConversationOverview()
│   ├── conversation.controller.ts   # [MODIFICAR] getOverviewController
│   └── conversation.routes.ts       # [MODIFICAR] GET /:id/overview + gate en POST /:id/summary
└── features/cliente/
    ├── cliente.service.ts           # [MODIFICAR] toResumenResponse recibe el permiso
    └── cliente.service.test.ts      # [MODIFICAR] el resumen se oculta en /history

apps/frontend/src/features/inbox/
├── types.ts                         # [MODIFICAR] ConversationOverviewDTO, PermisosConversacionDTO
├── api.ts                           # [MODIFICAR] fetchConversationOverview
├── pages/InboxPage.tsx              # [MODIFICAR] monta la tira entre etiquetas e hilo
├── components/ContactPanel.tsx      # [MODIFICAR] quita el hilo duplicado; pasa el permiso
├── components/ContactSummaryCard.tsx # [MODIFICAR] estado "sin permiso"
└── hooks/useInboxRealtime.ts        # [MODIFICAR] invalida el overview en conversation:updated

docs/
└── adr/0006-subrol-datos-sensibles.md  # [MODIFICAR] nota de enmienda: el resumen se suma
```

---

## 1. Contratos del backend

### `conversation.types.ts`

```ts
/**
 * Qué puede hacer el usuario que pregunta, resuelto en el servidor. Viaja en la respuesta para que
 * la UI **oculte** sin adivinar: el gemelo de `lib/roles.ts` sirve para no ofrecer acciones que
 * fallarían, pero la fuente de verdad es esta.
 */
export interface IPermisosConversacion {
  /** Leer el resumen por IA. Desde HU-IA-04 es un dato sensible (ver ADR-0006, enmienda). */
  verResumen: boolean;
  /** Generarlo o regenerarlo. Quien no puede leerlo tampoco puede pagar la llamada al modelo. */
  generarResumen: boolean;
  /** Correo, documento y atributos marcados como sensibles del contacto. */
  verSensibles: boolean;
}

/**
 * Todo lo que la vista de una conversación necesita **menos el hilo**.
 *
 * El hilo se queda fuera a propósito: pagina (`GET /:id/messages`) y se refresca solo por
 * `message:new`. Incluirlo aquí obligaría a reconciliar dos copias de los mismos mensajes en cada
 * entrante, y a paginar dos veces la misma colección.
 */
export interface IConversationOverviewResponse {
  /** Ya trae `tags` hidratadas: `toConversationResponse` las resuelve desde HU-OMNI-04. */
  conversation: IConversationResponse;
  /** `null` si no se ha generado nunca **o** si el usuario no puede verlo (ver `permisos`). */
  resumen: IResumenResponse | null;
  permisos: IPermisosConversacion;
}
```

> `IResumenResponse` vive hoy en `cliente.types.ts` y ya se reexporta donde hace falta; se importa
> desde ahí en vez de declarar un gemelo.

### `conversation.validation.ts`

```ts
export const overviewSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: empty,
});
```

Mismo molde que `readSchema`. No hay nada que validar del cuerpo: la única entrada es el `id`, y el
`tenantId` y el subrol salen del token.

### `conversation.service.ts`

```ts
/**
 * Lectura única de la vista de conversación (HU-IA-04): cabecera, etiquetas, resumen y permisos.
 *
 * `puedeVerSensibles` llega resuelto desde el controller, nunca se calcula aquí: el service no
 * conoce `req`. Con `false`, el resumen sale `null` — el mismo criterio de enmascarado de
 * `getContactHistory`, pero sobre un texto que no se puede enmascarar por partes, así que se
 * omite entero y `permisos.verResumen` explica por qué.
 */
export async function getConversationOverview(
  tenantId: string,
  clienteId: string,
  puedeVerSensibles: boolean,
): Promise<IConversationOverviewResponse>;
```

Cuerpo, reutilizando lo que ya existe:

1. `findByIdScoped(Cliente, tenantId, clienteId).lean()` → `AppError('Conversación no encontrada.', 404)`.
   Es la misma guarda de `markRead` y `setIaHabilitada`, y es lo que da el criterio de aislamiento:
   un cliente de otro tenant simplemente no se encuentra.
2. `resolveAsignado` / `resolveTags` / `resolveLeadMap` + `toConversationResponse`, exactamente
   igual que las demás mutaciones de una sola conversación.
3. `resumen: puedeVerSensibles ? toResumenResponse(cliente) : null`.
4. `permisos: { verResumen: p, generarResumen: p, verSensibles: p }` con `p = puedeVerSensibles`.

> Los tres permisos coinciden hoy porque el resumen entra en el mismo conjunto que los datos
> sensibles. Van como tres campos y no como uno para que la UI no tenga que saber que hoy son lo
> mismo: el día que se separen, el frontend no cambia.

### `cliente.service.ts` — el gate donde ya vivía la fuga

```ts
// `toResumenResponse` pasa a recibir el permiso, con el mismo default `false` que sus hermanos.
export function toResumenResponse(
  c: Pick<IClienteLean, 'resumenIA' | 'ultimoMensajeAt'>,
  puedeVerSensibles = false,
): IResumenResponse | null {
  if (!c.resumenIA || !puedeVerSensibles) return null;
  // …resto sin cambios
}
```

y en `getContactHistory` (línea 220): `resumen: toResumenResponse(cliente, puedeVerSensibles)`.

> **Por qué el default es `false`.** Es el mismo criterio que `toContactCard` y
> `toDatosExtraidosResponse`, que ya nacen con `puedeVerSensibles = false`: si mañana aparece un
> tercer sitio que proyecta el resumen y su autor olvida pasar el permiso, el fallo es *ocultar de
> más*, no filtrar. Un default `true` habría convertido cada olvido en una fuga.

### Endpoints

| Método | Ruta | Cadena de middlewares | Controller |
|---|---|---|---|
| `GET` | `/api/conversations/:id/overview` | `authenticateJWT, requireTenant, authorize(['admin']), validate(overviewSchema)` | `getOverviewController` |
| `POST` | `/api/conversations/:id/summary` | …`authorize(['admin'])`, **`authorizeSubrol(SUBROLES_DATOS_SENSIBLES)`**, `validate(summarySchema)` | `generateSummaryController` (sin cambios) |

`GET /overview` **no** lleva `authorizeSubrol`: la vista es para todos los admin y lo que cambia es
su contenido. Cerrar la ruta entera dejaría a `coordinator` y `secretary` sin la cabecera y sin las
etiquetas, que sí les corresponden. El gate va dentro, por campo — exactamente la distinción de
granularidad que ADR-0006 §3 ya establece entre las notas (ruta) y los campos del contacto (service).

`POST /summary` sí se cierra por ruta: no hay respuesta parcial que devolver, y además cada llamada
paga entre 7 y 26 s de modelo.

Montaje: ninguno. `conversationRoutes` ya está en `app.ts` (`/api/conversations`); las rutas nuevas
son hijas suyas.

```ts
// conversation.controller.ts — el permiso se resuelve aquí, del token, y se pasa al service.
export const getOverviewController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  res.status(200).json(await getConversationOverview(tenantId, id, puedeVerDatosSensibles(req.user!)));
};
```

---

## 2. Frontend

### La tira de resumen — `ConversationSummaryStrip.tsx`

Va en la columna central de `InboxPage.tsx`, **entre la franja de etiquetas y el hilo**:

```
cabecera (avatar · Sofi · TagSelector · lead · asignar · ficha)
franja de #etiquetas                          ← ya existe
✦ Resumen IA                       [Ver más]  ← NUEVO
  El cliente pregunta por el curso de…
────────────────────────────────────────────
hilo de mensajes
HandoffBanner / WindowClosedBanner
composer
```

Cuatro estados, y ninguno es un hueco:

| Estado | Qué se ve |
|---|---|
| Con resumen | Dos líneas (`line-clamp-2`) + «Ver más». Expandida muestra el texto completo y la marca de tiempo. `Desactualizado` como `Badge`, igual que en la ficha. |
| Sin resumen todavía | Una línea que invita a generarlo + botón «Generar resumen». |
| Sin permiso | El motivo (`MOTIVO_DATOS_SENSIBLES`) con icono de candado, **sin** botón de generar. |
| Generando | `aria-busy` + skeleton de dos líneas, como `ContactSummaryCard`. |

Decisiones de forma:

- **Colapsada por defecto, a dos líneas.** Un resumen son 3-5 frases; dejarlo abierto empuja el
  hilo hacia abajo en cada conversación que se abre, y lo primero que el asesor quiere ver es el
  último mensaje.
- **El estado expandido se recuerda por conversación**, en `useInboxStore`. Quien lo abre suele
  querer leerlo entero en varias conversaciones seguidas; volver a colapsarlo en cada cambio de hilo
  sería pelearse con el usuario.
- **Tokens neutros** (`bg-muted/40`, `text-secondary-foreground`), no `primary`: la tira acompaña al
  hilo, no compite con él. El único acento es el `Sparkles` que ya identifica a la IA en el resto de
  la app.
- **Se reutiliza la altura de la franja de etiquetas** para que las dos bandas bajo la cabecera se
  lean como un bloque y no como dos parches.
- **Sin animación de altura al expandir.** Un salto de layout justo encima del hilo con `scroll`
  automático al final es peor que un cambio instantáneo; se respeta `motion-reduce` en el chevron.

### Datos

```ts
// api.ts — ruta SIN el prefijo `/api`: lo aporta el baseURL del apiClient.
export async function fetchConversationOverview(id: string): Promise<ConversationOverviewDTO>;

// hooks/useConversationOverview.ts
useQuery({ queryKey: ['conversation-overview', conversationId], queryFn: … })
```

- `useGenerateSummary` (ya existe) invalida hoy `['contact-history', id]`; pasa a invalidar también
  `['conversation-overview', id]`, o la tira seguiría mostrando el resumen viejo tras regenerarlo.
- `useInboxRealtime` invalida `['conversation-overview', id]` en `conversation:updated`: una etiqueta
  aplicada desde otra sesión tiene que llegar aquí igual que llega a la lista.
- La bandeja sigue pintando cabecera y etiquetas desde `active` (la copia de `['conversations']`) y
  consume del overview **solo** `resumen` y `permisos`. El campo `conversation` del DTO existe para
  un consumidor que no tenga la lista —un deep link, el móvil de Fase 4—; duplicar la fuente de
  verdad de la cabecera dentro de la bandeja sería pedir una incoherencia.

### El hilo duplicado

`ContactPanel.tsx` monta un `ConversationThread` propio con `history.mensajes.data` al final del
panel. Se elimina: con la ficha abierta, la conversación se ve dos veces. El `mensajes` del DTO de
`/clientes/:id/history` se deja como está —lo consume el contador y no cuesta cambiarlo ahora—, pero
se anota en el código que ya no se pinta.

### Coherencia entre la tira y la ficha

`ContactSummaryCard` recibe `puedeVer: boolean` y, con `false`, muestra el mismo motivo y esconde el
botón. Si la ficha siguiera ofreciendo «Generar resumen» a quien la tira le dice que no puede verlo,
el usuario recibiría un 403 sin entender por qué.

### Skills de diseño (regla §7 del `CLAUDE.md` raíz)

Antes de escribir cada componente hay que invocar `emil-design-eng`, `impeccable:impeccable` y
`frontend-design:frontend-design`. En este entorno **solo la tercera está registrada**; las otras dos
devuelven `Unknown skill`. Se invocan igualmente y queda constancia en `tasks.md`, aplicando sus
criterios desde conocimiento propio. Todo componente nuevo o tocado queda terminado en claro y
oscuro con tokens semánticos, sin utilidades de color arbitrarias.

---

## 3. Enmienda a ADR-0006

No hace falta un ADR nuevo: la decisión no cambia, se amplía su alcance dentro del mismo dominio
—los datos personales del contacto— y con el mismo argumento. Se añade al final de
`docs/adr/0006-subrol-datos-sensibles.md`:

```markdown
## Enmienda (HU-IA-04, 2026-08-25)

El **resumen por IA de la conversación** (`Cliente.resumenIA`) se suma al conjunto que gobierna el
`subrol`, con gate **por campo, en el service** (`toResumenResponse`) y **por ruta** en la
generación (`POST /conversations/:id/summary`).

Motivo: es prosa que el modelo escribe sobre el transcript completo, así que puede citar en claro el
correo o el documento que `toContactCard` enmascara dos tarjetas más arriba. Es el mismo argumento
que ya cerró las notas en §3, aplicado a un texto que además nadie escribió a mano.

A diferencia de las notas, `GET /conversations/:id/overview` **no** se cierra entero: la vista de la
conversación contiene también el hilo y las etiquetas, que sí corresponden a `coordinator` y
`secretary`. El resumen sale `null` y `permisos.verResumen` dice por qué.
```

---

## Notas

- **Cero modelos y cero índices nuevos.** La historia es una lectura y un gate; `Cliente` ya tiene
  todo lo necesario y `resumenIA` no se busca, se proyecta.
- **El gate está inerte en producción** mientras no exista el CRUD de subroles (ADR-0006
  §Consecuencias). Los tests lo siembran a mano; la spec lo dice en el hueco 8 para que nadie lea el
  criterio 7 como "ya funciona en producción".
- **`overview` no genera nada.** Es una lectura barata; generar el resumen sigue siendo una acción
  explícita y de pago.
- **El coste de la llamada extra** es una lectura de `Cliente` por conversación abierta, con los
  mismos `resolve*` que ya hace cualquier mutación de la bandeja. No se añade índice porque el acceso
  es por `_id` + `tenantId`, ya cubierto.

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
pnpm --filter @sofiapp/web build
pnpm --filter @sofiapp/web lint
pnpm --filter @sofiapp/web test
```

> Los filtros son `@sofiapp/api` y `@sofiapp/web`; los nombres `backend`/`frontend` del `CLAUDE.md`
> raíz no matchean ningún paquete y pnpm no ejecuta nada.

Manual, con un tenant real y dos usuarios a los que se les siembre el `subrol` en base de datos
(no hay UI para asignarlo):

1. Con `subrol: 'director'` → la tira muestra el resumen; «Ver más» lo expande; «Regenerar» funciona.
2. Con `subrol: 'coordinator'` → la tira muestra el motivo, sin botón; el hilo y las etiquetas se ven
   igual; `POST /conversations/:id/summary` por API devuelve 403.
3. Sin `subrol` → todo visible, como antes de esta historia.
4. Con la ficha del contacto desplegada, la conversación aparece **una** sola vez.
