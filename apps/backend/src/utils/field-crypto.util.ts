import { env } from '../config/env.js';
import { decryptWith } from './crypto.util.js';
import { logger } from './logger.js';

/**
 * Persistencia de los datos personales del contacto (HU-CRM-02): correo, documento, texto de las
 * notas y el valor de los atributos marcados como sensibles.
 *
 * **El cifrado en reposo está DESACTIVADO: estos campos se guardan en claro.** Dependía de
 * `DATA_ENC_KEY`, una variable opcional, y sin ella cualquier intento de guardar un correo, un
 * documento o una nota moría con un 500 — se prefirió que el CRM funcione siempre a que dependa de
 * una clave de despliegue. Las columnas conservan el sufijo `Enc` (`correoEnc`, `documentoEnc`,
 * `textoEnc`) para no arrastrar una migración de datos ni de índices.
 *
 * Lo que sigue protegiendo el dato es el **control de acceso por subrol** (`authorize-subrol` + el
 * enmascarado de `mask.util`), que nunca dependió del cifrado. Lo que se pierde es la protección
 * frente a un volcado de la base o un backup extraviado; queda anotado en `docs/adr/0006`.
 *
 * Reactivarlo es un cambio de **un solo archivo**: `toStoredValue` vuelve a cifrar. El camino de
 * lectura ya entiende ambos formatos, así que no haría falta migrar lo escrito en claro.
 */

/**
 * Marcador de versión de los valores que SÍ se escribieron cifrados, mientras el cifrado estuvo
 * activo. Ya no se produce, pero sigue siendo lo que distingue un valor cifrado de uno en claro al
 * leer, y por eso ambos conviven sin script de migración.
 */
const MARKER = 'enc:v1:';

export function isEncrypted(value: string): boolean {
  return value.startsWith(MARKER);
}

/**
 * Valor tal y como se persiste. Hoy es la identidad; existe para que cada punto de escritura de un
 * dato sensible siga siendo explícito y para que reactivar el cifrado no obligue a tocar services.
 */
export function toStoredValue(plaintext: string): string {
  return plaintext;
}

/**
 * Valor tal y como se lee. Lo normal es que venga en claro; los que llevan el marcador se
 * escribieron mientras el cifrado estaba activo y se descifran aquí.
 *
 * **Nunca lanza.** Un fallo de descifrado (clave ausente, rotada o dato corrupto) degrada a
 * devolver lo almacenado y dejar rastro en el log: reventar aquí tumbaría la ficha completa del
 * contacto —o toda la lista de notas— por un único campo ilegible.
 */
export function fromStoredValue(stored: string): string {
  if (!isEncrypted(stored)) return stored;

  if (!env.DATA_ENC_KEY) {
    logger.warn(
      'Valor heredado cifrado y sin DATA_ENC_KEY para leerlo: se devuelve sin descifrar.',
    );
    return stored;
  }

  try {
    return decryptWith(Buffer.from(env.DATA_ENC_KEY, 'hex'), stored.slice(MARKER.length));
  } catch (err) {
    logger.warn('No se pudo descifrar un valor heredado (¿DATA_ENC_KEY rotada?).', {
      error: err instanceof Error ? err.message : String(err),
    });
    return stored;
  }
}

/** Azúcar para los campos opcionales, que son casi todos los de este feature. */
export function toStoredOptional(plaintext: string | null | undefined): string | undefined {
  return plaintext === null || plaintext === undefined ? undefined : toStoredValue(plaintext);
}

export function fromStoredOptional(stored: string | null | undefined): string | null {
  return stored === null || stored === undefined ? null : fromStoredValue(stored);
}
