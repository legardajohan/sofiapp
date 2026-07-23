import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PlanTable } from './PlanTable.js';
import type { IPlan } from '../types/index.js';

const noop = (): void => {};

function makePlan(overrides: Partial<IPlan> = {}): IPlan {
  return {
    _id: overrides._id ?? 'id-1',
    nombre: overrides.nombre ?? 'Plan',
    limites: {
      usuarios: 5,
      administradores: 10,
      mensajesMes: 1000,
      leads: 500,
      campanasMes: 3,
      ...overrides.limites,
    },
    precio: overrides.precio ?? 100000,
    costoEstimado: overrides.costoEstimado,
    activo: overrides.activo ?? true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Devuelve las celdas (<td>) de la fila que contiene el nombre dado. */
function celdasDeFila(nombre: string): HTMLElement[] {
  const fila = screen.getByText(nombre).closest('tr');
  if (!fila) throw new Error(`fila no encontrada: ${nombre}`);
  return within(fila).getAllByRole('cell');
}

describe('PlanTable — formateo seguro (planes antiguos y v2)', () => {
  it('renderiza un plan completo con números formateados', () => {
    render(<PlanTable plans={[makePlan({ nombre: 'Completo', precio: 200000 })]} onEdit={noop} onDelete={noop} />);
    const celdas = celdasDeFila('Completo');
    expect(celdas[1]).toHaveTextContent('5'); // usuarios
    expect(celdas[2]).toHaveTextContent('10'); // administradores
  });

  it('plan antiguo SIN administradores muestra "—" y no lanza toLocaleString sobre undefined', () => {
    const legacy = makePlan({ nombre: 'Legacy' });
    // Simula un doc creado antes de la v2 (sin administradores).
    delete (legacy.limites as { administradores?: number }).administradores;

    expect(() =>
      render(<PlanTable plans={[legacy]} onEdit={noop} onDelete={noop} />),
    ).not.toThrow();

    const celdas = celdasDeFila('Legacy');
    expect(celdas[2]).toHaveTextContent('—'); // administradores ausente
  });

  it('plan sin costo operativo / precio undefined muestra "Sin calcular" (no $0)', () => {
    const sinPrecio = makePlan({ nombre: 'SinPrecio' });
    delete (sinPrecio as { precio?: number }).precio;

    render(<PlanTable plans={[sinPrecio]} onEdit={noop} onDelete={noop} />);
    const celdas = celdasDeFila('SinPrecio');
    // Precio USD (6), Precio COP (7) y Margen (8).
    expect(celdas[6]).toHaveTextContent('Sin calcular');
    expect(celdas[7]).toHaveTextContent('Sin calcular');
    expect(celdas[8]).toHaveTextContent('Sin calcular');
  });

  it('deriva Precio COP a partir del precio USD y la TRM (copRate)', () => {
    render(
      <PlanTable
        plans={[makePlan({ nombre: 'ConTRM', precio: 50 })]}
        copRate={4000}
        onEdit={noop}
        onDelete={noop}
      />,
    );
    const celdas = celdasDeFila('ConTRM');
    expect(celdas[6]).toHaveTextContent('50'); // Precio USD
    expect(celdas[7]).toHaveTextContent('200.000'); // 50 × 4000 en COP (es-CO)
  });

  it('Precio COP muestra "Sin calcular" cuando no hay TRM disponible', () => {
    render(<PlanTable plans={[makePlan({ nombre: 'SinTRM', precio: 50 })]} onEdit={noop} onDelete={noop} />);
    const celdas = celdasDeFila('SinTRM');
    expect(celdas[7]).toHaveTextContent('Sin calcular');
  });

  it('plan con campos null se renderiza con "—" / "Sin calcular" sin romperse', () => {
    const conNulls = makePlan({ nombre: 'Nulls' });
    (conNulls.limites as unknown as Record<string, unknown>)['leads'] = null;
    (conNulls as unknown as Record<string, unknown>)['precio'] = null;

    expect(() => render(<PlanTable plans={[conNulls]} onEdit={noop} onDelete={noop} />)).not.toThrow();
    const celdas = celdasDeFila('Nulls');
    expect(celdas[4]).toHaveTextContent('—'); // leads null
    expect(celdas[6]).toHaveTextContent('Sin calcular'); // precio null
  });

  it('un valor CERO válido se muestra como número/moneda, NO como "—"/"Sin calcular"', () => {
    render(
      <PlanTable
        plans={[makePlan({ nombre: 'Gratis', precio: 0, limites: { campanasMes: 0 } as IPlan['limites'] })]}
        onEdit={noop}
        onDelete={noop}
      />,
    );
    const celdas = celdasDeFila('Gratis');
    expect(celdas[5]).toHaveTextContent('0'); // campañas/mes = 0 válido
    expect(celdas[6]).not.toHaveTextContent('Sin calcular'); // precio 0 es válido
    expect(celdas[6]).toHaveTextContent('0');
  });
});

describe('PlanTable — bloqueo por plan en uso (HU-SAAS-02)', () => {
  const enUso = makePlan({
    nombre: 'EnUso',
    uso: {
      enUso: true,
      tenantCount: 2,
      tenants: [
        { id: 't1', name: 'Empresa ABC' },
        { id: 't2', name: 'Comercial XYZ' },
      ],
    },
  });

  it('deshabilita Editar y Eliminar cuando el plan está en uso', () => {
    render(<PlanTable plans={[enUso]} onEdit={noop} onDelete={noop} />);
    expect(screen.getByRole('button', { name: 'Editar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
  });

  it('muestra el motivo con los nombres de las empresas en el tooltip', () => {
    render(<PlanTable plans={[enUso]} onEdit={noop} onDelete={noop} />);
    const wrapper = screen.getByRole('button', { name: 'Editar' }).parentElement;
    const title = wrapper?.getAttribute('title') ?? '';
    expect(title).toContain('Empresa ABC');
    expect(title).toContain('Comercial XYZ');
    expect(title).toContain('2 empresa');
  });

  it('mantiene habilitadas las acciones cuando el plan NO está en uso', () => {
    render(<PlanTable plans={[makePlan({ nombre: 'Libre' })]} onEdit={noop} onDelete={noop} />);
    expect(screen.getByRole('button', { name: 'Editar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeEnabled();
  });
});
