# HU-OMNI-01 — Bandeja única de WhatsApp (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Es el corazón del módulo **M01 — Bandeja Omnicanal** (Fase 1): donde el asesor
> vive su día a día.

**Estado:** implementado

## Objetivo

Construir la **bandeja única de WhatsApp en tiempo real**: una lista de conversaciones ordenada por
recencia (con previsualización y no leídos) y un hilo de mensajes por conversación donde el asesor
responde dentro de la ventana de 24 h. Los mensajes entrantes aparecen **en vivo sin recargar**
(Socket.IO). Se apoya en HT-WA-01 para enviar/recibir y en INF-02 para el aislamiento multi-tenant.

Una "conversación" **no es una colección nueva**: es un `Cliente` (cabeza del hilo, ordenado por
`ultimoMensajeAt`) más sus `messages` agrupados por `clienteId`. Este feature expone ese modelo
implícito como el recurso `/api/conversations` y le añade dos campos de bandeja al `Cliente`.

## Alcance

Incluye:
- Recurso REST `/api/conversations` respaldado por `Cliente` + `Message`:
  - `GET /conversations` — lista paginada, ordenada por `ultimoMensajeAt` desc, con preview del
    último mensaje, contador de no leídos y filtros de bandeja (`todos | mios | sin_asignar | sofi`).
  - `GET /conversations/:id/messages` — hilo completo paginado (`{ tenantId, clienteId, createdAt }`).
  - `POST /conversations/:id/messages` — responder; reutiliza `sendMessage` de HT-WA-01 (ventana 24 h).
  - `PATCH /conversations/:id/read` — marcar como leída (resetea `noLeidos`).
  - `PATCH /conversations/:id/ia` — activar/desactivar el toggle de Sofi (`iaHabilitada`).
- Dos campos net-new en `Cliente` (ver `docs/data-model.md` → `clientes`):
  `noLeidos: number` (default `0`) e `iaHabilitada: boolean` (default `true`).
- **Gateway Socket.IO** en el proceso web: `http.createServer(app)`, autenticación por JWT (cookie),
  rooms por `tenant:<tenantId>` y `asesor:<asesorId>`; eventos `message:new` y `conversation:updated`.
- **Puente Redis worker→web:** el worker `inbound-messages` publica el evento tras persistir el
  entrante; el proceso web lo recibe (pub/sub) y lo emite al room del tenant.
- Toggle **Sofi** por conversación: persiste/lee `iaHabilitada` y alimenta el filtro "Sofi activa".
- UI de bandeja de **dos paneles** (lista + hilo) con composer, aviso de ventana 24 h cerrada,
  indicadores de no leídos y estado de entrega, suscripción al websocket, en **light y dark** con
  los tokens semánticos del proyecto (shadcn/ui, DSN-03).
- Submenú del sidebar bajo Inbox: `Todos` · `Míos` · `Sin asignar` · `Sofi activa` (iconos lucide).

Fuera de alcance (otros features / fases):
- **Auto-reply conversacional real de Sofi** (`generateReply` de Gemini) → Fase 3 (M06). Aquí solo
  el flag + UI + filtro, con el hook documentado.
- Instagram y Messenger (normalización multicanal) → posterior a M01.
- Plantillas HSM proactivas y campañas → `M07` (Fase 3).
- Tablero Kanban / cambio de `estadoComercial` desde la bandeja → `M02`.
- Adjuntos salientes / subida de media a DO Spaces.

## Criterios de aceptación

1. `GET /api/conversations` (rol `coordinador`+`asesor`) devuelve `{ data, page, limit, total }`
   ordenado por `ultimoMensajeAt` desc; cada item trae `preview` (último mensaje), `noLeidos`,
   `asesorId`, `iaHabilitada` y datos del cliente. El filtro `?filtro=mios|sin_asignar|sofi|todos`
   segmenta correctamente (`mios` = `asesorId` del token; `sin_asignar` = `asesorId` nulo;
   `sofi` = `iaHabilitada true`).
2. `GET /api/conversations/:id/messages` devuelve el hilo completo paginado; `POST .../messages`
   envía la respuesta reutilizando `sendMessage` de HT-WA-01 y **lanza `AppError(…, 422)` fuera de
   la ventana de 24 h** (`ventana24hExpiraEn` vencida o ausente).
3. `PATCH /api/conversations/:id/read` pone `noLeidos = 0` en la conversación del tenant y emite
   `conversation:updated`. `PATCH /api/conversations/:id/ia` actualiza `iaHabilitada` del tenant y
   emite `conversation:updated`.
4. Al procesar un entrante, el worker incrementa `noLeidos`, refresca `ultimoMensajeAt`/ventana y
   **publica `message:new`**; el cliente web suscrito lo recibe y **la bandeja se actualiza en vivo
   sin recargar** (lista reordenada + hilo si está abierto).
5. El gateway Socket.IO autentica con el JWT de la cookie y une el socket **solo** a los rooms de
   su `tenantId` (y su `asesorId`); un socket de `tenantB` **nunca** recibe eventos de `tenantA`.
6. La UI funciona en **light y dark** usando exclusivamente tokens semánticos (cero colores
   arbitrarios `bg-[#...]`, per INF-03), con el composer mostrando el aviso cuando la ventana está
   cerrada e indicadores de no leídos y `status` de entrega (`sent|delivered|read|failed`).
7. El submenú del sidebar (`Todos`/`Míos`/`Sin asignar`/`Sofi activa`) navega a la bandeja con el
   filtro correspondiente y respeta los guards de rol (`coordinador`+`asesor`).
8. **Test de aislamiento:** un `Cliente`/`Message` de `tenantA` no es accesible por
   `/api/conversations*` con el token de `tenantB` (lista, hilo, envío y read devuelven vacío/404);
   toda query pasa por el repositorio `*Scoped` y cualquier agregación hace `$match { tenantId }`
   primero (no hay helper de aggregate scoped).
9. `tsc --noEmit` (backend) en verde y `pnpm --filter frontend build && lint` sin errores.

## Dependencias

- `HT-WA-01` (conexión WhatsApp: `sendMessage`, `saveMessage`, ventana 24 h, `status` de entrega).
- `INF-02` (repositorio `*Scoped`, `requireTenant`, `tenantId` del token).
- `AUTH-01` (emisión de JWT en cookie, roles) — el gateway Socket.IO reutiliza ese token.
- `DSN-03` (UI kit shadcn/ui + App Shell + sidebar) e `INF-03` (tokens de color light/dark).
