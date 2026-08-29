import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Primitivas AES-256-GCM parametrizadas por clave. Existen aparte de `encrypt`/`decrypt` porque el
 * proyecto cifra con **dos claves distintas y deliberadamente independientes**: los tokens de Meta
 * con `TENANT_TOKEN_ENC_KEY` y los datos personales del contacto con `DATA_ENC_KEY` (HU-CRM-02).
 * Rotar una no debe obligar a rotar la otra.
 */
export function encryptWith(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptWith(key: Buffer, ciphertext: string): string {
  const buf = Buffer.from(ciphertext, 'base64');

  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function getKey(): Buffer {
  if (!env.TENANT_TOKEN_ENC_KEY) {
    throw new Error('TENANT_TOKEN_ENC_KEY no está configurada.');
  }
  return Buffer.from(env.TENANT_TOKEN_ENC_KEY, 'hex');
}

export function encrypt(plaintext: string): string {
  return encryptWith(getKey(), plaintext);
}

export function decrypt(ciphertext: string): string {
  return decryptWith(getKey(), ciphertext);
}

export { timingSafeEqual };
