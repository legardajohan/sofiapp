# HT-PAY-05 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Rama: `feat/HT-PAY-05`, creada **desde `feat/HT-PAY-01`** (que sale de
> `feat/HT-PAY-04`). **No empieces hasta que HT-PAY-01 esté implementada y en verde**: su rama aún no
> existe. Las tres se liberan juntas en un solo PR a `develop`.

## Implementación

> Feature transversal: no hay modelo, controller ni routes. El «montaje» es en `app.ts`.

### Backend

- [x] Instalar `helmet`, `express-rate-limit` y `rate-limit-redis` en `apps/backend`, fijar la versión
      instalada y comprobar que `express-rate-limit` soporta `passOnStoreError` y exporta
      `ipKeyGenerator` (si no, subir a la mínima que los trae). (CA 1, 4)
- [x] `config/env.ts`: `TRUST_PROXY_HOPS` (entero 0–5, default 1), `RATE_LIMIT_WEBHOOK_PAGOS_MAX`
      (default 120) y `RATE_LIMIT_INTENTOS_MAX` (default 10). (CA 3, 4)
- [x] `config/rate-limits.ts`: ventanas y prefijos (`rl:pagos:webhook:`, `rl:pagos:intentos:`). (CA 4)
- [x] `utils/log-redaction.ts`: `normalizarClave`, `CLAVES_REDACTADAS` (lista exacta del plan),
      `redactarTexto` (patrones de valor), `redactar` (copia profunda, `WeakSet`, profundidad 8, `Error`,
      sin mutar, sin lanzar). (CA 8, 9, 10)
- [x] `utils/logger.ts`: las tres funciones pasan por `redactar`/`redactarTexto`; mismo formato de
      salida; ante un fallo emite solo `{ level, message, ts }`. (CA 8–10)
- [x] **Revisión de colisiones:** `grep` de todas las llamadas `logger.(info|warn|error)(` del backend
      y confirmar que ninguna clave legítima (`key`, `tokens`, `phoneNumberId`, `reference`, `tenantId`…)
      queda en `CLAVES_REDACTADAS`. Anotar el resultado al final de esta tarea. (CA 11)
      **Resultado (2026-11-19):** de todas las llamadas `logger.*` del backend, la única que usa una
      clave de la lista es `seed-superadmin.ts` (`email`), que ahora sale `[REDACTADO]`: es PII y es lo
      buscado. `webhook.controller.ts` usa `hasSignature` (no coincide: la lista es por nombre exacto).
      Ninguna clave legítima (`key`, `tokens`, `phoneNumberId`, `reference`, `tenantId`) se redacta.
- [x] `middlewares/security-headers.middleware.ts`: `securityHeaders` con la configuración del plan
      (CSP `default-src 'none'`, `frame-ancestors 'none'`, CORP `cross-origin`, COEP desactivado, HSTS
      180 días sin `includeSubDomains`/`preload`, `no-referrer`). (CA 2)
- [x] `middlewares/rate-limit.redis-store.ts`: `crearStoreRedis(prefijo)` — `undefined` en test, una
      conexión `ioredis` perezosa y compartida (`enableOfflineQueue: false`, `maxRetriesPerRequest: 1`)
      y `RedisStore` con `sendCommand`; aviso con `logger.warn` una vez por episodio. (CA 4, 7)
- [x] `middlewares/rate-limit.middleware.ts`: `crearLimitadorWebhookPagos` (clave `req.ip` normalizada,
      1 min) y `crearLimitadorIntentosPago` (clave `tenant:<req.user.tenantId>`, fallback IP, 10 min);
      `standardHeaders: 'draft-7'`, `legacyHeaders: false`, `passOnStoreError: true`, `handler` 429 en
      español; `store` inyectable. La clave del segundo **solo** lee `req.user`. (CA 4–7, 15)
- [x] `app.ts`: `app.use(securityHeaders)` como **primera** línea, `app.set('trust proxy',
      env.TRUST_PROXY_HOPS)` y `app.use('/api/webhooks/wompi', crearLimitadorWebhookPagos())` junto al
      webhook de Meta y **antes** de `express.json()`, con su comentario. (CA 2, 3, 5)
- [x] `apps/backend/CLAUDE.md`: añadir el limitador (entre `authorize` y `validate`) como segunda
      excepción admitida a la cadena de middlewares, y la regla «no registrar PII ni secretos; el logger
      redacta, pero no es la defensa». (CA 14)

### Frontend

- [x] `apps/frontend/src/vite-env.d.ts`: declarar `VITE_WOMPI_PUBLIC_KEY?: string` (y ninguna otra
      variable de Wompi). (CA 13)
- [x] `apps/frontend/scripts/check-bundle-secrets.mjs` (+ `.d.mts`): `escanear({ dist, env })` y CLI que
      sale con código 1 sin imprimir nunca el valor encontrado. (CA 13)
- [x] `apps/frontend/package.json`: encadenar el script al final de `build`. (CA 13)
- [x] `apps/frontend/vercel.json`: rewrite SPA, CSP del plan (una sola línea), `X-Content-Type-Options`,
      `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` (`microphone=(self)`); **sin**
      `Cross-Origin-Opener-Policy`. (CA 12)
- [x] Sin componentes nuevos ni modificados → la regla 7 (skills de diseño y shadcn) no aplica; anotarlo
      en el commit.

### Documentación

- [x] `docs/integrations/wompi.md`: sección «Seguridad» (límites y su razón, fallo abierto, redacción,
      tabla de orígenes de la CSP, llave pública única y el control de build). (CA 14)
- [x] `docs/00-deploy.md`: Fase 3 (Nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`
      y `X-Real-IP`), variable `TRUST_PROXY_HOPS` (1 con Nginx; 2 con Cloudflare proxied) y las variables
      `RATE_LIMIT_*`; Fase 7 (el `vercel.json` ya versiona el rewrite, `VITE_WOMPI_PUBLIC_KEY` pública y
      el aviso de que un `VITE_*` con nombre de secreto rompe el build). (CA 14)

## Tests (Vitest)

- [x] `utils/log-redaction.test.ts`: (CA 8–10)
  - [x] cada clave de la lista se redacta, en mayúsculas, minúsculas, `snake_case`, `kebab-case` y
        `camelCase`, a profundidad 1, 3 y dentro de un arreglo.
  - [x] se conservan `phoneNumberId`, `key`, `tokens`, `reference`, `tenantId` y un valor numérico.
  - [x] patrones de valor: `prv_test_…`, `prv_prod_…`, `pub_test_…`, `test_events_…`, `prod_integrity_…`,
        `Bearer abc.def`, un JWT y un correo dentro de un texto; el resto del texto queda igual.
  - [x] referencia circular → `[CIRCULAR]`; objeto a profundidad 12 → `[PROFUNDO]`; `Error` →
        `{ name, message }` redactado y sin `stack`.
  - [x] el objeto de entrada no se muta (comparación profunda antes/después).
  - [x] un objeto con un getter que lanza no hace lanzar a `redactar`.
- [x] `utils/logger.test.ts` (espía de `console.*`): una llamada con `Authorization`, `customer_email` y
      un `message` con `prv_test_x` emite JSON válido con `[REDACTADO]`, conserva `level`, `message`,
      campos y `ts`; con un `meta` circular no lanza y emite la línea. (CA 8–10)
- [x] `middlewares/security-headers.middleware.test.ts`: una app mínima con `securityHeaders` cumple
      todas las cabeceras del CA 2 (incluido: sin `X-Powered-By`, HSTS sin `includeSubDomains`/`preload`,
      CORP `cross-origin`). (CA 2)
- [x] `middlewares/rate-limit.middleware.test.ts` (store en memoria inyectado y `max` bajo): (CA 4–7, 15)
  - [x] webhook: `max` peticiones pasan, la siguiente da 429 con `{ message }`, `Retry-After` y cabeceras
        `RateLimit-*`; otra IP (`X-Forwarded-For` con `trust proxy`) tiene su propia cuota.
  - [x] webhook: el limitador no toca `req.body` (llega sin parsear al siguiente manejador).
  - [x] intentos: clave por `req.user.tenantId`; el tenant A agota su cuota y el B sigue pasando desde
        la **misma IP**; un `X-Tenant-Id`, `tenantId` en el cuerpo, en la query o en los params no cambia
        la cubeta.
  - [x] intentos sin `req.user`: usa la IP y no lanza.
  - [x] fallo abierto: con un store que lanza en `increment`, ambas variantes dejan pasar (200) y se
        emite un `logger.warn` que no contiene ningún dato de la petición.
  - [x] los prefijos de Redis son los de `config/rate-limits.ts` (comprobado sobre la configuración
        exportada, sin Redis).
- [x] `app.security.test.ts` (sobre `app` real, `NODE_ENV=test`, store en memoria): (CA 2, 3, 5)
  - [x] `GET /api/health` trae las cabeceras de helmet del CA 2 y el preflight CORS responde como antes.
  - [x] con `TRUST_PROXY_HOPS=1`, una ruta de prueba devuelve `req.ip === '203.0.113.9'` ante
        `X-Forwarded-For: 203.0.113.9`; con `0`, lo ignora (usando el valor del módulo `env` simulado).
  - [x] `POST /api/webhooks/wompi` supera el máximo → 429 aunque la ruta no exista aún, y el limitador
        está montado antes de `express.json()` (un cuerpo JSON inválido no produce 400 antes del 429).
- [x] `src/lib/vercel-config.test.ts`: lee `apps/frontend/vercel.json`, lo parsea y comprueba directiva
      por directiva el CA 12 (incluidos: `script-src` sin `'unsafe-inline'`/`'unsafe-eval'`, cada origen de
      la tabla, el `wss://` del API, `microphone=(self)`, y la **ausencia** de `Cross-Origin-Opener-Policy`).
      Extrae el origen del API del propio JSON. (CA 12)
- [x] `src/lib/check-bundle-secrets.test.ts` (carpeta temporal con un `dist` simulado): (CA 13)
  - [x] un `.js` con `prv_test_abc` → hallazgo de tipo `bundle`; con `test_events_x` y `prod_integrity_x`
        también.
  - [x] un bundle con `pub_test_abc` → sin hallazgos.
  - [x] `env` con `VITE_WOMPI_PRIVATE_KEY` o `VITE_INTEGRITY_SECRET` → hallazgo de tipo `variable`;
        con `VITE_WOMPI_PUBLIC_KEY` → ninguno.
  - [x] ningún hallazgo ni mensaje contiene el texto del secreto.
  - [x] la CLI sale con 1 ante hallazgos y con 0 sin ellos.
- [x] **Aislamiento multi-tenant** (en `rate-limit.middleware.test.ts`): el tenant A no consume ni lee la
      cuota del tenant B, el `tenantId` solo sale de `req.user`, y las claves de store contienen únicamente
      el `tenantId` de su propia cubeta. (CA 15)

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde (la suite completa: confirma que la redacción y `helmet`
      no rompen nada existente, en particular los tests de media y de webhook). (CA 2, 11)
- [x] `pnpm --filter @sofiapp/web build` en verde (incluye `check-bundle-secrets`), `lint` y `test`.
- [x] Prueba negativa a mano: `VITE_WOMPI_PRIVATE_KEY=x pnpm --filter @sofiapp/web build` **falla** y el
      mensaje no imprime el valor; sin esa variable, pasa. (CA 13)
- [ ] Arrancar `app.ts` con `NODE_ENV=development`: sin errores en consola y `GET /api/health` con las
      cabeceras de seguridad. (CA 2) — **pendiente**: no hay `.env` local para arrancar el proceso real;
      las cabeceras sí están verificadas sobre el `app` real en `app.security.test.ts`.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado (este feature no toca Mongo; la cuota por
      tenant del limitador y su test cubren el aislamiento).
- [x] `git status`: ninguna captura ni `.env` en el cambio.
- [x] `spec.md` → `**Estado:** implementado`.

### Verificación manual del usuario (no la ejecuta Claude)

- [ ] En un deploy de **preview** de Vercel, con la consola del navegador abierta: sin violaciones de CSP
      al iniciar sesión, abrir la bandeja (Socket.IO conectado), ver una imagen y un audio, grabar una nota
      de voz, abrir el selector de emojis y abrir el popup de *Embedded Signup* de Facebook. Anotar aquí
      cualquier origen que falte y ajustar `vercel.json` y la tabla de `wompi.md` antes de producción.
- [ ] Confirmar el dominio real del API; si no es `sofiapp.co`, cambiarlo en `vercel.json` y `00-deploy.md`.
- [ ] En el servidor: `TRUST_PROXY_HOPS` correcto (1 con Nginx, 2 con Cloudflare proxied) y la cabecera
      `X-Forwarded-For` configurada en Nginx.

## Definición de "hecho"

La API responde con cabeceras de seguridad y conoce la IP real del cliente; el webhook de Wompi y la
creación de intentos tienen límite respaldado en Redis que **nunca** hace perder un pago si Redis cae;
el `logger` no vuelca llaves, firmas, correos ni teléfonos; el SPA se sirve con una CSP que solo admite
Wompi, Facebook, el API propio y lo imprescindible; y un secreto en el bundle rompe el build. HT-PAY-02 y
HU-BILL-02 pueden construirse encima, y las tres specs (04, 01 y 05) se liberan en un solo PR.
