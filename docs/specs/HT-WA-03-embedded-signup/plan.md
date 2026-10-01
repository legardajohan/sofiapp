# HT-WA-03 — Plan técnico (CÓMO)

> Base: el diff sin commitear de `feat/HT-WA-03`. Cada archivo se marca **ok** (auditado, conforme)
> o **ajustar** (corrección pendiente, con su criterio del `spec`).

## Archivos a crear / tocar

```
apps/backend/src/
├── config/env.ts                                   ok       META_APP_ID opcional (CA-7)
├── integrations/meta/
│   └── meta-onboarding.client.ts                   ajustar  timeout por llamada (CA-10)
├── features/channel/
│   ├── channel.types.ts                            ok       pinEnc, displayPhoneNumber, verifiedName, IEmbeddedSignupDto
│   ├── channel.model.ts                            ok       pinEnc select:false (sin índices nuevos)
│   ├── channel.validation.ts                       ok       embeddedSignupSchema, activateSchema
│   ├── channel.service.ts                          ajustar  limpieza al cambiar de número (CA-9)
│   ├── channel.controller.ts                       ok
│   ├── channel.routes.ts                           ok       POST /embedded-signup, POST /activate
│   ├── channel.embedded-signup.test.ts             ajustar  + casos CA-9 y CA-10
│   ├── channel.isolation.test.ts                   ok
│   └── channel.routes.test.ts                      ok
└── app.ts                                          ok       ya montado: app.use('/api/channels/whatsapp', channelRoutes)
apps/backend/vitest.config.ts                       ok       META_APP_ID de test

apps/frontend/src/
├── vite-env.d.ts                                   ok       VITE_META_APP_ID/CONFIG_ID/GRAPH_VERSION
├── lib/facebook-sdk.ts                             ok       carga perezosa y única del SDK
└── features/channels/
    ├── api.ts · index.ts                           ok
    ├── ChannelConfigPage.tsx                       ajustar  «Reintentar» con <Button> shadcn (CA-12)
    ├── ChannelConfigPage.test.tsx                  ajustar  + confirmación de reconexión (CA-11)
    ├── hooks/useChannelStatus.ts                   ok       404 → null («aún no conectado»)
    ├── hooks/useEmbeddedSignup.ts                  ok       máquina de estados + postMessage
    ├── lib/press.ts                                ok
    ├── components/ChannelStatusPanel.tsx           ajustar  AlertDialog en «Cambiar de número» (CA-11)
    ├── components/{ConnectWhatsAppPanel,SignupSteps,PinForm,ManualConnectForm}.tsx   ok
    └── .impeccable/                                borrar   artefacto de herramienta (CA-12)

docs/integrations/meta-whatsapp.md                  ajustar  título/intro Tech Provider + «Quién paga a Meta» (CA-13); §2: timeout y reconexión (CA-9, CA-10)
docs/data-model.md                                  ajustar  línea 102: «conexión Tech Provider por tenant» (CA-13)
docs/product.md                                     ajustar  línea 12: «proveedor de tecnología (Tech Provider)» (CA-13)
docs/domain.md                                      ajustar  línea 12: WABA «(modelo Tech Provider)» (CA-13)
docs/adr/0010-modelo-tech-provider.md               crear    decisión del modelo con Meta (CA-13)
docs/adr/README.md                                  ajustar  fila del ADR 0010 (CA-13)
README.md                                           ajustar  líneas 5, 68 y 172: «BSP» → «Tech Provider» (CA-13)
.gitignore                                          ajustar  ignorar `.impeccable/`

NO se tocan: CLAUDE.md, AGENTS.md (decisión del usuario)
```

Ruta y navegación ya existen: `apps/frontend/src/router.tsx` (`/settings/channels/whatsapp` con
`RequireRole(['admin'])`) y `components/layout/nav-config.ts`.

## Contratos

### Tipos / DTOs (`channel.types.ts`)

```ts
interface IMetaIntegration {
  // … campos de HT-WA-01 y HU-MARK-01
  pinEnc?: string;             // AES-256-GCM, select:false
  displayPhoneNumber?: string;
  verifiedName?: string;
}
interface IEmbeddedSignupDto { code: string; wabaId: string; phoneNumberId: string }
interface IChannelStatusResponse {
  activo: boolean; phoneNumberId: string; wabaId: string;
  displayPhoneNumber: string | null; verifiedName: string | null;
  messagingTier; qualityRating; healthStatus; tierSyncedAt; tierManual;
}
```

### Zod (`channel.validation.ts`)

```ts
embeddedSignupSchema = { body: { code, wabaId, phoneNumberId: string.min(1) }.strict(), params: {}, query: {} }
activateSchema       = { body: { pin?: /^\d{6}$/ }.strict(),                          params: {}, query: {} }
```

### Índices

Sin cambios. Se mantiene `{ phoneNumberId: 1 } unique` global (lo necesita el webhook) y
`{ tenantId, canal }`. `pinEnc` no se indexa.

### Endpoints (montados en `/api/channels/whatsapp`)

| Método | Ruta | Pipeline | Respuesta |
|---|---|---|---|
| POST | `/embedded-signup` | `authenticateJWT → requireTenant → authorize(['admin']) → validate(embeddedSignupSchema) → asyncHandler` | 200 `IChannelStatusResponse` |
| POST | `/activate` | igual, con `validate(activateSchema)` | 200 `IChannelStatusResponse` |
| POST | `/connect` | existente (manual) | 200 · ahora 409 si el número es de otro tenant |
| GET | `/status` | existente | 200 · 404 sin canal |

Errores (`AppError`, con el texto humano en la UI y el código crudo de Meta en el log):

| Caso | HTTP |
|---|---|
| code caducado o inválido (4xx en `/oauth/access_token`) | 400 |
| sin canal en `/activate` | 404 |
| E11000 sobre `phoneNumberId` | 409 |
| Meta `133005` (PIN distinto) | 422 `{ reason: 'pin_required' }` |
| Meta `133008` / `133009` | 429 |
| cualquier otro fallo de Meta o timeout | 502 |
| sin `META_APP_ID` | 503 |

### Jobs BullMQ

**Ninguno.** El onboarding es interactivo: la persona espera el resultado en la pantalla y tiene que
ver el 422 del PIN. La regla 6 del `CLAUDE.md` (200 inmediato + cola) aplica al webhook, no a esta
acción.

## Diseño de las correcciones

### CA-9 — Limpieza al cambiar de número (`channel.service.ts`)

En `persistIntegration`, antes del upsert:

1. Lectura **scoped** del canal propio: `findOneScoped(MetaIntegration, tenantId, { canal: 'whatsapp' })
   .select('phoneNumberId tierManual')`.
2. Si existe y su `phoneNumberId` ≠ el nuevo, el update agrega
   `$unset: { pinEnc: 1, displayPhoneNumber: 1, verifiedName: 1 }` y restablece `qualityRating`,
   `healthStatus` y `tierSyncedAt` a los valores por defecto del schema. `messagingTier` vuelve al
   conservador solo si `tierManual` es `false`.
3. El mismo número (reconexión por token vencido) no limpia nada: el PIN guardado sigue siendo válido.

No hay lectura de otros tenants: el choque con otra empresa lo sigue detectando el E11000.

### CA-10 — Timeout por llamada (`meta-onboarding.client.ts`)

Helper `fetchGraph(url, init)` que añade `signal: AbortSignal.timeout(META_ONBOARDING_TIMEOUT_MS)`
(15 s). Un `TimeoutError`/`AbortError` se registra con el paso y se traduce a `metaUnavailable()` (502).
Tres llamadas en serie × 15 s quedan por debajo de los 45 s del cliente. `getPhoneInfo` conserva su
contrato de **nunca lanzar** y devuelve `null`.

### CA-11 — Confirmación de reconexión (`ChannelStatusPanel.tsx`)

«Cambiar de número» abre el `AlertDialog` de shadcn (ya vendorizado en
`components/ui/alert-dialog.tsx`). El texto dice: «Tu número actual dejará de recibir mensajes hasta que actives el
nuevo». El `onClick` de la acción de confirmar llama a `onReconectar()` de forma **síncrona**, así el
popup se abre dentro de ese gesto del usuario.

### CA-12 — Pulido

- El «Reintentar» de `ChannelConfigPage` pasa a `<Button variant="link">`.
- Se borra `features/channels/.impeccable/` y se agrega `.impeccable/` a `.gitignore`.

## Notas

- **Persistir antes de suscribir.** El `code` se gasta al canjearlo. Si se guardara al final, un fallo
  en `subscribed_apps` obligaría a repetir el popup. Con `activo:false`, `/activate` reintenta de forma
  idempotente (las dos llamadas de Meta lo son).
- **Excepciones de tenant.** Este feature no agrega ninguna. El webhook sigue resolviendo el tenant
  por `phoneNumberId` (`webhook.service.ts`), como documenta `meta-whatsapp.md`. Un canal
  `activo:false` puede recibir webhooks, pero en la práctica no llegan antes de la suscripción.
- **E11000 sin lectura cross-tenant.** `isDuplicatePhoneNumber` revisa `code === 11000` y
  `keyPattern.phoneNumberId`. Consultar primero a los demás tenants sería una lectura fuera del
  repositorio scoped.
- **SDK de Facebook.** Carga perezosa (`lib/facebook-sdk.ts`), solo en esta pantalla. `FB.login` se
  llama **sin `await` previo** dentro del clic, o el navegador bloquea el popup. El `code` (callback) y
  los ids (`postMessage`) llegan sin orden garantizado: se juntan en refs y se envía una sola vez.
- **Origen de `postMessage`.** Solo `https:` y `facebook.com` o `*.facebook.com`. Lo demás se ignora.
- **Timeout del frontend.** `ONBOARDING_TIMEOUT_MS = 45 s` en `api.ts` para `/embedded-signup` y
  `/activate` (el `apiClient` usa 10 s).
- **UX ya decidida en la base.** PIN en línea bajo el paso 3 (no en modal), con la salida «Ya la
  desactivé, activar». La lista de pasos hace de indicador de progreso. La sonda de tier se espera,
  envuelta en `try/catch`.
- **Riesgo aceptado (decisión 10).** Si la activación del número nuevo falla, la empresa queda sin
  canal operativo hasta reintentar. La confirmación de CA-11 lo deja explícito.
- **Modelo Tech Provider (decisión 11).** El código de onboarding no asigna línea de crédito ni lee
  costos de Meta: con este modelo cada tenant paga su consumo directamente a Meta. Las cuotas de
  HU-SAAS-02 son límites propios de SofiApp y no representan el costo de Meta. Migrar a Solution
  Partner implicaría un paso más tras `registerPhone` (compartir la línea de crédito con la WABA) y una
  feature aparte de medición del costo por tenant. Queda documentado en el ADR 0010.
- **Prerrequisitos en Meta** (operador de SofiApp, una sola vez). El estado Tech Provider es **de la app
  de SofiApp**, no de cada cliente:
  - Business Portfolio de SofiApp verificado.
  - App con estado **Tech Provider**, producto WhatsApp y permisos `whatsapp_business_management` y
    `whatsapp_business_messaging` (Advanced Access vía App Review).
  - Configuración de **Facebook Login for Business** tipo *WhatsApp Embedded Signup*. Su id va en
    `VITE_META_CONFIG_ID`.
  - *Login with the JavaScript SDK* = Yes, con los dominios `localhost` (dev) y el de Vercel.
  - Env del backend: `META_APP_ID` y `META_APP_SECRET`. Env del frontend: `VITE_META_APP_ID`,
    `VITE_META_CONFIG_ID` y `VITE_META_GRAPH_VERSION`.
- **Lo que necesita cada tenant** para conectarse:
  - Una cuenta de Facebook y un Business Portfolio (se puede crear dentro del popup).
  - Un número que **no** esté activo en la app de WhatsApp: al conectarlo deja de funcionar en el
    celular, porque no hay coexistencia.
  - Un método de pago en su WABA, porque Meta le factura a él los mensajes pagos.
  - La verificación de su negocio es recomendable (sube sus límites), pero no bloquea la conexión.
- **ADR 0010 — contenido esperado** (plantilla de `docs/adr/README.md`):
  - **Contexto:** SaaS multi-tenant con el WhatsApp de cada empresa, y la duda de quién paga el consumo.
  - **Decisión:** Tech Provider por ahora.
  - **Alternativas:**
    - Solution Partner propio: línea de crédito y requisitos de Meta.
    - Tech Provider asociado a un BSP.
    - WABAs dentro del portfolio de SofiApp: se descarta porque el tenant pierde la propiedad de su
      número.
  - **Consecuencias:**
    - No hay margen sobre los mensajes.
    - El tenant gestiona su pago con Meta.
    - Migrar después exige compartir la línea de crédito en el onboarding y medir el costo por tenant.

## Verificación

```
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint
pnpm --filter @sofiapp/web test
```

La prueba de punta a punta con el popup real de Meta la hace el usuario (sin Playwright ni
verificación visual automatizada).
