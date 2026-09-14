import { describe, it, expect } from 'vitest';
import { moverEnCache } from './useMoveLeadStage.js';
import type { PipelineColumnDTO, PipelineDTO } from '../types.js';
import type { LeadListItemDTO } from '../../leads/types.js';

function lead(id: string, estado: string): LeadListItemDTO {
  return {
    id,
    nombre: `Lead ${id}`,
    telefono: '573001112233',
    correo: null,
    estado,
    responsable: null,
    conversacionId: 'c1',
    semaforo: null,
    resumen: null,
    ultimoMensajeAt: null,
    createdAt: '2026-08-01T10:00:00.000Z',
  };
}

function columna(key: string, leads: LeadListItemDTO[], total = leads.length): PipelineColumnDTO {
  return {
    etapa: {
      id: `e-${key}`,
      key,
      label: key,
      color: '#64748B',
      orden: 0,
      activo: true,
      esDefecto: true,
      esSalida: false,
    },
    total,
    leads,
  };
}

function tablero(columnas: PipelineColumnDTO[]): PipelineDTO {
  return { columnas, limit: 20 };
}

describe('HU-PIPE-01 — el movimiento optimista de la tarjeta', () => {
  it('saca la tarjeta de su columna y la pone en la de destino', () => {
    const previo = tablero([columna('nuevo', [lead('l1', 'nuevo')]), columna('pagado', [])]);

    const siguiente = moverEnCache(previo, 'l1', 'pagado');

    expect(siguiente.columnas[0]?.leads).toHaveLength(0);
    expect(siguiente.columnas[1]?.leads.map((l) => l.id)).toEqual(['l1']);
  });

  it('actualiza el `estado` de la tarjeta movida', () => {
    const previo = tablero([columna('nuevo', [lead('l1', 'nuevo')]), columna('pagado', [])]);

    const siguiente = moverEnCache(previo, 'l1', 'pagado');

    expect(siguiente.columnas[1]?.leads[0]?.estado).toBe('pagado');
  });

  it('ajusta LOS DOS totales: la cabecera no puede contradecir a las tarjetas', () => {
    const previo = tablero([
      columna('nuevo', [lead('l1', 'nuevo')], 7),
      columna('pagado', [], 3),
    ]);

    const siguiente = moverEnCache(previo, 'l1', 'pagado');

    expect(siguiente.columnas[0]?.total).toBe(6);
    expect(siguiente.columnas[1]?.total).toBe(4);
  });

  it('coloca la tarjeta al principio, que es donde el usuario acaba de soltarla', () => {
    const previo = tablero([
      columna('nuevo', [lead('l1', 'nuevo')]),
      columna('pagado', [lead('l2', 'pagado')]),
    ]);

    const siguiente = moverEnCache(previo, 'l1', 'pagado');

    expect(siguiente.columnas[1]?.leads.map((l) => l.id)).toEqual(['l1', 'l2']);
  });

  it('no hace nada si la tarjeta ya está en la etapa de destino', () => {
    const previo = tablero([columna('nuevo', [lead('l1', 'nuevo')], 5)]);

    const siguiente = moverEnCache(previo, 'l1', 'nuevo');

    expect(siguiente).toBe(previo);
  });

  it('no hace nada con una tarjeta que no está en el tablero', () => {
    // Puede pasar: la columna solo trae su primera página, o el lead llegó por socket. El refetch
    // de `onSettled` pondrá la verdad; inventarse un movimiento aquí sería peor.
    const previo = tablero([columna('nuevo', [lead('l1', 'nuevo')])]);

    expect(moverEnCache(previo, 'fantasma', 'pagado')).toBe(previo);
  });

  it('no deja un total negativo si la caché venía descuadrada', () => {
    const previo = tablero([columna('nuevo', [lead('l1', 'nuevo')], 0), columna('pagado', [])]);

    const siguiente = moverEnCache(previo, 'l1', 'pagado');

    expect(siguiente.columnas[0]?.total).toBe(0);
  });

  it('no toca las columnas que no participan en el movimiento', () => {
    const previo = tablero([
      columna('nuevo', [lead('l1', 'nuevo')]),
      columna('en_gestion', [lead('l3', 'en_gestion')], 9),
      columna('pagado', []),
    ]);

    const siguiente = moverEnCache(previo, 'l1', 'pagado');

    expect(siguiente.columnas[1]).toEqual(previo.columnas[1]);
  });
});
