# HT-WA-03 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden sobre `feat/HT-WA-03`. Marca cada casilla al terminar. No cierres el
> feature hasta que TODO esté en verde.
>
> **Base auditada.** El código de partida ya está en el working tree (diff previo sin commitear).
> `[x]` = auditado y conforme con el `spec`; `[ ]` = corrección o verificación pendiente.

## Implementación — backend (patrón de 6 archivos + montaje)

- [x] `config/env.ts`: `META_APP_ID` opcional + `vitest.config.ts` con su valor de test. (CA-7)
- [x] `channel.types.ts`: `pinEnc?`, `displayPhoneNumber?`, `verifiedName?`, `IEmbeddedSignupDto`,
      `IChannelStatusResponse` ampliado. (CA-1)
- [x] `channel.model.ts`: `pinEnc` con `select:false`, sin índices nuevos. (CA-2, CA-14)
- [x] `channel.validation.ts`: `embeddedSignupSchema` (`.strict()`) y `activateSchema` (`pin` de 6
      dígitos opcional). (CA-7)
- [x] `integrations/meta/meta-onboarding.client.ts`: `exchangeCode`, `subscribeApp`, `registerPhone` y
      `getPhoneInfo`, que traducen los errores de Meta a `AppError` (400/422/429/502/503). (CA-1…3, CA-5)
- [ ] `meta-onboarding.client.ts`: helper `fetchGraph` con `AbortSignal.timeout(15 s)` en las cuatro
      llamadas; el timeout va al log con el paso y sale como `metaUnavailable()` (502), y `getPhoneInfo`
      sigue sin lanzar. (CA-10)
- [x] `channel.service.ts`: `persistIntegration` (E11000 → 409), `connectViaEmbeddedSignup` (persistir
      con `activo:false` antes de activar), `activateChannel` (PIN: el que llega, luego el guardado,
      luego uno nuevo; sonda de tier en `try/catch`). (CA-1…6)
- [ ] `channel.service.ts`: en `persistIntegration`, lectura **scoped** del canal propio. Si el
      `phoneNumberId` cambia: `$unset` de `pinEnc`, `displayPhoneNumber` y `verifiedName`, y se
      restablecen `qualityRating`, `healthStatus` y `tierSyncedAt` (y `messagingTier` solo si
      `!tierManual`). Con el mismo número no se toca nada. (CA-9)
- [x] `channel.controller.ts`: `embeddedSignupController` y `activateController`, delgados y con el
      `tenantId` desde `req.user!.tenantId`. (CA-14)
- [x] `channel.routes.ts`: `POST /embedded-signup` y `POST /activate` con
      `authenticateJWT → requireTenant → authorize(['admin']) → validate → asyncHandler`. (CA-7, CA-14)
- [x] Montaje: `app.ts` ya monta `/api/channels/whatsapp`.

## Implementación — frontend

> Regla 7 del `CLAUDE.md`: **antes** de tocar componentes, invocar `emil-design-eng`,
> `impeccable:impeccable` y `frontend-design:frontend-design`, y aplicar sus criterios.

- [x] `vite-env.d.ts`: `VITE_META_APP_ID`, `VITE_META_CONFIG_ID`, `VITE_META_GRAPH_VERSION`.
- [x] `lib/facebook-sdk.ts`: carga perezosa y única, con reintento si el script falla.
- [x] `features/channels/api.ts` + `index.ts`: `connectEmbeddedSignup` y `activateWhatsApp` (timeout de 45 s).
- [x] `hooks/useChannelStatus.ts` (404 → `null`) y `hooks/useEmbeddedSignup.ts` (fases, unión de code e
      ids, filtro de origen, CANCEL sin error, 422 → fase `pin`). (CA-8)
- [x] Componentes `ConnectWhatsAppPanel`, `SignupSteps`, `PinForm`, `ManualConnectForm` y
      `ChannelStatusPanel`. (CA-8)
- [ ] `ChannelStatusPanel.tsx`: «Cambiar de número» abre `AlertDialog` (`components/ui/alert-dialog.tsx`),
      que avisa de la pérdida temporal del canal, y la acción de confirmar llama a `onReconectar()` de forma
      síncrona. (CA-11)
- [ ] `ChannelConfigPage.tsx`: «Reintentar» con `<Button variant="link">` de shadcn. (CA-12)
- [ ] Revisar la pantalla en light y dark con los tokens semánticos (sin colores arbitrarios). (CA-12)
- [ ] Borrar `apps/frontend/src/features/channels/.impeccable/` y agregar `.impeccable/` a `.gitignore`. (CA-12)

## Tests

### Backend (Vitest + MongoDB Memory Server, Meta mockeado)
- [x] `channel.isolation.test.ts`: B no ve el canal de A; `activate` de B sin canal → 404 sin usar el
      token de A; conectar B no pisa ni hereda el token o el PIN de A. (CA-14)
- [x] `channel.routes.test.ts`: 200 sin secretos; `accessToken` colado → 400; sin `code` → 400; PIN de
      5 dígitos → 400; `/activate` sin canal → 404; otro rol → 403. (CA-1, CA-6, CA-7)
- [x] `channel.embedded-signup.test.ts`: flujo feliz; `pin_required` y luego `activate`; reutiliza el
      PIN guardado; code caducado → 400 sin documento; 409 (ES y manual); sonda de tier caída;
      `getPhoneInfo` nulo. (CA-1…6)
- [ ] `channel.embedded-signup.test.ts`: reconectar con **otro** número no envía el PIN viejo a
      `registerPhone` y no conserva `verifiedName` ni `displayPhoneNumber` del anterior; con el
      **mismo** número se reutiliza el PIN. (CA-9)
- [ ] `channel.embedded-signup.test.ts` (o un test unitario del cliente): un `fetch` que vence → 502. (CA-10)
- [ ] Agregar casos: `133008` → 429 y sin `META_APP_ID` → 503. (CA-2, CA-7)

### Frontend (Vitest + Testing Library)
- [x] `ChannelConfigPage.test.tsx`: sin canal invita a conectar; junta code e ids y muestra el número;
      ignora orígenes ajenos; PIN solo ante 422; cerrar el popup no da error; canal a medias ofrece
      activar. (CA-8)
- [ ] `ChannelConfigPage.test.tsx`: «Cambiar de número» muestra la confirmación, cancelar **no** llama
      a `FB.login` y confirmar **sí** lo llama. (CA-11)

## Documentación

- [x] `docs/data-model.md`: campos nuevos de `MetaIntegration`.
- [ ] `docs/integrations/meta-whatsapp.md` §2: timeout por llamada y comportamiento al cambiar de
      número (limpieza + `activo:false` si falla). (CA-9, CA-10)

### Modelo Tech Provider (CA-13) — sin tocar `CLAUDE.md` ni `AGENTS.md`
- [ ] `docs/adr/0010-modelo-tech-provider.md` (Estado · Fecha · Contexto · Decisión · Alternativas ·
      Consecuencias, con el contenido de `plan.md` §Notas) + fila en `docs/adr/README.md`.
- [ ] `docs/integrations/meta-whatsapp.md`: título e intro con "Tech Provider"; quitar «El estado de
      Tech Provider/BSP de Meta lo provee el cliente»; agregar la subsección **«Quién paga a Meta»**
      (tenant directo, SofiApp cobra su plan, Solution Partner como evolución futura → ADR 0010) y lo
      que necesita cada tenant (sin coexistencia: el número sale de la app del celular).
- [ ] `docs/product.md:12` y `docs/domain.md:12`: "BSP" → "Tech Provider".
- [ ] `docs/data-model.md:102`: «conexión Tech Provider por tenant».
- [ ] `README.md` líneas 5, 68 y 172: "BSP" → "Tech Provider".

## Verificación final

- [ ] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [ ] `pnpm --filter @sofiapp/api test` en verde (incluye aislamiento).
- [ ] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` sin errores.
- [ ] `pnpm --filter @sofiapp/web test` en verde.
- [ ] Checklist de PR de `docs/multi-tenancy.md` §9 revisado:
  - [ ] Toda query usa `*Scoped` (incluida la nueva lectura de CA-9).
  - [ ] `tenantId` solo del token.
  - [ ] Sin modelos nuevos (no aplica `tenantId` required nuevo).
  - [ ] Rutas nuevas con `requireTenant` tras `authenticateJWT`.
  - [ ] Test de aislamiento presente.
- [ ] `grep -rn "BSP" docs README.md` solo devuelve menciones al modelo **futuro** (Solution Partner),
      y `git status` no muestra cambios en `CLAUDE.md` ni `AGENTS.md`. (CA-13)
- [ ] `git status` sin `*.png`/`*.jpg` ni artefactos ajenos (`.impeccable/`) antes de commitear.
- [ ] El usuario verifica en real el popup de Meta (no se hace verificación visual automatizada).
- [ ] `spec.md` → `**Estado:** implementado`.

## Definición de "hecho"

El admin de cualquier tenant conecta su número de WhatsApp con un clic desde
`/settings/channels/whatsapp` y queda operativo: suscrito, registrado y visible con su nombre, sin
ver tokens ni PIN. Cambiar de número es explícito y no arrastra datos del anterior. La
documentación deja claro que SofiApp opera como **Tech Provider**: cada tenant le paga su consumo a
Meta y SofiApp cobra su plan. Los tenants siguen aislados y la suite completa (backend y frontend)
está en verde.
