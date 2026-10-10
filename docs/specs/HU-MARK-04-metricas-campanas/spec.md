# HU-MARK-04 — Métricas de apertura, respuesta y conversión (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Tercera pieza del módulo **M07 — Campañas de Remarketing** (`docs/product.md` §5):
> después de enviar (`HU-MARK-01`) y programar (`HU-MARK-03`), toca **medir**.

**Estado:** implementado

## Historia

Como **gerente** quiero **visualizar métricas de apertura, respuesta y conversión** de mis campañas
(mensajes enviados y respondidos alimentando el dashboard) para saber qué campaña funciona y cuál no.

## Objetivo

Medir el desempeño de cada campaña a partir de **eventos reales** por destinatario —envío, entrega,
lectura, respuesta y conversión— y exponerlo por campaña (`GET /api/campaigns/:id/metrics`) y en
agregado para el resumen del módulo.

## Contexto (importante)

**Lo que ya existe.** `CampaignRecipient` (MARK-01) guarda por destinatario el `metaMessageId` y el
estado de entrega `pendiente → enviado → entregado | fallido | omitido`. Los `statuses` de Meta
entran por un único camino (`updateDeliveryStatus` → `applyDeliveryStatusToRecipient`), que hoy
**ignora `read`**. Las respuestas del contacto entran por `inbound-message.processor.ts` y nadie las
relaciona con la campaña. No existe el concepto de "conversión": las etapas del pipeline son un
catálogo por tenant (`estados`, HU-CRM-03) sin ninguna marcada como "ganada".

**Por qué eventos y no un cálculo a posteriori.** "¿Respondió a la campaña?" no se puede reconstruir
con fiabilidad meses después cruzando mensajes y fechas: el contacto pudo recibir dos campañas, o
escribir por su cuenta. Se marca **en el momento** en que ocurre el evento, sobre la fila del
destinatario, y las métricas son una agregación de esas marcas.

**Por qué "apertura" es una cota inferior.** WhatsApp no tiene "apertura" como el email: lo más
cercano es el `status: read`, que Meta **no envía** si el contacto desactivó las confirmaciones de
lectura. La tasa de apertura es "al menos este %"; la UI lo dice. Una **respuesta** sí prueba la
lectura, así que responder marca también leído (y entregado).

**Por qué atribución *last-touch* con ventana.** Una respuesta o una conversión se atribuye a la
**campaña más reciente** que le escribió a ese contacto, y solo si ocurre dentro de una ventana
(respuesta: 72 h; conversión: 14 d, configurables por env). Sin ventana, un contacto que vuelve
seis meses después contaría como éxito de una campaña que olvidó. Multi-touch queda fuera.

**Por qué la conversión es una etapa marcada.** Cada empresa define su embudo (un gimnasio no tiene
"pago pendiente"), así que no hay una etapa universal de "venta". Se añade el flag
`esConversion` al catálogo de etapas: la empresa decide cuál(es) cuentan. Descriptivo, igual que
`esSalida`: no restringe transiciones.

**Por qué la fuente de verdad es la agregación y no contadores.** `Campaign.totales` ya existe para
el progreso en vivo, pero un contador incrementado por eventos puede derivar (reintentos, carreras).
La DoD exige que las métricas reflejen **correctamente** los envíos y respuestas reales: se calculan
agregando `campaign_recipients`, con índice que lo soporta.

## Alcance

Incluye:
- Captura por destinatario de `entregadoAt`, `leidoAt`, `respondidoAt` y `convertidoAt`,
  idempotente frente a webhooks duplicados o desordenados.
- Atribución de respuestas (inbound) y conversiones (cambio de etapa del lead) a la campaña más
  reciente dentro de su ventana.
- Flag `esConversion` en el catálogo de etapas, editable en `/etapas`; sembrado en `pagado` para
  tenants nuevos.
- `GET /api/campaigns/:id/metrics` y `GET /api/campaigns/metrics?desde&hasta` (agregado del
  período, base del dashboard).
- Panel de métricas por campaña en `/campanas/:id` y fila de KPIs del período arriba de
  `/campanas`.

Fuera de alcance:
- **Reconstruir** métricas de campañas enviadas antes de este feature: quedan con leídos,
  respondidos y convertidos en 0, y la UI lo indica.
- Atribución multi-touch o configurable por campaña.
- Ingresos / valor monetario de la conversión.
- Una página `/dashboard` propia (el agregado queda listo para consumirla).
- Exportar métricas a CSV.

## Criterios de aceptación

1. Un `status: read` de Meta marca `leidoAt` del destinatario **una sola vez**. Si el `read` llega
   antes que el `delivered`, el destinatario queda también `entregado` (leer implica entregar). Un
   webhook duplicado no altera la métrica.
2. Un mensaje entrante de un contacto se atribuye como **respuesta** a la campaña más reciente que
   le escribió (`enviadoAt`) dentro de `CAMPAIGN_REPLY_WINDOW_HOURS` (por defecto 72), marcando
   `respondidoAt` una sola vez. Responder marca también leído y entregado si faltaban. Fuera de
   ventana o sin campaña previa → no-op. Un fallo aquí **nunca** tumba la ingesta del mensaje.
3. Un lead que **transita** a una etapa con `esConversion: true` (desde una que no lo es) marca
   `convertidoAt` del destinatario más reciente dentro de `CAMPAIGN_CONVERSION_WINDOW_DAYS` (por
   defecto 14), una sola vez. Salir y volver a entrar no recuenta.
4. `GET /api/campaigns/:id/metrics` (rol `admin`) responde `200` con `{ campaignId, destinatarios,
   enviados, entregados, leidos, respondidos, convertidos, fallidos, tasas: { entrega, apertura,
   respuesta, conversion }, ventanas: { respuestaHoras, conversionDias }, calculadoAt }`, calculado
   por agregación sobre `campaign_recipients`. `entrega = entregados / enviados`; `apertura`,
   `respuesta` y `conversion` sobre `entregados`; `null` cuando el denominador es 0.
5. `GET /api/campaigns/metrics?desde&hasta` (rol `admin`) responde el mismo bloque de totales y
   tasas agregado sobre las campañas iniciadas en el rango, más `campanas` (hasta 5, ordenadas por
   tasa de respuesta). Rango inválido (`hasta < desde` o > 366 días) → `400` de Zod.
6. `Estado.esConversion` (default `false`) se lee y edita por la API de estados y desde `/etapas`;
   los tenants nuevos nacen con `pagado` marcado. Las etapas existentes no cambian solas.
7. El front muestra en `/campanas/:id` un **panel de métricas**: embudo
   Enviados → Entregados → Abiertos → Respondidos → Convertidos con conteos y tasas, nota de que la
   apertura es mínima, estado vacío para campañas sin envíos y aviso para campañas anteriores a la
   medición; se refresca solo mientras la campaña está viva. En `/campanas`, una **fila de KPIs**
   del período (selector 7 / 30 / 90 días). Componentes de shadcn/ui (`card`, `tooltip`,
   `skeleton`, `select`, `switch`), light y dark con tokens semánticos, habiendo invocado
   `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design` (y `dataviz` para
   el embudo) antes de cada componente (regla §7 del `CLAUDE.md` raíz).
7bis. **Gráficas** (ampliación pedida en revisión, 2026-10-09). Ambos endpoints devuelven
   `serie: [{ dia, enviados, respondidos, convertidos }]` —cada evento en el día de **su** marca de
   tiempo, en la zona horaria IANA que manda el navegador (`?zona=`, inválida → `400`), con ceros en
   los días sin actividad—. El resumen de `/campanas` muestra la actividad por día en dos gráficas
   pequeñas (enviados; respuestas y ventas, cada una con su escala, **nunca un doble eje**) y la
   tasa de respuesta por campaña en barras horizontales; el panel del detalle muestra la actividad
   de esa campaña. Colores de la paleta categórica validada (skill `dataviz`), un color por serie en
   todas las gráficas y en los dos modos, leyenda con totales y tabla equivalente para lectores de
   pantalla.
8. **Aislamiento multi-tenant:** toda lectura y escritura de `Campaign`, `CampaignRecipient`, `Lead`
   y `Estado` pasa por el repositorio tenant-safe; las métricas de una campaña de otro tenant →
   `404`; el agregado nunca suma campañas de otro tenant; un inbound o un cambio de etapa del tenant
   A **nunca** marca destinatarios del tenant B. Existe el test que lo demuestra.
9. `pnpm --filter @sofiapp/api typecheck` y `pnpm --filter @sofiapp/api test` en verde;
   `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde.

## Definition of Done

Las métricas de una campaña reflejan correctamente los envíos y respuestas reales. Verificado con
tests automatizados de captura y agregación, y con una prueba manual en número **sandbox**: lanzar
una campaña, leerla y responderla desde el teléfono, mover el lead a una etapa de conversión y ver
el embudo y los KPIs actualizados.

## Dependencias

- `HU-MARK-01-campanas-segmentadas` (implementado) — `Campaign`, `CampaignRecipient`, puente de
  `statuses`.
- `HU-MARK-03-campanas-programadas` (liberado) — detalle de campaña en el front.
- `HU-CRM-01` / `HU-CRM-03` / `HU-PIPE-01` — `Lead.clienteId`, catálogo `estados`,
  `updateLeadEstado`.
- `HT-WA-01-V2-webhook-e2e` — resolución de `statuses` siempre con `tenantId`.
