import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger.js';

afterEach(() => vi.restoreAllMocks());

function capturar(nivel: 'log' | 'warn' | 'error') {
  return vi.spyOn(console, nivel).mockImplementation(() => undefined);
}

describe('logger', () => {
  it('redacta claves y valores y conserva el formato', () => {
    const espia = capturar('log');
    logger.info('llamada con prv_test_x', {
      Authorization: 'Bearer abc',
      customer_email: 'a@b.co',
      reference: 'SOFI-1',
    });
    const linea = String(espia.mock.calls[0]?.[0]);
    const json = JSON.parse(linea) as Record<string, unknown>;
    expect(json).toMatchObject({
      level: 'info',
      message: 'llamada con [REDACTADO]',
      Authorization: '[REDACTADO]',
      customer_email: '[REDACTADO]',
      reference: 'SOFI-1',
    });
    expect(typeof json['ts']).toBe('string');
    expect(linea).not.toContain('prv_test_x');
    expect(linea).not.toContain('a@b.co');
  });

  it.each([
    ['info', 'log'],
    ['warn', 'warn'],
    ['error', 'error'],
  ] as const)('%s escribe por console.%s con su level', (nivel, canal) => {
    const espia = capturar(canal);
    logger[nivel]('hola');
    expect(JSON.parse(String(espia.mock.calls[0]?.[0]))).toMatchObject({ level: nivel, message: 'hola' });
  });

  it('con un meta circular no lanza y emite la línea', () => {
    const espia = capturar('warn');
    const meta: Record<string, unknown> = { a: 1 };
    meta['self'] = meta;
    expect(() => logger.warn('circular', meta)).not.toThrow();
    expect(JSON.parse(String(espia.mock.calls[0]?.[0]))).toMatchObject({ message: 'circular', a: 1, self: '[CIRCULAR]' });
  });

  it('si JSON.stringify falla emite solo level, message y ts', () => {
    const espia = capturar('error');
    // BigInt no es serializable: fuerza el camino de fallo.
    logger.error('con bigint', { grande: BigInt(1) });
    const json = JSON.parse(String(espia.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual(['level', 'message', 'ts']);
  });
});
