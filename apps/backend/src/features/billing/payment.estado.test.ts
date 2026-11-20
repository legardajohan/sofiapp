import { describe, it, expect } from 'vitest';
import { ESTADOS_PAGO } from '@sofiapp/shared';
import { esTerminal, esTransicionValida } from './payment.estado.js';

describe('máquina de estados del pago', () => {
  for (const desde of ESTADOS_PAGO) {
    for (const hacia of ESTADOS_PAGO) {
      const esperado = desde === 'PENDIENTE' && hacia !== 'PENDIENTE';
      it(`${desde} → ${hacia}: ${esperado ? 'válida' : 'inválida'}`, () => {
        expect(esTransicionValida(desde, hacia)).toBe(esperado);
      });
    }
  }

  it('solo PENDIENTE no es terminal', () => {
    expect(ESTADOS_PAGO.filter((e) => !esTerminal(e))).toEqual(['PENDIENTE']);
  });
});
