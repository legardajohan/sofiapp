/**
 * Utilidades puras de audio (HU-OMNI-07): formato de duración, forma de onda decorativa y elección
 * del formato de grabación.
 */

/** `m:ss`, como lo muestra WhatsApp. Valores no finitos o negativos se muestran como `0:00`. */
export function formatearDuracion(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return '0:00';
  const total = Math.floor(segundos);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Alturas (0.2–1) de una onda **decorativa** y estable para un audio.
 *
 * No es la señal real: calcularla exigiría descargar y decodificar el audio entero antes de que el
 * asesor pulse play (o procesarlo en el servidor, fuera de alcance). Pero una barra plana no se lee
 * como nota de voz. Se deriva de una semilla (el id del mensaje) para que la misma nota tenga
 * siempre la misma forma y dos notas seguidas no se vean idénticas.
 */
export function ondaDecorativa(semilla: string, barras: number): number[] {
  // FNV-1a de 32 bits → semilla de un mulberry32. Ninguno es criptográfico, ni falta que hace.
  let h = 0x811c9dc5;
  for (let i = 0; i < semilla.length; i++) {
    h ^= semilla.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }

  let estado = h >>> 0;
  const aleatorio = (): number => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const alturas: number[] = [];
  let anterior = 0.5;
  for (let i = 0; i < barras; i++) {
    // Suavizado con la barra anterior: el habla sube y baja por sílabas, no salta al azar.
    const valor = anterior * 0.45 + aleatorio() * 0.55;
    anterior = valor;
    alturas.push(0.2 + valor * 0.8);
  }
  return alturas;
}

/**
 * Formatos de grabación por orden de preferencia. `ogg/opus` primero porque es lo que WhatsApp
 * quiere (Firefox lo graba directo); luego `webm/opus` (Chrome, Edge) y `mp4` (Safari). El servidor
 * transcodifica cualquiera de ellos a `ogg/opus mono`, así que el orden solo ahorra trabajo.
 */
const FORMATOS_GRABACION = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

export function elegirFormatoGrabacion(
  soportado: (mime: string) => boolean = (m) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m),
): string | null {
  return FORMATOS_GRABACION.find((m) => soportado(m)) ?? null;
}
