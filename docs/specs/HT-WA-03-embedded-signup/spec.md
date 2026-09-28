# HT-WA-03 — Conexión de WhatsApp por Embedded Signup

**Estado:** implementado

## Qué

Que el admin de un tenant conecte su WhatsApp Business desde `/settings/channels/whatsapp` pulsando
**«Conectar con Facebook»**, elija su WABA y su número en el popup de Meta y quede operativo **sin ver
IDs, tokens ni PIN**. Hasta ahora había que pegar a mano WABA ID, Phone Number ID y un token, lo que
sirve para el sandbox pero no para operar como BSP.

### El flujo real de Meta (no el que se asume a menudo)

El Embedded Signup **no entrega un access token al navegador**:

```
Frontend                                   Meta                         Backend
  FB.login({ config_id, response_type:'code' }) ───────▶ popup
  ◀── postMessage WA_EMBEDDED_SIGNUP { FINISH, waba_id, phone_number_id }
  ◀── authResponse.code  (un solo uso, ~30 s)
  POST /api/channels/whatsapp/embedded-signup { code, wabaId, phoneNumberId } ──────────▶
                                              GET /oauth/access_token (client_secret) ◀─ canje
                                              persistir token cifrado (activo:false)
                                              POST /{wabaId}/subscribed_apps          ◀─ webhooks
                                              POST /{phoneNumberId}/register { pin }   ◀─ Cloud API
                                              activo:true · sonda de tier (best-effort)
```

El token nunca pasa por el navegador, y el canje exige `META_APP_SECRET`, que solo vive en el backend.

## Decisiones

1. **Canje del `code` en el backend.** El contrato `{ wabaId, phoneNumberId, accessToken }` que se
   usaba se queda solo para la conexión manual.
2. **Suscripción automática** de la app a la WABA. Sin ella, los mensajes entrantes nunca llegan al
   webhook.
3. **Registro del número con un PIN generado por el backend** (6 dígitos, `crypto.randomInt`), que se
   guarda cifrado (`pinEnc`, `select:false`) para poder reactivar más adelante. Solo se pide un PIN a
   la persona si Meta responde que el número ya tenía verificación en dos pasos con otro PIN (422,
   `reason: 'pin_required'`).
4. **Token persistido antes de los pasos que pueden fallar.** El `code` se consume al canjearlo: si la
   suscripción o el registro fallan, la integración queda `activo:false` pero con el token guardado, y
   `POST /activate` reintenta sin volver a abrir el popup.
5. **Sonda de tier al conectar**, sin bloquear. Si Meta no responde, la conexión sigue siendo válida.
6. **Número ya conectado a otra empresa → 409.** Hoy el índice único de `phoneNumberId` producía un
   500 opaco. Se detecta el E11000 **sin hacer una lectura global** entre tenants.
7. **La conexión manual se conserva** plegada como opción avanzada, para el sandbox y soporte.
8. `META_APP_ID` es **opcional** en el env: sin ella el resto de la app arranca y el endpoint responde
   503 «Embedded Signup no configurado».

## Criterios de aceptación

- [x] `POST /api/channels/whatsapp/embedded-signup` canjea el code, guarda el token cifrado, suscribe
      la WABA, registra el número y devuelve el estado con `activo:true`. La respuesta no incluye ni
      token ni PIN.
- [x] Si el número tiene 2FA con otro PIN → 422 `{ reason: 'pin_required' }`, la integración queda
      `activo:false` con el token, y `POST /activate { pin }` termina la activación.
- [x] Un code inválido o caducado → 400 y ningún documento creado.
- [x] `phoneNumberId` de otro tenant → 409, tanto en Embedded Signup como en la conexión manual.
- [x] Si la sonda de tier falla, la conexión no se rompe.
- [x] Aislamiento: el tenant B no ve ni activa la integración de A; `activate` sin canal → 404.
- [x] Validación: PIN distinto de 6 dígitos → 400; campos extra → 400; rol distinto de admin → 403.
- [x] UI: CTA «Conectar con Facebook», progreso en línea, estado conectado con número y nombre
      legibles, campo de PIN en línea solo ante el 422, cancelar el popup no muestra error, y formulario
      manual plegado. Todo en shadcn, light y dark.

## Tasks

### Backend
- [x] `META_APP_ID` opcional en `config/env.ts` + `vitest.config.ts`.
- [x] Modelo/tipos: `pinEnc` (`select:false`), `displayPhoneNumber`, `verifiedName`; estado ampliado.
- [x] Cliente `integrations/meta/meta-onboarding.client.ts`: `exchangeCode`, `subscribeApp`,
      `registerPhone` y `getPhoneInfo`, con traducción de errores de Meta a `AppError`.
- [x] Service: `persistIntegration` (E11000 → 409), `connectViaEmbeddedSignup`, `activateChannel`.
- [x] Validación, controllers y rutas `POST /embedded-signup` y `POST /activate`.
- [x] Tests: `channel.embedded-signup.test.ts`, `channel.isolation.test.ts` y
      `channel.routes.test.ts`.

### Frontend
- [x] Env `VITE_META_APP_ID`, `VITE_META_CONFIG_ID`, `VITE_META_GRAPH_VERSION` tipadas.
- [x] `lib/facebook-sdk.ts` (carga perezosa y única del SDK).
- [x] `features/channels/useEmbeddedSignup.ts` (máquina de estados + escucha de `postMessage`).
- [x] `api.ts` ampliado.
- [x] Componentes `ConnectWhatsAppPanel`, `SignupSteps`, `ChannelStatusPanel`, `PinForm`,
      `ManualConnectForm`; reescritura de `ChannelConfigPage` + `ChannelConfigPage.test.tsx`.

### Docs
- [x] `docs/integrations/meta-whatsapp.md` §2 y §8.
- [x] `docs/data-model.md` (campos nuevos de `MetaIntegration`).

## Ajustes durante la implementación

- **PIN en línea, no en modal.** El campo aparece bajo el paso 3 de la misma lista: es la
  continuación de ese paso, y un modal habría cortado el flujo. Incluye la salida «Ya la desactivé,
  activar» para quien no tenga el PIN y haya quitado la 2FA en WhatsApp Manager.
- **La sonda de tier se espera**, pero con `try/catch`: así la respuesta ya trae el tier real, y si
  falla se devuelve el canal activo con los valores conservadores.
- **Timeout de 45 s** en `embedded-signup` y `activate` (el `apiClient` usa 10 s): son varias
  llamadas seguidas a la Graph API.
- **La lista de pasos se vuelve el indicador de progreso**: en reposo explica qué va a pasar y
  durante la conexión marca en qué punto va.

## Prerrequisitos en Meta (los configura el operador de SofiApp, no el tenant)

- App de Meta con estado **Tech Provider** y el producto WhatsApp.
- Una configuración de **Facebook Login for Business** del tipo *WhatsApp Embedded Signup*. Su id es
  `VITE_META_CONFIG_ID`.
- Dominios permitidos del SDK de JS: `localhost` (dev) y el dominio de Vercel. Login with the
  JavaScript SDK = Yes.
- Permisos `whatsapp_business_management` y `whatsapp_business_messaging`.
