import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../users/hooks/useTenantUsers.js', () => ({
  useTenantUsers: () => ({
    isLoading: false,
    data: [
      { id: 'u1', nombre: 'Ana Pérez', email: 'ana@x.co', rol: 'admin', rolEmpresa: 'asesor', esPrincipal: false, coordinadorId: null, activo: true, tenantId: 't' },
      { id: 'u2', nombre: 'Luis Gómez', email: 'luis@x.co', rol: 'admin', rolEmpresa: 'asesor', esPrincipal: false, coordinadorId: null, activo: true, tenantId: 't' },
      { id: 'u3', nombre: 'Inactivo Uno', email: 'ina@x.co', rol: 'admin', rolEmpresa: 'asesor', esPrincipal: false, coordinadorId: null, activo: false, tenantId: 't' },
    ],
  }),
}));

import { NodeInspector } from './NodeInspector.js';
import type { INodo } from '../types.js';

const A_ASESORES = {
  modo: 'grupo' as const,
  grupo: { tipo: 'rol' as const, rol: 'asesor' as const },
  criterio: 'menor_carga' as const,
  soloEnLinea: false,
  reserva: { tipo: 'cualquiera' as const },
};

function nodoConDestino(): INodo {
  return { id: 'h1', tipo: 'handoff', posicion: { x: 0, y: 0 }, config: { tipo: 'handoff', destino: A_ASESORES } };
}

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

// AUTH-06: el nodo usa el mismo `DestinoSelector` que la transferencia del Asistente IA: primero el
// rol o grupo, después «dentro del grupo, se elige a» (reparto automático o una persona).
describe('NodeInspector — handoff: a quién se transfiere', () => {
  const quien = (): HTMLElement => screen.getByRole('combobox', { name: 'A quién se transfiere' });
  const eleccion = (): HTMLElement => screen.getByRole('combobox', { name: 'Dentro del grupo, se elige a' });

  it('por defecto usa la configuración de transferencia; el primer paso ofrece roles, no personas', async () => {
    montar(nodoHandoff());
    expect(quien()).toHaveTextContent('Como diga la configuración de transferencia');
    expect(screen.queryByRole('combobox', { name: 'Dentro del grupo, se elige a' })).not.toBeInTheDocument();

    await userEvent.click(quien());
    expect(await screen.findByRole('option', { name: 'Asesores' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Todos' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Administradores excepto el principal' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Ana Pérez' })).not.toBeInTheDocument();
  });

  it('elegir un rol guarda el grupo con el reparto por menos conversaciones', async () => {
    const onChange = montar(nodoHandoff());
    await userEvent.click(quien());
    await userEvent.click(await screen.findByRole('option', { name: 'Coordinadores' }));
    expect(onChange).toHaveBeenCalledWith({
      tipo: 'handoff',
      destino: { ...A_ASESORES, grupo: { tipo: 'rol', rol: 'coordinador' } },
    });
  });

  it('dentro del grupo ofrece los repartos automáticos y a las personas ACTIVAS de ese rol', async () => {
    const onChange = montar(nodoConDestino());
    await userEvent.click(eleccion());
    expect(await screen.findByRole('option', { name: 'Quien tenga menos conversaciones activas' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Quien tenga más ventas cerradas' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ana Pérez' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Inactivo Uno' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('option', { name: 'Luis Gómez' }));
    expect(onChange).toHaveBeenCalledWith({
      tipo: 'handoff',
      destino: { modo: 'usuario', usuarioId: 'u2', reserva: { tipo: 'cualquiera' } },
    });
  });

  it('elegir «más ventas cerradas» lo guarda como criterio', async () => {
    const onChange = montar(nodoConDestino());
    await userEvent.click(eleccion());
    await userEvent.click(await screen.findByRole('option', { name: 'Quien tenga más ventas cerradas' }));
    expect(onChange).toHaveBeenCalledWith({ tipo: 'handoff', destino: { ...A_ASESORES, criterio: 'mas_ventas' } });
  });

  it('un nodo previo con `notificarAsesorId` se muestra en su rol con esa persona; volver a la configuración quita los dos campos', async () => {
    const onChange = montar(nodoHandoff('u1'));
    expect(quien()).toHaveTextContent('Asesores');
    expect(eleccion()).toHaveTextContent('Ana Pérez');
    await userEvent.click(quien());
    await userEvent.click(await screen.findByRole('option', { name: /configuración de transferencia/ }));
    const config = onChange.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(config).toEqual({ tipo: 'handoff' });
  });

  it('avisa si la persona elegida ya no está activa, sin borrar la elección', () => {
    montar(nodoHandoff('u3'));
    expect(screen.getByText(/ya no está activa/)).toBeInTheDocument();
  });
});
