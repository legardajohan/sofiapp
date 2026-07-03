# HT-WA-01 — Plan técnico (CÓMO)

## Archivos a crear / tocar

```
apps/backend/src/
├── config/
│   └── queues.ts                               # [NUEVO] nombres de queues BullMQ + conexión Redis
├── utils/
│   └── crypto.util.ts                          # [NUEVO] encrypt/decrypt AES-256-GCM
├── integrations/
│   └── meta/
│       ├── messaging-provider.interface.ts     # [NUEVO] IMessagingProvider
│       ├── meta-whatsapp.client.ts             # [NUEVO] sendText, sendTemplate (implementa IMessagingProvider)
│       └── meta-whatsapp.normalizer.ts         # [NUEVO] parsea payload → ICreateMessageDto[]
├── features/
│   ├── channel/
│   │   ├── channel.types.ts                    # [NUEVO]
│   │   ├── channel.model.ts                    # [NUEVO] MetaIntegration schema
│   │   ├── channel.validation.ts               # [NUEVO]
│   │   ├── channel.service.ts                  # [NUEVO]
│   │   ├── channel.controller.ts               # [NUEVO]
│   │   └── channel.routes.ts                   # [NUEVO]
│   ├── cliente/
│   │   ├── cliente.types.ts                    # [NUEVO]
│   │   ├── cliente.model.ts                    # [NUEVO] incluye ventana24hExpiraEn
│   │   ├── cliente.validation.ts               # [NUEVO] placeholder (M02 extiende)
│   │   ├── cliente.service.ts                  # [NUEVO] upsertByMetaUser
│   │   ├── cliente.controller.ts               # [NUEVO] placeholder
│   │   └── cliente.routes.ts                   # [NUEVO] placeholder
│   ├── message/
│   │   ├── message.types.ts                    # [NUEVO]
│   │   ├── message.model.ts                    # [NUEVO] incluye status
│   │   ├── message.validation.ts               # [NUEVO]
│   │   ├── message.service.ts                  # [NUEVO] saveMessage, sendMessage, updateDeliveryStatus
│   │   ├── message.controller.ts               # [NUEVO]
│   │   └── message.routes.ts                   # [NUEVO]
│   └── webhook/
│       ├── webhook.types.ts                    # [NUEVO] tipos del payload de Meta
│       ├── webhook.validation.ts               # [NUEVO] Zod para verify query
│       ├── webhook.service.ts                  # [NUEVO] verifyChallenge, validateHmac, resolveWebhookTenant, enqueue
│       ├── webhook.controller.ts               # [NUEVO]
│       └── webhook.routes.ts                   # [NUEVO] rutas PÚBLICAS sin auth
├── workers/
│   └── inbound-message.processor.ts            # [NUEVO] BullMQ processor
└── app.ts                                      # [MODIFICAR] montar 4 grupos de rutas
```

```
apps/frontend/src/
└── features/
    └── channels/
        ├── ChannelConfigPage.tsx               # [NUEVO] generada con Stitch MCP
        ├── api.ts                              # [NUEVO] apiClient calls (connect, status)
        └── index.ts                            # [NUEVO] export
```

## Contratos

### `IMessagingProvider` (integrations/meta/messaging-provider.interface.ts)

```ts
export interface IMessagingProvider {
  sendText(
    to: string,
    text: string,
    phoneNumberId: string,
    accessToken: string
  ): Promise<{ messageId: string }>;
  sendTemplate(
    to: string,
    templateName: string,
    langCode: string,
    components: unknown[],
    phoneNumberId: string,
    accessToken: string
  ): Promise<{ messageId: string }>;
}
```

### `channel.types.ts`

```ts
export interface IMetaIntegration {
  tenantId: Types.ObjectId;
  canal: 'whatsapp';
  wabaId: string;
  phoneNumberId: string;
  accessTokenEnc: string;   // nunca exponer en responses
  activo: boolean;
}
export interface IMetaIntegrationDocument extends IMetaIntegration, Document {}
export interface IChannelConnectDto {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;      // plain; cifrar antes de guardar
}
export interface IChannelStatusResponse {
  activo: boolean;
  phoneNumberId: string;
  wabaId: string;
}
```

### `channel.model.ts` — índices

```ts
MetaIntegrationSchema.index({ phoneNumberId: 1 }, { unique: true }); // GLOBAL pre-auth
MetaIntegrationSchema.index({ tenantId: 1, canal: 1 }, { unique: true });
```

`accessTokenEnc` lleva `select: false`.

### `cliente.types.ts`

```ts
export type CanalOrigen = 'whatsapp' | 'instagram' | 'messenger' | 'formulario' | 'web';
export type EstadoComercial = 'nuevo' | 'en_gestion' | 'pago_pendiente' | 'pagado' | 'perdido';
export interface ICliente {
  tenantId: Types.ObjectId;
  metaUserId: string;
  telefono: string;
  nombre?: string;
  canalOrigen: CanalOrigen;
  estadoComercial: EstadoComercial;
  ventana24hExpiraEn?: Date;   // abierta cuando inbound; bloquea sendMessage fuera de ella
  ultimoMensajeAt?: Date;
  asesorId?: Types.ObjectId;
  customFields: Record<string, unknown>;
  tags: string[];
}
export interface IClienteDocument extends ICliente, Document {}
```

### `cliente.model.ts` — índices

```ts
ClienteSchema.index({ tenantId: 1, metaUserId: 1 }, { unique: true });  // dedup inbound
ClienteSchema.index({ tenantId: 1, estadoComercial: 1 });
ClienteSchema.index({ tenantId: 1, ultimoMensajeAt: -1 });
```

### `message.types.ts`

```ts
export type Direccion = 'inbound' | 'outbound';
export type Sender = 'user' | 'bot' | 'agent';
export type TipoMensaje = 'text' | 'image' | 'template' | 'audio' | 'document' | 'other';
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';
export interface IMessage {
  tenantId: Types.ObjectId;
  clienteId: Types.ObjectId;
  canal: 'whatsapp';
  direccion: Direccion;
  sender: Sender;
  tipo: TipoMensaje;
  texto?: string;
  attachmentUrl?: string;
  metaMessageId?: string;
  status: MessageStatus;
  createdAt: Date;
}
export interface ICreateMessageDto extends Omit<IMessage, 'createdAt'> {}
export interface ISendMessageDto { clienteId: string; texto: string; }
```

### `message.model.ts` — índices

```ts
MessageSchema.index({ tenantId: 1, clienteId: 1, createdAt: 1 });
MessageSchema.index({ metaMessageId: 1 }, { sparse: true });  // dedup + lookup delivery status
```

### `webhook.types.ts`

```ts
export interface IWhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: IWebhookEntry[];
}
export interface IWebhookEntry { id: string; changes: IWebhookChange[]; }
export interface IWebhookChange { value: IWebhookValue; field: 'messages'; }
export interface IWebhookValue {
  messaging_product: 'whatsapp';
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: Array<{ profile: { name: string }; wa_id: string }>;
  messages?: IWhatsAppMessage[];
  statuses?: IWhatsAppStatus[];
}
export interface IWhatsAppMessage {
  from: string; id: string; timestamp: string;
  type: 'text' | 'image' | 'audio' | 'document' | 'other';
  text?: { body: string };
}
export interface IWhatsAppStatus {
  id: string; status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string; recipient_id: string;
}
```

### Validaciones Zod (resumen)

```ts
// channel.validation.ts
connectSchema: z.object({
  body: z.object({
    wabaId: z.string().min(1),
    phoneNumberId: z.string().min(1),
    accessToken: z.string().min(1),
  }),
  params: z.object({}),
  query: z.object({}),
});

// message.validation.ts
sendSchema: z.object({
  body: z.object({
    clienteId: z.string().min(1),
    texto: z.string().min(1).max(4096),
  }),
  params: z.object({}),
  query: z.object({}),
});

// webhook.validation.ts
verifyQuerySchema: z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    'hub.mode': z.literal('subscribe'),
    'hub.verify_token': z.string(),
    'hub.challenge': z.string(),
  }),
});
```

### BullMQ (`config/queues.ts`)

```ts
export const INBOUND_QUEUE_NAME = 'inbound-messages';
// Job data: { tenantId: string; payload: IWhatsAppWebhookPayload }
```

### Crypto (`utils/crypto.util.ts`)

```ts
export function encrypt(plaintext: string): string;   // usa TENANT_TOKEN_ENC_KEY de config
export function decrypt(ciphertext: string): string;  // AES-256-GCM; formato: base64(iv:authTag:cipher)
```

### Endpoints y cadenas de middleware

| Método | Ruta | Autenticación | Roles | Zod |
|--------|------|---------------|-------|-----|
| GET | `/api/webhooks/whatsapp` | — (público) | — | `verifyQuerySchema` |
| POST | `/api/webhooks/whatsapp` | — (público, HMAC) | — | — |
| POST | `/api/channels/whatsapp/connect` | JWT + requireTenant | admin | `connectSchema` |
| GET | `/api/channels/whatsapp/status` | JWT + requireTenant | admin | — |
| POST | `/api/messages/send` | JWT + requireTenant | asesor+ | `sendSchema` |

## Notas

- El webhook es la **única ruta POST pública** del sistema (además del login). Usa `express.raw()`
  para mantener el body intacto para la validación HMAC; luego parsea JSON en el service.
- `channel.service.connectChannel` usa `findOneAndUpdate` con `upsert:true` y el `tenantId` nace
  de `req.user.tenantId` en el controller, nunca del body (regla de multi-tenancy).
- `webhook.service.resolveWebhookTenant` hace `MetaIntegration.findOne({ phoneNumberId })` directo
  (excepción pre-auth documentada en `docs/multi-tenancy.md §5`). A partir de ahí, todo pasa por `*Scoped`.
- Los procesos `upsertByMetaUser` y `saveMessage` en el worker usan `findOneAndUpdateScoped` /
  `createScoped` del `base.repository.ts` (INF-02).
- La pantalla de frontend se genera con Stitch MCP (`mcp__stitch__generate_screen_from_text`)
  sobre el proyecto "SofiApp - Stich".

## Verificación

- `pnpm --filter backend typecheck` → 0 errores.
- `pnpm --filter backend test` → tests de aislamiento y unitarios en verde.
