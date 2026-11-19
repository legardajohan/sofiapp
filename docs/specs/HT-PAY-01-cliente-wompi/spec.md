# HT-PAY-01 — `IPaymentProvider` y cliente Wompi (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Es el adaptador entre SofiApp y Wompi (`docs/01-pasarela.md`, orden 2): firma del
> checkout, tokens de aceptación, consulta de transacciones y verificación de eventos. Se apoya en
> HT-PAY-04 (modelos, referencia, centavos) y en `docs/integrations/wompi.md`.

**Estado:** implementado

## Objetivo

Disponer de una interfaz `IPaymentProvider` con dos implementaciones (`wompi` y `stub`, como
`integrations/trm`) y de las variables de entorno de Wompi validadas al arrancar. Con esto,
HT-PAY-02 (webhook), HU-BILL-01 (panel de la integración) y HU-BILL-02 (pago del admin) consumen un
único puerto y se pueden probar sin llamar a Wompi.

## Alcance

Incluye:
- **`IPaymentProvider`** en `integrations/payments/` con cinco operaciones:
  `crearIntento`, `obtenerTokensAceptacion`, `consultarTransaccion`, `buscarPorReferencia` y
  `verificarEvento`.
- **Implementación `wompi`**:
  - URL base según `WOMPI_ENV` (`sandbox | production`).
  - **Firma de integridad** `SHA256(reference + amountInCents + currency + expirationTime + integritySecret)`,
    siempre con `expirationTime` (ISO 8601 UTC).
  - **Tokens de aceptación** con `GET /merchants/info` y el header `x-merchant-public-key`
    (el endpoint `GET /merchants/{public_key}` está retirado: ver `wompi.md` §6).
  - **Consulta** de una transacción por id y por referencia.
  - **Verificación de eventos**: checksum con `timingSafeEqual`, y normalización del cuerpo a un
    `EventoProveedor` con el estado ya mapeado a `EstadoPago`.
- **Cliente HTTP** propio con timeout, reintento con backoff **solo en GET** y errores mapeados a
  `AppError`. Nunca registra llaves, cabeceras de autorización ni cuerpos de eventos.
- **Implementación `stub`**: determinista, sin red, con transacciones sembrables desde el test; para
  desarrollo, tests de otras specs y entornos sin llaves.
- **Variables de entorno** en `config/env.ts` (Zod): `PAYMENTS_PROVIDER`, `WOMPI_ENV`,
  `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_SECRET`, `WOMPI_INTEGRITY_SECRET`,
  `WOMPI_REDIRECT_URL` y `WOMPI_HTTP_TIMEOUT_MS`. **El arranque falla** si `PAYMENTS_PROVIDER=wompi`
  y falta alguna, o si un prefijo de llave no corresponde a `WOMPI_ENV`.
- **Mapeo de estados** de Wompi a `EstadoPago` (`wompi.md` §5) como función pura.
- **Fábrica** `getPaymentProvider()` que elige la implementación por `PAYMENTS_PROVIDER`.
- Documentación: actualizar `docs/integrations/wompi.md` (variables, contrato de la interfaz,
  vectores de prueba) y corregir `docs/01-pasarela.md` (`/merchants/{pub}` → `/merchants/info`).

Fuera de alcance (otros features):
- Endpoint del webhook, cola `payments`, derivación de `claveIdempotencia` y la verificación de
  monto/moneda/referencia contra el pago guardado (D4) → **HT-PAY-02**. Aquí solo se verifica la
  **autenticidad** del evento, no su coherencia con un pago.
- `helmet`, rate limit, redacción general del logger y CSP → **HT-PAY-05**. Este feature se limita a
  no registrar secretos desde su propio código.
- Panel de la integración, llaves enmascaradas y la prueba de conectividad expuesta por HTTP →
  **HU-BILL-01** (usará `obtenerTokensAceptacion` como sonda).
- Endpoints de billing, datos fiscales y términos → **HU-BILL-02**. Por eso este feature **no
  tiene modelo, controller ni routes** y no se monta nada en `app.ts`.
- Crear transacciones o fuentes de pago con la llave privada, y el cobro automático → **HU-BILL-04**.
- Conciliación periódica → **HT-PAY-03** (usará `consultarTransaccion` y `buscarPorReferencia`).

## Decisiones de esta spec

1. **`PAYMENTS_PROVIDER` (`wompi | stub`, por defecto `stub`)** decide qué implementación se usa y
   si las llaves son obligatorias. Desarrollo y tests arrancan sin llaves; quien activa `wompi`
   está obligado a configurarlas todas. No se obliga `wompi` por `NODE_ENV=production`: forzarlo
   rompería el despliegue de esta spec antes de que existan las llaves reales. Ese control lo cubre
   el checklist de HT-PAY-06.
2. **La interfaz es independiente de Mongo y del tenant.** Ninguna operación recibe `tenantId` ni
   toca la base de datos: opera sobre referencia, monto e ids de Wompi. Así el aislamiento no puede
   romperse desde aquí.
3. **`verificarEvento` es síncrono y puro** (no hace red): comprueba el checksum y normaliza. Un
   evento con checksum inválido nunca devuelve datos utilizables.
4. **Un estado de Wompi desconocido no mueve el pago.** El mapeo devuelve `PENDIENTE` para
   `PENDING` y `null` para lo no reconocido; HT-PAY-02 registrará el evento como `error`.
5. **Comparación del checksum sin distinguir mayúsculas.** La documentación no lo aclara y su
   ejemplo va en mayúsculas, así que se normaliza ambos lados a minúsculas antes de comparar. La
   prueba contra el sandbox (tarea de contrato, opcional) lo confirma.
6. **La caducidad del checkout la fija quien llama** (`expiraEn`); el adaptador solo la valida
   (futura con al menos 1 minuto y como máximo 24 horas) y la firma.
7. **Las consultas de transacciones usan la llave privada** como `Authorization: Bearer`; los
   tokens de aceptación, la llave pública. Las rutas y la autenticación exactas de
   `buscarPorReferencia` se confirman con la prueba de contrato en sandbox.
8. **Sin caché** de tokens de aceptación ni de transacciones: cada llamada va a Wompi.

## Criterios de aceptación

1. **Entorno.** `config/env.ts` valida con Zod `PAYMENTS_PROVIDER` (default `stub`), `WOMPI_ENV`
   (`sandbox | production`, default `sandbox`), `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`,
   `WOMPI_EVENTS_SECRET`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_REDIRECT_URL` (URL) y
   `WOMPI_HTTP_TIMEOUT_MS` (default 8000). Con `PAYMENTS_PROVIDER=wompi`, la falta de cualquiera de
   las seis primeras o un prefijo que no corresponde a `WOMPI_ENV` (`pub_test_`/`pub_prod_`,
   `prv_test_`/`prv_prod_`, `test_events_`/`prod_events_`, `test_integrity_`/`prod_integrity_`)
   hace fallar la validación con un mensaje por variable. Con `stub` no se exige ninguna.
2. **Esquema testeable.** La validación del paso anterior vive en una función pura exportada que los
   tests invocan sin tocar `process.env`.
3. **URL base.** `wompi` usa `https://sandbox.wompi.co/v1` o `https://production.wompi.co/v1` según
   `WOMPI_ENV`; la URL del checkout no cambia.
4. **Firma de integridad.** `crearIntento` devuelve `{ publicKey, currency: 'COP', amountInCents,
   reference, expirationTime, signatureIntegrity, redirectUrl }`. La firma coincide con un vector
   calculado a mano: `SHA256(reference + amountInCents + 'COP' + expirationTime + integritySecret)`
   en hexadecimal, con `expirationTime` en `toISOString()` y el **mismo string** devuelto en la
   respuesta. Cambiar un solo carácter de cualquier componente cambia la firma.
5. **Validación de `crearIntento`.** Rechaza con `AppError(400)` una referencia con formato inválido,
   un `amountInCents` no entero, menor que 1 o no seguro, y un `expiraEn` pasado, a menos de 1
   minuto o a más de 24 horas. La respuesta no contiene ningún secreto ni la llave privada.
6. **Tokens de aceptación.** `obtenerTokensAceptacion` hace `GET {base}/merchants/info` con el header
   `x-merchant-public-key` y devuelve `{ aceptacion: { token, urlTerminos }, datosPersonales: {
   token, urlPolitica } }` tomados de `presigned_acceptance` y `presigned_personal_data_auth`.
   Una respuesta sin esos campos lanza `AppError(502)`.
7. **Consulta.** `consultarTransaccion(id)` y `buscarPorReferencia(reference)` devuelven una
   `TransaccionProveedor` `{ id, reference, estado (EstadoPago | null), estadoProveedor,
   amountInCents, currency, metodo, detalle }`. `buscarPorReferencia` devuelve `null` si Wompi no
   tiene la transacción; `consultarTransaccion` lanza `AppError(404)`.
8. **Mapeo de estados.** `APPROVED → APROBADO`, `DECLINED → RECHAZADO`, `VOIDED → ANULADO`,
   `ERROR → ERROR`, `PENDING → PENDIENTE`; cualquier otro valor → `null`.
9. **Verificación de eventos.** `verificarEvento(body, checksumCabecera?)` recalcula
   `SHA256(valores de signature.properties resueltos sobre data, en orden + timestamp +
   eventsSecret)` y lo compara con `timingSafeEqual` (sin distinguir mayúsculas). Devuelve
   `{ valido: true, evento }` solo si coincide; en cualquier otro caso `{ valido: false }` **sin
   datos del evento**. Es inválido si falta alguna propiedad de `signature.properties`, si el
   cuerpo no tiene la forma esperada, si el checksum del cuerpo y el de la cabecera difieren o si
   las longitudes no coinciden (sin lanzar). El `EventoProveedor` trae `evento`, `transaccionId`,
   `estado` mapeado, `estadoProveedor`, `reference`, `amountInCents`, `currency`, `entorno`
   (`test | prod`) y `timestamp`.
10. **Cliente HTTP.** Toda llamada lleva timeout (`WOMPI_HTTP_TIMEOUT_MS`). Los GET se reintentan
    hasta 2 veces con backoff exponencial ante error de red, timeout, 429 o 5xx; ningún POST se
    reintenta. Un timeout final → `AppError(504)`; un 5xx o red caída → `AppError(502)`; un
    401/403 (llaves inválidas) → `AppError(503)` con mensaje genérico para el usuario; un 4xx
    inesperado → `AppError(502)`. El mensaje de `AppError` nunca incluye llaves, el cuerpo de la
    respuesta ni cabeceras.
11. **Sin secretos en logs.** Los tests verifican que ni los mensajes de error ni las llamadas al
    `logger` hechas por el cliente contienen las llaves ni los secretos usados en el test.
12. **Stub.** `createStubPaymentProvider()` implementa la interfaz sin red: `crearIntento` firma con un
    secreto fijo de prueba, `obtenerTokensAceptacion` devuelve tokens falsos reconocibles,
    `consultarTransaccion`/`buscarPorReferencia` leen de transacciones sembradas con
    `sembrarTransaccion`, y `verificarEvento` acepta los eventos que el propio stub construye con
    `construirEventoFirmado` (y rechaza los alterados).
13. **Fábrica.** `getPaymentProvider()` devuelve el stub con `PAYMENTS_PROVIDER=stub` y el cliente
    Wompi con `wompi`; los services reciben el provider por inyección (patrón `ITrmProvider`).
14. **Documentación.** `docs/integrations/wompi.md` documenta las variables, el contrato de
    `IPaymentProvider`, la política de reintentos y al menos un vector de firma y uno de checksum
    reproducibles; `docs/01-pasarela.md` ya no cita `GET /merchants/{pub}`.
15. **Aislamiento multi-tenant.** `integrations/payments/` no recibe ni devuelve `tenantId`, no
    importa `mongoose`, modelos ni el repositorio base (lo comprueba un test que lee los fuentes), y
    la respuesta de `crearIntento` es idéntica en forma para dos referencias de tenants distintos
    sin dato alguno que identifique al tenant. `pnpm --filter @sofiapp/api typecheck`
    (`tsc --noEmit`) y `pnpm --filter @sofiapp/api test` en verde.

## Dependencias

- `HT-PAY-04`: `esReferenciaValida`, `aCentavos`, `EstadoPago` de `@sofiapp/shared` y
  `docs/integrations/wompi.md` (creado allí).
- Patrón `integrations/trm` (interfaz, proveedor real, stub, inyección) y `config/env.ts`.
- Documentación oficial de Wompi (contrastada el 2026-11-19; lo no confirmado queda marcado en
  `wompi.md`).
