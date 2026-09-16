# HU-MARK-01 — Campañas segmentadas con envío masivo controlado (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Abre el módulo **M07 — Campañas de Remarketing** (`docs/product.md` §5): la última
> pieza grande de Fase 3, y la única que el repo tenía **modelada pero no construida**.

**Estado:** implementado

> Código y tests automatizados completos y en verde: `tsc --noEmit` backend + 1302 tests backend +
> build/lint frontend + 723 tests frontend. Pendiente únicamente la prueba manual con credenciales
> reales de Meta y números **sandbox** (criterio 16 / DoD) — requiere acción del usuario, ver
> `tasks.md`.

## Objetivo

Que una empresa pueda escoger a quién quiere escribirle —por **grado**, por **rol de contacto** y
por **semáforo comercial**—, enviarle a todo ese grupo una plantilla aprobada por Meta, y que la
plataforma se encargue de **dosificar la salida** para no superar el límite diario del número de
WhatsApp del tenant. El objetivo no es "enviar rápido": es **enviar sin quemar el número**.

## Contexto de dominio (importante)

**Dos límites distintos, que no se deben confundir.**

| | Cuota del plan (HU-SAAS-02) | Límite de Meta (esta spec) |
|---|---|---|
| Quién lo impone | SofiApp, comercialmente | Meta, técnicamente |
| Qué mide | `campanasMes`, `mensajesMes` por periodo `YYYY-MM` | Destinatarios únicos de conversaciones **iniciadas por la empresa** en 24 h rodantes |
| Qué pasa al superarlo | `AppError` 429 | Mensajes rechazados, caída de la **calidad** y, en el extremo, **suspensión de la WABA** |

Ambos se respetan. El primero ya existe (`assertWithinQuota` / `incrementUsage`,
`usage.service.ts:87,101`) y esta spec es su primer consumidor real para `campanasMes`. El segundo
**no existe todavía en ninguna parte del código** y es lo que esta spec introduce.

**El tier y la calidad son del número, no de la campaña.** `docs/integrations/meta-whatsapp.md` §8
documenta la sonda `GET /{phone_number_id}?fields=health_status,quality_rating,messaging_limit_tier`,
pero hoy solo se usa a mano con `curl` para diagnosticar un `403 (#131005)`. Nada la persiste y nada
la consulta al enviar. El presupuesto diario que esta spec calcula tiene que **descontar lo que ya
gastaron los recordatorios de HU-FLOW-02 y los envíos manuales de plantilla**: comparten número.

**El semáforo tiene dos ejes y aquí se usa el comercial.** `docs/domain.md` §5 los separa: la
etiqueta de la conversación (`Cliente.tagIds` → `Tag.semaforo`, salud del hilo) y el campo del lead
(`Lead.semaforo`, resultado comercial, catálogo ampliable por tenant). Una campaña se dirige a
**oportunidades**, así que segmenta por `Lead.semaforo`, y siempre **por `key`, nunca por nombre** —
el `label` es mutable y el catálogo es de cada empresa.

**"Grado" no es una columna, y no debe serlo.** No existe ningún campo `grado` en el modelo, y es
deliberado: HU-CRM-02 sacó del schema de `Cliente` precisamente los supuestos del vertical
Pre-ICFES. Los datos propios de cada empresa viven en `Cliente.atributos` (`{ key, label, valor }`).
Por tanto el segmentador **no filtra por "grado": filtra por atributo personalizado**, y "grado" es
un caso de uso entre otros (`colegio`, `EPS`, `presupuesto`…). Una empresa que no sea un instituto
obtiene el mismo valor de la misma pantalla.

**El consentimiento es un agujero abierto.** No existe ningún campo de opt-in / opt-out en
`Cliente`, `Lead` ni `Tenant`. Las políticas de Meta exigen consentimiento para plantillas de
categoría `MARKETING`, y un reporte de spam degrada la calidad del número — exactamente lo que esta
HU quiere evitar. Se incorpora el mínimo imprescindible (`Cliente.marketingOptOut`), que el
segmentador excluye **siempre**, sin que sea un filtro opcional. La captación del consentimiento
sigue siendo responsabilidad de la empresa, y queda fuera de alcance.

## Alcance

Incluye:
- Modelos `Campaign` y `CampaignRecipient` por tenant (los de `docs/data-model.md` §campaigns,
  ampliados con lo que esta spec necesita).
- **Constructor de segmentos** sobre contactos: atributo personalizado, `rolContacto`,
  `Lead.semaforo`, `nivelInteres`, `estadoComercial` y etiquetas, combinables.
- Vista previa del segmento: conteo, muestra y **volumen vs presupuesto** antes de lanzar.
- Persistencia del **tier de mensajería y la calidad** del número en `MetaIntegration`, refrescados
  desde la Graph API, con override manual.
- Cola `campaign-broadcast` con **pacing**: lotes espaciados que nunca superan el presupuesto diario.
- Registro de estado **por destinatario**, alimentado también por los `statuses` del webhook.
- Ciclo de vida completo: borrador, programada, en curso, pausada, reanudada, cancelada, completada.
- Listado, detalle y **progreso en vivo** por Socket.IO.
- Campo `Cliente.marketingOptOut` y su exclusión incondicional del segmento.
- Pantalla de campañas: listado, wizard de 3 pasos y detalle con progreso.

Fuera de alcance (otros features o fases):
- **Captación** del consentimiento (formularios, doble opt-in, palabra clave "BAJA" entrante). Aquí
  solo se respeta la marca; ponerla es, por ahora, trabajo manual desde la ficha del contacto.
- Plantillas con media en la cabecera o botones interactivos: se envía `BODY` con parámetros de
  texto, la misma limitación que ya declara `HT-WA-02-plantillas-hsm`.
- Parámetros **personalizados por destinatario** (mail-merge con `{{nombre}}` resuelto fila a fila):
  en esta spec los parámetros de la plantilla son **fijos para toda la campaña**.
- Webhook `phone_number_quality_update` / `account_update`: el tier y la calidad se refrescan con la
  sincronización manual y con un TTL, no por push de Meta.
- Métricas de conversión de la campaña (cuántos respondieron, cuántos compraron) → módulo de
  reporting.
- Campañas por Instagram o Messenger: solo WhatsApp.
- A/B testing de plantillas.

## Criterios de aceptación

1. `POST /api/campaigns/segmento/preview` recibe `{ filtros }` y devuelve `{ total, muestra[],
   presupuesto }`. Filtra por **atributo personalizado** (`{ key, valores[] }` — el caso "grado"),
   por **`rolContacto`** (key del catálogo `contact_options` tipo `rol`) y por **semáforo del lead**
   (key del catálogo `semaforos`), y los tres son **combinables** entre sí y con `nivelInteres`,
   `estadoComercial` y `tagIds`.
2. Una `key` de catálogo que no existe en el tenant produce un **segmento vacío**, no un `400` ni un
   segmento sin filtrar — la misma convención que `GET /api/leads?semaforo=` y
   `GET /api/conversations?estado=`.
3. Los contactos con `marketingOptOut: true` **nunca** aparecen en el segmento, ni en la vista previa
   ni en los destinatarios materializados. No es un filtro que se pueda desactivar.
4. `POST /api/campaigns` crea la campaña. Con `lanzar: true` la arranca en el acto; con
   `programadaPara` la deja en `programada` y arranca sola a esa hora. Lanzar consume la cuota
   `campanasMes` del plan (`429` al límite, vía `assertWithinQuota`), y cada mensaje enviado consume
   `mensajesMes` por el camino normal de `sendOutbound`.
5. La campaña solo admite una plantilla **`APPROVED`**. Una `PENDING`, `REJECTED`, `PAUSED`,
   `DISABLED` u `obsoleta` → `AppError` 422 **antes** de llamar a la Graph API, y con un número de
   parámetros distinto al que declara el cuerpo → `400` con `{ esperados, recibidos }`. Ambas
   validaciones son las que ya hace `buildTemplatePayload`; esta spec **no las reimplementa**.
6. Al lanzar, el segmento se **congela**: se materializan los `CampaignRecipient` en ese instante y
   `totales.destinatarios` queda fijo. Un contacto que empiece a cumplir los filtros a mitad del
   envío **no** se incorpora.
7. `MetaIntegration` persiste `messagingTier`, `qualityRating` y `healthStatus`, y
   `POST /api/channels/whatsapp/tier/sync` los refresca desde la Graph API. Si la sonda falla, el
   valor declarado a mano por el administrador sigue siendo válido y el lanzamiento no se bloquea
   por no poder consultar a Meta.
8. El presupuesto diario se deriva del **tier** y de la **calidad** del número, y descuenta los
   destinatarios únicos de plantilla de las **últimas 24 h rodantes** (incluidos los recordatorios de
   HU-FLOW-02 y los envíos manuales: comparten número). Con calidad `RED` el lanzamiento se rechaza
   con `409`; con `YELLOW` el presupuesto se reduce a la mitad.
9. El worker **nunca supera el presupuesto**: envía en lotes espaciados y, al agotarlo, la campaña
   queda `en_curso` y se reanuda sola cuando la ventana de 24 h libera capacidad. Existe un test que
   lo demuestra con un tier pequeño y más destinatarios que presupuesto.
10. Cada destinatario registra `pendiente | enviado | entregado | fallido | omitido` con `error` y
    `enviadoAt`. Los `statuses` del webhook de Meta actualizan `entregado` y `fallido` por
    `metaMessageId`, **por tenant** (la fuga que cerró `HT-WA-01-V2` no se reabre).
11. Un fallo de envío a un destinatario **no tumba el lote**: se marca `fallido` con su motivo y la
    campaña continúa. Una campaña acaba `fallida` solo si no queda nada que enviar y no se envió
    nada.
12. `POST /api/campaigns/:id/pause`, `/resume` y `/cancel` operan sobre una campaña en curso sin
    perder el progreso: reanudar no reenvía lo ya enviado, y cancelar deja los pendientes en
    `omitido`, no en `fallido`. Relanzar una campaña ya lanzada es **idempotente**.
13. `GET /api/campaigns` (paginado, `?estado=`) y `GET /api/campaigns/:id` muestran totales y
    desglose por estado de destinatario; el avance llega en vivo por el evento `campaign:progress`
    al room `tenant:<id>` (ADR 0004), nunca en difusión global.
14. La pantalla de campañas ofrece listado, wizard de 3 pasos (segmento → plantilla → revisión) y
    detalle con progreso. El paso de revisión muestra **volumen vs presupuesto**, tier, calidad y
    días estimados de envío, y **bloquea el lanzamiento** cuando la calidad es `RED`. Todo terminado
    en **light y dark** con los tokens semánticos del proyecto y con componentes de shadcn/ui.
15. **Aislamiento multi-tenant:** toda lectura y escritura de `Campaign` y `CampaignRecipient` pasa
    por el repositorio tenant-safe. Una campaña del tenant A no es legible, lanzable, pausable ni
    cancelable desde el tenant B (`404`, nunca `403`, y sin escribir nada); un segmento idéntico
    ejecutado en B **nunca** devuelve contactos de A, aunque compartan teléfono y la misma `key` de
    atributo; y el job de la cola lleva su `tenantId` dentro, sin barridos cross-tenant. Existe el
    test que lo demuestra.
16. `pnpm --filter backend typecheck` en verde, `pnpm --filter backend test` en verde y
    `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.

## Nota sobre por qué el presupuesto se calcula y no se configura

Sería más simple pedirle al administrador "¿cuántos mensajes al día?" y obedecer. Se descarta por
dos razones. La primera es que el número que importa no lo decide él: lo decide Meta, cambia solo
—el tier sube al escalar volumen con buena calidad, y baja tras una racha de bloqueos— y el
administrador se enteraría tarde. La segunda es que el gasto no es solo de la campaña: los
recordatorios de HU-FLOW-02 y los envíos manuales de plantilla consumen el mismo cupo del mismo
número. Un presupuesto declarado a mano ignoraría ese consumo, y la campaña sería justo el proceso
que empuja al número por encima del límite. Por eso se **deriva**: tier × margen × calidad, menos lo
ya gastado en las últimas 24 h. Lo que sí queda en manos del administrador es el **margen de
seguridad** (`CAMPAIGN_SAFETY_MARGIN`, de despliegue) y el **override del tier**, para cuando la
sonda de Meta no responda.

## Nota sobre por qué el segmento se congela al lanzar

Un segmento es una consulta, y una consulta cambia mientras se ejecuta: un contacto entrante mueve
su `ultimoMensajeAt`, un asesor cambia el semáforo de un lead a media tarde, la IA reclasifica una
conversación. Si el worker reevaluara los filtros en cada lote, la audiencia derivaría durante las
horas que dura un envío grande, nadie podría decir a cuánta gente se le escribió, y un contacto
podría recibir el mensaje dos veces al entrar y salir del filtro. Materializar los destinatarios al
lanzar convierte la campaña en un hecho auditable: `totales.destinatarios` es un número fijo desde
el segundo uno, y cada fila de `campaign_recipients` cuenta qué le pasó a esa persona.

## Dependencias

- `HT-WA-02-plantillas-hsm` (implementado) — aporta el catálogo HSM, `buildTemplatePayload` y
  `sendOutbound`, que esta spec **consume sin reimplementar**.
- `HU-CRM-04-semaforizacion-lead` (implementado) — aporta `Lead.semaforo` y el catálogo `semaforos`,
  el eje por el que segmenta el filtro de semáforo.
- `HU-CRM-02-registrar-informacion-cliente` (implementado) — aporta `Cliente.atributos` (por donde
  entra "grado") y el catálogo `contact_options` tipo `rol`.
- `HU-SAAS-02-planes-limites-uso` (implementado) — aporta la cuota `campanasMes`, que hasta ahora no
  tenía consumidor.
- `HT-WA-01-V2-webhook-e2e` (implementado) — sin canal operativo no hay forma de verificar un envío
  real ni de recibir los `statuses` de entrega.

## Nota de trazabilidad

Corresponde al módulo **M07 — Campañas de Remarketing** de `docs/product.md` §5 (Fase 3), declarado
fuera de alcance en `docs/specs/HT-WA-02-plantillas-hsm/spec.md` y en
`docs/integrations/meta-whatsapp.md` §5. Consume el gancho que
`docs/adr/0007-tablero-kanban-pipeline.md` dejó abierto (`Estado.esSalida` para "campañas de
remarketing") y cumple la promesa de `docs/domain.md` §5: MARK-01 resuelve el semáforo **por `key`**,
y tolera que una clave no exista.
