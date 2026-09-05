# HU-KB-02-V3 — Plan técnico (CÓMO)

> El QUÉ está en `spec.md`; la ejecución en `tasks.md`. No redefine reglas: el aislamiento se rige
> por `docs/multi-tenancy.md`, el patrón de feature por `apps/backend/CLAUDE.md` y el formato de
> error por `docs/api-contract.md` §4.
>
> **Rama:** `feat/HU-IA-01` (la actual). No se crea rama nueva.

## Estado base verificado (antes de planear)

Los paquetes son **`@sofiapp/api`** y **`@sofiapp/web`** (`--filter backend` no matchea nada).

| Comando | Resultado |
|---|---|
| `pnpm --filter @sofiapp/api typecheck` | ✅ verde |
| `pnpm --filter @sofiapp/api test` | ✅ verde — **87 archivos, 879 tests**, 84 s |

## Decisiones de diseño

| Decisión | Elección | Por qué |
|---|---|---|
| Semántica del piso | **Piso duro**: se permite bajar solo si `activas > minimo` | La alternativa —proteger solo el escalón 5→4— dejaba que un tenant con 4 activas bajara hasta 0. Con el piso duro el conteo nunca decrece por debajo del mínimo, y editar sigue abierto como salida |
| Código HTTP | **`409`** con `details: { activas, minimo }` | La petición es válida en forma; choca con el **estado** del tenant. Es el mismo 409 que ya usa este feature para la pregunta duplicada, y el `details` sigue el precedente del `leadId` de HU-CRM-01 (`api-contract.md` §4) |
| Dónde vive la regla | `service`, en una guarda propia | Zod valida forma, no estado; el controller sigue delgado (`apps/backend/CLAUDE.md`) |
| Decisión aislada | Función **pura** `puedeReducirActivas(activas, minimo)` | Se verifica exhaustivamente —incluido `minimo = 0`— sin Mongo y sin depender del valor del entorno. Mismo criterio que `kb-faq.matching` en V2 |
| Dónde va el conteo | Campos nuevos en `KbFaqsListResponse` | La tabla ya hace ese `useQuery`; un endpoint aparte sería una segunda ida al servidor para pintar una línea |
| Alcance de `activas` | **Todo el tenant**, no la página ni el filtro | Es el número contra el que se compara el mínimo. Si respetara `?activo=false` valdría `0` y la UI mentiría |
| Control bloqueado en la UI | **Deshabilitado + `Tooltip`** | El admin ve el límite antes de intentarlo. `tooltip.tsx` ya está vendorizado |
| Query compartida | Hook `useKbFaqs()` | La página necesita el mismo dato que la tabla para el aviso; TanStack deduplica por `queryKey`. Precedente: `handoff/hooks/useAsesorMetricas.ts` |

## Archivos a crear / tocar

```
apps/backend/src/
├── config/env.ts                       # TOCAR — FAQ_MIN_ACTIVAS con su comentario
└── features/kb-faq/
    ├── kb-faq.types.ts                 # TOCAR — activas + minimoActivas en KbFaqsListResponse
    ├── kb-faq.service.ts               # TOCAR — puedeReducirActivas + guarda en delete/update + conteo en listFaqs
    ├── kb-faq.service.test.ts          # TOCAR — bloqueo, permitido, piso duro, aislamiento
    └── kb-faq.routes.test.ts           # TOCAR — 409 y los campos nuevos del listado

apps/frontend/src/
├── api/kb-faqs.ts                      # (revisar) — el tipo ya viaja por KbFaqsListResponse
└── features/knowledge-base/
    ├── types/faq.ts                    # TOCAR — espejo de los dos campos
    ├── hooks/useKbFaqs.ts              # NUEVO — la query compartida por tabla y página
    ├── components/FaqTable.tsx         # TOCAR — contador, Switch/eliminar inertes + Tooltip
    ├── components/FaqTable.test.tsx    # TOCAR — contador y controles bloqueados
    ├── components/FaqFormDialog.tsx    # TOCAR — el Switch de activo, mismo criterio
    ├── pages/KnowledgeFaqsPage.tsx     # TOCAR — aviso mientras falten
    └── pages/KnowledgeFaqsPage.test.tsx # NUEVO — el aviso aparece y desaparece

docs/
└── api-contract.md                     # TOCAR — §6: filas de /api/kb/faqs (hoy ausentes) con el 409
```

**No se tocan:** `kb-faq.model.ts`, `kb-faq.validation.ts`, `kb-faq.controller.ts`,
`kb-faq.routes.ts`, `kb-faq.repository.ts`, `kb-faq.matching.ts`. No hay endpoint nuevo, no hay
campo nuevo en el modelo, no hay índice nuevo: el conteo se apoya en `{ tenantId, activo }`, que ya
resuelve el índice de `tenantId`.

> **Nota sobre el enunciado:** no existe `kb-faq.isolation.test.ts`. El aislamiento de este feature
> vive en `kb-faq.repository.test.ts` (pipeline) y en el `describe('kb-faq — aislamiento
> multi-tenant')` de `kb-faq.service.test.ts`. Los casos nuevos van en ese `describe`, que es el
> patrón real del feature.

## Contratos

### `config/env.ts` — bloque FAQ, tras `FAQ_MATCH_MIN_OVERLAP`

```ts
  // Preguntas frecuentes ACTIVAS que un tenant debe sostener (HU-KB-02-V3). El cortocircuito de FAQ
  // existe para no pagar tokens en lo que más preguntan; con la lista vacía no ahorra nada, así que
  // esto es un piso y no una sugerencia. Se comprueba ANTES de desactivar o eliminar una FAQ activa,
  // nunca al crear ni al editar: se sube al mínimo escribiendo, no borrando. Un tenant por debajo
  // (datos previos) puede crear y editar sin límite, pero no bajar más.
  // Con 0 la regla queda desactivada por completo, sin desplegar código.
  FAQ_MIN_ACTIVAS: z.coerce.number().int().nonnegative().default(5),
```

### `kb-faq.types.ts`

```ts
export interface KbFaqsListResponse {
  data: IKbFaqResponse[];
  total: number;         // respeta page/limit/activo, como hoy
  page: number;
  limit: number;
  /**
   * Activas del TENANT completo, al margen de `page`, `limit` y del filtro `activo`. Es el número
   * contra el que se compara `minimoActivas`; si respetara el filtro, `?activo=false` daría 0.
   */
  activas: number;
  minimoActivas: number;
}
```

Campos **requeridos**, no opcionales: el listado siempre los sabe y hacerlos opcionales obligaría a
la UI a inventar un valor por defecto.

### `kb-faq.service.ts`

```ts
const MINIMO_ACTIVAS = (minimo: number, accion: 'desactivar' | 'eliminar'): string =>
  `Sofi necesita al menos ${minimo} preguntas frecuentes activas. ` +
  `Activa otra antes de ${accion === 'desactivar' ? 'apagar' : 'eliminar'} esta.`;

/**
 * Piso duro: la baja solo se permite si por encima del mínimo queda margen. Con `minimo` en 0 la
 * regla no existe. Pura a propósito — se verifica sin Mongo y sin depender del entorno.
 */
export function puedeReducirActivas(activas: number, minimo: number): boolean {
  return minimo === 0 || activas > minimo;
}

/** Guarda previa a toda operación que reduce el número de activas del tenant. */
async function asegurarMinimoActivas(
  tenantId: TenantId,
  accion: 'desactivar' | 'eliminar',
): Promise<void> {
  const minimo = env.FAQ_MIN_ACTIVAS;
  if (minimo === 0) return;                       // ni siquiera cuenta
  const activas = await countScoped(KbFaq, tenantId, { activo: true }).exec();
  if (puedeReducirActivas(activas, minimo)) return;
  throw new AppError(MINIMO_ACTIVAS(minimo, accion), 409, { activas, minimo });
}
```

**`deleteFaq`** — la guarda solo se dispara si la FAQ que se va a borrar está activa; borrar una
inactiva no mueve el conteo. Hoy `findByIdScoped(...).lean()` se lee sin tipo: pasa a
`.lean<LeanKbFaq | null>()` para poder mirar `activo`.

```ts
const existing = await findByIdScoped(KbFaq, tenantId, id).lean<LeanKbFaq | null>().exec();
if (!existing) throw new AppError(NO_ENCONTRADA, 404);
if (existing.activo) await asegurarMinimoActivas(tenantId, 'eliminar');
```

**`updateFaq`** — solo la transición `true → false`. Reactivar, editar texto o reenviar
`{ activo: false }` sobre una ya inactiva no tocan la guarda. Va **antes** de re-embeber, para no
gastar una llamada a Gemini en una operación que se va a rechazar:

```ts
const apaga = dto.activo === false && actual.activo;
if (apaga) await asegurarMinimoActivas(tenantId, 'desactivar');
```

**`listFaqs`** — un tercer conteo en el mismo `Promise.all`, sin condicionales: cuando el filtro es
`activo: true`, `total` y `activas` coinciden y eso es correcto, no un síntoma.

```ts
const [faqs, total, activas] = await Promise.all([
  /* … como hoy … */,
  countScoped(KbFaq, tenantId, filtro).exec(),
  countScoped(KbFaq, tenantId, { activo: true }).exec(),   // alcance tenant, sin `filtro`
]);
return { data: …, total, page, limit, activas, minimoActivas: env.FAQ_MIN_ACTIVAS };
```

### Controller, rutas y validación

**Sin cambios.** El `409` sale del service y lo traduce `errorHandler`; los schemas Zod siguen
validando forma. `deleteFaqController` y `updateFaqController` no aprenden nada nuevo.

### `docs/api-contract.md`

Las rutas `/api/kb/faqs` no están en la tabla §6 (verificado). Se añaden ahora, porque el `409` es
un cambio de contrato y documentarlo suelto sobre endpoints ausentes deja la tabla incoherente:

| Método | Ruta | Rol | Notas |
|---|---|---|---|
| GET | `/api/kb/faqs` | admin | Paginado. Añade `activas` y `minimoActivas`, de alcance tenant. |
| POST | `/api/kb/faqs` | admin | `201`. Nunca limitado por el mínimo. `409` si la pregunta ya existe. |
| PATCH | `/api/kb/faqs/:id` | admin | `409` con `{ activas, minimo }` si `activo: false` dejaría al tenant bajo `FAQ_MIN_ACTIVAS`. |
| DELETE | `/api/kb/faqs/:id` | admin | Mismo `409` al eliminar una FAQ **activa**. Borrar una inactiva nunca se bloquea. |
| POST | `/api/kb/faqs/test` | admin | Probador; devuelve el candidato y las tres señales (HU-KB-02-V2). |

### Frontend

**`hooks/useKbFaqs.ts`** — la query pasa a un hook para que la tabla y la página lean el mismo dato
sin una segunda petición (TanStack deduplica por `queryKey: ['kb', 'faqs']`):

```ts
export interface EstadoMinimoFaqs {
  activas: number;
  minimo: number;
  faltan: number;          // max(0, minimo - activas)
  cumple: boolean;         // activas >= minimo
  puedeReducir: boolean;   // activas > minimo  ← gobierna los controles
}
export function useKbFaqs(): UseQueryResult<KbFaqsListResponse> ;
export function estadoMinimo(data: KbFaqsListResponse | undefined): EstadoMinimoFaqs;
```

`estadoMinimo` es pura y es lo único que la UI necesita saber; ningún componente vuelve a comparar
números a mano.

**`FaqTable.tsx`**

- Cabecera: la línea de conteo pasa de `«N preguntas»` a `«N preguntas · X de 5 activas»`. Mientras
  `!cumple` esa segunda mitad se lee con `text-destructive`; cumplido, en `text-muted-foreground`.
  Sin barra de progreso: son cinco elementos, el número ya es el progreso.
- `bloqueaBaja = faq.activo && !puedeReducir` gobierna el `Switch` y el botón de eliminar.
- El `Tooltip` no puede colgar de un control deshabilitado (un elemento `disabled` no emite eventos
  de puntero), así que el disparador es un `<span tabIndex={0}>` que lo envuelve — así el motivo
  también se alcanza con teclado.
- Copy del tooltip: `Sofi necesita al menos 5 preguntas activas. Activa otra antes de apagar esta.`
  / `…antes de eliminar esta.`
- Una FAQ **inactiva** nunca se bloquea: su interruptor y su papelera siguen vivos.

**`FaqFormDialog.tsx`** — mismo criterio en el `Switch` de «Activa» al editar una FAQ activa. Ya
pinta el mensaje del servidor vía `faqErrorMessage`, así que el `409` se ve solo si algo se escapa;
deshabilitar es para que no se llegue a ese punto.

**`KnowledgeFaqsPage.tsx`** — aviso mientras `!cumple`, entre la cabecera y el probador. No es un
error, es una invitación a actuar: dice cuántas faltan y ofrece crear.

> **Te faltan 2 preguntas frecuentes**
> Sofi responde al instante y sin gastar tokens las que tenga activas. Con al menos 5 cubiertas,
> las consultas repetidas dejan de pasar por el modelo.  · **[Nueva pregunta]**

Tokens semánticos, componentes de `src/components/ui/`, terminado en light y dark. Antes de escribir
cada componente se invocan las skills de diseño del `CLAUDE.md` raíz §7 disponibles en la sesión.

## Notas

- **Carrera entre dos administradores.** La guarda es *comprobar y actuar* sin transacción: dos
  admins borrando a la vez con 6 activas pueden dejar 4. Se acepta a conciencia — el módulo lo opera
  una persona, y cerrarlo de verdad exigiría una transacción de Mongo o un contador atómico, que es
  desproporcionado para un piso de cinco. Queda escrito para que nadie lo descubra como sorpresa.
- **El mínimo no se aplica retroactivamente.** No hay backfill: los tenants por debajo se quedan
  como están y solo se les impide bajar más.
- **Coste del conteo:** un `countDocuments` más por listado, sobre `{ tenantId, activo }`. El índice
  de `tenantId` ya existe; con decenas de FAQs por tenant no justifica un índice compuesto nuevo.
- **La UI no es la defensa.** Deshabilitar el control es cortesía; quien rechaza es el service. Los
  tests de rutas lo verifican yendo directo al endpoint.

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test          # base a superar: 87 archivos / 879 tests
pnpm --filter @sofiapp/web test
pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint
```

Más el checklist de PR de `docs/multi-tenancy.md` §9 y una pasada manual: dejar un tenant en cinco
activas, comprobar que el interruptor y la papelera quedan inertes con su motivo, crear una sexta y
comprobar que se sueltan.
