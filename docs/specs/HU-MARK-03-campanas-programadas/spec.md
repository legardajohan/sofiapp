# HU-MARK-03 — Programar campañas automáticas de seguimiento (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Segunda pieza del módulo **M07 — Campañas de Remarketing** (`docs/product.md` §5):
> completa lo que `HU-MARK-01` dejó a medias —la programación— y añade la **imagen** como contenido.

**Estado:** creado

## Historia

Como **empresa** quiero **programar campañas automáticas de seguimiento** (fecha/hora, texto e
imagen, filtros) para escribirle a un segmento en el momento oportuno sin tener que estar conectado
a esa hora.

## Objetivo

Agendar una campaña para ejecución futura con su **contenido** (texto + imagen) y su **segmento**, y
que arranque sola **a la hora exacta** indicada, reutilizando toda la tubería de `HU-MARK-01`
(segmentador, pacing por tier, cola `campaign-broadcast`, progreso en vivo) sin reimplementarla.

## Contexto (importante)

**Lo que ya existe y no se toca.** `HU-MARK-01` dejó `Campaign.programadaPara`, el estado
`programada` y un barrido global (`processCampaignSweep`, cada `CAMPAIGN_SWEEP_INTERVAL_MS` = 60 s)
que lanza las vencidas. También el constructor de segmentos con exclusión incondicional del opt-out,
el presupuesto derivado del tier y la calidad, y el envío por lotes.

**Lo que falta, y es esta HU:**

1. **Imagen.** Hoy la campaña solo envía plantillas con parámetros de `BODY`
   (`buildTemplatePayload`); la cabecera con media quedó fuera de alcance en MARK-01.
2. **Hora exacta.** El barrido puede llegar hasta 60 s tarde. La DoD exige la hora indicada.
3. **Endpoint dedicado** `POST /api/campaigns/schedule` que acepte la imagen (multipart), más
   reprogramar y cancelar mientras la campaña espera.
4. **Programador en el front** con carga de imagen, fecha/hora y vista previa real del mensaje.

**Por qué la imagen va en la cabecera de una plantilla y el texto en su `BODY`.** Una campaña de
seguimiento se escribe casi siempre a contactos **fuera de la ventana de 24 h**, y ahí Meta solo
acepta plantillas aprobadas (`docs/integrations/meta-whatsapp.md` §4). El texto libre y la imagen
suelta (`sendMedia`) se rechazarían con `FUERA_DE_VENTANA`. La forma que Meta permite es una
plantilla `APPROVED` cuyo `HEADER` tenga `format: IMAGE`: la imagen concreta se pasa **al enviar**
como parámetro de cabecera, y el texto de la empresa entra por los parámetros del `BODY`. Así la
misma plantilla aprobada sirve para muchas campañas con imágenes distintas.

**Por qué el segmento se congela al arrancar y no al programar.** Programar a tres días vista y
congelar hoy dejaría fuera a los contactos que entren al segmento en esos tres días, que son
justamente los de "seguimiento". La campaña programada guarda los **filtros**; los destinatarios se
materializan al arrancar, con la misma regla y la misma auditoría que MARK-01 (su spec, §"por qué el
segmento se congela al lanzar").

**Por qué la imagen no se sube a Meta al programar.** El `media id` de Meta caduca a los 30 días
(`meta-media.client.ts`, `mediaExpirada`). La imagen se guarda en **nuestro** almacenamiento al
programar y se sube a Meta **al arrancar**, una sola vez por campaña.

## Alcance

Incluye:
- `POST /api/campaigns/schedule` (multipart): nombre, filtros, plantilla, parámetros del `BODY`,
  `programadaPara` e imagen JPEG/PNG ≤ 5 MB (límite de Meta para imágenes).
- Persistencia de la imagen en el almacenamiento de media del tenant (DO Spaces / disco local) y su
  referencia en `Campaign.contenido.imagen`.
- Soporte de **cabecera `IMAGE`** en `buildTemplatePayload` y en el modo `plantilla` de
  `sendOutbound`, retrocompatible con todos los consumidores actuales.
- Exposición de `cabecera` en `GET /api/whatsapp-templates` para filtrar plantillas en el front.
- Job BullMQ con `delay` exacto hasta `programadaPara`; el barrido de 60 s queda como red de
  seguridad. Arranque **idempotente**.
- `PATCH /api/campaigns/:id/schedule` para reprogramar (y cambiar contenido, imagen o filtros)
  mientras la campaña está `programada`; cancelar una `programada` con el `POST /:id/cancel` existente.
- Programador en el front: filtros, plantilla con imagen, carga de imagen, fecha/hora y vista previa.

Fuera de alcance:
- **Recurrencia** (diaria/semanal). Una campaña programada se ejecuta **una vez**.
- Cabeceras `DOCUMENT`, `VIDEO` o `TEXT` con variables.
- **Crear** plantillas con cabecera de imagen desde SofiApp (requiere la subida reanudable de Meta).
  Se crean en Meta Business Manager y entran por el sync existente, que ya persiste `components`.
- Parámetros por destinatario (mail-merge): siguen fijos por campaña, como en MARK-01.
- Mostrar la imagen de la campaña dentro del hilo de la bandeja.
- Zona horaria por tenant: se guarda en UTC; la UI trabaja en la hora local del navegador y la
  muestra explícitamente.

## Criterios de aceptación

1. `POST /api/campaigns/schedule` (multipart: `imagen` + `nombre`, `filtros`, `templateId`,
   `parametros[]`, `programadaPara`) crea la campaña en estado `programada` y responde `201`. Un
   `programadaPara` en el pasado o a menos de 60 s → `400` con el detalle de Zod.
2. Coherencia contenido ↔ plantilla, validada **antes** de persistir: plantilla con cabecera `IMAGE`
   sin imagen → `422`; imagen con una plantilla sin cabecera de media → `400`; plantilla con cabecera
   `DOCUMENT` o `VIDEO` → `422`. Imagen que no sea `image/jpeg` o `image/png` → `400`; mayor de 5 MB
   → `413`. Las validaciones de `APPROVED` (422) y de número de parámetros (400
   `{ esperados, recibidos }`) siguen siendo las de `buildTemplatePayload`: **no se reimplementan**.
3. Los filtros son exactamente `ISegmentoFiltros` de MARK-01, con la exclusión incondicional de
   `marketingOptOut`. El segmento se materializa **al arrancar**, no al programar.
   **Ejes que ofrece el constructor** (ajuste pedido en revisión, 2026-09-28): semáforo del lead,
   **intención de compra** de la IA (`semaforoIA.nivelInteres`, HU-IA-05: frío/tibio/caliente),
   estado comercial, **etiquetas** y nivel de interés. Se quitaron del constructor el **rol del
   contacto** y los **datos propios de la ficha** (atributos): casi nadie los carga y devolvían
   segmentos vacíos. El backend los sigue aceptando para no romper campañas ya guardadas.
4. La campaña arranca **a la hora indicada**: al programar se encola un job con `delay` hasta
   `programadaPara`. Si Redis pierde el job, el barrido la levanta en ≤ `CAMPAIGN_SWEEP_INTERVAL_MS`.
   Job y barrido juntos **nunca** la lanzan dos veces (test que lo demuestra).
5. `PATCH /api/campaigns/:id/schedule` cambia `programadaPara` (y opcionalmente nombre, filtros,
   plantilla, parámetros o imagen) solo si la campaña está `programada`; en otro estado → `409`. El
   job de la hora anterior, al dispararse, es un **no-op**. `POST /api/campaigns/:id/cancel` sobre una
   `programada` la deja `cancelada` sin materializar destinatarios ni consumir cuota.
6. Al arrancar, la imagen se sube a Meta **una vez por campaña** y cada destinatario recibe la
   plantilla con cabecera `image` + `BODY`. Si el envío se extiende más de 25 días (el `media id`
   caduca a los 30), se vuelve a subir. Si la subida falla, la campaña queda `fallida` con `motivo` y
   **no se envía a nadie**.
7. Cuotas, pacing y ventana intactos: el arranque consume `campanasMes` (`assertWithinQuota`), cada
   envío consume `mensajesMes` por `sendOutbound`, el ritmo lo fija el presupuesto por tier, y una
   calidad `RED` a la hora de arranque deja la campaña `fallida` con motivo, como hace hoy el barrido.
8. `GET /api/campaigns/:id` devuelve `contenido.imagen` con una **URL firmada de corta vida** para la
   vista previa, y `GET /api/whatsapp-templates` expone `cabecera:
   'NINGUNA' | 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO'` derivada de `components`.
9. El front ofrece un **programador**: filtros (reutiliza `SegmentFilters` y `AudienceMeter`),
   plantillas con cabecera `IMAGE` primero (y también las de solo texto; nunca las de
   `DOCUMENT`/`VIDEO`), parámetros del `BODY`, carga de imagen (arrastrar o seleccionar, vista
   previa, validación de tipo/tamaño en cliente), fecha y hora con el `calendar` de shadcn/ui en
   línea más un campo de hora, mostrando la zona horaria, y vista previa tipo burbuja de WhatsApp
   con la imagen. El listado y el detalle muestran "Programada para …" con acciones
   **reprogramar** y **cancelar**. Todo en **light y dark** con tokens semánticos, habiendo invocado
   `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design` antes de cada
   componente (regla §7 del `CLAUDE.md` raíz).
10. **Aislamiento multi-tenant:** toda lectura y escritura de `Campaign` pasa por el repositorio
    tenant-safe; la clave de la imagen en el almacenamiento vive bajo el prefijo del tenant y la URL
    firmada lo lleva dentro; leer, reprogramar o cancelar una campaña de otro tenant → `404` sin
    escribir nada; el job de arranque lleva su `tenantId` dentro y no hay barridos cross-tenant nuevos
    (el único es el ya documentado en `docs/multi-tenancy.md` §5). Existe el test que lo demuestra.
11. `pnpm --filter @sofiapp/api typecheck` y `pnpm --filter @sofiapp/api test` en verde;
    `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde.

## Definition of Done

Una campaña programada se ejecuta en la fecha/hora exacta con el contenido configurado (texto e
imagen) y sobre el segmento definido. Verificado con test automatizado y con una prueba manual en
número **sandbox** con una plantilla de cabecera `IMAGE` aprobada.

## Dependencias

- `HU-MARK-01-campanas-segmentadas` (implementado) — `Campaign`, segmentador, pacing, cola, barrido.
- `HT-WA-02-plantillas-hsm` (implementado) — catálogo de plantillas y `buildTemplatePayload`.
- `HU-OMNI-06` (implementado) — almacenamiento de media (`getMediaStorage`) y
  `metaMediaClient.subir`.
