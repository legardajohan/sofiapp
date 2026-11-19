# HT-PAY-05 — Endurecimiento de seguridad para pagos (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Es el tercer paso de la pasarela (`docs/01-pasarela.md`, orden 3): cabeceras de
> seguridad en la API, límite de peticiones respaldado en Redis, redacción de datos sensibles en los
> logs, CSP del SPA y garantía de que al frontend solo llega la llave pública de Wompi.

**Estado:** creado

## Objetivo

Antes de exponer el webhook de pagos (HT-PAY-02) y el endpoint de intentos (HU-BILL-02), cerrar las
superficies que hoy están abiertas: la API no envía cabeceras de seguridad ni limita peticiones, el
`logger` escribe lo que le pasen, y el SPA se sirve **sin ninguna CSP** (no existe `vercel.json`).
Al terminar, el cobro con Wompi se puede enchufar sobre una base endurecida y con una prueba
automática de que ningún secreto viaja al navegador.

## Alcance

Incluye:
- **`helmet` en la API**, montado el primero en `app.ts`, con la configuración que exige este
  despliegue (en particular `Cross-Origin-Resource-Policy: cross-origin`, porque la media se pide
  como `<img>` desde otro origen y el valor por defecto de helmet la rompería).
- **`trust proxy`** configurable (`TRUST_PROXY_HOPS`). Hoy Express no lo sabe: detrás de Nginx todo
  cliente tiene la misma IP, así que un límite por IP sería un límite global, y la IP que HU-BILL-02
  guarda en `aceptaciones` sería siempre la del proxy.
- **Rate limit con `express-rate-limit` y store Redis** (`rate-limit-redis`):
  - limitador del **webhook** `/api/webhooks/wompi`, por IP, **montado ya en `app.ts`** antes de
    `express.json()` (la ruta la crea HT-PAY-02 y hereda el límite);
  - limitador de **creación de intentos**, por **tenant del token**, como middleware listo para la
    cadena de `POST /api/billing/intentos` (HU-BILL-02).
  - Si Redis falla, ambos **dejan pasar** y lo registran (decisión 3).
- **Redacción en `utils/logger.ts`**: toda llamada a `logger.info|warn|error` pasa por una función
  de redacción que oculta `Authorization`, cookies, llaves, secretos, firmas, checksums, correos,
  teléfonos y documentos, tanto por **nombre de clave** como por **forma del valor**.
- **`apps/frontend/vercel.json`** (nuevo): rewrite SPA, **CSP** con los dominios estrictamente
  necesarios (Wompi, Facebook SDK, el API propio, media y datos de emojis) y el resto de cabeceras
  de seguridad.
- **Solo la llave pública en el frontend**: la variable `VITE_WOMPI_PUBLIC_KEY` queda tipada, y un
  script de verificación que **falla el build** si el bundle contiene `prv_…`, un secreto de eventos
  o de integridad, o si existe una variable `VITE_*` con nombre de secreto.
- Documentación: sección de seguridad en `docs/integrations/wompi.md`, ajustes de `docs/00-deploy.md`
  (Nginx, `TRUST_PROXY_HOPS`, `vercel.json`, variable pública) y una línea en
  `apps/backend/CLAUDE.md` (excepción de la cadena y regla de logs).

Fuera de alcance (otros features):
- El endpoint del webhook, la verificación del checksum y la cola `payments` → **HT-PAY-02**.
- `POST /api/billing/intentos`, la pantalla y el Widget de Wompi → **HU-BILL-02** (aquí solo se
  entrega el limitador y la CSP que el Widget necesita).
- Rate limit de **otros** endpoints de la API (login, mensajes…). Los factories son reutilizables,
  pero no se aplican a nada que no sea de pagos.
- Un endpoint de reporte de violaciones de CSP (`report-uri`) y su panel.
- HSTS agresivo (`preload`, `includeSubDomains`): lo gobierna Cloudflare/Nginx, no la API.
- WAF, protección DDoS y cualquier cosa de infraestructura fuera de `vercel.json` y la API.
- Prueba del Widget de Wompi contra la CSP en sandbox → **HT-PAY-06** (checklist de salida).

## Decisiones de esta spec

1. **Stack y orden de entrega.** HT-PAY-05 sale de `feat/HT-PAY-01`, que a su vez sale de
   `feat/HT-PAY-04`. Las tres specs se liberan juntas en **un solo PR a `develop`** que contiene las
   ramas apiladas; `/sdd-release` se corre una vez, desde `feat/HT-PAY-05`. Por eso esta spec solo
   puede implementarse **después** de implementar HT-PAY-01.
2. **`trust proxy` por saltos, no por «true».** `TRUST_PROXY_HOPS` (entero ≥ 0, por defecto `1`:
   Nginx). Con Cloudflare en modo proxied delante de Nginx hay que ponerlo en `2` (lo documenta
   `00-deploy.md`). Confiar en `X-Forwarded-For` sin acotar permitiría falsificar la IP y esquivar el
   límite.
3. **El limitador falla abierto.** Si Redis no responde, la petición pasa (`passOnStoreError`). El
   motivo es el webhook: Wompi solo reintenta 3 veces en 24 h, y un Redis caído que devolviera 5xx
   haría perder confirmaciones de pagos reales. La defensa real del webhook es el checksum
   (HT-PAY-02), no el límite. El fallo se registra.
4. **El límite de intentos es por tenant del token**, nunca por IP, cuerpo o cabecera: dos empresas
   detrás de la misma IP no se pisan, y un atacante autenticado no cambia de cubeta cambiando de IP.
5. **La redacción es por nombre exacto de clave, no por subcadena.** Una regla del tipo «cualquier
   clave que contenga `key`» ya rompería un log existente (`key` de la media huérfana) y `tokens` de
   uso de IA. Se redacta una lista cerrada de nombres normalizados (minúsculas, sin `_`/`-`), más
   patrones de **valor** (llaves de Wompi, `Bearer …`, JWT, correos) para lo que se cuele en un
   mensaje de texto. `phoneNumberId`, `key` y `reference` se conservan.
6. **La CSP se publica en modo bloqueo desde el principio**, sin `Report-Only`: no hay dónde recoger
   informes, y una CSP que no bloquea no protege. A cambio, el origen del API va en un solo sitio
   y se verifica en un test, y la comprobación manual (login, Socket.IO, popup de Facebook, emojis,
   media, notas de voz) la hace el usuario en un deploy de preview antes de producción. Se asume el
   dominio `sofiapp.co` de `00-deploy.md`: si el real es otro, es un único cambio.
7. **No se fija `Cross-Origin-Opener-Policy`** en el SPA: el popup de *Embedded Signup* de Facebook
   necesita conservar `window.opener`. Tampoco `Cross-Origin-Embedder-Policy`.
8. **La verificación de secretos en el bundle corre dentro de `build`** (`vite build` y luego el
   script), así que un secreto filtrado rompe el despliegue de Vercel en vez de llegar a producción.
   No hay CI en el repositorio; el propio build es el control.
9. **Ningún componente de UI.** El trabajo de frontend se limita a configuración, tipos y un script;
   la regla 7 (skills de diseño) no aplica y se anota.

## Criterios de aceptación

1. **Dependencias.** `helmet`, `express-rate-limit` y `rate-limit-redis` figuran en
   `apps/backend/package.json` con versión vigente fijada al instalar.
2. **Helmet.** `app.use(helmet(...))` es la primera línea de `app.ts` (antes de `cors`). Una
   respuesta de `GET /api/health` lleva `X-Content-Type-Options: nosniff`, no lleva `X-Powered-By`,
   lleva `Content-Security-Policy` con `default-src 'none'` y `frame-ancestors 'none'`,
   `Referrer-Policy: no-referrer`, `Strict-Transport-Security` con `max-age=15552000` **sin**
   `includeSubDomains` ni `preload`, y `Cross-Origin-Resource-Policy: cross-origin`. La petición de
   preflight CORS y la lectura de `/api/media/:id` por `<img>` siguen funcionando (tests existentes
   en verde).
3. **Trust proxy.** `TRUST_PROXY_HOPS` se valida con Zod (entero ≥ 0, por defecto 1) y `app.ts`
   aplica `app.set('trust proxy', n)`. Con `n=1`, una petición con `X-Forwarded-For: 203.0.113.9`
   tiene `req.ip === '203.0.113.9'`; con `n=0` el encabezado se ignora.
4. **Limitadores.** `middlewares/rate-limit.middleware.ts` exporta `crearLimitadorWebhookPagos` y
   `crearLimitadorIntentosPago`, con `standardHeaders: 'draft-7'`, sin cabeceras heredadas, y
   respuesta `429` `{ message }` en español. Los máximos y ventanas salen de constantes con
   sobreescritura por entorno (`RATE_LIMIT_WEBHOOK_PAGOS_MAX`, `RATE_LIMIT_INTENTOS_MAX`) y todos
   llevan un prefijo propio en Redis (`rl:pagos:webhook:`, `rl:pagos:intentos:`).
5. **Webhook.** `app.ts` monta el limitador de `/api/webhooks/wompi` **antes** de `express.json()`.
   Superado el máximo por IP, responde `429` con `Retry-After`; antes del máximo, la petición llega
   al siguiente manejador sin que el limitador haya consumido ni parseado el cuerpo. La clave es la
   IP (`req.ip`).
6. **Intentos.** `crearLimitadorIntentosPago` usa como clave el `tenantId` de `req.user` (el token).
   Un `X-Tenant-Id`, un `tenantId` en el cuerpo, la query o los params **no** cambian la cubeta; dos
   tenants distintos tienen cuotas independientes aunque compartan IP. Sin `req.user` cae a la IP
   (no debería ocurrir: va después de `authenticateJWT`).
7. **Fallo abierto.** Con un store que lanza, ambas variantes dejan pasar la petición (sin 5xx) y se
   emite un `logger.warn` que no contiene el contenido de la petición.
8. **Redacción de claves.** `logger.info|warn|error` redacta con `[REDACTADO]` el valor de las
   claves `authorization`, `cookie`, `set-cookie`, `password`, `passwordHash`, `token`,
   `accessToken`, `refreshToken`, `acceptance_token`, `accept_personal_auth`, `secret`, `apiKey`,
   `privateKey`, `eventsSecret`, `integritySecret`, `signature`, `checksum`, `x-event-checksum`,
   `customer_email`, `email`, `correo`, `telefono`, `phone`, `phone_number`, `documento`,
   `legal_id`, a cualquier profundidad (objetos y arreglos), sin distinguir mayúsculas ni
   separadores. Conserva intactas `phoneNumberId`, `key`, `tokens`, `reference` y `tenantId`.
9. **Redacción de valores.** Un texto (campo o mensaje) que contenga una llave `prv_test_…`,
   `prv_prod_…`, `test_events_…`, `prod_events_…`, `test_integrity_…`, `prod_integrity_…`, un
   `Bearer <x>`, un JWT o un correo sale con esa porción sustituida, y el resto del texto intacto.
10. **Robustez de la redacción.** No muta el objeto de entrada, soporta referencias circulares
    (`[CIRCULAR]`), corta a profundidad 8 (`[PROFUNDO]`), serializa un `Error` como `{ name,
    message }` redactado y nunca lanza: si no puede redactar, descarta el `meta` y registra solo el
    mensaje. El formato de salida (`level`, `message`, campos, `ts`) no cambia.
11. **Sin regresiones de logs.** La suite completa del backend sigue en verde y la búsqueda de
    llamadas existentes a `logger` no encuentra ninguna clave legítima redactada por error (la
    revisión queda anotada en `tasks.md`).
12. **CSP y cabeceras del SPA.** `apps/frontend/vercel.json` existe y contiene el rewrite SPA y las
    cabeceras `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
    strict-origin-when-cross-origin`, `X-Frame-Options: DENY` y `Permissions-Policy` con
    `microphone=(self)`, `camera=()`, `geolocation=()`. La CSP cumple: `script-src` solo con
    `'self'`, `https://checkout.wompi.co` y `https://connect.facebook.net`, **sin** `'unsafe-inline'`
    ni `'unsafe-eval'`; `frame-src` solo con `https://checkout.wompi.co` y los frames de Facebook;
    `connect-src` con `'self'`, el origen `https`/`wss` del API, `https://*.wompi.co`, Facebook y
    `https://cdn.jsdelivr.net` (datos de emojis); `img-src`/`media-src` con `'self'`, `data:`,
    `blob:`, el API y el dominio de Spaces; `object-src 'none'`, `base-uri 'self'`,
    `frame-ancestors 'none'` y `form-action` solo con `'self'` y `https://checkout.wompi.co`. No se
    define `Cross-Origin-Opener-Policy`. Un test lee el archivo y lo comprueba directiva por
    directiva.
13. **Solo llave pública.** `vite-env.d.ts` declara `VITE_WOMPI_PUBLIC_KEY?: string` y ninguna otra
    variable de Wompi. `scripts/check-bundle-secrets.mjs` recorre `dist/` y las variables `VITE_*`
    del entorno de build: termina con código 1 y un mensaje (sin imprimir el secreto) si encuentra
    `prv_(test|prod)_`, `(test|prod)_events_`, `(test|prod)_integrity_` o una variable `VITE_*` cuyo
    nombre contenga `PRIVATE`, `SECRET`, `INTEGRITY` o `EVENTS`; con una llave pública
    (`pub_test_…`) en el bundle termina con 0. `pnpm --filter @sofiapp/web build` lo ejecuta al final.
14. **Documentación.** `docs/integrations/wompi.md` tiene la sección «Seguridad» (límites, fallo
    abierto, redacción, CSP, llave pública); `docs/00-deploy.md` documenta `X-Forwarded-For` en Nginx,
    `TRUST_PROXY_HOPS` (1 con Nginx, 2 con Cloudflare proxied), el `vercel.json` y la variable pública;
    `apps/backend/CLAUDE.md` recoge la excepción de la cadena de middlewares para el limitador y la
    regla de no registrar PII.
15. **Aislamiento multi-tenant.** El limitador de intentos del tenant A no consume ni lee la cuota
    del tenant B y el `tenantId` solo se toma de `req.user` (token); ningún dato de un tenant aparece
    en los logs del limitador ni en las claves de Redis más allá del propio `tenantId` de la cubeta.
    `pnpm --filter @sofiapp/api typecheck` (`tsc --noEmit`), `pnpm --filter @sofiapp/api test` y
    `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde.

## Dependencias

- `HT-PAY-01` (y por transitividad `HT-PAY-04`): la rama base, `integrations/payments` y los nombres
  de variables `WOMPI_*` (`VITE_WOMPI_PUBLIC_KEY` es la contraparte pública de `WOMPI_PUBLIC_KEY`).
- `docs/integrations/wompi.md` y `docs/00-deploy.md` como documentos a ampliar.
- `ADR 0002` (cookie `httpOnly` + CSRF): la CSP no debe romper el flujo de `apiClient`.
- Redis ya desplegado como broker de BullMQ; el store de límites usa una conexión `ioredis` propia.
