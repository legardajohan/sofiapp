import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmarGuardadoActivoDialog } from './ConfirmarGuardadoActivoDialog.js';

const errores = [
  { nodoId: 'a', codigo: 'NODO_HUERFANO' as const, mensaje: '«Captura grado» no tiene conexión de entrada.' },
  { nodoId: 'b', codigo: 'CONTENIDO_INCOMPLETO' as const, mensaje: '«IA Intensivo»: falta el objetivo (mínimo 10 caracteres).' },
];

function montar(over: Partial<React.ComponentProps<typeof ConfirmarGuardadoActivoDialog>> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    errores,
    onGuardarYDesactivar: vi.fn(),
    onNoGuardar: vi.fn(),
    ...over,
  };
  render(<ConfirmarGuardadoActivoDialog {...props} />);
  return props;
}

describe('ConfirmarGuardadoActivoDialog (HU-FLOW-05, criterio 29)', () => {
  it('dice con claridad que el flujo está en producción y qué pasa si se guarda', () => {
    montar();
    expect(screen.getByText('Este flujo está en producción y tiene errores')).toBeInTheDocument();
    expect(screen.getByText(/quedará/)).toHaveTextContent(/inactivo/);
    expect(screen.getByText(/Sofi \(la IA general\)/)).toBeInTheDocument();
  });

  it('lista lo pendiente por el nombre del nodo', () => {
    montar();
    expect(screen.getByText('«Captura grado» no tiene conexión de entrada.')).toBeInTheDocument();
    expect(screen.getByText(/«IA Intensivo»: falta el objetivo/)).toBeInTheDocument();
  });

  it('con muchos pendientes lista cinco y resume el resto', () => {
    const muchos = Array.from({ length: 8 }, (_, i) => ({
      nodoId: `n${i}`,
      codigo: 'NODO_HUERFANO' as const,
      mensaje: `Nodo ${i} suelto`,
    }));
    montar({ errores: muchos });
    expect(screen.getByText('Nodo 4 suelto')).toBeInTheDocument();
    expect(screen.queryByText('Nodo 5 suelto')).not.toBeInTheDocument();
    expect(screen.getByText('y 3 más')).toBeInTheDocument();
  });

  it('ofrece las tres salidas', () => {
    montar();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No guardar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar y desactivar' })).toBeInTheDocument();
  });

  it('el foco inicial cae en «Cancelar»: Enter nunca desactiva producción por descuido', () => {
    montar();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('«Guardar y desactivar» confirma el guardado', async () => {
    const props = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y desactivar' }));
    expect(props.onGuardarYDesactivar).toHaveBeenCalledTimes(1);
    expect(props.onNoGuardar).not.toHaveBeenCalled();
  });

  it('«No guardar» sale sin guardar', async () => {
    const props = montar();
    await userEvent.click(screen.getByRole('button', { name: 'No guardar' }));
    expect(props.onNoGuardar).toHaveBeenCalledTimes(1);
    expect(props.onGuardarYDesactivar).not.toHaveBeenCalled();
  });

  it('«Cancelar» y Esc cierran sin hacer nada más', async () => {
    const props = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    await userEvent.keyboard('{Escape}');
    expect(props.onGuardarYDesactivar).not.toHaveBeenCalled();
    expect(props.onNoGuardar).not.toHaveBeenCalled();
  });
});
