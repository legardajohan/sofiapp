# HT-WA-02 — Plan técnico (CÓMO)

## Archivos a crear

```
apps/backend/src/
├── features/whatsapp-template/
│   ├── whatsapp-template.types.ts        # IWhatsAppTemplate, estados, categorías, DTOs
│   ├── whatsapp-template.model.ts        # schema + índices { tenantId, name, language } unique
│   ├── whatsapp-template.validation.ts   # Zod { body, params, query }
│   ├── whatsapp-template.service.ts      # sync, alta, envío con parámetros
│   ├── whatsapp-template.controller.ts   # capa HTTP delgada
│   ├── whatsapp-template.routes.ts       # GET/POST /api/templates, POST /sync
│   ├── whatsapp-template.isolation.test.ts
│   └── whatsapp-template.service.test.ts
└── integrations/meta/
    └── meta-template.client.ts           # GET/POST /{wabaId}/message_templates

apps/frontend/src/features/whatsapp-templates/
├── api.ts · types.ts · index.ts
├── pages/TemplatesPage.tsx
├── components/TemplateList.tsx · TemplateCard.tsx · CreateTemplateDialog.tsx · TemplatePreview.tsx
└── hooks/useTemplates.ts · useSyncTemplates.ts · useCreateTemplate.ts
```

## Archivos a modificar

```
apps/backend/src/
├── app.ts                                 # app.use('/api/templates', whatsappTemplateRoutes)
├── features/message/
│   ├── message.service.ts                 # extraer sendOutbound; sendMessage delega
│   ├── message.types.ts                   # ISendTemplateDto, ModoEnvio
│   ├── message.validation.ts              # sendTemplateSchema
│   ├── message.controller.ts              # sendTemplateController
│   └── message.routes.ts                  # POST /api/messages/template
docs/
├── data-model.md                          # + colección whatsapp_templates
└── integrations/meta-whatsapp.md          # §4 con el flujo real de plantillas
apps/frontend/src/
├── router.tsx                             # ruta lazy /settings/templates
└── components/layout/nav-config.ts        # entrada de navegación (rol admin)
```

## Contratos

### `whatsapp-template.types.ts`

```ts
export const ESTADOS_PLANTILLA = ['APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED'] as const;
export type EstadoPlantilla = (typeof ESTADOS_PLANTILLA)[number];

export const CATEGORIAS_PLANTILLA = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const;
export type CategoriaPlantilla = (typeof CATEGORIAS_PLANTILLA)[number];

/** Componente tal y como lo devuelve Meta. Se persiste íntegro para poder previsualizar. */
export interface IPlantillaComponente {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';
  text?: string;
  buttons?: Array<Record<string, unknown>>;
}

export interface IWhatsAppTemplate {
  tenantId: Types.ObjectId;
  metaTemplateId: string;
  name: string;                 // nombre aprobado por Meta (snake_case)
  language: string;             // 'es', 'es_CO', 'en_US'
  category: CategoriaPlantilla;
  status: EstadoPlantilla;
  components: IPlantillaComponente[];
  /** Nº de placeholders {{n}} del BODY; se deriva al persistir para validar envíos sin re-parsear. */
  parametrosBody: number;
  syncedAt: Date;
  obsoleta: boolean;            // Meta dejó de devolverla en el último sync
}

export interface IWhatsAppTemplateResponse {
  id: string; name: string; language: string;
  category: CategoriaPlantilla; status: EstadoPlantilla;
  cuerpo: string | null; parametrosBody: number;
  obsoleta: boolean; syncedAt: string;
}
```

### `whatsapp-template.model.ts` — índices

```ts
tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
...
{ timestamps: true }

WhatsAppTemplateSchema.index({ tenantId: 1, name: 1, language: 1 }, { unique: true });
WhatsAppTemplateSchema.index({ tenantId: 1, status: 1 });
```

El único índice **no** encabezado por `tenantId` sería `metaTemplateId`, y por eso no se crea como
único global: dos tenants distintos pueden tener plantillas homónimas en WABAs distintas. Es el
mismo criterio que hace que el índice de `MetaIntegration.phoneNumberId` sí sea global (allí el
identificador es único por construcción; aquí no).

### `meta-template.client.ts`

Cliente aparte de `meta-whatsapp.client.ts` porque pega contra un recurso distinto (`{wabaId}`, no
`{phoneNumberId}`) y con verbos distintos. Reutiliza el mismo patrón de `fetch` + backoff 429 +
`AppError(…, 502)`.

```ts
export interface IMetaTemplateClient {
  list(wabaId: string, accessToken: string): Promise<IMetaTemplateRaw[]>;   // pagina con `after`
  create(wabaId: string, accessToken: string, dto: ICreateMetaTemplateDto): Promise<{ id: string; status: EstadoPlantilla }>;
}
```

`list` debe seguir la paginación por cursor de la Graph API (`paging.cursors.after`) hasta agotarla:
una WABA con muchas plantillas no cabe en una página.

### `whatsapp-template.service.ts`

```ts
type TenantId = string | Types.ObjectId;

export async function syncTemplates(tenantId: TenantId): Promise<{ creadas: number; actualizadas: number; obsoletas: number }>;
export async function listTemplates(tenantId: TenantId, query: ListTemplatesQuery): Promise<IPaginated<IWhatsAppTemplateResponse>>;
export async function createTemplate(tenantId: TenantId, dto: CreateTemplateBody): Promise<IWhatsAppTemplateResponse>;

/** Resuelve la plantilla y construye los `components` de envío. No envía: eso es de message.service. */
export async function buildTemplatePayload(
  tenantId: TenantId,
  templateId: string,
  parametros: string[],
): Promise<{ name: string; langCode: string; components: unknown[] }>;
```

`buildTemplatePayload` centraliza las dos validaciones del `spec` (criterios 5 y 6):

```ts
if (tpl.status !== 'APPROVED')
  throw new AppError('La plantilla no está aprobada por Meta.', 422, { status: tpl.status });
if (parametros.length !== tpl.parametrosBody)
  throw new AppError('Número de parámetros incorrecto.', 400, { esperados: tpl.parametrosBody, recibidos: parametros.length });
```

Los `components` de envío son posicionales, no nominales — así los quiere la Graph API:

```ts
components: [{ type: 'body', parameters: parametros.map((text) => ({ type: 'text', text })) }]
```

`parametrosBody` se deriva al persistir contando placeholders `{{n}}` distintos en el `text` del
componente `BODY`, y se valida que sean consecutivos desde 1 (Meta lo exige).

**`syncTemplates` y el aislamiento:** el upsert va con `findOneAndUpdateScoped(..., { upsert: true })`
por `{ name, language }`. Las que no aparecieron en la respuesta de Meta se marcan
`obsoleta: true` con `updateManyScoped`, **no** se borran: puede haber `Message` históricos que las
referencian.

### `message.service.ts` — `sendOutbound`, el único juez de la ventana

Hoy la regla vive incrustada en `sendMessage` (`message.service.ts:35-40`). Se extrae sin cambiar
el comportamiento observable de la bandeja:

```ts
export type ContenidoOutbound =
  | { modo: 'auto'; texto: string; plantillaFallback?: { templateId: string; parametros: string[] } }
  | { modo: 'texto'; texto: string }
  | { modo: 'plantilla'; templateId: string; parametros: string[] };

/**
 * ÚNICO punto del sistema donde se decide libre vs plantilla. Lo consumen la bandeja
 * (sendMessage), HU-FLOW-02 (recordatorios) y la futura épica de campañas.
 */
export async function sendOutbound(
  tenantId: TenantId,
  clienteId: string,
  contenido: ContenidoOutbound,
  sender: Sender = 'agent',
): Promise<IMessageDocument>;
```

Reglas, en orden:
1. `assertWithinQuota(tenantId, 'mensajesMes')` — antes de cualquier decisión.
2. Cargar el cliente con `findByIdScoped`; 404 si no existe.
3. `ventanaAbierta = !!cliente.ventana24hExpiraEn && cliente.ventana24hExpiraEn > now`.
4. `modo: 'texto'` con ventana cerrada → `AppError` 422 con **el mensaje actual, literal**, para no
   romper el copy que ya muestra `WindowClosedBanner` en el frontend.
5. `modo: 'auto'` → texto libre si la ventana está abierta; si está cerrada y hay
   `plantillaFallback`, envía plantilla; si no la hay, el mismo 422.
6. `modo: 'plantilla'` → `buildTemplatePayload` + `metaWhatsAppClient.sendTemplate`. Permitido
   dentro y fuera de la ventana (Meta lo acepta).
7. Persistir el `Message` (`tipo: 'text' | 'template'`) con `createScoped` y `incrementUsage`.

`sendMessage(tenantId, dto)` pasa a ser `sendOutbound(tenantId, dto.clienteId, { modo: 'texto', texto: dto.texto })`.
Su firma pública y su 422 no cambian, así que `message.controller.ts` y la bandeja siguen igual.

### Endpoints

| Método | Ruta | Rol | Cuerpo / Query |
|---|---|---|---|
| `GET` | `/api/templates` | admin | `?page&limit&status&category` |
| `POST` | `/api/templates` | admin | `{ name, language, category, cuerpo, ejemplos[] }` |
| `POST` | `/api/templates/sync` | admin | — |
| `POST` | `/api/messages/template` | admin | `{ clienteId, templateId, parametros[] }` |

Todos con la cadena fija: `authenticateJWT → requireTenant → authorize(['admin']) → validate → asyncHandler`.

### Frontend — decisiones de las skills de diseño (regla §7 del `CLAUDE.md` raíz)

Antes de escribir un solo componente hay que invocar `emil-design-eng`, `impeccable:impeccable` y
`frontend-design:frontend-design`. Puntos que esas skills deben resolver:

- **El estado de aprobación es la información principal**, no un detalle: una plantilla `PENDING`
  no sirve para nada hoy. El listado se agrupa o filtra por `status` con `Badge` (la variante
  `success` ya existe en `badge.tsx`) y `PENDING` comunica que la espera es de Meta, no de SofiApp.
- **La vista previa debe parecerse a WhatsApp**, no a un formulario: es la única forma de que el
  admin entienda qué va a recibir el cliente. Burbuja con el cuerpo y los `{{n}}` sustituidos por
  los ejemplos.
- **El alta es de ida sin vuelta rápida**: una vez enviada a Meta, la aprobación tarda. El diálogo
  debe decirlo antes de confirmar, no después.
- **Estado vacío real**: un tenant recién conectado no tiene plantillas. El vacío debe llevar a la
  acción correcta (sincronizar o crear), no ser un texto gris.

Componentes shadcn/ui a usar: `table`, `badge`, `dialog`, `select`, `input`, `textarea`, `card`,
`skeleton`, `tooltip` (ya vendorizados). Probablemente haga falta `tabs` para separar por estado:
`pnpm dlx shadcn@3.8.5 add tabs` (versión fijada — las 4.x asumen Tailwind v4 y rompen el proyecto).

### Frontend — convenciones a respetar

- `apiClient` **sin** el prefijo `/api`: `apiClient.get('/templates')`, nunca `'/api/templates'`.
- TanStack Query para el catálogo; Zustand solo si aparece estado de UI que sobreviva a la pantalla.
- Tokens semánticos, cero `bg-[#...]`, terminado en light y dark.

## Notas

- **Por qué una feature nueva y no ampliar `channel`**: `channel` gestiona la conexión (un
  documento por tenant); las plantillas son un catálogo con su propio ciclo de vida y sus propios
  endpoints. Screaming Architecture pide separarlas.
- **Idempotencia del sync**: se puede ejecutar tantas veces como haga falta; el upsert por
  `{tenantId, name, language}` lo garantiza.
- **Media y botones**: se persisten los `components` completos aunque el envío no los soporte
  todavía, para no tener que re-sincronizar cuando se amplíe.
- El webhook `message_template_status_update` de Meta permitiría refrescar el estado sin sync
  manual. Queda anotado como mejora, fuera de alcance.

## Verificación

- `pnpm --filter backend typecheck` · `pnpm --filter backend test`
- `pnpm --filter frontend build && pnpm --filter frontend lint`
- Prueba manual: enviar una plantilla aprobada a un contacto **con la ventana de 24 h cerrada** y
  confirmar que llega al celular (Definition of Done de la historia).
