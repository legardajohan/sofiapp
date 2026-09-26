# ADR 0009 — Transcodificación de notas de voz con ffmpeg en el backend

**Estado:** aceptado · **Fecha:** 2026-09-26 · **Contexto:** HU-OMNI-07 (notas de voz y emojis)

## Contexto

HU-OMNI-07 pide que el asesor grabe una nota de voz en el navegador y que al cliente le llegue
**como nota de voz de WhatsApp**: con onda, icono de micrófono, transcripción y la marca de
"escuchada". No como un archivo de audio adjunto.

La Cloud API solo la presenta así con dos condiciones (verificado en
`developers.facebook.com/docs/whatsapp/cloud-api/messages/audio-messages` el 2026-09-26):

- el objeto `audio` lleva `"voice": true`;
- el archivo es **`audio/ogg` con códec Opus, mono**. Con otro formato, Meta lo acepta pero como
  audio normal, y la transcripción falla.

Ningún navegador graba eso de forma fiable. `MediaRecorder` da `audio/webm;codecs=opus` en Chrome y
Edge, `audio/mp4` (AAC) en Safari y `audio/ogg;codecs=opus` solo en Firefox. El webm lleva el mismo
Opus, pero en otro contenedor; el mp4 de Safari ni siquiera usa ese códec.

Hay una segunda necesidad: la **duración**. La historia pide mostrarla y Meta no la informa en el
webhook de un audio entrante, así que hay que medirla sobre los bytes.

## Decisión

**El backend transcodifica toda grabación a `ogg/opus` mono a 48 kHz con ffmpeg, y mide la duración
con ffprobe.** Ambos binarios los aportan `ffmpeg-static` y `ffprobe-static`.

- Puerto `ITranscodificadorAudio` en `integrations/audio/` (`aNotaDeVoz`, `medirDuracion`), con un
  único adaptador (`ffmpeg.transcoder.ts`) y `setTranscodificadorForTests` para los tests.
- Parámetros: `-af asetpts=N/SR/TB -map_metadata -1 -ac 1 -ar 48000 -c:a libopus -b:a 32k -application voip -f ogg`.
  `asetpts` reinicia las marcas de tiempo en 0: sin él el ogg hereda el desfase del webm de Chrome
  (primer granule corrido) y el teléfono muestra "Audio ya no disponible". 32 kbps en modo
  `voip` es la calidad de una nota de voz del propio WhatsApp (~240 KB por minuto).
- Se trabaja con **archivos temporales**, no con stdin/stdout. El mp4 de Safari tiene el índice
  (`moov`) al final y ffmpeg no puede leerlo desde un pipe, y la duración de un ogg está en su
  última página. El directorio temporal es propio de cada operación y se borra en un `finally`.
- Se usa `spawn` sin shell (los argumentos nunca se interpretan) y con timeout de 30 s.
- La duración que se persiste y contra la que se aplica el límite del tenant es **la medida**. La
  que declara el navegador es solo una pista para el log.
- `media-ingest` usa el mismo puerto para medir la duración de los audios entrantes. Si no puede
  medirla, el mensaje queda `disponible` igual: la duración es un adorno y no puede costar el archivo.
- Rutas sobreescribibles con `FFMPEG_PATH` / `FFPROBE_PATH` para despliegues que instalen con
  `--ignore-scripts` (sin él, `ffmpeg-static` no descarga su binario) y quieran usar el ffmpeg del
  sistema. `ffmpeg-static` va en `allowBuilds` de `pnpm-workspace.yaml` por la misma razón.

## Alternativas

- **Codificar en el navegador con un encoder WASM** (p. ej. `opus-recorder`). Evita el binario en el
  servidor, pero suma cientos de KB al bundle, no resuelve la duración de los entrantes y deja la
  medición —y por tanto el límite— del lado del cliente.
- **Remuxar webm → ogg sin transcodificar.** El Opus ya está dentro, así que sería barato, pero solo
  cubre Chrome/Edge: el AAC de Safari exige transcodificar igual.
- **No convertir y enviar como audio normal.** Es lo más simple, pero no cumple la historia: al
  cliente le llegaría un archivo, no una nota de voz.

## Consecuencias

- El droplet lleva un binario de ~70 MB más. Es aceptable frente al coste de las alternativas.
- La transcodificación ocurre **dentro de la petición HTTP**. Una nota de 5 minutos tarda del orden
  de un segundo, y el asesor necesita la respuesta para ver el mensaje en el hilo. Si algún día el
  límite sube mucho, habrá que pasarla a una cola.
- Los tests de ruta y de servicio no dependen de ffmpeg. Solo `ffmpeg.transcoder.test.ts` usa el
  binario real, con un fixture de 4 KB, y se salta si el binario no está.
- El puerto deja la puerta abierta a más procesamiento de audio (p. ej. transcripción para Sofi)
  sin tocar el feature.
