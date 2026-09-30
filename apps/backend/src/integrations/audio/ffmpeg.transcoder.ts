import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import type { IAudioTranscodificado, ITranscodificadorAudio } from './audio.types.js';

/** Una nota de voz de 15 min transcodifica en pocos segundos; 30 s es margen, no expectativa. */
const TIMEOUT_MS = 30_000;

// Los dos paquetes son CommonJS y exportan la ruta como `module.exports`; con `require` se lee tal
// cual, sin depender de cómo cada uno declara su `default` en los tipos.
const requerir = createRequire(import.meta.url);
const ffmpegStatic = requerir('ffmpeg-static') as string | null;
const ffprobeStatic = requerir('ffprobe-static') as { path: string };

const AUDIO_ILEGIBLE = 'No se pudo procesar el audio grabado. Intenta grabarlo de nuevo.';

function rutaFfmpeg(): string {
  const ruta = env.FFMPEG_PATH ?? ffmpegStatic;
  if (!ruta) throw new AppError('El servidor no tiene ffmpeg disponible para procesar audio.', 500);
  return ruta;
}

function rutaFfprobe(): string {
  return env.FFPROBE_PATH ?? ffprobeStatic.path;
}

interface ISalidaProceso {
  codigo: number | null;
  stdout: string;
  stderr: string;
}

/** Ejecuta un binario sin shell (los argumentos nunca se interpretan) y con tiempo máximo. */
function ejecutar(binario: string, args: readonly string[]): Promise<ISalidaProceso> {
  return new Promise((resolve, reject) => {
    const proceso = spawn(binario, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: TIMEOUT_MS,
      killSignal: 'SIGKILL',
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    proceso.stdout.setEncoding('utf8').on('data', (c: string) => (stdout += c));
    // Solo se guarda la cola de stderr: ffmpeg puede ser muy verboso y esto es para el log.
    proceso.stderr.setEncoding('utf8').on('data', (c: string) => (stderr = (stderr + c).slice(-2000)));

    proceso.once('error', reject);
    proceso.once('close', (codigo) => resolve({ codigo, stdout, stderr }));
  });
}

/**
 * Directorio temporal propio por operación, borrado siempre al salir.
 *
 * **Por qué archivos y no stdin/stdout:** el `mp4` que graba Safari lleva el índice (`moov`) al
 * final, y ffmpeg no puede leerlo desde un pipe porque necesita saltar hacia atrás. Igual pasa al
 * medir un `ogg`: su duración está en la última página. Con archivos, todos los formatos funcionan.
 */
async function conDirectorioTemporal<T>(trabajo: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'sofiapp-audio-'));
  try {
    return await trabajo(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch((e: unknown) => {
      logger.warn('No se pudo limpiar el directorio temporal de audio', { dir, error: String(e) });
    });
  }
}

async function duracionDeArchivo(ruta: string): Promise<number | null> {
  try {
    const { codigo, stdout } = await ejecutar(rutaFfprobe(), [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      ruta,
    ]);
    const segundos = Number.parseFloat(stdout.trim());
    if (codigo !== 0 || !Number.isFinite(segundos) || segundos <= 0) return null;
    return Math.round(segundos * 10) / 10;
  } catch (err: unknown) {
    logger.warn('ffprobe no pudo medir el audio', { error: String(err) });
    return null;
  }
}

export const ffmpegTranscodificador: ITranscodificadorAudio = {
  async aNotaDeVoz(entrada: Buffer): Promise<IAudioTranscodificado> {
    if (entrada.byteLength === 0) throw new AppError(AUDIO_ILEGIBLE, 422);

    return conDirectorioTemporal(async (dir) => {
      const rutaEntrada = join(dir, 'entrada');
      const rutaSalida = join(dir, 'salida.ogg');
      await writeFile(rutaEntrada, entrada);

      // Opus mono a 48 kHz es lo que WhatsApp exige para `voice: true`. 32 kbps con `voip` es la
      // calidad de una nota de voz del propio WhatsApp: voz clara y archivos de ~240 KB por minuto.
      //
      // `asetpts=N/SR/TB` reescribe las marcas de tiempo desde cero contando muestras. Sin él, ffmpeg
      // arrastra el desfase del contenedor de entrada —el webm de Chrome empieza en -0,5 ms, el mp4
      // de Safari con su propio retardo— y el ogg sale con el primer granule corrido. El reproductor
      // de WhatsApp no lo tolera: la nota llega, pero el teléfono muestra "Audio ya no disponible".
      // `-map_metadata -1` quita las etiquetas del origen, que tampoco pintan nada en una nota de voz.
      const { codigo, stderr } = await ejecutar(rutaFfmpeg(), [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        rutaEntrada,
        '-vn',
        '-af',
        'asetpts=N/SR/TB',
        '-map_metadata',
        '-1',
        '-ac',
        '1',
        '-ar',
        '48000',
        '-c:a',
        'libopus',
        '-b:a',
        '32k',
        '-application',
        'voip',
        '-f',
        'ogg',
        rutaSalida,
      ]);

      if (codigo !== 0) {
        logger.warn('ffmpeg no pudo transcodificar la nota de voz', { codigo, stderr });
        throw new AppError(AUDIO_ILEGIBLE, 422);
      }

      const buffer = await readFile(rutaSalida);
      const duracionSegundos = await duracionDeArchivo(rutaSalida);
      if (buffer.byteLength === 0 || duracionSegundos === null) {
        throw new AppError(AUDIO_ILEGIBLE, 422);
      }

      return { buffer, mimeType: 'audio/ogg', duracionSegundos };
    });
  },

  async medirDuracion(entrada: Buffer): Promise<number | null> {
    if (entrada.byteLength === 0) return null;
    try {
      return await conDirectorioTemporal(async (dir) => {
        const ruta = join(dir, 'audio');
        await writeFile(ruta, entrada);
        return duracionDeArchivo(ruta);
      });
    } catch (err: unknown) {
      logger.warn('No se pudo medir la duración del audio', { error: String(err) });
      return null;
    }
  },
};
