import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TagField } from './TagField.js';
import { aEtiquetaEnvio, type ValorEtiqueta } from '../lib/etiqueta.js';

const etiquetas = vi.hoisted(() => ({
  data: [
    { id: 't1', nombre: 'Seguimiento octubre', color: '#7C3AED', semaforo: null },
    { id: 't3', nombre: 'Feria 2026', color: '#0EA5E9', semaforo: null },
    { id: 't2', nombre: 'Rojo', color: '#DC2626', semaforo: 'rojo' },
  ] as Array<{ id: string; nombre: string; color: string; semaforo: string | null }>,
}));

vi.mock('@/features/tags/hooks/useTags', () => ({
  useTags: () => ({ data: etiquetas.data, isLoading: false }),
}));

/** Arnés controlado: así se ve lo que el campo emite de verdad. */
function Arnes({ inicial = null }: { inicial?: ValorEtiqueta }): React.ReactElement {
  const [valor, setValor] = useState<ValorEtiqueta>(inicial);
  return (
    <MemoryRouter>
      <TagField valor={valor} onChange={setValor} sugerido="Campaña Promo - 31/10/2026" />
      <output data-testid="envio">{JSON.stringify(aEtiquetaEnvio(valor) ?? null)}</output>
    </MemoryRouter>
  );
}

const envio = (): unknown => JSON.parse(screen.getByTestId('envio').textContent ?? 'null');

describe('HU-MARK-07 — TagField', () => {
  it('al encenderlo propone crear una nueva con el nombre sugerido, editable', async () => {
    const user = userEvent.setup();
    render(<Arnes />);

    expect(envio()).toBeNull();
    await user.click(screen.getByRole('switch'));

    const input = screen.getByLabelText('Nombre de la etiqueta');
    expect(input).toHaveValue('Campaña Promo - 31/10/2026');
    expect(envio()).toEqual({ nombre: 'Campaña Promo - 31/10/2026' });

    await user.clear(input);
    await user.type(input, 'Recordatorio');
    expect(envio()).toEqual({ nombre: 'Recordatorio' });
    expect(screen.getByText('Se creará al enviar la campaña.')).toBeInTheDocument();
  });

  it('«Usar una existente» lista las de /etiquetas (sin las de semáforo) y permite elegir una', async () => {
    const user = userEvent.setup();
    render(<Arnes inicial={{ modo: 'nueva', nombre: 'x' }} />);

    await user.click(screen.getByRole('radio', { name: 'Usar una existente' }));
    // Sin elegir todavía: no hay nada válido que enviar.
    expect(envio()).toBeNull();

    expect(screen.getByRole('option', { name: /Seguimiento octubre/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Feria 2026/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Rojo/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /Feria 2026/ }));
    expect(envio()).toEqual({ tagId: 't3' });
  });

  it('el buscador filtra la lista sin importar mayúsculas ni acentos', async () => {
    const user = userEvent.setup();
    render(<Arnes inicial={{ modo: 'existente', tag: null }} />);

    await user.type(screen.getByPlaceholderText('Buscar etiqueta'), 'SEGUI');
    expect(screen.getByRole('option', { name: /Seguimiento octubre/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Feria 2026/ })).not.toBeInTheDocument();
  });

  it('al crear con un nombre que ya existe avisa que se usará esa', async () => {
    const user = userEvent.setup();
    render(<Arnes inicial={{ modo: 'nueva', nombre: '' }} />);

    await user.type(screen.getByLabelText('Nombre de la etiqueta'), 'SEGUIMIENTO OCTUBRE');
    expect(screen.getByText(/Ya existe y se usará esa/)).toBeInTheDocument();
  });
});
