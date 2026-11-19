import { describe, it, expect } from 'vitest';
import { verificarEventoWompi } from './wompi.event.js';
import { calcularChecksumEvento } from './wompi.signature.js';

const SECRETO = 'test_events_secretodeprueba';
const TS = 1668624786;

interface Opciones {
  status?: string;
  monto?: number;
  properties?: string[];
}

function construir(o: Opciones = {}): { body: Record<string, unknown>; checksum: string } {
  const status = o.status ?? 'APPROVED';
  const monto = o.monto ?? 11900000;
  const checksum = calcularChecksumEvento(['1234-1668624786-37890', status, String(monto)], TS, SECRETO);
  const body = {
    event: 'transaction.updated',
    data: {
      transaction: {
        id: '1234-1668624786-37890',
        status,
        amount_in_cents: monto,
        currency: 'COP',
        reference: 'SOFI-AAAAAAAAAAAAAAAAAAAAAAAA',
      },
    },
    environment: 'test',
    timestamp: TS,
    signature: {
      properties: o.properties ?? [
        'transaction.id',
        'transaction.status',
        'transaction.amount_in_cents',
      ],
      checksum,
    },
  };
  return { body, checksum };
}

describe('verificarEventoWompi', () => {
  it('evento válido → todos los campos y estado mapeado', () => {
    const { body } = construir();
    expect(verificarEventoWompi(body, undefined, SECRETO)).toEqual({
      valido: true,
      evento: {
        evento: 'transaction.updated',
        transaccionId: '1234-1668624786-37890',
        estado: 'APROBADO',
        estadoProveedor: 'APPROVED',
        reference: 'SOFI-AAAAAAAAAAAAAAAAAAAAAAAA',
        amountInCents: 11900000,
        currency: 'COP',
        entorno: 'test',
        timestamp: TS,
      },
    });
  });

  it('checksum alterado → inválido sin evento', () => {
    const { body } = construir();
    (body['signature'] as { checksum: string }).checksum = 'a'.repeat(64);
    const r = verificarEventoWompi(body, undefined, SECRETO);
    expect(r).toEqual({ valido: false });
    expect('evento' in r).toBe(false);
  });

  it('monto alterado en data → inválido sin evento', () => {
    const { body } = construir();
    ((body['data'] as { transaction: { amount_in_cents: number } }).transaction).amount_in_cents = 1;
    const r = verificarEventoWompi(body, undefined, SECRETO);
    expect(r).toEqual({ valido: false });
    expect('evento' in r).toBe(false);
  });

  it('timestamp alterado → inválido sin evento', () => {
    const { body } = construir();
    body['timestamp'] = TS + 1;
    const r = verificarEventoWompi(body, undefined, SECRETO);
    expect(r).toEqual({ valido: false });
    expect('evento' in r).toBe(false);
  });

  it('secreto distinto → inválido sin evento', () => {
    const { body } = construir();
    const r = verificarEventoWompi(body, undefined, 'test_events_otro');
    expect(r).toEqual({ valido: false });
    expect('evento' in r).toBe(false);
  });

  it('falta una propiedad de signature.properties en data → inválido', () => {
    const { body } = construir({ properties: ['transaction.id', 'transaction.no_existe'] });
    expect(verificarEventoWompi(body, undefined, SECRETO)).toEqual({ valido: false });
  });

  it.each([
    ['null', null],
    ['string', 'hola'],
    ['sin signature', { event: 'x', data: {}, environment: 'test', timestamp: TS }],
    ['sin data', { event: 'x', environment: 'test', timestamp: TS, signature: { properties: ['a'], checksum: 'b' } }],
  ])('cuerpo %s → inválido sin lanzar', (_n, body) => {
    expect(() => verificarEventoWompi(body, undefined, SECRETO)).not.toThrow();
    expect(verificarEventoWompi(body, undefined, SECRETO)).toEqual({ valido: false });
  });

  it('environment raro → inválido', () => {
    const { body } = construir();
    body['environment'] = 'staging';
    expect(verificarEventoWompi(body, undefined, SECRETO)).toEqual({ valido: false });
  });

  it('cabecera distinta del checksum del cuerpo → inválido', () => {
    const { body } = construir();
    expect(verificarEventoWompi(body, 'b'.repeat(64), SECRETO)).toEqual({ valido: false });
  });

  it('cabecera igual en otras mayúsculas → válido', () => {
    const { body, checksum } = construir();
    expect(verificarEventoWompi(body, checksum.toUpperCase(), SECRETO).valido).toBe(true);
  });

  it('estado desconocido con checksum válido → válido con estado null', () => {
    const { body } = construir({ status: 'REFUNDED' });
    const r = verificarEventoWompi(body, undefined, SECRETO);
    expect(r.valido).toBe(true);
    if (r.valido) expect(r.evento.estado).toBeNull();
  });
});
