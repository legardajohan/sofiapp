import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const CLAVE_A = 'a'.repeat(64);
const CLAVE_B = 'b'.repeat(64);

// La clave se lee de `env` en cada llamada, así que se puede reescribir entre tests.
vi.mock('../../src/config/env.js', () => ({
  env: { DATA_ENC_KEY: 'a'.repeat(64), TENANT_TOKEN_ENC_KEY: 'c'.repeat(64) },
}));

const { env } = await import('../../src/config/env.js');
const { encryptField, decryptField, isEncrypted, encryptOptional, decryptOptional } = await import(
  '../../src/utils/field-crypto.util.js'
);

describe('field-crypto.util — cifrado de campo (HU-CRM-02)', () => {
  beforeEach(() => {
    (env as { DATA_ENC_KEY?: string }).DATA_ENC_KEY = CLAVE_A;
  });

  afterEach(() => {
    (env as { DATA_ENC_KEY?: string }).DATA_ENC_KEY = CLAVE_A;
  });

  it('ida y vuelta: descifrar lo cifrado devuelve el original', () => {
    const original = 'diego@empresa.com';
    expect(decryptField(encryptField(original))).toBe(original);
  });

  it('el valor cifrado lleva el marcador de versión y no contiene el texto claro', () => {
    const cifrado = encryptField('1085271234');
    expect(isEncrypted(cifrado)).toBe(true);
    expect(cifrado.startsWith('enc:v1:')).toBe(true);
    expect(cifrado).not.toContain('1085271234');
  });

  it('cifrar dos veces el mismo texto da resultados distintos (IV aleatorio)', () => {
    const uno = encryptField('mismo texto');
    const dos = encryptField('mismo texto');
    expect(uno).not.toBe(dos);
    expect(decryptField(uno)).toBe(decryptField(dos));
  });

  it('un valor SIN marcador se devuelve tal cual (dato legado anterior a HU-CRM-02)', () => {
    // Es el caso de `datosExtraidos.correo` guardado en plano por HU-OMNI-03: debe seguir leyéndose
    // sin script de migración.
    expect(decryptField('legado@empresa.com')).toBe('legado@empresa.com');
    expect(isEncrypted('legado@empresa.com')).toBe(false);
  });

  it('descifrar con otra clave falla (el authTag de GCM no valida)', () => {
    const cifrado = encryptField('secreto');
    (env as { DATA_ENC_KEY?: string }).DATA_ENC_KEY = CLAVE_B;
    expect(() => decryptField(cifrado)).toThrow();
  });

  it('sin DATA_ENC_KEY configurada, cifrar lanza con un mensaje accionable', () => {
    (env as { DATA_ENC_KEY?: string }).DATA_ENC_KEY = undefined;
    expect(() => encryptField('algo')).toThrow(/DATA_ENC_KEY/);
  });

  it('los helpers opcionales tratan null/undefined sin tocar la clave', () => {
    (env as { DATA_ENC_KEY?: string }).DATA_ENC_KEY = undefined;
    expect(encryptOptional(null)).toBeUndefined();
    expect(encryptOptional(undefined)).toBeUndefined();
    expect(decryptOptional(null)).toBeNull();
    expect(decryptOptional(undefined)).toBeNull();
  });
});
