/** Resultado de convertir una grabación del navegador al formato de nota de voz de WhatsApp. */
export interface IAudioTranscodificado {
  buffer: Buffer;
  /** Siempre `audio/ogg` con Opus mono a 48 kHz: lo único que WhatsApp presenta como nota de voz. */
  mimeType: 'audio/ogg';
  /** Medida sobre la salida (no la que declara el cliente), redondeada a décimas. */
  duracionSegundos: number;
}

/**
 * Puerto de transcodificación de audio (HU-OMNI-07, ADR-0009). Existe como interfaz para que los
 * tests de ruta y de servicio no dependan del binario de ffmpeg: inyectan un doble con
 * `setTranscodificadorForTests`.
 */
export interface ITranscodificadorAudio {
  /**
   * Convierte cualquier grabación (webm/opus, mp4/aac, ogg…) a nota de voz. Lanza `AppError` 422 si
   * el audio es ilegible o está vacío.
   */
  aNotaDeVoz(entrada: Buffer): Promise<IAudioTranscodificado>;
  /** Duración en segundos, o `null` si no se puede medir. **Nunca lanza.** */
  medirDuracion(entrada: Buffer): Promise<number | null>;
}
