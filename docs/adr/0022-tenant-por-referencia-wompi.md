# ADR 0022 — Tenant resuelto por referencia en el webhook de Wompi

**Estado:** aceptada · **Fecha:** 2026-11-19 · **Contexto:** HT-PAY-04 / HT-PAY-02

## Contexto

El webhook de Wompi no lleva JWT ni nada que identifique al tenant: solo trae la transacción y su
`reference`. La regla 2 del `CLAUDE.md` exige que el `tenantId` nazca del token, con dos excepciones
(`login` y el webhook de Meta). Para procesar un pago hace falta una tercera.

## Decisión

1. **Nueva excepción a la regla 2:** el webhook de Wompi resuelve el tenant buscando el pago por su
   `reference` (`payment.resolver.ts:resolverTenantPorReferencia`). La referencia es única global,
   aleatoria (120 bits) y no contiene el `tenantId`; cumple aquí el papel de `phone_number_id` en
   Meta.
2. **La resolución solo devuelve identificadores** `{ tenantId, paymentId }` y valida el formato
   antes de consultar. Es la única lectura de `payments` fuera del repositorio scoped.
3. **Después de resolver, todo vuelve a `*Scoped`** con ese `tenantId`: verificación de monto,
   transición (`transicionarPago`) y activación.
4. **`payment_events` es una colección global y append-only.** Su `tenantId` no es requerido: el
   evento se registra antes de saber a quién pertenece y se rellena al resolverlo. La idempotencia
   la da un índice único sobre `claveIdempotencia`. Es la excepción a «todo modelo lleva `tenantId`
   requerido» y vive en un solo archivo (`payment-event.service.ts`) sin borrado ni edición.
5. **La autenticidad no la da la referencia**, la da el checksum del evento (HT-PAY-02), verificado
   antes de resolver nada. Un atacante que conozca una referencia no puede inyectar un evento.

## Alternativas

- **Meter el `tenantId` en la referencia.** Descartada: filtra información y permite fabricar
  referencias.
- **Un endpoint de webhook por tenant.** Descartada: una sola cuenta Wompi (ADR 0021) solo tiene
  una URL de eventos.
- **Confiar en un `tenantId` dentro del cuerpo del evento.** Descartada: no existe en Wompi y, de
  existir, vendría del exterior.

## Consecuencias

- Se actualizan `CLAUDE.md` (regla 2) y `docs/multi-tenancy.md` §5.8.
- Una referencia desconocida produce un evento con resultado `referencia_desconocida`, sin tocar a
  ningún tenant.
- Test de aislamiento: `billing.isolation.test.ts`.
- El barrido de HT-PAY-03 documentará su propia entrada en §5 (índice `{ estado, expiraEn }`).
