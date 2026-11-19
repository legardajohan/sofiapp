# 01 — Pasarela de pagos Wompi: hoja de ruta de SPECs

> Fuente: `docs/11 - Propuesta_Pasarela_Wompi_SofiApp.docx` (2026-11-06). Este documento ordena las
> SPECs por dependencia. Cada fila se abre con `/sdd-spec <ID>-<slug>` (o `-quick`). No redefine
> reglas: manda el `CLAUDE.md` raíz, `docs/multi-tenancy.md` y ADR 0005 (dinero).

## 1. Objetivo y límites

El admin de una empresa elige un plan, paga en Wompi (Web Checkout/Widget, todos los medios), el
sistema confirma el pago **solo por evento verificado**, activa el plan y deja la factura DIAN
disponible para descargar. La activación manual del superadmin se mantiene como respaldo.

**Fuera:** prorrateo y cambio de plan, ciclo de impago (gracia/suspensión), avisos por correo o
notificaciones, panel de ingresos (MRR, mora), anulaciones desde la UI y el cobro de los tenants a sus
propios clientes.

## 2. Decisiones de base

| # | Decisión |
|---|---|
| D1 | Una sola cuenta Wompi de SofiApp. Los tenants no configuran nada. Las llaves viven en **variables de entorno**, nunca en Mongo ni en la UI. |
| D2 | Wompi va detrás de `IPaymentProvider` (`integrations/payments/`), con implementaciones `wompi` y `stub`, como `integrations/trm`. |
| D3 | **El precio lo fija el superadmin** por plan y por periodo (con el descuento que quiera aplicar), y **ese es el monto que se cobra en Wompi**. Cada plan tiene `precios.{trimestral,semestral,anual}` en COP con IVA 19% incluido (string, ADR 0005). El backend lo lee del plan y lo convierte a `amountInCents` (entero) con `decimal.js`. El cliente nunca envía el monto. El costeo de HU-SAAS-02 (`precioSugeridoCop`) queda solo como referencia. |
| D4 | Un plan solo se activa con un evento cuyo checksum es válido **y** cuyo `amount_in_cents`, `currency` y `reference` coinciden con el intento guardado. La redirección de retorno nunca activa nada: solo consulta. |
| D5 | Solo hay **tres periodos: trimestral (3 meses), semestral (6) y anual (12)**. No hay periodo mensual. El admin elige plan + periodo al pagar, y la vigencia es la duración del periodo pagado. Si paga antes de vencer, la nueva vigencia se suma desde `vigenciaHasta`, no desde hoy. |
| D6 | Al vencer sin pago, la suscripción pasa a `vencida` (lo marca el barrido). **No** se suspende el tenant: lo decide el superadmin. |
| D7 | Paga el **usuario principal** del tenant (AUTH-05). Las rutas de billing **no** usan `requireActiveTenant`, porque un tenant en prueba, suspendido o vencido debe poder pagar. |
| D8 | La referencia es opaca y aleatoria (`SOFI-<base32 ≥ 20>`), única, y no incluye el `tenantId`. El tenant se resuelve buscando el pago por su referencia. |
| D9 | La factura DIAN va detrás de `IInvoiceProvider`. Con pocos tenants (≤ 40 facturas al año) se arranca con `manual` sobre el **servicio gratuito de la DIAN** ($0, sin API). Al crecer, se cambia a un proveedor con API (MATIAS o Factus) sin tocar el dominio (ver §4 HU-BILL-07). |
| D10 | La renovación automática es opcional y la controla el tenant con un switch. **El switch solo se puede activar si hay un medio de pago suscrito** (tarjeta tokenizada como payment source de Wompi). Sin tarjeta, el tenant paga manualmente cada periodo. |

## 3. Ruta de SPECs (orden de dependencia)

| Orden | ID | Tipo | Título | Depende de |
|---|---|---|---|---|
| 0 | **ADR-0021 / ADR-0022** | docs | Modelo de cobro + excepción de tenant en el webhook de Wompi | — |
| 1 | **HT-PAY-04** | `/sdd-spec` | Modelos de suscripción, pago y evento, máquina de estados y referencia | ADRs |
| 2 | **HT-PAY-01** | `/sdd-spec` | `IPaymentProvider` + cliente Wompi | HT-PAY-04 |
| 3 | **HT-PAY-05** | `/sdd-spec` | Endurecimiento: helmet, rate limit, redacción de logs, CSP en Vercel | HT-PAY-01 |
| 4 | **HT-PAY-02** | `/sdd-spec` | Webhook de eventos Wompi | 01, 04, 05 |
| 5 | **HU-BILL-01** | `/sdd-spec-quick` | Panel superadmin: estado de la integración y precios por periodo (trimestral, semestral, anual) | 01 |
| 6 | **HU-BILL-02** | `/sdd-spec` | Selección y pago del plan por el admin (términos, Habeas Data, datos fiscales, retorno) | 01, 04, 05, BILL-01 |
| 7 | **HU-BILL-03** | `/sdd-spec` | Activación automática y vigencia; convivencia con la activación manual | 02, BILL-02 |
| 8 | **HT-PAY-03** | `/sdd-spec` | Conciliación periódica y cierre de checkouts abandonados; marca `vencida` | 02, BILL-03 |
| 9 | **HU-BILL-07** | `/sdd-spec` | Factura DIAN: manual con el servicio gratuito DIAN (fase inicial) → API (MATIAS/Factus) al crecer | BILL-03 |
| 10 | **HU-BILL-04** | `/sdd-spec` | Tarjeta suscrita + switch de cobro automático (solo con tarjeta) | BILL-03, PAY-03 |
| 11 | **HT-PAY-06** | `/sdd-spec-quick` | Salida a producción: checklist, guía y pruebas aprobado/rechazado/pendiente | todas |

Regla SDD: un feature a la vez y en este orden. Hay que cerrar cada uno con `tsc --noEmit` y los
tests de aislamiento en verde.

## 4. Alcance por SPEC

### ADR-0021 — Modelo de cobro y proveedor de pagos
- Registra D1–D10.
- Crea `docs/integrations/wompi.md`: entornos, llaves, firma de integridad, checksum de eventos,
  estados y URLs.
- Actualiza `docs/data-model.md` y `docs/domain.md` (glosario: suscripción, intento de pago,
  vigencia).

### ADR-0022 — Tenant resuelto por referencia en el webhook de Wompi
- Es una nueva excepción a la regla 2 del `CLAUDE.md`, junto a `login` y al webhook de Meta.
  **Actualizar el `CLAUDE.md` raíz** y `docs/multi-tenancy.md`.
- Después de resolver el tenant, todo sigue por el repositorio scoped, con ese `tenantId`.

### HT-PAY-04 — Modelos y máquina de estados
- **`subscriptions`** (scoped, `tenantId` único): `planId`, `planVersion`, `estado`
  (`sin_plan|activa|vencida`), `vigenciaDesde`, `vigenciaHasta`, `origen` (`pago|manual`),
  `ultimoPagoId`, y `renovacionAutomatica` reservado para BILL-04.
- **`payments`** (scoped): `reference` (única), `providerTransactionId` (único sparse),
  `amountInCents`, `currency`, `planId`, `planVersion`, un snapshot del precio y del IVA,
  `estado`, `metodo`, `aceptaciones` (tokens de Wompi + versión de términos SofiApp, fecha e IP),
  `expiraEn` e `intentadoPor` (userId).
- **`payment_events`** (log global append-only): `eventId` y un hash del cuerpo con **índice único**
  (idempotencia), `tenantId` una vez resuelto, `procesadoEn` y `resultado`.
- Máquina de estados: `PENDIENTE → APROBADO | RECHAZADO | ANULADO | ERROR | EXPIRADO`. Los estados
  terminales son inmutables. Las transiciones son escrituras condicionales (`estado: 'PENDIENTE'`)
  y de dos procesos solo gana uno (patrón de ADR 0020 §6).
- Un generador de referencia criptográfico (`crypto.randomBytes`).
- Tests: aislamiento entre tenants, transiciones válidas e inválidas, unicidad de la referencia.

### HT-PAY-01 — Adaptador y cliente Wompi
- `IPaymentProvider`: `crearIntento` (datos del checkout firmados), `obtenerTokensAceptacion`
  (`GET /merchants/{pub}`), `consultarTransaccion(id)`, `buscarPorReferencia(ref)` y
  `verificarEvento(body)`.
- URL base por `WOMPI_ENV` (`sandbox|production`).
- **Firma de integridad**: `SHA256(reference + amountInCents + currency + expirationTime + integritySecret)`.
  Siempre con `expirationTime`, para que un checkout viejo no se pueda reutilizar.
- `env.ts` (Zod) valida `WOMPI_ENV`, `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_SECRET`,
  `WOMPI_INTEGRITY_SECRET` y `WOMPI_REDIRECT_URL`. **Falla al arrancar** si los prefijos de llave
  (`pub_test_`/`pub_prod_`, `prv_…`) no corresponden al entorno.
- El cliente HTTP tiene timeout, reintento con backoff solo en GET y errores mapeados a `AppError`.
- Tests: la firma contra vectores conocidos, la conversión a centavos (sin floats) y el stub.

### HT-PAY-05 — Seguridad transversal
- `helmet` en la API.
- `express-rate-limit` con store Redis en el webhook (`/api/webhooks/wompi`) y en la creación de
  intentos.
- Redacción en `utils/logger.ts`: `Authorization`, llaves, firmas, checksums, `customer_email`,
  teléfonos y documentos.
- CSP del SPA en `apps/frontend/vercel.json`: `script-src`, `frame-src` y `connect-src` solo para
  los dominios de Wompi (`checkout.wompi.co`, `*.wompi.co`).
- En el frontend solo existe `VITE_WOMPI_PUBLIC_KEY`. Un test o lint verifica que ningún bundle
  contenga `prv_` ni los secretos.
- Ningún dato de tarjeta toca SofiApp (PCI SAQ-A): solo se usa el Widget o el Web Checkout.

### HT-PAY-02 — Webhook de eventos
- `POST /api/webhooks/wompi`, sin JWT y exento de CSRF (como el de Meta).
- **El checksum va primero**: `SHA256(valores de signature.properties + timestamp + eventsSecret)`,
  comparado con `timingSafeEqual`. Si no es válido, se responde 401 y no se encola nada.
- Si es válido, se responde **HTTP 200 inmediato** y se encola en una cola nueva `payments` (BullMQ),
  con `jobId` derivado del `eventId` (deduplicación).
- Worker: guarda en `payment_events` (por el índice único, un evento repetido es un no-op), resuelve
  el tenant por `reference`, **verifica monto, moneda y referencia** (D4) y, como defensa en
  profundidad, re-consulta la transacción con `consultarTransaccion`. Después aplica la transición.
- Tests: checksum inválido, evento duplicado, monto alterado (no activa), referencia desconocida y
  aislamiento (un evento de A nunca toca a B).

### HU-BILL-01 — Panel superadmin de la integración
- Muestra el entorno, si cada llave está presente y bien formada (sin mostrarla, solo enmascarada),
  una prueba de conectividad con `GET /merchants/{pub}` y la URL de eventos que se configura en
  Wompi.
- **Precios por periodo (D3, D5):** el formulario de plan del superadmin gana tres precios en COP con
  IVA incluido: trimestral, semestral y anual. Son obligatorios para que el plan se pueda pagar.
  Opcionalmente, la UI muestra el descuento implícito frente a 3 × el trimestral mensualizado
  (solo informativo, no se guarda).
- **Migración del modelo de planes:** se retira `Plan.precio: Number` y el campo `periodicidad`
  único (con `mensual`). Ahora el periodo lo elige el admin al pagar. Hace falta un script de
  migración para los planes existentes y revisar las pantallas de HU-SAAS-02 que leen esos campos.
- Cambiar un precio solo afecta a los cobros futuros: el pago guarda un snapshot del precio
  (no retroactividad, CA-24 de HU-SAAS-02).

### HU-BILL-02 — Selección y pago por el admin
- Pantalla de planes → aceptación de los **términos de SofiApp y de la política de datos** (Habeas
  Data, Ley 1581) más los dos tokens de aceptación de Wompi → **datos fiscales** (razón social,
  NIT/CC + DV, dirección, municipio, correo de facturación, responsabilidad fiscal).
- `POST /api/billing/intentos` crea el `payment` en `PENDIENTE` y devuelve los parámetros firmados
  del Widget. El cuerpo **solo lleva `planId` y `periodo`** (`trimestral|semestral|anual`): el
  monto nunca viene del cliente.
- Un solo intento `PENDIENTE` vigente por tenant: se reutiliza o se expira el anterior.
- Pantalla de retorno: hace polling a `GET /api/billing/intentos/:reference`, que consulta el estado
  real y nunca confía en los query params de la redirección.
- Frontend: skills de diseño + shadcn/ui, light y dark (regla 7).

### HU-BILL-03 — Activación automática y vigencia
- `APROBADO` → `subscriptions` `activa`, `vigenciaHasta` según D5, `tenant.estado = 'activo'`,
  y congela `fotografiaFinancieraContratada` (reutiliza el flujo de asignación de plan de
  HU-SAAS-02).
- Todo es idempotente: aplicar dos veces el mismo pago no suma dos periodos.
- La activación manual del superadmin escribe la misma `subscription` con `origen: 'manual'` y queda
  auditada.

### HT-PAY-03 — Conciliación
- Barrido con `upsertJobScheduler` (patrón de ADR 0020) cada N minutos:
  - Los `PENDIENTE` de más de X minutos se consultan en Wompi y se reconcilian (PSE lento, eventos
    perdidos).
  - Los `PENDIENTE` con `expiraEn` vencido y sin transacción pasan a `EXPIRADO`.
  - Las `activa` con `vigenciaHasta < now` pasan a `vencida` (D6).
- Usa el mismo camino de transición que el webhook (una sola función de dominio).

### HU-BILL-07 — Factura electrónica DIAN
- **Hallazgo (2026-11-19):** no existe una API alojada **gratuita para producción**. MATIAS y Factus
  solo tienen sandbox gratis. El web service de la DIAN (modalidad software propio) es gratuito, pero
  obliga a construir UBL 2.1, la firma XAdES, el CUFE y a pasar el set de pruebas: no compensa para
  este volumen.
- **Fase inicial (pocos tenants), `IInvoiceProvider` = `manual` sobre el servicio gratuito de la
  DIAN.** Cuesta $0, la DIAN no limita el volumen y entrega el certificado de firma sin costo con
  vigencia de 2 años.
  - Cada pago `APROBADO` crea una `factura` en `por_emitir` (índice único `paymentId`), con los datos
    listos para copiar: adquiriente, concepto, base, IVA 19% y total.
  - El superadmin la emite en el portal de la DIAN. Después sube el PDF y el XML (a DO Spaces,
    privados), registra el número y el CUFE, y la factura pasa a `emitida`. El admin del tenant la
    descarga con una URL firmada.
  - El panel lista las facturas `por_emitir` con su antigüedad (SLA operativo).
  - **No** se automatiza el portal con scraping ni RPA: es frágil y obliga a guardar las credenciales
    de la DIAN.
- **Fase de crecimiento:** cambiar a un proveedor con API sin tocar el dominio. Las candidatas:
  - **MATIAS** PYME Mini: ~$196.000 COP/año por 500 documentos, certificado incluido.
  - **Factus**: REST + OAuth2, con notas crédito y descarga de PDF/XML, sin webhooks. No publica
    precios: hay que cotizar.
  - La emisión pasa a un job `invoice-issue` con reintentos.
  - Disparador sugerido: más de unas 15 facturas al mes, o cuando el trabajo manual pese.
- Se requiere en ambos casos: el responsable 52 en el RUT, la habilitación ante la DIAN, una
  resolución de numeración con prefijo asociado y el certificado de firma.

### HU-BILL-04 — Renovación automática (switch del tenant)
- **Primero el medio de pago:** el admin suscribe una tarjeta con el Widget (payment source de
  Wompi, con aceptación explícita del cobro recurrente). Se guarda **solo el `paymentSourceId`** y
  los últimos 4 dígitos con la marca, para mostrarlos.
- **Después el switch** (D10): «Cobro automático» en Ajustes. Está deshabilitado mientras no haya
  una tarjeta suscrita. El backend rechaza activarlo sin `paymentSourceId` (`AppError` 409). Si
  la tarjeta se elimina, el switch se apaga solo.
- La renovación cobra el mismo plan y el mismo periodo vigentes, al precio actual que fijó el
  superadmin (D3). Antes del cobro se muestra el monto en la UI de billing.
- Un job N días antes de `vigenciaHasta` crea la transacción con la llave privada y el mismo flujo
  de confirmación (D4).
- Manejo mínimo del fallo: un reintento y un aviso en la UI de billing. Si no se cobra, D6 sigue
  aplicando (sin gracia ni suspensión, porque eso es el ciclo de impago, que está fuera).
- El admin puede desactivar el switch y borrar el payment source.

### HT-PAY-06 — Salida a producción
- Checklist operativo: llaves de producción, URL de eventos configurada en Wompi, CSP desplegada y
  rate limits activos.
- Guía en `docs/integrations/wompi.md` y variables en `docs/00-deploy.md`.
- Pruebas en sandbox con las tarjetas y estados de prueba de Wompi: aprobado, rechazado, pendiente
  (PSE) y evento duplicado/reintentado.
- Smoke test en producción con un cobro real mínimo y reverso.

## 5. Controles de seguridad (trazabilidad)

| Riesgo | Control | SPEC |
|---|---|---|
| Monto manipulado en el cliente | Monto del backend + firma de integridad + verificación del monto en el evento | PAY-01, PAY-02, BILL-02 |
| Evento falso | Checksum con `timingSafeEqual` + re-consulta a la API | PAY-02 |
| Evento repetido o reintentado | Índice único en `payment_events` + `jobId` + transición condicional | PAY-04, PAY-02 |
| Fuga entre tenants | Repositorio scoped; la referencia no expone el tenant; tests de aislamiento | PAY-04, PAY-02 |
| Redirección falsificada | El retorno solo consulta, no activa | BILL-02 |
| Fuga de llaves | Llaves en env; en el frontend solo la pública; redacción en logs; validación de prefijos | PAY-01, PAY-05 |
| Abuso del endpoint | Rate limit con Redis | PAY-05 |
| Datos de tarjeta | Nunca pasan por SofiApp (Widget/Checkout) | PAY-05 |
| Checkout viejo reutilizado | `expirationTime` en la firma + `EXPIRADO` | PAY-01, PAY-03 |
| Habeas Data | Aceptación versionada con fecha e IP | BILL-02 |

## 6. Preguntas abiertas (resolver en la spec que corresponde)

1. **HU-BILL-07:** que el contador confirme a nombre de quién se factura y el régimen de IVA. Pedir la cotización de Factus para la fase de crecimiento.
2. **HU-BILL-02:** la versión y el texto de los términos de SofiApp y de la política de tratamiento
   de datos (los entrega negocio o legal).
3. **HT-PAY-03:** los valores concretos de N (frecuencia del barrido), X (antigüedad para consultar)
   y la expiración del checkout (sugerido: 5 min, 15 min y 30 min).
4. **HU-BILL-04:** con cuántos días de anticipación se cobra la renovación (sugerido: 3).
5. **HU-BILL-01:** qué pasa con los tenants que hoy tienen un plan `mensual` asignado a mano al
   migrar (sugerido: mantener su vigencia y pasarlos a trimestral en el siguiente pago).
