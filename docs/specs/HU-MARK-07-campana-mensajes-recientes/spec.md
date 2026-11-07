# HU-MARK-07 — Campaña a destinatarios de mensajes recientes por rango de fechas (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Nueva pieza del módulo **M07 — Campañas de Remarketing** (`docs/product.md` §5):
> una **segunda forma de armar la audiencia** —por historial de mensajes enviados— y el
> **etiquetado automático** de quienes la recibieron. Se monta sobre lo que construyeron
> `HU-MARK-01/03/04/05`; no reemplaza nada.

**Estado:** implementado

> Código y tests automatizados en verde: `tsc --noEmit` backend + 1917 tests backend (184 archivos)
> + build/lint frontend + tests de las features tocadas (campaigns, leads, contacts, tags). La suite
> completa del frontend cae por un `RangeError` en `features/knowledge-base` que **ya existía en
> `develop`** (verificado con los cambios apartados). Pendiente: revisión visual light/dark en el
> navegador y prueba manual con números **sandbox** de Meta; `impeccable:impeccable` no está
> instalada en este entorno.

## Historia

Como **administrador del tenant** quiero generar una campaña dirigida a los contactos a quienes se
les enviaron mensajes recientemente, delimitando el periodo por fechas (último día, 3 días, 7 días o
rango personalizado), y que al enviarla se genere una etiqueta sobre los destinatarios, para dar
seguimiento oportuno y poder segmentarlos después sin armar listas manualmente.

## Objetivo

Construir la audiencia de una campaña **de forma dinámica** a partir del historial de mensajes
salientes del tenant filtrado por fecha, con previsualización, deduplicación, envío controlado (el
pacing de MARK-01) y **etiquetado automático** de los contactos efectivamente alcanzados, de modo que
la etiqueta quede disponible como filtro de contactos y de futuras campañas.

## Contexto (importante)

**Casi todo existe ya; esta HU lo extiende.** MARK-01 dejó `Campaign`, `CampaignRecipient` (con el
índice único `{ tenantId, campaignId, clienteId }` que impide el doble envío), la cola
`campaign-broadcast` con pacing por tier y `limiter`, el estado por destinatario, la exclusión de
`marketingOptOut` y la deduplicación por teléfono (`IResumenSegmento.duplicados`). MARK-03 añadió la
programación, MARK-04 las métricas y MARK-05 el contenido real en la bandeja. MARK-07 **no crea**
modelos de campaña nuevos: añade un `tipo` de audiencia y una etiqueta a los que ya hay.

**La HU usa nombres que en el repo son otros.** Para no reinventar el modelo:

| En la HU | En el repo | Nota |
|---|---|---|
| `Contact { tags: [tagId] }` | `Cliente.tagIds` (`features/cliente`) | No existe un feature `contact`. |
| `Message.sentAt` | `Message.createdAt` con `direccion: 'outbound'` | El mensaje saliente se persiste al enviarlo. |
| Índices `{ tenantId, sentAt }`, `{ tenantId, contactId, sentAt }` | `{ tenantId, createdAt }` y `{ tenantId, clienteId, createdAt }` **ya existen** | Se añade `{ tenantId, direccion, createdAt }` para el `$match` de salientes. |
| `Campaign.totalDestinatarios` | `Campaign.totales.destinatarios` | Se fija al crear (conteo congelado) y se confirma al lanzar. |
| `Campaign.creadoPor` | `Campaign.creadaPor` | Ya existe. |
| `CampaignRecipient.contactId` | `CampaignRecipient.clienteId` | Ya existe. |
| `Tag.creadoAt` | `Tag.createdAt` (`timestamps`) | Ya existe. |

**Tres huecos del modelo que esta HU cierra** (decisiones tomadas con el usuario):

1. **Zona horaria del tenant.** Hoy no se guarda: los reportes la reciben del navegador por query.
   Se añade `Tenant.zonaHoraria` (IANA, default `America/Bogota`), editable por el administrador. Es
   la única fuente para resolver fechas de la audiencia, así dos administradores en zonas distintas
   ven la misma audiencia.
2. **Bloqueados / inactivos.** `Cliente` solo tiene `marketingOptOut`. Se añade `Cliente.bloqueado`
   (default `false`), alternable desde la ficha del contacto, y cubre "bloqueado" e "inactivo". Se
   excluye **siempre**, igual que el opt-out, en esta audiencia y también en el segmentador de MARK-01.
3. **Largo de la etiqueta.** `Tag.nombre` tiene tope de 30 y `"Campaña {nombre} - {fecha}"` lo
   supera con facilidad. El tope sube a **60** en todo el sistema; el chip trunca visualmente con
   tooltip.

**"Mensajes enviados" = cualquier saliente.** Cuenta todo `Message` con `direccion: 'outbound'` del
tenant en el rango, lo haya escrito un asesor, el bot o una campaña anterior. Los entrantes no
cuentan: la HU habla de "a quienes se les enviaron mensajes".

## Alcance

Incluye:
- Tipo de audiencia `mensajes_recientes` con rangos `1d`, `3d`, `7d` y `custom`.
- Resolución de rangos a fechas exactas en la zona del tenant, con validación y tope configurable.
- Previsualización: total de destinatarios únicos, muestra y desglose de excluidos.
- Congelación del rango resuelto en la campaña (trazabilidad) y materialización con ese rango.
- Envío con etiqueta: crear nueva o elegir existente; asignación con `$addToSet` solo a envíos
  exitosos.
- `Tag.origen` (`manual` | `campana`) y `Tag.campaignId`.
- Filtro `?etiqueta=` en el listado de leads/contactos.
- `Tenant.zonaHoraria` y `Cliente.bloqueado`, con su edición.
- Front: paso de audiencia con selector de rango y date-range picker, revisión con conteo, campo de
  etiqueta con autocompletar y detalle con filtro aplicado, etiqueta y progreso.

Fuera de alcance:
- Combinar "mensajes recientes" con los filtros del segmentador (atributos, etapas…): es un `tipo` de
  audiencia **alternativo**. Si hace falta refinar, se segmenta después por la etiqueta generada.
- Quitar la etiqueta de forma masiva o por campaña (se gestiona desde `/etiquetas` como siempre).
- Captación del consentimiento / palabra clave "BAJA" (sigue fuera, como en MARK-01).
- Programación con imagen para este tipo de audiencia más allá de lo que MARK-03 ya permite.

## Criterios de aceptación

1. `POST /api/campaigns/audience/preview` (rol `admin`) recibe
   `{ audiencia: { tipo: 'mensajes_recientes', rango: '1d'|'3d'|'7d'|'custom', desde?, hasta? } }` y
   responde `{ total, muestra[], resumen, presupuesto, rango: { desde, hasta, zonaHoraria } }`, con
   `total = resumen.validos` (destinatarios únicos) y `muestra` de hasta 10 contactos.
2. Los rangos predefinidos son **ventanas rodantes** hasta el instante de la consulta: `1d` = 24 h,
   `3d` = 72 h, `7d` = 168 h. `custom` va de las 00:00:00.000 de `desde` a las 23:59:59.999 de
   `hasta`, ambos días interpretados **en `Tenant.zonaHoraria`**, y recortado al instante actual.
3. `custom` exige `desde` y `hasta` (`YYYY-MM-DD`), valida `desde ≤ hasta`, rechaza fechas futuras
   (en la zona del tenant) y una duración mayor a `CAMPAIGN_AUDIENCE_MAX_DAYS` (env, default 90):
   cada caso responde `400` con un mensaje explícito.
4. Solo se consideran `Message` **del tenant del token** con `direccion: 'outbound'` dentro del rango.
   Un contacto con varios mensajes en el rango aparece **una vez**, y dos fichas con el mismo
   teléfono cuentan como un destinatario (dedupe por teléfono existente).
5. Los contactos con `marketingOptOut: true` o `bloqueado: true` **nunca** forman parte de la
   audiencia, ni en la vista previa ni en los destinatarios materializados; `resumen` los desglosa
   (`bajas`, `bloqueados`, `duplicados`).
6. `POST /api/campaigns` acepta `audiencia` (sin ella, `tipo: 'segmento'`, comportamiento actual
   intacto). Al crear, la campaña **guarda el filtro aplicado**: `rango`, `desde` y `hasta` resueltos
   y `zonaHoraria`. Al lanzar, los destinatarios se materializan **con ese rango congelado**: sin
   cambios de bajas/bloqueos entre medias, `totales.destinatarios` es igual al `total` de la vista
   previa y al número de `CampaignRecipient` creados.
7. `POST /api/campaigns/:id/send` (rol `admin`) con body `{ etiqueta?: { tagId } | { nombre } }`
   lanza la campaña reutilizando `launchCampaign` (cuota `campanasMes`, plantilla `APPROVED`,
   presupuesto del número, idempotencia) y fija `Campaign.tagId`. Un `nombre` nuevo crea
   `Tag { origen: 'campana', campaignId }`; un `nombre` que ya existe en el tenant (insensible a
   mayúsculas y acentos) **reutiliza** esa etiqueta; un `tagId` de otro tenant o inexistente → `404`
   sin escribir nada. Sin `etiqueta`, se envía sin etiquetar.
8. La etiqueta se asigna con `$addToSet` a cada contacto **en el momento en que su envío queda
   `enviado`** (Meta lo aceptó). Nunca a destinatarios `fallido` u `omitido` ni a excluidos. Si el
   contacto ya la tenía no se duplica, y el destinatario registra `etiquetaAgregada: false`. Si más
   tarde el webhook marca ese envío `failed`, la etiqueta se retira **solo** si la puso esta campaña.
9. `Tag.nombre` sigue siendo único por tenant (índice existente con collation `es`/strength 2) y
   admite hasta 60 caracteres. La etiqueta generada aparece en `GET /api/tags`, es elegible en el
   segmentador de campañas (`tagIds`) y filtra el listado de leads con `GET /api/leads?etiqueta=<tagId>`.
10. `GET /api/campaigns/:id` devuelve `audiencia` (tipo, rango, fechas resueltas y zona), `etiqueta`
    (`{ id, nombre, color }` o `null`) y el progreso (`totales` + evento `campaign:progress` existente).
11. `GET /api/tenants/me/ajustes` y `PATCH /api/tenants/me/ajustes` (rol `admin`) leen y editan
    `zonaHoraria`, validada como zona IANA real (`400` si no lo es). `PATCH /api/clientes/:id`
    permite alternar `bloqueado`.
12. **Frontend.** El paso 1 del wizard ofrece el tipo de audiencia (*Por filtros* / *Mensajes
    recientes*). En "Mensajes recientes": selector *Último día · 3 días · 7 días · Personalizado* y,
    para personalizado, un date-range picker que deshabilita fechas futuras y rangos de más de 90
    días, con el conteo en vivo. La revisión muestra el total, la muestra y el desglose de excluidos;
    la confirmación incluye el **campo de etiqueta** (autocompletar sobre las existentes o crear una
    nueva) con el nombre sugerido editable `Campaña {nombre} - {dd/mm/aaaa}`. El detalle muestra el
    filtro aplicado, la etiqueta generada y el progreso. La ficha del contacto permite marcar
    "Bloqueado" y los ajustes permiten elegir la zona horaria. Todo con shadcn/ui, tokens semánticos,
    prolijo en **light y dark**, aplicando `emil-design-eng`, `impeccable:impeccable` y
    `frontend-design:frontend-design`.
13. **Aislamiento multi-tenant:** el aggregate de la audiencia pasa por `aggregateScoped`, y toda
    lectura/escritura de `Campaign`, `CampaignRecipient`, `Tag`, `Cliente` y `Tenant` por el
    repositorio tenant-safe. Mensajes salientes del tenant B **nunca** entran en la audiencia de A,
    aunque compartan teléfono; `send` sobre una campaña de B, o con un `tagId` de B, responde `404`
    sin escribir; el `$addToSet` del worker solo toca `Cliente` del `tenantId` del job. Existe el test
    que lo demuestra.
14. `pnpm --filter @sofiapp/api typecheck` (`tsc --noEmit`) y `pnpm --filter @sofiapp/api test` en
    verde; `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde.

## Definition of Done

- Campaña creada y enviada con los rangos `1d`, `3d`, `7d` y `custom`.
- El conteo de la previsualización coincide con los envíos reales (test de igualdad).
- La etiqueta queda asignada **solo** a los contactos enviados con éxito y es filtrable en leads y en
  el segmentador.
- Deduplicación y aislamiento por tenant verificados con pruebas.
- Pipeline de CI verde.

## Nota sobre por qué el rango se congela al crear

Un preset como "últimos 3 días" es relativo a *ahora*: si la campaña se crea hoy y se envía mañana,
reevaluarlo al enviar le escribiría a otra gente distinta de la que el administrador revisó. Por eso
`POST /api/campaigns` resuelve el rango a dos instantes y los **guarda**; el envío materializa con
esos instantes. Además deja la trazabilidad que pide la HU: cualquiera puede ver después exactamente
qué periodo se usó y en qué zona.

## Nota sobre por qué la etiqueta se pone al aceptar el envío y no al final

Etiquetar al terminar toda la campaña dejaría a los primeros destinatarios sin etiqueta durante
horas (el pacing de MARK-01 puede repartir un envío en varios días), y un fallo a mitad dejaría sin
etiquetar a gente que sí recibió el mensaje. Etiquetar en el mismo paso que marca `enviado` hace que
"tiene la etiqueta" y "se le envió" sean siempre lo mismo.

## Ampliaciones pedidas durante la implementación

Añadidas en la misma rama `feat/HU-MARK-07`, a pedido del usuario:

1. **Elegir una etiqueta ya creada.** El campo de etiqueta tiene dos modos explícitos —«Crear nueva»
   y «Usar una existente»— y el segundo lista **todas** las etiquetas del tenant, incluidas las de
   semaforización (en su propio grupo). Enviar un borrador desde su detalle también ofrece la
   etiqueta (`POST /:id/send`).
2. **Enviar ahora o programar.** La revisión del asistente pregunta «¿Cuándo sale?». Programar usa
   `POST /api/campaigns` con `programadaPara` (≥ 60 s), encola el arranque exacto y acepta
   `etiqueta`, que se aplica a los enviados con éxito cuando la campaña arranca. En una audiencia
   por mensajes recientes el rango sigue congelado al crear.
3. **Etiquetas y campañas en el lead.** `GET /api/leads` y `GET /api/leads/:id` devuelven las
   `etiquetas` del contacto —las manuales y las que dejaron las campañas—; el detalle añade
   `campanas` (las que recibió, con el estado de su envío y la etiqueta que le dejó). Se ven en la
   tabla, en la tarjeta del embudo y en la ficha del lead, con enlace a cada campaña.

## Dependencias

- `HU-MARK-01-campanas-segmentadas` (implementado) — modelos, cola, pacing, opt-out, dedupe y wizard.
- `HU-MARK-03-campanas-programadas` (creado) — programación; esta HU la reutiliza desde el asistente (ampliación 2).
- `HU-MARK-04-metricas-campanas` (implementado) — detalle y métricas por destinatario.
- `HU-MARK-05-mensajes-campana-bandeja` (creado) — `Message.origen`/`campaignId` y estados de entrega.
- `HU-OMNI-04-etiquetado-conversaciones` — modelo `Tag` y `Cliente.tagIds`.
- `HU-MARK-02` — citada por la HU, **sin spec en `docs/specs/`**. No bloquea: nada de esta spec
  depende de ella; se deja anotado para confirmarlo con el backlog.
