# HU-MARK-05 — Plan técnico (CÓMO)

> Reglas que mandan y no se redefinen aquí: `CLAUDE.md` raíz (repositorio scoped, `tenantId` del
> token, controllers delgados, Zod en el borde, sin `any`), `apps/backend/CLAUDE.md` (patrón de 6
> archivos) y `apps/frontend/CLAUDE.md` (skills de diseño, shadcn, tokens, light/dark).
> No hay endpoints ni controllers nuevos: todo se resuelve en types/model/validation/service/worker.

## Archivos a crear / tocar

```
apps/backend/
├── package.json                                       # + "backfill:mensajes-campana"
└── src/
    ├── features/message/
    │   ├── message.types.ts                           # ORIGENES_MENSAJE, IPlantillaEnviada, campos nuevos, ContextoEnvio
    │   ├── message.model.ts                           # subschema plantilla, origen, campaignId, índice único parcial
    │   └── message.service.ts                         # sendOutbound(contexto), saveMessage {message,creado}, updateDeliveryStatus monótono
    ├── features/whatsapp-template/
    │   └── whatsapp-template.service.ts               # renderizarPlantilla (puro) + buildTemplatePayload devuelve texto/nombre/idioma
    ├── features/campaign/
    │   ├── campaign.types.ts                          # IParametroDinamico, parametrosDinamicos
    │   ├── campaign.model.ts                          # ParametroDinamicoSchema
    │   ├── campaign.validation.ts                     # Zod parametrosDinamicos (create/schedule/reschedule)
    │   ├── campaign.service.ts                        # propagar parametrosDinamicos + respuesta GET /campaigns/:id
    │   └── campaign.parametros.ts                     # NUEVO · resolverParametros (puro)
    ├── features/conversation/
    │   ├── conversation.types.ts                      # IMessageResponse += origen, campana, plantilla
    │   ├── conversation.mapper.ts                     # IMessageSource += campos; toMessageResponse(…, campanaMap)
    │   └── conversation.service.ts                    # export notificarSaliente; getThread con nombres de campaña; inbound no re-notifica
    ├── workers/
    │   ├── campaign-broadcast.processor.ts            # clientes del lote, parámetros por destinatario, contexto, notificar
    │   └── inbound-message.processor.ts               # respetar `creado` de saveMessage
    └── scripts/
        ├── backfill-mensajes-campana.ts               # NUEVO
        └── backfill-mensajes-campana.test.ts          # NUEVO

apps/frontend/src/features/
├── inbox/
│   ├── types.ts                                       # MessageDTO += origen, campana, plantilla
│   └── components/
│       ├── MessageBubble.tsx                          # tipoVisual, etiqueta "Campaña", fallback plantilla
│       └── MessageBubble.test.tsx
└── campaigns/
    ├── types.ts                                       # ParametroDinamico
    ├── lib/…                                          # substituteEjemplos acepta variables
    └── components/
        ├── CampaignWizard.tsx                         # Select por parámetro
        ├── CampaignWizard.test.tsx
        └── MessagePreview.tsx                         # variable resaltada

docs/data-model.md · docs/domain.md · apps/frontend/CLAUDE.md
```

## Contratos

### `message.types.ts`
```ts
export const ORIGENES_MENSAJE = ['campana'] as const;   // extensible (flujo, recordatorio…) en otras HU
export type OrigenMensaje = (typeof ORIGENES_MENSAJE)[number];

export interface IPlantillaEnviada {
  templateId: Types.ObjectId;
  nombre: string;
  idioma: string;
  parametros: string[];      // ya resueltos para ESTE destinatario
}

// IMessage += (todos opcionales: los documentos previos no los tienen)
origen?: OrigenMensaje;
campaignId?: Types.ObjectId;
plantilla?: IPlantillaEnviada;

/** Metadatos que el llamador conoce y `sendOutbound` no: solo los usa la rama plantilla. */
export interface ContextoEnvio {
  campaignId?: string;
  mediaCabecera?: { mediaKey: string; mimeType: string; tamanoBytes: number };
}
```

### `message.model.ts` — índices
```ts
// Reemplaza { tenantId, metaMessageId } sparse NO único:
MessageSchema.index(
  { tenantId: 1, metaMessageId: 1 },
  { unique: true, partialFilterExpression: { metaMessageId: { $type: 'string' } } },
);
// Se conservan { tenantId, clienteId, createdAt } (hilo) y { tenantId, tipo, createdAt:-1 } (cuota 24 h).
```
Antes de desplegar, el backfill reporta duplicados existentes (ver Notas).

### `whatsapp-template.service.ts`
```ts
/** HEADER(TEXT) + BODY con {{n}} sustituidos + FOOTER, unidos por "\n\n". null si no hay BODY. */
export function renderizarPlantilla(components: IPlantillaComponente[], parametros: string[]): string | null;

// buildTemplatePayload(...) → { name, langCode, components, texto: string | null }
```
Un `{{n}}` sin parámetro se deja literal (no se inventa contenido).

### `message.service.ts`
```ts
export async function sendOutbound(
  tenantId: TenantId, clienteId: string, contenido: ContenidoSaliente,
  sender: Sender = 'agent', contexto: ContextoEnvio = {},
): Promise<IMessageDocument>;
```
Rama plantilla persiste:
```ts
{ …lo actual, tipo: 'plantilla',             // se mantiene: la cuota de 24 h cuenta por tipo
  texto: payload.texto ?? undefined,
  plantilla: { templateId, nombre: payload.name, idioma: payload.langCode, parametros },
  ...(contexto.campaignId ? { origen: 'campana', campaignId } : {}),
  ...(contexto.mediaCabecera ? { media: { estado: 'disponible', mimeType, mediaKey,
        metaMediaId: imagenCabecera.metaMediaId, tamanoBytes, descargadaAt: new Date() } } : {}) }
```
`sender` sigue `'bot'` en plantillas (no se toca la semántica de IA/auditoría); la UI decide la
etiqueta por `origen`.

`saveMessage` → `Promise<{ message: IMessageDocument; creado: boolean }>`: busca por
`metaMessageId`; al crear, captura `E11000` (carrera entre dos jobs) y devuelve el existente con
`creado: false`.

`updateDeliveryStatus` (atómico, sin leer antes):
```ts
const PREVIOS: Record<MessageStatus, MessageStatus[]> = {
  sent: [], delivered: ['sent'], read: ['sent', 'delivered'], failed: ['sent', 'delivered'],
};
const doc = await findOneAndUpdateScoped(Message, tenantId,
  { metaMessageId, status: { $in: PREVIOS[status] } }, { $set: { status } }, { new: true }).lean();
if (doc) await publishRealtime({ type: 'message:updated', tenantId, conversationId: String(doc.clienteId),
  message: toMessageResponse(doc, tenantId /*, campanaMap */) });
await applyDeliveryStatusToRecipient(tenantId, metaMessageId, status);   // intacto
```

### Campañas — variables de contacto
```ts
// campaign.types.ts
export const CAMPOS_CONTACTO = ['nombre', 'telefono'] as const;
export interface IParametroDinamico { indice: number; campo: (typeof CAMPOS_CONTACTO)[number] }
// ICampaign += parametrosDinamicos: IParametroDinamico[]   (default [])
// El respaldo de la variable es parametros[indice]: no se agrega otro array paralelo.

// campaign.validation.ts (se compone en create, schedule y reschedule)
const parametroDinamicoSchema = z.object({ indice: z.number().int().min(0).max(19), campo: z.enum(CAMPOS_CONTACTO) });
// .superRefine: indice < parametros.length, sin índices repetidos, respaldo no vacío.

// campaign.parametros.ts
export function resolverParametros(
  parametros: string[], dinamicos: IParametroDinamico[],
  cliente: { nombre?: string | null; telefono: string },
): string[];   // valor del cliente si no está vacío (trim), si no el respaldo
```
`GET /api/campaigns/:id` incluye `parametrosDinamicos` (endpoint existente).

### Worker `campaign-broadcast.processor.ts`
1. Tras leer el lote: `findScoped(Cliente, tenantId, { _id: { $in: ids } }).select('nombre telefono').lean()` → `Map`.
2. Por destinatario: `parametros = resolverParametros(campana.parametros, campana.parametrosDinamicos ?? [], cliente)`.
3. `sendOutbound(tenantId, clienteId, { modo:'plantilla', templateId, parametros, imagenCabecera }, 'bot',
   { campaignId, mediaCabecera: campana.contenido?.imagen ?? undefined })`.
4. `$set` del destinatario (igual que hoy).
5. `try { await notificarSaliente(tenantId, clienteId, mensaje) } catch (e) { logger.warn(...) }` —
   fuera del `try` que decide `enviado/fallido`.

Volumen de eventos: un `message:new` por destinatario, al ritmo del pacing (`concurrency: 1`,
lotes de `CAMPAIGN_BATCH_SIZE`). El frontend ya los absorbe con `invalidateQueries` (TanStack
cancela el refetch anterior).

### Conversación / hilo
- `notificarSaliente` pasa a `export` (sin cambiar su contrato). Preview de la lista: ahora
  `texto` existe → deja de mostrarse "📋 Plantilla" para las campañas nuevas.
- `getThread`: tras leer la página, `campaignIds` únicos → una sola
  `findScoped(Campaign, tenantId, { _id: { $in } }).select('nombre')` → `Map` al mapper.
- `IMessageResponse` += `origen: OrigenMensaje | null`, `campana: { id: string; nombre: string | null } | null`
  (`nombre: null` si la campaña ya no existe), `plantilla: { nombre: string } | null`.
- `notifyInboundMessage` solo se ejecuta si `saveMessage(...).creado`.

### Script de backfill
`src/scripts/backfill-mensajes-campana.ts`, patrón de `backfill-lead-semaforo.ts`:
1. Lista tenants; para cada uno, **solo** funciones `*Scoped`.
2. `aggregateScoped(Message)` agrupando por `metaMessageId` con `count > 1` → reporte de duplicados
   (no borra nada; se resuelven a mano antes de que Mongoose cree el índice único).
3. Candidatos: `{ tipo: 'plantilla', texto: { $exists: false }, metaMessageId: { $type: 'string' } }`.
4. `CampaignRecipient` por `metaMessageId` → `Campaign` → plantilla (`findByIdScoped`). Sin
   destinatario o sin plantilla → "no recuperable" (cuenta y motivo).
5. Parámetros: `resolverParametros` con el cliente actual (las campañas históricas no tenían
   variables, así que el resultado es exacto). `$set` de `texto`, `plantilla`, `campaignId`,
   `origen`, y `media` si la campaña tiene imagen y el mensaje no tiene `media`.
6. `--dry-run` no escribe. Re-ejecutar no cambia nada (los candidatos ya tienen `texto`).

### Frontend
- **Skills antes de escribir:** `emil-design-eng`, `impeccable:impeccable`, `frontend-design`.
- `MessageBubble`:
  - `tipoVisual(m)`: si `tipo === 'plantilla'` y hay `media`, deriva `imagen|video|documento` del
    `mimeType`; el resto igual. Así la plantilla con imagen usa `MediaImagen` y no la tarjeta de
    documento del `default`.
  - Pie de la burbuja: si `origen === 'campana'` → `Megaphone` (size-2.5) + "Campaña" en el mismo
    slot `mr-auto` que hoy ocupa "Sofi" (que se omite), envuelto en `Tooltip` de shadcn con
    "Campaña «{nombre}»". Mismo tamaño, color y peso que "Sofi": discreto, sin nuevo layout.
  - Fallback: `tipo === 'plantilla'` sin texto ni media → "Plantilla enviada · contenido no
    disponible" (cursiva, `opacity-80`, como el fallback actual).
  - **Sin animación nueva**: la burbuja se ve decenas de veces al día (criterio Emil); los ticks ya
    cambian por reemplazo en caché vía `message:updated`.
- `CampaignWizard`, por parámetro: `Select` de shadcn (Texto fijo · Nombre del contacto ·
  Teléfono del contacto) + `Input`; en variable, placeholder "Si no hay dato, usar…".
  `MessagePreview` muestra la variable como "Nombre del contacto" con fondo `bg-primary/10`
  `text-primary` (tokens semánticos), legible en light y dark.

## Ajustes tras el rebase sobre `develop` (HT-WA-04 / HU-MARK-04)

Develop trajo dos fuentes nuevas de imagen de cabecera. `buildTemplatePayload` ya cae sola a la
`imagenDefecto` de la plantilla cuando no recibe `cabecera`, y `sendOutbound` sube una imagen de
reemplazo (`imagenHeaderUploadId`) en los envíos sueltos. Hoy `ContextoEnvio.mediaCabecera` solo se
llena con `Campaign.contenido.imagen`, así que estos dos caminos guardarían el `Message` sin `media`.

**A. Imagen efectivamente enviada (criterio 3).** La referencia de almacenamiento sale de donde se
decide la imagen, sin que el llamador la adivine:

```ts
// whatsapp-template.service.ts
buildTemplatePayload(...) → { name, langCode, components, texto,
  /** Imagen por defecto usada en este envío (HT-WA-04). undefined si hubo cabecera explícita o no hay HEADER IMAGE. */
  imagenDefecto?: { mediaKey: string; mimeType: string; tamanoBytes: number } }

// message.service.ts · rama plantilla, en este orden:
const mediaCabecera =
  contexto.mediaCabecera                        // campaña con imagen propia
  ?? imagenReemplazoGuardada                    // subirImagenReemplazo devuelve también aImagenAlmacenada(subida)
  ?? payload.imagenDefecto;                     // la plantilla puso la suya
```

- `subirImagenReemplazo` devuelve `{ metaMediaId, almacenada: { mediaKey, mimeType, tamanoBytes } }`.
- `campaign-broadcast.processor.ts` no cambia: sigue pasando solo la imagen propia. Si la campaña
  no tiene imagen, la cubre `payload.imagenDefecto`.
- Todas las lecturas siguen pasando por `findByIdScoped(WhatsAppTemplate, tenantId, …)`.

**B. Envío suelto.** `sendTemplateController` no cambia, porque `sendOutbound` sin contexto ya
persiste `texto` y `plantilla`. Con A también gana `media`. `origen` queda vacío y la burbuja no
muestra "Campaña".

**C. Métricas.** `updateDeliveryStatus` sigue llamando a `applyDeliveryStatusToRecipient`, que en
develop delega en `marcarEntregado` / `registrarLectura`. El filtro monótono se aplica **solo** al
`Message`. El destinatario de campaña recibe todos los eventos sin filtrar, aunque el `Message` no
haya cambiado. El código fusionado ya lo hace (`applyDeliveryStatusToRecipient` va fuera del `if`).

**D. Backfill.** Al reconstruir media: `Campaign.contenido.imagen` → si no hay y la plantilla es
de `HEADER IMAGE` con `imagenDefecto`, usar esa. Se lee con `findByIdScoped` por tenant.

**Archivos extra:** `features/message/message.service.ts`,
`features/whatsapp-template/whatsapp-template.service.ts`,
`scripts/backfill-mensajes-campana.ts` y sus tests (`message.campana.test.ts`,
`backfill-mensajes-campana.test.ts`).

## Notas

- **Por qué en `sendOutbound` y no solo en el worker:** es la única puerta de salida de plantillas;
  arreglarla ahí da texto también a recordatorios y flujos sin duplicar el render.
- **`tipo` no cambia** a `imagen` para plantillas con cabecera: el presupuesto de 24 h
  (`resolverPresupuesto`) cuenta `tipo: 'plantilla'` con el índice `{ tenantId, tipo, createdAt }`.
- **`mediaKey` compartido** con `Campaign.contenido.imagen`: no se copia el archivo. La URL se
  firma al leer (HU-OMNI-06). Hoy nada borra la imagen de una campaña ya lanzada; si algún día se
  hace, debe considerar estas referencias.
- **IA:** los mensajes de campaña ahora tienen `texto` y `sender:'bot'`, así que entran al
  historial del modelo como turnos del asistente. Es deseable (contexto comercial); verificar que el
  armado del historial (`ai-reply.*`) no trate `tipo:'plantilla'` de forma especial que se rompa.
- **Índice único en producción:** si `autoIndex` crea el índice con duplicados existentes, falla.
  Orden de despliegue: correr `backfill --dry-run`, resolver duplicados reportados, desplegar.
- **Webhook** sigue respondiendo 200 inmediato y delegando a BullMQ (regla 6); solo cambia lo que
  hace el job.

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint
pnpm --filter @sofiapp/web test
pnpm --filter @sofiapp/api backfill:mensajes-campana --dry-run
```
Manual (sandbox Meta): los 6 escenarios de `spec.md`, revisando la burbuja en light y dark
(capturas en `.playwright-mcp/`, borradas al terminar).
