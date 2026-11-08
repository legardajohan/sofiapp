import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../users/hooks/useTenantUsers.js', () => ({
  useTenantUsers: () => ({
    isLoading: false,
    data: [
      { id: 'u1', nombre: 'Ana Pérez', email: 'ana@x.co', rol: 'admin', activo: true, tenantId: 't' },
      { id: 'u2', nombre: 'Luis Gómez', email: 'luis@x.co', rol: 'admin', activo: true, tenantId: 't' },
      { id: 'u3', nombre: 'Inactivo Uno', email: 'ina@x.co', rol: 'admin', activo: false, tenantId: 't' },
    ],
  }),
}));

import { NodeInspector } from './NodeInspector.js';
import type { INodo } from '../types.js';

function nodoHandoff(notificarAsesorId?: string): INodo {
  return {
    id: 'h1',
    tipo: 'handoff',
    posicion: { x: 0, y: 0 },
    config: { tipo: 'handoff', ...(notificarAsesorId ? { notificarAsesorId } : {}) },
  };
}

function montar(nodo: INodo, onChange = vi.fn()) {
  render(
    <NodeInspector
      nodo={nodo}
      esEntrada={false}
      onNombreChange={vi.fn()}
      opcionesDestino={[]}
      onChange={onChange}
      onDelete={vi.fn()}
      onMarcarEntrada={vi.fn()}
    />,
  );
  return onChange;
}

describe('NodeInspector — handoff: asesor al que transferir', () => {
  it('por defecto es «Automático» y ofrece los asesores ACTIVOS por nombre (no por ID)', async () => {
    montar(nodoHandoff());
    const selector = screen.getByRole('combobox', { name: 'Asesor al que transferir' });
    expect(selector).toHaveTextContent('Automático');

    await userEvent.click(selector);
    expect(await screen.findByRole('option', { name: 'Ana Pérez' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Luis Gómez' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Inactivo Uno' })).not.toBeInTheDocument();
  });

  it('elegir un asesor guarda su id en el nodo', async () => {
    const onChange = montar(nodoHandoff());
    await userEvent.click(screen.getByRole('combobox', { name: 'Asesor al que transferir' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Luis Gómez' }));
    expect(onChange).toHaveBeenCalledWith({ tipo: 'handoff', notificarAsesorId: 'u2' });
  });

  it('volver a «Automático» quita el campo (el reparto general decide)', async () => {
    const onChange = montar(nodoHandoff('u1'));
    expect(screen.getByRole('combobox', { name: 'Asesor al que transferir' })).toHaveTextContent('Ana Pérez');
    await userEvent.click(screen.getByRole('combobox', { name: 'Asesor al que transferir' }));
    await userEvent.click(await screen.findByRole('option', { name: /Automático/ }));
    const config = onChange.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(config).toEqual({ tipo: 'handoff' });
    expect(config).not.toHaveProperty('notificarAsesorId');
  });

  it('avisa si el asesor elegido ya no está activo, sin borrar la elección', () => {
    montar(nodoHandoff('u3'));
    expect(screen.getByText(/ya no está activo/)).toBeInTheDocument();
  });
});
