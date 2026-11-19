# HT-PAY-01 — Plan técnico (CÓMO)

## Archivos a crear / tocar

```
docs/
├── integrations/wompi.md                        # + variables, contrato de la interfaz, reintentos, vectores
└── 01-pasarela.md                               # corregir /merchants/{pub} → /merchants/info (2 sitios)

apps/backend/src/
├── config/
│   ├── payments-env.ts                          # NUEVO — validarEntornoPagos (pura, usada por env.ts)
│   ├── payments-env.test.ts                     # NUEVO
│   └── env.ts                                   # + 8 variables; el superRefine llama a validarEntornoPagos
└── integrations/payments/
    ├── payment-provider.interface.ts            # IPaymentProvider + tipos de entrada/salida
    ├── wompi.estado.ts                          # mapearEstadoWompi (pura)
    ├── wompi.signature.ts                       # firmarIntegridad, calcularChecksumEvento, checksumsIguales
    ├── wompi.event.ts                           # verificarEventoWompi (pura): Zod + checksum + normalización
    ├── wompi.http.client.ts                     # fetch con timeout, backoff solo en GET, errores → AppError
    ├── wompi.provider.ts                        # createWompiProvider(config, deps)
    ├── stub-payment.provider.ts                 # createStubPaymentProvider()
    ├── payment-provider.factory.ts              # getPaymentProvider() según env.PAYMENTS_PROVIDER
    ├── wompi.estado.test.ts
    ├── wompi.signature.test.ts
    ├── wompi.event.test.ts
    ├── wompi.http.client.test.ts
    ├── wompi.provider.test.ts
    ├── stub-payment.provider.test.ts
    ├── payment-provider.factory.test.ts
    ├── payments.isolation.test.ts               # el módulo no conoce tenants ni Mongo
    └── wompi.contract.test.ts                   # OPCIONAL: sandbox real, skip sin llaves
```

Sin modelo, controller, routes ni montaje en `app.ts`: este feature es un adaptador (como
`integrations/trm`). No hay colas ni jobs.

## Contratos

### Variables de entorno (`config/env.ts`)
```ts
PAYMENTS_PROVIDER: z.enum(['wompi', 'stub']).default('stub'),
WOMPI_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
WOMPI_PUBLIC_KEY: z.string().min(1).optional(),
WOMPI_PRIVATE_KEY: z.string().min(1).optional(),
WOMPI_EVENTS_SECRET: z.string().min(1).optional(),
WOMPI_INTEGRITY_SECRET: z.string().min(1).optional(),
WOMPI_REDIRECT_URL: z.string().url().optional(),
WOMPI_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
```
Opcionales en el esquema base **a propósito** (como `SPACES_*`): la obligatoriedad condicional vive en
el `superRefine`, no en un `requiredInRuntime`, porque depende de `PAYMENTS_PROVIDER`.

### `config/payments-env.ts`
```ts
export const PREFIJOS_WOMPI: Readonly<Record<'sandbox' | 'production', Record<ClaveWompi, string>>> = {
  sandbox:    { WOMPI_PUBLIC_KEY: 'pub_test_', WOMPI_PRIVATE_KEY: 'prv_test_',
                WOMPI_EVENTS_SECRET: 'test_events_', WOMPI_INTEGRITY_SECRET: 'test_integrity_' },
  production: { WOMPI_PUBLIC_KEY: 'pub_prod_', WOMPI_PRIVATE_KEY: 'prv_prod_',
                WOMPI_EVENTS_SECRET: 'prod_events_', WOMPI_INTEGRITY_SECRET: 'prod_integrity_' },
};
export interface EntornoPagos { PAYMENTS_PROVIDER: 'wompi' | 'stub'; WOMPI_ENV: 'sandbox' | 'production'; /* + las 5 */ }
/** Devuelve una lista de { path, message }; vacía si es válido o si el provider es 'stub'. */
export function validarEntornoPagos(valores: EntornoPagos): { path: string; message: string }[];
```
- `wompi`: cada una de las 5 variables (`*_KEY`, `*_SECRET`, `WOMPI_REDIRECT_URL`) es obligatoria; las 4
  de llave/secreto deben empezar por el prefijo de `WOMPI_ENV`. Mensajes por variable, sin imprimir su
  valor (un secreto mal puesto no debe salir en el log de arranque).
- `env.ts` solo hace `for (const i of validarEntornoPagos(valores)) ctx.addIssue({ code: custom, path: [i.path], message: i.message })`
  **antes** del `return` temprano de Spaces (que hoy corta el `superRefine` si el driver no es `spaces`):
  se reordena para que ambas validaciones corran.

### `payment-provider.interface.ts`
```ts
import type { EstadoPago } from '@sofiapp/shared';

export interface CrearIntentoParams { reference: string; amountInCents: number; expiraEn: Date }
export interface DatosCheckout {
  publicKey: string; currency: 'COP'; amountInCents: number; reference: string;
  expirationTime: string;          // ISO 8601 UTC; el MISMO string que se firmó
  signatureIntegrity: string;      // SHA256 hex
  redirectUrl: string;
}
export interface TokensAceptacion {
  aceptacion: { token: string; urlTerminos: string };
  datosPersonales: { token: string; urlPolitica: string };
}
export interface TransaccionProveedor {
  id: string; reference: string;
  estado: EstadoPago | null;       // null = estado desconocido
  estadoProveedor: string;         // el de Wompi, tal cual
  amountInCents: number; currency: string;
  metodo: string | null; detalle: string | null;
}
export interface EventoProveedor {
  evento: string; transaccionId: string; estado: EstadoPago | null; estadoProveedor: string;
  reference: string; amountInCents: number; currency: string;
  entorno: 'test' | 'prod'; timestamp: number;
}
export type ResultadoVerificacion = { valido: true; evento: EventoProveedor } | { valido: false };

export interface IPaymentProvider {
  readonly nombre: 'wompi' | 'stub';
  crearIntento(p: CrearIntentoParams): Promise<DatosCheckout>;
  obtenerTokensAceptacion(): Promise<TokensAceptacion>;
  consultarTransaccion(id: string): Promise<TransaccionProveedor>;                 // AppError 404 si no existe
  buscarPorReferencia(reference: string): Promise<TransaccionProveedor | null>;
  verificarEvento(body: unknown, checksumCabecera?: string): ResultadoVerificacion; // síncrona y pura
}
```
Ninguna operación recibe `tenantId`.

### `wompi.estado.ts`
```ts
export function mapearEstadoWompi(estado: string): EstadoPago | null;
// PENDING→PENDIENTE · APPROVED→APROBADO · DECLINED→RECHAZADO · VOIDED→ANULADO · ERROR→ERROR · otro→null
```

### `wompi.signature.ts`
```ts
export function firmarIntegridad(i: { reference: string; amountInCents: number; currency: string;
                                      expirationTime: string; integritySecret: string }): string;
// createHash('sha256').update(`${reference}${amountInCents}${currency}${expirationTime}${integritySecret}`).digest('hex')
export function calcularChecksumEvento(valores: readonly string[], timestamp: number, eventsSecret: string): string;
// SHA256(valores.join('') + timestamp + eventsSecret), hex
export function checksumsIguales(a: string, b: string): boolean;
// minúsculas en ambos; si las longitudes difieren → false SIN lanzar; si no, timingSafeEqual
```

### `wompi.event.ts`
```ts
export function verificarEventoWompi(body: unknown, checksumCabecera: string | undefined, eventsSecret: string): ResultadoVerificacion;
```
1. `EventoWompiSchema.safeParse(body)`: `{ event: string, data: record, environment: 'test'|'prod',
   timestamp: int, signature: { properties: string[] min 1, checksum: string min 1 } }`. Falla → `{ valido:false }`.
2. Si `checksumCabecera` viene y `!checksumsIguales(cabecera, signature.checksum)` → `{ valido:false }`.
3. Resuelve cada `properties[i]` como ruta con puntos sobre `data` (`transaction.amount_in_cents`).
   Cada valor debe ser `string | number | boolean`; si falta o es otro tipo → inválido. Los convierte con `String()`.
4. `checksumsIguales(calcularChecksumEvento(valores, timestamp, eventsSecret), signature.checksum)`.
5. Solo si coincide: lee `data.transaction` con un segundo esquema Zod (`id`, `status`, `amount_in_cents`
   int, `currency`, `reference`) y arma el `EventoProveedor`. Si ese esquema falla → `{ valido:false }`.
Nunca lanza y nunca devuelve campos del evento si el checksum no coincide.

### `wompi.http.client.ts`
```ts
export interface WompiHttpConfig { baseUrl: string; timeoutMs: number; reintentos?: number; backoffBaseMs?: number }
export interface WompiHttpDeps { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> }
export interface WompiHttpClient {
  get(ruta: string, opciones: { headers: Record<string, string> }): Promise<unknown>;   // JSON ya parseado
}
export function createWompiHttpClient(cfg: WompiHttpConfig, deps?: WompiHttpDeps): WompiHttpClient;
```
- Solo expone `get`: **no hay POST** en este feature, así que la regla «no reintentar POST» queda
  garantizada por construcción (cuando HU-BILL-04 añada `post`, nacerá sin reintento).
- `AbortSignal.timeout(timeoutMs)` en cada intento. Reintentos por defecto 2, backoff
  `250 · 2^n` ms, sobre error de red, timeout, 429 y 5xx. 404 y demás 4xx no se reintentan.
- Mapeo final: timeout → `AppError('La pasarela de pagos no respondió a tiempo', 504)`; red/5xx/429
  agotados → `502`; 401/403 → `AppError('La pasarela de pagos no está disponible', 503)` + `logger.error`
  con `{ ruta, status }` (llaves mal configuradas: es un problema del operador, no del usuario);
  404 → `AppError('Recurso no encontrado en la pasarela', 404)`; otro 4xx → `502`.
- Los mensajes de `AppError` son fijos: **jamás** incluyen el cuerpo, las cabeceras ni la URL con query.
  El `logger` solo recibe `{ ruta (sin query), status, intento }`.

### `wompi.provider.ts`
```ts
export interface WompiConfig { env: 'sandbox' | 'production'; publicKey: string; privateKey: string;
  eventsSecret: string; integritySecret: string; redirectUrl: string; timeoutMs: number }
export const WOMPI_BASE_URL = { sandbox: 'https://sandbox.wompi.co/v1', production: 'https://production.wompi.co/v1' } as const;
export function createWompiProvider(cfg: WompiConfig, deps?: WompiHttpDeps): IPaymentProvider;
```
- `crearIntento`: valida con `esReferenciaValida` (de HT-PAY-04), `Number.isSafeInteger(amountInCents) &&
  >= 1` y `expiraEn` entre `now + 60 s` y `now + 24 h` (400 si no); `expirationTime = expiraEn.toISOString()`;
  firma con `firmarIntegridad`; devuelve `DatosCheckout` con `publicKey` (la pública, nunca la privada).
- `obtenerTokensAceptacion`: `GET /merchants/info`, header `x-merchant-public-key`. Zod sobre
  `data.presigned_acceptance` y `data.presigned_personal_data_auth` (`acceptance_token`, `permalink`).
  Forma inesperada → `AppError(502)`.
- `consultarTransaccion(id)`: `GET /transactions/{encodeURIComponent(id)}`, `Authorization: Bearer <privateKey>`.
- `buscarPorReferencia(ref)`: `GET /transactions?reference={ref}` (la referencia ya validada por regex);
  `data` vacío → `null`; si hay varias, la más reciente (`created_at` mayor). 404 → `null`.
- Ambas parsean `{ data: { id, status, amount_in_cents, currency, reference, payment_method_type?,
  status_message? } }` con Zod y arman `TransaccionProveedor` (`estado` por `mapearEstadoWompi`).
- `verificarEvento` delega en `verificarEventoWompi(body, cabecera, cfg.eventsSecret)`.

### `stub-payment.provider.ts`
```ts
export const STUB_INTEGRITY_SECRET = 'stub_integrity_secret';
export const STUB_EVENTS_SECRET = 'stub_events_secret';
export interface StubPaymentProvider extends IPaymentProvider {
  sembrarTransaccion(t: TransaccionProveedor): void;
  construirEventoFirmado(t: TransaccionProveedor, opciones?: { timestamp?: number }): { body: unknown; checksum: string };
}
export function createStubPaymentProvider(): StubPaymentProvider;
```
Usa las mismas funciones puras (`firmarIntegridad`, `calcularChecksumEvento`, `verificarEventoWompi`), así
HT-PAY-02 prueba su flujo completo contra el stub con firmas reales. Estado en un `Map` por instancia.

### `payment-provider.factory.ts`
```ts
export function getPaymentProvider(): IPaymentProvider;  // singleton perezoso por proceso
```
`stub` → `createStubPaymentProvider()`; `wompi` → `createWompiProvider(configDesdeEnv())` (las 5 variables
ya vienen validadas, el `!` no hace falta porque `payments-env` garantiza su presencia; se estrechan con
una función `configDesdeEnv` que lanza si faltan, como red de seguridad).

## Notas

- **Vectores de prueba** (reproducibles con `sha256sum`, calculados al planear):
  - Firma de integridad con `reference=SOFI-AAAAAAAAAAAAAAAAAAAAAAAA`, `amountInCents=11900000`,
    `currency=COP`, `expirationTime=2026-11-19T20:28:50.000Z`, secreto `test_integrity_secretodeprueba`:
    cadena `SOFI-AAAAAAAAAAAAAAAAAAAAAAAA11900000COP2026-11-19T20:28:50.000Ztest_integrity_secretodeprueba`
    → `4c0eb341acc4a19d56488b7e42fb5b37424b5790709d64202d777823a8722a39`.
  - Checksum de evento con `properties = [transaction.id, transaction.status, transaction.amount_in_cents]`,
    valores `1234-1668624786-37890`, `APPROVED`, `11900000`, `timestamp=1668624786`, secreto
    `test_events_secretodeprueba`: cadena `1234-1668624786-37890APPROVED119000001668624786test_events_secretodeprueba`
    → `303b8490301963ee486c72006652759ea5b6d283070d3f97f3f0a21cf9789674`.
  Son vectores propios, no de Wompi: validan la fórmula documentada, no la aceptación por parte de Wompi.
  Esa la confirma la prueba de contrato.
- **Prueba de contrato** (`wompi.contract.test.ts`): `describe.skipIf(!process.env.WOMPI_CONTRACT_TEST)`;
  solo corre con llaves de **sandbox** reales y comprueba: `/merchants/info`, una transacción de sandbox
  (consulta por id y por referencia) y que el checksum de un evento real de sandbox verifica. Es donde se
  cierran las tres incógnitas de `wompi.md` (mayúsculas del checksum, autenticación de
  `/transactions?reference=`, estados adicionales). No forma parte de `pnpm test` por defecto.
- El orden del `superRefine` hoy es `if (MEDIA_DRIVER !== 'spaces') return;`: añadir la validación de
  pagos **antes** de ese `return`, o no se ejecutaría nunca con el driver por defecto.
- `vitest.config.ts` no define variables de Wompi: el valor por defecto `stub` mantiene toda la suite
  existente sin cambios.
- `fetch` y `sleep` se inyectan para testear reintentos y timeouts sin red ni esperas reales.
- La URL del checkout (`checkout.wompi.co`) y el `widget.js` son del frontend (HU-BILL-02/HT-PAY-05).
- Si Wompi cambia la URL base o retira otro endpoint, solo cambia `wompi.provider.ts`: el dominio no
  se entera (el objetivo del puerto).

## Verificación

- `pnpm --filter @sofiapp/api typecheck` · `pnpm --filter @sofiapp/api test`.
- Tests nuevos: `payments-env`, `wompi.estado`, `wompi.signature` (vectores), `wompi.event`,
  `wompi.http.client` (reintentos, timeout, mapeo de errores, sin secretos), `wompi.provider`
  (con `fetch` simulado), `stub-payment.provider`, `payment-provider.factory`, `payments.isolation`.
- Arranque: con `PAYMENTS_PROVIDER=wompi` y una llave con prefijo equivocado, el proceso debe abortar
  con el mensaje de esa variable (verificado en `payments-env.test.ts`, sin arrancar el servidor).
- Opcional, a mano: `WOMPI_CONTRACT_TEST=1` con llaves de sandbox.
