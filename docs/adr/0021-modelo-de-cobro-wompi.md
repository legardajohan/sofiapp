# ADR 0021 — Modelo de cobro y proveedor de pagos (Wompi)

**Estado:** aceptada · **Fecha:** 2026-11-19 · **Contexto:** HT-PAY-04 (pasarela de pagos,
`docs/01-pasarela.md`)

## Contexto

El admin de una empresa debe poder elegir un plan, pagarlo en Wompi y que el sistema lo active sin
intervención del superadmin, que sigue siendo el respaldo. Hay que fijar quién cobra, qué monto, qué
confirma un pago, cuánto dura la suscripción y cómo se representa todo en datos, antes de construir
el cliente, el webhook y la UI.

## Decisión

1. **Una sola cuenta Wompi de SofiApp.** Los tenants no configuran nada; las llaves viven en
   variables de entorno, nunca en Mongo ni en la UI. (D1)
2. **Wompi detrás de `IPaymentProvider`** (`integrations/payments/`) con implementaciones `wompi` y
   `stub`, como `integrations/trm`. (D2)
3. **El precio lo fija el superadmin** por plan y periodo, con IVA 19 % incluido, y ese es el monto
   que se cobra. El backend lo lee del plan; **el cliente nunca envía el monto**. (D3)
4. **Un plan solo se activa con un evento de checksum válido** cuyo monto, moneda y referencia
   coinciden con el intento guardado. La redirección de retorno solo consulta. (D4)
5. **Tres periodos: trimestral (3 meses), semestral (6) y anual (12).** No hay mensual. Si paga antes
   de vencer, la vigencia se suma desde `vigenciaHasta`. (D5)
6. **Al vencer sin pago, la suscripción pasa a `vencida`**; no se suspende el tenant, lo decide el
   superadmin. (D6)
7. **Paga el usuario principal** (AUTH-05). Las rutas de billing no usan `requireActiveTenant`: un
   tenant en prueba, suspendido o vencido debe poder pagar. (D7)
8. **Referencia opaca y aleatoria** `SOFI-<base32 de 24>` (120 bits), única y sin `tenantId`; el
   tenant se resuelve por ella (ADR 0022). (D8)
9. **Factura DIAN detrás de `IInvoiceProvider`**, `manual` al inicio. (D9)
10. **Renovación automática opcional**, solo con una tarjeta suscrita. (D10)

Decisiones de modelo (HT-PAY-04):

11. **`amountInCents` es un entero**, no `Decimal128`: es lo que Wompi firma y cobra, y un entero
    seguro es exacto. El total, la base y el IVA se guardan como **copia fija del precio** en
    `Decimal128` (ADR 0005). Ambos salen del mismo string con `decimal.js`.
12. **IVA incluido:** `base = round(total / 1,19, 2, HALF_UP)` e `iva = total − base`; así
    `base + iva = total` al centavo.
13. **Estados terminales inmutables.** `PENDIENTE → APROBADO | RECHAZADO | ANULADO | ERROR |
    EXPIRADO`, con escritura condicional sobre `estado: 'PENDIENTE'`: de dos procesos solo gana uno
    (patrón de ADR 0020 §6).
14. **`VOIDED` sobre un pago `APROBADO` no cambia su estado**: el evento se registra como
    `requiere_revision` y lo resuelve el superadmin (las anulaciones desde la UI están fuera de
    alcance).
15. **Un solo `PENDIENTE` por tenant**, garantizado por un índice único parcial.
16. **`payment_events` no guarda el cuerpo crudo** (trae correo y teléfono del pagador): solo tipo,
    transacción, estado reportado, referencia, monto, moneda y la clave de idempotencia.

## Alternativas

- **Pasarela configurada por tenant.** Descartada (1): obliga a custodiar llaves ajenas y a
  conciliar varias cuentas, sin necesidad con pocos tenants.
- **Monto enviado por el cliente.** Descartada (3, 4): es el vector de fraude más obvio.
- **Referencia con el `tenantId` o consecutiva.** Descartada (8): es enumerable y filtra
  información.
- **`Decimal128` para `amountInCents`.** Descartada (11): añade conversiones sin ganar precisión.
- **Permitir `APROBADO → ANULADO` automático.** Descartada (13, 14): un pago ya activado exige
  decisión humana sobre la suscripción y la factura.
- **Guardar el cuerpo del evento para auditoría.** Descartada (16): PII innecesaria; el estado de
  Wompi se puede volver a consultar.

## Consecuencias

- (+) Todo el cobro es verificable y el cliente no tiene forma de alterarlo.
- (+) El snapshot protege contra cambios de precio posteriores (no retroactividad).
- (−) `VOIDED` tras `APROBADO` queda como tarea manual del superadmin.
- Detalle de entornos, firmas y estados en `docs/integrations/wompi.md`.
