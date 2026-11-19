# HT-PAY-04 — Plan técnico (CÓMO)

## Archivos a crear / tocar

```
docs/
├── adr/
│   ├── 0021-modelo-de-cobro-wompi.md            # NUEVO — D1–D10 + decisiones de modelo
│   ├── 0022-tenant-por-referencia-wompi.md      # NUEVO — excepción a la regla 2
│   └── README.md                                # + filas 0021 y 0022
├── integrations/
│   └── wompi.md                                 # NUEVO — entornos, llaves, firma, checksum, estados
├── multi-tenancy.md                             # §5: entrada 8 (webhook Wompi + payment_events)
├── data-model.md                                # + subscriptions, payments, payment_events
└── domain.md                                    # glosario + invariantes
CLAUDE.md                                        # regla 2: añade el webhook de Wompi

packages/shared/src/
├── billing.ts                                   # NUEVO — periodos, estados, tipos
└── index.ts                                     # re-exporta billing

apps/backend/src/
├── services/pricing/
│   ├── money.util.ts                            # + aCentavos, desglosarIva, IVA_PCT
│   └── money.util.test.ts                       # NUEVO — casos de centavos e IVA
└── features/billing/
    ├── billing.types.ts                         # interfaces, DTOs, resultados de transición
    ├── subscription.model.ts                    # Subscription (subscriptions)
    ├── payment.model.ts                         # Payment (payments)
    ├── payment-event.model.ts                   # PaymentEvent (payment_events, global)
    ├── billing.validation.ts                    # REFERENCIA_REGEX + referenceParamSchema (para BILL-02)
    ├── payment.reference.ts                     # generarReferencia, esReferenciaValida
    ├── payment.estado.ts                        # esTransicionValida, esTerminal (puras)
    ├── subscription.service.ts                  # obtenerSuscripcion
    ├── payment.service.ts                       # crearPagoPendiente, obtenerPago, transicionarPago
    ├── payment-event.service.ts                 # registrarEvento, marcarEventoProcesado
    ├── payment.resolver.ts                      # resolverTenantPorReferencia (excepción ADR-0022)
    ├── billing.fixtures.ts                      # datos de prueba (tenant, plan, aceptaciones)
    ├── payment.reference.test.ts
    ├── payment.estado.test.ts
    ├── payment.service.test.ts
    ├── payment-event.service.test.ts
    ├── payment.resolver.test.ts
    ├── subscription.service.test.ts
    └── billing.isolation.test.ts
```

No hay `billing.controller.ts`, `billing.routes.ts` ni montaje en `app.ts`: llegan con HU-BILL-02
(`/api/billing/*`). Igual que `conversation/` no tiene modelo, aquí falta la capa HTTP a propósito.
`payment.resolver.ts` va en archivo propio para que la única lectura no scoped sea fácil de auditar
(como `admin-metrics.service.ts`).

## Contratos

### `packages/shared/src/billing.ts`
```ts
export const PERIODOS_COBRO = ['trimestral', 'semestral', 'anual'] as const;
export type PeriodoCobro = (typeof PERIODOS_COBRO)[number];
export const MESES_POR_PERIODO_COBRO: Readonly<Record<PeriodoCobro, number>> = {
  trimestral: 3, semestral: 6, anual: 12,
};

export const ESTADOS_PAGO = ['PENDIENTE', 'APROBADO', 'RECHAZADO', 'ANULADO', 'ERROR', 'EXPIRADO'] as const;
export type EstadoPago = (typeof ESTADOS_PAGO)[number];
export const ESTADOS_PAGO_TERMINALES = ['APROBADO', 'RECHAZADO', 'ANULADO', 'ERROR', 'EXPIRADO'] as const;
export type EstadoPagoTerminal = (typeof ESTADOS_PAGO_TERMINALES)[number];

export const ESTADOS_SUSCRIPCION = ['sin_plan', 'activa', 'vencida'] as const;
export type EstadoSuscripcion = (typeof ESTADOS_SUSCRIPCION)[number];
export type OrigenSuscripcion = 'pago' | 'manual';
```
`plan.constants.ts` (`PERIODICIDADES_PLAN` con `mensual`) **no se toca**: lo retira HU-BILL-01.

### `money.util.ts` (añadidos)
```ts
export const IVA_PCT = '19';
/** '149900.50' → 14990050. Lanza AppError(400) si ≤ 0, > 2 decimales, no numérico o no es safe integer. */
export function aCentavos(cop: string): number;
/** Total con IVA incluido → { base, iva } con 2 decimales, ROUND_HALF_UP en la base; iva = total − base. */
export function desglosarIva(totalCop: string, ivaPct?: string): { baseCop: string; ivaCop: string };
```
Validación del string: `/^\d+(\.\d{1,2})?$/` (ADR 0005 §4, más estricta en decimales porque Wompi
cobra en centavos).

### `billing.types.ts`
```ts
export interface IAceptaciones {
  tokenAceptacionWompi: string;        // presigned_acceptance.acceptance_token
  tokenDatosPersonalesWompi: string;   // presigned_personal_data_auth.acceptance_token
  versionTerminosSofi: string;
  versionPoliticaDatos: string;
  aceptadoEn: Date;
  ip: string;
}

export type OrigenTransicion = 'webhook' | 'conciliacion' | 'consulta';

export interface ISubscription {
  tenantId: Types.ObjectId;
  estado: EstadoSuscripcion;
  planId: Types.ObjectId | null;
  planVersion: number | null;
  periodo: PeriodoCobro | null;
  vigenciaDesde: Date | null;
  vigenciaHasta: Date | null;
  origen: OrigenSuscripcion | null;
  ultimoPagoId: Types.ObjectId | null;
  renovacionAutomatica: boolean;       // reservado HU-BILL-04, default false
}

export interface IPayment {
  tenantId: Types.ObjectId;
  reference: string;                   // SOFI-<base32 24>, única global
  providerTransactionId: string | null;
  amountInCents: number;               // entero; lo que se firma y cobra
  currency: 'COP';
  planId: Types.ObjectId;
  planVersion: number;
  periodo: PeriodoCobro;
  precio: { totalCop: Types.Decimal128; baseCop: Types.Decimal128; ivaCop: Types.Decimal128; ivaPct: string };
  estado: EstadoPago;
  metodo: string | null;               // payment_method_type de Wompi (CARD, PSE, NEQUI…)
  detalleProveedor: string | null;     // status_message, truncado a 500
  aceptaciones: IAceptaciones;
  expiraEn: Date;
  intentadoPor: Types.ObjectId;        // userId del usuario principal (AUTH-05)
  finalizadoEn: Date | null;
  origenTransicion: OrigenTransicion | null;
}

export interface CrearPagoPendienteDTO {
  planId: string; planVersion: number; periodo: PeriodoCobro;
  precioTotalCop: string;              // del plan (BILL-01); nunca del cliente
  aceptaciones: IAceptaciones; expiraEn: Date; intentadoPor: string;
}

export interface ContextoTransicion {
  origen: OrigenTransicion;
  providerTransactionId?: string; metodo?: string; detalleProveedor?: string;
}

export type ResultadoTransicion = 'aplicada' | 'sin_cambio' | 'rechazada';
export interface ITransicionResult { resultado: ResultadoTransicion; pago: IPaymentResponse }

export interface IPaymentResponse {           // Decimal128 → string (ADR 0005 §3)
  _id: string; reference: string; estado: EstadoPago; amountInCents: number; currency: 'COP';
  planId: string; planVersion: number; periodo: PeriodoCobro;
  precio: { totalCop: string; baseCop: string; ivaCop: string; ivaPct: string };
  metodo: string | null; expiraEn: string; finalizadoEn: string | null; createdAt: string;
}
export interface ISubscriptionResponse { /* espejo serializado de ISubscription, sin tenantId */ }

export type ResultadoEvento =
  | 'aplicado' | 'sin_cambio' | 'rechazado_transicion' | 'monto_no_coincide'
  | 'referencia_desconocida' | 'requiere_revision' | 'error';

export interface IPaymentEvent {
  claveIdempotencia: string;           // derivación en HT-PAY-02; aquí solo unicidad
  evento: string;                      // 'transaction.updated'
  transaccionId: string | null;
  estadoReportado: string | null;      // estado de Wompi tal cual (APPROVED…)
  reference: string | null;
  amountInCents: number | null;
  currency: string | null;
  entorno: 'test' | 'prod' | null;
  recibidoEn: Date;
  tenantId: Types.ObjectId | null;     // null hasta resolverse (ADR-0022)
  paymentId: Types.ObjectId | null;
  procesadoEn: Date | null;
  resultado: ResultadoEvento | null;
}
```
El **cuerpo crudo no se persiste** (decisión 6 de la spec).

### Modelos e índices
| Colección | Índices | Nota |
|---|---|---|
| `subscriptions` | `{ tenantId: 1 }` **unique** | `timestamps: true`. Sin documento = `sin_plan`. |
| `payments` | `{ reference: 1 }` unique · `{ providerTransactionId: 1 }` unique, `partialFilterExpression: { providerTransactionId: { $type: 'string' } }` · `{ tenantId: 1, createdAt: -1 }` · `{ tenantId: 1, estado: 1 }` unique parcial `{ estado: 'PENDIENTE' }` · `{ estado: 1, expiraEn: 1 }` | `reference` y `providerTransactionId` son globales como `phoneNumberId` (ADR-0022). El último índice no empieza por `tenantId`: lo usará el barrido de HT-PAY-03, se documenta junto al índice. |
| `payment_events` | `{ claveIdempotencia: 1 }` unique · `{ reference: 1, recibidoEn: -1 }` · `{ tenantId: 1, recibidoEn: -1 }` parcial `{ tenantId: { $type: 'objectId' } }` | Sin `updatedAt`. `tenantId` **no** requerido: excepción documentada (ADR-0022). |

`Payment`: `amountInCents` con `validate: Number.isSafeInteger` y `min: 1`; `currency` enum `['COP']`;
`precio.*` `Decimal128` requeridos; `aceptaciones.*` requeridos; `intentadoPor` ref `User`.

### `payment.reference.ts`
```ts
export const PREFIJO_REFERENCIA = 'SOFI-';
export function generarReferencia(): string;            // randomBytes(15) → base32 RFC 4648 sin padding (24 chars)
export function esReferenciaValida(v: string): boolean; // REFERENCIA_REGEX = /^SOFI-[A-Z2-7]{24}$/
```
Codificación base32 propia de ~10 líneas (sin dependencia nueva).

### `payment.estado.ts`
```ts
export function esTerminal(e: EstadoPago): e is EstadoPagoTerminal;
export function esTransicionValida(desde: EstadoPago, hacia: EstadoPago): boolean; // desde === 'PENDIENTE' && esTerminal(hacia)
```

### `payment.service.ts`
```ts
export async function crearPagoPendiente(tenantId: string, dto: CrearPagoPendienteDTO): Promise<IPaymentResponse>;
export async function obtenerPago(tenantId: string, paymentId: string): Promise<IPaymentResponse>;        // 404 si no es del tenant
export async function obtenerPagoPorReferencia(tenantId: string, reference: string): Promise<IPaymentResponse>; // scoped; para BILL-02 y el worker
export async function transicionarPago(tenantId: string, paymentId: string, hacia: EstadoPago, ctx: ContextoTransicion): Promise<ITransicionResult>;
```
- `crearPagoPendiente`: `aCentavos` + `desglosarIva` → `createScoped`. Error `E11000` sobre
  `reference` → reintenta (máx. 3); sobre `{ tenantId, estado }` → `AppError('Ya hay un pago pendiente', 409)`.
- `transicionarPago`:
  1. `esTerminal(hacia)` o `AppError(400)`.
  2. `findOneAndUpdateScoped(Payment, tenantId, { _id, estado: 'PENDIENTE' }, { $set: { estado: hacia, finalizadoEn: now, origenTransicion, ...opcionales } }, { new: true }).lean()`.
  3. Si devuelve doc → `aplicada`. Si no, `findByIdScoped` → `null` ⇒ `AppError(404)`;
     `estado === hacia` ⇒ `sin_cambio`; otro terminal ⇒ `rechazada`.
  4. `E11000` sobre `providerTransactionId` (la transacción ya está en otro pago) ⇒ `AppError(409)`.
- La función **no** decide si el monto coincide (D4) ni activa la suscripción: eso lo orquestan
  HT-PAY-02 y HU-BILL-03 llamándola. Es el único camino de transición para webhook y conciliación.

### `subscription.service.ts`
```ts
export async function obtenerSuscripcion(tenantId: string): Promise<ISubscriptionResponse>; // findOneScoped; si null → valor sin_plan, sin escribir
```
Las escrituras (`activar`, `marcarVencida`) llegan con HU-BILL-03 y HT-PAY-03.

### `payment-event.service.ts`
```ts
export async function registrarEvento(datos: Omit<IPaymentEvent, 'tenantId'|'paymentId'|'procesadoEn'|'resultado'|'recibidoEn'>): Promise<{ nuevo: true; eventoId: string } | { nuevo: false }>;
export async function marcarEventoProcesado(eventoId: string, r: { tenantId: string | null; paymentId: string | null; resultado: ResultadoEvento }): Promise<boolean>; // filtro procesadoEn: null
```
Acceso directo al modelo **solo en este archivo**, con comentario que enlaza ADR-0022: es la
colección global (como `MetaIntegration` en el webhook). `E11000` en `claveIdempotencia` ⇒
`{ nuevo: false }`.

### `payment.resolver.ts`
```ts
/** EXCEPCIÓN ADR-0022 / multi-tenancy §5.8: lectura global por índice único; solo proyecta ids. */
export async function resolverTenantPorReferencia(reference: string): Promise<{ tenantId: string; paymentId: string } | null>;
```
`esReferenciaValida` primero (no consulta con basura); `Payment.findOne({ reference }).select({ _id: 1, tenantId: 1 }).lean()`.

### `billing.validation.ts`
`referenceParamSchema = z.object({ params: z.object({ reference: z.string().regex(REFERENCIA_REGEX) }) })`
para el `GET /api/billing/intentos/:reference` de HU-BILL-02.

### Jobs BullMQ
Ninguno en este feature. La cola `payments` es de HT-PAY-02 y el barrido de HT-PAY-03.

## Notas

- **ADR-0021** sigue la plantilla del README (Estado · Fecha · Contexto · Decisión · Alternativas ·
  Consecuencias). Alternativas a recoger: pasarela por tenant (descartada, D1), monto desde el
  cliente (descartado, D4), referencia con `tenantId` (descartada, D8), `Decimal128` para
  `amountInCents` (descartado, decisión 2), permitir `APROBADO → ANULADO` automático (descartado,
  decisión 4).
- **ADR-0022**: el `reference` cumple el papel que `phone_number_id` cumple en el webhook de Meta.
  Tras resolver, todo vuelve a `*Scoped` con ese `tenantId`. Recoge también que `payment_events` es
  global y append-only, y que el barrido de HT-PAY-03 documentará su propia entrada en §5.
- **`docs/integrations/wompi.md`** (verificar cada dato contra la documentación oficial de Wompi
  al escribirlo):
  - URL base: `https://sandbox.wompi.co/v1` y `https://production.wompi.co/v1`, según `WOMPI_ENV`.
  - Llaves: `pub_test_`/`pub_prod_`, `prv_test_`/`prv_prod_`, `test_events_`/`prod_events_`,
    `test_integrity_`/`prod_integrity_`. Solo la pública llega al frontend.
  - Firma de integridad: `SHA256(reference + amountInCents + currency + expirationTime + integritySecret)`.
  - Checksum de evento: `SHA256(valores de signature.properties en orden + timestamp + eventsSecret)`,
    comparado con `signature.checksum` usando `timingSafeEqual`.
  - Estados: `PENDING` (→ sigue `PENDIENTE`), `APPROVED` → `APROBADO`, `DECLINED` → `RECHAZADO`,
    `VOIDED` → `ANULADO` (o `requiere_revision` si ya estaba `APROBADO`), `ERROR` → `ERROR`.
    `EXPIRADO` es nuestro (checkout no completado antes de `expiraEn`).
  - Tokens de aceptación: `GET /merchants/{public_key}` → `presigned_acceptance` y
    `presigned_personal_data_auth`.
  - Widget `https://checkout.wompi.co/widget.js` y Web Checkout `https://checkout.wompi.co/p/`.
- `docs/data-model.md`: insertar las tres colecciones tras `tenant_usage`, con el mismo formato
  (bloque `js` + línea de índices + nota).
- La referencia tiene 120 bits de entropía: no es enumerable y no revela orden ni tenant.
- `intentadoPor` no se valida aquí contra `esPrincipal`; lo hace HU-BILL-02 en su service.
- Fixture de aceptaciones con tokens falsos: ningún test llama a Wompi.

## Verificación

- `pnpm --filter @sofiapp/shared typecheck` · `pnpm --filter @sofiapp/api typecheck`
  · `pnpm --filter @sofiapp/api test`.
- Tests: `money.util.test.ts`, `payment.reference.test.ts`, `payment.estado.test.ts`,
  `payment.service.test.ts` (incluye concurrencia), `payment-event.service.test.ts`,
  `payment.resolver.test.ts`, `subscription.service.test.ts`, `billing.isolation.test.ts`.
- Revisión de docs: ADR-0021/0022 enlazados desde el README, `CLAUDE.md` regla 2, `multi-tenancy.md`
  §5.8, `wompi.md`, `data-model.md` y `domain.md`.
