import { apiUrl } from '@/api/apiClient';
import type { TipoMensaje } from '../types.js';

/**
 * Espejo de `LIMITES_MEDIA` del backend. Se duplica a propósito: validar en el cliente evita que
 * alguien suba 20 MB por una conexión móvil para recibir un 413 al final. El servidor revalida
 * igual — esto es cortesía, no seguridad.
 */
export const MIMES_ACEPTADOS: Readonly<Record<'imagen' | 'video' | 'documento', readonly string[]>> =
  {
    imagen: ['image/jpeg', 'image/png'],
    video: ['video/mp4', 'video/3gpp'],
    documento: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
    ],
  };

export const LIMITES_BYTES: Readonly<Record<'imagen' | 'video' | 'documento', number>> = {
  imagen: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  documento: 16 * 1024 * 1024,
};

/**
 * Valores de `accept` por entrada del menú de adjuntar, derivados de los mimes aceptados.
 *
 * Separados a propósito: es lo que hace que «Fotos y videos» y «Documento» se comporten distinto de
 * verdad —el diálogo del sistema filtra por cada uno— en vez de ser dos etiquetas que abren lo
 * mismo. `ACCEPT_ARCHIVOS` se queda para cuando no hay que distinguir.
 */
export const ACCEPT_IMAGENES_VIDEOS = [
  ...MIMES_ACEPTADOS.imagen,
  ...MIMES_ACEPTADOS.video,
].join(',');

export const ACCEPT_DOCUMENTOS = MIMES_ACEPTADOS.documento.join(',');

export const ACCEPT_ARCHIVOS = Object.values(MIMES_ACEPTADOS).flat().join(',');

export type TipoArchivo = keyof typeof MIMES_ACEPTADOS;

export function clasificarArchivo(file: File): TipoArchivo | null {
  const mime = file.type.toLowerCase().split(';')[0]?.trim() ?? '';
  return (
    (Object.keys(MIMES_ACEPTADOS) as TipoArchivo[]).find((t) =>
      MIMES_ACEPTADOS[t].includes(mime),
    ) ?? null
  );
}

export type ResultadoValidacion = { ok: true; tipo: TipoArchivo } | { ok: false; motivo: string };

/**
 * Valida un archivo antes de subirlo.
 *
 * El motivo sale ya redactado para el toast: dice qué pasó y qué hacer, sin disculparse y sin
 * hablar de mimes ni de bytes, que no son vocabulario del asesor.
 */
export function validarArchivo(file: File): ResultadoValidacion {
  const tipo = clasificarArchivo(file);
  if (!tipo) {
    return {
      ok: false,
      motivo: 'WhatsApp no admite ese tipo de archivo. Envía una imagen, un video o un documento.',
    };
  }

  if (file.size > LIMITES_BYTES[tipo]) {
    return {
      ok: false,
      motivo: `El archivo pesa ${formatearTamano(file.size)} y el máximo es ${formatearTamano(
        LIMITES_BYTES[tipo],
      )}.`,
    };
  }

  return { ok: true, tipo };
}

const UNIDADES = ['B', 'KB', 'MB', 'GB'] as const;

export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < UNIDADES.length - 1) {
    valor /= 1024;
    i += 1;
  }
  // Un decimal solo por debajo de 10: "1.4 MB" informa, "13.7 MB" es ruido.
  return `${valor < 10 ? valor.toFixed(1) : Math.round(valor)} ${UNIDADES[i]}`;
}

/** Etiqueta corta del formato, para la tarjeta de documento. Lo que el asesor reconoce de un vistazo. */
export function etiquetaFormato(mimeType: string, nombreArchivo: string | null): string {
  const porExtension = nombreArchivo?.split('.').pop()?.toUpperCase();
  if (porExtension && porExtension.length <= 4 && porExtension !== nombreArchivo?.toUpperCase()) {
    return porExtension;
  }

  const mapa: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/msword': 'DOC',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.ms-excel': 'XLS',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'text/plain': 'TXT',
    'text/csv': 'CSV',
  };
  return mapa[mimeType] ?? 'Archivo';
}

/** Dominio legible de una URL, sin `www.`. Devuelve `null` si la URL no se puede interpretar. */
export function dominioDe(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Tipos de mensaje que se renderizan con un archivo en el hilo. */
export function llevaArchivo(tipo: TipoMensaje): boolean {
  return tipo === 'imagen' || tipo === 'video' || tipo === 'audio' || tipo === 'documento' || tipo === 'sticker';
}

/**
 * URL lista para el `src` de un `<img>`, un `<video>` o el `href` de una descarga.
 *
 * El backend devuelve la ruta **relativa al API** (`/media/<id>?t=…`), siguiendo la convención del
 * proyecto de no repetir el prefijo `/api`. Ponerlo es responsabilidad del cliente, igual que hace
 * `apiClient` con su `baseURL` — solo que un `<img>` no pasa por axios y hay que hacerlo a mano.
 */
export function urlDeArchivo(urlArchivo: string, descargar = false): string {
  return apiUrl(descargar ? `${urlArchivo}&descargar=1` : urlArchivo);
}
