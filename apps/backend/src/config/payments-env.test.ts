import { describe, it, expect } from 'vitest';
import { PREFIJOS_WOMPI, validarEntornoPagos, type EntornoPagos } from './payments-env.js';

const completo = (entorno: 'sandbox' | 'production'): EntornoPagos => ({
  PAYMENTS_PROVIDER: 'wompi',
  WOMPI_ENV: entorno,
  WOMPI_PUBLIC_KEY: `${PREFIJOS_WOMPI[entorno].WOMPI_PUBLIC_KEY}x`,
  WOMPI_PRIVATE_KEY: `${PREFIJOS_WOMPI[entorno].WOMPI_PRIVATE_KEY}x`,
  WOMPI_EVENTS_SECRET: `${PREFIJOS_WOMPI[entorno].WOMPI_EVENTS_SECRET}x`,
  WOMPI_INTEGRITY_SECRET: `${PREFIJOS_WOMPI[entorno].WOMPI_INTEGRITY_SECRET}x`,
  WOMPI_REDIRECT_URL: 'https://app.test/pago',
});

const CLAVES = [
  'WOMPI_PUBLIC_KEY',
  'WOMPI_PRIVATE_KEY',
  'WOMPI_EVENTS_SECRET',
  'WOMPI_INTEGRITY_SECRET',
] as const;

describe('validarEntornoPagos', () => {
  it('con stub no exige nada', () => {
    expect(validarEntornoPagos({ PAYMENTS_PROVIDER: 'stub', WOMPI_ENV: 'sandbox' })).toEqual([]);
  });

  it.each(['sandbox', 'production'] as const)('combinación correcta de %s → sin errores', (e) => {
    expect(validarEntornoPagos(completo(e))).toEqual([]);
  });

  it.each([...CLAVES, 'WOMPI_REDIRECT_URL'] as const)('falta %s → un error con su path', (clave) => {
    const valores: EntornoPagos = { ...completo('sandbox'), [clave]: undefined };
    const r = validarEntornoPagos(valores);
    expect(r).toHaveLength(1);
    expect(r[0]?.path).toBe(clave);
  });

  it.each(CLAVES)('%s con prefijo de otro entorno → error (ambos sentidos)', (clave) => {
    const sandboxConProd: EntornoPagos = {
      ...completo('sandbox'),
      [clave]: `${PREFIJOS_WOMPI.production[clave]}x`,
    };
    const prodConTest: EntornoPagos = {
      ...completo('production'),
      [clave]: `${PREFIJOS_WOMPI.sandbox[clave]}x`,
    };
    expect(validarEntornoPagos(sandboxConProd).map((i) => i.path)).toEqual([clave]);
    expect(validarEntornoPagos(prodConTest).map((i) => i.path)).toEqual([clave]);
  });

  it('el mensaje no contiene el valor de la variable', () => {
    const secreto = 'prv_prod_ESTE_VALOR_NO_DEBE_SALIR';
    const r = validarEntornoPagos({ ...completo('sandbox'), WOMPI_PRIVATE_KEY: secreto });
    expect(r).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain('ESTE_VALOR_NO_DEBE_SALIR');
  });
});
