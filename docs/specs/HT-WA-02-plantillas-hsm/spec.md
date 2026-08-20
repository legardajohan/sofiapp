# HT-WA-02 — Catálogo de plantillas HSM y envíos fuera de ventana (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Habilitador técnico: cierra la mitad que le falta al canal de WhatsApp — poder
> **iniciar** conversaciones, no solo responderlas.

**Estado:** implementado

> Código, fix y tests automatizados completos y en verde (`tsc --noEmit` backend/frontend + 438
> tests backend + suite frontend). Pendiente únicamente la prueba manual con credenciales reales de
> Meta y un celular (criterio 11 / DoD) — requiere acción del usuario, ver `tasks.md`.

## Objetivo

Gestionar las plantillas aprobadas por Meta de cada empresa y poder enviarlas con parámetros
dinámicos, de modo que la plataforma pueda escribirle a un contacto **fuera de la ventana de
servicio de 24 h**. Hoy `sendTemplate` existe en `integrations/meta/meta-whatsapp.client.ts:53`
pero no tiene un solo llamador: fuera de la ventana lo único que ocurre es un `AppError` 422
(`message.service.ts:35-40`).

## Contexto de dominio (importante)

**La ventana de 24 h.** Meta solo permite texto libre durante las 24 h siguientes al último mensaje
del cliente. El proyecto ya modela esto: `Cliente.ventana24hExpiraEn` se recalcula en cada inbound
(`cliente.service.ts:44,65`) y `sendMessage` la verifica antes de enviar. Lo que falta es la otra
rama: cuando la ventana está cerrada, enviar una **plantilla HSM** aprobada en vez de rechazar.

**Dónde vive la decisión.** Hoy la regla está incrustada como un `throw` dentro de `sendMessage`.
Esta spec la extrae a una función `sendOutbound` que elige el modo (libre vs plantilla) y que será
el **único** punto del sistema donde esa decisión se toma. `HU-FLOW-02` (recordatorios antes de las
24 h) y la futura épica de Remarketing la consumen; ninguna reimplementa la regla.

**Plantillas ≠ base de conocimiento.** Una plantilla HSM es un texto **aprobado por Meta** con
huecos posicionales (`{{1}}`, `{{2}}`). No es contenido editable libremente ni compite con la KB:
su cuerpo lo dicta Meta y cambiarlo exige re-aprobación. El catálogo local es un **espejo** del
estado en Meta, no una fuente de verdad paralela.

## Alcance

Incluye:
- Modelo `WhatsAppTemplate` por tenant, con categoría y estado de aprobación.
- Sincronización del catálogo desde la Graph API de Meta (`GET /{wabaId}/message_templates`).
- Alta de plantillas desde el panel (creación en Meta + persistencia local en `PENDING`).
- Servicio de envío por plantilla con sustitución de variables validada.
- `sendOutbound`: selección automática de modo según la ventana de 24 h.
- Pantalla de administración de plantillas con listado, alta y vista previa.

Fuera de alcance (otros features):
- Envío masivo / campañas de remarketing y su rate limiting → épica M07.
- Recordatorios automáticos por inactividad → `HU-FLOW-02`.
- Plantillas con media en la cabecera (imagen, documento, vídeo) y botones interactivos: el modelo
  las **persiste** si Meta las devuelve, pero el envío en esta spec cubre solo `BODY` con
  parámetros de texto.
- Webhook de cambios de estado de plantilla (`message_template_status_update`) → mejora posterior;
  aquí el estado se refresca con la sincronización manual.

## Criterios de aceptación

1. `GET /api/templates` lista las plantillas del tenant con `name`, `language`, `category` y
   `status` de aprobación, paginado según `docs/api-contract.md` §Paginación.
2. `POST /api/templates/sync` consulta la Graph API con las credenciales del tenant y deja el
   catálogo local reflejando el estado real en Meta: crea las nuevas, actualiza el `status` de las
   existentes y marca como obsoletas las que Meta ya no devuelve.
3. `POST /api/templates` crea una plantilla en Meta y la persiste localmente con `status: PENDING`.
   Si Meta rechaza la creación, no queda ningún documento local huérfano.
4. `POST /api/messages/template` envía una plantilla aprobada a un cliente sustituyendo sus
   parámetros. El mensaje se persiste como `Message` con `tipo: 'template'` y `sender: 'bot'`.
5. Enviar una plantilla cuyo `status` no sea `APPROVED` falla con `AppError` 422 y **no** llega a
   llamar a la Graph API.
6. Enviar una plantilla con un número de parámetros distinto al que declara su cuerpo falla con
   `AppError` 400 antes de llamar a la Graph API, indicando cuántos se esperaban.
7. `sendOutbound(tenantId, clienteId, contenido)` elige el modo según
   `cliente.ventana24hExpiraEn`: dentro de la ventana envía texto libre; fuera de ella envía la
   plantilla indicada. Si está fuera de la ventana y no se aportó plantilla, lanza `AppError` 422
   con el mensaje actual. `sendMessage` pasa a delegar en ella y la bandeja no cambia de
   comportamiento.
8. Los envíos por plantilla consumen la cuota del plan igual que cualquier otro outbound
   (`assertWithinQuota` / `incrementUsage`, `message.service.ts:29,62`).
9. La pantalla de administración lista las plantillas por estado y categoría, permite darlas de
   alta y muestra una **vista previa** del cuerpo con los parámetros de ejemplo sustituidos.
   Terminada en light y dark con los tokens semánticos del proyecto.
10. **Aislamiento multi-tenant:** toda lectura y escritura de `WhatsAppTemplate` pasa por el
    repositorio tenant-safe. Una plantilla creada bajo el tenant A no es legible, editable ni
    enviable desde el tenant B; existe un test que lo demuestra, incluyendo el caso de dos tenants
    con plantillas del **mismo `name` y `language`**.
11. `pnpm --filter backend typecheck` en verde, `pnpm --filter backend test` en verde y
    `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.

## Dependencias

- `HT-WA-01-V2` — sin el canal operativo no hay forma de verificar un envío real.
- `HT-WA-01` (liberado) — aporta `MetaIntegration`, `getIntegrationWithToken` y el cliente Graph.
- `HU-SAAS-02` (implementado) — aporta la cuota de `mensajesMes`.

## Nota de trazabilidad

Corresponde a la parte de plantillas HSM del módulo **M01/M07** de `docs/product.md` §5, declarada
fuera de alcance en `docs/specs/HT-WA-01-whatsapp-base/spec.md:33`.
