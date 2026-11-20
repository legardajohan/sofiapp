# HT-PAY-05 — Plan técnico (CÓMO)

## Archivos a crear / tocar

```
docs/
├── integrations/wompi.md                          # + sección «Seguridad»
└── 00-deploy.md                                   # Nginx (X-Forwarded-For), TRUST_PROXY_HOPS, vercel.json, VITE_WOMPI_PUBLIC_KEY

apps/backend/
├── CLAUDE.md                                      # + excepción de la cadena (limitador) y regla de logs sin PII
├── package.json                                   # + helmet, express-rate-limit, rate-limit-redis
└── src/
    ├── config/
    │   ├── env.ts                                 # + TRUST_PROXY_HOPS, RATE_LIMIT_WEBHOOK_PAGOS_MAX, RATE_LIMIT_INTENTOS_MAX
    │   └── rate-limits.ts                         # NUEVO — ventanas, máximos por defecto, prefijos de Redis
    ├── middlewares/
    │   ├── security-headers.middleware.ts         # NUEVO — `securityHeaders` (helmet configurado)
    │   ├── rate-limit.middleware.ts               # NUEVO — crearLimitadorWebhookPagos / crearLimitadorIntentosPago
    │   ├── rate-limit.redis-store.ts              # NUEVO — crearStoreRedis(prefijo) (aísla ioredis + rate-limit-redis)
    │   ├── security-headers.middleware.test.ts    # NUEVO
    │   └── rate-limit.middleware.test.ts          # NUEVO
    ├── utils/
    │   ├── log-redaction.ts                       # NUEVO — redactar(), CLAVES_REDACTADAS, redactarTexto()
    │   ├── log-redaction.test.ts                  # NUEVO
    │   ├── logger.ts                              # las tres funciones pasan por redactar()
    │   └── logger.test.ts                         # NUEVO
    ├── app.ts                                     # helmet (1.º) · trust proxy · limitador del webhook de Wompi
    └── app.security.test.ts                       # NUEVO — cabeceras, trust proxy y orden de montaje sobre `app`

apps/frontend/
├── vercel.json                                    # NUEVO — rewrite SPA + CSP + cabeceras
├── package.json                                   # build = tsc --noEmit && vite build && node scripts/check-bundle-secrets.mjs
├── scripts/
│   ├── check-bundle-secrets.mjs                   # NUEVO — exporta escanear(); CLI sale con 1 si encuentra secretos
│   └── check-bundle-secrets.d.mts                 # NUEVO — tipos para el test
└── src/
    ├── vite-env.d.ts                              # + VITE_WOMPI_PUBLIC_KEY?: string
    └── lib/
        ├── check-bundle-secrets.test.ts           # NUEVO
        └── vercel-config.test.ts                  # NUEVO — la CSP, directiva por directiva
```

Sin modelo, controller ni routes: este feature es transversal. Lo único que toca `app.ts` es el
montaje de `helmet`, `trust proxy` y un limitador de ruta. No hay jobs ni colas.

## Contratos

### Variables de entorno (`config/env.ts`)
```ts
TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
RATE_LIMIT_WEBHOOK_PAGOS_MAX: z.coerce.number().int().positive().default(120),   // por IP y minuto
RATE_LIMIT_INTENTOS_MAX: z.coerce.number().int().positive().default(10),         // por tenant y 10 min
```
Los tests no definen ninguna: valen los defaults. `vitest.config.ts` no cambia.

### `config/rate-limits.ts`
```ts
export const LIMITE_WEBHOOK_PAGOS = { ventanaMs: 60_000, prefijo: 'rl:pagos:webhook:' } as const;
export const LIMITE_INTENTOS_PAGO = { ventanaMs: 10 * 60_000, prefijo: 'rl:pagos:intentos:' } as const;
```
El máximo se lee de `env`; ventana y prefijo son constantes (cambiarlos es una decisión de código).

### `middlewares/security-headers.middleware.ts`
```ts
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  crossOriginResourcePolicy: { policy: 'cross-origin' },   // <img> de media desde app.<dominio> y redirección a Spaces
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 15_552_000, includeSubDomains: false, preload: false },  // 180 días; lo demás lo decide Cloudflare/Nginx
  referrerPolicy: { policy: 'no-referrer' },
});
```
`X-Powered-By` lo quita helmet por defecto. No se toca `crossOriginOpenerPolicy` (el valor por defecto
de helmet, `same-origin`, es correcto para una API que no abre popups).

### `rate-limit.redis-store.ts`
```ts
export function crearStoreRedis(prefijo: string): Store | undefined;
```
- En `NODE_ENV=test` devuelve `undefined` → `express-rate-limit` usa su `MemoryStore` (los tests no
  tienen Redis y no deben abrir conexiones).
- Fuera de test: **una** conexión `ioredis` perezosa y compartida por los dos limitadores
  (`new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false })`), y
  `new RedisStore({ prefix: prefijo, sendCommand: (...a) => redis.call(...a) })`. `enableOfflineQueue:
  false` hace que, con Redis caído, el comando falle al instante en vez de colgar la petición.
- Registra `error` de la conexión con `logger.warn` (ya redactado) una vez por episodio, sin saturar.

### `middlewares/rate-limit.middleware.ts`
```ts
export interface OpcionesLimitador { max?: number; store?: Store }   // `store` inyectable para tests
export function crearLimitadorWebhookPagos(op?: OpcionesLimitador): RequestHandler;
export function crearLimitadorIntentosPago(op?: OpcionesLimitador): RequestHandler;
```
Opciones comunes: `standardHeaders: 'draft-7'`, `legacyHeaders: false`, `passOnStoreError: true`
(fallo abierto), `handler` → `res.status(429).json({ message: 'Demasiadas solicitudes. Intenta de nuevo
en unos minutos.' })`. `store` por defecto = `crearStoreRedis(prefijo)`.
- **Webhook:** `keyGenerator: (req) => ipKeyGenerator(req.ip ?? '')` (el helper de la librería normaliza
  IPv6). Ventana 1 min, `max` = `env.RATE_LIMIT_WEBHOOK_PAGOS_MAX`.
- **Intentos:** `keyGenerator: (req) => \`tenant:${req.user!.tenantId}\``; si no hay `req.user`
  (no debería), usa la IP normalizada. Ventana 10 min, `max` = `env.RATE_LIMIT_INTENTOS_MAX`. **Solo**
  lee `req.user` (token): nunca `req.body`, `req.query`, `req.params` ni cabeceras.
- Un `store` que lanza no produce 5xx por `passOnStoreError`; además se envuelve el `handler` de error
  del store con `logger.warn('Rate limit: store no disponible', { limitador })` (nombre del limitador,
  nada de la petición).
- Verificar al instalar que la versión de `express-rate-limit` soporta `passOnStoreError` y exporta
  `ipKeyGenerator`; si no, fijar la mínima que los trae.

### Posición en la cadena de middlewares
El limitador de intentos va **entre `authorize` y `validate`** (como la excepción de multer):
```ts
router.post('/intentos', authenticateJWT, requireTenant, authorize([...]),
  limitadorIntentos, validate(schema), asyncHandler(crearIntentoController));
```
Lo cablea HU-BILL-02; aquí queda documentado en `apps/backend/CLAUDE.md` como la segunda excepción
admitida al orden fijo (junto a multer), con la razón: limitar **antes** de parsear y validar.

### `app.ts`
```ts
app.use(securityHeaders);                                   // 1.º: también cubre errores de CORS y de parseo
app.set('trust proxy', env.TRUST_PROXY_HOPS);
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use('/api/webhooks/whatsapp', webhookRoutes);          // sin cambios (HT-WA-02)
app.use('/api/webhooks/wompi', crearLimitadorWebhookPagos());  // ANTES de express.json(); HT-PAY-02 monta la ruta
app.use(express.json());
```
El limitador de Wompi va **junto al de Meta y antes de `express.json()`**, con su comentario: así corta
el abuso antes de leer y parsear el cuerpo. Mientras HT-PAY-02 no exista, esa ruta responde 404 pero ya
está limitada. `csrfGuard` ya exime `/api/webhooks/`.

### `utils/log-redaction.ts`
```ts
export const MARCA_REDACTADO = '[REDACTADO]';
export const CLAVES_REDACTADAS: ReadonlySet<string>;   // claves YA normalizadas
export function normalizarClave(clave: string): string;   // minúsculas y sin '_' ni '-'
export function redactarTexto(texto: string): string;     // patrones de valor
export function redactar(valor: unknown): unknown;        // copia profunda redactada; nunca lanza
```
- **Claves** (tras normalizar): `authorization`, `cookie`, `setcookie`, `password`, `passwordhash`,
  `token`, `accesstoken`, `refreshtoken`, `acceptancetoken`, `acceptpersonalauth`, `secret`, `apikey`,
  `privatekey`, `eventssecret`, `integritysecret`, `signature`, `checksum`, `xeventchecksum`,
  `customeremail`, `email`, `correo`, `telefono`, `phone`, `phonenumber`, `documento`, `legalid`.
  Coincidencia **exacta** (no subcadena): `phoneNumberId` → `phonenumberid` (no está), `key` (no está),
  `tokens` (no está), `reference` (no está). El valor de una clave redactada se reemplaza entero,
  sea del tipo que sea.
- **Patrones de valor** (en cualquier cadena, incluido `message`): `\b(?:prv|pub)_(?:test|prod)_[A-Za-z0-9]+`
  (la pública también: no es secreta, pero no hay razón para volcarla), `\b(?:test|prod)_(?:events|integrity)_[A-Za-z0-9]+`,
  `Bearer\s+[A-Za-z0-9._~+/=-]+`, JWT `eyJ[\w-]+\.[\w-]+\.[\w-]+` y correos. Cada coincidencia se sustituye por
  `[REDACTADO]` y el resto del texto queda igual.
- **Estructura:** recorre objetos y arreglos con un `WeakSet` (`[CIRCULAR]`) y profundidad máxima 8
  (`[PROFUNDO]`); un `Error` se serializa como `{ name, message: redactarTexto(message) }` (sin `stack`);
  `Date`, números y booleanos pasan igual; no muta la entrada.
- **Nunca lanza:** todo en `try/catch`; si falla devuelve `MARCA_REDACTADO` para ese valor.

### `utils/logger.ts`
```ts
const emitir = (nivel, salida) => (message: string, meta?: Record<string, unknown>): void => {
  const m = meta ? redactar(meta) : undefined;
  salida(JSON.stringify({ level: nivel, message: redactarTexto(message), ...(m as object), ts: new Date().toISOString() }));
};
```
El formato (`level`, `message`, campos del meta, `ts`) no cambia; los campos redactados conservan su
clave con `[REDACTADO]`. Si `redactar` o el `JSON.stringify` fallan, se emite solo `{ level, message, ts }`.

### `apps/frontend/vercel.json`
```jsonc
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "Content-Security-Policy", "value": "<ver abajo>" },
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "Permissions-Policy", "value": "microphone=(self), camera=(), geolocation=()" }
    ]
  }]
}
```
(Vercel sirve primero el sistema de archivos y solo después aplica el rewrite, así que los assets y el
`favicon.svg` no se ven afectados.)

**CSP** (una sola línea en el JSON; aquí partida por legibilidad; `API` = `https://api.sofiapp.co`):
```
default-src 'self';
script-src  'self' https://checkout.wompi.co https://connect.facebook.net;
style-src   'self' 'unsafe-inline';
img-src     'self' data: blob: https://api.sofiapp.co https://*.digitaloceanspaces.com https://*.facebook.com;
media-src   'self' blob: https://api.sofiapp.co https://*.digitaloceanspaces.com;
font-src    'self' data:;
connect-src 'self' https://api.sofiapp.co wss://api.sofiapp.co https://*.wompi.co
            https://graph.facebook.com https://www.facebook.com https://cdn.jsdelivr.net;
frame-src   https://checkout.wompi.co https://www.facebook.com https://web.facebook.com;
form-action 'self' https://checkout.wompi.co;
object-src  'none'; base-uri 'self'; frame-ancestors 'none';
```
Justificación de cada origen (para el comentario del test y de `wompi.md`):
| Origen | Por qué |
|---|---|
| `checkout.wompi.co` | `widget.js` (script), el iframe del Widget y el `<form>` GET del Web Checkout. |
| `*.wompi.co` (connect) | el Widget consulta la API (`sandbox.`/`production.`/`checkout.`). |
| `connect.facebook.net` | `src/lib/facebook-sdk.ts` carga el SDK de Embedded Signup. |
| `*.facebook.com`, `graph.facebook.com` | frames/popup y llamadas del SDK. |
| `api.sofiapp.co` (https + wss) | `apiClient` y Socket.IO; también imágenes/audio de `/api/media/:id`. |
| `*.digitaloceanspaces.com` | destino de la redirección prefirmada de la media (`MEDIA_DRIVER=spaces`). |
| `cdn.jsdelivr.net` | `frimousse` descarga los datos de emojis bajo demanda. |
| `blob:`, `data:` | grabadora de notas de voz y previsualizaciones, y SVG inlinados por Vite. |
| `style-src 'unsafe-inline'` | Radix, `sonner` y `@xyflow/react` inyectan estilos en línea. Es el único `unsafe-inline` y no cubre scripts. |

El origen del API aparece **una vez por esquema** y el test lo extrae del `vercel.json`; si el dominio
real no es `sofiapp.co`, se cambia ahí y en `00-deploy.md`.

### `scripts/check-bundle-secrets.mjs`
```js
export const PATRONES_SECRETOS = [/prv_(?:test|prod)_/, /(?:test|prod)_events_/, /(?:test|prod)_integrity_/];
export const NOMBRES_VITE_PROHIBIDOS = /(?:PRIVATE|SECRET|INTEGRITY|EVENTS)/i;
/** @returns hallazgos: [{ tipo: 'bundle' | 'variable', ubicacion: string, patron: string }] — nunca el valor. */
export function escanear({ dist, env }) { ... }
// CLI (solo si es el módulo principal): escanea ./dist y process.env; imprime tipo/ubicación/patrón; process.exit(1) si hay hallazgos.
```
- Recorre `dist/**` (`.js`, `.css`, `.html`, `.map`) y busca los patrones; la llave **pública** (`pub_…`)
  está permitida.
- Revisa `Object.keys(env)` con prefijo `VITE_` contra `NOMBRES_VITE_PROHIBIDOS`
  (`VITE_WOMPI_PUBLIC_KEY` no coincide: `PUBLIC` no está en la lista).
- Los mensajes dicen **dónde** y **qué patrón**, nunca el texto encontrado.
- `package.json`: `"build": "tsc --noEmit && vite build && node scripts/check-bundle-secrets.mjs"`.
  Vercel ejecuta `pnpm build`, así que corre también en producción.

## Notas

- **Orden de entrega.** Esta spec va **tercera** y apilada: `feat/HT-PAY-05` sale de `feat/HT-PAY-01`
  (que sale de `feat/HT-PAY-04`). Las tres se liberan en un **único PR a `develop`**. Hay que
  implementar y dejar en verde HT-PAY-01 antes de empezar esta; la rama de HT-PAY-01 todavía no existe.
  En `/sdd-release`, un solo CHANGELOG y un solo tag para las tres, citando los IDs.
- **No existe `vercel.json` hoy**, así que el SPA se sirve sin CSP y el rewrite está configurado a mano
  en el panel de Vercel (`00-deploy.md` Fase 7 §2). Con el archivo, el rewrite pasa a versionarse; el del
  panel queda redundante y puede quitarse.
- **Riesgo de la CSP.** Es lo único de este feature que puede romper la app existente (no hay
  `Report-Only`). La lista de orígenes sale de leer el código (`grep` de URLs en `src/`, el SDK de
  Facebook, `frimousse`, la media). Cualquier recurso de terceros que no esté en esa lista se bloqueará
  en producción: por eso la verificación manual en un deploy de preview es una tarea explícita.
- **Widget de Wompi.** Puede cargar recursos propios que no estén en la tabla (fuentes, analítica,
  verificación antifraude). La lista es el mínimo documentado; HT-PAY-06 la contrasta en sandbox con la
  consola del navegador y se ajusta ahí. Los frames **anidados** dentro del iframe de Wompi (3-D Secure
  del banco) no los gobierna la CSP de SofiApp.
- **`key`/`tokens` en logs.** Hay llamadas existentes con claves legítimas que una regla por subcadena
  rompería (`key` en `media.service.ts`, métricas de tokens de IA). Por eso la lista es exacta; la tarea
  de revisión hace un `grep` de los `logger.*(` del backend para confirmarlo.
- **Qué NO hace la redacción:** no sanea lo que se escriba con `console.*` directo (ya hay
  `console.error` en el arranque de `env.ts`, que no imprime valores) ni protege un secreto que alguien
  concatene dentro de un texto con un formato no cubierto por los patrones. Es defensa en profundidad:
  la regla sigue siendo no registrar PII.
- **IP real.** Con `TRUST_PROXY_HOPS` correcto, `req.ip` es la del cliente: también lo usará HU-BILL-02 para
  `aceptaciones.ip` (Habeas Data). Con valor equivocado, todos compartirían la IP del proxy.
- **Instalación de dependencias.** Si falla por el certificado corporativo, ver la memoria de
  instalación (`--strict-ssl=false`). Fijar la versión instalada, no un rango flotante.
- **Frontend sin UI.** No se crea ni modifica ningún componente: la regla 7 del `CLAUDE.md` raíz
  (skills de diseño y shadcn) no aplica.

## Verificación

- `pnpm --filter @sofiapp/api typecheck` · `pnpm --filter @sofiapp/api test`.
- `pnpm --filter @sofiapp/web build` (incluye `check-bundle-secrets`) · `pnpm --filter @sofiapp/web lint` ·
  `pnpm --filter @sofiapp/web test`.
- Tests nuevos: `log-redaction`, `logger`, `security-headers.middleware`, `rate-limit.middleware`
  (incluye fallo abierto y aislamiento por tenant), `app.security` (cabeceras, `trust proxy`, 429 del
  webhook sobre `app` real), `check-bundle-secrets` y `vercel-config`.
- **Manual, a cargo del usuario** (en un deploy de preview de Vercel, antes de producción; consola del
  navegador sin violaciones de CSP): login, bandeja con Socket.IO, imagen y audio de la conversación,
  nota de voz (micrófono), selector de emojis, popup de *Embedded Signup* de Facebook. El Widget de Wompi
  se comprueba en HU-BILL-02 / HT-PAY-06.
