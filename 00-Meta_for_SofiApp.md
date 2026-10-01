# Configurar Meta for Developers para SofiApp (Embedded Signup real)

> Objetivo: que el botón **«Conectar con Facebook»** de `/settings/channels/whatsapp` funcione con
> cuentas reales de Facebook (no solo números de prueba).
>
> **Aviso sobre los menús de Meta.** Los pasos de la consola de Meta salen de la documentación del
> proyecto (`docs/integrations/meta-whatsapp.md` §2 y §8) y de cómo suele organizarse el panel.
> Meta reorganiza los menús con frecuencia: si un nombre no coincide exactamente, busca el
> equivalente cercano. No pude verificar la consola en vivo.

---

## 0. Por qué aparece el mensaje y el botón deshabilitado

El mensaje *«La conexión con Facebook no está configurada en este entorno»* sale de
`apps/frontend/src/features/channels/components/ConnectWhatsAppPanel.tsx`. El botón se habilita solo
si el **frontend** tiene definidas `VITE_META_APP_ID` y `VITE_META_CONFIG_ID`.

Por qué ahora se piden variables en el front si el back ya estaba configurado: el login con
Facebook se abre **en el navegador** (SDK de JavaScript de Facebook), que necesita saber qué app y
qué configuración usar. El backend, en cambio, solo canjea el `code` resultante con el App Secret.
Por eso antes bastaba con el back (el flujo manual / números de prueba no usa el popup).

---

## 1. Resumen de variables

### Backend — `apps/backend/.env` (ya las tenías; verifica `META_APP_ID`)

```
META_APP_ID=<App ID>             # sin esta, POST /embedded-signup responde 503
META_APP_SECRET=<App Secret>
META_VERIFY_TOKEN=<token del webhook>
META_GRAPH_VERSION=v26.0
TENANT_TOKEN_ENC_KEY=<64 hex>
```

`META_APP_ID` es opcional para el arranque (no aborta si falta), por eso es fácil que no la tengas
si antes solo usabas el webhook. Debe ser **el mismo App ID** que va en el front.

### Frontend — crear `apps/frontend/.env.local` (hoy no existe ningún `.env` del front)

```
VITE_META_APP_ID=<App ID>
VITE_META_CONFIG_ID=<Configuration ID>
VITE_META_GRAPH_VERSION=v26.0
```

Las variables `VITE_*` se leen solo al arrancar Vite: **reinicia el front** tras crear el archivo.

---

## 2. Dónde obtener cada valor en Meta for Developers

Entra a <https://developers.facebook.com/apps/> → selecciona tu app.

### 2.1 App ID y App Secret

- Menú izquierdo: **App settings → Basic** (en español: *Configuración de la app → Básica*).
- **App ID** → va en `META_APP_ID` (back) y `VITE_META_APP_ID` (front).
- **App Secret** → clic en *Show*; va en `META_APP_SECRET` (solo back, nunca en el front).

### 2.2 Productos que debe tener la app

En el panel de la app: **Add product** (o *Agregar producto*) y añade:

1. **WhatsApp** (ya lo tienes, usabas los números de prueba).
2. **Facebook Login for Business** (distinto de «Facebook Login» a secas).

### 2.3 Crear la configuración de Embedded Signup → `VITE_META_CONFIG_ID`

1. Menú izquierdo: **Facebook Login for Business → Configurations**.
2. Botón **Create configuration**.
3. Nombre libre (p. ej. `SofiApp Embedded Signup`).
4. Tipo / plantilla de login: elige **WhatsApp Embedded Signup**.
5. Productos/permisos: deja marcados `whatsapp_business_management` y
   `whatsapp_business_messaging`.
6. Guarda. El **Configuration ID** que muestra la lista es tu `VITE_META_CONFIG_ID`.

### 2.4 Habilitar el SDK de JavaScript y los dominios permitidos

1. Menú izquierdo: **Facebook Login for Business → Settings**.
2. **Login with the JavaScript SDK** → **Yes**.
3. **Allowed domains for the JavaScript SDK** → agrega:
   - `localhost` (desarrollo)
   - el dominio de tu ngrok, si abres el front por ngrok (ver §5)
   - el dominio de Vercel en producción
4. **Valid OAuth Redirect URIs**: según la doc del proyecto no hace falta para este flujo.
5. Guarda cambios.

### 2.5 Modo de la app: Live

Arriba en el panel hay un interruptor **App mode: Development / Live**.

- En **Development** solo pueden conectar los administradores, desarrolladores y testers de la app.
- Para que **cualquier cuenta de Facebook** (tus tenants) conecte, la app debe estar en **Live**.
- Para pasar a Live Meta exige, entre otros, una **Privacy Policy URL** y la verificación del
  negocio. Se configuran en *App settings → Basic*.

### 2.6 Permisos en producción: Advanced Access y Tech Provider

- Menú: **App Review → Permissions and features**.
- `whatsapp_business_management` y `whatsapp_business_messaging` deben tener **Advanced Access**
  (se solicita con App Review; requiere una demo en video del flujo).
- Con solo *Standard Access* el flujo funciona únicamente con cuentas que tengan rol en la app.
- Para ofrecerlo a clientes externos la app debe tener estado **Tech Provider** (requiere el
  **Business Portfolio de SofiApp verificado**: *Business Settings → Security Center → Business
  verification*).

### 2.7 Webhook (ya lo tenías, solo recordatorio)

- Menú izquierdo: **WhatsApp → Configuration**.
- **Callback URL**: `https://<tu-ngrok>/<ruta del webhook de SofiApp>` (la misma que usabas).
- **Verify token**: el mismo valor de `META_VERIFY_TOKEN`.
- Suscríbete al campo **messages**.
- No hace falta suscribir manualmente cada WABA de tenant: el Embedded Signup lo hace solo
  (paso 7 del flujo: `POST /{wabaId}/subscribed_apps`).

---

## 3. Qué necesita cada tenant (cliente) para conectar

- Una cuenta de Facebook y un Business Portfolio (se puede crear dentro del popup).
- Un número que **no** esté activo en la app de WhatsApp Business del celular: al conectarlo por
  la Cloud API deja de funcionar ahí (no hay coexistencia en este flujo).
- Un **método de pago** cargado en su WABA: con el modelo Tech Provider, **Meta le factura al
  tenant**, no a SofiApp.
- Verificar su negocio es recomendable (sube límites de envío) pero no bloquea la conexión.
- Los **números de prueba** (`+1 555-...`) no sirven con este flujo: el popup trabaja con la WABA
  y el número reales del negocio.

---

## 4. Orden de arranque en desarrollo

1. Docker (Mongo / Redis).
2. Backend.
3. Worker.
4. Frontend (**reiniciado** tras crear `apps/frontend/.env.local`).
5. ngrok.
6. Si ngrok cambió de dominio (plan gratuito: cambia en cada ejecución), actualizar la **Callback
   URL** en *WhatsApp → Configuration* (y los dominios permitidos si usas el front por ngrok).

---

## 5. Problemas típicos

| Síntoma | Causa probable |
|---|---|
| Botón deshabilitado + mensaje «no está configurada» | Falta `VITE_META_APP_ID` o `VITE_META_CONFIG_ID`, o no se reinició Vite. |
| El popup se abre pero dice que la app no está disponible / en desarrollo | App en modo **Development** y la cuenta no tiene rol en la app. Pasar a **Live** o añadir la cuenta como tester. |
| El popup no abre o falla el SDK en `localhost` | Dominio no listado en *Allowed domains for the JavaScript SDK*, o el SDK exige HTTPS: abre el front por ngrok y agrega ese dominio. (No verificado: es la causa típica.) |
| `POST /embedded-signup` responde 503 | Falta `META_APP_ID` en el `.env` del backend. |
| Error al canjear el `code` | `META_APP_SECRET` incorrecto, o el `code` caducó (dura ~30 s). |
| No llegan mensajes entrantes tras conectar | Webhook no verificado/suscrito a `messages`, o ngrok cambió de dominio. |
| El popup no ofrece el número que quieres | Está activo en la app de WhatsApp Business del celular; hay que desvincularlo antes. |

---

## 6. Referencias internas

- `docs/integrations/meta-whatsapp.md` — §2 (Embedded Signup), §8 (variables de entorno).
- `docs/adr/0010-modelo-tech-provider.md` — por qué Tech Provider y quién paga.
- `apps/frontend/src/features/channels/components/ConnectWhatsAppPanel.tsx` — origen del mensaje.
