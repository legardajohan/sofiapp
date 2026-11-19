# HT-PAY-04 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Rama: `feat/HT-PAY-04`.

## Documentación de decisiones (primero: el código se apoya en ellas)

- [x] Crear `docs/adr/0021-modelo-de-cobro-wompi.md` con D1–D10, las decisiones 2–6 de la spec y
      las alternativas de `plan.md` → Notas. Estado `Aceptada`. (CA 1)
- [x] Crear `docs/integrations/wompi.md`: entornos, URLs, llaves y prefijos, firma de integridad,
      checksum de eventos, estados y su mapeo a `EstadoPago`, tokens de aceptación, Widget/Checkout.
      Contrastar cada dato con la documentación oficial de Wompi. (CA 1)
- [x] Crear `docs/adr/0022-tenant-por-referencia-wompi.md` (resolución por `reference`,
      `payment_events` global, vuelta a `*Scoped` tras resolver). (CA 2)
- [x] `CLAUDE.md` raíz, regla 2: añadir el webhook de Wompi (resuelve tenant por `reference`, ADR
      0022) a las excepciones. (CA 2)
- [x] `docs/multi-tenancy.md` §5: entrada 8 — `payment.resolver.ts:resolverTenantPorReferencia`
      (solo proyecta `{ _id, tenantId }`) y `payment-event.service.ts` (colección global
      append-only); nombrar el test de aislamiento. (CA 2, 13)
- [x] `docs/adr/README.md`: filas 0021 y 0022. (CA 2)

## Implementación

- [x] `packages/shared/src/billing.ts` con periodos, estados y tipos; re-exportar en `index.ts`. (CA 3)
- [x] `services/pricing/money.util.ts`: `IVA_PCT`, `aCentavos`, `desglosarIva` (decimal.js, sin
      `number` aritmético). (CA 8)
- [x] `features/billing/billing.types.ts`: `ISubscription`, `IPayment`, `IPaymentEvent`,
      `IAceptaciones`, DTOs, `ContextoTransicion`, `ITransicionResult`, `ResultadoEvento`,
      `I*Response`. Cero `any`, tipos de retorno explícitos.
- [x] `features/billing/subscription.model.ts`: schema + `{ tenantId }` unique, defaults
      (`sin_plan`, `renovacionAutomatica: false`), `collection: 'subscriptions'`. (CA 4)
- [x] `features/billing/payment.model.ts`: schema con `Decimal128` en `precio.*`,
      `amountInCents` safe integer ≥ 1, `currency: 'COP'`, y los 5 índices de `plan.md`
      (comentario junto a `{ estado, expiraEn }` explicando por qué no empieza por `tenantId`).
      `collection: 'payments'`. (CA 5)
- [x] `features/billing/payment-event.model.ts`: `claveIdempotencia` unique, `tenantId`/`paymentId`
      opcionales, `timestamps: false`, `collection: 'payment_events'`, comentario ADR-0022. (CA 12)
- [x] `features/billing/billing.validation.ts`: `REFERENCIA_REGEX` y `referenceParamSchema`.
- [x] `features/billing/payment.reference.ts`: `generarReferencia` (`randomBytes(15)` + base32
      RFC 4648) y `esReferenciaValida`. (CA 7)
- [x] `features/billing/payment.estado.ts`: `esTerminal`, `esTransicionValida`. (CA 9)
- [x] `features/billing/subscription.service.ts`: `obtenerSuscripcion` (lectura perezosa, sin
      escribir). (CA 4)
- [x] `features/billing/payment.service.ts`: `crearPagoPendiente` (reintento por colisión de
      referencia, 409 por `PENDIENTE` duplicado), `obtenerPago`, `obtenerPagoPorReferencia`,
      `transicionarPago` (escritura condicional, `aplicada | sin_cambio | rechazada`, 400/404/409).
      Solo `*Scoped`. (CA 6, 10, 11)
- [x] `features/billing/payment-event.service.ts`: `registrarEvento` (E11000 → `{ nuevo: false }`)
      y `marcarEventoProcesado` (filtro `procesadoEn: null`). Sin funciones de borrado/edición. (CA 12)
- [x] `features/billing/payment.resolver.ts`: `resolverTenantPorReferencia`, valida formato antes de
      consultar, proyecta solo ids, comentario de excepción. (CA 13)
- [x] Sin controller/routes/montaje en `app.ts` (llegan con HU-BILL-02). Dejarlo dicho en la
      cabecera de `billing.types.ts`.
- [x] `docs/data-model.md`: `subscriptions`, `payments`, `payment_events` con índices y notas. (CA 14)
- [x] `docs/domain.md`: glosario (Suscripción, Intento de pago, Referencia de pago, Vigencia),
      entidades (`Subscription`, `Payment`, `PaymentEvent`) e invariantes. (CA 14)

## Tests (Vitest + MongoDB Memory Server)

- [x] `money.util.test.ts`: `aCentavos` (`'149900.00'`, `'0.10'`, `'1'`; rechaza `'1.234'`,
      `'-5'`, `'0'`, `'abc'`, `''`); `desglosarIva` (`'119000'` → `100000.00`/`19000.00`; varios
      totales con `base + iva === total`). (CA 8)
- [x] `payment.reference.test.ts`: formato `^SOFI-[A-Z2-7]{24}$`; 10 000 únicas; no contiene el
      hex del `tenantId`; `esReferenciaValida` rechaza minúsculas, longitudes y prefijos ajenos. (CA 7)
- [x] `payment.estado.test.ts`: tabla completa 6×6 de `esTransicionValida`. (CA 9)
- [x] `payment.service.test.ts`:
  - [x] crea `PENDIENTE` con centavos, base e IVA correctos y referencia válida. (CA 6)
  - [x] segundo `PENDIENTE` del mismo tenant → 409. (CA 5, 6)
  - [x] colisión de referencia simulada (mock de `generarReferencia`) → reintenta y crea. (CA 6)
  - [x] `transicionarPago` aplicada / sin_cambio / rechazada / 400 / 404; campos `finalizadoEn`,
        `origenTransicion`, `providerTransactionId`, `metodo`. (CA 10)
  - [x] `providerTransactionId` repetido en otro pago → 409. (CA 5, 10)
  - [x] concurrencia: `Promise.all` de `APROBADO` y `RECHAZADO` → uno `aplicada`, otro
        `rechazada`, estado final del ganador. (CA 11)
- [x] `payment-event.service.test.ts`: primera vez `nuevo: true`; misma clave `nuevo: false` sin
      lanzar; `marcarEventoProcesado` escribe una vez y la segunda devuelve `false`. (CA 12)
- [x] `payment.resolver.test.ts`: referencia existente → `{ tenantId, paymentId }` y nada más;
      desconocida → `null`; formato inválido → `null` sin consultar (spy). (CA 13)
- [x] `subscription.service.test.ts`: sin documento → `sin_plan` y no se crea nada; con documento →
      sus valores. (CA 4)
- [x] `billing.isolation.test.ts` (CA 15):
  - [x] `obtenerPago` / `obtenerPagoPorReferencia` del pago de A con el tenant B → 404.
  - [x] `transicionarPago` del pago de A con el tenant B → 404 y A sigue `PENDIENTE`.
  - [x] `crearPagoPendiente(tenantA, { ...dto, tenantId: tenantB })` → el pago es de A.
  - [x] A y B tienen cada uno su `PENDIENTE` a la vez (el índice parcial es por tenant).
  - [x] `obtenerSuscripcion` de B no ve la suscripción de A.
  - [x] `resolverTenantPorReferencia` de la referencia de A devuelve el tenant de A, nunca el de B.

## Verificación final

- [x] `pnpm --filter @sofiapp/shared typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde (incluye los tests anteriores).
- [x] `grep` en `features/billing/`: los únicos accesos directos a modelos (`Payment.findOne`,
      `PaymentEvent.create/updateOne`) están en `payment.resolver.ts` y `payment-event.service.ts`,
      con su comentario de excepción.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado.
- [x] `spec.md` → `**Estado:** implementado`.

## Definición de "hecho"

Existen los tres modelos con sus índices, la máquina de estados aplica transiciones atómicas e
idempotentes, la referencia es opaca y la única puerta para resolver el tenant desde un evento está
documentada (ADR-0022) y probada. ADR-0021 y `wompi.md` recogen el modelo de cobro. HT-PAY-01 y
HT-PAY-02 pueden construirse encima sin tocar el dominio.
