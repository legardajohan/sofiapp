# HU-OMNI-07 — Plan técnico (CÓMO)

> Se apoya por completo en la infraestructura de `HU-OMNI-06` (ADR `0008`). Aquí solo se describe lo
> que se **añade** o **cambia**; lo que se reutiliza se nombra con su ruta.

## Decisiones

1. **Transcodificar en el backend con `ffmpeg`** (`ffmpeg-static` + `ffprobe-static`).
   - El navegador no graba en el formato de nota de voz de WhatsApp (`audio/ogg` Opus mono). Chrome,
     Edge y Firefox dan `webm/opus` y Safari da `mp4/aac`.
   - Convertir en el servidor funciona igual con cualquier navegador y da, gratis, una **duración
     medida** (no la que declara el cliente). La misma herramienta mide la duración de los audios
     entrantes, que Meta no informa en el webhook.
   - Alternativa descartada: un codificador WASM en el navegador. Suma peso al bundle, mantiene la
     medición del lado del cliente y no resuelve la duración de los entrantes.
   - Queda en el ADR `0009-transcodificacion-de-audio.md`.
2. **Sin campos de primer nivel nuevos en `Message`.** El modelo de la HU
   (`Message { tipo: audio, mimeType, urlArchivo, duracionSegundos, esNotaDeVoz }`) se mapea sobre lo
   que ya existe:

   | HU | Dónde vive |
   |---|---|
   | `tipo: audio` | `Message.tipo` (el enum ya incluye `'audio'`) |
   | `mimeType` | `Message.media.mimeType` |
   | `urlArchivo` | **no se persiste**; `toMediaResponse` la deriva y la firma en cada lectura (ADR `0008`) |
   | `duracionSegundos` | `Message.media.duracionSegundos` (declarado en OMNI-06, sin escritor hasta hoy) |
   | `esNotaDeVoz` | **nuevo** `Message.media.esNotaDeVoz: boolean` (default `false`) |

   "Audio recibido" frente a "nota de voz propia" se deduce de `direccion` + `esNotaDeVoz`, así que no
   hace falta un segundo discriminador.
3. **El límite por tenant vive en `Tenant.notasDeVoz`**, no en el plan de `HU-SAAS-02`. Es una
   preferencia operativa de cada empresa, no una cuota comercial. Lo edita el superadmin desde el CRUD
   de empresas (`HU-SAAS-01`). El tope efectivo es:
   `maxBytes = min(tenant.notasDeVoz.maxBytes, env.MEDIA_MAX_BYTES_AUDIO, LIMITES_MEDIA.audio.maxBytes)`.
4. **Endpoint propio `/messages/audio`** en vez de reutilizar `/messages/media`. El audio no lleva
   caption, necesita transcodificación y límite por tenant, y su campo de archivo y su validación son
   distintos. Mezclarlo en `enviarMediaSaliente` le añadiría ramas a una función que hoy es lineal.
5. **El driver `local` gana soporte de `Range`.** Sin él, `<audio>` no puede desplazarse en
   desarrollo y el criterio 1 ("avanzar") no se puede verificar a mano. En producción, `spaces`
   responde `302` a una URL prefirmada de S3, que ya soporta `Range`.
6. **Selector de emojis: `frimousse`** (headless, ~12 kB, sin CSS propio). Es la base del componente
   `emoji-picker` del registro de shadcn. Se vendoriza en `src/components/ui/emoji-picker.tsx`,
   adaptado a Tailwind 3 y a los tokens del proyecto: la CLI 3.8.5 pinneada no lo trae y la versión
   del registro asume Tailwind 4. Los datos de emoji los descarga `frimousse` bajo demanda (CDN
   `emojibase`) y se cachean. No viajan en el bundle.

## Archivos a crear

```
apps/backend/src/
├── integrations/audio/
│   ├── audio.types.ts                 # ITranscodificadorAudio, IAudioTranscodificado
│   ├── ffmpeg.transcoder.ts           # adaptador ffmpeg/ffprobe (spawn, stdin→stdout, timeout)
│   ├── index.ts                       # getTranscodificador() + setTranscodificadorForTests()
│   └── ffmpeg.transcoder.test.ts      # con un ogg/webm mínimo de fixture (tests/fixtures/audio/)
├── features/conversation/
│   └── conversation.audio.routes.test.ts
docs/adr/0009-transcodificacion-de-audio.md

apps/frontend/src/
├── components/ui/
│   ├── slider.tsx                     # pnpm dlx shadcn@3.8.5 add slider
│   └── emoji-picker.tsx               # frimousse vendorizado
└── features/inbox/
    ├── components/composer/
    │   ├── VoiceRecorder.tsx          # barra de grabación + previsualización
    │   ├── VoiceRecorder.test.tsx
    │   ├── EmojiButton.tsx            # Popover + EmojiPicker
    │   └── EmojiButton.test.tsx
    ├── components/message/MediaAudio.test.tsx
    ├── hooks/
    │   ├── useGrabadora.ts            # MediaRecorder + getUserMedia + corte por límite
    │   ├── useAudioActivo.ts          # Zustand: id del audio que suena (uno a la vez)
    │   └── useConfigAudio.ts          # TanStack Query → GET /conversations/config/audio
    └── lib/
        ├── insertarEnCursor.ts        # (valor, selStart, selEnd, inserto) → { valor, cursor }
        └── insertarEnCursor.test.ts
```

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| `apps/backend/package.json` | `ffmpeg-static`, `ffprobe-static` (+ `@types/…` si hace falta) |
| `features/media/media.types.ts` | `TipoMediaSaliente \|= 'audio'`; `LIMITES_MEDIA.audio` (mimes de **entrada** de grabación: `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`, `audio/aac`; 16 MB); `MIME_NOTA_DE_VOZ = 'audio/ogg'` |
| `features/media/media.service.ts` | `maxBytesDe('audio')`; nuevo `enviarNotaDeVoz(...)`; `toMediaResponse` expone `duracionSegundos` y `esNotaDeVoz` |
| `features/media/media.controller.ts` | pasa `Range` al driver local y responde `206` / `Content-Range` / `Accept-Ranges: bytes` |
| `features/message/message.types.ts` | `IMensajeMedia.esNotaDeVoz?`; el modo `media` de `ContenidoOutbound` acepta `esNotaDeVoz?` y `duracionSegundos?` |
| `features/message/message.model.ts` | `MediaSchema.esNotaDeVoz: { type: Boolean, default: false }` |
| `features/message/message.service.ts` | `sendOutbound` en modo `media` persiste `esNotaDeVoz` y `duracionSegundos` (la regla de ventana no se toca) |
| `features/tenant/tenant.{types,model,validation,service}.ts` | `notasDeVoz { maxDuracionSegundos, maxBytes }` con defaults; `updateTenantSchema` lo acepta con cotas (5–900 s; 100 KB–16 MB) |
| `features/conversation/conversation.validation.ts` | `replyAudioSchema`, `getConfigAudioSchema` |
| `features/conversation/conversation.controller.ts` | `replyAudioController`, `getConfigAudioController` |
| `features/conversation/conversation.service.ts` | `replyAudioMessage` (→ `enviarNotaDeVoz` + `notificarSaliente`), `obtenerConfigAudio(tenantId)` |
| `features/conversation/conversation.routes.ts` | `GET /config/audio` (**antes** de las rutas `/:id`) y `POST /:id/messages/audio` |
| `middlewares/upload.middleware.ts` | `subirAudio`: campo `audio`, `fileSize = env.MEDIA_MAX_BYTES_AUDIO`, misma traducción de `MulterError` a `413`/`400` |
| `integrations/meta/meta-whatsapp.client.ts` | `TIPO_META.audio = 'audio'`; el caption **se omite** para audio en el propio cliente (hoy solo se filtra `filename`) |
| `integrations/storage/storage.types.ts` + `local-disk.storage.ts` | `leer(key, rango?)` con `createReadStream({ start, end })` y `tamanoBytes` |
| `workers/inbound-message.processor.ts` | guarda `media.esNotaDeVoz = msg.audio?.voice === true` |
| `workers/media-ingest.processor.ts` | tras guardar un `audio`, `medirDuracion` **en un `try` propio**: si falla, se loguea y el mensaje queda `disponible` sin duración |
| `apps/frontend/package.json` | `frimousse`, `@radix-ui/react-slider` (vía CLI) |
| `features/inbox/types.ts` | `MediaDTO += duracionSegundos: number \| null; esNotaDeVoz: boolean` |
| `features/inbox/components/message/MediaAudio.tsx` | reescrito: reproductor propio |
| `features/inbox/components/MessageComposer.tsx` | botón de emoji, mic ↔ enviar, modo grabación |
| `features/inbox/components/MessageBubble.tsx` | `whitespace-pre-wrap break-words` en el texto (si falta) |
| `features/inbox/api.ts` / `hooks/useThread.ts` | `sendAudioReply`, `getConfigAudio`, `useSendAudio` (progreso + toasts, como `useSendMedia`) |
| `features/inbox/lib/media.ts` | `formatearDuracion(segundos)` → `m:ss` |
| `index.css` / `tailwind.config.js` | tokens `--grabacion` (rojo de "grabando") y `--audio-progreso` en los **tres** bloques (light, `.dark`, `.light` forzado); `fontFamily.sans` termina en `"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji"` |
| Frontend de empresas (superadmin, `HU-SAAS-01`) | dos campos numéricos "Nota de voz: duración máx. / tamaño máx." en el formulario de edición |
| Docs | `data-model.md`, `api-contract.md`, `integrations/meta-whatsapp.md` (audio saliente), `architecture.md` (binario ffmpeg), `adr/README.md`, `apps/frontend/CLAUDE.md` (sección OMNI-07) |

## Contratos

### Transcodificador — `integrations/audio/audio.types.ts`

```ts
export interface IAudioTranscodificado {
  buffer: Buffer;
  mimeType: 'audio/ogg';        // siempre Opus mono 48 kHz
  duracionSegundos: number;     // medida sobre la salida, redondeada a 0.1
}
export interface ITranscodificadorAudio {
  aNotaDeVoz(entrada: Buffer): Promise<IAudioTranscodificado>;
  medirDuracion(entrada: Buffer): Promise<number | null>;   // null si no se puede medir
}
```

- `ffmpeg -hide_banner -loglevel error -i pipe:0 -vn -ac 1 -ar 48000 -c:a libopus -b:a 32k -application voip -f ogg pipe:1`.
- Sin archivos temporales: el buffer entra por stdin y sale por stdout.
- Timeout de 20 s (`AbortController` + `kill`). Un código de salida ≠ 0 o un stdout vacío se
  convierten en `AppError('No se pudo procesar el audio grabado.', 422)`.
- `medirDuracion` usa `ffprobe -v error -show_entries format=duration -of csv=p=0 -i pipe:0`.

### Message

```ts
export interface IMensajeMedia {
  // … campos de HU-OMNI-06 sin cambios …
  duracionSegundos?: number;   // ahora sí se escribe: ingest (entrante) y enviarNotaDeVoz (saliente)
  esNotaDeVoz?: boolean;       // nuevo. Entrante: audio.voice === true. Saliente grabado: true.
}
// ContenidoOutbound, modo 'media': + esNotaDeVoz?: boolean; duracionSegundos?: number
```

Índices: **sin cambios**. `{ tenantId, clienteId, createdAt }` sigue sirviendo el hilo.

### IMediaResponse (DTO)

`+ duracionSegundos: number | null` · `+ esNotaDeVoz: boolean`. `mediaKey` **sigue sin salir**.

### Tenant

```ts
export interface INotasDeVozConfig { maxDuracionSegundos: number; maxBytes: number; }
// Tenant.notasDeVoz?: INotasDeVozConfig
export const NOTAS_DE_VOZ_DEFAULT: INotasDeVozConfig = { maxDuracionSegundos: 300, maxBytes: 16 * 1024 * 1024 };
```

`obtenerConfigAudio(tenantId)` lee el tenant con `findByIdScoped` / el helper de tenant existente,
aplica los defaults y los topes y devuelve `{ maxDuracionSegundos, maxBytes }`. **`tenantId` sale de
`req.user!.tenantId`.**

### Zod

```ts
export const replyAudioSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z.object({
    // Pista del cliente para la UI optimista. La duración que vale es la medida por ffprobe.
    duracionSegundos: z.coerce.number().positive().max(3600).optional(),
  }),
  query: z.object({}),
});
export const getConfigAudioSchema = z.object({ body: z.object({}), params: z.object({}), query: z.object({}) });
```

`updateTenantSchema.body.notasDeVoz`:
`z.object({ maxDuracionSegundos: z.number().int().min(5).max(900), maxBytes: z.number().int().min(100_000).max(16 * 1024 * 1024) }).partial().optional()`.

Texto con emojis: `sendReplySchema` mantiene `texto: z.string().min(1).max(4096)`. Zod cuenta
unidades UTF-16, igual que el límite de Meta, así que es la cota correcta y conservadora. Solo se
añade un test que confirme que un texto con ZWJ, banderas y tonos de piel **por debajo** del límite
pasa intacto (sin normalizar ni recortar).

### Endpoints

```
GET  /api/conversations/config/audio                → 200 { maxDuracionSegundos, maxBytes }
  authenticateJWT, requireTenant, bandejaRoles, validate(getConfigAudioSchema),
  asyncHandler(getConfigAudioController)
  # registrada ANTES de GET /:id para que 'config' no se interprete como id

POST /api/conversations/:id/messages/audio          → 201 IMessageResponse
  authenticateJWT, requireTenant, bandejaRoles,
  subirAudio,                                      # multer antes de validate (multipart)
  validate(replyAudioSchema),
  asyncHandler(replyAudioController)
  multipart: audio (archivo) · duracionSegundos? (pista)
```

Errores:

| Código | Cuándo |
|---|---|
| `400` | falta el archivo |
| `404` | la conversación no existe **o es de otro tenant** (misma respuesta) |
| `413` | se pasa del tope en bytes (multer o tenant) |
| `415` | mime no admitido |
| `422` | duración medida mayor que el máximo, audio ilegible o **fuera de la ventana de 24 h** (`FUERA_DE_VENTANA`, desde `sendOutbound`) |
| `502` | Graph falló |

### `enviarNotaDeVoz` — orden (espejo de `enviarMediaSaliente`)

1. `findByIdScoped(Cliente, tenantId, clienteId)` → `404` si no existe o es ajeno. **Antes de tocar
   ffmpeg**, para que un id de otro tenant no consuma CPU ni revele nada.
2. `clasificarArchivoSaliente(mime, size)` con `tipo 'audio'` → `415` / `413`. Después, el tope del
   tenant (`obtenerConfigAudio`) → `413`.
3. `getTranscodificador().aNotaDeVoz(buffer)`. Si `duracionSegundos > maxDuracionSegundos`, `422`.
4. `storage.guardar` con `construirMediaKey(tenantId, clienteId, 'audio/ogg')` (clave prefijada por tenant).
5. `getIntegrationWithToken` → `metaMediaClient.subir(phoneNumberId, token, { buffer, mimeType: 'audio/ogg', nombreArchivo: 'nota-de-voz.ogg' })`.
6. `sendOutbound(tenantId, clienteId, { modo: 'media', tipo: 'audio', metaMediaId, mediaKey, mimeType: 'audio/ogg', tamanoBytes, esNotaDeVoz: true, duracionSegundos }, 'agent')`.
   Aquí se decide la ventana de 24 h (`422`).
7. `catch` (pasos 5–6): `storage.borrar(key)` best-effort y relanzar.

> Nota: comprobar la ventana **antes** de transcodificar ahorraría CPU fuera de ventana. Pero eso
> sería una segunda implementación de la regla, que `HU-OMNI-06` prohíbe. Se acepta el coste: el
> frontend ya deshabilita el micrófono con la ventana cerrada, así que esta rama solo la recorre un
> cliente que se salta la UI.

### Jobs BullMQ

No hay cola nueva. La transcodificación de una nota de voz (≤ 5 min, ~1 MB) tarda cientos de ms y
se hace **dentro de la petición**, como la subida de media de OMNI-06: el asesor necesita la
respuesta para ver el mensaje en el hilo. `media-ingest` (worker existente) gana la medición de la
duración para los entrantes.

## Frontend

### `MediaAudio` (reproductor)

- `<audio preload="metadata">` oculto, controlado por el componente.
- Botón circular play/pausa (`aria-label` "Reproducir nota de voz" / "Pausar").
- `Slider` de shadcn para el progreso (se arrastra y se mueve con ←/→ de 5 en 5 s).
- Tiempo `m:ss`: transcurrido mientras suena, total en reposo. El total sale de
  `media.duracionSegundos` y, si falta, de `loadedmetadata`; Chrome da `Infinity` para webm sin
  cues, que se ignora.
- Botón de velocidad 1× → 1.5× → 2×.
- Icono `Mic` si `esNotaDeVoz`, `Music`/`FileAudio` si no.
- `useAudioActivo`: al hacer play se registra el id del mensaje; los demás reproductores se
  suscriben y se pausan.
- Al terminar vuelve a 0 y se queda en pausa.
- Los estados `pendiente` y `fallida` siguen usando `MediaPendiente` / `MediaFallida`.

### `useGrabadora` + `VoiceRecorder`

- Máquina de estados:
  `inactivo → pidiendo-permiso → grabando → procesando → previsualizando → (enviando) → inactivo`,
  y `error` con `motivo: 'sin-permiso' | 'sin-microfono' | 'no-soportado'`.
- `MediaRecorder.isTypeSupported` elige el primer mime soportado de
  `['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4']`.
- Cronómetro por `requestAnimationFrame` y un nivel de entrada con `AnalyserNode`, que es decorativo
  y se desactiva con `prefers-reduced-motion`. Corte automático al llegar a
  `config.maxDuracionSegundos`, con un toast informativo.
- **Siempre** se liberan las pistas (`stream.getTracks().forEach(t => t.stop())`) al detener,
  descartar o desmontar, para que el indicador de micrófono del navegador se apague.
- Previsualización: mini reproductor (el mismo `MediaAudio` en modo local con `URL.createObjectURL`,
  que se revoca al descartar o enviar), duración y botones **Descartar** (`Trash2`), **Regrabar**
  (`RotateCcw`) y **Enviar** (`Send`).
- Composer: con el texto vacío, el botón principal es **micrófono**; al escribir pasa a **enviar**,
  como en WhatsApp. Mientras se graba o se previsualiza, la barra de grabación reemplaza al
  `Textarea`. Esc descarta y Enter envía la previsualización.

### Emojis

- `EmojiButton`: `Popover` (`side="top" align="start"`, origin
  `var(--radix-popover-content-transform-origin)`) con `EmojiPicker` (búsqueda, categorías, tono de
  piel, navegación con teclado).
- **No se cierra** al elegir, para poder poner varios; se cierra con Esc o al pulsar fuera.
- `insertarEnCursor(valor, selectionStart, selectionEnd, emoji)` es una función pura. El composer
  hace `setTexto` y, en `requestAnimationFrame`, `textarea.focus()` y
  `setSelectionRange(cursor, cursor)`. Si el `Textarea` nunca tuvo foco, se inserta al final.
- Emojis tecleados desde el sistema operativo: el `Textarea` ya los acepta.
  - Hay que asegurar que el Enter de envío **no** se dispare durante una composición IME
    (`e.nativeEvent.isComposing`), porque en Windows y macOS el panel de emojis usa IME.
  - En el hilo, el texto se pinta tal cual (`whitespace-pre-wrap break-words`) y con la fuente de
    emoji al final del stack.

### Diseño (criterios `emil-design-eng` + `frontend-design` + `impeccable`)

- Botones de icono con `active:scale-[0.97]` y `transition-transform duration-150 ease-out`.
- Popover de emojis: entrada de 150–200 ms con ease-out desde `scale(0.96)` + opacidad. Nunca
  `scale(0)`.
- Sin animación en lo que dispara el teclado (Enter para enviar, Esc para descartar).
- El cambio mic ↔ enviar es un crossfade de 120 ms con un `blur(2px)` breve; con
  `prefers-reduced-motion` queda solo el cambio de opacidad.
- Punto rojo de "grabando" con pulso suave de opacidad (sin escala).
- Colores solo con tokens: `--grabacion` para el estado de grabación y `primary` para el progreso
  del reproductor dentro de burbujas entrantes. En las salientes (`bg-primary`), el progreso usa
  `primary-foreground`.

## Notas

- **`ffmpeg-static` en el droplet:** descarga el binario en `pnpm install` (postinstall). Hay que
  verificar que el `Dockerfile` o el despliegue no use `--ignore-scripts`; si lo usa, instalar
  `ffmpeg` del sistema y apuntar `FFMPEG_PATH`. Se añade `FFMPEG_PATH?` / `FFPROBE_PATH?` opcionales
  a `env.ts` para ese caso.
- **Meta y la nota de voz:** Graph trata como *voice message* un `type: audio` cuyo archivo es
  `audio/ogg` Opus mono. Hay que verificar contra la documentación vigente de la Cloud API, **al
  implementar**, si además hace falta un flag explícito (`audio.voice: true`). Si existe, el cliente
  lo envía cuando `esNotaDeVoz`. Anotar la fecha de verificación en `meta-whatsapp.md`, como hizo
  OMNI-06 con `LIMITES_MEDIA`.
- **Tests sin ffmpeg real:** los tests de ruta y de servicio inyectan un transcodificador falso con
  `setTranscodificadorForTests`. Solo `ffmpeg.transcoder.test.ts` usa el binario, con un fixture de
  menos de 10 KB, y se salta (`it.skipIf`) si el binario no está disponible en CI.
- **`acusarNoTexto` no cambia:** una nota de voz entrante sigue recibiendo, una vez por racha, el
  mensaje "solo entiendo texto". Transcribir es otra HU.
- **Skill `impeccable:impeccable`:** no estaba instalada al escribir este plan. En `/sdd-implement`
  se invoca junto a `emil-design-eng` y `frontend-design:frontend-design`; si sigue sin estar, se
  deja constancia en el cierre.

## Verificación

```
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint && pnpm --filter @sofiapp/web test
```

- Tests de aislamiento: `tests/isolation/media.isolation.test.ts` (extendido) y
  `conversation.audio.routes.test.ts`.
- Visual (Playwright, capturas en `.playwright-mcp/` que se borran al terminar): reproductor en
  burbuja entrante y saliente, barra de grabación, previsualización y selector de emojis, cada uno
  en light y dark.
- DoD manual con un número real conectado: recibir una nota de voz y reproducirla con avance;
  grabar una, previsualizarla, enviarla y comprobar en el teléfono que llega como **nota de voz**
  (no como archivo); enviar un texto con emojis tecleados (Win + . / Ctrl + Cmd + Espacio) y desde
  el selector, y verlo igual en el CRM y en el teléfono.
