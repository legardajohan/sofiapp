# 00 — Orden de despliegue de SofiApp (de cero a producción)

> Guía operativa **en orden de dependencias**: cada fase deja listo algo que la siguiente necesita.
> Complementa `docs/architecture.md` §6 (qué se despliega) diciendo **en qué orden** configurarlo.
> Las variables de entorno citadas son las que valida `apps/backend/src/config/env.ts`: si una
> obligatoria falta, el proceso **aborta al arrancar** (es intencional, no un bug).

## Mapa general

```
Fase 0  Trámites largos (arrancan YA, corren en paralelo)  ── Meta Business, dominio
Fase 1  Compras y cuentas                                  ── VPS, Atlas, Google AI, storage, Vercel
Fase 2  Dominio y DNS                                       ── api.<dominio>, app.<dominio>
Fase 3  Servidor (VPS)                                      ── SO, Docker+Redis, Node, Nginx, HTTPS
Fase 4  Datos                                               ── Atlas, índices vectoriales
Fase 5  Secretos y .env de producción
Fase 6  Backend: build + procesos web/worker (PM2)
Fase 7  Frontend en Vercel
Fase 8  Meta: app, webhook, Embedded Signup, App Review
Fase 9  Gemini en producción
Fase 10 CI/CD, backups, monitoreo
Fase 11 Smoke test end-to-end y onboarding del primer tenant
```

Arquitectura de destino:

```
 Navegador ──HTTPS──► app.<dominio>  (Vercel, SPA)
     │
     └──HTTPS/WSS──► api.<dominio>  (VPS: Nginx → web :4000 [Express + Socket.IO])
                                          │            ▲ pub/sub tiempo real
 Meta Cloud API ──webhook──► /api/webhooks/whatsapp     │
                                          ▼            │
                                    Redis (Docker) ◄── worker (BullMQ)
                                          │                 ├─► Gemini API
                                          │                 ├─► Graph API (Meta)
                                          ▼                 └─► Spaces / R2 (media)
                                   MongoDB Atlas (+ Vector Search)
```

---

## Fase 0 — Trámites con tiempos de espera largos (empezar el día 1)

Estos pasos no dependen del código y **pueden tardar días o semanas**. Arráncalos primero y deja
que avancen mientras haces el resto.

| # | Paso | Por qué va primero |
|---|---|---|
| 0.1 | **Comprar el dominio** (p. ej. `sofiapp.co`). | Meta pide URLs públicas (política de privacidad, términos, dominio de la app). El webhook necesita HTTPS con dominio fijo. La cookie de sesión necesita que app y API compartan dominio padre (ver Fase 2). |
| 0.2 | Crear el **Business Portfolio de SofiApp** en business.facebook.com e iniciar la **verificación del negocio** (RUT/Cámara de Comercio, dominio verificado, teléfono). | La verificación es requisito para obtener Tech Provider y Advanced Access, y suele ser lo más lento. |
| 0.3 | Publicar en el dominio la **política de privacidad**, los **términos de servicio** y la **URL o instrucciones de eliminación de datos**. | Meta no deja pasar la app a modo *Live* ni aprobar App Review sin ellas. |
| 0.4 | Crear la **app de Meta** (tipo *Business*) en developers.facebook.com, vinculada al Portfolio, y agregarle el producto **WhatsApp**. | Te da `META_APP_ID` y `META_APP_SECRET`, que el backend necesita para arrancar (Fase 5). |
| 0.5 | Iniciar el proceso de **Tech Provider** (ver `docs/adr/0010-modelo-tech-provider.md`). | Es la condición para que cada tenant conecte su WABA por Embedded Signup. |

> El **App Review** (Advanced Access a `whatsapp_business_management` y
> `whatsapp_business_messaging`) **no** se puede enviar todavía: Meta pide un screencast del flujo
> funcionando en producción. Va en la Fase 8.

---

## Fase 1 — Compras y cuentas

| # | Servicio | Qué contratar | Notas |
|---|---|---|---|
| 1.1 | **VPS** (Hostinger KVM o Droplet de DigitalOcean) | Ubuntu 24.04 LTS, **2 vCPU / 4–8 GB RAM** mínimo, en una región de América (Atlas en la misma región o en la más cercana). | **No** sirve hosting compartido ni "Node.js administrado": no permiten worker permanente, Redis/Docker ni WebSockets. |
| 1.2 | **MongoDB Atlas** | Cluster **M10 o superior**. | `create-kb-vector-index.ts` y `create-kb-faq-vector-index.ts` documentan que el índice vectorial (RAG + FAQ semántica) necesita M10+. Sin él la base de conocimiento no recupera nada. Con M10 tienes además backups continuos. |
| 1.3 | **Google AI Studio / Google Cloud** | Proyecto con **facturación activa** (tier de pago) y una **API key de Gemini**. | El tier gratuito tiene límites de RPM muy bajos y puede usar tus datos para entrenar modelos. En producción, siempre el de pago. |
| 1.4 | **Almacenamiento S3-compatible** para la media del chat | **DigitalOcean Spaces** (lo previsto en ADR-0008) o **Cloudflare R2** (no cobra salida de datos). | Basta con que sea S3-compatible: se configura con `SPACES_*` (Fase 5). Bucket **privado**: el backend sirve URLs prefirmadas. |
| 1.5 | **Vercel** | Plan Hobby para empezar. Pasa a Pro si hay uso comercial o equipo. | El plan Hobby de Vercel es para uso no comercial; un SaaS cobrado debería ir en Pro. |
| 1.6 | **GitHub** | Repo existente. | Para CI/CD (Fase 10). Secretos en *GitHub Actions secrets*, nunca en el repo. |
| 1.7 | (Opcional) Monitoreo | UptimeRobot / Better Stack (uptime), Sentry (errores). | Ver Fase 10. |

> **Quién paga los mensajes de WhatsApp:** con el modelo Tech Provider, **cada tenant le paga a Meta
> directamente** con el método de pago de su WABA. SofiApp no compra crédito de mensajería
> (`docs/integrations/meta-whatsapp.md` §2).

---

## Fase 2 — Dominio y DNS

| Registro | Apunta a | Uso |
|---|---|---|
| `A api.<dominio>` | IP pública del VPS | API REST, Socket.IO y webhook de Meta. |
| `CNAME app.<dominio>` | `cname.vercel-dns.com` (lo indica Vercel) | SPA. |
| `TXT` de verificación | lo que pida Meta Business | Verificación del dominio en el Portfolio (Fase 0.2). |
| (Opcional) `CNAME media.<dominio>` | bucket | Solo si quieres un dominio propio para la media. |

**Por qué subdominios del mismo dominio y no `*.vercel.app`:** el JWT viaja en una cookie
`httpOnly` (`apps/backend/src/utils/cookies.util.ts`, ADR-0002). Con `app.<dominio>` y
`api.<dominio>` ambos son *same-site*, así que basta `COOKIE_SAMESITE=lax` y
`COOKIE_DOMAIN=.<dominio>`. Desde `*.vercel.app` hacia tu API la cookie sería de terceros: habría que
usar `SameSite=None` y Safari, o Chrome con cookies de terceros bloqueadas, la descartarían igual.

---

## Fase 3 — Preparar el servidor (VPS)

En este orden:

1. **Acceso y endurecimiento**
   - Crear un usuario no root con `sudo`, entrar con **llave SSH** y desactivar el login por
     contraseña y el de root.
   - Firewall (`ufw`): permitir **22, 80 y 443** y nada más. **Redis (6379) y el puerto 4000 de
     Node no se exponen** a Internet.
   - `unattended-upgrades` para parches de seguridad. Opcional: `fail2ban`.
   - Zona horaria UTC. La aplicación maneja las zonas por su cuenta.
2. **Docker + Docker Compose** (repositorio oficial de Docker).
3. **Redis en Docker.** Toma como base el `docker-compose.yml` del repo, con estos cambios para
   producción:
   - Publicar el puerto **solo en loopback**: `127.0.0.1:6379:6379`. El compose actual expone
     `6379:6379` en todas las interfaces, aceptable en dev pero peligroso en un VPS. Además Docker
     se salta `ufw` al publicar puertos.
   - Persistencia AOF (`--appendonly yes`) y `--maxmemory-policy noeviction`. **BullMQ exige
     `noeviction`**: con otra política Redis puede descartar jobs en silencio.
   - `requirepass` con una contraseña fuerte, que luego va en `REDIS_URL`
     (`redis://:<pass>@127.0.0.1:6379`).
4. **Node.js 24 LTS** (nvm o NodeSource) + **pnpm 9.15** (`corepack enable`) + **PM2** global.
5. **Nginx** como proxy inverso de `api.<dominio>` → `127.0.0.1:4000`:
   - Cabeceras de **upgrade WebSocket** (`Upgrade`, `Connection "upgrade"`) para Socket.IO.
   - `client_max_body_size 20m`: la media sube hasta 16 MB (`MEDIA_MAX_BYTES_*`) y Nginx corta en
     1 MB por defecto.
   - `proxy_read_timeout` ≥ 60 s.
6. **HTTPS con certbot** (`certbot --nginx -d api.<dominio>`) con renovación automática. Meta exige
   un certificado válido en el webhook.
7. **ffmpeg:** no hace falta instalarlo. `ffmpeg-static`/`ffprobe-static` bajan sus binarios en el
   `pnpm install` (ADR-0009). Solo si instalas con `--ignore-scripts` hay que poner el del sistema
   y definir `FFMPEG_PATH`/`FFPROBE_PATH`.

---

## Fase 4 — Datos (MongoDB Atlas)

1. Crear el cluster (M10+) en la región más cercana al VPS.
2. **Network Access:** permitir **solo la IP del VPS** (y la tuya temporalmente para administrar).
   Nunca `0.0.0.0/0`.
3. **Database Access:** usuario de aplicación con `readWrite` sobre la base de SofiApp. Con eso
   obtienes el `MONGODB_URI`.
4. Activar backups (M10+ incluye *continuous cloud backup*).
5. **Índices vectoriales.** Correr una vez, desde el VPS, ya con el `.env` de la Fase 5:
   ```bash
   pnpm --filter @sofiapp/api exec tsx --env-file .env src/scripts/create-kb-vector-index.ts
   pnpm --filter @sofiapp/api exec tsx --env-file .env src/scripts/create-kb-faq-vector-index.ts
   ```
   Son idempotentes. Si cambias `KB_EMBED_DIM` o `GEMINI_EMBED_MODEL` hay que recrearlos y
   reindexar la KB.
6. Los **scripts `migrate:*` / `backfill:*`** de `apps/backend/package.json` son para bases con
   datos previos. En una base nueva **no se corren**.

---

## Fase 5 — Secretos y `.env` de producción

Generar cada secreto **por separado** (no reutilizar los de desarrollo):

```bash
openssl rand -hex 32   # → TENANT_TOKEN_ENC_KEY, MEDIA_URL_SECRET (64 hex exactos)
openssl rand -base64 48  # → JWT_SECRET, CSRF_SECRET (≥ 32 caracteres)
openssl rand -hex 24   # → META_VERIFY_TOKEN (cualquier cadena secreta)
```

`apps/backend/.env` en el VPS (permisos `600`, fuera de git):

| Grupo | Variables | Obligatoria |
|---|---|---|
| Base | `NODE_ENV=production`, `PORT=4000`, `WEB_ORIGIN=https://app.<dominio>` | sí (`WEB_ORIGIN` es el único origen que acepta CORS) |
| Auth | `JWT_SECRET`, `CSRF_SECRET`, `JWT_EXPIRES_IN=8h`, `COOKIE_DOMAIN=.<dominio>`, `COOKIE_SAMESITE=lax` | sí |
| Superadmin | `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` | **sí en production**: el arranque siembra el superadmin y sin ellas falla |
| Datos | `MONGODB_URI`, `REDIS_URL` | sí |
| Meta | `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_GRAPH_VERSION`, `TENANT_TOKEN_ENC_KEY` | sí (`META_APP_ID` es opcional técnicamente, pero sin ella el Embedded Signup responde 503) |
| Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_EMBED_MODEL`, `LLM_TIMEOUT_MS` | `GEMINI_API_KEY` sí; el resto trae defaults |
| Media | `MEDIA_DRIVER=spaces`, `MEDIA_URL_SECRET`, `SPACES_ENDPOINT`, `SPACES_REGION`, `SPACES_BUCKET`, `SPACES_KEY`, `SPACES_SECRET` | sí con `spaces`. **No usar `local` en producción**: la media quedaría solo en el disco del VPS |
| Afinación IA/campañas | `SEMAFORO_*`, `EXTRACT_*`, `TEMA_*`, `KB_*`, `FAQ_*`, `CAMPAIGN_*`, `REMINDER_*` | no, los defaults sirven para arrancar |

> `DATA_ENC_KEY` solo hace falta para leer datos cifrados heredados. En una base nueva se omite.
> **Guarda una copia de `TENANT_TOKEN_ENC_KEY`** en un gestor de secretos: si se pierde, los tokens
> de Meta de todos los tenants quedan ilegibles y cada uno tiene que reconectar su canal.

`META_GRAPH_VERSION`: confirma la vigente en el changelog de Graph API antes de fijarla
(`meta-whatsapp.md` §8).

---

## Fase 6 — Backend en el VPS (web + worker)

1. Clonar el repo y hacer checkout del tag o de `main`.
2. Instalar y compilar (el backend consume `@sofiapp/shared` desde su `dist/`, así que compílalo
   primero):
   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @sofiapp/shared build
   pnpm --filter @sofiapp/api build      # tsc → apps/backend/dist
   ```
3. **Dos procesos PM2** con el mismo código (`ecosystem.config.cjs`):
   - `sofiapp-web` → `node --env-file .env dist/app.js`, **1 sola instancia (modo fork, no
     cluster)**.
   - `sofiapp-worker` → `node --env-file .env dist/worker.js`, 1 instancia.
   > **No uses el modo cluster de PM2 en la web todavía.** ADR-0004 deja Socket.IO con una sola
   > instancia del gateway. Con varias, los eventos se duplican o se pierden y las conexiones con
   > *polling* fallan sin sticky sessions. Escalar la web requiere antes
   > `@socket.io/redis-adapter` (nuevo feature, no una opción de configuración).
   > Hoy no existe script `start` en `apps/backend/package.json`; conviene agregar `start:web` /
   > `start:worker` y el `ecosystem.config.cjs` al repo como parte del feature de infraestructura.
4. `pm2 startup` + `pm2 save` para que levanten con el servidor. `pm2 install pm2-logrotate`.
5. Verificar:
   - `curl https://api.<dominio>/api/...` (cualquier endpoint público) responde por HTTPS.
   - En el log de la web: conexión a Mongo y Redis, superadmin sembrado.
   - En el log del worker: colas registradas (`llm-process`, `outbound-send`,
     `campaign-broadcast`, …).

---

## Fase 7 — Frontend en Vercel

1. Importar el repo en Vercel, **Root Directory = `apps/frontend`**, framework Vite, build
   `pnpm build`, output `dist`. Comprueba que Vercel instale con pnpm desde la raíz del workspace.
   Si `@sofiapp/shared` no queda compilado, ajusta el install o build command a
   `pnpm --filter @sofiapp/shared build && pnpm --filter @sofiapp/web build`.
2. Rewrite SPA (todas las rutas → `index.html`) para que el router de React no dé 404 al
   recargar.
3. Variables de entorno (Production):
   | Variable | Valor |
   |---|---|
   | `VITE_API_BASE_URL` | `https://api.<dominio>`. También define el origen de Socket.IO (`src/lib/socket.ts`). Ajústala a la forma que espera `src/api/apiClient.ts` (con o sin `/api`) |
   | `VITE_META_APP_ID` | id de la app de Meta |
   | `VITE_META_CONFIG_ID` | id de la configuración de *Facebook Login for Business* (Fase 8.4) |
   | `VITE_META_GRAPH_VERSION` | igual a `META_GRAPH_VERSION` |
   > Las `VITE_*` se **incrustan al compilar**: cambiarlas exige redeploy. Nunca pongas un secreto
   > en una `VITE_*`, porque queda público en el bundle.
4. Asignar el dominio `app.<dominio>`.
5. Verificar: login con el superadmin desde `https://app.<dominio>`, la cookie queda puesta
   (DevTools → Application) y la bandeja conecta el socket sin errores de CORS.

---

## Fase 8 — Integración con Meta (WhatsApp Cloud API)

Requiere: Fase 0 en curso, backend y frontend ya en producción con HTTPS.

1. **Webhook** (App → WhatsApp → Configuration):
   - Callback URL: `https://api.<dominio>/api/webhooks/whatsapp`
   - Verify token: el mismo `META_VERIFY_TOKEN`. Meta hace el GET y el backend devuelve
     `hub.challenge`.
   - Suscribir los campos **`messages`** y **`message_template_status_update`**.
2. **App Secret:** confirma que `META_APP_SECRET` sea el de *esta* app. Si no coincide, toda firma
   HMAC falla con 403 y no entra ningún mensaje.
3. **Prueba con el número de test de Meta** (`+1 555…`). Usa la conexión manual con un token de
   **System User** (*expiration = Never*, permiso `whatsapp_business_messaging`), no el token
   temporal del dashboard, que dura menos de 24 h (`meta-whatsapp.md` §9).
4. **Embedded Signup** (`meta-whatsapp.md` §2):
   - Crear una configuración de **Facebook Login for Business** de tipo *WhatsApp Embedded
     Signup*. Su id va en `VITE_META_CONFIG_ID` (redeploy de Vercel).
   - *Login with the JavaScript SDK* = **Yes**, con dominio permitido `app.<dominio>` (y
     `localhost` para dev).
5. **App Review → Advanced Access** a `whatsapp_business_management` y
   `whatsapp_business_messaging`: screencast del flujo real (conectar canal, recibir y responder un
   mensaje, plantillas), descripción de uso y las URLs legales de la Fase 0.3.
6. Pasar la app a modo **Live**.
7. **Tech Provider aprobado** + Advanced Access: desde aquí cualquier tenant puede conectar su
   WABA solo con «Conectar con Facebook».

> Mientras no tengas Advanced Access, solo las cuentas con rol en la app de Meta pueden completar
> el Embedded Signup. Para un primer cliente piloto puedes darle un rol de tester o conectarlo de
> forma manual.

---

## Fase 9 — Gemini en producción

1. En Google AI Studio o Cloud Console, con facturación activa, crear una **API key dedicada a
   producción**, restringida a la *Generative Language API*. Si la consola lo permite, restringirla
   también por IP del VPS.
2. **Verificar que el modelo esté habilitado para tu key**: `env.ts` documenta que modelos viejos
   devuelven 404 *"no longer available to new users"* con keys nuevas. Prueba `GEMINI_MODEL` y
   `GEMINI_EMBED_MODEL` antes de subir tráfico.
3. Configurar **alertas y tope de presupuesto** en Google Cloud Billing. El costo crece con
   auto-reply, semáforo, extracción y tema (`SEMAFORO_AUTO`, `EXTRACT_AUTO`, `TEMA_AUTO` son
   *kill-switches* `on|off` para cortar gasto sin desplegar).
4. Revisar las cuotas (RPM/TPM) del proyecto y pedir aumento si los tenants lo requieren.
5. Las llamadas a Gemini salen **solo del worker** (`llm-process`). Si la IA no responde, mira
   primero el log del worker, no el de la web.

---

## Fase 10 — CI/CD, backups y monitoreo

1. **GitHub Actions** (según `architecture.md` §6): en PR → `typecheck`, `test`, `build`, `lint`.
   En push a `main` → deploy al VPS por SSH (`git pull` + `pnpm install --frozen-lockfile` + build +
   `pm2 reload sofiapp-web sofiapp-worker`). Vercel despliega el frontend solo.
2. **Backups:**
   - Mongo: backups de Atlas (Fase 4).
   - Redis: AOF en volumen persistente. Contiene colas, no datos de negocio. Perderlo cuesta jobs
     en vuelo, no clientes.
   - Media: activar versionado o ciclo de vida en el bucket.
   - Secretos: `.env` de producción en un gestor de contraseñas (con `TENANT_TOKEN_ENC_KEY` y
     `MEDIA_URL_SECRET`).
   - Snapshot periódico del VPS (Hostinger y DigitalOcean lo ofrecen).
3. **Monitoreo:** uptime de `https://api.<dominio>` y `https://app.<dominio>`; alertas de disco,
   RAM y CPU del VPS; `pm2 logs` con rotación. Opcional: Sentry en web, worker y frontend.

---

## Fase 11 — Smoke test end-to-end y primer tenant

Checklist antes de dar acceso al cliente:

- [ ] Login superadmin en `https://app.<dominio>` (light y dark).
- [ ] Crear el tenant y su usuario admin desde el panel superadmin.
- [ ] El admin del tenant conecta su número (Embedded Signup o manual).
- [ ] Mensaje entrante desde un celular real → aparece en la bandeja **en tiempo real** (prueba
      webhook → worker → Redis pub/sub → Socket.IO).
- [ ] Respuesta manual dentro de la ventana de 24 h → llega al celular.
- [ ] Imagen y nota de voz entrantes y salientes (prueba Spaces/R2 y ffmpeg).
- [ ] Auto-reply de IA y RAG con un documento cargado en la KB (prueba Gemini y el índice
      vectorial).
- [ ] Crear una plantilla HSM → el estado pasa a `APPROVED` por webhook (o por el sync de
      `TEMPLATE_SYNC_INTERVAL_MS`).
- [ ] Campaña pequeña a 2–3 contactos de prueba.
- [ ] **Aislamiento:** con un segundo tenant de prueba, comprobar que ninguno ve datos del otro.

---

## Resumen: qué hacer primero

1. **Hoy:** dominio + Business Portfolio + verificación de Meta + páginas legales + crear la app de
   Meta.
2. **En paralelo:** contratar VPS, Atlas M10, Gemini con facturación, bucket S3 y Vercel.
3. **Después:** DNS → servidor → datos → `.env` → backend → frontend.
4. **Con todo arriba:** webhook de Meta → pruebas con número de test → Embedded Signup → App
   Review.
5. **Al final:** CI/CD, backups, monitoreo, smoke test y primer tenant.
