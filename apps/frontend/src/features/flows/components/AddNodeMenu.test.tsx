import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddNodeMenu } from './AddNodeMenu.js';
import { NODE_DESCRIPCION } from './nodeVisuals.js';

describe('AddNodeMenu (HU-FLOW-04)', () => {
  it('al enfocar una opción muestra qué hace ese nodo', async () => {
    const user = userEvent.setup();
    render(<AddNodeMenu onAdd={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /agregar nodo/i }));
    const opcion = await screen.findByRole('menuitem', { name: /transferir a humano/i });
    opcion.focus();

    // Radix repite el texto en un nodo oculto para lectores de pantalla; basta con que exista.
    expect((await screen.findAllByText(NODE_DESCRIPCION.handoff)).length).toBeGreaterThan(0);
  });

  it('elegir una opción agrega ese tipo de nodo', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddNodeMenu onAdd={onAdd} />);

    await user.click(screen.getByRole('button', { name: /agregar nodo/i }));
    await user.click(await screen.findByRole('menuitem', { name: /condición/i }));

    expect(onAdd).toHaveBeenCalledWith('condicion');
  });
});
