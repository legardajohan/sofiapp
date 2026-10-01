# HT-WA-03 — Conexión de WhatsApp por Embedded Signup (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Es la puerta de entrada del modelo **Tech Provider**: cada empresa conecta **su propio** número.

**Estado:** creado

> **Nota de proceso.** Una sesión de planeación previa escribió código antes de tener la tríada. Ese
> código (sin commitear en `feat/HT-WA-03`) se **conserva como base y se audita**: `tasks.md` marca
> lo que ya cumple y lista las correcciones pendientes. El estado vuelve a `creado` hasta que
> `/sdd-implement` cierre esas correcciones y la verificación.

## Objetivo

Que el admin de un tenant conecte su WhatsApp Business desde `/settings/channels/whatsapp` pulsando
**«Conectar con Facebook»**, elija su WABA y su número en el popup de Meta y quede operativo **sin ver
IDs, tokens ni PIN**. Hasta ahora había que pegar a mano WABA ID, Phone Number ID y un token: sirve
para el sandbox, no para operar como Tech Provider (ver `docs/product.md`, M01).

### El flujo real de Meta (no el que se asume a menudo)

El Embedded Signup **no entrega un access token al navegador**. `FB.login` devuelve un `code` de un
solo uso (~30 s) y los ids llegan aparte por `postMessage`:

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

El canje exige `META_APP_SECRET`, que solo vive en el backend: el token nunca pasa por el navegador.

### Modelo con Meta: Tech Provider

| | SofiApp (operador) | Cada tenant |
|---|---|---|
| **Qué tiene en Meta** | **Una** app de Meta con estado **Tech Provider** (`META_APP_ID`, `META_APP_SECRET`, webhook único, `config_id` del Embedded Signup) | Su cuenta de Facebook, su Business Portfolio, su **WABA** y su número |
| **Qué hace en el popup** | — | Inicia sesión con **su** Facebook, crea o elige su WABA y su número, y **autoriza a la app de SofiApp** |
| **Quién paga el consumo de WhatsApp** | Nadie: SofiApp **no** paga ni revende el consumo de Meta | **Meta le factura directamente**, con el método de pago que carga en su WABA |
| **Qué cobra SofiApp** | Su plan SaaS (HU-SAAS-02) | — |

- HT-WA-03 **no** asigna línea de crédito a la WABA: con Tech Provider no existe ese paso.
- Las cuotas de HU-SAAS-02 (`mensajesMes`, catálogo de costos) son límites y costeo **propios** de
  SofiApp. No incluyen el consumo de Meta.
- La facturación centralizada con margen sobre los mensajes exige ser **Solution Partner (BSP)** o
  asociarse con uno. Es una evolución futura, registrada en `docs/adr/0010-modelo-tech-provider.md`.
- Como no hay coexistencia, el número que conecta el tenant **deja de funcionar en la app de WhatsApp
  del celular** y opera solo por la Cloud API (vía SofiApp).

## Alcance

**Incluye**
- Canje del `code` en el backend y persistencia del token cifrado (`MetaIntegration`, una por tenant).
- Suscripción automática de la app a la WABA (`subscribed_apps`) y registro del número en la Cloud
  API con un PIN de 2FA generado por el backend.
- `POST /activate`: reintenta la activación sin volver al popup y recibe el PIN cuando Meta lo pide.
- 409 legible cuando el número ya está conectado a otra empresa (también en la conexión manual).
- Sonda de tier/calidad (HU-MARK-01) al conectar, sin bloquear.
- Reconexión con otro número, con confirmación previa y limpieza de los datos del número anterior.
- UI en shadcn, light y dark, con la conexión manual plegada como opción avanzada.

**Fuera de alcance**
- Desregistrar el número anterior en Meta al cambiar de número.
- Coexistencia con la app WhatsApp Business (`FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` se trata como
  un `FINISH` más, sin flujo propio).
- Instagram / Messenger.
- Refresco o rotación de tokens.
- Gobernar el permiso por `subrol` (ADR-0006 no se amplía).
- Un canal "pendiente" paralelo que mantenga operando el número anterior durante la reconexión.
- Modelo Solution Partner (BSP): línea de crédito compartida, facturación centralizada del consumo de
  Meta, medición del costo de Meta por tenant y reventa con margen.

## Decisiones

1. **Canje del `code` en el backend.** El contrato `{ wabaId, phoneNumberId, accessToken }` queda solo
   para la conexión manual (`POST /connect`).
2. **Suscripción automática** de la app a la WABA: sin ella, los entrantes nunca llegan al webhook.
3. **PIN generado por el backend** (6 dígitos, `crypto.randomInt`), guardado cifrado (`pinEnc`,
   `select:false`) para reactivar. Solo se pide un PIN a la persona si Meta responde que el número ya
   tenía 2FA con otro PIN (422 `reason: 'pin_required'`).
4. **Token persistido antes de los pasos que pueden fallar.** El `code` se gasta al canjearlo: si la
   suscripción o el registro fallan, la integración queda `activo:false` con el token, y `/activate`
   reintenta.
5. **Sonda de tier al conectar, sin bloquear.**
6. **Número de otra empresa → 409**, detectando el E11000 del índice único **sin lectura cross-tenant**.
7. **La conexión manual se conserva**, plegada, para el sandbox y soporte.
8. `META_APP_ID` es **opcional**: sin ella el resto arranca y el endpoint responde 503.
9. **Cualquier `admin` del tenant** puede conectar o cambiar el número (`authorize(['admin'])`,
   `RequireRole(['admin'])`), igual que el resto de `/settings`.
10. **Reconexión: se reemplaza.** Si la activación del número nuevo falla, el canal queda
    `activo:false` (se reintenta con "Termina de activar"). Riesgo aceptado a cambio de no mantener un
    canal pendiente en paralelo; por eso la UI pide confirmación antes.
11. **Tech Provider, por ahora.** Cada tenant le paga a Meta su consumo y SofiApp cobra su plan. Pasar a
    Solution Partner queda como evolución futura, registrada en el ADR 0010. `CLAUDE.md` y `AGENTS.md`
    conservan su redacción ("modelo BSP, tipo Mercately") por decisión del usuario: describen la meta
    de negocio, no el modelo operativo actual.

## Criterios de aceptación

1. `POST /api/channels/whatsapp/embedded-signup { code, wabaId, phoneNumberId }` canjea el code, guarda
   el token cifrado, suscribe la WABA, registra el número y responde 200 con `activo:true`,
   `displayPhoneNumber` y `verifiedName`. La respuesta **no** incluye token ni PIN.
2. Si el número tiene 2FA con otro PIN (Meta `133005`) → 422 `{ reason: 'pin_required' }`; la
   integración queda `activo:false` con el token, y `POST /activate { pin }` termina la activación.
   Si Meta bloquea los intentos (`133008/133009`) → 429.
3. Un code inválido o caducado → 400 y **ningún** documento creado.
4. Un `phoneNumberId` conectado a otro tenant → 409, en Embedded Signup y en `POST /connect`.
5. Si la sonda de tier o la lectura de datos del número fallan, la conexión sigue activa (valores
   conservadores, sin nombre legible).
6. `POST /activate` sin PIN reutiliza el PIN guardado; sin canal → 404.
7. Validación: `pin` distinto de 6 dígitos → 400; campos extra (p. ej. un `accessToken` colado en
   `/embedded-signup`) → 400; sin `code` → 400; rol distinto de `admin` → 403. Sin `META_APP_ID` → 503.
8. UI: CTA «Conectar con Facebook», progreso en línea, estado conectado con número y nombre legibles,
   campo de PIN en línea solo ante el 422, cancelar el popup no muestra error, mensajes de `postMessage`
   de orígenes que no son `https://*.facebook.com` se ignoran, y el formulario manual está plegado.
9. Reconectar con **otro** `phoneNumberId` limpia `pinEnc`, `displayPhoneNumber`, `verifiedName` y los
   campos de tier/calidad/salud (salvo que `tierManual` esté activo, que se conserva), de modo que el
   número nuevo **no** reutiliza el PIN del anterior ni muestra su nombre.
10. Cada llamada a la Graph API del onboarding tiene timeout propio (menor que los 45 s del cliente
    HTTP del frontend). Si vence → 502 con texto legible, y el log registra el paso.
11. «Cambiar de número» pide confirmación (`AlertDialog` de shadcn) avisando que el número actual deja
    de operar hasta activar el nuevo; el popup de Meta se abre en el clic de confirmar.
12. Todo control de la pantalla es de shadcn (sin `<button>` sueltos), se ve prolijo en light y dark, y
    no quedan artefactos de herramientas en el árbol (`.impeccable/hook.cache.json`).
13. **Documentación alineada con Tech Provider**: `README.md`, `docs/product.md`, `docs/domain.md`,
    `docs/data-model.md` y `docs/integrations/meta-whatsapp.md` llaman "Tech Provider" al modelo actual
    (no "BSP"). `meta-whatsapp.md` ya no dice que el estado "lo provee el cliente" y explica quién le
    paga a Meta. Existe `docs/adr/0010-modelo-tech-provider.md`, enlazado en `docs/adr/README.md`.
    `CLAUDE.md` y `AGENTS.md` **no** se modifican.
14. **Aislamiento multi-tenant**: el tenant B no ve, no activa ni hereda el token o el PIN de A; toda
    query pasa por el repositorio `*Scoped` y el `tenantId` nace del token. Tests de aislamiento en
    verde, `tsc --noEmit` sin errores, suite del backend en verde y `build` + `lint` + tests del
    frontend en verde.

## Dependencias

- **HT-WA-01** — `MetaIntegration`, `crypto.util` (AES-256-GCM) y webhook que resuelve el tenant por
  `phoneNumberId`.
- **HU-MARK-01** — campos de tier/calidad y `syncChannelTier`.
- **AUTH-02** — roles `superadmin`/`admin`.
- **DSN-03** — UI Kit shadcn/ui y App Shell (ruta y navegación de `/settings/channels/whatsapp`).
- **Prerrequisitos en Meta** (operador de SofiApp): ver `plan.md` §Notas.
