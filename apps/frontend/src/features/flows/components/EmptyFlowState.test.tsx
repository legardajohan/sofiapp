import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyFlowState } from './EmptyFlowState.js';

describe('EmptyFlowState', () => {
  it('invita a crear el nodo de inicio cuando el flujo no tiene nodos', () => {
    render(<EmptyFlowState onCrearInicio={vi.fn()} />);
    expect(screen.getByText('Este flujo todavía no tiene nodos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear nodo de inicio' })).toBeInTheDocument();
  });

  it('el botón crea el nodo de inicio al hacer clic', async () => {
    const onCrearInicio = vi.fn();
    render(<EmptyFlowState onCrearInicio={onCrearInicio} />);

    await userEvent.click(screen.getByRole('button', { name: 'Crear nodo de inicio' }));

    expect(onCrearInicio).toHaveBeenCalledTimes(1);
  });
});
