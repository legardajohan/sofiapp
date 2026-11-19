# HT-PAY-04 — Modelos de suscripción, pago y evento; máquina de estados y referencia (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Es la base de datos y de dominio de toda la pasarela Wompi
> (`docs/01-pasarela.md`, orden 0 y 1): sin estos modelos no hay intento de pago, webhook,
> activación ni conciliación. Incluye los dos ADR que la hoja de ruta pone antes (0021 y 0022).

**Estado:** implementado

## Objetivo

Dejar listos los tres modelos de la pasarela (`subscriptions`, `payments`, `payment_events`), la
máquina de estados del pago con transiciones condicionales (de dos procesos solo gana uno), el
generador de referencia opaca y la resolución del tenant por referencia. Además, registrar las
decisiones de cobro (ADR-0021) y la nueva excepción a la regla 2 del `CLAUDE.md` (ADR-0022). Así,
HT-PAY-01 (cliente Wompi), HT-PAY-02 (webhook) y HU-BILL-02/03 (pago y activación) se construyen
sobre un dominio ya probado.

## Alcance

Incluye:
- **ADR-0021 — Modelo de cobro y proveedor de pagos.** Registra D1–D10 de `docs/01-pasarela.md` §2
  y las decisiones de modelo de esta spec (snapshot de precio, centavos enteros, estados terminales
  inmutables, `VOIDED` tras `APROBADO`). Crea `docs/integrations/wompi.md` (entornos, llaves, firma
  de integridad, checksum de eventos, estados y URLs).
- **ADR-0022 — Tenant resuelto por referencia en el webhook de Wompi.** Nueva excepción a la regla 2
  junto a `login` y al webhook de Meta. Actualiza el `CLAUDE.md` raíz y `docs/multi-tenancy.md` §5.
  También documenta que `payment_events` es una colección global (sin `tenantId` requerido).
- Constantes y tipos compartidos en `packages/shared` (periodos de cobro, estados del pago y de la
  suscripción), porque el frontend de HU-BILL-02 los necesitará.
- Modelo **`subscriptions`** (scoped, una por tenant) con lectura perezosa: si no existe, vale
  `sin_plan`.
- Modelo **`payments`** (scoped) con snapshot inmutable del precio y del IVA, la aceptación de
  términos, la expiración y quien lo intentó.
- Modelo **`payment_events`** (log global append-only) con una clave de idempotencia única.
- **Máquina de estados del pago:** `PENDIENTE → APROBADO | RECHAZADO | ANULADO | ERROR | EXPIRADO`.
  Una función pura valida la transición y una función de dominio la aplica con una escritura
  condicional.
- **Generador de referencia** `SOFI-<base32>` con `crypto.randomBytes` (120 bits, 24 caracteres).
- **Conversión COP → centavos** y **cálculo de base e IVA** sin floats (`decimal.js`, ADR 0005).
- **Resolución del tenant por referencia** (`resolverTenantPorReferencia`), que solo devuelve
  identificadores. La usará el worker del webhook (HT-PAY-02).
- Actualización de `docs/data-model.md` (tres colecciones) y `docs/domain.md` (glosario e
  invariantes: suscripción, intento de pago, vigencia, referencia).

Fuera de alcance (otros features):
- `IPaymentProvider`, el cliente HTTP de Wompi, la firma de integridad y el mapeo de estados de
  Wompi (`APPROVED`, `DECLINED`…) a los nuestros → **HT-PAY-01**.
- Endpoint del webhook, verificación del checksum, cola `payments` y derivación concreta de la clave
  de idempotencia a partir del cuerpo → **HT-PAY-02**.
- Endpoints de billing (`POST /api/billing/intentos`, `GET /api/billing/intentos/:reference`),
  datos fiscales y textos de los términos → **HU-BILL-02**. Por eso este feature **no tiene
  controller ni routes**.
- Activar la suscripción, calcular la vigencia (D5), congelar la fotografía financiera y la
  convivencia con la activación manual, incluido qué hacer con los tenants que hoy tienen un plan
  asignado a mano → **HU-BILL-03**.
- Barridos (`PENDIENTE` → `EXPIRADO`, `activa` → `vencida`) y su excepción cross-tenant →
  **HT-PAY-03**.
- Migración de `Plan.precio`/`periodicidad` a `precios.{trimestral,semestral,anual}` →
  **HU-BILL-01**. Aquí el precio llega como argumento (string COP); no se lee del plan.
- `paymentSourceId` y la lógica del cobro automático → **HU-BILL-04** (solo se reserva el campo
  `renovacionAutomatica`).

## Decisiones de esta spec

1. **Feature `features/billing/`** con tres modelos. No hay capa HTTP todavía: los services exponen
   funciones de dominio que usarán el worker (HT-PAY-02/03) y los controllers de HU-BILL-02.
2. **`amountInCents` es un entero `Number`**, no `Decimal128`: es lo que Wompi firma y recibe, y un
   entero hasta 2⁵³ es exacto. El precio legible (total, base, IVA) sí va en `Decimal128` como
   snapshot (ADR 0005). Ambos salen del mismo string con `decimal.js`; nunca se usan `+` ni `*`
   sobre `number`.
3. **IVA incluido (D3):** `base = round(total / 1.19, 2, HALF_UP)` e `iva = total − base`. Así
   `base + iva = total` siempre, al centavo.
4. **Estados terminales inmutables.** Un `VOIDED` que llegue sobre un pago `APROBADO` **no** cambia
   su estado: se registra en `payment_events` con resultado `requiere_revision` y lo resuelve el
   superadmin (las anulaciones desde la UI están fuera, ver §1 de la hoja de ruta). `ANULADO` solo
   se alcanza desde `PENDIENTE`.
5. **Un solo `PENDIENTE` por tenant**, garantizado por un índice único parcial. HU-BILL-02 decide si
   reutilizarlo o expirarlo, pero la base de datos ya impide dos a la vez.
6. **`payment_events` no guarda el cuerpo crudo** del evento (trae el correo y el teléfono del
   pagador). Guarda solo lo necesario para auditar e idempotencia: tipo, transacción, estado
   reportado, referencia, monto, moneda y la clave.
7. **La conversión a centavos vive aquí** (`money.util.ts`) y HT-PAY-01 la reutiliza. La hoja de
   ruta la ponía en PAY-01, pero el snapshot del pago la necesita primero.

## Criterios de aceptación

1. **ADR-0021** existe en `docs/adr/0021-modelo-de-cobro-wompi.md` (plantilla del README) con
   D1–D10 y las decisiones 2–6 de esta spec; **`docs/integrations/wompi.md`** existe con entornos,
   URLs base, llaves y sus prefijos, la fórmula de la firma de integridad (con `expirationTime`),
   la del checksum de eventos, los estados de la transacción y su correspondencia con
   `EstadoPago`.
2. **ADR-0022** existe en `docs/adr/0022-tenant-por-referencia-wompi.md`. El `CLAUDE.md` raíz (regla
   2) nombra el webhook de Wompi como excepción. `docs/multi-tenancy.md` §5 tiene una entrada nueva
   que documenta `resolverTenantPorReferencia` y la colección global `payment_events`. El índice de
   `docs/adr/README.md` lista 0021 y 0022.
3. `packages/shared` exporta `PERIODOS_COBRO = ['trimestral', 'semestral', 'anual']`,
   `MESES_POR_PERIODO_COBRO` (3, 6, 12), `ESTADOS_PAGO`, `ESTADOS_PAGO_TERMINALES`,
   `ESTADOS_SUSCRIPCION` y sus tipos. No existe periodo `mensual` (D5).
4. Modelo `Subscription` (colección `subscriptions`): `tenantId` requerido con índice **único**,
   `estado` `sin_plan | activa | vencida` (default `sin_plan`), `planId`, `planVersion`, `periodo`,
   `vigenciaDesde`, `vigenciaHasta`, `origen` `pago | manual`, `ultimoPagoId` y
   `renovacionAutomatica` (default `false`). `obtenerSuscripcion(tenantId)` devuelve un valor
   `sin_plan` sin escribir si el documento no existe.
5. Modelo `Payment` (colección `payments`) con los campos de `plan.md`. Índices: `{ reference }`
   único global; `{ providerTransactionId }` único parcial (solo si es string);
   `{ tenantId, createdAt: -1 }`; `{ tenantId, estado }` **único parcial** con
   `estado: 'PENDIENTE'`; `{ estado, expiraEn }` (para el barrido de HT-PAY-03, documentado junto al
   índice).
6. `crearPagoPendiente(tenantId, datos)` crea el pago en `PENDIENTE` con `createScoped`, genera la
   referencia y calcula `amountInCents`, base e IVA a partir de `precioTotalCop` (string). Un
   segundo `PENDIENTE` del mismo tenant lanza `AppError(409)`. Una colisión de referencia se
   reintenta hasta 3 veces.
7. `generarReferencia()` devuelve `^SOFI-[A-Z2-7]{24}$`, usa `crypto.randomBytes(15)` y **no**
   contiene el `tenantId` ni ningún dato derivable de él. 10 000 referencias generadas en un test son
   todas distintas.
8. `aCentavos('149900.00') === 14990000`, `aCentavos('0.10') === 10`; un importe con más de 2
   decimales, negativo, cero o no numérico lanza `AppError(400)`. `desglosarIva('119000')` da base
   `100000.00` e IVA `19000.00`, y en todos los casos de prueba `base + iva === total`.
9. `esTransicionValida(desde, hacia)` es pura: solo acepta `PENDIENTE → {APROBADO, RECHAZADO,
   ANULADO, ERROR, EXPIRADO}`. Cualquier otra combinación, incluida `APROBADO → ANULADO` y
   `PENDIENTE → PENDIENTE`, devuelve `false`.
10. `transicionarPago(tenantId, paymentId, hacia, contexto)` aplica la transición con
    `findOneAndUpdateScoped` filtrando por `estado: 'PENDIENTE'` y devuelve
    `{ resultado: 'aplicada' | 'sin_cambio' | 'rechazada', pago }`. Repetir la misma transición
    devuelve `sin_cambio` sin reescribir; pedir otro terminal sobre un terminal devuelve
    `rechazada` y no modifica nada; un destino que no es terminal lanza `AppError(400)`; un pago
    inexistente o de otro tenant lanza `AppError(404)`. Fija `finalizadoEn`, `origenTransicion` y,
    si llegan, `providerTransactionId`, `metodo` y `detalleProveedor`.
11. **Concurrencia:** dos `transicionarPago` simultáneos sobre el mismo pago (`APROBADO` y
    `RECHAZADO`) dejan exactamente uno `aplicada` y el otro `rechazada`; el estado final es el del
    ganador.
12. Modelo `PaymentEvent` (colección `payment_events`, append-only): índice **único** en
    `claveIdempotencia`; `tenantId` y `paymentId` nulos hasta resolverse. `registrarEvento(datos)`
    devuelve `{ nuevo: true, evento }` la primera vez y `{ nuevo: false }` ante la misma clave, sin
    lanzar. `marcarEventoProcesado(id, { tenantId, paymentId, resultado })` solo escribe si
    `procesadoEn` es nulo. No hay función de borrado ni de edición del contenido.
13. `resolverTenantPorReferencia(reference)` devuelve `{ tenantId, paymentId } | null` proyectando
    **solo** esos dos campos; una referencia con formato inválido devuelve `null` sin consultar.
    Es la única lectura de `Payment` fuera del repositorio scoped y lleva el comentario que la
    enlaza con ADR-0022.
14. `docs/data-model.md` documenta las tres colecciones con sus índices; `docs/domain.md` añade al
    glosario **Suscripción**, **Intento de pago**, **Referencia de pago** y **Vigencia**, y a las
    invariantes que un pago pertenece a un solo tenant y que un estado terminal no cambia.
15. **Aislamiento multi-tenant:** un pago o una suscripción del tenant A no se lee, no se transiciona
    ni se sobrescribe desde el tenant B (`obtenerPago`, `transicionarPago` y `obtenerSuscripcion`
    con el `tenantId` de B devuelven `404`/`sin_plan` y A queda intacto); un `tenantId` inyectado en
    los datos de `crearPagoPendiente` lo sobrescribe el del argumento; dos tenants pueden tener cada
    uno su `PENDIENTE` a la vez. `pnpm --filter @sofiapp/api typecheck` (`tsc --noEmit`) y
    `pnpm --filter @sofiapp/api test` en verde.

## Dependencias

- `INF-02` (repositorio scoped) y `HU-SAAS-02` (`Plan.numeroVersion`, `money.util.ts`).
- `AUTH-05` (usuario principal): `intentadoPor` guarda su `userId`, pero la regla de quién paga la
  aplica HU-BILL-02.
- Patrón de transición condicional de ADR 0020 §6.
