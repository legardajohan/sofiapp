# HU-IA-04 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde.
>
> Se trabaja **sobre `feat/HU-IA-01`**, sin rama nueva. No ejecutar `git checkout -b`.
>
> El feature `conversation` **ya existe**: se sigue el orden del patrón de 6 archivos
> (`types → validation → service → controller → routes`) extendiéndolo, sin `model.ts` (una
> conversación es un `Cliente` proyectado) y sin montaje nuevo en `app.ts`.

## 1. Cerrar la fuga donde ya vivía (`cliente.service.ts`)

Va primero: es el bug, y arreglarlo solo en la ruta nueva no arregla nada.

- [x] `toResumenResponse(c, puedeVerSensibles = false)`: devuelve `null` cuando el permiso es falso.
  - [x] **Default `false`**, igual que `toContactCard` y `toDatosExtraidosResponse`: si un tercer
        sitio olvida pasar el permiso, el fallo es ocultar de más, nunca filtrar.
- [x] `getContactHistory` (línea ~220): pasar `puedeVerSensibles` a `toResumenResponse`.
- [x] Verificar que no queda ningún otro sitio proyectando `resumenIA`:
      `grep -rn "resumenIA\|toResumenResponse" apps/backend/src --include=*.ts`.

## 2. Tipos (`conversation.types.ts`)

- [x] `IPermisosConversacion`: `verResumen`, `generarResumen`, `verSensibles`.
      Tres campos aunque hoy valgan lo mismo — el día que se separen, el frontend no cambia.
- [x] `IConversationOverviewResponse`: `{ conversation, resumen, permisos }`.
- [x] Importar `IResumenResponse` de `cliente.types.ts` en vez de declarar un gemelo.
- [x] Comentar por qué el hilo **no** está en el DTO (pagina y llega por tiempo real).

## 3. Validación (`conversation.validation.ts`)

- [x] `overviewSchema` = `{ body: empty, params: { id: objectId }, query: empty }`, molde de `readSchema`.

## 4. Service (`conversation.service.ts`)

- [x] `getConversationOverview(tenantId, clienteId, puedeVerSensibles): Promise<IConversationOverviewResponse>`.
  - [x] `findByIdScoped(Cliente, tenantId, clienteId).lean()` → 404 `'Conversación no encontrada.'`.
        **NUNCA** `Model.findById` directo: es lo que da el aislamiento del criterio 14.
  - [x] Reutilizar `resolveAsignado` / `resolveTags` / `resolveLeadMap` + `toConversationResponse`
        (las etiquetas ya vienen hidratadas desde HU-OMNI-04; no añadir una segunda consulta).
  - [x] `resumen: puedeVerSensibles ? toResumenResponse(cliente, true) : null`.
  - [x] `permisos` con los tres campos derivados de `puedeVerSensibles`.
  - [x] **No** genera nada: es una lectura barata.

## 5. Controller (`conversation.controller.ts`)

- [x] `getOverviewController`: `tenantId` de `req.user!.tenantId!`, permiso de
      `puedeVerDatosSensibles(req.user!)`. Sin `try/catch`, sin lógica, sin Mongoose.
- [x] El permiso se resuelve **aquí** y se pasa al service: el service no conoce `req`.

## 6. Routes (`conversation.routes.ts`)

- [x] `GET /:id/overview` con `authenticateJWT, requireTenant, bandejaRoles, validate(overviewSchema), asyncHandler(...)`.
- [x] **Sin `authorizeSubrol`** en esta ruta: cerrar la vista entera dejaría a `coordinator` y
      `secretary` sin cabecera ni etiquetas, que sí les corresponden. El gate va por campo.
- [x] `POST /:id/summary`: añadir `authorizeSubrol(SUBROLES_DATOS_SENSIBLES)` **después** de
      `bandejaRoles`. Aquí sí por ruta: no hay respuesta parcial y cada llamada paga 7-26 s de modelo.
- [x] Importar `authorizeSubrol` y `SUBROLES_DATOS_SENSIBLES` de `authorize-subrol.middleware.js`.
- [x] **Montaje: ninguno.** `conversationRoutes` ya está en `app.ts` bajo `/api/conversations`.

## 7. Enmienda a ADR-0006

- [x] Añadir la sección «Enmienda (HU-IA-04)» a `docs/adr/0006-subrol-datos-sensibles.md` con el
      texto del `plan.md`: el resumen se suma al conjunto, gate por campo + por ruta en la generación,
      y por qué `overview` **no** se cierra entero a diferencia de las notas.

## 8. Frontend — datos

- [x] `features/inbox/types.ts`: `PermisosConversacionDTO` y `ConversationOverviewDTO`.
- [x] `features/inbox/api.ts`: `fetchConversationOverview(id)`.
      **Ruta SIN el prefijo `/api`** — lo aporta el `baseURL` del `apiClient`.
- [x] `features/inbox/hooks/useConversationOverview.ts` (crear): `useQuery(['conversation-overview', id])`,
      con `enabled` sobre un `id` no nulo.
- [x] `hooks/useContactHistory.ts`: `useGenerateSummary` invalida **también**
      `['conversation-overview', clienteId]`, o la tira sigue mostrando el resumen viejo.
- [x] `hooks/useInboxRealtime.ts`: invalidar `['conversation-overview', id]` en `conversation:updated`.

## 9. Frontend — la tira

> Antes de escribir el componente, invocar las tres skills de diseño (regla §7) y anotar el resultado.

- [x] Invocar `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`.
      **En este entorno solo la tercera está registrada**; las otras dos devuelven `Unknown skill`.
      Se invocan igualmente y sus criterios se aplican desde conocimiento propio.
- [x] `components/ConversationSummaryStrip.tsx` (crear), con los cuatro estados:
  - [x] **Con resumen**: `line-clamp-2` + «Ver más»; expandida muestra el texto completo y la marca
        de tiempo; `Desactualizado` como `Badge`, igual que en `ContactSummaryCard`.
  - [x] **Sin resumen**: invitación + botón «Generar resumen».
  - [x] **Sin permiso**: `MOTIVO_DATOS_SENSIBLES` con icono de candado y **sin** botón de generar.
  - [x] **Generando**: skeleton de dos líneas con `aria-busy`, molde de `ContactSummaryCard`.
  - [x] Tokens **neutros** (`bg-muted/40`, `text-secondary-foreground`); el único acento es el
        `Sparkles` que ya identifica a la IA. La tira acompaña al hilo, no compite con él.
  - [x] `aria-expanded` en el control de «Ver más»; `motion-reduce` en el chevron.
  - [x] Sin animación de altura: un salto de layout justo encima del hilo es peor que un cambio seco.
- [x] `useInboxStore.ts`: recordar el estado expandido **por conversación** (no global): quien abre
      uno suele querer leer varios seguidos.
- [x] `pages/InboxPage.tsx`: montar la tira **entre** la franja de etiquetas y el hilo.
  - [x] Se pinta aunque no haya etiquetas: es una de las tres piezas del AC1, no un accesorio.
- [x] Terminar en **claro y oscuro** con tokens semánticos; cero `bg-[#...]`.

## 10. Frontend — coherencia y limpieza

- [x] `components/ContactPanel.tsx`: **eliminar el `ConversationThread` duplicado** del final del
      panel (hallazgo 6). Anotar en el código que `history.mensajes` ya no se pinta.
- [x] `components/ContactSummaryCard.tsx`: prop `puedeVer: boolean`; con `false`, mismo motivo que la
      tira y sin botón. Si la ficha ofreciera generar lo que la tira dice que no puede ver, el
      usuario recibiría un 403 sin entender por qué.
- [x] `ContactPanel` pasa el permiso a `ContactSummaryCard` desde `permisos` del overview (o desde
      `history.contacto.puedeVerSensibles`, que ya viaja y vale lo mismo).

## Tests (Vitest)

- [x] `features/conversation/conversation.overview.test.ts` (crear):
  - [x] Devuelve `conversation` con las etiquetas hidratadas y `resumen` cuando hay permiso (AC4).
  - [x] `resumen: null` cuando no se ha generado nunca, con permiso (distinguir de "sin permiso").
  - [x] **`subrol: 'coordinator'` → `resumen: null` y `permisos.verResumen: false`** (AC7).
  - [x] `subrol: 'director'` y `subrol: 'manager'` → resumen poblado y `verResumen: true`.
  - [x] **`admin` sin `subrol` → resumen poblado** (AC10). Es la regla vigente de ADR-0006.
  - [x] `permisos` coherente con el cuerpo: nunca `verResumen: true` con `resumen: null` por permiso.
  - [x] El DTO **no** trae el hilo (AC5).
  - [x] **AISLAMIENTO:** el `overview` de una conversación de tenantA responde 404 con tenantB (AC14).
- [x] `features/cliente/cliente.service.test.ts` (extender):
  - [x] **`GET /clientes/:id/history` oculta el resumen a `coordinator`** (AC8). Sin este test, la
        historia cierra la puerta nueva y deja la vieja abierta.
  - [x] Con permiso, el resumen sigue llegando igual que antes (regresión de HU-OMNI-03).
- [x] `features/conversation/` — rutas (supertest, extender el archivo que corresponda):
  - [x] `POST /conversations/:id/summary` → **403** con `subrol: 'coordinator'` y con `'secretary'` (AC9).
  - [x] → 200 con `'director'`, `'manager'` y con un `admin` sin subrol.
  - [x] `GET /:id/overview` → 200 para los cuatro subroles (la vista no se cierra a nadie).
  - [x] Sin token → 401; rol que no es `admin` → 403.
- [x] `features/inbox/components/ConversationSummaryStrip.test.tsx` (crear):
  - [x] Con permiso y resumen → muestra el texto recortado y el control «Ver más»; al pulsarlo se ve
        entero (AC2).
  - [x] Con permiso y sin resumen → ofrece generarlo (AC3).
  - [x] **Sin permiso → muestra el motivo y NO el botón de generar** (AC11).
  - [x] `desactualizado: true` → se ve el `Badge`.
- [x] `features/inbox/components/ContactPanel.test.tsx` (extender):
  - [x] La ficha **no** renderiza un segundo hilo de mensajes (AC13).

## Verificación final

> Filtros reales de pnpm: `@sofiapp/api` y `@sofiapp/web`. Los nombres `backend`/`frontend` del
> `CLAUDE.md` raíz no matchean ningún paquete y pnpm no ejecuta nada.

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores (AC15).
- [x] `pnpm --filter @sofiapp/api test` -> **699 pasan, 78 archivos, cero fallos** (eran 671/76:
      +28 tests). Dos tests de HU-OMNI-03 se actualizaron: llamaban a `getContactHistory` sin
      permiso y el gate nuevo los hizo fallar -- exactamente lo que tenia que pasar.
- [x] `pnpm --filter @sofiapp/web build`, `lint` y `test` sin errores (AC16).
      `test` -> **538 pasan, 30 archivos** (eran 528/29).
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado: cero `Model.find/findById` directos,
      `tenantId` siempre del token, test de aislamiento presente.
- [x] Repaso cruzado: cada criterio del `spec.md` tiene su test o su check manual aquí.
- [x] `git status` sin `*.png`/`*.jpg` de verificación colados.

### Manual (requiere sembrar `subrol` en base de datos: no hay UI para asignarlo)

> **Pendientes.** Ningun usuario tiene `subrol` en este entorno y no existe CRUD para asignarlo
> (ADR-0006, Consecuencias), asi que estos checks necesitan sembrarlo a mano. El camino completo
> si esta cubierto por tests automaticos, incluidos los cuatro subroles y el `admin` sin subrol.

- [ ] `subrol: 'director'` → la tira muestra el resumen, «Ver más» lo expande, «Regenerar» funciona.
- [ ] `subrol: 'coordinator'` → la tira muestra el motivo sin botón; hilo y etiquetas se ven igual;
      `POST /conversations/:id/summary` por API devuelve 403.
- [ ] Sin `subrol` → todo visible, como antes de esta historia.
- [ ] Con la ficha del contacto desplegada, la conversación aparece **una** sola vez.

## Definición de "hecho"

Un `director` abre una conversación y ve, sin tocar nada: quién es, sus etiquetas, un resumen de dos
líneas que puede expandir, y el hilo. Un `coordinator` ve lo mismo salvo el resumen, en cuyo lugar
lee por qué no puede verlo, y recibe 403 si intenta generarlo por API — también desde el endpoint
antiguo de la ficha. Un `admin` sin subrol sigue viéndolo todo. La conversación se pinta una sola
vez, y ningún `overview` cruza la frontera entre dos tenants.
