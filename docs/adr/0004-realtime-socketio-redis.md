# ADR 0004 — Transporte de tiempo real (Socket.IO + puente Redis pub/sub)

- **Estado:** Aceptada
- **Fecha:** 2026-07
- **Contexto:** La bandeja omnicanal (HU-OMNI-01, módulo M01) necesita que los mensajes entrantes
  aparezcan en vivo, sin recargar. SofiApp corre en **dos procesos** sobre el mismo código de
  dominio: el proceso **web** (Express) atiende las conexiones del navegador, y el proceso
  **worker** (BullMQ) procesa los entrantes de WhatsApp (`inbound-message.processor.ts`). El evento
  que hay que empujar al navegador (`message:new`) **nace en el worker**, pero el navegador solo
  está conectado al proceso **web**. Se necesita un puente entre ambos procesos que respete el
  aislamiento multi-tenant.

## Decisión

**El gateway de tiempo real es Socket.IO, hospedado en el proceso web**, y **el puente entre
procesos es Redis pub/sub** (Redis ya existe como broker de BullMQ; `REDIS_URL`).

- `app.ts` deja de hacer `app.listen()` directo: crea un `http.Server` explícito
  (`http.createServer(app)`) para hospedar el `io` de Socket.IO junto a Express.
- **Autenticación del socket:** el handshake reutiliza el mismo JWT de la cookie `token` que las
  rutas REST (`socket.io` middleware que verifica con `JWT_SECRET`). Sin token válido → conexión
  rechazada.
- **Rooms:** cada socket se une a `tenant:<tenantId>` y `asesor:<asesorId>` derivados **del token**,
  nunca del cliente. Todo evento se emite con `io.to('tenant:<id>')` — jamás en broadcast global.
- **Puente:** `realtime.publisher.ts` expone `publishRealtime(evt)` (usado por el worker y por el
  proceso web al responder) que hace `PUBLISH` en el canal Redis `realtime`; el proceso web hace
  `subscribeRealtime(io)` (`SUBSCRIBE`) y reemite cada evento al room del tenant. El `tenantId`
  viaja dentro del evento, de modo que el fan-out queda acotado por tenant.

## Alternativas consideradas

- **Socket.IO Redis adapter oficial (`@socket.io/redis-adapter`):** resuelve el fan-out entre
  múltiples instancias web, pero está pensado para sincronizar *varias instancias del gateway*, no
  para inyectar eventos desde un proceso sin `io` (el worker). Requeriría igualmente publicar al
  canal del adapter. El pub/sub explícito es más simple y transparente para el MVP (una sola
  instancia web). Se puede migrar al adapter cuando haya varias instancias web.
- **Sondeo (polling) desde el frontend:** descarta el "en vivo" real y añade carga; contradice el
  criterio de aceptación de la HU.
- **Emitir directo desde el worker con su propio `io`:** imposible sin exponer un servidor HTTP en
  el worker y sin compartir las conexiones de los navegadores; rompe la separación web/worker.

## Consecuencias

- (+) El worker permanece headless: solo publica en Redis; no conoce sockets ni navegadores.
- (+) Aislamiento multi-tenant preservado: el `tenantId` sale del token en el handshake y acota el
  room de emisión; un socket nunca recibe eventos de otro tenant.
- (+) Reutiliza Redis (ya presente); sin nueva pieza de infraestructura.
- (−) `publishRealtime` es *best-effort* (falla suave y loguea): si Redis cae, se pierde el push en
  vivo, pero la lista se recupera al refetch de TanStack Query. No hay entrega garantizada.
- (−) Con múltiples instancias web habrá que migrar a `@socket.io/redis-adapter` para no duplicar/
  perder emisiones. Documentado como deuda para escalado horizontal.
- Afecta a: `apps/backend/src/realtime/*`, `app.ts`, `inbound-message.processor.ts`,
  `apps/backend/CLAUDE.md` (proceso web = Express + Socket.IO), `docs/api-contract.md` §7.
