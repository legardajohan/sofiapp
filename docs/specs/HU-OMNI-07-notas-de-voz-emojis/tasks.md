# HU-OMNI-07 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Rama: `feat/HU-OMNI-07`, creada **desde `develop`** (ya al día con
> `origin/develop`, que incluye HU-OMNI-06).

## 0. Preparación

- [x] `git fetch origin && git switch develop && git merge --ff-only origin/develop`.
- [x] `git switch -C feat/HU-OMNI-07 develop` (la rama local previa estaba obsoleta y sin commits
      propios).
- [x] `git status` limpio antes de empezar a implementar.
- [x] Backend: `pnpm --filter @sofiapp/api add ffmpeg-static ffprobe-static` (y los `@types` si
      hacen falta). Comprobar que `node -e "console.log(require('ffmpeg-static'))"` da una ruta
      existente.
- [x] `env.ts`: `FFMPEG_PATH?` y `FFPROBE_PATH?` opcionales (fallback a los binarios estáticos).
      ⚠️ **`.env.example` quedó sin tocar**: el archivo tiene una regla de denegación de lectura
      y escritura en la configuración de Claude Code. Hay que añadir a mano, junto a
      `MEDIA_MAX_BYTES_DOCUMENTO`, las líneas `FFMPEG_PATH=` y `FFPROBE_PATH=` (vacías = binarios
      de `ffmpeg-static`/`ffprobe-static`).
- [x] Revisar el despliegue por `--ignore-scripts`: el repo no tiene `Dockerfile` (PM2 en el
      droplet). `ffmpeg-static` se añadió a `allowBuilds` de `pnpm-workspace.yaml` y el caso quedó
      anotado en el ADR 0009.
- [x] Añadir un fixture de audio mínimo (< 10 KB, `webm/opus`) en `apps/backend/tests/fixtures/audio/`
      (`grabacion.webm`, 4 KB, 1,5 s a 440 Hz).

## 1. Backend — dominio y modelo

- [x] `features/media/media.types.ts`: `TipoMediaSaliente` con `'audio'`, `LIMITES_MEDIA.audio`
      (mimes de grabación y 16 MB) y `MIME_NOTA_DE_VOZ`.
- [x] `features/message/message.types.ts`: `IMensajeMedia.esNotaDeVoz?`; el modo `media` de
      `ContenidoOutbound` con `esNotaDeVoz?` y `duracionSegundos?`.
- [x] `features/message/message.model.ts`: `MediaSchema.esNotaDeVoz` (Boolean, default `false`).
      Sin índices nuevos.
- [x] `features/message/message.service.ts`: `sendOutbound` en modo `media` persiste `esNotaDeVoz`
      y `duracionSegundos`. **No tocar la regla de ventana.**
- [x] `features/tenant/tenant.types.ts`: `INotasDeVozConfig` y `NOTAS_DE_VOZ_DEFAULT`.
- [x] `features/tenant/tenant.model.ts`: subdocumento `notasDeVoz` (opcional).
- [x] `features/tenant/tenant.validation.ts`: `updateTenantSchema.body.notasDeVoz` con cotas.
- [x] `features/tenant/tenant.service.ts`: persistir `notasDeVoz` al actualizar.
- [x] `docs/data-model.md`: `messages.media.esNotaDeVoz` y `tenants.notasDeVoz`.

## 2. Backend — transcodificador

- [x] `integrations/audio/audio.types.ts`: `ITranscodificadorAudio` e `IAudioTranscodificado`.
- [x] `integrations/audio/ffmpeg.transcoder.ts`:
      - `aNotaDeVoz` (stdin→stdout, `-ac 1 -ar 48000 -c:a libopus -b:a 32k -application voip -f ogg`).
      - `medirDuracion` (ffprobe, que devuelve `null` si falla).
      - Timeout de 20 s con `kill`.
      - Errores → `AppError(…, 422)`.
- [x] `integrations/audio/index.ts`: `getTranscodificador()` (singleton perezoso) y
      `setTranscodificadorForTests()`.
- [x] `docs/adr/0009-transcodificacion-de-audio.md` + la fila en `docs/adr/README.md`.

## 3. Backend — feature (patrón types → model → validation → service → controller → routes)

- [x] **validation** (`conversation.validation.ts`): `replyAudioSchema` y `getConfigAudioSchema`.
- [x] **service** (`media.service.ts`):
      - `maxBytesDe('audio')`.
      - `enviarNotaDeVoz(tenantId, clienteId, archivo, duracionPista?)` en el orden de `plan.md`:
        cliente scoped → clasificar → tope del tenant → transcodificar → duración máx. → guardar →
        subir a Graph → `sendOutbound` → limpieza del huérfano en el `catch`.
      - `toMediaResponse` expone `duracionSegundos` y `esNotaDeVoz`.
- [x] **service** (`conversation.service.ts`):
      - `obtenerConfigAudio(tenantId)`: defaults y `min` con el env y Meta.
      - `replyAudioMessage(...)` → `enviarNotaDeVoz` + `notificarSaliente`.
- [x] **controller** (`conversation.controller.ts`): `replyAudioController` (`400` sin archivo;
      `tenantId` de `req.user!.tenantId`) y `getConfigAudioController`. Sin `try/catch` y sin
      Mongoose.
- [x] **middleware** (`upload.middleware.ts`): `subirAudio` (campo `audio`, `fileSize` = env audio,
      misma traducción de `MulterError`).
- [x] **routes** (`conversation.routes.ts`):
      - `GET /config/audio` **antes** de cualquier `GET /:id`.
      - `POST /:id/messages/audio` con `authenticateJWT, requireTenant, bandejaRoles, subirAudio,
        validate, asyncHandler`.
      - Ya están montadas en `app.ts` vía `/api/conversations`: verificar, sin montaje nuevo.
- [x] `integrations/meta/meta-whatsapp.client.ts`:
      - `TIPO_META.audio = 'audio'`.
      - Omitir `caption` y `filename` para audio **dentro del cliente**.
      - Verificar en la doc vigente de la Cloud API si existe `audio.voice` y, si existe, enviarlo
        con `esNotaDeVoz`. Anotar la fecha de verificación.
- [x] `docs/api-contract.md` e `docs/integrations/meta-whatsapp.md`: el endpoint nuevo, los errores
      y el audio saliente.

## 4. Backend — entrantes y servido de media

- [x] `workers/inbound-message.processor.ts`: `media.esNotaDeVoz = msg.audio?.voice === true`.
- [x] `workers/media-ingest.processor.ts`: si `tipo === 'audio'`, `medirDuracion` tras guardar,
      **en un `try` propio** (un fallo se loguea y el mensaje queda `disponible` sin duración).
- [x] `integrations/storage/storage.types.ts` + `local-disk.storage.ts`: `leer(key, rango?)` con
      `createReadStream({ start, end })`.
- [x] `features/media/media.controller.ts`: con cabecera `Range` en el driver local, responder
      `206`, `Content-Range` y `Accept-Ranges: bytes`; `416` si el rango es inválido. Mantener
      `nosniff` y `Cache-Control: private`.

## 5. Frontend — preparación de UI

- [x] **Invocar las skills antes de escribir componentes:** `emil-design-eng` y
      `frontend-design:frontend-design` invocadas. ⚠️ `impeccable:impeccable` **no está instalada**
      en esta sesión (no aparece entre las skills disponibles). Sus criterios de UX (estados de
      error accionables, jerarquía, accesibilidad) se aplicaron a mano; conviene pasarla cuando
      esté disponible.
- [x] `pnpm dlx shadcn@3.8.5 add slider` y alinear las clases con los tokens. (La CLI instaló con
      npm y tocó `package-lock.json`; se revirtió y la dependencia se instaló con pnpm.) Se le
      añadieron la variante `transparente`, `thumbClassName` y `thumbAriaLabel`/`thumbAriaValueText`
      (en Radix el nombre accesible va en el pulgar, no en la raíz).
- [x] `pnpm --filter @sofiapp/web add frimousse` y vendorizar `src/components/ui/emoji-picker.tsx`
      (Tailwind 3 y tokens; light y dark).
- [x] `index.css`: tokens `--grabacion`, `--nota-voz` y `--nota-voz-foreground` en los **tres**
      bloques (`:root`, `.dark`, `.light` forzado), mapeados en `tailwind.config.js`. (`--nota-voz`
      reemplaza al `--audio-progreso` del plan: es el verde de la nota de voz de WhatsApp.)
- [x] `tailwind.config.js`: `fontFamily.sans` termina en
      `"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji"`.

## 6. Frontend — reproductor

- [x] `features/inbox/types.ts`: `MediaDTO.duracionSegundos` y `MediaDTO.esNotaDeVoz`.
- [x] `lib/media.ts`: `formatearDuracion(segundos)`.
- [x] `hooks/useAudioActivo.ts` (Zustand): un solo audio sonando.
- [x] `components/message/MediaAudio.tsx` reescrito:
      - play/pausa, `Slider` (ratón y ←/→) y tiempo transcurrido/total;
      - velocidad 1×/1.5×/2×, icono según `esNotaDeVoz` y variante para burbuja saliente;
      - ignorar `duration === Infinity`;
      - reescribir el comentario de cabecera (ya no es el `<audio controls>` nativo).

## 7. Frontend — grabadora

- [x] `api.ts`: `sendAudioReply(id, blob, duracionSegundos, onProgress?)` (FormData con el campo
      `audio`, `TIMEOUT_SUBIDA_MS`) y `getConfigAudio()` → `GET /conversations/config/audio`.
- [x] `useConfigAudio` (TanStack Query, `staleTime` de 10 min), en `hooks/useThread.ts`.
- [x] `hooks/useThread.ts`: `useSendAudio(id)` con progreso, toast de error e invalidación, como
      `useSendMedia`. `useConfigAudio` vive en el mismo archivo (no en un `useConfigAudio.ts` aparte).
- [x] `hooks/useGrabadora.ts`:
      - máquina de estados, elección de mime con `isTypeSupported` y cronómetro;
      - nivel con `AnalyserNode` (sin animación si hay `prefers-reduced-motion`) y corte en
        `maxDuracionSegundos`;
      - **liberar siempre las pistas** y revocar las object URLs;
      - errores `sin-permiso`, `sin-microfono` y `no-soportado` con un mensaje claro.
- [x] `components/composer/VoiceRecorder.tsx`: barra de grabación (punto rojo, cronómetro,
      cancelar, detener) y previsualización (reproducir, duración, descartar, regrabar, enviar).
      Esc descarta y Enter envía.

## 8. Frontend — emojis y composer

- [x] `lib/insertarEnCursor.ts` (función pura).
- [x] `components/composer/EmojiButton.tsx`: un `Popover` que no se cierra al elegir, con el origin
      del trigger.
- [x] `MessageComposer.tsx`:
      - botón de emoji a la izquierda del `Textarea`;
      - mic ↔ enviar según el texto, y modo grabación que reemplaza al `Textarea`;
      - foco y cursor restaurados tras insertar un emoji;
      - Enter ignorado si `isComposing`;
      - todos los controles nuevos siguen `bloqueado`.
- [x] `MessageBubble.tsx`: el texto con `whitespace-pre-wrap break-words`.
- [x] Superadmin (`HU-SAAS-01`): campos de nota de voz en el formulario de edición de empresa.
- [x] `apps/frontend/CLAUDE.md`: sección HU-OMNI-07 (reproductor, grabadora, emoji-picker, tokens).

## 9. Tests — backend

- [x] `conversation.audio.routes.test.ts` (supertest, transcodificador falso):
      - `400` sin archivo, `415` por mime, `413` por el tope del tenant y `422` por duración medida;
      - `422` fuera de la ventana de 24 h, **con el mismo cuerpo que el texto**;
      - `201` que persiste `tipo: 'audio'`, `esNotaDeVoz: true` y `duracionSegundos`, y que envía a
        Meta sin caption;
      - el tenant sin `notasDeVoz` usa los defaults.
- [x] Orden de las operaciones, limpieza del huérfano si falla Graph y clave prefijada por tenant:
      cubiertos en `conversation.audio.routes.test.ts`. Que el transcodificador **no** se invoca para
      un cliente ajeno está en el test de aislamiento. Las piezas puras (`resolverRangoBytes`,
      caminos de `clasificarArchivoSaliente`) están en `media/media.audio.test.ts`, y el cuerpo que
      llega a Graph (`voice: true`, sin caption) en `meta/meta-whatsapp.client.test.ts`.
- [x] `inbound-message.media.test.ts`: `audio.voice: true` → `esNotaDeVoz: true`; sin `voice` →
      `false`.
- [x] `media-ingest.processor.test.ts`: la duración se guarda; si `medirDuracion` falla, el mensaje
      igual queda `disponible`.
- [x] `ffmpeg.transcoder.test.ts`: fixture → `audio/ogg` mono con duración > 0 (`skipIf` si no hay
      binario).
- [x] `local-disk.storage.test.ts` (lectura por rango) y `GET /api/media/:id` con `Range` → `206`
      y `416` (en `tests/isolation/voice-note.isolation.test.ts`).
- [x] Emojis: un texto `"Hola 👩🏽‍💻 🇨🇴 ✨"` viaja por `POST /messages` y se persiste y se devuelve
      byte a byte idéntico.
- [x] Límite parcial del tenant: actualizar un campo de `notasDeVoz` no borra el otro
      (`tenant.service.test.ts`).
- [x] **Aislamiento** (archivo nuevo, `tests/isolation/voice-note.isolation.test.ts`, en vez de
      extender `media.isolation.test.ts`: necesita otros mocks):
      - audio a la conversación de otro tenant → `404`, sin invocar el transcodificador, el storage
        ni Graph;
      - `GET /config/audio` devuelve la config del tenant del token aunque se mande otro `tenantId`
        por query o body;
      - la clave de un audio saliente empieza por el `tenantId` del token.

## 10. Tests — frontend

- [x] `insertarEnCursor.test.ts`: cursor al inicio, en medio y al final, con selección que se
      reemplaza, y con secuencias ZWJ ya presentes (no parte un emoji compuesto).
- [x] `MediaAudio.test.tsx` (con `HTMLMediaElement.play/pause` mockeados): play/pausa, seek con el
      slider y el teclado, duración del DTO frente a los metadatos, y que un segundo audio pausa al
      primero.
- [x] `MessageComposer.voz.test.tsx` (con `MediaRecorder` y `getUserMedia` mockeados; cubre
      `VoiceRecorder`, `useGrabadora` y `EmojiButton` a través del composer): grabar → detener
      → previsualizar → enviar; descartar libera las pistas; permiso denegado muestra el mensaje;
      corte al llegar al máximo.
- [x] Emojis, en el mismo `MessageComposer.voz.test.tsx`: el emoji se inserta en el cursor, y
      varios seguidos sin que el selector se cierre (este test destapó un bug: devolver el foco al
      campo cerraba el popover); Enter
      durante `isComposing` no envía; mic, emoji y adjuntar deshabilitados con la ventana cerrada; y
      el botón principal alterna mic/enviar.

## 11. Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` en verde (sin `any`).
- [ ] `pnpm --filter @sofiapp/api test` en verde (incluido el aislamiento). **Falta la corrida
      completa final.** La suite entera pasó (126 archivos, 1385 tests) tras los cambios de código
      del backend, y los 8 archivos de test nuevos o tocados pasan uno a uno. La re-ejecución
      completa con todo junto la detuvo Claude Code por falta de memoria del equipo.
- [ ] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint && pnpm --filter @sofiapp/web test`
      en verde. **Falta la corrida final.** `lint` y `build` pasaron, y los tests de `features/inbox`
      (incluidos los 3 archivos nuevos) pasan. Después se tocaron `TenantForm.tsx` y el foco del
      selector de emojis, y la re-ejecución completa se detuvo por falta de memoria.
- [x] Checklist PR de `docs/multi-tenancy.md` §9:
      - ningún `Model.find/create/findById` directo;
      - `tenantId` solo del token;
      - clave de storage prefijada;
      - test de aislamiento presente.
- [ ] Revisión visual con Playwright en light y dark (reproductor entrante y saliente, grabación,
      previsualización, selector). **Pendiente:** en esta sesión no se pudo levantar la app (el
      acceso a los servidores locales y a los `.env` está denegado por permisos). `git status` sin
      `*.png` sueltos: ✅.
- [ ] `spec.md` → `**Estado:** implementado` (se cambia cuando las dos corridas de arriba estén en verde).

## Definición de "hecho"

- Los criterios 1–11 de `spec.md` se cumplen y cada uno tiene su test o su verificación manual
  anotada.
- **DoD manual** (con un número de WhatsApp real conectado):
  - un asesor reproduce una nota de voz recibida, con avance y duración;
  - graba y envía una propia, que llega al teléfono **como nota de voz**;
  - compone y envía un mensaje que combina texto, emojis tecleados desde el sistema operativo y
    emojis del selector, y se ve igual en el CRM y en el teléfono;
  - todo sin salir del hilo.
- Si el DoD manual no se puede hacer en la sesión, queda escrito como pendiente en el `spec.md`,
  como en HU-OMNI-06.
