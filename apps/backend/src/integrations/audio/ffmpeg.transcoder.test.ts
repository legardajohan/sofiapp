/**
 * El adaptador de ffmpeg contra el binario REAL (HU-OMNI-07, ADR-0009). Es el único test que lo
 * ejecuta: los de ruta y servicio usan un doble. Se salta si el binario no está instalado (por
 * ejemplo, en un CI que instale con `--ignore-scripts`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { ffmpegTranscodificador } from './ffmpeg.transcoder.js';
import { AppError } from '../../utils/AppError.js';

const requerir = createRequire(import.meta.url);
const binario = requerir('ffmpeg-static') as string | null;
const hayFfmpeg = !!binario && existsSync(binario);

/** 1,5 s de un tono de 440 Hz en webm/opus: lo mismo que produce MediaRecorder en Chrome. */
const FIXTURE = fileURLToPath(
  new URL('../../../tests/fixtures/audio/grabacion.webm', import.meta.url),
);

describe.skipIf(!hayFfmpeg)('ffmpegTranscodificador (binario real)', () => {
  it('convierte una grabación webm/opus en ogg/opus y mide su duración', async () => {
    const entrada = await readFile(FIXTURE);

    const salida = await ffmpegTranscodificador.aNotaDeVoz(entrada);

    expect(salida.mimeType).toBe('audio/ogg');
    // Toda página ogg empieza por "OggS": es la firma del contenedor.
    expect(salida.buffer.subarray(0, 4).toString('ascii')).toBe('OggS');
    expect(salida.buffer.toString('latin1')).toContain('OpusHead');
    expect(salida.duracionSegundos).toBeGreaterThan(1.3);
    expect(salida.duracionSegundos).toBeLessThan(1.8);
  }, 30_000);

  it('la salida es mono (lo que WhatsApp exige para `voice: true`)', async () => {
    const salida = await ffmpegTranscodificador.aNotaDeVoz(await readFile(FIXTURE));

    // Cabecera OpusHead: "OpusHead" (8 bytes) + versión (1) + número de canales (1).
    const i = salida.buffer.indexOf('OpusHead');
    expect(salida.buffer[i + 9]).toBe(1);
  }, 30_000);

  it('REGRESIÓN: la salida empieza en 0 (si no, WhatsApp muestra "Audio ya no disponible")', async () => {
    const salida = await ffmpegTranscodificador.aNotaDeVoz(await readFile(FIXTURE));

    const dir = await mkdtemp(join(tmpdir(), 'sofiapp-test-audio-'));
    try {
      const ruta = join(dir, 'salida.ogg');
      await writeFile(ruta, salida.buffer);
      const ffprobe = (requerir('ffprobe-static') as { path: string }).path;
      const inicio = execFileSync(
        ffprobe,
        ['-v', 'error', '-show_entries', 'stream=start_pts', '-of', 'csv=p=0', ruta],
        { encoding: 'utf8' },
      ).trim();

      // Con el desfase del contenedor de entrada arrastrado salía 336 (fixture) o -24 (Chrome).
      expect(inicio).toBe('0');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it('un audio ilegible es un 422 con un mensaje para el asesor, no un 500', async () => {
    const error = await ffmpegTranscodificador
      .aNotaDeVoz(Buffer.from('esto no es audio'))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(422);
  }, 30_000);

  it('medirDuracion devuelve null en vez de lanzar si no puede medir', async () => {
    expect(await ffmpegTranscodificador.medirDuracion(Buffer.from('basura'))).toBeNull();
    expect(await ffmpegTranscodificador.medirDuracion(Buffer.alloc(0))).toBeNull();
  }, 30_000);
});
