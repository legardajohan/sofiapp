import { env } from '../config/env.js';
import { decryptWith, encryptWith } from './crypto.util.js';

/**
 * Cifrado de campo para los datos personales del contacto (HU-CRM-02): correo, documento, texto de
 * las notas y el valor de los atributos marcados como sensibles.
 *
 * Protege el contenido frente a un volcado de la base, un backup extraviado o un acceso directo a
 * Atlas. **No** sustituye al control de acceso por subrol (eso lo hace `authorize-subrol`), ni
 * protege frente a quien tenga el proceso Node, que sostiene la clave en memoria.
 */

/**
 * Marcador de versión. Es lo que permite distinguir un valor cifrado de uno legado en texto plano
 * —`datosExtraidos.correo` se guardó así hasta HU-CRM-02— y por tanto leer ambos sin script de
 * migración. Un futuro `enc:v2:` podría convivir con este sin ambigüedad.
 */
const MARKER = 'enc:v1:';

function getKey(): Buffer {
  if (!env.DATA_ENC_KEY) {
    throw new Error(
      'DATA_ENC_KEY no está configurada: no se pueden guardar datos sensibles del contacto.',
    );
  }
  return Buffer.from(env.DATA_ENC_KEY, 'hex');
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(MARKER);
}

/** Cifra y antepone el marcador. Lanza si `DATA_ENC_KEY` no está configurada. */
export function encryptField(plaintext: string): string {
  return MARKER + encryptWith(getKey(), plaintext);
}

/**
 * Descifra un valor con marcador. Un valor **sin** marcador se devuelve tal cual: es un dato
 * anterior a HU-CRM-02 y sigue siendo legible, no un error.
 */
export function decryptField(stored: string): string {
  if (!isEncrypted(stored)) return stored;
  return decryptWith(getKey(), stored.slice(MARKER.length));
}

/** Azúcar para los campos opcionales, que son casi todos los de este feature. */
export function encryptOptional(plaintext: string | null | undefined): string | undefined {
  return plaintext === null || plaintext === undefined ? undefined : encryptField(plaintext);
}

export function decryptOptional(stored: string | null | undefined): string | null {
  return stored === null || stored === undefined ? null : decryptField(stored);
}
