# HU-OMNI-07 — Notas de voz y emojis en el chat (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución en
> `tasks.md`. Cierra el hueco que `HU-OMNI-06` dejó declarado como fuera de alcance (audio saliente
> y notas de voz) y añade los emojis al composer de la bandeja.

**Estado:** creado

## Historia

Como **asesor** quiero grabar y enviar notas de voz, reproducir los audios que envía el cliente y
usar emojis en mis mensajes, para comunicarme de forma natural, igual que en WhatsApp.

## Contexto de dominio (importante)

- **No existe colección `Conversation`**: una conversación es un `Cliente` proyectado para la
  bandeja y el hilo son sus `Message` (ver `HU-OMNI-06` §Contexto). La metadata de audio vive en
  `Message.media`, como la de cualquier otra media.
- **`HU-OMNI-06` ya hace casi todo lo de entrada:** el normalizador reconoce `audio`, la cola
  `media-ingest` lo descarga a nuestro almacenamiento y el hilo lo pinta con un `<audio controls>`
  nativo. Lo que falta: la **duración** (`media.duracionSegundos` existe en el schema pero ninguna
  ruta la escribe), distinguir la **nota de voz** del archivo de audio (`audio.voice` llega en el
  webhook, está tipado y nadie lo lee) y un reproductor con controles propios.
- **`sendOutbound` (`message.service.ts`) sigue siendo el único juez de la ventana de 24 h.** El audio
  entra como un modo `media` más; no se reimplementa la regla.
- **Formato:** los navegadores graban `audio/webm;codecs=opus` (Chrome/Edge/Firefox) o `audio/mp4`
  (Safari). WhatsApp solo presenta el mensaje como **nota de voz** (onda, icono de micrófono,
  "escuchada") si recibe `audio/ogg` **Opus mono**. Por eso hace falta transcodificar en el servidor
  (ver `plan.md` §Decisiones y ADR `0009`).
- **Emojis:** el texto ya es Unicode de punta a punta (Mongo, Zod, Graph). El riesgo está en los
  bordes: la inserción desde un selector en la posición del cursor, las secuencias compuestas
  (ZWJ, banderas, tonos de piel) y la fuente con la que se pintan.

## Objetivo

Que un asesor **reproduzca** una nota de voz recibida, **grabe y envíe** una propia desde el
micrófono del navegador —que le llegue al cliente como nota de voz de WhatsApp— y **componga
mensajes con emojis** (tecleados desde el sistema operativo o elegidos en un selector), todo sin salir
del hilo de la conversación.

## Alcance

Incluye:
- `Message.media.esNotaDeVoz` (nuevo) y la escritura de `Message.media.duracionSegundos`
  (existente) para audio entrante y saliente.
- Normalizador de entrantes (`HT-WA-01`): `audio.voice → esNotaDeVoz`; `media-ingest` mide la
  duración con `ffprobe` tras descargar.
- Puerto `ITranscodificadorAudio` con adaptador `ffmpeg` (`ffmpeg-static` / `ffprobe-static`):
  cualquier grabación → `audio/ogg` Opus mono 48 kHz, y medición de la duración. ADR `0009`.
- Endpoint `POST /api/conversations/:id/messages/audio` (subida, transcodificación, almacenamiento,
  subida a Graph y envío `type: audio`).
- Límite configurable **por tenant**: `Tenant.notasDeVoz { maxDuracionSegundos, maxBytes }` con
  valores por defecto, editable desde el CRUD de empresas (`HU-SAAS-01`), y un endpoint de lectura
  para que el frontend corte la grabación en vivo.
- Soporte de `Range` (`206 Partial Content`) en el driver `local` de `GET /api/media/:id`, para que
  "avanzar" funcione en desarrollo (Spaces ya lo soporta vía la URL prefirmada).
- Frontend:
  - Reproductor de audio inline propio (play/pausa, barra desplazable, transcurrido/total,
    velocidad 1×/1.5×/2×, un solo audio sonando a la vez).
  - Grabadora de voz sobre `MediaRecorder` (grabar, detener, previsualizar, descartar, regrabar,
    enviar).
  - Selector de emojis en el composer con inserción en el cursor.
  - Fuente de emoji en el stack tipográfico.
- Documentación: ADR `0009`, `data-model.md`, `api-contract.md`, `integrations/meta-whatsapp.md`
  y la sección OMNI-07 de `apps/frontend/CLAUDE.md`.

Fuera de alcance (otros features o deuda declarada):
- **Transcripción de audio para Sofi.** Un audio entrante sigue disparando `acusarNoTexto`
  (`MENSAJE_SOLO_TEXTO`), como hoy (`HU-IA-02`).
- **Reacciones con emoji** (mensajes `reaction` de Meta): hoy caen en `tipo: 'otro'`. Es otra HU.
- **Forma de onda real calculada en el servidor.** El reproductor usa una barra de progreso; la
  onda decorativa, si la hay, no representa la señal.
- Reenvío de notas de voz entre conversaciones y plantillas HSM con cabecera de audio.
- Subir un archivo de audio ya existente desde el menú de adjuntar (solo se envía lo grabado).

## Criterios de aceptación

1. Un audio o una nota de voz **entrantes** se reproducen desde el hilo con **reproducir/pausar**,
   una **barra para avanzar y retroceder** (con ratón y teclado) y la **duración** (transcurrido y
   total). La nota de voz se distingue visualmente de un archivo de audio (icono de micrófono). Al
   reproducir un audio, el que estuviera sonando se pausa.
2. El mensaje entrante persiste `media.esNotaDeVoz` (desde `audio.voice` del webhook) y
   `media.duracionSegundos` (medida con `ffprobe` en `media-ingest`). **Si `ffprobe` falla, el
   mensaje queda igualmente `disponible`, solo que sin duración**, y el reproductor la toma de los
   metadatos del `<audio>`: la medición nunca hace perder la media.
3. El asesor graba desde el **micrófono del navegador** sin salir del hilo. Si el permiso se
   deniega, no hay micrófono o el navegador no tiene `MediaRecorder`, ve un mensaje claro y
   accionable, no un error opaco ni un botón muerto.
4. Al detener la grabación aparece una **previsualización** con la duración, un botón para
   escucharla y las opciones **descartar**, **regrabar** y **enviar**. Nada se sube hasta pulsar
   enviar.
5. `POST /api/conversations/:id/messages/audio`:
   - Acepta la grabación (`webm`/`ogg`/`mp4` con Opus o AAC).
   - La transcodifica a `audio/ogg` Opus mono.
   - La guarda en el almacenamiento de `HU-OMNI-06`, la sube a Graph y la envía como `type: audio`,
     **sin caption**.
   - Persiste `tipo: 'audio'`, `media.esNotaDeVoz: true` y `media.duracionSegundos` (medida en el
     servidor; la que manda el cliente es solo una pista).
   - El hilo muestra el mensaje enviado vía `message:new` sin recargar.
   - Si algo falla después de guardar, el archivo huérfano se borra.
6. El **límite por tenant** (`Tenant.notasDeVoz`) se aplica en los dos lados:
   - El frontend corta la grabación al llegar a `maxDuracionSegundos` y lo avisa.
   - El servidor rechaza con `413` si se pasa de `maxBytes` y con `422` si la duración medida
     excede el máximo, con mensajes en español.
   - Un tenant sin configuración usa los valores por defecto (300 s, 16 MB).
   - El tope efectivo nunca supera el de Meta ni el de `MEDIA_MAX_BYTES_AUDIO`.
7. El envío de audio respeta la **ventana de 24 h** a través de `sendOutbound`: fuera de ventana
   devuelve el **mismo `422`** que el texto libre. Con la ventana cerrada, el micrófono y el
   selector de emojis se deshabilitan junto al banner, igual que el adjuntar. No hay una segunda
   implementación de la regla.
8. El composer incluye un **selector de emojis**. Al elegir uno se inserta **en la posición actual
   del cursor** (reemplazando la selección, si la hay) y el foco vuelve al campo con el cursor
   justo detrás del emoji. El selector se opera con teclado y tiene búsqueda.
9. Los emojis **tecleados desde el sistema operativo** (incluidas las secuencias ZWJ `👩🏽‍💻`, las
   banderas `🇨🇴` y los tonos de piel) se escriben, se envían, se persisten y se renderizan en el
   hilo **idénticos**. No se cortan por la mitad, no rompen el envío con Enter ni la validación de
   longitud, y se ven con la fuente de emoji del sistema.
10. Todos los componentes nuevos o tocados quedan prolijos en **light y dark** con tokens semánticos,
    tienen `aria-label` en los botones de icono, el reproductor y la grabadora se usan con teclado,
    y respetan `prefers-reduced-motion`.
11. **Aislamiento multi-tenant:**
    - Enviar audio a una conversación de otro tenant devuelve `404`, **sin invocar el transcodificador,
      el almacenamiento ni Graph**.
    - La clave de almacenamiento va prefijada por el `tenantId` del token.
    - El límite de grabación que se lee y se aplica es siempre el del tenant del token, nunca uno
      recibido por body, params o query.

    Hay test que lo prueba. `pnpm --filter @sofiapp/api typecheck` y `test` en verde, y
    `pnpm --filter @sofiapp/web build`, `lint` y `test` en verde, sin `any`.

## Dependencias

- `HT-WA-01` / `HT-WA-01-V2`: webhook y normalizador de entrantes.
- `HT-WA-02`: catálogo de plantillas HSM y la regla de la ventana de 24 h en `sendOutbound`.
- `HU-OMNI-01`: bandeja, hilo, composer y `message:new`.
- **`HU-OMNI-06`**: `IMediaStorage`, cola `media-ingest`, `GET /api/media/:id` firmado,
  `enviarMediaSaliente`, `metaMediaClient.subir` y el modo `media` de `sendOutbound`.
- `HU-SAAS-01`: CRUD de empresas del superadmin, donde se edita `Tenant.notasDeVoz`.
- `INF-02`: repositorio tenant-safe.
- Binario `ffmpeg` disponible en el droplet (lo aporta `ffmpeg-static`; ver ADR `0009`).
