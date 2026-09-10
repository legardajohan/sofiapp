import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivateFlowDialog } from './ActivateFlowDialog.js';

describe('ActivateFlowDialog', () => {
  it('nombra el flujo que se desactivará antes de confirmar', () => {
    render(
      <ActivateFlowDialog
        open
        onOpenChange={vi.fn()}
        flujoActivoActual="Bienvenida clásica"
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Bienvenida clásica');
  });

  it('no llama a onConfirm hasta que se hace clic en Activar flujo', async () => {
    const onConfirm = vi.fn();
    render(
      <ActivateFlowDialog
        open
        onOpenChange={vi.fn()}
        flujoActivoActual="Bienvenida clásica"
        onConfirm={onConfirm}
      />,
    );

    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Activar flujo' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancelar no llama a onConfirm', async () => {
    const onConfirm = vi.fn();
    render(
      <ActivateFlowDialog
        open
        onOpenChange={vi.fn()}
        flujoActivoActual="Bienvenida clásica"
        onConfirm={onConfirm}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
