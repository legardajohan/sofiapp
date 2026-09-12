import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';
import { PipelineColumn } from './PipelineColumn.js';
import type { PipelineColumnDTO } from '../types.js';
import type { LeadListItemDTO } from '../../leads/types.js';

function lead(id: string, nombre: string): LeadListItemDTO {
  return {
    id,
    nombre,
    telefono: '573001112233',
    correo: null,
    estado: 'nuevo',
    responsable: { id: 'u1', nombre: 'Carolina' },
    conversacionId: 'c1',
    semaforo: null,
    resumen: null,
    ultimoMensajeAt: null,
    createdAt: '2026-08-01T10:00:00.000Z',
  };
}

function columna(over: Partial<PipelineColumnDTO> = {}): PipelineColumnDTO {
  return {
    etapa: {
      id: 'e1',
      key: 'nuevo',
      label: 'Nuevo',
      color: '#64748B',
      orden: 0,
      activo: true,
      esDefecto: true,
      esSalida: false,
    },
    total: 1,
    leads: [lead('l1', 'Ana Pérez')],
    ...over,
  };
}

/** La columna es un `droppable`: fuera de un `DndContext` dnd-kit no la puede registrar. */
function pintar(props: Partial<React.ComponentProps<typeof PipelineColumn>> = {}) {
  const onSelect = vi.fn();
  const onVerEnTabla = vi.fn();
  // Sin `ThemeProvider`, igual que el resto de tests que usan `useTheme`: el contexto cae a su
  // valor por defecto y jsdom no trae `matchMedia`, que el provider necesita al montarse.
  render(
    <DndContext>
      <PipelineColumn
        columna={columna()}
        onSelect={onSelect}
        onVerEnTabla={onVerEnTabla}
        {...props}
      />
    </DndContext>,
  );
  return { onSelect, onVerEnTabla };
}

describe('HU-PIPE-01 — la columna del embudo', () => {
  it('muestra la etiqueta de la etapa y su conteo', () => {
    pintar({ columna: columna({ total: 12 }) });

    expect(screen.getByText('Nuevo')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('pinta las tarjetas de la columna', () => {
    pintar();

    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
  });

  it('una columna vacía lo dice, en vez de dejar un hueco sin explicar', () => {
    pintar({ columna: columna({ leads: [], total: 0 }) });

    expect(screen.getByText('Sin oportunidades en esta etapa')).toBeInTheDocument();
  });

  it('marca las etapas de salida', () => {
    pintar({
      columna: columna({
        etapa: { ...columna().etapa, key: 'declinado', label: 'Declinado', esSalida: true },
      }),
    });

    expect(screen.getByText('Salida')).toBeInTheDocument();
  });

  it('avisa de lo que NO muestra y ofrece la tabla, que sí pagina', async () => {
    const { onVerEnTabla } = pintar({ columna: columna({ total: 137 }) });

    const enlace = screen.getByRole('button', { name: /1 de 137/ });
    await userEvent.click(enlace);

    expect(onVerEnTabla).toHaveBeenCalledWith('nuevo');
  });

  it('no ofrece «Ver en tabla» cuando la columna cabe entera', () => {
    pintar({ columna: columna({ total: 1 }) });

    expect(screen.queryByText(/Ver en tabla/)).not.toBeInTheDocument();
  });

  it('abre el lead al pulsar la tarjeta, entregándolo entero', async () => {
    const { onSelect } = pintar();

    await userEvent.click(screen.getByRole('button', { name: 'Ver el lead Ana Pérez' }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }));
  });

  it('el arrastre vive en un asa propia, enfocable, y no en toda la tarjeta', async () => {
    // Con la tarjeta entera como activador, el clic para abrir el lead compite con el gesto de
    // arrastre y el `touch-none` deja la columna sin scroll táctil. El asa separa las dos cosas.
    const { onSelect } = pintar();

    const asa = screen.getByRole('button', { name: 'Mover Ana Pérez de etapa' });
    expect(asa).toHaveAttribute('aria-roledescription', 'Asa de arrastre');

    // Y usar el asa no abre el panel del lead.
    await userEvent.click(asa);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
