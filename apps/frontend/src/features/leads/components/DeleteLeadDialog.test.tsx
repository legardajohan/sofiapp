import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteLeadDialog } from './DeleteLeadDialog.js';

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof DeleteLeadDialog>> = {},
): {
  onConfirm: ReturnType<typeof vi.fn>;
  onOpenChange: ReturnType<typeof vi.fn>;
  rerender: (props: Partial<React.ComponentProps<typeof DeleteLeadDialog>>) => void;
} {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  const props = {
    open: true,
    pending: false,
    nombre: 'Ana Pérez',
    onOpenChange,
    onConfirm,
    ...overrides,
  };
  const { rerender } = render(<DeleteLeadDialog {...props} />);
  return {
    onConfirm,
    onOpenChange,
    rerender: (next) => rerender(<DeleteLeadDialog {...props} {...next} />),
  };
}

/** Abre el `Select` de Radix y elige la opción por su etiqueta visible. */
async function elegirMotivo(label: string): Promise<void> {
  await userEvent.click(screen.getByLabelText('Motivo'));
  await userEvent.click(await screen.findByRole('option', { name: label }));
}

describe('DeleteLeadDialog — el motivo es parte de la confirmación', () => {
  it('sin motivo elegido no se puede eliminar', () => {
    const { onConfirm } = renderDialog();

    expect(screen.getByRole('button', { name: 'Eliminar lead' })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('ofrece los cinco motivos del contrato', async () => {
    renderDialog();
    await userEvent.click(screen.getByLabelText('Motivo'));

    for (const label of [
      'Contacto duplicado',
      'Spam',
      'Conversación de prueba',
      'El cliente no respondió',
      'No está interesado',
    ]) {
      expect(await screen.findByRole('option', { name: label })).toBeInTheDocument();
    }
  });

  it('elegido el motivo, confirmar lo envía con su valor de dominio', async () => {
    const { onConfirm } = renderDialog();

    await elegirMotivo('Contacto duplicado');
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar lead' }));

    expect(onConfirm).toHaveBeenCalledWith('duplicado');
  });

  it('«El cliente no respondió» viaja como `sin_respuesta`, no como su etiqueta', async () => {
    const { onConfirm } = renderDialog();

    await elegirMotivo('El cliente no respondió');
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar lead' }));

    expect(onConfirm).toHaveBeenCalledWith('sin_respuesta');
  });

  it('nombra el lead sobre el que se decide', () => {
    renderDialog({ nombre: 'Andrés Quintero' });
    expect(screen.getByRole('alertdialog')).toHaveTextContent('¿Eliminar el lead de Andrés Quintero?');
  });

  it('mientras elimina, el botón lo dice y queda bloqueado', async () => {
    const { rerender } = renderDialog();
    await elegirMotivo('Spam');

    rerender({ pending: true });

    expect(screen.getByRole('button', { name: 'Eliminando…' })).toBeDisabled();
  });

  it('al reabrir no hereda el motivo de la vez anterior', async () => {
    const { rerender } = renderDialog();
    await elegirMotivo('Spam');
    expect(screen.getByRole('button', { name: 'Eliminar lead' })).toBeEnabled();

    // Cerrar y volver a abrir: un borrado irreversible no puede arrastrar la decisión anterior.
    rerender({ open: false });
    rerender({ open: true });

    expect(screen.getByRole('button', { name: 'Eliminar lead' })).toBeDisabled();
  });
});
