import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RefreshControl } from './RefreshControl.js';

describe('RefreshControl — HU-REP-05', () => {
  it('al pulsar "Actualizar" pide refrescar', async () => {
    const onRefresh = vi.fn();
    render(<RefreshControl onRefresh={onRefresh} isRefreshing={false} updatedAt={Date.now()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('mientras carga queda deshabilitado y el icono gira', () => {
    render(<RefreshControl onRefresh={vi.fn()} isRefreshing updatedAt={Date.now()} />);
    const boton = screen.getByRole('button', { name: 'Actualizar' });

    expect(boton).toBeDisabled();
    expect(boton.querySelector('svg')).toHaveClass('animate-spin');
  });

  it('muestra la hora de la última actualización solo cuando la hay', () => {
    const { rerender } = render(<RefreshControl onRefresh={vi.fn()} isRefreshing={false} updatedAt={undefined} />);
    expect(screen.queryByText(/Actualizado a las/)).not.toBeInTheDocument();

    rerender(<RefreshControl onRefresh={vi.fn()} isRefreshing={false} updatedAt={Date.now()} />);
    expect(screen.getByText(/^Actualizado a las \d/)).toBeInTheDocument();
  });
});
