# HT-WA-01-V2 — Plan técnico (CÓMO)

## Archivos a modificar

```
apps/backend/src/
├── app.ts                                  # monta webhookRoutes ANTES de express.json()
├── config/env.ts                           # META_* y TENANT_TOKEN_ENC_KEY requeridas fuera de test
├── features/webhook/
│   └── webhook.service.ts                  # enqueueInboundJob con attempts + backoff
└── features/message/
    └── message.service.ts                  # saveMessage / updateDeliveryStatus vía *Scoped
docs/
├── data-model.md                           # + Cliente.ventana24hExpiraEn, + Message.status
└── integrations/meta-whatsapp.md           # ruta real /api/webhooks/whatsapp, 403 no 401
README.md                                   # sección "Conectar WhatsApp en desarrollo"
package.json (raíz)                         # script `tunnel`
docs/specs/HT-WA-01-whatsapp-base/tasks.md  # marcar la casilla 145 al superar la prueba E2E
```

## Archivos a crear

```
apps/backend/src/features/webhook/
└── webhook.routes.test.ts                  # integración Supertest sobre el app completo
apps/backend/src/features/message/
└── message.isolation.test.ts               # aislamiento de dedupe y delivery status por metaMessageId
```

## Contratos

### `app.ts` — orden de montaje

El webhook debe montarse **antes** del parser global. Es un `app.use` con path, así que solo
intercepta `/api/webhooks/whatsapp`; el resto del árbol sigue viendo `express.json()` igual que hoy.

```ts
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));

// Meta firma el HMAC sobre los bytes exactos del cuerpo. Este router usa `express.raw` y por eso
// se monta ANTES de `express.json()`: si el parser global corre primero, body-parser consume el
// stream y `req.body` llega como objeto, la firma no se puede recalcular y TODO webhook real
// falla. Regresión cubierta por `webhook.routes.test.ts`.
app.use('/api/webhooks/whatsapp', webhookRoutes);

app.use(express.json());
app.use(cookieParser());
app.use(csrfGuard);
```

`csrfGuard` ya exime `/api/webhooks/` (`csrf.middleware.ts:6`), y al montarse antes el webhook ni
siquiera lo atraviesa. La línea 58 actual (`app.use('/api/webhooks/whatsapp', webhookRoutes)`) se
elimina para no montarlo dos veces.

**Alternativa descartada:** usar el callback `verify` de `express.json()` para guardar
`req.rawBody`. Obliga a extender el tipo `Request` global y deja el cuerpo crudo colgando en todas
las rutas del API, no solo en el webhook. El movimiento de orden es más pequeño y más local.

### `webhook.service.ts` — reintentos del job

```ts
const INBOUND_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export async function enqueueInboundJob(tenantId: string, payload: IWhatsAppWebhookPayload): Promise<void> {
  await inboundQueue.add('process', { tenantId, payload }, INBOUND_JOB_OPTS);
}
```

El reintento es seguro porque el processor ya es idempotente: `upsertByMetaUser` deduplica el
cliente por `{tenantId, metaUserId}` y `saveMessage` deduplica por `metaMessageId`.

### `message.service.ts` — cerrar las dos fugas de aislamiento

Ambas queries usan el modelo directo, lo que viola la regla 1 del `CLAUDE.md` raíz. `metaMessageId`
es un identificador global de Meta, así que sin `tenantId` en el filtro un tenant puede leer y
**escribir** documentos de otro.

```ts
// ANTES (message.service.ts:17) — lectura cross-tenant
const existing = await Message.findOne({ metaMessageId: dto.metaMessageId }).lean();
// DESPUÉS
const existing = await findOneScoped(Message, tenantId, { metaMessageId: dto.metaMessageId }).lean();

// ANTES (message.service.ts:71) — ESCRITURA cross-tenant
export async function updateDeliveryStatus(metaMessageId: string, status: MessageStatus): Promise<void> {
  await Message.findOneAndUpdate({ metaMessageId }, { status });
}
// DESPUÉS — el tenantId ya es conocido en el processor
export async function updateDeliveryStatus(
  tenantId: string | Types.ObjectId,
  metaMessageId: string,
  status: MessageStatus,
): Promise<void> {
  await findOneAndUpdateScoped(Message, tenantId, { metaMessageId }, { status });
}
```

El único llamador es `workers/inbound-message.processor.ts:76`, que ya tiene `tenantId` en alcance
(línea 46). Se actualiza la llamada.

Además, el índice `{ metaMessageId: 1 }` de `message.model.ts` pasa a
`{ tenantId: 1, metaMessageId: 1 }` (sparse) para que el dedupe scoped tenga soporte de índice.

### `config/env.ts` — requeridas fuera de `test`

Las tres variables son `optional()` hoy, así que el server arranca sin ellas y falla en silencio:
sin `META_APP_SECRET`, `validateHmacSignature` devuelve `false` y **todo** webhook responde 403.

```ts
const isTest = process.env.NODE_ENV === 'test';
const requiredInRuntime = <T extends z.ZodTypeAny>(schema: T) =>
  isTest ? schema.optional() : schema;

META_APP_SECRET:      requiredInRuntime(z.string().min(1)),
META_VERIFY_TOKEN:    requiredInRuntime(z.string().min(1)),
META_GRAPH_VERSION:   z.string().default('v23.0'),   // confirmar la vigente al implementar
TENANT_TOKEN_ENC_KEY: requiredInRuntime(z.string().regex(/^[0-9a-fA-F]{64}$/, 'Must be 64 hex characters (32 bytes)')),
```

`vitest.config.ts` ya define las tres en su bloque `env`, así que los tests no se ven afectados.
`META_GRAPH_VERSION` debe confirmarse contra la documentación vigente de Meta en el momento de
implementar: `v19.0` está fuera de soporte.

### `webhook.routes.test.ts` — la regresión que faltaba

Sigue el patrón de `lead.routes.test.ts`: mock de `config/queues.js` para no tocar Redis, e import
de `app` después del mock.

```ts
vi.mock('../../config/queues.js', () => ({
  INBOUND_QUEUE_NAME: 'inbound-messages',
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  inboundQueue: { add: vi.fn() },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import app from '../../app.js';
import { inboundQueue } from '../../config/queues.js';

const APP_SECRET = 'test-app-secret-12345678901234';   // el mismo de vitest.config.ts

function sign(raw: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(raw).digest('hex')}`;
}

// El punto del test: `.set('Content-Type','application/json').send(raw)` con `raw` como STRING,
// para que supertest mande exactamente esos bytes y la firma sea comprobable.
await request(app)
  .post('/api/webhooks/whatsapp')
  .set('Content-Type', 'application/json')
  .set('X-Hub-Signature-256', sign(raw))
  .send(raw);
```

Casos: firma válida → 200 y `inboundQueue.add` llamado; firma inválida → 403 y `add` **no**
llamado; challenge GET con token válido → 200 + challenge; con token inválido → 403.

Requiere un `MetaIntegration` sembrado con el `phone_number_id` del payload para que
`resolveWebhookTenant` no descarte el evento.

### `message.isolation.test.ts`

- `saveMessage(tenantB, { metaMessageId: X, ... })` **crea** un mensaje aunque el tenant A ya tenga
  uno con `metaMessageId: X` (el dedupe es por tenant, no global).
- `updateDeliveryStatus(tenantB, X, 'read')` **no** modifica el mensaje del tenant A.

### `README.md` — conectar WhatsApp en desarrollo

Sección nueva con el procedimiento completo:

1. Levantar Redis (`docker start sofiapp-redis`), `pnpm dev:web` y **`pnpm dev:worker`** — sin el
   worker el webhook encola y nadie procesa.
2. Abrir el túnel: `pnpm tunnel` → `cloudflared tunnel --url http://localhost:4000`.
3. En Meta App Dashboard → WhatsApp → Configuration:
   - Callback URL: `<túnel>/api/webhooks/whatsapp` (con `whatsapp`, **no** `meta`).
   - Verify Token: el mismo valor de `META_VERIFY_TOKEN`.
   - Suscribir el campo **`messages`** de la WABA (sin esto Meta no envía nada).
4. En SofiApp, `/settings/channels/whatsapp`: pegar `WABA ID`, `Phone Number ID` y `Access Token`.
5. Escribir al número de prueba desde un celular y verificar en la bandeja.

Variables necesarias en `apps/backend/.env`: `META_APP_SECRET`, `META_VERIFY_TOKEN`,
`TENANT_TOKEN_ENC_KEY` (64 hex — generar con `openssl rand -hex 32`).

### `package.json` (raíz) — script de túnel

```json
"tunnel": "cloudflared tunnel --url http://localhost:4000"
```

`cloudflared` no se añade como dependencia (es un binario del sistema); el README indica cómo
instalarlo y menciona `ngrok http 4000` como alternativa.

## Notas

- **No** se toca `verifyChallenge`: la comparación simple del verify token es aceptable (no es un
  secreto de larga vida y Meta solo la usa en el alta del webhook).
- El `res.sendStatus(200)` antes de procesar (`webhook.controller.ts:29`) se mantiene: es el SLA de
  Meta y ya está bien resuelto.
- La resolución de tenant por `phone_number_id` sin scope (`webhook.service.ts:33`) se mantiene:
  es la excepción documentada en `docs/multi-tenancy.md` y en el `CLAUDE.md` raíz.

## Verificación

- `pnpm --filter backend typecheck`
- `pnpm --filter backend test` — con `webhook.routes.test.ts` y `message.isolation.test.ts` en verde.
- Prueba manual E2E con túnel y celular real (criterio 11 del `spec.md`).
