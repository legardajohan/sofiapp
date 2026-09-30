import { ffmpegTranscodificador } from './ffmpeg.transcoder.js';
import type { ITranscodificadorAudio } from './audio.types.js';

export type { IAudioTranscodificado, ITranscodificadorAudio } from './audio.types.js';

let instancia: ITranscodificadorAudio | null = null;

/** El transcodificador de audio. Hoy solo hay un adaptador (ffmpeg); el puerto es para los tests. */
export function getTranscodificador(): ITranscodificadorAudio {
  if (!instancia) instancia = ffmpegTranscodificador;
  return instancia;
}

/**
 * Inyecta un doble en los tests y limpia el singleton al pasar `null`. Es lo que permite al test de
 * aislamiento comprobar que, ante una conversación de otro tenant, ffmpeg **no llega a invocarse**.
 */
export function setTranscodificadorForTests(doble: ITranscodificadorAudio | null): void {
  instancia = doble;
}
