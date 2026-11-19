# Integración con Wompi (pasarela de pagos)

> Referencia técnica de HT-PAY-04 y de las specs que siguen (`docs/01-pasarela.md`). Decisiones de
> negocio en ADR 0021; excepción de tenant del webhook en ADR 0022. Datos contrastados con
> `docs.wompi.co/docs/colombia/` el 2026-11-19; lo que no se pudo confirmar va marcado.

## 1. Entornos y URLs

`WOMPI_ENV` = `sandbox | production`. Los endpoints son los mismos; cambian la URL base y las llaves.

| Entorno | API | Evento `environment` |
|---|---|---|
| sandbox | `https://sandbox.wompi.co/v1` | `test` |
| production | `https://production.wompi.co/v1` | `prod` |

- Widget: `https://checkout.wompi.co/widget.js`.
- Web Checkout (formulario GET): `https://checkout.wompi.co/p/`. Obligatorios: `public-key`,
  `currency` (`COP`), `amount-in-cents`, `reference`, `signature:integrity`.

## 2. Llaves

Una sola cuenta Wompi de SofiApp (D1). Viven en variables de entorno; nunca en Mongo ni en la UI.

| Llave | sandbox | production | Destino |
|---|---|---|---|
| Pública | `pub_test_…` | `pub_prod_…` | Frontend (`VITE_WOMPI_PUBLIC_KEY`) |
| Privada | `prv_test_…` | `prv_prod_…` | Solo backend |
| Secreto de eventos | `test_events_…` | `prod_events_…` | Solo backend (checksum del webhook) |
| Secreto de integridad | `test_integrity_…` | `prod_integrity_…` | Solo backend (firma del checkout) |

Los dos secretos se obtienen en el dashboard de Wompi (Mi cuenta → Secretos para integración
técnica). Los prefijos `test_events_` y `test_integrity_` salen de la lista de la página de ambientes,
no de un ejemplo. HT-PAY-01 hace fallar el arranque si el prefijo no corresponde a `WOMPI_ENV`.

## 3. Firma de integridad

SHA-256 en hexadecimal, calculada **en el servidor**, nunca en el frontend:

```
SHA256( reference + amountInCents + currency + expirationTime + integritySecret )
```

- Concatenación directa, sin separadores. `expirationTime` va como string ISO 8601 UTC
  (`2026-11-19T20:28:50.000Z`) y es **el mismo valor** que se envía al Widget/Checkout.
- SofiApp **siempre** firma con `expirationTime`, para que un checkout viejo no se reutilice (D4).
- Se envía en `signature:integrity` (Web Checkout) o `data-signature:integrity` (Widget).

## 4. Checksum de eventos (webhook)

```
SHA256( valores de signature.properties, en ese orden + timestamp + eventsSecret )
```

- Los `properties` (p. ej. `transaction.id`, `transaction.status`, `transaction.amount_in_cents`)
  salen de `data` del propio evento y **pueden variar**: no se asumen fijos.
- `timestamp` es el entero UNIX del evento. Sin separadores.
- El checksum llega en el header `X-Event-Checksum` y en `signature.checksum` del cuerpo. Se compara
  con `timingSafeEqual`.
- ⚠️ **No confirmado:** si la comparación debe ignorar mayúsculas/minúsculas (el ejemplo de Wompi lo
  muestra en mayúsculas). HT-PAY-02 debe normalizar ambos lados y probarlo en sandbox.
- Wompi exige responder **HTTP 200**; si no, reintenta (máx. 3 veces en 24 h).
- Campos del evento: `event`, `data`, `environment` (`test`/`prod`), `timestamp`, `sent_at`,
  `signature`.

## 5. Estados de la transacción y su mapeo

| Wompi (`status`) | `EstadoPago` de SofiApp | Nota |
|---|---|---|
| `PENDING` | `PENDIENTE` (sin cambio) | No es final. |
| `APPROVED` | `APROBADO` | Solo si monto, moneda y referencia coinciden (D4). |
| `DECLINED` | `RECHAZADO` | |
| `VOIDED` (solo tarjeta) | `ANULADO` si el pago estaba `PENDIENTE`; si ya estaba `APROBADO`, el estado **no cambia** y el evento queda `requiere_revision` | Estados terminales inmutables (ADR 0021). |
| `ERROR` | `ERROR` | |
| — | `EXPIRADO` | Nuestro: checkout sin completar antes de `expiraEn` (HT-PAY-03). |

⚠️ La página de seguimiento solo lista `PENDING` y los cuatro finales; no se confirmó ningún otro.
Un estado desconocido **no** debe mover el pago: se registra el evento con resultado `error`.

## 6. Tokens de aceptación

- Endpoint vigente: `GET /merchants/info` con el header `x-merchant-public-key: <llave pública>`.
- ⚠️ **`GET /merchants/{public_key}` está en desuso** y, según la documentación, deja de estar
  disponible el 31 de octubre de 2026. No usarlo (la hoja de ruta lo citaba; HT-PAY-01 y HU-BILL-01
  deben usar `/merchants/info`).
- Respuesta: `data.presigned_acceptance` (`acceptance_token`, `permalink`, `type: END_USER_POLICY`) y
  `data.presigned_personal_data_auth` (`acceptance_token`, `permalink`, `type: PERSONAL_DATA_AUTH`).
- Al crear una transacción o fuente de pago se envían como `acceptance_token` y
  `accept_personal_auth`. SofiApp los guarda en `payments.aceptaciones`, junto con la versión de
  términos propia, la fecha y la IP.

## 7. Dónde se aplica en el código

| Pieza | Feature |
|---|---|
| Modelos, estados, referencia, centavos/IVA, resolución por referencia | HT-PAY-04 |
| `IPaymentProvider`, firma, cliente HTTP, validación de llaves en `env.ts` | HT-PAY-01 |
| Webhook, checksum, cola `payments` | HT-PAY-02 |
| Conciliación y expiración | HT-PAY-03 |
