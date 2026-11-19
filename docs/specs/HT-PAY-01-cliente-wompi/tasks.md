# HT-PAY-01 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Rama: `feat/HT-PAY-01`, creada **desde `feat/HT-PAY-04`** (depende de su
> referencia, de `aCentavos` y de `EstadoPago`; HT-PAY-04 aún no está en `develop`).

## Implementación

> Este feature es un adaptador: no tiene modelo, controller, routes ni montaje en `app.ts`.

- [x] `config/payments-env.ts`: `PREFIJOS_WOMPI`, `EntornoPagos` y `validarEntornoPagos` (pura; no
      imprime el valor de ninguna llave en sus mensajes). (CA 1, 2)
- [x] `config/env.ts`: añadir las 8 variables (`PAYMENTS_PROVIDER` default `stub`, `WOMPI_ENV` default
      `sandbox`, `WOMPI_HTTP_TIMEOUT_MS` default 8000, el resto opcional) y llamar a
      `validarEntornoPagos` en el `superRefine` **antes** del `return` temprano de Spaces. (CA 1, 2)
- [x] `integrations/payments/payment-provider.interface.ts`: `IPaymentProvider` y los tipos
      (`CrearIntentoParams`, `DatosCheckout`, `TokensAceptacion`, `TransaccionProveedor`,
      `EventoProveedor`, `ResultadoVerificacion`). Cero `any`, sin `tenantId`. (CA 4, 6, 7, 9, 15)
- [x] `wompi.estado.ts`: `mapearEstadoWompi`. (CA 8)
- [x] `wompi.signature.ts`: `firmarIntegridad`, `calcularChecksumEvento`, `checksumsIguales`
      (minúsculas en ambos lados; longitudes distintas → `false` sin lanzar). (CA 4, 9)
- [x] `wompi.event.ts`: `verificarEventoWompi` (Zod → cabecera vs cuerpo → propiedades → checksum →
      normalización; nunca lanza, nunca devuelve datos si el checksum no coincide). (CA 9)
- [x] `wompi.http.client.ts`: `createWompiHttpClient` solo con `get`, timeout por intento, backoff
      `250 · 2^n` con 2 reintentos sobre red/timeout/429/5xx, mapeo a `AppError` 504/502/503/404,
      mensajes fijos, `logger` solo con `{ ruta sin query, status, intento }`. (CA 10, 11)
- [x] `wompi.provider.ts`: `WOMPI_BASE_URL`, `WompiConfig` y `createWompiProvider` con las cinco
      operaciones (validación de `crearIntento`, `/merchants/info`, `/transactions/{id}`,
      `/transactions?reference=`). (CA 3–8)
- [x] `stub-payment.provider.ts`: `createStubPaymentProvider` con `sembrarTransaccion` y
      `construirEventoFirmado`, reutilizando las funciones puras. (CA 12)
- [x] `payment-provider.factory.ts`: `getPaymentProvider` (singleton perezoso) y `configDesdeEnv` con
      red de seguridad. (CA 13)
- [x] `docs/integrations/wompi.md`: sección de variables, contrato de la interfaz, política de
      reintentos, los dos vectores del plan y la nota de la prueba de contrato. (CA 14)
- [x] `docs/01-pasarela.md`: sustituir `GET /merchants/{pub}` por `GET /merchants/info` en HT-PAY-01
      y HU-BILL-01. (CA 14)
- [x] `docs/specs/HT-PAY-04-modelos-pagos/plan.md`: corregir la mención de `GET /merchants/{public_key}`
      en sus notas (no es código, pero queda como referencia que se copia). (CA 14)

## Tests (Vitest)

- [x] `config/payments-env.test.ts`: con `stub` no se exige nada; con `wompi` falta cada variable →
      un error con su `path`; cada prefijo cruzado con el entorno equivocado (sandbox con `pub_prod_`
      y production con `pub_test_`, para las 4 llaves) → error; combinación correcta de cada entorno →
      sin errores; el mensaje no contiene el valor de la variable. (CA 1, 2)
- [x] `wompi.estado.test.ts`: los cinco estados, uno desconocido, cadena vacía y minúsculas → `null`.
      (CA 8)
- [x] `wompi.signature.test.ts`:
  - [x] vector de firma del plan (`4c0eb341…2a39`). (CA 4)
  - [x] cambiar un carácter de referencia, monto, moneda, expiración o secreto cambia la firma. (CA 4)
  - [x] vector de checksum del plan (`303b8490…9674`). (CA 9)
  - [x] `checksumsIguales`: iguales, distintos, distinta longitud (sin lanzar), mayúsculas vs
        minúsculas → `true`. (CA 9)
- [x] `wompi.event.test.ts`: (CA 9)
  - [x] evento válido → `{ valido: true }` con todos los campos y `estado` mapeado.
  - [x] checksum alterado, monto alterado en `data`, `timestamp` alterado y secreto distinto →
        `{ valido: false }` **sin** propiedad `evento`.
  - [x] falta una propiedad de `signature.properties` en `data` → inválido.
  - [x] cuerpo `null`, string, sin `signature`, sin `data`, `environment` raro → inválido sin lanzar.
  - [x] cabecera distinta del checksum del cuerpo → inválido; cabecera igual en otras mayúsculas →
        válido.
  - [x] estado desconocido con checksum válido → `{ valido: true, evento.estado: null }`.
- [x] `wompi.http.client.test.ts` (con `fetch` y `sleep` simulados): (CA 10, 11)
  - [x] 200 → JSON parseado.
  - [x] 503, 503, 200 → 3 intentos y éxito; 503 ×3 → `AppError(502)` tras 2 reintentos.
  - [x] el `sleep` recibe 250 y 500 ms.
  - [x] 429 se reintenta; 404 no (→ `AppError(404)`); 422 no (→ `502`).
  - [x] 401 y 403 → `AppError(503)` con mensaje genérico y un `logger.error`.
  - [x] timeout (`TimeoutError`) tras los reintentos → `AppError(504)`.
  - [x] el cliente no expone `post`.
  - [x] ni los mensajes de error ni los argumentos del `logger` contienen la llave, el secreto ni el
        cuerpo de la respuesta usados en el test.
- [x] `wompi.provider.test.ts` (con `fetch` simulado): (CA 3–8)
  - [x] la URL base sale de `WOMPI_ENV` (sandbox y production).
  - [x] `crearIntento`: forma completa, firma igual a `firmarIntegridad` con el mismo
        `expirationTime`, `publicKey` pública y ninguna cadena de secreto en la respuesta.
  - [x] `crearIntento` rechaza con 400: referencia inválida, monto `0`, `-1`, `1.5`, `2^53`,
        `expiraEn` pasado, a 30 s, a 25 h; acepta a 2 min y a 24 h.
  - [x] `obtenerTokensAceptacion`: llama a `/merchants/info` con el header y mapea los dos tokens y
        permalinks; respuesta sin `presigned_acceptance` → `AppError(502)`.
  - [x] `consultarTransaccion`: mapea `estado` y `estadoProveedor`; 404 → `AppError(404)`.
  - [x] `buscarPorReferencia`: `data` vacío → `null`; 404 → `null`; varias → la de `created_at` mayor.
  - [x] las consultas de transacciones llevan `Authorization: Bearer <privateKey>`; los tokens de
        aceptación llevan la llave pública y no el `Authorization`.
  - [x] `verificarEvento` verifica con `eventsSecret` de la configuración.
- [x] `stub-payment.provider.test.ts`: `crearIntento` firma con `STUB_INTEGRITY_SECRET`;
      `sembrarTransaccion` + `consultarTransaccion`/`buscarPorReferencia`; `construirEventoFirmado` →
      `verificarEvento` válido; el mismo evento con el monto cambiado → inválido; transacción no
      sembrada → 404 / `null`. (CA 12)
- [x] `payment-provider.factory.test.ts`: con `stub` devuelve el stub; con `wompi` y la configuración
      completa devuelve el cliente Wompi; con `wompi` sin una variable lanza; es singleton. (CA 13)
- [x] `payments.isolation.test.ts` (CA 15):
  - [x] ningún fuente de `integrations/payments/` (salvo tests) importa `mongoose`, `*.model.js` ni
        `repositories/base.repository`, ni contiene la cadena `tenantId`.
  - [x] `crearIntento` para dos referencias distintas devuelve objetos con las mismas claves y
        ningún valor que identifique a un tenant.
- [x] `wompi.contract.test.ts` (opcional, `describe.skipIf(!process.env.WOMPI_CONTRACT_TEST)`):
      `/merchants/info`, consulta por id y por referencia, y verificación de un evento de sandbox.
      Anotar en `wompi.md` el resultado de las tres incógnitas (mayúsculas, autenticación de
      `/transactions?reference=`, estados adicionales) si se llega a ejecutar. (CA 3, 6, 7, 9)

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde (la suite existente no cambia: `stub` es el default y
      `vitest.config.ts` no define variables de Wompi).
- [x] Con `PAYMENTS_PROVIDER` sin definir, el backend arranca igual que antes (sin variables de Wompi).
- [x] `grep` de las llaves de prueba usadas en los tests: no aparecen en el código fuente ni en
      `wompi.md` (solo en los tests, con valores falsos).
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado (este feature no toca Mongo: se anota
      como «no aplica» con el test de `payments.isolation`).
- [x] `spec.md` → `**Estado:** implementado`.

## Definición de "hecho"

`IPaymentProvider` existe con las implementaciones `wompi` y `stub`; la firma de integridad y el
checksum de eventos coinciden con los vectores documentados; los tokens de aceptación y las consultas
usan los endpoints vigentes; los errores de red se traducen a `AppError` sin filtrar secretos; y el
arranque falla si `PAYMENTS_PROVIDER=wompi` tiene llaves ausentes o de otro entorno. HT-PAY-05,
HT-PAY-02 y HU-BILL-01 pueden construirse sobre el puerto sin tocar el adaptador.
