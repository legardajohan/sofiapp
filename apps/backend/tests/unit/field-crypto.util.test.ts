import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const CLAVE_A = 'a'.repeat(64);
const CLAVE_B = 'b'.repeat(64);

// La clave se lee de `env` en cada llamada, así que se puede reescribir entre tests.
vi.mock('../../src/config/env.js', () => ({
  env: { DATA_ENC_KEY: 'a'.repeat(64), TENANT_TOKEN_ENC_KEY: 'c'.repeat(64) },
}));

const { env } = await import('../../src/config/env.js');
const { encryptWith } = await import('../../src/utils/crypto.util.js');
const { toStoredValue, fromStoredValue, isEncrypted, toStoredOptional, fromStoredOptional } =
  await import('../../src/utils/field-crypto.util.js');

/** Valor tal y como quedó en Mongo mientras el cifrado en reposo estuvo activo. */
function heredadoCifrado(texto: string, claveHex: string): string {
  return 'enc:v1:' + encryptWith(Buffer.from(claveHex, 'hex'), texto);
}

describe('field-crypto.util — persistencia de datos sensibles (HU-CRM-02)', () => {
  beforeEach(() => {
    (env as { DATA_ENC_KEY?: string }).DATA_ENC_KEY = CLAVE_A;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    (env as { DATA_ENC_KEY?: string }).DATA_ENC_KEY = CLAVE_A;
    vi.restoreAllMocks();
  });

  // ─── Escritura: en claro ──────────────────────────────────────────────────────

  it('el valor se persiste EN CLARO, sin marcador (el cifrado está desactivado)', () => {
    const guardado = toStoredValue('diego@empresa.com');
    expect(guardado).toBe('diego@empresa.com');
    expect(isEncrypted(guardado)).toBe(false);
  });

  it('ida y vuelta: lo leído es idéntico a lo escrito', () => {
    const original = '1085271234';
    expect(fromStoredValue(toStoredValue(original))).toBe(original);
  });

  it('escribir y leer NO lanzan sin DATA_ENC_KEY configurada', () => {
    // Regresión: con la variable ausente, guardar un correo, un documento o una nota moría con un
    // 500 y el asesor solo veía "error interno". Ya no depende de ninguna clave.
    (env as { DATA_ENC_KEY?: string }).DATA_ENC_KEY = undefined;

    expect(toStoredValue('algo')).toBe('algo');
    expect(fromStoredValue('algo')).toBe('algo');
  });

  // ─── Lectura: compatibilidad con lo que sí quedó cifrado ──────────────────────

  it('un valor heredado con marcador se descifra al leerlo', () => {
    expect(fromStoredValue(heredadoCifrado('diego@empresa.com', CLAVE_A))).toBe(
      'diego@empresa.com',
    );
  });

  it('un valor sin marcador se devuelve tal cual', () => {
    expect(fromStoredValue('legado@empresa.com')).toBe('legado@empresa.com');
    expect(isEncrypted('legado@empresa.com')).toBe(false);
  });

  it('un heredado ilegible (clave rotada) NO lanza: degrada y avisa por el log', () => {
    // Reventar aquí tumbaría la ficha completa del contacto por un único campo ilegible.
    const almacenado = heredadoCifrado('secreto', CLAVE_A);
    (env as { DATA_ENC_KEY?: string }).DATA_ENC_KEY = CLAVE_B;

    expect(fromStoredValue(almacenado)).toBe(almacenado);
    expect(console.warn).toHaveBeenCalled();
  });

  it('un heredado sin clave para leerlo NO lanza: degrada y avisa por el log', () => {
    const almacenado = heredadoCifrado('secreto', CLAVE_A);
    (env as { DATA_ENC_KEY?: string }).DATA_ENC_KEY = undefined;

    expect(fromStoredValue(almacenado)).toBe(almacenado);
    expect(console.warn).toHaveBeenCalled();
  });

  // ─── Opcionales ───────────────────────────────────────────────────────────────

  it('los helpers opcionales tratan null/undefined sin tocar el valor', () => {
    (env as { DATA_ENC_KEY?: string }).DATA_ENC_KEY = undefined;
    expect(toStoredOptional(null)).toBeUndefined();
    expect(toStoredOptional(undefined)).toBeUndefined();
    expect(toStoredOptional('valor')).toBe('valor');
    expect(fromStoredOptional(null)).toBeNull();
    expect(fromStoredOptional(undefined)).toBeNull();
    expect(fromStoredOptional('valor')).toBe('valor');
  });
});
